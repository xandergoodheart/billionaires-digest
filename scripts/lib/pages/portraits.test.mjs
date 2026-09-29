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

test('unknown name -> grey silhouette', () => {
  assert.equal(SILHOUETTE, '/assets/portraits/silhouette.webp');
  assert.equal(portraitFor('Nobody Anyone'), SILHOUETTE);
  assert.equal(portraitFor(''), SILHOUETTE);
  assert.equal(portraitFor(undefined), SILHOUETTE);
});
