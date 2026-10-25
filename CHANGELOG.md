# Changelog

## 2026-10-25 Safer morning pushes

- Morning data, the morning edition and the manual backfill/backup jobs now push through `scripts/safe-push.mjs`: fetch, rebase, rebuild the generated pages from the combined inputs, push, retrying with growing waits, so two jobs pushing at once no longer lose a day's update (tests in `scripts/lib/safe-push.test.mjs`).

## 2026-10-18 The Billionaire Brief: Portrait Gallery design + opt-in (built, switched off)

- New Brief email design, "The Portrait Gallery": painted-portrait cover story, Face of the day, **The Daily Swing** (5 biggest estimated one-day gainers and 5 losers in public stakes, from `data/insights/leaderboards.json`, left out when older than 4 days), a 2-up gallery of the other stories, quick hits and the game card. Text copied verbatim from the day's edition, source links on every story, opinion labelled (`scripts/lib/brief.mjs`).
- Small JPG copies of the painted portraits for email in `assets/portraits/email/` (made by `scripts/make-email-portraits.mjs`); people without a portrait get an initials circle.
- "Email me The Billionaire Brief" checkbox (unticked, above Continue with Google) in the Create free account dialog, and an on/off switch on the Account page, both behind a new public switch `briefSignup` in `config/launch.json`; the front-page "Save your team" Brief box follows it too.
- Database: `supabase/migrations/0009_brief_accounts.sql` (`set_my_brief`, `my_account()` gains `brief`, recipients include account holders with a confirmed email). Applied by the daily Game sync after merge.
- Owner checklist `docs/BRIEF-SWITCH-ON.md` (Resend, Supabase SMTP, "Confirm email" ON, GitHub secrets, switches, first send).
- Nothing sent. `emailSignup` and `briefSignup` both stay `false`.

## 2026-10-14 Real accounts (built, switched off)

- Free accounts with Continue with Google and/or email + password, behind two public switches in `config/supabase.json` (`authGoogle`, `authPassword`, both `false`). Guests keep playing without signing up; a guest who creates an account keeps the same user id, so their team and leagues carry over.
- New: `assets/v2/auth.js` + `auth-core.js` + `auth.css` (sign-up / log-in dialog, nickname step, team carry-over, forgot password), `account.html` + `assets/v2/account-page.js` (email, sign-in method, nickname, log out, delete my account). Top bar: "Create free account" or a round initials menu; soft "Save your team everywhere" prompt on the home roster card and in the Draft room.
- Database: `supabase/migrations/0008_accounts.sql` (`my_account`, `request_account_deletion`, service-role `pending_account_deletions` / `delete_account_data`); `scripts/process-deletions.mjs` runs in Game sync and deletes requested accounts within 24 hours (counts-only log).
- Privacy and Terms: Google sign-in and the self-service deletion timeline. Owner steps in `docs/OWNER-SETUP.md` section 3.

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
