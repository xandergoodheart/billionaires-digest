# Game UI kit (`assets/game-ui.css`)

Shared components for the Billionaires Digest game pages (fantasy, and later leaderboard, leagues, markets).
Class prefix `g-`. Pure CSS, no libraries. First used by `fantasy.html`; page-only layout lives in
`assets/fantasy.css` (`fl-` prefix) so it never leaks into other pages.

Load order:

```html
<link rel="stylesheet" href="assets/site.css">
<link rel="stylesheet" href="assets/tools.css">   <!-- optional: tool-page helpers (.tnote, .tempty, .tdetails) -->
<link rel="stylesheet" href="assets/game-ui.css">
<link rel="stylesheet" href="assets/<page>.css">
```

## Brand rules

- Palette comes from the site theme tokens in `site.css` (`--bg --panel --line --line2 --text --soft --muted --accent --up --down`),
  so **paper** (light) and **terminal** (dark) both work without extra rules.
- **Gold** (`--g-gold` #E3A340) means *captain, winning, budget*. Use it as a fill with `--g-gold-ink` text, or as text with
  `--g-gold-text` (darker amber in paper for contrast).
- Up = `--up` (blue), down = `--down` (orange). Never red/green.
- Fonts: DM Serif Display for big numbers and display titles (`--g-font-display`), Newsreader for headings
  (`--g-font-head`), Inter for UI (`--g-font-ui`). Numbers use tabular figures (`.g-num`).
- Square-ish editorial corners (`--g-radius: 3px`); pills and chips are fully round.
- Touch targets are at least 44px (`--g-hit`). Every interactive element shows a 2px amber focus ring.
- No logos, names, colors or layouts copied from commercial fantasy apps.

## Tokens

| Token | Use |
|---|---|
| `--g-gold`, `--g-gold-ink`, `--g-gold-text` | captain / winning / budget |
| `--g-raise`, `--g-sunk` | raised card surface, sunken track or empty slot |
| `--g-scrim`, `--g-shadow` | modal backdrop and elevation |
| `--g-radius`, `--g-hit` | corner radius, minimum target size |
| `--g-font-display`, `--g-font-head`, `--g-font-ui` | type families |
| `--g-live` | LIVE pill color |

Utilities: `.g-sr` (visually hidden), `.g-num` (tabular), `.g-up` `.g-down` `.g-flat` `.g-gold` (text colors).

`.g-terminal` forces the dark palette inside an element in either theme (the showcase band: page header, scoreboards).

```html
<section class="g-terminal">…</section>
```

## Buttons and inputs

```html
<button type="button" class="g-btn">Secondary</button>
<button type="button" class="g-btn g-btn--primary">Save lineup</button>
<button type="button" class="g-btn g-btn--icon g-btn--add" aria-label="Add Jane Doe, salary 22">+</button>
<button type="button" class="g-btn g-btn--icon g-btn--remove" aria-label="Remove Jane Doe">–</button>
<button type="button" class="g-link">Text button (44px tall)</button>
<input class="g-input" type="search">
```

Disabled buttons need a visible reason: put it in a sibling and point `aria-describedby` at it
(see `g-row-player`).

## g-card

```html
<div class="g-card">
  <div class="g-card__head">
    <h2 class="g-card__title">My lineup</h2>
    <span class="g-card__kicker">Saved</span>
  </div>
  …
</div>
```

`g-card--flat` drops the raised surface.

## g-tabs

Three looks on one ARIA pattern (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, roving `tabindex`).
Wire Left/Right/Home/End in JS (see `wireTablist()` in `assets/fantasy.js`).

```html
<div class="g-tabs" role="tablist" aria-label="Fantasy league">
  <button class="g-tab" role="tab" id="tab-a" aria-controls="panel-a" aria-selected="true">Lineup</button>
  <button class="g-tab" role="tab" id="tab-b" aria-controls="panel-b" aria-selected="false" tabindex="-1">Matchup</button>
</div>
<section id="panel-a" role="tabpanel" aria-labelledby="tab-a">…</section>

<!-- "position" chips (sectors) -->
<div class="g-tabs g-tabs--chips" role="tablist" aria-label="Sector">
  <button class="g-tab" role="tab" aria-selected="true">All <span class="g-tab__n">50</span></button>
</div>

<!-- segmented day tabs, with a sub-line -->
<div class="g-tabs g-tabs--seg" role="tablist" aria-label="Day">
  <button class="g-tab" role="tab" aria-selected="true">Mon <small>+120</small></button>
</div>
```

## g-pill (status)

```html
<span class="g-pill g-pill--live"><span class="g-pill__dot"></span>Live</span>
<span class="g-pill g-pill--final"><span class="g-pill__dot"></span>Final</span>
<span class="g-pill g-pill--upcoming"><span class="g-pill__dot"></span>Upcoming</span>
```

The live dot pulses; under `prefers-reduced-motion: reduce` it is static.

## g-chip (record chips)

```html
<span class="g-chip g-chip--win">vs S&amp;P 500 <b class="g-num">3–1</b></span>
```

## g-badge

```html
<span class="g-badges">
  <span class="g-badge g-badge--hot" title="No. 2 on Thu Sep 24">Hot</span>
  <span class="g-badge g-badge--news">News 2</span>
  <span class="g-badge g-badge--buy">Insider buy</span>
  <span class="g-badge g-badge--sell">Insider sell</span>
</span>
<span class="g-badge g-badge--captain" title="Captain">C</span>
```

Only show a badge when the data behind it exists; never guess.

## g-stat

```html
<div class="g-stat g-stat--gold">
  <span class="g-stat__label">Projected points</span>
  <span class="g-stat__num">+312</span>
  <span class="g-stat__sub">Projection = recent average</span>
</div>
<!-- grid of stats with hairline dividers -->
<div class="g-stats">…several .g-stat…</div>
```

`g-stat--sm` for compact numbers.

## g-budget-bar

```html
<div class="g-budget-bar">            <!-- add g-budget-bar--over when over the cap -->
  <div class="g-budget-bar__row">
    <span class="g-budget-bar__left g-num">42<small>left</small></span>
    <span class="g-budget-bar__meta">58 of 100 used</span>
  </div>
  <div class="g-budget-bar__track" role="meter" aria-label="Budget used"
       aria-valuemin="0" aria-valuemax="100" aria-valuenow="58" aria-valuetext="58 of 100 used, 42 left">
    <span class="g-budget-bar__fill" style="width:58%"></span>
  </div>
  <span class="g-budget-bar__meta">Avg left per open slot: 14</span>
</div>
```

## g-table

Sticky header; sortable columns use a `button.g-sort` inside the `th`, and the `th` carries `aria-sort`
(`ascending`, `descending` or `none`). Add `g-table--cards` plus `data-label` on each cell to turn rows into stacked
cards below 700px.

```html
<div class="g-table-wrap">
  <table class="g-table g-table--cards">
    <caption>Finished weeks</caption>
    <thead><tr>
      <th scope="col">Week</th>
      <th scope="col" aria-sort="descending"><button class="g-sort" type="button">Points</button></th>
    </tr></thead>
    <tbody><tr>
      <th scope="row">Week of Sep 28</th>
      <td data-label="Points">+535</td>
    </tr></tbody>
  </table>
</div>
```

Note: a sticky header only sticks when no ancestor between it and the page scrolls horizontally, so drop
`.g-table-wrap` for long lists that should keep their header in view; offset `top` for any sticky bar above it.

## g-row-player

A table row (or any block) for one player: avatar + name + subline + stats + action.

```html
<tr class="g-row-player is-picked">
  <td><div class="g-rp__who">
    <!-- BD.avatar({ name, sector }, 40) -->
    <div class="g-rp__text">
      <button type="button" class="g-link g-rp__name" aria-haspopup="dialog">Jane Doe</button>
      <span class="g-rp__sub">#12 · Finance · ABC 60%, XYZ 40%</span>
      <span class="g-badges">…</span>
    </div>
  </div></td>
  <td data-label="Salary"><span class="g-rp__sal g-num">22</span></td>
  <td data-label="Avg"><span class="g-rp__pts g-num g-up">+48</span></td>
  <td><div class="g-rp__act">
    <button class="g-btn g-btn--icon g-btn--add" disabled aria-describedby="why-jane" aria-label="Add Jane Doe, salary 22">+</button>
    <span class="g-rp__why" id="why-jane">Over by 4</span>
  </div></td>
</tr>
```

`is-picked` adds the gold rail and tint.

## g-spark

Inline SVG, 72×24, drawn by JS (see `spark()` in `assets/fantasy.js`). Draw a dashed zero line, a path when there are
two or more points, and dots only when there are fewer. Mark it `aria-hidden="true"` and put the numbers in a `.g-sr`
sibling.

```html
<svg class="g-spark g-spark--up" viewBox="0 0 72 24" aria-hidden="true">
  <line class="g-spark__zero" x1="0" x2="72" y1="12" y2="12"/>
  <path d="M3 18 L20 10 L37 14 L54 6 L69 4"/>
  <circle class="up" cx="69" cy="4" r="2.5"/>
</svg>
<span class="g-sr">Recent days: Mon +12, Tue −4 …</span>
```

## g-drawer (dialog: side panel on desktop, bottom sheet at 700px and below)

```html
<div class="g-drawer" id="drawer" hidden>
  <div class="g-drawer__scrim" data-close></div>
  <div class="g-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawertitle" tabindex="-1">
    <div class="g-drawer__grip" aria-hidden="true"></div>
    <div class="g-drawer__head">
      <h2 class="g-drawer__title" id="drawertitle">Jane Doe</h2>
      <button type="button" class="g-btn g-btn--icon g-drawer__close" data-close aria-label="Close">×</button>
    </div>
    <div class="g-drawer__body">…</div>
    <div class="g-drawer__foot"><button class="g-btn g-btn--primary">Add to lineup</button></div>
  </div>
</div>
```

Behavior the page must supply (see the modal stack in `assets/fantasy.js`): remove `hidden`, add `g-lock` to `<html>`
(stops background scroll), move focus into the panel, trap Tab/Shift+Tab inside it, close on Esc and on the scrim,
then return focus to the element that opened it.

## g-bottombar (phone lineup bar)

```html
<div class="g-bottombar" id="bottombar">
  <button type="button" class="g-bottombar__sum" aria-controls="lineupcard" aria-expanded="false">
    <span class="g-bottombar__main">3/5 picked · 42 left</span>
    <span class="g-bottombar__sub">Projected +120 · Tap to view lineup</span>
  </button>
  <button type="button" class="g-btn g-btn--primary">Save</button>
</div>
```

Show it only on small screens, and pad the page so it never covers content (`.g-bottombar-pad` on a container,
or the page's own `body.has-bottombar` rule). Toasts move above it automatically when `body.has-bottombar` is set.

## g-matchup (scoreboard)

```html
<div class="g-matchup g-terminal">
  <div class="g-matchup__teams">
    <div class="g-matchup__side g-matchup__side--a is-winning">
      <span class="g-matchup__name">My team</span>
      <span class="g-matchup__score">+535</span>
    </div>
    <span class="g-matchup__vs">vs</span>
    <div class="g-matchup__side g-matchup__side--b">
      <span class="g-matchup__name">S&amp;P 500</span>
      <span class="g-matchup__score">−50</span>
    </div>
  </div>
  <div class="g-matchup__prob">
    <div class="g-matchup__probrow"><span>Win chance · My team 64%</span><span>S&amp;P 500 36%</span></div>
    <div class="g-matchup__bar" role="img" aria-label="Estimated win chance: my team 64 percent">
      <span class="a" style="width:64%"></span><span class="b" style="width:36%"></span>
    </div>
    <p class="g-matchup__note">Estimate, not a forecast.</p>
  </div>
</div>
```

Always label a win probability as an estimate. Add `g-matchup__result` pills when the contest is final.

## g-countdown

```html
<div class="g-countdown" aria-label="Lineup locks in 2 days 3 hours 4 minutes">
  <span class="g-countdown__label">Locks in</span>
  <span class="g-countdown__time"><b>2</b><small>d</small><b>3</b><small>h</small><b>4</b><small>m</small></span>
</div>
```

Update once a minute at most, never tick seconds, and do not put it in a live region.

## g-toast

One polite live region per page; append `.g-toast` children and remove them after about 4 seconds.

```html
<div class="g-toast-region" role="status" aria-live="polite"></div>
<!-- JS: region.appendChild(el('div', 'g-toast', 'Lineup saved.')) ; add g-toast--bad for errors -->
```

## g-empty

```html
<div class="g-empty">
  <h2 class="g-empty__title">Pick five to see your matchup</h2>
  <p>Choose five billionaires and a captain on the Lineup tab.</p>
  <button type="button" class="g-btn g-btn--primary">Build your lineup</button>
</div>
```

## Fields and messages

```html
<label class="g-label" for="coins">Coins to spend</label>
<div class="g-inline"><input class="g-input" id="coins" type="number"><button class="g-btn g-btn--primary">Buy</button></div>
<p class="g-hint">1 to 500 coins per trade.</p>
<p class="g-msg" role="status"></p>          <!-- hidden while empty; g-msg--bad for errors -->
```

Mark a bad value with `aria-invalid="true"` on the `.g-input` (orange border) and say why in a `.g-msg`.

## g-account (online account bar)

`assets/account.js` renders into `#gameaccount` on every multiplayer page (and inside the fantasy page's
"Play online" card): "coming soon", the "Play online" guest sign-in, the nickname picker, then
"Online as *nick* · *coins*" with the weekly top-up. Needs `assets/common.js` and `assets/game-client.js` first.

```html
<div id="gameaccount" class="g-account"><p class="g-msg">Loading the online game…</p></div>
<!-- playing: -->
<div class="g-account__row">
  <div class="g-account__text"><span class="g-chip g-chip--coins">Online as <b>jane</b> · <b class="g-num">1,250</b> coins</span></div>
  <div class="g-account__acts"><button class="g-btn g-btn--primary">Claim 250 weekly coins</button><button class="g-link">Change nickname</button></div>
</div>
```

`BD.game.ready` (from `assets/game-client.js`) is a `Promise<boolean>`: true only when `config/supabase.json` is
enabled and the backend answers the public `current_week` function. Show online-only UI only when it is true.

## Motion

All transitions and animations (live pulse, drawer slide, sheet rise, toast, bars) switch off under
`prefers-reduced-motion: reduce`. Do not add animated number counters.
