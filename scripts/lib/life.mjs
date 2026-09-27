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

  errors.push(...emptyStrings(data, '', []));
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
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

// files: [{ file: 'jensen-huang.json', data?: parsed, error?: 'parse error text' }]
// people: data/people/index.json object ({ people: [...] }).
// Returns { index, skipped: [{ file, errors }] }. Roster order follows the people index rank, then name.
export function buildLifeIndex(files, people) {
  const list = Array.isArray(people && people.people) ? people.people : [];
  const bySlug = new Map(list.map((x) => [x.slug, x]));
  const rank = new Map(list.map((x, i) => [x.slug, i]));
  const roster = [];
  const skipped = [];
  for (const f of files) {
    const slug = String(f.file).replace(/\.json$/, '');
    if (f.error) { skipped.push({ file: f.file, errors: [`could not read JSON: ${f.error}`] }); continue; }
    const v = validateLife(f.data, { slug, peopleSlugs: new Set(bySlug.keys()) });
    if (!v.ok) { skipped.push({ file: f.file, errors: v.errors }); continue; }
    roster.push(rosterEntry(f.data, bySlug));
  }
  roster.sort((a, b) => (rank.get(a.slug) ?? 1e9) - (rank.get(b.slug) ?? 1e9) || a.name.localeCompare(b.name));
  const checked = roster.map((r) => r.checked).filter(Boolean).sort();
  return {
    index: {
      note: 'Billionaire Life roster, built by scripts/build-life.mjs from data/life/<slug>.json. Only files that pass validation are listed.',
      updated: checked.length ? checked[checked.length - 1] : null,
      count: roster.length,
      people: roster
    },
    skipped
  };
}
