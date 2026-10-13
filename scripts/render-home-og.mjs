// Renders the fixed front-page share image og/home.png (1200x630) by hand.
// Usage: node scripts/render-home-og.mjs [outfile]
// index.html's og:image / twitter:image point at https://billionairesdigest.com/og/home.png for good;
// the daily publish never touches index.html (the edition image goes to news.html instead).

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHomeOg } from './lib/og.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'og', 'home.png');

try {
  await mkdir(path.dirname(out), { recursive: true });
  const png = await renderHomeOg();
  await writeFile(out, png);
  console.log(`Wrote ${path.relative(ROOT, out) || out} (${png.length} bytes).`);
} catch (err) {
  console.error(`Home OG render failed: ${err.stack || err.message}`);
  process.exit(1);
}
