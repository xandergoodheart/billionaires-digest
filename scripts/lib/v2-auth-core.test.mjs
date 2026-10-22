// node --test scripts/lib/v2-auth-core.test.mjs
// assets/v2/auth-core.js (ES5 browser file, pure) loaded into a node:vm context next to assets/fantasy-core.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = vm.createContext({ console, Intl, Date, Math, JSON });
ctx.window = ctx;
vm.runInContext(readFileSync(join(ROOT, 'assets', 'fantasy-core.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(ROOT, 'assets', 'v2', 'auth-core.js'), 'utf8'), ctx);
const A = ctx.BDAuthCore, C = ctx.BDFantasyCore;
const plain = x => JSON.parse(JSON.stringify(x));

test('flags: off unless exactly true; everything off when multiplayer is disabled', () => {
  assert.deepEqual(plain(A.flags({})), { google: false, password: false, any: false });
  assert.deepEqual(plain(A.flags({ authGoogle: 'true', authPassword: 1 })), { google: false, password: false, any: false });
  assert.deepEqual(plain(A.flags({ authGoogle: true })), { google: true, password: false, any: true });
  assert.deepEqual(plain(A.flags({ authGoogle: true, authPassword: true })), { google: true, password: true, any: true });
  assert.deepEqual(plain(A.flags({ enabled: false, authGoogle: true, authPassword: true })), { google: false, password: false, any: false });
  assert.deepEqual(plain(A.flags(null)), { google: false, password: false, any: false });
  // the committed config uses real booleans (accounts went live 2026-10-14 with both on)
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'supabase.json'), 'utf8'));
  assert.equal(typeof cfg.authGoogle, 'boolean');
  assert.equal(typeof cfg.authPassword, 'boolean');
});

test('email and password checks', () => {
  assert.equal(A.emailProblem(' a@b.co '), '');
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'x@@y.com']) assert.notEqual(A.emailProblem(bad), '', bad);
  assert.match(A.passwordProblem(''), /Enter a password/);
  assert.match(A.passwordProblem('1234567'), /at least 8/);
  assert.equal(A.passwordProblem('12345678'), '');
  assert.match(A.passwordProblem('        '), /only spaces/);
  assert.match(A.passwordProblem('x'.repeat(73)), /72 characters or fewer/);
});

test('friendly errors', () => {
  const k = (e, c) => A.friendly(e, c).kind;
  assert.equal(k({ code: 'user_already_exists', message: 'User already registered' }, 'signup'), 'exists');
  assert.equal(k({ message: 'A user with this email address has already been registered' }, 'signup'), 'exists');
  assert.equal(k({ code: 'email_exists' }, 'signup'), 'exists');
  assert.equal(k({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'login'), 'wrong');
  assert.equal(k({ code: 'weak_password', message: 'Password is known to be weak and easy to guess' }, 'signup'), 'weak');
  assert.equal(k({ message: 'Password should be at least 6 characters.' }, 'signup'), 'weak');
  assert.equal(k({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, 'login'), 'network');
  assert.equal(k({ message: 'Error sending recovery email', status: 500 }, 'reset'), 'reset-unavailable');
  assert.match(A.friendly({ status: 500, message: 'x' }, 'reset').text, /isn't available yet\. Use Continue with Google, or write to hello@billionairesdigest\.com/);
  assert.equal(k({ code: 'identity_already_exists', message: 'Identity is already linked to another user' }, 'link'), 'identity-taken');
  assert.equal(k({ code: 'over_request_rate_limit' }, 'login'), 'rate');
  assert.equal(k({ code: 'captcha_failed' }, 'login'), 'captcha');
  assert.equal(k({ code: 'same_password' }, 'newpass'), 'same');
  assert.equal(k({ message: 'Unsupported provider: provider is not enabled' }, 'google'), 'disabled');
  assert.equal(A.friendly({ message: '{"x":1}' }, 'login').text, 'Something went wrong. Please try again.');
});

test('initials', () => {
  assert.equal(A.initials('acct_alice'), 'AA');
  assert.equal(A.initials('Warren'), 'W');
  assert.equal(A.initials('BigBets'), 'BB');
  assert.equal(A.initials('jane.doe@example.com'), 'JD');
  assert.equal(A.initials(''), '?');
});

test('openWeeks: the running week while late entry is open, then the next week', () => {
  // Wed Oct 21 2026, noon New York: running week W43 has days left; draft week W44
  assert.deepEqual(plain(A.openWeeks(C, Date.parse('2026-10-21T16:00:00Z'))), ['2026-W43', '2026-W44']);
  // Saturday: no trading day left in the running week
  assert.deepEqual(plain(A.openWeeks(C, Date.parse('2026-10-24T16:00:00Z'))), ['2026-W44']);
  assert.equal(A.weekName(C, '2026-W44'), 'the preseason week of Oct 26');
  assert.equal(A.weekName(C, '2026-W46'), 'the week of Nov 9');
});

test('planCarry', () => {
  const t1 = { picks: ['a', 'b', 'c', 'd', 'e'], captain: 'a' }, t1b = { picks: ['e', 'd', 'c', 'b', 'a'], captain: 'a' };
  const t2 = { picks: ['a', 'b', 'c', 'd', 'f'], captain: 'f' };
  const weeks = ['W1', 'W2', 'W3', 'W4'];
  const actions = o => plain(A.planCarry(o)).map(x => x.week + ':' + x.action);
  // logging in to a different account: push where the account has nothing, keep the account's team when it differs
  assert.deepEqual(actions({ weeks, local: { W1: t1, W2: t1, W3: t1b }, server: { W1: null, W2: t2, W3: t1 }, sameUser: false, locked: ['W1'] }),
    ['W1:push', 'W2:keep', 'W3:same', 'W4:skip']);
  // same user (sign-up or linking): this browser's newer team wins, except where the server is locked
  assert.deepEqual(actions({ weeks, local: { W1: t1, W2: t1 }, server: { W1: t2, W2: t2 }, sameUser: true, locked: ['W1'] }),
    ['W1:skip', 'W2:push', 'W3:skip', 'W4:skip']);
  const keep = plain(A.planCarry({ weeks: ['W2'], local: { W2: t1 }, server: { W2: t2 }, sameUser: false }))[0];
  assert.deepEqual(keep.local, t1);
  assert.deepEqual(keep.server, t2);
});

test('Brief: the switch is off unless exactly true; the committed config keeps it off', () => {
  assert.equal(A.briefOn({ briefSignup: true }), true);
  for (const v of [false, 'true', 1, null, undefined]) assert.equal(A.briefOn({ briefSignup: v }), false);
  assert.equal(A.briefOn(null), false);
  assert.equal(A.briefOn({}), false);
  const launch = JSON.parse(readFileSync(join(ROOT, 'config', 'launch.json'), 'utf8'));
  assert.equal(launch.briefSignup, false);
  assert.equal(launch.emailSignup, false);
  assert.equal(typeof launch._briefSignup, 'string');
});

test('Brief: wording and the Account page status lines', () => {
  assert.equal(A.BRIEF_LABEL, 'Email me The Billionaire Brief: the biggest billionaire moves, free. Unsubscribe any time.');
  assert.equal(A.BRIEF_LIST_LINE, "You're on the list for The Billionaire Brief.");
  assert.equal(A.BRIEF_CONFIRM_LINE, "We'll also start sending The Billionaire Brief once you confirm.");
  assert.equal(A.briefStatusText({ status: 'on', email: 'name@example.com' }), 'Sending to name@example.com.');
  assert.equal(A.briefStatusText({ status: 'waiting', email: 'name@example.com' }), "On. We'll start sending once your email is confirmed.");
  assert.equal(A.briefStatusText({ status: 'off', email: 'name@example.com' }), "You're not getting the Brief.");
  assert.equal(A.briefStatusText(null), "You're not getting the Brief.");
  assert.equal(A.briefStatusText({ status: 'on' }), 'Sending to your email.');
  assert.equal(A.briefListed({ status: 'on' }), true);
  assert.equal(A.briefListed({ status: 'waiting' }), true);
  assert.equal(A.briefListed({ status: 'off' }), false);
  assert.equal(A.briefListed(null), false);
});

test('Brief: the opt-in kept for the confirmation link applies to the same address, for 3 days', () => {
  const at = Date.parse('2026-10-18T12:00:00Z');
  const rec = { email: 'Name@Example.com', at };
  assert.equal(A.briefIntent(rec, 'name@example.com', at + 60000), true);
  assert.equal(A.briefIntent(rec, ' NAME@example.com ', at + A.BRIEF_INTENT_MS), true);
  assert.equal(A.briefIntent(rec, 'name@example.com', at + A.BRIEF_INTENT_MS + 1), false, 'too old');
  assert.equal(A.briefIntent(rec, 'name@example.com', at - 1), false, 'from the future');
  assert.equal(A.briefIntent(rec, 'other@example.com', at + 1), false, 'another address');
  assert.equal(A.briefIntent(rec, '', at + 1), false);
  for (const bad of [null, 'x', {}, { email: '', at }, { email: 'a@b.co' }, { email: 'a@b.co', at: String(at) }]) {
    assert.equal(A.briefIntent(bad, 'a@b.co', at + 1), false);
  }
});
