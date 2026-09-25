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
