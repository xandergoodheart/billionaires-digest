---
name: preseason-fixes-plan
description: Go-live fixes from the 2026-10-11 audit + preseason conversion of the waitlist branch. Owner said 2026-10-12 "start all the fixes other than the finnhub or anything that has to do with subscriptions".
branch: feat/preseason (= feat/waitlist + origin/main)
---

# Preseason go-live fixes

Excluded by owner: anything about Finnhub (vendor, licence, publishing price files) and anything needing a subscription or paid service (Resend, Supabase plan, PO box, lawyer, paid data). Leave those alone.

Shared rules: CLAUDE.md applies (ES5 browser code, no secrets, RLS, idempotent migrations, never invent facts, ask before deleting). Each workstream owns its files only. Tests must pass: `node --test scripts/lib/*.test.mjs 'scripts/lib/**/*.test.mjs'`. Do NOT commit regenerated data or regenerated pages (people/, companies/, editions/, guides/, data/**) — the daily bots on main rewrite them and it would conflict; code fixes take effect on the next morning run after merge. Exception noted per item.

## A. Scoring data (owner of scripts/fetch-prices*.mjs, scripts/build-fantasy.mjs, scripts/lib/fantasy.mjs, assets/fantasy-core.js, scripts/supabase-sync.mjs + scripts/lib/supa/sync*, scripts/lib/book/* settlement inputs only if they read closes)
A1. Real closes only. The data job runs at unpredictable times (observed 14:00–19:00 UTC, during market hours). Store a close for date D only when known: Finnhub `pc` is the close of the previous trading session relative to the quote's own session date; `c` is a close only if the quote time is ≥ 16:00 ET (13:00 ET on half days) of its session date. Never write an intraday price into history as a close. Repair: when a later run learns the real close for a date already in history, overwrite it.
A2. Daily points = own close-to-close from history (prev trading day close → day close), not Finnhub `dp`. A day file is (re)built once both closes are known; rebuild the last 10 trading days every run so W41/W42 self-correct after merge.
A3. ADR/OTC quotes with midnight-UTC timestamps: date them by their UTC date, not converted to NY (which shifts to the previous day). No weekend dates ever in history (drop/repair e.g. PSKY 2026-10-04). Add tests with IDEXY/LVMUY-like fixtures.
A4. Sanity guard: a day move > 40% or that disagrees with our own previous close by > 2 percentage points is quarantined (scored 0, flagged in the day file `flags`), never scored. Test with the PSKY 2026-10-05 case (pc 4.75 vs 9.5).
A5. Remove the +10 story bonus (POINTS.story) from scoring and wherever the client shows it; keep insider-buy +25. (Rules page text is workstream D.)
A6. NYSE holidays + half days for 2026–2027 in one list (cite https://www.nyse.com/markets/hours-calendars in a comment): no trading-day files for holidays; half-day close 13:00 ET. Tests for 2026-11-26 and 2026-11-27.
A7. Captain rounding: make client (fantasy-core / My team) and server settle_week agree. Prefer: round the weekly total once (both sides). If the server side needs SQL, put it in a NEW migration `supabase/migrations/0006_scoring_fixes.sql` (idempotent) — coordinate: workstream C owns 0005/0006 SQL files, so instead write the exact SQL change in your report for C/the reviewer, don't edit SQL.
A8. Supabase sync: after recomputing, re-upload person_points for the last 3 weeks and re-settle a week marked final if its points changed (no users have rosters yet: team_scores is empty). Verify with existing pgtest harness if sync logic is SQL-tested.
Report: what changed, tests, a dry run of build on current data showing Ellison/NVDA/Arnault corrected for W41 (compute in a scratch dir, don't commit data).

## B. Forbes removal + raw prices (runs AFTER A; owner of scripts/build-people.mjs, scripts/build-pages.mjs, scripts/lib/pages/*, scripts/lib/edition.mjs, news.html/news ticker code, about.html, players.html/player.html scripts, salary function in scripts/lib/fantasy.mjs)
B1. Replace Forbes net worth + rank everywhere with our own "Public Stake Value" from data/prices/networth-est.json (disclosed holdings × closes) with an "as of" date; never call it net worth. Where no estimate exists show "—" with "No US-listed stake on file".
B2. Player order and salary tiers come from our own Public Stake Value rank (people without one: tier 14). No Forbes rank anywhere. Keep data/people/*.json source fields as research provenance but nothing user-facing says Forbes.
B3. Remove the "Net worth · Forbes" ticker on news.html (replace with Public Stake Value top 10 or remove).
B4. Raw prices: show percent moves only, never "$382.70" share prices (people pages, player dossier, any card). Keep "Prices via Finnhub" attribution out of scope (Finnhub decision pending) — just don't show raw prices.
B5. Remove internal research notes from public pages (e.g. "Web search budget exhausted…", "Research gaps").

## C. Security / backend (owner of supabase/migrations/0005_waitlist.sql, new 0006 if needed, supabase/tests/*, scripts/lib/supa/*.test.mjs, .github/workflows/*.yml, scripts/health-check.mjs, scripts/send-brief.mjs logging, .gitignore, assets/game-client.js, assets/account.js; captcha client changes in assets/waitlist.js only in phase 2)
C1. game.yml: run each migration with `--single-transaction` (keep ON_ERROR_STOP). In 0005, wrap so a partial failure can't leave admin functions executable (single transaction covers it; also move revokes next to each sensitive function).
C2. Email normalisation for uniqueness + referral credit: lowercase, strip +tag; for gmail.com/googlemail.com also remove dots. Store original email for sending; unique on normalised.
C3. log_event: require a session (auth.uid() not null), props ≤ 256 bytes, ≤ 200 events per user per day.
C4. Unconfirmed-row takeover only when the other row is > 24 h old; otherwise 'email_pending' (client shows "That email has a pending confirmation — check its inbox or try again tomorrow").
C5. profiles: anon/authenticated must not read other users' id↔coins; expose leaderboards via existing RPCs. Only if it doesn't break existing pages/tests — check every client read of profiles first; if risky, report instead.
C6. Nickname renames: max once per 7 days after the first set.
C7. Backups: `.github/workflows/backup.yml` nightly pg_dump of public schema data (+ auth.users ids/emails needed to restore? no — public schema only) encrypted with `gpg --symmetric` using secret BACKUP_PASSPHRASE, uploaded as a 30-day artifact; skip with a clear message if the secret is missing. Document restore in docs/BACKUPS.md.
C8. health-check.mjs: add a Supabase public RPC read (e.g. leaderboard_season or current_week returns 200) and "last Game sync run succeeded within 30 h" via GitHub API in the workflow.
C9. Pin GitHub Actions to full commit SHAs (comment with the tag). `.gitignore` add `.env*`. send-brief.mjs: don't print provider response bodies (status code only).
C10 (phase 2, after D): Cloudflare Turnstile — config/supabase.json gains optional public `turnstileSiteKey`; when present, render the widget and pass `options.captchaToken` to signInAnonymously / signInWithOtp / updateUser (game-client.js, account.js, waitlist.js). When absent, behave exactly as today.
C11. Apply A7's SQL (captain rounding in settle_week) in 0006 if A reports one.

## D. Site cleanup, legal pages, preseason front (owner of index.html, play.html, config/launch.json, assets/waitlist.js (copy/flow; phase 1), assets/waitlist.css, assets/launch.js, privacy.html, new terms.html, play-terms.html, 404.html, scripts/lib/nav.mjs + sync-nav + nav tests, top-level *.html head tags, assets/v2/team.js + assets/fantasy.js copy strings, assets/news.css, mockups/, design.html)
D1. Preseason: config/launch.json gate=false. Front page (index.html) = Play home with a top "Season 1 starts Monday, Nov 9 · Play the preseason now, free" hero: primary CTA "Draft your team" → draft.html; secondary email box "Save your team & get your invite link" using the waitlist flow (confirm email → referral link, captain pick, reserve league). Preseason weeks don't count; everyone resets Nov 9 (say so). Keep the Play home's existing content below. Keep og meta tags. play.html becomes a redirect to / (or remove the duplicate; don't delete without noting it in the report).
D2. Menus (owner decision 2026-10-04): hide The Book, Next Moves, Copycat portfolio, Who invests with whom, Where they buy from menus only; pages stay reachable. Keep My team, Draft, Scores, Leagues, Rules, Players, News, remaining Tools.
D3. Rules page (play-terms.html): remove the +10 story bonus text; plain-language rewrite of scoring (5 picks, cap 100, captain 1.5x, insider buy +25, salaries from Public Stake Value rank — coordinate wording with B: say "salaries are set from each player's Public Stake Value rank and recent form"), preseason note, play money only.
D4. terms.html (new, "Draft — needs legal review" in an HTML comment): eligibility 18+ (US only? say "where permitted"), free play / no purchases / no prizes / no cash value, accounts & termination, acceptable use, content is information not advice, AI-written news may contain errors + corrections link, IP, disclaimers, limitation of liability, governing law New York, changes to terms, contact hello@billionairesdigest.com. Link from footer + signup ("By joining you agree to the Terms and Privacy").
D5. privacy.html: add effective date (2026-10-12), operator name "Billionaires Digest" (owner to fill legal entity — leave a visible placeholder? NO placeholders on public page: say "Billionaires Digest ('we')"), 18+/no children under 13 + deletion on request, retention (until deletion request; events 13 months), Do Not Track statement (we don't track across sites; no third-party trackers), processors (Supabase; email provider named generically "our email delivery provider" until chosen), changes clause. Signup copy must say they'll get account emails and (if they tick a box, default unticked) "The Billionaire Brief" — add an opt-in checkbox stored on the waitlist row (coordinate: C adds column `brief_opt_in boolean default false` + param; D sends it). 
D6. Move mockups/ and design.html off the public site: create branch `archive/mockups` containing them (reviewer will push it), then remove them from feat/preseason. Delete stray `assets/art/.jpg` (empty-name file).
D7. Stale copy: team.html "Start your streak Monday (Sep 28)", scores "first real week starts Mon Sep 28", "No scores yet this week" on final weeks → compute from current week data.
D8. 404.html (site look, links to home/news). og:title/description/image on draft, team, scores, leagues, play-terms, players, player, terms, privacy (reuse og/latest.png).
D9. news.css light-mode top bar contrast (text/icons readable, ≥ 4.5:1).
D10. Odds-style ticker: while Book is hidden from menus, hide the moneyline ticker too.

## Order
Phase 1 in parallel: A, C (C1–C9, C11 later), D. Phase 2: B (after A), C10 + C11 (after D and A).
Reviewer (Fable) checks diffs, runs tests + local preview, then one PR replacing #7.
