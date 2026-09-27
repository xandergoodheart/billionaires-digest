// Billionaire Life roster: validate every data/life/<slug>.json and write data/life/index.json
// plus data/life/glossary.json (merged Academy glossary).
//
//   node scripts/build-life.mjs
//
// No network. A file that fails validation (see scripts/lib/life.mjs) is skipped with a clear console error;
// the build never crashes on one bad file, and the roster only lists files that passed.
// Optional Academy fields (school, glossary, decisions[].lesson) that fail their checks are left out of the
// index and glossary with a warning; the person stays playable.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson, writeJson } from './lib/data-common.mjs';
import { buildLifeIndex } from './lib/life.mjs';

const DIR = join(ROOT, 'data', 'life');
const OUT = join(DIR, 'index.json');
const GLOSSARY = join(DIR, 'glossary.json');
const NOT_PEOPLE = new Set(['index.json', 'glossary.json']);

export async function main() {
  let names = [];
  try { names = (await readdir(DIR)).filter((f) => f.endsWith('.json') && !NOT_PEOPLE.has(f)).sort(); }
  catch (e) { console.error(`build-life: cannot read ${DIR}: ${e.message}`); }
  const files = [];
  for (const file of names) {
    try { files.push({ file, data: JSON.parse(await readFile(join(DIR, file), 'utf8')) }); }
    catch (e) { files.push({ file, error: e.message }); }
  }
  const people = await readJson(join(ROOT, 'data', 'people', 'index.json'), { people: [] });
  const { index, skipped, warnings, glossary } = buildLifeIndex(files, people);
  for (const s of skipped) {
    console.error(`build-life: SKIPPED data/life/${s.file}`);
    for (const e of s.errors.slice(0, 20)) console.error(`  - ${e}`);
    if (s.errors.length > 20) console.error(`  … and ${s.errors.length - 20} more`);
  }
  for (const w of warnings) {
    console.warn(`build-life: WARNING data/life/${w.file} (Academy fields left out, game still playable)`);
    for (const e of w.warnings.slice(0, 20)) console.warn(`  - ${e}`);
    if (w.warnings.length > 20) console.warn(`  … and ${w.warnings.length - 20} more`);
  }
  await writeJson(OUT, index);
  await writeJson(GLOSSARY, glossary);
  console.log(`build-life: ${index.count} in roster (${index.people.map((p) => p.slug).join(', ') || 'none'}), ${skipped.length} skipped -> data/life/index.json`);
  console.log(`build-life: ${index.schools} with an Academy school, ${glossary.count} glossary terms -> data/life/glossary.json`);
  return { index, skipped, warnings, glossary };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('build-life failed:', e); process.exitCode = 1; });
}
