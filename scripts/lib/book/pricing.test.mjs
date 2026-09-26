// node --test 'scripts/lib/book/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundAmerican, probToAmerican, americanToDecimal, decimalToAmerican, americanToProb, priceTwoWay, priceMultiWay, overround,
  normCdf, normInv, seedFrom, mulberry32, realizedVol, blendedVol, personModel, correlation, correlationFactor, pickMatchups,
  ladderLines, probOver, simulateBoard, buildBook, pBuyDays, SECTOR_VOL, CORR, VIG_TWO_WAY
} from './pricing.mjs';

const person = (slug, sector, holdings, extra = {}) => ({ slug, name: slug.toUpperCase(), sector, holdings, ...extra });

test('normal helpers: cdf/inverse agree', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normCdf(1.959964) - 0.975) < 1e-6);
  for (const p of [0.001, 0.02, 0.2, 0.5, 0.65, 0.99]) assert.ok(Math.abs(normCdf(normInv(p)) - p) < 1e-6, `p=${p}`);
});

test('American <-> decimal conversions and rounding', () => {
  assert.equal(americanToDecimal(-110), 1.9091);
  assert.equal(americanToDecimal(250), 3.5);
  assert.equal(americanToDecimal(100), 2);
  assert.equal(americanToDecimal(-200), 1.5);
  assert.equal(decimalToAmerican(3.5), 250);
  assert.equal(decimalToAmerican(1.9091), -110);
  assert.equal(decimalToAmerican(2), 100);
  for (const a of [-2780, -465, -110, 100, 105, 250, 1150, 5100, 49900]) assert.equal(roundAmerican(decimalToAmerican(americanToDecimal(a))), a);
  assert.throws(() => americanToDecimal(50));
  // rounding: nearest 5, 25 above +1000, 100 above +5000, never inside (-100, +100)
  assert.equal(roundAmerican(-109.4), -110);
  assert.equal(roundAmerican(252.4), 250);
  assert.equal(roundAmerican(1012), 1000);
  assert.equal(roundAmerican(1013), 1025);
  assert.equal(roundAmerican(1137), 1125);
  assert.equal(roundAmerican(5049), 5000);
  assert.equal(roundAmerican(5051), 5100);
  assert.equal(roundAmerican(49930), 49900);
  assert.equal(roundAmerican(-99), 100);
  assert.equal(roundAmerican(-101), 100);   // rounds to -100 -> shown as even money
  assert.equal(roundAmerican(98), 100);
  assert.equal(probToAmerican(0.5), 100);
  assert.equal(probToAmerican(0.5225), -110);
  assert.equal(probToAmerican(0.2), 400);
  assert.ok(Math.abs(americanToProb(-110) - 110 / 210) < 1e-12);
});

test('two-way: -110/-110 at 50/50, symmetric, vig ~104.5%, clamped', () => {
  const [a, b] = priceTwoWay(0.5);
  assert.equal(a.americanOdds, -110); assert.equal(b.americanOdds, -110);
  assert.equal(a.fairProb, 0.5);
  for (const p of [0.05, 0.2, 0.37, 0.5, 0.61, 0.9]) {
    const [x, y] = priceTwoWay(p), [y2, x2] = priceTwoWay(1 - p);
    assert.deepEqual(x, x2, `symmetry at ${p}`); assert.deepEqual(y, y2);
    assert.ok(x.fairProb + y.fairProb > 0.9999 && x.fairProb + y.fairProb < 1.0001);
    const total = overround([x, y]);
    assert.ok(Math.abs(total - VIG_TWO_WAY) < 0.02, `book ${total} at ${p}`);  // rounding moves it a little
  }
  // clamped: a near-certain side never goes past 0.98 (about -4900), the other never under 0.02 (+4900)
  const [hi, lo] = priceTwoWay(0.9999);
  assert.equal(hi.americanOdds, -4900);
  assert.equal(lo.americanOdds, 4900);
  const [z1, z2] = priceTwoWay(0);
  assert.equal(z1.americanOdds, 4900); assert.equal(z2.americanOdds, -4900);
});

test('many-way: 120% overround, clamped to [0.002, 0.9]', () => {
  const q = priceMultiWay([0.5, 0.3, 0.2]);
  const t = overround(q);
  assert.ok(Math.abs(t - 1.2) < 0.02, `book ${t}`);
  assert.deepEqual(q.map(x => x.fairProb), [0.5, 0.3, 0.2]);
  const c = priceMultiWay([0.999, 0.001, 0]);
  assert.equal(c[0].americanOdds, probToAmerican(0.9));
  assert.equal(c[2].americanOdds, probToAmerican(0.002));   // +49900
  assert.equal(c[2].americanOdds, 49900);
});

test('RNG and Monte Carlo are deterministic', () => {
  assert.equal(seedFrom('2026-W40'), seedFrom('2026-W40'));
  assert.notEqual(seedFrom('2026-W40'), seedFrom('2026-W41'));
  const r1 = mulberry32(7), r2 = mulberry32(7);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
  const models = ['a', 'b', 'c', 'd'].map((s, i) => personModel(person(s, i < 2 ? 'Finance' : 'Energy', [{ ticker: s.toUpperCase(), weight: 1 }]), { asOf: '2026-09-27', buyDays: i * 3 }));
  const sec = { Finance: ['a', 'b'], Energy: ['c', 'd'] };
  const x = simulateBoard(models, sec, { seed: '2026-W40', n: 4000 });
  const y = simulateBoard(models, sec, { seed: '2026-W40', n: 4000 });
  assert.deepEqual(x, y);
  const z = simulateBoard(models, sec, { seed: '2026-W41', n: 4000 });
  assert.notDeepEqual(x, z);
  const s = Object.values(x.top).reduce((p, v) => p + v, 0);
  assert.ok(Math.abs(s - 1) < 1e-9);
  // higher vol (Energy 1.8 vs Finance 1.3) and higher mean -> more likely to top the week
  assert.ok(x.top.d > x.top.a);
});

test('Monte Carlo: people who always score the same share the top-scorer chance equally', () => {
  const clone = s => personModel(person(s, 'Luxury & retail', [{ ticker: 'WMT', weight: 1 }]), { asOf: '2026-09-27' });
  const other = personModel(person('zed', 'Finance', [{ ticker: 'BAC', weight: 1 }]), { asOf: '2026-09-27' });
  const x = simulateBoard([clone('alice'), clone('jim'), clone('rob'), other], {}, { seed: 'W', n: 4000 });
  assert.ok(Math.abs(x.top.alice - x.top.jim) < 1e-12 && Math.abs(x.top.jim - x.top.rob) < 1e-12);
  assert.ok(Math.abs(Object.values(x.top).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('volatility: sector default, realized blend 15 -> 60 closes', () => {
  const mk = n => { const rows = []; let c = 100; for (let i = 0; i < n; i++) { c *= i % 2 ? 1.03 : 0.97; rows.push([`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, c]); } return rows; };
  const h = [{ ticker: 'X', weight: 1 }];
  assert.deepEqual(blendedVol('Finance', realizedVol(h, { X: mk(10) }, '2026-12-31')).vol, SECTOR_VOL.Finance);
  const r15 = realizedVol(h, { X: mk(15) }, '2026-12-31');
  assert.equal(r15.closes, 15);
  assert.equal(blendedVol('Finance', r15).vol, SECTOR_VOL.Finance);            // weight 0 at 15
  const r60 = realizedVol(h, { X: mk(80) }, '2026-12-31');
  assert.equal(r60.closes, 61);                                               // last 60 returns
  const b60 = blendedVol('Finance', r60);
  assert.equal(b60.weight, 1);
  assert.ok(Math.abs(b60.vol - r60.vol) < 1e-12 && r60.vol > 2.5);           // ~3% daily moves
  const r37 = realizedVol(h, { X: mk(37) }, '2026-12-31');
  const b37 = blendedVol('Finance', r37);
  assert.ok(Math.abs(b37.weight - (37 - 15) / 45) < 1e-12);
  // unknown sector -> 1.8; missing history for a big holding -> default
  assert.equal(blendedVol('Space pirates', null).vol, 1.8);
  assert.equal(realizedVol([{ ticker: 'X', weight: 0.5 }, { ticker: 'Y', weight: 0.5 }], { X: mk(80) }, '2026-12-31').vol, null);
  // model: sigma = 100 x vol; mu = stories + P-buy days
  const m = personModel(person('p', 'AI & tech', h), { history: {}, storyCount: 4, buyDays: 9, asOf: '2026-09-27' });
  assert.equal(m.sigma, 220);
  assert.ok(Math.abs(m.mu - (10 * 4 / 20 + 25 * 9 / 63)) < 1e-12);
});

test('correlation: shared main holding 1.0 (excluded from head-to-heads), sector 0.6, else 0.3', () => {
  const w1 = person('rob', 'Luxury & retail', [{ ticker: 'WMT', weight: 1 }]);
  const w2 = person('jim', 'Luxury & retail', [{ ticker: 'WMT', weight: 1 }]);
  const lux = person('lux', 'Luxury & retail', [{ ticker: 'LVMUY', weight: 1 }]);
  const small = person('small', 'Finance', [{ ticker: 'WMT', weight: 0.3 }, { ticker: 'BAC', weight: 0.7 }]);
  const half = person('half', 'Finance', [{ ticker: 'WMT', weight: 0.5 }, { ticker: 'BAC', weight: 0.5 }]);
  assert.equal(correlation(w1, w2), CORR.shared);
  assert.equal(correlation(w1, lux), CORR.sector);
  assert.equal(correlation(w1, small), CORR.other);
  assert.equal(correlation(w1, half), CORR.shared);
  const models = [w1, w2, lux, small, half].map(p => personModel(p, { asOf: '2026-09-27' }));
  const sal = { rob: 30, jim: 29, lux: 28, small: 27, half: 26 };
  const pairs = pickMatchups(models, sal, 8).map(([a, b]) => `${a.slug}-${b.slug}`);
  assert.deepEqual(pairs, ['rob-lux', 'jim-small']);   // rob~jim and jim~half skipped
  // the repaired factor gives a valid correlation matrix with unit diagonal
  const R = [[1, 1, 0.6], [1, 1, 1], [0.6, 1, 1]];                      // not positive semi-definite
  const F = correlationFactor(R);
  for (const row of F) assert.ok(Math.abs(row.reduce((s, x) => s + x * x, 0) - 1) < 1e-9);
});

test('alt lines: increasing; higher O line -> longer odds, U shorter', () => {
  const m = personModel(person('x', 'AI & tech', []), { asOf: '2026-09-27', storyCount: 2 });
  const lines = ladderLines(m);
  assert.equal(lines.length, 5);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i] > lines[i - 1]);
  for (const L of lines) assert.equal(L - Math.floor(L), 0.5);
  const quotes = lines.map(L => priceTwoWay(probOver(m, L)));
  for (let i = 1; i < quotes.length; i++) {
    assert.ok(quotes[i][0].decimalOdds > quotes[i - 1][0].decimalOdds, 'over gets longer');
    assert.ok(quotes[i][1].decimalOdds < quotes[i - 1][1].decimalOdds, 'under gets shorter');
  }
  // the middle line is the median: -110 both ways
  assert.equal(quotes[2][0].americanOdds, -110);
});

test('pBuyDays counts distinct code-P days in the window', () => {
  const P = (s, d) => ({ form: '4', personSlug: s, filed: d, form4: { summary: [{ code: 'P' }] } });
  const f = [P('a', '2026-09-01'), P('a', '2026-09-01'), P('a', '2026-09-02'), P('a', '2026-05-01'),
    { form: '4', personSlug: 'b', filed: '2026-09-03', form4: { summary: [{ code: 'S' }] } }, { form: '144', personSlug: 'c', filed: '2026-09-03', form4: { summary: [{ code: 'P' }] } }];
  assert.deepEqual(pBuyDays(f, '2026-06-30', '2026-09-27'), { a: 2 });
});

test('buildBook: shape, matchups exclude shared-holding pairs, deterministic', () => {
  const secs = ['AI & tech', 'AI & tech', 'AI & tech', 'Finance', 'Finance', 'Finance', 'Energy', 'Luxury & retail', 'Luxury & retail', 'Luxury & retail'];
  const draftable = secs.map((s, i) => ({ slug: `p${String(i).padStart(2, '0')}`, name: `Person ${i} & family`, sector: s,
    holdings: [{ ticker: i >= 7 ? 'WMT' : `T${i}`, weight: 1 }] }));
  const salaries = Object.fromEntries(draftable.map((p, i) => [p.slug, 30 - i]));
  const week = { week: '2026-W40', start: '2026-09-28', end: '2026-10-02', locksAt: '2026-09-28T13:30:00.000Z', salaries, draftable };
  const filings = [{ form: '4', personSlug: 'p03', filed: '2026-09-10', form4: { summary: [{ code: 'P' }] } }];
  const editions = [{ date: '2026-09-24', stories: [{ who: 'Person 1', people: [] }] }, { date: '2026-09-29', stories: [{ who: 'Person 2' }] }];
  const args = { week, filings, editions, storyMatches: (s, n) => String(s.who).includes(n), generated: '2026-09-25T00:00:00.000Z', n: 3000 };
  const a = buildBook(args), b = buildBook(args);
  assert.deepEqual(a, b);
  assert.equal(a.locksAt, week.locksAt);
  const types = a.events.map(e => e.type);
  assert.equal(types.filter(t => t === 'h2h').length, 4);   // 10 people, the 3 WMT holders can't face each other: p07-p08-p09 leave 1 out
  assert.equal(types.filter(t => t === 'player_ou').length, 10);
  assert.equal(types.filter(t => t === 'futures_top').length, 1);
  assert.deepEqual(a.events.filter(e => e.type === 'prop_insider').map(e => e.params.slug), ['p03']);
  assert.deepEqual(Object.keys(a.events.find(e => e.type === 'prop_sector').params.members), ['AI & tech', 'Finance', 'Luxury & retail']);
  for (const e of a.events.filter(x => x.type === 'h2h')) {
    const [x, y] = [e.params.a, e.params.b].map(s => Number(s.slice(1)));
    assert.ok(!(x >= 7 && y >= 7), `WMT pair ${e.title}`);
    assert.deepEqual(e.selections.map(s => s.market), ['ml', 'ml', 'spread', 'spread']);
    const sp = e.selections.filter(s => s.market === 'spread');
    assert.equal(sp[0].line, -sp[1].line);
    assert.equal(Math.abs(sp[0].line) % 1, 0.5);
  }
  assert.equal(a.model.p01.stories, 1);                       // the 09-29 edition is after the week starts: not counted
  assert.equal(a.model.p02.stories, 0);
  assert.equal(a.events[0].title.includes('& family'), false);
  // every selection id is unique and carries consistent odds
  const ids = new Set();
  for (const e of a.events) for (const s of e.selections) {
    assert.ok(!ids.has(s.id)); ids.add(s.id);
    assert.equal(s.decimalOdds, americanToDecimal(s.americanOdds));
    assert.ok(s.id.startsWith(e.id + ':'));
  }
});

// ---------- price markets ----------
import { prevWeekday, weekdaysOf, closesAtFor, blastProbs, raceProb, OVERROUND_BRACKET, LADDER_STRIKES, LIMITS } from './pricing.mjs';
import { keepClosedEvents } from '../../build-book.mjs';

const PRICE = ['blast', 'ladder', 'bracket', 'race', 'duel'];
function wealthFixture(weekId = '2026-W40', start = '2026-09-28', end = '2026-10-02', locksAt = '2026-09-28T13:30:00.000Z') {
  const secs = ['AI & tech', 'AI & tech', 'Aerospace', 'Finance', 'Finance', 'Energy', 'Energy', 'Health', 'Media', 'Luxury & retail', 'Luxury & retail', 'Luxury & retail'];
  const draftable = secs.map((s, i) => ({ slug: `p${String(i).padStart(2, '0')}`, name: `Person ${i}`, sector: s,
    holdings: i >= 9 ? [{ ticker: 'WMT', weight: 1 }] : i === 3 ? [{ ticker: 'T3', weight: 0.6 }, { ticker: 'T4B', weight: 0.4 }] : [{ ticker: `T${i}`, weight: 1 }] }));
  const salaries = Object.fromEntries(draftable.map((p, i) => [p.slug, 30 - i]));
  const week = { week: weekId, start, end, locksAt, salaries, draftable };
  const prev = prevWeekday(start);
  const history = {};
  for (const t of ['T0', 'T1', 'T2', 'T3', 'T4B', 'T5', 'T6', 'T7', 'T8', 'WMT']) history[t] = [['2026-01-02', 90], [prev, 100]];
  const sh = (t, n) => ({ ticker: t, shares: n });
  const est = { people: {
    p00: { coverage: 0.9, coveredValue: 2e11, holdings: [sh('T0', 2e9)] },            // $200B
    p01: { coverage: 0.95, coveredValue: 1.95e11, holdings: [sh('T1', 1.95e9)] },     // $195B: a close race with p00
    p02: { coverage: 1.1, coveredValue: 1.2e11, holdings: [sh('T2', 1.2e9)] },
    p03: { coverage: 0.8, coveredValue: 1e11, holdings: [sh('T3', 6e8), sh('T4B', 4e8)] },
    p05: { coverage: 0.3, coveredValue: 5e10, holdings: [sh('T5', 5e8)] },            // coverage too low: not in the dollar pool
    p09: { coverage: 1, coveredValue: 9e10, method: 'worth', holdings: [{ ticker: 'WMT', basis: 'worth', refClose: 100, refDate: prev }] },
    p10: { coverage: 1, coveredValue: 8.5e10, method: 'worth', holdings: [{ ticker: 'WMT', basis: 'worth', refClose: 100, refDate: prev }] }
  } };
  return { week, history, est, overrides: { p09: { note: 'Shared family stake.', source: 'https://example.invalid/13d' } } };
}
const buildW = (fx, n = 2000) => buildBook({ week: fx.week, history: fx.history, est: fx.est, overrides: fx.overrides, editions: [], filings: [],
  storyMatches: () => false, generated: '2026-09-25T00:00:00.000Z', n });

test('dates: previous weekday, the week\'s weekdays, 9:30 AM New York betting close across DST', () => {
  assert.equal(prevWeekday('2026-09-28'), '2026-09-25');   // Monday -> Friday
  assert.equal(prevWeekday('2026-09-30'), '2026-09-29');
  assert.deepEqual(weekdaysOf({ start: '2026-09-28', end: '2026-10-02' }), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(closesAtFor('2026-09-28'), '2026-09-28T13:30:00.000Z');   // EDT
  assert.equal(closesAtFor('2026-10-30'), '2026-10-30T13:30:00.000Z');   // last Friday of EDT
  assert.equal(closesAtFor('2026-11-02'), '2026-11-02T14:30:00.000Z');   // EST (clocks went back Sun Nov 1)
  assert.equal(closesAtFor('2026-03-06'), '2026-03-06T14:30:00.000Z');
  assert.equal(closesAtFor('2026-03-09'), '2026-03-09T13:30:00.000Z');   // EDT from Sun Mar 8
});

test('price markets: every type, pools, params, closesAt, >= 2 selections, deterministic', () => {
  const fx = wealthFixture();
  const a = buildW(fx), b = buildW(fx);
  assert.deepEqual(a, b);
  const of = t => a.events.filter(e => e.type === t);
  assert.equal(of('blast').length, 4 + 5 * 2);               // weekly pct/usd up/down + daily pct/usd up per weekday
  assert.equal(of('ladder').length, 12);                     // everyone with a basket (12 < 15)
  assert.equal(of('bracket').length, 12);
  assert.ok(of('race').length >= 1);
  assert.ok(of('duel').length >= 1);
  for (const e of a.events) {
    assert.ok(e.selections.length >= 2, `${e.id} has ${e.selections.length}`);
    if (!PRICE.includes(e.type)) { assert.equal(e.closesAt, undefined); continue; }
    assert.equal(e.params.from <= e.params.to, true);
    assert.equal(e.closesAt, closesAtFor(e.params.from));
    assert.ok(Date.parse(e.closesAt) < Date.parse(`${e.params.to}T20:00:00Z`));
    assert.equal(e.params.start, e.type === 'race' ? undefined : 'open');   // races have no start price
    assert.ok(['blasts', 'ladders', 'races'].includes(e.group));
  }
  const W = '2026-W40';
  const wk = a.events.find(e => e.id === `${W}:blast:pct:up:week`);
  assert.deepEqual([wk.params.from, wk.params.to, wk.params.start, wk.closesAt], ['2026-09-28', '2026-10-02', 'open', '2026-09-28T13:30:00.000Z']);
  assert.equal(wk.closesAt, a.locksAt);                                  // weekly markets close with the fantasy lock
  const tue = a.events.find(e => e.id === `${W}:blast:usd:up:2026-09-29`);
  assert.deepEqual([tue.params.from, tue.params.to, tue.closesAt, tue.title], ['2026-09-29', '2026-09-29', '2026-09-29T13:30:00.000Z', 'Biggest $ gainer today (Tue Sep 29)']);
  assert.equal(a.events.find(e => e.id === `${W}:blast:pct:up:2026-09-28`).closesAt, '2026-09-28T13:30:00.000Z');
  // pools: % boards use baskets of all 12; $ boards the dollar pool (coverage >= 0.4), valued at the latest close
  assert.equal(wk.params.slugs.length, 12);
  assert.deepEqual(Object.keys(wk.params.baskets).sort(), wk.params.slugs.slice().sort());
  assert.deepEqual(wk.params.baskets.p03, [{ ticker: 'T3', weight: 0.6 }, { ticker: 'T4B', weight: 0.4 }]);
  const usd = a.events.find(e => e.id === `${W}:blast:usd:down:week`);
  assert.deepEqual(Object.keys(usd.params.wealth).sort(), ['p00', 'p01', 'p02', 'p03', 'p09', 'p10']);
  assert.deepEqual(usd.params.wealth.p09, { method: 'worth', worth: 9e10, ticker: 'WMT', refDate: '2026-09-25', refClose: 100 });
  assert.equal(a.model.p00.value0, 2e11);
  assert.equal(a.model.p00.value0Date, '2026-09-25');
  assert.equal(a.model.p05.value0, undefined);
  assert.equal(a.model.p09.wealthNote, 'Shared family stake.');
  assert.deepEqual(a.model.p01.basket, [{ ticker: 'T1', weight: 1 }]);
  // blasts: fair chances sum to 1 at a 120% book; people with the same basket share the % boards equally
  for (const e of of('blast')) {
    assert.ok(Math.abs(e.selections.reduce((s, x) => s + x.fairProb, 0) - 1) < 0.002, e.id);
    assert.ok(Math.abs(overround(e.selections) - 1.2) < 0.06, `${e.id} ${overround(e.selections)}`);
  }
  const wmt = wk.selections.filter(x => ['p09', 'p10', 'p11'].includes(x.person)).map(x => x.americanOdds);
  assert.equal(new Set(wmt).size, 1);
  // ladders: strikes in order, one-sided 4.5% margin, symmetric, rungs under 1% dropped
  const lad = a.events.find(e => e.id === `${W}:ladder:p00`);
  assert.deepEqual(lad.selections.map(x => x.line), LADDER_STRIKES);
  assert.deepEqual(lad.selections.map(x => x.market), Array(6).fill('strike'));
  assert.equal(lad.selections[0].label, 'Down 10% or more');
  assert.equal(lad.selections[5].label, 'Up 10% or more');
  assert.equal(lad.selections[0].americanOdds, lad.selections[5].americanOdds);
  assert.ok(lad.selections[3].americanOdds < lad.selections[4].americanOdds && lad.selections[4].americanOdds < lad.selections[5].americanOdds);
  const fin = a.events.find(e => e.id === `${W}:ladder:p04`);                  // Finance, 1.3%/day: +-10% is under 1%
  assert.deepEqual(fin.selections.map(x => x.line), [-5, -2, 2, 5]);
  // brackets: six ranges, fair sums to 1, 112% book
  const br = a.events.find(e => e.id === `${W}:bracket:p00`);
  assert.equal(br.selections.length, 6);
  assert.ok(Math.abs(br.selections.reduce((s, x) => s + x.fairProb, 0) - 1) < 0.001);
  assert.ok(Math.abs(overround(br.selections) - OVERROUND_BRACKET) < 0.04, `bracket book ${overround(br.selections)}`);
  assert.deepEqual(br.params.buckets[`${W}:bracket:p00:r0`], [null, -5]);
  assert.deepEqual(br.params.buckets[`${W}:bracket:p00:r5`], [5, null]);
  assert.deepEqual(br.selections.map(x => x.label), ['Down more than 5%', 'Down 2% to 5%', 'Down less than 2%', 'Flat or up less than 2%', 'Up 2% to 5%', 'Up 5% or more']);
  // races: adjacent by value; p01 ($195B) chasing p00 ($200B) is a live race; Walton-style clones never race (P = 0)
  const race = a.events.find(e => e.id === `${W}:race:p01:p00`);
  assert.ok(race);
  assert.deepEqual(race.selections.map(x => [x.market, x.person ?? null]), [['yes', 'p01'], ['no', null]]);
  assert.ok(race.selections[0].fairProb > 0.1 && race.selections[0].fairProb < 0.5);
  assert.equal(race.title, 'Will Person 1 pass Person 0 by Friday\'s close?');
  assert.equal(a.events.find(e => e.id === `${W}:race:p10:p09`), undefined);
  // duels: never two who move as one; -110 moneylines; alt lines both ways, in half billions
  for (const e of of('duel')) {
    assert.ok(!(['p09', 'p10'].includes(e.params.a) && ['p09', 'p10'].includes(e.params.b)));
    assert.deepEqual(e.selections.slice(0, 2).map(x => x.americanOdds), [-110, -110]);
    for (const x of e.selections.filter(s => s.market === 'by')) {
      assert.equal(x.line * 2 % 1, 0);
      assert.ok(x.line > 0);
      assert.match(x.label, /by \$\d+(\.5)?B\+$/);
    }
  }
  // odds span: ladders reach long shots; the price board also has short favourites
  assert.ok(of('ladder').some(e => e.selections.some(x => x.americanOdds >= 500)));
  assert.ok(a.events.filter(e => PRICE.includes(e.type)).some(e => e.selections.some(x => x.americanOdds <= -200)));
  // selection ids unique, prefixed by the event id, odds consistent
  const ids = new Set();
  for (const e of a.events) for (const x of e.selections) { assert.ok(!ids.has(x.id)); ids.add(x.id); assert.ok(x.id.startsWith(e.id + ':')); assert.equal(x.decimalOdds, americanToDecimal(x.americanOdds)); }
  assert.deepEqual(a.limits.longShots, [{ minDecimal: 21, maxStake: 50 }, { minDecimal: 6, maxStake: 150 }]);
  assert.equal(LIMITS.maxStake, 500);
  assert.match(a.method, /opening price on the first day to the closing price on the last day; betting closes at the opening bell \(9:30 AM New York\)/);
});

test('price markets: no networth estimate -> no dollar markets; % markets still built', () => {
  const fx = wealthFixture();
  const a = buildBook({ week: fx.week, history: fx.history, editions: [], filings: [], storyMatches: () => false, generated: 'x', n: 1000 });
  const types = new Set(a.events.map(e => e.type));
  assert.ok(types.has('blast') && types.has('ladder') && types.has('bracket'));
  assert.ok(!types.has('race') && !types.has('duel'));
  assert.ok(a.events.filter(e => e.type === 'blast').every(e => e.params.metric === 'pct'));
});

test('price markets: betting closes at 9:30 AM New York in EDT and EST weeks', () => {
  const byId = (b, id) => b.events.find(e => e.id === id).closesAt;
  const edt = buildW(wealthFixture(), 500);                                                    // W40, EDT
  assert.equal(byId(edt, '2026-W40:blast:pct:up:week'), '2026-09-28T13:30:00.000Z');
  assert.equal(byId(edt, '2026-W40:ladder:p00'), '2026-09-28T13:30:00.000Z');
  assert.equal(byId(edt, '2026-W40:blast:pct:up:2026-10-01'), '2026-10-01T13:30:00.000Z');
  const est = buildW(wealthFixture('2026-W45', '2026-11-02', '2026-11-06', '2026-11-02T14:30:00.000Z'), 500);   // W45, EST
  assert.equal(byId(est, '2026-W45:blast:pct:up:week'), '2026-11-02T14:30:00.000Z');
  assert.equal(byId(est, '2026-W45:bracket:p00'), '2026-11-02T14:30:00.000Z');
  assert.equal(byId(est, '2026-W45:blast:pct:up:2026-11-02'), '2026-11-02T14:30:00.000Z');
  assert.equal(byId(est, '2026-W45:blast:usd:up:2026-11-03'), '2026-11-03T14:30:00.000Z');
});

test('blastProbs / raceProb: seeded, sum to 1, dollar scale and side matter', () => {
  const ppl = [{ slug: 'a', sector: 'X', holdings: [{ ticker: 'A', weight: 1 }], vol: 2 }, { slug: 'b', sector: 'Y', holdings: [{ ticker: 'B', weight: 1 }], vol: 1 },
    { slug: 'c', sector: 'Y', holdings: [{ ticker: 'C', weight: 1 }], vol: 1 }];
  const p = blastProbs(ppl, { seed: 's', n: 4000, days: 5 });
  assert.deepEqual(p, blastProbs(ppl, { seed: 's', n: 4000, days: 5 }));
  assert.ok(Math.abs(p.a + p.b + p.c - 1) < 1e-9);
  assert.ok(p.a > p.b);                                             // more volatile -> more likely to top a % board
  const big = blastProbs(ppl, { seed: 's', n: 4000, days: 5, scale: { a: 1e9, b: 1e11, c: 1e9 } });
  assert.ok(big.b > 0.45 && big.b > p.b + 0.1);                     // $ boards: the biggest fortune tops them whenever it rises
  const down = blastProbs(ppl, { seed: 's', n: 4000, days: 5, side: 'down' });
  assert.ok(Math.abs(down.a + down.b + down.c - 1) < 1e-9);
  const r = raceProb({ ...ppl[1], value0: 99 }, { ...ppl[2], value0: 100 }, { seed: 'r', n: 4000, days: 5 });
  assert.ok(r > 0.3 && r < 0.5);
  assert.equal(raceProb({ ...ppl[1], value0: 50 }, { ...ppl[2], value0: 100 }, { seed: 'r', n: 2000, days: 1 }), 0);
});

test('build-book: price events past their close are kept exactly as published', () => {
  const fx = wealthFixture();
  const old = buildW(fx, 500);
  const moved = JSON.parse(JSON.stringify(fx));
  moved.est.people.p00.holdings[0].shares = 3e9;                                     // a new filing changes a share count
  const fresh = buildW(moved, 500);
  const id = '2026-W40:blast:usd:up:week';
  assert.notDeepEqual(fresh.events.find(e => e.id === id).params.wealth.p00, old.events.find(e => e.id === id).params.wealth.p00);
  const kept = keepClosedEvents(fresh, old, Date.parse('2026-09-28T15:00:00Z'));      // weekly markets closed Mon 9:30 AM
  const k = kept.events.find(e => e.id === id), o = old.events.find(e => e.id === id);
  assert.deepEqual({ ...k, sort: 0 }, { ...o, sort: 0 });
  const tue = '2026-W40:blast:pct:up:2026-09-29';                                     // still open: rebuilt
  assert.equal(kept.events.find(e => e.id === tue), fresh.events.find(e => e.id === tue));
  // a closed market the rebuild no longer offers (p01 can't catch p00 at $300B) is kept, so it still settles
  const gone = old.events.filter(e => PRICE.includes(e.type) && e.closesAt <= '2026-09-28T15' && !fresh.events.some(f => f.id === e.id)).map(e => e.id);
  assert.deepEqual(gone, ['2026-W40:race:p01:p00']);
  assert.equal(kept.events.length, fresh.events.length + 1);
  assert.ok(kept.events.some(e => e.id === gone[0]));
  kept.events.forEach((e, i) => assert.equal(e.sort, i));
  // before any close: nothing carried over
  assert.equal(keepClosedEvents(fresh, old, Date.parse('2026-09-25T12:00:00Z')), fresh);
});
