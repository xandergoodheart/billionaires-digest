// Billionaire Life roster: validate every data/life/<slug>.json and write data/life/index.json.
//
//   node scripts/build-life.mjs
//
// No network. A file that fails validation (see scripts/lib/life.mjs) is skipped with a clear console error;
// the build never crashes on one bad file, and the roster only lists files that passed.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson, writeJson } from './lib/data-common.mjs';
import { buildLifeIndex } from './lib/life.mjs';

const DIR = join(ROOT, 'data', 'life');
const OUT = join(DIR, 'index.json');

export async function main() {
  let names = [];
  try { names = (await readdir(DIR)).filter((f) => f.endsWith('.json') && f !== 'index.json').sort(); }
  catch (e) { console.error(`build-life: cannot read ${DIR}: ${e.message}`); }
  const files = [];
  for (const file of names) {
    try { files.push({ file, data: JSON.parse(await readFile(join(DIR, file), 'utf8')) }); }
    catch (e) { files.push({ file, error: e.message }); }
  }
  const people = await readJson(join(ROOT, 'data', 'people', 'index.json'), { people: [] });
  const { index, skipped } = buildLifeIndex(files, people);
  for (const s of skipped) {
    console.error(`build-life: SKIPPED data/life/${s.file}`);
    for (const e of s.errors.slice(0, 20)) console.error(`  - ${e}`);
    if (s.errors.length > 20) console.error(`  … and ${s.errors.length - 20} more`);
  }
  await writeJson(OUT, index);
  console.log(`build-life: ${index.count} in roster (${index.people.map((p) => p.slug).join(', ') || 'none'}), ${skipped.length} skipped -> data/life/index.json`);
  return { index, skipped };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('build-life failed:', e); process.exitCode = 1; });
}
