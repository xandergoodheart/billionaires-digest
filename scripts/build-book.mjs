// The Book: play-money odds for the next fantasy week (coins only; no purchases, no cash-out, no prizes).
//
//   node scripts/build-book.mjs [--week=2026-W40] [--now=2026-09-25T12:00:00Z] [--force]
//
// Reads data/fantasy/weeks/<week>.json, data/prices/history/*.json, data/filings/latest.json and archive/<date>.json.
// Writes data/book/<week>.json and data/book/index.json. Default week: the next week to lock (the draft week).
// Practice weeks get no book. A book whose week has locked is never rewritten (odds are live online) unless --force.
// Same inputs -> same bytes: the simulation is seeded by the week id, and "generated" comes from the input files.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson, writeJson } from './lib/data-common.mjs';
import { core, storyMatches } from './lib/fantasy.mjs';
import { buildBook } from './lib/book/pricing.mjs';

const OUT = join(ROOT, 'data', 'book');
const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const flag = (name) => process.argv.includes(`--${name}`);

async function listJson(dir) {
  try { return (await readdir(dir)).filter((f) => f.endsWith('.json')).sort(); } catch { return []; }
}

export async function loadHistory() {
  const dir = join(ROOT, 'data', 'prices', 'history');
  const out = {};
  for (const f of await listJson(dir)) {
    const rows = await readJson(join(dir, f), null);
    if (Array.isArray(rows)) out[f.slice(0, -5)] = rows;
  }
  return out;
}

async function writeIndex() {
  const weeks = [];
  for (const f of await listJson(OUT)) {
    if (f === 'index.json') continue;
    const b = await readJson(join(OUT, f), null);
    if (b && b.week) weeks.push({ week: b.week, start: b.start, end: b.end, locksAt: b.locksAt, events: (b.events || []).length });
  }
  weeks.sort((a, b) => a.week.localeCompare(b.week));
  await writeJson(join(OUT, 'index.json'), { latest: weeks.length ? weeks[weeks.length - 1].week : null, weeks });
}

async function main() {
  const nowArg = arg('now');
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  if (!Number.isFinite(now)) throw new Error(`bad --now: ${nowArg}`);
  const id = arg('week') || core.draftWeek(now);
  if (!/^\d{4}-W\d{2}$/.test(id)) throw new Error(`bad --week: ${id}`);

  const week = await readJson(join(ROOT, 'data', 'fantasy', 'weeks', `${id}.json`), null);
  if (!week) { console.log(`No fantasy week file for ${id}: no book.`); await writeIndex(); return 0; }
  if (week.practice || core.isPractice(id)) { console.log(`${id} is a practice week: no book.`); await writeIndex(); return 0; }
  const path = join(OUT, `${id}.json`);
  const existing = await readJson(path, null);
  if (existing && now >= Date.parse(week.locksAt) && !flag('force')) {
    console.log(`${id} locked at ${week.locksAt}: book left as is.`);
    await writeIndex();
    return 0;
  }

  const filingsDoc = await readJson(join(ROOT, 'data', 'filings', 'latest.json'), { filings: [] });
  const editionIds = ((await readJson(join(ROOT, 'archive', 'index.json'), { editions: [] })).editions ?? [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < week.start).sort().slice(-20);
  const editions = [];
  for (const d of editionIds) {
    const ed = await readJson(join(ROOT, 'archive', `${d}.json`), null);
    editions.push({ date: d, stories: Array.isArray(ed?.stories) ? ed.stories : [] });
  }
  const history = await loadHistory();
  const stamps = [filingsDoc.generated, week.createdAt].filter((x) => x && Number.isFinite(Date.parse(x))).map((x) => new Date(x).toISOString()).sort();
  const generated = stamps.length ? stamps[stamps.length - 1] : new Date(Date.parse(week.locksAt)).toISOString();

  const book = buildBook({ week, history, editions, filings: filingsDoc.filings ?? [], storyMatches, generated });
  await writeJson(path, book);
  await writeIndex();
  const count = (t) => book.events.filter((e) => e.type === t).length;
  console.log(`Book ${id}: ${book.events.length} events (${count('h2h')} matchups, ${count('player_ou')} player ladders, ` +
    `${count('futures_top')} futures, ${count('prop_insider')} insider props, ${count('prop_sector')} sector prop); ` +
    `${book.events.reduce((n, e) => n + e.selections.length, 0)} selections; locks ${book.locksAt}.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
