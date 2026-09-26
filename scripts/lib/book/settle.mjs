// The Book: settlement. Pure: given a week's book and its results, the outcome of every selection.
//
// results = {
//   totals:   { slug: weekly fantasy points }          (people without a total make their selections void)
//   pBuyDays: { slug: days with a code-P Form 4 filed Mon-Fri }
//   insiderUnknown: [slug]                             (had a Form 4 in the week we could not read: void unless a buy is confirmed)
//   history:  { TICKER: [[date, close]] }              (data/prices/history; the price markets below settle from it)
// }
// Returns { results: { selectionId: 'win' | 'lose' | 'void' }, notes: { eventId: text } }.
//
// Price markets (blast, ladder, bracket, race, duel) settle close-to-close from the frozen basket / wealth entries in the
// event's params (see pricing.mjs). A missing close on the from or to date makes the whole event void (stake back).
import { basketReturn, trackedValue } from '../wealth.mjs';

export const PRICE_TYPES = ['blast', 'ladder', 'bracket', 'race', 'duel'];
export const isPriceEvent = ev => !!ev && PRICE_TYPES.includes(ev.type);
// Waiting for a close: after this many days past the to date (+1), a still-missing close voids the event.
export const PRICE_GIVE_UP_DAYS = 3;
// Long-shot stake caps (mirrors place_bet in supabase/migrations/0003_book_wealth.sql): combined decimal odds at or
// above minDecimal -> at most maxStake coins. Otherwise the normal 500-coin limit.
export const MAX_STAKE = 500;
export const STAKE_CAPS = [{ minDecimal: 21, maxStake: 50 }, { minDecimal: 6, maxStake: 150 }];
export function maxStakeFor(combinedDecimal) {
  for (const c of STAKE_CAPS) if (Number(combinedDecimal) >= c.minDecimal) return c.maxStake;
  return MAX_STAKE;
}
export const stakeCapMessage = cap => `Long shots are capped at ${cap} coins.`;

const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k) && Number.isFinite(Number(o[k]));
const fmt = n => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));

// Pick-the-top markets: the unique leader wins; a tie for first voids the tied picks; the rest lose.
function topOf(scores) {
  const vals = Object.values(scores);
  if (!vals.length) return { best: null, leaders: [] };
  const best = Math.max(...vals);
  return { best, leaders: Object.keys(scores).filter(k => scores[k] === best) };
}

const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const pctText = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;
const usdText = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}$${(Math.abs(v) / 1e9).toFixed(2)}B`;

// What a price event measures, from the price history; null when any close it needs is missing.
//   blast (pct), ladder, bracket: { slug: basket return % from -> to (4 dp) }
//   blast (usd), duel:            { slug: tracked $ change from -> to (whole dollars) }
//   race:                         { slug: tracked $ value on the to date (whole dollars) }
export function priceMeasure(ev, history = {}) {
  const p = (ev && ev.params) || {};
  const pct = b => basketReturn(b, history, p.from, p.to);
  const usd = w => {
    const a = trackedValue(w, history, p.from), b = trackedValue(w, history, p.to);
    return a == null || b == null ? null : Math.round(b - a);
  };
  const each = (slugs, f) => {
    const o = {};
    for (const s of slugs) { const v = f(s); if (v == null) return null; o[s] = v; }
    return o;
  };
  switch (ev && ev.type) {
    case 'blast': return p.metric === 'usd' ? each(p.slugs || [], s => usd((p.wealth || {})[s])) : each(p.slugs || [], s => pct((p.baskets || {})[s]));
    case 'ladder':
    case 'bracket': { const r = pct(p.basket); return r == null ? null : { [p.slug]: r }; }
    case 'race': return each([p.chaser, p.leader], s => { const v = trackedValue((p.wealth || {})[s], history, p.to); return v == null ? null : Math.round(v); });
    case 'duel': return each([p.a, p.b], s => usd((p.wealth || {})[s]));
    default: return null;
  }
}

// 'ready' (every close is in), 'missing' (still not in PRICE_GIVE_UP_DAYS + 1 days after the to date: settles void),
// or 'waiting'. today: New York 'YYYY-MM-DD'.
export function priceEventState(ev, history, today) {
  if (priceMeasure(ev, history)) return 'ready';
  const to = ev && ev.params && ev.params.to;
  return to && today > addDays(to, 1 + PRICE_GIVE_UP_DAYS) ? 'missing' : 'waiting';
}

function settlePrice(ev, res, out, all) {
  const p = ev.params || {};
  const m = priceMeasure(ev, res.history || {});
  if (!m) { all('void'); return 'Void: a closing price is missing.'; }

  if (ev.type === 'blast') {
    const vals = Object.values(m);
    const ext = p.side === 'down' ? Math.min(...vals) : Math.max(...vals);
    const leaders = Object.keys(m).filter(k => m[k] === ext);
    for (const s of ev.selections) {
      if (!(s.person in m)) out[s.id] = 'void';
      else if (leaders.includes(s.person)) out[s.id] = leaders.length > 1 ? 'void' : 'win';
      else out[s.id] = 'lose';
    }
    const txt = p.metric === 'usd' ? usdText(ext) : pctText(ext);
    return `${p.side === 'down' ? 'Biggest loser' : 'Biggest gainer'}: ${leaders.join(', ')} ${txt}${leaders.length > 1 ? ' (tie: void)' : ''}.`;
  }
  if (ev.type === 'ladder') {
    const r = m[p.slug];
    for (const s of ev.selections) {
      const K = Number(s.line);
      out[s.id] = !Number.isFinite(K) || K === 0 ? 'void' : (K > 0 ? r >= K : r <= K) ? 'win' : 'lose';
    }
    return `${p.slug} ${pctText(r)}.`;
  }
  if (ev.type === 'bracket') {
    const r = m[p.slug];
    for (const s of ev.selections) {
      const b = (p.buckets || {})[s.id];
      if (!Array.isArray(b)) { out[s.id] = 'void'; continue; }
      const [lo, hi] = b;
      out[s.id] = (lo == null || r >= lo) && (hi == null || r < hi) ? 'win' : 'lose';
    }
    return `${p.slug} ${pctText(r)}.`;
  }
  if (ev.type === 'race') {
    const passed = m[p.chaser] > m[p.leader];
    for (const s of ev.selections) out[s.id] = s.market === 'yes' ? (passed ? 'win' : 'lose') : s.market === 'no' ? (passed ? 'lose' : 'win') : 'void';
    return `${p.chaser} $${(m[p.chaser] / 1e9).toFixed(2)}B, ${p.leader} $${(m[p.leader] / 1e9).toFixed(2)}B.`;
  }
  if (ev.type === 'duel') {
    const dA = m[p.a] - m[p.b];
    for (const s of ev.selections) {
      const mine = s.person === p.a ? dA : s.person === p.b ? -dA : null;
      if (mine == null) { out[s.id] = 'void'; continue; }
      const T = s.market === 'ml' ? 0 : s.market === 'by' ? Math.round(Number(s.line) * 1e9) : NaN;
      out[s.id] = !Number.isFinite(T) ? 'void' : mine > T ? 'win' : mine < T ? 'lose' : 'void';
    }
    return `${p.a} ${usdText(m[p.a])}, ${p.b} ${usdText(m[p.b])}.${dA === 0 ? ' A tie: moneyline void.' : ''}`;
  }
  all('void');
  return 'Void: unknown event type.';
}

export function settleEvent(ev, res) {
  const totals = res.totals || {}, out = {};
  const T = s => Number(totals[s]);
  const all = (r) => { for (const s of ev.selections) out[s.id] = r; };
  const p = ev.params || {};
  let note = '';
  if (isPriceEvent(ev)) return { out, note: settlePrice(ev, res, out, all) };

  if (ev.type === 'h2h') {
    if (!has(totals, p.a) || !has(totals, p.b)) { all('void'); return { out, note: 'Void: a weekly score is missing.' }; }
    const a = T(p.a), b = T(p.b);
    note = `${p.a} ${fmt(a)}, ${p.b} ${fmt(b)}.`;
    for (const s of ev.selections) {
      const mine = s.person === p.a ? a - b : b - a;          // this side's margin
      if (s.market === 'ml') out[s.id] = mine > 0 ? 'win' : mine < 0 ? 'lose' : 'void';
      else if (s.market === 'spread') { const m = mine + Number(s.line); out[s.id] = m > 0 ? 'win' : m < 0 ? 'lose' : 'void'; }
      else out[s.id] = 'void';
    }
    if (a === b) note += ' A tie: moneyline void.';
    return { out, note };
  }

  if (ev.type === 'player_ou') {
    if (!has(totals, p.slug)) { all('void'); return { out, note: 'Void: the weekly score is missing.' }; }
    const t = T(p.slug);
    for (const s of ev.selections) {
      const L = Number(s.line);
      if (t === L) out[s.id] = 'void';
      else if (s.market === 'over') out[s.id] = t > L ? 'win' : 'lose';
      else if (s.market === 'under') out[s.id] = t < L ? 'win' : 'lose';
      else out[s.id] = 'void';
    }
    return { out, note: `${p.slug} ${fmt(t)} points.` };
  }

  if (ev.type === 'futures_top') {
    const scores = {};
    for (const s of ev.selections) if (has(totals, s.person)) scores[s.person] = T(s.person);
    const { best, leaders } = topOf(scores);
    for (const s of ev.selections) {
      if (!has(totals, s.person) || best == null) out[s.id] = 'void';
      else if (leaders.includes(s.person)) out[s.id] = leaders.length > 1 ? 'void' : 'win';
      else out[s.id] = 'lose';
    }
    return { out, note: best == null ? 'Void: no scores.' : `Top: ${leaders.join(', ')} with ${fmt(best)}${leaders.length > 1 ? ' (tie: void)' : ''}.` };
  }

  if (ev.type === 'prop_insider') {
    const n = Number((res.pBuyDays || {})[p.slug]) || 0;
    const unknown = (res.insiderUnknown || []).includes(p.slug);
    for (const s of ev.selections) {
      if (n > 0) out[s.id] = s.market === 'yes' ? 'win' : 'lose';
      else if (unknown) out[s.id] = 'void';
      else out[s.id] = s.market === 'no' ? 'win' : 'lose';
    }
    return { out, note: n > 0 ? `${n} day(s) with an open-market buy.` : unknown ? 'Void: a Form 4 we could not read.' : 'No open-market buy filed.' };
  }

  if (ev.type === 'prop_sector') {
    const avgs = {};
    for (const [sec, slugs] of Object.entries(p.members || {})) {
      const xs = slugs.filter(s => has(totals, s)).map(T);
      if (xs.length) avgs[sec] = xs.reduce((a, b) => a + b, 0) / xs.length;
    }
    const { best, leaders } = topOf(avgs);
    for (const s of ev.selections) {
      if (!(s.sector in avgs) || best == null) out[s.id] = 'void';
      else if (leaders.includes(s.sector)) out[s.id] = leaders.length > 1 ? 'void' : 'win';
      else out[s.id] = 'lose';
    }
    return { out, note: best == null ? 'Void: no scores.' : Object.entries(avgs).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') + '.' };
  }

  all('void');
  return { out, note: 'Void: unknown event type.' };
}

export function settleBook(book, res) {
  const results = {}, notes = {};
  for (const ev of book.events || []) {
    const { out, note } = settleEvent(ev, res);
    Object.assign(results, out);
    notes[ev.id] = note;
  }
  return { results, notes };
}

// A bet's result from its legs: [{ result, decimal }]. Mirrors settle_book / settle_book_events in the database.
// Any lose -> lost (0). All void -> void (stake back). Otherwise won: stake x product of the winning legs, rounded down, capped.
export function betOutcome(stake, legs, cap = 10000) {
  if (legs.some(l => l.result == null)) return { status: 'open', payout: null };
  if (legs.some(l => l.result === 'lose')) return { status: 'lost', payout: 0 };
  const wins = legs.filter(l => l.result === 'win');
  if (!wins.length) return { status: 'void', payout: stake };
  const prod = wins.reduce((p, l) => p * Number(l.decimal), 1);
  return { status: 'won', payout: Math.min(cap, Math.floor(stake * prod + 1e-9)) };
}
