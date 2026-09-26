// Shared helpers for the morning data scripts (fetch-filings.mjs, fetch-prices.mjs).
// No dependencies. Everything here is plain Node 22.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PEOPLE_DIR = join(ROOT, 'data', 'people');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns a function that waits so calls are at least `minGapMs` apart.
export function spacer(minGapMs) {
  let last = 0;
  return async () => {
    const wait = last + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}

export async function readJson(path, fallback = undefined) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export async function writeJson(path, data, { pretty = true } = {}) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
}

// All profile files in data/people (everything except index.json).
export async function loadProfiles() {
  const files = (await readdir(PEOPLE_DIR)).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  const out = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(PEOPLE_DIR, f), 'utf8')));
    } catch (err) {
      console.warn(`! could not read ${f}: ${err.message}`);
    }
  }
  return out;
}

export function padCik(cik) {
  const digits = String(cik ?? '').replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return null;
  return digits.padStart(10, '0');
}

// America/New_York calendar date (YYYY-MM-DD) for a Date.
export function nyDate(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// ---------- Market data helpers ----------

// Exchange text in profiles is free-form ("Nasdaq", "NYSE / HKEX", "NYSE (delisted Sept 2025)", ...).
// A listing counts as US if the text starts with Nasdaq or NYSE (incl. NYSE American) and is not delisted/proposed.
export function isUsExchange(exchange) {
  if (!exchange) return false;
  const s = String(exchange).trim();
  if (/delisted|proposed/i.test(s)) return false;
  return /^(nasdaq|nyse)\b/i.test(s);
}

const US_SYMBOL = /^[A-Z]{1,5}(\.[A-Z])?$/;

// Decide which quote symbols a profile holding maps to.
// Returns { symbols: [..], skipped: [{symbol, reason}] }.
export function holdingSymbols(holding) {
  const raw = String(holding.ticker ?? '').trim();
  if (!raw) return { symbols: [], skipped: [] };
  if (/\(/.test(raw)) return { symbols: [], skipped: [{ symbol: raw, reason: 'ticker marked former/proposed/other in profile' }] };

  let exchange = holding.exchange;
  let tokens = raw.split('/').map((t) => t.trim()).filter(Boolean);
  // Prefixed tickers such as "NYSE:MP" or "ASX:ARU".
  tokens = tokens.map((t) => {
    const m = t.match(/^([A-Za-z]+):\s*(.+)$/);
    if (m) {
      if (!exchange) exchange = m[1];
      return m[2].trim();
    }
    return t;
  });

  let usListed;
  if (exchange) {
    usListed = isUsExchange(exchange);
    if (!usListed) return { symbols: [], skipped: [{ symbol: raw, reason: `non-US exchange: ${exchange}` }] };
  } else {
    // No exchange in the profile: treat it as US-listed only when the holding is sourced to an SEC filing.
    usListed = /(^|\/\/)(www\.)?sec\.gov\//i.test(holding.source ?? '');
    if (!usListed) return { symbols: [], skipped: [{ symbol: raw, reason: 'exchange not stated and source is not an SEC filing' }] };
  }

  const symbols = [];
  const skipped = [];
  for (const t of tokens) {
    if (US_SYMBOL.test(t)) symbols.push(t);
    else skipped.push({ symbol: t, reason: 'not a US ticker format' });
  }
  return { symbols, skipped };
}

// Pull an explicit, exact share count out of profile text, e.g. "19.9% (699,580,882 shares ...)".
// Accepts only comma-grouped integers followed by an optional class/common/ordinary word and "shares"/"ADSs"/"ADS".
// Rejects abbreviated amounts ("~117.06M shares", "1,865,511 thousand shares") and exited/historical entries.
// Returns { shares, text } or null.
export function parseShareCount(text) {
  if (!text) return null;
  const s = String(text);
  if (/\b(exited|historical|former)\b/i.test(s)) return null;
  const re = /(?<![\d.,~])(\d{1,3}(?:,\d{3})+)\s+(?:(?:Class\s+[A-Z]|common|ordinary)\s+)?(shares|ADSs|ADS)\b/i;
  // Fallback: a count followed by a share class without the word "shares", e.g. "188,290 Class A + 1,162 Class B".
  const classRe = /(?<![\d.,~])(\d{1,3}(?:,\d{3})+)\s+Class\s+[A-Z]\b/i;
  const m = s.match(re) ?? s.match(classRe);
  if (!m) return null;
  const shares = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(shares) || shares <= 0) return null;
  return { shares, text: m[0] };
}

// ---------- Net-worth estimate ----------

export const METHOD =
  "Estimated from disclosed share counts × today's price change in US-listed holdings. Not a full net worth. " +
  'Covers only disclosed share counts in US-listed holdings; may undercount. ' +
  "Shown only when these holdings are at least 25% of the person's Forbes net worth.";

// Added to the method text when config/wealth-overrides.json lists anyone.
export const OVERRIDES_METHOD =
  "For people whose holdings are shared and not split in filings (config/wealth-overrides.json, e.g. the Walton family's " +
  "Walmart stake), the estimate is the published net worth × that stock's daily % change.";

// Method text for the output file; mentions overrides when there are any.
export function methodText(overrides) {
  return overrides && Object.keys(overrides).length ? `${METHOD} ${OVERRIDES_METHOD}` : METHOD;
}

// config/wealth-overrides.json -> { slug: { basis, ticker, shareText?, note, source } } ({} when missing).
export async function loadWealthOverrides() {
  const cfg = await readJson(join(ROOT, 'config', 'wealth-overrides.json'), null);
  return (cfg && cfg.people) || {};
}

// Estimates covering less than this share of the person's net worth are hidden on the site.
export const MIN_COVERAGE = 0.25;

// Parse a Forbes-style worth string ("$927.9B", "$184B", "$845M") into US dollars. Returns null if unparseable.
export function parseWorth(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^\$\s*(\d+(?:\.\d+)?)\s*([BM])$/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2].toUpperCase() === 'B' ? 1e9 : 1e6);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// slug -> worth in USD (or null) from data/people/index.json.
export function worthBySlug(index) {
  const out = {};
  for (const p of (index && Array.isArray(index.people) ? index.people : [])) {
    if (p && p.slug) out[p.slug] = parseWorth(p.worth);
  }
  return out;
}

// Adds coveredValue (Σ shares × current price) and coverage (coveredValue / worth, 3 decimals) to each person entry.
// coverage is null when the worth or a price is missing. Mutates and returns `people`.
// Worth-basis entries (method 'worth', see estimateAll overrides) get coveredValue = worth and coverage = 1.
export function addCoverage(people, quotes, worths) {
  for (const [slug, entry] of Object.entries(people)) {
    if (entry.method === 'worth') {
      const w = worths?.[slug] ?? null;
      entry.coveredValue = w ? Math.round(w) : null;
      entry.coverage = w ? 1 : null;
      continue;
    }
    let covered = 0;
    let ok = true;
    for (const h of entry.holdings ?? []) {
      const price = quotes?.[h.ticker]?.price;
      if (typeof price !== 'number' || !Number.isFinite(price)) { ok = false; continue; }
      covered += h.shares * price;
    }
    const worth = worths?.[slug] ?? null;
    entry.coveredValue = ok ? Math.round(covered) : null;
    entry.coverage = ok && worth ? Math.round((covered / worth) * 1000) / 1000 : null;
  }
  return people;
}

// Tickers known to trade in the US as ADSs/ADRs, where a count of ordinary shares would not match the quote.
export const KNOWN_ADRS = new Set([
  'NTES', 'BABA', 'PDD', 'JD', 'BIDU', 'TCEHY', 'TSM', 'INFY', 'ASML', 'SONY', 'TM', 'BHP', 'RIO', 'NVO',
  'SAP', 'SHEL', 'BP', 'TTE', 'HSBC', 'UL', 'AZN', 'GSK', 'SNY', 'DEO', 'LVMUY',
]);

const ADS_TEXT = /\b(ADSs?|ADRs?|American Depositary)\b/i;
const holdingText = (h) => `${h.name ?? ''} ${h.stake ?? ''} ${h.role ?? ''} ${h.exchange ?? ''}`;

// Known-ADR set: the explicit list, any 5-letter symbol ending in Y, and any ticker whose profile text says ADS/ADR.
export function adrSet(profiles) {
  const set = new Set(KNOWN_ADRS);
  for (const p of profiles) {
    for (const h of [...(p.controls ?? []), ...(p.stakes ?? [])]) {
      if (!ADS_TEXT.test(holdingText(h))) continue;
      for (const s of holdingSymbols(h).symbols) set.add(s);
    }
  }
  return set;
}

export function isKnownAdr(symbol, adrs) {
  return adrs.has(symbol) || /^[A-Z]{4}Y$/.test(symbol);
}

// Candidate holdings for one person (before shared-holding exclusion).
// Returns { holdings, skipped } where skipped entries are ADS-ratio problems.
export function personHoldings(profile, quotes, adrs = KNOWN_ADRS) {
  const holdings = [];
  const skipped = [];
  const seen = new Set();
  for (const h of [...(profile.controls ?? []), ...(profile.stakes ?? [])]) {
    const { symbols } = holdingSymbols(h);
    if (symbols.length !== 1) continue; // ambiguous multi-class tickers (e.g. "GOOGL / GOOG") are not estimated
    const ticker = symbols[0];
    if (seen.has(ticker)) continue;
    const parsed = parseShareCount(h.stake) ?? parseShareCount(h.name);
    if (!parsed) continue;
    const q = quotes[ticker];
    if (!q || typeof q.change !== 'number' || !Number.isFinite(q.change)) continue;
    if (!h.source) continue;
    seen.add(ticker);
    if (isKnownAdr(ticker, adrs) && !ADS_TEXT.test(`${h.name ?? ''} ${h.stake ?? ''}`)) {
      skipped.push({ ticker, shares: parsed.shares, person: profile.slug, reason: 'ADS ratio unknown' });
      continue;
    }
    holdings.push({
      ticker,
      shares: parsed.shares,
      change: q.change,
      estChange: Math.round(parsed.shares * q.change),
      shareText: parsed.text,
      source: h.source,
    });
  }
  return { holdings, skipped };
}

// Estimates for everyone. The same (ticker, shares) holding under more than one person is excluded for all of them.
// With `worths` (slug -> USD), each entry also gets coveredValue and coverage (see addCoverage).
// `overrides` (slug -> { basis:'worth', ticker, shareText?, source }, from config/wealth-overrides.json): those people's
// parsed share rows are ignored; their estimate is net worth × the ticker's daily % change (needs `worths` and a quote).
export function estimateAll(profiles, quotes, adrs = adrSet(profiles), worths = null, overrides = null) {
  const per = new Map();
  const skipped = [];
  const owners = new Map(); // "TICKER|shares" -> [slug]
  const worthBased = {};
  for (const p of profiles) {
    const ov = overrides?.[p.slug];
    if (ov && ov.basis === 'worth') {
      const e = worthEntry(p.slug, ov, quotes, worths);
      if (e) worthBased[p.slug] = e;
      continue;
    }
    const r = personHoldings(p, quotes, adrs);
    skipped.push(...r.skipped);
    per.set(p.slug, r.holdings);
    for (const h of r.holdings) {
      const k = `${h.ticker}|${h.shares}`;
      if (!owners.has(k)) owners.set(k, []);
      owners.get(k).push(p.slug);
    }
  }
  const excluded = [];
  for (const [k, slugs] of owners) {
    if (slugs.length < 2) continue;
    const [ticker, shares] = k.split('|');
    excluded.push({ ticker, shares: Number(shares), people: slugs, reason: 'shared holding' });
  }
  const people = {};
  for (const [slug, hs] of per) {
    const kept = hs.filter((h) => owners.get(`${h.ticker}|${h.shares}`).length < 2);
    if (!kept.length) continue;
    people[slug] = { estDailyChange: kept.reduce((s, h) => s + h.estChange, 0), partial: true, holdings: kept };
  }
  Object.assign(people, worthBased);
  if (worths) addCoverage(people, quotes, worths);
  return { people, excluded, skipped };
}

// One worth-basis estimate (see estimateAll `overrides`), or null when the worth or the quote's % change is missing.
export function worthEntry(slug, ov, quotes, worths) {
  const worth = worths?.[slug];
  const q = quotes?.[ov.ticker];
  if (typeof worth !== 'number' || !(worth > 0)) return null;
  if (!q || typeof q.changePct !== 'number' || !Number.isFinite(q.changePct)) return null;
  const estChange = Math.round(worth * q.changePct / 100);
  return {
    estDailyChange: estChange,
    partial: true,
    method: 'worth',
    holdings: [{
      ticker: ov.ticker,
      basis: 'worth',
      change: q.change,
      changePct: q.changePct,
      estChange,
      shareText: ov.shareText ?? `net worth × ${ov.ticker} price move`,
      source: ov.source,
      // Reference close the net worth is pinned to (used by scripts/lib/wealth.mjs trackedValue).
      refClose: typeof q.price === 'number' && Number.isFinite(q.price) ? q.price : null,
      refDate: q.time ? nyDate(new Date(q.time)) : null,
    }],
  };
}

// Single-person convenience wrapper (no shared-holding check).
export function estimatePerson(profile, quotes, adrs = KNOWN_ADRS) {
  const { holdings } = personHoldings(profile, quotes, adrs);
  if (!holdings.length) return null;
  return { estDailyChange: holdings.reduce((s, h) => s + h.estChange, 0), partial: true, holdings };
}
