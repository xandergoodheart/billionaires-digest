import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './data-common.mjs';

const readJson = async (rel) => JSON.parse(await readFile(join(ROOT, rel), 'utf8'));

test('every person and every CEO has a unique nickname of at most 4 words starting with "The "', async () => {
  const index = await readJson('data/people/index.json');
  const ceos = await readJson('data/ceos/index.json');
  const nicknames = await readJson('data/fantasy/nicknames.json');
  const slugs = index.people.map((p) => p.slug).concat(ceos.people.map((p) => p.slug));
  const seen = new Set();
  for (const slug of slugs) {
    const nick = nicknames[slug];
    assert.equal(typeof nick, 'string', `missing nickname for ${slug}`);
    assert.ok(nick.trim().length > 0, `empty nickname for ${slug}`);
    assert.ok(nick.startsWith('The '), `${slug}: "${nick}" should start with "The "`);
    assert.ok(nick.trim().split(/\s+/).length <= 4, `${slug}: "${nick}" is more than 4 words`);
    assert.ok(!seen.has(nick.toLowerCase()), `duplicate nickname "${nick}"`);
    seen.add(nick.toLowerCase());
  }
  const extra = Object.keys(nicknames).filter((s) => !slugs.includes(s));
  assert.deepEqual(extra, [], 'nicknames for slugs not in data/people/index.json or data/ceos/index.json');
  assert.deepEqual(Object.keys(nicknames), [...Object.keys(nicknames)].sort(), 'nicknames.json keys are sorted');
});
