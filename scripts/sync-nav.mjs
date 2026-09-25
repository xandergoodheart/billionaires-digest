// Rewrite the site nav and footer in every top-level .html from scripts/lib/nav.mjs.
// Blocks live between <!-- nav:start --> … <!-- nav:end --> and <!-- footer:start --> … <!-- footer:end -->.
// On first run the markers are inserted around the existing <nav class="sitenav"> and <footer> blocks.
// v2 pages (branch v2) carry <!-- v2topbar:start --> instead: they get the v2 top bar + sub-tabs, and, when they have
// the markers, <!-- v2tabs:start/end --> phone bottom tabs and <!-- v2footer:start/end --> footer. They never get the
// v1 nav/footer blocks, and v1 pages are left exactly as before.
//
//   node scripts/sync-nav.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNav, renderFooter, renderTopbarV2, renderBottomTabsV2, renderFooterV2 } from './lib/nav.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// page file -> active nav key
const ACTIVE = {
  'index.html': 'today', 'sectors.html': 'sectors', 'calendar.html': 'calendar', 'fantasy.html': 'fantasy', 'archive.html': 'archive', 'about.html': 'about',
  'flows.html': 'flows', 'quarterly.html': 'quarterly', 'copycat.html': 'copycat', 'network.html': 'network',
  'compare.html': 'compare', 'property.html': 'property',
  'leaderboard.html': 'leaderboard', 'leagues.html': 'leagues', 'markets.html': 'markets', 'book.html': 'book', 'play-terms.html': 'playterms'
};

// v2 page file -> [top section key, sub-tab key]
const V2_ACTIVE = {
  'team.html': ['fantasy', 'team'],
  'draft.html': ['fantasy', 'draft'],
  'design.html': ['fantasy', null]
};

// v2 blocks are only replaced between existing markers (never inserted)
function replaceMarked(html, name, block, file) {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const a = html.indexOf(start);
  if (a < 0) return html;
  const b = html.indexOf(end, a);
  if (b < 0) throw new Error(`${file}: ${name}:start without ${name}:end`);
  return html.slice(0, a) + start + '\n' + block + '\n' + html.slice(b);
}

function replaceBlock(html, name, openRe, closeTag, block, file) {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  if (!html.includes(start)) {
    const m = openRe.exec(html);
    if (!m) throw new Error(`${file}: no ${name} block found`);
    const close = html.indexOf(closeTag, m.index);
    if (close < 0) throw new Error(`${file}: unclosed ${name} block`);
    const stop = close + closeTag.length;
    html = html.slice(0, m.index) + start + '\n' + html.slice(m.index, stop) + '\n' + end + html.slice(stop);
  }
  const a = html.indexOf(start), b = html.indexOf(end, a);
  if (b < 0) throw new Error(`${file}: ${name}:start without ${name}:end`);
  return html.slice(0, a) + start + '\n' + block + '\n' + html.slice(b);
}

let changed = 0;
const files = (await readdir(ROOT)).filter(f => f.endsWith('.html')).sort();
for (const f of files) {
  const p = join(ROOT, f);
  const before = await readFile(p, 'utf8');
  if (before.includes('<!-- v2topbar:start -->')) {
    const [top, sub] = V2_ACTIVE[f] || [null, null];
    let v2 = replaceMarked(before, 'v2topbar', renderTopbarV2(top, sub), f);
    v2 = replaceMarked(v2, 'v2tabs', renderBottomTabsV2(top), f);
    v2 = replaceMarked(v2, 'v2footer', renderFooterV2(), f);
    if (v2 !== before) { await writeFile(p, v2); changed++; }
    console.log(`${v2 !== before ? 'updated' : 'unchanged'}  ${f}  (v2)${V2_ACTIVE[f] ? '' : '  (no active v2 key)'}`);
    continue;
  }
  let html = replaceBlock(before, 'nav', /<nav class="sitenav"[^>]*>/, '</nav>', renderNav(ACTIVE[f] || null), f);
  html = replaceBlock(html, 'footer', /<footer\b[^>]*>/, '</footer>', renderFooter(), f);
  if (html !== before) { await writeFile(p, html); changed++; }
  console.log(`${html !== before ? 'updated' : 'unchanged'}  ${f}${ACTIVE[f] ? '' : '  (no active nav key)'}`);
}
console.log(`sync-nav: ${changed} of ${files.length} files changed`);
