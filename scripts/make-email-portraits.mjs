#!/usr/bin/env node
// Makes the small JPG portrait copies used by The Billionaire Brief email (many mail apps do not show .webp).
//
//   node scripts/make-email-portraits.mjs           convert portraits that have no email copy yet (or a newer source)
//   node scripts/make-email-portraits.mjs --all     re-make every copy
//
// MANUAL, macOS-ONLY step: run it on a Mac whenever painted portraits are added or changed, then commit the JPGs in
// assets/portraits/email/. It uses two tools found on this Mac: `dwebp` (Homebrew package "webp") to decode the .webp
// and `sips` (built into macOS) to make a square 480x480 JPG at quality 78
// (shown at smaller sizes, so they stay sharp on high-density phone screens and in Face of the day). The daily workflows never run it.
// Sources: every painted portrait the site uses (assets/v2/portraits.js .webp entries, plus plain
// assets/portraits/<slug>.webp files). SVG emblem cards and the silhouette are never converted.
import { mkdir, stat, rm, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPaintedPortraits, EMAIL_DIR } from './lib/brief-portraits.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 480;
const QUALITY = 78;

async function mtime(p) { try { return (await stat(p)).mtimeMs; } catch { return 0; } }

async function main() {
  const all = process.argv.includes('--all');
  for (const tool of ['dwebp', 'sips']) {
    try { execFileSync('which', [tool], { stdio: 'ignore' }); }
    catch { throw new Error(`${tool} not found. This is a macOS step: install webp with Homebrew (brew install webp); sips ships with macOS.`); }
  }
  const outDir = join(ROOT, EMAIL_DIR);
  await mkdir(outDir, { recursive: true });
  const tmp = await mkdtemp(join(tmpdir(), 'bd-email-portraits-'));
  let made = 0, kept = 0;
  try {
    for (const { slug, file } of await listPaintedPortraits(ROOT)) {
      const src = join(ROOT, file);
      const dest = join(outDir, `${slug}.jpg`);
      if (!all && (await mtime(dest)) >= (await mtime(src))) { kept++; continue; }
      const png = join(tmp, `${slug}.png`);
      execFileSync('dwebp', ['-quiet', src, '-o', png]);
      // -z resamples to exactly SIZE x SIZE (the portraits are square already)
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY), '-z', String(SIZE), String(SIZE), png, '--out', dest], { stdio: 'ignore' });
      made++;
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  console.log(`Email portraits: ${made} made, ${kept} already up to date, in ${EMAIL_DIR}/`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
