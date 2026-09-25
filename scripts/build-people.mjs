#!/usr/bin/env node
// Builds data/people/index.json and data/people/<slug>.json from research files.
// Usage: node scripts/build-people.mjs <researchDir> <top100.json>
//
// - top100.json is authoritative for rank, name, worth, source and asOf.
// - Reads every *.json under <researchDir>, recursively (all subfolders), except top100.json.
//   Each file is a person object, an array of person objects, or { people: [...] }.
//   Files with no person objects are ignored.
// - Every entry needs an http(s) source. Real-estate entries have street addresses scrubbed.
// - Duplicate entries merge into one: real estate by area + type + date, other categories by
//   label (name / what / area). A merged entry keeps `source` (the first) and gains `sources: [...]`.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const CATEGORIES = ['controls', 'stakes', 'vehicles', 'privateDeals', 'realEstate', 'trophies', 'policy', 'giving', 'watch'];
const ADDRESS_RE = /\b\d{1,5}\s+[A-Z][\w.'-]*(\s+[A-Z][\w.'-]*)*\s+(Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Place|Pl|Court|Ct|Terrace|Circle|Highway|Hwy|Parkway|Pkwy)\b/i;
const ADDRESS_RE_G = new RegExp(ADDRESS_RE.source, 'gi');
const BUILDING_RE = /\b(tower|towers|building|house|residences?|plaza|hotel|apartments?|mansion|estate|penthouse|co-?op|condo(minium)?s?)\b/i;

const OUT_DIR = path.join('data', 'people');

function norm(x) {
  return String(x == null ? '' : x)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function slugOf(name) { return norm(name).replace(/ /g, '-'); }
const isUrl = u => typeof u === 'string' && /^https?:\/\//i.test(u.trim());

const log = { scrubbed: [], dropped: [], unmatched: [], files: [], merged: 0 };

// ---------- read inputs ----------
async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function jsonFilesIn(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const d of entries) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...await jsonFilesIn(full));
    else if (d.isFile() && d.name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}

// A person object has a name and at least one research field.
function isPerson(p) {
  return !!p && typeof p === 'object' && !Array.isArray(p) &&
    typeof p.name === 'string' && p.name.trim() !== '' &&
    (Array.isArray(p.aliases) || typeof p.secPersonCik === 'string' || typeof p.gaps === 'string' ||
      CATEGORIES.some(c => Array.isArray(p[c])));
}

function extractPeople(data) {
  let list = [];
  if (Array.isArray(data)) list = data;
  else if (data && Array.isArray(data.people)) list = data.people;
  else if (data && typeof data === 'object') list = [data];
  return list.filter(isPerson);
}

// ---------- cleaning ----------
function cleanValue(v) {
  if (typeof v === 'string') { const t = v.trim(); return t ? t : undefined; }
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) {
    const out = v.map(cleanValue).filter(x => x !== undefined);
    return out.length ? out : undefined;
  }
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const c = cleanValue(val);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v; // numbers, booleans
}

function tidy(s) {
  return s
    .replace(/\(\s*[,;·-]?\s*/g, '(')
    .replace(/\s*[,;·-]?\s*\)/g, ')')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;·-]+|[\s,;·-]+$/g, '')
    .trim();
}

// Returns the scrubbed entry, or null to drop it.
function scrubRealEstate(entry, who) {
  const e = { ...entry };
  for (const [k, v] of Object.entries(e)) {
    if (typeof v !== 'string' || !ADDRESS_RE.test(v)) continue;
    const before = v;
    if (k === 'area') {
      // City/neighborhood candidates: comma-separated parts that are not the address itself.
      const parts = before.split(',').map(s => s.trim()).filter(Boolean);
      const places = parts.filter(p => !ADDRESS_RE.test(p));
      let after = tidy(before.replace(ADDRESS_RE_G, ''));
      const firstPart = tidy(after.split(',')[0] || '');
      const looksBuilding = !after || !/[a-z]/i.test(after) ||
        (!after.includes(',') && after.split(/\s+/).length <= 4 && BUILDING_RE.test(after)) ||
        (firstPart && BUILDING_RE.test(firstPart) && firstPart.split(/\s+/).length <= 2);
      if (looksBuilding) {
        const fallback = tidy(places.join(', '));
        if (!fallback) {
          log.dropped.push(`${who} · realEstate: "${before}" (address with no city/neighborhood)`);
          return null;
        }
        after = fallback;
      }
      e[k] = after;
      log.scrubbed.push(`${who} · realEstate.${k}: "${before}" -> "${after}"`);
    } else {
      const after = tidy(before.replace(ADDRESS_RE_G, ''));
      if (after) e[k] = after; else delete e[k];
      log.scrubbed.push(`${who} · realEstate.${k}: "${before}" -> "${after || '(removed)'}"`);
    }
  }
  if (!e.area) {
    log.dropped.push(`${who} · realEstate: entry left without an area after scrub`);
    return null;
  }
  return e;
}

function entryKey(c, e) {
  if (c === 'realEstate') return [e.area, e.type, e.date].map(norm).join('|');
  const label = e.name || e.what || e.area;
  return label ? norm(label) : JSON.stringify(e);
}

// Adds e's source to an already-kept duplicate.
function mergeSource(kept, e) {
  const list = Array.isArray(kept.sources) ? kept.sources : [kept.source];
  const src = e.source.trim();
  if (!list.some(u => u.trim() === src)) list.push(src);
  if (list.length > 1) kept.sources = list;
}

// ---------- main ----------
async function main() {
  const [researchDir, top100Path] = process.argv.slice(2);
  if (!researchDir || !top100Path) {
    console.error('Usage: node scripts/build-people.mjs <researchDir> <top100.json>');
    process.exit(1);
  }
  const top = await readJson(top100Path);
  const topPeople = Array.isArray(top.people) ? top.people : [];
  if (!topPeople.length) throw new Error('top100.json has no people');

  // Unique slugs, in rank order.
  const used = new Set();
  const roster = topPeople.map(p => {
    let base = slugOf(p.name) || 'person';
    let s = base, n = 2;
    while (used.has(s)) s = `${base}-${n++}`;
    used.add(s);
    return { rank: p.rank, name: p.name, slug: s, worth: p.worth, source: p.source };
  });

  // Name lookup (names + aliases from research).
  const byNorm = new Map();
  roster.forEach(r => byNorm.set(norm(r.name), r));

  const top100Abs = path.resolve(top100Path);
  const files = (await jsonFilesIn(researchDir))
    .filter(f => path.resolve(f) !== top100Abs);

  const merged = new Map(); // slug -> merged research
  for (const file of files) {
    let data;
    try { data = await readJson(file); } catch (err) {
      console.warn(`skip ${file}: ${err.message}`);
      continue;
    }
    const people = extractPeople(data);
    if (!people.length) { log.files.push(`${path.relative(researchDir, file)}: no person objects, ignored`); continue; }
    let used = 0;
    for (const p of people) {
      const names = [p.name, ...(Array.isArray(p.aliases) ? p.aliases : [])];
      let r = null;
      for (const nm of names) { r = byNorm.get(norm(nm)); if (r) break; }
      if (!r) { log.unmatched.push(`${p.name} (${path.basename(file)})`); continue; }
      used++;
      let m = merged.get(r.slug);
      if (!m) {
        m = { aliases: [], secPersonCik: undefined, gaps: [], seen: {} };
        CATEGORIES.forEach(c => { m[c] = []; m.seen[c] = new Map(); });
        merged.set(r.slug, m);
      }
      (Array.isArray(p.aliases) ? p.aliases : []).forEach(a => {
        const t = typeof a === 'string' ? a.trim() : '';
        if (t && !m.aliases.some(x => norm(x) === norm(t))) m.aliases.push(t);
      });
      if (m.secPersonCik === undefined && typeof p.secPersonCik === 'string' && p.secPersonCik.trim()) m.secPersonCik = p.secPersonCik.trim();
      if (typeof p.gaps === 'string' && p.gaps.trim() && !m.gaps.includes(p.gaps.trim())) m.gaps.push(p.gaps.trim());
      for (const c of CATEGORIES) {
        for (const raw of Array.isArray(p[c]) ? p[c] : []) {
          if (!raw || typeof raw !== 'object') continue;
          let e = cleanValue(raw);
          if (!e) continue;
          if (!isUrl(e.source)) {
            log.dropped.push(`${r.name} · ${c}: "${e.name || e.what || e.area || '?'}" (no http(s) source)`);
            continue;
          }
          if (c === 'realEstate') {
            e = scrubRealEstate(e, r.name);
            if (!e) continue;
          }
          const k = entryKey(c, e);
          const kept = m.seen[c].get(k);
          if (kept) { mergeSource(kept, e); log.merged++; continue; }
          m.seen[c].set(k, e);
          m[c].push(e);
        }
      }
    }
    log.files.push(`${path.relative(researchDir, file)}: ${used} matched`);
  }

  // Write output.
  await mkdir(OUT_DIR, { recursive: true });
  const asOf = top.asOf;
  const keep = new Set(['index.json']);
  const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const index = {
    source: top.source,
    sourceUrl: top.sourceUrl,
    asOf,
    people: roster.map(r => ({ rank: r.rank, name: r.name, slug: r.slug, worth: r.worth, source: r.source, hasProfile: merged.has(r.slug) })),
  };

  for (const r of roster) {
    const m = merged.get(r.slug);
    if (!m) continue;
    const out = { rank: r.rank, name: r.name, slug: r.slug, worth: r.worth, source: r.source, asOf };
    if (m.aliases.length) out.aliases = m.aliases;
    if (m.secPersonCik) out.secPersonCik = m.secPersonCik;
    for (const c of CATEGORIES) {
      if (m[c].length) { out[c] = m[c]; counts[c] += m[c].length; }
    }
    if (m.gaps.length) out.gaps = m.gaps.join(' ');
    const clean = cleanValue(out);
    await writeFile(path.join(OUT_DIR, `${r.slug}.json`), JSON.stringify(clean, null, 2) + '\n');
    keep.add(`${r.slug}.json`);
  }
  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  // Remove stale profile files (only inside data/people/).
  const removed = [];
  for (const f of await readdir(OUT_DIR)) {
    if (f.endsWith('.json') && !keep.has(f)) { await unlink(path.join(OUT_DIR, f)); removed.push(f); }
  }

  // Summary.
  console.log(`Files read (${files.length}):`);
  log.files.forEach(x => console.log('  ' + x));
  console.log(`\nPeople in index: ${roster.length}`);
  console.log(`People with profiles: ${merged.size}`);
  console.log(`  ${roster.filter(r => merged.has(r.slug)).map(r => '#' + r.rank + ' ' + r.name).join(', ')}`);
  console.log('\nEntries per category:');
  CATEGORIES.forEach(c => console.log(`  ${c.padEnd(13)} ${counts[c]}`));
  const multi = [...merged.values()].reduce((n, m) => n + CATEGORIES.reduce((k, c) => k + m[c].filter(e => e.sources).length, 0), 0);
  console.log(`\nDuplicates merged: ${log.merged} (entries now carrying 2+ sources: ${multi})`);
  console.log(`\nScrubbed (${log.scrubbed.length}):`);
  log.scrubbed.forEach(x => console.log('  ' + x));
  console.log(`Dropped (${log.dropped.length}):`);
  log.dropped.forEach(x => console.log('  ' + x));
  if (log.unmatched.length) {
    console.log(`Unmatched people (${log.unmatched.length}):`);
    log.unmatched.forEach(x => console.log('  ' + x));
  }
  if (removed.length) console.log(`Removed stale files: ${removed.join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
