// Build-time portrait lookup (matches window.BDPortraitFor in assets/v2/portraits.js).
// portraitFor(slug or name) -> '/assets/portraits/real/<slug>.webp' when we have a painted portrait,
// else '/assets/portraits/emblem/<slug>.svg' (emblem card from scripts/build-emblems.mjs), else the grey silhouette.
// Reads assets/portraits/real/*.webp, assets/portraits/emblem/*.svg and data/people/index.json from the repo root once, on first use.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SILHOUETTE = '/assets/portraits/silhouette.webp';

// lowercase, no accents, trailing " & family" removed, single spaces, trimmed
export function normName(n) {
  return String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\s*&\s*family\s*$/, '').replace(/\s+/g, ' ').trim();
}

let cache = null;
function load() {
  if (cache) return cache;
  const slugs = new Set();
  try {
    for (const f of readdirSync(join(ROOT, 'assets/portraits/real'))) {
      const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.webp$/.exec(f);
      if (m) slugs.add(m[1]);
    }
  } catch { /* no portraits folder: everyone gets the silhouette */ }
  const emblems = new Set();
  try {
    for (const f of readdirSync(join(ROOT, 'assets/portraits/emblem'))) {
      const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.svg$/.exec(f);
      if (m) emblems.add(m[1]);
    }
  } catch { /* no emblem folder yet */ }
  const names = new Map();
  try {
    const idx = JSON.parse(readFileSync(join(ROOT, 'data/people/index.json'), 'utf8'));
    for (const p of Array.isArray(idx?.people) ? idx.people : []) {
      if (p && typeof p.slug === 'string' && typeof p.name === 'string') names.set(normName(p.name), p.slug);
    }
  } catch { /* no index: slug lookups still work */ }
  cache = { slugs, emblems, names };
  return cache;
}

export function portraitFor(nameOrSlug) {
  const { slugs, emblems, names } = load();
  const k = String(nameOrSlug ?? '');
  const s = slugs.has(k) || emblems.has(k) ? k : names.get(normName(k));
  if (s && slugs.has(s)) return `/assets/portraits/real/${s}.webp`;
  if (s && emblems.has(s)) return `/assets/portraits/emblem/${s}.svg`;
  return SILHOUETTE;
}
