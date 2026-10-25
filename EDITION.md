# Morning edition: instructions for the scheduled agent

## Goal
Build today's Billionaires Digest edition and publish it.

## Steps
1. If `node_modules` is missing, run `npm ci`.
2. Read `data/people/index.json`. It lists the top-100 billionaires (rank, name, slug, net worth) and
   whether each has a profile (`hasProfile`). For deeper context on a person, read
   `data/people/<slug>.json`: their companies (`controls`), stakes, investment vehicles, private deals,
   real estate, trophies, legal and regulatory matters, giving and watch items (upcoming dates to check).
   Cover moves by the people AND by those entities: earnings, deals, acquisitions, filings, insider
   trades, IPOs, launches, layoffs, lawsuits, regulatory actions and leadership changes.
   When you set `people` on a story, use names exactly as written in `data/people/index.json`.
3. Research with web search. Look at the last 48 hours first. Go back up to 7 days only if needed.
   Skip the net-worth top 10 and never quote Forbes or Bloomberg net worth figures or ranks.
   Note: `top10` and `top10AsOf` now come from `data/people/index.json` automatically. The publish
   script replaces whatever the draft has with ranks 1-10 from the index. You may still write them
   (the schema below lists them), but they will be overwritten.
4. Fact-check: for each story, open the source article with WebFetch. Confirm every number, date and
   name in "move" matches the article. If something doesn't match, fix it to match the article or drop
   the story. If WebFetch is blocked for a source, keep the story only if the facts appear in at least
   two independent search results, and list it under 'unverified by fetch' in your final report.
4b. Why they moved: follow the "Why they moved" section below (run `node scripts/list-movers.mjs`,
   research each big mover, add the optional `movers` field).
5. Write the draft to `/tmp/digest.draft.json`. It must match the schema below.
6. Run `node scripts/publish-digest.mjs /tmp/digest.draft.json`.
7. If it fails, fix only the problems it lists, using real sources, and run it again. Retry at most
   2 times. If it still fails, stop. Do not commit. The site keeps yesterday's edition.
8. On success, run:
   `node scripts/safe-push.mjs --message "Morning edition YYYY-MM-DD" --rebuild "node scripts/build-pages.mjs" -- digest.json archive og news.html people editions companies guides sitemap.xml robots.txt data/fantasy/movers.json`
   (use today's date in New York time). It commits, then fetches, rebases, rebuilds the pages and
   pushes, retrying a few times if another job pushed at the same moment. If it exits non-zero after
   its retries, report that in your final message and do not try any other git commands.
   `og/` holds the share image the publish script renders for the edition. `news.html` is only changed by the publish script, which points its og:image and
   twitter:image meta tags at that image. `index.html` (the front page) has a fixed share image
   (`og/home.png`) and must not change during a daily run. If the image step printed a warning, commit anyway.
9. Final message: how many stories were published, which stories were dropped (and why), how many
   movers were kept or dropped by the publish script (and why), and anything that looked wrong.
   Include the 'unverified by fetch' list from step 4 (or say it's empty).

Never edit `index.html` (it is never part of a daily run's changes; its share image `og/home.png` is fixed), anything in `scripts/`, or workflow files during a daily run. The publish script updates `news.html`'s share-image meta tags; that is the only change to `news.html`.
(On the live site since v3 (2026-09-29) `index.html` is the Play front page and the daily edition page is `news.html`; never edit either by hand during a daily run — `news.html` reads `digest.json`, so publishing the edition is enough; only the publish script touches `news.html`, for its share-image tags.)

## Editorial rules
Source of truth: `scripts/lib/edition.mjs` `rulesText()`. If you change one, change both.

- Today is the date of the run (New York time). Use web search to find real news from the last 48 hours (extend to 7 days only if needed) about investments, acquisitions, sales, insider trades, IPOs, leadership changes and major company moves by the people in data/people/index.json.
- Every story must come from a search result. Copy its URL exactly. Never invent a story, number, quote, date or URL. If you can't verify a detail, leave it out.
- Only use URLs of news articles or filings, not stock-quote or company profile pages. Link the article itself.
- Skip the net-worth top 10: top10 and top10AsOf are filled automatically from our own data. Never quote Forbes or Bloomberg net worth figures or ranks.
- When a story is about someone in the top 10, set "who" to their name exactly as written in top10.
- "people" is required when the story is about one or more top-100 people or tracked CEOs; always include "who". Write names exactly as in data/people/index.json or data/ceos/index.json. (If it is missing, the publish script fills it with [who] when who is an exact player name.)
- Only include a consensus alert when two or more billionaires moved money the same direction in the same sector. Otherwise set it to null.
- Write plainly: short sentences, no jargon, no hype. Keep facts in "move"; put opinion only in "read", "why", "bear" and "memo".
- Do not reproduce article text. Summarize in your own words.

Also:
- Write 8 to 12 stories.
- Leave `ledger` as `null`. Don't touch it. The publish script carries the existing ledger over.

<!-- BEGIN: Why they moved (mirrored in scripts/lib/edition.mjs MOVERS_RULES; if you change one, change both) -->
## Why they moved
Goal: explain WHY a player's stock moved on the site's player cards, with a linked source. Facts only.

1. Run `node scripts/list-movers.mjs`. It reads our own scored day files (no network) and prints up to 8 of the
   biggest daily stock moves among players' main holdings: `ticker`, company, `date` (the trading day),
   `changePct` (close to close) and the player slugs. Lines marked "under 2%" are skipped.
2. For each mover with a move of 2% or more (up or down), search the web for a reputable news report (wire
   services, major business papers, the company's own release or filing) from that trading day or the evening
   before it that explains the move. Open it with WebFetch and confirm it is about that stock on that day.
3. If you find one, add an entry to `movers`:
   `{ "ticker", "date", "changePct", "why", "sourceName", "sourceUrl" }`
   - `ticker`, `date` and `changePct`: copy exactly from the list-movers output.
   - `why`: one plain sentence, 160 characters or fewer, that names the move (changePct rounded to one
     decimal; the first percentage in the sentence must be the move) and attributes the reason, e.g.
     "Nvidia rose 4.2% after reports of new chip orders." Use attribution wording such as "after reports
     that…" or "after the company said…". No certainty beyond what the report says, no predictions, no advice.
     The publish script rejects the words "will", "should", "must" and "sell" (write "sale" or "sell-off").
   - `sourceName`: the publication. `sourceUrl`: the https article URL exactly as found, never a stock-quote page.
4. If nothing reputable explains a move, skip that mover. Never guess, and never use a general market story
   unless it names that company. At most 8 entries. Leave `movers` out (or `[]`) if there are none.
5. The publish script checks each entry against our day files (ticker, date, changePct within 0.05), checks the
   wording and the link, and drops bad entries with a warning instead of failing the edition. Kept entries also
   go to `data/fantasy/movers.json` (last 10 trading days), which the front page reads.
<!-- END: Why they moved -->

## Optional story fields
These are new and optional. Older editions without them still work.
- `via`: the company or vehicle the story is about when it isn't the person directly (e.g. `"Tesla"`).
- `people`: required when the story is about one or more top-100 people or tracked CEOs; always include `who`.
  Write names exactly as in `data/people/index.json` or `data/ceos/index.json`. For example, an Alphabet story is
  `["Larry Page", "Sergey Brin"]`. The front page shows these players' latest moves under the story. If it is
  missing, the publish script fills it with `[who]` when `who` is an exact player name.
- `who` stays the primary person.
- `correction`: a string, only when a published story had a significant error that was fixed. Write it as
  `"Corrected <Mon D, YYYY>: <what was wrong and what it says now>."` The site shows it as a small note
  under the headline. Leave it out otherwise.

## Schema
The publish script sets `date` and `updated` for you, but include them anyway.

```
{
  "date": "<Weekday, Month D, YYYY>",
  "updated": "<Mon D, YYYY> · morning edition",
  "lede": { "kicker": "Lede of the day", "headline": string, "dek": string (1-2 sentences), "ini": two-letter initials of the person },
  "top10": [ { "name": string, "ini": string, "tick": short last name, "worth": "$123B" } ] (exactly 10, richest first),
  "top10AsOf": string saying which source and date the net worths come from,
  "stories": [ {
      "who": person's name, "sector": one of "AI & tech" | "Finance" | "Aerospace" | "Luxury & retail" | "Real estate" | "Energy" | "Media" | "Autos" | "Industrials" (mining, metals, steel, cement, chemicals, shipping, manufacturing) | "Health" (pharma, vaccines, hospitals, biotech) | "Other",
      "via": optional, the company or vehicle the story is about when it isn't the person directly (e.g. "Tesla"),
      "people": required when the story is about one or more top-100 people or tracked CEOs; always include "who". Array of names exactly as in data/people/index.json or data/ceos/index.json (e.g. ["Larry Page", "Sergey Brin"]),
      "type": e.g. "Acquisition" | "Investment" | "Insider trade" | "IPO / Markets" | "Leadership" | "Product launch" | "Policy" | "Property" | "Divestiture",
      "tickers": e.g. "NVDA · MSFT" (or "Private"),
      "read": short opinion label, "direction": "up" | "down" | "flat",
      "headline": under 12 words,
      "move": what happened, facts only,
      "why": why it matters,
      "bear": the strongest counterargument,
      "watch": the next date or signal to watch,
      "source": publication name, "url": the article URL exactly as found in search results,
      "correction": optional, "Corrected <Mon D, YYYY>: <what changed>" (only for a significant fix)
  } ] (8 to 12 stories),
  "consensus": { "headline": string, "body": string, "tags": [string] } or null,
  "filings": [ { "filer": string, "form": "Form 4" | "13F" | "8-K" | "S-1" | "13D" | other, "change": string, "direction": "up" | "down" | "flat" } ],
  "watch": [string] (upcoming dates and events),
  "quickHits": [string] (one-sentence moves that didn't get a full story),
  "memo": [string] (3 short takeaways for someone running a business, not a fund),
  "movers": optional, [ { "ticker": string, "date": trading date "YYYY-MM-DD", "changePct": number copied exactly from list-movers, "why": one sentence (160 characters max), "sourceName": publication name, "sourceUrl": "https://..." } ] (0 to 8 entries; leave out or [] when none),
  "ledger": null
}
```
