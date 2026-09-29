// node --test scripts/lib/
// data/ceos/index.json: big-company CEOs in the fantasy game (not on the top-100 billionaire list).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './data-common.mjs';

const readJson = async (rel) => JSON.parse(await readFile(join(ROOT, rel), 'utf8'));

// the site's sector list, from assets/common.js (the browser code is the source of truth)
async function siteSectors() {
  const src = await readFile(join(ROOT, 'assets', 'common.js'), 'utf8');
  const m = /var SECTORS = (\[[^\]]*\]);/.exec(src);
  assert.ok(m, 'SECTORS list found in assets/common.js');
  return JSON.parse(m[1].replace(/'/g, '"'));
}

test('data/ceos/index.json: shape, required fields, https sources, known sectors, unique slugs', async () => {
  const file = await readJson('data/ceos/index.json');
  assert.match(file.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof file.note, 'string');
  assert.ok(Array.isArray(file.people) && file.people.length > 0);
  const sectors = await siteSectors();
  const people = await readJson('data/people/index.json');
  const billionaireSlugs = new Set(people.people.map((p) => p.slug));
  const seen = new Set();
  for (const p of file.people) {
    const who = p.slug || JSON.stringify(p).slice(0, 40);
    assert.match(p.slug, /^[a-z0-9][a-z0-9-]*$/, `${who}: slug`);
    assert.ok(!seen.has(p.slug), `duplicate slug ${p.slug}`);
    seen.add(p.slug);
    assert.ok(!billionaireSlugs.has(p.slug), `${p.slug} clashes with data/people`);
    assert.equal(p.type, 'ceo', `${who}: type`);
    for (const k of ['name', 'company', 'ticker', 'exchange', 'role', 'sector', 'bio']) {
      assert.equal(typeof p[k], 'string', `${who}: ${k}`);
      assert.ok(p[k].trim().length > 0, `${who}: empty ${k}`);
    }
    assert.match(p.ticker, /^[A-Z][A-Z.]{0,5}$/, `${who}: ticker`);
    assert.ok(Number.isInteger(p.roleSince) && p.roleSince >= 1950 && p.roleSince <= 2100, `${who}: roleSince`);
    assert.ok(sectors.includes(p.sector), `${who}: sector "${p.sector}" not in the site's sector list`);
    if (p.secCik != null) assert.match(p.secCik, /^\d{10}$/, `${who}: secCik`);
    assert.ok(Array.isArray(p.sources) && p.sources.length > 0, `${who}: sources`);
    for (const s of p.sources) {
      assert.equal(typeof s.title, 'string', `${who}: source title`);
      assert.match(s.url, /^https:\/\//, `${who}: source url must be https`);
      assert.match(s.date, /^\d{4}-\d{2}(-\d{2})?$/, `${who}: source date (YYYY-MM or YYYY-MM-DD)`);
    }
  }
});
