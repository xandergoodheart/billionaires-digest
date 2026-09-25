// Morning data: recent SEC EDGAR filings for every CIK in data/people/*.json.
//
//   SEC_USER_AGENT="Billionaires Digest hello@billionairesdigest.com" node scripts/fetch-filings.mjs
//
// Writes data/filings/latest.json and data/filings/by-person/<slug>.json.
// Form 4 and Form 144 filings (newest 60 of each) also get a parsed summary (form4 / form144).
// SEC fair access: identified User-Agent (from env only), sequential requests, at most ~6-7 per second.
// Exits 0 without fetching when SEC_USER_AGENT is unset. Exits 1 (and writes nothing) only when
// every CIK request failed.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadProfiles, padCik, spacer, sleep, writeJson } from './lib/data-common.mjs';

const WINDOW_DAYS = 90;
const FORM4_CAP = 60;
const FORM144_CAP = 60;
const MAX_DESCRIPTION = 200;
const OUT_DIR = join(ROOT, 'data', 'filings');

const FORMS = new Set([
  '4', '4/A', '3', '5', '144',
  'SC 13D', 'SC 13D/A', 'SC 13G', 'SC 13G/A',
  'SCHEDULE 13D', 'SCHEDULE 13D/A', 'SCHEDULE 13G', 'SCHEDULE 13G/A',
  '13F-HR', '13F-HR/A', '8-K', 'S-1', 'D',
]);

const CODE_LABELS = {
  P: 'Open-market buy',
  S: 'Open-market sale',
  A: 'Grant or award',
  M: 'Option exercise',
  G: 'Gift',
  F: 'Tax withholding',
  D: 'Disposition to issuer',
  C: 'Conversion',
  X: 'Option exercise (in the money)',
  J: 'Other',
};

const USER_AGENT = (process.env.SEC_USER_AGENT ?? '').trim();

const throttle = spacer(150); // <= ~6.7 requests/second

async function secFetch(url, { as = 'json' } = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' },
    });
    if (res.ok) return as === 'json' ? res.json() : res.text();
    if ((res.status === 429 || res.status >= 500) && attempt === 1) {
      await sleep(2000);
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}

function collectCiks(profiles) {
  // cik -> [{ person, personSlug }]
  const map = new Map();
  const add = (cik, profile) => {
    const c = padCik(cik);
    if (!c) return;
    if (!map.has(c)) map.set(c, []);
    const list = map.get(c);
    if (!list.some((p) => p.personSlug === profile.slug)) list.push({ person: profile.name, personSlug: profile.slug });
  };
  for (const p of profiles) {
    if (p.secPersonCik) add(p.secPersonCik, p);
    for (const v of p.vehicles ?? []) if (v.cik) add(v.cik, p);
  }
  return map;
}

function recentFilings(sub, cik, cutoff) {
  const r = sub?.filings?.recent;
  if (!r || !Array.isArray(r.accessionNumber)) return [];
  const cikInt = String(Number(cik));
  const out = [];
  for (let i = 0; i < r.accessionNumber.length; i++) {
    const form = r.form?.[i];
    const filed = r.filingDate?.[i];
    if (!FORMS.has(form) || !filed || filed < cutoff) continue;
    const accession = r.accessionNumber[i];
    const accNoDash = accession.replace(/-/g, '');
    const primary = r.primaryDocument?.[i] || '';
    const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/`;
    const rec = {
      cik,
      filer: sub.name,
      form,
      filed,
      reportDate: r.reportDate?.[i] || undefined,
      accession,
      url: primary ? base + primary : base,
      indexUrl: `${base}${accession}-index.htm`,
      description: r.primaryDocDescription?.[i] || undefined,
      primaryDocument: primary,
    };
    if (rec.description && rec.description.length > MAX_DESCRIPTION) rec.description = rec.description.slice(0, MAX_DESCRIPTION - 1) + '…';
    out.push(rec);
  }
  return out;
}

// ---------- Form 4 XML ----------

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : undefined;
}

// Value of <outer>...<value>X</value>...</outer>, or of <outer>X</outer> when there is no <value>.
function val(xml, ...path) {
  let cur = xml;
  for (const p of path) {
    cur = tag(cur, p);
    if (cur === undefined) return undefined;
  }
  const inner = tag(cur, 'value');
  const s = decode(inner !== undefined ? inner : cur);
  return s === '' ? undefined : s;
}

const num = (s) => {
  if (s === undefined) return undefined;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

function directionFor(code, ad) {
  if (code === 'P' || code === 'A') return 'up';
  if (code === 'M') return ad === 'D' ? 'down' : 'up';
  if (code === 'S' || code === 'F' || code === 'D') return 'down';
  if (code === 'G') return 'flat';
  if (ad === 'A') return 'up';
  if (ad === 'D') return 'down';
  return 'flat';
}

export function parseForm4(xml) {
  const issuer = val(xml, 'issuer', 'issuerName');
  const ticker = val(xml, 'issuer', 'issuerTradingSymbol');
  const blocks = xml.match(/<nonDerivativeTransaction\b[\s\S]*?<\/nonDerivativeTransaction>/g) ?? [];
  const transactions = blocks.map((b) => {
    const code = val(b, 'transactionCoding', 'transactionCode');
    const shares = num(val(b, 'transactionAmounts', 'transactionShares'));
    const price = num(val(b, 'transactionAmounts', 'transactionPricePerShare'));
    const ad = val(b, 'transactionAmounts', 'transactionAcquiredDisposedCode');
    const t = {
      securityTitle: val(b, 'securityTitle'),
      date: val(b, 'transactionDate'),
      code,
      codeLabel: code ? CODE_LABELS[code] ?? undefined : undefined,
      shares,
      price,
      value: shares !== undefined && price ? Math.round(shares * price) : undefined,
      acquiredDisposed: ad,
      sharesOwnedFollowing: num(val(b, 'postTransactionAmounts', 'sharesOwnedFollowingTransaction')),
      direction: directionFor(code, ad),
    };
    return t;
  });

  // One summary line per transaction code + acquired/disposed + security (derivative-only filings get an empty summary).
  const groups = new Map();
  for (const t of transactions) {
    const key = `${t.code ?? "?"}|${t.acquiredDisposed ?? "?"}|${t.securityTitle ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const summary = [...groups.values()].map((ts) => {
    const first = ts[0];
    const allShares = ts.every((t) => t.shares !== undefined);
    const shares = allShares ? ts.reduce((s, t) => s + t.shares, 0) : undefined;
    const allPriced = allShares && ts.every((t) => t.price);
    const value = allPriced ? ts.reduce((s, t) => s + t.shares * t.price, 0) : undefined;
    const price = allPriced && shares ? Math.round((value / shares) * 100) / 100 : undefined;
    return {
      issuer,
      ticker,
      securityTitle: first.securityTitle,
      code: first.code,
      codeLabel: first.codeLabel,
      shares,
      price,
      value: value !== undefined ? Math.round(value) : undefined,
      direction: first.direction,
      transactions: ts.length,
    };
  });

  const MAX_TX = 25;
  return { issuer, ticker, summary, transactionCount: transactions.length, transactions: transactions.slice(0, MAX_TX) };
}

// ---------- Form 144 XML (notice of proposed sale) ----------

// "09/24/2026" -> "2026-09-24"; anything else -> undefined.
function isoFromUs(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return undefined;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function allTags(xml, name) {
  return xml.match(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?</${name}>`, 'g')) ?? [];
}

// Summary of a Form 144 primary_doc.xml. Broker details are deliberately left out.
// Missing fields are omitted, never guessed. Form 144 has no ticker field.
export function parseForm144(rawXml) {
  // Some filers use namespace prefixes (<ns2:issuerName>); drop them so one parser fits both.
  const xml = String(rawXml).replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1');
  const issuerInfo = tag(xml, 'issuerInfo') ?? '';
  const issuer = val(issuerInfo, 'issuerName');
  const issuerCik = val(issuerInfo, 'issuerCik');
  const seller = val(issuerInfo, 'nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold');
  const relBlock = tag(issuerInfo, 'relationshipsToIssuer') ?? '';
  const relationships = allTags(relBlock, 'relationshipToIssuer').map((b) => decode(b.replace(/<[^>]+>/g, ''))).filter(Boolean);

  const lots = allTags(xml, 'securitiesInformation').map((b) => {
    const lot = {
      securitiesClassTitle: val(b, 'securitiesClassTitle'),
      shares: num(val(b, 'noOfUnitsSold')),
      aggregateMarketValue: num(val(b, 'aggregateMarketValue')),
      approxSaleDate: isoFromUs(val(b, 'approxSaleDate')),
      exchange: val(b, 'securitiesExchangeName'),
    };
    for (const k of Object.keys(lot)) if (lot[k] === undefined) delete lot[k];
    return lot;
  }).filter((l) => Object.keys(l).length);

  const out = { issuer, issuerCik, seller, relationships: relationships.length ? relationships : undefined };
  if (lots.length) {
    const titles = [...new Set(lots.map((l) => l.securitiesClassTitle).filter(Boolean))];
    if (titles.length) out.securitiesClassTitle = titles.join('; ');
    if (lots.every((l) => l.shares !== undefined)) out.shares = lots.reduce((s, l) => s + l.shares, 0);
    if (lots.every((l) => l.aggregateMarketValue !== undefined)) out.aggregateMarketValue = Math.round(lots.reduce((s, l) => s + l.aggregateMarketValue, 0));
    const dates = lots.map((l) => l.approxSaleDate).filter(Boolean).sort();
    if (dates.length) out.approxSaleDate = dates[0];
    if (lots.length > 1) out.lots = lots;
  }
  const notice = tag(xml, 'noticeSignature') ?? '';
  const noticeDate = isoFromUs(val(notice, 'noticeDate'));
  if (noticeDate) out.noticeDate = noticeDate;
  const planDates = allTags(notice, 'planAdoptionDate').map((b) => isoFromUs(decode(b.replace(/<[^>]+>/g, '')))).filter(Boolean);
  if (planDates.length) out.planAdoptionDates = planDates;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

function rawXmlUrl(rec) {
  const doc = rec.primaryDocument;
  if (!doc || !/\.xml$/i.test(doc)) return null;
  const parts = doc.split('/');
  const raw = parts.length > 1 && /^xsl/i.test(parts[0]) ? parts.slice(1).join('/') : doc;
  return rec.url.slice(0, rec.url.length - doc.length) + raw;
}

// ---------- main ----------

async function main() {
  if (!USER_AGENT) {
    console.log('SEC_USER_AGENT is not set. Skipping SEC filings (nothing fetched, nothing written).');
    console.log('Set it to something like "Billionaires Digest hello@billionairesdigest.com".');
    return 0;
  }

  const profiles = await loadProfiles();
  const cikMap = collectCiks(profiles);
  console.log(`CIKs to fetch: ${cikMap.size} (from ${profiles.length} profiles)`);

  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);

  let attempted = 0;
  let fetched = 0;
  const byKey = new Map(); // accession|slug -> record
  const fetchedSlugs = new Set();

  for (const [cik, people] of cikMap) {
    attempted++;
    let sub;
    try {
      sub = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
    } catch (err) {
      console.warn(`! CIK ${cik} (${people.map((p) => p.person).join(', ')}): ${err.message}`);
      continue;
    }
    fetched++;
    const recs = recentFilings(sub, cik, cutoff);
    for (const p of people) {
      fetchedSlugs.add(p.personSlug);
      for (const r of recs) {
        const key = `${r.accession}|${p.personSlug}`;
        if (!byKey.has(key)) byKey.set(key, { ...r, person: p.person, personSlug: p.personSlug });
      }
    }
    console.log(`  ${cik} ${sub.name}: ${recs.length} in window`);
  }

  if (attempted > 0 && fetched === 0) {
    console.error('No CIK could be fetched from EDGAR. Leaving existing output untouched.');
    return 1;
  }

  const filings = [...byKey.values()].sort((a, b) =>
    a.filed === b.filed ? b.accession.localeCompare(a.accession) : b.filed.localeCompare(a.filed));

  // Form 4 detail: newest first, one fetch per accession, capped.
  const form4Cache = new Map();
  let form4Tried = 0;
  let form4Parsed = 0;
  for (const rec of filings) {
    if (rec.form !== '4' && rec.form !== '4/A') continue;
    if (!form4Cache.has(rec.accession)) {
      if (form4Tried >= FORM4_CAP) continue;
      const url = rawXmlUrl(rec);
      if (!url) continue;
      form4Tried++;
      try {
        const xml = await secFetch(url, { as: 'text' });
        const parsed = parseForm4(xml);
        form4Cache.set(rec.accession, parsed);
        form4Parsed++;
      } catch (err) {
        console.warn(`! Form 4 ${rec.accession}: ${err.message}`);
        form4Cache.set(rec.accession, null);
      }
    }
    const parsed = form4Cache.get(rec.accession);
    if (parsed) rec.form4 = parsed;
  }

  // Form 144 detail: newest first, one fetch per accession, capped.
  const form144Cache = new Map();
  let form144Tried = 0;
  let form144Parsed = 0;
  for (const rec of filings) {
    if (rec.form !== '144') continue;
    if (!form144Cache.has(rec.accession)) {
      if (form144Tried >= FORM144_CAP) continue;
      const url = rawXmlUrl(rec);
      if (!url) continue;
      form144Tried++;
      try {
        const xml = await secFetch(url, { as: 'text' });
        form144Cache.set(rec.accession, parseForm144(xml));
        form144Parsed++;
      } catch (err) {
        console.warn(`! Form 144 ${rec.accession}: ${err.message}`);
        form144Cache.set(rec.accession, null);
      }
    }
    const parsed = form144Cache.get(rec.accession);
    if (parsed && Object.keys(parsed).length) rec.form144 = parsed;
  }

  for (const rec of filings) delete rec.primaryDocument;

  const generated = now.toISOString();
  await writeJson(join(OUT_DIR, 'latest.json'), { generated, windowDays: WINDOW_DAYS, filings });

  const bySlug = new Map([...fetchedSlugs].map((s) => [s, []]));
  for (const f of filings) bySlug.get(f.personSlug)?.push(f);
  for (const [slug, list] of bySlug) {
    const person = list[0]?.person ?? profiles.find((p) => p.slug === slug)?.name;
    await writeJson(join(OUT_DIR, 'by-person', `${slug}.json`), { generated, windowDays: WINDOW_DAYS, person, personSlug: slug, filings: list });
  }

  console.log(`Done. CIKs fetched ${fetched}/${attempted}; filings kept ${filings.length}; Form 4s parsed ${form4Parsed}/${form4Tried}; Form 144s parsed ${form144Parsed}/${form144Tried}; people files ${bySlug.size}.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
}
