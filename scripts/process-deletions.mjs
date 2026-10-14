// Delete the accounts that asked to be deleted on account.html (request_account_deletion, 0008_accounts.sql):
// their rosters, league memberships, waitlist rows, events, profile and finally the Supabase Auth user.
// Runs daily from .github/workflows/game.yml, so a request is done within 24 hours. Logs counts only.
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY; without them it prints a note and exits 0 without changing anything.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/process-deletions.mjs
import { processDeletions } from './lib/supa/deletions.mjs';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.log('SUPABASE_URL or SUPABASE_SERVICE_KEY is not set: skipping account deletions');
  process.exit(0);
}
try {
  const r = await processDeletions({ url, key });
  if (r.failed) process.exitCode = 1;
} catch (e) {
  // 0008_accounts.sql not applied yet: the function does not exist (PostgREST answers 404). Nothing to do.
  if (e.status === 404) { console.log('Account deletions: the 0008_accounts.sql functions are not live yet, skipping'); process.exit(0); }
  console.error(`Account deletions failed: ${String(e.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>')}`);
  process.exit(1);
}
