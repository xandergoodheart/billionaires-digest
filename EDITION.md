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
   Look up the current top 10 by net worth (Forbes real-time or Bloomberg Billionaires Index) and
   write the source and date in `top10AsOf`.
   Note: `top10` and `top10AsOf` now come from `data/people/index.json` automatically. The publish
   script replaces whatever the draft has with ranks 1-10 from the index. You may still write them
   (the schema below lists them), but they will be overwritten.
4. Fact-check: for each story, open the source article with WebFetch. Confirm every number, date and
   name in "move" matches the article. If something doesn't match, fix it to match the article or drop
   the story. If WebFetch is blocked for a source, keep the story only if the facts appear in at least
   two independent search results, and list it under 'unverified by fetch' in your final report.
5. Write the draft to `/tmp/digest.draft.json`. It must match the schema below.
6. Run `node scripts/publish-digest.mjs /tmp/digest.draft.json`.
7. If it fails, fix only the problems it lists, using real sources, and run it again. Retry at most
   2 times. If it still fails, stop. Do not commit. The site keeps yesterday's edition.
8. On success, run:
   `git add digest.json archive og index.html people editions sitemap.xml robots.txt && git commit -m "Morning edition YYYY-MM-DD" && git pull --rebase origin main && git push origin main`
   (use today's date in New York time). `og/` holds the share image the publish script renders for the
   edition. `index.html` is only changed by the publish script, which points its og:image and
   twitter:image meta tags at that image. If the image step printed a warning, commit anyway.
9. Final message: how many stories were published, which stories were dropped (and why), and
   anything that looked wrong.
   Include the 'unverified by fetch' list from step 4 (or say it's empty).

Never edit `index.html` (the publish script updates its share-image meta tags; that is the only change), anything in `scripts/`, or workflow files during a daily run.

## Editorial rules
Source of truth: `scripts/lib/edition.mjs` `rulesText()`. If you change one, change both.

- Today is the date of the run (New York time). Use web search to find real news from the last 48 hours (extend to 7 days only if needed) about investments, acquisitions, sales, insider trades, IPOs, leadership changes and major company moves by people on the Forbes or Bloomberg billionaire lists, focusing on the top 100.
- Every story must come from a search result. Copy its URL exactly. Never invent a story, number, quote, date or URL. If you can't verify a detail, leave it out.
- Only use URLs of news articles or filings, not stock-quote or company profile pages. Link the article itself.
- Look up the current top 10 by net worth (Forbes real-time or Bloomberg Billionaires Index) and say which source and date in top10AsOf.
- When a story is about someone in the top 10, set "who" to their name exactly as written in top10.
- Only include a consensus alert when two or more billionaires moved money the same direction in the same sector. Otherwise set it to null.
- Write plainly: short sentences, no jargon, no hype. Keep facts in "move"; put opinion only in "read", "why", "bear" and "memo".
- Do not reproduce article text. Summarize in your own words.

Also:
- Write 8 to 12 stories.
- Leave `ledger` as `null`. Don't touch it. The publish script carries the existing ledger over.

## Optional story fields
These are new and optional. Older editions without them still work.
- `via`: the company or vehicle the story is about when it isn't the person directly (e.g. `"Tesla"`).
- `people`: an array of every top-100 name the story affects, written exactly as in
  `data/people/index.json`. For example, an Alphabet story is `["Larry Page", "Sergey Brin"]`.
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
      "people": optional, array of every top-100 name the story affects (e.g. ["Larry Page", "Sergey Brin"]),
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
  "ledger": null
}
```
