// Shared edition logic used by build-digest.mjs (API backup) and
// publish-digest.mjs (scheduled Claude Code agent).
// The editorial rules here are mirrored in EDITION.md. If you change one, change both.

import { writeFile, mkdir, readdir } from 'node:fs/promises';

export const DIRECTIONS = ['up', 'down', 'flat'];

const TZ = 'America/New_York';

export function dates(now = new Date()) {
  const longDate = now.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const shortDate = now.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
  const isoDate = now.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  return { longDate, shortDate, isoDate };
}

export function schemaText(longDate, shortDate) {
  return `{
  "date": "${longDate}",
  "updated": "${shortDate} · morning edition",
  "lede": { "kicker": "Lede of the day", "headline": string, "dek": string (1-2 sentences), "ini": two-letter initials of the person },
  "top10": [ { "name": string, "ini": string, "tick": short last name, "worth": "$123B" } ] (exactly 10, richest first),
  "top10AsOf": string saying which source and date the net worths come from,
  "stories": [ {
      "who": person's name, "sector": one of "AI & tech" | "Finance" | "Aerospace" | "Luxury & retail" | "Real estate" | "Energy" | "Media" | "Autos" | "Industrials" (mining, metals, steel, cement, chemicals, shipping, manufacturing) | "Health" (pharma, vaccines, hospitals, biotech) | "Other",
      "via": optional, the company or vehicle the story is about when it isn't the person directly (e.g. "Tesla"),
      "people": required when the story is about one or more top-100 people or tracked CEOs; always include "who". Array of names exactly as in data/people/index.json or data/ceos/index.json (e.g. ["Larry Page", "Sergey Brin"]),
      "type": e.g. "Acquisition" | "Investment" | "Insider trade" | "IPO / Markets" | "Leadership" | "Product launch" | "Policy" | "Property" | "Divestiture",
      "tickers": e.g. "NVDA · MSFT" (or "Private"),
      "read": short opinion label, "direction": "up" | "down" | "flat",
      "headline": under 12 words,
      "move": what happened, facts only,
      "why": why it matters,
      "bear": the strongest counterargument,
      "watch": the next date or signal to watch,
      "correction": optional, only when fixing a published error: "Corrected <date>: <what changed>",
      "source": publication name, "url": the article URL exactly as found in search results
  } ] (8 to 12 stories),
  "consensus": { "headline": string, "body": string, "tags": [string] } or null,
  "filings": [ { "filer": string, "form": "Form 4" | "13F" | "8-K" | "S-1" | "13D" | other, "change": string, "direction": "up" | "down" | "flat" } ],
  "watch": [string] (upcoming dates and events),
  "quickHits": [string] (one-sentence moves that didn't get a full story),
  "memo": [string] (3 short takeaways for someone running a business, not a fund),
  "movers": optional, [ { "ticker": string, "date": trading date "YYYY-MM-DD", "changePct": number copied exactly from list-movers, "why": one sentence (160 characters max), "sourceName": publication name, "sourceUrl": "https://..." } ] (0 to 8 entries; leave out or [] when none),
  "ledger": null
}`;
}

export function rulesText(longDate) {
  return `- Today is ${longDate}. Use web search to find real news from the last 48 hours (extend to 7 days only if needed) about investments, acquisitions, sales, insider trades, IPOs, leadership changes and major company moves by the people in data/people/index.json.
- Every story must come from a search result. Copy its URL exactly. Never invent a story, number, quote, date or URL. If you can't verify a detail, leave it out.
- Only use URLs of news articles or filings, not stock-quote or company profile pages.
- Skip the net-worth top 10: top10 and top10AsOf are filled automatically from our own data. Never quote Forbes or Bloomberg net worth figures or ranks.
- When a story is about someone in the top 10, set "who" to their name exactly as written in top10.
- "people" is required when the story is about one or more top-100 people or tracked CEOs; always include "who". Write names exactly as in data/people/index.json or data/ceos/index.json. (If it is missing, the publish script fills it with [who] when who is an exact player name.)
- Only include a consensus alert when two or more billionaires moved money the same direction in the same sector. Otherwise set it to null.
- Write plainly: short sentences, no jargon, no hype. Keep facts in "move"; put opinion only in "read", "why", "bear" and "memo".
- Do not reproduce article text. Summarize in your own words.
${MOVERS_RULES}`;
}

// "Why they moved". Mirrored in EDITION.md (section "Why they moved"). If you change one, change both.
export const MOVERS_RULES = `- Why they moved (optional "movers" field): run \`node scripts/list-movers.mjs\` (the API backup gets its output in the request instead). It lists up to 8 of the biggest daily stock moves among players' main holdings (ticker, company, date, changePct, players). For each one with a move of 2% or more (up or down), search the web for a reputable news report from that trading day or the evening before that explains the move. If you find one, add { "ticker", "date", "changePct", "why", "sourceName", "sourceUrl" }. Copy ticker, date and changePct exactly from the list-movers output. "why" is one plain sentence of 160 characters or fewer that names the move (changePct rounded to one decimal, e.g. 4.2081 -> "rose 4.2%"; the first percentage in the sentence must be the move) and attributes the reason, e.g. "Nvidia rose 4.2% after reports of new chip orders." Use attribution wording such as "after reports that…" or "after the company said…". No certainty claims beyond what the report says, no predictions and no advice: the words "will", "should", "must" and "sell" are rejected (write "sale" or "sell-off" instead). sourceUrl is the https article URL exactly as found, never a stock-quote page. If no reputable report explains a move, skip that mover. Never guess. At most 8 entries; leave "movers" out or [] if none.`;

export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.search = '';
    let s = `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`;
    while (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

export function validate(d) {
  const problems = [];
  if (!d || typeof d !== 'object') problems.push('not an object');
  if (!d.lede || !d.lede.headline) problems.push('missing lede');
  if (!Array.isArray(d.stories) || d.stories.length < 3) problems.push('fewer than 3 stories');
  (d.stories || []).forEach((s, i) => {
    if (!s.headline || !s.move) problems.push(`story ${i + 1} missing headline or move`);
    if (!/^https?:\/\//.test(s.url || '')) problems.push(`story ${i + 1} missing a real URL`);
    if (!s.source) problems.push(`story ${i + 1} missing source`);
    if (!DIRECTIONS.includes(s.direction)) problems.push(`story ${i + 1} has an invalid direction`);
  });
  if (!Array.isArray(d.top10) || d.top10.length !== 10) problems.push('top10 is not exactly 10 people');
  (Array.isArray(d.top10) ? d.top10 : []).forEach((p, i) => {
    if (!p || !p.name || !p.worth) problems.push(`top10 #${i + 1} missing name or worth`);
  });
  return problems;
}

// ---- top 10 from data/people/index.json ----
function bareName(name) { return String(name == null ? '' : name).replace(/\s*&\s*family\s*$/i, '').trim(); }
function nameWords(name) { return bareName(name).split(/\s+/).filter(Boolean); }

// First 10 people by rank (file order breaks ties) as top10 entries.
export function top10FromIndex(index) {
  const people = (Array.isArray(index?.people) ? index.people : [])
    .filter(p => p && p.name && Number.isFinite(Number(p.rank)))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.rank) - Number(b.p.rank) || a.i - b.i)
    .slice(0, 10)
    .map(x => x.p);
  return people.map(p => {
    const w = nameWords(p.name);
    const ini = w.length ? (w[0].charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase() : '';
    const tick = w.length ? w[w.length - 1] : p.name;
    return { name: p.name, ini, tick, worth: p.worth };
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-09-24T21:15-04:00" -> "List as of Sep 24, 2026 9:15 PM ET"
// Uses the wall-clock date and time written in asOf (the index is stamped in New York time). The site never shows the
// top10 worth values or names the list's outside source; this label stays neutral.
export function top10AsOfFromIndex(index) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(index?.asOf || ''));
  if (!m) return 'List date not on file';
  let when = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  if (m[4] != null) {
    const h = Number(m[4]);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    when += ` ${h12}:${m[5]} ${h < 12 ? 'AM' : 'PM'} ET`;
  }
  return `List as of ${when}`;
}

// Writes digest.json, archive/<isoDate>.json and rebuilds archive/index.json.
// ---- people from who ----
// A story's `people` drives the player chips on the front page. When it is missing or empty and `who` is exactly a
// name in data/people/index.json or data/ceos/index.json, set it to [who]. Returns what was filled.
export function fillPeopleFromWho(digest, indexes = []) {
  const names = new Set();
  for (const ix of indexes) for (const p of (Array.isArray(ix?.people) ? ix.people : [])) {
    if (p && typeof p.name === 'string' && p.name) names.add(p.name);
  }
  const filled = [];
  for (const s of (Array.isArray(digest?.stories) ? digest.stories : [])) {
    if (!s || (Array.isArray(s.people) && s.people.length)) continue;
    if (typeof s.who === 'string' && names.has(s.who)) {
      s.people = [s.who];
      filled.push({ headline: s.headline, who: s.who });
    }
  }
  return filled;
}

export async function writeEdition(digest, isoDate) {
  const json = JSON.stringify(digest, null, 2) + '\n';
  await writeFile('digest.json', json);
  await mkdir('archive', { recursive: true });
  await writeFile(`archive/${isoDate}.json`, json);
  const editions = (await readdir('archive'))
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => name.slice(0, -'.json'.length))
    .sort()
    .reverse();
  await writeFile('archive/index.json', JSON.stringify({ editions }, null, 2) + '\n');
}

// ---- "Why they moved" (digest.movers) ----

export const MOVERS_MAX = 8;
export const MOVER_WHY_MAX = 160;
export const MOVER_PCT_TOLERANCE = 0.05;
export const MOVERS_FILE_DAYS = 10;

// Simple advice / certainty check for movers' "why". "sell-off" and "selloff" are fine; "sell" alone is not.
const ADVICE_RE = /\b(will|won't|should|shouldn't|must|guaranteed|definitely|certainly)\b|\bsell\b(?!-?off)|\b(buy|sell|hold)\s+(rating|signal|now)\b/i;
export function hasAdviceWords(text) { return ADVICE_RE.test(String(text || '')); }

function isRealIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Every "N%" / "N.N%" in a sentence, as numbers. The first one must be the stock's move.
function whyPercents(text) {
  return [...String(text || '').matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((x) => Number(x[1]));
}

export function moverKey(m) { return `${m.ticker}@${m.date}`; }

// Shape and wording checks for one movers entry (no data lookups). Returns a reason string or null.
export function moverProblem(m, today = null) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'not an object';
  if (typeof m.ticker !== 'string' || !/^[A-Z0-9.\-]{1,12}$/.test(m.ticker)) return 'missing or bad ticker';
  if (!isRealIsoDate(m.date)) return 'date is not a valid YYYY-MM-DD';
  if (today && m.date > today) return 'date is in the future';
  if (typeof m.changePct !== 'number' || !Number.isFinite(m.changePct)) return 'changePct is not a number';
  if (typeof m.why !== 'string' || !m.why.trim()) return 'missing why';
  if (m.why.length > MOVER_WHY_MAX) return `why is longer than ${MOVER_WHY_MAX} characters`;
  if (/[\r\n]/.test(m.why)) return 'why has a line break';
  if (hasAdviceWords(m.why)) return 'why uses advice or certainty words (will/should/must/sell)';
  if (typeof m.sourceName !== 'string' || !m.sourceName.trim()) return 'missing sourceName';
  let u = null;
  try { u = new URL(m.sourceUrl); } catch { /* bad */ }
  if (!u || u.protocol !== 'https:' || typeof m.sourceUrl !== 'string' || !m.sourceUrl.startsWith('https://')) return 'sourceUrl is not an https URL';
  return null;
}

// Checks digest.movers against the scored day files.
// movesByDate: Map(date -> Map(ticker -> changePct)) from data/fantasy/days (see movers.mjs loadMovesByDate).
// Returns { kept: [entry], dropped: [{ entry, reason }] }. Never throws; bad entries are dropped, not fatal.
export function checkMovers(movers, movesByDate, today = null) {
  const kept = [];
  const dropped = [];
  if (movers == null) return { kept, dropped };
  if (!Array.isArray(movers)) return { kept, dropped: [{ entry: movers, reason: 'movers is not an array' }] };
  const seen = new Set();
  for (const m of movers) {
    let reason = moverProblem(m, today);
    if (!reason) {
      const day = movesByDate?.get(m.date);
      const actual = day?.get(m.ticker);
      if (!day) reason = `no scored day file for ${m.date}`;
      else if (actual == null) reason = `${m.ticker} is not a player holding on ${m.date}`;
      else if (Math.abs(actual - m.changePct) > MOVER_PCT_TOLERANCE) reason = `changePct ${m.changePct} does not match our ${actual} for ${m.ticker} on ${m.date}`;
      else if (whyPercents(m.why).slice(0, 1).some((p) => Math.abs(p - Math.abs(actual)) > MOVER_PCT_TOLERANCE + 0.05)) reason = `the first percentage in why does not match the ${actual}% move`;
    }
    if (!reason && seen.has(moverKey(m))) reason = 'duplicate ticker and date';
    if (!reason && kept.length >= MOVERS_MAX) reason = `more than ${MOVERS_MAX} movers`;
    if (reason) { dropped.push({ entry: m, reason }); continue; }
    seen.add(moverKey(m));
    kept.push({ ticker: m.ticker, date: m.date, changePct: m.changePct, why: m.why.trim(), sourceName: m.sourceName.trim(), sourceUrl: m.sourceUrl });
  }
  return { kept, dropped };
}

// data/fantasy/movers.json: the reasons behind recent big moves, for the front page's player cards.
// Shape:
// {
//   "updated": "2026-10-13T10:05:00.000Z",          // when publish-digest last wrote it
//   "days": ["2026-10-09", "2026-10-08", ...],       // trading days kept, newest first (at most 10)
//   "movers": {                                      // keyed "<TICKER>@<YYYY-MM-DD>" (trading date of the move)
//     "NVDA@2026-10-09": {
//       "ticker": "NVDA", "date": "2026-10-09",
//       "changePct": 4.2081,                         // close to close, as in data/fantasy/days/<date>.json
//       "why": "Nvidia rose 4.2% after reports of new chip orders.",
//       "sourceName": "Reuters", "sourceUrl": "https://...",
//       "players": ["jensen-huang"],                 // draftable slugs holding the ticker that day
//       "edition": "2026-10-10"                      // the digest edition that added it
//     }
//   }
// }
// existing: the current file (or null). entries: checked movers ({ ticker, date, changePct, why, sourceName, sourceUrl,
// players? }). tradingDays: scored trading dates (data/fantasy/days). A newer edition's entry replaces the same key.
// Keeps entries from the 10 most recent trading days (counting the newest of tradingDays and entry dates).
export function mergeMoversFile(existing, entries, { tradingDays = [], edition = null, now = new Date() } = {}) {
  const all = new Map();
  const old = existing && typeof existing.movers === 'object' && !Array.isArray(existing.movers) ? existing.movers : {};
  for (const [k, v] of Object.entries(old)) if (v && v.ticker && v.date) all.set(k, v);
  for (const e of entries || []) {
    const rec = { ticker: e.ticker, date: e.date, changePct: e.changePct, why: e.why, sourceName: e.sourceName, sourceUrl: e.sourceUrl, players: Array.isArray(e.players) ? [...e.players].sort() : [] };
    if (edition) rec.edition = edition;
    all.set(moverKey(rec), rec);
  }
  const days = [...new Set([...tradingDays, ...[...all.values()].map((v) => v.date)])]
    .filter(isRealIsoDate).sort().reverse().slice(0, MOVERS_FILE_DAYS);
  const keep = new Set(days);
  const movers = {};
  [...all.entries()]
    .filter(([, v]) => keep.has(v.date))
    .sort(([, a], [, b]) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Math.abs(b.changePct) - Math.abs(a.changePct)))
    .forEach(([k, v]) => { movers[k] = v; });
  return { updated: now.toISOString(), days, movers };
}
