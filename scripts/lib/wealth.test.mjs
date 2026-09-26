import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeOn, prevTradingClose, basketReturn, trackedValue, dollarPool } from './wealth.mjs';

const H = {
  AAA: [['2026-09-24', 100], ['2026-09-25', 110], ['2026-09-28', 99], ['2026-09-29', 121]],
  BBB: [['2026-09-24', 50], ['2026-09-25', 50], ['2026-09-29', 40]], // no 09-28 close
};

test('closeOn', () => {
  assert.equal(closeOn(H, 'AAA', '2026-09-25'), 110);
  assert.equal(closeOn(H, 'AAA', '2026-09-26'), null);
  assert.equal(closeOn(H, 'ZZZ', '2026-09-25'), null);
  assert.equal(closeOn(null, 'AAA', '2026-09-25'), null);
  assert.equal(closeOn({ X: [['2026-09-25', 0]] }, 'X', '2026-09-25'), null);
});

test('prevTradingClose: latest date before, where all tickers have a close', () => {
  assert.equal(prevTradingClose(H, ['AAA'], '2026-09-29'), '2026-09-28');
  assert.equal(prevTradingClose(H, ['AAA', 'BBB'], '2026-09-29'), '2026-09-25');
  assert.equal(prevTradingClose(H, ['BBB', 'AAA'], '2026-09-29'), '2026-09-25');
  assert.equal(prevTradingClose(H, ['AAA'], '2026-09-24'), null);
  assert.equal(prevTradingClose(H, [], '2026-09-29'), null);
  assert.equal(prevTradingClose(H, ['ZZZ'], '2026-09-29'), null);
});

test('basketReturn: weighted % return, 4 dp; null on a missing close', () => {
  assert.equal(basketReturn([{ ticker: 'AAA', weight: 1 }], H, '2026-09-24', '2026-09-25'), 10);
  // 0.5 × 21% + 0.5 × (−20%) = 0.5%
  assert.equal(basketReturn([{ ticker: 'AAA', weight: 0.5 }, { ticker: 'BBB', weight: 0.5 }], H, '2026-09-24', '2026-09-29'), 0.5);
  assert.equal(basketReturn([{ ticker: 'AAA', weight: 1 }], H, '2026-09-25', '2026-09-28'), -10);
  assert.equal(basketReturn([{ ticker: 'AAA', weight: 1 / 3 }], H, '2026-09-24', '2026-09-25'), 3.3333);
  assert.equal(basketReturn([{ ticker: 'BBB', weight: 1 }], H, '2026-09-25', '2026-09-28'), null);
  assert.equal(basketReturn([], H, '2026-09-24', '2026-09-25'), null);
});

test('trackedValue: shares and worth methods', () => {
  assert.equal(trackedValue({ method: 'shares', shares: { AAA: 10, BBB: 2 } }, H, '2026-09-25'), 1200);
  assert.equal(trackedValue({ method: 'shares', shares: { AAA: 10, BBB: 2 } }, H, '2026-09-28'), null);
  const w = { method: 'worth', worth: 1e9, ticker: 'AAA', refDate: '2026-09-25', refClose: 110 };
  assert.equal(trackedValue(w, H, '2026-09-25'), 1e9);
  assert.equal(trackedValue(w, H, '2026-09-29'), 1.1e9);
  assert.equal(trackedValue(w, H, '2026-09-26'), null);
  assert.equal(trackedValue({ ...w, refClose: 0 }, H, '2026-09-25'), null);
  assert.equal(trackedValue({ method: 'other' }, H, '2026-09-25'), null);
  assert.equal(trackedValue(null, H, '2026-09-25'), null);
});

test('dollarPool: coverage filter, frozen entries, sorted by slug', () => {
  const est = {
    people: {
      zed: { coverage: 0.9, holdings: [{ ticker: 'AAA', shares: 10 }, { ticker: 'BBB', shares: 5 }] },
      low: { coverage: 0.39, holdings: [{ ticker: 'AAA', shares: 10 }] },
      none: { coverage: null, holdings: [{ ticker: 'AAA', shares: 10 }] },
      edge: { coverage: 0.4, holdings: [{ ticker: 'AAA', shares: 1 }] },
      fam: {
        method: 'worth', coverage: 1, coveredValue: 132e9,
        holdings: [{ ticker: 'WMT', basis: 'worth', refClose: 107.98, refDate: '2026-09-25' }],
      },
      famNoRef: { method: 'worth', coverage: 1, coveredValue: 1e9, holdings: [{ ticker: 'WMT', basis: 'worth', refClose: null, refDate: null }] },
    },
  };
  assert.deepEqual(dollarPool(est), [
    { slug: 'edge', wealth: { method: 'shares', shares: { AAA: 1 } } },
    { slug: 'fam', wealth: { method: 'worth', worth: 132e9, ticker: 'WMT', refDate: '2026-09-25', refClose: 107.98 } },
    { slug: 'zed', wealth: { method: 'shares', shares: { AAA: 10, BBB: 5 } } },
  ]);
  assert.deepEqual(dollarPool(est, 0.95).map((p) => p.slug), ['fam']);
  assert.deepEqual(dollarPool(null), []);
});
