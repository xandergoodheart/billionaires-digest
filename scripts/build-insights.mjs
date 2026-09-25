// Morning data: derived views for calendar.html and flows.html.
//
//   node scripts/build-insights.mjs
//
// Reads data/filings/latest.json, data/prices/networth-est.json, data/people/*.json and archive/*.json.
// Writes data/insights/{planned-sales,calendar,flows,leaderboards}.json and calendar.ics (repo root).
// No network. Deterministic for the same inputs and the same "today" (America/New_York date;
// override with INSIGHTS_TODAY=YYYY-MM-DD for testing). Missing inputs give empty lists plus a "note".

import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadProfiles, nyDate, readJson, writeJson } from './lib/data-common.mjs';

const OUT_DIR = join(ROOT, 'data', 'insights');
const SITE = 'https://billionairesdigest.com';
const DAY = 86400e3;

const CAL_BACK_DAYS = 7;
const CAL_AHEAD_DAYS = 120;
const PLANNED_BACK_DAYS = 7;
const FLOW_WEEKS = 12;
const TOP_N = 10;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// ---------- date helpers (UTC arithmetic on YYYY-MM-DD strings) ----------

const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso, n) => fromMs(toMs(iso) + n * DAY);
const pad2 = (n) => String(n).padStart(2, '0');
const validIso = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && fromMs(toMs(iso)) === iso;
const monthEnd = (y, m) => fromMs(Date.UTC(y, m, 0)); // m is 1-based

// ISO week key "2026-W39" and its Monday.
function isoWeek(iso) {
  const d = new Date(toMs(iso));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  const monday = fromMs(toMs(iso) - dow * DAY);
  const thursday = new Date(toMs(monday) + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4Dow * DAY;
  const week = Math.round((toMs(monday) - week1Monday) / (7 * DAY)) + 1;
  return { key: `${year}-W${pad2(week)}`, monday };
}

function monthIndex(word) {
  const w = String(word).toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(w) && (w.length >= 3));
}

// Parse a free-text `when` from a profile watch item.
// Returns { date, end, approx, precision: 'day'|'month' } or null when it can't be placed on a calendar.
//   "2026-11-23"                  -> exact day
//   "2026-11-23 (anything else)"  -> approximate day ("by", "onward", "~", "expected", ...)
//   "November 23, 2026"           -> exact day (approximate when other words surround it)
//   "2026-10", "Oct 2026", "late October 2026 (expected)" -> approximate month
//   quarters, halves, bare years, "late 2026", "ongoing"   -> null (skipped)
export function parseWhen(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) {
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    if (!validIso(date)) return null;
    return { date, end: date, approx: s !== date, precision: 'day' };
  }
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (m && monthIndex(m[1]) >= 0) {
    const date = `${m[3]}-${pad2(monthIndex(m[1]) + 1)}-${pad2(+m[2])}`;
    if (!validIso(date)) return null;
    return { date, end: date, approx: s.replace(/[.,]/g, '').trim().toLowerCase() !== `${m[1]} ${+m[2]} ${m[3]}`.toLowerCase(), precision: 'day' };
  }
  m = /(?:^|[^\d-])(\d{4})-(\d{2})(?![\d-])/.exec(` ${s}`);
  if (m && +m[2] >= 1 && +m[2] <= 12) {
    const y = +m[1], mo = +m[2];
    return { date: `${y}-${pad2(mo)}-01`, end: monthEnd(y, mo), approx: true, precision: 'month' };
  }
  // "Oct-Nov 2026": take the first month of the range.
  m = /\b([A-Za-z]{3,9})\.?\s*[-–/]\s*[A-Za-z]{3,9}\.?\s+(\d{4})\b/.exec(s);
  if (!m || monthIndex(m[1]) < 0) m = /\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/.exec(s);
  if (m && monthIndex(m[1]) >= 0) {
    const y = +m[2], mo = monthIndex(m[1]) + 1;
    return { date: `${y}-${pad2(mo)}-01`, end: monthEnd(y, mo), approx: true, precision: 'month' };
  }
  return null;
}

// First YYYY-MM(-DD) in a free-text deal date. Returns { date, precision } or null.
function parseDealDate(raw) {
  if (typeof raw !== 'string') return null;
  const m = /\b(\d{4})-(\d{2})(?:-(\d{2}))?(?![\d])/.exec(raw);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  if (m[3]) {
    const d = `${m[1]}-${m[2]}-${m[3]}`;
    return validIso(d) ? { date: d, precision: 'day' } : null;
  }
  return { date: `${m[1]}-${m[2]}-01`, end: monthEnd(+m[1], +m[2]), precision: 'month' };
}

// ---------- classification ----------

const DEAL_WORDS = /\b(deal|deals|acqui\w*|merger|merge|takeover|buyout|vote|votes|voting|shareholder|shareholders|annual meeting|agm|egm|ipo|listing|list|offer|bid|tender|closing|close|closes|approval|approve|approves|regulator\w*|antitrust|stake|buyback|spin-?off|divest\w*|sale of|purchase|financing|funding round|raise)\b/i;

function watchType(what) {
  return DEAL_WORDS.test(what) ? 'deals' : 'events';
}

// ---------- people ----------

function norm(x) {
  return String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const coreName = (x) => norm(String(x ?? '').replace(/\s*&\s*family\s*$/i, ''));

function peopleLookup(index, profiles) {
  const bySlug = new Map();
  for (const p of index?.people ?? []) {
    if (p?.slug) bySlug.set(p.slug, { slug: p.slug, name: p.name, sector: p.sector || null, rank: p.rank ?? null });
  }
  for (const p of profiles) {
    if (!p?.slug) continue;
    const cur = bySlug.get(p.slug);
    if (cur) { if (!cur.sector && p.sector) cur.sector = p.sector; }
    else bySlug.set(p.slug, { slug: p.slug, name: p.name, sector: p.sector || null, rank: p.rank ?? null });
  }
  const byName = new Map();
  for (const v of bySlug.values()) byName.set(coreName(v.name), v);
  for (const p of profiles) {
    for (const a of p.aliases ?? []) {
      const k = coreName(a);
      if (k && !byName.has(k)) byName.set(k, bySlug.get(p.slug));
    }
  }
  return { bySlug, byName };
}

const personRef = (lk, slug, name) => {
  const p = lk.bySlug.get(slug);
  return { name: p?.name ?? name ?? slug, slug, sector: p?.sector ?? 'Other' };
};

// ---------- 1. planned sales (Form 144) ----------

function buildPlanned(filings, lk, today, fromForm4Tickers) {
  const cutoff = addDays(today, -PLANNED_BACK_DAYS);
  const byAcc = new Map();
  for (const f of filings) {
    if (f.form !== '144' || !f.form144?.approxSaleDate) continue;
    const d = f.form144.approxSaleDate;
    if (d < cutoff) continue;
    let row = byAcc.get(f.accession);
    if (!row) {
      const x = f.form144;
      const tickerGuess = x.issuer ? fromForm4Tickers.get(norm(x.issuer)) : undefined;
      row = {
        date: d,
        people: [],
        seller: x.seller,
        issuer: x.issuer,
        ticker: tickerGuess,
        tickerSource: tickerGuess ? 'Ticker from a Form 4 for the same issuer in the filings window' : undefined,
        securitiesClassTitle: x.securitiesClassTitle,
        shares: x.shares,
        value: x.aggregateMarketValue,
        relationships: x.relationships,
        plan10b51AdoptedOn: x.planAdoptionDates?.[0],
        filed: f.filed,
        form: f.form,
        url: f.url,
        indexUrl: f.indexUrl,
        accession: f.accession,
      };
      for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
      byAcc.set(f.accession, row);
    }
    if (!row.people.some((p) => p.slug === f.personSlug)) row.people.push(personRef(lk, f.personSlug, f.person));
  }
  return [...byAcc.values()].sort((a, b) => (a.date === b.date ? a.accession.localeCompare(b.accession) : a.date.localeCompare(b.date)));
}

// issuer name -> ticker seen on this person's Form 4s (never invented; only real Form 4 tickers).
function form4TickerMap(filings) {
  const map = new Map();
  for (const f of filings) {
    const x = f.form4;
    if (!x?.issuer || !x.ticker || /^none$/i.test(x.ticker)) continue;
    const k = norm(x.issuer);
    if (!map.has(k)) map.set(k, x.ticker);
  }
  return map;
}

// 21359454 -> "$21.4M"
function compactUsd(n) {
  const a = Math.abs(n);
  const [d, u] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  const v = a / d;
  return `${n < 0 ? '-' : ''}$${u ? (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) : Math.round(v)}${u}`;
}

// ---------- 2. calendar ----------

function buildCalendar(profiles, planned, lk, today) {
  const from = addDays(today, -CAL_BACK_DAYS);
  const to = addDays(today, CAL_AHEAD_DAYS);
  const events = [];
  let skipped = 0;
  let outOfWindow = 0;

  for (const p of profiles) {
    for (const w of p.watch ?? []) {
      if (!w?.what || !w.when) continue;
      const parsed = parseWhen(w.when);
      if (!parsed) { skipped++; continue; }
      if (parsed.end < from || parsed.date > to) { outOfWindow++; continue; }
      if (!/^https?:\/\//i.test(w.source ?? '')) { skipped++; continue; }
      events.push({
        date: parsed.date,
        end: parsed.precision === 'month' ? parsed.end : undefined,
        approx: parsed.approx,
        precision: parsed.precision,
        when: w.when,
        type: watchType(w.what),
        title: w.what,
        people: [personRef(lk, p.slug, p.name)],
        source: w.source,
        sourceLabel: 'Source',
      });
    }
  }

  for (const r of planned) {
    if (r.date < from || r.date > to) continue;
    const bits = [];
    if (r.shares !== undefined) bits.push(`${r.shares.toLocaleString('en-US')} shares`);
    if (r.issuer) bits.push(`of ${r.issuer}`);
    events.push({
      date: r.date,
      approx: false,
      precision: 'day',
      when: r.date,
      type: 'sales',
      title: `Planned sale: ${bits.length ? bits.join(' ') : 'shares'}${r.value !== undefined ? ` (about ${compactUsd(r.value)} when filed)` : ''}`,
      note: 'Approximate sale date as stated on the Form 144 notice.',
      people: r.people,
      source: r.url,
      sourceLabel: 'Form 144',
    });
  }

  for (const e of events) for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  events.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date)
      : a.approx !== b.approx ? (a.approx ? 1 : -1)
        : a.title.localeCompare(b.title));
  return { from, to, events, skipped, outOfWindow };
}

// ---------- iCalendar ----------

function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Fold to 75 octets per line, continuation lines start with one space; never split a UTF-8 character.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const compact = (iso) => iso.replace(/-/g, '');

export function buildIcs(events, stamp) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Billionaires Digest//Billionaire calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Billionaire calendar · Billionaires Digest',
    'X-WR-CALDESC:Dated events and planned insider sales for the world\'s richest people. Sources linked in each event.',
  ];
  const seen = new Set();
  for (const e of events) {
    if (e.approx || e.precision !== 'day') continue;
    const uidHash = createHash('sha1').update(`${e.title}|${e.date}`).digest('hex').slice(0, 20);
    if (seen.has(uidHash)) continue;
    seen.add(uidHash);
    const who = (e.people ?? []).map((p) => p.name).join(', ');
    const desc = [who ? `Who: ${who}` : '', e.note ?? '', `Source: ${e.source}`, `More: ${SITE}/calendar.html`].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidHash}.calendar.billionairesdigest.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`,
      `SUMMARY:${icsEscape(who ? `${who}: ${e.title}` : e.title)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      `URL:${e.source}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(fold).join('\r\n') + '\r\n', count: seen.size };
}

// ---------- 3. flows (Form 4) ----------

const BUY = 'P';
const SELL = 'S';

// Summary lines from original Form 4s (amendments skipped), with the line's date and dedupe signature.
function form4Lines(filings) {
  const out = [];
  for (const f of filings) {
    if (f.form !== '4' || !f.form4) continue;
    const date = f.reportDate || f.filed;
    for (const s of f.form4.summary ?? []) {
      out.push({
        f,
        s,
        date,
        sig: `${norm(s.issuer)}|${s.code}|${date}|${s.shares}|${s.value}`,
      });
    }
  }
  return out;
}

function bucketOf(code) {
  return code === BUY ? 'buy' : code === SELL ? 'sell' : 'other';
}

function emptyTotals() {
  return { buy: 0, sell: 0, net: 0, other: 0, buyCount: 0, sellCount: 0, otherCount: 0, unpriced: 0 };
}

function addTo(t, line) {
  const b = bucketOf(line.s.code);
  t[`${b}Count`] += 1;
  if (typeof line.s.value === 'number') t[b] += line.s.value;
  else if (b !== 'other') t.unpriced += 1;
  t.net = t.buy - t.sell;
}

function buildFlows(filingsDoc, lk, today) {
  const filings = filingsDoc?.filings ?? [];
  const lines = form4Lines(filings);
  const thisWeek = isoWeek(today);
  const weeks = [];
  for (let i = FLOW_WEEKS - 1; i >= 0; i--) {
    const monday = addDays(thisWeek.monday, -7 * i);
    weeks.push({ week: isoWeek(monday).key, start: monday, end: addDays(monday, 6), ...emptyTotals() });
  }
  const weekByKey = new Map(weeks.map((w) => [w.week, w]));
  const sectors = new Map();
  const last7 = { from: addDays(today, -6), to: today, ...emptyTotals() };
  const since30 = addDays(today, -29);
  const perPerson = new Map();

  const seenAll = new Set();
  const seenSector = new Set();
  const seenPerson = new Set();
  for (const line of lines) {
    const person = personRef(lk, line.f.personSlug, line.f.person);
    const sector = person.sector || 'Other';

    if (!seenAll.has(line.sig)) {
      seenAll.add(line.sig);
      const w = weekByKey.get(isoWeek(line.date).key);
      if (w) addTo(w, line);
      if (line.date >= last7.from && line.date <= today) addTo(last7, line);
    }
    const sk = `${sector}|${line.sig}`;
    if (!seenSector.has(sk) && line.date >= weeks[0].start) {
      seenSector.add(sk);
      if (!sectors.has(sector)) sectors.set(sector, { sector, ...emptyTotals() });
      addTo(sectors.get(sector), line);
    }
    const pk = `${person.slug}|${line.sig}`;
    if (!seenPerson.has(pk) && line.date >= since30 && line.date <= today) {
      seenPerson.add(pk);
      if (!perPerson.has(person.slug)) perPerson.set(person.slug, { ...person, ...emptyTotals(), filings: [] });
      const pp = perPerson.get(person.slug);
      addTo(pp, line);
      if (!pp.filings.some((x) => x.url === line.f.url)) {
        pp.filings.push({ date: line.date, filed: line.f.filed, form: line.f.form, issuer: line.s.issuer, ticker: line.s.ticker && !/^none$/i.test(line.s.ticker) ? line.s.ticker : undefined, url: line.f.url });
      }
    }
  }

  const top = (key) => [...perPerson.values()]
    .filter((p) => p[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.slug.localeCompare(b.slug))
    .slice(0, TOP_N)
    .map((p) => ({
      name: p.name, slug: p.slug, sector: p.sector,
      value: p[key], count: p[`${key}Count`],
      filings: p.filings.filter((x) => x).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((x) => { const y = { ...x }; if (!y.ticker) delete y.ticker; return y; }),
    }));

  const sectorList = [...sectors.values()].sort((a, b) => (b.buy + b.sell) - (a.buy + a.sell) || a.sector.localeCompare(b.sector));
  const f4Total = new Set(filings.filter((f) => f.form === '4').map((f) => f.accession)).size;
  const f4Parsed = new Set(filings.filter((f) => f.form === '4' && f.form4).map((f) => f.accession)).size;

  return {
    weeks,
    last7,
    sectors: sectorList,
    topSellers30d: top('sell'),
    topBuyers30d: top('buy'),
    coverage: { form4Filings: f4Total, form4Parsed: f4Parsed, windowDays: filingsDoc?.windowDays ?? null },
  };
}

// ---------- 4. leaderboards ----------

function buildLeaderboards({ est, filingsDoc, profiles, archive, lk, today }) {
  const notes = {};

  // (a) estimated gainers / losers
  let gainers = [];
  let losers = [];
  const minCoverage = typeof est?.minCoverage === 'number' ? est.minCoverage : null;
  if (!est?.people || minCoverage === null) {
    notes.movers = 'No estimate data available.';
  } else {
    const rows = [];
    for (const [slug, e] of Object.entries(est.people)) {
      if (typeof e?.estDailyChange !== 'number' || typeof e.coverage !== 'number' || e.coverage < minCoverage) continue;
      const p = personRef(lk, slug);
      rows.push({
        name: p.name, slug, sector: p.sector,
        estDailyChange: e.estDailyChange,
        coverage: e.coverage,
        holdings: (e.holdings ?? []).map((h) => ({ ticker: h.ticker, shares: h.shares, change: h.change, estChange: h.estChange, source: h.source })),
      });
    }
    gainers = rows.filter((r) => r.estDailyChange > 0).sort((a, b) => b.estDailyChange - a.estDailyChange || a.slug.localeCompare(b.slug)).slice(0, TOP_N);
    losers = rows.filter((r) => r.estDailyChange < 0).sort((a, b) => a.estDailyChange - b.estDailyChange || a.slug.localeCompare(b.slug)).slice(0, TOP_N);
    notes.movers = `Estimated; partial. ${est.method ?? ''}`.trim();
  }

  // (b) most active insiders: Form 4 transactions filed in the last 30 days
  const since30 = addDays(today, -29);
  const active = new Map();
  const seen = new Set();
  for (const f of filingsDoc?.filings ?? []) {
    if ((f.form !== '4' && f.form !== '4/A') || !f.form4 || f.filed < since30 || f.filed > today) continue;
    const k = `${f.personSlug}|${f.accession}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const p = personRef(lk, f.personSlug, f.person);
    if (!active.has(p.slug)) active.set(p.slug, { ...p, transactions: 0, filingsCount: 0, filings: [] });
    const a = active.get(p.slug);
    a.transactions += f.form4.transactionCount ?? 0;
    a.filingsCount += 1;
    a.filings.push({ filed: f.filed, form: f.form, url: f.url });
  }
  const mostActive = [...active.values()]
    .filter((a) => a.transactions > 0)
    .sort((a, b) => b.transactions - a.transactions || b.filingsCount - a.filingsCount || a.slug.localeCompare(b.slug))
    .slice(0, TOP_N)
    .map((a) => ({ ...a, filings: a.filings.sort((x, y) => y.filed.localeCompare(x.filed)).slice(0, 5) }));
  if (!filingsDoc) notes.mostActive = 'No filings data available.';

  // (c) most deals: privateDeals dated in the last 12 months
  const since12m = addDays(today, -365);
  let undated = 0;
  const deals = [];
  for (const p of profiles) {
    const list = [];
    for (const d of p.privateDeals ?? []) {
      const pd = parseDealDate(d?.date);
      if (!pd) { undated++; continue; }
      const last = pd.end ?? pd.date;
      if (last < since12m || pd.date > today) continue;
      if (!/^https?:\/\//i.test(d.source ?? '')) continue;
      list.push({ what: d.what, date: d.date, source: d.source, sort: pd.date });
    }
    if (!list.length) continue;
    const ref = personRef(lk, p.slug, p.name);
    list.sort((a, b) => b.sort.localeCompare(a.sort));
    deals.push({ ...ref, count: list.length, deals: list.slice(0, 5).map(({ sort, ...x }) => x) });
  }
  deals.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  notes.mostDeals = `Counts profile deal entries dated within the last 12 months (month-only dates count if any part of the month falls in the window). ${undated} entries without a month-level date were not counted.`;

  // (d) most moves in editions: archive stories per person, all time
  const moves = new Map();
  let unmatched = 0;
  for (const { date, ed } of archive) {
    for (const s of ed?.stories ?? []) {
      const names = new Set([s.who, ...(Array.isArray(s.people) ? s.people : [])].map(coreName).filter(Boolean));
      let hit = false;
      for (const n of names) {
        const p = lk.byName.get(n);
        if (!p) continue;
        hit = true;
        if (!moves.has(p.slug)) moves.set(p.slug, { ...personRef(lk, p.slug), count: 0, stories: [] });
        const m = moves.get(p.slug);
        if (m.stories.some((x) => x.edition === date && x.headline === s.headline)) continue;
        m.count += 1;
        m.stories.push({ edition: date, editionUrl: `editions/${date}/`, headline: s.headline, url: /^https?:\/\//i.test(s.url ?? '') ? s.url : undefined, source: s.source });
      }
      if (!hit) unmatched++;
    }
  }
  const mostMoves = [...moves.values()]
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
    .slice(0, TOP_N)
    .map((m) => ({ ...m, stories: m.stories.sort((a, b) => b.edition.localeCompare(a.edition)).slice(0, 5).map((x) => { const y = { ...x }; if (!y.url) delete y.url; return y; }) }));
  notes.mostMoves = `Stories across ${archive.length} archived edition${archive.length === 1 ? '' : 's'}.${unmatched ? ` ${unmatched} stories named nobody in the top-100 index.` : ''}`;
  if (!archive.length) notes.mostMoves = 'No archived editions found.';

  return { gainers, losers, mostActive, mostDeals: deals.slice(0, TOP_N), mostMoves, notes, minCoverage };
}

// ---------- main ----------

async function loadArchive() {
  const ix = await readJson(join(ROOT, 'archive', 'index.json'), null);
  const dates = (Array.isArray(ix?.editions) ? ix.editions : []).filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const out = [];
  for (const date of dates) {
    const ed = await readJson(join(ROOT, 'archive', `${date}.json`), null);
    if (ed) out.push({ date, ed });
  }
  return out;
}

async function main() {
  const today = process.env.INSIGHTS_TODAY && validIso(process.env.INSIGHTS_TODAY) ? process.env.INSIGHTS_TODAY : nyDate();
  const filingsDoc = await readJson(join(ROOT, 'data', 'filings', 'latest.json'), null);
  const est = await readJson(join(ROOT, 'data', 'prices', 'networth-est.json'), null);
  const index = await readJson(join(ROOT, 'data', 'people', 'index.json'), null);
  let profiles = [];
  try { profiles = await loadProfiles(); } catch (err) { console.warn(`! profiles: ${err.message}`); }
  const archive = await loadArchive();
  const lk = peopleLookup(index, profiles);
  const filings = Array.isArray(filingsDoc?.filings) ? filingsDoc.filings : [];

  const inputs = {
    filingsGenerated: filingsDoc?.generated ?? null,
    pricesGenerated: est?.generated ?? null,
    peopleAsOf: index?.asOf ?? null,
    editions: archive.length,
  };

  // planned sales
  const planned = buildPlanned(filings, lk, today, form4TickerMap(filings));
  const f144 = filings.filter((f) => f.form === '144');
  await writeJson(join(OUT_DIR, 'planned-sales.json'), {
    generated: today,
    from: addDays(today, -PLANNED_BACK_DAYS),
    inputs,
    explainer: 'A Form 144 is a notice an insider files with the SEC before selling restricted or control shares. It gives an approximate sale date and size. The sale may be smaller, later or not happen at all.',
    note: !filingsDoc ? 'No SEC filings data available.'
      : `${f144.length} Form 144 notices in the ${filingsDoc.windowDays ?? 90}-day filings window; ${f144.filter((f) => f.form144).length} parsed. Rows show approximate sale dates from ${addDays(today, -PLANNED_BACK_DAYS)} on.`,
    sales: planned,
  });

  // calendar + ics
  const cal = buildCalendar(profiles, planned, lk, today);
  await writeJson(join(OUT_DIR, 'calendar.json'), {
    generated: today,
    from: cal.from,
    to: cal.to,
    inputs,
    types: { sales: 'Planned sales', events: 'Earnings & events', deals: 'Deals & votes' },
    note: `Dated items from profile watch lists and Form 144 notices, from ${cal.from} to ${cal.to}. Items marked approximate have only a month or a hedged date. ${cal.skipped} watch items had no usable date (quarters, years, "ongoing") and are left out. Type labels come from keywords in the item text.`,
    events: cal.events,
  });
  const stamp = `${compact(today)}T000000Z`;
  const ics = buildIcs(cal.events, stamp);
  await writeFile(join(ROOT, 'calendar.ics'), ics.text);

  // flows
  const flows = buildFlows(filingsDoc, lk, today);
  await writeJson(join(OUT_DIR, 'flows.json'), {
    generated: today,
    inputs,
    note: !filingsDoc ? 'No SEC filings data available.'
      : `Estimated; partial. Dollar values are shares × reported price on Form 4 filings for the tracked people (only the newest ${flows.coverage.form4Parsed} of ${flows.coverage.form4Filings} Form 4s in the last ${flows.coverage.windowDays ?? 90} days are read in detail). Buys are open-market purchases (code P) and sales are open-market sales (code S). Grants, gifts, option exercises, tax withholding and other codes are counted separately as "other". Amendments (4/A) are skipped and identical lines filed by more than one tracked person are counted once in the totals. Weeks use the Form 4 period of report.`,
    ...flows,
  });

  // leaderboards
  const lb = buildLeaderboards({ est, filingsDoc, profiles, archive, lk, today });
  await writeJson(join(OUT_DIR, 'leaderboards.json'), {
    generated: today,
    inputs,
    ...lb,
  });

  console.log(`Insights for ${today}: planned sales ${planned.length}; calendar events ${cal.events.length} (ics ${ics.count}, skipped ${cal.skipped}, out of window ${cal.outOfWindow}); ` +
    `flow weeks ${flows.weeks.length}, sectors ${flows.sectors.length}, top sellers ${flows.topSellers30d.length}, top buyers ${flows.topBuyers30d.length}; ` +
    `leaderboards gainers ${lb.gainers.length}, losers ${lb.losers.length}, active ${lb.mostActive.length}, deals ${lb.mostDeals.length}, moves ${lb.mostMoves.length}.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
}
