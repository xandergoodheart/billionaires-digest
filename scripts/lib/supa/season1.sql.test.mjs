// node --test scripts/lib/supa/season1.sql.test.mjs
// supabase/migrations/0007_season1.sql in PGlite: the season leaderboard and league "season" points count only the
// preseason weeks before Season 1 starts (Mon 2026-11-09, ISO 2026-W46, New York) and only Season 1 weeks from then on.
// Nothing is deleted; one-week boards are unchanged.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, rejectsWith, MODES } from './pgtest.mjs';

const wk = (week, start, end) => ({ week, start, end, locksAt: `${start}T14:30:00Z`, salaries: { a: 20 }, draftable: ['a'] });
const WEEKS = [wk('2026-W44', '2026-10-26', '2026-10-30'), wk('2026-W45', '2026-11-02', '2026-11-06'), wk('2026-W46', '2026-11-09', '2026-11-13')];
const SUN_NOV_8 = '2026-11-08T17:00:00Z';         // preseason (W45 in New York)
const LAST_PRESEASON_MINUTE = '2026-11-09T04:59:00Z'; // 11:59 PM Sun Nov 8 in New York (EST, UTC-5)
const SEASON_MIDNIGHT = '2026-11-09T05:00:00Z';      // 12:00 AM Mon Nov 9 in New York: Season 1
const SEASON_LATER = '2026-11-12T18:00:00Z';

for (const mode of MODES) describe(mode, () => {
  let t, A, B, L;
  const season = async () => Object.fromEntries((await t.as(null, 'select * from public.leaderboard_season()')).rows
    .filter(r => r.nickname.startsWith('s1_')).map(r => [r.nickname, { points: Number(r.points), weeks: Number(r.weeks), rank: Number(r.rank) }]));
  const standings = async (who, week) => Object.fromEntries((await t.as(who, 'select * from public.league_standings($1, $2)', [L.id, week ?? null])).rows
    .map(r => [r.nickname, { week: r.week, wp: Number(r.week_points), sp: Number(r.season_points) }]));

  before(async () => {
    t = await makeDb({ mode });
    await t.setNow('2026-10-20T12:00:00Z');
    for (const w of WEEKS) await t.admin('select public.upsert_week($1::jsonb)', [JSON.stringify(w)]);
    A = await t.newUser('s1_alice');
    B = await t.newUser('s1_bob');
    L = await t.call(A, 'create_league', ['Season_Test']);
    await t.call(B, 'join_league', [L.invite_code]);
    // A: big preseason, small Season 1 week. B: small preseason, big Season 1 week.
    const rows = [[A, '2026-W44', 100], [A, '2026-W45', 50], [A, '2026-W46', 10], [B, '2026-W45', 5], [B, '2026-W46', 40]];
    for (const [u, w, p] of rows) await t.root('insert into public.team_scores (user_id, week, points, days) values ($1, $2, $3, 5)', [u, w, p]);
  });

  test('season_start_week() is 2026-W46, and Mon Nov 9 in New York is ISO week 2026-W46', async () => {
    assert.equal((await t.as(null, 'select public.season_start_week() w')).rows[0].w, '2026-W46');
    const iso = async ts => (await t.root('select public.ny_iso_week($1::timestamptz) w', [ts])).rows[0].w;
    assert.equal(await iso(LAST_PRESEASON_MINUTE), '2026-W45');
    assert.equal(await iso(SEASON_MIDNIGHT), '2026-W46');
  });

  test('before Season 1: the season board adds up the preseason weeks only', async () => {
    for (const now of [SUN_NOV_8, LAST_PRESEASON_MINUTE]) {
      await t.setNow(now);
      const s = await season();
      assert.deepEqual(s.s1_alice, { points: 150, weeks: 2, rank: 1 });
      assert.deepEqual(s.s1_bob, { points: 5, weeks: 1, rank: 2 });
      const st = await standings(A, '2026-W45');
      assert.deepEqual(st.s1_alice, { week: '2026-W45', wp: 50, sp: 150 });
      assert.deepEqual(st.s1_bob, { week: '2026-W45', wp: 5, sp: 5 });
    }
  });

  test('from Season 1: preseason weeks drop out and everyone starts again at zero', async () => {
    await t.setNow(SEASON_MIDNIGHT);
    let s = await season();
    assert.deepEqual(s.s1_bob, { points: 40, weeks: 1, rank: 1 });
    assert.deepEqual(s.s1_alice, { points: 10, weeks: 1, rank: 2 });
    await t.setNow(SEASON_LATER);
    s = await season();
    assert.equal(s.s1_alice.points, 10);
    // league standings: the default week is the latest locked one (W46); season points are Season 1 only
    let st = await standings(B);
    assert.deepEqual(st.s1_bob, { week: '2026-W46', wp: 40, sp: 40 });
    assert.deepEqual(st.s1_alice, { week: '2026-W46', wp: 10, sp: 10 });
    // asking for a preseason week still shows that week's points (kept), next to Season 1 totals
    st = await standings(B, '2026-W44');
    assert.deepEqual(st.s1_alice, { week: '2026-W44', wp: 100, sp: 10 });
    // nothing was deleted: the one-week board for a preseason week is unchanged
    const w44 = (await t.as(null, 'select * from public.leaderboard_week($1)', ['2026-W44'])).rows.filter(r => r.nickname === 's1_alice');
    assert.equal(Number(w44[0].points), 100);
    assert.equal(Number((await t.root('select count(*) n from public.team_scores where user_id in ($1, $2)', [A, B])).rows[0].n), 5);
  });

  test('a player with only preseason weeks is not on the Season 1 board', async () => {
    const C = await t.newUser('s1_carol');
    await t.root('insert into public.team_scores (user_id, week, points, days) values ($1, $2, 999, 5)', [C, '2026-W45']);
    await t.setNow(SUN_NOV_8);
    assert.equal((await season()).s1_carol.points, 999);
    await t.setNow(SEASON_LATER);
    assert.equal((await season()).s1_carol, undefined);
  });

  test('grants: same as before for the boards; the helpers are read-only and public', async () => {
    await t.setNow(SEASON_LATER);
    assert.equal((await t.as(null, 'select public.week_counts_now($1) c', ['2026-W45'])).rows[0].c, false);
    assert.equal((await t.as(A, 'select public.week_counts_now($1) c', ['2026-W46'])).rows[0].c, true);
    await rejectsWith(assert, t.as(null, 'select * from public.league_standings($1)', [L.id]), /permission denied/);
    const outsider = await t.newUser('s1_outsider');
    await rejectsWith(assert, t.as(outsider, 'select * from public.league_standings($1)', [L.id]), /Only members/);
    const grantees = async fn => (await t.root(
      `select string_agg(distinct grantee, ',' order by grantee) g from information_schema.routine_privileges
       where routine_schema = 'public' and routine_name = $1 and privilege_type = 'EXECUTE'`, [fn])).rows[0].g || '';
    assert.match(await grantees('leaderboard_season'), /anon/);
    assert.match(await grantees('leaderboard_season'), /authenticated/);
    assert.doesNotMatch(await grantees('league_standings'), /anon/);
    assert.match(await grantees('league_standings'), /authenticated/);
  });
});
