// Billionaire Life: pure validation + roster index for data/life/<slug>.json (used by scripts/build-life.mjs).
// No I/O here. A life file is { checked?, note?, person: {...}, decisions: [...], ranks? } — see data/life/jensen-huang.json.

export const CATEGORIES = ['founding', 'product', 'deal', 'money', 'giving', 'politics', 'lifestyle'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// string fields that may be empty (an unknown source date is written as "")
const MAY_BE_EMPTY = new Set(['date']);

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const nonEmpty = (x) => typeof x === 'string' && x.trim() !== '';

export function isHttpsUrl(u) {
  if (typeof u !== 'string' || !/^https:\/\/[^\s"'<>]+$/.test(u)) return false;
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}

// "1993" or 1993 -> 1993; anything else -> null
export function yearOf(y) {
  if (typeof y === 'number' && Number.isInteger(y) && y >= 1800 && y <= 2100) return y;
  if (typeof y === 'string' && /^\d{4}$/.test(y)) return yearOf(Number(y));
  return null;
}

// every string anywhere in the file must be non-empty, except keys in MAY_BE_EMPTY
function emptyStrings(x, path, out) {
  if (typeof x === 'string') { if (x.trim() === '' && !MAY_BE_EMPTY.has(path.split('.').pop())) out.push(`${path}: empty string`); return out; }
  if (Array.isArray(x)) { x.forEach((v, i) => emptyStrings(v, `${path}[${i}]`, out)); return out; }
  if (isObj(x)) for (const k of Object.keys(x)) emptyStrings(x[k], path ? `${path}.${k}` : k, out);
  return out;
}

function checkSource(s, where, errors) {
  if (!isObj(s)) { errors.push(`${where}: not an object`); return; }
  if (!nonEmpty(s.title)) errors.push(`${where}.title missing`);
  if (!isHttpsUrl(s.url)) errors.push(`${where}.url must be an https URL`);
  if (!nonEmpty(s.publisher)) errors.push(`${where}.publisher missing`);
  if (s.date != null && typeof s.date !== 'string') errors.push(`${where}.date must be a string`);
}

// Optional education fields ("Academy") live beside the game data and never make a person unplayable:
// school, glossary and decisions[].lesson are checked by validateEducation() instead of validateLife().
const EDU_TOP = new Set(['school', 'glossary']);
function withoutEducation(data) {
  if (!isObj(data)) return data;
  const out = {};
  for (const k of Object.keys(data)) if (!EDU_TOP.has(k)) out[k] = data[k];
  if (Array.isArray(data.decisions)) out.decisions = data.decisions.map((d) => {
    if (!isObj(d) || !('lesson' in d)) return d;
    const c = { ...d }; delete c.lesson; return c;
  });
  return out;
}

// Validate one parsed life file. slug: expected slug from the filename. peopleSlugs: Set of slugs in data/people/index.json.
// Returns { ok, errors: [string] }.
export function validateLife(data, { slug, peopleSlugs } = {}) {
  const errors = [];
  if (!isObj(data)) return { ok: false, errors: ['file is not a JSON object'] };

  const p = data.person;
  if (!isObj(p)) errors.push('person block missing');
  else {
    for (const k of ['name', 'slug', 'role', 'bio']) if (!nonEmpty(p[k])) errors.push(`person.${k} missing`);
    if (nonEmpty(p.slug) && !SLUG_RE.test(p.slug)) errors.push(`person.slug "${p.slug}" is not a valid slug`);
    if (slug != null && p.slug !== slug) errors.push(`person.slug "${p.slug}" does not match the filename "${slug}.json"`);
    if (peopleSlugs && nonEmpty(p.slug) && !peopleSlugs.has(p.slug)) errors.push(`person.slug "${p.slug}" is not in data/people/index.json`);
    if (p.initials != null && !(nonEmpty(p.initials) && p.initials.length <= 3)) errors.push('person.initials must be 1-3 characters');
    if (p.bioSource != null) checkSource(p.bioSource, 'person.bioSource', errors);
  }

  if (data.checked != null && !(typeof data.checked === 'string' && DATE_RE.test(data.checked))) errors.push('checked must be YYYY-MM-DD');

  const ds = data.decisions;
  if (!Array.isArray(ds) || ds.length === 0) errors.push('decisions must be a non-empty list');
  else {
    const ids = new Set();
    ds.forEach((d, i) => {
      const w = `decisions[${i}]`;
      if (!isObj(d)) { errors.push(`${w}: not an object`); return; }
      const name = nonEmpty(d.id) ? `${w} (${d.id})` : w;
      if (!nonEmpty(d.id)) errors.push(`${w}.id missing`);
      else if (ids.has(d.id)) errors.push(`${name}: duplicate id`);
      else ids.add(d.id);
      if (yearOf(d.year) == null) errors.push(`${name}.year must be a 4-digit year`);
      for (const k of ['title', 'situation', 'actual', 'outcome']) if (!nonEmpty(d[k])) errors.push(`${name}.${k} missing`);
      if (d.category != null && !CATEGORIES.includes(d.category)) errors.push(`${name}.category "${d.category}" is not one of ${CATEGORIES.join(', ')}`);
      if (!Array.isArray(d.options) || d.options.length !== 3) errors.push(`${name}: needs exactly 3 options`);
      if (Array.isArray(d.options)) {
        const oids = new Set();
        let real = 0;
        d.options.forEach((o, j) => {
          const ow = `${name}.options[${j}]`;
          if (!isObj(o)) { errors.push(`${ow}: not an object`); return; }
          if (!nonEmpty(o.id)) errors.push(`${ow}.id missing`);
          else if (oids.has(o.id)) errors.push(`${ow}: duplicate option id "${o.id}"`);
          else oids.add(o.id);
          if (!nonEmpty(o.label)) errors.push(`${ow}.label missing`);
          if (typeof o.real !== 'boolean') errors.push(`${ow}.real must be true or false`);
          if (o.real === true) real++;
        });
        if (real !== 1) errors.push(`${name}: needs exactly one real option (found ${real})`);
      }
      if (!Array.isArray(d.sources) || d.sources.length === 0) errors.push(`${name}: needs at least one source`);
      else d.sources.forEach((s, j) => checkSource(s, `${name}.sources[${j}]`, errors));
    });
  }

  if (data.ranks != null) {
    if (!Array.isArray(data.ranks) || !data.ranks.length) errors.push('ranks must be a non-empty list when present');
    else data.ranks.forEach((r, i) => {
      if (!isObj(r) || typeof r.min !== 'number' || !nonEmpty(r.title)) errors.push(`ranks[${i}] needs { min: number, title }`);
    });
  }

  errors.push(...emptyStrings(withoutEducation(data), '', []));
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function sourceErrors(s, where) { const e = []; checkSource(s, where, e); return e; }

// Validate the optional education fields of a life file that already passed validateLife().
// Invalid pieces are dropped (with a warning), never fatal:
//   - a glossary entry with a problem is dropped on its own;
//   - a school with any problem is dropped whole (and then every lesson, since lessons point at its principles);
//   - a lesson with a problem (unknown principle, unknown term, missing text) is dropped on its own;
//   - optional lesson.sources entries that are not valid sources (https url, title, publisher) are dropped one by one.
// Returns { school: object|null, glossary: [entry], lessons: { decisionId: lesson }, warnings: [string] }.
export function validateEducation(data) {
  const warnings = [];
  const out = { school: null, glossary: [], lessons: {}, warnings };
  if (!isObj(data)) return out;

  // glossary
  const gloss = new Map();
  if (data.glossary != null) {
    if (!Array.isArray(data.glossary)) warnings.push('glossary must be a list (dropped)');
    else data.glossary.forEach((g, i) => {
      const w = isObj(g) && nonEmpty(g.id) ? `glossary[${i}] (${g.id})` : `glossary[${i}]`;
      const e = [];
      if (!isObj(g)) e.push('not an object');
      else {
        if (!nonEmpty(g.id) || !SLUG_RE.test(g.id)) e.push('id must be kebab-case');
        else if (gloss.has(g.id)) e.push('duplicate id');
        if (!nonEmpty(g.term)) e.push('term missing');
        if (!nonEmpty(g.definition)) e.push('definition missing');
        e.push(...sourceErrors(g.source, 'source'));
      }
      if (e.length) { warnings.push(`${w} dropped: ${e.join('; ')}`); return; }
      const entry = { id: g.id, term: g.term, definition: g.definition, source: g.source };
      gloss.set(g.id, entry);
      out.glossary.push(entry);
    });
  }

  // school
  if (data.school != null) {
    const s = data.school, e = [];
    if (!isObj(s)) e.push('not an object');
    else {
      if (!nonEmpty(s.name)) e.push('name missing');
      if (!nonEmpty(s.tagline)) e.push('tagline missing');
      if (!Array.isArray(s.principles) || s.principles.length < 3 || s.principles.length > 4) e.push('needs 3-4 principles');
      if (Array.isArray(s.principles)) {
        const ids = new Set();
        s.principles.forEach((p, i) => {
          const w = isObj(p) && nonEmpty(p.id) ? `principles[${i}] (${p.id})` : `principles[${i}]`;
          if (!isObj(p)) { e.push(`${w}: not an object`); return; }
          if (!nonEmpty(p.id) || !SLUG_RE.test(p.id)) e.push(`${w}.id must be kebab-case`);
          else if (ids.has(p.id)) e.push(`${w}: duplicate id`);
          else ids.add(p.id);
          if (!nonEmpty(p.name)) e.push(`${w}.name missing`);
          if (!nonEmpty(p.summary)) e.push(`${w}.summary missing`);
          if (!Array.isArray(p.sources) || !p.sources.length) e.push(`${w}: needs at least one source`);
          else p.sources.forEach((src, j) => e.push(...sourceErrors(src, `${w}.sources[${j}]`)));
        });
      }
    }
    if (e.length) warnings.push(`school dropped: ${e.join('; ')}`);
    else out.school = {
      name: s.name, tagline: s.tagline,
      principles: s.principles.map((p) => ({ id: p.id, name: p.name, summary: p.summary, sources: p.sources }))
    };
  }

  // lessons
  const pids = new Set(out.school ? out.school.principles.map((p) => p.id) : []);
  (Array.isArray(data.decisions) ? data.decisions : []).forEach((d, i) => {
    if (!isObj(d) || d.lesson == null) return;
    const l = d.lesson, w = `decisions[${i}]${nonEmpty(d.id) ? ` (${d.id})` : ''}.lesson`, e = [];
    if (!isObj(l)) e.push('not an object');
    else {
      if (!out.school) e.push('no valid school');
      else if (!pids.has(l.principle)) e.push(`principle "${l.principle}" is not a principle id of the school`);
      if (!nonEmpty(l.takeaway)) e.push('takeaway missing');
      if (!nonEmpty(l.watchOut)) e.push('watchOut missing');
      if (l.terms != null) {
        if (!Array.isArray(l.terms) || l.terms.length > 3) e.push('terms must be a list of 0-3 glossary ids');
        else l.terms.forEach((t) => { if (!gloss.has(t)) e.push(`term "${t}" is not in the glossary`); });
      }
    }
    if (e.length) { warnings.push(`${w} dropped: ${e.join('; ')}`); return; }
    // optional lesson.sources: bad entries are dropped one by one, the lesson stays
    let sources = [];
    if (l.sources != null) {
      if (!Array.isArray(l.sources)) warnings.push(`${w}.sources must be a list (dropped)`);
      else l.sources.forEach((src, j) => {
        const se = sourceErrors(src, `${w}.sources[${j}]`);
        if (se.length) warnings.push(`${w}.sources[${j}] dropped: ${se.join('; ')}`);
        else sources.push(src);
      });
    }
    const lesson = { principle: l.principle, takeaway: l.takeaway, watchOut: l.watchOut, terms: Array.isArray(l.terms) ? [...new Set(l.terms)] : [] };
    if (sources.length) lesson.sources = sources;
    out.lessons[d.id] = lesson;
  });
  return out;
}

// Merge per-person glossaries into one list for data/life/glossary.json.
// people: [{ slug, name, edu: validateEducation() result }] in roster order. Same id -> first definition wins.
// usedBy: people whose (valid) lessons use the term; definedBy: people whose glossary lists it.
export function mergeGlossary(people) {
  const byId = new Map();
  for (const p of people) {
    const used = new Set();
    for (const l of Object.values(p.edu.lessons)) for (const t of l.terms) used.add(t);
    for (const g of p.edu.glossary) {
      if (!byId.has(g.id)) byId.set(g.id, { ...g, usedBy: [], definedBy: [] });
      const m = byId.get(g.id);
      if (!m.definedBy.some((x) => x.slug === p.slug)) m.definedBy.push({ slug: p.slug, name: p.name });
      if (used.has(g.id) && !m.usedBy.some((x) => x.slug === p.slug)) m.usedBy.push({ slug: p.slug, name: p.name });
    }
  }
  return [...byId.values()].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

// One roster row for data/life/index.json. peopleBySlug: Map slug -> data/people/index.json entry.
export function rosterEntry(data, peopleBySlug) {
  const p = data.person;
  const years = data.decisions.map((d) => yearOf(d.year)).filter((y) => y != null);
  const idx = peopleBySlug && peopleBySlug.get(p.slug);
  const initials = p.initials || p.name.split(/\s+/).filter(Boolean).map((w, i, a) => (i === 0 || i === a.length - 1 ? w[0] : '')).join('').toUpperCase();
  return {
    slug: p.slug,
    name: p.name,
    role: p.role,
    initials,
    sector: (idx && idx.sector) || 'Other',
    decisions: data.decisions.length,
    years: { from: Math.min(...years), to: Math.max(...years) },
    checked: data.checked || null
  };
}

// roster row + school block (only when the person has a valid school)
function rosterWithSchool(data, peopleBySlug, edu) {
  const r = rosterEntry(data, peopleBySlug);
  if (edu && edu.school) {
    r.school = edu.school;
    r.lessons = Object.keys(edu.lessons).length;
  }
  return r;
}

// files: [{ file: 'jensen-huang.json', data?: parsed, error?: 'parse error text' }]
// people: data/people/index.json object ({ people: [...] }).
// Returns { index, skipped: [{ file, errors }], warnings: [{ file, warnings }], glossary }.
// Roster order follows the people index rank, then name. Invalid optional Academy fields only produce warnings.
export function buildLifeIndex(files, people) {
  const list = Array.isArray(people && people.people) ? people.people : [];
  const bySlug = new Map(list.map((x) => [x.slug, x]));
  const rank = new Map(list.map((x, i) => [x.slug, i]));
  const roster = [];
  const skipped = [];
  const warnings = [];
  const edus = new Map();
  for (const f of files) {
    const slug = String(f.file).replace(/\.json$/, '');
    if (f.error) { skipped.push({ file: f.file, errors: [`could not read JSON: ${f.error}`] }); continue; }
    const v = validateLife(f.data, { slug, peopleSlugs: new Set(bySlug.keys()) });
    if (!v.ok) { skipped.push({ file: f.file, errors: v.errors }); continue; }
    const edu = validateEducation(f.data);
    if (edu.warnings.length) warnings.push({ file: f.file, warnings: edu.warnings });
    edus.set(f.data.person.slug, edu);
    roster.push(rosterWithSchool(f.data, bySlug, edu));
  }
  roster.sort((a, b) => (rank.get(a.slug) ?? 1e9) - (rank.get(b.slug) ?? 1e9) || a.name.localeCompare(b.name));
  const checked = roster.map((r) => r.checked).filter(Boolean).sort();
  const terms = mergeGlossary(roster.map((r) => ({ slug: r.slug, name: r.name, edu: edus.get(r.slug) })));
  const updated = checked.length ? checked[checked.length - 1] : null;
  return {
    index: {
      note: 'Billionaire Life roster, built by scripts/build-life.mjs from data/life/<slug>.json. Only files that pass validation are listed.',
      updated,
      count: roster.length,
      schools: roster.filter((r) => r.school).length,
      people: roster
    },
    skipped,
    warnings,
    glossary: {
      note: 'Billionaires Digest Academy glossary, built by scripts/build-life.mjs from the glossary in each data/life/<slug>.json. Same id: first definition kept (roster order).',
      updated,
      count: terms.length,
      terms
    }
  };
}
