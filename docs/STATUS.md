---
name: status
description: Current live state, handoffs, blockers and editing claims for Billionaires Digest.
status: active
priority: 1
owner_next_action: "Review and merge the shared documentation PR, then confirm the remaining v4 settings with Claude."
blocker: "V4 parameters need owner confirmation; current Claude implementation branch is unverified."
last_reviewed: 2026-10-03
---

# What is live

- Repository: https://github.com/xandergoodheart/billionaires-digest. `main` is the live GitHub Pages line; v3 launched 2026-09-29, verified by GitHub PR #3 (merged 2026-09-29 at 21:48:30 UTC) and `EDITION.md`.
- Play is `index.html`; daily news is `news.html`. The ESPN-style site includes Fantasy, The Book, Academy, Life, player pages and research tools. Page presence does not prove every online service is healthy.
- Current published fantasy rules remain five players, cap 100 and captain 1.5x; see `play-terms.html` and `assets/fantasy-core.js`. V4 is not the live rulebook.
- Play money only, no purchases, cash-out or prizes (`play-terms.html`).
- Automation: data 09:30 UTC, game sync 10:45 UTC, health 11:15 UTC (`.github/workflows/data.yml`, `game.yml`, `health.yml`). On this review date those are 5:30, 6:45 and 7:15 AM New York; fixed UTC schedules shift locally in winter. The 6:00 AM edition routine is documented in `CLAUDE.md`/`EDITION.md`; its scheduler and latest run were not independently checked.

# In progress

- Claude's memory schedules v4 work for 2026-10-03: FPL-style squad/transfers, chips and Survivor against the S&P. Actual build progress and active branch are unverified; ask Claude before overlapping.
- Codex is preparing the shared documentation handoff on `codex/shared-status` in a separate checkout. See `DECISIONS.md` for approval boundaries.

# Waiting on the owner

- Review and merge the documentation PR.
- Confirm v4 starting-price formula, squad split, captain multiplier, start date and earnings-data feasibility before the rulebook is finalized.
- Confirm scope and timing of Watch / Billionaire Night Live; no production approval is established here.
- Decide whether and when to enable Next Moves. The migration remains in `supabase/pending/0004_moves.sql`; `supabase/pending/README.md` requires owner approval.

# Follow-ups

- Adobe role-change reminder: the catalog says Shantanu Narayen becomes Executive Chair on 2026-12-01. Reverify the cited company sources before updating roles; this documentation task has not independently checked the external announcement (`data/ceos/index.json`).
- Check that CEOs scored after 2026-09-30; the pipeline and roster exist, but score completeness has not yet been audited.
- Locate the business plan: `docs/BUSINESS-PLAN.md` named in the handoff is absent from main.
- `docs/V2-BRIEF.md` and `docs/V2-PLAN.md` contain historical prelaunch statements. Treat them as reference; later approved decisions govern current work. They were not edited in this four-file task.
- The owner's root checkout has staged work and Claude's worktree is in use, per the handoff. Neither was modified. The older Documents/ChatGPT concept folder is not the current project.

# Who is editing what

- Claude: implementation, exact task/branch/start date unverified; existing worktree reported as `quirky-ritchie-de3d8d`, branch `v3`. Reconfirm before overlapping.
- Codex: no active editing claim. Four-file documentation task completed on `codex/shared-status` on 2026-10-03; PR awaits owner merge. Validation: required Node test suite passed, 294 tests, zero failures; diff whitespace check passed.

# Handoff routine

Before editing, reread CLAUDE, STATUS and DECISIONS and claim the task/branch/date here. After approved changes, update the relevant shared file and leave a concise record of changed files, validation and unresolved questions. Clear the editing claim when finished. Chat memory alone does not change approved rules.
