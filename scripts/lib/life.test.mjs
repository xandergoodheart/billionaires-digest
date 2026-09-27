// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLife, buildLifeIndex, rosterEntry, yearOf, isHttpsUrl, CATEGORIES } from './life.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const huang = JSON.parse(readFileSync(join(ROOT, 'data', 'life', 'jensen-huang.json'), 'utf8'));
const bad = JSON.parse(readFileSync(join(HERE, 'fixtures', 'life', 'bad-person.json'), 'utf8'));
const people = { people: [
  { rank: 1, name: 'Elon Musk', slug: 'elon-musk', sector: 'Aerospace' },
  { rank: 7, name: 'Jensen Huang', slug: 'jensen-huang', sector: 'AI & tech' }
] };
const slugs = new Set(people.people.map((p) => p.slug));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('the Jensen Huang file passes and has a category on every decision', () => {
  const v = validateLife(huang, { slug: 'jensen-huang', peopleSlugs: slugs });
  assert.deepEqual(v.errors, []);
  assert.ok(v.ok);
  for (const d of huang.decisions) assert.ok(CATEGORIES.includes(d.category), d.id);
});

test('bad fixture: every problem is reported', () => {
  const v = validateLife(bad, { slug: 'bad-person', peopleSlugs: slugs });
  assert.equal(v.ok, false);
  const all = v.errors.join('\n');
  for (const needle of [
    'checked must be YYYY-MM-DD',
    'person.role missing',
    'does not match the filename "bad-person.json"',
    'is not in data/people/index.json',
    'year must be a 4-digit year',
    'category "gossip"',
    'needs exactly 3 options',
    'needs exactly one real option (found 2)',
    'url must be an https URL',
    'duplicate id',
    'needs exactly one real option (found 0)',
    'needs at least one source',
    'person.role: empty string'
  ]) assert.ok(all.includes(needle), `expected error containing: ${needle}\n--- got ---\n${all}`);
});

test('empty strings are rejected except source dates', () => {
  const d = clone(huang);
  d.decisions[0].sources[0].date = '';
  assert.ok(validateLife(d, { slug: 'jensen-huang', peopleSlugs: slugs }).ok);
  d.decisions[0].options[0].label = '  ';
  const v = validateLife(d, { slug: 'jensen-huang', peopleSlugs: slugs });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('label')));
  const e2 = clone(huang); e2.note = '';
  assert.ok(validateLife(e2, { slug: 'jensen-huang' }).errors.includes('note: empty string'));
});

test('options: exactly three, exactly one real, real must be boolean', () => {
  const d = clone(huang);
  d.decisions[1].options.push({ id: 'x', label: 'Fourth', real: false });
  assert.ok(validateLife(d, { slug: 'jensen-huang' }).errors.some((e) => e.includes('exactly 3 options')));
  const r = clone(huang);
  r.decisions[1].options[0].real = 'yes';
  assert.ok(validateLife(r, { slug: 'jensen-huang' }).errors.some((e) => e.includes('real must be true or false')));
});

test('year: numeric string or number', () => {
  assert.equal(yearOf('1993'), 1993);
  assert.equal(yearOf(2006), 2006);
  assert.equal(yearOf('93'), null);
  assert.equal(yearOf('2006-01'), null);
  assert.equal(yearOf(20.5), null);
  const d = clone(huang); d.decisions[0].year = 1993;
  assert.ok(validateLife(d, { slug: 'jensen-huang' }).ok);
});

test('isHttpsUrl', () => {
  assert.ok(isHttpsUrl('https://www.sec.gov/x'));
  assert.ok(!isHttpsUrl('http://www.sec.gov/x'));
  assert.ok(!isHttpsUrl('javascript:alert(1)'));
  assert.ok(!isHttpsUrl('https://bad url'));
  assert.ok(!isHttpsUrl(''));
});

test('not an object / missing blocks do not throw', () => {
  assert.equal(validateLife(null).ok, false);
  assert.equal(validateLife([]).ok, false);
  const v = validateLife({}, { slug: 'x' });
  assert.ok(v.errors.includes('person block missing'));
  assert.ok(v.errors.includes('decisions must be a non-empty list'));
});

test('rosterEntry: sector from the people index, years span, count', () => {
  const r = rosterEntry(huang, new Map(people.people.map((p) => [p.slug, p])));
  assert.deepEqual(r, {
    slug: 'jensen-huang', name: 'Jensen Huang', role: 'Co-founder and CEO of NVIDIA', initials: 'JH',
    sector: 'AI & tech', decisions: 5, years: { from: 1993, to: 2022 }, checked: '2026-09-27'
  });
});

test('buildLifeIndex: skips bad and unreadable files, keeps good ones in people-index order', () => {
  const musk = clone(huang);
  musk.person.slug = 'elon-musk'; musk.person.name = 'Elon Musk'; musk.person.initials = 'EM';
  const { index, skipped } = buildLifeIndex([
    { file: 'bad-person.json', data: bad },
    { file: 'broken.json', error: 'Unexpected token } in JSON' },
    { file: 'jensen-huang.json', data: huang },
    { file: 'elon-musk.json', data: musk }
  ], people);
  assert.deepEqual(index.people.map((p) => p.slug), ['elon-musk', 'jensen-huang']);
  assert.equal(index.count, 2);
  assert.equal(index.updated, '2026-09-27');
  assert.equal(index.people[0].sector, 'Aerospace');
  assert.deepEqual(skipped.map((s) => s.file), ['bad-person.json', 'broken.json']);
  assert.ok(skipped[1].errors[0].startsWith('could not read JSON'));
});

test('buildLifeIndex: empty input gives an empty roster', () => {
  const { index, skipped } = buildLifeIndex([], people);
  assert.equal(index.count, 0);
  assert.deepEqual(index.people, []);
  assert.equal(index.updated, null);
  assert.deepEqual(skipped, []);
});
