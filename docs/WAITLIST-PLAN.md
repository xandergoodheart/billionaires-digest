---
name: waitlist-plan
description: Build plan for the Waitlist launch (Oct 5–11, 2026) from the owner's "Waitlist Launch Plan" PDF (2026-10-04).
status: approved-to-build (owner: "build it", 2026-10-04); merge needs owner OK
branch: feat/waitlist
---

# Waitlist launch — build plan

Source: owner's PDF "Billionaires Digest Waitlist Launch Plan" (Oct 4, 2026). Season 1 opens **Mon 2026-11-09**, lineups lock 9:30 AM ET.
Stack decision: stay on the current static site (GitHub Pages) + existing Supabase. No Next.js, no PostHog, no new paid service is created by us.

## Owner decisions applied (2026-10-04)
- Path A comes after the waitlist (Oct 12–Nov 1): email + Google login, invite links, share card, rules. Not in this build.
- Drop the +10 per Digest story bonus — not in this build; it ships with Path A's scoring change + rules rewrite (game is hidden until then).
- Tracking = our own Supabase table (no PostHog).
- Defaults chosen by Claude because owner said "build it" without answering: game hidden behind ONE switch; email double opt-in uses Supabase Auth confirmation (works with Supabase's built-in sender for testing; owner adds Resend SMTP in the Supabase dashboard for real volume); the Brief sender is built but OFF (manual, dry-run by default) until the owner approves the first issue and adds RESEND_API_KEY.

## Hard rules (every file)
- Free to play. No payments, prizes, coins-for-money, betting UI on the landing/waitlist.
- No secrets in files. Browser uses only `config/supabase.json` (public url + publishable key). Server scripts read env vars.
- RLS ON for every new table, explicit policies; anon/authenticated get no direct table access — RPCs only (SECURITY DEFINER with `set search_path = public`), like `0001_game.sql`.
- Migrations idempotent (CI re-applies all of them daily). New migration file: `supabase/migrations/0005_waitlist.sql` (0004 is reserved in `pending/`).
- Browser code ES5 IIFE + `BD` helpers (assets/common.js). Mobile 390px, light+dark themes, visible focus, reduced motion.
- Never invent facts. Captain stats shown only from real counts. No real-person photos.
- Don't edit `scripts/` files the morning routine relies on in ways that change their behaviour; `index.html` must keep its og:image / twitter:image meta tags (scripts/lib/og.mjs rewrites them) and the v2 nav/footer markers.

## 1. Database — `supabase/migrations/0005_waitlist.sql`
Tables (all RLS on, no grants to anon/authenticated):
- `waitlist` — `id uuid pk default gen_random_uuid()`, `user_id uuid unique references auth.users on delete cascade`, `email citext unique not null`, `referral_code text unique not null` (8 chars, same alphabet as `new_invite_code`), `referred_by uuid references waitlist(id)`, `captain_pick text` (slug, `^[a-z0-9-]{2,80}$`), `source jsonb` (utm_source/medium/campaign/ref page; max 5 keys, values ≤100 chars), `confirmed_at timestamptz`, `unsubscribed_at timestamptz`, `unsub_token uuid unique default gen_random_uuid()`, `created_at timestamptz default now()`.
- `waitlist_leagues` — `id`, `name citext unique` (3–30 chars, letters/digits/space/-/_ /'), `owner_id uuid references waitlist(id) on delete cascade` (one reserved league per signup), `invite_code text unique`, `created_at`.
- `waitlist_league_members` — `(league_id, waitlist_id)` pk, `joined_at`. Max 50 per league.
- `events` — `id bigserial`, `user_id uuid null`, `name text` check in (`waitlist_signup`,`referral_signup`,`captain_picked`,`league_reserved`,`league_joined`,`invite_copied`,`share_clicked`,`brief_sent`,`brief_clicked`), `props jsonb` (≤2 KB), `created_at`.

Position in line: rank among confirmed, subscribed-or-not rows ordered by `(created_seq − 10 × confirmed_referrals)`, ties by created_at. (Each confirmed friend = 10 spots up; constant `REF_BOOST` in one SQL function so the owner can change it.)

RPCs (grant execute to anon, authenticated unless noted; all use `auth.uid()`):
- `waitlist_join(p_email text, p_ref text, p_league text, p_source jsonb) returns jsonb` — requires a session (anonymous is fine). Validates email format, lowercases. Creates/updates the caller's row (pending until confirmed). Stores `referred_by` from referral code (ignore self/unknown). If `p_league` is an invite code, remember it to join on confirm. Logs `waitlist_signup` (+ `referral_signup` if referred). Returns `{referral_code, confirmed:false}`. Re-calling with the same email is idempotent; an email belonging to another user → error `email_taken` (client then offers "send me a sign-in link").
- `waitlist_confirm() returns jsonb` — succeeds only if `auth.users.email` of the caller is set and `email_confirmed_at` not null and equals the row's email; sets `confirmed_at` once; performs the pending league join. Returns `waitlist_me()`.
- `waitlist_me() returns jsonb` — `{email, referral_code, confirmed, position, total, referrals_confirmed, captain_pick, league:{name, invite_code, members}|null, joined_leagues:[names]}`.
- `waitlist_pick_captain(p_slug text)` — confirmed users only; logs `captain_picked` on first pick.
- `waitlist_reserve_league(p_name text) returns jsonb` — confirmed users only; one per user; logs `league_reserved`; returns `{name, invite_code}`.
- `waitlist_join_league(p_code text)` — confirmed users only; max 50; logs `league_joined`.
- `waitlist_league_info(p_code text) returns jsonb` — public: `{name, members}` only (no emails, no owner identity beyond nothing). Null if unknown.
- `waitlist_stats() returns jsonb` — public aggregate: `{total_confirmed, captains:[{slug, count, pct}] top 10}`; only returns captain breakdown once ≥ 20 picks (avoid exposing individuals).
- `waitlist_unsubscribe(p_token uuid) returns boolean` — public, by token.
- `log_event(p_name text, p_props jsonb)` — public, only `invite_copied`, `share_clicked` from the browser; rate-limit: ignore if same user+name in last 10 s.
- `waitlist_admin_metrics(p_days int default 30)` — **service_role only** — counts per event per day, signups, confirmed, % with captain, leagues reserved, members per league, referral share (% confirmed who referred ≥1), unsubscribes.

Tests — `scripts/lib/supa/waitlist.sql.test.mjs` using `pgtest.mjs` (both MODES): join → confirm requires confirmed email (stub `auth.users` needs `email`, `email_confirmed_at` columns: extend `supabase/tests/auth-stub.sql` minimally and idempotently, without breaking existing tests); referral boost moves position; self-referral ignored; captain requires confirmed; one league per user; 50-member cap; league info exposes no emails; anon cannot select any waitlist table directly; stats hidden under 20 picks; unsubscribe by token; admin metrics denied to anon/authenticated; migrations apply twice.

## 2. Browser
New/changed files (frontend owner only):
- `config/launch.json` — `{"gate": true, "seasonStart": "2026-11-09", "seasonStartLabel": "Monday, Nov 9"}`. The ONE switch.
- `assets/launch.js` (ES5) — reads launch.json; when `gate` is true, on gated pages replaces the main content with an "Opens Nov 9" card linking to the waitlist. Gated pages (PDF: "Draft room, The Book, Next Moves, tools"): play, team, draft, scores, leagues, book, moves, markets, and the Tools pages flows, quarterly, copycat, network, compare, property. NOT gated: news, people/companies/editions/guides, players, player, academy, life, life-play, play-terms (Rules), about, archive, calendar, sectors. Must not flash gated content (inline `<html class="bd-gated">` early check is fine; content hidden via CSS until decided; if launch.json fails to load, fail OPEN = show page).
- `play.html` — the current Play front page (move today's index.html body here verbatim; gated).
- `index.html` — new landing page (keep the v2 topbar/tabs/footer markers and all `<meta property="og:image">`/`twitter:image` tags). Content:
  - Headline "Fantasy football, but the players are billionaires." Subhead "Draft Musk. Bench Bezos. Free. Season 1 starts Monday, Nov 9."
  - Email form → states: (a) enter email, (b) "Check your inbox to confirm" (resend button, 60 s cooldown), (c) confirmed: place in line "#N of T", personal referral link `https://billionairesdigest.com/?ref=CODE` with Copy + Web Share (fallback copy), "Each friend who confirms moves you up 10 spots."
  - After confirm: "Pick your captain" one-tap grid from `data/people/index.json` (top 20 by rank, initials avatars or existing painted portraits/silhouettes — no photos), then "Reserve your league" (name → invite link `https://billionairesdigest.com/?join=CODE`, copy/share).
  - `?join=CODE` visitors see "You're invited to {league name} · {n} members" above the form; joining the waitlist adds them on confirm.
  - Below the fold: today's top stories from `digest.json` (link to news.html) so the news feed stays front and centre; "Free to play · bragging rights only · not financial advice"; link to privacy page.
  - Captain stats line only when `waitlist_stats` returns them.
- `assets/waitlist.js` (ES5) + `assets/waitlist.css`. Uses `BDGame`'s Supabase client pattern from `assets/game-client.js` (load supabase-js the same way). Flow: ensure session (signInAnonymously) → `waitlist_join` → `auth.updateUser({email}, {emailRedirectTo: origin + '/?confirmed=1'})` → on return the page must detect the session from the URL (set `detectSessionInUrl: true` for this client only, same storageKey `bd-game-auth`) → `waitlist_confirm`. If `email_taken`: offer `signInWithOtp({email, options:{emailRedirectTo, shouldCreateUser:false}})` ("We'll email you a sign-in link"). Store `ref`, `join`, utm params in sessionStorage until join. If multiplayer is off/unreachable, show "Signups open shortly" (no crash).
- `unsubscribe.html` — reads `?t=token`, calls `waitlist_unsubscribe`, shows result.
- `privacy.html` — plain-language privacy notice: what we collect (email, referral code, captain pick, league name, utm source, basic events), why, Supabase (hosting/auth) and email provider as processors, no selling, no ad trackers, how to unsubscribe / request deletion via hello@billionairesdigest.com (the public business address, already used in SEC_USER_AGENT). Marked "Draft — needs legal review" in an HTML comment only.
- Nav (`scripts/lib/nav.mjs`, then `node scripts/sync-nav.mjs`): while gated, Play section points to index.html (landing) and its sub-tabs are hidden except Rules; Tools section hidden. Implement as a `GATED` flag in nav.mjs read from `config/launch.json` so un-gating is one file + sync. Keep nav tests passing (update them).
- `sitemap.xml`/robots: add privacy.html; gated pages remain crawlable but say "Opens Nov 9".

## 3. Brief sender (built, OFF)
- `scripts/send-brief.mjs` — builds "The Billionaire Brief" from the latest `digest.json` (headline + 3–5 top stories with their existing source links, our own words already in the digest; no new facts), plus place-in-line line per recipient, unsubscribe link `https://billionairesdigest.com/unsubscribe.html?t=TOKEN`, physical/contact line, "not financial advice". Default `--dry-run` writes `out/brief-preview.html` and a recipient count; `--send` requires env `RESEND_API_KEY`, `BRIEF_FROM`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `--confirm-date=YYYY-MM-DD` matching today. Recipients: confirmed, not unsubscribed. Batches ≤ 50, ≤ 2 req/s, retries on 429. Logs `brief_sent`. Click tracking: links carry `?utm_source=brief&utm_medium=email&utm_campaign=<date>`.
- `.github/workflows/brief.yml` — `workflow_dispatch` only (inputs: mode dry-run|send, confirm_date). No schedule until the owner says so.
- Unit tests for the HTML builder (`scripts/lib/brief.test.mjs`): includes unsubscribe link, no raw prices, escapes text.
- `scripts/waitlist-metrics.mjs` — prints `waitlist_admin_metrics(30)` as a table using SUPABASE_URL + SUPABASE_SERVICE_KEY env.

## 4. Acceptance criteria
- `node --test scripts/lib/*.test.mjs scripts/lib/**/*.test.mjs` passes (all existing + new).
- Local preview (`python3 -m http.server 48213 --bind 127.0.0.1`): landing renders at 390px and desktop, both themes, no console errors; gated pages show "Opens Nov 9"; setting `gate:false` restores them; news.html unchanged.
- `node scripts/render-og.mjs` (or og.mjs meta update) still finds and updates index.html meta tags.
- No secrets in diff (`git diff | grep -iE "key|secret|token"` reviewed).
- STATUS.md updated with claim + handoff; CHANGELOG.md entry.

## Owner actions needed before going live (Claude cannot do these)
1. Supabase dashboard → Auth → URL config: add `https://billionairesdigest.com/**` to redirect URLs; Email provider ON with "Confirm email" ON.
2. For real volume: Resend account (free tier 100/day; ~$20/mo beyond) + DNS records at Porkbun; plug Resend SMTP into Supabase Auth; add `RESEND_API_KEY`, `BRIEF_FROM` GitHub secrets.
3. Review preview, then merge the PR (game hides at that moment).
4. Lawyer glance at "Draft Musk. Bench Bezos." before paid ads, and at privacy.html.
