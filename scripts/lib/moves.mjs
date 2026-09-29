// Next Moves: play-money yes/no markets on billionaires' FUTURE business moves, created and resolved only from
// public, machine-checkable data already in the repo:
//   data/filings/latest.json   SEC EDGAR filings (Form 4 transactions with code, date, shares, price)
//   data/13f/<filer>.json      the two latest 13F-HR filings of each billionaire's fund, compared
//   data/people/<slug>.json    who counts (only people with a profile)
//
// Templates built here:
//   insider_sell  Will <person> report selling <ticker> stock (Form 4, code S) with a trade date in <month>?
//   insider_buy   the same with code P (open-market buy)
//   sale_size     Will <person>'s reported sales of <ticker> add up to more than $<X> in <month>?
//   fund_move     Will <fund>'s 13F for the quarter ending <date> show fewer <holding> shares than the last one?
// Skipped: rank_hold (we keep no history of the Forbes real-time list, see SKIPPED).
//
// Every market carries a starting chance ("starting odds from history") computed from the same data,
// or 50% with a plain note when the history is too thin. Pure functions only; no I/O.
import { nyDate, nyToUtc, addDays } from './supa/time.mjs';

export const SITE = 'https://billionairesdigest.com';
export const B = 100;                 // LMSR liquidity, same default as the v1 markets
export const MIN_WEEKS = 8;           // weeks of readable Form 4 history needed to set odds from history
export const MIN_13F_KNOWN = 5;       // top-10 holdings with a known change needed for a 13F base rate
export const MIN_MONTHS = 6;          // complete months needed for a sales-size base rate
export const P_MIN = 0.05, P_MAX = 0.95;
export const MIN_DAYS_LEFT = 14;      // a new window must leave at least this many days of trading
export const FORM4_LAG_DAYS = 5;      // Form 4 is due within 2 business days; wait 5 calendar days after a window
export const GIVE_UP_DAYS = 15;       // void a Form 4 market if the filings were still not fetched this long after
export const F13_DUE_DAYS = 45;       // 13F-HR is due 45 days after the quarter ends
export const F13_GIVE_UP_DAYS = 30;   // extra days before a 13F market is voided for missing data
export const MAX_FUND_FILERS = 20;
export const BACKTEST_MONTHS = 2;     // complete months shown as "checked against filings, never traded"

export const KINDS = ['insider_sell', 'insider_buy', 'sale_size', 'fund_move'];
export const SKIPPED = [
  { template: 'rank_hold', reason: 'We keep only the current Forbes real-time list (data/people/index.json, one asOf), no dated history, so there is no way to compute a base rate or to check the rank on a past date.' }
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const slugPart = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const isForm4 = f => /^4(\/A)?$/.test(String(f && f.form || ''));
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3);
const pct = p => Math.round(p * 100);

export function fmtDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(iso || '');
}
export function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
export function fmtMoney(x) {
  const n = Number(x) || 0;
  const t = (v) => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
  if (n >= 1e9) return `$${t(n / 1e9)} billion`;
  if (n >= 1e6) return `$${t(n / 1e6)} million`;
  return `$${fmtInt(n)}`;
}

// "ASPEN AEROGELS INC" -> "Aspen Aerogels Inc"; mixed-case names stay as they are; "/NEW/" style tags are dropped.
export function tidyName(s) {
  const raw = String(s || '').replace(/\s*\/[A-Z]{2,}\/\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw || /[a-z]/.test(raw)) return raw;
  const keep = new Set(['LLC', 'LP', 'LLP', 'AG', 'SA', 'NV', 'PLC', 'ETF', 'ADR', 'REIT', 'II', 'III', 'US', 'USA']);
  // keep known abbreviations and vowel-less tokens (FMR, MSD, S&P500, QQQ) in capitals
  return raw.split(' ').map(w => {
    const letters = w.replace(/[^A-Z]/g, '');
    if (keep.has(letters) || (letters && !/[AEIOU]/.test(letters))) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(' ');
}

export function clampProb(p) { return Math.min(P_MAX, Math.max(P_MIN, p)); }
// LMSR quantities that start the market at probability p (price_yes = 1 / (1 + e^((q_no - q_yes) / b))).
export function probToQ(p, b = B) {
  const d = b * Math.log(p / (1 - p));
  return { q_yes: d > 0 ? d : 0, q_no: d < 0 ? -d : 0 };
}
// Round to a "nice" line: 1, 2 or 5 times a power of ten, whichever is nearest on a log scale.
export function niceRound(x) {
  const n = Number(x);
  if (!(n > 0)) return 0;
  const e = Math.floor(Math.log10(n)), base = 10 ** e;
  let best = base, bestD = Infinity;
  for (const m of [1, 2, 5, 10]) { const d = Math.abs(Math.log(n / (m * base))); if (d < bestD) { bestD = d; best = m * base; } }
  return best;
}

// ---------- windows ----------
function monthOf(y, m) { // m 1-12
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { id: `${y}-${String(m).padStart(2, '0')}`, start, end, label: `${MONTHS[m - 1]} ${y}` };
}
// The first calendar month (this one or later) with at least MIN_DAYS_LEFT days left from today (New York).
export function monthWindow(now) {
  const today = nyDate(now);
  let [y, m] = today.split('-').map(Number);
  for (let i = 0; i < 3; i++) {
    const w = monthOf(y, m);
    if (dayDiff(today, w.end) + 1 >= MIN_DAYS_LEFT) return w;
    m++; if (m > 12) { m = 1; y++; }
  }
  return monthOf(y, m);
}
export function prevMonths(month, n) {
  const out = [];
  let [y, m] = month.id.split('-').map(Number);
  for (let i = 0; i < n; i++) { m--; if (m < 1) { m = 12; y--; } out.push(monthOf(y, m)); }
  return out;
}
// The first quarter end (this quarter or later) at least MIN_DAYS_LEFT days away.
export function quarterTarget(now) {
  const today = nyDate(now);
  let [y, m] = today.split('-').map(Number);
  let q = Math.ceil(m / 3);
  for (let i = 0; i < 3; i++) {
    const end = new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10);
    if (dayDiff(today, end) >= MIN_DAYS_LEFT) return { id: `${y}-q${q}`, end, label: `Q${q} ${y}` };
    q++; if (q > 4) { q = 1; y++; }
  }
  const end = new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10);
  return { id: `${y}-q${q}`, end, label: `Q${q} ${y}` };
}

// ---------- Form 4 events ----------
export function tickerTokens(t) {
  return String(t || '').toUpperCase().split(/[,\s]+/).filter(x => x && x !== 'NONE' && x !== 'N/A');
}
export function edgarUrl(cik, type = '4') {
  const c = String(cik || '').replace(/\D/g, '');
  return c ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c}&type=${encodeURIComponent(type)}&dateb=&owner=include&count=40` : null;
}

// Flatten Form 4s into one row per code-S/P transaction (deduped: joint filers report the same trade twice),
// plus the Form 4s we could not read in detail.
export function form4Events(filings) {
  const events = [], unread = [], seen = new Set();
  const list = [...(filings || [])].filter(f => f && f.personSlug && isForm4(f))
    .sort((a, b) => String(a.filed).localeCompare(String(b.filed)) || String(a.accession || a.url || '').localeCompare(String(b.accession || b.url || '')));
  for (const f of list) {
    const f4 = f.form4;
    if (!f4) { unread.push({ slug: f.personSlug, filed: f.filed, url: f.indexUrl || f.url || null, cik: f.cik || null }); continue; }
    const tokens = tickerTokens(f4.ticker);
    for (const t of Array.isArray(f4.transactions) ? f4.transactions : []) {
      if (!t || (t.code !== 'S' && t.code !== 'P') || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) continue;
      const shares = Number(t.shares), price = Number(t.price);
      const value = Number.isFinite(Number(t.value)) && t.value != null ? Number(t.value) : (Number.isFinite(shares) && Number.isFinite(price) ? shares * price : null);
      const key = [f.personSlug, t.code, t.date, tokens.join('/') || f4.issuer, shares, price].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ slug: f.personSlug, code: t.code, date: t.date, tickers: tokens, ticker: tokens[0] || null, issuer: f4.issuer || null,
        shares: Number.isFinite(shares) ? shares : null, price: Number.isFinite(price) ? price : null, value,
        filed: f.filed, form: f.form, cik: f.cik || null, url: f.indexUrl || f.url || null });
    }
  }
  return { events, unread };
}

// Complete Monday-Sunday weeks covered by the filings file: from the first Monday on/after the window start
// to the last Sunday at least FORM4_LAG_DAYS before the file was generated (so late filings are in).
export function historyWeeks(doc) {
  if (!doc || !doc.generated) return [];
  const gen = nyDate(doc.generated);
  const startDay = addDays(gen, -Number(doc.windowDays || 90));
  const lastDay = addDays(gen, -FORM4_LAG_DAYS);
  const wd = new Date(startDay + 'T00:00:00Z').getUTCDay(); // 0 Sun .. 6 Sat
  let mon = addDays(startDay, (8 - wd) % 7);
  const out = [];
  while (addDays(mon, 6) <= lastDay) { out.push({ start: mon, end: addDays(mon, 6) }); mon = addDays(mon, 7); }
  return out;
}
export function historySpan(doc) {
  if (!doc || !doc.generated) return null;
  const gen = nyDate(doc.generated);
  return { start: addDays(gen, -Number(doc.windowDays || 90)), lastComplete: addDays(gen, -FORM4_LAG_DAYS), generated: gen };
}

// Weekly base rate for "at least one code-X trade of this ticker", turned into a chance for a window of `days`.
// A week with an unread Form 4 from the person (and no hit) is left out: we cannot tell.
export function weeklyBaseRate({ events, unread, slug, code, ticker, weeks, days }) {
  let hit = 0, known = 0;
  for (const w of weeks) {
    const yes = events.some(e => e.slug === slug && e.code === code && e.tickers.includes(ticker) && e.date >= w.start && e.date <= w.end);
    // an unread Form 4 filed during the week or in the lag after it could hold a trade dated in the week
    const unsure = !yes && unread.some(u => u.slug === slug && u.filed >= w.start && u.filed <= addDays(w.end, FORM4_LAG_DAYS));
    if (unsure) continue;
    known++; if (yes) hit++;
  }
  if (known < MIN_WEEKS) return { prob: 0.5, thin: true, hit, known };
  const pw = hit / known;
  const raw = 1 - Math.pow(1 - pw, days / 7);
  return { prob: Math.round(clampProb(raw) * 100) / 100, raw, thin: false, hit, known };
}

// ---------- generation ----------
const personName = (people, s) => (people[s] && people[s].name) || s;

function pickTicker(events, slug, code) {
  // the ticker this person traded most often with this code (count of trade days), then most recent, then A-Z
  const stat = {};
  for (const e of events) {
    if (e.slug !== slug || e.code !== code || !e.ticker) continue;
    const s = stat[e.ticker] || (stat[e.ticker] = { days: new Set(), last: '', issuer: e.issuer, cik: e.cik, total: 0, n: 0 });
    s.days.add(e.date); s.n++;
    if (e.date >= s.last) { s.last = e.date; s.issuer = e.issuer || s.issuer; s.cik = e.cik || s.cik; }
    if (Number.isFinite(e.value)) s.total += e.value;
  }
  const keys = Object.keys(stat).sort((a, b) => stat[b].days.size - stat[a].days.size || stat[b].last.localeCompare(stat[a].last) || a.localeCompare(b));
  if (!keys.length) return null;
  const k = keys[0];
  return { ticker: k, issuer: tidyName(stat[k].issuer || k), cik: stat[k].cik, last: stat[k].last, total: stat[k].total, trades: stat[k].n, tradeDays: stat[k].days.size };
}

function form4Rule(code, ticker, w) {
  const what = code === 'S' ? 'a sale (transaction code S)' : 'an open-market buy (transaction code P)';
  return `YES if a Form 4 on SEC EDGAR from this person reports ${what} of ${ticker} stock with a trade date from ${fmtDay(w.start)} to ${fmtDay(w.end)}. ` +
    `Trading closes ${fmtDay(w.end)} at 4:00 PM New York time. We check ${FORM4_LAG_DAYS} days after the window ends, because a Form 4 can be filed up to 2 business days after the trade. ` +
    `If a Form 4 from that period cannot be read and no qualifying trade is found, the market is void and stakes come back.`;
}

function form4Market({ kind, code, person, name, pick, w, now, weeks, events, unread, span }) {
  const verb = code === 'S' ? 'selling' : 'buying';
  const days = dayDiff(w.start, w.end) + 1;
  const br = weeklyBaseRate({ events, unread, slug: person, code, ticker: pick.ticker, weeks, days });
  const what = code === 'S' ? `at least one ${pick.ticker} sale (code S)` : `at least one ${pick.ticker} open-market buy (code P)`;
  const text = br.thin
    ? `We only have ${br.known} week${br.known === 1 ? '' : 's'} of readable Form 4 history for ${name}, too few to set odds from history, so this starts at 50%.`
    : `In ${br.hit} of the last ${br.known} weeks we can check (${fmtDay(weeks[0].start)} to ${fmtDay(weeks[weeks.length - 1].end)}), ${name} reported ${what}. ` +
      `Over a ${days}-day window that points to about ${pct(br.raw)}%` + (br.prob !== Math.round(br.raw * 100) / 100 ? `, capped at ${pct(br.prob)}% so the market stays open` : '') + '.';
  const closes = nyToUtc(w.end, '16:00').toISOString();
  return {
    slug: `mv-${code === 'S' ? 'sell' : 'buy'}-${w.id}-${person}-${slugPart(pick.ticker)}`,
    kind, person: { slug: person, name },
    question: `Will ${name} report ${verb} ${pick.ticker} stock (Form 4, code ${code}) with a trade date between ${fmtDay(w.start)} and ${fmtDay(w.end)}?`,
    params: { slug: person, name, code, ticker: pick.ticker, issuer: pick.issuer, from: w.start, to: w.end, window: w.id, cik: pick.cik || null,
      edgarUrl: edgarUrl(pick.cik), lastTrade: pick.last },
    opens_at: new Date(now).toISOString(), closes_at: closes,
    resolves_by: nyToUtc(addDays(w.end, FORM4_LAG_DAYS), '23:59').toISOString(),
    b: B, startProb: br.prob,
    baseRate: { prob: br.prob, thin: br.thin, hit: br.hit, known: br.known, unit: 'week', text },
    rule: form4Rule(code, pick.ticker, w),
    source: { label: `SEC EDGAR Form 4 filings for ${name}`, url: edgarUrl(pick.cik), data: 'data/filings/latest.json', historyFrom: span && span.start, historyTo: span && span.lastComplete }
  };
}

function monthlySales(events, slug, ticker, months) {
  return months.map(m => ({ id: m.id, total: events.filter(e => e.slug === slug && e.code === 'S' && e.tickers.includes(ticker) && e.date >= m.start && e.date <= m.end)
    .reduce((a, e) => a + (Number.isFinite(e.value) ? e.value : 0), 0) }));
}

function saleSizeMarket({ person, name, pick, w, now, weeks, events, unread, span }) {
  const days = dayDiff(w.start, w.end) + 1;
  const inHist = events.filter(e => e.slug === person && e.code === 'S' && e.tickers.includes(pick.ticker) && weeks.length && e.date >= weeks[0].start && e.date <= weeks[weeks.length - 1].end);
  const histTotal = inHist.reduce((a, e) => a + (Number.isFinite(e.value) ? e.value : 0), 0);
  if (!(histTotal > 0) || !weeks.length) return null;
  const pace = histTotal / weeks.length * (days / 7);
  const line = Math.max(1e6, niceRound(pace));
  // complete months inside the history span, to see how often the monthly total beat the line
  const months = [];
  if (span) for (const m of prevMonths(w, 24)) if (m.start >= span.start && m.end <= span.lastComplete) months.push(m);
  const unsureMonth = m => unread.some(u => u.slug === person && u.filed >= m.start && u.filed <= addDays(m.end, FORM4_LAG_DAYS));
  const usable = months.filter(m => !unsureMonth(m));
  let prob = 0.5, thin = true, hit = 0;
  if (usable.length >= MIN_MONTHS) {
    hit = monthlySales(events, person, pick.ticker, usable).filter(x => x.total > line).length;
    prob = Math.round(clampProb(hit / usable.length) * 100) / 100; thin = false;
  }
  const paceText = `The line is ${name}'s recent pace: ${fmtMoney(histTotal)} of reported ${pick.ticker} sales over the ${weeks.length} weeks we have, about ${fmtMoney(pace)} per ${days}-day month, rounded to ${fmtMoney(line)}.`;
  const text = thin
    ? `We only have ${usable.length} complete month${usable.length === 1 ? '' : 's'} of Form 4 history, fewer than the ${MIN_MONTHS} needed to set odds from history, so this starts at 50%. ${paceText}`
    : `In ${hit} of the last ${usable.length} complete months, ${name}'s reported ${pick.ticker} sales were above ${fmtMoney(line)}. ${paceText}`;
  return {
    slug: `mv-size-${w.id}-${person}-${slugPart(pick.ticker)}`,
    kind: 'sale_size', person: { slug: person, name },
    question: `Will ${name}'s reported sales of ${pick.ticker} stock (Form 4, code S) add up to more than ${fmtMoney(line)} in ${w.label}?`,
    params: { slug: person, name, code: 'S', ticker: pick.ticker, issuer: pick.issuer, from: w.start, to: w.end, window: w.id, line, cik: pick.cik || null, edgarUrl: edgarUrl(pick.cik) },
    opens_at: new Date(now).toISOString(), closes_at: nyToUtc(w.end, '16:00').toISOString(),
    resolves_by: nyToUtc(addDays(w.end, FORM4_LAG_DAYS), '23:59').toISOString(),
    b: B, startProb: prob,
    baseRate: { prob, thin, hit, known: usable.length, unit: 'month', text },
    rule: `We add up shares × price for every ${pick.ticker} sale (code S) this person reports on Form 4 with a trade date from ${fmtDay(w.start)} to ${fmtDay(w.end)} (the same trade reported by two joint filers counts once). ` +
      `YES if the total is more than ${fmtMoney(line)}. Trading closes ${fmtDay(w.end)} at 4:00 PM New York time; we check ${FORM4_LAG_DAYS} days later. ` +
      `If a Form 4 from that period cannot be read and the total is not already over the line, the market is void.`,
    source: { label: `SEC EDGAR Form 4 filings for ${name}`, url: edgarUrl(pick.cik), data: 'data/filings/latest.json', historyFrom: span && span.start, historyTo: span && span.lastComplete }
  };
}

export const FUND_RE = /\b(ETF|TR UNIT|FD TR|TRUST|INDEX|SPDR|ISHARES|QQQ|VANGUARD|SELECT SECTOR)\b/i;

// 13F: where a holding stands in a filer doc. Returns { state: 'decreased'|'increased'|'new'|'exited'|'unchanged'|'unknown', shares }
export function holdingChange(doc, cusip) {
  const ch = doc && doc.changes || {};
  const find = list => (Array.isArray(list) ? list : []).find(x => x && x.cusip === cusip);
  for (const k of ['decreased', 'increased', 'new', 'exited']) {
    const x = find(ch[k]);
    if (x) return { state: k, shares: Number(x.shares), prevShares: x.prevShares != null ? Number(x.prevShares) : null };
  }
  const top = (Array.isArray(doc && doc.top) ? doc.top : []).find(x => x && x.cusip === cusip);
  if (listsComplete(doc)) return { state: 'unchanged', shares: top ? Number(top.shares) : null };
  return { state: 'unknown', shares: top ? Number(top.shares) : null };
}
export function listsComplete(doc) {
  const cap = Number(doc && doc.listCap);
  if (!Number.isFinite(cap)) return false;
  return ['new', 'exited', 'increased', 'decreased'].every(k => Number.isFinite(Number(doc[k])) && Number(doc[k]) <= cap);
}

function fundMarket({ doc, people, now, target }) {
  const person = doc.personSlug;
  const name = personName(people, person);
  const holds = (Array.isArray(doc.top) ? doc.top : []).filter(h => h && h.cusip && h.shareType === 'SH' && Number(h.shares) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value) || String(a.cusip).localeCompare(String(b.cusip)));
  if (!holds.length || !doc.period || !doc.url) return null;
  // ask about a company stock when there is one; index funds and ETFs are usually hedges, not a move
  const h = holds.find(x => !FUND_RE.test(`${x.name} ${x.title || ''}`)) || holds[0];
  // base rate: how many of the top-10 holdings this filer cut in its latest filing
  let hit = 0, known = 0;
  for (const t of holds) {
    const c = holdingChange(doc, t.cusip);
    if (c.state === 'unknown') continue;
    known++; if (c.state === 'decreased' || c.state === 'exited') hit++;
  }
  const thin = known < MIN_13F_KNOWN;
  const prob = thin ? 0.5 : Math.round(clampProb(hit / known) * 100) / 100;
  const fund = tidyName(doc.filer);
  const holding = tidyName(h.name) + (h.title && !/^COM/i.test(h.title) ? ` (${tidyName(h.title)})` : '');
  const text = thin
    ? `We could check only ${known} of ${fund}'s top holdings in its last 13F, too few to set odds from history, so this starts at 50%.`
    : `In its last 13F (${fmtDay(doc.period)} against ${fmtDay(doc.prevPeriod)}), ${fund} cut ${hit} of the ${known} top-10 holdings we could check. So this starts at ${pct(prob)}%` +
      (prob !== Math.round(hit / known * 100) / 100 ? ` (capped between ${pct(P_MIN)}% and ${pct(P_MAX)}%)` : '') + '.';
  const closes = nyToUtc(target.end, '16:00').toISOString();
  return {
    slug: `mv-13f-${target.id}-${doc.slug}-${slugPart(h.cusip)}`,
    kind: 'fund_move', person: { slug: person, name },
    question: `Will ${fund}'s 13F for the quarter ending ${fmtDay(target.end)} show fewer ${holding} shares than the ${fmtInt(h.shares)} it reported for ${fmtDay(doc.period)}?`,
    params: { slug: person, name, filer: doc.slug, filerName: fund, cik: doc.cik || null, cusip: h.cusip, holding, baseShares: Number(h.shares), basePeriod: doc.period,
      baseUrl: doc.url, targetPeriod: target.end, window: target.id },
    opens_at: new Date(now).toISOString(), closes_at: closes,
    resolves_by: nyToUtc(addDays(target.end, F13_DUE_DAYS + 1), '23:59').toISOString(),
    b: B, startProb: prob,
    baseRate: { prob, thin, hit, known, unit: 'holding', text },
    rule: `YES if ${fund}'s 13F-HR for the quarter ending ${fmtDay(target.end)} reports fewer shares of ${holding} (CUSIP ${h.cusip}) than the ${fmtInt(h.shares)} in its ${fmtDay(doc.period)} filing; ` +
      `selling the whole position counts as fewer. Share counts are compared as reported, so a stock split counts as a change. Trading closes ${fmtDay(target.end)} at 4:00 PM New York time, when the quarter ends; ` +
      `the filing is due ${F13_DUE_DAYS} days later. If our copy of the filing cannot show the holding's share count, or the filing never arrives, the market is void.`,
    source: { label: `${fund} 13F-HR filings on SEC EDGAR`, url: edgarUrl(doc.cik, '13F-HR') || doc.url, baseFiling: doc.url, data: `data/13f/${doc.slug}.json` }
  };
}

// people: {slug: {name}}; filingsDoc: data/filings/latest.json; thirteenF: [filer docs]; now: Date
export function generateMoves({ filingsDoc, thirteenF = [], people = {}, now = new Date() }) {
  const out = [];
  const doc = filingsDoc || {};
  const weeks = historyWeeks(doc);
  const span = historySpan(doc);
  const { events, unread } = form4Events(doc.filings || []);
  const w = monthWindow(now);
  const inPeople = s => !!people[s];
  const histEvents = weeks.length ? events.filter(e => e.date >= weeks[0].start && e.date <= weeks[weeks.length - 1].end) : [];
  if (weeks.length) {
    for (const code of ['S', 'P']) {
      const slugs = [...new Set(histEvents.filter(e => e.code === code && e.ticker).map(e => e.slug))].filter(inPeople).sort();
      for (const s of slugs) {
        const pick = pickTicker(histEvents, s, code);
        if (!pick) continue;
        const name = personName(people, s);
        out.push(form4Market({ kind: code === 'S' ? 'insider_sell' : 'insider_buy', code, person: s, name, pick, w, now, weeks, events, unread, span }));
        if (code === 'S') {
          const m = saleSizeMarket({ person: s, name, pick, w, now, weeks, events, unread, span });
          if (m) out.push(m);
        }
      }
    }
  }
  const target = quarterTarget(now);
  const filers = (thirteenF || []).filter(d => d && d.slug && inPeople(d.personSlug) && d.period && d.period < target.end)
    .sort((a, b) => Number(b.totalValue || 0) - Number(a.totalValue || 0) || a.slug.localeCompare(b.slug)).slice(0, MAX_FUND_FILERS);
  for (const d of filers) {
    const m = fundMarket({ doc: d, people, now, target });
    if (m) out.push(m);
  }
  return out.sort((a, b) => a.person.name.localeCompare(b.person.name) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.slug.localeCompare(b.slug));
}

// ---------- resolution ----------
// Returns { outcome: 'yes'|'no'|'void', note, source_url } or null while the data is not in yet.
// ctx: { filingsDoc, thirteenF: {filerSlug: doc}, now }
export function resolveMove(m, ctx) {
  const now = ctx.now || new Date();
  const today = nyDate(now);
  const p = m.params || {};
  const who = p.name || (m.person && m.person.name) || p.slug;
  if (m.kind === 'insider_sell' || m.kind === 'insider_buy' || m.kind === 'sale_size') {
    const doc = ctx.filingsDoc || {};
    const gen = doc.generated ? nyDate(doc.generated) : null;
    const readyDay = addDays(p.to, FORM4_LAG_DAYS);
    const fallback = p.edgarUrl || `${SITE}/people/${p.slug}/`;
    if (!gen || gen < readyDay) {
      if (today > addDays(p.to, GIVE_UP_DAYS)) return { outcome: 'void', note: `Void: SEC filings covering ${fmtDay(p.from)} to ${fmtDay(p.to)} were never fetched in time, so stakes come back.`, source_url: fallback };
      return null;
    }
    const spanStart = addDays(gen, -Number(doc.windowDays || 90));
    if (spanStart > p.from) return { outcome: 'void', note: `Void: our filings file no longer reaches back to ${fmtDay(p.from)}, so we cannot check the whole window.`, source_url: fallback };
    const { events, unread } = form4Events(doc.filings || []);
    const mine = events.filter(e => e.slug === p.slug && e.code === p.code && e.tickers.includes(p.ticker) && e.date >= p.from && e.date <= p.to)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.url).localeCompare(String(b.url)));
    const unsure = unread.filter(u => u.slug === p.slug && u.filed >= p.from && u.filed <= readyDay);
    const verb = p.code === 'S' ? 'sale' : 'open-market buy';
    if (m.kind === 'sale_size') {
      const total = mine.reduce((a, e) => a + (Number.isFinite(e.value) ? e.value : 0), 0);
      const biggest = [...mine].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      const line = `Reported ${p.ticker} sales (code S) dated ${fmtDay(p.from)} to ${fmtDay(p.to)}: ${fmtMoney(total)} across ${mine.length} trade${mine.length === 1 ? '' : 's'}; the line was ${fmtMoney(p.line)}.`;
      if (total > p.line) return { outcome: 'yes', note: line, source_url: (biggest && biggest.url) || fallback };
      if (unsure.length) return { outcome: 'void', note: `Void: ${who} filed ${unsure.length} Form 4${unsure.length > 1 ? 's' : ''} in that period we could not read in detail, and the readable total (${fmtMoney(total)}) is under the line.`, source_url: unsure[0].url || fallback };
      return { outcome: 'no', note: line, source_url: (biggest && biggest.url) || fallback };
    }
    const hit = mine[0];
    if (hit) {
      const detail = [hit.shares != null ? `${fmtInt(hit.shares)} shares` : null, hit.price != null ? `at about $${hit.price.toFixed(2)}` : null].filter(Boolean).join(' ');
      return { outcome: 'yes', note: `${who} reported a ${p.ticker} ${verb} (code ${p.code}) dated ${fmtDay(hit.date)}${detail ? ` (${detail})` : ''}, on a Form 4 filed ${fmtDay(hit.filed)}.`, source_url: hit.url || fallback };
    }
    if (unsure.length) return { outcome: 'void', note: `Void: ${who} filed ${unsure.length} Form 4${unsure.length > 1 ? 's' : ''} in that period we could not read in detail, so we cannot say for sure.`, source_url: unsure[0].url || fallback };
    return { outcome: 'no', note: `No Form 4 from ${who} reported a ${p.ticker} ${verb} (code ${p.code}) dated ${fmtDay(p.from)} to ${fmtDay(p.to)}, in SEC filings fetched ${fmtDay(gen)}.`, source_url: fallback };
  }
  if (m.kind === 'fund_move') {
    const doc = (ctx.thirteenF || {})[p.filer];
    const giveUp = today > addDays(p.targetPeriod, F13_DUE_DAYS + F13_GIVE_UP_DAYS);
    const fallback = p.baseUrl || `${SITE}/people/${p.slug}/`;
    if (!doc || !doc.period || doc.period < p.targetPeriod) {
      if (giveUp) return { outcome: 'void', note: `Void: ${p.filerName}'s 13F for the quarter ending ${fmtDay(p.targetPeriod)} never arrived in our data, so stakes come back.`, source_url: fallback };
      return null;
    }
    if (doc.period > p.targetPeriod) return { outcome: 'void', note: `Void: our data skipped from an older filing to the ${fmtDay(doc.period)} one, so we cannot read the ${fmtDay(p.targetPeriod)} quarter.`, source_url: doc.url || fallback };
    const c = holdingChange(doc, p.cusip);
    let shares = null;
    if (c.state === 'exited') shares = 0;
    else if (Number.isFinite(c.shares) && c.shares != null) shares = c.shares;
    else if (c.state === 'unchanged' && doc.prevPeriod === p.basePeriod) shares = p.baseShares;
    if (shares == null) return { outcome: 'void', note: `Void: ${p.filerName}'s ${fmtDay(doc.period)} 13F is in, but our copy does not show the ${p.holding} share count, so we cannot say for sure.`, source_url: doc.url || fallback };
    const line = `${p.filerName}'s 13F for ${fmtDay(doc.period)} reports ${fmtInt(shares)} ${p.holding} shares, against ${fmtInt(p.baseShares)} for ${fmtDay(p.basePeriod)}.`;
    return { outcome: shares < p.baseShares ? 'yes' : 'no', note: line, source_url: doc.url || fallback };
  }
  return null;
}

// ---------- backtest: the same Form 4 questions for complete past months, checked against filings (never traded) ----------
export function backtestMoves({ filingsDoc, people = {}, now = new Date() }) {
  const doc = filingsDoc || {};
  const span = historySpan(doc);
  const weeks = historyWeeks(doc);
  if (!span || !weeks.length) return [];
  const { events } = form4Events(doc.filings || []);
  const histEvents = events.filter(e => e.date >= weeks[0].start && e.date <= weeks[weeks.length - 1].end);
  const cur = monthWindow(now);
  const months = prevMonths(cur, 12).filter(m => m.start >= span.start && addDays(m.end, FORM4_LAG_DAYS) <= span.generated).slice(0, BACKTEST_MONTHS);
  const out = [];
  for (const mo of months) {
    for (const code of ['S', 'P']) {
      const slugs = [...new Set(histEvents.filter(e => e.code === code && e.ticker).map(e => e.slug))].filter(s => people[s]).sort();
      for (const s of slugs) {
        const pick = pickTicker(histEvents, s, code);
        if (!pick) continue;
        const name = personName(people, s);
        const verb = code === 'S' ? 'selling' : 'buying';
        const m = {
          slug: `bt-${code === 'S' ? 'sell' : 'buy'}-${mo.id}-${s}-${slugPart(pick.ticker)}`,
          kind: code === 'S' ? 'insider_sell' : 'insider_buy', person: { slug: s, name },
          question: `Did ${name} report ${verb} ${pick.ticker} stock (Form 4, code ${code}) with a trade date between ${fmtDay(mo.start)} and ${fmtDay(mo.end)}?`,
          params: { slug: s, name, code, ticker: pick.ticker, from: mo.start, to: mo.end, window: mo.id, edgarUrl: edgarUrl(pick.cik) },
          closes_at: nyToUtc(mo.end, '16:00').toISOString()
        };
        const r = resolveMove(m, { filingsDoc: doc, now });
        if (!r) continue;
        out.push({ slug: m.slug, kind: m.kind, person: m.person, question: m.question, window: mo.id, closes_at: m.closes_at,
          outcome: r.outcome, note: r.note, source_url: r.source_url, backtest: true });
      }
    }
  }
  return out;
}

// ---------- the whole build: keep existing markets stable, resolve the due ones, add new ones ----------
// prevMarkets: markets from the last markets.json; prevResolved: entries from the last resolved.json (non-backtest kept)
export function buildMoves({ filingsDoc, thirteenF = [], people = {}, now = new Date(), prevMarkets = [], prevResolved = [] }) {
  const nowMs = new Date(now).getTime();
  const byFiler = Object.fromEntries((thirteenF || []).filter(d => d && d.slug).map(d => [d.slug, d]));
  const resolved = (prevResolved || []).filter(r => r && !r.backtest);
  const done = new Set(resolved.map(r => r.slug));
  const markets = [];
  const today = nyDate(now);
  for (const m of prevMarkets || []) {
    if (!m || !m.slug || done.has(m.slug) || !KINDS.includes(m.kind)) continue;
    if (new Date(m.closes_at).getTime() <= nowMs) {
      const r = resolveMove(m, { filingsDoc, thirteenF: byFiler, now });
      if (r) {
        resolved.push({ slug: m.slug, kind: m.kind, person: m.person, question: m.question, window: m.params && m.params.window, closes_at: m.closes_at,
          startProb: m.startProb, outcome: r.outcome, note: r.note, source_url: r.source_url, resolvedOn: today, backtest: false });
        done.add(m.slug);
        continue;
      }
      markets.push({ ...m, status: 'closed' });
    } else markets.push({ ...m, status: 'open' });
  }
  const have = new Set(markets.map(m => m.slug));
  for (const m of generateMoves({ filingsDoc, thirteenF, people, now })) {
    if (have.has(m.slug) || done.has(m.slug)) continue;
    if (new Date(m.closes_at).getTime() <= nowMs) continue;
    markets.push({ ...m, status: 'open' });
  }
  markets.sort((a, b) => a.person.name.localeCompare(b.person.name) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.slug.localeCompare(b.slug));
  resolved.sort((a, b) => String(b.closes_at).localeCompare(String(a.closes_at)) || a.slug.localeCompare(b.slug));
  const backtest = backtestMoves({ filingsDoc, people, now })
    .sort((a, b) => String(b.window).localeCompare(String(a.window)) || a.person.name.localeCompare(b.person.name) || a.slug.localeCompare(b.slug));
  return { markets, resolved, backtest };
}

// What create_market needs (0001_game.sql), from a markets.json entry.
export function marketPayload(m) {
  return { slug: m.slug, question: m.question, kind: m.kind, params: { ...m.params, startProb: m.startProb }, opens_at: m.opens_at,
    closes_at: m.closes_at, resolves_by: m.resolves_by, b: m.b || B };
}
