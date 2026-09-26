// node --test 'scripts/lib/book/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleEvent, settleBook, betOutcome } from './settle.mjs';

const odds = { americanOdds: -110, decimalOdds: 1.9091, fairProb: 0.5 };
const H2H = { id: 'W:h2h:a:b', type: 'h2h', params: { a: 'a', b: 'b' }, selections: [
  { id: 'ml-a', market: 'ml', person: 'a', ...odds }, { id: 'ml-b', market: 'ml', person: 'b', ...odds },
  { id: 'sp-a', market: 'spread', person: 'a', line: -2.5, ...odds }, { id: 'sp-b', market: 'spread', person: 'b', line: 2.5, ...odds }] };
const OU = { id: 'W:ou:a', type: 'player_ou', params: { slug: 'a' }, selections: [
  { id: 'o10', market: 'over', line: 10.5 }, { id: 'u10', market: 'under', line: 10.5 },
  { id: 'o50', market: 'over', line: 50.5 }, { id: 'u50', market: 'under', line: 50.5 }] };
const TOP = { id: 'W:top', type: 'futures_top', params: {}, selections: ['a', 'b', 'c', 'z'].map(s => ({ id: `t-${s}`, market: 'pick', person: s })) };
const BUY = s => ({ id: `W:buy:${s}`, type: 'prop_insider', params: { slug: s }, selections: [{ id: `${s}-yes`, market: 'yes' }, { id: `${s}-no`, market: 'no' }] });
const SEC = { id: 'W:sector', type: 'prop_sector', params: { members: { Tech: ['a', 'b'], Fin: ['c', 'd'], Energy: ['e', 'f'] } },
  selections: ['Tech', 'Fin', 'Energy'].map(k => ({ id: `s-${k}`, market: 'pick', sector: k })) };

test('head-to-head: moneyline and spread; tie voids the moneyline', () => {
  assert.deepEqual(settleEvent(H2H, { totals: { a: 20, b: 10 } }).out, { 'ml-a': 'win', 'ml-b': 'lose', 'sp-a': 'win', 'sp-b': 'lose' });
  assert.deepEqual(settleEvent(H2H, { totals: { a: 12, b: 10 } }).out, { 'ml-a': 'win', 'ml-b': 'lose', 'sp-a': 'lose', 'sp-b': 'win' });
  assert.deepEqual(settleEvent(H2H, { totals: { a: -5, b: 10 } }).out, { 'ml-a': 'lose', 'ml-b': 'win', 'sp-a': 'lose', 'sp-b': 'win' });
  const tie = settleEvent(H2H, { totals: { a: 7, b: 7 } });
  assert.deepEqual(tie.out, { 'ml-a': 'void', 'ml-b': 'void', 'sp-a': 'lose', 'sp-b': 'win' });
  assert.match(tie.note, /tie/);
  assert.deepEqual(settleEvent(H2H, { totals: { a: 7 } }).out, { 'ml-a': 'void', 'ml-b': 'void', 'sp-a': 'void', 'sp-b': 'void' });
});

test('over/under ladder', () => {
  assert.deepEqual(settleEvent(OU, { totals: { a: 30 } }).out, { o10: 'win', u10: 'lose', o50: 'lose', u50: 'win' });
  assert.deepEqual(settleEvent(OU, { totals: { a: -3 } }).out, { o10: 'lose', u10: 'win', o50: 'lose', u50: 'win' });
  assert.deepEqual(settleEvent({ ...OU, selections: [{ id: 'x', market: 'over', line: 5 }] }, { totals: { a: 5 } }).out, { x: 'void' });   // exact line: push -> void
  assert.deepEqual(settleEvent(OU, { totals: {} }).out, { o10: 'void', u10: 'void', o50: 'void', u50: 'void' });
});

test('futures: unique leader wins, tie voids the tied, missing score voids', () => {
  assert.deepEqual(settleEvent(TOP, { totals: { a: 50, b: 40, c: 60 } }).out, { 't-a': 'lose', 't-b': 'lose', 't-c': 'win', 't-z': 'void' });
  assert.deepEqual(settleEvent(TOP, { totals: { a: 60, b: 40, c: 60, z: 1 } }).out, { 't-a': 'void', 't-b': 'lose', 't-c': 'void', 't-z': 'lose' });
});

test('props: insider buy yes/no/void; top sector with ties', () => {
  const r = settleBook({ events: [BUY('a'), BUY('b'), BUY('c')] }, { totals: {}, pBuyDays: { a: 2 }, insiderUnknown: ['c', 'a'] }).results;
  assert.deepEqual(r, { 'a-yes': 'win', 'a-no': 'lose', 'b-yes': 'lose', 'b-no': 'win', 'c-yes': 'void', 'c-no': 'void' });
  assert.deepEqual(settleEvent(SEC, { totals: { a: 10, b: 30, c: 5, d: 5, e: 40, f: -20 } }).out, { 's-Tech': 'win', 's-Fin': 'lose', 's-Energy': 'lose' });
  assert.deepEqual(settleEvent(SEC, { totals: { a: 10, b: 30, c: 5, d: 5, e: 40, f: 0 } }).out, { 's-Tech': 'void', 's-Fin': 'lose', 's-Energy': 'void' });
  // a sector with no scores at all is void
  assert.deepEqual(settleEvent(SEC, { totals: { a: 1, b: 1, c: 0, d: 0 } }).out, { 's-Tech': 'win', 's-Fin': 'lose', 's-Energy': 'void' });
});

test('bets: singles, parlays, voids recompute, cap', () => {
  assert.deepEqual(betOutcome(100, [{ result: 'win', decimal: 1.9091 }]), { status: 'won', payout: 190 });
  assert.deepEqual(betOutcome(100, [{ result: 'lose', decimal: 1.9091 }]), { status: 'lost', payout: 0 });
  assert.deepEqual(betOutcome(100, [{ result: 'void', decimal: 1.9091 }]), { status: 'void', payout: 100 });
  assert.deepEqual(betOutcome(100, [{ result: 'win', decimal: 1.9091 }, { result: null, decimal: 3 }]), { status: 'open', payout: null });
  // parlay: 1.9091 x 3.5 x 2.5 = 16.70...; a void leg drops out
  assert.deepEqual(betOutcome(10, [{ result: 'win', decimal: 1.9091 }, { result: 'win', decimal: 3.5 }, { result: 'win', decimal: 2.5 }]), { status: 'won', payout: 167 });
  assert.deepEqual(betOutcome(10, [{ result: 'win', decimal: 1.9091 }, { result: 'void', decimal: 3.5 }, { result: 'win', decimal: 2.5 }]), { status: 'won', payout: 47 });
  assert.deepEqual(betOutcome(10, [{ result: 'void', decimal: 1.9091 }, { result: 'lose', decimal: 3.5 }]), { status: 'lost', payout: 0 });
  assert.deepEqual(betOutcome(10, [{ result: 'void', decimal: 1.9091 }, { result: 'void', decimal: 3.5 }]), { status: 'void', payout: 10 });
  assert.deepEqual(betOutcome(500, [{ result: 'win', decimal: 50 }, { result: 'win', decimal: 12 }]), { status: 'won', payout: 10000 });
});

// ---------- price markets ----------
import { priceMeasure, priceEventState, maxStakeFor, stakeCapMessage, STAKE_CAPS, PRICE_GIVE_UP_DAYS } from './settle.mjs';

const F = '2026-09-25', T = '2026-10-02';
// A +10%, B -5%, C +10% (ties A), D 0%, WMT +2%, E missing the to close
const HIST = {
  A: [[F, 100], [T, 110]], B: [[F, 200], [T, 190]], C: [[F, 50], [T, 55]], D: [[F, 10], [T, 10]], WMT: [[F, 100], [T, 102]], E: [[F, 10]]
};
const bk = t => [{ ticker: t, weight: 1 }];
const blastEv = (metric, side, slugs, extra = {}) => ({ id: `W:blast:${metric}:${side}:week`, type: 'blast',
  params: { metric, side, period: 'week', from: F, to: T, slugs, ...extra }, selections: slugs.map(s => ({ id: `b-${s}`, market: 'pick', person: s })) });
const shares = t => n => ({ method: 'shares', shares: { [t]: n } });

test('blast (%): biggest gain / drop wins; a tie voids the tied picks; a missing close voids the board', () => {
  const baskets = { a: bk('A'), b: bk('B'), d: bk('D'), c: bk('C') };
  assert.deepEqual(settleEvent(blastEv('pct', 'up', ['a', 'b', 'd'], { baskets }), { history: HIST }).out, { 'b-a': 'win', 'b-b': 'lose', 'b-d': 'lose' });
  assert.deepEqual(settleEvent(blastEv('pct', 'down', ['a', 'b', 'd'], { baskets }), { history: HIST }).out, { 'b-a': 'lose', 'b-b': 'win', 'b-d': 'lose' });
  const tie = settleEvent(blastEv('pct', 'up', ['a', 'b', 'c'], { baskets }), { history: HIST });
  assert.deepEqual(tie.out, { 'b-a': 'void', 'b-b': 'lose', 'b-c': 'void' });
  assert.match(tie.note, /tie: void/);
  const miss = settleEvent(blastEv('pct', 'up', ['a', 'e'], { baskets: { a: bk('A'), e: bk('E') } }), { history: HIST });
  assert.deepEqual(miss.out, { 'b-a': 'void', 'b-e': 'void' });
  assert.match(miss.note, /missing/);
  assert.deepEqual(settleEvent(blastEv('pct', 'up', ['a', 'b'], { baskets }), {}).out, { 'b-a': 'void', 'b-b': 'void' });  // no history at all
});

test('blast ($): tracked dollar change, shares and worth entries', () => {
  // a: 1e9 shares of A: +$10B; b: 1e9 of B: -$10B; w: $300B moving with WMT (+2%): +$6B
  const wealth = { a: shares('A')(1e9), b: shares('B')(1e9), w: { method: 'worth', worth: 3e11, ticker: 'WMT', refDate: F, refClose: 100 } };
  assert.deepEqual(priceMeasure(blastEv('usd', 'up', ['a', 'b', 'w'], { wealth }), HIST), { a: 1e10, b: -1e10, w: 6e9 });
  assert.deepEqual(settleEvent(blastEv('usd', 'up', ['a', 'b', 'w'], { wealth }), { history: HIST }).out, { 'b-a': 'win', 'b-b': 'lose', 'b-w': 'lose' });
  const down = settleEvent(blastEv('usd', 'down', ['a', 'b', 'w'], { wealth }), { history: HIST });
  assert.deepEqual(down.out, { 'b-a': 'lose', 'b-b': 'win', 'b-w': 'lose' });
  assert.match(down.note, /−\$10\.00B/);
});

test('ladder: inclusive strikes; missing close voids', () => {
  const lad = (t, lines) => ({ id: 'W:ladder:x', type: 'ladder', params: { slug: 'x', from: F, to: T, basket: bk(t) },
    selections: lines.map(K => ({ id: `k${K}`, market: 'strike', person: 'x', line: K })) });
  const K = [-10, -5, -2, 2, 5, 10];
  assert.deepEqual(settleEvent(lad('A', K), { history: HIST }).out, { 'k-10': 'lose', 'k-5': 'lose', 'k-2': 'lose', k2: 'win', k5: 'win', k10: 'win' });   // exactly +10
  assert.deepEqual(settleEvent(lad('B', K), { history: HIST }).out, { 'k-10': 'lose', 'k-5': 'win', 'k-2': 'win', k2: 'lose', k5: 'lose', k10: 'lose' }); // exactly -5
  assert.deepEqual(settleEvent(lad('D', K), { history: HIST }).out, { 'k-10': 'lose', 'k-5': 'lose', 'k-2': 'lose', k2: 'lose', k5: 'lose', k10: 'lose' });
  assert.deepEqual(settleEvent(lad('E', [2, -2]), { history: HIST }).out, { k2: 'void', 'k-2': 'void' });
});

test('bracket: the range holding the move wins; lower ends included', () => {
  const B = [[null, -5], [-5, -2], [-2, 0], [0, 2], [2, 5], [5, null]];
  const br = t => ({ id: 'W:bracket:x', type: 'bracket', params: { slug: 'x', from: F, to: T, basket: bk(t),
    buckets: Object.fromEntries(B.map((b, i) => [`r${i}`, b])) }, selections: B.map((_, i) => ({ id: `r${i}`, market: 'bracket', person: 'x' })) });
  const win = t => Object.entries(settleEvent(br(t), { history: HIST }).out).filter(([, r]) => r === 'win').map(([k]) => k);
  assert.deepEqual(win('A'), ['r5']);     // +10
  assert.deepEqual(win('B'), ['r1']);     // exactly -5 -> [-5, -2)
  assert.deepEqual(win('D'), ['r3']);     // 0 -> [0, 2)
  assert.deepEqual(win('WMT'), ['r4']);   // exactly +2 -> [2, 5)
  assert.deepEqual(Object.values(settleEvent(br('E'), { history: HIST }).out), Array(6).fill('void'));
});

test('race: yes when the chaser ends strictly above the leader', () => {
  const race = (cw, lw) => ({ id: 'W:race:c:l', type: 'race', params: { chaser: 'c', leader: 'l', from: F, to: T, wealth: { c: cw, l: lw } },
    selections: [{ id: 'yes', market: 'yes', person: 'c' }, { id: 'no', market: 'no' }] });
  // chaser 1e9 A: $100B -> $110B; leader 5.5e8 B: $110B -> $104.5B
  assert.deepEqual(settleEvent(race(shares('A')(1e9), shares('B')(5.5e8)), { history: HIST }).out, { yes: 'win', no: 'lose' });
  // leader 1e10 D: $100B flat -> no
  assert.deepEqual(settleEvent(race(shares('D')(1e9), shares('D')(1e10)), { history: HIST }).out, { yes: 'lose', no: 'win' });
  // dead heat at the close: not passed
  assert.deepEqual(settleEvent(race(shares('A')(1e9), shares('C')(2e9)), { history: HIST }).out, { yes: 'lose', no: 'win' });
  assert.deepEqual(settleEvent(race(shares('E')(1e9), shares('A')(1e9)), { history: HIST }).out, { yes: 'void', no: 'void' });
});

test('duel: moneyline on the $ change, "by $X B+" lines; exact ties void', () => {
  const duel = (wa, wb) => ({ id: 'W:duel:a:b', type: 'duel', params: { a: 'a', b: 'b', from: F, to: T, wealth: { a: wa, b: wb } },
    selections: [{ id: 'ml-a', market: 'ml', person: 'a' }, { id: 'ml-b', market: 'ml', person: 'b' },
      { id: 'a4', market: 'by', person: 'a', line: 4 }, { id: 'b4', market: 'by', person: 'b', line: 4 }, { id: 'a5', market: 'by', person: 'a', line: 5 }, { id: 'a6', market: 'by', person: 'a', line: 6 }] });
  // a: +$10B (1e9 A); b: +$5B (1e9 C) -> a by exactly $5B
  assert.deepEqual(settleEvent(duel(shares('A')(1e9), shares('C')(1e9)), { history: HIST }).out,
    { 'ml-a': 'win', 'ml-b': 'lose', a4: 'win', b4: 'lose', a5: 'void', a6: 'lose' });
  // b: -$10B -> b loses by 20
  assert.deepEqual(settleEvent(duel(shares('C')(1e9), shares('B')(1e9)), { history: HIST }).out,
    { 'ml-a': 'win', 'ml-b': 'lose', a4: 'win', b4: 'lose', a5: 'win', a6: 'win' });
  // same change: moneyline void
  const tie = settleEvent(duel(shares('A')(1e9), shares('C')(2e9)), { history: HIST });
  assert.deepEqual(tie.out, { 'ml-a': 'void', 'ml-b': 'void', a4: 'lose', b4: 'lose', a5: 'lose', a6: 'lose' });
  assert.match(tie.note, /tie/);
  assert.deepEqual(Object.values(settleEvent(duel(shares('E')(1), shares('A')(1)), { history: HIST }).out), Array(6).fill('void'));
});

test('priceEventState: ready when every close is in; waiting; void after the give-up window', () => {
  const ev = { type: 'ladder', params: { slug: 'x', from: F, to: T, basket: bk('E') }, selections: [] };
  assert.equal(priceEventState({ ...ev, params: { ...ev.params, basket: bk('A') } }, HIST, '2026-10-03'), 'ready');
  assert.equal(priceEventState(ev, HIST, '2026-10-03'), 'waiting');
  assert.equal(PRICE_GIVE_UP_DAYS, 3);
  assert.equal(priceEventState(ev, HIST, '2026-10-06'), 'waiting');          // to + 4 days
  assert.equal(priceEventState(ev, HIST, '2026-10-07'), 'missing');
  // settleBook runs price markets and the old ones side by side
  const r = settleBook({ events: [H2H, { ...ev, id: 'L', selections: [{ id: 'L:k2', market: 'strike', line: 2 }] }] }, { totals: { a: 1, b: 0 }, history: HIST }).results;
  assert.deepEqual(r, { 'ml-a': 'win', 'ml-b': 'lose', 'sp-a': 'lose', 'sp-b': 'win', 'L:k2': 'void' });
});

test('long-shot stake caps (mirror place_bet)', () => {
  assert.deepEqual(STAKE_CAPS, [{ minDecimal: 21, maxStake: 50 }, { minDecimal: 6, maxStake: 150 }]);
  assert.equal(maxStakeFor(1.9091), 500);
  assert.equal(maxStakeFor(5.99), 500);
  assert.equal(maxStakeFor(6), 150);
  assert.equal(maxStakeFor(20.99), 150);
  assert.equal(maxStakeFor(21), 50);
  assert.equal(maxStakeFor(500), 50);
  assert.equal(stakeCapMessage(50), 'Long shots are capped at 50 coins.');
});
