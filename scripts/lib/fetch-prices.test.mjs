// node --test 'scripts/lib/*.test.mjs'
// scripts/fetch-prices.mjs: the quote entry (with the session open) and the dated series files (closes and opens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quoteEntry, appendSeries, collectSymbols, quoteSession, recordQuote, newStore, cleanSeries, dropTrailingUnconfirmed, qualityDoc, saveStore, loadStore } from '../fetch-prices.mjs';
import { replay, entryToQuote } from '../fetch-prices-repair.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { loadProfiles, loadCeos } from './data-common.mjs';

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

test('collectSymbols adds the CEO company tickers and leaves the people symbols as they were', async () => {
  const profiles = await loadProfiles();
  const ceos = await loadCeos();
  assert.ok(ceos.length > 0);
  const base = collectSymbols(profiles);
  const withCeos = collectSymbols(profiles, ceos);
  for (const s of base.symbols) assert.ok(withCeos.symbols.includes(s), s);
  for (const c of ceos) assert.ok(withCeos.symbols.includes(c.ticker), c.ticker);
  const added = withCeos.symbols.filter((s) => !base.symbols.includes(s));
  assert.deepEqual(added, [...new Set(ceos.map((c) => c.ticker))].filter((t) => !base.symbols.includes(t)).sort());
  assert.deepEqual(collectSymbols([], [{ slug: 'x', name: 'X', ticker: 'bad ticker' }]).symbols, ['SPY']);
});

// ---------- closes only ----------
const T = (iso) => Date.parse(iso) / 1000;
const NOW = (iso) => Date.parse(iso);

test('quoteSession: an intraday quote gives only the previous close; after the bell (or a later day) c is the close', () => {
  // Monday 2026-10-12 15:16 New York, market open: c is intraday
  const intra = quoteSession({ c: 777.34, pc: 778.57, o: 778.79, t: T('2026-10-12T19:16:11Z') }, NOW('2026-10-12T19:17:00Z'));
  assert.deepEqual(intra, { session: '2026-10-12', trading: true, eod: false, close: null, prevDate: '2026-10-09', prev: 778.57, open: 778.79 });
  // 16:00 New York stamp: final
  assert.equal(quoteSession({ c: 778.57, pc: 773.93, t: T('2026-10-09T20:00:00Z') }, NOW('2026-10-10T15:00:00Z')).close, 778.57);
  // last trade at 15:30 but fetched the next day: the session is over
  assert.equal(quoteSession({ c: 5, pc: 4, t: T('2026-10-09T19:30:00Z') }, NOW('2026-10-10T15:00:00Z')).close, 5);
  assert.equal(quoteSession({ c: 5, pc: 4, t: T('2026-10-09T19:30:00Z') }, NOW('2026-10-09T19:31:00Z')).close, null);
  // half day: 13:00 New York closes the 2026-11-27 session
  assert.equal(quoteSession({ c: 9, pc: 8, t: T('2026-11-27T18:00:00Z') }, NOW('2026-11-27T18:05:00Z')).close, 9);
  assert.equal(quoteSession({ c: 9, pc: 8, t: T('2026-11-27T17:59:00Z') }, NOW('2026-11-27T18:00:00Z')).close, null);
  // the day after Thanksgiving: previous close is Wednesday's
  assert.equal(quoteSession({ c: 9, pc: 8, t: T('2026-11-27T18:00:00Z') }).prevDate, '2026-11-25');
});

test('quoteSession: midnight-UTC OTC/ADR quotes are dated by their UTC date (IDEXY, LVMUY)', () => {
  // seen 2026-10-12 19:17 UTC: IDEXY t = 2026-10-09T00:00Z is Friday's session, not Thursday (New York 20:00 the day before)
  const idexy = quoteSession({ c: 15.08, pc: 14.85, o: 15.0401, t: T('2026-10-09T00:00:00Z') }, NOW('2026-10-12T19:17:08Z'));
  assert.deepEqual(idexy, { session: '2026-10-09', trading: true, eod: true, close: 15.08, prevDate: '2026-10-08', prev: 14.85, open: 15.0401 });
  // Monday's EOD stamp is Monday (never Sunday 2026-10-04 as before)
  const lvmuy = quoteSession({ c: 85.63, pc: 85.21, t: T('2026-10-05T00:00:00Z') }, NOW('2026-10-06T16:10:52Z'));
  assert.equal(lvmuy.session, '2026-10-05');
  assert.equal(lvmuy.prevDate, '2026-10-02');
  // a quote dated on a holiday stores nothing
  assert.equal(quoteSession({ c: 1, pc: 1, t: T('2026-11-26T00:00:00Z') }).trading, false);
  assert.equal(quoteSession({ c: 1 }), null);
});

test('recordQuote: intraday never stored, previous close repairs, conflicts quarantine and clear (PSKY 2026-10-05)', () => {
  const st = newStore();
  st.history.set('PSKY', new Map([['2026-10-01', 9.53], ['2026-10-02', 9.36]]));   // 10-02 written intraday by the old rules
  // Saturday: the Friday close (16:00 stamp) replaces the intraday value and is confirmed
  recordQuote(st, 'PSKY', { c: 9.5, pc: 9.34, t: T('2026-10-02T20:00:00Z') }, NOW('2026-10-03T14:26:53Z'));
  assert.equal(st.history.get('PSKY').get('2026-10-02'), 9.5);
  assert.equal(st.history.get('PSKY').get('2026-10-01'), 9.34);
  // Monday intraday with a bad previous close (4.75 vs our confirmed 9.5): keep ours, quarantine Monday, store no close
  const r = recordQuote(st, 'PSKY', { c: 9.68, pc: 4.75, t: T('2026-10-05T18:46:00Z') }, NOW('2026-10-05T18:47:32Z'));
  assert.deepEqual(r.conflict, { prevDate: '2026-10-02', vendorPrev: 4.75, ourPrev: 9.5, diffPct: -50 });
  assert.equal(st.history.get('PSKY').get('2026-10-02'), 9.5);
  assert.equal(st.history.get('PSKY').has('2026-10-05'), false);
  assert.deepEqual(Object.keys(st.conflicts.get('PSKY')), ['2026-10-05']);
  // Tuesday: an end-of-day quote for Monday agrees with our Friday close -> conflict cleared, Monday's close stored
  recordQuote(st, 'PSKY', { c: 9.775, pc: 9.5, t: T('2026-10-05T00:00:00Z') }, NOW('2026-10-06T16:10:52Z'));
  assert.equal(st.conflicts.has('PSKY'), false);
  assert.equal(st.history.get('PSKY').get('2026-10-05'), 9.775);
  assert.equal(st.history.get('PSKY').has('2026-10-04'), false);
  // within 2% of a confirmed close: the vendor's newer value wins
  recordQuote(st, 'PSKY', { c: 9.53, pc: 9.8, t: T('2026-10-06T00:00:00Z') }, NOW('2026-10-07T16:00:00Z'));
  assert.equal(st.history.get('PSKY').get('2026-10-05'), 9.8);
  const doc = qualityDoc(st, 'g', '2026-10-07');
  assert.deepEqual(doc.conflicts, {});
  assert.deepEqual(doc.confirmed.PSKY, ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06']);
});

test('cleanSeries drops weekend and holiday rows; dropTrailingUnconfirmed drops old intraday rows after the newest confirmed close', () => {
  assert.deepEqual(cleanSeries([['2026-10-05', 9.53], ['2026-10-04', 9.775], ['2026-11-26', 1], ['2026-10-02', 9.5], ['bad', 1], ['2026-10-06', 0]]),
    [['2026-10-02', 9.5], ['2026-10-05', 9.53]]);
  const st = newStore({ confirmed: { SPY: ['2026-10-08', '2026-10-09'] } });
  st.history.set('SPY', new Map([['2026-10-07', 1], ['2026-10-08', 2], ['2026-10-09', 3], ['2026-10-12', 777.34]]));
  st.history.set('NEW', new Map([['2026-10-12', 5]]));   // nothing confirmed: left alone
  assert.equal(dropTrailingUnconfirmed(st), 1);
  assert.deepEqual([...st.history.get('SPY').keys()], ['2026-10-07', '2026-10-08', '2026-10-09']);
  assert.equal(st.history.get('NEW').get('2026-10-12'), 5);
});

test('repair replay: snapshots fix the shifted ADR closes; files round-trip through saveStore/loadStore', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bd-repair-'));
  try {
    await mkdir(join(dir, 'history'), { recursive: true });
    // what the old rules wrote for IDEXY: every session one day early, one on a Sunday
    await writeFile(join(dir, 'history', 'IDEXY.json'), JSON.stringify([['2026-10-01', 14.96], ['2026-10-04', 14.86], ['2026-10-05', 15.03], ['2026-10-06', 14.85]]));
    const store = await loadStore(dir);
    assert.equal(store.history.get('IDEXY').has('2026-10-04'), false);  // weekend row dropped on load
    const snap = (generated, price, prevClose, time) => ({ generated, quotes: { IDEXY: { price, prevClose, time } } });
    replay(store, [
      snap('2026-10-05T18:47:32Z', 14.96, 14.84, '2026-10-02T00:00:00.000Z'),
      snap('2026-10-06T16:10:52Z', 14.86, 14.96, '2026-10-05T00:00:00.000Z'),
      snap('2026-10-07T16:50:04Z', 15.03, 14.86, '2026-10-06T00:00:00.000Z'),
      snap('2026-10-08T16:50:49Z', 14.85, 15.03, '2026-10-07T00:00:00.000Z'),
    ]);
    await saveStore(dir, store, 'g', NOW('2026-10-08T17:00:00Z'));
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'history', 'IDEXY.json'), 'utf8')),
      [['2026-10-01', 14.84], ['2026-10-02', 14.96], ['2026-10-05', 14.86], ['2026-10-06', 15.03], ['2026-10-07', 14.85]]);
    assert.equal(entryToQuote({ price: 1, time: 'nope' }), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
