// The Book: settlement. Pure: given a week's book and its results, the outcome of every selection.
//
// results = {
//   totals:   { slug: weekly fantasy points }          (people without a total make their selections void)
//   pBuyDays: { slug: days with a code-P Form 4 filed Mon-Fri }
//   insiderUnknown: [slug]                             (had a Form 4 in the week we could not read: void unless a buy is confirmed)
// }
// Returns { results: { selectionId: 'win' | 'lose' | 'void' }, notes: { eventId: text } }.

const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k) && Number.isFinite(Number(o[k]));
const fmt = n => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));

// Pick-the-top markets: the unique leader wins; a tie for first voids the tied picks; the rest lose.
function topOf(scores) {
  const vals = Object.values(scores);
  if (!vals.length) return { best: null, leaders: [] };
  const best = Math.max(...vals);
  return { best, leaders: Object.keys(scores).filter(k => scores[k] === best) };
}

export function settleEvent(ev, res) {
  const totals = res.totals || {}, out = {};
  const T = s => Number(totals[s]);
  const all = (r) => { for (const s of ev.selections) out[s.id] = r; };
  const p = ev.params || {};
  let note = '';

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

// A bet's result from its legs: [{ result, decimal }]. Mirrors settle_book in the database.
// Any lose -> lost (0). All void -> void (stake back). Otherwise won: stake x product of the winning legs, rounded down, capped.
export function betOutcome(stake, legs, cap = 10000) {
  if (legs.some(l => l.result == null)) return { status: 'open', payout: null };
  if (legs.some(l => l.result === 'lose')) return { status: 'lost', payout: 0 };
  const wins = legs.filter(l => l.result === 'win');
  if (!wins.length) return { status: 'void', payout: stake };
  const prod = wins.reduce((p, l) => p * Number(l.decimal), 1);
  return { status: 'won', payout: Math.min(cap, Math.floor(stake * prod + 1e-9)) };
}
