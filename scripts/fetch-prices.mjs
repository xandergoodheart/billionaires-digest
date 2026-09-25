// Morning data: quotes for US-listed tickers in data/people/*.json (controls + stakes), from Finnhub.
//
//   FINNHUB_API_KEY=... node scripts/fetch-prices.mjs
//
// Also quotes the Billionaire Fantasy League symbols (scripts/lib/fantasy.mjs): SPY, name aliases and the
// curated US ADR lines used for daily returns only.
// Writes data/prices/latest.json, data/prices/history/<SYM>.json and data/prices/networth-est.json.
// Exits 0 without fetching or writing when FINNHUB_API_KEY is unset.
// The key is sent in the X-Finnhub-Token header and is never logged.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fantasySymbols } from './lib/fantasy.mjs';
import { ROOT, METHOD, MIN_COVERAGE, loadProfiles, holdingSymbols, estimateAll, adrSet, worthBySlug, nyDate, readJson, spacer, sleep, writeJson } from './lib/data-common.mjs';

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

export function collectSymbols(profiles) {
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
  for (const s of symbols) skipped.delete(s);
  return { symbols: [...symbols].sort(), skipped: [...skipped].map(([symbol, reason]) => ({ symbol, reason })) };
}

async function appendHistory(symbol, isoDate, close) {
  const path = join(OUT_DIR, 'history', `${symbol}.json`);
  const rows = await readJson(path, []);
  const map = new Map(Array.isArray(rows) ? rows.filter((r) => Array.isArray(r) && r.length === 2) : []);
  map.set(isoDate, close);
  const out = [...map].sort((a, b) => a[0].localeCompare(b[0])).slice(-HISTORY_KEEP);
  await writeJson(path, out, { pretty: false });
}

async function main() {
  if (!KEY) {
    console.log('FINNHUB_API_KEY is not set. Skipping market data (nothing fetched, nothing written).');
    console.log('Get a free key at https://finnhub.io and add it as the FINNHUB_API_KEY repository secret.');
    return 0;
  }

  const profiles = await loadProfiles();
  const { symbols, skipped } = collectSymbols(profiles);
  console.log(`US symbols to quote: ${symbols.length}; skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`  skip ${s.symbol}: ${s.reason}`);

  const quotes = {};
  for (const sym of symbols) {
    try {
      const q = await quote(sym);
      if (!q || typeof q.c !== 'number' || q.c === 0 || !q.t) {
        skipped.push({ symbol: sym, reason: 'no quote from Finnhub' });
        continue;
      }
      quotes[sym] = {
        price: q.c,
        change: typeof q.d === 'number' ? q.d : null,
        changePct: typeof q.dp === 'number' ? q.dp : null,
        prevClose: typeof q.pc === 'number' ? q.pc : null,
        time: new Date(q.t * 1000).toISOString(),
      };
      await appendHistory(sym, nyDate(new Date(q.t * 1000)), q.c);
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

  await writeJson(join(OUT_DIR, 'latest.json'), { generated, provider: 'Finnhub', quotes, skipped });

  const worths = worthBySlug(await readJson(join(ROOT, 'data', 'people', 'index.json'), {}));
  const { people, excluded, skipped: estSkipped } = estimateAll(profiles, quotes, adrSet(profiles), worths);
  await writeJson(join(OUT_DIR, 'networth-est.json'), { generated, method: METHOD, minCoverage: MIN_COVERAGE, people, excluded, skipped: estSkipped });

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
