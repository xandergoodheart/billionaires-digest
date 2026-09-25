// Weekly play-money markets: which ones to open, and how each one resolves.
// Everything is computed from the site's own data files (fantasy weeks/days, SEC filings, people profiles).
import { nyDate, nyToUtc, addDays } from './time.mjs';

export const SITE = 'https://billionairesdigest.com';
export const H2H_PAIRS = 5;
export const INSIDER_MARKETS = 3;
export const SECTOR_MARKETS = 3;
export const MIN_SECTOR_SIZE = 3;     // a sector needs 3+ draftable people to have a market
export const P_LOOKBACK_DAYS = 90;
export const GIVE_UP_DAYS = 3;        // void a market if its data is still missing this long after resolves_by

const slugPart = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const round1 = n => Math.round(n * 10) / 10;
const fmtPts = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function marketTimes(week) {
  return {
    closes_at: nyToUtc(week.end, '16:00').toISOString(),                 // Friday 4:00 PM New York
    resolves_by: nyToUtc(addDays(week.end, 1), '23:59').toISOString()     // by Saturday night
  };
}

// Is this Form 4 an open-market buy (transaction code P)?
export function isPBuy(f) {
  const f4 = f && f.form4;
  if (!f4) return false;
  const rows = [...(Array.isArray(f4.summary) ? f4.summary : []), ...(Array.isArray(f4.transactions) ? f4.transactions : [])];
  return rows.some(r => r && r.code === 'P');
}
const isForm4 = f => /^4(\/A)?$/.test(String(f && f.form || ''));

// week totals: the week file's totals, or the sum of its day files
export function weekTotals(week, days) {
  if (week.totals && Object.keys(week.totals).length) return week.totals;
  const t = {};
  for (const d of days) {
    if (d.date < week.start || d.date > week.end) continue;
    for (const p of d.people || []) t[p.slug] = (t[p.slug] || 0) + Number(p.points || 0);
  }
  return t;
}

// ---------- generation ----------
// week: weeks/<W>.json; people: {slug: {name, sector}}; filings: data/filings/latest.json list;
// prevWeek (optional): last week's file, used to pick the sectors; now: Date
export function generateMarkets({ week, people, filings = [], prevWeek = null, prevDays = [], now = new Date() }) {
  const out = [];
  const w = slugPart(week.week);
  const { closes_at, resolves_by } = marketTimes(week);
  const opens_at = now.toISOString();
  const name = s => (people[s] && people[s].name) || s;
  const sal = s => Number(week.salaries && week.salaries[s]) || 0;
  const base = { opens_at, closes_at, resolves_by, b: 100 };

  // 1. head-to-head: top 10 draftable by salary, paired with the next one down
  const bySalary = [...(week.draftable || [])].filter(s => week.salaries && week.salaries[s] != null)
    .sort((a, b) => sal(b) - sal(a) || a.localeCompare(b));
  for (let i = 0; i + 1 < bySalary.length && out.length < H2H_PAIRS; i += 2) {
    const a = bySalary[i], b = bySalary[i + 1];
    out.push({ ...base, slug: `h2h-${w}-${a}-vs-${b}`, kind: 'h2h',
      question: `Will ${name(a)} out-score ${name(b)} in the fantasy league this week?`,
      params: { week: week.week, a, b, aName: name(a), bName: name(b) } });
  }

  // 2. insider buys: people with at least one Form 4 open-market buy (code P) filed in the last 90 days
  const today = nyDate(now), since = addDays(today, -P_LOOKBACK_DAYS);
  const stats = {};
  for (const f of filings) {
    if (!f || !f.personSlug || !isForm4(f) || !isPBuy(f) || !f.filed || f.filed < since || f.filed > today) continue;
    const s = stats[f.personSlug] || (stats[f.personSlug] = { n: 0, last: '' });
    s.n++; if (f.filed > s.last) s.last = f.filed;
  }
  const buyers = Object.keys(stats).sort((a, b) => stats[b].n - stats[a].n || stats[b].last.localeCompare(stats[a].last) || a.localeCompare(b));
  for (const s of buyers.slice(0, INSIDER_MARKETS)) {
    out.push({ ...base, slug: `buy-${w}-${s}`, kind: 'insider_buy',
      question: `Will ${name(s)} file a disclosed open-market buy (Form 4, code P) by Friday?`,
      params: { week: week.week, slug: s, name: name(s), from: week.start, to: week.end, recentBuys: stats[s].n } });
  }

  // 3. sectors: eligible = 3+ draftable people; the 3 with the best average last week (or the biggest) get a market
  const members = {};
  for (const s of week.draftable || []) {
    const sec = people[s] && people[s].sector;
    if (!sec) continue;
    (members[sec] = members[sec] || []).push(s);
  }
  const eligible = Object.keys(members).filter(k => members[k].length >= MIN_SECTOR_SIZE).sort();
  for (const k of eligible) members[k].sort();
  const prevTotals = prevWeek ? weekTotals(prevWeek, prevDays) : null;
  const prevAvg = k => {
    if (!prevTotals) return 0;
    const xs = members[k].map(s => Number(prevTotals[s])).filter(Number.isFinite);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  const ranked = [...eligible].sort((a, b) => prevAvg(b) - prevAvg(a) || members[b].length - members[a].length || a.localeCompare(b));
  if (eligible.length >= 2) {
    const sectorMembers = Object.fromEntries(eligible.map(k => [k, members[k]]));
    for (const k of ranked.slice(0, SECTOR_MARKETS)) {
      out.push({ ...base, slug: `sector-${w}-${slugPart(k)}`, kind: 'sector_top',
        question: `Will ${k} be the top-scoring sector in the fantasy league this week?`,
        params: { week: week.week, sector: k, members: sectorMembers } });
    }
  }
  return out;
}

// ---------- resolution ----------
// Returns { outcome: 'yes'|'no'|'void', note, source_url } or null when the data is not in yet.
// ctx: { weeks: {id: week}, days: [day], filingsDoc: {generated, filings}, now: Date }
export function resolveMarket(m, ctx) {
  const now = ctx.now || new Date();
  const p = m.params || {};
  const week = ctx.weeks[p.week];
  const giveUp = m.resolves_by && now.getTime() > new Date(m.resolves_by).getTime() + GIVE_UP_DAYS * 86400e3;
  const stale = note => (giveUp ? { outcome: 'void', note, source_url: `${SITE}/play-terms.html` } : null);
  if (!week) return stale(`Void: the data for week ${p.week} never arrived.`);
  const today = nyDate(now);
  const fantasyUrl = `${SITE}/fantasy.html`;

  if (m.kind === 'h2h' || m.kind === 'sector_top') {
    const haveEnd = ctx.days.some(d => d.date === week.end);
    if (!(today > week.end && (haveEnd || today >= addDays(week.end, 2)))) return stale('Void: the week\'s scores never arrived.');
    const totals = weekTotals(week, ctx.days);
    if (m.kind === 'h2h') {
      const a = Number(totals[p.a]), b = Number(totals[p.b]);
      const an = p.aName || p.a, bn = p.bName || p.b;
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return { outcome: 'void', note: `Void: no fantasy score for ${!Number.isFinite(a) ? an : bn} in week ${week.week}.`, source_url: fantasyUrl };
      }
      const line = `Week ${week.week} fantasy points: ${an} ${fmtPts(a)}, ${bn} ${fmtPts(b)}.`;
      if (a === b) return { outcome: 'void', note: `${line} A tie, so the market is void and stakes are refunded.`, source_url: fantasyUrl };
      return { outcome: a > b ? 'yes' : 'no', note: line, source_url: fantasyUrl };
    }
    // sector_top
    const avgs = [];
    for (const [sec, slugs] of Object.entries(p.members || {})) {
      const xs = slugs.map(s => Number(totals[s])).filter(Number.isFinite);
      if (xs.length) avgs.push({ sec, avg: round1(xs.reduce((a, b) => a + b, 0) / xs.length), n: xs.length });
    }
    if (!avgs.length) return { outcome: 'void', note: `Void: no sector scores for week ${week.week}.`, source_url: fantasyUrl };
    avgs.sort((a, b) => b.avg - a.avg || a.sec.localeCompare(b.sec));
    const top = avgs[0].avg;
    const leaders = avgs.filter(x => x.avg === top).map(x => x.sec);
    const line = `Week ${week.week} average fantasy points per draftable person: ` +
      avgs.slice(0, 4).map(x => `${x.sec} ${fmtPts(x.avg)}`).join(', ') + '.';
    if (leaders.length > 1) {
      if (leaders.includes(p.sector)) return { outcome: 'void', note: `${line} ${leaders.join(' and ')} tied for first, so the market is void and stakes are refunded.`, source_url: fantasyUrl };
      return { outcome: 'no', note: line, source_url: fantasyUrl };
    }
    return { outcome: leaders[0] === p.sector ? 'yes' : 'no', note: line, source_url: fantasyUrl };
  }

  if (m.kind === 'insider_buy') {
    const doc = ctx.filingsDoc || {};
    const generatedDay = doc.generated ? nyDate(doc.generated) : null;
    // wait until the filings were fetched after Friday ended in New York
    if (!generatedDay || generatedDay <= week.end) return stale('Void: SEC filings for the week were never fetched.');
    const from = p.from || week.start, to = p.to || week.end;
    const mine = (doc.filings || []).filter(f => f && f.personSlug === p.slug && isForm4(f) && f.filed >= from && f.filed <= to);
    const who = p.name || p.slug;
    const hit = mine.filter(isPBuy).sort((a, b) => a.filed.localeCompare(b.filed))[0];
    if (hit) {
      const row = (hit.form4.summary || []).find(r => r.code === 'P') || {};
      const what = [row.issuer || hit.form4.issuer, row.value ? `about $${Math.round(row.value).toLocaleString('en-US')}` : null].filter(Boolean).join(', ');
      return { outcome: 'yes', note: `${who} filed a Form 4 with an open-market buy (code P) on ${hit.filed}${what ? ` (${what})` : ''}.`,
        source_url: hit.indexUrl || hit.url || `${SITE}/people/${p.slug}/` };
    }
    const unread = mine.filter(f => !f.form4);
    if (unread.length) {
      return { outcome: 'void', note: `Void: ${who} filed ${unread.length} Form 4${unread.length > 1 ? 's' : ''} between ${from} and ${to} that we could not read in detail, so we cannot say for sure.`,
        source_url: unread[0].indexUrl || unread[0].url || `${SITE}/people/${p.slug}/` };
    }
    return { outcome: 'no', note: `No Form 4 open-market buy (code P) from ${who} was filed on SEC EDGAR between ${from} and ${to}` +
      (mine.length ? ` (${mine.length} other Form 4${mine.length > 1 ? 's' : ''} filed).` : '.'), source_url: `${SITE}/people/${p.slug}/` };
  }
  return null; // unknown kinds are resolved by hand
}
