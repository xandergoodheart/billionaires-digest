// The Book: play-money odds for a fantasy week. Pure functions, no I/O; deterministic (seeded RNG).
// Used by scripts/build-book.mjs. Coins only: no purchases, no cash-out, no prizes.
//
// Model (per person, per trading day): points ~ Normal(mu, sigma)
//   mu    = 10 x (stories in the last 20 editions / 20) + 25 x (P-buy days in the last 90 calendar days / 63)
//   sigma = 100 x daily portfolio volatility (%): realized from data/prices/history when >= 15 closes,
//           blended linearly with the sector default from 15 to 60 closes.
// Correlation: 1.0 when two people share a holding weighted >= 50% for both (never paired head-to-head),
//   0.6 in the same sector, 0.3 otherwise.
// Weekly total = sum of the week's trading days (5).
//
// Price markets (blast, ladder, bracket, race, duel): a person's % return of their basket (the week file's draftable
// holdings weights) from the opening price on the first day to the closing price on the last ~ Normal(0, vol) per trading
// day, vol = the same blended daily volatility; over d days the spread is vol x sqrt(d). Same correlations. Dollar change
// = tracked value x return. Betting closes at the opening bell (9:30 AM New York) of the first day. See buildBook.
import { nyToUtc } from '../supa/time.mjs';
import { trackedValue, prevTradingClose, dollarPool } from '../wealth.mjs';
import { STAKE_CAPS } from './settle.mjs';

export const DAYS = 5;
export const MC_N = 20000;
export const STORY_EDITIONS = 20;
export const P_LOOKBACK_DAYS = 90;
export const P_TRADING_DAYS = 63;
export const POINTS = { story: 10, insiderBuy: 25 };
export const SECTOR_VOL = {
  'AI & tech': 2.2, Aerospace: 3.0, Autos: 3.0, Finance: 1.3, 'Luxury & retail': 1.5, Industrials: 1.8,
  Energy: 1.8, Health: 1.6, Media: 1.8, 'Real estate': 1.6, Other: 1.8
};
export const DEFAULT_VOL = 1.8;
export const VOL_MIN_CLOSES = 15;
export const VOL_FULL_CLOSES = 60;
export const CORR = { shared: 1.0, sector: 0.6, other: 0.3 };
export const SHARED_MIN_WEIGHT = 0.5;
export const VIG_TWO_WAY = 1.045;
export const OVERROUND_FUTURES = 1.2;
export const CLAMP_TWO_WAY = [0.02, 0.98];
export const CLAMP_FUTURES = [0.002, 0.9];
export const H2H_MATCHUPS = 8;
export const OU_PEOPLE = 15;
export const OU_QUANTILES = [0.2, 0.35, 0.5, 0.65, 0.8];
export const MIN_SECTOR_SIZE = 3;
// bet limits (the database enforces them; here for the page and the method text)
// longShots: combined decimal odds >= minDecimal -> at most maxStake coins (place_bet in 0002_book.sql).
export const LIMITS = { minStake: 1, maxStake: 500, maxLegs: 4, maxPayout: 10000, betsPerDay: 50, longShots: STAKE_CAPS };
// price markets
export const OVERROUND_BRACKET = 1.12;
export const BLAST_PCT_PEOPLE = 20;          // % boards: the top 20 draftable by salary
export const LADDER_PEOPLE = 15;             // ladders and brackets: the top 15 of those
export const LADDER_STRIKES = [-10, -5, -2, 2, 5, 10];
export const LADDER_MIN_FAIR = 0.01;         // rungs less likely than 1% are left off
export const BRACKETS = [[null, -5], [-5, -2], [-2, 0], [0, 2], [2, 5], [5, null]];
export const RACE_MAX = 8;
export const RACE_P = [0.03, 0.97];
export const DUEL_MAX = 8;
export const DUEL_SIGMAS = [0.5, 1];
export const BET_CLOSE_NY = '09:30';          // betting closes at the opening bell of the first measured day, New York time

const round4 = x => Math.round(x * 10000) / 10000;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------- deterministic RNG ----------
export function seedFrom(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// standard normals, Box-Muller (both outputs used)
export function normalStream(rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u <= 1e-300) u = rand();
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

// ---------- normal distribution ----------
// erfc, Numerical Recipes (fractional error < 1.2e-7)
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const normCdf = x => 0.5 * erfc(-x / Math.SQRT2);
// inverse normal CDF (Acklam, relative error < 1.2e-9)
export function normInv(p) {
  if (!(p > 0 && p < 1)) throw new Error(`normInv: p must be in (0,1), got ${p}`);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425, hi = 1 - lo;
  let q, r;
  if (p < lo) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > hi) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---------- odds ----------
// American odds from a (vigged) probability, rounded: nearest 5; nearest 25 above +1000; nearest 100 above +5000.
// Never between -100 and +100 (an even-money price is +100).
export function roundAmerican(a) {
  if (!Number.isFinite(a)) throw new Error('bad odds');
  let r;
  if (a > 0) {
    const step = a > 5000 ? 100 : a > 1000 ? 25 : 5;
    r = Math.round(a / step) * step;
  } else {
    r = -Math.round(-a / 5) * 5;
  }
  if (r > -100 && r < 100) r = 100;
  if (r === -100) r = 100;
  return r;
}
export function probToAmerican(p) {
  if (!(p > 0 && p < 1)) throw new Error(`probToAmerican: p must be in (0,1), got ${p}`);
  return roundAmerican(p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p);
}
export function americanToDecimal(a) {
  if (!Number.isInteger(a) || (a > -100 && a < 100)) throw new Error(`bad American odds ${a}`);
  return round4(a > 0 ? 1 + a / 100 : 1 + 100 / -a);
}
export function decimalToAmerican(d) {
  if (!(d > 1)) throw new Error(`bad decimal odds ${d}`);
  return Math.round(d >= 2 ? (d - 1) * 100 : -100 / (d - 1));
}
export const americanToProb = a => (a > 0 ? 100 / (a + 100) : -a / (-a + 100));
const quote = (vigged, fair) => { const am = probToAmerican(vigged); return { americanOdds: am, decimalOdds: americanToDecimal(am), fairProb: round4(fair) }; };

// Two-way market: fair P(A); both sides scaled so they total 104.5%, then clamped to [0.02, 0.98].
export function priceTwoWay(pA) {
  const p = clamp(pA, 0, 1);
  const a = clamp(p * VIG_TWO_WAY, CLAMP_TWO_WAY[0], CLAMP_TWO_WAY[1]);
  const b = clamp((1 - p) * VIG_TWO_WAY, CLAMP_TWO_WAY[0], CLAMP_TWO_WAY[1]);
  return [quote(a, p), quote(b, 1 - p)];
}
// Many-way market (futures, sectors, blasts): fair probabilities (sum 1) scaled to 120% (brackets: 112%), clamped to [0.002, 0.9].
export function priceMultiWay(probs, over = OVERROUND_FUTURES) {
  const sum = probs.reduce((s, x) => s + x, 0) || 1;
  return probs.map(p => { const f = p / sum; return quote(clamp(f * over, CLAMP_FUTURES[0], CLAMP_FUTURES[1]), f); });
}
// One-sided price (ladder rungs, duel alt lines): fair x 1.045, clamped to [0.02, 0.98].
export function priceOneSided(fair) {
  return quote(clamp(fair * VIG_TWO_WAY, CLAMP_TWO_WAY[0], CLAMP_TWO_WAY[1]), fair);
}
// Total implied probability of a set of quoted selections (the "book" percentage).
export const overround = sels => sels.reduce((s, x) => s + americanToProb(x.americanOdds), 0);

// ---------- inputs per person ----------
const tickerKey = t => String(t || '').toUpperCase().replace(/[.\-/]/g, '.');

// Daily volatility (%) of a weighted portfolio from close histories { TICKER: [[date, close], ...] }.
// Holdings without a history are left out when the rest carry >= 80% of the weight (weights renormalized).
// Uses the last 60 returns on dates every included holding has. Returns { vol, closes } (vol null when < 2 returns).
export function realizedVol(holdings, history, asOf) {
  const have = (holdings || []).filter(h => Array.isArray(history[h.ticker]) && history[h.ticker].length);
  const w = have.reduce((s, h) => s + h.weight, 0), wAll = (holdings || []).reduce((s, h) => s + h.weight, 0);
  if (!have.length || !(w > 0) || w < 0.8 * wAll) return { vol: null, closes: 0 };
  const maps = have.map(h => new Map(history[h.ticker].filter(r => Array.isArray(r) && r[0] <= asOf && r[1] > 0).map(r => [r[0], Number(r[1])])));
  let dates = [...maps[0].keys()].filter(d => maps.every(m => m.has(d))).sort();
  dates = dates.slice(-(VOL_FULL_CLOSES + 1));
  const rets = [];
  for (let i = 1; i < dates.length; i++) {
    let r = 0;
    have.forEach((h, j) => { r += (h.weight / w) * (maps[j].get(dates[i]) / maps[j].get(dates[i - 1]) - 1) * 100; });
    rets.push(r);
  }
  if (rets.length < 2) return { vol: null, closes: dates.length };
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  return { vol: Math.sqrt(v), closes: dates.length };
}

export function blendedVol(sector, realized) {
  const def = SECTOR_VOL[sector] ?? DEFAULT_VOL;
  if (!realized || realized.vol == null || realized.closes < VOL_MIN_CLOSES) return { vol: def, weight: 0, def };
  const w = clamp((realized.closes - VOL_MIN_CLOSES) / (VOL_FULL_CLOSES - VOL_MIN_CLOSES), 0, 1);
  return { vol: (1 - w) * def + w * realized.vol, weight: w, def };
}

// Is this Form 4 an open-market buy (transaction code P)? (same rule as the fantasy scoring)
export function isPBuy(f) {
  const f4 = f && f.form4;
  if (!f4) return false;
  return [...(f4.summary ?? []), ...(f4.transactions ?? [])].some(t => t && t.code === 'P');
}
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// Distinct dates with a code-P Form 4 per person, filed in [from, to].
export function pBuyDays(filings, from, to) {
  const out = {};
  for (const f of filings || []) {
    if (!f || !f.personSlug || !f.filed || f.filed < from || f.filed > to || !/^4(\/A)?$/.test(String(f.form || '')) || !isPBuy(f)) continue;
    (out[f.personSlug] = out[f.personSlug] || new Set()).add(f.filed);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.size]));
}

// person: a draftable entry {slug, name, sector, holdings:[{ticker, weight}]}.
// storyCount: matches in the last 20 editions; buyDays: P-buy days in the last 90 days.
export function personModel(person, { history = {}, storyCount = 0, buyDays = 0, asOf }) {
  const rv = realizedVol(person.holdings, history, asOf);
  const bv = blendedVol(person.sector, rv);
  const lambda = buyDays / P_TRADING_DAYS;
  const mu = POINTS.story * storyCount / STORY_EDITIONS + POINTS.insiderBuy * lambda;
  return {
    slug: person.slug, name: person.name, sector: person.sector || 'Other', holdings: person.holdings || [],
    mu, sigma: Math.round(100 * bv.vol * 1e6) / 1e6, vol: bv.vol, volDefault: bv.def, volRealized: rv.vol, closes: rv.closes, volWeight: bv.weight,
    stories: storyCount, buyDays, lambda
  };
}

// ---------- correlation ----------
export function sharesBigHolding(a, b) {
  const big = p => new Set((p.holdings || []).filter(h => h.weight >= SHARED_MIN_WEIGHT).map(h => tickerKey(h.ticker)));
  const A = big(a), B = big(b);
  for (const t of A) if (B.has(t)) return true;
  return false;
}
export function correlation(a, b) {
  if (a.slug === b.slug) return 1;
  if (sharesBigHolding(a, b)) return CORR.shared;
  return a.sector === b.sector ? CORR.sector : CORR.other;
}

// Symmetric eigen-decomposition (cyclic Jacobi). Returns { values, vectors } with vectors[i][k] = component i of vector k.
export function jacobiEigen(M) {
  const n = M.length, A = M.map(r => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}

// A factor matrix F (n x n) with F F^T = the nearest valid correlation matrix to R:
// negative eigenvalues set to 0, then rows rescaled so every variance is exactly 1.
// (The pairwise rule can be inconsistent, e.g. A~B 1.0, B~C 1.0, A~C 0.6; this repairs it.)
export function correlationFactor(R) {
  const n = R.length, { values, vectors } = jacobiEigen(R);
  const F = Array.from({ length: n }, (_, i) => values.map((v, k) => vectors[i][k] * Math.sqrt(Math.max(0, v))));
  for (const row of F) { const s = Math.sqrt(row.reduce((a, x) => a + x * x, 0)) || 1; for (let k = 0; k < n; k++) row[k] /= s; }
  return F;
}

// ---------- Monte Carlo ----------
// models: [personModel] (any order; sorted by slug inside). Calls onSample(totals) for each of n simulated weeks,
// totals indexed like the returned slug list. Weekly total = D*mu + sqrt(D)*sigma*z, z correlated.
export function simulateWeeks(models, { seed, n = MC_N, days = DAYS, onSample }) {
  const people = [...models].sort((a, b) => a.slug.localeCompare(b.slug));
  const k = people.length;
  const R = people.map(a => people.map(b => correlation(a, b)));
  const F = correlationFactor(R);
  const gauss = normalStream(mulberry32(typeof seed === 'number' ? seed : seedFrom(String(seed))));
  const eps = new Float64Array(k), tot = new Float64Array(k);
  const mean = people.map(p => days * p.mu), sd = people.map(p => Math.sqrt(days) * p.sigma);
  for (let s = 0; s < n; s++) {
    for (let j = 0; j < k; j++) eps[j] = gauss();
    for (let i = 0; i < k; i++) {
      const row = F[i];
      let z = 0;
      for (let j = 0; j < k; j++) z += row[j] * eps[j];
      tot[i] = mean[i] + sd[i] * z;
    }
    onSample(tot);
  }
  return people.map(p => p.slug);
}

// P(each person has the top weekly total) and P(each sector has the top average), from one simulation.
export function simulateBoard(models, sectors, { seed, n = MC_N, days = DAYS }) {
  const order = [...models].sort((a, b) => a.slug.localeCompare(b.slug)).map(p => p.slug);
  const idx = Object.fromEntries(order.map((s, i) => [s, i]));
  const secNames = Object.keys(sectors).sort();
  const secIdx = secNames.map(k => sectors[k].map(s => idx[s]).filter(i => i != null));
  const top = new Float64Array(order.length), topSec = new Float64Array(secNames.length);
  // Points are whole numbers, so totals within half a point count as a tie for first: the win is shared equally
  // (people who always score the same, like holders of the same single stock, get the same price).
  simulateWeeks(models, { seed, n, days, onSample(t) {
    let mx = -Infinity;
    for (let i = 0; i < t.length; i++) if (t[i] > mx) mx = t[i];
    let k = 0;
    for (let i = 0; i < t.length; i++) if (t[i] >= mx - 0.5) k++;
    for (let i = 0; i < t.length; i++) if (t[i] >= mx - 0.5) top[i] += 1 / k;
    let bs = -1, bv = -Infinity;
    secIdx.forEach((ids, j) => { let a = 0; for (const i of ids) a += t[i]; a /= ids.length || 1; if (a > bv) { bv = a; bs = j; } });
    if (bs >= 0) topSec[bs]++;
  } });
  return {
    top: Object.fromEntries(order.map((s, i) => [s, top[i] / n])),
    sector: Object.fromEntries(secNames.map((k, j) => [k, topSec[j] / n]))
  };
}

// ---------- closed-form markets ----------
export function weekDist(m, days = DAYS) { return { mean: days * m.mu, sd: Math.sqrt(days) * m.sigma }; }
export function diffDist(a, b, days = DAYS) {
  const r = correlation(a, b);
  const v = days * (a.sigma ** 2 + b.sigma ** 2 - 2 * r * a.sigma * b.sigma);
  return { mean: days * (a.mu - b.mu), sd: Math.sqrt(Math.max(v, 1e-9)), rho: r };
}
const halfPoint = x => Math.floor(x) + 0.5;
// O/U lines at the weekly-points quantiles, on half points, strictly increasing.
export function ladderLines(m, quantiles = OU_QUANTILES, days = DAYS) {
  const { mean, sd } = weekDist(m, days);
  const out = [];
  for (const q of quantiles) {
    let L = halfPoint(mean + sd * normInv(q));
    if (out.length && L <= out[out.length - 1]) L = out[out.length - 1] + 1;
    out.push(L);
  }
  return out;
}
export const probOver = (m, line, days = DAYS) => { const { mean, sd } = weekDist(m, days); return 1 - normCdf((line - mean) / sd); };

// Head-to-head pairs: draftable sorted by salary (high to low, then slug), each paired with the next one down
// that is not a 1.0-correlation partner. Up to `count` pairs, from the top.
export function pickMatchups(models, salaries, count = H2H_MATCHUPS) {
  const sal = s => Number(salaries[s]) || 0;
  const list = [...models].filter(m => salaries[m.slug] != null).sort((a, b) => sal(b.slug) - sal(a.slug) || a.slug.localeCompare(b.slug));
  const used = new Set(), out = [];
  for (let i = 0; i < list.length && out.length < count; i++) {
    const a = list[i];
    if (used.has(a.slug)) continue;
    const b = list.slice(i + 1).find(x => !used.has(x.slug) && correlation(a, x) < CORR.shared);
    if (!b) continue;
    used.add(a.slug); used.add(b.slug);
    out.push([a, b]);
  }
  return out;
}

// ---------- price markets ----------
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dow = s => new Date(`${s}T12:00:00Z`).getUTCDay();
const bySlug = (a, b) => a.slug.localeCompare(b.slug);
// The weekday before `date` (Monday -> the Friday before). Market holidays are not skipped.
export function prevWeekday(date) {
  let d = addDays(date, -1);
  while (dow(d) === 0 || dow(d) === 6) d = addDays(d, -1);
  return d;
}
// Monday-Friday dates from week.start to week.end.
export function weekdaysOf(week) {
  const out = [];
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) if (dow(d) >= 1 && dow(d) <= 5) out.push(d);
  return out;
}
// Betting closes at the opening bell: 9:30 AM New York on the from (first measured) date, as ISO UTC (DST-correct).
export const closesAtFor = from => nyToUtc(from, BET_CLOSE_NY).toISOString();
const dayLabel = s => `${DOW[dow(s)]} ${monDay(s)}`;
export const basketOf = m => (m.holdings || []).filter(h => h && h.ticker && Number(h.weight) > 0).map(h => ({ ticker: h.ticker, weight: Number(h.weight) }));
const fmtB = x => (Number.isInteger(x) ? String(x) : x.toFixed(1));

// Simulated returns (%) over `days` trading days; people need {slug, sector, holdings, vol}.
function simReturns(people, { seed, n, days, onSample }) {
  return simulateWeeks(people.map(p => ({ slug: p.slug, sector: p.sector, holdings: p.holdings, mu: 0, sigma: p.vol })), { seed, n, days, onSample });
}
// P(each person has the biggest gain (side 'up') or the biggest drop ('down')) of % return, or of dollar change when
// scale = { slug: tracked value } is given. Ties (people with the same basket; within 1e-5 relative, which absorbs the
// correlation repair's rounding) share the win equally.
export function blastProbs(people, { seed, n = MC_N, days = DAYS, side = 'up', scale = null }) {
  const order = [...people].sort(bySlug);
  const k = order.length, sc = order.map(p => (scale ? scale[p.slug] / 100 : 1)), win = new Float64Array(k), x = new Float64Array(k);
  const sgn = side === 'down' ? -1 : 1;
  simReturns(order, { seed, n, days, onSample(t) {
    let best = -Infinity;
    for (let i = 0; i < k; i++) { x[i] = sgn * t[i] * sc[i]; if (x[i] > best) best = x[i]; }
    const tol = 1e-5 * Math.max(1, Math.abs(best));
    let c = 0;
    for (let i = 0; i < k; i++) if (x[i] >= best - tol) c++;
    for (let i = 0; i < k; i++) if (x[i] >= best - tol) win[i] += 1 / c;
  } });
  return Object.fromEntries(order.map((p, i) => [p.slug, win[i] / n]));
}
// P(the chaser's tracked value ends above the leader's) after `days` trading days; people need value0 too.
export function raceProb(chaser, leader, { seed, n = MC_N, days = DAYS }) {
  const order = [chaser, leader].sort(bySlug);
  const ci = order[0] === chaser ? 0 : 1, li = 1 - ci;
  let yes = 0;
  simReturns(order, { seed, n, days, onSample(t) { if (chaser.value0 * (1 + t[ci] / 100) > leader.value0 * (1 + t[li] / 100)) yes++; } });
  return yes / n;
}
const bucketLabel = (lo, hi) => {
  if (lo == null) return `Down more than ${-hi}%`;
  if (hi == null) return `Up ${lo}% or more`;
  if (hi <= 0) return hi === 0 ? `Down less than ${-lo}%` : `Down ${-hi}% to ${-lo}%`;
  return lo === 0 ? `Flat or up less than ${hi}%` : `Up ${lo}% to ${hi}%`;
};

// The price-market events of a week. models: personModel list (with holdings and vol); est: data/prices/networth-est.json
// (for the dollar pool, may be null); overrides: config/wealth-overrides.json .people. Returns { events, pool }.
export function buildPriceMarkets({ W, week, models, history = {}, est = null, overrides = {}, n = MC_N }) {
  const events = [];
  const salary = s => Number(week.salaries && week.salaries[s]) || 0;
  const bySal = (x, y) => salary(y.slug) - salary(x.slug) || x.slug.localeCompare(y.slug);
  const byslug = Object.fromEntries(models.map(m => [m.slug, m]));
  const days = weekdaysOf(week);
  const wDays = days.length || DAYS;
  const wFrom = week.start, wTo = week.end;                  // open of the first weekday -> close of the last
  const wClose = closesAtFor(wFrom);
  const pctPool = models.filter(m => basketOf(m).length).sort(bySal).slice(0, BLAST_PCT_PEOPLE);

  // dollar pool: networth-est people with coverage >= 40% who are draftable (for the basket), valued at the latest close
  const usdPool = [];
  for (const { slug, wealth } of dollarPool(est)) {
    const m = byslug[slug];
    if (!m || !basketOf(m).length) continue;
    const tickers = wealth.method === 'worth' ? [wealth.ticker] : Object.keys(wealth.shares);
    const d = prevTradingClose(history, tickers, week.start);
    const v = d ? trackedValue(wealth, history, d) : null;
    if (!(v > 0)) continue;
    const ov = overrides && overrides[slug];
    usdPool.push({ ...m, wealth, value0: Math.round(v), value0Date: d, ...(ov && ov.note ? { wealthNote: ov.note, wealthSource: ov.source || null } : {}) });
  }
  usdPool.sort((a, b) => b.value0 - a.value0 || a.slug.localeCompare(b.slug));

  const measure = {
    pct: 'the % change of each person\'s holdings basket (the fantasy weights)',
    usd: 'the change in each person\'s tracked stock wealth (share counts from SEC filings x share price, or published net worth x one stock where a family stake is not split in filings)'
  };
  const span = (from, to) => `from the opening price on ${dayLabel(from)} to the closing price on ${dayLabel(to)}, from our daily price data`;

  // 1. blasts: biggest gainer / loser boards
  const blast = (metric, side, period, from, to, pool, nDays, title) => {
    if (pool.length < 2) return;
    const id = `${W}:blast:${metric}:${side}:${period}`;
    const probs = blastProbs(pool, { seed: id, n, days: nDays, side, scale: metric === 'usd' ? Object.fromEntries(pool.map(m => [m.slug, m.value0])) : null });
    const order = [...pool].sort((x, y) => probs[y.slug] - probs[x.slug] || x.slug.localeCompare(y.slug));
    const q = priceMultiWay(order.map(m => probs[m.slug]));
    events.push({
      id, type: 'blast', title, group: 'blasts', closesAt: closesAtFor(from),
      params: { metric, side, period, from, to, start: 'open', slugs: order.map(m => m.slug),
        ...(metric === 'usd' ? { wealth: Object.fromEntries(order.map(m => [m.slug, m.wealth])) } : { baskets: Object.fromEntries(order.map(m => [m.slug, basketOf(m)])) }) },
      selections: order.map((m, i) => ({ id: `${id}:${m.slug}`, label: m.name, market: 'pick', person: m.slug, ...q[i] })),
      settlesFrom: `${measure[metric][0].toUpperCase()}${measure[metric].slice(1)}, ${span(from, to)}. The biggest ${side === 'up' ? 'gain' : 'drop'} wins. ` +
        'A tie voids the tied picks; a missing opening or closing price voids the market.'
    });
  };
  const sym = { pct: '%', usd: '$' };
  for (const [metric, side] of [['pct', 'up'], ['pct', 'down'], ['usd', 'up'], ['usd', 'down']]) {
    blast(metric, side, 'week', wFrom, wTo, metric === 'usd' ? usdPool : pctPool, wDays, `Biggest ${sym[metric]} ${side === 'up' ? 'gainer' : 'loser'} this week`);
  }
  for (const d of days) {
    for (const metric of ['pct', 'usd']) {
      blast(metric, 'up', d, d, d, metric === 'usd' ? usdPool : pctPool, 1, `Biggest ${sym[metric]} gainer today (${dayLabel(d)})`);
    }
  }

  // 2 + 3. ladders and brackets: the week's % move, one card per person
  for (const m of pctPool.slice(0, LADDER_PEOPLE)) {
    const sd = m.vol * Math.sqrt(wDays), basket = basketOf(m);
    const base = `${measure.pct.replace('each person\'s', `${m.name}'s`)}, ${span(wFrom, wTo)}`;
    const id = `${W}:ladder:${m.slug}`;
    const sels = [];
    for (const K of LADDER_STRIKES) {
      const fair = K > 0 ? 1 - normCdf(K / sd) : normCdf(K / sd);
      if (fair < LADDER_MIN_FAIR) continue;
      sels.push({ id: `${id}:${K > 0 ? 'up' : 'down'}${Math.abs(K)}`, label: K > 0 ? `Up ${K}% or more` : `Down ${-K}% or more`,
        market: 'strike', person: m.slug, line: K, ...priceOneSided(fair) });
    }
    if (sels.length >= 2) {
      events.push({ id, type: 'ladder', title: `${m.name}: this week's move`, group: 'ladders', closesAt: wClose,
        params: { slug: m.slug, from: wFrom, to: wTo, start: 'open', basket }, selections: sels,
        settlesFrom: `${base[0].toUpperCase()}${base.slice(1)}. "Up 5% or more" wins at +5.00% or higher; "Down 5% or more" at −5.00% or lower. A missing opening or closing price voids the market.` });
    }
    const bid = `${W}:bracket:${m.slug}`;
    const probs = BRACKETS.map(([lo, hi]) => (hi == null ? 1 : normCdf(hi / sd)) - (lo == null ? 0 : normCdf(lo / sd)));
    const q = priceMultiWay(probs, OVERROUND_BRACKET);
    const buckets = {};
    const bsels = BRACKETS.map(([lo, hi], i) => {
      const sid = `${bid}:r${i}`;
      buckets[sid] = [lo, hi];
      return { id: sid, label: bucketLabel(lo, hi), market: 'bracket', person: m.slug, ...q[i] };
    });
    events.push({ id: bid, type: 'bracket', title: `${m.name}: this week's range`, group: 'ladders', closesAt: wClose,
      params: { slug: m.slug, from: wFrom, to: wTo, start: 'open', basket, buckets }, selections: bsels,
      settlesFrom: `${base[0].toUpperCase()}${base.slice(1)}. Each range includes its lower end (a move of exactly −2.00% is "Down less than 2%"; exactly +2.00% is "Up 2% to 5%"). A missing opening or closing price voids the market.` });
  }

  // 4. races: will the next one down pass the one above (tracked value at the week's last close; no start price)?
  let nRace = 0;
  for (let i = 0; i + 1 < usdPool.length && nRace < RACE_MAX; i++) {
    const leader = usdPool[i], chaser = usdPool[i + 1];
    const id = `${W}:race:${chaser.slug}:${leader.slug}`;
    const p = raceProb(chaser, leader, { seed: id, n, days: wDays });
    if (p < RACE_P[0] || p > RACE_P[1]) continue;
    const [y, no] = priceTwoWay(p);
    events.push({ id, type: 'race', title: `Will ${chaser.name} pass ${leader.name} by ${DOW_LONG[dow(wTo)]}'s close?`, group: 'races', closesAt: wClose,
      params: { chaser: chaser.slug, leader: leader.slug, from: wFrom, to: wTo,
        value0: { [chaser.slug]: chaser.value0, [leader.slug]: leader.value0 }, value0Date: leader.value0Date === chaser.value0Date ? leader.value0Date : null,
        wealth: { [chaser.slug]: chaser.wealth, [leader.slug]: leader.wealth } },
      selections: [
        { id: `${id}:yes`, label: 'Yes', market: 'yes', person: chaser.slug, ...y },
        { id: `${id}:no`, label: 'No', market: 'no', ...no }
      ],
      settlesFrom: `Tracked stock wealth (share counts from SEC filings x closing price, or published net worth x one stock where a family stake is not split in filings) at the ${dayLabel(wTo)} close, from our daily price data. Yes if ${chaser.name} is strictly above ${leader.name}. A missing close voids the market.` });
    nRace++;
  }

  // 5. duels: dollar head-to-heads between people of similar tracked value (never two who move as one)
  const used = new Set();
  let nDuel = 0;
  for (let i = 0; i < usdPool.length && nDuel < DUEL_MAX; i++) {
    const a = usdPool[i];
    if (used.has(a.slug)) continue;
    const b = usdPool.slice(i + 1).find(x => !used.has(x.slug) && correlation(a, x) < CORR.shared);
    if (!b) continue;
    used.add(a.slug); used.add(b.slug);
    const rho = correlation(a, b);
    const sa = a.value0 * a.vol * Math.sqrt(wDays) / 100, sb = b.value0 * b.vol * Math.sqrt(wDays) / 100;
    const sd = Math.sqrt(Math.max(sa * sa + sb * sb - 2 * rho * sa * sb, 1));
    const id = `${W}:duel:${a.slug}:${b.slug}`;
    const [mlA, mlB] = priceTwoWay(1 - normCdf(0));
    const sels = [
      { id: `${id}:ml:${a.slug}`, label: `${a.name} to win`, market: 'ml', person: a.slug, ...mlA },
      { id: `${id}:ml:${b.slug}`, label: `${b.name} to win`, market: 'ml', person: b.slug, ...mlB }
    ];
    const lines = [...new Set(DUEL_SIGMAS.map(k => Math.round(k * sd / 1e9 * 2) / 2))].filter(x => x > 0).sort((x, y) => x - y);
    for (const X of lines) {
      const fair = 1 - normCdf(X * 1e9 / sd);
      if (fair < LADDER_MIN_FAIR) continue;
      for (const m of [a, b]) {
        sels.push({ id: `${id}:by:${m.slug}:${X}`, label: `${m.name} by $${fmtB(X)}B+`, market: 'by', person: m.slug, line: X, ...priceOneSided(fair) });
      }
    }
    events.push({ id, type: 'duel', title: `${a.name} vs ${b.name}: dollar change this week`, group: 'races', closesAt: wClose,
      params: { a: a.slug, b: b.slug, from: wFrom, to: wTo, start: 'open', rho, value0: { [a.slug]: a.value0, [b.slug]: b.value0 },
        wealth: { [a.slug]: a.wealth, [b.slug]: b.wealth } },
      selections: sels,
      settlesFrom: `Change in tracked stock wealth (share counts from SEC filings x share price, or published net worth x one stock where a family stake is not split in filings) ${span(wFrom, wTo)}. ` +
        'To win: the bigger dollar gain (or smaller loss); a tie is void. "By $XB+": wins by more than X billion dollars; exactly X is void. A missing opening or closing price voids the market.' });
    nDuel++;
  }

  return { events, pool: { pct: pctPool.map(m => m.slug), usd: usdPool } };
}

// ---------- the book ----------
const cleanName = n => String(n || '').replace(/\s*&\s*family\s*$/i, '').trim();
const fmtLine = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monDay = s => { const [, m, d] = s.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };

export const METHOD_TEXT =
  'Each person\'s daily fantasy points are modeled as a normal distribution. The average is the bonus they tend to earn: ' +
  '10 points per story over the last 20 editions (divided by 20) plus 25 points per insider-buy day (Form 4, code P) over ' +
  'the last 90 days (divided by 63 trading days). Price moves average zero. The spread is 100 x the daily volatility of their ' +
  'holdings: measured from our price history when there are at least 15 daily closes (blended with a sector default until 60), ' +
  'otherwise the sector default (AI & tech 2.2%, Aerospace and Autos 3.0%, Finance 1.3%, Luxury & retail 1.5%, Health and ' +
  'Real estate 1.6%, others 1.8%). The week is the sum of 5 days. People move together: correlation 0.6 in the same sector, 0.3 ' +
  'otherwise, 1.0 when they share a main holding (those pairs never meet head-to-head). Matchups, spreads and over/unders use the ' +
  'normal formula; top scorer and top sector use 20,000 simulated weeks (seeded, so the same data gives the same odds); the ' +
  'insider-buy prop uses the daily buy rate (Poisson). Two-way prices carry a 4.5% house margin (-110 both sides at 50/50), ' +
  'many-way prices 20%. Odds are rounded to the nearest 5 (25 above +1000, 100 above +5000). ' +
  'Price markets (biggest gainer and loser boards, move ladders and ranges, rank races, dollar duels) follow each person\'s ' +
  'holdings basket (the fantasy weights): its change is modeled as a normal distribution centred on zero with the ' +
  'same daily volatility, times the square root of the trading days for a week, with the same correlations. Dollar markets ' +
  'multiply by tracked stock wealth: share counts from SEC filings times the share price, or, where a family stake is not ' +
  'split in filings, the published net worth moved by that stock. Boards and races use 20,000 simulated outcomes (seeded); ' +
  'ladders, ranges and duels use the normal formula. Ladder rungs and duel lines carry a 4.5% margin each, ranges 12%, boards 20%. ' +
  'Measured from the opening price on the first day to the closing price on the last day; betting closes at the opening bell ' +
  '(9:30 AM New York). Weekly markets run from Monday\'s open to Friday\'s close (races compare tracked wealth at Friday\'s ' +
  'close), daily boards from that day\'s open to its close. A missing opening or closing price (market holiday or data gap) ' +
  'makes the market void (stake back). Stakes: up to 500 coins; ' +
  '150 when the combined odds pay 6x or more (decimal 6.0, +500); 50 when they pay 21x or more (decimal 21.0, +2000). ' +
  'Play money only; not a forecast and not advice.';

// Build the week's book.
// week: data/fantasy/weeks/<W>.json; history: { TICKER: [[date, close]] }; editions: [{ date, stories }] (newest last or any order);
// filings: data/filings/latest.json .filings; storyMatches(story, name) -> bool; generated: ISO string (from the inputs);
// est: data/prices/networth-est.json (dollar markets; none without it); overrides: config/wealth-overrides.json .people.
export function buildBook({ week, history = {}, editions = [], filings = [], storyMatches, generated, n = MC_N, est = null, overrides = {} }) {
  const asOf = addDays(week.start, -1);
  const pFrom = addDays(asOf, -(P_LOOKBACK_DAYS - 1));
  const buys = pBuyDays(filings, pFrom, asOf);
  const eds = [...editions].filter(e => e && e.date && e.date <= asOf).sort((a, b) => a.date.localeCompare(b.date)).slice(-STORY_EDITIONS);
  const draftable = (week.draftable || []).filter(p => p && p.slug && week.salaries && week.salaries[p.slug] != null)
    .map(p => ({ ...p, name: cleanName(p.name || p.slug), sector: p.sector || 'Other' }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const models = draftable.map(p => {
    let stories = 0;
    for (const e of eds) for (const s of Array.isArray(e.stories) ? e.stories : []) if (storyMatches(s, p.name)) stories++;
    return personModel(p, { history, storyCount: stories, buyDays: buys[p.slug] || 0, asOf });
  });
  const byslug = Object.fromEntries(models.map(m => [m.slug, m]));
  const W = week.week;
  const events = [];
  const range = `${monDay(week.start)}–${monDay(week.end)}`;
  const settlesPoints = `Fantasy points for ${range} (Monday to Friday), from our fantasy league data.`;

  // 1. head-to-head: moneyline + spread in one event
  for (const [a, b] of pickMatchups(models, week.salaries)) {
    const d = diffDist(a, b);
    const pA = 1 - normCdf(-d.mean / d.sd);                       // P(A - B > 0)
    const [mlA, mlB] = priceTwoWay(pA);
    const favA = d.mean >= 0, fav = favA ? a : b, dog = favA ? b : a;
    const s = halfPoint(Math.abs(d.mean));
    const pCover = 1 - normCdf((s - Math.abs(d.mean)) / d.sd);    // P(fav - dog > s)
    const [spF, spD] = priceTwoWay(pCover);
    const id = `${W}:h2h:${a.slug}:${b.slug}`;
    const spFav = { id: `${id}:sp:${fav.slug}`, label: `${fav.name} ${fmtLine(-s)}`, market: 'spread', person: fav.slug, line: -s, ...spF };
    const spDog = { id: `${id}:sp:${dog.slug}`, label: `${dog.name} ${fmtLine(s)}`, market: 'spread', person: dog.slug, line: s, ...spD };
    events.push({
      id, type: 'h2h', title: `${a.name} vs ${b.name}`, group: 'matchups',
      params: { a: a.slug, b: b.slug, rho: d.rho },
      selections: [
        { id: `${id}:ml:${a.slug}`, label: `${a.name} to win`, market: 'ml', person: a.slug, ...mlA },
        { id: `${id}:ml:${b.slug}`, label: `${b.name} to win`, market: 'ml', person: b.slug, ...mlB },
        ...(favA ? [spFav, spDog] : [spDog, spFav])
      ],
      settlesFrom: `${settlesPoints} Moneyline: more points wins; a tie is void (stake back). Spread: points plus the line.`
    });
  }

  // 2. player weekly points, over/under ladder (one event per person)
  const bySal = [...models].sort((x, y) => week.salaries[y.slug] - week.salaries[x.slug] || x.slug.localeCompare(y.slug));
  for (const m of bySal.slice(0, OU_PEOPLE)) {
    const id = `${W}:ou:${m.slug}`;
    const sels = [];
    for (const L of ladderLines(m)) {
      const [o, u] = priceTwoWay(probOver(m, L));
      sels.push({ id: `${id}:o:${L}`, label: `Over ${L.toFixed(1)}`, market: 'over', person: m.slug, line: L, ...o });
      sels.push({ id: `${id}:u:${L}`, label: `Under ${L.toFixed(1)}`, market: 'under', person: m.slug, line: L, ...u });
    }
    events.push({ id, type: 'player_ou', title: `${m.name}: weekly points`, group: 'player', params: { slug: m.slug }, selections: sels,
      settlesFrom: `${m.name}'s ${settlesPoints}` });
  }

  // 3 + 4b. simulation: top scorer and top sector
  const members = {};
  for (const m of models) (members[m.sector] = members[m.sector] || []).push(m.slug);
  const sectors = Object.fromEntries(Object.keys(members).filter(k => members[k].length >= MIN_SECTOR_SIZE).sort().map(k => [k, members[k].sort()]));
  const sim = simulateBoard(models, sectors, { seed: W, n });

  {
    const id = `${W}:top`;
    const order = [...models].sort((x, y) => sim.top[y.slug] - sim.top[x.slug] || x.slug.localeCompare(y.slug));
    const q = priceMultiWay(order.map(m => sim.top[m.slug]));
    events.push({ id, type: 'futures_top', title: 'Top scorer of the week', group: 'futures', params: { slugs: order.map(m => m.slug) },
      selections: order.map((m, i) => ({ id: `${id}:${m.slug}`, label: m.name, market: 'pick', person: m.slug, ...q[i] })),
      settlesFrom: `${settlesPoints} The draftable person with the most points wins. A tie for first is void for the tied picks.` });
  }

  // 4a. insider buy by Friday: people with >= 1 code-P Form 4 day in the last 90 days
  for (const m of [...models].filter(x => x.buyDays > 0).sort((x, y) => y.buyDays - x.buyDays || x.slug.localeCompare(y.slug))) {
    const id = `${W}:buy:${m.slug}`;
    const pYes = 1 - Math.exp(-DAYS * m.lambda);
    const [y, no] = priceTwoWay(pYes);
    events.push({ id, type: 'prop_insider', title: `${m.name}: insider buy by Friday?`, group: 'props',
      params: { slug: m.slug, from: week.start, to: week.end, recentBuyDays: m.buyDays },
      selections: [
        { id: `${id}:yes`, label: 'Yes', market: 'yes', person: m.slug, ...y },
        { id: `${id}:no`, label: 'No', market: 'no', person: m.slug, ...no }
      ],
      settlesFrom: `SEC EDGAR: a Form 4 from ${m.name} showing an open-market purchase (code P), filed ${range}. A Form 4 we cannot read in detail makes it void.` });
  }

  // 4b. top sector
  const secNames = Object.keys(sectors);
  if (secNames.length >= 2) {
    const id = `${W}:sector`;
    const order = [...secNames].sort((x, y) => sim.sector[y] - sim.sector[x] || x.localeCompare(y));
    const q = priceMultiWay(order.map(k => sim.sector[k]));
    events.push({ id, type: 'prop_sector', title: 'Top sector of the week', group: 'props', params: { members: sectors },
      selections: order.map((k, i) => ({ id: `${id}:${k.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label: k, market: 'pick', sector: k, ...q[i] })),
      settlesFrom: `${settlesPoints} Highest average points per draftable person in the sector (sectors with 3 or more). A tie for first is void for the tied picks.` });
  }

  // 5-9. price markets (blast, ladder, bracket, race, duel)
  const price = buildPriceMarkets({ W, week, models, history, est, overrides, n });
  events.push(...price.events);
  const usd = Object.fromEntries(price.pool.usd.map(m => [m.slug, m]));

  events.forEach((e, i) => { e.sort = i; e.selections.forEach((s, j) => { s.sort = j; }); });
  return {
    week: W, start: week.start, end: week.end, locksAt: new Date(week.locksAt).toISOString(), generated,
    asOf, method: METHOD_TEXT, limits: LIMITS,
    model: Object.fromEntries(models.map(m => [m.slug, {
      name: m.name, sector: m.sector, mu: round4(m.mu), sigma: round4(m.sigma), vol: round4(m.vol), closes: m.closes, stories: m.stories, buyDays: m.buyDays,
      basket: basketOf(m),
      ...(usd[m.slug] ? { wealth: usd[m.slug].wealth, value0: usd[m.slug].value0, value0Date: usd[m.slug].value0Date,
        ...(usd[m.slug].wealthNote ? { wealthNote: usd[m.slug].wealthNote, wealthSource: usd[m.slug].wealthSource } : {}) } : {})
    }])),
    events
  };
}
