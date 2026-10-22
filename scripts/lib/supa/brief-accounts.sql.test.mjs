// node --test scripts/lib/supa/brief-accounts.sql.test.mjs
// supabase/migrations/0009_brief_accounts.sql in PGlite, in both privilege MODES: set_my_brief() (real accounts only,
// one waitlist row per person, email never changed), the Brief status in my_account(), and waitlist_brief_recipients()
// counting rows confirmed through the linked account's email.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join as pathJoin } from 'node:path';
import { makeDb, rejectsWith, MODES, MIGRATIONS_DIR } from './pgtest.mjs';

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
let n = 0;
const nextEmail = () => `brief${++n}@example.com`;

for (const mode of MODES) describe(`brief accounts (${mode})`, () => {
  let t;
  before(async () => { t = await makeDb({ mode }); });

  // a real account (email, confirmed or not) or a guest (anonymous)
  async function account({ confirmed = true, guest = false, email = nextEmail() } = {}) {
    const id = await t.newUser();
    await t.root('update auth.users set is_anonymous = $2, email = $3, email_confirmed_at = $4 where id = $1',
      [id, guest, guest ? null : email, !guest && confirmed ? new Date().toISOString() : null]);
    return { id, email };
  }
  const brief = (uid, on) => t.call(uid, 'set_my_brief', [on]);
  const row = async uid => (await t.root(`select email::text as email, referral_code, source, brief_opt_in, confirmed_at,
    unsubscribed_at from public.waitlist where user_id = $1`, [uid])).rows[0];
  const recips = async () => (await t.admin('select public.waitlist_brief_recipients() r')).rows[0].r;

  test('guests and visitors without a session are refused; anon cannot execute set_my_brief', async () => {
    await rejectsWith(assert, t.call(null, 'set_my_brief', [true]), /permission denied|sign in/);
    await rejectsWith(assert, t.as(null, 'select public.set_my_brief(true)'), /permission denied/);
    const G = await account({ guest: true });
    await rejectsWith(assert, brief(G.id, true), /Create a free account first/);
    await rejectsWith(assert, brief(G.id, false), /Create a free account first/);
    assert.equal(await row(G.id), undefined);
    const grantees = (await t.root(`select string_agg(distinct grantee, ',' order by grantee) g
      from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'set_my_brief'
      and privilege_type = 'EXECUTE'`)).rows[0].g || '';
    assert.doesNotMatch(grantees, /anon|PUBLIC/);
    assert.match(grantees, /authenticated/);
    // the internal helper is not callable from the browser
    const A = await account();
    for (const who of [null, A.id]) {
      await rejectsWith(assert, t.as(who, 'select public.waitlist_brief_state($1)', [A.id]), /permission denied/);
    }
  });

  test('on creates the row from the account email; confirmed account = on, unconfirmed = waiting', async () => {
    const A = await account({ email: 'Mixed.Case@Example.com' });
    const r = await brief(A.id, true);
    assert.deepEqual(r, { status: 'on', email: 'mixed.case@example.com' });
    const w = await row(A.id);
    assert.equal(w.email, 'mixed.case@example.com');
    assert.match(w.referral_code, CODE_RE);
    assert.deepEqual(w.source, { utm_source: 'account' });
    assert.equal(w.brief_opt_in, true);
    assert.equal(w.unsubscribed_at, null);
    assert.equal(w.confirmed_at, null, 'the waitlist row itself is not marked confirmed');

    const U = await account({ confirmed: false });
    assert.deepEqual(await brief(U.id, true), { status: 'waiting', email: U.email });
    assert.equal((await t.call(U.id, 'my_account')).brief.status, 'waiting');
    // Supabase Auth confirms the address: now on, without a second email
    await t.root('update auth.users set email_confirmed_at = now() where id = $1', [U.id]);
    assert.deepEqual((await t.call(U.id, 'my_account')).brief, { status: 'on', email: U.email });
  });

  test('off sets unsubscribed_at and keeps the row; on again clears it; repeating is harmless', async () => {
    const A = await account();
    await brief(A.id, true);
    const code = (await row(A.id)).referral_code;
    assert.deepEqual(await brief(A.id, false), { status: 'off', email: A.email });
    let w = await row(A.id);
    assert.ok(w.unsubscribed_at, 'unsubscribed');
    assert.equal(w.referral_code, code, 'same row');
    const first = w.unsubscribed_at;
    await brief(A.id, false);
    assert.equal(String((await row(A.id)).unsubscribed_at), String(first), 'off twice keeps the first time');
    assert.deepEqual(await brief(A.id, true), { status: 'on', email: A.email });
    w = await row(A.id);
    assert.equal(w.unsubscribed_at, null);
    assert.equal(w.referral_code, code);
    await brief(A.id, true);
    assert.equal(Number((await t.root('select count(*) c from public.waitlist where user_id = $1', [A.id])).rows[0].c), 1);
    // off with no row: nothing is created
    const B = await account();
    assert.deepEqual(await brief(B.id, false), { status: 'off', email: B.email });
    assert.equal(await row(B.id), undefined);
  });

  test('an existing front-page row is reused; its email never changes', async () => {
    // a guest saved their team on the front page with one address, then became an account with another
    const A = await account({ guest: true });
    const front = nextEmail();
    await t.call(A.id, 'waitlist_join', [front, null, null, null]);
    const before = await row(A.id);
    assert.equal(before.brief_opt_in, false);
    const acct = nextEmail();
    await t.root('update auth.users set is_anonymous = false, email = $2, email_confirmed_at = now() where id = $1', [A.id, acct]);
    // the account email differs from the row and the row is unconfirmed: waiting
    assert.deepEqual(await brief(A.id, true), { status: 'waiting', email: front });
    const w = await row(A.id);
    assert.equal(w.email, front);
    assert.equal(w.referral_code, before.referral_code);
    assert.equal(w.brief_opt_in, true);
    // a front-page row confirmed the 0005 way counts as on, whatever the account says
    const C = await account({ guest: true });
    const ce = nextEmail();
    await t.call(C.id, 'waitlist_join', [ce, null, null, null]);
    await t.root('update auth.users set is_anonymous = false, email = $2, email_confirmed_at = now() where id = $1', [C.id, ce]);
    await t.call(C.id, 'waitlist_confirm');
    await t.call(C.id, 'waitlist_unsubscribe', [(await t.root('select unsub_token from public.waitlist where user_id = $1', [C.id])).rows[0].unsub_token]);
    assert.equal((await t.call(C.id, 'my_account')).brief.status, 'off', 'unsubscribed by the email link');
    assert.deepEqual(await brief(C.id, true), { status: 'on', email: ce }, 'switching back on from the Account page');
  });

  test('another signup holding the same mailbox: confirmed wins, fresh unconfirmed waits, old unconfirmed is released', async () => {
    const shared = nextEmail();
    const other = await account({ guest: true });
    await t.call(other.id, 'waitlist_join', [shared, null, null, null]);
    const A = await account({ email: shared });
    await rejectsWith(assert, brief(A.id, true), /^email_pending$/);
    await t.root(`update public.waitlist set created_at = created_at - interval '25 hours' where user_id = $1`, [other.id]);
    assert.equal((await brief(A.id, true)).status, 'on');
    assert.equal(await row(other.id), undefined);
    const shared2 = nextEmail();
    const conf = await account({ guest: true });
    await t.call(conf.id, 'waitlist_join', [shared2, null, null, null]);
    await t.root('update public.waitlist set confirmed_at = now() where user_id = $1', [conf.id]);
    const B = await account({ email: shared2.replace('@', '+tag@') });
    await rejectsWith(assert, brief(B.id, true), /^email_taken$/);
    assert.equal(await row(B.id), undefined);
  });

  test('my_account().brief: off without a row, then on / waiting / off', async () => {
    const A = await account();
    let a = await t.call(A.id, 'my_account');
    assert.deepEqual(a.brief, { status: 'off', email: A.email });
    for (const k of ['nickname', 'next_nickname_change_at', 'deletion_requested_at', 'is_anonymous']) assert.ok(k in a, k);
    await brief(A.id, true);
    assert.equal((await t.call(A.id, 'my_account')).brief.status, 'on');
    await brief(A.id, false);
    assert.equal((await t.call(A.id, 'my_account')).brief.status, 'off');
    const G = await account({ guest: true });
    a = await t.call(G.id, 'my_account');
    assert.equal(a.is_anonymous, true);
    assert.equal(a.brief.status, 'off');
    await rejectsWith(assert, t.call(null, 'my_account'), /permission denied|sign in/);
  });

  test('recipients: confirmed account opt-ins in; unconfirmed, unsubscribed and not opted in out', async () => {
    const on = await account();
    await brief(on.id, true);
    const waiting = await account({ confirmed: false });
    await brief(waiting.id, true);
    const off = await account();
    await brief(off.id, true);
    await brief(off.id, false);
    const never = await account();
    // a front-page signup that did not tick the box, confirmed through the account email
    const plain = await account({ guest: true });
    const pe = nextEmail();
    await t.call(plain.id, 'waitlist_join', [pe, null, null, null]);
    await t.root('update auth.users set is_anonymous = false, email = $2, email_confirmed_at = now() where id = $1', [plain.id, pe]);
    // account confirmed, but with a different address than the row: not confirmed by the account rule
    const diff = await account({ guest: true });
    const de = nextEmail();
    await t.call(diff.id, 'waitlist_join', [de, null, null, null, true]);
    await t.root('update auth.users set is_anonymous = false, email = $2, email_confirmed_at = now() where id = $1', [diff.id, nextEmail()]);

    const list = await recips();
    const emails = list.map(x => x.email);
    assert.ok(emails.includes(on.email));
    for (const x of [waiting.email, off.email, never.email, pe, de]) assert.ok(!emails.includes(x), x);
    const mine = list.find(x => x.email === on.email);
    assert.deepEqual(Object.keys(mine).sort(), ['email', 'position', 'referral_code', 'unsub_token']);
    assert.equal(mine.position, null, 'no place in line until the waitlist row is confirmed');
    // the waiting one confirms: in
    await t.root('update auth.users set email_confirmed_at = now() where id = $1', [waiting.id]);
    assert.ok((await recips()).map(x => x.email).includes(waiting.email));
    // classic confirmed front-page opt-ins still come first, ordered by place in line
    const classic = await account({ guest: true });
    const ce = nextEmail();
    await t.call(classic.id, 'waitlist_join', [ce, null, null, null, true]);
    await t.root('update auth.users set is_anonymous = false, email = $2, email_confirmed_at = now() where id = $1', [classic.id, ce]);
    await t.call(classic.id, 'waitlist_confirm');
    const after = await recips();
    const ci = after.findIndex(x => x.email === ce), oi = after.findIndex(x => x.email === on.email);
    assert.ok(ci >= 0 && ci < oi);
    assert.ok(after[ci].position >= 1);
    // browser roles cannot read the list
    for (const who of [null, on.id]) {
      await rejectsWith(assert, t.as(who, 'select public.waitlist_brief_recipients()'), /permission denied/);
    }
  });

  test('migrations re-apply cleanly and keep the choices', async () => {
    const A = await account();
    await brief(A.id, true);
    const before = Number((await t.root('select count(*) c from public.waitlist')).rows[0].c);
    await t.root('reset role');
    for (const f of ['0005_waitlist.sql', '0008_accounts.sql', '0009_brief_accounts.sql']) {
      const sql = await readFile(pathJoin(MIGRATIONS_DIR, f), 'utf8');
      await t.db.exec(sql);
    }
    await t.db.exec(await readFile(pathJoin(MIGRATIONS_DIR, '0009_brief_accounts.sql'), 'utf8'));
    assert.equal(Number((await t.root('select count(*) c from public.waitlist')).rows[0].c), before);
    assert.equal((await t.call(A.id, 'my_account')).brief.status, 'on');
    assert.ok((await recips()).map(x => x.email).includes(A.email));
    await rejectsWith(assert, t.as(null, 'select public.set_my_brief(true)'), /permission denied/);
  });
});

// Like 0005: each sensitive function in 0009 is revoked right after it is created.
test('0009: sensitive functions are revoked right after they are created', async () => {
  const sql = await readFile(pathJoin(MIGRATIONS_DIR, '0009_brief_accounts.sql'), 'utf8');
  for (const fn of ['waitlist_brief_state', 'set_my_brief', 'waitlist_brief_recipients']) {
    const at = sql.indexOf(`create or replace function public.${fn}(`);
    assert.ok(at >= 0, fn);
    const next = sql.indexOf('create or replace function', at + 10);
    const block = sql.slice(at, next < 0 ? undefined : next);
    assert.match(block, new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`), fn);
  }
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|\bdelete from public\.waitlist\s*;/i);
});
