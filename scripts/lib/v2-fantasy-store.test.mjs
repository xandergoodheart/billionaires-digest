// node --test scripts/lib/
// v2 fantasy store (assets/v2/fantasy-store.js, an ES5 browser file) loaded into a node:vm context with a stub BD,
// a fake localStorage and a ?now= test clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = readFileSync(join(ROOT, 'assets', 'fantasy-core.js'), 'utf8');
const STORE = readFileSync(join(ROOT, 'assets', 'v2', 'fantasy-store.js'), 'utf8');

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
function load({ search = '', storage = fakeStorage() } = {}) {
  const ctx = vm.createContext({
    localStorage: storage,
    location: { search },
    BD: { arr: (x) => (Array.isArray(x) ? x : []), MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
  });
  vm.runInContext(CORE, ctx, { filename: 'fantasy-core.js' });
  vm.runInContext(STORE, ctx, { filename: 'fantasy-store.js' });
  return { F: ctx.BDFantasyStore, C: ctx.BDFantasyCore, storage };
}
// plain JSON copy (objects from the vm context have another realm's prototypes)
const plain = (x) => JSON.parse(JSON.stringify(x));

const WK = {
  week: '2026-W40', practice: false, start: '2026-09-28', end: '2026-10-02', final: false,
  salaries: { a: 30, b: 25, c: 20, d: 15, e: 10, f: 5 },
  draftable: ['a', 'b', 'c', 'd', 'e', 'f'].map((s, i) => ({ slug: s, name: 'Person ' + s.toUpperCase(), rank: i + 1, sector: 'Finance', holdings: [] })),
  days: ['2026-09-28', '2026-09-29', '2026-09-30'],
  daily: {
    '2026-09-28': { a: 10, b: -4, c: 7, d: 0, e: 3 },
    '2026-09-29': { a: 5, b: 6, c: -2, d: 1, e: 0 },
    '2026-09-30': { a: 3, b: 2, c: 1, d: 1, e: 1 },
  },
  benchmarks: { spy: 20 },
};

test('teamWeek: captain scores 1.5x per day (rounded), base points kept apart', () => {
  const { F } = load();
  const r = plain(F.pure.teamWeek(WK, { picks: ['a', 'b', 'c', 'd', 'e'], captain: 'a' }));
  // captain a: round(10*1.5)=15, round(5*1.5)=8 (7.5 -> 8), round(3*1.5)=5 (4.5 -> 5)
  assert.equal(r.bySlug.a, 15 + 8 + 5);
  assert.equal(r.baseBySlug.a, 18);
  assert.equal(r.bySlug.b, 4);
  assert.equal(r.baseBySlug.b, 4);
  assert.equal(r.byDay['2026-09-28'], 15 - 4 + 7 + 0 + 3);
  assert.equal(r.total, Object.values(r.byDay).reduce((a, b) => a + b, 0));
  assert.equal(r.total, Object.values(r.bySlug).reduce((a, b) => a + b, 0));
  assert.deepEqual(r.scored, WK.days);
});

test('teamWeek: late entry skips days before lateFrom', () => {
  const { F } = load();
  const r = plain(F.pure.teamWeek(WK, { picks: ['a', 'b', 'c', 'd', 'e'], captain: 'b', lateFrom: '2026-09-29' }));
  assert.equal(r.byDay['2026-09-28'], null);
  assert.deepEqual(r.scored, ['2026-09-29', '2026-09-30']);
  assert.equal(r.bySlug.b, 9 + 3); // round(6*1.5)=9, round(2*1.5)=3
  assert.equal(r.baseBySlug.a, 8);
  assert.equal(r.total, r.byDay['2026-09-29'] + r.byDay['2026-09-30']);
});

test('matchTeamFrom: practice week uses the working draft, real weeks the saved team', () => {
  const { F } = load();
  const picks = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(plain(F.pure.matchTeamFrom({ week: '2026-W39', practice: true }, {}, picks, 'c')), { picks, captain: 'c' });
  assert.equal(F.pure.matchTeamFrom({ week: '2026-W39', practice: true }, {}, picks.slice(0, 4), 'c'), null);
  assert.equal(F.pure.matchTeamFrom(WK, {}, picks, 'c'), null);
  const saved = { picks, captain: 'a' };
  assert.deepEqual(plain(F.pure.matchTeamFrom(WK, { '2026-W40': saved }, [], null)), saved);
});

test('computeStatsFrom: average, last day, hot and news', () => {
  const { F } = load();
  const r = plain(F.pure.computeStatsFrom({ draftWk: WK, sbWk: WK, prevWk: null, days: {}, index: { news: { a: 2 } } }));
  assert.deepEqual(r.sparkDates, WK.days);
  assert.equal(r.stats.a.avg, 6);
  assert.equal(r.stats.a.last, 3);
  assert.equal(r.stats.a.hot, true);
  assert.equal(r.stats.a.news, 2);
  assert.equal(r.stats.f.avg, null);
});

test('store: reads the v1 key and shape, round-trips a saved team', () => {
  const existing = { v: 1, teams: { '2026-W39': { picks: ['x'], captain: 'x' } }, draft: { picks: ['a', 'b'], captain: 'b' }, record: null };
  const storage = fakeStorage({ 'bd-fantasy-v1': JSON.stringify(existing) });
  // Friday before the W40 lock: the draft week is W40
  const { F } = load({ search: '?now=2026-09-25T16:00:00Z', storage });
  assert.equal(F.KEY, 'bd-fantasy-v1');
  assert.equal(F.SYNCKEY, 'bd-fantasy-sync-v1');
  assert.deepEqual(plain(F.store().teams), existing.teams);
  const S = F.state;
  S.draftWeek = '2026-W40'; S.draftWk = WK;
  WK.draftable.forEach((p) => { S.people[p.slug] = p; });
  S.picks = ['a', 'b']; S.captain = 'b';
  assert.equal(F.capUsed(), 55);
  assert.equal(F.addPick('c').ok, true);
  assert.equal(F.blockReason('f'), '');
  F.addPick('d');
  // a: 30 + b: 25 + c: 20 + d: 15 = 90; e (10) fits exactly
  assert.equal(F.blockReason('e'), '');
  F.addPick('e');
  assert.equal(F.blockReason('f'), 'Lineup full');
  const removed = F.removePick('b');
  assert.match(removed.text, /Captain: Person A/);
  F.addPick('f');
  F.setCaptain('c');
  const res = F.saveTeam();
  assert.equal(res.ok, true, res.text);
  assert.equal(res.late, null);
  assert.match(res.text, /Lineup saved for the week of Sep 28\./);
  const saved = JSON.parse(storage.data['bd-fantasy-v1']);
  assert.deepEqual(saved.teams['2026-W40'].picks, ['a', 'c', 'd', 'e', 'f']);
  assert.equal(saved.teams['2026-W40'].captain, 'c');
  assert.deepEqual(saved.teams['2026-W39'], existing.teams['2026-W39']);
  assert.equal(saved.draft.week, '2026-W40');
  assert.equal(F.dirty(), false);

  // a fresh page load sees the same team
  const again = load({ search: '?now=2026-09-25T16:00:00Z', storage });
  assert.deepEqual(plain(again.F.store().teams['2026-W40']), saved.teams['2026-W40']);
});

test('saveTeam: invalid rosters are refused with the core messages', () => {
  const { F } = load({ search: '?now=2026-09-25T16:00:00Z' });
  const S = F.state;
  S.draftWeek = '2026-W40'; S.draftWk = WK; S.picks = ['a', 'b']; S.captain = 'a';
  const r = F.saveTeam();
  assert.equal(r.ok, false);
  assert.match(r.text, /Pick exactly 5 \(you have 2\)/);
  assert.equal(F.store().teams['2026-W40'], undefined);
});

test('saveTeam: late entry into the running week, scoring from the next trading day', () => {
  // Tuesday Sep 29 2026, 11:00 New York: W40 is locked and running, the draft week is W41
  const { F, C } = load({ search: '?now=2026-09-29T15:00:00Z' });
  assert.equal(C.draftWeek(F.now()), '2026-W41');
  const S = F.state;
  S.draftWeek = '2026-W41'; S.draftWk = { ...WK, week: '2026-W41' }; S.sbWk = WK;
  S.picks = ['a', 'c', 'd', 'e', 'f']; S.captain = 'a';
  const r = F.saveTeam();
  assert.equal(r.ok, true, r.text);
  assert.equal(r.late, '2026-09-30');
  assert.match(r.text, /late entry, scoring from Wed Sep 30\./);
  const late = plain(F.store().teams['2026-W40']);
  assert.equal(late.lateFrom, '2026-09-30');
  // the late team only scores Wednesday
  const wk = plain(F.teamWeek(WK, F.matchTeam(WK)));
  assert.deepEqual(wk.scored, ['2026-09-30']);
  // a second save does not overwrite the running week
  S.captain = 'c';
  const r2 = F.saveTeam();
  assert.equal(r2.late, null);
  assert.equal(F.store().teams['2026-W40'].captain, 'a');
});

test('store: no localStorage falls back to memory without throwing', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const { F } = load({ storage: broken, search: '?now=2026-09-25T16:00:00Z' });
  assert.deepEqual(plain(F.store()), plain(F.blank()));
  const S = F.state;
  S.draftWeek = '2026-W40'; S.draftWk = WK; S.picks = ['a', 'c', 'd', 'e', 'f']; S.captain = 'a';
  const r = F.saveTeam();
  assert.equal(r.ok, true);
  assert.equal(r.persisted, false);
  assert.match(r.text, /not keeping site data/);
});
