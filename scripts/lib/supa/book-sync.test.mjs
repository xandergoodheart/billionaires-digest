// node --test 'scripts/lib/supa/*.test.mjs'
// The sync job's Book step against a fake Supabase REST API (node:http): upload before the lock, close at the lock,
// settle once Friday's data and the SEC filings are in. Practice weeks are skipped; no LMSR markets are opened.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { sync, bookPayload, bookInsider } from './sync.mjs';
import { buildBook } from '../book/pricing.mjs';

const slugs = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const SECT = { p1: 'AI & tech', p2: 'AI & tech', p3: 'AI & tech', p4: 'Finance', p5: 'Finance', p6: 'Finance', p7: 'Energy', p8: 'Energy' };
const draftable = slugs.map(s => ({ slug: s, name: `Person ${s.slice(1)}`, sector: SECT[s], holdings: [{ ticker: s.toUpperCase(), weight: 1 }] }));
const salaries = Object.fromEntries(slugs.map((s, i) => [s, 30 - i * 2]));
const W40 = { week: '2026-W40', start: '2026-09-28', end: '2026-10-02', locksAt: '2026-09-28T13:30:00.000Z', salaries, draftable, totals: {} };
const W39P = { ...W40, week: '2026-W39', start: '2026-09-21', end: '2026-09-25', locksAt: '2026-09-21T13:30:00.000Z', practice: true };
// week points: p1 60, p2 10, p3 10, p4 -5, p5 30, p6 0, p7 5, p8 5  (p2/p3 tie)
const PTS = { p1: 60, p2: 10, p3: 10, p4: -5, p5: 30, p6: 0, p7: 5, p8: 5 };
const day = (date, f) => ({ date, people: Object.fromEntries(slugs.map(s => [s, { slug: s, points: f(s) }])) });
const DAYS = [day('2026-09-28', s => PTS[s]), day('2026-09-29', () => 0), day('2026-10-02', () => 0)];
const P = (slug, filed) => ({ form: '4', filed, personSlug: slug, form4: { summary: [{ code: 'P' }] } });
const FILINGS_BEFORE = [P('p1', '2026-09-10'), P('p4', '2026-08-20'), P('p7', '2026-09-01')];
const FILINGS_WEEK = [...FILINGS_BEFORE, P('p1', '2026-09-30'), { form: '4', filed: '2026-10-01', personSlug: 'p7' }];
// Prices run from each day's open to its close. Opens 100 everywhere except P3 103 on Tue 09-29; closes 100 everywhere
// except P3 103 on Mon 09-28 (Monday's top daily %: +3%; Tuesday P3 -2.9%, the rest tie at 0) and Friday 10-02, which
// makes the week (Monday's open -> Friday's close): P1 +10% (exactly the top ladder rung), P2 -5% (exactly the -5 rung),
// P4 +2%, P5 +1%, P6 -1%, P7 -2%.
const CLOSE_FRI = { P1: 110, P2: 95, P3: 100, P4: 102, P5: 101, P6: 99, P7: 98, P8: 100 };
const closes = (t, d) => (d === '2026-10-02' ? CLOSE_FRI[t] : t === 'P3' && d === '2026-09-28' ? 103 : 100);
const opensOf = (t, d) => (t === 'P3' && d === '2026-09-29' ? 103 : 100);
const HIST_DATES = ['2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
async function putHistory(upTo) {
  for (const s of slugs) {
    const t = s.toUpperCase();
    await put(`data/prices/history/${t}.json`, HIST_DATES.filter(d => d <= upTo).map(d => [d, closes(t, d)]));
    await put(`data/prices/opens/${t}.json`, HIST_DATES.filter(d => d <= upTo).map(d => [d, opensOf(t, d)]));
  }
}
const BOOK = buildBook({ week: W40, filings: FILINGS_BEFORE, editions: [], storyMatches: () => false, generated: '2026-09-25T00:00:00.000Z', n: 2000 });
const PRACTICE_BOOK = { ...BOOK, week: '2026-W39', locksAt: W39P.locksAt, events: BOOK.events.map(e => ({ ...e, id: e.id.replace('W40', 'W39') })) };

let root;
async function put(rel, obj) { await mkdir(dirname(join(root, rel)), { recursive: true }); await writeFile(join(root, rel), JSON.stringify(obj)); }
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'bd-book-'));
  await put('data/fantasy/weeks/2026-W40.json', W40);
  await put('data/fantasy/weeks/2026-W39.json', W39P);
  await put('data/book/2026-W40.json', BOOK);
  await put('data/book/2026-W39.json', PRACTICE_BOOK);
  await put('data/book/index.json', { latest: '2026-W40', weeks: [] });
  await put('data/filings/latest.json', { generated: '2026-09-27T12:00:00Z', filings: FILINGS_BEFORE });
  for (const d of DAYS.slice(0, 2)) await put(`data/fantasy/days/${d.date}.json`, d);
  for (const p of draftable) await put(`data/people/${p.slug}.json`, { slug: p.slug, name: p.name, sector: p.sector });
});
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

function fake() {
  const calls = [], events = new Map(), state = { now: new Date(0) };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const args = body ? JSON.parse(body) : null;
      calls.push({ method: req.method, path: u.pathname, search: u.search, args });
      const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(u.pathname);
      if (rpc) {
        const n = rpc[1];
        if (n === 'upsert_week') return send(200, args.p.week);
        if (n === 'upsert_points') return send(200, 0);
        if (n === 'settle_week') return send(200, 0);
        if (n === 'close_due_markets') return send(200, 0);
        if (n === 'upsert_book') {
          for (const e of args.p.events) {
            const cur = events.get(e.id);
            if (cur && cur.status !== 'open') continue;
            events.set(e.id, { ...e, week: args.p.week, closes_at: args.p.locksAt, status: 'open' });
          }
          return send(200, { week: args.p.week, events: args.p.events.length });
        }
        if (n === 'close_due_book') {
          let c = 0;
          for (const e of events.values()) if (e.status === 'open' && new Date(e.closes_at) <= state.now) { e.status = 'closed'; c++; }
          return send(200, c);
        }
        if (n === 'settle_book_events') {
          let changed = 0;
          for (const id of args.p.events) {
            const e = events.get(id);
            if (!e || e.week !== args.p.week || e.status === 'settled') continue;
            e.status = 'settled'; e.results = Object.fromEntries(e.selections.map(s => [s.id, args.p.results[s.id] || 'void'])); e.note = args.p.notes[e.id];
            changed++;
          }
          return send(200, { week: args.p.week, events: changed });
        }
        if (n === 'settle_book') {
          let changed = 0;
          for (const e of events.values()) {
            if (e.week !== args.p.week || e.status === 'settled') continue;
            e.status = 'settled'; e.results = Object.fromEntries(e.selections.map(s => [s.id, args.p.results[s.id] || 'void'])); e.note = args.p.notes[e.id];
            changed++;
          }
          return send(200, { week: args.p.week, already: changed === 0 });
        }
        return send(404, { message: `no function ${n}` });
      }
      if (u.pathname === '/rest/v1/fantasy_weeks') return send(200, [{ week: '2026-W40', final: false }]);
      if (u.pathname === '/rest/v1/markets') return send(200, []);
      if (u.pathname === '/rest/v1/book_events') {
        const wk = u.searchParams.get('week').replace(/^eq\./, '');
        const st = /in\.\(([^)]*)\)/.exec(u.searchParams.get('status'))[1].split(',');
        return send(200, [...events.values()].filter(e => e.week === wk && st.includes(e.status)).map(e => ({ id: e.id })));
      }
      return send(404, { message: 'not found' });
    });
  });
  return { server, calls, events, state };
}
async function withFake(fn) {
  const f = fake();
  await new Promise(r => f.server.listen(0, '127.0.0.1', r));
  const env = { SUPABASE_URL: `http://127.0.0.1:${f.server.address().port}`, SUPABASE_SERVICE_KEY: 'test-key' };
  try { return await fn(f, env); } finally { await new Promise(r => f.server.close(r)); }
}
const quiet = () => {};
const rpcs = (f, name) => f.calls.filter(c => c.path.endsWith(`/rpc/${name}`));

test('bookPayload keeps what the database needs', () => {
  const p = bookPayload(BOOK);
  assert.equal(p.week, '2026-W40');
  assert.equal(p.locksAt, W40.locksAt);
  assert.equal(p.events.length, BOOK.events.length);
  const s = p.events[0].selections[0];
  assert.deepEqual(Object.keys(s).sort(), ['americanOdds', 'decimalOdds', 'fairProb', 'id', 'label', 'line', 'market', 'person', 'sector', 'sort']);
  assert.equal(s.decimalOdds, BOOK.events[0].selections[0].decimalOdds);
});

test('bookInsider: waits for filings fetched after Friday; counts P days; unreadable Form 4 -> unknown', () => {
  assert.equal(bookInsider(W40, { generated: '2026-10-02T20:00:00Z', filings: FILINGS_WEEK }).ready, false);
  const r = bookInsider(W40, { generated: '2026-10-03T13:00:00Z', filings: FILINGS_WEEK });
  assert.deepEqual(r, { ready: true, pBuyDays: { p1: 1 }, insiderUnknown: ['p7'] });
});

test('sync: uploads before the lock, closes at the lock, settles after Friday once; no LMSR markets; practice skipped', async () => {
  await withFake(async (f, env) => {
    // Sunday: upload
    let now = new Date('2026-09-27T20:00:00Z'); f.state.now = now;
    let s = await sync({ env, root, now, log: quiet });
    assert.deepEqual(s.book.uploaded, ['2026-W40']);
    assert.equal(rpcs(f, 'upsert_book').length, 1);
    assert.equal(rpcs(f, 'upsert_book')[0].args.p.events.length, BOOK.events.length);
    assert.ok(!rpcs(f, 'upsert_book').some(c => c.args.p.week === '2026-W39'), 'practice book never uploaded');
    assert.equal(s.book.closed, 0);
    assert.equal(rpcs(f, 'create_market').length, 0);
    assert.equal(rpcs(f, 'settle_book').length, 0);

    // Monday after the lock: no upload, everything closes
    now = new Date('2026-09-28T14:45:00Z'); f.state.now = now; f.calls.length = 0;
    s = await sync({ env, root, now, log: quiet });
    assert.deepEqual(s.book.uploaded, []);
    assert.equal(s.book.closed, BOOK.events.length);
    assert.equal(rpcs(f, 'create_market').length, 0, 'no LMSR markets on Monday');
    assert.ok([...f.events.values()].every(e => e.status === 'closed'));

    // Friday evening: no Friday data yet -> no settlement
    now = new Date('2026-10-02T23:00:00Z'); f.state.now = now; f.calls.length = 0;
    s = await sync({ env, root, now, log: quiet });
    assert.equal(rpcs(f, 'settle_book').length, 0);

    // Saturday: Friday data in, but filings fetched before Friday ended -> wait. Closes through Thursday only:
    // the Monday-Thursday daily boards settle on their own; the weekly price markets and Friday's board wait.
    await put('data/fantasy/days/2026-10-02.json', DAYS[2]);
    await put('data/fantasy/weeks/2026-W40.json', { ...W40, totals: PTS });
    await putHistory('2026-10-01');
    now = new Date('2026-10-03T14:00:00Z'); f.state.now = now; f.calls.length = 0;
    const lines = [];
    s = await sync({ env, root, now, log: x => lines.push(x) });
    assert.equal(rpcs(f, 'settle_book').length, 0);
    assert.match(lines.join('\n'), /waiting on SEC filings/);
    const early = rpcs(f, 'settle_book_events');
    assert.equal(early.length, 1);
    const dailyIds = BOOK.events.filter(e => e.type === 'blast' && e.params.period !== 'week' && e.params.to <= '2026-10-01').map(e => e.id);
    assert.deepEqual([...early[0].args.p.events].sort(), [...dailyIds].sort());
    const ER = early[0].args.p.results;
    const monPct = BOOK.events.find(e => e.id === '2026-W40:blast:pct:up:2026-09-28');
    for (const x of monPct.selections) assert.equal(ER[x.id], x.person === 'p3' ? 'win' : 'lose', x.id);    // P3 open 100 -> close 103
    const tuePct = BOOK.events.find(e => e.id === '2026-W40:blast:pct:up:2026-09-29');
    for (const x of tuePct.selections) assert.equal(ER[x.id], x.person === 'p3' ? 'lose' : 'void', x.id);   // P3 open 103 -> 100, the rest tie at 0
    assert.equal(s.book.events, dailyIds.length);

    // filings fetched Saturday, but Friday's closes are not in yet -> the week waits for the price markets
    await put('data/filings/latest.json', { generated: '2026-10-03T13:00:00Z', filings: FILINGS_WEEK });
    f.calls.length = 0; lines.length = 0;
    s = await sync({ env, root, now, log: x => lines.push(x) });
    assert.equal(rpcs(f, 'settle_book').length, 0);
    assert.equal(rpcs(f, 'settle_book_events').length, 0);
    assert.match(lines.join('\n'), /waiting on closing prices/);

    // Friday's closes in -> the rest of the price markets settle first, then the week
    await putHistory('2026-10-02');
    f.calls.length = 0;
    s = await sync({ env, root, now, log: quiet });
    assert.deepEqual(s.book.settled, ['2026-W40']);
    const late = rpcs(f, 'settle_book_events')[0].args.p;
    const PR = late.results;
    const priced = BOOK.events.filter(e => ['blast', 'ladder', 'bracket'].includes(e.type));
    assert.deepEqual([...late.events, ...dailyIds].sort(), priced.map(e => e.id).sort());
    const i1 = f.calls.findIndex(c => c.path.endsWith('/rpc/settle_book_events')), i2 = f.calls.findIndex(c => c.path.endsWith('/rpc/settle_book'));
    assert.ok(i1 >= 0 && i2 > i1, 'price markets settle before the week');
    const wkUp = BOOK.events.find(e => e.id === '2026-W40:blast:pct:up:week');
    for (const x of wkUp.selections) assert.equal(PR[x.id], x.person === 'p1' ? 'win' : 'lose');
    const wkDown = BOOK.events.find(e => e.id === '2026-W40:blast:pct:down:week');
    for (const x of wkDown.selections) assert.equal(PR[x.id], x.person === 'p2' ? 'win' : 'lose');
    const lad1 = BOOK.events.find(e => e.id === '2026-W40:ladder:p1');
    for (const x of lad1.selections) assert.equal(PR[x.id], x.line > 0 ? 'win' : 'lose', x.id);            // +10% wins every up rung
    const lad2 = BOOK.events.find(e => e.id === '2026-W40:ladder:p2');
    if (lad2) for (const x of lad2.selections) assert.equal(PR[x.id], x.line === -2 || x.line === -5 ? 'win' : 'lose', x.id);
    const br4 = BOOK.events.find(e => e.id === '2026-W40:bracket:p4');
    assert.deepEqual(br4.selections.filter(x => PR[x.id] === 'win').map(x => x.label), ['Up 2% to 5%']);   // exactly +2%: lower end included
    const call = rpcs(f, 'settle_book')[0].args.p;
    assert.equal(call.week, '2026-W40');
    const R = call.results;
    const ev = t => BOOK.events.find(e => e.type === t);
    const h2h = BOOK.events.find(e => e.type === 'h2h' && e.params.a === 'p1');
    assert.equal(R[`${h2h.id}:ml:p1`], 'win');
    assert.equal(R[`${h2h.id}:ml:${h2h.params.b}`], 'lose');
    const tie = BOOK.events.find(e => e.type === 'h2h' && [e.params.a, e.params.b].sort().join() === 'p2,p3');
    if (tie) assert.equal(R[`${tie.id}:ml:p2`], 'void');
    assert.equal(R[`${ev('futures_top').id}:p1`], 'win');
    assert.equal(R[`${ev('futures_top').id}:p5`], 'lose');
    assert.equal(R['2026-W40:buy:p1:yes'], 'win');
    assert.equal(R['2026-W40:buy:p4:no'], 'win');
    assert.equal(R['2026-W40:buy:p7:yes'], 'void');           // unreadable Form 4 in the week
    // sector: AI (60+10+10)/3 = 26.7 beats Finance 8.3 and Energy 5
    assert.equal(R[`${ev('prop_sector').id}:ai-tech`], 'win');
    const ou = BOOK.events.find(e => e.type === 'player_ou' && e.params.slug === 'p1');
    for (const sel of ou.selections) assert.equal(R[sel.id], (sel.market === 'over') === (60 > sel.line) ? 'win' : 'lose');
    // every selection has a result
    for (const e of BOOK.events) for (const x of e.selections) assert.ok(['win', 'lose', 'void'].includes(R[x.id]), x.id);

    // rerun: nothing pending -> no settle call
    f.calls.length = 0;
    s = await sync({ env, root, now, log: quiet });
    assert.equal(rpcs(f, 'settle_book').length, 0);
    assert.deepEqual(s.book.settled, []);
  });
});

test('sync: filings never arrive -> insider props void after the give-up window', async () => {
  await withFake(async (f, env) => {
    await put('data/filings/latest.json', { generated: '2026-10-01T13:00:00Z', filings: FILINGS_WEEK });
    await put('data/fantasy/days/2026-10-02.json', DAYS[2]);
    await put('data/fantasy/weeks/2026-W40.json', { ...W40, totals: PTS });
    f.state.now = new Date('2026-09-27T20:00:00Z');
    await sync({ env, root, now: f.state.now, log: quiet });           // upload
    const now = new Date('2026-10-08T14:00:00Z'); f.state.now = now;
    const s = await sync({ env, root, now, log: quiet });
    assert.deepEqual(s.book.settled, ['2026-W40']);
    const R = rpcs(f, 'settle_book')[0].args.p.results;
    assert.equal(R['2026-W40:buy:p1:yes'], 'void');
    assert.equal(R['2026-W40:buy:p1:no'], 'void');
  });
});
