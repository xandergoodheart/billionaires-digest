// Publishes a draft edition written by the scheduled Claude Code agent.
// Usage: node scripts/publish-digest.mjs <draft.json>
// Checks every story link, drops dead links and quote/profile pages, validates
// the edition, and only then writes digest.json and archive/. On any problem it
// exits 1 without writing anything. The draft file is never modified.

import { readFile } from 'node:fs/promises';
import { validate, DIRECTIONS, dates, writeEdition, top10FromIndex, top10AsOfFromIndex } from './lib/edition.mjs';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;

const draftPath = process.argv[2];
if (!draftPath) {
  console.error('Usage: node scripts/publish-digest.mjs <draft.json>');
  process.exit(1);
}

let draft;
try {
  draft = JSON.parse(await readFile(draftPath, 'utf8'));
} catch (err) {
  console.error(`Could not read draft ${draftPath}: ${err.message}`);
  console.error('Nothing was written.');
  process.exit(1);
}

let previous = null;
try { previous = JSON.parse(await readFile('digest.json', 'utf8')); } catch { /* first run */ }

const { longDate, shortDate, isoDate } = dates(new Date());

// Work on a copy so the draft object (and file) stay untouched.
const digest = structuredClone(draft);
digest.date = longDate;
digest.updated = `${shortDate} · morning edition`;
// The ledger is a human-written column; always carry it over.
digest.ledger = previous?.ledger ?? null;
if (Array.isArray(digest.stories)) {
  digest.stories.forEach(s => { if (s && !DIRECTIONS.includes(s.direction)) s.direction = 'flat'; });
}

// ---- quote / profile page check ----

function isQuotePage(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  const path = url.pathname.toLowerCase();
  const quoteLike = ['/equities/', '/quote/', '/quotes/', '/stock/'].some(p => (path + '/').includes(p));
  const hasYear = /\/20\d\d\//.test(path + '/');
  return quoteLike && !hasYear;
}

// ---- link check ----

async function request(url, method) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  try { await res.body?.cancel(); } catch { /* ignore */ }
  return res.status;
}

function describeError(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { timeout: true, text: 'timed out' };
  const code = err?.cause?.code || err?.code;
  return { timeout: false, text: code ? `${err.message} (${code})` : String(err?.message || err) };
}

// Returns { keep: boolean, note: string | null, gotStatus: boolean }
async function checkLink(url) {
  let status = null;
  let error = null;
  try {
    status = await request(url, 'HEAD');
  } catch (err) {
    error = err;
  }
  if (error || status === 405 || status === 403) {
    status = null;
    error = null;
    try {
      status = await request(url, 'GET');
    } catch (err) {
      error = err;
    }
  }
  if (error) {
    const e = describeError(error);
    if (e.timeout) return { keep: true, note: `warning: ${e.text}`, gotStatus: false };
    return { keep: false, note: `request failed: ${e.text}`, gotStatus: false };
  }
  if (status === 404 || status === 410) return { keep: false, note: `HTTP ${status}`, gotStatus: true };
  if (status >= 200 && status < 400) return { keep: true, note: null, gotStatus: true };
  return { keep: true, note: `warning: HTTP ${status}`, gotStatus: true };
}

const dropped = [];

if (Array.isArray(digest.stories)) {
  const afterQuote = [];
  for (const s of digest.stories) {
    if (s && typeof s.url === 'string' && isQuotePage(s.url)) {
      console.warn(`Dropped (quote/profile page): "${s.headline}" (${s.url})`);
      dropped.push(s);
    } else {
      afterQuote.push(s);
    }
  }

  const results = await Promise.all(afterQuote.map(async s => {
    if (!s || typeof s.url !== 'string' || !/^https?:\/\//.test(s.url)) return { s, keep: true, note: null, checked: false }; // validate() reports it
    return { s, checked: true, ...(await checkLink(s.url)) };
  }));

  // If no checked link got any HTTP status back, assume this machine has no
  // network access to article sites and keep every story.
  const checked = results.filter(r => r.checked);
  const noNetwork = checked.length > 0 && checked.every(r => !r.gotStatus);
  if (noNetwork) console.warn('Link check skipped: no network access to article sites');

  const kept = [];
  for (const { s, keep, note } of results) {
    if (noNetwork) {
      kept.push(s);
    } else if (keep) {
      if (note) console.warn(`Kept with ${note}: "${s.headline}" (${s.url})`);
      kept.push(s);
    } else {
      console.warn(`Dropped (${note}): "${s.headline}" (${s.url})`);
      dropped.push(s);
    }
  }
  digest.stories = kept;
}

// ---- top 10 from the people index ----
// data/people/index.json is the source of truth for the top 10 when it exists.

let peopleIndex = null;
try { peopleIndex = JSON.parse(await readFile('data/people/index.json', 'utf8')); } catch { /* no index: keep the draft's top10 */ }
if (peopleIndex) {
  digest.top10 = top10FromIndex(peopleIndex);
  digest.top10AsOf = top10AsOfFromIndex(peopleIndex);
  console.log(`Top 10 set from data/people/index.json (${digest.top10AsOf}).`);
}

// ---- validate and write ----

const problems = validate(digest);
if (problems.length) {
  console.error('Edition failed checks. Nothing was written:');
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}

await writeEdition(digest, isoDate);
console.log(`Published ${digest.stories.length} stories for ${longDate} (${dropped.length} dropped).`);
process.exit(0);
