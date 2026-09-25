// Single source of truth for the site navigation and footer.
// Top-level .html pages get this markup via scripts/sync-nav.mjs (relative links);
// generated pages (scripts/lib/pages/layout.mjs) render it with absolute links.

// key: used for aria-current. href: relative to the site root, no leading slash.
export const NAV = [
  { key: 'today', label: 'Today', href: 'index.html' },
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
// fade hints at the edges that can still scroll. ES5, no globals. Same code lives in assets/common.js for the top-level pages.
export const NAV_JS = `(function(){var d=document.querySelectorAll('details.navmore');function closeAll(ex){for(var i=0;i<d.length;i++)if(d[i]!==ex)d[i].removeAttribute('open');}if(d.length){document.addEventListener('click',function(e){for(var i=0;i<d.length;i++)if(d[i].hasAttribute('open')&&!d[i].contains(e.target))d[i].removeAttribute('open');});document.addEventListener('keydown',function(e){if(e.key!=='Escape'&&e.key!=='Esc')return;for(var i=0;i<d.length;i++)if(d[i].hasAttribute('open')){d[i].removeAttribute('open');var s=d[i].querySelector('summary');if(s)s.focus();}});for(var j=0;j<d.length;j++)d[j].addEventListener('toggle',function(){if(this.open)closeAll(this);});}var nav=document.querySelector('.sitenav'),row=nav&&nav.querySelector('.wrap');if(!row)return;function fades(){var max=row.scrollWidth-row.clientWidth;nav.classList.toggle('is-scrolled',row.scrollLeft>2);nav.classList.toggle('is-end',row.scrollLeft>=max-2);}var c=row.querySelector('.wrap>a[aria-current="page"],summary[aria-current="page"]');if(c&&row.scrollWidth>row.clientWidth){var x=c.getBoundingClientRect().left-row.getBoundingClientRect().left+row.scrollLeft;if(x+c.offsetWidth>row.clientWidth-32)row.scrollLeft=Math.max(0,x-(row.clientWidth-c.offsetWidth)/2);}fades();row.addEventListener('scroll',fades,{passive:true});window.addEventListener('resize',fades);})();`;

// ---------------------------------------------------------------------------------------------------------------
// v2 chrome (branch v2): dark top bar with BD wordmark, sub-tabs per section, phone MENU sheet, phone bottom tabs
// and the v2 footer. Pages opt in with <!-- v2topbar:start --> / <!-- v2tabs:start --> / <!-- v2footer:start -->
// markers (scripts/sync-nav.mjs). Behavior of the MENU sheet lives in assets/v2/chrome.js. v1 NAV above is unchanged.

// Top-level sections. Links point at the best existing page until the v2 screen exists.
export const NAV_V2 = [
  { key: 'fantasy', label: 'Fantasy', href: 'team.html' },
  { key: 'players', label: 'Players', href: 'players.html' },
  { key: 'rankings', label: 'Rankings', href: 'scores.html#leaderboard' },   // until the v2 Rankings screen exists
  { key: 'calendar', label: 'Calendar', href: 'calendar.html' },
  { key: 'news', label: 'News', href: 'index.html' }
];

// Sub-tabs per section, with the small right-side label.
export const SUBNAV_V2 = {
  fantasy: {
    label: 'Billionaire Fantasy League',
    items: [
      { key: 'team', label: 'My team', href: 'team.html' },
      { key: 'draft', label: 'Draft room', href: 'draft.html' },
      { key: 'scores', label: 'Scores', href: 'scores.html' },
      { key: 'leagues', label: 'Leagues', href: 'leagues.html' },
      { key: 'book', label: 'The Book', href: 'book.html' },
      { key: 'rules', label: 'Rules', href: 'play-terms.html' }
    ]
  }
};

// Phone bottom tab bar (four sections).
export const BOTTOM_V2 = ['fantasy', 'players', 'rankings', 'news'];

const topItem = key => NAV_V2.find(n => n.key === key) || null;

// Top bar + sub-tabs + phone MENU sheet. topKey: NAV_V2 key (or null); subKey: sub-tab key of that section (or null).
// Active section: aria-current="true"; active sub-tab (the page itself): aria-current="page".
export function renderTopbarV2(topKey, subKey, { absolute = false } = {}) {
  const u = h => escHtml(url(h, absolute));
  const sec = cur2 => cur2 ? ' aria-current="true"' : '';
  const sub = topKey && SUBNAV_V2[topKey] ? SUBNAV_V2[topKey] : null;
  const top = NAV_V2.map(n => `      <a href="${u(n.href)}"${sec(n.key === topKey)}>${escHtml(n.label)}</a>`).join('\n');
  const mark = `<a class="v2-mark" href="${u('team.html')}"><span class="v2-mark__bd" aria-hidden="true">BD</span><span class="v2-mark__name">Billionaires Digest</span></a>`;
  let out = `<a class="v2-skip" href="#main">Skip to content</a>
<header class="v2-top">
  <div class="v2-wrap v2-top__in">
    ${mark}
    <nav class="v2-topnav" aria-label="Main">
${top}
    </nav>
    <div class="v2-top__right">
      <a class="v2-top__search" href="${u('people/')}">Search</a>
      <a class="v2-btn v2-btn--primary v2-top__cta" href="${u('team.html')}">My team</a>
    </div>
    <button type="button" class="v2-menubtn" aria-haspopup="dialog" aria-expanded="false" aria-controls="v2-menu">Menu</button>
  </div>
</header>`;
  if (sub) {
    const items = sub.items.map(i => `      <li><a href="${u(i.href)}"${cur(i.key === subKey)}>${escHtml(i.label)}</a></li>`).join('\n');
    out += `
<nav class="v2-subtabs" aria-label="${escHtml(topItem(topKey).label)}">
  <div class="v2-wrap v2-subtabs__in">
    <ul class="v2-subtabs__list">
${items}
    </ul>
    <span class="v2-subtabs__label">${escHtml(sub.label)}</span>
  </div>
</nav>`;
  }
  // phone MENU sheet: every section, with its sub-tabs
  const menu = NAV_V2.map(n => {
    const s = SUBNAV_V2[n.key];
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
    </ul>
  </div>
</div>`;
  return out;
}

// Phone bottom tab bar (hidden on desktop by CSS).
export function renderBottomTabsV2(topKey, { absolute = false } = {}) {
  const items = BOTTOM_V2.map(k => topItem(k)).map(n =>
    `  <a href="${escHtml(url(n.href, absolute))}"${n.key === topKey ? ' aria-current="true"' : ''}>${escHtml(n.label)}</a>`).join('\n');
  return `<nav class="v2-tabs" aria-label="Sections">\n${items}\n</nav>`;
}

export function renderFooterV2({ absolute = false } = {}) {
  const u = h => escHtml(url(h, absolute));
  return `<footer class="v2-foot">
  <div class="v2-wrap v2-foot__in">
    <a class="v2-mark v2-mark--sm" href="${u('team.html')}"><span class="v2-mark__bd" aria-hidden="true">BD</span><span class="v2-mark__name">Billionaires Digest</span></a>
    <div class="v2-foot__notes">
      <p>For information only · not financial advice</p>
      <p>Play money only: no purchases, cash-out or prizes.</p>
    </div>
    <nav class="v2-foot__links" aria-label="Footer">
      <a href="${u('about.html')}">About</a>
      <a href="${u('about.html')}#corrections">Corrections</a>
      <a href="${u('play-terms.html')}">Game rules</a>
    </nav>
  </div>
</footer>`;
}
