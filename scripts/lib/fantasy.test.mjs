// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  core, resolveHoldingTicker, holdingCandidates, personPortfolio, scorePersonDay, computeSalaries, tierSalary,
  ensureFeasible, top5Team, tradingDateOf, fantasySymbols, hasInsiderBuy,
} from './fantasy.mjs';
import { scoreWeek, newWeekFile } from '../build-fantasy.mjs';

const q = (changePct, price = 100, time = '2026-09-24T20:00:00.000Z') => ({ price, changePct, time });

// ---------- ticker resolver ----------
test('resolver: US ticker as fetch-prices treats it', () => {
  assert.deepEqual(resolveHoldingTicker({ name: 'Tesla, Inc.', ticker: 'TSLA', exchange: 'Nasdaq' }, new Set(['TSLA'])), { ticker: 'TSLA', adr: false });
  // non-US exchange without an ADR mapping: nothing
  assert.equal(resolveHoldingTicker({ name: 'Reliance Industries Ltd.', ticker: 'RELIANCE', exchange: 'NSE/BSE' }, new Set(['RELIANCE'])), null);
});

test('resolver: Alphabet / Google name alias -> GOOGL', () => {
  assert.deepEqual(resolveHoldingTicker({ name: 'Alphabet Inc. (Google)' }, new Set(['GOOGL'])), { ticker: 'GOOGL', adr: false });
  assert.deepEqual(resolveHoldingTicker({ name: 'Google' }, new Set(['GOOGL'])), { ticker: 'GOOGL', adr: false });
  assert.deepEqual(resolveHoldingTicker({ name: 'SpaceX (private; Forbes notes)' }, new Set(['SPCX'])), { ticker: 'SPCX', adr: false });
  assert.deepEqual(resolveHoldingTicker({ name: 'Berkshire Hathaway' }, new Set(['BRK.B'])), { ticker: 'BRK.B', adr: false });
  // share-class alias: GOOG listed, only GOOGL quoted
  assert.deepEqual(resolveHoldingTicker({ name: 'Alphabet Inc. - Class C', ticker: 'GOOG', exchange: 'Nasdaq' }, new Set(['GOOGL'])), { ticker: 'GOOGL', adr: false });
});

test('resolver: LVMH -> LVMUY only when quoted', () => {
  const lvmh = { name: 'LVMH Moët Hennessy Louis Vuitton SE', ticker: 'MC', exchange: 'Euronext Paris' };
  assert.deepEqual(resolveHoldingTicker(lvmh, new Set(['LVMUY'])), { ticker: 'LVMUY', adr: true });
  assert.equal(resolveHoldingTicker(lvmh, new Set(['AAPL'])), null);
  assert.deepEqual(resolveHoldingTicker({ name: 'Tencent Holdings Limited', ticker: '0700', exchange: 'HKEX' }, { TCEHY: {} }), { ticker: 'TCEHY', adr: true });
  assert.deepEqual(resolveHoldingTicker({ name: 'Industria de Diseño Textil, S.A. (Inditex)', ticker: 'ITX', exchange: 'BME (Madrid)' }, new Set(['IDEXY'])), { ticker: 'IDEXY', adr: true });
  assert.ok(holdingCandidates(lvmh).some((c) => c.ticker === 'LVMUY'));
});

test('fantasySymbols includes SPY and ADR lines', () => {
  const syms = fantasySymbols([{ controls: [{ name: 'LVMH', ticker: 'MC', exchange: 'Euronext Paris' }, { name: 'Tesla, Inc.', ticker: 'TSLA', exchange: 'Nasdaq' }] }]);
  assert.ok(syms.includes('SPY') && syms.includes('LVMUY') && syms.includes('TSLA'));
});

// ---------- weights ----------
test('weights: value-weighted when every holding has a share count', () => {
  const prof = { slug: 'x', controls: [
    { name: 'A Corp', ticker: 'AAA', exchange: 'NYSE', stake: '10% (3,000,000 shares)' },
    { name: 'B Corp', ticker: 'BBB', exchange: 'NYSE', stake: '1,000,000 shares' },
  ] };
  const pf = personPortfolio(prof, { AAA: q(1, 100), BBB: q(1, 100) });
  assert.equal(pf.method, 'value-weighted');
  assert.deepEqual(pf.holdings.map((h) => [h.ticker, h.weight]), [['AAA', 0.75], ['BBB', 0.25]]);
});

test('weights: controls 75% / stakes 25% when a share count is missing; former and note entries ignored; ADR never valued', () => {
  const prof = { slug: 'y',
    controls: [
      { name: 'A Corp', ticker: 'AAA', exchange: 'NYSE', stake: '3,000,000 shares' },
      { name: 'B Corp', ticker: 'BBB', exchange: 'NYSE', stake: '1,000,000 shares' },
      { name: 'C Corp (historical)', ticker: 'CCC', exchange: 'NYSE' },
      { name: 'Other holdings: many', ticker: 'DDD', exchange: 'NYSE' },
    ],
    stakes: [
      { name: 'E Corp', ticker: 'EEE', exchange: 'NYSE' },
      { name: 'F Corp', ticker: 'FFF', exchange: 'NYSE', stake: '5,000 shares' },
      { name: 'A Corp - options', ticker: 'AAA', exchange: 'NYSE' }, // already in controls: counted once
    ] };
  const pf = personPortfolio(prof, { AAA: q(1), BBB: q(1), CCC: q(1), DDD: q(1), EEE: q(1), FFF: q(1) });
  assert.equal(pf.method, 'controls-weighted (75/25)');
  // controls all valued -> by value inside 75%; stakes mixed -> equal inside 25%
  assert.deepEqual(pf.holdings.map((h) => [h.ticker, h.tier, h.weight]), [['AAA', 'controls', 0.5625], ['BBB', 'controls', 0.1875], ['EEE', 'stakes', 0.125], ['FFF', 'stakes', 0.125]]);
  // one tier only -> that tier gets 100%, equal split when a count is missing
  const one = personPortfolio({ slug: 'o', controls: [{ name: 'A Corp', ticker: 'AAA', exchange: 'NYSE', stake: '3,000,000 shares' }, { name: 'B Corp', ticker: 'BBB', exchange: 'NYSE' }] }, { AAA: q(1), BBB: q(1) });
  assert.deepEqual(one.holdings.map((h) => h.weight), [0.5, 0.5]);
  const onlyStakes = personPortfolio({ slug: 's', stakes: [{ name: 'E Corp', ticker: 'EEE', exchange: 'NYSE' }] }, { EEE: q(1) });
  assert.equal(onlyStakes.holdings[0].weight, 1);
  const adr = personPortfolio({ slug: 'z', controls: [{ name: 'LVMH', ticker: 'MC', exchange: 'Euronext Paris', stake: '1,000,000 shares' }] }, { LVMUY: q(2, 150) });
  assert.equal(adr.holdings[0].value, null);
  assert.equal(adr.holdings[0].weight, 1);
});

test('weights on real profiles: Buffett, Dell, Ellison', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('../../', import.meta.url);
  const quotes = JSON.parse(await readFile(new URL('data/prices/latest.json', root), 'utf8')).quotes;
  const prof = async (s) => JSON.parse(await readFile(new URL(`data/people/${s}.json`, root), 'utf8'));
  const w = (pf, t) => pf.holdings.find((h) => h.ticker === t)?.weight ?? 0;
  const buffett = personPortfolio(await prof('warren-buffett'), quotes);
  assert.equal(buffett.method, 'controls-weighted (75/25)');
  assert.ok(w(buffett, 'BRK.B') >= 0.75, `BRK.B ${w(buffett, 'BRK.B')}`);
  const dell = personPortfolio(await prof('michael-dell'), quotes);
  assert.ok(w(dell, 'DELL') >= 0.75, `DELL ${w(dell, 'DELL')}`);
  // Ellison's profile lists both ORCL and PSKY under controls (PSKY has no exact share count). His TSLA stake has no
  // exchange and a non-SEC source, so it does not resolve, and his ORCL options entry merges into ORCL: one tier, split equally.
  const ellison = personPortfolio(await prof('larry-ellison'), quotes);
  assert.equal(w(ellison, 'ORCL'), 0.5);
  assert.equal(w(ellison, 'PSKY'), 0.5);
  assert.equal(w(ellison, 'TSLA'), 0);
});

test('weights: duplicates of one company merge', () => {
  const prof = { slug: 'w', controls: [
    { name: 'Walmart Inc.', ticker: 'WMT', exchange: 'Nasdaq' },
    { name: 'Walmart Inc. - direct', ticker: 'WMT', exchange: 'Nasdaq', stake: '7,029,557 shares' },
  ] };
  const pf = personPortfolio(prof, { WMT: q(1) });
  assert.equal(pf.holdings.length, 1);
  assert.equal(pf.holdings[0].weight, 1);
});

// ---------- points ----------
test('points: return × 100, insider buy +25, +10 per story; stale quotes count 0%', () => {
  const holdings = [{ ticker: 'AAA', weight: 0.5 }, { ticker: 'BBB', weight: 0.5 }, { ticker: 'OLD', weight: 0 }];
  const quotes = { AAA: q(2.0), BBB: q(0.46), OLD: q(9, 1, '2026-09-20T20:00:00.000Z') };
  const filings = [{ personSlug: 'p', filed: '2026-09-24', form4: { summary: [{ code: 'P' }] } }, { personSlug: 'p', filed: '2026-09-24', form4: { summary: [{ code: 'P' }] } }];
  const stories = [{ who: 'Pat Person' }, { who: 'Someone', people: ['Pat Person & family'] }, { who: 'Other' }];
  const r = scorePersonDay({ slug: 'p', name: 'Pat Person', holdings, quotes, tradingDate: '2026-09-24', filings, stories });
  assert.equal(r.returnPct, 1.23);
  assert.equal(r.pricePoints, 123);
  assert.deepEqual(r.bonuses, { insiderBuy: 25, stories: 20 });
  assert.equal(r.points, 168);
  assert.equal(r.holdings[2].stale, true);
  const neg = scorePersonDay({ slug: 'n', name: 'Nobody', holdings: [{ ticker: 'AAA', weight: 1 }], quotes: { AAA: q(-1.234) }, tradingDate: '2026-09-24' });
  assert.equal(neg.points, -123);
  assert.equal(hasInsiderBuy([{ personSlug: 'p', filed: '2026-09-24', form4: { summary: [{ code: 'S' }] } }], 'p', '2026-09-24'), false);
});

test('points: captain 1.5× and team day total', () => {
  const day = { people: { a: { points: 100 }, b: { points: -41 }, c: { points: 10 }, d: { points: 0 }, e: { points: 5 } } };
  const r = core.teamDay(['a', 'b', 'c', 'd', 'e'], 'b', day);
  assert.equal(r.bySlug.b, -61); // Math.round(-61.5): halves round up
  assert.equal(core.captainPoints(123), 185);
  assert.equal(r.total, 100 - 61 + 10 + 0 + 5);
});

test('SPY benchmark points are × 5 picks', () => {
  assert.equal(core.spyPoints(0.5), 250);
  assert.equal(core.spyPoints(null), null);
});

// ---------- lock-time logic ----------
test('week ids and boundaries', () => {
  assert.equal(core.isoWeek('2026-09-28'), '2026-W40');
  assert.equal(core.isoWeek('2026-09-24'), '2026-W39');
  assert.equal(core.isoWeek('2026-01-01'), '2026-W01');
  assert.equal(core.isoWeek('2027-01-01'), '2026-W53');
  assert.equal(core.weekMonday('2026-W40'), '2026-09-28');
  assert.equal(core.weekInfo('2026-W40').end, '2026-10-02');
  assert.equal(core.isPractice('2026-W39'), true);
  assert.equal(core.isPractice('2026-W40'), false);
});

test('lock is Monday 09:30 New York across DST', () => {
  const iso = (w) => new Date(core.weekInfo(w).locksAt).toISOString();
  assert.equal(iso('2026-W40'), '2026-09-28T13:30:00.000Z'); // EDT
  assert.equal(iso(core.isoWeek('2026-03-02')), '2026-03-02T14:30:00.000Z'); // EST
  assert.equal(iso(core.isoWeek('2026-03-09')), '2026-03-09T13:30:00.000Z'); // EDT from Mar 8
  assert.equal(iso(core.isoWeek('2026-10-26')), '2026-10-26T13:30:00.000Z'); // EDT
  assert.equal(iso(core.isoWeek('2026-11-02')), '2026-11-02T14:30:00.000Z'); // EST from Nov 1
});

test('draft week, locked week and late entry', () => {
  const t = (s) => Date.parse(s);
  // Friday Sep 25: draft for W40, W39 is the locked (practice) week
  assert.equal(core.draftWeek(t('2026-09-25T15:00:00Z')), '2026-W40');
  assert.equal(core.lockedWeek(t('2026-09-25T15:00:00Z')), '2026-W39');
  // Monday 09:29 New York is still before the lock; 09:30 is locked
  assert.equal(core.draftWeek(t('2026-09-28T13:29:59Z')), '2026-W40');
  assert.equal(core.draftWeek(t('2026-09-28T13:30:00Z')), '2026-W41');
  assert.equal(core.lockedWeek(t('2026-09-28T13:30:00Z')), '2026-W40');
  // Sunday late evening New York (Monday UTC) still drafts the coming week
  assert.equal(core.draftWeek(t('2026-10-05T03:00:00Z')), '2026-W41');
  // in EST: Monday 09:29 EST = 14:29Z
  assert.equal(core.draftWeek(t('2026-11-02T14:29:00Z')), '2026-W45');
  assert.equal(core.draftWeek(t('2026-11-02T14:30:00Z')), '2026-W46');
  // late entry on Wednesday scores from Thursday; on Friday there is nothing left
  assert.equal(core.lateFrom(t('2026-09-30T16:00:00Z')), '2026-10-01');
  assert.equal(core.lateFrom(t('2026-10-02T16:00:00Z')), null);
  assert.equal(core.lateFrom(t('2026-10-03T16:00:00Z')), null); // Saturday
});

// ---------- cap validation ----------
test('cap validation', () => {
  const sal = { a: 30, b: 30, c: 26, d: 10, e: 7, f: 14 };
  assert.deepEqual(core.validateTeam(['a', 'b', 'c', 'd', 'e'], 'a', sal), { ok: false, used: 103, errors: ['Over the cap by 3'] });
  const ok = core.validateTeam(['a', 'b', 'f', 'd', 'e'], 'e', sal);
  assert.equal(ok.ok, true);
  assert.equal(ok.used, 91);
  assert.equal(core.validateTeam(['a', 'b', 'f', 'd'], 'a', sal).ok, false);
  assert.equal(core.validateTeam(['a', 'b', 'f', 'd', 'e'], 'zz', sal).ok, false);
  assert.equal(core.validateTeam(['a', 'a', 'f', 'd', 'e'], 'a', sal).ok, false);
  assert.equal(core.validateTeam(['a', 'b', 'f', 'd', 'nope'], 'a', sal).ok, false);
});

// ---------- salaries ----------
test('salary tiers and feasibility', () => {
  assert.deepEqual([1, 5, 6, 10, 11, 20, 21, 35, 36, 50, 51, 75, 76, 100].map(tierSalary), [30, 30, 26, 26, 22, 22, 18, 18, 14, 14, 10, 10, 7, 7]);
  const people = Array.from({ length: 40 }, (_, i) => ({ slug: 's' + String(i).padStart(2, '0'), rank: i + 1 }));
  const { salaries, adjusted } = computeSalaries(people);
  assert.equal(adjusted, false);
  assert.equal(salaries.s00, 30);
  assert.equal(salaries.s11, 22);
  assert.equal(salaries.s39, 14);
  // adjustment is inactive with < 4 weeks, active with 4
  const totals = Object.fromEntries(people.map((p, i) => [p.slug, i * 10]));
  assert.equal(computeSalaries(people, [{ totals }, { totals }, { totals }]).adjusted, false);
  const adj = computeSalaries(people, [{ totals }, { totals }, { totals }, { totals }]);
  assert.equal(adj.adjusted, true);
  assert.equal(adj.salaries.s00, 26); // worst recent scorer: -4
  assert.equal(adj.salaries.s39, 18); // best recent scorer: +4
  // a pool too small for the cap is lowered until five fit
  const small = computeSalaries(people.slice(0, 6)).salaries;
  assert.ok(Object.values(small).sort((a, b) => a - b).slice(0, 5).reduce((x, y) => x + y, 0) <= 100);
  const tight = { a: 30, b: 30, c: 30, d: 30, e: 30 };
  assert.equal(ensureFeasible(tight), true);
  assert.ok(Object.values(tight).reduce((x, y) => x + y, 0) <= 100);
});

// ---------- perfect team ----------
function brute(totals, sal, cap) {
  const s = Object.keys(sal);
  let best = -Infinity;
  const n = s.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
    const t = [s[a], s[b], s[c], s[d], s[e]];
    if (t.reduce((x, k) => x + sal[k], 0) > cap) continue;
    for (const cap1 of t) {
      const v = t.reduce((x, k) => x + (k === cap1 ? core.captainPoints(totals[k]) : totals[k]), 0);
      if (v > best) best = v;
    }
  }
  return best;
}
test('perfect team solver matches brute force', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const tiers = [30, 26, 22, 18, 14, 10, 7];
  for (let trial = 0; trial < 20; trial++) {
    const sal = {}, totals = {};
    for (let i = 0; i < 14; i++) { const k = 'p' + i; sal[k] = tiers[Math.floor(rnd() * tiers.length)]; totals[k] = Math.round((rnd() - 0.45) * 1000); }
    const r = core.perfectTeam(totals, sal, 100, 5);
    assert.equal(r.points, brute(totals, sal, 100));
    assert.equal(r.picks.length, 5);
    assert.ok(r.picks.includes(r.captain));
    assert.ok(r.salary <= 100);
    assert.ok(core.validateTeam(r.picks, r.captain, sal).ok);
  }
  // all negative still picks five
  const r = core.perfectTeam({ a: -5, b: -1, c: -9, d: -2, e: -3, f: -50 }, { a: 10, b: 10, c: 10, d: 10, e: 10, f: 10 }, 100, 5);
  assert.deepEqual(r.picks.slice().sort(), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(r.captain, 'b');
});

// ---------- week scoring ----------
test('scoreWeek: totals, SPY, top 5 and perfect only after the week ends', () => {
  const pool = { draftable: ['a', 'b', 'c', 'd', 'e', 'f'].map((s, i) => ({ slug: s, name: s, rank: i + 1, holdings: [] })) };
  const wk = newWeekFile('2026-W40', pool, [], '2026-09-25T00:00:00Z');
  assert.equal(wk.locksAt, '2026-09-28T13:30:00.000Z');
  const days = {
    '2026-09-28': { spy: { points: 50 }, people: { a: { points: 10 }, b: { points: 20 }, c: { points: 30 }, d: { points: 40 }, e: { points: 50 }, f: { points: 200 } } },
    '2026-09-29': { spy: { points: -25 }, people: { a: { points: 10 } } },
    '2026-09-25': { spy: { points: 999 }, people: {} }, // other week
  };
  const mid = scoreWeek(wk, days, '2026-09-30');
  assert.deepEqual(mid.days, ['2026-09-28', '2026-09-29']);
  assert.equal(mid.totals.a, 20);
  assert.equal(mid.benchmarks.spy, 25);
  assert.equal(mid.benchmarks.top5.captain, 'a');
  assert.equal(mid.benchmarks.top5.points, 15 + 20 + 30 + 40 + 50 + 15); // day1 a captain 15, day2 a 15
  assert.equal(mid.benchmarks.perfect, null);
  const end = scoreWeek(wk, days, '2026-10-03');
  assert.equal(end.final, true);
  // best: f (200) as captain = 300, plus the four best others that fit (all salaries fit: 30+26+... check cap)
  assert.equal(end.benchmarks.perfect.captain, 'f');
  assert.ok(end.benchmarks.perfect.salary <= 100);
});

test('export / import code round trip', () => {
  const teams = { '2026-W40': { picks: ['elon-musk', 'jeff-bezos', 'jack-ma', 'colin-huang', 'dilip-shanghvi'], captain: 'jack-ma', lateFrom: '2026-10-01' } };
  const code = core.exportCode(teams);
  assert.match(code, /^BFL1\./);
  assert.deepEqual(core.importCode(code), teams);
  assert.throws(() => core.importCode('hello'));
});

test('tradingDateOf uses the New York date of the quotes', () => {
  assert.equal(tradingDateOf({ A: q(1), B: q(1), C: q(1, 1, '2026-09-23T20:00:00.000Z') }), '2026-09-24');
  assert.deepEqual(top5Team([{ slug: 'z', rank: 2 }, { slug: 'y', rank: 1 }]), { picks: ['y', 'z'], captain: 'y' });
});
