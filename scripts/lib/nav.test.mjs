import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_JS } from './nav.mjs';

test('NAV_JS parses as a script', () => {
  assert.doesNotThrow(() => new Function(NAV_JS));
});

test('NAV_JS pins phone menus under the nav and closes them on scroll/resize', () => {
  assert.match(NAV_JS, /setProperty\('--navmore-top',Math\.round\(nav\.getBoundingClientRect\(\)\.bottom\)\+'px'\)/);
  assert.match(NAV_JS, /window\.addEventListener\('scroll',onMove,\{passive:true\}\)/);
  assert.match(NAV_JS, /window\.addEventListener\('resize',onMove\)/);
});

test('assets/common.js BD.initNavMore has the same --navmore-top logic', () => {
  const src = readFileSync(new URL('../../assets/common.js', import.meta.url), 'utf8');
  assert.match(src, /setProperty\('--navmore-top', Math\.round\(nav\.getBoundingClientRect\(\)\.bottom\) \+ 'px'\)/);
  assert.match(src, /window\.addEventListener\('scroll', onMove, \{ passive: true \}\)/);
  assert.match(src, /window\.addEventListener\('resize', onMove\)/);
});
