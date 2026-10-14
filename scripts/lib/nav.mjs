// Single source of truth for the site navigation and footer.
// Top-level .html pages get this markup via scripts/sync-nav.mjs (relative links);
// generated pages (scripts/lib/pages/layout.mjs) render it with absolute links.

import { readFileSync } from 'node:fs';

// Launch switch: config/launch.json { "gate": true|false }. While gated (waitlist before Season 1), the v2 chrome
// sends Play to the waitlist landing (index.html), hides every Play sub-tab except Rules, and hides the Tools section.
// Un-gate: set "gate": false in config/launch.json, run `node scripts/sync-nav.mjs` (and build-pages for generated pages).
// A missing or broken file counts as not gated (fail open), the same as assets/launch.js in the browser.
export function readGated(file = new URL('../../config/launch.json', import.meta.url)) {
  try { return JSON.parse(readFileSync(file, 'utf8')).gate === true; } catch { return false; }
}
export const GATED = readGated();
const GATED_HIDDEN_SECTIONS = ['tools'];
const GATED_PLAY_ITEMS = ['rules'];

// Owner decision 2026-10-04: these pages stay online and reachable by URL, but are left out of every v2 menu
// (sub-tabs, phone MENU sheet). While The Book is hidden, the odds ticker (assets/v2/ticker.js, built from The Book)
// is hidden too. To bring one back, remove its key here and run `node scripts/sync-nav.mjs` (+ build-pages).
export const MENU_HIDDEN = ['book', 'moves', 'copycat', 'network', 'property'];
export const BOOK_HIDDEN = MENU_HIDDEN.includes('book');

// key: used for aria-current. href: relative to the site root, no leading slash.
export const NAV = [
  { key: 'today', label: 'Today', href: 'news.html' },
  { key: 'people', label: 'People', href: 'people/' },
  { key: 'companies', label: 'Companies', href: 'companies/' },
  { key: 'sectors', label: 'Sectors', href: 'sectors.html' },
  { key: 'calendar', label: 'Calendar', href: 'calendar.html' },
  { key: 'game', label: 'Fantasy', items: [
    { key: 'fantasy', label: 'My team', href: 'team.html' },
    { key: 'draft', label: 'Draft room', href: 'draft.html' },
    { key: 'scores', label: 'Scores', href: 'scores.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'scores.html#leaderboard' },
    { key: 'leagues', label: 'Leagues', href: 'leagues.html' },
    { key: 'book', label: 'The Book', href: 'book.html' },
    { key: 'playterms', label: 'Game rules', href: 'play-terms.html' }
  ] },
  { key: 'tools', label: 'Tools', items: [
    { key: 'flows', label: 'Insider flows & leaderboards', href: 'flows.html' },
    { key: 'quarterly', label: 'What their funds bought', href: 'quarterly.html' },
    { key: 'copycat', label: 'Copycat portfolio', href: 'copycat.html' },
    { key: 'network', label: 'Who invests with whom', href: 'network.html' },
    { key: 'compare', label: 'Compare two billionaires', href: 'compare.html' },
    { key: 'property', label: 'Where they buy', href: 'property.html' },
    { key: 'filings101', label: 'Filings 101', href: 'guides/filings-101/' }
  ] },
  { key: 'archive', label: 'Archive', href: 'archive.html' },
  { key: 'about', label: 'About', href: 'about.html' }
];

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function url(href, absolute) {
  if (!absolute) return href;
  return href === 'index.html' ? '/' : '/' + href;
}
const cur = on => on ? ' aria-current="page"' : '';

// activeKey: one of the NAV keys (or a tools item key); absolute: true for generated pages
export function renderNav(activeKey, { absolute = false } = {}) {
  const parts = [];
  for (const n of NAV) {
    if (n.items) {
      const inMenu = n.items.some(i => i.key === activeKey);
      parts.push(`  <details class="navmore"><summary${cur(inMenu)}>${escHtml(n.label)}</summary><ul>\n` +
        n.items.map(i => `    <li><a href="${escHtml(url(i.href, absolute))}"${cur(i.key === activeKey)}>${escHtml(i.label)}</a></li>`).join('\n') +
        `\n  </ul></details>`);
    } else {
      parts.push(`  <a href="${escHtml(url(n.href, absolute))}"${cur(n.key === activeKey)}>${escHtml(n.label)}</a>`);
    }
  }
  return `<nav class="sitenav" aria-label="Site"><div class="wrap">\n${parts.join('\n')}\n</div></nav>`;
}

export function renderFooter({ absolute = false } = {}) {
  const u = h => escHtml(url(h, absolute));
  return `<footer><div class="wrap">
  <span>Billionaires Digest · billionairesdigest.com</span>
  <span class="footlinks"><a href="${u('about.html')}">About</a> · <a href="${u('about.html')}#corrections">Corrections</a> · <a href="${u('about.html')}#sponsor">Sponsor the brief</a> · <a href="${u('calendar.ics')}">Calendar feed (calendar.ics)</a></span>
  <span>For information only · not financial advice</span>
</div></footer>`;
}

// Progressive enhancement for the nav menus (Fantasy, Tools): close on Escape (focus back to summary) and on outside
// click, one open at a time. On phones the nav is one swipeable row: scroll the active item into view and show
// fade hints at the edges that can still scroll. Phones (iOS Safari) do not reliably paint a list inside the
// scrolling row or inside <details>, so on phones the open menu is copied into one body-level panel (#navpanel)
// under the nav; outside click, Escape, page scroll or resize close it. ES5, no globals. Same code lives in
// assets/common.js for the top-level pages.
export const NAV_JS = `(function(){var d=document.querySelectorAll('details.navmore'),nav=document.querySelector('.sitenav');var mq=window.matchMedia?window.matchMedia('(max-width: 699.98px)'):null,panel=null,cur=null,y0=0;function closeAll(ex){for(var i=0;i<d.length;i++)if(d[i]!==ex)d[i].removeAttribute('open');}function hidePanel(){if(panel){panel.hidden=true;while(panel.firstChild)panel.removeChild(panel.firstChild);}var s=cur&&cur.querySelector('summary');if(s){s.removeAttribute('aria-expanded');s.removeAttribute('aria-controls');}cur=null;}function closeCur(){var el=cur;hidePanel();if(el)el.removeAttribute('open');}function showPanel(el){var ul=el.querySelector('ul'),s=el.querySelector('summary');hidePanel();if(!ul)return;if(!panel){panel=document.createElement('div');panel.className='navpanel';panel.id='navpanel';panel.setAttribute('role','region');panel.hidden=true;document.body.appendChild(panel);}panel.setAttribute('aria-label',(s?s.textContent.replace(/\\s+/g,' ').replace(/^ | $/g,''):'Site')+' menu');panel.appendChild(ul.cloneNode(true));panel.style.top=Math.round(nav?nav.getBoundingClientRect().bottom:0)+'px';panel.hidden=false;cur=el;y0=window.pageYOffset||0;if(s){s.setAttribute('aria-expanded','true');s.setAttribute('aria-controls','navpanel');}}function onScroll(){if(cur&&Math.abs((window.pageYOffset||0)-y0)>2)closeCur();}function onResize(){if(cur)closeCur();}if(d.length){document.documentElement.className+=' js-navpanel';document.addEventListener('click',function(e){var t=e.target;if(panel&&panel.contains(t))return;if(cur&&!cur.contains(t))closeCur();for(var i=0;i<d.length;i++)if(d[i].hasAttribute('open')&&!d[i].contains(t))d[i].removeAttribute('open');});document.addEventListener('keydown',function(e){if(e.key!=='Escape'&&e.key!=='Esc')return;for(var i=0;i<d.length;i++)if(d[i].hasAttribute('open')){d[i].removeAttribute('open');var s=d[i].querySelector('summary');if(s)s.focus();}hidePanel();});for(var j=0;j<d.length;j++)d[j].addEventListener('toggle',function(){if(this.open){closeAll(this);if(mq&&mq.matches)showPanel(this);}else if(this===cur)hidePanel();});window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onResize);}var row=nav&&nav.querySelector('.wrap');if(!row)return;function fades(){var max=row.scrollWidth-row.clientWidth;nav.classList.toggle('is-scrolled',row.scrollLeft>2);nav.classList.toggle('is-end',row.scrollLeft>=max-2);}var c=row.querySelector('.wrap>a[aria-current="page"],summary[aria-current="page"]');if(c&&row.scrollWidth>row.clientWidth){var x=c.getBoundingClientRect().left-row.getBoundingClientRect().left+row.scrollLeft;if(x+c.offsetWidth>row.clientWidth-32)row.scrollLeft=Math.max(0,x-(row.clientWidth-c.offsetWidth)/2);}fades();row.addEventListener('scroll',fades,{passive:true});window.addEventListener('resize',fades);})();`;

// ---------------------------------------------------------------------------------------------------------------
// v2 chrome (branch v2): slim sticky blurred top bar with BD wordmark, pill sub-tabs per section, phone MENU sheet, phone bottom tabs
// and the v2 footer. Pages opt in with <!-- v2topbar:start --> / <!-- v2tabs:start --> / <!-- v2footer:start -->
// markers (scripts/sync-nav.mjs). Behavior of the MENU sheet lives in assets/v2/chrome.js. v1 NAV above is unchanged.

// Top-level sections (Phase 3). The leaderboard lives in Scores, so there is no separate Rankings section.
// Play's front page is the home page (index.html, "/" on generated pages): the preseason Play home with the
// "Save your team" email box. play.html only redirects there. The daily edition lives at news.html.
export const NAV_V2 = [
  { key: 'play', label: 'Play', href: 'index.html' },
  { key: 'learn', label: 'Learn', href: 'academy.html' },
  { key: 'players', label: 'Players', href: 'players.html' },
  { key: 'news', label: 'News', href: 'news.html' },
  { key: 'tools', label: 'Tools', href: 'flows.html' }
];

// Sub-tabs per section, with the small right-side label. Players has no sub-tabs.
export const SUBNAV_V2 = {
  play: {
    label: 'Billionaire Fantasy League',
    items: [
      { key: 'team', label: 'My team', href: 'team.html' },
      { key: 'draft', label: 'Draft room', href: 'draft.html' },
      { key: 'scores', label: 'Scores', href: 'scores.html' },
      { key: 'leagues', label: 'Leagues', href: 'leagues.html' },
      { key: 'book', label: 'The Book', href: 'book.html' },
      { key: 'moves', label: 'Next Moves', href: 'moves.html' },
      { key: 'rules', label: 'Rules', href: 'play-terms.html' }
    ]
  },
  learn: {
    label: 'Billionaires Digest Academy',
    items: [
      { key: 'academy', label: 'Academy', href: 'academy.html' },
      { key: 'hub', label: 'Billionaire Life', href: 'life.html' }
    ]
  },
  news: {
    label: 'The Digest',
    items: [
      { key: 'today', label: 'Today', href: 'news.html' },
      { key: 'people', label: 'People', href: 'people/' },
      { key: 'companies', label: 'Companies', href: 'companies/' },
      { key: 'sectors', label: 'Sectors', href: 'sectors.html' },
      { key: 'calendar', label: 'Calendar', href: 'calendar.html' },
      { key: 'archive', label: 'Archive', href: 'archive.html' }
    ]
  },
  tools: {
    label: 'Tools',
    items: [
      { key: 'flows', label: 'Insider flows', href: 'flows.html' },
      { key: 'quarterly', label: 'What their funds bought', href: 'quarterly.html' },
      { key: 'copycat', label: 'Copycat portfolio', href: 'copycat.html' },
      { key: 'network', label: 'Who invests with whom', href: 'network.html' },
      { key: 'compare', label: 'Compare two', href: 'compare.html' },
      { key: 'property', label: 'Where they buy', href: 'property.html' },
      { key: 'filings101', label: 'Filings 101', href: 'guides/filings-101/' }
    ]
  }
};

// Phone bottom tab bar (four sections). Tools is reachable from the phone MENU sheet (it lists every NAV_V2 section).
export const BOTTOM_V2 = ['play', 'learn', 'players', 'news'];

// The sections and sub-tabs actually shown, after the launch switch and MENU_HIDDEN.
export function navV2({ gated = GATED } = {}) {
  if (!gated) return NAV_V2;
  return NAV_V2.filter(n => !GATED_HIDDEN_SECTIONS.includes(n.key));
}
export function subnavV2(key, { gated = GATED } = {}) {
  let s = key && SUBNAV_V2[key] ? SUBNAV_V2[key] : null;
  if (!s) return s;
  s = { ...s, items: s.items.filter(i => !MENU_HIDDEN.includes(i.key)) };
  if (!gated) return s;
  if (GATED_HIDDEN_SECTIONS.includes(key)) return null;
  if (key === 'play') return { ...s, items: s.items.filter(i => GATED_PLAY_ITEMS.includes(i.key)) };
  return s;
}
// The odds ticker is built from The Book: none while gated or while The Book is hidden from the menus.
const showTicker = gated => !gated && !BOOK_HIDDEN;
const topItem = (key, gated) => navV2({ gated }).find(n => n.key === key) || null;

// Icons for the top-bar actions (original line drawings; no brand icons).
const ICON = {
  team: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>'
};

// Accounts (assets/v2/auth.js). Everything here ships hidden; assets/v2/chrome.js shows it only when
// config/supabase.json turns on "authGoogle" or "authPassword":
//   data-auth-guest  shown to visitors without a real account (nobody signed in, or a guest/anonymous session)
//   data-auth-user   shown to a signed-in real account (email or Google)
//   data-auth-open   opens the "Create free account / Log in" dialog ("signup" or "login")
// Top bar: a "Create free account" text button left of My team (desktop), or a round initials button with a small
// menu (nickname, My team, Leagues, Account, Log out). Phone MENU sheet: the same choices as list rows.
// Not rendered while GATED (the game is closed; the top bar shows only "Join the waitlist").
function accountTop(u) {
  return `
      <button type="button" class="v2-top__join" data-auth-guest data-auth-open="signup" hidden>Create free account</button>
      <div class="v2-acct" data-auth-user hidden>
        <button type="button" class="v2-acct__btn" aria-expanded="false" aria-controls="v2-acct-menu"><span class="v2-acct__av" data-auth-initials aria-hidden="true"></span><span class="v2-sr">Your account</span></button>
        <div class="v2-acct__menu" id="v2-acct-menu" hidden>
          <p class="v2-acct__who"><strong data-auth-nick></strong><span data-auth-email></span></p>
          <ul class="v2-acct__list">
            <li><a href="${u('team.html')}">My team</a></li>
            <li><a href="${u('leagues.html')}">Leagues</a></li>
            <li><a href="${u('account.html')}">Account</a></li>
            <li><button type="button" data-auth-logout>Log out</button></li>
          </ul>
        </div>
      </div>`;
}
function accountMenu(u) {
  return `      <li class="v2-menu__acct" data-auth-guest hidden><button type="button" class="v2-menu__top v2-menu__btn" data-auth-open="signup">Create free account</button><button type="button" class="v2-menu__btn v2-menu__btn--sub" data-auth-open="login">Log in</button></li>
      <li class="v2-menu__acct" data-auth-user hidden><a class="v2-menu__top" href="${u('account.html')}">Account</a><button type="button" class="v2-menu__btn v2-menu__btn--sub" data-auth-logout>Log out</button></li>`;
}

// Top bar + sub-tabs + phone MENU sheet. topKey: NAV_V2 key (or null); subKey: sub-tab key of that section (or null).
// One sticky, blurred header (<header class="v2-top">) holds the top row and, directly under it, the section's pill
// sub-tabs (<nav class="v2-subtabs">), so both share one surface and one hairline at the bottom. The phone MENU sheet
// stays outside the header (a blurred, sticky parent would trap the fixed sheet inside it).
// Active section: aria-current="true"; active sub-tab (the page itself): aria-current="page".
// Right side: a round search icon button (aria-label "Search") and one round "My team" button. Draft lives in the
// Play sub-tabs, so the top bar has no separate Draft link.
// The scores ticker is an empty, hidden container here; assets/v2/ticker.js (loaded by renderFooterV2) fills it
// from real data and shows it, or leaves it hidden when the data is missing.
// While GATED: no ticker container (no odds anywhere), and My team becomes one "Join the waitlist" button.
// No ticker either while The Book is hidden from the menus (BOOK_HIDDEN).
export function renderTopbarV2(topKey, subKey, { absolute = false, gated = GATED } = {}) {
  const u = h => escHtml(url(h, absolute));
  const sec = cur2 => cur2 ? ' aria-current="true"' : '';
  const sections = navV2({ gated });
  if (topKey && !topItem(topKey, gated)) topKey = null;   // section hidden by the launch switch
  const sub = subnavV2(topKey, { gated });
  const top = sections.map(n => `      <a href="${u(n.href)}"${sec(n.key === topKey)}>${escHtml(n.label)}</a>`).join('\n');
  const mark = `<a class="v2-mark" href="${u('index.html')}"><span class="v2-mark__bd" aria-hidden="true">BD</span><span class="v2-mark__name">Billionaires Digest</span></a>`;
  const ticker = showTicker(gated) ? '\n<div class="v2-ticker" data-ticker hidden></div>' : '';
  const search = `      <a class="v2-top__icon v2-top__search" href="${u('people/')}" aria-label="Search">${ICON.search}</a>`;
  const acts = gated
    ? `${search}
      <a class="v2-top__act v2-top__act--team v2-top__act--join" href="${u('index.html')}"><span>Join the waitlist</span></a>`
    : `${search}${accountTop(u)}
      <a class="v2-top__act v2-top__act--team" href="${u('team.html')}">${ICON.team}<span>My team</span></a>`;
  let subHtml = '';
  if (sub) {
    const items = sub.items.map(i => `        <li><a href="${u(i.href)}"${cur(i.key === subKey)}>${escHtml(i.label)}</a></li>`).join('\n');
    subHtml = `
  <nav class="v2-subtabs" aria-label="${escHtml(topItem(topKey, gated).label)}">
    <div class="v2-wrap v2-subtabs__in">
      <span class="v2-subtabs__label">${escHtml(sub.label)}</span>
      <ul class="v2-subtabs__list">
${items}
      </ul>
    </div>
  </nav>`;
  }
  let out = `<a class="v2-skip" href="#main">Skip to content</a>${ticker}
<header class="v2-top">
  <div class="v2-wrap v2-top__in">
    ${mark}
    <nav class="v2-topnav" aria-label="Main">
${top}
    </nav>
    <div class="v2-top__right">
${acts}
    </div>
    <button type="button" class="v2-menubtn" aria-haspopup="dialog" aria-expanded="false" aria-controls="v2-menu">Menu</button>
  </div>${subHtml}
</header>`;
  // phone MENU sheet: every section, with its sub-tabs
  const menu = sections.map(n => {
    const s = subnavV2(n.key, { gated });
    const kids = s ? `\n        <ul>\n` + s.items.map(i => `          <li><a href="${u(i.href)}"${cur(n.key === topKey && i.key === subKey)}>${escHtml(i.label)}</a></li>`).join('\n') + `\n        </ul>` : '';
    return `      <li><a class="v2-menu__top" href="${u(n.href)}"${sec(n.key === topKey)}>${escHtml(n.label)}</a>${kids}</li>`;
  }).join('\n');
  out += `
<div class="v2-menu" id="v2-menu" role="dialog" aria-modal="true" aria-label="Menu" hidden>
  <div class="v2-menu__panel" tabindex="-1">
    <div class="v2-menu__head">
      <span class="v2-menu__title">Menu</span>
      <button type="button" class="v2-menu__close" data-menu-close>Close</button>
    </div>
    <ul class="v2-menu__list">
${menu}
      <li><a class="v2-menu__top" href="${u('people/')}">Search</a></li>
${gated ? '' : accountMenu(u) + '\n'}    </ul>
  </div>
</div>`;
  return out;
}

// Phone bottom tab bar (hidden on desktop by CSS; icons are CSS masks in ui.css, in this order).
export function renderBottomTabsV2(topKey, { absolute = false, gated = GATED } = {}) {
  const items = BOTTOM_V2.map(k => topItem(k, gated)).filter(Boolean).map(n =>
    `  <a href="${escHtml(url(n.href, absolute))}"${n.key === topKey ? ' aria-current="true"' : ''}>${escHtml(n.label)}</a>`).join('\n');
  return `<nav class="v2-tabs" aria-label="Sections">\n${items}\n</nav>`;
}

// Footer. Also loads assets/v2/ticker.js (deferred), so every page with the v2 footer gets the scores ticker,
// including generated pages (scripts/lib/pages/layout.mjs renders this with absolute links). Not while GATED or while
// The Book is hidden (BOOK_HIDDEN): no odds.
export function renderFooterV2({ absolute = false, gated = GATED } = {}) {
  const u = h => escHtml(url(h, absolute));
  return `<footer class="v2-foot">
  <div class="v2-wrap v2-foot__in">
    <a class="v2-mark v2-mark--sm" href="${u('index.html')}"><span class="v2-mark__bd" aria-hidden="true">BD</span><span class="v2-mark__name">Billionaires Digest</span></a>
    <nav class="v2-foot__links" aria-label="Footer">
      <a href="${u('about.html')}">About</a>
      <a href="${u('about.html')}#corrections">Corrections</a>
      <a href="${u('play-terms.html')}">Game rules</a>
      <a href="${u('about.html')}#sponsor">Sponsor the brief</a>
      <a href="${u('calendar.ics')}">Calendar feed</a>
      <a href="${u('terms.html')}">Terms</a>
      <a href="${u('privacy.html')}">Privacy</a>
    </nav>
    <div class="v2-foot__notes">
      <p>For information only · not financial advice</p>
      <p>Play money only: no purchases, cash-out or prizes.</p>
    </div>
  </div>
</footer>${showTicker(gated) ? `\n<script src="${u('assets/v2/ticker.js')}" defer></script>` : ''}`;
}
