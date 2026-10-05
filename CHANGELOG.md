# Changelog

## 2026-10-04 Waitlist front end

- New landing page (index.html): email signup with double opt-in, place in line, referral link, captain pick, league reservation with invite link, today's stories.
- One switch `config/launch.json` hides the game and tools behind an "Opens Nov 9" card; old Play page kept as play.html. Menus show only Rules + a "Join the waitlist" button and no odds ticker while gated.
- New privacy.html (draft, needs legal review) and unsubscribe.html (click to confirm).

## 2026-10-04 Waitlist backend
- New database migration `supabase/migrations/0005_waitlist.sql`: waitlist signups (email confirmed through Supabase Auth), referral codes and place in line (each confirmed friend = 10 spots, set in `waitlist_ref_boost()`), captain pick, one reserved league per signup (max 50 members), our own event log, unsubscribe by token, public aggregate stats (captain breakdown only after 20 picks) and service-role-only metrics. Tables are closed to the browser; everything goes through functions.
- Tests: `scripts/lib/supa/waitlist.sql.test.mjs` (in-memory Postgres, both privilege modes), `scripts/lib/brief.test.mjs`.
- The Billionaire Brief email: builder `scripts/lib/brief.mjs`, sender `scripts/send-brief.mjs` (dry run by default; writes `out/brief-preview.html`), manual-only workflow `.github/workflows/brief.yml`. Built but OFF until the owner approves the first issue and adds the email settings.
- `scripts/waitlist-metrics.mjs` prints the waitlist numbers (service role key from env).
