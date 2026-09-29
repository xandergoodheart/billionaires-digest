// Renders the static share cards (prototype pages) in the casino style.
// Usage: node scripts/render-static-og.mjs
// Writes og/casino-looks.png and og/v2-preview.png. Does not touch index.html.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCardOg } from './lib/og.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CARDS = [
  { file: 'casino-looks.png', kicker: 'PROTOTYPE', title: '5 CASINO LOOKS',
    subtitle: 'The Billionaires Digest game: arcade, VIP room, Vegas neon, fruit machine, mobile slots · play money' },
  { file: 'v2-preview.png', kicker: 'PROTOTYPE', title: 'BILLIONAIRES DIGEST',
    subtitle: 'Play the billionaires. Learn how they think. Follow the money.' }
];

try {
  await mkdir(path.join(ROOT, 'og'), { recursive: true });
  for (const c of CARDS) {
    const png = await renderCardOg(c);
    await writeFile(path.join(ROOT, 'og', c.file), png);
    console.log(`Wrote og/${c.file} (${png.length} bytes).`);
  }
} catch (err) {
  console.error(`Static OG render failed: ${err.stack || err.message}`);
  process.exit(1);
}
