// node --test scripts/lib/
// v2 Players helpers (assets/v2/players-core.js, an ES5 browser file) loaded into a node:vm context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'assets', 'v2', 'players-core.js'), 'utf8');
function load() {
  const ctx = vm.createContext({});
  vm.runInContext(SRC, ctx, { filename: 'players-core.js' });
  return ctx.BDPlayersCore;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const P = load();

const POOL = [
  { slug: 'a', name: 'Ann Alpha', rank: 3, sector: 'AI & tech', holdings: [{ ticker: 'AAA', name: 'Alpha Corp', weight: 1 }] },
  { slug: 'b', name: 'Bob Beta', rank: 1, sector: 'AI & tech', holdings: [{ ticker: 'BBB', name: 'Beta Inc', weight: 0.6 }, { ticker: 'AAA', name: 'Alpha Corp', weight: 0.4 }] },
  { slug: 'c', name: 'Cy Gamma', rank: 2, sector: 'Finance', holdings: [{ ticker: 'BRK.B', name: 'Berkshire Hathaway', weight: 1 }] },
  { slug: 'd', name: 'Dé Delta', rank: 4, sector: 'AI & tech', holdings: [] },
  { slug: 'e', name: 'Eve Eps', rank: 5, holdings: [] }
];
const PTS = { a: 10, b: 30, c: -5, d: 10 };
const pts = (s) => (Object.prototype.hasOwnProperty.call(PTS, s) ? PTS[s] : null);

test('sectorRank: rank by points within the sector, ties share a rank', () => {
  assert.deepEqual(plain(P.sectorRank(POOL, 'b', pts)), { rank: 1, of: 3, sector: 'AI & tech' });
  assert.deepEqual(plain(P.sectorRank(POOL, 'a', pts)), { rank: 2, of: 3, sector: 'AI & tech' });
  assert.deepEqual(plain(P.sectorRank(POOL, 'd', pts)), { rank: 2, of: 3, sector: 'AI & tech' });
  assert.deepEqual(plain(P.sectorRank(POOL, 'c', pts)), { rank: 1, of: 1, sector: 'Finance' });
});

test('sectorRank: null when not in the pool or no points; missing sector counts as Other', () => {
  assert.equal(P.sectorRank(POOL, 'zz', pts), null);
  assert.equal(P.sectorRank(POOL, 'e', pts), null);
  assert.deepEqual(plain(P.sectorRank(POOL, 'e', () => 0)), { rank: 1, of: 1, sector: 'Other' });
  assert.equal(P.sectorRank([], 'a', pts), null);
});

test('matches: name, sector, ticker and company words; accents folded', () => {
  assert.ok(P.matches(POOL[0], ''));
  assert.ok(P.matches(POOL[0], 'ann'));
  assert.ok(P.matches(POOL[1], 'alpha corp'));
  assert.ok(P.matches(POOL[2], 'brk'));
  assert.ok(P.matches(POOL[2], 'brk.b'));
  assert.ok(P.matches(POOL[2], 'finance'));
  assert.ok(P.matches(POOL[3], 'de delta'));
  assert.ok(!P.matches(POOL[0], 'ann beta'));
});

test('sortPlayers: each key, missing values last, ties by Forbes rank', () => {
  const get = { pts, avg: (s) => ({ a: 2, b: 1 }[s] ?? null), cap: (s) => ({ a: 20, b: 30, c: 20, d: 7 }[s] ?? null) };
  const order = (k) => P.sortPlayers(POOL, k, get).map((p) => p.slug).join('');
  assert.equal(order('pts'), 'badce');
  assert.equal(order('avg'), 'abcde');
  assert.equal(order('capdesc'), 'bcade');
  assert.equal(order('capasc'), 'dcabe');
  assert.equal(order('rank'), 'bcade');
  assert.equal(order('name'), 'abcde');
  assert.equal(order('nope'), 'bcade');
  // copy, not in place
  assert.equal(POOL[0].slug, 'a');
});

test('dailySeries: merges weeks, oldest first, null for days without the player', () => {
  const w1 = { days: ['2026-09-17', '2026-09-18'], daily: { '2026-09-17': { a: 5 }, '2026-09-18': { b: 1 } } };
  const w2 = { days: ['2026-09-21'], daily: { '2026-09-21': { a: -3 } } };
  assert.deepEqual(plain(P.dailySeries([w2, w1, null], 'a')), [
    { date: '2026-09-17', points: 5 }, { date: '2026-09-18', points: null }, { date: '2026-09-21', points: -3 }
  ]);
  assert.deepEqual(plain(P.dailySeries([], 'a')), []);
});

test('gameLog: rows newest first, holdings by weight, bonuses default to 0', () => {
  const days = {
    '2026-09-23': { people: { a: { returnPct: 0.5, pricePoints: 50, points: 75, bonuses: { insiderBuy: 25, stories: 0 }, holdings: [{ ticker: 'X', weight: 0.2, changePct: 1 }, { ticker: 'Y', weight: 0.8, changePct: 0.25 }] } } },
    '2026-09-24': { people: { a: { returnPct: -0.41, pricePoints: -41, points: -31, bonuses: { stories: 10 }, holdings: [{ ticker: 'X', weight: 1, changePct: -0.41 }] } } },
    '2026-09-25': { people: { b: { points: 1 } } }
  };
  const rows = plain(P.gameLog(days, ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'], 'a'));
  assert.deepEqual(rows.map((r) => r.date), ['2026-09-24', '2026-09-23']);
  assert.deepEqual(rows[1].holdings.map((h) => h.ticker), ['Y', 'X']);
  assert.equal(rows[0].insiderBuy, 0);
  assert.equal(rows[0].stories, 10);
  assert.equal(rows[0].points, -31);
  assert.equal(rows[1].insiderBuy, 25);
});

test('pct and weightPct formatting', () => {
  assert.equal(P.pct(1.2253), '+1.23%');
  assert.equal(P.pct(-0.4124), '−0.41%');
  assert.equal(P.pct(0), '0.00%');
  assert.equal(P.pct(-0.001), '0.00%');
  assert.equal(P.pct(null), '—');
  assert.equal(P.weightPct(1), '100%');
  assert.equal(P.weightPct(0.2177), '21.8%');
  assert.equal(P.weightPct(0.75), '75%');
  assert.equal(P.weightPct(undefined), '—');
  assert.deepEqual(plain(P.tickers(POOL[1])), ['BBB', 'AAA']);
});
