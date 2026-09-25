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
