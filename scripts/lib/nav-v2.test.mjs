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
  assert.ok(rel.includes('href="team.html"') && rel.includes('href="players.html"') && rel.includes('href="index.html"'));
  const abs = renderTopbarV2('fantasy', 'team', { absolute: true });
  assert.ok(abs.includes('href="/team.html"') && abs.includes('href="/players.html"') && abs.includes('href="/"'));
  assert.ok(abs.includes('href="/scores.html"'));
  assert.ok(abs.includes('href="/scores.html#leaderboard"'));
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
  assert.ok(html.includes('<a href="team.html" aria-current="page">My team</a>'));
});

test('NAV_V2 links: Scores sub-tab and Rankings point at scores.html', () => {
  assert.equal(SUBNAV_V2.fantasy.items.find((i) => i.key === 'scores').href, 'scores.html');
  assert.equal(NAV_V2.find((n) => n.key === 'rankings').href, 'scores.html#leaderboard');
  assert.deepEqual(SUBNAV_V2.fantasy.items.map((i) => i.key), ['team', 'draft', 'scores', 'leagues', 'book', 'rules']);
});

test('v1 Fantasy menu links into the v2 section', () => {
  const html = renderNav('leagues');
  for (const [href, label] of [['team.html', 'My team'], ['draft.html', 'Draft room'], ['scores.html', 'Scores'],
    ['scores.html#leaderboard', 'Leaderboard'], ['leagues.html', 'Leagues'], ['book.html', 'The Book'], ['play-terms.html', 'Game rules']]) {
    assert.ok(html.includes(`<a href="${href}"`) && html.includes(`>${label}</a>`), label);
  }
  assert.ok(html.includes('<a href="leagues.html" aria-current="page">Leagues</a>'));
  assert.ok(!html.includes('href="fantasy.html"') && !html.includes('href="leaderboard.html"'));
});

test('Players section: v2 players.html in the top bar, phone menu and bottom tabs; no sub-tabs', () => {
  assert.equal(NAV_V2.find((n) => n.key === 'players').href, 'players.html');
  assert.equal(SUBNAV_V2.players, undefined);
  const html = renderTopbarV2('players', null);
  const top = html.slice(html.indexOf('<nav class="v2-topnav"'), html.indexOf('</nav>'));
  assert.ok(top.includes('<a href="players.html" aria-current="true">Players</a>'));
  const menu = html.slice(html.indexOf('id="v2-menu"'));
  assert.ok(menu.includes('<a class="v2-menu__top" href="players.html" aria-current="true">Players</a>'));
  assert.ok(!html.includes('v2-subtabs'));
  const tabs = renderBottomTabsV2('players');
  assert.ok(tabs.includes('<a href="players.html" aria-current="true">Players</a>'));
  assert.deepEqual(currentLinks(tabs, 'aria-current'), ['Players']);
  assert.ok(renderBottomTabsV2('fantasy', { absolute: true }).includes('href="/players.html"'));
});
