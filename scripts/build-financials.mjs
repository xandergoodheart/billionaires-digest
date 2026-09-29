// Company financials from SEC XBRL company facts for every ticker in data/people/*.json controls[].
//
//   node scripts/build-financials.mjs
//   (User-Agent from SEC_USER_AGENT, default "Billionaires Digest hello@billionairesdigest.com")
//
// Writes data/financials/index.json (only when the content changed, ignoring `generated`).
// Only US listings (Nasdaq / NYSE) are looked up; everything else is recorded as not available.
// SEC fair access: identified User-Agent, sequential requests, at most 5 per second.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadProfiles, readJson, spacer, sleep, writeJson } from './lib/data-common.mjs';
import { splitTicker, isUsListing, tickerMap, lookupCik, summarizeCompanyFacts, sameContent } from './lib/financials.mjs';

const OUT = join(ROOT, 'data', 'financials', 'index.json');
const USER_AGENT = (process.env.SEC_USER_AGENT ?? '').trim() || 'Billionaires Digest hello@billionairesdigest.com';
const throttle = spacer(200); // <= 5 requests/second

async function secFetch(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if ((res.status === 429 || res.status >= 500) && attempt === 1) {
      await sleep(2000);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
}

// symbol -> { us: boolean, note }
function collectSymbols(profiles) {
  const out = new Map();
  for (const p of profiles) {
    for (const c of p.controls || []) {
      for (const s of splitTicker(c.ticker, c.exchange)) {
        const us = isUsListing(s.exchange, s.note);
        const cur = out.get(s.symbol);
        if (!cur) out.set(s.symbol, { us, note: s.note });
        else if (us) cur.us = true;
      }
    }
  }
  return out;
}

export async function main() {
  const profiles = await loadProfiles();
  const symbols = collectSymbols(profiles);
  const map = tickerMap(await secFetch('https://www.sec.gov/files/company_tickers.json'));
  if (!map.size) throw new Error('SEC company_tickers.json was empty');

  const byCik = new Map(); // cik -> summary (fetched once per company)
  const tickers = {};
  let failures = 0;
  for (const sym of [...symbols.keys()].sort()) {
    const info = symbols.get(sym);
    if (!info.us) {
      tickers[sym] = { available: false, reason: info.note ? `Not a current US listing (${info.note}).` : 'Not a US listing; no SEC 10-Q/10-K data.' };
      continue;
    }
    const hit = lookupCik(map, sym);
    if (!hit) {
      tickers[sym] = { available: false, reason: 'Ticker not found in SEC company_tickers.json.' };
      continue;
    }
    if (!byCik.has(hit.cik)) {
      try {
        const doc = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${hit.cik}.json`);
        byCik.set(hit.cik, doc ? summarizeCompanyFacts(doc, hit.cik) : { available: false, reason: 'No SEC XBRL company facts for this CIK.' });
      } catch (err) {
        failures++;
        console.warn(`! ${sym} (CIK ${hit.cik}): ${err.message}`);
        byCik.set(hit.cik, { available: false, reason: 'SEC request failed this run.' });
      }
    }
    tickers[sym] = byCik.get(hit.cik);
  }

  if (failures && failures === byCik.size) {
    console.error('Every SEC company facts request failed; nothing written.');
    process.exitCode = 1;
    return;
  }

  const out = { generated: new Date().toISOString(), source: 'SEC XBRL company facts', tickers };
  const prev = await readJson(OUT, null);
  const avail = Object.values(tickers).filter((t) => t.available).length;
  if (sameContent(prev, JSON.parse(JSON.stringify(out)))) {
    console.log(`Financials unchanged (${avail}/${symbols.size} tickers available). Nothing written.`);
    return;
  }
  await writeJson(OUT, out);
  console.log(`Wrote data/financials/index.json: ${avail} available, ${symbols.size - avail} not available.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
