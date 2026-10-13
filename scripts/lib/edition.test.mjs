import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillPeopleFromWho } from './edition.mjs';

const people = { people: [{ name: 'Elon Musk' }, { name: 'Larry Page' }, { name: 'Rob Walton & family' }] };
const ceos = { people: [{ name: 'Tim Cook' }] };

test('fillPeopleFromWho fills a missing or empty people list from an exact who', () => {
  const d = { stories: [
    { headline: 'a', who: 'Elon Musk' },                              // missing -> filled
    { headline: 'b', who: 'Tim Cook', people: [] },                   // empty, CEO -> filled
    { headline: 'c', who: 'Larry Page', people: ['Sergey Brin'] },    // already set -> untouched
    { headline: 'd', who: 'elon musk' },                              // not exact -> untouched
    { headline: 'e', who: 'Rob Walton' },                             // not exact ("& family") -> untouched
    { headline: 'f', who: 'Someone Else', people: null },             // unknown -> untouched
    { headline: 'g' }                                                 // no who -> untouched
  ] };
  const filled = fillPeopleFromWho(d, [people, ceos]);
  assert.deepEqual(filled, [{ headline: 'a', who: 'Elon Musk' }, { headline: 'b', who: 'Tim Cook' }]);
  assert.deepEqual(d.stories[0].people, ['Elon Musk']);
  assert.deepEqual(d.stories[1].people, ['Tim Cook']);
  assert.deepEqual(d.stories[2].people, ['Sergey Brin']);
  assert.equal(d.stories[3].people, undefined);
  assert.equal(d.stories[4].people, undefined);
  assert.equal(d.stories[5].people, null);
  assert.equal(d.stories[6].people, undefined);
});

test('fillPeopleFromWho tolerates missing indexes and stories', () => {
  assert.deepEqual(fillPeopleFromWho({}, [null, undefined]), []);
  assert.deepEqual(fillPeopleFromWho({ stories: [{ who: 'Elon Musk' }] }, []), []);
});
