// node --test scripts/lib/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFormerEntry, isNoteEntry } from './pages/companies.mjs';

test('isFormerEntry: former titles and old names are current', () => {
  assert.equal(isFormerEntry({ name: 'Alphabet Inc. (Google)', role: 'Co-founder; director since 1998; chair of board Executive Committee (former CEO of Google and Alphabet)', stake: '389,051,160 Class B shares' }), false);
  assert.equal(isFormerEntry({ name: 'Koch, Inc. (formerly Koch Industries; private)', stake: '~16% (Forbes estimate)' }), false);
  assert.equal(isFormerEntry({ name: 'Amazon.com, Inc. (received $35.6bn of Amazon stock in the 2019 divorce from Jeff Bezos; stake has fallen as she sold and gave away shares)', stake: '1.3%' }), false);
});

test('isFormerEntry: historical, exited and zero stakes are former', () => {
  assert.equal(isFormerEntry({ name: 'Tesla (early investor, historical)' }), true);
  assert.equal(isFormerEntry({ name: 'PropertyGuru Group — fully exited (0 shares) via BTN Investments 2 LLC', stake: '0%' }), true);
  assert.equal(isFormerEntry({ name: 'PropertyGuru Group', stake: '0% (exited)' }), true);
  assert.equal(isFormerEntry({ name: 'VodafoneThree (sold)' }), true);
});

test('isNoteEntry', () => {
  assert.equal(isNoteEntry({ name: 'Tesla, Inc.' }), false);
  assert.equal(isNoteEntry({ name: 'Other holdings: a, b' }), true);
  assert.equal(isNoteEntry(null), true);
});
