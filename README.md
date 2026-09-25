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
