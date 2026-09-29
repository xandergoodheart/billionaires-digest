import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickConcept, quarterSeries, combineQuarters, consecutiveChain, ttmFrom, pctChange, margin,
  sharesOutstanding, currentShares, summarizeCompanyFacts, splitTicker, isUsListing, tickerMap, lookupCik,
  secBrowseUrl, sameContent, periodFacts, NET_INCOME_CONCEPTS, MARGIN_NOTE,
} from './financials.mjs';

const f = (start, end, val, form = '10-Q', filed = end, accn = `a-${end}`) => ({ start, end, val, form, filed, accn });

// Calendar-year company: FY2024, 2025 quarters Q1-Q3 as 10-Q, FY2025 only in the 10-K, Q1 2026.
function calendarCompany() {
  const rev = [
    f('2024-01-01', '2024-03-31', 80), f('2024-04-01', '2024-06-30', 90), f('2024-07-01', '2024-09-30', 100),
    f('2024-01-01', '2024-09-30', 270), f('2024-01-01', '2024-12-31', 380, '10-K', '2025-02-01'),
    f('2025-01-01', '2025-03-31', 100), f('2025-04-01', '2025-06-30', 110), f('2025-07-01', '2025-09-30', 120),
    f('2025-01-01', '2025-09-30', 330), f('2025-01-01', '2025-12-31', 460, '10-K', '2026-02-01'),
    f('2026-01-01', '2026-03-31', 125),
  ];
  const ni = rev.map((x) => ({ ...x, val: x.val / 10 }));
  const eps = [
    f('2025-04-01', '2025-06-30', 0.11), f('2025-07-01', '2025-09-30', 0.12), f('2026-01-01', '2026-03-31', 0.13),
    f('2025-01-01', '2025-12-31', 0.46, '10-K', '2026-02-01'),
  ];
  return {
    entityName: 'Example Corp',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: rev } },
        NetIncomeLoss: { units: { USD: ni } },
        EarningsPerShareDiluted: { units: { 'USD/shares': eps } },
      },
      dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-04-20', val: 1000, accn: 'q1', filed: '2026-04-25', form: '10-Q' }] } } },
    },
  };
}

test('fiscal Q4 is derived as FY minus 9-month YTD, flagged, without EPS', () => {
  const doc = calendarCompany();
  const rev = pickConcept(doc.facts['us-gaap'], ['Revenues'], 'USD');
  const q = quarterSeries(rev.facts);
  const q4 = q.get('2025-10-01|2025-12-31');
  assert.equal(q4.val, 130);
  assert.equal(q4.derived, true);
  assert.equal(q4.form, '10-K');
  const q4prior = q.get('2024-10-01|2024-12-31');
  assert.equal(q4prior.val, 110);

  const docQ4Latest = calendarCompany();
  // Drop Q1 2026 so the latest quarter is the derived Q4.
  for (const c of ['Revenues', 'NetIncomeLoss']) {
    docQ4Latest.facts['us-gaap'][c].units.USD = docQ4Latest.facts['us-gaap'][c].units.USD.filter((x) => x.end !== '2026-03-31');
  }
  const s = summarizeCompanyFacts(docQ4Latest, '0000000123');
  assert.equal(s.quarter.end, '2025-12-31');
  assert.equal(s.quarter.start, '2025-10-01');
  assert.equal(s.quarter.derived, true);
  assert.equal(s.quarter.revenue, 130);
  assert.equal(s.quarter.netIncome, 13);
  assert.equal(s.quarter.epsDiluted, null);
  assert.equal(s.revenueGrowthQ, 18.2); // 130 vs 110
});

test('no derived Q4 when a discrete quarter already covers the year end', () => {
  const m = new Map([
    ['a', f('2025-01-01', '2025-09-30', 300)],
    ['b', f('2025-01-01', '2025-12-31', 400, '10-K')],
    ['c', f('2025-10-01', '2025-12-31', 99, '10-K')],
  ]);
  const q = quarterSeries(m);
  assert.equal(q.size, 1);
  assert.equal(q.get('2025-10-01|2025-12-31').val, 99);
  assert.equal(q.get('2025-10-01|2025-12-31').derived, false);
});

test('TTM sums the four latest consecutive quarters; growth and margins', () => {
  const s = summarizeCompanyFacts(calendarCompany(), '123');
  assert.equal(s.available, true);
  assert.equal(s.quarter.end, '2026-03-31');
  assert.equal(s.quarter.revenue, 125);
  assert.equal(s.quarter.epsDiluted, 0.13);
  // Q2'25 110 + Q3'25 120 + Q4'25 130 (derived) + Q1'26 125
  assert.deepEqual(s.ttm, { start: '2025-04-01', end: '2026-03-31', revenue: 485, netIncome: 48.5, epsDiluted: null });
  assert.equal(s.revenueGrowthQ, 25); // 125 vs 100
  // previous 4: Q2'24 90 + Q3'24 100 + Q4'24 110 + Q1'25 100 = 400
  assert.equal(s.revenueGrowthTTM, 21.3);
  assert.equal(s.netMarginQ, 10);
  assert.equal(s.netMarginTTM, 10);
  assert.equal(s.name, 'Example Corp');
  assert.equal(s.currency, 'USD');
  assert.equal(s.revenueConcept, 'Revenues');
  assert.deepEqual(s.sharesOutstanding, { value: 1000, asOf: '2026-04-20' });
});

test('EPS TTM only when all four quarters have diluted EPS', () => {
  const rows = [
    { start: '2026-01-01', end: '2026-03-31', revenue: 1, netIncome: 1, epsDiluted: 0.1 },
    { start: '2025-10-01', end: '2025-12-31', revenue: 1, netIncome: 1, epsDiluted: 0.2 },
    { start: '2025-07-01', end: '2025-09-30', revenue: 1, netIncome: 1, epsDiluted: 0.3 },
    { start: '2025-04-01', end: '2025-06-30', revenue: 1, netIncome: null, epsDiluted: 0.4 },
  ];
  const t = ttmFrom(consecutiveChain(rows, 4));
  assert.equal(t.epsDiluted, 1);
  assert.equal(t.revenue, 4);
  assert.equal(t.netIncome, null);
  rows[2].epsDiluted = null;
  assert.equal(ttmFrom(consecutiveChain(rows, 4)).epsDiluted, null);
});

test('consecutive chain breaks on a gap and tolerates 52/53-week calendars', () => {
  const gap = [
    { start: '2026-01-01', end: '2026-03-31' },
    { start: '2025-07-01', end: '2025-09-30' },
  ];
  assert.equal(consecutiveChain(gap, 2), null);
  const weeks = [
    { start: '2026-04-27', end: '2026-07-26' },
    { start: '2026-01-26', end: '2026-04-26' },
    { start: '2025-10-27', end: '2026-01-25' },
    { start: '2025-07-28', end: '2025-10-26' },
  ];
  assert.equal(consecutiveChain(weeks, 4).length, 4);
  assert.equal(ttmFrom(null), null);
});

test('growth and margin math with nulls', () => {
  assert.equal(pctChange(110, 100), 10);
  assert.equal(pctChange(90, 120), -25);
  assert.equal(pctChange(1, 3), -66.7);
  assert.equal(pctChange(null, 100), null);
  assert.equal(pctChange(100, null), null);
  assert.equal(pctChange(100, 0), null);
  assert.equal(pctChange(100, -5), null);
  assert.equal(margin(-5, 100), -5);
  assert.equal(margin(1, 3), 33.3);
  assert.equal(margin(null, 100), null);
  assert.equal(margin(5, 0), null);
  assert.equal(margin(5, null), null);
});

test('missing year-ago quarter and short history give null growth and TTM', () => {
  const doc = {
    entityName: 'New Co',
    facts: { 'us-gaap': { Revenues: { units: { USD: [f('2026-04-01', '2026-06-30', 50)] } } } },
  };
  const s = summarizeCompanyFacts(doc, '5');
  assert.equal(s.quarter.revenue, 50);
  assert.equal(s.quarter.netIncome, null);
  assert.equal(s.ttm, null);
  assert.equal(s.revenueGrowthQ, null);
  assert.equal(s.revenueGrowthTTM, null);
  assert.equal(s.netMarginQ, null);
  assert.equal(s.netMarginTTM, null);
  assert.equal(s.sharesOutstanding, null);
});

test('share classes on the same date are summed; stale counts dropped', () => {
  const dei = {
    EntityCommonStockSharesOutstanding: {
      units: {
        shares: [
          { end: '2025-10-20', val: 5, accn: 'old', filed: '2025-10-25' },
          { end: '2026-04-20', val: 700, accn: 'x', filed: '2026-04-25' },
          { end: '2026-04-20', val: 300, accn: 'x', filed: '2026-04-25' },
        ],
      },
    },
  };
  assert.deepEqual(sharesOutstanding(dei), { value: 1000, asOf: '2026-04-20', classes: 2 });
  assert.equal(sharesOutstanding({}), null);
  const one = { value: 10, asOf: '2011-04-29' };
  assert.equal(currentShares(one, { start: '2026-04-01' }), null);
  assert.deepEqual(currentShares({ value: 10, asOf: '2026-07-20' }, { start: '2026-04-01' }), { value: 10, asOf: '2026-07-20' });
});

test('concept fallback: first concept with the latest data wins, gaps filled from others', () => {
  const g = {
    Revenues: { units: { USD: [f('2018-01-01', '2018-03-31', 1)] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [f('2026-01-01', '2026-03-31', 9)] } },
    SalesRevenueNet: { units: { USD: [f('2017-01-01', '2017-03-31', 7)] } },
  };
  const r = pickConcept(g, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'], 'USD');
  assert.equal(r.concept, 'RevenueFromContractWithCustomerExcludingAssessedTax');
  assert.equal(r.facts.size, 3);
  const both = {
    Revenues: { units: { USD: [f('2026-01-01', '2026-03-31', 10)] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [f('2026-01-01', '2026-03-31', 9)] } },
  };
  const b = pickConcept(both, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'], 'USD');
  assert.equal(b.concept, 'Revenues');
  assert.equal(b.facts.get('2026-01-01|2026-03-31').val, 10);
  assert.equal(pickConcept({}, ['Revenues'], 'USD').concept, null);
});

test('only 10-Q/10-K facts are used; amendments only when no original', () => {
  const g = {
    Revenues: {
      units: {
        USD: [
          f('2026-01-01', '2026-03-31', 5, '8-K'),
          f('2026-01-01', '2026-03-31', 6, '10-Q/A', '2026-06-01'),
          f('2025-10-01', '2025-12-31', 7, '10-Q/A'),
          f('2026-01-01', '2026-03-31', 4, '10-Q', '2026-05-01'),
        ],
      },
    },
  };
  const m = periodFacts(g, 'Revenues', 'USD');
  assert.equal(m.get('2026-01-01|2026-03-31').val, 4);
  assert.equal(m.get('2025-10-01|2025-12-31').val, 7);
});

test('unavailable companies', () => {
  assert.equal(summarizeCompanyFacts({ facts: { 'ifrs-full': {} } }, '1').available, false);
  const foreign = summarizeCompanyFacts({ facts: { 'us-gaap': { Revenues: { units: { USD: [f('2025-01-01', '2025-12-31', 1, '20-F')] } } } } }, '1');
  assert.equal(foreign.available, false);
  assert.match(foreign.reason, /20-F/);
});

test('ticker helpers', () => {
  assert.deepEqual(splitTicker('BABA / 9988', 'NYSE / HKEX').map((x) => [x.symbol, x.exchange]), [['BABA', 'NYSE'], ['9988', 'HKEX']]);
  assert.deepEqual(splitTicker('GOOGL / GOOG', 'Nasdaq').map((x) => [x.symbol, x.exchange]), [['GOOGL', 'Nasdaq'], ['GOOG', 'Nasdaq']]);
  assert.deepEqual(splitTicker('KLG (delisted)', 'NYSE (delisted Sept 2025)')[0], { symbol: 'KLG', note: 'delisted', exchange: 'NYSE (delisted Sept 2025)' });
  assert.deepEqual(splitTicker('', 'NYSE'), []);
  assert.equal(isUsListing('Nasdaq (moved from NYSE effective 9 Dec 2025)'), true);
  assert.equal(isUsListing('NYSE / TASE'), true);
  assert.equal(isUsListing('Euronext Paris'), false);
  assert.equal(isUsListing('NYSE (delisted Sept 2025)'), false);
  assert.equal(isUsListing('Nasdaq', 'proposed'), false);
  const map = tickerMap({ 0: { cik_str: 1067983, ticker: 'BRK-B', title: 'BERKSHIRE' } });
  assert.equal(lookupCik(map, 'BRK.B').cik, '0001067983');
  assert.equal(lookupCik(map, 'XYZ'), null);
  assert.equal(secBrowseUrl('0001067983'), 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1067983&type=10-&dateb=&owner=include&count=40');
  assert.equal(sameContent({ generated: 'a', x: 1 }, { generated: 'b', x: 1 }), true);
  assert.equal(sameContent({ generated: 'a', x: 1 }, { generated: 'a', x: 2 }), false);
  assert.equal(sameContent(null, { x: 1 }), false);
});

test('combineQuarters keeps EPS only for discrete quarters', () => {
  const rev = new Map([['2025-10-01|2025-12-31', { ...f('2025-10-01', '2025-12-31', 10, '10-K'), derived: true }]]);
  const eps = new Map([['2025-10-01|2025-12-31', f('2025-10-01', '2025-12-31', 1.5)]]);
  const rows = combineQuarters(rev, new Map(), eps);
  assert.equal(rows[0].epsDiluted, null);
  assert.equal(rows[0].derived, true);
});

test('net income fallback: available-to-common, then ProfitLoss, when NetIncomeLoss is stale', () => {
  const g = {
    Revenues: { units: { USD: [f('2025-04-01', '2025-06-30', 100), f('2026-04-01', '2026-06-30', 120)] } },
    NetIncomeLoss: { units: { USD: [f('2024-01-01', '2024-03-31', 1)] } },
    NetIncomeLossAvailableToCommonStockholdersBasic: { units: { USD: [f('2026-04-01', '2026-06-30', 25)] } },
    ProfitLoss: { units: { USD: [f('2026-04-01', '2026-06-30', 30), f('2025-04-01', '2025-06-30', 20)] } },
  };
  const s = summarizeCompanyFacts({ entityName: 'Fallback Co', facts: { 'us-gaap': g } }, '9');
  assert.equal(s.netIncomeConcept, 'NetIncomeLossAvailableToCommonStockholdersBasic');
  assert.equal(s.quarter.netIncome, 25);
  assert.equal(s.netMarginQ, 20.8);
  assert.equal(s.marginNote, undefined);
  const ni = pickConcept(g, NET_INCOME_CONCEPTS, 'USD');
  assert.equal(ni.facts.get('2025-04-01|2025-06-30').val, 20); // backfilled from ProfitLoss
  assert.equal(ni.facts.get('2024-01-01|2024-03-31').val, 1); // backfilled from the stale first concept
  // ProfitLoss only as last resort
  const onlyProfit = { Revenues: g.Revenues, ProfitLoss: g.ProfitLoss };
  assert.equal(summarizeCompanyFacts({ facts: { 'us-gaap': onlyProfit } }, '9').netIncomeConcept, 'ProfitLoss');
  assert.equal(summarizeCompanyFacts(calendarCompany(), '1').netIncomeConcept, 'NetIncomeLoss');
});

test('margins beyond +/-100% are hidden with a note', () => {
  const quarters = [
    ['2025-07-01', '2025-09-30'], ['2025-10-01', '2025-12-31'], ['2026-01-01', '2026-03-31'], ['2026-04-01', '2026-06-30'],
  ];
  const g = (niVals) => ({
    Revenues: { units: { USD: quarters.map(([a, b]) => f(a, b, 100)) } },
    NetIncomeLoss: { units: { USD: quarters.map(([a, b], i) => f(a, b, niVals[i])) } },
  });
  // Quarter over 100% (and TTM too)
  const hi = summarizeCompanyFacts({ facts: { 'us-gaap': g([150, 150, 150, 176]) } }, '1');
  assert.equal(hi.netMarginQ, null);
  assert.equal(hi.netMarginTTM, null);
  assert.equal(hi.marginNote, MARGIN_NOTE);
  assert.equal(hi.marginNote, 'Net income and revenue use different bases; margin not shown');
  // Quarter below -100%, TTM within range: only the quarter margin is hidden
  const lo = summarizeCompanyFacts({ facts: { 'us-gaap': g([10, 10, 10, -120]) } }, '1');
  assert.equal(lo.netMarginQ, null);
  assert.equal(lo.netMarginTTM, -22.5);
  assert.equal(lo.marginNote, MARGIN_NOTE);
  // Exactly 100% is kept
  const ok = summarizeCompanyFacts({ facts: { 'us-gaap': g([10, 10, 10, 100]) } }, '1');
  assert.equal(ok.netMarginQ, 100);
  assert.equal(ok.marginNote, undefined);
});
