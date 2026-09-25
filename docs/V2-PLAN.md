# Billionaires Digest v2 — build plan

Companion to `docs/V2-BRIEF.md` (direction + decisions). This file is the "how".

## Principles
- v2 is a new face + information architecture. Game rules, data files, scripts, Supabase and The Book stay as in v1.
- v2 pages reuse v1 engines unchanged: `assets/fantasy-core.js` (rules), `assets/game-client.js` (Supabase),
  `assets/account.js` (sign-in), `assets/common.js` (BD helpers, data loaders). v2 adds its own CSS/JS under `assets/v2/`.
- Same browser storage key as v1 (`bd-fantasy-v1`, same shape), so a player's saved v1 team appears in v2 and vice versa.
- Real data only. Empty/early states (no team yet, no scored days yet, practice week) are designed, not faked.

## Screens and files
| Screen | Page | Script |
|---|---|---|
| Design system (style guide, not linked, noindex) | `design.html` | — |
| My team | `team.html` | `assets/v2/team.js` |
| Draft room | `draft.html` | `assets/v2/draft.js` |
| Player profile, Rankings, Calendar, Newsroom, Leagues, Leaderboard, The Book | later, in brief order | later |

Shared v2 files:
- `assets/v2/tokens.css` — CSS variables from design-tokens.json (colors, type, spacing, radius, motion).
- `assets/v2/ui.css` — base type, 12-col grid, cards, buttons, tables, badges, stat blocks, cap meter,
  top bar, sub-tabs, phone bottom tabs, footer, forms, focus rings, reduced motion.
- `assets/v2/chrome.js` — ES5: phone MENU sheet, current-tab handling.
- `assets/v2/fantasy-store.js` — ES5, one global `BDFantasyStore`: loads index/week/day JSON, reads/writes
  `bd-fantasy-v1`, validate + save team (incl. late entry, same as v1), online sync via `BDGame.syncRoster`,
  week scoring (`teamWeek`, same as v1) and per-player stats. Pure parts tested with `node --test`.

## How v2 coexists with v1 on the `v2` branch
- New pages get new URLs (`team.html`, `draft.html`). v1 `fantasy.html` stays until v2 covers its matchup/season
  views (Scores tab); at launch `fantasy.html` becomes a small redirect to `team.html` so old links keep working.
- Top-bar links point at the best existing page until the v2 screen exists (Players → `people/`,
  Rankings → `leaderboard.html`, Calendar → `calendar.html`, News → `index.html`).
- Daily data pipeline and cloud routine keep committing to `main`; `main` is merged into `v2` regularly.

## Chrome (single-sourced)
- `scripts/lib/nav.mjs` gains `NAV_V2` (top: Fantasy · Players · Rankings · Calendar · News; sub-tabs per section,
  e.g. Fantasy → My team · Draft room · Scores · Leagues · The Book · Rules) and render functions for the top bar
  (BD wordmark, search, red "My team" button), sub-tabs, phone bottom tabs and v2 footer.
- `scripts/sync-nav.mjs` writes v2 chrome into pages that carry `<!-- v2topbar:start -->` markers; v1 pages are untouched.
- `scripts/build-pages.mjs` (people/companies/editions/guides) switches to a v2 layout when those screens are built.

## Player art
Initials on a sector-coloured plate until the owner approves an illustrated portrait style (2–3 person test first;
ask before spending image credits). The avatar component takes an optional image URL so portraits drop in later.

## Open decisions for the owner
- Dark mode: v1 had one. v2 tokens include a dark set; owner decides whether to ship it.

## Checks per screen
Tests pass (`node --test scripts/lib/*.test.mjs scripts/lib/**/*.test.mjs`); previewed at 390px and desktop;
keyboard focus visible; reduced motion respected; no console errors; numbers match the week JSON.
