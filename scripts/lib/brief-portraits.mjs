// Portrait index for The Billionaire Brief (reads files; the pure email builder lives in brief.mjs).
// Painted portraits only: the slug -> image map in assets/v2/portraits.js (.webp entries; SVG emblem cards are
// skipped), plus any plain assets/portraits/<slug>.webp that the map does not cover. Email copies are small JPGs in
// assets/portraits/email/<slug>.jpg, made by scripts/make-email-portraits.mjs.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { normName } from './brief.mjs';

export const EMAIL_DIR = join('assets', 'portraits', 'email');
const SLUG_RE = /^[a-z0-9-]+$/;
// plain files in assets/portraits/ that are not a person's portrait
const NOT_A_PERSON = f => f.endsWith('-dollar.webp') || f.startsWith('casino') || f === 'silhouette.webp';

// Run assets/v2/portraits.js in a sandbox and return its globals (BDPortraits, BDPortraitNames).
export async function loadPortraitsJs(root) {
  const code = await readFile(join(root, 'assets', 'v2', 'portraits.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  return { map: sandbox.BDPortraits || {}, names: sandbox.BDPortraitNames || {} };
}

// Every painted portrait the site uses: [{ slug, file }] with file = repo-relative path of the .webp.
export async function listPaintedPortraits(root) {
  const { map } = await loadPortraitsJs(root);
  const out = new Map();
  for (const [slug, v] of Object.entries(map)) {
    if (!SLUG_RE.test(slug) || !v || v.emblem || typeof v.img !== 'string' || !/\.webp$/i.test(v.img)) continue;
    const file = v.img.replace(/^\//, '');
    if (existsSync(join(root, file))) out.set(slug, file);
  }
  for (const f of await readdir(join(root, 'assets', 'portraits'))) {
    if (!f.endsWith('.webp') || NOT_A_PERSON(f)) continue;
    const slug = f.slice(0, -5);
    if (SLUG_RE.test(slug) && !out.has(slug)) out.set(slug, join('assets', 'portraits', f));
  }
  return [...out].map(([slug, file]) => ({ slug, file })).sort((a, b) => a.slug.localeCompare(b.slug));
}

async function readJson(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

// The `portraits` input for briefContent():
//   slugs    people with a painted portrait AND an email JPG (anyone else gets an initials circle)
//   names    normalised name -> slug (portraits.js name index + data/people + data/ceos)
//   profiles slugs that have a people/<slug>/ page
export async function loadPortraitIndex(root) {
  const { names: jsNames } = await loadPortraitsJs(root);
  const painted = await listPaintedPortraits(root);
  const slugs = painted.map(p => p.slug).filter(s => existsSync(join(root, EMAIL_DIR, `${s}.jpg`)));
  const names = {};
  const people = (await readJson(join(root, 'data', 'people', 'index.json')))?.people || [];
  const ceos = (await readJson(join(root, 'data', 'ceos', 'index.json')))?.people || [];
  for (const p of [...people, ...ceos]) if (p && p.name && SLUG_RE.test(p.slug || '')) names[normName(p.name)] = p.slug;
  for (const [n, s] of Object.entries(jsNames)) if (SLUG_RE.test(String(s))) names[n] = s;
  const profiles = people.filter(p => p && SLUG_RE.test(p.slug || '') && p.hasProfile !== false
    && existsSync(join(root, 'people', p.slug))).map(p => p.slug);
  return { slugs, names, profiles };
}
