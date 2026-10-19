import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPaintedPortraits, loadPortraitIndex, loadPortraitsJs, EMAIL_DIR } from './brief-portraits.mjs';

// width/height from the JPEG start-of-frame marker
function jpegSize(b) {
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('every painted portrait the site uses has a small email JPG (run scripts/make-email-portraits.mjs on a Mac)', async () => {
  const painted = await listPaintedPortraits(ROOT);
  assert.ok(painted.length >= 50, `only ${painted.length} painted portraits found`);
  const missing = painted.filter(p => !existsSync(join(ROOT, EMAIL_DIR, `${p.slug}.jpg`))).map(p => p.slug);
  assert.deepEqual(missing, []);
  for (const { slug } of painted) {
    const f = join(ROOT, EMAIL_DIR, `${slug}.jpg`);
    assert.ok(statSync(f).size < 80 * 1024, `${slug}.jpg is too big`);
    const b = readFileSync(f);
    assert.ok(b[0] === 0xff && b[1] === 0xd8, `${slug}.jpg is not a JPEG`);
    assert.deepEqual(jpegSize(b), [480, 480], `${slug}.jpg should be 480x480`);
  }
});

test('only painted .webp portraits: emblems, the silhouette and dollar/casino art are never used', async () => {
  const { map } = await loadPortraitsJs(ROOT);
  const painted = new Set((await listPaintedPortraits(ROOT)).map(p => p.slug));
  for (const [slug, v] of Object.entries(map)) if (v.emblem) assert.ok(!painted.has(slug), slug);
  for (const s of painted) assert.ok(!/silhouette|casino|-dollar$/.test(s), s);
});

test('portrait index: names resolve to slugs, slugs need an email JPG, profiles are people pages', async () => {
  const idx = await loadPortraitIndex(ROOT);
  assert.equal(idx.names['jamie dimon'], 'jamie-dimon');
  assert.equal(idx.names['rob walton'], 'rob-walton-family');
  for (const s of idx.slugs) assert.ok(existsSync(join(ROOT, EMAIL_DIR, `${s}.jpg`)), s);
  assert.ok(idx.profiles.includes('elon-musk'));
  assert.ok(!idx.profiles.includes('jamie-dimon'));   // CEOs have no people/ page
});
