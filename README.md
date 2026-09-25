# Billionaires Digest

The daily brief on the investments and company moves of the world's 100 richest people.
Live at https://billionairesdigest.com

## How it works
- `index.html` is the whole site. It reads `digest.json` when someone visits.
- Every morning a scheduled Claude Code agent follows `EDITION.md`. It researches the news, writes a draft,
  and runs `scripts/publish-digest.mjs`, which checks the links and the format before saving `digest.json`
  and a copy in `archive/`. The agent then commits and pushes, and GitHub Pages republishes the site.
- If the checks fail, nothing is overwritten. The site keeps showing the last good edition.
- `scripts/build-digest.mjs` is a backup that builds the edition through the Anthropic API.
  It only runs by hand.

## Run the API backup by hand
Actions tab → Morning edition (API backup) → Run workflow. Needs the `ANTHROPIC_API_KEY` secret.

## Edit an edition
Open `digest.json` on GitHub, click the pencil, change the text, and commit. The site updates in about a minute.

## Design
- Colors: warm paper (light) and terminal black (dark) with an amber accent.
- Fonts (Google Fonts): DM Serif Display for the masthead and big display text, Newsreader for headlines,
  Inter for body text, labels and data (tabular numbers).

## Data
The "Morning data" workflow (`.github/workflows/data.yml`) runs at 09:30 UTC, before the 10:00 UTC edition,
and can also be run by hand from the Actions tab. It commits whatever changed under `data/filings` and `data/prices`.

- `scripts/fetch-filings.mjs` reads every profile in `data/people/`, collects the SEC CIKs (the person's
  `secPersonCik` and each vehicle's `cik`) and pulls their EDGAR filings from the last 90 days
  (Forms 3, 4, 5, 144, 13D, 13G, 13F, 8-K, S-1 and D).
  - `data/filings/latest.json`: every kept filing, newest first, with links to the document and the filing index.
    Up to 60 of the newest Form 4s also carry a `form4` block (issuer, ticker, transaction code, shares, price, value)
    read straight from the filing's XML.
  - `data/filings/by-person/<slug>.json`: the same filings, one file per person.
- `scripts/fetch-prices.mjs` quotes the US-listed tickers in the profiles (controls and stakes) through Finnhub.
  Tickers on non-US exchanges are listed as skipped.
  - `data/prices/latest.json`: today's quote per ticker (price, change, % change, previous close, time).
  - `data/prices/history/<TICKER>.json`: one `[date, close]` row per day, last 400 days.
  - `data/prices/networth-est.json`: an estimate of each person's move today, from share counts written out in
    their profile times today's price change. It is not a full net worth.

Two settings to add in the repo (Settings → Secrets and variables → Actions):
- Variable `SEC_USER_AGENT`: the name and contact address the SEC asks every EDGAR user to send,
  e.g. `Billionaires Digest hello@billionairesdigest.com`.
- Secret `FINNHUB_API_KEY`: a free key from an account at https://finnhub.io.

If either one is missing, that step prints a note and skips. Nothing is fetched and no file is changed.

## Game backend
The online side of the fantasy league (leaderboards, private leagues, play-money markets) runs on Supabase
(Postgres + Auth + row level security). The static site talks to it straight from the browser. Coins are play money.

- `supabase/migrations/0001_game.sql`: every table, rule and function. It is safe to run again and again.
  Players write only through checked functions (and their own roster, which a trigger checks and locks at
  Monday 9:30 AM New York time; a player without a team can still join late and scores from the next trading day).
  Practice weeks in `data/fantasy` stay solo and are never uploaded. The admin functions can only be called with the secret key.
- `config/supabase.json`: the project URL and the **publishable** key. Both are meant to be public.
  Set `"enabled": false` to show "Multiplayer is coming soon" everywhere. If the config is empty or the
  database isn't set up yet, the pages show the same message and the solo game keeps working.
- `assets/game-client.js` (API wrapper, `BDGame.syncRoster()` for the fantasy page), `assets/account.js`
  (guest sign-in, nickname, coins), `markets.html`, `leagues.html`, `leaderboard.html`, `play-terms.html`.
- `scripts/supabase-sync.mjs` (run by `.github/workflows/game.yml` every day at 10:45 UTC, or by hand from the
  Actions tab): uploads `data/fantasy` weeks and daily points, scores weeks, opens the week's markets on Mondays,
  closes them Friday 4 PM New York time and settles them from our own data files (fantasy scores, SEC Form 4s).
  "Force markets" on a manual run opens this week's markets on another day if they're missing.
- Tests (no real project needed, uses an in-memory Postgres): `node --test 'scripts/lib/supa/*.test.mjs'`.

Settings for the game job (Settings → Secrets and variables → Actions). Anything missing is skipped with a note:
- Variable `SUPABASE_URL`: `https://<project>.supabase.co`.
- Secret `SUPABASE_SERVICE_KEY`: the project's secret key (service role). Never put it in the site.
- Secret `SUPABASE_DB_URL`: the Postgres connection string, used only to apply `supabase/migrations`.

In the Supabase dashboard: Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins**.
Turning on CAPTCHA for sign-ins is a good idea to slow down people making many guest accounts.
