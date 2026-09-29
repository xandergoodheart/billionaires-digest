<!-- Business plan, 2026-09-29. Not legal, tax or investment advice. Figures marked approximate come from secondary sources. -->

# Billionaires Digest: the Billionaire Fantasy League as a business

**What the company is.** A fantasy-league and betting-style game company. Players draft billionaires, set a captain, lock their lineup each week and compete in leagues. There are also The Book (props) and weekly markets. Teams score on the real daily returns of each billionaire's disclosed stock holdings.

**What the news is for.** The daily digest, the SEC filing data and the Fantasy Billionaires shorts are the free "stats and research" layer that players use to make picks. They play the role that injury reports and box scores play for sports bettors, the way ESPN's news feeds ESPN Fantasy. The news is not the main business.

**The commercial goal is real-money play.** The free, play-money league is the legal on-ramp that builds the player base. Most long-term value comes only if a legal real-money route clears. This plan shows the business both with and without that route.

**The live game stays play money** until a lawyer signs off on a licensed or legal route (owner rule, CLAUDE.md on v3).

Other companies' numbers link a source. Our own numbers are `[FILL IN: …]` or labeled assumptions. Nothing in the revenue model is a forecast.

---

## A. One-page summary

**The pitch in one line.** Fantasy sports where the athletes are business people. Billionaires, founders, CEOs and investors are "business athletes", and their deals, filings and market moves are the stat line.

**What it is.** The Billionaire Fantasy League.
- **The game.** Draft 5 billionaires under a 100-point cap. Pick a captain, who scores 1.5x. Rosters lock Monday 9:30 AM New York time. Points come from the daily returns of each person's disclosed holdings (`assets/fantasy-core.js`, `scripts/lib/fantasy.mjs`).
- **Around it:** private and public leagues and leaderboards on Supabase, a draft room (v3), The Book (play-money props) and weekly play-money markets.
- **The research layer:** a free daily edition, 100 sourced profiles, SEC filings (Form 4, 13F, 13D/G), prices and company pages. It tells players what they are picking.

**Who it's for.** Fantasy players and people who like "follow the smart money" who want a new league to play with friends and coworkers. There are about 57M fantasy players in the US and Canada (FSGA 2025, approximate, [FSGA](https://thefsga.org/fsgas-2025-research-fantasy-sports-womens-betting-social-sportsbooks/)). About 62% of US adults own stock ([Gallup](https://news.gallup.com/poll/266807/percentage-americans-owns-stock.aspx)).

**How it makes money: three stages, ranked by what is legal and doable soonest.**
1. **Now (legal today):** a free-to-play league, plus a season presenting sponsor ("The Billionaire Bowl presented by …"), game-page ads, and **League Pass**. League Pass means commissioner tools, custom scoring, extra leagues, advanced stats from our SEC data, a draft kit and cosmetics. It is never pay-to-win. Creator and private leagues fit here too.
2. **After a lawyer signs off:** sponsor-funded, **free-entry** prize contests with official rules, plus state registration and bonding where prizes top $5,000 (NY, FL).
3. **Only if the legal crux clears:** real-money play through a licensed route. That most likely means a CFTC-regulated exchange partner listing billionaire markets, or a licensed operator or white-label partner. We take a revenue share or affiliate fee. Running it ourselves is far less likely.

Also: B2B white-label leagues for brokerages, fintechs and finance media; video IP; data.

**The crux, in one line.** Paid-entry, cash-prize contests scored on stock prices do **not** get fantasy-sports protection. The SEC already fined a "fantasy sports for stocks" app, Forcerank, for offering illegal security-based swaps in 2016 ([SEC](https://www.sec.gov/news/pressrelease/2016-216.html)). So the realistic real-money route is a federally regulated exchange partner, not our own paid contests. See section B0.

**The crypto answer: no.** No token, no crypto prize pools, no crypto network (section C).

**The ask.** Don't raise money yet. Launch Season 1, then prove players draft, set lineups weekly and return next season. Get the lawyer's answer on the crux. Then raise a small angel or pre-seed round on those numbers.

---

## A2. League format and seasons

*Proposed, for the owner to approve. The one decision already made by the owner: **small leagues now, and grow the player pool.***

**The framing.** Each league type is a "sport", and its members are business athletes. The daily news and SEC filings are the box score and the injury report.

### Why seasons, and why quarterly
- **The market has no natural season, so we build one from its own calendar.** A quarter gives:
  - 4 seasons a year of 13 weeks each, about the length of a fantasy football regular season plus playoffs.
  - A natural finale on the quarter's last trading day.
  - Built-in drama: earnings season, plus 13F filings. Big funds must file their 13F holdings within 45 days after each quarter ends, or on the next business day if that date falls on a weekend or holiday ([SEC Form 13F FAQ](https://www.sec.gov/divisions/investment/13ffaq)).
- **It fills fantasy football's off-season (February to August).** That point is our judgment, not a sourced fact.

### League basics

| | Billionaire league (proposed) | Typical fantasy football |
|---|---|---|
| League size | **Up to 8 teams** (owner decision), private or public | 8–12, sometimes more |
| Draft | **Snake draft** (auction later, maybe). Held on the weekend before the Monday lock | Snake or auction, before week 1 |
| Ownership | **Exclusive inside a league.** Each billionaire is on one team only | Same |
| Roster | **5 billionaires, all 5 start each week, one is captain at 1.5x. No bench** (owner decision) | About 15–16 players, 9 starters |
| No-shows | Autodraft | Autodraft |
| Changes | Waivers (undrafted billionaires) and trades | Same |
| Matchups | Head-to-head each week | Same |
| Playoffs | Top 4 of up to 8 teams | Top 4–6 |

**Why leagues are small for now.**
- Only 50 of the 100 billionaires can be scored today. The game only drafts a person if at least one of their holdings has a daily market price (`buildPool()` in `scripts/build-fantasy.mjs`).
- The other 50 are listed in `data/fantasy/index.json` with the reason "No daily market price (private wealth)". The week file `data/fantasy/weeks/2026-W40.json` lists 50 draftable.
- Pool math: 8 teams × 5 = 40 of the 50 scoreable billionaires, which leaves 10 on waivers.

**Scoring carries over from the current game (as the code works today):**
- Lineups lock **Monday 9:30 AM New York time**. A roster saved mid-week scores from the next weekday (`assets/fantasy-core.js`).
- Daily points for each billionaire are their portfolio's weighted return in percent × 100, rounded, plus two bonuses (`scripts/lib/fantasy.mjs`):
  - **+25** for an open-market insider buy (a Form 4 with code P) filed that day.
  - **+10** for each story in that day's edition that names them.
- The captain's points are × 1.5, rounded.
- **The weekly salary-cap game stays** as an always-on side game, between and during seasons. That's 5 picks under a 100-point cap, with no draft and no exclusivity.

### Grow the pool (roadmap)
1. **Fix data gaps first.** Some people should be scoreable already. Bernard Arnault & family is on the not-draftable list even though the code already maps LVMH to a US ADR line (`ADR_BY_LOCAL` / `ADR_BY_NAME` in `scripts/lib/fantasy.mjs`). Find out why and fix it, then check the rest of the list the same way.
2. **Then research scoring private wealth.** One idea is to use published net-worth changes, but only where a sourced daily or weekly number exists. This is an idea to research, not a plan.
3. **Target math.** A bigger pool lets leagues reach 10–12 teams later. For example, 80 scoreable billionaires allow 12 teams × 6 = 72, with 8 on waivers.

### Season template (13 weeks)
- **Draft:** on the weekend before the Monday lock of Week 1.
- **Weeks 1–10:** regular season, head-to-head.
- **Weeks 11–12:** semifinals, with the two weeks' scores combined.
- **Week 13:** championship, the "Closing Bell". It ends on the quarter's last trading day.
- **Special weeks:**
  - **"13F Reveal Week"** is the week the prior quarter's 13Fs are due.
  - **"Earnings Rush"** weeks are set each season from companies' announced earnings dates.

### Short weeks
- Holiday weeks have fewer trading days.
- **Today the code adds up daily points** for the trading days that have a day file (`scripts/build-fantasy.mjs` week totals, `scripts/lib/supa/markets.mjs` `weekTotals`). A 4-day week therefore scores fewer points than a 5-day week.
- **Proposed change:** score each week as the average points per trading day. Head-to-head is fair within a week anyway, but averaging keeps season totals and records comparable across weeks.

### Worked calendars
Market holidays come from the [NYSE hours and calendars page](https://www.nyse.com/markets/hours-calendars). The 13F dates follow the SEC's 45-day rule and next-business-day rule.

**Q4 2026: free "Preseason".** Draft during 2026-W40 (Mon Sep 28–Fri Oct 2). That matches the code's `FIRST_REAL_WEEK = '2026-W40'` in `assets/fantasy-core.js`, the first week that already counts in the weekly game.

| Week | ISO week | Dates | Trading days | Notes |
|---|---|---|---|---|
| 1 | 2026-W41 | Mon Oct 5 – Fri Oct 9 | 5 | |
| 2 | 2026-W42 | Oct 12–16 | 5 | |
| 3 | 2026-W43 | Oct 19–23 | 5 | |
| 4 | 2026-W44 | Oct 26–30 | 5 | |
| 5 | 2026-W45 | Nov 2–6 | 5 | |
| 6 | 2026-W46 | Nov 9–13 | 5 | |
| 7 | 2026-W47 | Nov 16–20 | 5 | **13F Reveal Week.** The Q3 deadline, Nov 14, is a Saturday, so filings are due Mon Nov 16 |
| 8 | 2026-W48 | Nov 23–27 | 4 | Thanksgiving Thu Nov 26, closed. Fri Nov 27, early close 1:00 PM |
| 9 | 2026-W49 | Nov 30 – Dec 4 | 5 | |
| 10 | 2026-W50 | Dec 7–11 | 5 | Last regular-season week |
| 11 | 2026-W51 | Dec 14–18 | 5 | Semifinal, leg 1 |
| 12 | 2026-W52 | Dec 21–25 | 4 | Semifinal, leg 2. Christmas Fri Dec 25, closed. Thu Dec 24: likely early close; confirm on the NYSE calendar |
| 13 | 2026-W53 | Dec 28–31 | 4 | Championship. Ends Thu Dec 31, the quarter's last trading day |

**Q1 2027: Season 1.** Draft on the weekend of Jan 2–3, before the Mon Jan 4 lock. That avoids overlapping the preseason championship week (W53).

| Week | ISO week | Dates | Trading days | Notes |
|---|---|---|---|---|
| 1 | 2027-W01 | Mon Jan 4 – Fri Jan 8 | 5 | New Year's Day, Fri Jan 1, closed (before the season) |
| 2 | 2027-W02 | Jan 11–15 | 5 | |
| 3 | 2027-W03 | Jan 18–22 | 4 | Martin Luther King Jr. Day, Mon Jan 18, closed |
| 4 | 2027-W04 | Jan 25–29 | 5 | |
| 5 | 2027-W05 | Feb 1–5 | 5 | |
| 6 | 2027-W06 | Feb 8–12 | 5 | |
| 7 | 2027-W07 | Feb 15–19 | 4 | Washington's Birthday, Mon Feb 15, closed. **13F Reveal Week:** the Q4 deadline, Feb 14, is a Sunday and Feb 15 is a holiday, so filings are due Tue Feb 16 |
| 8 | 2027-W08 | Feb 22–26 | 5 | |
| 9 | 2027-W09 | Mar 1–5 | 5 | |
| 10 | 2027-W10 | Mar 8–12 | 5 | Last regular-season week |
| 11 | 2027-W11 | Mar 15–19 | 5 | Semifinal, leg 1 |
| 12 | 2027-W12 | Mar 22–26 | 4 | Semifinal, leg 2. Good Friday, Fri Mar 26, closed |
| 13 | 2027-W13 | Mon Mar 29 – Wed Mar 31 | 3 | Championship. Ends Wed Mar 31, the quarter's last trading day |

**Engineering check before the preseason ends:** 2026 has an ISO week 53 (Dec 28–31). The code uses ISO weeks, but no one has tested a season boundary at W53 or a championship week cut short at quarter end. Test both before December.

### The year-long layer
- **The Billionaire Bowl:** the annual title, from points across the four seasons.
- **Keepers:** keep 1–2 billionaires into the next season. The cost is giving up your pick in the round where you first drafted them.
- **The weekly salary-cap game** keeps running between and during seasons.

### Multiple leagues (player pools)

*Proposed, for the owner to approve. The owner leans toward "Tech startup founders" as the second league, pending a scoring design.*

- **The concept.** Different leagues work like different sports (NFL, NBA). Each league type is its own "sport" of business athletes, with its own player pool, scoring and season. The site, account, draft, lineup and season engine stay the same.
- **Order.** Start with "Billionaires" (live today). Add pools one at a time.
- **Why it helps.**
  - Each pool is its own draft, so it gets around the 50-player limit.
  - More seasons and more content.
  - More sponsor categories, e.g. a venture firm sponsoring the Founders league.
  - Players can join several leagues.

| Pool | Who's in it | Sourced data | Scoring idea | Data readiness | Legal and other notes |
|---|---|---|---|---|---|
| 1. **Billionaires** | Top-100 list; 50 scoreable today | SEC EDGAR, prices, edition | Today's scoring (or option B, section B0) | **Ready** (50) | The crux in B0 |
| 2. **Public-company CEOs and founders** | e.g. big-tech or S&P 500 CEOs | Company stock price, Form 4, earnings dates, 8-K | Company stock move + insider buys + earnings events | **Partial.** On `origin/v3` (not live), 15 big-company CEOs who aren't on the top-100 list were already added as players, *inside the Billionaires pool*: sourced profiles, portraits, a CEO badge and filter, prices and salaries (commit `0dfa90d9`; `data/ceos/index.json` lists 15). A later commit (`ce8dfa56`) added SEC financials for their companies and put CEOs in the online sector markets. A separate CEO league would split them out, which is an owner decision | Price-based, so the same crux as Billionaires |
| 3. **Tech startup founders** (owner's leaning) | Founders of private, venture-backed companies | SEC Form D filings, well-reported funding rounds, launches, acquisitions, S-1 IPO filings | **Event-based only.** No daily price exists, so scoring is naturally person-first | **Research** | Not price-based. In our judgment that may help the legal argument (for the lawyer). Business info only |
| 4. **Investors and fund managers** | Well-known 13F filers (hedge funds) | Quarterly 13F changes, 13D/13G | Portfolio changes and stake filings | **Partial** (13F already fetched weekly) | Slow data that fits a quarterly season. 13F-based scores still track securities |
| 5. *Mention only:* **members of Congress** | STOCK Act trade disclosures ([STOCK Act](https://www.congress.gov/bill/112th-congress/senate-bill/2038)), which some trackers use | Official disclosures | n/a | n/a | **Not recommended.** Political figures bring extra sensitivity. It would need an owner decision |

**Founders league: what we'd need**
- **A sourced founder pool of about 50–100, picked by written rules.** For example: founders of companies with a Form D filed in the last 12 months above a set dollar size, or with a funding round reported by at least two named outlets. Recheck each season. Companies must file a Form D within 15 days after the first sale in an exempt offering ([SEC](https://www.sec.gov/resources-small-businesses/capital-raising-building-blocks/what-form-d), [SEC Form D FAQ](https://www.sec.gov/about/divisions-offices/division-corporation-finance/frequently-asked-questions-answers-form-d)).
- **Event scoring** (every event must link a public source; point values are placeholders):

| Event | Source | Placeholder points |
|---|---|---|
| Funding round announced | Company or press release, reported in the edition | +20 |
| Valuation step-up vs the last reported round | Named reports | +1 per 10% step-up, capped |
| Form D filed | SEC EDGAR | +10 |
| Product launch | Company announcement, in the edition | +5 |
| Acquisition (buyer or seller) | Filing or announcement | +25 |
| IPO filing (S-1) | SEC EDGAR | +40 |
| Key hire announced (C-level) | Company announcement | +5 |

- **How the pipeline would detect events.**
  - `scripts/fetch-filings.mjs` already includes Form D and S-1 in its form list (`FORMS`). But it only fetches filings for the CIKs in our profiles (people and their vehicles). Founders' company CIKs would have to be added.
  - Funding, launch, acquisition and hire news would come through the daily edition, with source links, as stories do today.
- **Privacy rule.** Business information only: companies, filings, public announcements. No family, homes, movements or personal life.
- **Risk: events are sparse.** Most founders will score nothing most weeks. That means fewer points and less drama, so consider a monthly or quarterly cadence rather than weekly lineups.

**Rules that carry over to every pool:** no real photos or logos, sourced facts only, and play money until a lawyer signs off.

### How seasons tie to the money stages
- **A season sponsor per quarter** ("Q1 Season presented by …"). The annual Billionaire Bowl sponsor is a bigger package.
- **League Pass sold per season.**
- **Partner markets tied to the season, only if the legal route clears (section B0),** e.g. "Which billionaire finishes Q1 up the most?". These would be listed by a regulated partner, never by us. The live game stays play money until a lawyer signs off.

---

## B. The business model: how we make money

### B0. The legal crux: can people bet real money on billionaires' stock performance?

**Short answer.** Not through a paid fantasy league that we run. Maybe through a federally regulated exchange that lists billionaire markets, with us as the media, data and affiliate partner. Everything below needs a lawyer to confirm.

**1. The federal fantasy exemption (UIGEA) doesn't make it legal.**
- The UIGEA's fantasy carve-out covers contests "determined predominantly by accumulated statistical results of the performance of individuals (athletes in the case of sports events) in multiple real-world sporting or other events." Prizes must be set in advance, and no outcome can rest on a single team or a single performance ([31 U.S.C. § 5362(1)(E)(ix)](https://www.law.cornell.edu/uscode/text/31/5362)).
- "Or other events" reads broadly. But the UIGEA only says what doesn't count as a "bet or wager" for its payment-blocking rules. It doesn't make any game legal. State gambling law still decides that ([PBS Frontline](https://www.pbs.org/wgbh/frontline/article/how-fantasy-sports-got-around-online-gambling-laws/), [Velawood](https://velawood.com/why-playing-fantasy-sports-is-legal-for-the-most-part/)).

**2. State fantasy laws are mostly written for sports.**
- New York defines an interactive fantasy sports contest as using "knowledge and understanding of athletic events and athletes," with simulated players whose performance matches that of "human competitors on sports teams and in sports events" ([N.Y. PML § 1401](https://codes.findlaw.com/ny/racing-parimutuel-wagering-and-breeding-law/pml-sect-1401.html)). Billionaires' stock returns don't fit.
- Virginia's Fantasy Contests Act is looser. It uses "performance of individuals, including athletes in the case of sports events" ([Va. Code § 59.1-556](https://law.lis.virginia.gov/vacode/title59.1/chapter51/section59.1-556/)). But it was written as a sports law, and no one has tested it on stocks.
- Commentators note some statutes' wording could reach non-sports contests, but the area is uncertain ([Velawood tracker](https://velawood.com/tracker/fantasy-sports-legislation-tracker/)).
- Even sports DFS is shrinking in places. New York banned prop-style pick'em in 2023 (approximate, [Saturday Down South](https://www.saturdaydownsouth.com/dfs/legal-states/)). California's attorney general said DFS is illegal in the state in July 2025, and PrizePicks and Underdog pulled their house-style pick'em there ([Covers](https://www.covers.com/industry/underdog-sports-limits-california-fantasy-games-to-peer-to-peer-format-july-2025), [SBC Americas](https://sbcamericas.com/2025/07/02/prizepicks-california-p2p-arena-switch/)).

**3. Skill or chance.**
- Most states ask whether skill or chance is the *dominant* factor. Some ask whether chance is a *material* element. A few ban games with *any* chance ([Lexology / Klein Moynihan](https://www.lexology.com/library/detail.aspx?g=0a16536c-4f6f-48ed-966f-a8d43b676f10), [Foley](https://www.foley.com/insights/publications/2022/04/a-potential-new-paradigm-for-daily-fantasy-sports/)).
- One week of stock returns is noisy. Our judgment (not a sourced fact) is that a regulator could say chance dominates a weekly five-stock lineup.

**4. The biggest blocker is federal securities and commodities law, not gambling law.**
- In October 2016 the SEC fined Forcerank LLC $50,000. Forcerank ran a paid-entry mobile game, billed as "fantasy sports for stocks." Players ranked how 10 stocks would perform, and some won cash prizes. The SEC said the contracts were **security-based swaps**, because the payouts depended on the value of individual securities. Such swaps can't be sold to retail players off a registered exchange ([SEC press release](https://www.sec.gov/news/pressrelease/2016-216.html), [NatLawReview](https://natlawreview.com/article/fantasy-stock-picking-contest-deemed-sec-to-be-illegal-security-based-swaps)).
- Forcerank kept 10% of entry fees. That is almost exactly a paid version of our league.
- The SEC has also warned the public that "fantasy" stock-trading sites with entry fees may break securities laws ([Investor.gov alert](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-alerts/investor-58)).
- The CFTC treats event-based payouts offered off a registered exchange as illegal binary options. Polymarket paid $1.4M for doing that in 2022 ([CFTC](https://www.cftc.gov/PressRoom/PressReleases/8478-22)).

**5. The owner's argument: "we're betting on a person, not a stock."**

*The argument, stated fairly:*
- Forcerank players ranked stocks and ETFs directly. Our players draft people.
- Our scoring already includes things a person does that are not price moves:
  - **+25** for an open-market insider buy (a Form 4 with code P) filed that day.
  - **+10** for each story in that day's edition that names them (`POINTS` in `scripts/lib/fantasy.mjs`).
- So a team is a set of people, not a basket of tickers.

*The counterpoint, plainly:*
- Today most of a person's points come from price. Daily price points = the weighted daily return of their disclosed holdings × 100 (`scorePersonDay()` and `pricePoints()` in `scripts/lib/fantasy.mjs`).
- The baskets are concentrated. In the 2026-W40 week file:
  - 49 of the 50 draftable people have one holding above 30% of their weight.
  - 48 of 50 have 9 or fewer holdings.
  - Elon Musk's basket is 78% SPCX (SpaceX) and 22% TSLA (`data/fantasy/weeks/2026-W40.json`).
- The law looks at what a payout is **based on**:
  - A "security-based swap" includes a swap based on "a single security or loan … or on the value thereof," or on a "narrow-based security index" ([15 U.S.C. § 78c(a)(68)](https://www.law.cornell.edu/uscode/text/15/78c)).
  - The same section defines a narrow-based security index as one that meets **any** of these tests (§ 78c(a)(55)(B), same source):
    - it has 9 or fewer component securities;
    - one component makes up more than 30% of the weighting;
    - the five heaviest components make up more than 60%;
    - the lightest components making up 25% of the weight trade less than $50M a day on average ($30M if there are 15 or more components).
  - Almost every one of our baskets would meet the first two tests.
  - The SEC's Forcerank order turned on payouts that depended on the value of individual securities ([SEC](https://www.sec.gov/news/pressrelease/2016-216.html)).
- **Two caveats cut both ways:**
  - Forcerank was a **settled order**. The company neither admitted nor denied the findings. It is not a court ruling.
  - Today's SEC posture (for example, the March 2026 crypto taxonomy) is **policy and interpretation, not law**, and it can change.
- **Conclusion:** the owner's point is real and arguable, and worth putting to the lawyer. It is not a settled answer. It is strongest if price stops being most of the score (option B below).

**6. Scoring option B: person-first scoring** *(a proposal for the lawyer to compare with today's scoring; not built)*

Most points would come from sourced, checkable things the person does. Price moves would be a smaller, capped share. Point values are placeholders.

| Event (each must link its public source) | Source | Placeholder points |
|---|---|---|
| Open-market insider buy (Form 4, code P) | SEC EDGAR | +25 (as today) |
| Insider sale (Form 4, code S) | SEC EDGAR | e.g. −10 or 0 (design choice) |
| New or amended 13D/13G stake filing | SEC EDGAR | e.g. +15 |
| 13F change by their investment vehicle (new position, big add or cut) | SEC EDGAR (quarterly) | e.g. +5 per qualifying change |
| Deal or acquisition announced | Named in the day's edition, with its source link | e.g. +20 |
| New company founded or launched | Sourced in the edition | e.g. +20 |
| Philanthropy pledge | Sourced in the edition | e.g. +10 |
| Rank change on Forbes or Bloomberg lists | Forbes Real-Time / Bloomberg index | e.g. ±5 per place (note: rank is itself price-driven) |
| Edition mention | Our edition (as today) | +10 per story |
| Price move of their holdings | Our price data | Capped, e.g. at ±50 a week |

**Trade-offs, honestly:**
- There would be fewer points each day and less day-to-day motion. Many days nobody files anything.
- It needs more editorial judgment about what counts. The rules must be written down, mechanical and sourced, so no one on our side can steer a score.
- Rank and net-worth changes are still derived from prices. Only the filing and event items are clearly not price-based.
- It would mean new scoring code, new tests and a new season. Today's scoring would keep running until a switch.

**7. The Book and one-off futures bets**

The Book (on `origin/v3`, `scripts/lib/book/pricing.mjs`) prices these play-money market types:

| Settles on | Market types in the code |
|---|---|
| **Price moves of a person's holdings basket** | `blast` (biggest % or $ gainer or loser, daily or weekly), `ladder` (a person's weekly move, e.g. "up 5% or more"), `bracket` (weekly range), `race` ("Will X pass Y in tracked stock wealth by Friday's close?"), `duel` (dollar change, X vs Y) |
| **Fantasy points** (mostly price plus bonuses) | `h2h` (moneyline and spread), `player_ou` (weekly points over/under), `futures_top` (top scorer of the week), `prop_sector` (top sector of the week) |
| **An event, not a price** | `prop_insider`: "Insider buy by Friday?" Settles on an SEC EDGAR Form 4 showing an open-market purchase (code P) filed that week |

- There is no separate richest-person market in The Book. The `race` markets compare "tracked stock wealth": share counts from SEC filings × price, or published net worth × one stock.
- The play-money "Next Moves" markets in `supabase/migrations/0001_game.sql` allow four kinds: `h2h`, `insider_buy`, `sector_top` and `other`.
- **The Book is house-banked.** Its method text says: "Two-way prices carry a 4.5% house margin (-110 both sides at 50/50), many-way prices 20%," and "Ladder rungs and duel lines carry a 4.5% margin each, ranges 12%, boards 20%."
- A real-money version would make us the **bookmaker on outcomes tied to securities' values**: off-exchange event contracts or security-based swaps. That is not allowed off a registered exchange (see Polymarket 2022 and Forcerank above).
- **Route:**
  - A regulated exchange partner lists similar contracts.
  - Event-settled ones (like `prop_insider`) are the easiest to argue.
  - Price-settled single-person ones (blast, ladder, bracket, race, duel) carry the SEC question.
  - Precedent: Kalshi and Polymarket already list richest-person markets, and exchanges self-certify new contracts under CFTC Rule 40.2 (sources in the table below).
- **Our role:** our odds model becomes **"BD fair odds"** research, shown next to the partner's live prices, with an affiliate fee or revenue share.
- **The Book stays play money until a lawyer signs off.**

**Which routes could work, and which don't:**

| Route | Could it work? | Why |
|---|---|---|
| **A. Regulated exchange partner** (Kalshi, Polymarket US, Robinhood's exchange) lists markets like "Which billionaire gains most this week?" and we supply the audience, stats and brand | **Most plausible** | These exchanges already list billionaire markets. Kalshi has a "wealthiest person in the world" market and Polymarket has "richest person on December 31, 2026" ([Kalshi](https://kalshi.com/markets/kxwealthy/wealthiest-person-in-world/kxwealthy-25), [Polymarket](https://polymarket.com/event/richest-person-on-december-31-2026)). Exchanges can list new contracts by self-certifying them under CFTC Rule 40.2 ([CFTC listing procedures](https://www.cftc.gov/IndustryOversight/ContractsProducts/ListingProcedures/index.htm)). In July 2026 the CFTC warned against broad, template-style certifications ([CFTC advisory](https://www.cftc.gov/PressRoom/PressReleases/9273-26)). **Open question:** contracts tied to *individual stocks* may count as security-based swaps and need the SEC too. Kalshi's proposed single-stock perpetuals need both SEC and CFTC approval ([Benzinga](https://www.benzinga.com/markets/prediction-markets/26/09/61733955/kalshi-eyes-24-7-leveraged-bets-on-tsla-nvda-and-aapl-with-new-perpetual-futures-push-report)). Markets on published net-worth rankings (Forbes, Bloomberg) exist today. The partner decides what to list. **Event-settled contracts (e.g. "insider buy by Friday") are the easiest. Price-settled single-person ones carry the SEC question.** We earn an affiliate fee or revenue share, show "BD fair odds" as research, and never hold money. |
| **B. Licensed paid fantasy (DFS) through a licensed operator, in states whose definitions fit** | **Unlikely** | Most state definitions are about athletes and sports (NY above). Even where the wording is looser (VA), the Forcerank theory still applies federally, because payouts turn on stock values. Person-first scoring (option B) could make the argument stronger. It would not make it settled. |
| **C. Run our own paid-entry contests** (like GameStock, which advertises cash stock tournaments from $5 entry, [App Store](https://apps.apple.com/us/app/gamestock-trading-tournaments/id6751907522)) | **High risk. Don't.** | That is the Forcerank fact pattern. GameStock's compliance page doesn't state its legal basis ([GameStock](https://gamestock.com/compliance)). That some company does it doesn't make it legal. |
| **D. Friends' league dues through an escrow service** (LeagueSafe-style) | **Unclear. Lawyer question.** | LeagueSafe holds dues for season-long sports leagues and pays out by commissioner vote ([LeagueSafe](https://www.leaguesafe.com/), [LeagueSafe fees](https://help.leaguesafe.com/hc/en-us/articles/217117406-What-are-the-fees-on-LeagueSafe)). Stock-scored payouts may still be swaps, and state social-gambling rules vary. Don't offer this before sign-off. |
| **E. Free-entry prize contests** paid for by sponsors | **Yes, with proper rules** | No purchase is needed to enter, so there is no "consideration," the pay-to-play element. New York and Florida require registration and a bond when total prizes exceed $5,000 ([Klein Moynihan](https://kleinmoynihan.com/sweepstakes-registration-and-bonding-requirements-2/)). California's AB 831 targets dual-currency, casino-style online sweepstakes and exempts ordinary promotions tied to bona fide sales ([ZwillGen](https://www.zwillgen.com/gaming/californias-ab-831-bans-sweepstakes-casinos-expands-liability-vendors/), [FKKS](https://advertisinglaw.fkks.com/post/102lrox/california-bans-online-sweepstakes-casinos)). Ask the lawyer whether a free contest with no product sale fits that exemption. |
| **F. Offshore or non-US markets** | **Not a way around US law** | Offering event contracts to US players from outside the rules is exactly what Polymarket was penalized for ([CFTC](https://www.cftc.gov/PressRoom/PressReleases/8478-22)). A licensed non-US launch would be a separate business, under that country's rules. |
| **G. Our own exchange or license** | **Not realistic** | Polymarket bought a licensed exchange and clearinghouse for $112M to come back to the US ([PR Newswire](https://www.prnewswire.com/news-releases/polymarket-acquires-cftc-licensed-exchange-and-clearinghouse-qcex-for-112-million-302509626.html)). |
| **H. A real-money Book** (we are the house, at a 4.5% / 20% margin) | **Don't** | That makes us the bookmaker on outcomes tied to securities: off-exchange event contracts or security-based swaps. Use a regulated exchange partner instead. |

**The policy climate is moving, in both directions.**
- **Federal.** The CFTC proposed an event-contract framework in June 2026 that signals it will allow sports contracts. Comments closed July 27, 2026 ([Axios](https://www.axios.com/2026/06/10/cftc-prediction-markets-sports-event-contract-rules), [Federal Register](https://www.federalregister.gov/documents/2026/06/12/2026-11854/prediction-markets-public-interest-determinations)).
- **States.** States keep suing. The Third Circuit sided with Kalshi, the Sixth and Ninth ruled against it, and New Jersey asked the Supreme Court to take the case on Sept 2, 2026 ([The Block](https://www.theblock.co/news/regulation/2026-09-26-kalshi-loses-appeal-over-ohio-and-tennessee-sports-betting-laws-widening-circuit-split-416937)).
- **Our reading, unsourced:** those fights are about sports, so finance-linked markets may face less state resistance. But the SEC swap question sits on top.

**A caution on the "business athletes" label.** Calling them athletes is branding. Regulators and courts look at how the game actually works, meaning what the payout is based on, so the label doesn't change the legal answer. State fantasy laws that mention "athletes" mean sports competitors. New York's definition speaks of "athletic events and athletes" and "human competitors on sports teams and in sports events" ([N.Y. PML § 1401](https://codes.findlaw.com/ny/racing-parimutuel-wagering-and-breeding-law/pml-sect-1401.html)). The positive side: person-first scoring (option B) is what makes the athlete comparison real, because an athlete's stats are things they do.

**Bottom line.** Plan the business so it survives if Route A never happens. Make Route A the prize to pursue. Don't touch Route C.

### B1. Stage 1, now: free league + sponsors + League Pass

- **Free-to-play league.** This is the draft room, weekly lock, captain, private leagues with invite links, public leagues, leaderboards, The Book and markets, all in play money. It is also the funnel. The daily email and digest are the free stats layer that brings players back every trading day.
- **Season presenting sponsor.** For example, "The Billionaire Bowl presented by [brand]": naming rights on the season, the draft room, weekly recap cards and the email. ESPN sells "official" sponsorships around ESPN Fantasy (approximate, [SponsorPitch](https://app.sponsorpitch.com/properties/espn-fantasy-sports)). No betting or crypto-exchange sponsors until the real-money stage clears legal review.
- **Game-page ads.** Display ads on game pages (lineups, leaderboards, player pages). Keep them light and never next to "set lineup" buttons.
- **League Pass (premium).** Priced against what fantasy players already pay:
  - Yahoo Fantasy Plus is $39.99/year and Ultra is $79.99/year ([Yahoo](https://fantasysports.yahoo.com/lp/plus)).
  - Fantrax Premium is reported at $79.95 per league per season (approximate, [Fantrax fees](https://www.fantrax.com/faq/fees)).
  - MyFantasyLeague charges a flat fee per league (price not confirmed, [MFL](http://www53.myfantasyleague.com/fantasy-football-purchase/fantasy-football-purchase-now.php)).
  - **Our offer:** about $39 per season per player, or about $49 per league per season for a commissioner upgrade.
  - **What's in it:** commissioner tools (custom scoring, trades, keeper/dynasty, head-to-head schedules), extra leagues, advanced stats from our SEC data (holdings history, Form 4 flow, "who moved the most" splits), a draft kit, mock drafts and cosmetics.
  - **Never** extra points, odds, coins or any edge.
- **Creator and private leagues.** Finance creators host public leagues for their followers. Workplace leagues ("office league") come with a commissioner kit. Paid creator posts need FTC #ad disclosure.
- **Worked example (Base, month 12).**
  - 20,000 registered players × 35% weekly active = 7,000.
  - Ads: 7,000 × 10 game pageviews a week × 4.33 weeks = 303,100 pageviews a month × $8 per 1,000 = **$2,425**.
  - League Pass: 2% of 20,000 = 400 × $3.25 a month (a $39 season spread over 12 months) = **$1,300**.
  - Sponsor: one $15,000 season deal = **$1,250/month**.

### B2. Stage 2, after lawyer sign-off: sponsor-funded free-entry prize contests

- Free to enter (no purchase needed), with prizes paid by a sponsor, e.g. "Top team in Season 1 wins $2,500 from [sponsor]."
- Official rules, eligibility (18+ or 21+, legal residents), odds and skill criteria. Registration and a bond in NY and FL if total prizes exceed $5,000, or exclude those states ([Klein Moynihan](https://kleinmoynihan.com/sweepstakes-registration-and-bonding-requirements-2/)).
- Prizes must never be bought, boosted or tied to League Pass. Free players and paying players get the same chances.
- For comparison, Wall Street Survivor runs free monthly contests with prizes for players 18+ ([Finder](https://www.finder.com/stock-trading/stock-trading-games)). MarketWatch's Virtual Stock Exchange is free ([U.S. News](https://money.usnews.com/investing/articles/the-best-stock-market-games-to-play)).
- **Why it matters:** it makes the free league feel like "real stakes" without anyone paying to play, and sponsors pay for it.

### B3. Stage 3, only if the crux clears: real-money play through a licensed route

- **Most likely shape (Route A).** A regulated exchange partner lists weekly "billionaire" markets that mirror our league, e.g. "Top-scoring billionaire this week" or "Will X's holdings beat the S&P 500 this week?"
  - We are the official stats and media partner. Players click through to the partner's own platform.
  - The partner does KYC, age checks (Kalshi signs up users at 18 in most states, approximate, [TheLines](https://www.thelines.com/prediction-markets/kalshi/age/)), location checks and money handling. We set our own floor at 21+.
  - We earn a revenue share or per-signup fee. DraftKings' affiliate program is reported at 25–40% revenue share or $40–$600+ per player (approximate, [Track360](https://track360.io/blog/draftkings-affiliate-program-operator-review-2026)). Kalshi and Polymarket US don't publish media-partner rates ([Track360](https://track360.io/blog/prediction-market-referral-programs-kalshi-polymarket-teardown-2026), [Polymarket US docs](https://docs.polymarket.us/incentives/referral)).
  - Robinhood splits a 2-cent-per-contract fee with Kalshi (approximate, [Prediction News](https://predictionnews.com/news/robinhood-acquires-own-prediction-market-exchange-but-cant-quit-kalshi-yet/)). That shows exchanges do share economics with the platforms that bring them users.
- **Other shape.** A licensed fantasy operator or white-label partner runs paid contests in any state where a lawyer agrees the format fits. Given Forcerank, this is unlikely.
- **Blunt risk statement.** Paid, cash-prize contests scored on stock returns are the most legally exposed thing this company could do. Securities, commodities and gambling law all apply at once. If we did it without a registered exchange, it would look like the case the SEC already brought. The live game stays play money until a lawyer signs off.
- **Scale check.** DraftKings reported 3.6M monthly unique payers and $132 average revenue per payer per month in Q2 2026 ([DraftKings 8-K](https://www.sec.gov/Archives/edgar/data/1883685/000188368526000027/q226-prx8kexx991.htm)). Our model assumes $10–$25 per real-money player per month, a small fraction of that.

### B4. Also: B2B white-label, video IP, data

- **B2B white-label leagues** for brokerages, fintech apps, banks and finance newsletters. They get a "draft billionaires" league for their users, run on our scoring engine, in play money. Stock-Trak sells white-label trading competitions from about $500 a month ([Stock-Trak](https://www.stocktrak.com/white-label-trading-platform/)), so there is a market. We assume about $1,000 a month per client.
- **Video IP.** The Fantasy Billionaires shorts are the league's hype channel: matchday recaps, draft-night reveals. YouTube pays Shorts creators 45% of their share of the Shorts ad pool ([YouTube](https://support.google.com/youtube/answer/72902?hl=en)) once a channel reaches 1,000 subscribers and 10M Shorts views in 90 days ([YouTube](https://support.google.com/youtube/answer/72851?hl=en)). Not modeled.
- **Data.** Our holdings-to-ticker mapping and daily "billionaire returns" series, licensed to media and apps. Not modeled.
- **The email and digest.** They stay free. A small sponsor slot in the email can be sold as part of the season sponsorship package, not as a business of its own.

### B5. Revenue model: three scenarios, with and without the real-money stage (illustrative assumptions, not forecasts)

**Inputs (all our assumptions):**

| Input | Conservative | Base | Strong |
|---|---|---|---|
| Registered players at 12 / 24 / 36 months | 5k / 15k / 30k | 20k / 75k / 150k | 60k / 200k / 500k |
| Weekly active share | 30% | 35% | 40% |
| Game pageviews per weekly active player per week | 10 | 10 | 10 |
| Ad RPM (revenue per 1,000 game pageviews) | $5 | $8 | $12 |
| League Pass conversion (of registered) | 1% | 2% | 3% |
| League Pass revenue per payer per month | $3.25 | $3.25 | $3.25 |
| Season sponsor revenue per year at 12 / 24 / 36 months | $0 / $10k / $20k | $15k / $50k / $100k | $50k / $200k / $450k |
| B2B white-label clients × $1,000/month at 12 / 24 / 36 | 0 / 0 / 1 | 0 / 1 / 3 | 1 / 3 / 6 |
| Email subscribers (a funnel input, no revenue line) | `[FILL IN: current list]`; assume about half of registered players | same | same |
| **Stage 3 (only if the crux clears), from month 24:** share of registered players who are 21+, in eligible states and play real money through the partner | 5% | 8% | 12% |
| Partner net revenue per real-money player per month | $10 | $15 | $25 |
| Our share of partner net revenue | 30% | 30% | 30% |

**Formulas (monthly):**
- Weekly active = registered × weekly active share
- Ads = weekly active × 10 × 4.33 ÷ 1,000 × RPM
- League Pass = registered × conversion × $3.25
- Sponsor = yearly sponsor revenue ÷ 12
- B2B = clients × $1,000
- Real money (Stage 3) = registered × real-money share × net revenue per player × 30%

**Results: monthly revenue (yearly run rate)**

| Scenario | Month 12 | Month 24 | Month 36 |
|---|---|---|---|
| **Conservative, no real money** | $487 ($5.8k) | $2,295 ($27.5k) | $5,590 ($67.1k) |
| **Conservative, with real money** | $487 ($5.8k) | $4,545 ($54.5k) | $10,090 ($121k) |
| **Base, no real money** | $4,975 ($59.7k) | $19,135 ($230k) | $39,269 ($471k) |
| **Base, with real money** | $4,975 ($59.7k) | $46,135 ($554k) | $93,269 ($1.12M) |
| **Strong, no real money** | $23,487 ($282k) | $80,735 ($969k) | $196,170 ($2.35M) |
| **Strong, with real money** | $23,487 ($282k) | $260,735 ($3.13M) | $646,170 ($7.75M) |

**Breakdown by line, monthly, at 12 / 24 / 36 months:**

| Scenario | Ads | League Pass | Sponsor | B2B | Real money (if it clears) |
|---|---|---|---|---|---|
| Conservative | $325 / $974 / $1,948 | $162 / $488 / $975 | $0 / $833 / $1,667 | $0 / $0 / $1,000 | $0 / $2,250 / $4,500 |
| Base | $2,425 / $9,093 / $18,186 | $1,300 / $4,875 / $9,750 | $1,250 / $4,167 / $8,333 | $0 / $1,000 / $3,000 | $0 / $27,000 / $54,000 |
| Strong | $12,470 / $41,568 / $103,920 | $5,850 / $19,500 / $48,750 | $4,167 / $16,667 / $37,500 | $1,000 / $3,000 / $6,000 | $0 / $180,000 / $450,000 |

**Base case, month 36, with real money, worked through:**
- Weekly active: 150,000 × 35% = 52,500
- Ads: 52,500 × 10 × 4.33 = 2,273,250 pageviews ÷ 1,000 × $8 = $18,186
- League Pass: 150,000 × 2% × $3.25 = $9,750
- Sponsor: $100,000 ÷ 12 = $8,333
- B2B: 3 × $1,000 = $3,000
- Free-stage total: $39,269
- Real money: 150,000 × 8% = 12,000 players × $15 × 30% = $54,000
- **Total: $93,269 a month**

**What this tells the owner:**
- **If the crux goes badly:** the Base case is a small, profitable free-to-play game business, about $470k a year by month 36. The Strong case is about $2.4M a year. It is worth building, but it is an ads-and-subscriptions business.
- **If a partner route clears:** real money becomes the biggest line by month 24 in every scenario. By month 36 it multiplies revenue by about 1.8x (Conservative), 2.4x (Base) or 3.3x (Strong). That is where most long-term value sits.
- **Running it ourselves, if ever licensed:** we'd keep all the net revenue instead of 30%. That's $180k a month in Base at month 36, before much higher costs for licensing, taxes, compliance and prize liquidity. It is not realistic near term (routes C and G).
- These figures are before payment fees and tax. Video and data are not included. Growth that real money itself would bring is not modeled.

---

## C. Payment processing and the crypto question

### C1. Recommendation
- **League Pass and commissioner upgrades:** Stripe Billing plus Stripe Tax on the web. That is 2.9% + 30¢ per US card, 0.7% of subscription volume for Billing and 0.5% per payment for Tax (no-code) ([Stripe pricing](https://stripe.com/pricing)). A Merchant of Record (Paddle, Lemon Squeezy) is the fallback if sales-tax work grows. They publish 5% + 50¢ (approximate, [review](https://dodopayments.com/blogs/paddle-fees-explained)).
- **Sponsors and B2B clients:** invoices (Stripe Invoicing or bank transfer).
- **League dues and prize money:**
  - **We don't hold anyone's entry fees or prize money before a lawyer signs off.** No dues collection, no prize wallet, no payouts from player money.
  - Stage 2 prizes come from the sponsor, under official rules, and we pay winners from our own sponsor revenue.
  - In Stage 3 the licensed partner holds every dollar, runs KYC, age and location checks, and pays out. We receive an affiliate or revenue-share payment.
  - If the lawyer later approves friends' league dues, use a compliant escrow or payment approach they choose. Don't build our own.
- **Optional later:** USDC for annual League Pass through Stripe at 1.5% ([Stripe](https://stripe.com/pricing), [Stripe docs](https://docs.stripe.com/payments/accept-stablecoin-payments)), only if players ask.
- **An app later:**
  - Apple's Small Business Program takes 15% ([Apple](https://developer.apple.com/app-store/small-business-program/)).
  - US apps may link to web checkout ([TechCrunch](https://techcrunch.com/2025/05/02/apple-changes-us-app-store-rules-to-let-apps-redirect-users-to-their-own-websites-for-payments)), but a December 2025 ruling lets Apple charge some commission on those purchases ([MacRumors](https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/)).
  - Real-money gaming apps face separate store rules. The partner's app handles that.

### C2. Why no token, no crypto prize pools, no crypto network (for a fantasy league)
1. **A crypto prize pool is a real-money contest.** Paying in crypto doesn't change the legal analysis in B0. A pool paid out on stock-scored results is the Forcerank pattern (security-based swaps, [SEC](https://www.sec.gov/news/pressrelease/2016-216.html)) plus gambling law.
2. **A tradable token turns play coins into a prize.** Today our coins can't be bought or cashed out, so there is no prize. A token with market value would supply the prize, which is the element that turns a game into gambling. California's AB 831 bans dual-currency online sweepstakes and reaches media affiliates and payment processors that knowingly support them ([ZwillGen](https://www.zwillgen.com/gaming/californias-ab-831-bans-sweepstakes-casinos-expands-liability-vendors/)). New York's S5935A sets fines of $10,000–$100,000 per violation ([SBC Americas](https://sbcamericas.com/2025/12/08/new-york-hochul-signs-sweepstakes-ban/)).
3. **Money transmission.** Holding or moving players' crypto makes us an administrator or exchanger. FinCEN treats those as money transmitters, with registration, anti-money-laundering and KYC duties ([FinCEN](https://www.fincen.gov/system/files/2019-05/FinCEN%20CVC%20Guidance%20FINAL.pdf)). Merely *accepting* crypto for our own product is generally not transmission (same source).
4. **Securities law is unsettled.**
   - The SEC/CFTC March 2026 guide puts gaming tokens and collectibles outside securities law ([Sullivan & Cromwell](https://www.sullcrom.com/insights/memo/2026/March/SEC-Clarifies-Application-Securities-Laws-Crypto-Assets)). But a token sold to raise money, or pitched as something that will rise in value, is still an investment contract under Howey.
   - The CLARITY Act failed cloture 49–50 on Sept 15, 2026 ([DLA Piper](https://www.dlapiper.com/en/insights/publications/2026/09/senate-fails-to-advance-the-clarity-act)).
5. **Precedent.** Polymarket paid a $1.4M CFTC penalty in 2022 and later spent $112M on a licensed exchange to come back ([CFTC](https://www.cftc.gov/PressRoom/PressReleases/8478-22), [PR Newswire](https://www.prnewswire.com/news-releases/polymarket-acquires-cftc-licensed-exchange-and-clearinghouse-qcex-for-112-million-302509626.html)). PackDraw faces reported lawsuits alleging it recruited a minor into offshore crypto gambling. These are allegations only ([PRWeb](https://www.prweb.com/releases/lawsuit-filed-on-behalf-of-minor-allegedly-recruited-into-illegal-offshore-crypto-gambling-302742261.html)).
6. **Partners and investors.** A licensed exchange partner, the most valuable route (A), won't want to work with a league that runs its own crypto economy. Most investors would price it in as legal risk (our judgment).
7. **The product doesn't need it.** Supabase already keeps the game ledger.

The GENIUS Act (July 18, 2025) regulates stablecoin issuers and says payment stablecoins are not securities ([CRS](https://www.congress.gov/crs-product/IN12553)). That makes *accepting* USDC easier. It changes nothing for prize pools or our own coin.

### C3. Options compared

| Option | Fees | Effort | Legal risk | Verdict |
|---|---|---|---|---|
| Stripe Billing + Tax (League Pass) | 2.9% + 30¢, + 0.7% Billing, + 0.5% Tax ([Stripe](https://stripe.com/pricing)) | Low | Low | **Use now** |
| Merchant of Record (Paddle, Lemon Squeezy) | 5% + 50¢ (approximate) | Lowest | Low | Fallback |
| Stripe USDC | 1.5% | Low | Low | Later, annual plans only |
| Holding league dues or prize pools ourselves | n/a | Medium | **High** before legal sign-off | **Don't** |
| Licensed partner holds all real money | Partner's cost | Low for us | Low for us | **The Stage 3 route** |
| Crypto prize pools, own token or network | Unknown legal bills, possible fines | High | **Highest** | **Don't** |

---

## D. Investor Q&A (as a fantasy-league company: "fantasy sports for business athletes")

**1. What problem are you solving?**
Fantasy players have leagues for every sport, but not for the thing half their group chat argues about: money and markets. Stock-picking games feel like homework. People want a social, weekly, draft-with-friends game built on something real, with the research built in.

**2. What's your solution?**
Fantasy sports for business athletes, starting with the Billionaire Fantasy League. Draft 5 billionaires under a cap, pick a captain, lock Monday, and score on their stat line: the real daily returns of their disclosed holdings, plus insider buys and news. Leagues, trash talk, leaderboards, props and markets sit around it. A free daily box score and injury report (the digest, the SEC filings, 100 profiles) tells you who to draft. Satire shorts make it shareable.

**3. Why now?**
- **Fantasy is huge and mature:** about 57M players in the US and Canada (approximate, [FSGA](https://thefsga.org/fsgas-2025-research-fantasy-sports-womens-betting-social-sportsbooks/)). ESPN had 14M+ in 2025 ([ESPN Press Room](https://espnpressroom.com/us/press-releases/2025/09/all-time-record-four-years-in-a-row-14-million-fans-playing-espn-fantasy-football-in-2025/)). Sports-only leagues leave a gap for a new "sport": business athletes.
- **"Follow the billionaires" has proven demand:** Autopilot reports $1.3B in assets and about 80,000 paying subscribers from copying famous portfolios (approximate, [Forbes](https://www.forbes.com/sites/investor-hub/article/what-is-autopilot-investment-app/)). Exchanges already list richest-person markets (Kalshi, Polymarket).
- **Regulated real-money event markets are going mainstream:**
  - DraftKings Predictions launched in 38 states in December 2025 (approximate, [Front Office Sports](https://frontofficesports.com/article/draftkings-fanduel-push-further-into-prediction-markets/)).
  - The CFTC is writing formal event-contract rules ([Axios](https://www.axios.com/2026/06/10/cftc-prediction-markets-sports-event-contract-rules)).
  - These exchanges need new, engaging markets and audiences. That is our Stage 3.
- **AI and automation:** our pipeline fetches filings and prices, scores the league and publishes the research every morning with little human work (README, CLAUDE.md).

**4. How big is the market?** (Method shown. Illustrative.)
- **TAM:** about 57M fantasy players in the US and Canada (FSGA, approximate). A wider pool is the 62% of US adults who own stock (Gallup).
- **SAM:** fantasy players in the US who would play a finance-themed league. Our assumption is 10% of 53M US players ≈ **5.3M**.
- **SOM:** 150,000 registered players in 3 years (Base), about 2.8% of SAM.
- **In dollars:** Base revenue per registered player is about $3.14 a year without real money, and about $7.46 with it (month 36). At the with-real-money rate, SAM is worth roughly 5.3M × $7.46 ≈ **$40M a year** to us. The partner's own revenue is much larger.

**5. Show me the product.**
- The live site is at https://billionairesdigest.com (fantasy, leagues, leaderboard, The Book, markets).
- The v3 draft room is on the preview: `[FILL IN: share v3.billionaires-digest.pages.dev?]`.
- **Demo:** create a league → invite a friend → draft 5 under the cap → pick a captain → see yesterday's points from real price moves → click a pick's Form 4 source.

**6. What traction do you have?**
`[FILL IN: registered players, weekly active players, leagues created, lineups set per week, draft completion, visitors, email list, video views]`. No revenue. Season 1 hasn't started yet `[FILL IN: date]`.

**7. What's the business model?**
Stage 1 (now): free league plus season sponsor, game-page ads, League Pass, creator leagues and B2B white-label. Stage 2 (after legal sign-off): sponsor-funded free-entry prize contests. Stage 3 (if the crux clears): real-money play through a regulated partner, with us earning a revenue share. Most long-term value is in Stage 3. The business is built to survive without it (section B5).

**8. What are the unit economics per player?**
- **Revenue per registered player:** about $2.98 a year in Base at month 12 (free stage only). About $7.46 a year at month 36 with real money.
- **Revenue per weekly active player:** Base month 36 without real money is $39,269 ÷ 52,500 ≈ $0.75 a month.
- **Cost per new player:** unknown until we test. Viral invites (one commissioner brings 8–12 friends) should keep it low. Paid newsletter-signup tools cost about $1.60–$3 per email (approximate, [Newsletter Supply](https://newsletter.supply/blog/how-does-beehiiv-boosts-work)) and serve as a proxy for the funnel.
- **Gross margin:** high. Scoring and research are automated, and costs are mostly software (section E).
- **The number to prove:** season-over-season league retention.

**9. Who are the competitors, and why do you win?**
- **Season-long fantasy:** Sleeper (raised $40M at a $400M valuation in 2021, [Front Office Sports](https://frontofficesports.com/sleeper-more-than-quadruples-valuation-to-400m/)), ESPN, Yahoo (Plus $39.99/year). All sports.
- **DFS and pick'em:** DraftKings, Underdog, PrizePicks. Sports only, and under state pressure (California, above).
- **Stock-sim games:** Wall Street Survivor, MarketWatch VSE, Stock-Trak. Solo trading simulators, not drafts with friends.
- **Paid stock tournaments:** GameStock. Legal basis unclear.
- **Prediction markets:** Kalshi and Polymarket list richest-person markets. They are partners more than rivals.
- **Why we win:** the only draft-style, league-first game where the athletes are business people. Others are either sports fantasy or stock tools. It's social like Sleeper, scored on real sourced data, and the research is built in and free.

**10. What's the moat?**
- **The scoring engine: the business athlete's stat line.** It turns sourced, disclosed holdings from SEC filings and 100 researched profiles into daily fantasy points, including ADR mapping for foreign holdings (`scripts/lib/fantasy.mjs`). The raw data is public. The clean mapping and history are ours.
- **League network effects, across "sports".** Friends' leagues are hard to leave and come back each season.
- **The characters and IP** in the Fantasy Billionaires shorts: the business athletes' personalities.
- **A near-zero cost per season**, thanks to automation.
- **Later, partner exclusivity** as the official stats partner for billionaire markets.

**11. How will you get players?**
- Commissioner invites: each league brings 8–12 people.
- Office and creator leagues.
- Weekly shareable recap cards.
- Draft-night and matchday shorts.
- The free daily email as the stats layer, with sign-up on every page.
- SEO from 100 player (billionaire) pages.
- B2B white-label clients bringing their users.
- Season-launch pushes, timed to market events.

**12. Who is the team?**
`[FILL IN: background, hours per week, helpers]`. Be honest: a part-time solo founder with a full-time NYC real estate brokerage. It is the biggest concern. Answer with:
- the automated pipeline's record `[FILL IN: days published, days missed]`
- a named first hire (a game/community lead) and what triggers it
- advisers: a gaming/derivatives lawyer and a fantasy or betting operator
- the revenue at which you'd go full-time `[FILL IN]`

**13. What are the regulatory and legal risks?** (The crux comes first.)
- **Real money:** paid, stock-scored contests look like security-based swaps (Forcerank, 2016), fall outside most state fantasy definitions (NY), and face skill-vs-chance tests. The only plausible route is a regulated exchange partner, and even that may need SEC as well as CFTC sign-off for single-stock contracts. The live game stays play money until a lawyer signs off (section B0).
- **Prize contests:** no purchase necessary, official rules, and NY/FL registration and bonding over $5,000.
- **Names and likenesses:**
  - Using names and public stats in fantasy games was protected in *C.B.C. v. MLB Advanced Media* (8th Cir. 2007) ([Justia](https://law.justia.com/cases/federal/appellate-courts/ca8/06-3358/063357p-2011-02-25.html)). That covers names and stats, not AI faces or voices.
  - New York's synthetic-performer ad disclosure law took effect June 9, 2026 ([Cooley](https://www.cooley.com/news/insight/2026/2026-01-29-new-york-enacts-synthetic-performer-disclosure-law-for-advertisements-including-those-using-generative-ai)).
  - Tennessee's ELVIS Act protects voice and likeness ([Holland & Knight](https://www.hklaw.com/en/insights/publications/2024/04/first-of-its-kind-ai-law-addresses-deep-fakes-and-voice-clones)).
  - Our rules: painted portraits, no voice clones, satire tags, no likeness used to sell a product.
- **Not investment advice:** under *Lowe v. SEC* (1985), a bona fide publication of general, regular circulation is not an investment adviser ([Justia](https://supreme.justia.com/cases/federal/us/472/181/)). Keep the research impersonal.
- **Email:** CAN-SPAM ([FTC](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)).
- **Children:** the COPPA amendments applied from April 22, 2026 ([Federal Register](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule)). Put an 18+ gate on the league and 21+ on anything real-money.
- **Gamification:** no deceptive mechanics (Robinhood's $7.5M Massachusetts settlement, in BUSINESS-LESSONS.md).

**14. What could kill the company?**
- The crux: real money never clears, and the free game alone doesn't reach scale.
- Players draft once and don't come back (low weekly lineup-set rate).
- The founder runs out of time.
- An enforcement action, if play money ever drifts toward real stakes.
- A likeness lawsuit over the shorts.
- A scoring error that breaks trust.
- A big platform (ESPN, Sleeper, Robinhood) copying the theme.

**15. What will you use the money for?** (Only if you raise.)
For $250k–$500k over 18 months, a suggested split (assumption):
- 40% game/community lead
- 20% legal (the crux opinion, prize-contest rules, IP)
- 20% player acquisition, once cost per player is known
- 10% engineering (League Pass, commissioner tools)
- 10% reserve

**16. How much are you raising, and at what stage?**
- **Not yet.** First prove Season 1: `[FILL IN: target]` registered players, a 60%+ draft-completion rate, a 50%+ weekly lineup-set rate among active players, 100+ leagues, the first season sponsor, and a written legal opinion on the crux. Those numbers are assumptions to replace with real ones.
- **Then** consider a small angel or pre-seed round. Carta's Q2 2026 data, from secondary summaries (we couldn't open the page), shows an average pre-seed instrument of about $276k. Median post-money SAFE caps run from about $10M (rounds under $250k) to $18M ($1M–$2.4M) ([Carta](https://carta.com/data/state-of-pre-seed-q2-2026/), [Finro](https://www.finrofca.com/news/safe-valuation-caps-2026)). AI companies took about half of pre-seed dollars, so expect less. Treat all of this as approximate.
- **Why wait:** a clear legal answer on real money changes the valuation more than anything else.

**17. What are the milestones?**
- **6 months:**
  - v3 with the draft room live
  - Season 1 completed `[FILL IN: dates]`
  - `[FILL IN]` registered players and 100+ leagues
  - League Pass launched on Stripe
  - one season sponsor
  - written legal opinion on the crux
- **12 months:**
  - Season 2 retention at 40%+ of Season 1 leagues (an assumption to test)
  - first free-entry prize contest (Stage 2), if approved
  - first B2B pilot
  - talks with 2–3 regulated exchanges on billionaire markets
- **18 months:**
  - $10k+ monthly revenue
  - first hire
  - a signed exchange or operator partnership, or a clear "no" and a plan that works without it

**18. Exit paths.**
- **Fantasy and betting platforms:** Sleeper ($400M valuation in 2021). Better Collective bought Action Network, a betting media and affiliate business, for $240M ([Sportico](https://www.sportico.com/business/media/2021/action-network-sale-1234628890/)).
- **Exchanges and brokerages that want engaged users:** Robinhood (bought MarketSnacks in 2019, [Fortune](https://fortune.com/2019/03/25/robinhood-acquires-marketsnacks); now building its own prediction exchange), Kalshi and Polymarket, and DraftKings or FanDuel (both now run prediction products).
- **Media:** Axel Springer (Morning Brew, [Talking Biz News](https://talkingbiznews.com/media-news/axel-springer-buys-remaining-stake-in-morning-brew/)) and Cox (Axios, $525M, [CNBC](https://www.cnbc.com/2022/08/08/axios-to-sell-itself-to-cox-enterprises-for-525-million.html)).
- These show who buys, not what we're worth.

---

## E. How we run it (operations)

### E1. Company setup
- **Entity.** An LLC if bootstrapping. A Delaware C-corp if raising. Stripe Atlas charges $500 including state fees and the first year of registered agent, then $100 a year ([Stripe Atlas](https://stripe.com/atlas)). Ask an accountant first `[FILL IN]`.
- **Separate business bank account and card.**
- **Trademarks:** "Billionaires Digest," "Billionaire Fantasy League," "Fantasy Billionaires" and "The Billionaire Bowl." The USPTO base fee is $350 per class ([USPTO](https://www.uspto.gov/trademarks/fees-payment-information/summary-2025-trademark-fee-changes)).
- **League terms, privacy policy and official rules template.** `play-terms.html` already covers play money.
- **Lawyer review list, in priority order:**
  1. **The crux.** Can any real-money version of a stock-scored league be offered in the US? Cover security-based swaps (Forcerank), CFTC event contracts via a partner, state fantasy definitions, and skill vs chance.
  2. The current play-money game, The Book and markets: confirm there is no consideration and no prize.
  3. Free-entry prize contests: official rules, NY/FL registration and bonding, the AB 831 fit.
  4. Friends' league dues and escrow: allowed or not.
  5. Affiliate and partner terms and 21+ gating.
  6. Satire shorts and portraits (NY and TN likeness laws).
  7. "Not investment advice" for the research layer.
  8. Sponsor and B2B contract templates.
  9. Trademark search.

### E2. The automated pipeline is the cost advantage
- **Every morning:** filings and prices at 5:30 AM → fantasy points and The Book built → research edition at 6:00 AM → game sync (weeks, points, settle markets) at 6:45 AM → health check at 7:15 AM (CLAUDE.md).
- One person oversees a daily scoring and stats operation that would otherwise need a staff.
- **Protect it:** monitoring, backups, and tests before every push.

### E3. Monthly cost estimate

| Item | Cost | Source / note |
|---|---|---|
| Hosting (GitHub Pages) | $0 today | Current setup |
| Game database (Supabase) | Free tier; Pro $25/month | Approximate, [NoCode MBA](https://www.nocode.mba/articles/supabase-pricing) |
| Email (beehiiv) | Free up to 2,500 subs; Scale from $43/month | [beehiiv](https://www.beehiiv.com/pricing) |
| Prices (Finnhub) | $0 on the free key today | Paid tier `[FILL IN]` if needed for more players |
| AI routine | `[FILL IN]` | |
| Payments | About 4% + 30¢ per payment | [Stripe](https://stripe.com/pricing) |
| Legal | `[FILL IN: 2–3 quotes]`. The crux opinion is the big one | |
| Setup | $500 (Atlas) + $350 per trademark class, one-time | Above |
| Sweepstakes bond (Stage 2, if prizes over $5k in NY/FL) | Reported around 2% of prize value, plus filing fees (approximate) | [RallyUp](https://rallyup.com/learn/understand-sweepstakes-registration-and-bonding-2/) |

### E4. First roles to hire
1. **Game/community lead:** runs seasons, leagues, creator leagues and support.
2. **Partnerships (sponsors, B2B, exchanges):** commission or part-time.
3. **Video producer (freelance):** draft-night and matchday shorts.
4. **Contract engineer:** League Pass, commissioner tools, the white-label version.

### E5. KPI dashboard (review weekly)

| Metric | Why it matters |
|---|---|
| Registered players; weekly active players (lineup set or page visit) | Size and habit |
| **Draft completion rate** (started a draft → submitted a 5-player team) | Onboarding quality |
| **Weekly lineup-set rate** (teams set before Monday lock ÷ active teams) | The core habit |
| Leagues created; average league size; invites sent and accepted | Network effects |
| **League retention season over season** | The number investors will ask for |
| D7 and D30 player retention | Early warning |
| League Pass conversion and churn | Subscription health |
| Sponsor revenue per season; game-page RPM | Free-stage revenue |
| Email subscribers from the game; open rate | Research-layer reach |
| Stage 3 (once live): partner signups by state, 21+ checks passed | Only legal states and ages |
| Pipeline: scoring on time, corrections | Trust |

---

## F. 90-day action plan

1. **Days 1–7:**
   - Pick Season 1 dates `[FILL IN: start date and length]`. The code currently starts real weeks at `2026-W40`, the week of Sept 28, 2026, in `assets/fantasy-core.js`.
   - Choose an LLC or C-corp and open a business account.
   - Get 2–3 lawyer quotes, specifically for the crux opinion.
2. **Days 1–21: launch v3 with the draft room.** Owner approval to publish is required. Make sure the draft → league → lock → score loop works on mobile, and that the 18+ gate and play-money terms are clear.
3. **Days 7–30: commissioner kit.**
   - Invite links and an "office league" template.
   - A shareable weekly recap card.
   - A "set your lineup before Monday 9:30 AM" reminder (opt-in, easy to turn off).
4. **Days 7–30: set up the KPI sheet** (E5) and record the starting numbers `[FILL IN]`.
5. **Days 14–30: seed 25 leagues by hand.** Friends, coworkers, the real estate network and 3–5 finance creators.
6. **Days 14–45: research layer as the stats feed.** Launch the free daily email positioned as "your league's stats": the day's biggest movers among draftable billionaires and new filings on your roster. Put a sign-up box on every game page.
7. **Days 21–60: Season 1 hype.** Two shorts a week: draft-night reveal, matchday recap, trash-talk bits. Every one points to "start a league."
8. **Days 30–60: lawyer consultation on the crux** (E1 list item 1) and on prize contests. Bring both scoring versions (today's and option B) and The Book's market list. Get the answers in writing.
9. **Days 30–60: sponsor pitch.** Build a "Billionaire Bowl presented by …" deck (audience, leagues, formats, rules) and pitch 20 fintech, finance-media and consumer brands. No betting or crypto-exchange sponsors yet.
10. **Days 45–75: League Pass on Stripe Billing plus Tax.** Commissioner tools, advanced SEC stats, draft kit, cosmetics. Never pay-to-win.
11. **Days 60–90:** if the lawyer sees a path for Route A, send exploratory emails to 2–3 regulated exchanges (Kalshi, Polymarket US, Robinhood's exchange) proposing weekly billionaire markets with us as the stats and media partner. Sign nothing without counsel.
12. **Days 1–90: seasons.** Decide Season 1 dates. Run Q4 2026 as a free preseason test. Fix the Arnault/LVMH scoring gap (section A2).
13. **Days 30–90: second league.** Design the Founders league scoring and pool rules (section A2).
14. **Day 90: review.** Draft completion, lineup-set rate, leagues and the legal answer. Decide the Season 2 plan and whether to talk to angels.

---

## G. Risks and guardrails (owner rules kept)

- **The live game stays play money** until a licensed or legal route is chosen after legal review. No purchases of coins, no cash-out and no prizes until then. Stage 2 prizes only after sign-off, and always free to enter. Stage 3 only through a licensed or regulated route.
- **Never skip or weaken** legally required age, identity, location or responsible-gambling checks. 18+ for the league, 21+ and legal states only for anything real-money.
- **No deceptive mechanics:** no fake near-misses, fake winner feeds, false countdowns, or nudges to trade real stocks.
- **League Pass never buys an advantage.**
- **Every fact in the research layer is sourced.** Nothing is invented. Facts go in "The move"; opinion is labeled.
- **"For information only · not financial advice."** The game is not a recommendation to buy any stock.
- **Real estate at city level only.** No addresses or tracking of people or families.
- **Art:** painted portraits (v3), no photos of real people, no company logos, no voice clones, satire tagged, no likeness used to sell a product.
- **No token, no crypto prize pools, no crypto network.**
- **We don't hold player money** before legal sign-off.
- **Ask the owner first** before anything that costs money, deletes data or is published outward.

---

## H. Sources

**The legal crux**
- UIGEA fantasy exclusion, 31 U.S.C. § 5362: https://www.law.cornell.edu/uscode/text/31/5362
- New York PML § 1401: https://codes.findlaw.com/ny/racing-parimutuel-wagering-and-breeding-law/pml-sect-1401.html
- Virginia Code § 59.1-556: https://law.lis.virginia.gov/vacode/title59.1/chapter51/section59.1-556/
- Fantasy law background: https://www.pbs.org/wgbh/frontline/article/how-fantasy-sports-got-around-online-gambling-laws/ · https://velawood.com/why-playing-fantasy-sports-is-legal-for-the-most-part/ · https://velawood.com/tracker/fantasy-sports-legislation-tracker/
- Skill vs chance: https://www.lexology.com/library/detail.aspx?g=0a16536c-4f6f-48ed-966f-a8d43b676f10 · https://www.foley.com/insights/publications/2022/04/a-potential-new-paradigm-for-daily-fantasy-sports/
- Security-based swap and narrow-based security index, 15 U.S.C. § 78c(a)(55), (a)(68): https://www.law.cornell.edu/uscode/text/15/78c
- SEC Form D (due within 15 days after first sale): https://www.sec.gov/resources-small-businesses/capital-raising-building-blocks/what-form-d · https://www.sec.gov/about/divisions-offices/division-corporation-finance/frequently-asked-questions-answers-form-d
- SEC v. Forcerank (2016): https://www.sec.gov/news/pressrelease/2016-216.html · https://natlawreview.com/article/fantasy-stock-picking-contest-deemed-sec-to-be-illegal-security-based-swaps
- SEC investor alert, fantasy stock trading sites: https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-alerts/investor-58
- CFTC Polymarket order (2022): https://www.cftc.gov/PressRoom/PressReleases/8478-22
- CFTC listing procedures: https://www.cftc.gov/IndustryOversight/ContractsProducts/ListingProcedures/index.htm · advisory, July 2026: https://www.cftc.gov/PressRoom/PressReleases/9273-26
- CFTC proposed event-contract rule (June 2026): https://www.axios.com/2026/06/10/cftc-prediction-markets-sports-event-contract-rules · https://www.federalregister.gov/documents/2026/06/12/2026-11854/prediction-markets-public-interest-determinations
- Billionaire markets: https://kalshi.com/markets/kxwealthy/wealthiest-person-in-world/kxwealthy-25 · https://polymarket.com/event/richest-person-on-december-31-2026
- Kalshi single-stock perpetuals (SEC + CFTC): https://www.benzinga.com/markets/prediction-markets/26/09/61733955/kalshi-eyes-24-7-leveraged-bets-on-tsla-nvda-and-aapl-with-new-perpetual-futures-push-report
- Kalshi court rulings: https://www.theblock.co/news/regulation/2026-09-26-kalshi-loses-appeal-over-ohio-and-tennessee-sports-betting-laws-widening-circuit-split-416937
- GameStock: https://apps.apple.com/us/app/gamestock-trading-tournaments/id6751907522 · https://gamestock.com/compliance
- California DFS / pick'em: https://www.covers.com/industry/underdog-sports-limits-california-fantasy-games-to-peer-to-peer-format-july-2025 · https://sbcamericas.com/2025/07/02/prizepicks-california-p2p-arena-switch/
- DFS states (approximate): https://www.saturdaydownsouth.com/dfs/legal-states/
- Sweepstakes registration and bonding: https://kleinmoynihan.com/sweepstakes-registration-and-bonding-requirements-2/ · https://rallyup.com/learn/understand-sweepstakes-registration-and-bonding-2/
- California AB 831: https://www.zwillgen.com/gaming/californias-ab-831-bans-sweepstakes-casinos-expands-liability-vendors/ · https://advertisinglaw.fkks.com/post/102lrox/california-bans-online-sweepstakes-casinos · https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB831
- New York S5935A: https://sbcamericas.com/2025/12/08/new-york-hochul-signs-sweepstakes-ban/
- LeagueSafe: https://www.leaguesafe.com/ · https://help.leaguesafe.com/hc/en-us/articles/217117406-What-are-the-fees-on-LeagueSafe

**Fantasy business models and market**
- FSGA 2025 research (approximate): https://thefsga.org/fsgas-2025-research-fantasy-sports-womens-betting-social-sportsbooks/
- ESPN Fantasy 2025: https://espnpressroom.com/us/press-releases/2025/09/all-time-record-four-years-in-a-row-14-million-fans-playing-espn-fantasy-football-in-2025/
- ESPN Fantasy sponsorships (approximate): https://app.sponsorpitch.com/properties/espn-fantasy-sports
- Yahoo Fantasy Plus: https://fantasysports.yahoo.com/lp/plus
- Fantrax fees (approximate): https://www.fantrax.com/faq/fees
- MyFantasyLeague: http://www53.myfantasyleague.com/fantasy-football-purchase/fantasy-football-purchase-now.php
- Sleeper: https://frontofficesports.com/sleeper-more-than-quadruples-valuation-to-400m/ · https://rotogrinders.com/fantasy/sleeper-promo-code/legal-states
- DraftKings Q2 2026 metrics: https://www.sec.gov/Archives/edgar/data/1883685/000188368526000027/q226-prx8kexx991.htm
- DraftKings affiliates (approximate): https://track360.io/blog/draftkings-affiliate-program-operator-review-2026
- Prediction-market referral programs (approximate): https://track360.io/blog/prediction-market-referral-programs-kalshi-polymarket-teardown-2026 · https://docs.polymarket.us/incentives/referral
- Robinhood / Kalshi (approximate): https://predictionnews.com/news/robinhood-acquires-own-prediction-market-exchange-but-cant-quit-kalshi-yet/
- DraftKings Predictions (approximate): https://frontofficesports.com/article/draftkings-fanduel-push-further-into-prediction-markets/
- Kalshi age (approximate): https://www.thelines.com/prediction-markets/kalshi/age/
- Stock games: https://www.finder.com/stock-trading/stock-trading-games · https://money.usnews.com/investing/articles/the-best-stock-market-games-to-play · https://www.wallstreetsurvivor.com/
- Stock-Trak white label: https://www.stocktrak.com/white-label-trading-platform/
- Autopilot (approximate): https://www.forbes.com/sites/investor-hub/article/what-is-autopilot-investment-app/
- Gallup: https://news.gallup.com/poll/266807/percentage-americans-owns-stock.aspx
- YouTube: https://support.google.com/youtube/answer/72851?hl=en · https://support.google.com/youtube/answer/72902?hl=en
- Exits: https://www.sportico.com/business/media/2021/action-network-sale-1234628890/ · https://fortune.com/2019/03/25/robinhood-acquires-marketsnacks · https://talkingbiznews.com/media-news/axel-springer-buys-remaining-stake-in-morning-brew/ · https://www.cnbc.com/2022/08/08/axios-to-sell-itself-to-cox-enterprises-for-525-million.html

**Crypto and payments**
- CLARITY Act vote: https://www.dlapiper.com/en/insights/publications/2026/09/senate-fails-to-advance-the-clarity-act
- SEC/CFTC taxonomy: https://www.sullcrom.com/insights/memo/2026/March/SEC-Clarifies-Application-Securities-Laws-Crypto-Assets
- GENIUS Act: https://www.congress.gov/crs-product/IN12553
- FinCEN 2019: https://www.fincen.gov/system/files/2019-05/FinCEN%20CVC%20Guidance%20FINAL.pdf
- Polymarket QCEX: https://www.prnewswire.com/news-releases/polymarket-acquires-cftc-licensed-exchange-and-clearinghouse-qcex-for-112-million-302509626.html
- PackDraw-related lawsuit (allegations): https://www.prweb.com/releases/lawsuit-filed-on-behalf-of-minor-allegedly-recruited-into-illegal-offshore-crypto-gambling-302742261.html
- Stripe: https://stripe.com/pricing · https://docs.stripe.com/payments/accept-stablecoin-payments · https://stripe.com/atlas
- Paddle (approximate): https://dodopayments.com/blogs/paddle-fees-explained
- Apple: https://developer.apple.com/app-store/small-business-program/ · https://techcrunch.com/2025/05/02/apple-changes-us-app-store-rules-to-let-apps-redirect-users-to-their-own-websites-for-payments · https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/

**Other legal and operations**
- C.B.C. v. MLB Advanced Media: https://law.justia.com/cases/federal/appellate-courts/ca8/06-3358/063357p-2011-02-25.html
- NY synthetic performer law: https://www.cooley.com/news/insight/2026/2026-01-29-new-york-enacts-synthetic-performer-disclosure-law-for-advertisements-including-those-using-generative-ai
- ELVIS Act: https://www.hklaw.com/en/insights/publications/2024/04/first-of-its-kind-ai-law-addresses-deep-fakes-and-voice-clones
- Lowe v. SEC: https://supreme.justia.com/cases/federal/us/472/181/
- CAN-SPAM: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- COPPA: https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- Carta pre-seed (secondary summary): https://carta.com/data/state-of-pre-seed-q2-2026/ · https://www.finrofca.com/news/safe-valuation-caps-2026
- USPTO fees: https://www.uspto.gov/trademarks/fees-payment-information/summary-2025-trademark-fee-changes
- Supabase (approximate): https://www.nocode.mba/articles/supabase-pricing
- beehiiv: https://www.beehiiv.com/pricing · https://newsletter.supply/blog/how-does-beehiiv-boosts-work

---

## I. Open questions for the owner

1. **Is real money a must-have or a nice-to-have?** If the lawyer says the only route is a regulated exchange partner, and none signs, do you still want to run the free league as a business?
2. **Season calendar.** Season 1 start date and length: a quarter, 13 weeks? A calendar year? Playoffs? An off-season?
3. **League formats.** Weekly lock only, or also daily and head-to-head? Keeper or dynasty leagues?
4. **Traffic today.** Registered players, leagues, weekly active players, email list, video views.
5. **Time.** Hours per week, and the revenue at which you'd go full-time.
6. **Entity.** LLC now, or a Delaware C-corp?
7. **Legal budget.** The crux opinion is the most important spend. What's the cap?
8. **League Pass price.** About $39 per season per player and $49 per league, or different?
9. **Sponsors.** Which categories are off-limits (betting, crypto exchanges, brokerages, real estate given your brokerage)?
10. **Partner preference for Stage 3.** A regulated exchange (Kalshi, Polymarket US, Robinhood) or a fantasy/sportsbook operator, if one is ever possible?
11. **B2B.** Willing to white-label the league for a brokerage or fintech?
12. **The shorts.** Hype channel only, or a brand to license?
13. **Raising.** Wait for Season 1 numbers and the legal answer, or talk to angels sooner?
14. **Disclosure.** Any conflict to disclose from your real estate business when players draft people with NYC property deals?
15. **Season length.** Quarterly (13 weeks, proposed in A2), or something else?
16. **Snake or auction draft?** Snake is proposed for Season 1.
17. **Keepers:** yes or no, and how many (1–2 proposed)?
18. **Bigger leagues.** Grow leagues to 10–12 teams once the scoreable pool grows (e.g. 80 scoreable → 12 × 6)?
19. **Scoring for the lawyer.** Which scoring do you want the lawyer to review: today's price-based scoring, person-first (option B), or both?
20. **League types.** Which league types, and in what order?
