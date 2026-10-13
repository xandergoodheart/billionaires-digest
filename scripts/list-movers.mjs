// Lists the biggest daily moves among draftable players' main holdings, for the "Why they moved" step in EDITION.md.
// Usage: node scripts/list-movers.mjs [--json]
// Reads the latest scored day in data/fantasy/days/ (or the one before it when the latest is today's partial day)
// and its week file. Local data only: no network, nothing is written.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dates } from './lib/edition.mjs';
import { pickMoverDate, listMovers } from './lib/movers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DAYS = join(ROOT, 'data', 'fantasy', 'days');
const WEEKS = join(ROOT, 'data', 'fantasy', 'weeks');

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

const asJson = process.argv.includes('--json');

let files = [];
try { files = await readdir(DAYS); } catch { /* no day files */ }
const dayDates = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10));
const date = pickMoverDate(dayDates, dates(new Date()).isoDate);

if (!date) {
  if (asJson) console.log('[]');
  else console.log('No scored trading day found in data/fantasy/days/. Skip "Why they moved".');
  process.exit(0);
}

const day = await readJson(join(DAYS, `${date}.json`));
const week = day?.week ? await readJson(join(WEEKS, `${day.week}.json`)) : null;
const movers = listMovers(day, week);

if (asJson) {
  console.log(JSON.stringify(movers, null, 2));
} else {
  console.log(`Biggest moves on ${date} (close to close), draftable players' main holdings:`);
  if (!movers.length) console.log('(none)');
  for (const m of movers) {
    const flag = Math.abs(m.changePct) >= 2 ? '' : '   (under 2%: skip)';
    console.log(`${m.ticker}  ${m.company}  date=${m.date}  changePct=${m.changePct}  players=${m.players.join(',')}${flag}`);
  }
  console.log('Copy ticker, date and changePct exactly into digest "movers" entries.');
}
