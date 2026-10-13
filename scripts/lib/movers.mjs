// "Why they moved": pure helpers for scripts/list-movers.mjs.
// Picks the biggest daily moves among draftable players' main holdings from a scored day file
// (data/fantasy/days/<date>.json) and its week file (data/fantasy/weeks/<week>.json). Local data only, no network.

export const MOVERS_LIMIT = 8;
// A holding counts as a "main" holding when it is at least this share of the player's portfolio.
// A player's single largest holding always counts, whatever its weight.
export const MAIN_WEIGHT = 0.25;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Which day file to use. dates: day-file dates (any order). today: New York date YYYY-MM-DD.
// The latest file is used unless it is today's (a partial day during market hours); then the one before it.
export function pickMoverDate(dates, today) {
  const sorted = (dates || []).filter((d) => ISO.test(d)).sort();
  if (!sorted.length) return null;
  const latest = sorted[sorted.length - 1];
  if (latest === today && sorted.length > 1) return sorted[sorted.length - 2];
  if (latest === today) return null;
  return latest;
}

// Main holdings of one draftable player: [{ ticker, name, weight }].
export function mainHoldings(holdings) {
  const list = (holdings || []).filter((h) => h && h.ticker && Number.isFinite(Number(h.weight)));
  if (!list.length) return [];
  const top = list.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
  return list.filter((h) => h === top || Number(h.weight) >= MAIN_WEIGHT);
}

// ticker -> changePct for one day file, skipping stale or quarantined rows.
export function dayTickerMoves(day) {
  const out = new Map();
  for (const p of Object.values(day?.people || {})) {
    for (const h of p?.holdings || []) {
      if (!h || !h.ticker || h.stale || h.quarantined) continue;
      if (typeof h.changePct !== 'number' || !Number.isFinite(h.changePct)) continue;
      if (!out.has(h.ticker)) out.set(h.ticker, h.changePct);
    }
  }
  return out;
}

// day: a day file. week: its week file (for the draftable pool and company names); may be null.
// Returns up to `limit` movers, biggest absolute move first:
// [{ ticker, company, date, changePct, players: [slug] }]
export function listMovers(day, week, limit = MOVERS_LIMIT) {
  if (!day || !ISO.test(day.date || '')) return [];
  const moves = dayTickerMoves(day);
  const draftable = Array.isArray(week?.draftable) && week.draftable.length
    ? week.draftable
    : Object.values(day.people || {}).map((p) => ({ slug: p.slug, holdings: p.holdings })); // no week file: use the day's own players
  const byTicker = new Map();
  for (const p of draftable) {
    if (!p || !p.slug || !day.people?.[p.slug]) continue;
    for (const h of mainHoldings(p.holdings)) {
      if (!moves.has(h.ticker)) continue;
      let m = byTicker.get(h.ticker);
      if (!m) {
        m = { ticker: h.ticker, company: h.name || h.ticker, date: day.date, changePct: moves.get(h.ticker), players: [] };
        byTicker.set(h.ticker, m);
      }
      if (!m.players.includes(p.slug)) m.players.push(p.slug);
    }
  }
  return [...byTicker.values()]
    .filter((m) => m.changePct !== 0)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || a.ticker.localeCompare(b.ticker))
    .slice(0, limit)
    .map((m) => ({ ...m, players: m.players.sort() }));
}

// Slugs whose holdings include `ticker` in one day file (any weight), sorted.
export function holdersOf(day, ticker) {
  return Object.values(day?.people || {})
    .filter((p) => p && p.slug && (p.holdings || []).some((h) => h && h.ticker === ticker))
    .map((p) => p.slug)
    .sort();
}

// Reads every data/fantasy/days/<date>.json under root.
// Returns { days: Map(date -> day file), movesByDate: Map(date -> Map(ticker -> changePct)), dates: [sorted] }.
export async function loadDayFiles(root = '.') {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(root, 'data', 'fantasy', 'days');
  let files = [];
  try { files = await readdir(dir); } catch { /* none */ }
  const days = new Map();
  const movesByDate = new Map();
  for (const f of files.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort()) {
    try {
      const day = JSON.parse(await readFile(join(dir, f), 'utf8'));
      const date = f.slice(0, 10);
      days.set(date, day);
      movesByDate.set(date, dayTickerMoves(day));
    } catch { /* skip unreadable file */ }
  }
  return { days, movesByDate, dates: [...days.keys()].sort() };
}
