# Changelog

## 2026-10-12 Preseason go-live fixes

- Game stays open as a preseason (Season 1 starts Mon Nov 9); front page = Play home + "save your team" email signup with referral and league invite links.
- Scoring: real closing prices only, own close-to-close moves, foreign ADRs no longer stuck at 0, bad-quote guard (>40% or 2-pt mismatch quarantined), NYSE holidays/half days, +10 story bonus removed, captain rounded per day on both sides.
- Forbes data and raw share prices removed from pages; Public Stake Value (our own SEC-holdings estimate) used for rank and salaries.
- Security: single-transaction migrations, email alias normalisation, event limits + 13-month purge, 24h pending-signup protection, profiles private, nickname change once per 7 days, pinned Actions, encrypted nightly backup (needs BACKUP_PASSPHRASE), health check covers the game server, optional Turnstile bot check.
- Terms of Use and updated Privacy Policy (drafts for legal review), 404 page, og tags, news top-bar contrast, mockups moved to branch archive/mockups.

## 2026-10-04 Waitlist front end

- New landing page (index.html): email signup with double opt-in, place in line, referral link, captain pick, league reservation with invite link, today's stories.
- One switch `config/launch.json` hides the game and tools behind an "Opens Nov 9" card; old Play page kept as play.html. Menus show only Rules + a "Join the waitlist" button and no odds ticker while gated.
- New privacy.html (draft, needs legal review) and unsubscribe.html (click to confirm).

## 2026-10-04 Waitlist backend
- New database migration `supabase/migrations/0005_waitlist.sql`: waitlist signups (email confirmed through Supabase Auth), referral codes and place in line (each confirmed friend = 10 spots, set in `waitlist_ref_boost()`), captain pick, one reserved league per signup (max 50 members), our own event log, unsubscribe by token, public aggregate stats (captain breakdown only after 20 picks) and service-role-only metrics. Tables are closed to the browser; everything goes through functions.
- Tests: `scripts/lib/supa/waitlist.sql.test.mjs` (in-memory Postgres, both privilege modes), `scripts/lib/brief.test.mjs`.
- The Billionaire Brief email: builder `scripts/lib/brief.mjs`, sender `scripts/send-brief.mjs` (dry run by default; writes `out/brief-preview.html`), manual-only workflow `.github/workflows/brief.yml`. Built but OFF until the owner approves the first issue and adds the email settings.
- `scripts/waitlist-metrics.mjs` prints the waitlist numbers (service role key from env).
