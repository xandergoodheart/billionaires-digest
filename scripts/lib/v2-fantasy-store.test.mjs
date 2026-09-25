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
    btoa, atob,
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

test('weekPoints: sum of a player\'s scored days, null when none', () => {
  const { F } = load();
  assert.equal(F.pure.weekPoints(WK, 'a'), 18);
  assert.equal(F.pure.weekPoints(WK, 'b'), 4);
  assert.equal(F.pure.weekPoints(WK, 'f'), null);
  assert.equal(F.pure.weekPoints(null, 'a'), null);
  assert.equal(F.pure.weekPoints({ days: [] }, 'a'), null);
});

test('projectionFrom: recent averages, captain 1.5x (v1 projection)', () => {
  const { F } = load();
  const stats = { a: { avg: 6 }, b: { avg: 4 }, c: { avg: null } };
  assert.equal(F.pure.projectionFrom(stats, ['a', 'b', 'c'], 'a'), 13); // 9 + 4
  assert.equal(F.pure.projectionFrom(stats, ['c'], 'c'), null);
  assert.equal(F.pure.projectionFrom(stats, [], null), null);
  // the store wrapper reads the working roster
  const S = F.state;
  S.stats = stats; S.picks = ['a', 'b']; S.captain = 'b';
  assert.equal(F.projection(), 12); // 6 + 6
});

test('team code: same format as v1 (BFL1. + base64 JSON, captain index, optional lateFrom), round-trips', () => {
  const { F } = load();
  const teams = {
    '2026-W40': { picks: ['a', 'b', 'c', 'd', 'e'], captain: 'c', savedAt: 'x' },
    '2026-W41': { picks: ['a', 'b', 'c', 'd', 'f'], captain: 'a', lateFrom: '2026-10-07' },
  };
  const expected = 'BFL1.' + Buffer.from(JSON.stringify({
    '2026-W40': ['a', 'b', 'c', 'd', 'e', 2],
    '2026-W41': ['a', 'b', 'c', 'd', 'f', 0, '2026-10-07'],
  }), 'utf8').toString('base64').replace(/=+$/, '');
  const code = F.pure.encodeTeams(teams);
  assert.equal(code, expected);
  const d = plain(F.pure.decodeTeams('  ' + code.slice(0, 20) + '\n' + code.slice(20) + ' '));
  assert.equal(d.ok, true);
  assert.equal(d.n, 2);
  assert.equal(d.text, 'Imported 2 weeks.');
  assert.deepEqual(d.teams['2026-W40'], { picks: ['a', 'b', 'c', 'd', 'e'], captain: 'c' });
  assert.deepEqual(d.teams['2026-W41'], { picks: ['a', 'b', 'c', 'd', 'f'], captain: 'a', lateFrom: '2026-10-07' });
});

test('team code: bad and empty codes get the v1 messages', () => {
  const { F } = load();
  assert.equal(F.pure.decodeTeams('hello').text, 'That code did not work. Check that you pasted all of it.');
  assert.equal(F.pure.decodeTeams('BFL1.%%%').ok, false);
  const empty = 'BFL1.' + Buffer.from('{}', 'utf8').toString('base64').replace(/=+$/, '');
  const r = F.pure.decodeTeams(empty);
  assert.equal(r.ok, false);
  assert.equal(r.text, 'That code has no teams in it.');
  const one = F.pure.decodeTeams(F.pure.encodeTeams({ '2026-W40': { picks: ['a', 'b', 'c', 'd', 'e'], captain: 'a' } }));
  assert.equal(one.text, 'Imported 1 week.');
});

test('team code: export needs a saved team; import replaces weeks and loads the draft-week roster', () => {
  const storage = fakeStorage();
  const { F } = load({ search: '?now=2026-09-25T16:00:00Z', storage });
  assert.deepEqual(plain(F.exportTeams()), { ok: false, code: '', text: 'Save a lineup first.' });
  const S = F.state;
  S.draftWeek = '2026-W40'; S.draftWk = WK;
  F.store().teams['2026-W39'] = { picks: ['x'], captain: 'x' };
  const code = F.pure.encodeTeams({ '2026-W40': { picks: ['a', 'c', 'd', 'e', 'f'], captain: 'd' } });
  const r = plain(F.importTeams(code));
  assert.deepEqual(r, { ok: true, n: 1, text: 'Imported 1 week.' });
  assert.deepEqual(plain(S.picks), ['a', 'c', 'd', 'e', 'f']);
  assert.equal(S.captain, 'd');
  const saved = JSON.parse(storage.data['bd-fantasy-v1']);
  assert.equal(saved.teams['2026-W40'].captain, 'd');
  assert.equal(saved.teams['2026-W40'].savedAt, '2026-09-25T16:00:00.000Z');
  assert.deepEqual(saved.teams['2026-W39'], { picks: ['x'], captain: 'x' });
  assert.equal(F.dirty(), false);
  const ex = plain(F.exportTeams());
  assert.equal(ex.ok, true);
  assert.equal(ex.code.indexOf('BFL1.'), 0);
  assert.equal(F.importTeams('nope').ok, false);
});

test('seasonRecord: v1 season numbers (wins vs S&P and Top 5, matched perfect, best week, streak)', () => {
  const { F } = load();
  const team = { picks: ['a', 'b', 'c', 'd', 'e'], captain: 'a' }; // WK total: 15+8+5 + 4 + 6 + 1 + 4 = 43
  const mine = F.pure.teamWeek(WK, team).total;
  const w1 = { ...WK, week: '2026-W40', final: true, benchmarks: { spy: mine - 1, top5: { picks: ['a', 'b', 'c', 'd', 'f'], captain: 'b' }, perfect: { points: mine } } };
  const w2 = { ...WK, week: '2026-W41', final: true, benchmarks: { spy: mine + 5, top5: null, perfect: null } };
  const r = plain(F.pure.seasonRecord([{ wk: w1, team }, { wk: w2, team }, { wk: null, team }]));
  assert.equal(r.played, 2);
  assert.equal(r.winsSpy, 1);
  assert.equal(r.winsPerfect, 1);
  assert.equal(r.best.week, '2026-W40');
  assert.equal(r.best.points, mine);
  assert.deepEqual(r.rows.map((x) => x.week), ['2026-W41', '2026-W40']);
  assert.equal(r.streak, 0); // newest week lost to the S&P 500
  const t5 = F.pure.teamWeek(w1, w1.benchmarks.top5).total;
  assert.equal(r.winsTop5, mine > t5 ? 1 : 0);
  assert.equal(r.rows[0].top5, null);
});
