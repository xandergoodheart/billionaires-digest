// Refreshes top10 and top10AsOf in the published edition from data/people/index.json.
// Usage: node scripts/refresh-top10.mjs
// Updates digest.json, and archive/<today>.json (New York date) only if that file exists.
// Everything else in those files is left as is.

import { readFile, writeFile, access } from 'node:fs/promises';
import { dates, top10FromIndex, top10AsOfFromIndex } from './lib/edition.mjs';

const index = JSON.parse(await readFile('data/people/index.json', 'utf8'));
const top10 = top10FromIndex(index);
const top10AsOf = top10AsOfFromIndex(index);
if (top10.length !== 10) {
  console.error(`data/people/index.json gave ${top10.length} people, expected 10. Nothing was written.`);
  process.exit(1);
}

async function exists(f) { try { await access(f); return true; } catch { return false; } }

async function refresh(file) {
  const d = JSON.parse(await readFile(file, 'utf8'));
  d.top10 = top10;
  d.top10AsOf = top10AsOf;
  await writeFile(file, JSON.stringify(d, null, 2) + '\n');
  console.log(`Updated ${file}`);
}

const { isoDate } = dates(new Date());
await refresh('digest.json');
const archived = `archive/${isoDate}.json`;
if (await exists(archived)) await refresh(archived);
else console.log(`No ${archived}; archive left alone.`);

console.log(top10AsOf);
top10.forEach((p, i) => console.log(`  #${i + 1} ${p.name} (${p.ini}, ${p.tick}) ${p.worth}`));
