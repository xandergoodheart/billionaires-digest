// node --test scripts/lib/supa/waitlist.sql.test.mjs
// Runs every migration (twice) in PGlite and checks the waitlist rules in supabase/migrations/0005_waitlist.sql
// as a visitor (anon), a signed-in user (authenticated) and the service role, in both privilege MODES.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join as pathJoin } from 'node:path';
import { makeDb, rejectsWith, MODES, MIGRATIONS_DIR } from './pgtest.mjs';

const TABLES = ['waitlist', 'waitlist_leagues', 'waitlist_league_members', 'events'];
let n = 0;
const nextEmail = () => `person${++n}@example.com`;

for (const mode of MODES) describe(`waitlist (${mode})`, () => {
  let t;
  before(async () => { t = await makeDb({ mode }); });

  // Supabase Auth confirming an email address (what the confirmation link does)
  const authConfirm = (uid, email) => t.root('update auth.users set email = $2, email_confirmed_at = now() where id = $1', [uid, email]);
  const join = (uid, email, ref = null, league = null, source = null) =>
    t.call(uid, 'waitlist_join', [email, ref, league, source == null ? null : JSON.stringify(source)]);
  // a confirmed signup; returns { uid, email, code }
  async function signup({ ref = null, league = null, confirm = true } = {}) {
    const uid = await t.newUser();
    const email = nextEmail();
    const r = await join(uid, email, ref, league);
    if (confirm) { await authConfirm(uid, email); await t.call(uid, 'waitlist_confirm'); }
    return { uid, email, code: r.referral_code };
  }
  const me = uid => t.call(uid, 'waitlist_me');

  test('join -> confirm only after Supabase Auth confirmed the same email', async () => {
    const uid = await t.newUser();
    // needs a session and a real-looking email
    await rejectsWith(assert, join(null, 'a@example.com'), /sign in/);
    for (const bad of ['', 'nope', 'a@b', 'a b@example.com', 'x@@example.com']) {
      await rejectsWith(assert, join(uid, bad), /valid email/);
    }
    const r = await join(uid, '  Alice@Example.COM ', null, null, { utm_source: 'x', evil: 'y', utm_campaign: 'z'.repeat(300) });
    assert.match(r.referral_code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    assert.equal(r.confirmed, false);
    // idempotent: same email again, same code, no second signup event
    assert.deepEqual(await join(uid, 'alice@example.com'), r);
    const row = (await t.root('select email::text as email, source from public.waitlist where user_id = $1', [uid])).rows[0];
    assert.equal(row.email, 'alice@example.com');
    assert.deepEqual(row.source, { utm_source: 'x', utm_campaign: 'z'.repeat(100) });
    assert.equal(Number((await t.root(`select count(*) c from public.events where user_id = $1 and name = 'waitlist_signup'`, [uid])).rows[0].c), 1);

    // while alice is unconfirmed, another session may take the email over (squatting is released)
    const other = await t.newUser();
    const taken = await join(other, 'ALICE@example.com');
    assert.equal(taken.confirmed, false);
    assert.equal((await t.root('select count(*)::int c from public.waitlist where user_id = $1', [uid])).rows[0].c, 0);
    // ...and back again
    assert.equal((await join(uid, 'alice@example.com')).confirmed, false);
    assert.equal((await t.root('select count(*)::int c from public.waitlist where user_id = $1', [other])).rows[0].c, 0);
    const r2 = await t.root('select referral_code from public.waitlist where user_id = $1', [uid]);
    r.referral_code = r2.rows[0].referral_code;

    // not confirmed yet: no email, then unconfirmed email, then a different confirmed email
    await rejectsWith(assert, t.call(uid, 'waitlist_confirm'), /not_confirmed/);
    await t.root('update auth.users set email = $2 where id = $1', [uid, 'alice@example.com']);
    await rejectsWith(assert, t.call(uid, 'waitlist_confirm'), /not_confirmed/);
    await authConfirm(uid, 'someone-else@example.com');
    await rejectsWith(assert, t.call(uid, 'waitlist_confirm'), /not_confirmed/);
    let m = await me(uid);
    assert.equal(m.confirmed, false);
    assert.equal(m.position, null);

    await authConfirm(uid, 'Alice@example.com');
    m = await t.call(uid, 'waitlist_confirm');
    assert.equal(m.confirmed, true);
    assert.equal(m.email, 'alice@example.com');
    assert.equal(m.referral_code, r.referral_code);
    assert.ok(m.position >= 1 && m.position <= m.total);
    const first = (await t.root('select confirmed_at from public.waitlist where user_id = $1', [uid])).rows[0].confirmed_at;
    await t.call(uid, 'waitlist_confirm');   // sets confirmed_at only once
    assert.equal(String((await t.root('select confirmed_at from public.waitlist where user_id = $1', [uid])).rows[0].confirmed_at), String(first));
    // a CONFIRMED email cannot be taken by another user
    const thief = await t.newUser();
    await rejectsWith(assert, join(thief, 'ALICE@example.com'), /email_taken/);
    assert.equal((await me(uid)).confirmed, true);
    // visitors without a session see nothing
    assert.equal(await t.call(null, 'waitlist_me'), null);
  });

  test('squatting: an unconfirmed signup does not block the real owner of the email', async () => {
    const a = await t.newUser();
    const b = await t.newUser();
    await join(a, 'x@ex.com');
    const rb = await join(b, 'X@ex.com');
    assert.equal(rb.confirmed, false);
    assert.equal((await t.root('select count(*)::int c from public.waitlist where user_id = $1', [a])).rows[0].c, 0);
    assert.equal(await me(a), null);
    assert.equal(Number((await t.root(`select count(*) c from public.events where user_id = $1 and name = 'waitlist_signup'`, [b])).rows[0].c), 1);
    await authConfirm(b, 'x@ex.com');
    const m = await t.call(b, 'waitlist_confirm');
    assert.equal(m.confirmed, true);
    assert.equal(m.email, 'x@ex.com');
    assert.equal(m.referral_code, rb.referral_code);
    // now confirmed: A can no longer take it
    await rejectsWith(assert, join(a, 'x@ex.com'), /email_taken/);
  });

  test('referral boost: each confirmed friend moves you up (REF_BOOST = 10); self and unknown codes ignored', async () => {
    const r = await signup();
    // self-referral: re-joining with your own code does not set referred_by; unknown codes are ignored too
    await join(r.uid, r.email, r.code);
    const u = await signup({ ref: 'ZZZZZZZZ' });
    for (const uid of [r.uid, u.uid]) {
      assert.equal((await t.root('select referred_by from public.waitlist where user_id = $1', [uid])).rows[0].referred_by, null);
    }
    for (let i = 0; i < 12; i++) await signup();
    const late = await signup();
    const before = await me(late.uid);
    assert.equal(before.position, before.total);   // last in line
    assert.equal(before.referrals_confirmed, 0);

    // an unconfirmed friend does not count
    const friend = await signup({ ref: late.code, confirm: false });
    assert.equal((await me(late.uid)).position, before.position);
    assert.equal(Number((await t.root(`select count(*) c from public.events where user_id = $1 and name = 'referral_signup'`, [friend.uid])).rows[0].c), 1);

    await authConfirm(friend.uid, friend.email);
    await t.call(friend.uid, 'waitlist_confirm');
    const after = await me(late.uid);
    assert.equal(after.referrals_confirmed, 1);
    assert.equal(after.total, before.total + 1);
    // score = signup order - 10; ties go to more confirmed referrals, so N -> N - 10
    assert.equal(after.position, before.position - 10);
    await rejectsWith(assert, t.call(late.uid, 'waitlist_ref_boost'), /permission denied/);
    assert.equal((await t.root('select public.waitlist_ref_boost() b')).rows[0].b, 10);
  });

  test('captain: confirmed users only, slug format, event once', async () => {
    const pending = await signup({ confirm: false });
    await rejectsWith(assert, t.call(pending.uid, 'waitlist_pick_captain', ['elon-musk']), /Confirm your email/);
    await rejectsWith(assert, t.call(null, 'waitlist_pick_captain', ['elon-musk']), /sign in|permission denied/);
    const u = await signup();
    await rejectsWith(assert, t.call(u.uid, 'waitlist_pick_captain', ['Bad Slug!']), /Unknown captain/);
    assert.deepEqual(await t.call(u.uid, 'waitlist_pick_captain', ['elon-musk']), { captain_pick: 'elon-musk' });
    assert.deepEqual(await t.call(u.uid, 'waitlist_pick_captain', ['jeff-bezos']), { captain_pick: 'jeff-bezos' });
    assert.equal((await me(u.uid)).captain_pick, 'jeff-bezos');
    assert.equal(Number((await t.root(`select count(*) c from public.events where user_id = $1 and name = 'captain_picked'`, [u.uid])).rows[0].c), 1);
  });

  test('leagues: one per user, name rules, invite join on confirm, 50-member cap, info without emails', async () => {
    const pending = await signup({ confirm: false });
    await rejectsWith(assert, t.call(pending.uid, 'waitlist_reserve_league', ['Pending FC']), /Confirm your email/);
    const owner = await signup();
    await rejectsWith(assert, t.call(owner.uid, 'waitlist_reserve_league', ['ab']), /3 to 30/);
    await rejectsWith(assert, t.call(owner.uid, 'waitlist_reserve_league', ['x'.repeat(31)]), /3 to 30/);
    await rejectsWith(assert, t.call(owner.uid, 'waitlist_reserve_league', ['Bad<name>']), /only letters/);
    await rejectsWith(assert, t.call(owner.uid, 'waitlist_reserve_league', ['Admin League']), /not allowed/);
    const lg = await t.call(owner.uid, 'waitlist_reserve_league', ["  Bezos   Bench_Mob's-1 "]);
    assert.equal(lg.name, "Bezos Bench_Mob's-1");
    assert.match(lg.invite_code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    // same name again returns it; a second league is refused; names are unique ignoring case
    assert.deepEqual(await t.call(owner.uid, 'waitlist_reserve_league', ["Bezos Bench_Mob's-1"]), lg);
    await rejectsWith(assert, t.call(owner.uid, 'waitlist_reserve_league', ['Second League']), /already reserved/);
    const rival = await signup();
    await rejectsWith(assert, t.call(rival.uid, 'waitlist_reserve_league', ["bezos bench_mob's-1"]), /taken/);
    let m = await me(owner.uid);
    assert.deepEqual(m.league, { name: lg.name, invite_code: lg.invite_code, members: 1 });

    // public info: name and member count only
    const info = await t.call(null, 'waitlist_league_info', [lg.invite_code.toLowerCase()]);
    assert.deepEqual(info, { name: lg.name, members: 1 });
    assert.ok(!JSON.stringify(info).includes('@'));
    assert.equal(await t.call(null, 'waitlist_league_info', ['NOPE2345']), null);

    // invited visitor: joins on confirm, not before
    const invited = await signup({ league: lg.invite_code, confirm: false });
    assert.equal((await t.call(null, 'waitlist_league_info', [lg.invite_code])).members, 1);
    await authConfirm(invited.uid, invited.email);
    m = await t.call(invited.uid, 'waitlist_confirm');
    assert.deepEqual(m.joined_leagues, [lg.name]);
    assert.equal(m.league, null);
    assert.equal((await t.call(null, 'waitlist_league_info', [lg.invite_code])).members, 2);

    // join by code: confirmed only, unknown code, already in
    await rejectsWith(assert, t.call(pending.uid, 'waitlist_join_league', [lg.invite_code]), /Confirm your email/);
    await rejectsWith(assert, t.call(rival.uid, 'waitlist_join_league', ['NOPE2345']), /No league/);
    assert.deepEqual(await t.call(invited.uid, 'waitlist_join_league', [lg.invite_code]), { name: lg.name, already: true });

    // fill to 50, then the 51st is refused (by code, and silently skipped on confirm)
    for (let i = 2; i < 50; i++) {
      const u = await signup();
      assert.deepEqual(await t.call(u.uid, 'waitlist_join_league', [lg.invite_code]), { name: lg.name, already: false });
    }
    assert.equal((await t.call(null, 'waitlist_league_info', [lg.invite_code])).members, 50);
    await rejectsWith(assert, t.call(rival.uid, 'waitlist_join_league', [lg.invite_code]), /full \(50/);
    const late = await signup({ league: lg.invite_code });
    assert.deepEqual((await me(late.uid)).joined_leagues, []);
    assert.equal((await t.call(null, 'waitlist_league_info', [lg.invite_code])).members, 50);
  });

  test('tables are not readable or writable directly by visitors or users', async () => {
    const u = await signup();
    for (const who of [null, u.uid]) {
      for (const tb of TABLES) {
        await rejectsWith(assert, t.as(who, `select * from public.${tb}`), /permission denied/);
      }
      await rejectsWith(assert, t.as(who, `insert into public.events (name) values ('share_clicked')`), /permission denied/);
      await rejectsWith(assert, t.as(who, `update public.waitlist set confirmed_at = now()`), /permission denied/);
    }
    // internal helpers are not callable from the API
    for (const [fn, args] of [['waitlist_positions', []], ['waitlist_log', [u.uid, 'brief_sent', '{}']],
      ['waitlist_do_join', [u.uid, u.uid, 'AAAAAAAA']], ['waitlist_brief_recipients', []], ['waitlist_admin_log', ['brief_sent', '{}']]]) {
      const ph = args.map((_, i) => `$${i + 1}`).join(', ');
      await rejectsWith(assert, t.as(u.uid, `select * from public.${fn}(${ph})`, args), /permission denied/);
    }
  });

  test('stats: captain breakdown hidden until 20 picks, no individual data', async () => {
    let s = await t.call(null, 'waitlist_stats');
    const picks = Number((await t.root('select count(*) c from public.waitlist where confirmed_at is not null and captain_pick is not null')).rows[0].c);
    assert.ok(picks < 20);
    assert.equal(s.captains, null);
    assert.equal(s.total_confirmed, Number((await t.root('select count(*) c from public.waitlist where confirmed_at is not null')).rows[0].c));
    for (let i = picks; i < 19; i++) {
      const u = await signup();
      await t.call(u.uid, 'waitlist_pick_captain', [i % 3 ? 'elon-musk' : 'jensen-huang']);
    }
    assert.equal((await t.call(null, 'waitlist_stats')).captains, null);   // 19 picks
    const u = await signup();
    await t.call(u.uid, 'waitlist_pick_captain', ['larry-page']);
    s = await t.call(null, 'waitlist_stats');
    assert.ok(Array.isArray(s.captains) && s.captains.length >= 2 && s.captains.length <= 10);
    const total = s.captains.reduce((a, c) => a + c.count, 0);
    assert.equal(total, 20);
    assert.deepEqual(Object.keys(s.captains[0]).sort(), ['count', 'pct', 'slug']);
    assert.ok(!JSON.stringify(s).includes('@'));
  });

  test('unsubscribe by token; recipients exclude unsubscribed and unconfirmed', async () => {
    const u = await signup();
    const pending = await signup({ confirm: false });
    const token = (await t.root('select unsub_token from public.waitlist where user_id = $1', [u.uid])).rows[0].unsub_token;
    let rec = await t.admin('select public.waitlist_brief_recipients() r');
    const emails = rec.rows[0].r.map(x => x.email);
    assert.ok(emails.includes(u.email));
    assert.ok(!emails.includes(pending.email));
    assert.equal(await t.call(null, 'waitlist_unsubscribe', ['00000000-0000-0000-0000-000000000000']), false);
    assert.equal(await t.call(null, 'waitlist_unsubscribe', [token]), true);
    assert.equal(await t.call(null, 'waitlist_unsubscribe', [token]), true);   // again: still fine
    assert.ok((await t.root('select unsubscribed_at from public.waitlist where user_id = $1', [u.uid])).rows[0].unsubscribed_at);
    rec = await t.admin('select public.waitlist_brief_recipients() r');
    assert.ok(!rec.rows[0].r.map(x => x.email).includes(u.email));
    // still in line (position counts confirmed, subscribed or not)
    assert.ok((await me(u.uid)).position >= 1);
  });

  test('log_event: browser events only, 10-second limit per user', async () => {
    const u = await signup();
    await rejectsWith(assert, t.call(u.uid, 'log_event', ['brief_sent', '{}']), /Unknown event/);
    await rejectsWith(assert, t.call(u.uid, 'log_event', ['waitlist_signup', '{}']), /Unknown event/);
    assert.equal(await t.call(u.uid, 'log_event', ['invite_copied', JSON.stringify({ where: 'landing' })]), true);
    assert.equal(await t.call(u.uid, 'log_event', ['invite_copied', '{}']), false);
    assert.equal(await t.call(u.uid, 'log_event', ['share_clicked', JSON.stringify({ big: 'x'.repeat(5000) })]), true);
    const ev = (await t.root(`select props from public.events where user_id = $1 and name = 'share_clicked'`, [u.uid])).rows[0];
    assert.deepEqual(ev.props, {});   // oversized props dropped
    // after 10 seconds it logs again
    await t.root(`update public.events set created_at = created_at - interval '11 seconds' where user_id = $1`, [u.uid]);
    assert.equal(await t.call(u.uid, 'log_event', ['invite_copied', '{}']), true);
  });

  test('admin metrics and admin functions: service role only', async () => {
    const u = await signup();
    for (const who of [null, u.uid]) {
      await rejectsWith(assert, t.as(who, 'select public.waitlist_admin_metrics(30)'), /permission denied/);
      await rejectsWith(assert, t.as(who, 'select public.waitlist_brief_recipients()'), /permission denied/);
      await rejectsWith(assert, t.as(who, `select public.waitlist_admin_log('brief_sent', '{}')`), /permission denied/);
    }
    await t.admin(`select public.waitlist_admin_log('brief_sent', '{"date":"2026-10-04","count":3}')`);
    await rejectsWith(assert, t.admin(`select public.waitlist_admin_log('share_clicked', '{}')`), /Unknown event/);
    const m = (await t.admin('select public.waitlist_admin_metrics(30) r')).rows[0].r;
    for (const k of ['days', 'since', 'events_per_day', 'signups', 'confirmed', 'captain_pct', 'leagues_reserved',
      'league_members', 'referral_share_pct', 'unsubscribes']) assert.ok(k in m, k);
    assert.equal(m.days, 30);
    assert.ok(m.signups >= m.confirmed && m.confirmed > 0);
    assert.ok(m.events_per_day.some(e => e.name === 'brief_sent' && e.count >= 1));
    assert.ok(m.league_members.every(l => typeof l.name === 'string' && typeof l.members === 'number'));
    const def = (await t.admin('select public.waitlist_admin_metrics() r')).rows[0].r;
    assert.equal(def.days, 30);
  });

  test('migration re-applies cleanly and keeps data', async () => {
    const u = await signup();
    const before = Number((await t.root('select count(*) c from public.waitlist')).rows[0].c);
    const sql = await readFile(pathJoin(MIGRATIONS_DIR, '0005_waitlist.sql'), 'utf8');
    await t.root('reset role');
    await t.db.exec(sql);
    await t.db.exec(sql);
    assert.equal(Number((await t.root('select count(*) c from public.waitlist')).rows[0].c), before);
    assert.equal((await me(u.uid)).confirmed, true);
    await rejectsWith(assert, t.as(null, 'select * from public.waitlist'), /permission denied/);
  });
});
