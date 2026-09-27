// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLife, validateEducation, mergeGlossary, buildLifeIndex, rosterEntry, yearOf, isHttpsUrl, CATEGORIES } from './life.mjs';

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
const acGood = JSON.parse(readFileSync(join(HERE, 'fixtures', 'life', 'academy-good.json'), 'utf8'));
const acBad = JSON.parse(readFileSync(join(HERE, 'fixtures', 'life', 'academy-bad-refs.json'), 'utf8'));
// copy of the Huang file with Academy fields laid over it (school/glossary replaced, lessons by decision id)
function withAcademy(base, overlay, school) {
  const d = clone(base);
  delete d.school; delete d.glossary;
  for (const x of d.decisions) delete x.lesson;
  if (school !== undefined) d.school = clone(school);
  else if (overlay.school) d.school = clone(overlay.school);
  if (overlay.glossary) d.glossary = clone(overlay.glossary);
  for (const x of d.decisions) if (overlay.lessons && overlay.lessons[x.id]) x.lesson = clone(overlay.lessons[x.id]);
  return d;
}

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


// ---------- Academy (optional education fields) ----------

test('Academy: no education fields -> nothing, no warnings', () => {
  const e = validateEducation(withAcademy(huang, {}, null));
  assert.equal(e.school, null);
  assert.deepEqual(e.glossary, []);
  assert.deepEqual(e.lessons, {});
  assert.deepEqual(e.warnings, []);
});

test('Academy: a good school, glossary and lessons pass and keep the game valid', () => {
  const d = withAcademy(huang, acGood);
  assert.ok(validateLife(d, { slug: 'jensen-huang', peopleSlugs: slugs }).ok);
  const e = validateEducation(d);
  assert.deepEqual(e.warnings, []);
  assert.equal(e.school.name, 'Fixture school');
  assert.deepEqual(e.school.principles.map((p) => p.id), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(Object.keys(e.lessons), ['found', 'cuda', 'dgx']);
  assert.deepEqual(e.lessons.found.terms, ['term-one']);
  assert.deepEqual(e.lessons.dgx.terms, []);
  assert.equal(e.glossary.length, 2);
});

test('Academy: bad lesson references are dropped one by one with warnings', () => {
  const d = withAcademy(huang, acBad, acGood.school);
  // empty strings inside Academy fields do not make the game invalid
  assert.ok(validateLife(d, { slug: 'jensen-huang', peopleSlugs: slugs }).ok);
  const e = validateEducation(d);
  const all = e.warnings.join('\n');
  for (const needle of [
    'glossary[1] (plain-http) dropped: source.url must be an https URL',
    'glossary[2] (Not Kebab) dropped: id must be kebab-case',
    'glossary[3] (term-one) dropped: duplicate id',
    '(found).lesson dropped: principle "delta" is not a principle id of the school',
    '(cuda).lesson dropped: term "plain-http" is not in the glossary',
    '(dgx).lesson dropped: takeaway missing'
  ]) assert.ok(all.includes(needle), `expected warning containing: ${needle}\n--- got ---\n${all}`);
  assert.deepEqual(Object.keys(e.lessons), ['arm']);
  assert.deepEqual(e.glossary.map((g) => g.id), ['term-one']);
  assert.equal(e.glossary[0].term, 'Term one');
  assert.ok(e.school);
});

test('Academy: a bad school is dropped whole, and with it every lesson', () => {
  const two = clone(acGood.school); two.principles = two.principles.slice(0, 2);
  let e = validateEducation(withAcademy(huang, acGood, two));
  assert.equal(e.school, null);
  assert.deepEqual(e.lessons, {});
  assert.ok(e.warnings.some((w) => w.includes('school dropped: needs 3-4 principles')));
  assert.ok(e.warnings.some((w) => w.includes('no valid school')));
  const five = clone(acGood.school);
  five.principles.push({ ...five.principles[0], id: 'd' }, { ...five.principles[0], id: 'e' });
  assert.equal(validateEducation(withAcademy(huang, acGood, five)).school, null);
  const nosrc = clone(acGood.school); nosrc.principles[1].sources = [];
  e = validateEducation(withAcademy(huang, acGood, nosrc));
  assert.ok(e.warnings.some((w) => w.includes('principles[1] (beta): needs at least one source')));
  const http = clone(acGood.school); http.principles[2].sources[0].url = 'http://example.com/c';
  assert.equal(validateEducation(withAcademy(huang, acGood, http)).school, null);
  const dup = clone(acGood.school); dup.principles[2].id = 'alpha';
  assert.ok(validateEducation(withAcademy(huang, acGood, dup)).warnings.some((w) => w.includes('duplicate id')));
  const notag = clone(acGood.school); notag.tagline = '';
  assert.ok(validateEducation(withAcademy(huang, acGood, notag)).warnings.some((w) => w.includes('tagline missing')));
});

test('Academy: more than 3 terms or a non-list glossary are rejected', () => {
  const o = clone(acGood);
  o.lessons.found.terms = ['term-one', 'term-two', 'term-one', 'term-two'];
  assert.ok(validateEducation(withAcademy(huang, o)).warnings.some((w) => w.includes('terms must be a list of 0-3')));
  const d = withAcademy(huang, acGood); d.glossary = { id: 'x' };
  const e = validateEducation(d);
  assert.ok(e.warnings.includes('glossary must be a list (dropped)'));
  assert.ok(!e.lessons.found, 'lesson using a term from the dropped glossary is dropped');
  assert.ok(e.lessons.cuda);
});

test('mergeGlossary: same id keeps the first definition and lists who uses / defines it', () => {
  const a = validateEducation(withAcademy(huang, acGood));
  const o = clone(acGood);
  o.glossary[0].definition = 'Second definition.';
  o.lessons.found.terms = [];
  o.lessons.cuda.terms = ['term-one', 'term-two'];
  const b = validateEducation(withAcademy(huang, o));
  const m = mergeGlossary([{ slug: 'jensen-huang', name: 'Jensen Huang', edu: a }, { slug: 'elon-musk', name: 'Elon Musk', edu: b }]);
  assert.deepEqual(m.map((t) => t.id), ['term-two', 'term-one']); // sorted by term: "Another term", "Term one"
  const one = m.find((t) => t.id === 'term-one');
  assert.equal(one.definition, 'Fixture definition one.');
  assert.deepEqual(one.usedBy.map((x) => x.slug), ['jensen-huang', 'elon-musk']);
  assert.deepEqual(one.definedBy.map((x) => x.slug), ['jensen-huang', 'elon-musk']);
  const two = m.find((t) => t.id === 'term-two');
  assert.deepEqual(two.usedBy.map((x) => x.slug), ['elon-musk']);
});

test('buildLifeIndex: school in the roster, warnings for bad Academy fields, merged glossary', () => {
  const musk = withAcademy(huang, acBad, acGood.school);
  musk.person.slug = 'elon-musk'; musk.person.name = 'Elon Musk'; musk.person.initials = 'EM';
  const { index, skipped, warnings, glossary } = buildLifeIndex([
    { file: 'jensen-huang.json', data: withAcademy(huang, acGood) },
    { file: 'elon-musk.json', data: musk }
  ], people);
  assert.deepEqual(skipped, []);
  assert.equal(index.count, 2);
  assert.equal(index.schools, 2);
  const jh = index.people.find((p) => p.slug === 'jensen-huang');
  assert.equal(jh.school.name, 'Fixture school');
  assert.equal(jh.school.tagline, 'Fixture tagline.');
  assert.equal(jh.lessons, 3);
  assert.equal(index.people.find((p) => p.slug === 'elon-musk').lessons, 1);
  assert.deepEqual(warnings.map((w) => w.file), ['elon-musk.json']);
  assert.deepEqual(glossary.terms.map((t) => t.id), ['term-two', 'term-one']);
  assert.equal(glossary.count, 2);
  // plain Huang (no Academy fields): no school key, roster row unchanged
  const plain = buildLifeIndex([{ file: 'jensen-huang.json', data: withAcademy(huang, {}, null) }], people);
  assert.equal(plain.index.schools, 0);
  assert.ok(!('school' in plain.index.people[0]));
  assert.equal(plain.glossary.count, 0);
});

test('Academy: optional lesson.sources are kept when valid, bad entries dropped one by one', () => {
  const o = clone(acGood);
  o.lessons.found.sources = [
    { title: 'Fixture ok', url: 'https://example.com/ok', publisher: 'Example', date: '' },
    { title: 'Fixture http', url: 'http://example.com/no', publisher: 'Example', date: '' },
    { title: 'No publisher', url: 'https://example.com/np' }
  ];
  o.lessons.cuda.sources = 'https://example.com/not-a-list';
  const e = validateEducation(withAcademy(huang, o));
  assert.deepEqual(e.lessons.found.sources.map((s) => s.url), ['https://example.com/ok']);
  assert.ok(e.lessons.cuda, 'lesson kept');
  assert.ok(!('sources' in e.lessons.cuda));
  assert.ok(!('sources' in e.lessons.dgx));
  const all = e.warnings.join('\n');
  assert.ok(all.includes('(found).lesson.sources[1] dropped: '), all);
  assert.ok(all.includes('url must be an https URL'), all);
  assert.ok(all.includes('(found).lesson.sources[2] dropped: '), all);
  assert.ok(all.includes('publisher missing'), all);
  assert.ok(all.includes('(cuda).lesson.sources must be a list (dropped)'), all);
});
