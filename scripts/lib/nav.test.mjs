import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_JS } from './nav.mjs';

const COMMON = readFileSync(new URL('../../assets/common.js', import.meta.url), 'utf8');

test('NAV_JS parses as a script', () => {
  assert.doesNotThrow(() => new Function(NAV_JS));
});

test('NAV_JS renders phone menus in a body-level panel (iOS Safari)', () => {
  assert.match(NAV_JS, /matchMedia\('\(max-width: 699\.98px\)'\)/);
  assert.match(NAV_JS, /panel\.id='navpanel'/);
  assert.match(NAV_JS, /document\.body\.appendChild\(panel\)/);
  assert.match(NAV_JS, /panel\.appendChild\(ul\.cloneNode\(true\)\)/);
  assert.match(NAV_JS, /panel\.style\.top=Math\.round\(nav\?nav\.getBoundingClientRect\(\)\.bottom:0\)\+'px'/);
  assert.match(NAV_JS, /setAttribute\('aria-expanded','true'\)/);
  assert.match(NAV_JS, /setAttribute\('aria-controls','navpanel'\)/);
  assert.match(NAV_JS, /className\+=' js-navpanel'/);
  assert.match(NAV_JS, /window\.addEventListener\('scroll',onScroll,\{passive:true\}\)/);
  assert.match(NAV_JS, /window\.addEventListener\('resize',onResize\)/);
  assert.doesNotMatch(NAV_JS, /--navmore-top/);
});

test('assets/common.js BD.initNavMore has the same panel logic', () => {
  assert.match(COMMON, /matchMedia\('\(max-width: 699\.98px\)'\)/);
  assert.match(COMMON, /panel\.id = 'navpanel'/);
  assert.match(COMMON, /document\.body\.appendChild\(panel\)/);
  assert.match(COMMON, /panel\.appendChild\(ul\.cloneNode\(true\)\)/);
  assert.match(COMMON, /panel\.style\.top = Math\.round\(nav \? nav\.getBoundingClientRect\(\)\.bottom : 0\) \+ 'px'/);
  assert.match(COMMON, /setAttribute\('aria-expanded', 'true'\)/);
  assert.match(COMMON, /setAttribute\('aria-controls', 'navpanel'\)/);
  assert.match(COMMON, /className \+= ' js-navpanel'/);
  assert.match(COMMON, /w\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/);
  assert.match(COMMON, /w\.addEventListener\('resize', onResize\)/);
  assert.doesNotMatch(COMMON, /--navmore-top/);
});

test('site.css hides the real list on phones only when JS runs, and styles the panel', () => {
  const css = readFileSync(new URL('../../assets/site.css', import.meta.url), 'utf8');
  assert.match(css, /\.js-navpanel \.navmore>ul\{display:none !important\}/);
  assert.match(css, /\.navpanel\{position:fixed;/);
  assert.match(css, /\.navpanel\[hidden\]\{display:none\}/);
  assert.doesNotMatch(css, /--navmore-top/);
});
