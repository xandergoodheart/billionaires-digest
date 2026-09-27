// Page shell for the static pages: v2 chrome (top bar + sub-tabs, phone tabs, footer from scripts/lib/nav.mjs; the
// footer also loads the scores ticker), the status line, and assets/v2/news.css (newsroom look). Content is
// server-rendered; the only page script is the MENU sheet (chrome.js).

import { esc, ldJson, SITE } from './util.mjs';
import { renderTopbarV2, renderBottomTabsV2, renderFooterV2 } from '../nav.mjs';

// active v2 [section, sub-tab] for a generated page's site path
export function navKeysV2(path) {
  const p = String(path || '');
  if (p.startsWith('/people/')) return ['news', 'people'];
  if (p.startsWith('/companies/')) return ['news', 'companies'];
  if (p.startsWith('/editions/')) return ['news', 'archive'];
  if (p.startsWith('/guides/')) return ['tools', 'filings101'];
  return [null, null];
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&family=Barlow:wght@400;600;700&display=swap';
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='4' fill='%23D62D27'/%3E%3Ctext x='32' y='45' font-family='Barlow Condensed,Arial Narrow,Arial,sans-serif' font-weight='800' font-size='36' text-anchor='middle' fill='%23FFFFFF'%3EBD%3C/text%3E%3C/svg%3E";

// opts: { title, description, path (site path, e.g. /people/elon-musk/), ogImage (absolute URL), ogType,
//         jsonLd: [objects], dateline, updated, body (HTML string), css (optional extra page CSS),
//         navKeys (optional [section, sub-tab] override) }
export function page(o) {
  const url = SITE + o.path;
  const ld = (o.jsonLd || []).map(x => `<script type="application/ld+json">${ldJson(x)}</script>`).join('\n');
  const [top, sub] = o.navKeys || navKeysV2(o.path);
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
<meta name="theme-color" content="#07080A">
<link rel="icon" href="${ICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="/assets/v2/tokens.css">
<link rel="stylesheet" href="/assets/v2/ui.css">
<link rel="stylesheet" href="/assets/v2/news.css">
${o.css ? `<style>\n${o.css}\n</style>\n` : ''}${ld}
</head>
<body class="v2 nw">
${renderTopbarV2(top, sub, { absolute: true })}
<div class="nw-ledbar"><p class="wrap nw-led"><span>${esc(o.dateline || 'Billionaires Digest')}</span><span>${esc(o.updated || '')}</span></p></div>

<main id="main" class="nw-main" tabindex="-1">
${o.body}
</main>

${renderBottomTabsV2(top, { absolute: true })}
${renderFooterV2({ absolute: true })}

<script src="/assets/v2/chrome.js"></script>
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
