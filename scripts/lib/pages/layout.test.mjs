import { test } from 'node:test';
import assert from 'node:assert/strict';
import { page, navKeysV2 } from './layout.mjs';

test('navKeysV2: generated page sections', () => {
  assert.deepEqual(navKeysV2('/people/elon-musk/'), ['news', 'people']);
  assert.deepEqual(navKeysV2('/people/'), ['news', 'people']);
  assert.deepEqual(navKeysV2('/companies/tesla/'), ['news', 'companies']);
  assert.deepEqual(navKeysV2('/editions/2026-09-26/'), ['news', 'archive']);
  assert.deepEqual(navKeysV2('/guides/filings-101/'), ['tools', 'filings101']);
  assert.deepEqual(navKeysV2('/other/'), [null, null]);
});

test('page: v2 chrome + newsroom stylesheet, no v1 chrome, content and SEO kept', () => {
  const html = page({
    title: 'T & co', description: 'D', path: '/people/x/', ogImage: 'https://billionairesdigest.com/og/latest.png',
    jsonLd: [{ '@type': 'Person', name: 'X' }], dateline: 'People · #1 of 100', updated: 'Net worths as of Sep 1, 2026',
    body: '<p id="content">Body</p>', css: '.x{color:red}'
  });
  assert.match(html, /<body class="v2 nw">/);
  assert.match(html, /href="\/assets\/v2\/tokens\.css"/);
  assert.match(html, /href="\/assets\/v2\/ui\.css"/);
  assert.match(html, /href="\/assets\/v2\/news\.css"/);
  assert.match(html, /<script src="\/assets\/v2\/chrome\.js"><\/script>/);
  assert.match(html, /class="v2-top"/);
  assert.match(html, /class="v2-tabs"/);
  assert.match(html, /class="v2-foot"/);
  assert.match(html, /For information only · not financial advice/);
  assert.match(html, /<main id="main" class="nw-main" tabindex="-1">\n<p id="content">Body<\/p>\n<\/main>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/billionairesdigest\.com\/people\/x\/">/);
  assert.match(html, /<title>T &amp; co<\/title>/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /<style>\n\.x\{color:red\}\n<\/style>/);
  assert.match(html, /People · #1 of 100/);
  // links are absolute on generated pages
  assert.match(html, /href="\/index\.html"|href="\/"/);
  assert.doesNotMatch(html, /site\.css|themebtn|class="sitenav"|class="topstrip"|class="mast"/);
});
