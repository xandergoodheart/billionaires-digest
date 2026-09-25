// Hypothetical "copycat" tracker: what if you had bought alongside every disclosed open-market purchase?
//
//   node scripts/build-copycat.mjs
//
// Reads data/filings/latest.json (Form 4 summaries) and data/prices/latest.json. No network.
// Only open-market purchases (transaction code P) on Form 4 count. Each buy is priced at the
// share-weighted average of its P lines and compared with today's quote when the ticker is quoted.
// The filings file only covers a recent window, so buys from earlier runs are kept (from
// data/copycat/latest.json) until they are 12 months old.
//
// Writes data/copycat/latest.json.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson, writeJson } from './lib/data-common.mjs';

const OUT = join(ROOT, 'data', 'copycat', 'latest.json');
const KEEP_DAYS = 365;

export const METHOD =
  "Hypothetical. Buys at the insider's reported price on their Form 4 filing, held to today's price. " +
  'Ignores timing lag, fees, taxes and dividends. Not investment advice.';

const US_SYMBOL = /^[A-Z]{1,5}(\.[A-Z])?$/;

// Which quote symbol a Form 4 security maps to. Multi-class tickers ("LEN, LEN.B") are matched by
// the class letter in the security title ("Class B Common Stock" -> LEN.B, "Class A ..." -> LEN).
export function resolveTicker(tickerText, securityTitle) {
  const tokens = String(tickerText ?? '').split(/[,/\s]+/).map((t) => t.trim().toUpperCase()).filter((t) => US_SYMBOL.test(t) && t !== 'NONE');
  if (!tokens.length) return null;
  if (tokens.length === 1) return tokens[0];
  const m = /\bclass\s+([A-Z])\b/i.exec(String(securityTitle ?? ''));
  if (!m) return null;
  const cls = m[1].toUpperCase();
  const suffixed = tokens.find((t) => t.endsWith('.' + cls));
  if (suffixed) return suffixed;
  const plain = tokens.filter((t) => !t.includes('.'));
  // Class A usually trades as the plain symbol when the other classes carry a suffix.
  if (cls === 'A' && plain.length === 1) return plain[0];
  return null;
}

const round = (x, d) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// One buy per (accession, security title), from the P lines of a Form 4.
export function buysFromFiling(f) {
  const f4 = f.form4;
  if (!f4 || !Array.isArray(f4.transactions)) return [];
  const groups = new Map();
  for (const t of f4.transactions) {
    if (t.code !== 'P') continue;
    const shares = Number(t.shares);
    const price = Number(t.price);
    if (!(shares > 0) || !(price > 0)) continue;
    const title = t.securityTitle || '';
    if (!groups.has(title)) groups.set(title, { shares: 0, cost: 0, dates: [], lines: 0 });
    const g = groups.get(title);
    g.shares += shares;
    g.cost += shares * price;
    if (t.date) g.dates.push(t.date);
    g.lines++;
  }
  const out = [];
  for (const [title, g] of groups) {
    const dates = g.dates.sort();
    out.push({
      key: `${f.accession}|${title}`,
      accession: f.accession,
      filed: f.filed,
      date: dates.length ? dates[dates.length - 1] : (f.reportDate || f.filed),
      dateFrom: dates.length ? dates[0] : undefined,
      issuer: f4.issuer || '',
      securityTitle: title,
      ticker: resolveTicker(f4.ticker, title),
      tickerText: f4.ticker || '',
      shares: round(g.shares, 3),
      pricePaid: round(g.cost / g.shares, 4),
      value: Math.round(g.cost),
      lines: g.lines,
      url: f.url,
      indexUrl: f.indexUrl,
      people: [{ person: f.person, personSlug: f.personSlug }],
    });
  }
  return out;
}

function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

function summarize(rows) {
  const priced = rows.filter((r) => r.returnPct != null);
  return {
    buys: rows.length,
    priced: priced.length,
    invested: rows.reduce((s, r) => s + r.value, 0),
    avgReturnPct: round(mean(priced.map((r) => r.returnPct)), 2),
    up: priced.filter((r) => r.returnPct > 0).length,
    down: priced.filter((r) => r.returnPct < 0).length,
  };
}

export function build(filings, prices, previous, now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
  const byKey = new Map();
  for (const f of filings?.filings ?? []) {
    if (f.form !== '4') continue; // amendments (4/A) are skipped so a buy is never counted twice
    for (const b of buysFromFiling(f)) {
      const cur = byKey.get(b.key);
      if (cur) {
        for (const p of b.people) if (!cur.people.some((x) => x.personSlug === p.personSlug)) cur.people.push(p);
      } else byKey.set(b.key, b);
    }
  }
  // keep older buys from earlier runs that have dropped out of the filings window
  let carried = 0;
  for (const b of previous?.buys ?? []) {
    if (!b || !b.key || byKey.has(b.key)) continue;
    byKey.set(b.key, { ...b });
    carried++;
  }
  const quotes = prices?.quotes ?? {};
  const rows = [];
  for (const b of byKey.values()) {
    if (!b.date || b.date < cutoff) continue;
    const q = b.ticker ? quotes[b.ticker] : null;
    const px = q && typeof q.price === 'number' && Number.isFinite(q.price) && q.price > 0 ? q.price : null;
    const r = { ...b, priceNow: px, returnPct: px != null ? round((px / b.pricePaid - 1) * 100, 2) : null };
    delete r.unpricedReason;
    if (px == null) r.unpricedReason = b.ticker ? 'no quote for this ticker in our price data' : 'no US ticker on the filing';
    rows.push(r);
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.value - a.value);

  const perPerson = new Map();
  for (const r of rows) {
    for (const p of r.people) {
      if (!perPerson.has(p.personSlug)) perPerson.set(p.personSlug, { person: p.person, personSlug: p.personSlug, rows: [] });
      perPerson.get(p.personSlug).rows.push(r);
    }
  }
  const people = [...perPerson.values()].map((p) => ({ person: p.person, personSlug: p.personSlug, ...summarize(p.rows) }))
    .sort((a, b) => (b.avgReturnPct ?? -Infinity) - (a.avgReturnPct ?? -Infinity) || b.invested - a.invested);

  const dates = rows.map((r) => r.date).sort();
  return {
    generated: now.toISOString(),
    method: METHOD,
    methodDetail:
      'Each buy is one Form 4 filing and one security: the share-weighted average of its open-market purchase (code P) lines. ' +
      'The portfolio return is the simple average of every priced buy (equal dollars in each). ' +
      'A filing listed under more than one person counts once in the portfolio and once for each person. ' +
      'Buys without a US ticker or a current quote are listed but not counted. Amended filings (4/A) are not used.',
    pricesAsOf: prices?.generated ?? null,
    filingsAsOf: filings?.generated ?? null,
    windowDays: KEEP_DAYS,
    coverage: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, carriedFromEarlierRuns: carried },
    portfolio: summarize(rows),
    people,
    buys: rows,
  };
}

async function main() {
  const filings = await readJson(join(ROOT, 'data', 'filings', 'latest.json'), null);
  if (!filings || !Array.isArray(filings.filings)) {
    console.log('No data/filings/latest.json. Nothing to build.');
    return 0;
  }
  const prices = await readJson(join(ROOT, 'data', 'prices', 'latest.json'), null);
  const previous = await readJson(OUT, null);
  const out = build(filings, prices, previous);
  await writeJson(OUT, out);
  const p = out.portfolio;
  console.log(`Copycat: ${p.buys} buys (${p.priced} priced), average return ${p.avgReturnPct ?? 'n/a'}%, ${out.people.length} people.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
}
