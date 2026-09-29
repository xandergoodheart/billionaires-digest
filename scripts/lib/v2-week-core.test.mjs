// node --test scripts/lib/
// v3 week helpers (assets/v2/week-core.js, an ES5 browser file) loaded into a node:vm context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'assets', 'v2', 'week-core.js'), 'utf8');
function load() {
  const ctx = vm.createContext({});
  vm.runInContext(SRC, ctx, { filename: 'week-core.js' });
  return ctx.BDWeekCore;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const W = load();

const WK = { week: '2026-W40', start: '2026-09-28', days: ['2026-09-28', '2026-09-29', '2026-09-30'] };

test('weekSlots: Mon-Fri slots, running totals, open days empty', () => {
  const s = plain(W.weekSlots(WK, { '2026-09-28': 40, '2026-09-29': -100, '2026-09-30': 25 }));
  assert.deepEqual(s.map((x) => x.dow), ['MON', 'TUE', 'WED', 'THU', 'FRI']);
  assert.deepEqual(s.map((x) => x.state), ['scored', 'scored', 'scored', 'open', 'open']);
  assert.deepEqual(s.map((x) => x.running), [40, -60, -35, null, null]);
  assert.deepEqual(s.map((x) => x.points), [40, -100, 25, null, null]);
  assert.equal(s[0].date, '2026-09-28');
  assert.equal(s[4].date, '2026-10-02');
});

test('weekSlots: late-entry days (null) are marked late and add nothing', () => {
  const s = plain(W.weekSlots(WK, { '2026-09-28': null, '2026-09-29': 10, '2026-09-30': 5 }));
  assert.deepEqual(s.map((x) => x.state).slice(0, 3), ['late', 'scored', 'scored']);
  assert.deepEqual(s.map((x) => x.running).slice(0, 3), [null, 10, 15]);
});

test('weekSlots: a week starting midweek still lines up from Monday; no data -> []', () => {
  const s = plain(W.weekSlots({ start: '2026-09-21', days: ['2026-09-24', '2026-09-25'] }, { '2026-09-24': 7, '2026-09-25': 3 }));
  assert.deepEqual(s.map((x) => x.state), ['open', 'open', 'open', 'scored', 'scored']);
  assert.deepEqual(s.map((x) => x.running), [null, null, null, 7, 10]);
  assert.deepEqual(plain(W.weekSlots(null, {})), []);
  assert.deepEqual(plain(W.weekSlots({ days: [] }, {})), []);
});

test('barScale: shares above/below zero and bar sizes', () => {
  const s = W.weekSlots(WK, { '2026-09-28': 40, '2026-09-29': -100, '2026-09-30': 25 });
  const b = plain(W.barScale(s));
  assert.equal(b.max, 60);
  assert.equal(b.pos, 0.4);
  assert.equal(b.neg, 0.6);
  assert.deepEqual(b.bars.map((x) => x.up), [true, false, false, true, true]);
  assert.deepEqual(b.bars.map((x) => x.pct), [100, 100, 58.3, 0, 0]);
  const only = plain(W.barScale(W.weekSlots(WK, { '2026-09-28': 10, '2026-09-29': 10 })));
  assert.equal(only.pos, 1);
  assert.equal(only.neg, 0);
  assert.deepEqual(only.bars.map((x) => x.pct).slice(0, 2), [50, 100]);
  const zero = plain(W.barScale(W.weekSlots(WK, { '2026-09-28': 0 })));
  assert.equal(zero.pos, 1);
  assert.equal(zero.bars[0].pct, 0);
});

test('replayAt / nextStep: clamps and reports the day', () => {
  const s = W.weekSlots(WK, { '2026-09-28': 40, '2026-09-29': -100, '2026-09-30': 25 });
  const r0 = plain(W.replayAt(s, 0));
  assert.equal(r0.step, 0); assert.equal(r0.n, 3); assert.equal(r0.day, null); assert.equal(r0.running, 0); assert.equal(r0.done, false);
  assert.equal(r0.first.date, '2026-09-28');
  const r2 = plain(W.replayAt(s, 2));
  assert.equal(r2.day.date, '2026-09-29'); assert.equal(r2.points, -100); assert.equal(r2.running, -60); assert.equal(r2.done, false);
  const r9 = plain(W.replayAt(s, 9));
  assert.equal(r9.step, 3); assert.equal(r9.running, -35); assert.equal(r9.done, true);
  assert.equal(W.replayAt(s, -4).step, 0);
  assert.equal(W.nextStep(0, 3), 1);
  assert.equal(W.nextStep(3, 3), 3);
  assert.equal(W.nextStep('x', 3), 1);
});

test('topOfDay: best of the team that day, ties by order', () => {
  assert.deepEqual(plain(W.topOfDay({ a: 5, b: 9, c: 9 }, ['a', 'b', 'c'])), { slug: 'b', points: 9 });
  assert.deepEqual(plain(W.topOfDay({ a: -5, b: -2 }, ['a', 'b'])), { slug: 'b', points: -2 });
  assert.equal(W.topOfDay({}, ['a']), null);
  assert.equal(W.topOfDay(null, null), null);
});

test('versus: difference and direction, null when a side is missing', () => {
  assert.deepEqual(plain(W.versus(364, 300)), { mine: 364, spy: 300, diff: 64, lead: 'ahead' });
  assert.equal(W.versus(-10, 5).lead, 'behind');
  assert.equal(W.versus(5, 5).lead, 'level');
  assert.equal(W.versus(5, null), null);
  assert.equal(W.versus(undefined, 5), null);
});

const POOL = [
  { slug: 'a', name: 'Ann' }, { slug: 'b', name: 'Bob' }, { slug: 'c', name: 'Cy' }, { slug: 'd', name: 'Dee' }
];
test('watchSource / topPlayers: scoring week first, else the last scored day of the week before', () => {
  const sb = { days: ['2026-09-28', '2026-09-29'], draftable: POOL, daily: { '2026-09-28': { a: 10, b: 5, c: -3 }, '2026-09-29': { a: -20, b: 5 } } };
  const prev = { days: ['2026-09-24', '2026-09-25'], draftable: POOL, daily: { '2026-09-25': { d: 50, a: 1 } } };
  const s1 = W.watchSource(sb, prev);
  assert.equal(s1.kind, 'week'); assert.equal(s1.date, '2026-09-29');
  const t1 = plain(W.topPlayers(s1, 5)).map((x) => [x.p.slug, x.points]);
  assert.deepEqual(t1, [['b', 10], ['c', -3], ['a', -10]]);
  const s2 = W.watchSource({ days: [], draftable: POOL }, prev);
  assert.equal(s2.kind, 'day'); assert.equal(s2.date, '2026-09-25');
  assert.deepEqual(plain(W.topPlayers(s2, 1)).map((x) => [x.p.slug, x.points]), [['d', 50]]);
  assert.equal(W.watchSource(null, null), null);
  assert.deepEqual(plain(W.topPlayers(null, 5)), []);
});

test('topPlayers: ties sorted by name', () => {
  const src = { kind: 'week', wk: { days: ['2026-09-28'], draftable: [{ slug: 'z', name: 'Zed' }, { slug: 'y', name: 'Amy' }], daily: { '2026-09-28': { z: 4, y: 4 } } } };
  assert.deepEqual(plain(W.topPlayers(src, 5)).map((x) => x.p.slug), ['y', 'z']);
});
