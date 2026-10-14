// node --test scripts/lib/supa/delete-account.sql.test.mjs
// Runs every migration (twice) in PGlite and checks delete_my_account() (supabase/migrations/0008_delete_account.sql):
// a player deletes their own account and every row of their data; other players' data and leagues are kept.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, rejectsWith, MODES } from './pgtest.mjs';

const WEEK = {
  week: '2026-W40', start: '2026-09-28', end: '2026-10-02', locksAt: '2026-09-28T13:30:00Z',
  salaries: { a: 25, b: 22, c: 20, d: 18, e: 15, f: 12, g: 10, h: 30, x: 5 },
  draftable: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
};
const BEFORE_LOCK = '2026-09-27T20:00:00Z';
const W = WEEK.week;
const SEL = `${W}:h2h:a:b:ml:a`;
const BOOK = {
  week: W, locksAt: WEEK.locksAt,
  events: [{ id: `${W}:h2h:a:b`, type: 'h2h', title: 'A vs B', params: { a: 'a', b: 'b' }, sort: 0, selections: [
    { id: SEL, label: 'A to win', americanOdds: -110, decimalOdds: 1.9091, fairProb: 0.5, market: 'ml', person: 'a' },
    { id: `${W}:h2h:a:b:ml:b`, label: 'B to win', americanOdds: -110, decimalOdds: 1.9091, fairProb: 0.5, market: 'ml', person: 'b' }] }]
};

// every table that holds a player's rows, keyed by the player's auth user id
const PER_USER = {
  'auth.users': 'select count(*)::int c from auth.users where id = $1',
  profiles: 'select count(*)::int c from public.profiles where id = $1',
  rosters: 'select count(*)::int c from public.rosters where user_id = $1',
  team_scores: 'select count(*)::int c from public.team_scores where user_id = $1',
  league_members: 'select count(*)::int c from public.league_members where user_id = $1',
  leagues: 'select count(*)::int c from public.leagues where owner = $1',
  positions: 'select count(*)::int c from public.positions where user_id = $1',
  trades: 'select count(*)::int c from public.trades where user_id = $1',
  bets: 'select count(*)::int c from public.bets where user_id = $1',
  bet_legs: 'select count(*)::int c from public.bet_legs l join public.bets b on b.id = l.bet_id where b.user_id = $1',
  waitlist: 'select count(*)::int c from public.waitlist where user_id = $1',
  waitlist_league_members: `select count(*)::int c from public.waitlist_league_members m join public.waitlist w on w.id = m.waitlist_id
                            where w.user_id = $1`,
  waitlist_leagues: 'select count(*)::int c from public.waitlist_leagues l join public.waitlist w on w.id = l.owner_id where w.user_id = $1',
  events: 'select count(*)::int c from public.events where user_id = $1'
};

let n = 0;
const nextEmail = () => `del${++n}@example.com`;

for (const mode of MODES) describe(`delete_my_account (${mode})`, () => {
  let t, market;
  before(async () => {
    t = await makeDb({ mode });
    await t.setNow(BEFORE_LOCK);
    await t.admin('select public.upsert_week($1::jsonb)', [JSON.stringify(WEEK)]);
    await t.admin('select public.upsert_book($1::jsonb)', [JSON.stringify(BOOK)]);
    const r = await t.admin('select public.create_market($1::jsonb) r', [JSON.stringify({
      slug: 'del-test', question: 'Will A out-score B this week?', kind: 'h2h', params: { week: W, a: 'a', b: 'b' },
      opens_at: '2026-09-27T00:00:00Z', closes_at: '2026-10-02T20:00:00Z'
    })]);
    market = r.rows[0].r.id;
  });

  const count = async (q, uid) => (await t.root(q, [uid])).rows[0].c;
  const del = uid => t.call(uid, 'delete_my_account');
  const leagueOwner = async id => (await t.root('select owner from public.leagues where id = $1', [id])).rows[0]?.owner ?? null;
  const wlLeague = async name => (await t.root(`select l.id, w.user_id as owner from public.waitlist_leagues l
    join public.waitlist w on w.id = l.owner_id where l.name = $1`, [name])).rows[0] || null;

  // a player with data in every table: nickname, roster, team score, market trade, bet, confirmed waitlist signup
  async function fullPlayer(nick, { ref = null } = {}) {
    const uid = await t.newUser(nick);
    await t.call(uid, 'save_roster', [W, ['a', 'b', 'c', 'd', 'e'], 'a']);
    await t.root('insert into public.team_scores (user_id, week, points, days) values ($1, $2, 12.5, 1)', [uid, W]);
    await t.call(uid, 'buy', [market, 'yes', 10]);
    await t.call(uid, 'place_bet', [[SEL], 10, [1.9091]]);
    const email = nextEmail();
    const j = await t.call(uid, 'waitlist_join', [email, ref, null, null]);
    await t.root('update auth.users set email = $2, email_confirmed_at = now() where id = $1', [uid, email]);
    await t.call(uid, 'waitlist_confirm');
    await t.call(uid, 'log_event', ['share_clicked', '{}']);
    return { uid, code: j.referral_code };
  }
  async function snapshot(uid) {
    const out = {};
    for (const [k, q] of Object.entries(PER_USER)) out[k] = await count(q, uid);
    return out;
  }

  test('visitors without a session cannot call it', async () => {
    await rejectsWith(assert, t.as(null, 'select public.delete_my_account()'), /permission denied/);
  });

  test('deletes every row of the caller; other players are untouched', async () => {
    const me = await fullPlayer('del_me');
    const other = await fullPlayer('del_other');
    const before = await snapshot(me.uid);
    for (const k of ['auth.users', 'profiles', 'rosters', 'team_scores', 'positions', 'trades', 'bets', 'bet_legs', 'waitlist', 'events']) {
      assert.ok(before[k] >= 1, `fixture has ${k}`);
    }
    // the caller is in another player's league (game and waitlist), not as owner
    const gl = await t.call(other.uid, 'create_league', ['Other_League']);
    await t.call(me.uid, 'join_league', [(await t.root('select invite_code from public.leagues where id = $1', [gl.id])).rows[0].invite_code]);
    const wl = await t.call(other.uid, 'waitlist_reserve_league', ['Other Reserved']);
    await t.call(me.uid, 'waitlist_join_league', [wl.invite_code]);
    assert.equal((await snapshot(me.uid)).league_members, 1);
    assert.equal((await snapshot(me.uid)).waitlist_league_members, 1);
    const otherBefore = await snapshot(other.uid);

    assert.deepEqual(await del(me.uid), { deleted: true });

    const after = await snapshot(me.uid);
    for (const [k, v] of Object.entries(after)) assert.equal(v, 0, `${k} left for the deleted player`);
    assert.deepEqual(await snapshot(other.uid), otherBefore);
    // the other player's leagues are still there with the other player as owner and only member
    assert.equal(await leagueOwner(gl.id), other.uid);
    assert.equal((await t.root('select count(*)::int c from public.league_members where league_id = $1', [gl.id])).rows[0].c, 1);
    assert.equal((await wlLeague('Other Reserved')).owner, other.uid);
  });

  test('owned game league: handed to the earliest joiner; alone: deleted', async () => {
    const owner = await t.newUser('gl_owner');
    const first = await t.newUser('gl_first');
    const second = await t.newUser('gl_second');
    const shared = await t.call(owner, 'create_league', ['Shared_Club']);
    const code = (await t.root('select invite_code from public.leagues where id = $1', [shared.id])).rows[0].invite_code;
    await t.call(first, 'join_league', [code]);
    await t.call(second, 'join_league', [code]);
    // make "second" join earlier on paper than "first" to prove the order is joined_at, not insert order
    await t.root(`update public.league_members set joined_at = joined_at - interval '1 day' where league_id = $1 and user_id = $2`, [shared.id, second]);
    const solo = await t.call(owner, 'create_league', ['Solo_Club']);

    assert.deepEqual(await del(owner), { deleted: true });
    assert.equal(await leagueOwner(shared.id), second);
    assert.equal((await t.root('select count(*)::int c from public.league_members where league_id = $1', [shared.id])).rows[0].c, 2);
    assert.equal((await t.root('select count(*)::int c from public.leagues where id = $1', [solo.id])).rows[0].c, 0);
  });

  test('reserved waitlist league: handed to the earliest joiner who can take it; alone: deleted', async () => {
    const owner = await fullPlayer('wl_owner');
    const a = await fullPlayer('wl_a');
    const b = await fullPlayer('wl_b');
    const c = await fullPlayer('wl_c');
    const res = await t.call(owner.uid, 'waitlist_reserve_league', ['Shared Reserved']);
    for (const p of [a, b, c]) await t.call(p.uid, 'waitlist_join_league', [res.invite_code]);
    // a joined first but already owns a reserved league (one per owner), so b (next earliest) takes it
    await t.call(a.uid, 'waitlist_reserve_league', ['A Own Reserved']);
    const lid = (await wlLeague('Shared Reserved')).id;
    const setJoined = (uid, mins) => t.root(`update public.waitlist_league_members m set joined_at = now() - make_interval(mins => $3)
      from public.waitlist w where w.id = m.waitlist_id and w.user_id = $2 and m.league_id = $1`, [lid, uid, mins]);
    await setJoined(a.uid, 30); await setJoined(b.uid, 20); await setJoined(c.uid, 10);

    assert.deepEqual(await del(owner.uid), { deleted: true });
    assert.equal((await wlLeague('Shared Reserved')).owner, b.uid);
    assert.equal((await t.root('select count(*)::int c from public.waitlist_league_members where league_id = $1', [lid])).rows[0].c, 3);
    assert.equal((await wlLeague('A Own Reserved')).owner, a.uid);

    // alone in it: the reserved league is deleted
    const solo = await fullPlayer('wl_solo');
    await t.call(solo.uid, 'waitlist_reserve_league', ['Solo Reserved']);
    await del(solo.uid);
    assert.equal(await wlLeague('Solo Reserved'), null);
  });

  test('referral_signup events pointing at the deleted player are removed; the friend stays', async () => {
    const referrer = await fullPlayer('ref_er');
    const friend = await fullPlayer('ref_friend', { ref: referrer.code });
    const wid = (await t.root('select id from public.waitlist where user_id = $1', [referrer.uid])).rows[0].id;
    const refEvents = () => t.root(`select count(*)::int c from public.events where name = 'referral_signup' and props->>'referrer' = $1`, [wid]);
    assert.equal((await refEvents()).rows[0].c, 1);
    assert.equal((await t.root('select referred_by from public.waitlist where user_id = $1', [friend.uid])).rows[0].referred_by, wid);

    await del(referrer.uid);
    assert.equal((await refEvents()).rows[0].c, 0);
    const f = (await t.root('select referred_by from public.waitlist where user_id = $1', [friend.uid])).rows[0];
    assert.equal(f.referred_by, null);
    assert.ok((await count(PER_USER.events, friend.uid)) >= 1);   // the friend's own events are kept
  });

  test('a guest with no profile can delete; calling twice is fine', async () => {
    const guest = await t.newUser();
    assert.equal(await count(PER_USER.profiles, guest), 0);
    assert.deepEqual(await del(guest), { deleted: true });
    assert.equal(await count(PER_USER['auth.users'], guest), 0);
    assert.deepEqual(await del(guest), { deleted: true });   // same session again: nothing left, no error
  });
});
