// node --test 'scripts/lib/supa/*.test.mjs'
// Next Moves in the game sync (moves-sync.mjs + step 7 of sync.mjs) against a fake Supabase REST API.
// Off by default: without GAME_MOVES_MARKETS=1 the sync never touches these markets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { sync } from './sync.mjs';
import { syncMoves, movesEnabled, MOVES_KINDS, isMovesMarket } from './moves-sync.mjs';
import { makeRest } from './rest.mjs';

const NOW = new Date('2026-10-02T10:45:00Z');
const base = { question: 'Q?', params: { slug: 'alpha' }, person: { slug: 'alpha', name: 'Alpha' }, b: 100, opens_at: '2026-09-27T16:00:00Z', resolves_by: '2026-11-05T04:59:00Z' };
const MARKETS = {
  markets: [
    { ...base, slug: 'mv-sell-2026-10-alpha-acme', kind: 'insider_sell', closes_at: '2026-10-31T20:00:00Z', startProb: 0.8, status: 'open' },
    { ...base, slug: 'mv-size-2026-10-alpha-acme', kind: 'sale_size', closes_at: '2026-10-31T20:00:00Z', startProb: 0.5, status: 'open' },
    { ...base, slug: 'mv-sell-2026-09-alpha-acme', kind: 'insider_sell', closes_at: '2026-09-30T20:00:00Z', startProb: 0.7, status: 'closed' }
  ]
};
const RESOLVED = {
  resolved: [{ slug: 'mv-buy-2026-09-alpha-acme', kind: 'insider_buy', outcome: 'yes', note: 'Form 4 filed', source_url: 'https://www.sec.gov/x-index.htm', backtest: false }],
  backtest: [{ slug: 'bt-sell-2026-08-alpha-acme', kind: 'insider_sell', outcome: 'yes', backtest: true }]
};

let root;
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'bd-moves-'));
  const put = async (rel, obj) => { await mkdir(dirname(join(root, rel)), { recursive: true }); await writeFile(join(root, rel), JSON.stringify(obj)); };
  await put('data/moves/markets.json', MARKETS);
  await put('data/moves/resolved.json', RESOLVED);
});
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

function fake(seed = []) {
  const calls = [];
  const markets = new Map(seed.map(m => [m.slug, { ...m }]));
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
        if (n === 'close_due_markets') return send(200, 0);
        if (n === 'create_market') {
          if (markets.has(args.p.slug)) return send(200, { created: false });
          markets.set(args.p.slug, { ...args.p, status: 'open' }); return send(200, { created: true });
        }
        if (n === 'set_market_start_odds') { markets.get(args.p_slug).startProb = args.p_prob; return send(200, { set: true }); }
        if (n === 'resolve_market') {
          const m = markets.get(args.p_slug);
          if (m.status === 'resolved') return send(200, { already: true });
          Object.assign(m, { status: 'resolved', outcome: args.p_outcome, source_url: args.p_source_url }); return send(200, { already: false });
        }
        return send(404, { message: 'no such function' });
      }
      if (u.pathname === '/rest/v1/markets') {
        const st = /in\.\(([^)]*)\)/.exec(u.searchParams.get('status'))[1].split(',');
        const like = u.searchParams.get('slug') ? u.searchParams.get('slug').replace(/^like\./, '').replace(/\*$/, '') : null;
        return send(200, [...markets.values()].filter(m => st.includes(m.status) && (!like || m.slug.startsWith(like))
          && (!u.searchParams.get('closes_at') || new Date(m.closes_at) <= new Date(u.searchParams.get('closes_at').replace(/^lte\./, '')))));
      }
      return send(404, { message: 'not found' });
    });
  });
  return { server, calls, markets };
}
async function withFake(seed, fn) {
  const f = fake(seed);
  await new Promise(r => f.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${f.server.address().port}/`;
  try { return await fn(f, url); } finally { await new Promise(r => f.server.close(r)); }
}
const quiet = () => {};
const SEEDED = [
  { slug: 'mv-buy-2026-09-alpha-acme', kind: 'insider_buy', status: 'closed', closes_at: '2026-09-30T20:00:00Z', params: {} },
  // a v1 weekly insider_buy market (same kind, no mv- prefix): the Next Moves step never touches it
  { slug: 'buy-2026-w40-p01', kind: 'insider_buy', status: 'closed', closes_at: '2026-10-02T20:00:00Z', params: { week: '2026-W40', slug: 'p01' } }
];

test('the flag: only GAME_MOVES_MARKETS=1 turns it on', () => {
  assert.equal(movesEnabled({}), false);
  assert.equal(movesEnabled({ GAME_MOVES_MARKETS: 'true' }), false);
  assert.equal(movesEnabled({ GAME_MOVES_MARKETS: '1' }), true);
  assert.deepEqual([...MOVES_KINDS].sort(), ['fund_move', 'insider_buy', 'insider_sell', 'sale_size']);
  assert.equal(isMovesMarket({ slug: 'mv-sell-2026-10-a-b' }), true);
  assert.equal(isMovesMarket({ slug: 'buy-2026-w40-p01', kind: 'insider_buy' }), false);
});

test('default sync (flag off): no Next Moves calls, and step 5 leaves these kinds alone', async () => {
  await withFake(SEEDED, async (f, url) => {
    const env = { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: 'k' };
    const s = await sync({ env, root, now: NOW, log: quiet });
    assert.equal(s.moves, undefined);
    assert.ok(!f.calls.some(c => /set_market_start_odds|create_market|resolve_market/.test(c.path)));
    assert.equal(f.markets.get('mv-buy-2026-09-alpha-acme').status, 'closed');
  });
});

test('flag on: opens the open markets once with their starting odds, resolves from resolved.json, never uses backtests', async () => {
  await withFake(SEEDED, async (f, url) => {
    const env = { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: 'k', GAME_MOVES_MARKETS: '1' };
    const s = await sync({ env, root, now: NOW, log: quiet });
    assert.deepEqual(s.moves.created, ['mv-sell-2026-10-alpha-acme', 'mv-size-2026-10-alpha-acme']);
    assert.equal(s.moves.odds, 1);                                      // 50% needs no odds call
    assert.equal(f.markets.get('mv-sell-2026-10-alpha-acme').startProb, 0.8);
    assert.equal(f.markets.get('mv-sell-2026-10-alpha-acme').params.startProb, 0.8);
    assert.ok(!f.markets.has('mv-sell-2026-09-alpha-acme'));           // closed: never opened late
    assert.ok(!f.markets.has('bt-sell-2026-08-alpha-acme'));
    assert.deepEqual(s.moves.resolved, ['mv-buy-2026-09-alpha-acme: yes']);
    assert.equal(f.markets.get('buy-2026-w40-p01').status, 'closed');     // v1 market: left to step 5
    assert.equal(f.markets.get('mv-buy-2026-09-alpha-acme').source_url, 'https://www.sec.gov/x-index.htm');
    // second run: nothing new
    const again = await syncMoves({ api: makeRest({ url, key: 'k' }), root, now: NOW, log: quiet });
    assert.deepEqual([again.created, again.resolved], [[], []]);
  });
});

test('flag on without data/moves: a note, nothing changed', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'bd-moves-empty-'));
  try {
    await withFake([], async (f, url) => {
      const notes = [];
      const r = await syncMoves({ api: makeRest({ url, key: 'k' }), root: empty, now: NOW, log: m => notes.push(m) });
      assert.deepEqual(r.created, []);
      assert.match(notes.join(' '), /no data\/moves\/markets\.json/);
      assert.equal(f.calls.length, 0);
    });
  } finally { await rm(empty, { recursive: true, force: true }); }
});
