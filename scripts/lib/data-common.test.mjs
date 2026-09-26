// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorth, addCoverage, MIN_COVERAGE, parseShareCount, estimateAll, methodText, METHOD, OVERRIDES_METHOD } from './data-common.mjs';

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

test('parseShareCount: "shares" form still wins', () => {
  assert.deepEqual(parseShareCount('19.9% (699,580,882 shares beneficially owned)'), { shares: 699580882, text: '699,580,882 shares' });
  assert.deepEqual(parseShareCount('1,162 Class B shares (<0.01%)'), { shares: 1162, text: '1,162 Class B shares' });
});

test('parseShareCount: Class fallback when "shares" is missing', () => {
  const r = parseShareCount('188,290 Class A + 1,162 Class B = 38.2% of Class A, 29.7% of aggregate voting power');
  assert.deepEqual(r, { shares: 188290, text: '188,290 Class A' });
  assert.deepEqual(parseShareCount('188,290 Class A +'), { shares: 188290, text: '188,290 Class A' });
  assert.equal(parseShareCount('Class A 38.2%'), null);
  assert.equal(parseShareCount('~188,290 Class A'), null); // approximate
  assert.equal(parseShareCount('188290 Class A'), null); // not comma-grouped
  assert.equal(parseShareCount('1.5 Class A'), null);
});

test('parseShareCount: exited/historical/former guard applies to the fallback', () => {
  assert.equal(parseShareCount('exited: 188,290 Class A'), null);
  assert.equal(parseShareCount('historical 188,290 Class B'), null);
  assert.equal(parseShareCount('former holder of 12,000 Class A'), null);
});

const SEC = 'https://www.sec.gov/Archives/edgar/data/1/x.xml';
const wmtProfile = (slug, shares) => ({
  slug,
  controls: [{ ticker: 'WMT', exchange: 'Nasdaq', stake: '50.74% combined family vehicles', source: SEC }],
  stakes: [{ ticker: 'WMT', exchange: 'Nasdaq', stake: `${shares} shares (0.1%)`, source: SEC },
    { ticker: 'AAPL', exchange: 'Nasdaq', stake: '1,000 shares', source: SEC }],
});
const QUOTES = {
  WMT: { price: 108, change: 0.4, changePct: 0.5, time: '2026-09-25T20:00:00.000Z' },
  AAPL: { price: 300, change: 3, changePct: 1, time: '2026-09-25T20:00:00.000Z' },
};
const OV = { 'fam-a': { basis: 'worth', ticker: 'WMT', shareText: 'net worth × Walmart price move', note: 'n', source: 'https://example.test/13d' } };

test('estimateAll overrides: worth-basis holding replaces parsed rows', () => {
  const profiles = [wmtProfile('fam-a', '7,029,557'), wmtProfile('other', '1,000')];
  const { people } = estimateAll(profiles, QUOTES, new Set(), { 'fam-a': 132e9, other: 1e6 }, OV);
  const a = people['fam-a'];
  assert.equal(a.method, 'worth');
  assert.equal(a.partial, true);
  assert.equal(a.coverage, 1);
  assert.equal(a.coveredValue, 132e9);
  assert.equal(a.estDailyChange, Math.round(132e9 * 0.5 / 100));
  assert.equal(a.holdings.length, 1);
  assert.deepEqual(a.holdings[0], {
    ticker: 'WMT', basis: 'worth', change: 0.4, changePct: 0.5, estChange: 660000000,
    shareText: 'net worth × Walmart price move', source: 'https://example.test/13d', refClose: 108, refDate: '2026-09-25',
  });
  // non-override people keep the share-count method
  assert.equal(people.other.method, undefined);
  assert.deepEqual(people.other.holdings.map((h) => h.ticker).sort(), ['AAPL', 'WMT']);
});

test('estimateAll overrides: missing worth or % change -> no estimate; no overrides -> unchanged', () => {
  const profiles = [wmtProfile('fam-a', '7,029,557')];
  assert.equal(estimateAll(profiles, QUOTES, new Set(), {}, OV).people['fam-a'], undefined);
  const noPct = { ...QUOTES, WMT: { price: 108, change: 0.4 } };
  assert.equal(estimateAll(profiles, noPct, new Set(), { 'fam-a': 1e9 }, OV).people['fam-a'], undefined);
  const plain = estimateAll(profiles, QUOTES, new Set(), { 'fam-a': 1e9 }).people['fam-a'];
  assert.equal(plain.method, undefined);
  assert.equal(plain.holdings.find((h) => h.ticker === 'WMT').shares, 7029557);
});

test('estimateAll overrides: override person does not create shared-holding exclusions', () => {
  const profiles = [wmtProfile('fam-a', '5,000'), wmtProfile('other', '5,000')];
  const r = estimateAll(profiles, QUOTES, new Set(), { 'fam-a': 1e9, other: 1e9 }, OV);
  assert.equal(r.excluded.length, 0);
  assert.equal(r.people.other.holdings.find((h) => h.ticker === 'WMT').shares, 5000);
});

test('addCoverage: worth-basis entry keeps coverage 1', () => {
  const people = { x: { method: 'worth', estDailyChange: 5, holdings: [{ ticker: 'WMT', basis: 'worth', estChange: 5 }] } };
  addCoverage(people, {}, { x: 2e9 });
  assert.equal(people.x.coveredValue, 2e9);
  assert.equal(people.x.coverage, 1);
  addCoverage(people, {}, {});
  assert.equal(people.x.coverage, null);
});

test('methodText mentions overrides only when present', () => {
  assert.equal(methodText({}), METHOD);
  assert.equal(methodText(null), METHOD);
  assert.equal(methodText(OV), `${METHOD} ${OVERRIDES_METHOD}`);
});
