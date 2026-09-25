// node --test 'scripts/lib/supa/*.test.mjs'
// The sync job against a fake Supabase REST API (node:http), with a small made-up site data folder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sync } from './sync.mjs';
import { generateMarkets, resolveMarket, marketTimes } from './markets.mjs';
import { nyToUtc, nyDate, nyWeekday } from './time.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ---------- fixture ----------
const SECTOR = { 'AI & tech': ['p01', 'p02', 'p05', 'p09', 'p11'], Finance: ['p03', 'p04', 'p06', 'p12'], Energy: ['p07', 'p08', 'p10'] };
const TOTALS = { p01: 50, p02: 40, p03: 10, p04: 20, p05: 15, p06: 15, p07: 5, p08: 0, p09: -3, p10: 2, p11: 30, p12: 100 };
const slugs = Object.keys(TOTALS);
const salaries = Object.fromEntries(slugs.map((s, i) => [s, 30 - i * 2])); // p01 most expensive
const W39 = { week: '2026-W39', start: '2026-09-21', end: '2026-09-25', locksAt: '2026-09-21T13:30:00Z', salaries, draftable: slugs,
  totals: Object.fromEntries(slugs.map((s, i) => [s, i])) };
const W40 = { week: '2026-W40', start: '2026-09-28', end: '2026-10-02', locksAt: '2026-09-28T13:30:00Z', salaries, draftable: slugs, totals: {} };
// on disk, draftable is a list of objects (build-fantasy's shape); the loader turns it back into slugs
const W40_FILE = { ...W40, draftable: slugs.map(s => ({ slug: s, name: `Person ${s.slice(1)}`, rank: 1 })) };
const DAYS = [
  { date: '2026-09-28', people: slugs.map(s => ({ slug: s, points: TOTALS[s] - 1, returnPct: 0.5 })), spy: 0.1 },
  { date: '2026-09-29', people: slugs.map(s => ({ slug: s, points: 0, returnPct: 0 })), spy: 0 },
  // keyed by slug, like build-fantasy writes it
  { date: '2026-10-02', people: Object.fromEntries(slugs.map(s => [s, { slug: s, points: 1, returnPct: 0.1, bonuses: {} }])), spy: 0.2 }
];
const P = (slug, filed, extra = {}) => ({ form: '4', filed, personSlug: slug, url: `https://www.sec.gov/x/${slug}/${filed}.xml`, indexUrl: `https://www.sec.gov/x/${slug}/${filed}-index.htm`,
  form4: { issuer: 'Acme Corp', summary: [{ issuer: 'Acme Corp', code: 'P', value: 1234567 }], transactions: [{ code: 'P' }] }, ...extra });
const FILINGS = {
  generated: '2026-10-03T13:00:00Z',
  filings: [
    P('p01', '2026-09-30'),                                       // p01: buy inside the week -> YES
    P('p01', '2026-08-01'), P('p01', '2026-07-15'),
    P('p02', '2026-09-01'),                                       // p02: one recent buy, nothing in the week -> NO
    { form: '4', filed: '2026-10-01', personSlug: 'p02', form4: { summary: [{ code: 'S' }], transactions: [{ code: 'S' }] } },
    P('p03', '2026-09-10'),                                       // p03: an unreadable Form 4 in the week -> void
    { form: '4', filed: '2026-09-29', personSlug: 'p03', url: 'https://www.sec.gov/x/p03/unread.xml' },
    P('p04', '2026-05-01'),                                       // too old: not a candidate
    { form: '144', filed: '2026-09-20', personSlug: 'p05' }
  ]
};

let dataRoot;
before(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), 'bd-game-'));
  const put = async (rel, obj) => { await mkdir(dirname(join(dataRoot, rel)), { recursive: true }); await writeFile(join(dataRoot, rel), JSON.stringify(obj)); };
  await put('data/fantasy/weeks/2026-W39.json', W39);
  await put('data/fantasy/weeks/2026-W40.json', W40_FILE);
  // a practice week in the same window: must be ignored entirely
  await put('data/fantasy/weeks/2026-W40P.json', { ...W40_FILE, week: '2026-W40P', practice: true });
  await put('data/fantasy/days/2026-09-30.json', { date: '2026-09-30', practice: true, people: { p01: { slug: 'p01', points: 999 } } });
  for (const d of DAYS) await put(`data/fantasy/days/${d.date}.json`, d);
  await put('data/filings/latest.json', FILINGS);
  for (const [sec, list] of Object.entries(SECTOR)) for (const s of list) await put(`data/people/${s}.json`, { slug: s, name: `Person ${s.slice(1)}`, sector: sec });
});
after(async () => { if (dataRoot) await rm(dataRoot, { recursive: true, force: true }); });

// ---------- fake Supabase ----------
function fakeSupabase() {
  const calls = [];
  const markets = new Map();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.headers.apikey !== 'test-service-key') return send(401, { message: 'bad key' });
      const args = body ? JSON.parse(body) : null;
      calls.push({ method: req.method, path: u.pathname, query: u.search, args });
      const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(u.pathname);
      if (rpc) {
        const name = rpc[1];
        if (name === 'upsert_week') return send(200, args.p.week);
        if (name === 'upsert_points') return send(200, args.p.reduce((n, d) => n + d.people.length, 0));
        if (name === 'settle_week') return send(200, 1);
        if (name === 'close_due_markets') {
          let n = 0; for (const m of markets.values()) if (m.status === 'open' && new Date(m.closes_at) <= fakeSupabase.now) { m.status = 'closed'; n++; }
          return send(200, n);
        }
        if (name === 'create_market') {
          if (markets.has(args.p.slug)) return send(200, { id: args.p.slug, created: false });
          markets.set(args.p.slug, { ...args.p, status: 'open' }); return send(200, { id: args.p.slug, created: true });
        }
        if (name === 'resolve_market') {
          const m = markets.get(args.p_slug);
          if (m.status === 'resolved' || m.status === 'void') return send(200, { already: true });
          Object.assign(m, { status: args.p_outcome === 'void' ? 'void' : 'resolved', outcome: args.p_outcome, note: args.p_note, source_url: args.p_source_url });
          return send(200, { already: false });
        }
        return send(404, { message: 'no such function' });
      }
      if (req.method === 'GET' && u.pathname === '/rest/v1/fantasy_weeks') return send(200, [{ week: '2026-W39', final: true }, { week: '2026-W40', final: false }]);
      if (req.method === 'GET' && u.pathname === '/rest/v1/markets') {
        const st = /in\.\(([^)]*)\)/.exec(u.searchParams.get('status'))[1].split(',');
        const before = new Date(u.searchParams.get('closes_at').replace(/^lte\./, ''));
        return send(200, [...markets.values()].filter(m => st.includes(m.status) && new Date(m.closes_at) <= before));
      }
      return send(404, { message: 'not found' });
    });
  });
  return { server, calls, markets };
}

async function withServer(fn) {
  const f = fakeSupabase();
  await new Promise(r => f.server.listen(0, '127.0.0.1', r));
  const env = { SUPABASE_URL: `http://127.0.0.1:${f.server.address().port}/`, SUPABASE_SERVICE_KEY: 'test-service-key' };
  try { return await fn(f, env); } finally { await new Promise(r => f.server.close(r)); }
}
const quiet = () => {};

// ---------- tests ----------
test('New York time helpers handle both sides of DST', () => {
  assert.equal(nyToUtc('2026-09-28', '09:30').toISOString(), '2026-09-28T13:30:00.000Z'); // EDT
  assert.equal(nyToUtc('2026-12-04', '16:00').toISOString(), '2026-12-04T21:00:00.000Z'); // EST
  assert.equal(nyDate('2026-09-28T03:30:00Z'), '2026-09-27');
  assert.equal(nyWeekday('2026-09-28T10:45:00Z'), 1);
  assert.deepEqual(marketTimes(W40), { closes_at: '2026-10-02T20:00:00.000Z', resolves_by: '2026-10-04T03:59:00.000Z' });
});

test('generateMarkets is deterministic: 5 head-to-heads, 3 insider buys, 3 sectors', () => {
  const people = {};
  for (const [sec, list] of Object.entries(SECTOR)) for (const s of list) people[s] = { name: `Person ${s.slice(1)}`, sector: sec };
  const now = new Date('2026-09-28T10:45:00Z');
  const a = generateMarkets({ week: W40, people, filings: FILINGS.filings, prevWeek: W39, now });
  const b = generateMarkets({ week: W40, people, filings: FILINGS.filings, prevWeek: W39, now });
  assert.deepEqual(a, b);
  assert.deepEqual(a.filter(m => m.kind === 'h2h').map(m => m.slug), [
    'h2h-2026-w40-p01-vs-p02', 'h2h-2026-w40-p03-vs-p04', 'h2h-2026-w40-p05-vs-p06', 'h2h-2026-w40-p07-vs-p08', 'h2h-2026-w40-p09-vs-p10']);
  // p01 has the most P buys; p04's buy is older than 90 days; Form 144 doesn't count
  assert.deepEqual(a.filter(m => m.kind === 'insider_buy').map(m => m.slug), ['buy-2026-w40-p01', 'buy-2026-w40-p03', 'buy-2026-w40-p02']);
  // sectors ordered by last week's average (W39 totals = list position): Energy 7.3 > Finance 5.3 > AI 4.6
  assert.deepEqual(a.filter(m => m.kind === 'sector_top').map(m => m.slug), ['sector-2026-w40-energy', 'sector-2026-w40-finance', 'sector-2026-w40-ai-tech']);
  assert.deepEqual(Object.keys(a.find(m => m.kind === 'sector_top').params.members), ['AI & tech', 'Energy', 'Finance']);
  assert.ok(a.every(m => m.closes_at === '2026-10-02T20:00:00.000Z' && m.opens_at === now.toISOString()));
  assert.match(a[0].question, /^Will Person 01 out-score Person 02/);
});

test('resolveMarket waits for data, then resolves from the files', () => {
  const m = { kind: 'h2h', params: { week: '2026-W40', a: 'p01', b: 'p02' }, resolves_by: '2026-10-04T03:59:00Z' };
  const listDays = DAYS.map(d => ({ ...d, people: Array.isArray(d.people) ? d.people : Object.values(d.people) }));
  const ctx = { weeks: { '2026-W40': W40 }, days: listDays, filingsDoc: FILINGS };
  assert.equal(resolveMarket(m, { ...ctx, now: new Date('2026-10-02T21:00:00Z') }), null);       // Friday evening: not yet
  assert.equal(resolveMarket(m, { ...ctx, days: listDays.slice(0, 2), now: new Date('2026-10-03T12:00:00Z') }), null); // Friday data missing
  const r = resolveMarket(m, { ...ctx, now: new Date('2026-10-03T12:00:00Z') });
  assert.equal(r.outcome, 'yes');
  assert.match(r.note, /Person|p01 50, p02 40/);
  // still no data long after the deadline -> void
  const lost = resolveMarket({ ...m, params: { week: 'nope' } }, { ...ctx, now: new Date('2026-10-09T12:00:00Z') });
  assert.equal(lost.outcome, 'void');
  // insider market waits for filings fetched after Friday
  const im = { kind: 'insider_buy', params: { week: '2026-W40', slug: 'p02', from: '2026-09-28', to: '2026-10-02' }, resolves_by: '2026-10-04T03:59:00Z' };
  assert.equal(resolveMarket(im, { ...ctx, filingsDoc: { ...FILINGS, generated: '2026-10-02T13:00:00Z' }, now: new Date('2026-10-03T12:00:00Z') }), null);
});

test('sync without settings exits cleanly and calls nothing', async () => {
  const lines = [];
  const r = await sync({ env: {}, root: dataRoot, log: s => lines.push(s), fetchImpl: () => { throw new Error('no network'); } });
  assert.deepEqual(r, { skipped: true });
  assert.match(lines.join('\n'), /skipped/);
  const cli = spawnSync(process.execPath, [join(ROOT, 'scripts', 'supabase-sync.mjs')], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /Game sync skipped/);
});

test('Monday run uploads, scores live, opens 11 markets; rerun opens none', async () => {
  await withServer(async (f, env) => {
    const now = new Date('2026-09-28T14:45:00Z'); // Monday 10:45 New York, after the lock
    fakeSupabase.now = now;
    const s = await sync({ env, root: dataRoot, now, log: quiet });
    const rpcs = f.calls.filter(c => c.path.includes('/rpc/')).map(c => c.path.split('/').pop());
    assert.deepEqual(f.calls.filter(c => c.path.endsWith('/upsert_week')).map(c => c.args.p.week), ['2026-W39', '2026-W40']);
    assert.ok(!f.calls.some(c => c.path.endsWith('/upsert_points') && c.args.p.some(d => d.date === '2026-09-30')), 'practice day not uploaded');
    assert.ok(!f.calls.some(c => c.path.endsWith('/settle_week') && c.args.p_week === '2026-W40P'));
    assert.deepEqual(f.calls.find(c => c.path.endsWith('/upsert_week') && c.args.p.week === '2026-W40').args.p,
      { week: '2026-W40', start: '2026-09-28', end: '2026-10-02', locksAt: '2026-09-28T13:30:00Z', salaries, draftable: slugs });
    assert.equal(s.points, 36);
    assert.deepEqual(s.settled, ['2026-W40 (live)']);           // W39 already final
    assert.equal(s.created.length, 11);
    assert.equal(f.markets.size, 11);
    const again = await sync({ env, root: dataRoot, now, log: quiet });
    assert.equal(again.created.length, 0);
    assert.equal(f.markets.size, 11);
    // Tuesday: no new markets even if some were missing
    f.markets.delete('h2h-2026-w40-p01-vs-p02');
    const tue = await sync({ env, root: dataRoot, now: new Date('2026-09-29T14:45:00Z'), log: quiet });
    assert.equal(tue.created.length, 0);
    const forced = await sync({ env: { ...env, GAME_FORCE_MARKETS: '1' }, root: dataRoot, now: new Date('2026-09-29T14:45:00Z'), log: quiet });
    assert.deepEqual(forced.created, ['h2h-2026-w40-p01-vs-p02']);

    // Saturday: close + resolve everything from the fixture data
    const sat = new Date('2026-10-03T14:45:00Z');
    fakeSupabase.now = sat;
    f.calls.length = 0;
    const r = await sync({ env, root: dataRoot, now: sat, log: quiet });
    assert.equal(r.closed, 11);
    assert.deepEqual(r.settled, ['2026-W40 (final)']);
    const out = Object.fromEntries([...f.markets.values()].map(m => [m.slug, m.outcome]));
    assert.deepEqual(out, {
      'h2h-2026-w40-p01-vs-p02': 'yes', 'h2h-2026-w40-p03-vs-p04': 'no', 'h2h-2026-w40-p05-vs-p06': 'void',
      'h2h-2026-w40-p07-vs-p08': 'yes', 'h2h-2026-w40-p09-vs-p10': 'no',
      'buy-2026-w40-p01': 'yes', 'buy-2026-w40-p02': 'no', 'buy-2026-w40-p03': 'void',
      'sector-2026-w40-finance': 'yes', 'sector-2026-w40-energy': 'no', 'sector-2026-w40-ai-tech': 'no'
    });
    const m = f.markets;
    assert.match(m.get('h2h-2026-w40-p05-vs-p06').note, /Person 05 15, Person 06 15\. A tie/);
    assert.equal(m.get('buy-2026-w40-p01').source_url, 'https://www.sec.gov/x/p01/2026-09-30-index.htm');
    assert.match(m.get('buy-2026-w40-p01').note, /2026-09-30 \(Acme Corp, about \$1,234,567\)/);
    assert.equal(m.get('buy-2026-w40-p02').source_url, 'https://billionairesdigest.com/people/p02/');
    assert.match(m.get('sector-2026-w40-finance').note, /Finance 36\.3, AI & tech 26\.4, Energy 2\.3/);
    assert.equal(m.get('h2h-2026-w40-p01-vs-p02').source_url, 'https://billionairesdigest.com/fantasy.html');
    // a second Saturday run resolves nothing new
    const r2 = await sync({ env, root: dataRoot, now: sat, log: quiet });
    assert.equal(r2.resolved.length, 0);
  });
});
