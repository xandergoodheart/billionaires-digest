// Account deletions (supabase/migrations/0008_accounts.sql): for each pending request, delete the user's game data
// (delete_account_data, service role) and then the auth user through the Supabase Auth admin API, which also removes
// the request row (on delete cascade). Logs counts only: never user ids, emails or nicknames.
// A failure on one user is reported and the others still run; the request stays and is retried on the next run.
import { makeRest } from './rest.mjs';

export async function processDeletions({ url, key, fetchImpl = fetch, log = console.log } = {}) {
  const rest = makeRest({ url, key, fetchImpl });
  const pending = await rest.rpc('pending_account_deletions');
  const totals = {};
  let done = 0, failed = 0;
  const headers = { apikey: key };
  if (/^eyJ/.test(key)) headers.Authorization = `Bearer ${key}`;
  for (const row of pending || []) {
    try {
      const counts = await rest.rpc('delete_account_data', { p_user: row.user_id });
      for (const [k, v] of Object.entries(counts || {})) totals[k] = (totals[k] || 0) + (Number(v) || 0);
      const r = await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/admin/users/${encodeURIComponent(row.user_id)}`, { method: 'DELETE', headers });
      // 404: the auth user is already gone (and with it the request row)
      if (!r.ok && r.status !== 404) throw new Error(`auth admin delete: HTTP ${r.status}`);
      done++;
    } catch (e) {
      failed++;
      log(`Account deletion failed for one request (will retry next run): ${String(e && e.message || e).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>')}`);
    }
  }
  const parts = Object.entries(totals).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
  log(`Account deletions: ${(pending || []).length} pending, ${done} deleted, ${failed} failed${parts.length ? ` (removed: ${parts.join(', ')})` : ''}`);
  return { pending: (pending || []).length, done, failed, totals };
}
