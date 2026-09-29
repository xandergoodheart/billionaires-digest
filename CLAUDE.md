# Billionaires Digest — project guide for Claude

Live site: https://billionairesdigest.com (GitHub Pages, branch `main`, repo root). Static HTML + JSON; no build server.
Owner works in plain language; keep explanations short and non-technical.

## Branches and versions
- `main` = live v1. Tag `v1.0` + GitHub Release mark the complete v1.
- `v3` = the chosen redesign (owner decision 2026-09-29): ESPN-style, all v2 features, realistic painted portraits. Preview: v3.billionaires-digest.pages.dev. Nothing on `v3` is live until merged into `main`.
- `v2` = casino-style alternative (kept for reference, not the direction). `v2-classic` = older light snapshot.
- Daily automation commits to `main`; merge `main` into `v3` regularly so new data isn't lost (take main's data files, keep v3's `index.html` Play front page, rebuild generated pages with `node scripts/build-pages.mjs`).

## Daily pipeline (America/New_York)
- 5:30 AM `.github/workflows/data.yml` "Morning data": fetch-filings (SEC EDGAR) → fetch-13f (Mondays) → fetch-prices (Finnhub) → build-insights → build-copycat → build-network → build-fantasy → build-book → build-pages → commit.
- 6:00 AM Claude Code cloud routine "Billionaires Digest morning edition" (claude.ai/code/routines/trig_01GNVXrAbF4BZnqEsPGVNmyq, environment "Full network"): follows `EDITION.md`, writes a draft, runs `scripts/publish-digest.mjs` (link check, validate, top10 from data/people/index.json, OG image, build-pages), commits.
- 6:45 AM `game.yml` "Game sync": tests → apply `supabase/migrations/*.sql` (idempotent) → `scripts/supabase-sync.mjs` (fantasy weeks/points, settle, The Book upload/close/settle).
- 7:15 AM `health.yml`: opens/closes a `site-health` GitHub issue.
- `daily.yml` = API backup edition, manual only (needs ANTHROPIC_API_KEY, not set).

## Settings (names only — never put values in files or chat)
- GitHub secrets: FINNHUB_API_KEY, SUPABASE_SERVICE_KEY, SUPABASE_DB_URL (Session pooler string).
- GitHub variables: SEC_USER_AGENT ("Billionaires Digest hello@billionairesdigest.com"), SUPABASE_URL.
- `config/supabase.json` holds only the PUBLIC url + publishable key.

## Key data
- `digest.json` / `archive/` (editions), `data/people/` (100 sourced profiles, built by scripts/build-people.mjs from PRIVATE research kept outside the repo — never commit raw research), `data/filings`, `data/prices`, `data/13f`, `data/fantasy`, `data/book`, `data/insights`.
- Generated pages: `people/`, `companies/`, `editions/`, `guides/`, `sitemap.xml` via `node scripts/build-pages.mjs`. Nav is single-sourced in `scripts/lib/nav.mjs` → `node scripts/sync-nav.mjs`.

## Rules (from the owner)
- Never invent a story, number, quote, date or URL. Every fact links its source. Summarize in our own words.
- Facts in "The move"; opinion only in AI read / why / bear / memo. Plain language, no hype.
- Keep "For information only · not financial advice".
- Money (owner decision 2026-09-27): real-money play is a goal. The live game stays play money (and its published terms say so) until a licensed/legal route is chosen after legal review — e.g. partnering with licensed operators, or licensed paid-entry contests. Never skip or weaken legally required age, identity, location or responsible-gambling checks, and never use deceptive mechanics (fake near-misses, fake winner feeds, false countdowns). See docs/GAMIFICATION-RESEARCH.md.
- Real estate at city/area level only; no addresses, no tracking people's movements or family members.
- No photos of real people and no company logos in art; v2 uses illustrated portraits (style must be approved first).
- Ask before deleting anything, before actions that cost money, and before publishing anything new outward.
- Never put personal email addresses in requests or files.

## Working conventions
- Owner's global rules: THINK (plan) → DO (Opus subagents implement) → CHECK (review diffs, run tests) for non-trivial work.
- Tests: `node --test scripts/lib/*.test.mjs scripts/lib/**/*.test.mjs` (includes pglite SQL tests). Must pass before pushing.
- Browser code is ES5 (IIFE + `BD` helpers in assets/common.js). Mobile 390px, both themes, visible focus, reduced motion.
- Local preview: `python3 -m http.server 48213 --bind 127.0.0.1` (port 8765 belongs to another app).
- Backups: dated folders in ~/Documents and iCloud Drive "Billionaires Digest backups" (git bundle + snapshot + private research + checksums).
