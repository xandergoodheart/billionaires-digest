# Next Moves: plan and rules

"Call their next move." Yes/no play-money markets on billionaires' next **business** moves, created and settled only
from public, machine-checkable SEC filings already in this repo. Status: **preview** (page + data built; nothing in
the live database; the online part is off).

## How it works

1. `node scripts/build-moves.mjs` reads our data files and writes:
   - `data/moves/markets.json`: open markets (and closed ones still waiting for filings), each with question, rule,
     close time, source of truth and **starting odds from history**.
   - `data/moves/resolved.json`: settled markets (outcome, plain note, `source_url` of the filing), plus a
     **backtest**: the same Form 4 questions for the last two complete months, answered from filings, clearly marked
     "never open for trading".
   The build is deterministic for the same inputs (`--now=ISO` to pin the clock). Once a market exists its slug,
   question and starting odds never change; a market leaves `markets.json` only when it is settled.
2. `moves.html` (+ `assets/v2/moves.js`, `assets/v2/moves.css`) lists the markets by person and type with a real
   countdown, the starting-odds explanation, how it resolves, and YES/NO buttons. Until launch, trades use **practice
   coins in this browser only** (localStorage `bd-moves-v1`, 1,000 coins, same LMSR formulas as the game). Practice
   picks settle in the browser when `resolved.json` settles their market.
3. After launch, the Game sync opens the same markets in Supabase with `create_market` + `set_market_start_odds`,
   and settles them with `resolve_market` from `resolved.json` (`scripts/lib/supa/moves-sync.mjs`).

Logic lives in `scripts/lib/moves.mjs` (pure, tested in `scripts/lib/moves.test.mjs`).

## Templates

| Kind | Question | Window | Starting odds from history | Settles from |
|---|---|---|---|---|
| `insider_sell` | Will *person* report selling *TICKER* stock (Form 4, code S) with a trade date between *start* and *end*? | next calendar month with 14+ days left | share of the last complete weeks (about 12) with a qualifying sale, turned into a chance for the window: 1 − (1 − p)^(days/7) | a Form 4 in `data/filings/latest.json` with a code-S row for that ticker dated in the window |
| `insider_buy` | same, code P (open-market buy) | same | same | same, code P |
| `sale_size` | Will *person*'s reported sales of *TICKER* add up to more than $*X* in *month*? | same month | share of complete months above the line; needs 6 months, so **50% for now** (we hold 90 days of filings) | sum of shares × price of code-S rows dated in the month (a trade reported by two joint filers counts once) |
| `fund_move` | Will *fund*'s 13F for the quarter ending *date* show fewer *holding* shares than the *N* it reported for *base period*? | first quarter end 14+ days away; trading closes when the quarter ends | share of the fund's top-10 holdings it cut in its latest 13F (needs 5 checkable holdings, else 50%) | the fund's 13F for that quarter in `data/13f/<filer>.json` (top 10 or change lists; "unchanged" only when the change lists are complete) |

Who gets a market: only people with a profile in `data/people/`; Form 4 markets only for people with a code S/P trade
of a listed ticker in the history weeks (the ticker they traded on the most days); fund markets for up to 20 filers
linked to a profiled person, asking about the largest company stock (index funds/ETFs skipped when possible).
Starting odds are capped between 5% and 95%. When history is too thin the card says so and starts at 50%.

**Skipped: `rank_hold`** ("still No. n on Forbes real-time on date?"). We keep only the current list
(`data/people/index.json`, one `asOf`, not refreshed daily), so there is no base rate and no way to check a past date.
To add it later: save a dated snapshot of the list every day (e.g. `data/people/history/YYYY-MM-DD.json` with `asOf`
and `sourceUrl`) and resolve from the snapshot for the target date.

## Resolution rules (all automatic, all cite a source)

- **Form 4 markets** wait until our filings were fetched 5+ days after the window ends (Form 4 is due within 2
  business days). YES cites the Form 4 index page. NO cites the person's EDGAR filing list. If a Form 4 filed in the
  window could not be read in detail and no qualifying trade was found, the market is **void** (stakes back). Void too
  if the filings are still not fetched 15 days after the window, or our 90-day filings file no longer reaches the
  window start.
- **Sale size**: YES as soon as the readable total is over the line, even with an unreadable Form 4; under the line
  with an unreadable Form 4 is void.
- **13F**: resolves when the filer's file shows the target quarter. Void if our copy cannot show the share count, if the
  data skipped the quarter, or if nothing arrived 75 days after the quarter end. A stock split counts as a change.
- A settled market is final. Nothing is resolved by hand; `resolve_market` is only ever called with a row from
  `resolved.json`.

## Launch steps (owner approval first; nothing here is done yet)

1. Owner approves the page and wording (and where it sits in the nav: the planner wires `sync-nav`).
2. Add `node scripts/build-moves.mjs` to the "Morning data" workflow (`.github/workflows/data.yml`) after
   `fetch-filings`/`fetch-13f`, and commit `data/moves/`.
3. Apply `supabase/migrations/0004_moves.sql`: the "Game sync" workflow (`game.yml`) already applies every file in
   `supabase/migrations/` on each run, so it applies once 0004 is on `main`. It is additive and safe to re-run
   (new kinds in `markets_kind_check`, admin-only `set_market_start_odds`).
4. In `game.yml` pass `GAME_MOVES_MARKETS: ${{ vars.GAME_MOVES_MARKETS }}` to the Sync step and set the repository
   variable `GAME_MOVES_MARKETS=1`. Without it the sync never touches Next Moves (tested).
5. Switch `moves.html` from practice coins to the live client (`BDGame.buy` on the market id, balances from `me()`),
   keeping the practice mode as the signed-out fallback. Note: the v1 `markets.html` lists every open market in the
   database, so it would show these too unless filtered by slug prefix `mv-`.

## Red lines

- Only business and public-filing events: stock trades on Form 4 and fund holdings on 13F. Never health, death,
  family, relationships, legal accusations or personal movements; no real-estate addresses.
- Only people in `data/people/`. Every question comes from a data file; every result links its filing. Nothing invented.
- Neutral wording ("report selling", "show fewer shares"); no hype, no implied wrongdoing.
- Play money only: coins have no cash value; no purchases, cash-out or prizes. "For information only · not financial advice."

## Real money (not planned for this build)

Yes/no contracts on future events are **event contracts**; in the US they fall under the CFTC and can only be offered
for real money through a CFTC-registered exchange (a designated contract market) or a licensed partner. Any real-money
version must go through such a licensed partner route, with their compliance review of each contract type.
Extra caution for these markets: trades by insiders are knowable in advance by the insiders themselves, their
families, staff and brokers, so real-money contracts on "will X sell" carry **insider-information and manipulation
risk** (the subject could trade on or cause the outcome). A licensed venue would need rules barring affiliated persons
and likely would not list some of these contracts at all. Until then this stays play money.
