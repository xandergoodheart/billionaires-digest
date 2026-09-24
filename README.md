# Billionaires Digest

The daily brief on the investments and company moves of the world's 100 richest people.
Live at https://billionairesdigest.com

## How it works
- `index.html` is the whole site. It reads `digest.json` when someone visits.
- Every morning at 6 AM New York time, `.github/workflows/daily.yml` runs `scripts/build-digest.mjs`.
  That script asks Claude (with web search) for today's edition, checks it, and saves a new `digest.json`
  plus a copy in `archive/`. GitHub Pages republishes the site automatically.
- If a run fails, nothing is overwritten. The site keeps showing the last good edition.

## Run it by hand
Actions tab → Morning edition → Run workflow.

## Edit an edition
Open `digest.json` on GitHub, click the pencil, change the text, and commit. The site updates in about a minute.
