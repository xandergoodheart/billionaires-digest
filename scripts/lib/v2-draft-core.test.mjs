// node --test scripts/lib/
// v3 Draft room helpers (assets/v2/draft-core.js, an ES5 browser file) loaded into a node:vm context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'assets', 'v2', 'draft-core.js'), 'utf8');
function load() {
  const ctx = vm.createContext({});
  vm.runInContext(SRC, ctx, { filename: 'draft-core.js' });
  return ctx.BDDraftCore;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const D = load();

// brute force: every combination of k from the candidates, best total avg within the cap left, ties -> lower cap
function brute(pool, picks, cap, slots) {
  const capOf = Object.fromEntries(pool.map((p) => [p.slug, p.cap]));
  const used = picks.reduce((t, s) => t + (capOf[s] || 0), 0);
  const left = cap - used, k = slots - picks.length;
  const cand = pool.filter((p) => !picks.includes(p.slug) && typeof p.cap === 'number' && p.cap <= left);
  let best = null;
  const walk = (i, chosen, c, sc) => {
    if (chosen.length === k) {
      if (c > left) return;
      if (!best || sc > best.sc + 1e-9 || (Math.abs(sc - best.sc) <= 1e-9 && c < best.c)) best = { sc, c, chosen: chosen.slice() };
      return;
    }
    for (let j = i; j < cand.length; j++) walk(j + 1, chosen.concat(cand[j].slug), c + cand[j].cap, sc + (typeof cand[j].avg === 'number' ? cand[j].avg : 0));
  };
  walk(0, [], 0, 0);
  return best;
}

test('valueScore: recent average per cap point, week points as fallback, null without points or cap', () => {
  assert.deepEqual(plain(D.valueScore(12, 40, 24)), { value: 0.5, basis: 'avg' });
  assert.deepEqual(plain(D.valueScore(null, 30, 20)), { value: 1.5, basis: 'week' });
  assert.deepEqual(plain(D.valueScore(-6, 30, 20)), { value: -0.3, basis: 'avg' });
  assert.equal(D.valueScore(null, null, 20), null);
  assert.equal(D.valueScore(10, 10, 0), null);
  assert.equal(D.valueScore(10, 10, null), null);
  assert.equal(D.valueScore(NaN, undefined, 20), null);
});

test('topValue: best five positive values, ties keep list order', () => {
  const list = [
    { slug: 'a', value: 0.2 }, { slug: 'b', value: 0.9 }, { slug: 'c', value: null }, { slug: 'd', value: -1 },
    { slug: 'e', value: 0.5 }, { slug: 'f', value: 0.5 }, { slug: 'g', value: 0.1 }, { slug: 'h', value: 0.05 }, { slug: 'i', value: 0 }
  ];
  assert.deepEqual(plain(D.topValue(list)), ['b', 'e', 'f', 'a', 'g']);
  assert.deepEqual(plain(D.topValue(list, 2)), ['b', 'e']);
  assert.deepEqual(plain(D.topValue([{ slug: 'x', value: null }, { slug: 'y', value: -2 }])), []);
});

test('formSeries: last five days, oldest first, missing points are null', () => {
  const dates = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  assert.deepEqual(plain(D.formSeries(dates, [1, null, -3, 4, 'x', 6])), [
    { date: 'd2', points: null }, { date: 'd3', points: -3 }, { date: 'd4', points: 4 }, { date: 'd5', points: null }, { date: 'd6', points: 6 }
  ]);
  assert.deepEqual(plain(D.formSeries(['a', 'b'], [5])), [{ date: 'a', points: 5 }, { date: 'b', points: null }]);
  assert.deepEqual(plain(D.formSeries([], [])), []);
});

const POOL = [
  { slug: 'p1', cap: 30, avg: 20 }, { slug: 'p2', cap: 28, avg: 19 }, { slug: 'p3', cap: 25, avg: 10 },
  { slug: 'p4', cap: 22, avg: 14 }, { slug: 'p5', cap: 20, avg: 9 }, { slug: 'p6', cap: 18, avg: 12 },
  { slug: 'p7', cap: 16, avg: 3 }, { slug: 'p8', cap: 15, avg: -4 }, { slug: 'p9', cap: 14, avg: 7 }, { slug: 'p10', cap: 14, avg: null }
];

test('autoFill: exact best five from scratch within the cap (matches brute force)', () => {
  const r = D.autoFill({ pool: POOL, picks: [], captain: null, cap: 100, slots: 5 });
  const b = brute(POOL, [], 100, 5);
  assert.equal(r.ok, true);
  assert.equal(r.add.length, 5);
  assert.ok(r.capUsed <= 100);
  assert.ok(Math.abs(r.avgTotal - b.sc) < 1e-9);
  assert.equal(r.capUsed, b.c);
  assert.equal(r.captain, r.add.reduce((best, s) => (POOL.find((p) => p.slug === s).avg > POOL.find((p) => p.slug === best).avg ? s : best)));
});

test('autoFill: keeps current picks and the current captain when tied; only fills what is left', () => {
  const r = D.autoFill({ pool: POOL, picks: ['p7', 'p8'], captain: 'p7', cap: 100, slots: 5 });
  const b = brute(POOL, ['p7', 'p8'], 100, 5);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.team.slice(0, 2)), ['p7', 'p8']);
  assert.equal(r.add.length, 3);
  assert.ok(!r.add.includes('p7') && !r.add.includes('p8'));
  assert.ok(Math.abs(r.avgTotal - (3 - 4 + b.sc)) < 1e-9);
  assert.ok(r.capUsed <= 100);
  // captain: highest recent average in the final team
  const avgs = r.team.map((s) => POOL.find((p) => p.slug === s).avg ?? -Infinity);
  assert.equal(POOL.find((p) => p.slug === r.captain).avg, Math.max(...avgs));
});

test('autoFill: random pools agree with brute force (score and cap tie-break)', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 0; t < 60; t++) {
    const pool = Array.from({ length: 12 }, (_, i) => ({ slug: 's' + i, cap: 10 + Math.floor(rnd() * 21), avg: rnd() < 0.15 ? null : Math.round((rnd() * 40 - 10) * 2) / 2 }));
    const picks = t % 3 === 0 ? [] : pool.slice(0, t % 3).map((p) => p.slug);
    const r = D.autoFill({ pool, picks, captain: picks[0] || null, cap: 100, slots: 5 });
    const b = brute(pool, picks, 100, 5);
    if (!b) { assert.equal(r.ok, false); continue; }
    assert.equal(r.ok, true, 'case ' + t);
    assert.ok(Math.abs(r.avgTotal - picks.reduce((s, x) => s + (pool.find((p) => p.slug === x).avg ?? 0), 0) - b.sc) < 1e-9, 'score case ' + t);
    assert.equal(r.capUsed - picks.reduce((s, x) => s + pool.find((p) => p.slug === x).cap, 0), b.c, 'cap tie-break case ' + t);
    assert.ok(r.capUsed <= 100);
  }
});

test('autoFill: cap edge cases', () => {
  // exactly at the cap is allowed
  const exact = [{ slug: 'a', cap: 20, avg: 1 }, { slug: 'b', cap: 20, avg: 1 }, { slug: 'c', cap: 20, avg: 1 }, { slug: 'd', cap: 20, avg: 1 }, { slug: 'e', cap: 20, avg: 1 }, { slug: 'f', cap: 21, avg: 50 }];
  const r1 = D.autoFill({ pool: exact, picks: [], cap: 100, slots: 5 });
  assert.equal(r1.ok, true);
  assert.equal(r1.capUsed, 100);
  assert.deepEqual(plain(r1.add), ['a', 'b', 'c', 'd', 'e']);
  // one cap point short: nothing fits
  const r2 = D.autoFill({ pool: exact.slice(0, 5), picks: [], cap: 99, slots: 5 });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'nofit');
  // current picks already over the cap
  const r3 = D.autoFill({ pool: [{ slug: 'x', cap: 60, avg: 1 }, { slug: 'y', cap: 50, avg: 1 }, { slug: 'z', cap: 1, avg: 1 }], picks: ['x', 'y'], cap: 100, slots: 5 });
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'over');
  // lineup full
  const r4 = D.autoFill({ pool: exact, picks: ['a', 'b', 'c', 'd', 'e'], captain: 'c', cap: 100, slots: 5 });
  assert.equal(r4.ok, false);
  assert.equal(r4.reason, 'full');
  // zero cap left with one slot open: nothing fits
  const r5 = D.autoFill({ pool: [{ slug: 'x', cap: 100, avg: 1 }, { slug: 'y', cap: 5, avg: 9 }], picks: ['x'], cap: 100, slots: 2 });
  assert.equal(r5.ok, false);
  assert.equal(r5.reason, 'nofit');
  // no recent averages anywhere
  const r6 = D.autoFill({ pool: [{ slug: 'x', cap: 10, avg: null }, { slug: 'y', cap: 10 }], picks: [], cap: 100, slots: 2 });
  assert.equal(r6.ok, false);
  assert.equal(r6.reason, 'nodata');
  // players without a cap cost are never picked
  const r7 = D.autoFill({ pool: [{ slug: 'x', cap: null, avg: 99 }, { slug: 'y', cap: 10, avg: 1 }, { slug: 'z', cap: 10, avg: 2 }], picks: [], cap: 100, slots: 2 });
  assert.deepEqual(plain(r7.add).sort(), ['y', 'z']);
});

test('autoFill: equal scores prefer the lower total cap, then pool order', () => {
  const pool = [{ slug: 'a', cap: 30, avg: 10 }, { slug: 'b', cap: 20, avg: 10 }, { slug: 'c', cap: 20, avg: 10 }];
  const r = D.autoFill({ pool, picks: [], cap: 100, slots: 1 });
  assert.deepEqual(plain(r.add), ['b']);
  assert.equal(r.captain, 'b');
});

test('bestCaptain: highest average, current captain kept on a tie, fallback without averages', () => {
  const avg = { a: 5, b: 9, c: 9, d: null };
  assert.equal(D.bestCaptain(['a', 'b', 'c'], avg, 'a'), 'b');
  assert.equal(D.bestCaptain(['a', 'b', 'c'], avg, 'c'), 'c');
  assert.equal(D.bestCaptain(['d'], avg, null), 'd');
  assert.equal(D.bestCaptain([], avg, null), null);
});

test('capLevel: warning above 90, over above the cap', () => {
  assert.equal(D.capLevel(90, 100), 'ok');
  assert.equal(D.capLevel(91, 100), 'warn');
  assert.equal(D.capLevel(100, 100), 'warn');
  assert.equal(D.capLevel(101, 100), 'over');
  assert.equal(D.capLevel(0, 100), 'ok');
});

test('queue helpers: clean against known slugs, toggle on and off', () => {
  assert.deepEqual(plain(D.cleanQueue(['a', 'b', 'a', 3, 'zz'], { a: 1, b: 1 })), ['a', 'b']);
  assert.deepEqual(plain(D.cleanQueue('nope', null)), []);
  assert.deepEqual(plain(D.toggleQueue(['a'], 'b')), ['a', 'b']);
  assert.deepEqual(plain(D.toggleQueue(['a', 'b'], 'a')), ['b']);
});
