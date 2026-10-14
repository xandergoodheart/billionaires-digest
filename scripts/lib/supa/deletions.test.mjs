// node --test scripts/lib/supa/deletions.test.mjs
// scripts/lib/supa/deletions.mjs with a fake Supabase: data first, then the auth user; one failure does not stop the
// rest; the log never contains user ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processDeletions } from './deletions.mjs';

const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
function fake({ pending, authStatus = {} }) {
  const calls = [];
  const fetchImpl = async (u, opts) => {
    calls.push([opts.method, u.replace('https://x.supabase.co', ''), opts.body ? JSON.parse(opts.body) : null, opts.headers]);
    const ok = (data, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(data) });
    if (u.endsWith('/rest/v1/rpc/pending_account_deletions')) return ok(pending);
    if (u.endsWith('/rest/v1/rpc/delete_account_data')) return ok({ rosters: 2, events: 1, profiles: 1 });
    const m = /admin\/users\/(.+)$/.exec(u);
    if (m) return ok({}, authStatus[m[1]] || 200);
    return ok({ message: 'nope' }, 404);
  };
  return { calls, fetchImpl };
}

test('deletes data, then the auth user, for every pending request', async () => {
  const f = fake({ pending: [{ user_id: U1 }, { user_id: U2 }] });
  const lines = [];
  const r = await processDeletions({ url: 'https://x.supabase.co', key: 'sb_secret_test', fetchImpl: f.fetchImpl, log: l => lines.push(l) });
  assert.deepEqual({ pending: r.pending, done: r.done, failed: r.failed }, { pending: 2, done: 2, failed: 0 });
  assert.deepEqual(r.totals, { rosters: 4, events: 2, profiles: 2 });
  assert.deepEqual(f.calls.map(c => c[0] + ' ' + c[1]), [
    'POST /rest/v1/rpc/pending_account_deletions',
    'POST /rest/v1/rpc/delete_account_data', `DELETE /auth/v1/admin/users/${U1}`,
    'POST /rest/v1/rpc/delete_account_data', `DELETE /auth/v1/admin/users/${U2}`]);
  assert.deepEqual(f.calls[1][2], { p_user: U1 });
  assert.equal(f.calls[2][3].apikey, 'sb_secret_test');
  assert.equal(f.calls[2][3].Authorization, undefined, 'new secret keys go in apikey only');
  assert.ok(!lines.join('\n').includes(U1) && !lines.join('\n').includes(U2), 'no user ids in the log');
  assert.match(lines.at(-1), /2 pending, 2 deleted, 0 failed \(removed: rosters 4, events 2, profiles 2\)/);
});

test('an auth error on one user is counted and the next one still runs; 404 counts as done', async () => {
  const f = fake({ pending: [{ user_id: U1 }, { user_id: U2 }], authStatus: { [U1]: 500, [U2]: 404 } });
  const lines = [];
  const r = await processDeletions({ url: 'https://x.supabase.co/', key: 'eyJlegacy', fetchImpl: f.fetchImpl, log: l => lines.push(l) });
  assert.equal(r.done, 1);
  assert.equal(r.failed, 1);
  assert.equal(f.calls[2][3].Authorization, 'Bearer eyJlegacy');
  assert.ok(!lines.join('\n').includes(U1));
});

test('nothing pending: one summary line', async () => {
  const f = fake({ pending: [] });
  const lines = [];
  const r = await processDeletions({ url: 'https://x.supabase.co', key: 'k', fetchImpl: f.fetchImpl, log: l => lines.push(l) });
  assert.equal(r.done, 0);
  assert.deepEqual(lines, ['Account deletions: 0 pending, 0 deleted, 0 failed']);
});
