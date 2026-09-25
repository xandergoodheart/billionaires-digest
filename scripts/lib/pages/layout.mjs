// Page shell for the static pages: same head, masthead, nav and footer markup as index.html.
// Content is server-rendered; the only script is the theme toggle (same behavior as BD.initTheme).

import { esc, ldJson, SITE } from './util.mjs';
import { renderNav, renderFooter, NAV_JS } from '../nav.mjs';

// active nav key for a generated page's site path
function navKey(path) {
  const p = String(path || '');
  if (p.startsWith('/people/')) return 'people';
  if (p.startsWith('/companies/')) return 'companies';
  if (p.startsWith('/guides/filings-101/')) return 'filings101';
  if (p.startsWith('/editions/')) return 'archive';
  return null;
}

const FONTS = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,600&family=Inter:wght@400;500;600&display=swap';
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230F100D'/%3E%3Ctext x='32' y='45' font-family='Georgia,serif' font-size='38' text-anchor='middle' fill='%23E3A340'%3EBD%3C/text%3E%3C/svg%3E";

// Small page-specific additions; everything else comes from /assets/site.css.
const PAGE_CSS = `.crumbs{padding-top:10px}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.crumbs li+li::before{content:'›';margin-right:8px}
.crumbs a{display:inline-flex;align-items:center;min-height:44px;text-decoration:none}
.crumbs a:hover{text-decoration:underline}
.pp{max-width:900px;padding-bottom:48px}
.pp .pcard{border-bottom:none;padding-top:8px}
.pp .pchead .av{color:var(--text)}
.livelink{display:inline-flex;align-items:center;min-height:44px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none}
.livelink:hover{text-decoration:underline}
.ppsec{margin-top:8px}
.ppsec .story:last-child{border-bottom:none}
.storydate{padding-bottom:8px}
.story .srow a.who,.plist a{overflow-wrap:anywhere}
.quotenote{margin:12px 0 0}
.fprow .fpmain a.colink{display:inline;font-size:inherit;letter-spacing:inherit;min-height:0;margin:0}
.fpg .fph{margin:18px 0 4px;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:500;color:var(--accent)}`;

const THEME_JS = `(function(){var r=document.documentElement,b=document.getElementById('themebtn');try{var s=localStorage.getItem('bd-theme');if(s)r.setAttribute('data-theme',s);}catch(e){}function d(){var t=r.getAttribute('data-theme');if(t)return t==='dark';return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;}if(!b)return;function l(){b.textContent=d()?'Paper mode':'Terminal mode';}l();b.addEventListener('click',function(){var n=d()?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('bd-theme',n);}catch(e){}l();});})();`;

// opts: { title, description, path (site path, e.g. /people/elon-musk/), ogImage (absolute URL), ogType,
//         jsonLd: [objects], dateline, updated, body (HTML string), css (optional extra page CSS) }
export function page(o) {
  const url = SITE + o.path;
  const ld = (o.jsonLd || []).map(x => `<script type="application/ld+json">${ldJson(x)}</script>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:type" content="${esc(o.ogType || 'website')}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Billionaires Digest">
<meta property="og:image" content="${esc(o.ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(o.ogImage)}">
<link rel="icon" href="${ICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<style>
${PAGE_CSS}${o.css ? '\n' + o.css : ''}
</style>
${ld}
</head>
<body>
<div class="topstrip"><div class="wrap">
  <span>${esc(o.dateline || 'Billionaires Digest')}</span>
  <span>${esc(o.updated || '')}</span>
</div></div>

<header class="mast"><div class="wrap">
  <div>
    <div class="display brand">Billionaires <span>Digest</span></div>
    <div class="tag">Read the moves of the world's 100 richest like a trading desk</div>
  </div>
  <button class="themebtn" id="themebtn" type="button">Switch theme</button>
</div></header>

${renderNav(o.navKey !== undefined ? o.navKey : navKey(o.path), { absolute: true })}

<main id="app">
${o.body}
</main>

${renderFooter({ absolute: true })}

<script>${THEME_JS}
${NAV_JS}</script>
</body>
</html>
`;
}

// Breadcrumb markup + matching BreadcrumbList JSON-LD. items: [[name, path]] (last one is the current page)
export function breadcrumb(items) {
  const html = `<nav class="wrap crumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) => i === items.length - 1
    ? `<li><span aria-current="page">${esc(it[0])}</span></li>`
    : `<li><a href="${esc(it[1])}">${esc(it[0])}</a></li>`).join('')}</ol></nav>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: SITE + it[1] }))
  };
  return { html, ld };
}
