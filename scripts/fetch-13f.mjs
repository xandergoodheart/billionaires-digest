// Weekly data: what the billionaires' funds reported in their two latest 13F-HR filings.
//
//   SEC_USER_AGENT="Billionaires Digest hello@billionairesdigest.com" node scripts/fetch-13f.mjs
//
// Filers: every CIK in data/people/*.json (secPersonCik + vehicles[].cik) whose EDGAR submissions
// list a 13F-HR for a recent quarter. For each filer, the two most recent report periods are
// compared: new positions, exits, increases, decreases, and the top 10 holdings.
//
// Writes data/13f/<filer-slug>.json and data/13f/index.json.
// SEC fair access: identified User-Agent (from env only), sequential requests, at most ~6-7 per second.
// Exits 0 without fetching when SEC_USER_AGENT is unset. Exits 1 (and writes nothing) only when
// every submissions request failed.

import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadProfiles, padCik, spacer, sleep, writeJson } from './lib/data-common.mjs';

const OUT_DIR = join(ROOT, 'data', '13f');
const STALE_DAYS = 200;   // a filer whose latest 13F-HR period is older than this is skipped (about two quarters)
const LIST_CAP = 25;      // entries kept per change list (largest first); counts are always complete
const TOP_N = 10;

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

export function slugify(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'filer';
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

// 13F-HR and 13F-HR/A rows from one submissions block ({ accessionNumber: [], form: [], ... }).
function rows13f(block) {
  const out = [];
  if (!block || !Array.isArray(block.accessionNumber)) return out;
  for (let i = 0; i < block.accessionNumber.length; i++) {
    const form = block.form?.[i];
    if (form !== '13F-HR' && form !== '13F-HR/A') continue;
    out.push({
      form,
      accession: block.accessionNumber[i],
      filed: block.filingDate?.[i] || '',
      period: block.reportDate?.[i] || '',
      primaryDocument: block.primaryDocument?.[i] || '',
    });
  }
  return out;
}

// ---------- XML ----------

export const decode = (s) =>
  String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// First <[prefix:]name>...</[prefix:]name> inside xml (namespace prefix tolerant).
function tag(xml, name) {
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`));
  return m ? m[1] : undefined;
}

// Parse an information table into rows. valueInDollars: false multiplies by 1000.
export function parseInfoTable(xml, valueInDollars) {
  const rows = [];
  const re = /<(?:[\w.-]+:)?infoTable\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?infoTable>/g;
  let m;
  while ((m = re.exec(xml))) {
    const x = m[1];
    const sh = tag(x, 'shrsOrPrnAmt') ?? '';
    const value = Number(decode(tag(x, 'value')).replace(/,/g, ''));
    const amt = Number(decode(tag(sh, 'sshPrnamt')).replace(/,/g, ''));
    rows.push({
      name: decode(tag(x, 'nameOfIssuer')),
      title: decode(tag(x, 'titleOfClass')),
      cusip: decode(tag(x, 'cusip')).toUpperCase(),
      value: Number.isFinite(value) ? (valueInDollars ? value : value * 1000) : 0,
      shares: Number.isFinite(amt) ? amt : 0,
      shareType: decode(tag(sh, 'sshPrnamtType')) || 'SH',
      putCall: decode(tag(x, 'putCall')) || '',
    });
  }
  return rows;
}

// Aggregate rows by cusip + putCall (+ share type, so share and principal amounts never mix).
export function aggregate(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.cusip) continue;
    const key = `${r.cusip}|${r.putCall}|${r.shareType}`;
    const cur = map.get(key);
    if (cur) {
      cur.value += r.value;
      cur.shares += r.shares;
    } else {
      map.set(key, { key, ...r });
    }
  }
  return map;
}

const pct1 = (x) => Math.round(x * 1000) / 10; // fraction -> percent, 1 decimal

// Compare current vs previous aggregated holdings.
export function diffHoldings(cur, prev) {
  const out = { new: [], exited: [], increased: [], decreased: [] };
  for (const [k, c] of cur) {
    const p = prev.get(k);
    const base = { name: c.name, title: c.title, cusip: c.cusip, putCall: c.putCall || undefined, shareType: c.shareType };
    if (!p) {
      out.new.push({ ...base, shares: c.shares, sharesChange: c.shares, value: c.value });
    } else if (c.shares !== p.shares) {
      const d = c.shares - p.shares;
      const e = { ...base, shares: c.shares, prevShares: p.shares, sharesChange: d,
        sharesChangePct: p.shares ? pct1(d / p.shares) : null, value: c.value, prevValue: p.value };
      (d > 0 ? out.increased : out.decreased).push(e);
    }
  }
  for (const [k, p] of prev) {
    if (cur.has(k)) continue;
    out.exited.push({ name: p.name, title: p.title, cusip: p.cusip, putCall: p.putCall || undefined, shareType: p.shareType,
      shares: 0, prevShares: p.shares, sharesChange: -p.shares, value: 0, prevValue: p.value });
  }
  // largest first: new by value, exited by prior value, changes by the value of the share change at today's (current-period) price
  const perShare = (e) => (e.shares ? e.value / e.shares : (e.prevShares ? (e.prevValue || 0) / e.prevShares : 0));
  out.new.sort((a, b) => b.value - a.value);
  out.exited.sort((a, b) => b.prevValue - a.prevValue);
  for (const e of [...out.increased, ...out.decreased]) e.valueChange = Math.round(e.sharesChange * perShare(e));
  out.increased.sort((a, b) => b.valueChange - a.valueChange);
  out.decreased.sort((a, b) => a.valueChange - b.valueChange);
  return out;
}

// ---------- per-filing fetch ----------

async function filingIndex(cikInt, accession) {
  const dir = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accession.replace(/-/g, '')}/`;
  const ix = await secFetch(`${dir}index.json`);
  const items = Array.isArray(ix?.directory?.item) ? ix.directory.item : [];
  return { dir, items };
}

function pickInfoTable(items, primaryDocument) {
  const primary = String(primaryDocument || '').split('/').pop().toLowerCase();
  const xmls = items.filter((it) => /\.xml$/i.test(it.name || '') && it.name.toLowerCase() !== primary && it.name.toLowerCase() !== 'primary_doc.xml');
  if (!xmls.length) return null;
  const named = xmls.find((it) => /info|table/i.test(it.name));
  if (named) return named.name;
  return xmls.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0].name;
}

// Is this 13F-HR/A a full restatement? Reads its primary document (the cover page XML).
async function isRestatement(cikInt, row) {
  try {
    const { dir, items } = await filingIndex(cikInt, row.accession);
    const primaryName = items.find((it) => /^primary_doc\.xml$/i.test(it.name || ''))?.name
      || String(row.primaryDocument || '').split('/').pop();
    if (!primaryName) return false;
    const xml = await secFetch(dir + primaryName, { as: 'text' });
    return /RESTATEMENT/i.test(tag(xml, 'amendmentType') ?? '');
  } catch {
    return false;
  }
}

async function loadHoldings(cikInt, row) {
  const { dir, items } = await filingIndex(cikInt, row.accession);
  const name = pickInfoTable(items, row.primaryDocument);
  const url = `${dir}${row.accession}-index.htm`;
  if (!name) return { url, rows: [], confidential: true };
  const xml = await secFetch(dir + name, { as: 'text' });
  const valueInDollars = row.period >= '2022-12-31';
  const rows = parseInfoTable(xml, valueInDollars);
  return { url, rows, confidential: rows.length === 0, infoTableUrl: dir + name };
}

// For each report period (newest first) choose the filing to use: the latest full restatement, else the original.
async function choosePeriods(cikInt, rows) {
  const byPeriod = new Map();
  for (const r of rows) {
    if (!r.period) continue;
    if (!byPeriod.has(r.period)) byPeriod.set(r.period, []);
    byPeriod.get(r.period).push(r);
  }
  const periods = [...byPeriod.keys()].sort().reverse();
  const chosen = [];
  for (const period of periods) {
    if (chosen.length >= 2) break;
    const list = byPeriod.get(period).sort((a, b) => b.filed.localeCompare(a.filed) || b.accession.localeCompare(a.accession));
    const original = list.filter((r) => r.form === '13F-HR').sort((a, b) => a.filed.localeCompare(b.filed))[0];
    let pick = null;
    for (const a of list.filter((r) => r.form === '13F-HR/A')) {
      if (await isRestatement(cikInt, a)) { pick = { ...a, restatement: true }; break; }
    }
    if (!pick) pick = original || null;
    if (pick) chosen.push(pick);
  }
  return chosen;
}

function top(map, total) {
  return [...map.values()]
    .filter((h) => !h.putCall)
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)
    .map((h) => ({ name: h.name, title: h.title, cusip: h.cusip, shares: h.shares, shareType: h.shareType,
      value: h.value, pct: total ? pct1(h.value / total) : null }));
}

// ---------- main ----------

async function main() {
  if (!USER_AGENT) {
    console.log('SEC_USER_AGENT is not set. Skipping 13F filings (nothing fetched, nothing written).');
    return 0;
  }
  const profiles = await loadProfiles();
  const cikMap = collectCiks(profiles);
  console.log(`CIKs to check: ${cikMap.size}`);

  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400e3).toISOString().slice(0, 10);
  let fetched = 0;
  const filers = [];
  const skipped = [];
  const usedSlugs = new Set();

  for (const [cik, people] of cikMap) {
    let sub;
    try {
      sub = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
    } catch (err) {
      console.warn(`! CIK ${cik}: ${err.message}`);
      skipped.push({ cik, reason: `submissions request failed (${err.message})` });
      continue;
    }
    fetched++;
    let rows = rows13f(sub?.filings?.recent);
    // Older filings live in extra files; read the first one only if the recent block lacks two periods.
    if (new Set(rows.map((r) => r.period)).size < 2 && Array.isArray(sub?.filings?.files) && sub.filings.files[0]?.name && rows.length) {
      try { rows = rows.concat(rows13f(await secFetch(`https://data.sec.gov/submissions/${sub.filings.files[0].name}`))); } catch {}
    }
    if (!rows.length) continue;
    const latestPeriod = rows.map((r) => r.period).sort().pop();
    if (!latestPeriod || latestPeriod < staleCutoff) {
      skipped.push({ cik, filer: sub.name, reason: `latest 13F-HR period ${latestPeriod || 'unknown'} is older than ${STALE_DAYS} days` });
      console.log(`  ${cik} ${sub.name}: stale (${latestPeriod})`);
      continue;
    }

    const cikInt = String(Number(cik));
    try {
      const [curRow, prevRow] = await choosePeriods(cikInt, rows);
      if (!curRow) continue;
      const cur = await loadHoldings(cikInt, curRow);
      const prev = prevRow ? await loadHoldings(cikInt, prevRow) : null;
      const curMap = aggregate(cur.rows);
      const prevMap = prev ? aggregate(prev.rows) : new Map();
      const totalValue = cur.rows.reduce((s, r) => s + r.value, 0);
      const d = prev && !prev.confidential && !cur.confidential ? diffHoldings(curMap, prevMap) : null;

      let slug = slugify(sub.name);
      if (usedSlugs.has(slug)) slug = `${slug}-${cikInt}`;
      usedSlugs.add(slug);

      const summary = {
        filer: sub.name,
        slug,
        cik,
        person: people[0].person,
        personSlug: people[0].personSlug,
        people,
        period: curRow.period,
        prevPeriod: prevRow ? prevRow.period : null,
        filed: curRow.filed,
        form: curRow.restatement ? '13F-HR/A (restatement)' : curRow.form,
        accession: curRow.accession,
        url: cur.url,
        prevUrl: prev ? prev.url : null,
        confidential: cur.confidential || undefined,
        note: cur.confidential ? 'holdings confidential' : (!prev ? 'no earlier 13F-HR to compare' : (prev.confidential ? 'previous quarter holdings confidential' : undefined)),
        totalValue: Math.round(totalValue),
        positions: curMap.size,
        prevPositions: prev ? prevMap.size : null,
        new: d ? d.new.length : null,
        exited: d ? d.exited.length : null,
        increased: d ? d.increased.length : null,
        decreased: d ? d.decreased.length : null,
      };
      const detail = {
        generated: new Date().toISOString(),
        ...summary,
        infoTableUrl: cur.infoTableUrl || null,
        valueUnits: 'US dollars',
        top: top(curMap, totalValue),
        changes: d ? {
          new: d.new.slice(0, LIST_CAP),
          exited: d.exited.slice(0, LIST_CAP),
          increased: d.increased.slice(0, LIST_CAP),
          decreased: d.decreased.slice(0, LIST_CAP),
        } : null,
        listCap: LIST_CAP,
      };
      await writeJson(join(OUT_DIR, `${slug}.json`), detail);
      filers.push(summary);
      console.log(`  ${cik} ${sub.name}: ${curRow.period} vs ${prevRow?.period ?? '-'}; ${curMap.size} positions; new ${summary.new} exited ${summary.exited} up ${summary.increased} down ${summary.decreased}`);
    } catch (err) {
      console.warn(`! ${cik} ${sub.name}: ${err.message}`);
      skipped.push({ cik, filer: sub.name, reason: `13F fetch failed (${err.message})` });
    }
  }

  if (cikMap.size > 0 && fetched === 0) {
    console.error('No CIK could be fetched from EDGAR. Leaving existing output untouched.');
    return 1;
  }

  filers.sort((a, b) => b.totalValue - a.totalValue);
  await writeJson(join(OUT_DIR, 'index.json'), {
    generated: new Date().toISOString(),
    note: '13F filings arrive up to 45 days after quarter end. Values in US dollars as reported.',
    filers,
    skipped,
  });
  // remove per-filer files from earlier runs that are no longer produced
  const keep = new Set(filers.map((f) => `${f.slug}.json`).concat('index.json'));
  for (const f of await readdir(OUT_DIR)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT_DIR, f));
  console.log(`Done. 13F filers: ${filers.length}; skipped ${skipped.length}.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
}
