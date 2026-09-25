// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_V2, SUBNAV_V2, BOTTOM_V2, renderTopbarV2, renderBottomTabsV2, renderFooterV2, renderNav } from './nav.mjs';

const currentLinks = (html, attr) => [...html.matchAll(new RegExp(`<a [^>]*${attr}[^>]*>([^<]*)</a>`, 'g'))].map((m) => m[1]);

test('NAV_V2: five sections, fantasy sub-tabs', () => {
  assert.deepEqual(NAV_V2.map((n) => n.key), ['fantasy', 'players', 'rankings', 'calendar', 'news']);
  assert.deepEqual(SUBNAV_V2.fantasy.items.map((i) => i.label), ['My team', 'Draft room', 'Scores', 'Leagues', 'The Book', 'Rules']);
  assert.equal(SUBNAV_V2.fantasy.label, 'Billionaire Fantasy League');
  assert.deepEqual(BOTTOM_V2, ['fantasy', 'players', 'rankings', 'news']);
});

test('renderTopbarV2: section aria-current="true", sub-tab aria-current="page"', () => {
  const html = renderTopbarV2('fantasy', 'team');
  const top = html.slice(html.indexOf('<nav class="v2-topnav"'), html.indexOf('</nav>'));
  assert.deepEqual(currentLinks(top, 'aria-current="true"'), ['Fantasy']);
  const sub = html.slice(html.indexOf('<nav class="v2-subtabs"'));
  const subNav = sub.slice(0, sub.indexOf('</nav>'));
  assert.deepEqual(currentLinks(subNav, 'aria-current="page"'), ['My team']);
  assert.ok(subNav.includes('Billionaire Fantasy League'));
  // the phone menu marks the same page
  const menu = html.slice(html.indexOf('id="v2-menu"'));
  assert.deepEqual(currentLinks(menu, 'aria-current="page"'), ['My team']);
  assert.deepEqual(currentLinks(menu, 'aria-current="true"'), ['Fantasy']);
  assert.ok(html.includes('class="v2-skip" href="#main"'));
  assert.ok(html.includes('aria-controls="v2-menu"'));
  // exactly one page is marked
  assert.equal((html.match(/aria-current="page"/g) || []).length, 2); // sub-tab + menu entry
});

test('renderTopbarV2: draft sub-tab, and no sub-tab marked when subKey is null', () => {
  assert.deepEqual(currentLinks(renderTopbarV2('fantasy', 'draft'), 'aria-current="page"'), ['Draft room', 'Draft room']);
  const none = renderTopbarV2('fantasy', null);
  assert.equal((none.match(/aria-current="page"/g) || []).length, 0);
  assert.ok(none.includes('v2-subtabs'));
  // a section without sub-tabs renders no sub-tab bar
  assert.ok(!renderTopbarV2('players', null).includes('v2-subtabs'));
  assert.equal((renderTopbarV2(null, null).match(/aria-current/g) || []).length, 0);
});

test('renderTopbarV2: relative and absolute links', () => {
  const rel = renderTopbarV2('fantasy', 'team');
  assert.ok(rel.includes('href="team.html"') && rel.includes('href="people/"') && rel.includes('href="index.html"'));
  const abs = renderTopbarV2('fantasy', 'team', { absolute: true });
  assert.ok(abs.includes('href="/team.html"') && abs.includes('href="/people/"') && abs.includes('href="/"'));
  assert.ok(abs.includes('href="/fantasy.html#matchup"'));
  assert.ok(!/href="(?!\/|#)/.test(abs), 'every absolute link starts with / or #');
});

test('renderTopbarV2: labels are escaped', () => {
  const html = renderTopbarV2('fantasy', 'team');
  assert.ok(!/<a [^>]*>[^<]*&(?!amp;|lt;|gt;|quot;)[^<]*<\/a>/.test(html));
  // SUBNAV label with markup would be escaped
  const saved = SUBNAV_V2.fantasy.label;
  SUBNAV_V2.fantasy.label = 'A <b> & "c"';
  try {
    const h = renderTopbarV2('fantasy', 'team');
    assert.ok(h.includes('A &lt;b&gt; &amp; &quot;c&quot;'));
  } finally { SUBNAV_V2.fantasy.label = saved; }
});

test('renderBottomTabsV2: four tabs, active marked', () => {
  const html = renderBottomTabsV2('fantasy');
  assert.deepEqual([...html.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]), ['Fantasy', 'Players', 'Rankings', 'News']);
  assert.deepEqual(currentLinks(html, 'aria-current="true"'), ['Fantasy']);
  assert.deepEqual(currentLinks(renderBottomTabsV2('news'), 'aria-current'), ['News']);
  assert.ok(renderBottomTabsV2('fantasy', { absolute: true }).includes('href="/team.html"'));
});

test('renderFooterV2: disclaimers and links', () => {
  const html = renderFooterV2();
  assert.ok(html.includes('For information only · not financial advice'));
  assert.ok(html.includes('Play money only: no purchases, cash-out or prizes.'));
  assert.ok(html.includes('href="about.html"') && html.includes('href="about.html#corrections"') && html.includes('href="play-terms.html"'));
  assert.ok(renderFooterV2({ absolute: true }).includes('href="/play-terms.html"'));
});

test('v1 renderNav is unchanged by the v2 additions', () => {
  const html = renderNav('fantasy');
  assert.ok(html.startsWith('<nav class="sitenav"'));
  assert.ok(html.includes('<a href="fantasy.html" aria-current="page">My team</a>'));
});
