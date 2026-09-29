// Offline: add/refresh coveredValue and coverage in data/prices/networth-est.json
// from data/prices/latest.json and data/people/index.json. No network calls.
// Does not re-run the estimator: share parsing and wealth overrides apply on the next fetch-prices run.
//
//   node scripts/recompute-est.mjs

import { join } from 'node:path';
import { ROOT, MIN_COVERAGE, methodText, loadWealthOverrides, addCoverage, worthBySlug, readJson, writeJson } from './lib/data-common.mjs';

const EST = join(ROOT, 'data', 'prices', 'networth-est.json');

const est = await readJson(EST);
const latest = await readJson(join(ROOT, 'data', 'prices', 'latest.json'));
const worths = worthBySlug(await readJson(join(ROOT, 'data', 'people', 'index.json')));

const people = addCoverage(est.people ?? {}, latest.quotes ?? {}, worths);
const { generated, excluded, skipped } = est;
await writeJson(EST, { generated, method: methodText(await loadWealthOverrides()), minCoverage: MIN_COVERAGE, people, excluded, skipped });

for (const [slug, p] of Object.entries(people)) {
  const pass = typeof p.coverage === 'number' && p.coverage >= MIN_COVERAGE;
  console.log(`${pass ? 'show' : 'hide'}  ${slug}  coverage=${p.coverage}`);
}
