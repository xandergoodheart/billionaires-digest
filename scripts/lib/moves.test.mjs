// node --test scripts/lib/moves.test.mjs
// Next Moves (scripts/lib/moves.mjs): windows, base rates, generation, resolution, the full build. Made-up fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthWindow, quarterTarget, historyWeeks, form4Events, weeklyBaseRate, generateMoves, resolveMove, buildMoves, backtestMoves,
  probToQ, clampProb, niceRound, tidyName, holdingChange, listsComplete, marketPayload, tickerTokens, fmtMoney, KINDS, SKIPPED
} from './moves.mjs';

const NOW = new Date('2026-09-27T16:00:00Z');
const PEOPLE = { alpha: { name: 'Alpha Person' }, beta: { name: 'Beta Person' } };
const tx = (date, code, shares, price) => ({ date, code, shares, price, value: shares * price });
const f4 = (slug, filed, ticker, txs, extra = {}) => ({
  form: '4', filed, personSlug: slug, cik: '0000000123', accession: `${slug}-${filed}-${ticker}`,
  url: `https://www.sec.gov/Archives/x/${slug}/${filed}.xml`, indexUrl: `https://www.sec.gov/Archives/x/${slug}/${filed}-index.htm`,
  form4: { issuer: `${ticker} HOLDINGS INC`, ticker, transactions: txs }, ...extra
});
// alpha sells ACME in 6 of the 12 history weeks; beta buys BETA once; gamma is not in PEOPLE -> ignored
const FILINGS = {
  generated: '2026-09-26T13:00:00Z', windowDays: 90,
  filings: [
    f4('alpha', '2026-07-02', 'ACME', [tx('2026-06-30', 'S', 100, 10)]),
    f4('alpha', '2026-07-15', 'ACME', [tx('2026-07-14', 'S', 100, 10), tx('2026-07-14', 'S', 100, 10)]), // a second identical row is a dup
    f4('alpha', '2026-07-15', 'ACME', [tx('2026-07-14', 'S', 100, 10)], { accession: 'joint-filer' }),     // joint filer: same trade
    f4('alpha', '2026-08-05', 'ACME', [tx('2026-08-04', 'S', 200, 10)]),
    f4('alpha', '2026-08-19', 'ACME', [tx('2026-08-18', 'S', 200, 10)]),
    f4('alpha', '2026-09-02', 'ACME', [tx('2026-09-01', 'S', 300, 10)]),
    f4('alpha', '2026-09-16', 'ACME, ACME.B', [tx('2026-09-15', 'S', 300, 10)]),
    f4('alpha', '2026-09-24', 'OTHR', [tx('2026-09-22', 'P', 1, 1)]),
    f4('beta', '2026-08-12', 'BETA', [tx('2026-08-10', 'P', 1000, 50)]),
    f4('beta', '2026-08-20', 'NONE', [tx('2026-08-19', 'P', 1000, 50)]),                                // unlisted: never a market
    f4('gamma', '2026-08-12', 'GAMA', [tx('2026-08-10', 'S', 5, 5)]),
    { form: '4', filed: '2026-07-07', personSlug: 'beta', url: 'https://www.sec.gov/Archives/x/beta/unread.xml' },   // unreadable
    { form: 'SCHEDULE 13G', filed: '2026-08-01', personSlug: 'alpha' }
  ]
};
const F13 = {
  slug: 'alpha-capital', filer: 'ALPHA CAPITAL LLC', personSlug: 'alpha', cik: '0000999', period: '2026-06-30', prevPeriod: '2026-03-31',
  url: 'https://www.sec.gov/Archives/13f/alpha-q2-index.htm', totalValue: 1e9, listCap: 25, new: 1, exited: 1, increased: 2, decreased: 3,
  top: [
    { name: 'SPDR S&P 500 ETF TR', title: 'TR UNIT', cusip: 'ETF000001', shares: 900, shareType: 'SH', value: 9e8 },
    { name: 'WIDGET CORP', title: 'COM', cusip: 'WID000001', shares: 1000, shareType: 'SH', value: 5e8 },
    { name: 'GADGET INC', title: 'COM', cusip: 'GAD000001', shares: 500, shareType: 'SH', value: 4e8 },
    { name: 'DOODAD CO', title: 'COM', cusip: 'DOO000001', shares: 50, shareType: 'SH', value: 3e8 },
    { name: 'THING LTD', title: 'COM', cusip: 'THI000001', shares: 40, shareType: 'SH', value: 2e8 },
    { name: 'STUFF PLC', title: 'COM', cusip: 'STU000001', shares: 30, shareType: 'SH', value: 1e8 }
  ],
  changes: {
    new: [{ cusip: 'NEW000001', shares: 10 }],
    exited: [{ cusip: 'OLD000001', shares: 0, prevShares: 5 }],
    increased: [{ cusip: 'GAD000001', shares: 500, prevShares: 400 }, { cusip: 'ETF000001', shares: 900, prevShares: 100 }],
    decreased: [{ cusip: 'WID000001', shares: 1000, prevShares: 1200 }, { cusip: 'DOO000001', shares: 50, prevShares: 60 }, { cusip: 'XXX', shares: 1, prevShares: 2 }]
  }
};

test('helpers: odds math, rounding, names, tickers', () => {
  const q = probToQ(0.8);
  assert.ok(Math.abs(1 / (1 + Math.exp((q.q_no - q.q_yes) / 100)) - 0.8) < 1e-9);
  assert.deepEqual(probToQ(0.5), { q_yes: 0, q_no: 0 });
  assert.ok(probToQ(0.2).q_no > 0 && probToQ(0.2).q_yes === 0);
  assert.equal(clampProb(0.999), 0.95); assert.equal(clampProb(0), 0.05);
  assert.equal(niceRound(116.3e6), 100e6); assert.equal(niceRound(260e6), 200e6); assert.equal(niceRound(687e6), 500e6); assert.equal(niceRound(0), 0);
  assert.equal(tidyName('ASPEN AEROGELS INC'), 'Aspen Aerogels Inc');
  assert.equal(tidyName('LENNAR CORP /NEW/'), 'Lennar Corp');
  assert.equal(tidyName('FMR LLC'), 'FMR LLC');
  assert.equal(tidyName('Broadcom Inc.'), 'Broadcom Inc.');
  assert.deepEqual(tickerTokens('LEN, LEN.B'), ['LEN', 'LEN.B']);
  assert.deepEqual(tickerTokens('NONE'), []);
  assert.equal(fmtMoney(1.5e9), '$1.5 billion'); assert.equal(fmtMoney(20e6), '$20 million');
  assert.deepEqual(KINDS, ['insider_sell', 'insider_buy', 'sale_size', 'fund_move']);
  assert.equal(SKIPPED[0].template, 'rank_hold');
});

test('windows: the month and quarter leave at least 14 days of trading', () => {
  assert.deepEqual(monthWindow(NOW), { id: '2026-10', start: '2026-10-01', end: '2026-10-31', label: 'October 2026' });
  assert.equal(monthWindow(new Date('2026-10-05T12:00:00Z')).id, '2026-10');
  assert.equal(monthWindow(new Date('2026-10-20T12:00:00Z')).id, '2026-11');   // 12 days left in October
  assert.equal(monthWindow(new Date('2026-12-25T12:00:00Z')).id, '2027-01');
  assert.deepEqual(quarterTarget(NOW), { id: '2026-q4', end: '2026-12-31', label: 'Q4 2026' });
  assert.equal(quarterTarget(new Date('2026-09-10T12:00:00Z')).id, '2026-q3');
});

test('history weeks: complete Mon-Sun weeks inside the filings window, minus the filing lag', () => {
  const w = historyWeeks(FILINGS);
  assert.equal(w[0].start, '2026-06-29');
  assert.equal(w[w.length - 1].end, '2026-09-20');
  assert.equal(w.length, 12);
  assert.deepEqual(historyWeeks({}), []);
});

test('form4Events: code S/P rows, deduped across joint filers, unreadable Form 4s listed', () => {
  const { events, unread } = form4Events(FILINGS.filings);
  assert.equal(events.filter(e => e.slug === 'alpha' && e.code === 'S' && e.date === '2026-07-14').length, 1);
  assert.deepEqual(unread.map(u => [u.slug, u.filed]), [['beta', '2026-07-07']]);
  const e = events.find(x => x.date === '2026-09-15');
  assert.deepEqual(e.tickers, ['ACME', 'ACME.B']);
  assert.equal(e.value, 3000);
});

test('weekly base rate: hits over known weeks, turned into a window chance; unsure weeks dropped; thin history -> 50%', () => {
  const weeks = historyWeeks(FILINGS);
  const { events, unread } = form4Events(FILINGS.filings);
  const a = weeklyBaseRate({ events, unread, slug: 'alpha', code: 'S', ticker: 'ACME', weeks, days: 31 });
  assert.equal(a.known, 12); assert.equal(a.hit, 6); assert.equal(a.thin, false);   // Jun 30 counts (week of Jun 29)
  assert.equal(a.prob, 0.95);                                                        // 1 - 0.5^(31/7) = 0.95 -> cap
  const b = weeklyBaseRate({ events, unread, slug: 'beta', code: 'P', ticker: 'BETA', weeks, days: 31 });
  assert.equal(b.known, 10);                     // the unread Form 4 (filed Jul 7) could hold a trade from either of 2 weeks
  assert.equal(b.hit, 1);
  assert.ok(Math.abs(b.raw - (1 - Math.pow(9 / 10, 31 / 7))) < 1e-9);
  const thin = weeklyBaseRate({ events, unread, slug: 'beta', code: 'P', ticker: 'BETA', weeks: weeks.slice(0, 5), days: 31 });
  assert.deepEqual([thin.prob, thin.thin], [0.5, true]);
});

test('generateMoves: only profiled people, listed tickers, neutral questions, deterministic', () => {
  const a = generateMoves({ filingsDoc: FILINGS, thirteenF: [F13], people: PEOPLE, now: NOW });
  const b = generateMoves({ filingsDoc: FILINGS, thirteenF: [F13], people: PEOPLE, now: NOW });
  assert.deepEqual(a, b);
  assert.deepEqual(a.map(m => m.slug), [
    'mv-sell-2026-10-alpha-acme', 'mv-size-2026-10-alpha-acme', 'mv-13f-2026-q4-alpha-capital-wid000001', 'mv-buy-2026-10-beta-beta'
  ]);   // alpha's OTHR buy (Sep 22) is after the last complete history week, so no market yet
  assert.ok(!a.some(m => m.person.slug === 'gamma'));
  const sell = a[0];
  assert.equal(sell.question, 'Will Alpha Person report selling ACME stock (Form 4, code S) with a trade date between Oct 1, 2026 and Oct 31, 2026?');
  assert.equal(sell.closes_at, '2026-10-31T20:00:00.000Z');
  assert.equal(sell.startProb, 0.95);
  assert.match(sell.baseRate.text, /In 6 of the last 12 weeks/);
  assert.match(sell.baseRate.text, /points to about 95%\./);            // 95.3% raw: at the cap, so no cap note
  assert.match(sell.rule, /code S/);
  assert.match(sell.source.url, /^https:\/\/www\.sec\.gov\/cgi-bin\/browse-edgar\?action=getcompany&CIK=0000000123&type=4/);
  // sale size: thin history (fewer than 6 complete months) -> 50%, line from the recent pace
  const size = a.find(m => m.kind === 'sale_size');
  assert.equal(size.startProb, 0.5);
  assert.equal(size.params.line, 1e6);                                   // a tiny pace still gets the $1 million floor
  assert.match(size.baseRate.text, /starts at 50%/);
  // 13F: the ETF is skipped for a company stock; base rate = cut 2 of the 6 top holdings (WID, DOO)
  const fund = a.find(m => m.kind === 'fund_move');
  assert.equal(fund.params.cusip, 'WID000001');
  assert.equal(fund.question, "Will Alpha Capital LLC's 13F for the quarter ending Dec 31, 2026 show fewer Widget Corp shares than the 1,000 it reported for Jun 30, 2026?");
  assert.equal(fund.startProb, 0.33);
  assert.equal(fund.closes_at, '2026-12-31T21:00:00.000Z');              // 4 PM New York in winter
  for (const m of a) {
    assert.ok(m.startProb >= 0.05 && m.startProb <= 0.95);
    assert.ok(!/death|health|divorce|lawsuit|indict|family member/i.test(m.question));
  }
});

test('generateMoves skips gracefully with no data', () => {
  assert.deepEqual(generateMoves({ filingsDoc: null, thirteenF: [], people: PEOPLE, now: NOW }), []);
  assert.deepEqual(generateMoves({ filingsDoc: { filings: [] }, people: PEOPLE, now: NOW }), []);
});

const sellMkt = generateMoves({ filingsDoc: FILINGS, thirteenF: [F13], people: PEOPLE, now: NOW });
const bySlug = Object.fromEntries(sellMkt.map(m => [m.slug, m]));

test('resolve insider_sell: waits for the lag, YES with the filing, NO with the EDGAR list, void on unreadable', () => {
  const m = bySlug['mv-sell-2026-10-alpha-acme'];
  const at = iso => new Date(iso);
  // filings not yet fetched 5 days after the window
  assert.equal(resolveMove(m, { filingsDoc: { ...FILINGS, generated: '2026-11-03T12:00:00Z' }, now: at('2026-11-03T13:00:00Z') }), null);
  const later = (filings, gen = '2026-11-06T12:00:00Z') => ({ generated: gen, windowDays: 90, filings });
  const yes = resolveMove(m, { filingsDoc: later([f4('alpha', '2026-10-09', 'ACME', [tx('2026-10-07', 'S', 1234, 20.5)])]), now: at('2026-11-06T13:00:00Z') });
  assert.equal(yes.outcome, 'yes');
  assert.equal(yes.source_url, 'https://www.sec.gov/Archives/x/alpha/2026-10-09-index.htm');
  assert.match(yes.note, /dated Oct 7, 2026 \(1,234 shares at about \$20\.50\)/);
  const no = resolveMove(m, { filingsDoc: later([f4('alpha', '2026-10-09', 'OTHR', [tx('2026-10-07', 'S', 1, 1)])]), now: at('2026-11-06T13:00:00Z') });
  assert.equal(no.outcome, 'no');
  assert.match(no.source_url, /browse-edgar/);
  const unread = resolveMove(m, { filingsDoc: later([{ form: '4', filed: '2026-10-20', personSlug: 'alpha', url: 'https://www.sec.gov/u.xml' }]), now: at('2026-11-06T13:00:00Z') });
  assert.equal(unread.outcome, 'void');
  // never fetched: void after the give-up days
  const gone = resolveMove(m, { filingsDoc: { ...FILINGS }, now: at('2026-11-20T13:00:00Z') });
  assert.equal(gone.outcome, 'void');
});

test('resolve sale_size: total over the line is YES even with an unreadable Form 4; under the line with one is void', () => {
  const m = { ...bySlug['mv-size-2026-10-alpha-acme'] };
  const doc = filings => ({ generated: '2026-11-06T12:00:00Z', windowDays: 90, filings });
  const now = new Date('2026-11-06T13:00:00Z');
  const big = f4('alpha', '2026-10-09', 'ACME', [tx('2026-10-07', 'S', 100000, 20)]);   // $2 million
  const unread = { form: '4', filed: '2026-10-20', personSlug: 'alpha', url: 'https://www.sec.gov/u.xml' };
  assert.equal(resolveMove(m, { filingsDoc: doc([big, unread]), now }).outcome, 'yes');
  const small = f4('alpha', '2026-10-09', 'ACME', [tx('2026-10-07', 'S', 1000, 20)]);
  assert.equal(resolveMove(m, { filingsDoc: doc([small, unread]), now }).outcome, 'void');
  const r = resolveMove(m, { filingsDoc: doc([small]), now });
  assert.equal(r.outcome, 'no');
  assert.match(r.note, /\$20,000 across 1 trade; the line was \$1 million/);
});

test('resolve fund_move: from the target filing (top, change lists, or unchanged when lists are complete); else void', () => {
  const m = bySlug['mv-13f-2026-q4-alpha-capital-wid000001'];
  const now = new Date('2027-02-20T12:00:00Z');
  const next = (patch) => ({ alpha: undefined, 'alpha-capital': { ...F13, period: '2026-12-31', prevPeriod: '2026-09-30', url: 'https://www.sec.gov/13f/q4-index.htm', ...patch } });
  assert.equal(resolveMove(m, { thirteenF: { 'alpha-capital': F13 }, now: new Date('2027-01-20T12:00:00Z') }), null);   // not filed yet
  const cut = resolveMove(m, { thirteenF: next({ top: [{ cusip: 'WID000001', shares: 900 }], changes: {} }), now });
  assert.deepEqual([cut.outcome, cut.source_url], ['yes', 'https://www.sec.gov/13f/q4-index.htm']);
  assert.match(cut.note, /reports 900 Widget Corp shares, against 1,000/);
  assert.equal(resolveMove(m, { thirteenF: next({ top: [], changes: { exited: [{ cusip: 'WID000001', shares: 0 }] } }), now }).outcome, 'yes');
  assert.equal(resolveMove(m, { thirteenF: next({ top: [], changes: { increased: [{ cusip: 'WID000001', shares: 1500 }] } }), now }).outcome, 'no');
  // not in any list, prev period is not the base period -> we cannot know the count
  assert.equal(resolveMove(m, { thirteenF: next({ top: [], changes: {} }), now }).outcome, 'void');
  // skipped a quarter
  assert.equal(resolveMove(m, { thirteenF: next({ period: '2027-03-31' }), now }).outcome, 'void');
  // never arrived
  assert.equal(resolveMove(m, { thirteenF: { 'alpha-capital': F13 }, now: new Date('2027-04-01T12:00:00Z') }).outcome, 'void');
  assert.equal(listsComplete(F13), true);
  assert.equal(holdingChange({ ...F13, decreased: 99 }, 'THI000001').state, 'unknown');
  assert.equal(holdingChange(F13, 'THI000001').state, 'unchanged');
});

test('buildMoves: keeps open markets stable, resolves due ones once, adds new windows, backtest never traded', () => {
  const first = buildMoves({ filingsDoc: FILINGS, thirteenF: [F13], people: PEOPLE, now: NOW });
  assert.equal(first.markets.length, 4);
  assert.ok(first.markets.every(m => m.status === 'open'));
  // a week later with changed history: existing slugs keep their original base rate
  const changed = { ...FILINGS, generated: '2026-10-03T13:00:00Z', filings: FILINGS.filings.slice(0, 3) };
  const second = buildMoves({ filingsDoc: changed, thirteenF: [F13], people: PEOPLE, now: new Date('2026-10-03T16:00:00Z'), prevMarkets: first.markets });
  const s1 = first.markets.find(m => m.slug === 'mv-sell-2026-10-alpha-acme'), s2 = second.markets.find(m => m.slug === 'mv-sell-2026-10-alpha-acme');
  assert.deepEqual(s2.baseRate, s1.baseRate);
  assert.equal(s2.opens_at, s1.opens_at);
  // after October: the Form 4 markets resolve; November markets appear
  const nov = { generated: '2026-11-06T12:00:00Z', windowDays: 90, filings: [...FILINGS.filings, f4('alpha', '2026-10-09', 'ACME', [tx('2026-10-07', 'S', 10, 10)])] };
  const third = buildMoves({ filingsDoc: nov, thirteenF: [F13], people: PEOPLE, now: new Date('2026-11-06T16:00:00Z'), prevMarkets: first.markets });
  const r = third.resolved.find(x => x.slug === 'mv-sell-2026-10-alpha-acme');
  assert.equal(r.outcome, 'yes');
  assert.equal(r.backtest, false);
  assert.ok(!third.markets.some(m => m.slug === 'mv-sell-2026-10-alpha-acme'));
  assert.ok(third.markets.some(m => m.slug === 'mv-13f-2026-q4-alpha-capital-wid000001' && m.status === 'open'));
  assert.ok(third.markets.some(m => /^mv-sell-2026-11-alpha-acme$/.test(m.slug)));
  // running again with the output as input changes nothing
  const again = buildMoves({ filingsDoc: nov, thirteenF: [F13], people: PEOPLE, now: new Date('2026-11-06T16:00:00Z'), prevMarkets: third.markets, prevResolved: third.resolved });
  assert.deepEqual(again.resolved, third.resolved);
  assert.deepEqual(again.markets.map(m => m.slug), third.markets.map(m => m.slug));
  // backtest: complete past months inside the window, each with a source
  const bt = backtestMoves({ filingsDoc: FILINGS, people: PEOPLE, now: NOW });
  assert.deepEqual([...new Set(bt.map(x => x.window))], ['2026-08', '2026-07']);
  const aug = bt.find(x => x.slug === 'bt-sell-2026-08-alpha-acme');
  assert.equal(aug.outcome, 'yes');
  assert.ok(bt.every(x => x.backtest === true && /^https:\/\//.test(x.source_url)));
  assert.equal(bt.find(x => x.slug === 'bt-buy-2026-07-beta-beta').outcome, 'void');   // the unreadable Form 4 in July
});

test('marketPayload: what create_market takes', () => {
  const m = bySlug['mv-sell-2026-10-alpha-acme'];
  const p = marketPayload(m);
  assert.deepEqual(Object.keys(p).sort(), ['b', 'closes_at', 'kind', 'opens_at', 'params', 'question', 'resolves_by', 'slug']);
  assert.equal(p.params.startProb, 0.95);
  assert.equal(p.kind, 'insider_sell');
});
