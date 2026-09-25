# Billionaires Digest v2 — brief

Status: `v2` branch, started 2026-09-25. `main` (v1, tag `v1.0`) stays live until the owner approves launch.
Reference pack (owner's Mac, not in repo): ~/Desktop/Billionaires-Digest-Reference-Pack
(README.txt, design-tokens.json, concepts/*.png, references/*.png, guide-excerpts/*.png).

## Direction
- Fantasy is the front door: new visitors → Draft room; returning players → My team. News is the supporting "scouting report".
- ESPN-like hierarchy: dark top bar (Fantasy · Players · Rankings · Calendar · News, Search, red "My team" CTA),
  sub-tabs per section, score ticker strip, white cards on light canvas, bold uppercase condensed headlines.
- Distinct "BD" wordmark (red square + BILLIONAIRES DIGEST in Barlow Condensed 800). Keep the Billionaires Digest name.
- Tokens (design-tokens.json): ink #13171C, canvas #F2F3F5, surface #FFFFFF, brand #D62D27, positive #08764A,
  muted #59616D, line #D9DEE4, focus #2359C4, warning #8A5200. Barlow Condensed 800 display, Barlow 400/600/700 body,
  tabular numbers. Max width 1440, 12 columns, 24px gutter, 8px spacing unit, 4px radius, mobile breakpoint 768,
  16px mobile margin, 44px tap targets. Motion 150–200ms, no auto-scrolling ticker, respect reduced motion.
- Positive = green with "+", negative = red with "−" (never color alone). Dark mode: decide with owner (v1 had one).

## Screens (build order)
1. Design system (tokens, type, buttons, tables, cards, top bar, sub-tabs, phone bottom tab bar).
2. My team (team name, big weekly score vs S&P benchmark, starting five table: player, cap, base pts, multiplier, team pts;
   next round / lock card; your team's news; leagues card).
3. Draft room (search, sector filter, sort, pool table with + Add / Selected; sticky "Your starting five" panel; cap meter).
4. Player profile (hero with portrait, big stats: weekly pts, cap cost, sector rank; tabs Overview · Game log · News · Company · Scoring;
   daily points bar chart; scouting report card).
5. Rankings, Calendar, Newsroom (lede + weekly leaders + top stories), The Book, Leagues, Leaderboard restyled.
6. Mobile: top bar with MENU, score strip, bottom tabs (Fantasy · Players · Rankings · News).

## Decisions already made
- Player art: ILLUSTRATED PORTRAITS in one consistent editorial style. No photos, no company logos. Test the style on 2–3
  people and get owner approval before generating all 100; initials/sector-plate fallback until then.
  Do not use the pack's stadium poster or press headshots in the product.
- Roster: Forbes top 100 only at launch (existing data/people). The pack's Lisa Su / Nadella / Chesky examples are illustrative.
- All game logic, data and backend stay as in v1 (scoring, cap, captain, lock, leagues, The Book). v2 is a new face + IA.
- Concepts' numbers are illustrative; always render real data.

## Later (remind the owner after launch)
Sub-committee leagues: Founders & CEOs and The Allocators (13F) first; then AI Titans, Dynasties, Global, Crypto, Rookies, Owners.
Optional: Tiingo account to backfill price history so Book odds differentiate sooner.
