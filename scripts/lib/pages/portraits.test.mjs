import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portraitFor, normName, SILHOUETTE } from './portraits.mjs';

test('known slug -> painted portrait path', () => {
  assert.equal(portraitFor('elon-musk'), '/assets/portraits/real/elon-musk.webp');
});

test('name with " & family" and accents -> painted portrait path', () => {
  assert.equal(normName('François Pinault & family'), 'francois pinault');
  assert.equal(portraitFor('François Pinault & family'), '/assets/portraits/real/francois-pinault-family.webp');
  assert.equal(portraitFor('  Rob   Walton & family '), '/assets/portraits/real/rob-walton-family.webp');
});

test('no painted portrait -> emblem card (by slug or name)', () => {
  assert.equal(portraitFor('dieter-schwarz'), '/assets/portraits/emblem/dieter-schwarz.svg');
  assert.equal(portraitFor('Germán Larrea Mota Velasco & family'), '/assets/portraits/emblem/german-larrea-mota-velasco-family.svg');
});

test('unknown name -> grey silhouette', () => {
  assert.equal(SILHOUETTE, '/assets/portraits/silhouette.webp');
  assert.equal(portraitFor('Nobody Anyone'), SILHOUETTE);
  assert.equal(portraitFor(''), SILHOUETTE);
  assert.equal(portraitFor(undefined), SILHOUETTE);
});
