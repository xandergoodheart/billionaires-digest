import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { emblemSvg, emblemPeople, initialsOf, paletteFor, ICONS, ICON_OVERRIDES } from '../build-emblems.mjs';

test('initials: first + last word, accents dropped, overrides win', () => {
  assert.equal(initialsOf('Dieter Schwarz', 'dieter-schwarz'), 'DS');
  assert.equal(initialsOf('Vicky Safra & family', 'vicky-safra-family'), 'VS');
  assert.equal(initialsOf('Germán Larrea Mota Velasco & family', 'german-larrea-mota-velasco-family'), 'GL');
});

test('emblem SVG: square, small, title only, no <text>', async () => {
  const svg = await emblemSvg({ name: 'Dieter Schwarz', slug: 'dieter-schwarz', plate: '#F1E2E1', icon: 'retail' });
  assert.match(svg, /viewBox="0 0 512 512"/);
  assert.match(svg, /<title>Dieter Schwarz<\/title>/);
  assert.doesNotMatch(svg, /<text/);
  assert.ok(Buffer.byteLength(svg) < 6144, 'under 6 KB');
  assert.equal((svg.match(/Dieter|Schwarz/g) || []).length, 2, 'name appears only in the title');
});

test('palette deepens toward the edge', () => {
  const p = paletteFor('#DCE6F2');
  const lum = h => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  assert.ok(lum(p.hi) > lum(p.mid) && lum(p.mid) > lum(p.edge));
});

test('every override names a drawn icon', () => {
  for (const k of Object.values(ICON_OVERRIDES)) assert.ok(ICONS[k], k);
});

test('emblem people have no painted portrait and their file exists', () => {
  const js = readFileSync(new URL('../../assets/v2/portraits.js', import.meta.url), 'utf8');
  for (const p of emblemPeople()) {
    assert.ok(!existsSync(new URL(`../../assets/portraits/real/${p.slug}.webp`, import.meta.url)), p.slug);
    assert.ok(existsSync(new URL(`../../assets/portraits/emblem/${p.slug}.svg`, import.meta.url)), p.slug);
    assert.ok(js.includes(`P['${p.slug}'] = { img: '/assets/portraits/emblem/${p.slug}.svg', emblem: true };`), p.slug);
  }
});
