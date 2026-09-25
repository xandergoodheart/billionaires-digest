// Renders the Open Graph image for the current digest.json by hand.
// Usage: node scripts/render-og.mjs
// Writes og/<YYYY-MM-DD>.png and og/latest.png and points index.html's og:image and
// twitter:image meta tags at the dated file. The date comes from digest.json's "date".

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishOg } from './lib/og.mjs';
import { dates } from './lib/edition.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// "Thursday, September 24, 2026" -> "2026-09-24"
function isoFromLong(s) {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(String(s || ''));
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

let digest;
try {
  digest = JSON.parse(await readFile(path.join(ROOT, 'digest.json'), 'utf8'));
} catch (err) {
  console.error(`Could not read digest.json: ${err.message}`);
  process.exit(1);
}

const isoDate = isoFromLong(digest.date) || dates(new Date()).isoDate;
try {
  const r = await publishOg(digest, isoDate, ROOT);
  console.log(`Wrote ${path.relative(ROOT, r.dated)} and ${path.relative(ROOT, r.latest)} (${r.bytes} bytes).`);
  console.log(r.metaChanged ? 'Updated og:image / twitter:image in index.html.' : 'index.html meta tags already up to date.');
} catch (err) {
  console.error(`OG image failed: ${err.stack || err.message}`);
  process.exit(1);
}
