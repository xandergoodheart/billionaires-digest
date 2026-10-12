// Morning data: quotes for US-listed tickers in data/people/*.json (controls + stakes), from Finnhub.
//
//   FINNHUB_API_KEY=... node scripts/fetch-prices.mjs
//
// Also quotes the Billionaire Fantasy League symbols (scripts/lib/fantasy.mjs): SPY, name aliases and the
// curated US ADR lines used for daily returns only, and the company tickers of the CEOs in data/ceos/index.json
// (game scoring only; CEOs get no net-worth estimate).
// Writes data/prices/latest.json, data/prices/history/<SYM>.json (closes), data/prices/opens/<SYM>.json (that session's
// opening price; The Book's price markets run from an open to a close), data/prices/quality.json (which closes are
// confirmed, and previous-close disagreements the game quarantines) and data/prices/networth-est.json.
//
// Closes only (the job runs at unpredictable times, often during market hours):
//  - A quote's session date is the New York date of its timestamp, except end-of-day OTC/ADR quotes stamped exactly
//    midnight UTC (e.g. IDEXY, LVMUY): those are dated by their UTC date (New York would shift them to the day before).
//  - `pc` is the close of the trading day before the session (NYSE calendar in assets/fantasy-core.js).
//  - `c` is a close only when the quote is end-of-day, its time is at or after the session's closing bell (16:00 New
//    York, 13:00 on half days), or the session is already over by the time we fetch. An intraday price is never stored.
//  - A later run that learns a close overwrites the stored one (repair), except when our stored close was itself
//    confirmed and the vendor's previous close disagrees with it by more than 2%: then ours is kept and the session is
//    recorded in quality.json `conflicts`, which build-fantasy quarantines (scores 0) until a later quote agrees.
//  - Rows on weekends and NYSE holidays are dropped from history and opens.
// Exits 0 without fetching or writing when FINNHUB_API_KEY is unset.
// The key is sent in the X-Finnhub-Token header and is never logged.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
import { fantasySymbols, core } from './lib/fantasy.mjs';
import { ROOT, MIN_COVERAGE, methodText, loadWealthOverrides, loadProfiles, loadCeos, holdingSymbols, estimateAll, adrSet, worthBySlug, readJson, spacer, sleep, writeJson } from './lib/data-common.mjs';

const OUT_DIR = join(ROOT, 'data', 'prices');
const HISTORY_KEEP = 400;

const KEY = (process.env.FINNHUB_API_KEY ?? '').trim();
const throttle = spacer(1250); // 48 requests/minute, under the free tier's 60/min

async function quote(symbol) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await throttle();
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'X-Finnhub-Token': KEY },
    });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt === 1) {
      console.warn('  rate limited; waiting 60s');
      await sleep(60_000);
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}

// ceos: data/ceos/index.json people; each one's company ticker is quoted too (a plain US listing).
export function collectSymbols(profiles, ceos = []) {
  const symbols = new Set();
  const skipped = new Map();
  for (const p of profiles) {
    for (const h of [...(p.controls ?? []), ...(p.stakes ?? [])]) {
      const r = holdingSymbols(h);
      r.symbols.forEach((s) => symbols.add(s));
      for (const s of r.skipped) if (!skipped.has(s.symbol)) skipped.set(s.symbol, s.reason);
    }
  }
  for (const s of fantasySymbols(profiles)) symbols.add(s);
  for (const c of ceos) if (c && typeof c.ticker === 'string' && /^[A-Z][A-Z.]{0,5}$/.test(c.ticker)) symbols.add(c.ticker);
  for (const s of symbols) skipped.delete(s);
  return { symbols: [...symbols].sort(), skipped: [...skipped].map(([symbol, reason]) => ({ symbol, reason })) };
}

// Adds (or replaces) one [isoDate, value] row in <dir>/<symbol>.json, sorted by date, keeping the last HISTORY_KEEP rows.
export async function appendSeries(dir, symbol, isoDate, value) {
  const path = join(dir, `${symbol}.json`);
  const rows = await readJson(path, []);
  const map = new Map(Array.isArray(rows) ? rows.filter((r) => Array.isArray(r) && r.length === 2) : []);
  map.set(isoDate, value);
  const out = [...map].sort((a, b) => a[0].localeCompare(b[0])).slice(-HISTORY_KEEP);
  await writeJson(path, out, { pretty: false });
}

// ---------- closes ----------
export const PREV_CLOSE_TOLERANCE = 0.02;   // vendor previous close vs our confirmed close: more than 2% apart = conflict
export const QUALITY_KEEP_DAYS = 45;
const posNum = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
const isoUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

// What a Finnhub quote {c, pc, o, t} says about closes. nowMs = when it was fetched.
// Returns null without a timestamp, else { session, trading, eod, close (or null), prevDate, prev (or null), open (or null) }.
export function quoteSession(q, nowMs = Date.now()) {
  if (!q || typeof q.t !== 'number' || !(q.t > 0)) return null;
  const ms = q.t * 1000;
  const eod = q.t % 86400 === 0;                         // end-of-day OTC/ADR stamp: midnight UTC of the session
  const session = eod ? isoUtc(ms) : core.nyDate(ms);
  if (!core.isTradingDay(session)) return { session, trading: false, eod, close: null, prevDate: null, prev: null, open: null };
  const final = eod || ms >= core.closeAt(session) || core.nyDate(nowMs) > session;
  return { session, trading: true, eod, close: final ? posNum(q.c) : null, prevDate: core.prevTradingDay(session), prev: posNum(q.pc), open: posNum(q.o) };
}

// Drop rows on weekends / NYSE holidays and malformed rows; sorted; last HISTORY_KEEP.
export function cleanSeries(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => Array.isArray(r) && r.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && core.isTradingDay(r[0]) && posNum(r[1]) != null)
    .sort((a, b) => a[0].localeCompare(b[0])).slice(-HISTORY_KEEP);
}

// In-memory price store: history and opens per symbol (Map date -> value) plus quality info. Pure: no IO.
export function newStore(quality = null) {
  return {
    history: new Map(), opens: new Map(),
    confirmed: new Map(Object.entries(quality?.confirmed ?? {}).map(([s, ds]) => [s, new Set(Array.isArray(ds) ? ds : [])])),
    conflicts: new Map(Object.entries(quality?.conflicts ?? {}).map(([s, o]) => [s, { ...(o || {}) }])),
  };
}
const getMap = (m, k) => { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };

// Record one quote into the store (see the rules at the top of this file). Returns quoteSession's result plus
// { conflict } when the vendor's previous close was rejected.
export function recordQuote(store, sym, q, nowMs = Date.now()) {
  const s = quoteSession(q, nowMs);
  if (!s || !s.trading) return s;
  const h = getMap(store.history, sym);
  if (!store.confirmed.has(sym)) store.confirmed.set(sym, new Set());
  const conf = store.confirmed.get(sym);
  let conflict = null;
  if (s.prev != null) {
    const ours = h.get(s.prevDate);
    if (ours != null && conf.has(s.prevDate) && Math.abs(s.prev / ours - 1) > PREV_CLOSE_TOLERANCE) {
      conflict = { prevDate: s.prevDate, vendorPrev: s.prev, ourPrev: ours, diffPct: Math.round((s.prev / ours - 1) * 10000) / 100 };
      if (!store.conflicts.has(sym)) store.conflicts.set(sym, {});
      store.conflicts.get(sym)[s.session] = conflict;
    } else {
      h.set(s.prevDate, s.prev);
      conf.add(s.prevDate);
      const c = store.conflicts.get(sym);
      if (c) { delete c[s.session]; if (!Object.keys(c).length) store.conflicts.delete(sym); }
    }
  }
  if (s.close != null) { h.set(s.session, s.close); conf.add(s.session); }
  if (s.open != null) getMap(store.opens, sym).set(s.session, s.open);
  return { ...s, conflict };
}

// Legacy repair: rows dated after a symbol's newest confirmed close were written by the old rules (an intraday price
// stored as that day's close); drop them. Symbols with no confirmed close are left alone. Returns the rows dropped.
export function dropTrailingUnconfirmed(store) {
  let n = 0;
  for (const [sym, h] of store.history) {
    const conf = store.confirmed.get(sym);
    if (!conf || !conf.size) continue;
    const last = [...conf].sort().pop();
    for (const d of [...h.keys()]) if (d > last && !conf.has(d)) { h.delete(d); n++; }
  }
  return n;
}

// quality.json content from the store, keeping the last QUALITY_KEEP_DAYS days.
export function qualityDoc(store, generated, todayNy) {
  const cut = core.addDays(todayNy, -QUALITY_KEEP_DAYS);
  const confirmed = {}, conflicts = {};
  for (const [sym, set] of [...store.confirmed].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ds = [...set].filter((d) => d >= cut).sort();
    if (ds.length) confirmed[sym] = ds;
  }
  for (const [sym, o] of [...store.conflicts].sort((a, b) => a[0].localeCompare(b[0]))) {
    const keep = Object.fromEntries(Object.entries(o).filter(([d]) => d >= cut).sort());
    if (Object.keys(keep).length) conflicts[sym] = keep;
  }
  return {
    generated,
    note: 'confirmed: closes learned from a final quote (or a later previous close). conflicts: sessions where the vendor\'s previous close disagreed with our confirmed close by more than 2%; the game scores those days 0 for that ticker.',
    confirmed, conflicts,
  };
}

// Load every series file of a dir (history or opens) into a Map(sym -> Map(date -> value)). Files starting with _ are skipped.
export async function loadSeriesDir(dir) {
  const out = new Map();
  let names = [];
  try { names = (await readdir(dir)).filter((f) => f.endsWith('.json') && !f.startsWith('_')); } catch { return out; }
  for (const f of names.sort()) out.set(f.slice(0, -5), new Map(cleanSeries(await readJson(join(dir, f), []))));
  return out;
}

// Write every series of a store map whose file content changed (cleaned, sorted, capped). Returns the count written.
export async function saveSeriesDir(dir, series) {
  let n = 0;
  for (const [sym, map] of series) {
    const path = join(dir, `${sym}.json`);
    const out = cleanSeries([...map]);
    const before = await readJson(path, null);
    if (JSON.stringify(before) === JSON.stringify(out)) continue;
    await writeJson(path, out, { pretty: false });
    n++;
  }
  return n;
}

// Load history, opens and quality.json of a data/prices dir into a store.
export async function loadStore(pricesDir) {
  const store = newStore(await readJson(join(pricesDir, 'quality.json'), null));
  store.history = await loadSeriesDir(join(pricesDir, 'history'));
  store.opens = await loadSeriesDir(join(pricesDir, 'opens'));
  return store;
}
export async function saveStore(pricesDir, store, generated, nowMs) {
  dropTrailingUnconfirmed(store);
  const h = await saveSeriesDir(join(pricesDir, 'history'), store.history);
  const o = await saveSeriesDir(join(pricesDir, 'opens'), store.opens);
  await writeJson(join(pricesDir, 'quality.json'), qualityDoc(store, generated, core.nyDate(nowMs)), { pretty: false });
  return { history: h, opens: o };
}

// A Finnhub quote {c, d, dp, pc, o, t} -> the latest.json entry, or null when there is no usable quote.
// open is kept only when it is a positive number.
export function quoteEntry(q) {
  if (!q || typeof q.c !== 'number' || q.c === 0 || !q.t) return null;
  return {
    price: q.c,
    change: typeof q.d === 'number' ? q.d : null,
    changePct: typeof q.dp === 'number' ? q.dp : null,
    prevClose: typeof q.pc === 'number' ? q.pc : null,
    ...(typeof q.o === 'number' && Number.isFinite(q.o) && q.o > 0 ? { open: q.o } : {}),
    time: new Date(q.t * 1000).toISOString(),
  };
}

async function main() {
  if (!KEY) {
    console.log('FINNHUB_API_KEY is not set. Skipping market data (nothing fetched, nothing written).');
    console.log('Get a free key at https://finnhub.io and add it as the FINNHUB_API_KEY repository secret.');
    return 0;
  }

  const profiles = await loadProfiles();
  const { symbols, skipped } = collectSymbols(profiles, await loadCeos());
  console.log(`US symbols to quote: ${symbols.length}; skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`  skip ${s.symbol}: ${s.reason}`);

  const nowMs = Date.now();
  const store = await loadStore(OUT_DIR);
  const quotes = {};
  for (const sym of symbols) {
    try {
      const q = await quote(sym);
      const entry = quoteEntry(q);
      if (!entry) {
        skipped.push({ symbol: sym, reason: 'no quote from Finnhub' });
        continue;
      }
      quotes[sym] = entry;
      const r = recordQuote(store, sym, q, Date.now());
      if (r && !r.trading) console.log(`  ${sym}: quote dated ${r.session}, not a trading day: no close stored`);
      if (r?.conflict) console.warn(`  ${sym}: previous close ${r.conflict.vendorPrev} for ${r.conflict.prevDate} disagrees with ours (${r.conflict.ourPrev}); ${r.session} quarantined`);
    } catch (err) {
      console.warn(`! ${sym}: ${err.message}`);
      skipped.push({ symbol: sym, reason: `request failed (${err.message})` });
    }
  }

  const generated = new Date().toISOString();
  const quoted = Object.keys(quotes).length;
  if (symbols.length && !quoted) {
    console.error('WARNING: no quotes could be fetched (check the FINNHUB_API_KEY secret). Leaving existing output untouched.');
    return 0;
  }

  const saved = await saveStore(OUT_DIR, store, generated, nowMs);
  console.log(`Closes: ${saved.history} history file(s) and ${saved.opens} opens file(s) updated.`);
  await writeJson(join(OUT_DIR, 'latest.json'), { generated, provider: 'Finnhub', quotes, skipped });

  const worths = worthBySlug(await readJson(join(ROOT, 'data', 'people', 'index.json'), {}));
  const overrides = await loadWealthOverrides();
  const { people, excluded, skipped: estSkipped } = estimateAll(profiles, quotes, adrSet(profiles), worths, overrides);
  await writeJson(join(OUT_DIR, 'networth-est.json'), { generated, method: methodText(overrides), minCoverage: MIN_COVERAGE, people, excluded, skipped: estSkipped });

  console.log(`Done. Quotes ${quoted}/${symbols.length}; people with estimates ${Object.keys(people).length}.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
}
