// node --test scripts/lib/supa/accounts.sql.test.mjs
// supabase/migrations/0008_accounts.sql in PGlite, in both privilege MODES: my_account(), request_account_deletion()
// (guests and real accounts, idempotent; no session is refused), the locked-down account_deletion_requests table, and the service-role
// delete_account_data() that removes a user's game data (and hands owned leagues on) but leaves everyone else alone,
// and a guest deleted end to end through scripts/lib/supa/deletions.mjs.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, rejectsWith, MODES } from './pgtest.mjs';
import { processDeletions } from './deletions.mjs';

const WEEK = { week: '2026-W43', start: '2026-10-19', end: '2026-10-23', locksAt: '2026-10-19T13:30:00Z',
  salaries: { a: 20, b: 20, c: 20, d: 20, e: 20, f: 20 }, draftable: ['a', 'b', 'c', 'd', 'e', 'f'] };

for (const mode of MODES) describe(`accounts (${mode})`, () => {
  let t;
  // a user with an email (real account) or a guest (anonymous)
  async function user(nick, { real = true } = {}) {
    const id = await t.newUser();
    await t.root('update auth.users set is_anonymous = $2, email = $3 where id = $1', [id, !real, real ? `${nick}@example.com` : null]);
    if (nick) await t.call(id, 'set_nickname', [nick]);
    return id;
  }
  before(async () => {
    t = await makeDb({ mode });
    await t.setNow('2026-10-15T12:00:00Z');
    await t.admin('select public.upsert_week($1::jsonb)', [JSON.stringify(WEEK)]);
  });

  test('my_account: nickname and the 7-day rule, for the signed-in user only', async () => {
    await rejectsWith(assert, t.call(null, 'my_account'), /permission denied|sign in/);
    const A = await user('acct_alice');
    let a = await t.call(A, 'my_account');
    assert.equal(a.nickname, 'acct_alice');
    assert.equal(a.is_anonymous, false);
    assert.equal(a.deletion_requested_at, null);
    // a new profile may change its nickname 7 days after it was created
    assert.equal(new Date(a.next_nickname_change_at).toISOString(), '2026-10-22T12:00:00.000Z');
    await t.setNow('2026-10-23T12:00:00Z');
    a = await t.call(A, 'my_account');
    assert.equal(a.next_nickname_change_at, null);
    await t.call(A, 'set_nickname', ['acct_alice2']);
    a = await t.call(A, 'my_account');
    assert.equal(a.nickname, 'acct_alice2');
    assert.equal(new Date(a.next_nickname_change_at).toISOString(), '2026-10-30T12:00:00.000Z');
    await t.setNow('2026-10-15T12:00:00Z');
    // no nickname yet
    const N = await user(null);
    a = await t.call(N, 'my_account');
    assert.equal(a.nickname, null);
    assert.equal(a.next_nickname_change_at, null);
  });

  test('request_account_deletion: guests and real accounts can ask, no session cannot; idempotent', async () => {
    // a visitor with no session still can't
    await rejectsWith(assert, t.call(null, 'request_account_deletion'), /permission denied|sign in/);
    // a guest (anonymous user, every app player) can ask: row created, requested_at returned, asking again keeps it
    const G = await user('acct_guest', { real: false });
    assert.equal((await t.call(G, 'my_account')).is_anonymous, true);
    const g1 = await t.call(G, 'request_account_deletion');
    assert.ok(g1.requested_at);
    assert.equal(new Date(g1.requested_at).toISOString(), '2026-10-15T12:00:00.000Z');
    await t.setNow('2026-10-15T13:00:00Z');
    const g2 = await t.call(G, 'request_account_deletion');
    assert.equal(g2.requested_at, g1.requested_at, 'a guest asking again keeps the first time');
    assert.equal((await t.call(G, 'my_account')).deletion_requested_at, g1.requested_at);
    const ng = (await t.root('select count(*)::int n from public.account_deletion_requests where user_id = $1', [G])).rows[0].n;
    assert.equal(ng, 1);
    await t.setNow('2026-10-15T12:00:00Z');
    // a real account, same rules
    const B = await user('acct_bob');
    const r1 = await t.call(B, 'request_account_deletion');
    assert.ok(r1.requested_at);
    await t.setNow('2026-10-15T13:00:00Z');
    const r2 = await t.call(B, 'request_account_deletion');
    assert.equal(r2.requested_at, r1.requested_at, 'asking again keeps the first time');
    assert.equal((await t.call(B, 'my_account')).deletion_requested_at, r1.requested_at);
    const n = (await t.root('select count(*)::int n from public.account_deletion_requests where user_id = $1', [B])).rows[0].n;
    assert.equal(n, 1);
    await t.setNow('2026-10-15T12:00:00Z');
  });

  test('account_deletion_requests: no direct reads or writes from the browser', async () => {
    const C = await user('acct_carol');
    await t.call(C, 'request_account_deletion');
    for (const who of [null, C]) {
      await rejectsWith(assert, t.as(who, 'select * from public.account_deletion_requests'), /permission denied/);
      await rejectsWith(assert, t.as(who, 'insert into public.account_deletion_requests (user_id) values ($1)', [C]), /permission denied/);
      await rejectsWith(assert, t.as(who, 'delete from public.account_deletion_requests'), /permission denied/);
    }
    // the admin functions are service-role only
    for (const who of [null, C]) {
      await rejectsWith(assert, t.as(who, 'select * from public.pending_account_deletions()'), /permission denied/);
      await rejectsWith(assert, t.as(who, 'select public.delete_account_data($1)', [C]), /permission denied/);
    }
    const rows = (await t.admin('select * from public.pending_account_deletions()')).rows;
    assert.ok(rows.some(r => r.user_id === C));
  });

  test('delete_account_data: removes the user, hands leagues on, leaves others alone; safe to repeat', async () => {
    const D = await user('acct_dave'), E = await user('acct_erin'), F = await user('acct_fay');
    const team = ['a', 'b', 'c', 'd', 'e'];
    await t.call(D, 'save_roster', [WEEK.week, team, 'a']);
    await t.call(E, 'save_roster', [WEEK.week, team, 'b']);
    await t.root('insert into public.team_scores (user_id, week, points, days) values ($1, $2, 10, 1), ($3, $2, 20, 1)', [D, WEEK.week, E]);
    const shared = await t.call(D, 'create_league', ['Shared_League']);   // D owns, E joins: goes to E
    await t.call(E, 'join_league', [shared.invite_code]);
    const solo = await t.call(D, 'create_league', ['Solo_League']);       // only D: deleted
    const other = await t.call(F, 'create_league', ['Fay_League']);       // D is a member: membership removed
    await t.call(D, 'join_league', [other.invite_code]);
    await t.root(`insert into public.events (user_id, name) values ($1, 'invite_copied'), ($2, 'invite_copied')`, [D, E]);
    await t.call(D, 'request_account_deletion');

    const counts = (await t.admin('select public.delete_account_data($1) r', [D])).rows[0].r;
    assert.deepEqual(counts, { rosters: 1, team_scores: 1, league_memberships: 2, leagues_handed_over: 1, leagues_deleted: 1,
      bets: 0, positions: 0, trades: 0, waitlist: 0, events: 1, profiles: 1 });
    const one = async (q, p) => (await t.root(q, p)).rows[0];
    assert.equal((await one('select count(*)::int n from public.profiles where id = $1', [D])).n, 0);
    assert.equal((await one('select count(*)::int n from public.rosters where user_id = $1', [D])).n, 0);
    assert.equal((await one('select owner from public.leagues where id = $1', [shared.id])).owner, E);
    assert.equal((await one('select count(*)::int n from public.leagues where id = $1', [solo.id])).n, 0);
    assert.equal((await one('select count(*)::int n from public.league_members where league_id = $1', [other.id])).n, 1);
    // everyone else is untouched
    assert.equal((await one('select count(*)::int n from public.rosters where user_id = $1', [E])).n, 1);
    assert.equal((await one('select count(*)::int n from public.team_scores where user_id = $1', [E])).n, 1);
    assert.equal((await one('select count(*)::int n from public.events where user_id = $1', [E])).n, 1);
    assert.equal((await one('select count(*)::int n from public.profiles where id in ($1, $2)', [E, F])).n, 2);
    // the league E now owns still works for E
    const st = (await t.as(E, 'select * from public.league_standings($1)', [shared.id])).rows;
    assert.deepEqual(st.map(r => [r.nickname, r.is_owner]), [['acct_erin', true]]);
    // again: nothing left, all zero
    const again = (await t.admin('select public.delete_account_data($1) r', [D])).rows[0].r;
    assert.ok(Object.values(again).every(v => v === 0));
    // deleting the auth user (what the admin API does) removes the request too
    await t.root('delete from auth.users where id = $1', [D]);
    assert.equal((await one('select count(*)::int n from public.account_deletion_requests where user_id = $1', [D])).n, 0);
  });
  test('a guest end to end: request, delete_account_data and the deletion processor; others untouched', async () => {
    // a fresh database so only this guest's request is pending
    const d = await makeDb({ mode });
    await d.setNow('2026-10-15T12:00:00Z');
    await d.admin('select public.upsert_week($1::jsonb)', [JSON.stringify(WEEK)]);
    const mk = async (nick, real) => {
      const id = await d.newUser();
      await d.root('update auth.users set is_anonymous = $2, email = $3 where id = $1', [id, !real, real ? `${nick}@example.com` : null]);
      await d.call(id, 'set_nickname', [nick]);
      return id;
    };
    const G = await mk('e2e_guest', false), O = await mk('e2e_other', true), H = await mk('e2e_guest2', false);
    const team = ['a', 'b', 'c', 'd', 'e'];
    await d.call(G, 'save_roster', [WEEK.week, team, 'a']);
    await d.call(O, 'save_roster', [WEEK.week, team, 'b']);
    await d.call(H, 'save_roster', [WEEK.week, team, 'c']);
    const shared = await d.call(G, 'create_league', ['Guest_Shared']);   // goes to O
    await d.call(O, 'join_league', [shared.invite_code]);
    const solo = await d.call(G, 'create_league', ['Guest_Solo']);       // deleted
    await d.root(`insert into public.events (user_id, name) values ($1, 'invite_copied'), ($2, 'invite_copied')`, [G, O]);
    await d.call(G, 'request_account_deletion');

    // a fake Supabase that runs the processor's calls against this database (service role; the admin API delete
    // removes the auth user)
    const fetchImpl = async (u, opts) => {
      const ok = (data, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(data) });
      if (u.endsWith('/rest/v1/rpc/pending_account_deletions')) return ok((await d.admin('select * from public.pending_account_deletions()')).rows);
      if (u.endsWith('/rest/v1/rpc/delete_account_data')) {
        const { p_user } = JSON.parse(opts.body);
        return ok((await d.admin('select public.delete_account_data($1) r', [p_user])).rows[0].r);
      }
      const m = /\/auth\/v1\/admin\/users\/(.+)$/.exec(u);
      if (m && opts.method === 'DELETE') {
        const r = await d.root('delete from auth.users where id = $1', [decodeURIComponent(m[1])]);
        return ok({}, r.affectedRows ? 200 : 404);
      }
      return ok({ message: 'nope' }, 404);
    };
    const lines = [];
    const r = await processDeletions({ url: 'https://x.supabase.co', key: 'sb_secret_test', fetchImpl, log: l => lines.push(l) });
    assert.deepEqual({ pending: r.pending, done: r.done, failed: r.failed }, { pending: 1, done: 1, failed: 0 });
    assert.equal(r.totals.rosters, 1);
    assert.equal(r.totals.profiles, 1);
    assert.equal(r.totals.leagues_handed_over, 1);
    assert.equal(r.totals.leagues_deleted, 1);
    assert.ok(!lines.join('\n').includes(G), 'no user ids in the log');

    const one = async (q, p) => (await d.root(q, p)).rows[0].n;
    // the guest is gone: auth user, request, profile, roster, events, solo league
    assert.equal(await one('select count(*)::int n from auth.users where id = $1', [G]), 0);
    assert.equal(await one('select count(*)::int n from public.account_deletion_requests where user_id = $1', [G]), 0);
    assert.equal(await one('select count(*)::int n from public.profiles where id = $1', [G]), 0);
    assert.equal(await one('select count(*)::int n from public.rosters where user_id = $1', [G]), 0);
    assert.equal(await one('select count(*)::int n from public.events where user_id = $1', [G]), 0);
    assert.equal(await one('select count(*)::int n from public.league_members where user_id = $1', [G]), 0);
    assert.equal(await one('select count(*)::int n from public.leagues where id = $1', [solo.id]), 0);
    // everyone else is untouched: the real account, the other guest who did not ask, and the handed-over league
    assert.equal(await one('select count(*)::int n from auth.users where id in ($1, $2)', [O, H]), 2);
    assert.equal(await one('select count(*)::int n from public.profiles where id in ($1, $2)', [O, H]), 2);
    assert.equal(await one('select count(*)::int n from public.rosters where user_id in ($1, $2)', [O, H]), 2);
    assert.equal(await one('select count(*)::int n from public.events where user_id = $1', [O]), 1);
    assert.equal((await d.root('select owner from public.leagues where id = $1', [shared.id])).rows[0].owner, O);
    // a second run has nothing to do
    const again = await processDeletions({ url: 'https://x.supabase.co', key: 'sb_secret_test', fetchImpl, log: () => {} });
    assert.deepEqual({ pending: again.pending, done: again.done }, { pending: 0, done: 0 });
  });
});
