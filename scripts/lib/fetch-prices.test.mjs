// node --test 'scripts/lib/*.test.mjs'
// scripts/fetch-prices.mjs: the quote entry (with the session open) and the dated series files (closes and opens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quoteEntry, appendSeries } from '../fetch-prices.mjs';

test('quoteEntry keeps the open only when it is a positive number', () => {
  const t = Date.parse('2026-09-25T20:00:00Z') / 1000;
  assert.deepEqual(quoteEntry({ c: 110, d: 2, dp: 1.85, pc: 108, o: 104.5, t }),
    { price: 110, change: 2, changePct: 1.85, prevClose: 108, open: 104.5, time: '2026-09-25T20:00:00.000Z' });
  for (const o of [0, -1, null, undefined, 'x', NaN]) assert.equal('open' in quoteEntry({ c: 110, o, t }), false, String(o));
  assert.equal(quoteEntry({ c: 0, o: 5, t }), null);
  assert.equal(quoteEntry({ c: 5, o: 5 }), null);
  assert.equal(quoteEntry(null), null);
});

test('appendSeries: one row per date, replaced on a rerun, sorted, capped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bd-opens-'));
  try {
    await appendSeries(dir, 'BRK.A', '2026-09-25', 750000);
    await appendSeries(dir, 'BRK.A', '2026-09-24', 749000);
    await appendSeries(dir, 'BRK.A', '2026-09-25', 751000);          // Saturday's run sees Friday's session again
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'BRK.A.json'), 'utf8')), [['2026-09-24', 749000], ['2026-09-25', 751000]]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
