// Pure helpers for scripts/build-financials.mjs (SEC XBRL company facts -> data/financials/index.json).
// No network, no file access: everything here takes plain objects and returns plain objects,
// so it can be tested with small inline fixtures.

export const REVENUE_CONCEPTS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'];
export const NET_INCOME_CONCEPTS = ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'];
export const MARGIN_NOTE = 'Net income and revenue use different bases; margin not shown';
export const EPS_CONCEPTS = ['EarningsPerShareDiluted'];

const ORIGINAL_FORMS = new Set(['10-Q', '10-K']);
const AMENDED_FORMS = new Set(['10-Q/A', '10-K/A']);

const DAY = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => isoDay(toMs(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
// Inclusive length of a reported period (start and end are both days of the period).
export const periodDays = (start, end) => daysBetween(start, end) + 1;

export const isQuarter = (f) => { const n = periodDays(f.start, f.end); return n >= 80 && n <= 100; };
export const isNineMonths = (f) => { const n = periodDays(f.start, f.end); return n >= 260 && n <= 285; };
export const isAnnual = (f) => { const n = periodDays(f.start, f.end); return n >= 350 && n <= 380; };

export const round1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const roundEps = (x) => Math.round(x * 10000) / 10000; // removes float noise when summing per-share values

// Percent change; null when either side is missing or the base is not positive.
export function pctChange(cur, prev) {
  if (cur == null || prev == null || !(prev > 0)) return null;
  return round1(((cur - prev) / prev) * 100);
}

// Net margin in percent; null when revenue is missing or not positive.
export function margin(netIncome, revenue) {
  if (netIncome == null || revenue == null || !(revenue > 0)) return null;
  return round1((netIncome / revenue) * 100);
}

// Duration facts for one concept + unit, limited to 10-Q/10-K (amendments only when a period has
// no original filing). One fact per period (start|end): the most recently filed one, so restated
// comparatives win over the first print.
export function periodFacts(usGaap, concept, unit) {
  const list = usGaap?.[concept]?.units?.[unit];
  if (!Array.isArray(list)) return new Map();
  const byKey = new Map();
  for (const f of list) {
    if (!f || !f.start || !f.end || typeof f.val !== 'number') continue;
    const amended = AMENDED_FORMS.has(f.form);
    if (!ORIGINAL_FORMS.has(f.form) && !amended) continue;
    const key = `${f.start}|${f.end}`;
    const cur = byKey.get(key);
    const rank = amended ? 0 : 1;
    const curRank = cur ? (AMENDED_FORMS.has(cur.form) ? 0 : 1) : -1;
    if (!cur || rank > curRank || (rank === curRank && f.filed > cur.filed)) {
      byKey.set(key, { start: f.start, end: f.end, val: f.val, form: f.form, filed: f.filed, accn: f.accn });
    }
  }
  return byKey;
}

// Concept fallback: the first concept (in order) whose latest period is the most recent across all
// candidates is primary; periods it lacks are filled from the later concepts, in order.
// Returns { concept, facts: Map } or { concept: null, facts: empty Map }.
export function pickConcept(usGaap, concepts, unit) {
  const maps = concepts.map((c) => ({ concept: c, facts: periodFacts(usGaap, c, unit) }));
  const latest = (m) => { let e = ''; for (const f of m.values()) if (f.end > e) e = f.end; return e; };
  const withData = maps.filter((m) => m.facts.size > 0);
  if (!withData.length) return { concept: null, facts: new Map() };
  const maxEnd = withData.reduce((a, m) => (latest(m.facts) > a ? latest(m.facts) : a), '');
  const primary = withData.find((m) => latest(m.facts) === maxEnd);
  const merged = new Map(primary.facts);
  for (const m of withData) {
    if (m === primary) continue;
    for (const [k, f] of m.facts) if (!merged.has(k)) merged.set(k, f);
  }
  return { concept: primary.concept, facts: merged };
}

// Discrete ~3-month quarters from a period map, plus fiscal Q4s derived as FY minus the 9-month
// YTD value with the same start date (flagged derived: true) when no discrete quarter covers them.
// Returns Map key -> { start, end, val, form, filed, accn, derived }.
export function quarterSeries(facts) {
  const out = new Map();
  const all = [...facts.values()];
  for (const f of all) if (isQuarter(f)) out.set(`${f.start}|${f.end}`, { ...f, derived: false });
  const endsCovered = (end) => [...out.values()].some((q) => Math.abs(daysBetween(q.end, end)) <= 3);
  for (const fy of all) {
    if (!isAnnual(fy)) continue;
    if (endsCovered(fy.end)) continue;
    const nine = all
      .filter((f) => isNineMonths(f) && f.start === fy.start && f.end < fy.end)
      .sort((a, b) => (a.end < b.end ? 1 : -1))[0];
    if (!nine) continue;
    const start = addDays(nine.end, 1);
    const q = { start, end: fy.end, val: fy.val - nine.val, form: fy.form, filed: fy.filed, accn: fy.accn, derived: true };
    if (!isQuarter(q)) continue;
    out.set(`${q.start}|${q.end}`, q);
  }
  return out;
}

// Combine revenue / net income / EPS quarter series into one list of quarter rows, newest first.
// A row exists for every period present in revenue or net income. EPS only for discrete quarters.
export function combineQuarters(revQ, niQ, epsFacts) {
  const keys = new Set([...revQ.keys(), ...niQ.keys()]);
  const rows = [];
  for (const k of keys) {
    const r = revQ.get(k);
    const n = niQ.get(k);
    const src = r || n;
    const derived = Boolean((r && r.derived) || (n && n.derived));
    const e = epsFacts.get(k);
    rows.push({
      start: src.start,
      end: src.end,
      form: src.form,
      filed: src.filed,
      accn: src.accn,
      revenue: r ? r.val : null,
      netIncome: n ? n.val : null,
      epsDiluted: !derived && e && isQuarter(e) ? e.val : null,
      derived,
    });
  }
  rows.sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.start < b.start ? 1 : -1));
  return rows;
}

// Consecutive chain of `n` quarters starting at rows[fromIdx] and going back in time.
// Consecutive = each older quarter ends within 7 days of the day before the newer one starts.
export function consecutiveChain(rows, n, fromIdx = 0) {
  const first = rows[fromIdx];
  if (!first) return null;
  const chain = [first];
  while (chain.length < n) {
    const newer = chain[chain.length - 1];
    const target = addDays(newer.start, -1);
    const prev = rows.find((r) => r !== newer && r.end < newer.end && Math.abs(daysBetween(r.end, target)) <= 7);
    if (!prev) return null;
    chain.push(prev);
  }
  return chain;
}

const sumOrNull = (rows, field) => (rows.every((r) => r[field] != null) ? rows.reduce((a, r) => a + r[field], 0) : null);

export function ttmFrom(chain) {
  if (!chain || chain.length !== 4) return null;
  const eps = sumOrNull(chain, 'epsDiluted');
  return {
    start: chain[3].start,
    end: chain[0].end,
    revenue: sumOrNull(chain, 'revenue'),
    netIncome: sumOrNull(chain, 'netIncome'),
    epsDiluted: eps == null ? null : roundEps(eps),
    derivedQuarters: chain.filter((r) => r.derived).length,
  };
}

// Same quarter one year earlier: a quarter ending 358-372 days before `row.end`.
export function yearAgoQuarter(rows, row) {
  return rows.find((r) => r !== row && (() => { const d = daysBetween(r.end, row.end); return d >= 358 && d <= 372; })()) || null;
}

// Latest shares outstanding from dei:EntityCommonStockSharesOutstanding.
// Uses the newest cover date; if one filing reports several values for that date (share classes),
// they are summed and `classes` is set.
export function sharesOutstanding(dei) {
  const list = dei?.EntityCommonStockSharesOutstanding?.units?.shares;
  if (!Array.isArray(list) || !list.length) return null;
  const valid = list.filter((f) => f && f.end && typeof f.val === 'number');
  if (!valid.length) return null;
  const maxEnd = valid.reduce((a, f) => (f.end > a ? f.end : a), '');
  const atEnd = valid.filter((f) => f.end === maxEnd);
  const latestFiled = atEnd.reduce((a, f) => ((f.filed || '') > a ? f.filed || '' : a), '');
  const fromFiling = atEnd.filter((f) => (f.filed || '') === latestFiled);
  const accn = fromFiling[0].accn;
  const rows = fromFiling.filter((f) => f.accn === accn);
  const out = { value: rows.reduce((a, f) => a + f.val, 0), asOf: maxEnd };
  if (rows.length > 1) out.classes = rows.length;
  return out;
}

// A cover-page share count dated before the latest quarter even started is stale (for example,
// companies whose recent counts are only reported per share class); drop it rather than mislead.
export function currentShares(shares, quarter) {
  if (!shares || !quarter) return shares || null;
  return shares.asOf >= quarter.start ? shares : null;
}

export function secBrowseUrl(cik) {
  const n = String(Number(String(cik).replace(/\D/g, '')));
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${n}&type=10-&dateb=&owner=include&count=40`;
}

// Full summary for one companyfacts document. Returns { available: false, reason } when there is
// nothing usable.
export function summarizeCompanyFacts(doc, cik) {
  const usGaap = doc?.facts?.['us-gaap'];
  if (!usGaap) return { available: false, reason: 'No US GAAP facts in SEC company facts (likely a foreign filer).' };
  const rev = pickConcept(usGaap, REVENUE_CONCEPTS, 'USD');
  const ni = pickConcept(usGaap, NET_INCOME_CONCEPTS, 'USD');
  const eps = pickConcept(usGaap, EPS_CONCEPTS, 'USD/shares');
  const rows = combineQuarters(quarterSeries(rev.facts), quarterSeries(ni.facts), eps.facts);
  if (!rows.length) {
    const foreign = Object.values(usGaap).some((c) => Object.values(c?.units || {}).some((l) => Array.isArray(l) && l.some((f) => /^(20-F|40-F|6-K)/.test(f?.form || ''))));
    return {
      available: false,
      reason: foreign
        ? 'Foreign filer (20-F/6-K reports); no quarterly 10-Q/10-K data.'
        : 'No quarterly revenue or net income from 10-Q/10-K filings.',
    };
  }

  const q = rows[0];
  const quarter = {
    start: q.start,
    end: q.end,
    form: q.form,
    filed: q.filed,
    accn: q.accn,
    revenue: q.revenue,
    netIncome: q.netIncome,
    epsDiluted: q.epsDiluted,
  };
  if (q.derived) quarter.derived = true;

  const chain = consecutiveChain(rows, 8, 0) || consecutiveChain(rows, 4, 0);
  const ttm = chain ? ttmFrom(chain.slice(0, 4)) : null;
  const prevTtm = chain && chain.length === 8 ? ttmFrom(chain.slice(4, 8)) : null;
  const ago = yearAgoQuarter(rows, q);
  const mQ = margin(q.netIncome, q.revenue);
  const mT = ttm ? margin(ttm.netIncome, ttm.revenue) : null;
  const badQ = mQ != null && Math.abs(mQ) > 100;
  const badT = mT != null && Math.abs(mT) > 100;

  const out = {
    available: true,
    name: doc.entityName ?? null,
    cik: String(cik),
    currency: 'USD',
    secUrl: secBrowseUrl(cik),
    revenueConcept: rev.concept,
    netIncomeConcept: ni.concept,
    quarter,
    ttm: ttm ? { start: ttm.start, end: ttm.end, revenue: ttm.revenue, netIncome: ttm.netIncome, epsDiluted: ttm.epsDiluted } : null,
    revenueGrowthQ: pctChange(q.revenue, ago ? ago.revenue : null),
    revenueGrowthTTM: pctChange(ttm ? ttm.revenue : null, prevTtm ? prevTtm.revenue : null),
    netMarginQ: badQ ? null : mQ,
    netMarginTTM: badT ? null : mT,
  };
  // A margin beyond +/-100% means net income and revenue are on different bases (for example a
  // revenue concept that covers only part of the business); don't publish it.
  if (badQ || badT) out.marginNote = MARGIN_NOTE;
  out.sharesOutstanding = currentShares(sharesOutstanding(doc?.facts?.dei), q);
  return out;
}

// ---------- Ticker handling ----------

// Profile tickers are free text ("GOOGL / GOOG", "KLG (delisted)", "0700 (HKD counter) / 80700 (RMB counter)").
// Splits into individual symbols paired with their exchange text (paired one-to-one when the
// exchange text has the same number of " / " parts, otherwise the whole exchange text applies).
export function splitTicker(ticker, exchange) {
  const raw = String(ticker ?? '').trim();
  if (!raw) return [];
  const parts = raw.split('/').map((s) => s.trim()).filter(Boolean);
  const exParts = String(exchange ?? '').split('/').map((s) => s.trim());
  const note = (s) => (s.match(/\(([^)]*)\)/) || [])[1] || '';
  return parts.map((p, i) => ({
    symbol: p.replace(/\([^)]*\)/g, '').trim(),
    note: note(p),
    exchange: exParts.length === parts.length ? exParts[i] : String(exchange ?? '').trim(),
  })).filter((x) => x.symbol);
}

// US listing = exchange text starts with Nasdaq or NYSE and the ticker/exchange is not
// marked delisted or proposed.
export function isUsListing(exchange, note = '') {
  const s = String(exchange ?? '').trim();
  if (/delisted|proposed/i.test(s) || /delisted|proposed|former/i.test(note)) return false;
  return /^(nasdaq|nyse)\b/i.test(s);
}

// SEC company_tickers.json -> Map(TICKER -> { cik, title }).
export function tickerMap(companyTickers) {
  const m = new Map();
  for (const row of Object.values(companyTickers || {})) {
    if (!row || !row.ticker) continue;
    const t = String(row.ticker).toUpperCase();
    if (!m.has(t)) m.set(t, { cik: String(row.cik_str).padStart(10, '0'), title: row.title });
  }
  return m;
}

// Our "BRK.B" is SEC's "BRK-B".
export function lookupCik(map, symbol) {
  const s = String(symbol).toUpperCase();
  return map.get(s) || map.get(s.replace(/\./g, '-')) || null;
}

// Stable JSON comparison ignoring the top-level `generated` stamp.
export function sameContent(a, b) {
  if (!a || !b) return false;
  const strip = (o) => JSON.stringify({ ...o, generated: undefined });
  return strip(a) === strip(b);
}
