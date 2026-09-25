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
      "people": optional, array of every top-100 name the story affects (e.g. ["Larry Page", "Sergey Brin"]),
      "type": e.g. "Acquisition" | "Investment" | "Insider trade" | "IPO / Markets" | "Leadership" | "Product launch" | "Policy" | "Property" | "Divestiture",
      "tickers": e.g. "NVDA · MSFT" (or "Private"),
      "read": short opinion label, "direction": "up" | "down" | "flat",
      "headline": under 12 words,
      "move": what happened, facts only,
      "why": why it matters,
      "bear": the strongest counterargument,
      "watch": the next date or signal to watch,
      "source": publication name, "url": the article URL exactly as found in search results
  } ] (8 to 12 stories),
  "consensus": { "headline": string, "body": string, "tags": [string] } or null,
  "filings": [ { "filer": string, "form": "Form 4" | "13F" | "8-K" | "S-1" | "13D" | other, "change": string, "direction": "up" | "down" | "flat" } ],
  "watch": [string] (upcoming dates and events),
  "quickHits": [string] (one-sentence moves that didn't get a full story),
  "memo": [string] (3 short takeaways for someone running a business, not a fund),
  "ledger": null
}`;
}

export function rulesText(longDate) {
  return `- Today is ${longDate}. Use web search to find real news from the last 48 hours (extend to 7 days only if needed) about investments, acquisitions, sales, insider trades, IPOs, leadership changes and major company moves by people on the Forbes or Bloomberg billionaire lists, focusing on the top 100.
- Every story must come from a search result. Copy its URL exactly. Never invent a story, number, quote, date or URL. If you can't verify a detail, leave it out.
- Only use URLs of news articles or filings, not stock-quote or company profile pages.
- Look up the current top 10 by net worth (Forbes real-time or Bloomberg Billionaires Index) and say which source and date in top10AsOf.
- When a story is about someone in the top 10, set "who" to their name exactly as written in top10.
- Only include a consensus alert when two or more billionaires moved money the same direction in the same sector. Otherwise set it to null.
- Write plainly: short sentences, no jargon, no hype. Keep facts in "move"; put opinion only in "read", "why", "bear" and "memo".
- Do not reproduce article text. Summarize in your own words.`;
}

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

// "2026-09-24T21:15-04:00" -> "Net worths per Forbes Real-Time Billionaires as of Sep 24, 2026 9:15 PM ET"
// Uses the wall-clock date and time written in asOf (the index is stamped in New York time).
export function top10AsOfFromIndex(index) {
  const src = index?.source || 'Forbes Real-Time Billionaires';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(index?.asOf || ''));
  if (!m) return `Net worths per ${src}`;
  let when = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  if (m[4] != null) {
    const h = Number(m[4]);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    when += ` ${h12}:${m[5]} ${h < 12 ? 'AM' : 'PM'} ET`;
  }
  return `Net worths per ${src} as of ${when}`;
}

// Writes digest.json, archive/<isoDate>.json and rebuilds archive/index.json.
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
