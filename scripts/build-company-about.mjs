// "What the company does" for every ticker a draftable player scores on (the newest fantasy week file).
//
//   node scripts/build-company-about.mjs            fetch what is missing (cached), then write data/companies/about.json
//   node scripts/build-company-about.mjs --offline  only use the cache
//
// For each ticker: SEC company_tickers.json -> CIK -> submissions JSON (sicDescription = industry, business address
// = HQ, newest 10-K / 20-F / 40-F) -> that filing's main document. The Business section's opening is saved to
// .cache/company-about/excerpts/<TICKER>.txt so a person can write the summary.
// The plain-language summaries are hand-written in data/companies/about-text.json and never overwritten here:
//   { "TICKER": { "whatTheyDo": "...",                       our own words, from the source's Business section
//                 "source": { "sourceName", "sourceUrl", "asOf", "industry", "hq", "name" },  only for non-SEC filers
//                 "note": { "text", "sourceUrl" } } }          only when already in a sourced data/people profile
// A ticker with no summary still gets industry / HQ / source (the drawer then shows just those).
// SEC fair access: User-Agent from SEC_USER_AGENT (default "Billionaires Digest hello@billionairesdigest.com"),
// sequential requests, at most 5 per second. Cache: .cache/company-about/ (gitignored).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson, writeJson, spacer, sleep } from './lib/data-common.mjs';
import { tickerMap, lookupCik } from './lib/financials.mjs';
import { latestAnnual, archiveUrl, hqOf, htmlToText, businessExcerpt, checkEntry } from './lib/company-about.mjs';

const OUT = join(ROOT, 'data', 'companies', 'about.json');
const TEXT = join(ROOT, 'data', 'companies', 'about-text.json');
const CACHE = join(ROOT, '.cache', 'company-about');
const USER_AGENT = (process.env.SEC_USER_AGENT ?? '').trim() || 'Billionaires Digest hello@billionairesdigest.com';
const OFFLINE = process.argv.includes('--offline');
const throttle = spacer(220); // < 5 requests/second
// Listed companies missing from SEC company_tickers.json (recent listings, funds): ticker -> CIK (from EDGAR search)
const CIK_OVERRIDES = { JMKE: '0002127043', SPCX: '0001181412', COAG: '0002114044', MXF: '0000065433' };

function cacheName(url) { return url.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-180); }
async function secGet(url, { json = false } = {}) {
  const file = join(CACHE, 'raw', cacheName(url));
  if (existsSync(file)) { const s = await readFile(file, 'utf8'); return json ? JSON.parse(s) : s; }
  if (OFFLINE) return null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } });
    if (res.ok) {
      const s = await res.text();
      await mkdir(join(CACHE, 'raw'), { recursive: true });
      await writeFile(file, s);
      return json ? JSON.parse(s) : s;
    }
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * attempt); continue; }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return null;
}

const FORM_WORDS = { '10-K': 'annual report (10-K)', '20-F': 'annual report (20-F)', '40-F': 'annual report (40-F)', '10-KT': 'transition report (10-KT)', '424B4': 'IPO prospectus (424B4)', 'S-1': 'registration statement (S-1)', 'F-1': 'registration statement (F-1)', 'N-CSR': 'annual shareholder report (N-CSR)' };

// tickers (with the week file's company name) that any draftable player scores on
async function weekTickers() {
  const ix = await readJson(join(ROOT, 'data', 'fantasy', 'index.json'));
  const ids = (ix.weeks || []).map((w) => w.week);
  const wk = await readJson(join(ROOT, 'data', 'fantasy', 'weeks', ids[ids.length - 1] + '.json'));
  const out = new Map();
  for (const p of wk.draftable || []) for (const h of p.holdings || []) if (h && h.ticker && !out.has(h.ticker)) out.set(h.ticker, h.name || h.ticker);
  return { week: wk.week, tickers: out };
}

// 40-F filings keep the business description in an exhibit (the annual information form)
async function annualDoc(cik, an) {
  if (an.form !== '40-F') return an.primaryDocument;
  const idx = await secGet(archiveUrl(cik, an.accession, 'index.json'), { json: true });
  const items = (idx && idx.directory && idx.directory.item) || [];
  const htm = items.filter((i) => /\.htm/i.test(i.name));
  const aif = htm.find((i) => /aif|annual.?info/i.test(i.name)) || htm.filter((i) => /99[-_.]?1\b|ex99-?1|ex991/i.test(i.name)).sort((a, b) => (+b.size || 0) - (+a.size || 0))[0];
  return aif ? aif.name : an.primaryDocument;
}

export async function main() {
  const { week, tickers } = await weekTickers();
  const text = await readJson(TEXT, {});
  const map = tickerMap(await secGet('https://www.sec.gov/files/company_tickers.json', { json: true }));
  await mkdir(join(CACHE, 'excerpts'), { recursive: true });
  const companies = {};
  const missing = [];
  for (const [sym, weekName] of [...tickers.entries()].sort()) {
    const t = text[sym] || {};
    let entry = null;
    const hit = CIK_OVERRIDES[sym] ? { cik: CIK_OVERRIDES[sym] } : lookupCik(map, sym);
    if (hit) {
      const sub = await secGet(`https://data.sec.gov/submissions/CIK${hit.cik}.json`, { json: true });
      const an = latestAnnual(sub);
      if (sub && an) {
        const doc = await annualDoc(hit.cik, an);
        const url = archiveUrl(hit.cik, an.accession, doc);
        const html = await secGet(url);
        const ex = html ? businessExcerpt(htmlToText(html), 6000) : '';
        await writeFile(join(CACHE, 'excerpts', sym + '.txt'), `${sym} · ${sub.name} · ${an.form} filed ${an.filed}\n${url}\nfull filing (cached HTML): ${join(CACHE, 'raw', cacheName(url))}\n\n${ex || '(no Business section found)'}\n`);
        entry = { ticker: sym, name: t.name || weekName, industry: sub.sicDescription || '', hq: hqOf(sub),
          sourceName: `${sub.name} ${FORM_WORDS[an.form] || an.form} (filed ${an.filed})`, sourceUrl: url, asOf: an.filed, cik: hit.cik, form: an.form };
      }
    }
    if (t.source) entry = { ...(entry || { ticker: sym, name: t.name || weekName }), ...t.source, ticker: sym };
    if (!entry) { missing.push(sym); continue; }
    if (t.name) entry.name = t.name;
    if (t.industry && !entry.industry) entry.industry = t.industry;
    if (t.whatTheyDo) entry.whatTheyDo = t.whatTheyDo;
    if (t.note) entry.note = t.note;
    const bad = checkEntry(entry);
    if (bad.length) { console.warn(`! ${sym}: ${bad.join('; ')}`); if (bad.some((b) => /^missing (sourceUrl|asOf|sourceName)/.test(b))) { missing.push(sym); continue; } }
    companies[sym] = entry;
  }
  const out = {
    note: 'What each company does, in our own words, from its latest annual report (SEC 10-K / 20-F / 40-F, or the company\'s own annual report for non-SEC filers). Industry = SEC SIC description; HQ = SEC business address. Facts only; not financial advice.',
    week, companies
  };
  await writeJson(OUT, out);
  const n = Object.keys(companies).length, w = Object.values(companies).filter((c) => c.whatTheyDo).length;
  console.log(`about.json: ${n} of ${tickers.size} tickers, ${w} with a summary. No source: ${missing.join(', ') || 'none'}`);
  return { n, w, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
