// Billionaire Fantasy League: data-side rules for scripts/build-fantasy.mjs (and the symbol list in fetch-prices.mjs).
// Game only. Portfolios are the current, disclosed holdings in data/people/*.json that have a daily market price.
// Calendar, lock, cap, captain and perfect-team rules live in assets/fantasy-core.js so the page and the build share them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT, holdingSymbols, parseShareCount, isKnownAdr, KNOWN_ADRS } from './data-common.mjs';
import { isFormerEntry, isNoteEntry, headOf, companyNorm, parseTickers, tickerKey, NAME_ALIASES } from './pages/companies.mjs';

// ---- shared core (ES5 file, also served to the browser) ----
function loadCore() {
  if (!globalThis.BDFantasyCore) vm.runInThisContext(readFileSync(join(ROOT, 'assets', 'fantasy-core.js'), 'utf8'), { filename: 'fantasy-core.js' });
  return globalThis.BDFantasyCore;
}
export const core = loadCore();

export const BENCHMARK_SYMBOL = 'SPY';

// Company names (normalized with companyNorm) that mean a US ticker, on top of companies.mjs NAME_ALIASES.
export const EXTRA_NAME_ALIASES = {
  'berkshire hathaway': 'BRK.B', 'berkshire': 'BRK.B',
  'google': 'GOOGL', 'alphabet': 'GOOGL', 'alphabet google': 'GOOGL',
  'meta platforms': 'META', 'facebook': 'META', 'meta': 'META',
  'spacex': 'SPCX', 'space exploration technologies': 'SPCX',
};

// US ADR / OTC lines used FOR DAILY RETURNS ONLY (a percent change is valid; share-count values are not).
// Keyed by the local ticker in the profile and by the normalized company name.
export const ADR_BY_LOCAL = {
  'MC': 'LVMUY', 'CDI': 'CHDRY', 'ITX': 'IDEXY', 'OR': 'LRLCY', 'KER': 'PPRUY', 'RMS': 'HESAY', 'NESN': 'NSRGY',
  '0700': 'TCEHY', '80700': 'TCEHY', '9988': 'BABA', '9999': 'NTES', '9983': 'FRCOY', '7203': 'TM', '6758': 'SONY',
  '005930': 'SSNLF', '9984': 'SFTBY',
};
export const ADR_BY_NAME = {
  'lvmh': 'LVMUY', 'lvmh moet hennessy louis vuitton': 'LVMUY',
  'christian dior': 'CHDRY',
  'inditex': 'IDEXY', 'industria de diseno textil': 'IDEXY',
  'l oreal': 'LRLCY', 'loreal': 'LRLCY',
  'kering': 'PPRUY',
  'hermes': 'HESAY', 'hermes international': 'HESAY',
  'nestle': 'NSRGY',
  'tencent': 'TCEHY',
  'alibaba': 'BABA',
  'pdd': 'PDD', 'pinduoduo': 'PDD',
  'netease': 'NTES',
  'samsung electronics': 'SSNLF',
  'toyota motor': 'TM', 'toyota': 'TM',
  'sony': 'SONY',
  'fast retailing': 'FRCOY',
  'softbank': 'SFTBY',
};
// Never mapped: no usable US line for daily returns.
export const ADR_SKIP = new Set(['reliance industries', 'reliance', 'contemporary amperex technology', 'catl']);

const nameKey = (h) => companyNorm(headOf(h.name).head);
const nameAlias = (n) => EXTRA_NAME_ALIASES[n] || NAME_ALIASES[n] || null;

// Current holdings: controls + stakes that are not former and not notes.
export function currentHoldings(profile) {
  return [...(profile?.controls ?? []), ...(profile?.stakes ?? [])].filter((h) => h && !isNoteEntry(h) && !isFormerEntry(h));
}

// Candidate quote symbols for one holding, in preference order, as [{ ticker, adr }] (quotes not consulted).
export function holdingCandidates(h) {
  const out = [];
  const push = (ticker, adr) => { if (ticker && !out.some((c) => c.ticker === ticker)) out.push({ ticker, adr }); };
  // (a) US ticker as fetch-prices treats it (plus its share-class alias)
  for (const s of holdingSymbols(h).symbols) { push(tickerKey(s), false); push(s, false); }
  // (b) company-name aliases (Alphabet/Google -> GOOGL, Berkshire -> BRK.B, SpaceX -> SPCX, ...)
  const n = nameKey(h);
  const alias = nameAlias(n);
  if (alias && !ADR_SKIP.has(n)) {
    if (ADR_BY_LOCAL[alias]) push(ADR_BY_LOCAL[alias], true); // an alias to a non-US ticker (Inditex -> ITX -> IDEXY)
    else push(alias, false);
  }
  // (c) curated ADR map, returns only
  if (!ADR_SKIP.has(n)) {
    for (const t of parseTickers(h.ticker)) if (ADR_BY_LOCAL[t.sym]) push(ADR_BY_LOCAL[t.sym], true);
    if (ADR_BY_NAME[n]) push(ADR_BY_NAME[n], true);
  }
  return out;
}

// Resolve a holding to one quoted symbol. `quoted` is a Set (or object) of symbols with a quote.
// Returns { ticker, adr } or null.
export function resolveHoldingTicker(h, quoted) {
  const has = (t) => (quoted instanceof Set ? quoted.has(t) : !!(quoted && quoted[t]));
  for (const c of holdingCandidates(h)) if (has(c.ticker)) return c;
  return null;
}

// Every symbol the game may need a quote for (for fetch-prices): candidates of all current holdings, plus SPY.
export function fantasySymbols(profiles) {
  const set = new Set([BENCHMARK_SYMBOL]);
  for (const p of profiles) for (const h of currentHoldings(p)) for (const c of holdingCandidates(h)) set.add(c.ticker);
  return [...set].sort();
}

// A person's priced portfolio. quotes: { SYM: { price, changePct, time } }.
// Returns { holdings: [{ ticker, name, weight, adr, tier, value|null }], method } (holdings empty when none is priced).
// Weights:
//  - "value-weighted": every priced holding has an exact share count on a non-ADR line -> shares × price.
//  - otherwise "controls-weighted (75/25)": holdings from `controls` together get 75% and holdings from `stakes`
//    25% (a person with only one tier gives it 100%). Inside a tier, holdings split by value when every holding in
//    that tier has a value, otherwise equally.
// A company listed in both groups (or twice) counts once, in the first group it appears in (controls first).
export const TIER_SHARE = { controls: 0.75, stakes: 0.25 };
export const METHOD_VALUE = 'value-weighted';
export const METHOD_TIERED = 'controls-weighted (75/25)';

export function personPortfolio(profile, quotes, adrs = KNOWN_ADRS) {
  const byKey = new Map();
  for (const tier of ['controls', 'stakes']) {
    for (const h of currentHoldings({ [tier]: profile?.[tier] })) {
      const r = resolveHoldingTicker(h, quotes);
      if (!r) continue;
      const key = tickerKey(r.ticker);
      const parsed = parseShareCount(h.stake) ?? parseShareCount(h.name);
      const price = quotes[r.ticker]?.price;
      const isAdrLine = r.adr || (isKnownAdr(r.ticker, adrs) && !/\b(ADSs?|ADRs?|American Depositary)\b/i.test(`${h.name ?? ''} ${h.stake ?? ''}`));
      const value = !isAdrLine && parsed && typeof price === 'number' && price > 0 ? parsed.shares * price : null;
      const prev = byKey.get(key);
      if (prev) {
        if (value != null && (prev.value == null || value > prev.value)) prev.value = value;
        continue;
      }
      byKey.set(key, { ticker: r.ticker, name: headOf(h.name).head, adr: !!r.adr, tier, value });
    }
  }
  const list = [...byKey.values()];
  if (!list.length) return { holdings: [], method: null };
  const hasValue = (x) => x.value != null && x.value > 0;
  const split = (items, share) => {
    const valued = items.every(hasValue);
    const total = valued ? items.reduce((s, x) => s + x.value, 0) : items.length;
    for (const x of items) x.weight = share * (valued ? x.value : 1) / total;
  };
  let method;
  if (list.every(hasValue)) {
    split(list, 1);
    method = METHOD_VALUE;
  } else {
    const c = list.filter((x) => x.tier === 'controls'), st = list.filter((x) => x.tier === 'stakes');
    if (c.length && st.length) { split(c, TIER_SHARE.controls); split(st, TIER_SHARE.stakes); }
    else split(c.length ? c : st, 1);
    method = METHOD_TIERED;
  }
  const holdings = list
    .map((x) => ({ ticker: x.ticker, name: x.name, adr: x.adr, tier: x.tier, value: x.value == null ? null : Math.round(x.value), weight: Math.min(1, x.weight) }))
    .sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));
  return { holdings, method };
}

// ---- daily scoring ----
// A day's points come from our own closes (data/prices/history): previous trading day's close -> that day's close.
// No story bonus (removed 2026-10-12); an insider buy (Form 4, code P, filed that day) adds +25.
export const POINTS = { insiderBuy: 25 };
export const pricePoints = (returnPct) => Math.round(returnPct * 100);
// Sanity guard: a one-day move bigger than this (in %) is quarantined (scored 0 and flagged), never scored.
export const MAX_DAY_MOVE_PCT = 40;

// Story matching, same rule as BD.storyMatches in assets/common.js (news counts in the draft room; not scored).
const normName = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const coreName = (x) => normName(String(x ?? '').replace(/\s*&\s*family\s*$/i, ''));
export function storyMatches(story, name) {
  const n = coreName(name);
  if (!n || !story) return false;
  if (normName(story.who).indexOf(n) >= 0) return true;
  return (Array.isArray(story.people) ? story.people : []).some((p) => coreName(p) === n);
}

// True when the person has a Form 4 with an open-market buy (code P) filed on `date`.
export function hasInsiderBuy(filings, slug, date) {
  return (filings ?? []).some((f) => f && f.personSlug === slug && f.filed === date && f.form4 &&
    [...(f.form4.summary ?? []), ...(f.form4.transactions ?? [])].some((t) => t && t.code === 'P'));
}

// history: { SYM: Map(date -> close) | [[date, close]] } (or a Map of those). Returns the close or null.
export function closeOn(history, sym, date) {
  const s = history instanceof Map ? history.get(sym) : history?.[sym];
  if (!s) return null;
  const v = s instanceof Map ? s.get(date) : (Array.isArray(s) ? (s.find((r) => r && r[0] === date) || [])[1] : undefined);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

// One ticker's move on trading day `date`, close to close. conflicts: quality.json conflicts ({ SYM: { date: {...} } }).
// Returns { changePct, prevClose, close } or { changePct: 0, stale: true } (a close is missing) or
// { changePct: 0, quarantined: true, reason } (sanity guard).
export function tickerMove(history, conflicts, sym, date) {
  const prevDate = core.prevTradingDay(date);
  const prev = closeOn(history, sym, prevDate), cur = closeOn(history, sym, date);
  if (prev == null || cur == null) return { changePct: 0, stale: true };
  const raw = (cur / prev - 1) * 100;
  const changePct = Math.round(raw * 10000) / 10000;
  const c = conflicts?.[sym]?.[date];
  if (c) return { changePct: 0, quarantined: true, reason: `vendor previous close ${c.vendorPrev} for ${c.prevDate} disagrees with ours (${c.ourPrev}) by more than 2%`, prevClose: prev, close: cur };
  if (Math.abs(raw) > MAX_DAY_MOVE_PCT) return { changePct: 0, quarantined: true, reason: `move of ${changePct}% is over ${MAX_DAY_MOVE_PCT}%`, prevClose: prev, close: cur };
  return { changePct, prevClose: prev, close: cur };
}

// One person's day. holdings: from personPortfolio (or a week file's frozen draftable); date: a trading day.
export function scorePersonDay({ slug, holdings, history, conflicts, date, filings }) {
  let ret = 0;
  const rows = [];
  for (const h of holdings) {
    const m = tickerMove(history, conflicts, h.ticker, date);
    ret += h.weight * m.changePct;
    const row = { ticker: h.ticker, weight: Math.round(h.weight * 10000) / 10000, changePct: m.changePct };
    if (m.stale) row.stale = true;
    if (m.quarantined) row.quarantined = true;
    rows.push(row);
  }
  const returnPct = Math.round(ret * 10000) / 10000;
  const insiderBuy = hasInsiderBuy(filings, slug, date) ? POINTS.insiderBuy : 0;
  const pp = pricePoints(returnPct);
  return { slug, returnPct, pricePoints: pp, points: pp + insiderBuy, bonuses: { insiderBuy }, holdings: rows };
}

// ---- salaries ----
export const TIERS = [[5, 30], [10, 26], [20, 22], [35, 18], [50, 14], [75, 10], [Infinity, 7]];
export const tierSalary = (pos) => TIERS.find(([upTo]) => pos <= upTo)[1];
// Billionaires with no Public Stake Value (no disclosed US-listed share count on file) start here.
export const NO_STAKE_SALARY = 14;
export const ADJUST_MIN_WEEKS = 4;
export const ADJUST_MAX = 4;

// ---- CEOs (data/ceos/index.json): business leaders who are not on the top-100 billionaire list ----
// A CEO plays on one holding, their company's stock, at full weight. No stake rank.
export const CEO_METHOD = 'company stock';
export const CEO_SALARY_NOTE = 'CEOs start at the pool\'s median cost';
export const isCeo = (p) => !!p && p.type === 'ceo';
export function ceoPlayer(c) {
  return {
    slug: c.slug, name: c.name, rank: null, sector: c.sector || 'Other', type: 'ceo', method: CEO_METHOD,
    holdings: [{ ticker: c.ticker, name: c.company, weight: 1, tier: 'leads' }],
  };
}
// Median of a list of salaries, rounded to a whole number (null for an empty list).
export function medianSalary(values) {
  const v = (values ?? []).filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2);
}

// draftable: [{ slug, rank, type? }] sorted or not; rank = Public Stake Value rank (scripts/lib/data-common.mjs
// stakeTable; null when the person has none). history: [{ totals: { slug: points } }] of recent finished real weeks.
// Preseason weeks stay in this history after Season 1 starts: recent form is price information about the players,
// not a player's score, so the Season 1 reset (fantasy-core SEASON_START_WEEK) does not apply here.
// Billionaires with a rank: tiers by their position among the ranked billionaires in the pool (TIERS sizes).
// Billionaires without one: NO_STAKE_SALARY. CEOs (type "ceo", no rank): the median of the billionaire salaries.
// Then everyone (billionaires and CEOs together) gets the same ±ADJUST_MAX by recent points percentile once there are
// ADJUST_MIN_WEEKS finished real weeks, and ensureFeasible runs.
// Returns { salaries: { slug: salary }, adjusted: boolean, ceoBase: number|null }.
const hasRank = (p) => typeof p.rank === 'number' && Number.isFinite(p.rank) && p.rank > 0;
export function computeSalaries(draftable, history = []) {
  const bySlug = (a, b) => a.slug.localeCompare(b.slug);
  const bill = draftable.filter((p) => !isCeo(p));
  const ranked = bill.filter(hasRank).sort((a, b) => a.rank - b.rank || bySlug(a, b));
  const unranked = bill.filter((p) => !hasRank(p)).sort(bySlug);
  const sorted = [...ranked, ...unranked];
  const ceos = draftable.filter(isCeo).sort(bySlug);
  const salaries = {};
  ranked.forEach((p, i) => { salaries[p.slug] = tierSalary(i + 1); });
  for (const p of unranked) salaries[p.slug] = NO_STAKE_SALARY;
  const ceoBase = ceos.length ? (medianSalary(sorted.map((p) => salaries[p.slug])) ?? tierSalary(Infinity)) : null;
  for (const c of ceos) salaries[c.slug] = ceoBase;
  const everyone = [...sorted, ...ceos];
  let adjusted = false;
  const recent = history.slice(-ADJUST_MIN_WEEKS);
  if (recent.length >= ADJUST_MIN_WEEKS && everyone.length > 1) {
    const avg = everyone.map((p) => ({ slug: p.slug, v: recent.reduce((s, w) => s + (w.totals?.[p.slug] ?? 0), 0) / recent.length }));
    const ordered = [...avg].sort((a, b) => a.v - b.v);
    for (const a of avg) {
      const below = ordered.filter((x) => x.v < a.v).length, same = ordered.filter((x) => x.v === a.v).length;
      const pct = (below + (same - 1) / 2) / (ordered.length - 1); // 0 = worst, 1 = best
      const adj = Math.max(-ADJUST_MAX, Math.min(ADJUST_MAX, Math.round((pct - 0.5) * 2 * ADJUST_MAX)));
      salaries[a.slug] = Math.max(1, salaries[a.slug] + adj);
    }
    adjusted = true;
  }
  ensureFeasible(salaries);
  return { salaries, adjusted, ceoBase };
}

// Make sure the five cheapest fit under the cap; if not, lower the most expensive salaries one point at a time.
export function ensureFeasible(salaries, cap = core.CAP, size = core.PICKS) {
  const slugs = Object.keys(salaries);
  if (slugs.length < size) return false;
  const cheapest = () => slugs.map((s) => salaries[s]).sort((a, b) => a - b).slice(0, size).reduce((a, b) => a + b, 0);
  let guard = 1000;
  while (cheapest() > cap && guard-- > 0) {
    const s = slugs.sort((a, b) => salaries[b] - salaries[a] || a.localeCompare(b))[0];
    if (salaries[s] <= 1) break;
    for (const k of slugs) if (salaries[k] > 1) salaries[k] -= 1;
  }
  return cheapest() <= cap;
}

// Top 5 benchmark: the five best-ranked draftable billionaires (rank = Public Stake Value rank in new week files),
// captain = rank 1. CEOs are not in it (no rank).
export function top5Team(draftable) {
  const sorted = draftable.filter((p) => !isCeo(p)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.slug.localeCompare(b.slug)).slice(0, core.PICKS);
  return { picks: sorted.map((p) => p.slug), captain: sorted[0]?.slug ?? null };
}
