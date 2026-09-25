// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorth, addCoverage, MIN_COVERAGE } from './data-common.mjs';

test('parseWorth', () => {
  assert.equal(parseWorth('$927.9B'), 927.9e9);
  assert.equal(parseWorth('$184B'), 184e9);
  assert.equal(parseWorth('$25.1B'), 25.1e9);
  assert.equal(parseWorth('$845M'), 845e6);
  for (const bad of ['', 'n/a', '927.9B', '$abcB', '$12T', null, undefined, 42]) assert.equal(parseWorth(bad), null);
});

test('bad worth -> coverage null -> hidden', () => {
  const people = { x: { estDailyChange: 1, holdings: [{ ticker: 'A', shares: 10 }] } };
  addCoverage(people, { A: { price: 5 } }, { x: parseWorth('bad') });
  assert.equal(people.x.coveredValue, 50);
  assert.equal(people.x.coverage, null);
  assert.equal(people.x.coverage >= MIN_COVERAGE, false);
});

test('coverage rounding', () => {
  const people = { x: { holdings: [{ ticker: 'A', shares: 1000 }] } };
  addCoverage(people, { A: { price: 1 } }, { x: 3000 });
  assert.equal(people.x.coverage, 0.333);
});
