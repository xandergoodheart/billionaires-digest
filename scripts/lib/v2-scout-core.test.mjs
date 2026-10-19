// node --test scripts/lib/
// Scouting / watch-list helpers (assets/v2/scout-core.js, an ES5 browser file) loaded into a node:vm context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'assets', 'v2', 'scout-core.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx, { filename: 'scout-core.js' });
const S = ctx.BDScoutCore;
const plain = (x) => JSON.parse(JSON.stringify(x));

test('buyDay: newest insider-buy day on or after the cut', () => {
  const days = {
    '2026-10-01': { people: { a: { bonuses: { insiderBuy: 5 } } } },
    '2026-10-08': { people: { a: { bonuses: { insiderBuy: 5 } }, b: { bonuses: { insiderBuy: 0 } } } },
    '2026-10-09': { people: { a: { bonuses: {} } } }
  };
  assert.equal(S.buyDay(days, 'a', '2026-10-02'), '2026-10-08');
  assert.equal(S.buyDay(days, 'a', '2026-10-09'), null);
  assert.equal(S.buyDay(days, 'b', '2026-09-01'), null);
  assert.equal(S.buyDay(null, 'a', '2026-09-01'), null);
});

test('buyFiling: newest Form 4 with a code P purchase and a safe URL', () => {
  const f = (filed, code, url = 'https://www.sec.gov/x') => ({ filed, url, form4: { transactions: [{ code }] } });
  const data = { filings: [f('2026-10-05', 'P'), f('2026-10-07', 'S'), f('2026-10-06', 'P', 'javascript:alert(1)'), f('2026-09-01', 'P')] };
  assert.equal(S.buyFiling(data, '2026-10-01').filed, '2026-10-05');
  assert.equal(S.buyFiling(data, '2026-10-06'), null);
  assert.equal(S.buyFiling(null, '2026-10-01'), null);
});

test('earnings: exact-day results in the current or next week only', () => {
  const weeks = [{ week: 'w1', start: '2026-10-05', end: '2026-10-09' }, { week: 'w2', start: '2026-10-12', end: '2026-10-16' }, { week: 'w3', start: '2026-10-19', end: '2026-10-23' }];
  const ev = (date, extra = {}) => ({ type: 'events', precision: 'day', date, title: 'Acme Q3 results', people: [{ slug: 'a' }], ...extra });
  const cal = { events: [ev('2026-10-20'), ev('2026-10-14'), ev('2026-10-13', { approx: true }), ev('2026-10-12', { title: 'Acme investor day' }), ev('2026-10-26')] };
  assert.deepEqual(plain(S.earnings(cal, weeks, 'w2', 'a')), { e: ev('2026-10-14'), thisWeek: true });
  assert.equal(S.earnings(cal, weeks, 'w2', 'b'), null);
  assert.equal(S.earnings({ events: [ev('2026-10-20')] }, weeks, 'w2', 'a').thisWeek, false);
  assert.equal(S.earnings(cal, weeks, 'nope', 'a'), null);
  assert.equal(S.earnings(null, weeks, 'w2', 'a'), null);
});

test('recentDates + chartRows: last n non-practice days, null for no score', () => {
  const w1 = { days: ['2026-10-06', '2026-10-07'], daily: { '2026-10-06': { a: 3 }, '2026-10-07': { b: 1 } } };
  const w2 = { days: ['2026-10-13'], daily: { '2026-10-13': { a: -2 } } };
  const pr = { practice: true, days: ['2026-09-01'], daily: { '2026-09-01': { a: 9 } } };
  const ds = S.recentDates([w2, w1, pr, null], 10);
  assert.deepEqual(plain(ds), ['2026-10-06', '2026-10-07', '2026-10-13']);
  assert.deepEqual(plain(S.recentDates([w2, w1], 2)), ['2026-10-07', '2026-10-13']);
  assert.deepEqual(plain(S.chartRows([w2, w1], ds, 'a')), [{ d: '2026-10-06', v: 3 }, { d: '2026-10-07', v: null }, { d: '2026-10-13', v: -2 }]);
});

test('latestMover: newest entry for a held ticker in the window, with a source', () => {
  const m = (ticker, date, extra = {}) => ({ ticker, date, why: ticker + ' moved.', sourceUrl: 'https://news.example/x', ...extra });
  const movers = {
    'AAA@2026-10-06': m('AAA', '2026-10-06'),
    'AAA@2026-10-13': m('AAA', '2026-10-13'),
    'BBB@2026-10-13': m('BBB', '2026-10-13', { players: ['a'] }),
    'AAA@2026-10-14': m('AAA', '2026-10-14', { sourceUrl: '' }),
    'CCC@2026-10-15': m('CCC', '2026-10-15')
  };
  const ds = ['2026-10-06', '2026-10-13', '2026-10-14', '2026-10-15'];
  assert.equal(S.latestMover(movers, ['AAA', 'BBB'], ds, 'a').ticker, 'BBB');   // same day: the one naming the player
  assert.equal(S.latestMover(movers, ['AAA'], ds, 'a').date, '2026-10-13');     // the 10-14 entry has no source
  assert.equal(S.latestMover(movers, ['AAA'], ['2026-10-01'], 'a'), null);
  assert.equal(S.latestMover(null, ['AAA'], ds, 'a'), null);
});

test('whoLine: CEO bio sentences or the first control role, never invented', () => {
  const ceo = { bio: 'Jane Doe has led Acme Corp. since 2020. Before that she ran its cloud unit. She also chairs a museum board and a school.', sources: [{ url: 'https://sec.gov/a' }] };
  const w = S.whoLine(null, ceo);
  assert.equal(w.url, 'https://sec.gov/a');
  assert.ok(ceo.bio.startsWith(w.text.replace(/…$/, '')));
  const prof = { controls: [{ name: 'Acme Corp (private) — revenue $9.2B', role: 'Chairman and CEO', source: 'https://forbes.com/x' }] };
  assert.deepEqual(plain(S.whoLine(prof, null)), { text: 'Chairman and CEO · Acme Corp (private).', url: 'https://forbes.com/x' });
  assert.deepEqual(plain(S.whoLine({ controls: [{ name: 'Acme', source: 'javascript:x' }] }, null)), { text: 'Acme.', url: null });
  const long = { controls: [{ name: 'Palantir Technologies Inc.', role: 'Co-founder, director; one of three founders controlling the Founder Voting Trust (all Class F shares)' }] };
  assert.equal(S.whoLine(long, null).text, 'Co-founder, director · Palantir Technologies Inc.');
  assert.equal(S.whoLine({ controls: [] }, { bio: '' }), null);
  assert.equal(S.whoLine(null, null), null);
});

test('firstSentences: whole sentences within the limit, abbreviations kept together', () => {
  assert.equal(S.firstSentences('Short.', 50), 'Short.');
  assert.equal(S.firstSentences('He joined Acme Inc. in 2010. He sold it in 2020. Then he retired early.', 50), 'He joined Acme Inc. in 2010. He sold it in 2020.');
  assert.equal(S.firstSentences('one two three four five six', 12), 'one two…');
});

test('step: previous / next in the list, null at the ends', () => {
  const l = ['a', 'b', 'c'];
  assert.equal(S.step(l, 'b', 1), 'c');
  assert.equal(S.step(l, 'b', -1), 'a');
  assert.equal(S.step(l, 'c', 1), null);
  assert.equal(S.step(l, 'a', -1), null);
  assert.equal(S.step(l, 'z', 1), null);
});

test('barPath: closed path from the baseline up or down', () => {
  assert.match(S.barPath(0, 8, 20, 5), /^M0,20V7Q0,5 2,5H6Q8,5 8,7V20Z$/);
  assert.match(S.barPath(0, 8, 20, 30), /^M0,20V28Q0,30 2,30H6Q8,30 8,28V20Z$/);
});
