<!-- Research report, 2026-09-27 (written for the play-money game; the money rule later changed — see CLAUDE.md). Items marked unverified come from single sources. -->

# Gamified "win things" sites: what drives them, and what Billionaires Digest should borrow

## A. Summary

Sites like PackDraw, HypeDrop and CS2 case openers are exciting because of one repeated loop: a short wait, a spinning reveal, a result that is color-coded by rarity, a burst of sound and light, and a live feed of other people's big wins. That loop runs on well-studied psychology: rewards that come at unpredictable times, near misses, loss aversion and social proof. With real money in the loop, the same tools cause harm, which is why regulators keep acting. Belgium's 2018 ban on paid loot boxes, the FTC's $245M Epic Games order, its $20M Genshin Impact order and Massachusetts' $7.5M Robinhood "gamification" settlement are all examples. BD can use nearly all of the fun parts (the reveal, the anticipation, rarity tiers, streaks, levels, leagues) because its outcomes come from real market data and nothing can be bought or cashed out. The rule to hold to: **the drama can be staged, but the numbers must be real.** No fake near misses, no fake winner feeds, no false countdowns, nothing to buy. One risk remains even with play money. Studies link free "social casino" games to young people moving on to real gambling, so BD should not aim at minors and should keep casino-style framing light.

## B. Mechanics catalogue

| Mechanic | Psychology behind it | Who does it | Fit for BD | Why |
|---|---|---|---|---|
| Spin or reel reveal | Anticipation before the payoff; rewards at unpredictable times keep people coming back most strongly (Ferster & Skinner) | PackDraw, HypeDrop, CS2 cases, slots | **Use** | Perfect for showing a real weekly score or a Lucky five result. The result must be settled before the spin starts. |
| Rarity tiers and colors | Scarcity, status, easy to read at a glance | Sorare (Limited/Rare/Super Rare/Unique), Top Shot (Common to Ultimate), CS2 | **Adapt** | Base tiers on real cap cost or real results, never on pull odds. |
| Near miss ("so close!") | Near misses feel bad but raise the urge to play again, and light up the brain's win circuits (Clark et al. 2009) | Slot machines | **Adapt** (true ones only) | Showing that "you missed 1st by 0.4 pts" is honest. Faking a near miss is a red line. |
| Live feed of others' wins | Social proof; makes big wins look common | PackDraw, HypeDrop, case sites | **Adapt** | Only real league and leaderboard events, labeled clearly. |
| Streaks + streak freeze | Loss aversion (losses weigh about twice as much as gains); some slack keeps people motivated | Duolingo | **Use** | Duolingo says letting players hold two freezes raised daily active learners by 0.38%. |
| XP / levels / free rewards at levels | Goal-gradient effect (people speed up near a goal); endowed progress | Duolingo, PackDraw (free packs at levels 2, 10, 20...) | **Use** | Levels can come only from real play. Rewards are cosmetic only. |
| Leagues with promotion and relegation | Status, competition | Duolingo (says leagues raised lesson completion; third-party figure +25%, unverified) | **Use** | Fits private leagues and the weekly leaderboard. |
| Head-start progress bar | Endowed progress: a car-wash card with 2 free stamps was finished 34% of the time vs 19% without (Nunes & Drèze 2006) | Loyalty cards, onboarding | **Use** | Give a free first badge step just for making a team. |
| Social chat everywhere | Belonging, banter | Sleeper (chat built into almost every screen) | **Adapt** | League banter is good. Moderating it has a cost. |
| Pick'em "more or less" | Simple choices with a quick result | PrizePicks, Underdog | **Adapt** | Play-money props already exist in The Book. Keep them play-money. |
| Collections / sets | Wanting to complete a set | Sorare, Top Shot, sticker albums | **Use** | Badges earned from real events. Never sell cards. |
| Confetti on milestones | Instant reward | Robinhood (removed in 2021 under regulator pressure) | **Adapt** | Fine for game milestones. Never celebrate trading in real stocks. |
| Scratch-to-reveal a reward | Lottery-ticket feel | Robinhood free stock (cited by Massachusetts) | **Adapt** | OK for revealing a real score. Not for anything of value. |
| Battles, bots and odds | Head-to-head tension | PackDraw battles; one review says bots win ties | **Adapt / Avoid bots** | Real head-to-head matchups yes. Hidden bots or tilted outcomes no. |
| Paid packs, rakeback, prizes, cash-out | Money-driven chasing of losses | PackDraw, HypeDrop, case sites | **Avoid** | Owner rules plus gambling law. |
| Queues and "only X left" | Scarcity, fear of missing out | Top Shot drops, e-commerce | **Avoid** unless true | The FTC treats false scarcity and fake timers as dark patterns. |

## C. What makes a PackDraw-style reveal exciting, and where it turns manipulative

**The parts that create excitement:**
1. **Anticipation.** You press the button, the reel speeds up, then slows. The wait itself is part of the reward. On PackDraw, the result is recorded on a blockchain before the animation plays, so the spin is pure theater around an outcome that is already decided.
2. **The reel.** A strip of items with a pointer. The final slowdown drifts past top-tier items. Reviewers describe PackDraw's booster-style "rip" animations as feeling like opening a real pack, "not a spreadsheet."
3. **Rarity tiers.** Colors (grey → blue → purple → gold, or Sorare's yellow/red/blue/purple) tell you instantly how good the result is.
4. **Payoff.** A flash, sound, particles and a "big win" banner. Common results get a small effect, rare ones a large one.
5. **Social proof.** A ticker of other users' wins makes rare hits look normal and close at hand.
6. **Near misses.** The reel stops one slot from the jackpot. Research shows this raises the urge to spin again.
7. **Progress hooks.** Levels, free packs at level milestones, races and raffles.

**Where it becomes manipulative when money is involved:**
- **Near misses built on purpose.** The reel is steered so it looks like you almost won. This deliberately exploits the "almost won" feeling. The research links near misses to more persistent play.
- **Win feeds that only show winners, or are fake.** Win rates look far better than they are.
- **Currency layers that hide cost.** Money becomes coins becomes gems. The FTC cited HoYoverse for confusing exchange rates and for misstating its odds.
- **Sell-back loops.** Winnings flow back into the balance so people keep spinning. Reviews put HypeDrop's sell-back at roughly 74% of item value; that figure is from a third-party review and unverified.
- **Bots in battles** that can tilt results. One review reports this on PackDraw; unverified beyond that review.
- **Reaching minors.** One review site reports two active lawsuits against PackDraw, including a New York case about recruiting minors into crypto gambling. That is a single source; I did not check the court records.

**Takeaway for BD:** points 1–5 are presentation and can be honest. Point 6 is honest only when the near miss really happened. Point 7 is fine only when the rewards are cosmetic.

## D. Recommended BD features (all built on real data)

1. **Monday Lock-in Spin** (S). When a round locks at 9:30 AM ET, the player's 5 picks spin into place like reels, and the captain lands last with a gold 1.5x frame. *Psychology:* anticipation and commitment. *Data:* the saved lineup. Nothing random.

2. **Friday Score Reveal** (M). After Friday's close, a "Reveal my week" button counts up each player's real points one reel at a time, captain last. It ends with the real league rank and a "vs last week" line. *Psychology:* reveal anticipation, the size of the payoff scaled to the real result. *Data:* fantasy points from data/prices. The number is fixed before the animation starts.

3. **Rarity tiers by cap cost** (S). Players are labeled Common / Rare / Epic / Legendary based on their real cap cost, with a colored card frame. A separate "Hot" tag goes to anyone in the real top 10% of points that week. *Psychology:* status and an instantly readable result. *Data:* cap costs and weekly points. The rules for each tier are published.

4. **Streaks + streak freeze** (M). A "weeks in a row with a team set" streak. Players get one freeze free at the start, and can earn more through play (for example, one per 4-week streak). Never sold. *Psychology:* loss aversion, softened by slack (Duolingo's experience). *Data:* entries in the Supabase fantasy tables.

5. **XP and levels** (M). XP for setting a team, checking in, beating your league average and settling Book bets. Levels unlock cosmetic card frames and profile titles only. Start everyone at a small bar that is already partly filled. *Psychology:* goal gradient and endowed progress. *Data:* real game events.

6. **Badge sets / collections** (M). Examples: "Captain Hit" (your captain was the week's top scorer), "Diamond Hands" (4 weeks with the same team), "Full House" (you have used every Legendary player at least once), "Underdog" (you won with a lineup under 80 cap). Shown as an album with empty slots. *Psychology:* the urge to complete a set. *Data:* past lineups and points.

7. **Live "Real Wins" feed** (M). A ticker showing only real events. Examples: "@alex's captain Huang +6.2 pts today", "League 'Office' has a new leader", "Book: 3 of 212 players hit the Tuesday long shot." Label it "Real results · play money." Show losses too, or show counts ("3 of 212"). That keeps the numbers accurate without selecting only winners. *Psychology:* social proof, kept honest. *Data:* leaderboards, fantasy points, Book settlements.

8. **Daily check-in** (S). One tap per market day shows "Your team today: +2.3 pts", worked out from that day's real price moves. It adds to XP and the streak. No random bonus amounts. *Psychology:* a daily habit loop; the variety comes from the market itself. *Data:* daily price data per holding.

9. **Head-to-head reveal** (M). Within a league matchup, both teams' 5 players reveal side by side, one pair at a time, with a tug-of-war bar. It ends with "Won by 1.8 pts." A true close result can say "closest match this week." *Psychology:* tension, and honest near misses. *Data:* real points for both lineups.

10. **Lucky five variants** (S–M). "Lucky five: Budget" (under 80 cap), "All Legendary" (as far as the cap allows), "Sector spin" (all tech, and so on), and "Respin" free and unlimited. After the spin, show a simple "how this team did last week" backtest, clearly labeled as past data. *Psychology:* spinning is fun in itself and it lowers the effort of picking a team. *Data:* the player list and cap costs; the backtest uses last week's real points.

11. **Season pass track with no payment** (M). A 12-week track of real milestones, each unlocking a cosmetic item. It resets each season. *Psychology:* goal gradient. *Data:* game events. It must never have a paid tier.

12. **Weekly Recap card** (S). A shareable image: best pick, worst pick, rank change, streak count. *Psychology:* status and word of mouth. *Data:* the week's real results. Needs an owner check before anything new goes outward.

## E. Red lines (do not copy)

| Don't | Reason |
|---|---|
| **Fake near misses** (steering the reel to stop next to the jackpot) | The research ties them to more persistent play. Deceptive. Breaks "never invent numbers." |
| **Fake or winners-only feeds, bots shown as people** | Deceptive social proof. The FTC treats misleading design as a dark pattern. Breaks owner rules. |
| **Random point bonuses or multipliers not tied to real data** | Invents scores. Turns a skill-plus-market game into a lottery. |
| **Anything purchasable** (packs, rerolls, streak freezes, XP boosts, extra entries, currency) | Once there is payment plus chance plus a prize, the three elements of gambling are in play (US sweepstakes law; Belgium's ban on paid loot boxes; the Netherlands' EA fine, which was later overturned). Owner rule: no purchases. |
| **Pay-to-reroll or pay-to-unlock the Lucky five** | Same reason. It also starts the pattern of chasing losses. |
| **Prizes of real value, cash-out, trading or selling items, sweepstakes** | Owner rule. Crosses into gambling or sweepstakes law. Several states banned sweepstakes casinos in 2025 (Montana, Connecticut, New Jersey, New York, California). |
| **Countdowns or scarcity that aren't true** ("Only 2 spots left!") | The FTC's 2022 dark patterns report names baseless countdown timers and false scarcity. The real 9:30 AM Monday lock countdown is fine. |
| **Confetti or rewards for real-world trading, or prompts to buy stocks** | This is what Massachusetts cited Robinhood for ($7.5M settlement, confetti removed). Keep "not financial advice" visible. |
| **Marketing to minors, meme-driven youth campaigns, no age statement** | Social casino play predicts later real gambling in young people. The FTC went after COPPA violations and loot boxes for under-16s (HoYoverse $20M, Epic $275M on privacy). Recommend a 13+ minimum or 18+ for The Book, plus a plain notice. |
| **Currency layers that hide how things work, hidden odds** | The FTC's HoYoverse order required odds disclosure. If any randomness exists (Lucky five), publish how it works. |
| **Confusing buttons that trigger actions unintentionally, guilt-trip messages** | Epic's $245M order was about design that led to accidental purchases. Keep actions explicit, and keep streak messages kind rather than shaming. |
| **Loud casino language** ("jackpot", "bet big", "you're due") | Social casino research suggests it normalizes gambling. Use fun, sporty wording. Reels are fine; saying a win is "due" is not. |

**Uncertain points:** the Duolingo retention figures other than the official +0.38% come from third-party blogs. The PackDraw lawsuits, bots winning ties and HypeDrop's sell-back rate come from single review sites. Loot box and sweepstakes law changes fast; if BD ever adds anything of real value, get legal advice first.

## F. Sources

**Mystery box / case opening**
- BetterChecked PackDraw review: https://www.betterchecked.com/review/packdraw-test-review
- Tech Insider PackDraw review: https://tech-insider.org/packdraw-review/
- PackDraw overview (packdraw.it.com): https://packdraw.it.com/
- Tech Insider HypeDrop review: https://tech-insider.org/mystery-boxes/platforms/hypedrop-review/
- Valve bans skin-gambling sponsors (Dec 2025): https://esports-news.co.uk/2025/12/11/valve-ban-skin-gambling-case-sites-for-cs2-tournaments/
- Skin gambling (Wikipedia): https://en.wikipedia.org/wiki/Skin_gambling

**Fantasy / pick'em / prediction markets**
- Sleeper review: https://www.saturdaydownsouth.com/dfs/sleeper-fantasy/review/
- How Underdog works: https://www.lines.com/guides/how-does-underdog-fantasy-work/1603
- Florida cease-and-desist letters to PrizePicks, Underdog and Betr: https://www.legalsportsreport.com/167182/dfs-fantasy-sports-operators-to-pull-out-of-florida-under-regulatory-pressure/
- Illinois targets PrizePicks: https://chicago.suntimes.com/the-watchdogs/2025/03/14/illinois-gambling-regulators-target-prizepicks-renewing-daily-fantasy-sports-debate
- Gamification and memes aimed at young people (Kalshi/Polymarket): https://www.pressdemocrat.com/2026/05/28/gamification-memes-sports-betting-prediction-markets/

**Collectibles**
- Sorare scarcity levels: https://help.sorare.com/hc/en-us/articles/4406429217053-Understanding-Sorare-Cards-Pro-Set-and-Scarcity-Levels
- NBA Top Shot Moment tiers: https://support.nbatopshot.com/hc/en-us/articles/4404373783827-Moment-Tiers
- Top Shot pack drops and queue: https://support.nbatopshot.com/hc/en-us/articles/4404231425939-Pack-Drops-and-the-Queue

**Engagement**
- Duolingo, "Improving the streak": https://blog.duolingo.com/improving-the-streak
- Duolingo, how the streak builds habit: https://blog.duolingo.com/how-duolingo-streak-builds-habit
- Deconstructor of Fun on Duolingo: https://www.deconstructoroffun.com/blog/2025/4/14/duolingo-how-the-15b-app-uses-gaming-principles-to-supercharge-dau-growth
- CNBC, Robinhood drops confetti: https://www.cnbc.com/2021/03/31/robinhood-gets-rid-of-confetti-feature-amid-scrutiny-over-gamification.html
- Robinhood $7.5M Massachusetts settlement: https://finance.yahoo.com/news/robinhood-settles-massachusetts-gamification-case-165454008.html

**Psychology research**
- Clark et al. 2009, near misses (Neuron): https://www.sciencedirect.com/science/article/pii/S0896627309000373
- Near miss and gambling severity: https://pubmed.ncbi.nlm.nih.gov/20445043/
- Reward schedules (Ferster & Skinner): https://www.simplypsychology.org/schedules-of-reinforcement.html
- Kahneman & Tversky 1979, prospect theory: https://www.econometricsociety.org/publications/econometrica/1979/03/01/prospect-theory-analysis-decision-under-risk
- Kivetz, Urminsky & Zheng 2006, goal gradient: https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf
- Endowed progress (Nunes & Drèze 2006): https://www.coglode.com/nuggets/endowed-progress-effect
- Zendle & Cairns 2018, loot boxes and problem gambling: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0206767
- Social casino → gambling migration: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5569650/ and https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4651986/

**Regulation**
- Belgium's loot box ban and how well it is enforced (Collabra): https://online.ucpress.edu/collabra/article/9/1/57641/195100/Breaking-Ban-Belgium-s-Ineffective-Gambling-Law
- Loot box laws by country: https://screenrant.com/lootbox-gambling-microtransactions-illegal-japan-china-belgium-netherlands/
- UK Gambling Commission position (loot boxes, social casino): https://committees.parliament.uk/writtenevidence/98554/pdf/
- UK ASA on loot box advertising: https://www.asa.org.uk/news/thinking-outside-of-the-loot-box.html
- Sweepstakes law basics: https://kleinmoynihan.com/what-constitutes-a-legal-sweepstakes/
- State crackdown on sweepstakes casinos (Venable, 2026): https://www.venable.com/insights/publications/2026/05/states-escalate-crackdown-on-sweepstakes-casinos
- FTC, "Bringing Dark Patterns to Light" (2022): https://www.ftc.gov/reports/bringing-dark-patterns-light
- FTC, Epic Games $245M order: https://www.ftc.gov/news-events/news/press-releases/2023/03/ftc-finalizes-order-requiring-fortnite-maker-epic-games-pay-245-million-tricking-users-making
- FTC, Genshin Impact / HoYoverse $20M order: https://www.ftc.gov/news-events/news/press-releases/2025/01/genshin-impact-game-developer-will-be-banned-selling-lootboxes-teens-under-16-without-parental