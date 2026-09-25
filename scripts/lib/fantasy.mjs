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
export const POINTS = { insiderBuy: 25, story: 10 };
export const pricePoints = (returnPct) => Math.round(returnPct * 100);

// Story matching, same rule as BD.storyMatches in assets/common.js.
const normName = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
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

// One person's day. holdings: from personPortfolio; quotes; tradingDate (a quote whose New York date differs counts 0%).
export function scorePersonDay({ slug, name, holdings, quotes, tradingDate, filings, stories }) {
  let ret = 0;
  const rows = [];
  for (const h of holdings) {
    const q = quotes[h.ticker];
    const fresh = q && typeof q.changePct === 'number' && Number.isFinite(q.changePct) && (!q.time || core.nyDate(Date.parse(q.time)) === tradingDate);
    const cp = fresh ? q.changePct : 0;
    ret += h.weight * cp;
    const row = { ticker: h.ticker, weight: Math.round(h.weight * 10000) / 10000, changePct: fresh ? Math.round(cp * 10000) / 10000 : 0 };
    if (!fresh) row.stale = true;
    rows.push(row);
  }
  const returnPct = Math.round(ret * 10000) / 10000;
  const insiderBuy = hasInsiderBuy(filings, slug, tradingDate) ? POINTS.insiderBuy : 0;
  const nStories = (stories ?? []).filter((s) => storyMatches(s, name)).length;
  const bonuses = { insiderBuy, stories: nStories * POINTS.story };
  const pp = pricePoints(returnPct);
  return { slug, returnPct, pricePoints: pp, points: pp + bonuses.insiderBuy + bonuses.stories, bonuses, holdings: rows };
}

// New York date of the quote snapshot: the most common quote date among the given symbols.
export function tradingDateOf(quotes) {
  const counts = new Map();
  for (const q of Object.values(quotes ?? {})) {
    const t = Date.parse(q?.time);
    if (!Number.isFinite(t)) continue;
    const d = core.nyDate(t);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [d, c] of counts) if (c > n || (c === n && d > best)) { best = d; n = c; }
  return best;
}

// ---- salaries ----
export const TIERS = [[5, 30], [10, 26], [20, 22], [35, 18], [50, 14], [75, 10], [Infinity, 7]];
export const tierSalary = (pos) => TIERS.find(([upTo]) => pos <= upTo)[1];
export const ADJUST_MIN_WEEKS = 4;
export const ADJUST_MAX = 4;

// draftable: [{ slug, rank }] sorted or not. history: [{ totals: { slug: points } }] of recent finished real weeks.
// Returns { salaries: { slug: salary }, adjusted: boolean }.
export function computeSalaries(draftable, history = []) {
  const sorted = [...draftable].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.slug.localeCompare(b.slug));
  const salaries = {};
  sorted.forEach((p, i) => { salaries[p.slug] = tierSalary(i + 1); });
  let adjusted = false;
  const recent = history.slice(-ADJUST_MIN_WEEKS);
  if (recent.length >= ADJUST_MIN_WEEKS && sorted.length > 1) {
    const avg = sorted.map((p) => ({ slug: p.slug, v: recent.reduce((s, w) => s + (w.totals?.[p.slug] ?? 0), 0) / recent.length }));
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
  return { salaries, adjusted };
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

// Top 5 richest benchmark: draftable ranks 1–5, captain = the richest.
export function top5Team(draftable) {
  const sorted = [...draftable].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.slug.localeCompare(b.slug)).slice(0, core.PICKS);
  return { picks: sorted.map((p) => p.slug), captain: sorted[0]?.slug ?? null };
}
