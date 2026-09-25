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
    { key: 'fantasy', label: 'My team', href: 'fantasy.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' },
    { key: 'leagues', label: 'Leagues', href: 'leagues.html' },
    { key: 'markets', label: 'Markets', href: 'markets.html' },
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
