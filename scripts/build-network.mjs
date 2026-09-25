// Offline: build data/network/graph.json (who holds the same companies) and
// data/property/areas.json (reported real-estate deals grouped by area) from
// data/people/*.json. No network calls. Output is deterministic for the same input.
//
//   node scripts/build-network.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNoteEntry, isFormerEntry } from './lib/pages/companies.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PEOPLE = join(ROOT, 'data', 'people');
const OUT_NET = join(ROOT, 'data', 'network', 'graph.json');
const OUT_PROP = join(ROOT, 'data', 'property', 'areas.json');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
async function writeJson(p, obj) {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2) + '\n');
}
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (x == null ? '' : String(x)).trim();
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
const norm = (x) => str(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// "$927.9B" -> 927.9 (billions)
function parseWorth(v) {
  const m = /\$?\s*([\d,.]+)\s*([TBM])?/i.exec(str(v));
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const u = (m[2] || 'B').toUpperCase();
  return u === 'T' ? n * 1000 : u === 'M' ? n / 1000 : n;
}

// ------------------------------------------------------------------
// Company normalization
// ------------------------------------------------------------------
const TICKER_ALIAS = { GOOG: 'GOOGL', 'BRK.A': 'BRK.B' };

// "NYSE:MP" -> "MP"; "BABA / 9988" -> "BABA"; "SBE (proposed)" -> "SBE"; GOOG -> GOOGL
function tickerKey(t) {
  let s = str(t);
  if (!s) return null;
  s = s.split('/')[0].replace(/\([^)]*\)/g, ' ').trim();
  s = s.replace(/^[A-Za-z]+\s*:\s*/, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!s) return null;
  return TICKER_ALIAS[s] || s;
}

// remove parenthetical notes, including nested ones and an unclosed "(" at the end
function stripParens(t) {
  let s = str(t), prev;
  do { prev = s; s = s.replace(/\([^()]*\)/g, ' '); } while (s !== prev);
  return s.replace(/\(.*$/, ' ').replace(/\)/g, ' ');
}
// display name: parenthetical notes, notes after " - ", " — ", ":" or ";", and trailing ", note" removed
// ("Tesla, Inc." keeps its suffix)
function cleanName(n) {
  let s = stripParens(n);
  s = s.split(/\s+[-—–]\s+|[:;]/)[0];
  s = s.replace(/\s*,(?!\s*(?:inc|incorporated|ltd|limited|llc|corp|corporation|co|plc|s\.?\s?a|ag|n\.?\s?v|l\.?\s?p)\b\.?\s*$)[\s\S]*$/i, '');
  return s.replace(/\s+/g, ' ').replace(/[\s,]+$/, '').trim();
}

const SUFFIX_RE = /\s(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|lp|l p|plc|sa|s a|ag|nv|n v|se|spa|s p a|ab|asa|holdings|holding|group|class [a-z]|shares|ordinary shares|common stock|common|stock)$/;
// "Tesla, Inc." -> "tesla"; "Space Exploration Technologies Corp. (SpaceX)" -> "space exploration technologies"
function nameKey(n) {
  let s = norm(cleanName(n)).replace(/^the\s+/, '');
  let prev;
  do { prev = s; s = s.replace(SUFFIX_RE, '').trim(); } while (s !== prev && s);
  return s.length >= 2 ? s : null;
}
// short aliases in parentheses, e.g. "(SpaceX)"; ignores notes with digits or many words
function parenAliases(n) {
  const out = [];
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(str(n)))) {
    const a = m[1].trim();
    if (!a || /\d/.test(a) || a.split(/\s+/).length > 3 || !/^[A-Z]/.test(a) || /[,;]/.test(a)) continue;
    const k = nameKey(a);
    if (k) out.push(k);
  }
  return out;
}

// generic words that must not create a private-deal match on their own
const DEAL_STOP = new Set(['capital', 'global', 'international', 'investments', 'investment', 'partners', 'ventures',
  'foundation', 'family office', 'america', 'china', 'india', 'energy', 'media', 'group', 'holdings', 'trust',
  'bank', 'united', 'national', 'general', 'first', 'royal', 'north', 'south', 'world', 'digital', 'systems',
  // news outlets: deal texts cite them as sources
  'bloomberg', 'reuters', 'forbes', 'financial times', 'cnbc', 'wall street journal', 'business today', 'the information', 'axios']);

// ------------------------------------------------------------------
// Load people
// ------------------------------------------------------------------
const index = await readJson(join(PEOPLE, 'index.json'));
const people = [];
for (const ip of arr(index.people)) {
  if (!ip || !ip.slug) continue;
  const f = join(PEOPLE, ip.slug + '.json');
  if (!existsSync(f)) { console.warn('no profile:', ip.slug); continue; }
  const prof = await readJson(f);
  people.push({ ip, prof });
}

// ------------------------------------------------------------------
// 1) Network
// ------------------------------------------------------------------
// name -> ticker key, from holdings that list a ticker (so "SpaceX" without a ticker matches SPCX)
const nameToTicker = new Map();
for (const { prof } of people) {
  for (const h of [...arr(prof.controls), ...arr(prof.stakes)]) {
    const tk = tickerKey(h && h.ticker);
    if (!tk) continue;
    for (const k of [nameKey(h.name), ...parenAliases(h.name)]) {
      if (k && !nameToTicker.has(k)) nameToTicker.set(k, tk);
    }
  }
}

function holdingKey(h) {
  const tk = tickerKey(h.ticker);
  if (tk) return 'T:' + tk;
  const nk = nameKey(h.name);
  if (!nk) return null;
  if (nameToTicker.has(nk)) return 'T:' + nameToTicker.get(nk);
  for (const a of parenAliases(h.name)) if (nameToTicker.has(a)) return 'T:' + nameToTicker.get(a);
  return 'N:' + nk;
}

// per person: key -> { name, ticker, source, kind }
const holdings = new Map();
const formerSkipped = [];
let skippedNotes = 0;
const displayByKey = new Map();
for (const { ip, prof } of people) {
  const m = new Map();
  for (const [kind, list] of [['controls', prof.controls], ['stakes', prof.stakes]]) {
    arr(list).forEach((h, i) => {
      if (!h || !h.name) return;
      // same rules as the company pages: skip note/summary rows and former holdings (sold, exited, historical)
      if (isNoteEntry(h)) { skippedNotes++; return; }
      if (isFormerEntry(h)) { formerSkipped.push(`${ip.slug}: ${str(h.name)}`); return; }
      const key = holdingKey(h);
      if (!key || m.has(key)) return;
      const tk = tickerKey(h.ticker) || (key.startsWith('T:') ? key.slice(2) : null);
      m.set(key, { name: cleanName(h.name) || str(h.name), ticker: tk, source: safeUrl(h.source), kind, i });
    });
  }
  holdings.set(ip.slug, m);
}

const rankOf = new Map(people.map(({ ip }) => [ip.slug, Number(ip.rank) || 999]));
const bySlug = new Map(people.map((p) => [p.ip.slug, p]));
function display(key, h) {
  if (displayByKey.has(key)) return displayByKey.get(key);
  const d = h.ticker ? `${h.name} (${h.ticker})` : h.name;
  displayByKey.set(key, d);
  return d;
}

// edge map "a|b" (a ranked above b) -> Map(key -> company)
const edgeMap = new Map();
function addShared(s1, s2, key, h1, h2, kind1, kind2) {
  if (s1 === s2) return;
  let [a, b, ha, hb, ka, kb] = [s1, s2, h1, h2, kind1, kind2];
  if (rankOf.get(s2) < rankOf.get(s1) || (rankOf.get(s2) === rankOf.get(s1) && s2 < s1)) {
    [a, b, ha, hb, ka, kb] = [s2, s1, h2, h1, kind2, kind1];
  }
  const id = a + '|' + b;
  if (!edgeMap.has(id)) edgeMap.set(id, new Map());
  const cm = edgeMap.get(id);
  const prev = cm.get(key);
  const direct = ka !== 'privateDeals' && kb !== 'privateDeals';
  if (prev && (prev._direct || !direct)) return;
  cm.set(key, { name: null, key, sources: [ha.source, hb.source], kinds: [ka, kb], refs: [ha.i, hb.i], _direct: direct, _h: ha.kind === 'privateDeals' ? hb : ha });
}

// direct: both people hold the same company in controls/stakes
const holdersByKey = new Map();
for (const [slug, m] of holdings) {
  for (const [key, h] of m) {
    if (!holdersByKey.has(key)) holdersByKey.set(key, []);
    holdersByKey.get(key).push({ slug, h });
  }
}
for (const [key, list] of holdersByKey) {
  list.sort((x, y) => rankOf.get(x.slug) - rankOf.get(y.slug));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      addShared(list[i].slug, list[j].slug, key, list[i].h, list[j].h, list[i].h.kind, list[j].h.kind);
    }
  }
}

// private deals: the deal text names (by exact normalized name) a company another person holds
const dealNames = []; // { re, key }
{
  const seen = new Set();
  for (const [, m] of holdings) {
    for (const [key, h] of m) {
      const nk = nameKey(h.name);
      if (!nk || nk.length < 5 || DEAL_STOP.has(nk)) continue;
      const id = nk + '|' + key;
      if (seen.has(id)) continue;
      seen.add(id);
      // the company's words in order, separated only by punctuation or spaces; must not run on into
      // a longer capitalized name ("Goldman Sachs Real Estate ..." is not "Goldman Sachs")
      const words = nk.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      dealNames.push({ re: new RegExp('(?:^|[^a-z0-9])(' + words.join('[^a-z0-9]+') + ')(?![a-z0-9])', 'g'), key });
    }
  }
}
// true when the name appears as its own name (not the start of a longer capitalized name) in a clause
// that is not about selling or exiting ("full exits from ... Microsoft" does not link anyone)
const SELL_RE = /\b(exit|exits|exited|exiting|sold|sell|sells|selling|disposed|disposes|divest\w*|cut|cuts|trimmed)\b/i;
function dealNames_match(re, text) {
  const lower = text.toLowerCase();
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(lower))) {
    const start = m.index + m[0].length - m[1].length, end = m.index + m[0].length;
    re.lastIndex = m.index + 1;
    if (/^\s+[A-Z]/.test(text.slice(end))) continue;
    const cs = text.lastIndexOf(';', start) + 1, ceRaw = text.indexOf(';', end);
    const clause = text.slice(cs, ceRaw < 0 ? text.length : ceRaw);
    if (SELL_RE.test(clause)) continue;
    return true;
  }
  return false;
}
const deaccent = (t) => str(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const dealMatches = [];
for (const { ip, prof } of people) {
  for (const [di, d] of arr(prof.privateDeals).entries()) {
    const text = deaccent(d && d.what);
    if (!text) continue;
    const keys = new Set();
    for (const dn of dealNames) if (dealNames_match(dn.re, text)) keys.add(dn.key);
    for (const key of keys) {
      const dealH = { name: null, source: safeUrl(d.source), kind: 'privateDeals', i: di };
      for (const { slug, h } of holdersByKey.get(key) || []) {
        if (slug === ip.slug) continue;
        if (holdings.get(ip.slug).has(key)) continue; // direct holding already links them
        addShared(ip.slug, slug, key, dealH, h, 'privateDeals', h.kind);
        dealMatches.push(`${ip.slug} deal names ${key} held by ${slug}: ${text.slice(0, 90)}`);
      }
    }
  }
}

// assemble edges
const edges = [];
for (const [id, cm] of edgeMap) {
  const [a, b] = id.split('|');
  const companies = [...cm.values()].map((c) => {
    const holder = c._h;
    return {
      name: display(c.key, holder),
      key: c.key,
      kinds: c.kinds,
      refs: c.refs,
      sources: c.sources
    };
  }).sort((x, y) => x.name.localeCompare(y.name));
  edges.push({ a, b, weight: companies.length, companies });
}
edges.sort((x, y) => y.weight - x.weight || rankOf.get(x.a) - rankOf.get(y.a) || rankOf.get(x.b) - rankOf.get(y.b));

const linked = new Set();
for (const e of edges) { linked.add(e.a); linked.add(e.b); }
const nodes = people
  .filter(({ ip }) => linked.has(ip.slug))
  .map(({ ip }) => ({ slug: ip.slug, name: ip.name, rank: Number(ip.rank) || null, sector: ip.sector || 'Other', worth: parseWorth(ip.worth), worthText: ip.worth || '' }))
  .sort((x, y) => (x.rank || 999) - (y.rank || 999));

// ---- deterministic force layout (fixed seed, fixed iterations) ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const W = 1000, H = 720, PAD = 36;
const maxWorth = Math.max(1, ...nodes.map((n) => n.worth || 0));
for (const n of nodes) n.r = Math.round((9 + 17 * Math.sqrt((n.worth || 0) / maxWorth)) * 10) / 10;
{
  const rnd = mulberry32(20260925);
  const N = nodes.length;
  const idx = new Map(nodes.map((n, i) => [n.slug, i]));
  const x = new Float64Array(N), y = new Float64Array(N), vx = new Float64Array(N), vy = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const ang = (i / Math.max(1, N)) * Math.PI * 2 * 3.1;
    const rad = 60 + 280 * (i / Math.max(1, N));
    x[i] = Math.cos(ang) * rad + (rnd() - 0.5) * 10;
    y[i] = Math.sin(ang) * rad * 0.75 + (rnd() - 0.5) * 10;
  }
  const links = edges.map((e) => ({ s: idx.get(e.a), t: idx.get(e.b), w: e.weight }));
  const deg = new Float64Array(N);
  for (const l of links) { deg[l.s]++; deg[l.t]++; }
  const ITER = 700;
  for (let it = 0; it < ITER; it++) {
    const alpha = 1 - it / ITER;
    // repulsion
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = x[j] - x[i], dy = y[j] - y[i];
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (rnd() - 0.5); dy = (rnd() - 0.5); d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        const f = (1600 * alpha) / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        vx[i] -= fx; vy[i] -= fy; vx[j] += fx; vy[j] += fy;
        // collision
        const min = nodes[i].r + nodes[j].r + 6;
        if (d < min) {
          const push = (min - d) / 2;
          x[i] -= (dx / d) * push; y[i] -= (dy / d) * push;
          x[j] += (dx / d) * push; y[j] += (dy / d) * push;
        }
      }
    }
    // springs
    for (const l of links) {
      const dx = x[l.t] - x[l.s], dy = y[l.t] - y[l.s];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const want = 70 + nodes[l.s].r + nodes[l.t].r - Math.min(30, l.w * 4);
      const k = 0.04 * alpha / Math.min(deg[l.s], deg[l.t]);
      const f = (d - want) * k;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      vx[l.s] += fx; vy[l.s] += fy; vx[l.t] -= fx; vy[l.t] -= fy;
    }
    // gravity (slightly wider than tall)
    for (let i = 0; i < N; i++) {
      vx[i] -= x[i] * 0.012 * alpha;
      vy[i] -= y[i] * 0.02 * alpha;
      x[i] += vx[i]; y[i] += vy[i];
      vx[i] *= 0.6; vy[i] *= 0.6;
    }
  }
  // fit into the viewBox, keep aspect
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, x[i] - nodes[i].r); maxX = Math.max(maxX, x[i] + nodes[i].r);
    minY = Math.min(minY, y[i] - nodes[i].r); maxY = Math.max(maxY, y[i] + nodes[i].r);
  }
  const s = Math.min((W - 2 * PAD) / Math.max(1, maxX - minX), (H - 2 * PAD) / Math.max(1, maxY - minY));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  for (let i = 0; i < N; i++) {
    nodes[i].x = Math.round(((x[i] - minX) * s + ox) * 10) / 10;
    nodes[i].y = Math.round(((y[i] - minY) * s + oy) * 10) / 10;
  }
}

const graph = {
  // companies[].kinds / refs: which profile list (controls, stakes, privateDeals) and the index in it, for a then b
  asOf: index.asOf || null,
  source: 'Built from each person\'s profile (data/people): companies they control or hold stakes in, plus private deals that name a company another person holds.',
  rule: 'Two people are linked when they currently hold the same company (holdings described as sold, exited or historical, and note rows, are left out). Companies match by ticker (exchange prefix removed; GOOG counted as GOOGL, BRK.A as BRK.B), otherwise by company name without corporate suffixes and notes. A private deal links two people only when its text names, word for word, a company the other person holds.',
  viewBox: [0, 0, W, H],
  nodes,
  edges
};
await writeJson(OUT_NET, graph);

// ------------------------------------------------------------------
// 2) Property areas (area level only; never addresses)
// ------------------------------------------------------------------
const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};
const STATE_BY_NAME = new Map(Object.entries(STATES).map(([ab, n]) => [norm(n), ab]));
STATE_BY_NAME.set('new york city', 'NY');
// region tokens that name a country (or a well-known part of one)
const COUNTRY_TOKENS = new Map(Object.entries({
  'usa': 'United States', 'us': 'United States', 'united states': 'United States',
  'uk': 'United Kingdom', 'united kingdom': 'United Kingdom', 'england': 'United Kingdom', 'scotland': 'United Kingdom', 'wales': 'United Kingdom',
  'france': 'France', 'french riviera': 'France', 'germany': 'Germany', 'spain': 'Spain', 'italy': 'Italy', 'netherlands': 'Netherlands',
  'canada': 'Canada', 'mexico': 'Mexico', 'japan': 'Japan', 'china': 'China', 'india': 'India', 'singapore': 'Singapore',
  'switzerland': 'Switzerland', 'austria': 'Austria', 'greece': 'Greece', 'new zealand': 'New Zealand', 'argentina': 'Argentina',
  'hong kong': 'Hong Kong', 'hong kong island': 'Hong Kong', 'st vincent and the grenadines': 'St. Vincent and the Grenadines',
  'united arab emirates': 'United Arab Emirates', 'uae': 'United Arab Emirates', 'australia': 'Australia', 'brazil': 'Brazil',
  'monaco': 'Monaco', 'portugal': 'Portugal', 'ireland': 'Ireland', 'israel': 'Israel', 'russia': 'Russia', 'nigeria': 'Nigeria'
}));
// cities that appear without a country
const CITY_COUNTRY = new Map(Object.entries({
  'paris': 'France', 'london': 'United Kingdom', 'tokyo': 'Japan', 'madrid': 'Spain', 'venice': 'Italy', 'mumbai': 'India',
  'mexico city': 'Mexico', 'buenos aires': 'Argentina', 'geneva': 'Switzerland', 'dubai': 'United Arab Emirates',
  'toronto': 'Canada', 'hamburg': 'Germany', 'heilbronn': 'Germany', 'singapore': 'Singapore', 'hong kong': 'Hong Kong'
}));

function regionOf(part) {
  const p = norm(part).replace(/\s+area$/, '').replace(/\s+usa$/, '');
  if (!p) return null;
  const up = str(part).replace(/\./g, '').toUpperCase();
  if (STATES[up]) return { country: 'United States', state: STATES[up] };
  if (STATE_BY_NAME.has(p)) return { country: 'United States', state: STATES[STATE_BY_NAME.get(p)] };
  if (COUNTRY_TOKENS.has(p)) {
    const c = COUNTRY_TOKENS.get(p);
    return c === 'United States' ? { country: c, state: null, bare: true } : { country: c, state: null };
  }
  return null;
}
function regionLabel(r) { return r.state ? r.state : r.country; }
function shortRegion(r) {
  if (r.state) { for (const [ab, n] of Object.entries(STATES)) if (n === r.state) return ab; }
  return r.country;
}

// "Upper East Side (co-op), Manhattan, NY" -> { area: "Manhattan, NY", place: "Upper East Side, Manhattan, NY", region }
function parseArea(raw) {
  const original = str(raw);
  let s = original.split(':')[0].split(/\s+[-—–]\s+/)[0];
  const parens = [];
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => { parens.push(inner); return ' '; });
  let parts = s.split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .filter((x) => !/^~?\s*[\d,.]+\s*(acres?|hectares?)\b/i.test(x) && !/^~/.test(x));
  const place = parts.join(', ');
  // drop a trailing "USA" when a state precedes it
  if (parts.length >= 2 && regionOf(parts[parts.length - 1])?.bare && regionOf(parts[parts.length - 2])?.state) parts = parts.slice(0, -1);

  let region = null, ri = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const r = regionOf(parts[i]);
    if (r && !r.bare) { region = r; ri = i; break; }
  }
  if (region) {
    const city = ri > 0 ? parts[ri - 1] : null;
    const cityState = ['Singapore', 'Hong Kong', 'Monaco'].includes(region.country) && !region.state;
    const area = city ? `${city}, ${shortRegion(region)}` : cityState ? region.country : `${regionLabel(region)} (no city given)`;
    return { area, place, region };
  }
  // a known city on its own ("Paris, 7th arrondissement", "Mexico City")
  for (const p of parts) {
    const c = CITY_COUNTRY.get(norm(p));
    if (c) {
      const r = { country: c, state: null };
      return { area: norm(p) === norm(c) ? c : `${p}, ${c}`, place, region: r };
    }
  }
  // a region named only inside parentheses ("Lake Tahoe (Nevada side)")
  for (const inner of parens) {
    const words = norm(inner).split(' ');
    for (let len = 3; len >= 1; len--) {
      for (let i = 0; i + len <= words.length; i++) {
        const r = regionOf(words.slice(i, i + len).join(' '));
        if (r && !r.bare && parts.length) {
          return { area: `${parts[parts.length - 1]}, ${shortRegion(r)}`, place, region: r };
        }
      }
    }
  }
  return { area: null, place: place || original, region: null };
}

// street-address patterns ("15 Central Park West", "50 United Nations Plaza") are removed from descriptions
const ADDRESS_RE = /\b\d{1,5}\s+(?:[A-Z][\w.'-]*\s+){0,4}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Place|Pl|Plaza|Way|Court|Ct|Terrace|Park West|Park East|Park South|West|East|North|South)\b\.?/g;
function stripAddress(t) { return str(t).replace(ADDRESS_RE, '[address removed]').replace(/\(\[address removed\]\)/g, '(address removed)'); }

const MULTI = { country: 'Several places', state: null };
const areaMap = new Map();
const unparsed = [];
let dupes = 0;
for (const { ip, prof } of people) {
  const seen = new Set();
  for (const r of arr(prof.realEstate)) {
    if (!r || !r.area) continue;
    const src = safeUrl(r.source);
    let { area, place, region } = parseArea(r.area);
    if (!region) {
      unparsed.push(`${ip.slug}: ${r.area}`);
      region = MULTI;
      area = 'Several or unspecified places';
    }
    const entry = {
      person: ip.name,
      slug: ip.slug,
      place: stripAddress(place),
      type: stripAddress(r.type),
      price: r.price == null || r.price === '' ? null : r.price,
      date: r.date == null ? null : str(r.date),
      source: src
    };
    const dk = [area, JSON.stringify(entry.price), entry.date, entry.type].join('|');
    if (seen.has(dk)) { dupes++; continue; }
    seen.add(dk);
    const key = region.country + '|' + (region.state || '') + '|' + area;
    if (!areaMap.has(key)) areaMap.set(key, { area, country: region.country, state: region.state || null, entries: [] });
    areaMap.get(key).entries.push(entry);
  }
}
const areas = [...areaMap.values()].map((a) => {
  a.entries.sort((x, y) => str(y.date).localeCompare(str(x.date)) || (rankOf.get(x.slug) - rankOf.get(y.slug)));
  return { area: a.area, country: a.country, state: a.state, count: a.entries.length, people: new Set(a.entries.map((e) => e.slug)).size, entries: a.entries };
}).sort((x, y) => y.count - x.count || x.area.localeCompare(y.area));

const regionMap = new Map();
for (const a of areas) {
  const label = a.state ? `${a.state}, United States` : a.country;
  if (!regionMap.has(label)) regionMap.set(label, { region: label, country: a.country, state: a.state, count: 0, areas: 0 });
  const r = regionMap.get(label); r.count += a.count; r.areas++;
}
const countryMap = new Map();
for (const a of areas) {
  if (!countryMap.has(a.country)) countryMap.set(a.country, { country: a.country, count: 0, areas: 0 });
  const c = countryMap.get(a.country); c.count += a.count; c.areas++;
}
const byCount = (x, y) => (x.country === 'Several places') - (y.country === 'Several places') || y.count - x.count || (x.region || x.country).localeCompare(y.region || y.country);

const property = {
  asOf: index.asOf || null,
  source: 'Built from the real-estate entries in each person\'s profile (data/people). Each entry links to its original report.',
  privacy: 'We list reported deals at city or neighborhood level only. No addresses.',
  total: areas.reduce((n, a) => n + a.count, 0),
  countries: [...countryMap.values()].sort(byCount),
  regions: [...regionMap.values()].sort(byCount),
  areas
};
await writeJson(OUT_PROP, property);

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------
console.log(`network: ${nodes.length} nodes, ${edges.length} edges -> ${OUT_NET.replace(ROOT + '/', '')}`);
console.log('top edges:');
for (const e of edges.slice(0, 10)) {
  console.log(`  ${e.weight}  ${bySlug.get(e.a).ip.name} — ${bySlug.get(e.b).ip.name}: ${e.companies.map((c) => c.name).join('; ')}`);
}
console.log(`skipped: ${skippedNotes} note rows, ${formerSkipped.length} former holdings`);
for (const f of formerSkipped) console.log('  former  ' + f);
console.log(`private-deal links: ${dealMatches.length}`);
for (const d of dealMatches) console.log('  ' + d);
console.log(`property: ${property.total} entries in ${areas.length} areas, ${property.regions.length} regions, ${property.countries.length} countries (${dupes} duplicate entries skipped) -> ${OUT_PROP.replace(ROOT + '/', '')}`);
for (const r of property.regions) console.log(`  ${r.count}  ${r.region} (${r.areas} areas)`);
if (unparsed.length) {
  console.log('areas without a single city/region (grouped as "Several places"):');
  for (const u of unparsed) console.log('  ' + u);
}
