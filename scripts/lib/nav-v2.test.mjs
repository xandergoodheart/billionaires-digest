// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_V2, SUBNAV_V2, BOTTOM_V2, renderTopbarV2, renderBottomTabsV2, renderFooterV2, renderNav } from './nav.mjs';

const currentLinks = (html, attr) => [...html.matchAll(new RegExp(`<a [^>]*${attr}[^>]*>([^<]*)</a>`, 'g'))].map((m) => m[1]);

test('NAV_V2: five sections, play sub-tabs', () => {
  assert.deepEqual(NAV_V2.map((n) => n.key), ['play', 'learn', 'players', 'news', 'tools']);
  assert.deepEqual(NAV_V2.map((n) => n.label), ['Play', 'Learn', 'Players', 'News', 'Tools']);
  assert.deepEqual(NAV_V2.map((n) => n.href), ['index.html', 'academy.html', 'players.html', 'news.html', 'flows.html']);
  assert.deepEqual(SUBNAV_V2.play.items.map((i) => i.label), ['My team', 'Draft room', 'Scores', 'Leagues', 'The Book', 'Next Moves', 'Rules']);
  assert.equal(SUBNAV_V2.play.label, 'Billionaire Fantasy League');
  assert.deepEqual(BOTTOM_V2, ['play', 'learn', 'players', 'news']);
  assert.ok(!NAV_V2.some((n) => n.key === 'rankings'));
});

test('renderTopbarV2: section aria-current="true", sub-tab aria-current="page"', () => {
  const html = renderTopbarV2('play', 'team');
  const top = html.slice(html.indexOf('<nav class="v2-topnav"'), html.indexOf('</nav>'));
  assert.deepEqual(currentLinks(top, 'aria-current="true"'), ['Play']);
  const sub = html.slice(html.indexOf('<nav class="v2-subtabs"'));
  const subNav = sub.slice(0, sub.indexOf('</nav>'));
  assert.deepEqual(currentLinks(subNav, 'aria-current="page"'), ['My team']);
  assert.ok(subNav.includes('Billionaire Fantasy League'));
  // the phone menu marks the same page
  const menu = html.slice(html.indexOf('id="v2-menu"'));
  assert.deepEqual(currentLinks(menu, 'aria-current="page"'), ['My team']);
  assert.deepEqual(currentLinks(menu, 'aria-current="true"'), ['Play']);
  assert.ok(html.includes('class="v2-skip" href="#main"'));
  assert.ok(html.includes('aria-controls="v2-menu"'));
  // exactly one page is marked
  assert.equal((html.match(/aria-current="page"/g) || []).length, 2); // sub-tab + menu entry
});

test('renderTopbarV2: draft sub-tab, and no sub-tab marked when subKey is null', () => {
  assert.deepEqual(currentLinks(renderTopbarV2('play', 'draft'), 'aria-current="page"'), ['Draft room', 'Draft room']);
  const none = renderTopbarV2('play', null);
  assert.equal((none.match(/aria-current="page"/g) || []).length, 0);
  assert.ok(none.includes('v2-subtabs'));
  // a section without sub-tabs renders no sub-tab bar
  assert.ok(!renderTopbarV2('players', null).includes('v2-subtabs'));
  assert.equal((renderTopbarV2(null, null).match(/aria-current/g) || []).length, 0);
});

test('renderTopbarV2: relative and absolute links', () => {
  const rel = renderTopbarV2('play', 'team');
  assert.ok(rel.includes('href="team.html"') && rel.includes('href="players.html"') && rel.includes('href="index.html"') && rel.includes('href="news.html"'));
  const abs = renderTopbarV2('play', 'team', { absolute: true });
  assert.ok(abs.includes('href="/team.html"') && abs.includes('href="/players.html"') && abs.includes('href="/"'));
  assert.ok(abs.includes('href="/scores.html"'));
  assert.ok(abs.includes('href="/flows.html"') && abs.includes('href="/guides/filings-101/"') && abs.includes('href="/people/"'));
  assert.ok(!/href="(?!\/|#)/.test(abs), 'every absolute link starts with / or #');
});

test('renderTopbarV2: labels are escaped', () => {
  const html = renderTopbarV2('play', 'team');
  assert.ok(!/<a [^>]*>[^<]*&(?!amp;|lt;|gt;|quot;)[^<]*<\/a>/.test(html));
  // SUBNAV label with markup would be escaped
  const saved = SUBNAV_V2.play.label;
  SUBNAV_V2.play.label = 'A <b> & "c"';
  try {
    const h = renderTopbarV2('play', 'team');
    assert.ok(h.includes('A &lt;b&gt; &amp; &quot;c&quot;'));
  } finally { SUBNAV_V2.play.label = saved; }
});

test('renderBottomTabsV2: four tabs, active marked', () => {
  const html = renderBottomTabsV2('play');
  assert.deepEqual([...html.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]), ['Play', 'Learn', 'Players', 'News']);
  assert.deepEqual(currentLinks(html, 'aria-current="true"'), ['Play']);
  assert.deepEqual(currentLinks(renderBottomTabsV2('news'), 'aria-current'), ['News']);
  assert.ok(renderBottomTabsV2('play', { absolute: true }).includes('href="/"'));
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

test('NAV_V2 links: Scores sub-tab points at scores.html', () => {
  assert.equal(SUBNAV_V2.play.items.find((i) => i.key === 'scores').href, 'scores.html');
  assert.deepEqual(SUBNAV_V2.play.items.map((i) => i.key), ['team', 'draft', 'scores', 'leagues', 'book', 'moves', 'rules']);
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
  assert.ok(renderBottomTabsV2('play', { absolute: true }).includes('href="/players.html"'));
});

test('Learn section: top bar, two sub-tabs (Academy + Billionaire Life), phone menu, bottom tabs', () => {
  assert.equal(NAV_V2.find((n) => n.key === 'learn').href, 'academy.html');
  assert.equal(NAV_V2.find((n) => n.key === 'learn').label, 'Learn');
  assert.equal(SUBNAV_V2.learn.label, 'Billionaires Digest Academy');
  assert.deepEqual(SUBNAV_V2.learn.items, [
    { key: 'academy', label: 'Academy', href: 'academy.html' },
    { key: 'hub', label: 'Billionaire Life', href: 'life.html' }
  ]);
  const html = renderTopbarV2('learn', 'hub');
  const top = html.slice(html.indexOf('<nav class="v2-topnav"'), html.indexOf('</nav>'));
  assert.deepEqual(currentLinks(top, 'aria-current="true"'), ['Learn']);
  const sub = html.slice(html.indexOf('<nav class="v2-subtabs"'));
  const subNav = sub.slice(0, sub.indexOf('</nav>'));
  assert.deepEqual(currentLinks(subNav, 'aria-current="page"'), ['Billionaire Life']);
  assert.ok(subNav.includes('Billionaires Digest Academy'));
  const menu = html.slice(html.indexOf('id="v2-menu"'));
  assert.ok(menu.includes('<a class="v2-menu__top" href="academy.html" aria-current="true">Learn</a>'));
  assert.deepEqual(currentLinks(menu, 'aria-current="page"'), ['Billionaire Life']);
  assert.ok(renderTopbarV2('play', 'team').includes('<a class="v2-menu__top" href="academy.html">Learn</a>'));
  assert.ok(renderTopbarV2('learn', 'hub', { absolute: true }).includes('href="/life.html"'));
  assert.deepEqual(currentLinks(renderBottomTabsV2('learn'), 'aria-current'), ['Learn']);
});

test('Academy page: Learn section active, Academy sub-tab is the current page', () => {
  const html = renderTopbarV2('learn', 'academy');
  const top = html.slice(html.indexOf('<nav class="v2-topnav"'), html.indexOf('</nav>'));
  assert.deepEqual(currentLinks(top, 'aria-current="true"'), ['Learn']);
  const sub = html.slice(html.indexOf('<nav class="v2-subtabs"'));
  const subNav = sub.slice(0, sub.indexOf('</nav>'));
  assert.ok(subNav.includes('<a href="academy.html" aria-current="page">Academy</a>'));
  assert.deepEqual(currentLinks(subNav, 'aria-current="page"'), ['Academy']);
  const menu = html.slice(html.indexOf('id="v2-menu"'));
  assert.deepEqual(currentLinks(menu, 'aria-current="page"'), ['Academy']);
  assert.ok(renderTopbarV2('play', 'team').includes('<li><a href="academy.html">Academy</a></li>'));
  assert.ok(renderTopbarV2('learn', 'academy', { absolute: true }).includes('href="/academy.html"'));
});

test('News and Tools sections: sub-tabs, absolute links for generated pages', () => {
  assert.deepEqual(SUBNAV_V2.news.items.map((i) => i.key), ['today', 'people', 'companies', 'sectors', 'calendar', 'archive']);
  assert.equal(SUBNAV_V2.news.label, 'The Digest');
  assert.deepEqual(SUBNAV_V2.tools.items.map((i) => i.key), ['flows', 'quarterly', 'copycat', 'network', 'compare', 'property', 'filings101']);
  const people = renderTopbarV2('news', 'people', { absolute: true });
  const sub = people.slice(people.indexOf('<nav class="v2-subtabs"'));
  assert.ok(sub.slice(0, sub.indexOf('</nav>')).includes('<a href="/people/" aria-current="page">People</a>'));
  const guide = renderTopbarV2('tools', 'filings101', { absolute: true });
  assert.ok(guide.includes('<a href="/guides/filings-101/" aria-current="page">Filings 101</a>'));
  const top = guide.slice(guide.indexOf('<nav class="v2-topnav"'), guide.indexOf('</nav>'));
  assert.deepEqual(currentLinks(top, 'aria-current="true"'), ['Tools']);
  assert.ok(!BOTTOM_V2.includes('tools'));
  assert.ok(!renderBottomTabsV2('tools').includes('aria-current'));
});

test('Play is the front door (index.html, "/" absolute); News lives at news.html', () => {
  const rel = renderTopbarV2('play', null);
  const top = rel.slice(rel.indexOf('<nav class="v2-topnav"'), rel.indexOf('</nav>'));
  assert.ok(top.includes('<a href="index.html" aria-current="true">Play</a>'));
  assert.ok(top.includes('<a href="news.html">News</a>'));
  assert.ok(rel.includes('<a class="v2-mark" href="index.html">'));
  assert.ok(rel.includes('<a class="v2-btn v2-btn--primary v2-top__cta" href="team.html">My team</a>'));
  assert.equal((rel.match(/aria-current="page"/g) || []).length, 0);
  const news = renderTopbarV2('news', 'today');
  const sub = news.slice(news.indexOf('<nav class="v2-subtabs"'));
  assert.ok(sub.slice(0, sub.indexOf('</nav>')).includes('<a href="news.html" aria-current="page">Today</a>'));
  assert.ok(news.includes('<a class="v2-menu__top" href="news.html" aria-current="true">News</a>'));
  const abs = renderTopbarV2('news', 'people', { absolute: true });
  assert.ok(abs.includes('<a class="v2-mark" href="/">'));
  assert.ok(abs.includes('<a href="/">Play</a>') && abs.includes('href="/news.html"'));
  assert.ok(!abs.includes('href="/index.html"'));
  const tabs = renderBottomTabsV2('play');
  assert.ok(tabs.includes('<a href="index.html" aria-current="true">Play</a>') && tabs.includes('<a href="news.html">News</a>'));
  assert.ok(renderFooterV2().includes('<a class="v2-mark v2-mark--sm" href="index.html">'));
  assert.ok(renderFooterV2({ absolute: true }).includes('<a class="v2-mark v2-mark--sm" href="/">'));
  assert.ok(renderNav('today').includes('<a href="news.html" aria-current="page">Today</a>'));
});
