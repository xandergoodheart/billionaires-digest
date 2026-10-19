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

test('sortPlayers: each key, missing values last, ties by name', () => {
  const get = { pts, avg: (s) => ({ a: 2, b: 1 }[s] ?? null), cap: (s) => ({ a: 20, b: 30, c: 20, d: 7 }[s] ?? null) };
  const order = (k) => P.sortPlayers(POOL, k, get).map((p) => p.slug).join('');
  assert.equal(order('pts'), 'badce');        // a and d tie on 10: Ann before Dé by name
  assert.equal(order('avg'), 'abcde');        // c, d, e have no avg: last, by name
  assert.equal(order('capdesc'), 'bacde');    // a and c tie on 20: by name
  assert.equal(order('capasc'), 'dacbe');
  assert.equal(order('rank'), 'bcade');
  assert.equal(order('name'), 'abcde');
  assert.equal(order('nope'), 'badce');       // unknown id = week points, high to low
  // get.rank (Public Stake Value rank) overrides the entries' own rank; missing ranks last
  const byStake = P.sortPlayers(POOL, 'rank', { rank: (s) => ({ e: 1, d: 2, a: 3 }[s] ?? null) }).map((p) => p.slug).join('');
  assert.equal(byStake, 'edabc');
  // copy, not in place
  assert.equal(POOL[0].slug, 'a');
});

test('sortPlayers: both directions for every column', () => {
  const get = { pts, avg: (s) => ({ a: 2, b: 1, c: 3 }[s] ?? null), cap: (s) => ({ a: 20, b: 30, c: 25, d: 7 }[s] ?? null), value: (s) => ({ a: 0.5, b: 0.1 }[s] ?? null) };
  const order = (k) => P.sortPlayers(POOL, k, get).map((p) => p.slug).join('');
  assert.equal(order('pts'), 'badce');
  assert.equal(order('pts-asc'), 'cadbe');    // low to high; a/d tie stays A to Z; e (missing) still last
  assert.equal(order('avg'), 'cabde');
  assert.equal(order('avg-asc'), 'bacde');
  assert.equal(order('capdesc'), 'bcade');
  assert.equal(order('capasc'), 'dacbe');
  assert.equal(order('value'), 'abcde');
  assert.equal(order('value-asc'), 'bacde');
  assert.equal(order('rank'), 'bcade');       // biggest stake (rank 1) first
  assert.equal(order('rank-asc'), 'edacb');   // smallest stake first
  assert.equal(order('name'), 'abcde');
  assert.equal(order('name-desc'), 'edcba');
});

test('sortPlayers: ties are stable by name, then rank, then slug', () => {
  const pool = [
    { slug: 'z1', name: 'Zed', rank: 2 }, { slug: 'm1', name: 'Mia', rank: 9 },
    { slug: 'a1', name: 'Ava', rank: 5 }, { slug: 'z0', name: 'Zed', rank: 1 }
  ];
  const all5 = () => 5;
  for (const id of ['pts', 'pts-asc', 'capdesc', 'capasc']) {
    assert.equal(P.sortPlayers(pool, id, { pts: all5, cap: all5 }).map((p) => p.slug).join(' '), 'a1 m1 z0 z1', id);
  }
  // same input order or reversed: same result
  assert.equal(P.sortPlayers(pool.slice().reverse(), 'pts', { pts: all5 }).map((p) => p.slug).join(' '), 'a1 m1 z0 z1');
});

test('sortPlayers: missing values are last in both directions', () => {
  const pool = [{ slug: 'x', name: 'X', rank: 1 }, { slug: 'y', name: 'Y', rank: 2 }, { slug: 'n', name: 'N', rank: 3 }, { slug: 'q', name: '', rank: 4 }];
  const v = (s) => ({ x: 1, y: -2, q: 4 }[s] ?? null);
  const nan = (s) => (s === 'y' ? NaN : v(s));
  assert.equal(P.sortPlayers(pool, 'pts', { pts: v }).map((p) => p.slug).join(''), 'qxyn');
  assert.equal(P.sortPlayers(pool, 'pts-asc', { pts: v }).map((p) => p.slug).join(''), 'yxqn');
  assert.equal(P.sortPlayers(pool, 'pts-asc', { pts: nan }).map((p) => p.slug).at(-1), 'y');  // NaN counts as missing
  // no name: last both ways
  assert.equal(P.sortPlayers(pool, 'name', {}).map((p) => p.slug).join(''), 'nxyq');
  assert.equal(P.sortPlayers(pool, 'name-desc', {}).map((p) => p.slug).join(''), 'yxnq');
  // no stake rank: last both ways
  const rank = (s) => ({ x: 2, y: 1 }[s] ?? null);
  assert.equal(P.sortPlayers(pool, 'rank', { rank }).map((p) => p.slug).join('').slice(0, 2), 'yx');
  assert.equal(P.sortPlayers(pool, 'rank-asc', { rank }).map((p) => p.slug).join('').slice(0, 2), 'xy');
  // getter not given at all: everyone missing, order by name
  assert.equal(P.sortPlayers(pool, 'avg', {}).map((p) => p.slug).join(''), 'nxyq');
});

test('sort ids: parse, build, header clicks and header state', () => {
  assert.deepEqual(plain(P.parseSort('capasc')), { key: 'cap', dir: 'asc' });
  assert.deepEqual(plain(P.parseSort('capdesc')), { key: 'cap', dir: 'desc' });
  assert.deepEqual(plain(P.parseSort('pts-asc')), { key: 'pts', dir: 'asc' });
  assert.deepEqual(plain(P.parseSort('name')), { key: 'name', dir: 'asc' });
  assert.deepEqual(plain(P.parseSort('cap')), { key: 'pts', dir: 'desc' });
  assert.deepEqual(plain(P.parseSort(null)), { key: 'pts', dir: 'desc' });
  assert.equal(P.sortId('cap', 'desc'), 'capdesc');
  assert.equal(P.sortId('avg', 'desc'), 'avg');
  assert.equal(P.sortId('avg', 'asc'), 'avg-asc');
  assert.equal(P.sortId('name', 'desc'), 'name-desc');
  // first click high to low (name: A to Z), second click flips, third flips back
  assert.equal(P.nextSort('pts', 'avg'), 'avg');
  assert.equal(P.nextSort('avg', 'avg'), 'avg-asc');
  assert.equal(P.nextSort('avg-asc', 'avg'), 'avg');
  assert.equal(P.nextSort('pts', 'cap'), 'capdesc');
  assert.equal(P.nextSort('capdesc', 'cap'), 'capasc');
  assert.equal(P.nextSort('pts', 'name'), 'name');
  assert.equal(P.nextSort('name', 'name'), 'name-desc');
  const h = P.headerState('pts', 'pts');
  assert.deepEqual(plain(h), { active: true, dir: 'desc', ariaSort: 'descending', arrow: 'down', label: 'Sort low to high' });
  assert.deepEqual(plain(P.headerState('pts', 'cap')), { active: false, dir: null, ariaSort: 'none', arrow: 'both', label: 'Sort high to low' });
  assert.equal(P.headerState('name', 'name').ariaSort, 'ascending');
  assert.equal(P.headerState('name', 'name').label, 'Sort Z to A');
  assert.equal(P.headerState('capasc', 'cap').arrow, 'up');
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

test('player type filter: all, billionaires, CEOs', () => {
  const pool = [{ slug: 'b1', rank: 1 }, { slug: 'c1', type: 'ceo', rank: null }, { slug: 'b2', rank: 2, type: undefined }];
  const pick = (k) => pool.filter((p) => P.typeMatches(p, k)).map((p) => p.slug);
  assert.deepEqual(pick(''), ['b1', 'c1', 'b2']);
  assert.deepEqual(pick('billionaire'), ['b1', 'b2']);
  assert.deepEqual(pick('ceo'), ['c1']);
  assert.deepEqual(pick('nonsense'), ['b1', 'c1', 'b2']);
  assert.equal(P.kindOf(pool[1]), 'ceo');
  assert.equal(P.kindOf(null), 'billionaire');
  assert.equal(P.cleanKind('ceo'), 'ceo');
  assert.equal(P.cleanKind('x'), '');
  assert.equal(P.cleanKind(undefined), '');
});
