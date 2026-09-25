// One-time (re-runnable) backfill of ~1 year of daily closes from Tiingo into data/prices/history/<SYM>.json.
//
//   TIINGO_API_KEY=... node scripts/backfill-history.mjs [--max-minutes 330] [--force]
//
// Symbols: the same universe fetch-prices quotes (holdings + SPY + fantasy aliases/ADRs).
// Free plan limits (45 requests/hour, 900/day): requests are spaced >= 80 s apart. 429 -> wait 10 min, retry up to 3.
// 404 / unknown ticker / no rows -> recorded as skipped. Resumable: data/prices/history/_backfill-state.json lists
// done and skipped symbols; they are not fetched again unless --force.
// Merge: union by date, existing dates win (daily Finnhub closes), sorted ascending, last 400 kept.
// Stores the adjusted close (adjClose) when present, else close.
// Stops cleanly before the --max-minutes budget. Exits 0 without fetching when TIINGO_API_KEY is unset.
// The key is sent in the Authorization header and is never logged.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadProfiles, readJson, writeJson, sleep as realSleep } from './lib/data-common.mjs';
import { collectSymbols } from './fetch-prices.mjs';

export const HISTORY_KEEP = 400;
export const LOOKBACK_DAYS = 400;
export const GAP_MS = 80_000; // 3600/80 = 45 requests/hour
export const RATE_WAIT_MS = 10 * 60_000;
export const RATE_RETRIES = 3;
export const DEFAULT_MAX_MINUTES = 330;
export const BASE_URL = 'https://api.tiingo.com';
export const STATE_FILE = '_backfill-state.json';

const DEFAULT_DIR = join(ROOT, 'data', 'prices', 'history');

// BRK.B -> BRK-B, LEN.B -> LEN-B (Tiingo uses dashes for share classes).
export function tiingoTicker(symbol) {
  return String(symbol).trim().toUpperCase().replace(/\./g, '-');
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function priceUrl(symbol, nowMs, baseUrl = BASE_URL) {
  const start = isoDay(nowMs - LOOKBACK_DAYS * 86_400_000);
  const end = isoDay(nowMs);
  return `${baseUrl}/tiingo/daily/${encodeURIComponent(tiingoTicker(symbol))}/prices` +
    `?startDate=${start}&endDate=${end}&resampleFreq=daily&columns=date,adjClose,close`;
}

// Tiingo rows [{ date: '2025-09-24T00:00:00.000Z', adjClose, close }] -> [[isoDate, value]].
export function parseRows(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r.date !== 'string') continue;
    const d = r.date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const v = Number.isFinite(r.adjClose) && r.adjClose > 0 ? r.adjClose : r.close;
    if (!Number.isFinite(v) || v <= 0) continue;
    out.push([d, Math.round(v * 10000) / 10000]);
  }
  return out;
}

// Union by date; existing rows win; dedupe; sorted ascending; last `keep` kept.
export function mergeHistory(existing, incoming, keep = HISTORY_KEEP) {
  const map = new Map();
  for (const r of Array.isArray(incoming) ? incoming : []) {
    if (Array.isArray(r) && r.length === 2) map.set(r[0], r[1]);
  }
  for (const r of Array.isArray(existing) ? existing : []) {
    if (Array.isArray(r) && r.length === 2) map.set(r[0], r[1]);
  }
  return [...map].sort((a, b) => a[0].localeCompare(b[0])).slice(-keep);
}

export function freshState(nowIso) {
  return { done: [], skipped: [], startedAt: nowIso, lastRun: null };
}

export async function loadState(dir) {
  const s = await readJson(join(dir, STATE_FILE), null);
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  return {
    done: Array.isArray(s.done) ? s.done : [],
    skipped: Array.isArray(s.skipped) ? s.skipped : [],
    startedAt: s.startedAt ?? null,
    lastRun: s.lastRun ?? null,
  };
}

// Returns { status: 'ok', rows } | { status: 'skip', reason } | { status: 'stop', reason } | { status: 'error', reason }.
// Every request goes through `throttle` (>= GAP_MS apart). 429 waits RATE_WAIT_MS then retries (up to RATE_RETRIES).
async function fetchSymbol(symbol, ctx) {
  const { key, fetchImpl, now, sleep, throttle, baseUrl, log, deadline } = ctx;
  for (let attempt = 0; attempt <= RATE_RETRIES; attempt++) {
    if (!(await throttle())) return { status: 'stop', reason: 'time budget reached' };
    let res;
    try {
      res = await fetchImpl(priceUrl(symbol, now(), baseUrl), {
        headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return { status: 'error', reason: `network error (${err.message})` };
    }
    if (res.status === 429) {
      if (attempt === RATE_RETRIES) return { status: 'stop', reason: 'rate limited (429) after 3 retries' };
      if (now() + RATE_WAIT_MS >= deadline) return { status: 'stop', reason: 'rate limited (429); no time left to wait' };
      log(`  ${symbol}: rate limited (429); waiting 10 min (retry ${attempt + 1}/${RATE_RETRIES})`);
      await sleep(RATE_WAIT_MS);
      continue;
    }
    if (res.status === 401 || res.status === 403) return { status: 'stop', reason: `HTTP ${res.status} (check the TIINGO_API_KEY secret)` };
    if (res.status === 404) return { status: 'skip', reason: 'unknown ticker at Tiingo (404)' };
    if (!res.ok) return { status: 'error', reason: `HTTP ${res.status}` };
    let body;
    try { body = await res.json(); } catch { return { status: 'error', reason: 'bad JSON' }; }
    if (!Array.isArray(body)) {
      const detail = body && typeof body.detail === 'string' ? body.detail : '';
      if (/not found/i.test(detail)) return { status: 'skip', reason: 'unknown ticker at Tiingo' };
      return { status: 'error', reason: 'unexpected response' };
    }
    const rows = parseRows(body);
    if (!rows.length) return { status: 'skip', reason: 'no price rows from Tiingo' };
    return { status: 'ok', rows };
  }
  return { status: 'stop', reason: 'rate limited' };
}

// Core loop, injectable for tests. Returns a summary object.
export async function runBackfill({
  key,
  symbols,
  dir = DEFAULT_DIR,
  force = false,
  maxMinutes = DEFAULT_MAX_MINUTES,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = realSleep,
  baseUrl = BASE_URL,
  gapMs = GAP_MS,
  log = console.log,
} = {}) {
  const t0 = now();
  const deadline = t0 + maxMinutes * 60_000;
  const nowIso = () => new Date(now()).toISOString();

  let state = (!force && (await loadState(dir))) || freshState(nowIso());
  if (force) state = freshState(nowIso());
  const saveState = async () => { state.lastRun = nowIso(); await writeJson(join(dir, STATE_FILE), state); };

  const finished = new Set([...state.done, ...state.skipped.map((s) => s.symbol)]);
  const todo = symbols.filter((s) => !finished.has(s));
  log(`Backfill: ${symbols.length} symbols; ${symbols.length - todo.length} already done/skipped; ${todo.length} to fetch.`);
  log(`Spacing ${Math.round(gapMs / 1000)} s per request; estimated ${Math.ceil((todo.length * gapMs) / 60_000)} min; budget ${maxMinutes} min.`);

  // Spacer on the injected clock. Returns false when the next request would start past the deadline.
  let last = null;
  const throttle = async () => {
    const wait = last == null ? 0 : last + gapMs - now();
    if (now() + Math.max(0, wait) >= deadline) return false;
    if (wait > 0) await sleep(wait);
    last = now();
    return true;
  };
  const ctx = { key, fetchImpl, now, sleep, throttle, baseUrl, log, deadline };

  const summary = { fetched: 0, skipped: 0, errors: 0, stopped: null, remaining: 0 };
  for (let i = 0; i < todo.length; i++) {
    const sym = todo[i];
    const r = await fetchSymbol(sym, ctx);
    if (r.status === 'stop') {
      summary.stopped = r.reason;
      summary.remaining = todo.length - i;
      log(`Stopping: ${r.reason}. ${summary.remaining} symbols left for the next run.`);
      break;
    }
    if (r.status === 'skip') {
      state.skipped.push({ symbol: sym, reason: r.reason });
      summary.skipped++;
      log(`[${i + 1}/${todo.length}] ${sym}: skipped (${r.reason})`);
    } else if (r.status === 'error') {
      summary.errors++;
      log(`[${i + 1}/${todo.length}] ${sym}: failed (${r.reason}); will retry on the next run`);
    } else {
      const path = join(dir, `${sym}.json`);
      const existing = await readJson(path, []);
      const merged = mergeHistory(existing, r.rows);
      await writeJson(path, merged, { pretty: false });
      state.done.push(sym);
      summary.fetched++;
      log(`[${i + 1}/${todo.length}] ${sym}: ${r.rows.length} rows from Tiingo -> ${merged.length} closes`);
    }
    await saveState();
  }
  await saveState();
  log(`Backfill finished: fetched ${summary.fetched}, skipped ${summary.skipped}, errors ${summary.errors}` +
    (summary.stopped ? `, stopped early (${summary.stopped})` : '') + '.');
  return summary;
}

export function parseArgs(argv) {
  const out = { force: argv.includes('--force'), maxMinutes: DEFAULT_MAX_MINUTES };
  for (let i = 0; i < argv.length; i++) {
    let v = null;
    if (argv[i] === '--max-minutes') v = argv[i + 1];
    else if (argv[i].startsWith('--max-minutes=')) v = argv[i].slice('--max-minutes='.length);
    if (v != null) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`bad --max-minutes: ${v}`);
      out.maxMinutes = n;
    }
  }
  return out;
}

async function main() {
  const key = (process.env.TIINGO_API_KEY ?? '').trim();
  if (!key) {
    console.log('TIINGO_API_KEY is not set. Skipping the price-history backfill (nothing fetched, nothing written).');
    console.log('Get a free key at https://www.tiingo.com and add it as the TIINGO_API_KEY repository secret.');
    return 0;
  }
  const { force, maxMinutes } = parseArgs(process.argv.slice(2));
  const { symbols } = collectSymbols(await loadProfiles());
  await runBackfill({ key, symbols, force, maxMinutes });
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err.message);
    process.exit(1);
  });
}
