// node --test scripts/lib/
// v3 player dossier helpers (assets/v2/dossier-core.js, an ES5 browser file) loaded into a node:vm context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'assets', 'v2', 'dossier-core.js'), 'utf8');
function load() {
  const ctx = vm.createContext({});
  vm.runInContext(SRC, ctx, { filename: 'dossier-core.js' });
  return ctx.BDDossierCore;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const K = load();

test('roleSince: the 4-digit year after "since", or null', () => {
  assert.equal(K.roleSince('Co-founder, President and CEO (since 1993)'), 1993);
  assert.equal(K.roleSince('Chairman since May 2004'), 2004);
  assert.equal(K.roleSince('CEO since Jan. 5, 2021'), 2021);
  assert.equal(K.roleSince('Founder and CEO'), null);
  assert.equal(K.roleSince('Owns 1993 shares'), null);
  assert.equal(K.roleSince(null), null);
});

test('primaryHolding: heaviest "controls" holding first, else the heaviest one', () => {
  const p = { holdings: [
    { ticker: 'SPCX', name: 'SpaceX', weight: 0.78, tier: 'controls' },
    { ticker: 'TSLA', name: 'Tesla', weight: 0.22, tier: 'controls' },
    { ticker: 'BIG', name: 'Big', weight: 0.9, tier: 'stakes' }
  ] };
  assert.deepEqual(plain(K.primaryHolding(p)), { ticker: 'SPCX', name: 'SpaceX' });
  assert.deepEqual(plain(K.primaryHolding({ holdings: [{ ticker: 'A', weight: 0.2 }, { ticker: 'B', weight: 0.8 }] })), { ticker: 'B', name: null });
  assert.equal(K.primaryHolding({ holdings: [] }), null);
  assert.equal(K.primaryHolding(null), null);
});

test('marketCap: shares × price, only for positive numbers', () => {
  assert.equal(K.marketCap(24300000000, 230.23), 24300000000 * 230.23);
  assert.equal(K.marketCap(null, 10), null);
  assert.equal(K.marketCap(100, 0), null);
  assert.equal(K.marketCap('5', 10), null);
});

const W39 = { week: '2026-W39', practice: true, days: ['2026-09-24'], daily: { '2026-09-24': { a: 500, b: 1 } } };
const W40 = { week: '2026-W40', practice: false, captainMultiplier: 1.5, days: ['2026-09-28', '2026-09-29'],
  daily: { '2026-09-28': { a: 10, b: -5, c: 30 }, '2026-09-29': { a: 5, b: 15 } } };
const W41 = { week: '2026-W41', practice: false, days: ['2026-10-05'], daily: { '2026-10-05': { a: -3, c: 1 } } };

test('seasonTotals: sums real weeks only, each week once', () => {
  const t = plain(K.seasonTotals([W39, W40, W41, W40, null]));
  assert.deepEqual(t, { a: { total: 12, days: 3 }, b: { total: 10, days: 2 }, c: { total: 31, days: 2 } });
  assert.deepEqual(plain(K.seasonTotals([])), {});
});

test('seasonRank: rank among the pool, ties share a rank, missing totals do not count', () => {
  const t = K.seasonTotals([W40, W41]);
  assert.deepEqual(plain(K.seasonRank(t, ['a', 'b', 'c', 'd'], 'c')), { rank: 1, of: 3 });
  assert.deepEqual(plain(K.seasonRank(t, ['a', 'b', 'c', 'd'], 'a')), { rank: 2, of: 3 });
  assert.deepEqual(plain(K.seasonRank(t, ['a', 'b', 'c', 'd'], 'b')), { rank: 3, of: 3 });
  const tie = { a: { total: 5 }, b: { total: 5 }, c: { total: 1 } };
  assert.deepEqual(plain(K.seasonRank(tie, ['a', 'b', 'c'], 'b')), { rank: 1, of: 3 });
  assert.deepEqual(plain(K.seasonRank(tie, ['a', 'b', 'c'], 'c')), { rank: 3, of: 3 });
  assert.equal(K.seasonRank(t, ['a'], 'zzz'), null);
});

test('weekLog: day rows from the week and day files, captain rounded each day', () => {
  const days = {
    '2026-09-28': { rules: { pricePoints: 'round(portfolio return % × 100)', insiderBuy: 25, perStory: 10 },
      people: { a: { returnPct: -0.05, pricePoints: -5, points: 10, bonuses: { insiderBuy: 0, stories: 15 } } } },
    '2026-09-29': { people: { a: { returnPct: 0.05, pricePoints: 5, points: 5, bonuses: { insiderBuy: 0, stories: 0 } } } }
  };
  const lg = plain(K.weekLog(W40, days, 'a'));
  assert.equal(lg.n, 2);
  assert.equal(lg.mult, 1.5);
  assert.deepEqual(lg.rows.map((r) => [r.date, r.points, r.captain]), [['2026-09-28', 10, 15], ['2026-09-29', 5, 8]]);
  assert.equal(lg.points, 15);
  assert.equal(lg.captain, 23);
  assert.equal(lg.pricePoints, 0);
  assert.equal(lg.bonuses, 15);
  assert.ok(Math.abs(lg.returnSum) < 1e-12);
  assert.equal(lg.rules.insiderBuy, 25);
  // day file missing: points from the week file, no breakdown; captain uses Math.round like BDFantasyCore.captainPoints
  const lg2 = plain(K.weekLog(W40, {}, 'b', 1.5));
  assert.deepEqual(lg2.rows.map((r) => [r.points, r.captain, r.returnPct]), [[-5, -7, null], [15, 23, null]]);
  assert.equal(lg2.returnSum, null);
  assert.equal(lg2.pricePoints, null);
  assert.equal(K.weekLog(W40, {}, 'nobody', 1.5), null);
  assert.equal(K.weekLog(null, {}, 'a', 1.5), null);
});

test('rulesText: only what the rules say', () => {
  assert.equal(K.rulesText({ pricePoints: 'round(portfolio return % × 100)', insiderBuy: 25, perStory: 10 }),
    'Price points = round(portfolio return % × 100). Insider buy (Form 4 open-market purchase): +25. Each Digest story about them: +10.');
  assert.equal(K.rulesText({ perStory: 10 }), 'Each Digest story about them: +10.');
  assert.equal(K.rulesText(null), '');
});

test('nickname: several file shapes, blank or missing -> null', () => {
  assert.equal(K.nickname({ nicknames: { a: 'The Rocket' } }, 'a'), 'The Rocket');
  assert.equal(K.nickname({ nicknames: { a: { nickname: 'The Rocket' } } }, 'a'), 'The Rocket');
  assert.equal(K.nickname({ people: [{ slug: 'a', nickname: 'X' }] }, 'a'), 'X');
  assert.equal(K.nickname({ a: 'Plain' }, 'a'), 'Plain');
  assert.equal(K.nickname({ nicknames: { a: '  ' } }, 'a'), null);
  assert.equal(K.nickname(null, 'a'), null);
  assert.equal(K.nickname({ nicknames: {} }, 'a'), null);
});

test('financials: reads a ticker entry (build-financials shape); margin derived only when the file has none', () => {
  const file = { generated: '2026-09-29T18:46:30.173Z', source: 'SEC XBRL company facts', tickers: {
    NVDA: {
      available: true, name: 'NVIDIA CORP', secUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1045810',
      quarter: { start: '2026-04-27', end: '2026-07-26', form: '10-Q', filed: '2026-08-26', revenue: 96221000000, netIncome: 59688000000, epsDiluted: 2.46 },
      ttm: { start: '2025-07-28', end: '2026-07-26', revenue: 302969000000, netIncome: 192879000000, epsDiluted: null },
      revenueGrowthQ: 105.9, revenueGrowthTTM: 83.4, netMarginQ: 62, netMarginTTM: null,
      sharesOutstanding: { value: 24100000000, asOf: '2026-08-21' }
    },
    '1038': { available: false, reason: 'Not a US listing; no SEC 10-Q/10-K data.' },
    BAD: { available: true, secUrl: 'javascript:alert(1)', quarter: null, ttm: null }
  } };
  const f = plain(K.financials(file, 'NVDA'));
  assert.equal(f.name, 'NVIDIA CORP');
  assert.deepEqual(f.shares, { value: 24100000000, asOf: '2026-08-21' });
  assert.equal(f.asOf, '2026-09-29T18:46:30.173Z');
  assert.deepEqual([f.quarter.form, f.quarter.filed, f.quarter.eps, f.quarter.growth, f.quarter.margin], ['10-Q', '2026-08-26', 2.46, 105.9, 62]);
  assert.equal(f.ttm.eps, null);
  assert.equal(f.ttm.growth, 83.4);
  assert.ok(Math.abs(f.ttm.margin - (192879000000 / 302969000000 * 100)) < 1e-9);
  assert.equal(K.financials(file, '1038'), null);
  assert.equal(K.financials(file, 'TSLA'), null);
  assert.equal(K.financials(null, 'NVDA'), null);
  const bad = plain(K.financials(file, 'BAD'));
  assert.equal(bad.secUrl, null);
  assert.equal(bad.quarter, null);
});

test('formatting: money, EPS and percents with a true minus sign', () => {
  assert.equal(K.money(4.6e10), '$46.0B');
  assert.equal(K.money(1.6e11), '$160B');
  assert.equal(K.money(5.59e12), '$5.59T');
  assert.equal(K.money(-2.5e8), '−$250M');
  assert.equal(K.money(null), '—');
  assert.equal(K.eps(-0.4), '−$0.40');
  assert.equal(K.pct(12.345, 1), '+12.3%');
  assert.equal(K.pct(-0.004, 2), '0.00%');
  assert.equal(K.plainPct(-3.21, 1), '−3.2%');
  assert.equal(K.signed(-150), '−150');
  assert.equal(K.signed(0), '0');
  assert.equal(K.signed(null), '—');
});
