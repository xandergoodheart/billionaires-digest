// Shared helpers for the static page builder (scripts/build-pages.mjs).
// These mirror the browser helpers in assets/common.js so the static pages
// read exactly like the live site. Keep the two in step.

export const SITE = 'https://billionairesdigest.com';

// ---- escaping ----
export function esc(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// only http(s) URLs survive; everything else is null
export function safeUrl(u) { return (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) ? u.trim() : null; }
// JSON for a <script type="application/ld+json"> block (no "</script>" breakouts)
export function ldJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

// ---- small helpers ----
export function arr(x) { return Array.isArray(x) ? x : []; }
export function str(x) { return x == null ? '' : String(x).trim(); }
export function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
export function dirClass(d) { return d === 'up' ? 'up' : (d === 'down' ? 'down' : 'flat'); }
export function arrow(d) { return d === 'up' ? '▲ ' : (d === 'down' ? '▼ ' : '— '); }
export function joinBits(bits) { return bits.filter(x => x != null && String(x).trim() !== '').join(' · '); }

// ---- names ----
export function norm(x) { return String(x == null ? '' : x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
export function coreName(x) { return norm(String(x == null ? '' : x).replace(/\s*&\s*family\s*$/i, '')); }
export function slug(name) { return norm(name).replace(/ /g, '-'); }
export function storyMatches(story, name) {
  const n = coreName(name);
  if (!n || !story) return false;
  if (norm(story.who).indexOf(n) >= 0) return true;
  return arr(story.people).some(p => coreName(p) === n);
}
export function initials(name) {
  const ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').split(/\s+/).filter(x => /^[A-Za-zÀ-ɏ]/.test(x));
  if (!ws.length) return '•';
  return (ws[0].charAt(0) + (ws.length > 1 ? ws[ws.length - 1].charAt(0) : '')).toUpperCase();
}

// ---- dates and money ----
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function isoOf(x) { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(x || '')); return m ? m[1] : null; }
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? (MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1]) : (iso || '');
}
export function monYear(x) {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(String(x || '').trim());
  if (!m || +m[2] < 1 || +m[2] > 12) return x ? String(x) : '';
  return MONTHS[+m[2] - 1] + ' ' + m[1];
}
// "2026-09-24" -> "Thursday, September 24, 2026"
export function longDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
// ISO timestamp -> New York calendar date
export function nyIso(ts) {
  const d = new Date(ts);
  if (!ts || isNaN(d.getTime())) return isoOf(ts);
  return isoOf(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) || isoOf(ts);
}
// ISO timestamp -> "Sep 24, 2026 4:00 PM ET"
export function nyStamp(ts) {
  const d = new Date(ts);
  if (!ts || isNaN(d.getTime())) return '';
  const day = fmtDate(nyIso(ts));
  const t = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return day + ' ' + t + ' ET';
}
function compactNum(n) {
  let a = Math.abs(Number(n));
  if (n === null || n === '' || !isFinite(a)) return '';
  const units = ['', 'K', 'M', 'B', 'T'];
  let i = 0;
  while (i < units.length - 1 && a >= 999.95) { a /= 1000; i++; }
  if (i === 0) return String(Math.round(a));
  return String(a >= 99.95 ? Math.round(a) : Math.round(a * 10) / 10) + units[i];
}
export function fmtShares(n) { return compactNum(n); }
export function fmtUsd(n) { const c = compactNum(n); return c ? (Number(n) < 0 ? '-$' : '$') + c : ''; }
export function fmtPrice(p) { return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export function clip(s, max) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:·–—-]+$/, '') + '…';
}

// ---- sectors ----
const SECTOR_ART = { 'AI & tech': 'ai', 'Finance': 'finance', 'Aerospace': 'aerospace', 'Luxury & retail': 'luxury', 'Real estate': 'realestate', 'Energy': 'energy', 'Media': 'media', 'Autos': 'autos', 'Industrials': 'industrials', 'Health': 'health' };
export function sectorArt(s) { return '/assets/art/sector-' + (Object.prototype.hasOwnProperty.call(SECTOR_ART, s) ? SECTOR_ART[s] : 'other') + '.jpg'; }
export function sectorHref(s) { return '/sectors.html#' + slug(s); }
