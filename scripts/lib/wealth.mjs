// Wealth math for The Book's price-based markets. Pure functions, no I/O.
//
// history = { TICKER: [[isoDate, close], ...] }  (same rows as data/prices/history/<TICKER>.json)
// Dates are ISO calendar dates (YYYY-MM-DD, America/New_York trading days); string comparison orders them.

// Close on exactly `date`, or null.
export function closeOn(history, ticker, date) {
  const rows = history && history[ticker];
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (r && r[0] === date) return typeof r[1] === 'number' && Number.isFinite(r[1]) && r[1] > 0 ? r[1] : null;
  }
  return null;
}

// Latest date strictly before `date` on which every ticker has a close, or null.
export function prevTradingClose(history, tickers, date) {
  const list = [...new Set(tickers ?? [])];
  if (!list.length) return null;
  const first = history && history[list[0]];
  if (!Array.isArray(first)) return null;
  const candidates = first.map((r) => r && r[0]).filter((d) => typeof d === 'string' && d < date).sort().reverse();
  for (const d of candidates) {
    if (list.every((t) => closeOn(history, t, d) !== null)) return d;
  }
  return null;
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;

// Σ weight × (close(to)/close(from) − 1) × 100, in percent (4 dp). Null if any close is missing or the basket is empty.
export function basketReturn(basket, history, from, to) {
  if (!Array.isArray(basket) || !basket.length) return null;
  let r = 0;
  for (const b of basket) {
    const c0 = closeOn(history, b.ticker, from);
    const c1 = closeOn(history, b.ticker, to);
    if (c0 === null || c1 === null) return null;
    r += (b.weight ?? 0) * (c1 / c0 - 1) * 100;
  }
  return round4(r);
}

// Tracked dollar value of one dollar-pool entry on `date`, or null if a close is missing.
//   { method:'shares', shares:{TICKER:n} }                  -> Σ n × close(date)
//   { method:'worth', worth, ticker, refDate, refClose }    -> worth × close(date) / refClose
export function trackedValue(entry, history, date) {
  if (!entry) return null;
  if (entry.method === 'shares') {
    const tickers = Object.keys(entry.shares ?? {});
    if (!tickers.length) return null;
    let v = 0;
    for (const t of tickers) {
      const c = closeOn(history, t, date);
      if (c === null) return null;
      v += entry.shares[t] * c;
    }
    return v;
  }
  if (entry.method === 'worth') {
    if (!(entry.worth > 0) || !(entry.refClose > 0)) return null;
    const c = closeOn(history, entry.ticker, date);
    if (c === null) return null;
    return entry.worth * c / entry.refClose;
  }
  return null;
}

// People from data/prices/networth-est.json whose coverage ≥ minCoverage, with the entry trackedValue needs.
// Returns [{ slug, wealth }] sorted by slug. Worth-basis people (method 'worth') need a reference close.
export function dollarPool(est, minCoverage = 0.4) {
  const out = [];
  for (const [slug, p] of Object.entries((est && est.people) || {})) {
    if (!p || typeof p.coverage !== 'number' || !(p.coverage >= minCoverage)) continue;
    const hs = Array.isArray(p.holdings) ? p.holdings : [];
    if (p.method === 'worth') {
      const h = hs[0];
      if (!h || !(p.coveredValue > 0) || !(h.refClose > 0) || !h.refDate) continue;
      out.push({ slug, wealth: { method: 'worth', worth: p.coveredValue, ticker: h.ticker, refDate: h.refDate, refClose: h.refClose } });
      continue;
    }
    const shares = {};
    for (const h of hs) {
      if (typeof h.shares === 'number' && h.shares > 0 && h.ticker) shares[h.ticker] = (shares[h.ticker] ?? 0) + h.shares;
    }
    if (!Object.keys(shares).length) continue;
    out.push({ slug, wealth: { method: 'shares', shares } });
  }
  return out.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
