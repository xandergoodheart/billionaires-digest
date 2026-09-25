// node --test scripts/lib/  (no network: a local mock HTTP server stands in for Tiingo)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  tiingoTicker, priceUrl, parseRows, mergeHistory, runBackfill, parseArgs,
  GAP_MS, RATE_WAIT_MS, HISTORY_KEEP, STATE_FILE,
} from '../backfill-history.mjs';

const KEY = 'sekret-test-key-123456';

function fakeClock(start = Date.parse('2026-09-25T12:00:00Z')) {
  let t = start;
  const sleeps = [];
  return {
    now: () => t,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    sleeps,
  };
}

function tiingoRows(n, startIso = '2025-08-01') {
  const out = [];
  let d = Date.parse(startIso + 'T00:00:00Z');
  for (let i = 0; i < n; i++) {
    out.push({ date: new Date(d).toISOString(), adjClose: 100 + i, close: 200 + i });
    d += 86_400_000;
  }
  return out;
}

// behaviours: { TICKER: array of responses [{ status, body }], last one repeats }
async function mockTiingo(behaviours) {
  const hits = [];
  const counts = {};
  const server = createServer((req, res) => {
    const m = req.url.match(/^\/tiingo\/daily\/([^/]+)\/prices\?(.*)$/);
    const ticker = m ? decodeURIComponent(m[1]) : null;
    hits.push({ ticker, auth: req.headers.authorization, query: m ? m[2] : '' });
    const list = behaviours[ticker] || [{ status: 404, body: { detail: 'Error: Ticker not found' } }];
    const i = counts[ticker] = (counts[ticker] ?? -1) + 1;
    const r = list[Math.min(i, list.length - 1)];
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body ?? {}));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { baseUrl, hits, close: () => new Promise((r) => server.close(r)) };
}

async function tmp() { return mkdtemp(join(tmpdir(), 'bd-backfill-')); }
const readJ = async (p) => JSON.parse(await readFile(p, 'utf8'));

test('tiingo ticker mapping', () => {
  assert.equal(tiingoTicker('BRK.B'), 'BRK-B');
  assert.equal(tiingoTicker('LEN.B'), 'LEN-B');
  assert.equal(tiingoTicker('BRK.A'), 'BRK-A');
  assert.equal(tiingoTicker('AAPL'), 'AAPL');
  const url = priceUrl('BRK.B', Date.parse('2026-09-25T12:00:00Z'), 'https://api.tiingo.com');
  assert.match(url, /^https:\/\/api\.tiingo\.com\/tiingo\/daily\/BRK-B\/prices\?/);
  assert.match(url, /startDate=2025-08-21&endDate=2026-09-25&resampleFreq=daily&columns=date,adjClose,close$/);
});

test('parseRows prefers adjClose, falls back to close, drops junk', () => {
  const rows = parseRows([
    { date: '2026-01-02T00:00:00.000Z', adjClose: 10.123456, close: 11 },
    { date: '2026-01-03T00:00:00+00:00', close: 12 },
    { date: '2026-01-04T00:00:00Z', adjClose: 0, close: 0 },
    { date: 'bad', close: 5 },
    null,
  ]);
  assert.deepEqual(rows, [['2026-01-02', 10.1235], ['2026-01-03', 12]]);
});

test('merge: existing dates win, dedupe, sorted, capped at 400', () => {
  const existing = [['2026-09-24', 335.92], ['2026-09-23', 330]];
  const incoming = [['2026-09-22', 1], ['2026-09-23', 999], ['2026-09-22', 2]];
  assert.deepEqual(mergeHistory(existing, incoming), [['2026-09-22', 2], ['2026-09-23', 330], ['2026-09-24', 335.92]]);
  const many = [];
  for (let i = 0; i < 450; i++) many.push([new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), i]);
  const m = mergeHistory([], many);
  assert.equal(m.length, HISTORY_KEEP);
  assert.equal(m[0][1], 50);
  assert.equal(m[m.length - 1][1], 449);
});

test('parseArgs', () => {
  assert.deepEqual(parseArgs([]), { force: false, maxMinutes: 330 });
  assert.deepEqual(parseArgs(['--max-minutes', '10', '--force']), { force: true, maxMinutes: 10 });
  assert.deepEqual(parseArgs(['--max-minutes=5']), { force: false, maxMinutes: 5 });
  assert.throws(() => parseArgs(['--max-minutes', 'x']));
});

test('end to end with mock server: mapping, 404 skip, 429 retry, spacing, merge, key never printed', async () => {
  const dir = await tmp();
  const mock = await mockTiingo({
    AAPL: [{ status: 200, body: tiingoRows(30) }],
    'BRK-B': [{ status: 200, body: tiingoRows(5) }],
    RL: [{ status: 429 }, { status: 429 }, { status: 200, body: tiingoRows(3) }],
    EMPTY: [{ status: 200, body: [] }],
  });
  try {
    await writeFile(join(dir, 'AAPL.json'), JSON.stringify([['2025-08-02', 9999]]) + '\n');
    const clock = fakeClock();
    const reqTimes = [];
    const fetchImpl = (url, opts) => { reqTimes.push(clock.now()); return fetch(url, opts); };
    const logs = [];
    const summary = await runBackfill({
      key: KEY, symbols: ['AAPL', 'BRK.B', 'NOPE', 'RL', 'EMPTY'], dir, fetchImpl,
      now: clock.now, sleep: clock.sleep, baseUrl: mock.baseUrl, log: (s) => logs.push(s),
    });
    assert.equal(summary.fetched, 3);
    assert.equal(summary.skipped, 2);
    assert.equal(summary.stopped, null);

    // header auth, tickers mapped
    assert.ok(mock.hits.every((h) => h.auth === `Token ${KEY}`));
    assert.deepEqual(mock.hits.map((h) => h.ticker), ['AAPL', 'BRK-B', 'NOPE', 'RL', 'RL', 'RL', 'EMPTY']);
    assert.ok(mock.hits.every((h) => !h.query.includes(KEY)));

    // spacing >= 80 s between every request; two 10-minute waits for the 429s
    for (let i = 1; i < reqTimes.length; i++) assert.ok(reqTimes[i] - reqTimes[i - 1] >= GAP_MS, `gap ${i}`);
    assert.equal(clock.sleeps.filter((ms) => ms === RATE_WAIT_MS).length, 2);

    // merge: existing date kept, file named with the dot symbol
    const aapl = await readJ(join(dir, 'AAPL.json'));
    assert.equal(aapl.length, 30);
    assert.deepEqual(aapl.find((r) => r[0] === '2025-08-02'), ['2025-08-02', 9999]);
    assert.deepEqual(aapl[0], ['2025-08-01', 100]);
    assert.equal((await readJ(join(dir, 'BRK.B.json'))).length, 5);

    const state = await readJ(join(dir, STATE_FILE));
    assert.deepEqual(state.done, ['AAPL', 'BRK.B', 'RL']);
    assert.deepEqual(state.skipped.map((s) => s.symbol), ['NOPE', 'EMPTY']);
    assert.match(state.skipped[0].reason, /404/);
    assert.ok(state.startedAt && state.lastRun);

    // key never printed or written
    assert.ok(!logs.join('\n').includes(KEY));
    assert.ok(!JSON.stringify(state).includes(KEY));
  } finally {
    await mock.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('resumable: done/skipped not refetched; --force refetches', async () => {
  const dir = await tmp();
  const mock = await mockTiingo({ A: [{ status: 200, body: tiingoRows(3) }], B: [{ status: 200, body: tiingoRows(3) }] });
  try {
    await writeFile(join(dir, STATE_FILE), JSON.stringify({ done: ['A'], skipped: [{ symbol: 'X', reason: 'r' }], startedAt: '2026-09-01T00:00:00.000Z', lastRun: null }));
    const clock = fakeClock();
    const opts = { key: KEY, symbols: ['A', 'B', 'X'], dir, now: clock.now, sleep: clock.sleep, baseUrl: mock.baseUrl, log: () => {} };
    await runBackfill(opts);
    assert.deepEqual(mock.hits.map((h) => h.ticker), ['B']);
    const s = await readJ(join(dir, STATE_FILE));
    assert.deepEqual(s.done, ['A', 'B']);
    assert.equal(s.startedAt, '2026-09-01T00:00:00.000Z');

    await runBackfill(opts); // nothing left
    assert.equal(mock.hits.length, 1);

    await runBackfill({ ...opts, force: true });
    assert.deepEqual(mock.hits.map((h) => h.ticker), ['B', 'A', 'B', 'X']);
  } finally {
    await mock.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('429 forever: stops after 3 retries without marking the symbol', async () => {
  const dir = await tmp();
  const mock = await mockTiingo({ R: [{ status: 429 }], S: [{ status: 200, body: tiingoRows(2) }] });
  try {
    const clock = fakeClock();
    const summary = await runBackfill({ key: KEY, symbols: ['R', 'S'], dir, now: clock.now, sleep: clock.sleep, baseUrl: mock.baseUrl, log: () => {} });
    assert.match(summary.stopped, /429/);
    assert.equal(summary.remaining, 2);
    assert.equal(mock.hits.length, 4); // first try + 3 retries
    const s = await readJ(join(dir, STATE_FILE));
    assert.deepEqual(s.done, []);
    assert.deepEqual(s.skipped, []);
  } finally {
    await mock.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('stops cleanly before the time budget', async () => {
  const dir = await tmp();
  const b = {};
  const syms = [];
  for (let i = 0; i < 10; i++) { syms.push(`T${i}`); b[`T${i}`] = [{ status: 200, body: tiingoRows(2) }]; }
  const mock = await mockTiingo(b);
  try {
    const clock = fakeClock();
    const t0 = clock.now();
    // 5 minutes at 80 s spacing -> requests at 0, 80, 160, 240 s; the 5th (320 s) would pass the budget.
    const summary = await runBackfill({ key: KEY, symbols: syms, dir, maxMinutes: 5, now: clock.now, sleep: clock.sleep, baseUrl: mock.baseUrl, log: () => {} });
    assert.equal(mock.hits.length, 4);
    assert.equal(summary.fetched, 4);
    assert.equal(summary.remaining, 6);
    assert.ok(clock.now() - t0 < 5 * 60_000);
    assert.deepEqual((await readJ(join(dir, STATE_FILE))).done, ['T0', 'T1', 'T2', 'T3']);
  } finally {
    await mock.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('401 stops the run (bad key) and nothing is marked', async () => {
  const dir = await tmp();
  const mock = await mockTiingo({ A: [{ status: 401 }] });
  try {
    const clock = fakeClock();
    const logs = [];
    const summary = await runBackfill({ key: KEY, symbols: ['A', 'B'], dir, now: clock.now, sleep: clock.sleep, baseUrl: mock.baseUrl, log: (s) => logs.push(s) });
    assert.match(summary.stopped, /401/);
    assert.equal(mock.hits.length, 1);
    assert.ok(!logs.join('\n').includes(KEY));
  } finally {
    await mock.close();
    await rm(dir, { recursive: true, force: true });
  }
});
