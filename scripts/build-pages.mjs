// Builds search-indexable static pages from the site's data files.
// Usage: node scripts/build-pages.mjs            (from the repo root)
//        import { buildPages } from './build-pages.mjs'; await buildPages('.')
//
// Writes (and only ever deletes inside people/ and editions/):
//   people/index.html, people/<slug>/index.html      one per person in data/people/index.json
//   editions/index.html, editions/<date>/index.html  one per archive/<date>.json
//   sitemap.xml, robots.txt
// Output is deterministic: no build timestamps. Files are rewritten only when their content changes.
// sitemap lastmod values are the newest data date behind each page, never "now".

import { readFile, writeFile, mkdir, readdir, rm, stat, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  SITE, esc, arr, str, plural, isoOf, nyIso, nyStamp, fmtDate, longDate, clip, coreName, storyMatches, initials, sectorHref
} from './lib/pages/util.mjs';
import { page, breadcrumb } from './lib/pages/layout.mjs';
import {
  avatar, story, footprint, watchList, filings, listBox, consensusBox, ledgerBox, editionFilingsBox
} from './lib/pages/render.mjs';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILINGS_LIMIT = 15;
const HOLDING_GROUPS = ['controls', 'stakes', 'vehicles', 'realEstate', 'trophies'];

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
async function readJsonOr(p, fallback) {
  try { return await readJson(p); } catch (err) {
    if (err && err.code !== 'ENOENT') console.warn(`warning: build-pages could not read ${p}: ${err.message}`);
    return fallback;
  }
}
async function exists(p) { try { await access(p); return true; } catch { return false; } }
function maxIso(list) { return list.filter(x => typeof x === 'string' && DATE_RE.test(x)).sort().pop() || null; }

export async function buildPages(root = '.') {
  const R = resolve(root);
  const P = (...xs) => join(R, ...xs);

  // ---- load data ----
  const index = await readJson(P('data/people/index.json'));
  const people = arr(index.people)
    .filter(p => p && p.name && typeof p.slug === 'string' && SLUG_RE.test(p.slug))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (Number(a.p.rank) || 1e9) - (Number(b.p.rank) || 1e9) || a.i - b.i)
    .map(x => x.p);
  // rank shown on pages: the index rank when it is a number, else the position in the sorted list
  people.forEach((p, i) => { p = people[i] = { ...p }; if (!Number.isFinite(Number(p.rank)) || Number(p.rank) <= 0) p.rank = i + 1; });
  const indexIso = isoOf(index.asOf);
  const srcShort = String(index.source || 'Forbes Real-Time Billionaires').replace(/\s+Billionaires$/i, '');
  const byCore = new Map();
  for (const p of people) if (!byCore.has(coreName(p.name))) byCore.set(coreName(p.name), p);
  const personOf = name => byCore.get(coreName(name)) || null;
  const personHref = name => { const p = personOf(name); return p ? `/people/${p.slug}/` : null; };

  const prices = await readJsonOr(P('data/prices/latest.json'), null);
  const quotes = prices && prices.quotes && typeof prices.quotes === 'object' ? prices.quotes : null;

  let archiveFiles = [];
  try { archiveFiles = (await readdir(P('archive'))).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)); } catch { /* no archive yet */ }
  const editions = [];
  for (const f of archiveFiles.sort().reverse()) {
    const ed = await readJsonOr(P('archive', f), null);
    if (ed && typeof ed === 'object') editions.push({ iso: f.slice(0, 10), ed });
  }
  const ogLatest = SITE + '/og/latest.png';

  // sector for a person: index -> first matching story in the given list -> Other
  function personSector(name, stories) {
    const ip = name ? personOf(name) : null;
    if (ip && ip.sector) return ip.sector;
    for (const s of arr(stories)) if (name && s && s.sector && storyMatches(s, name)) return s.sector;
    return 'Other';
  }

  const out = new Map(); // relative path -> content
  const sitemap = [];    // [path, lastmod|null]

  // ---- people/<slug>/ ----
  for (const ip of people) {
    const name = ip.name;
    const prof = ip.hasProfile ? await readJsonOr(P('data/people', ip.slug + '.json'), null) : null;
    const filData = await readJsonOr(P('data/filings/by-person', ip.slug + '.json'), null);

    // latest moves across every edition, newest first
    const moves = [];
    for (const { iso, ed } of editions) for (const s of arr(ed.stories)) if (s && storyMatches(s, name)) moves.push({ iso, s });

    const fp = footprint(name, prof, quotes);
    const fil = filings(filData, FILINGS_LIMIT);
    const holdings = prof ? HOLDING_GROUPS.reduce((n, k) => n + arr(prof[k]).filter(e => e && typeof e === 'object').length, 0) : 0;
    const asOfText = indexIso ? fmtDate(indexIso) : '';
    const worth = str(ip.worth);

    const descBits = [];
    descBits.push(`${name} ranks #${ip.rank} on ${index.source || 'Forbes Real-Time Billionaires'}` +
      (worth ? ` at ${worth}` : '') + (asOfText ? ` (as of ${asOfText})` : ''));
    if (str(ip.source)) descBits.push(`with wealth from ${str(ip.source)}`);
    const description = descBits.join(', ') + (holdings ? `; ${plural(holdings, 'tracked holding', 'tracked holdings')}, SEC filings and latest moves.` : '; SEC filings and latest moves.');

    const bc = breadcrumb([['Home', '/'], ['People', '/people/'], [name, `/people/${ip.slug}/`]]);
    const sector = ip.sector || 'Other';
    const movesHtml = moves.length
      ? moves.map(m => story(m.s, { personHref, dateLabel: `<a href="/editions/${m.iso}/">${esc(fmtDate(m.iso))} edition</a>` })).join('')
      : `<p class="pcnote">${esc('No moves from ' + name + ' in the digest yet. The archive grows every morning.')}</p>`;
    const quoteTimes = fp.quoteTimes.slice().sort();
    const quoteNote = quoteTimes.length
      ? `<p class="pcnote quotenote">${esc('Prices' + (prices && prices.provider ? ' via ' + prices.provider : '') + ' · as of ' + nyStamp(quoteTimes[quoteTimes.length - 1]) + '. For information only.')}</p>`
      : '';

    const body = `${bc.html}
<div class="wrap pp">
<section class="pcard" aria-label="${esc('Profile: ' + name)}">
  <div class="pchead">
    <div class="pcwho">
      <div class="pcrank">#${esc(ip.rank)} of ${people.length} · <a href="${esc(sectorHref(sector))}">${esc(sector)}</a></div>
      <h1 class="pcname serif">${esc(name)}</h1>
      ${str(ip.source) ? `<div class="pcsrc">${esc(ip.source)}</div>` : ''}
    </div>
    <div class="pcside">${avatar(name, sector, 72)}</div>
  </div>
  <div class="pcworth">
    <div class="label">Net worth</div>
    <div class="pcval">${esc(worth || '—')}</div>
    <div class="pcsub">${esc(srcShort + (asOfText ? ' · as of ' + asOfText : ''))}</div>
  </div>
  <a class="livelink" href="/#person=${esc(encodeURIComponent(ip.slug))}">Open the live card →</a>
</section>
<section class="ppsec" aria-labelledby="moves"><h2 class="sech2 serif" id="moves">Latest moves</h2>
${movesHtml}
</section>
<section class="ppsec" aria-labelledby="filings"><h2 class="sech2 serif" id="filings">Recent SEC filings</h2>
${fil.html}
${filData ? '<p class="pcnote">Form 4 insider trades post within 2 business days. 13F fund holdings can arrive 45 days after quarter end.</p>' : ''}
</section>
<section class="ppsec" aria-labelledby="footprint"><h2 class="sech2 serif" id="footprint">Footprint</h2>
${fp.html}
${quoteNote}
</section>
<section class="ppsec" aria-labelledby="watch"><h2 class="sech2 serif" id="watch">What to watch</h2>
${watchList(name, prof)}
</section>
</div>`;

    out.set(`people/${ip.slug}/index.html`, page({
      title: `${name} — holdings, companies and latest moves · Billionaires Digest`,
      ogTitle: `${name} — holdings, companies and latest moves`,
      description,
      path: `/people/${ip.slug}/`,
      ogImage: ogLatest,
      ogType: 'profile',
      dateline: `People · #${ip.rank} of ${people.length}`,
      updated: asOfText ? `Net worths as of ${asOfText}` : '',
      jsonLd: [bc.ld, { '@context': 'https://schema.org', '@type': 'Person', name, url: `${SITE}/people/${ip.slug}/` }],
      body
    }));
    sitemap.push([`/people/${ip.slug}/`, maxIso([
      indexIso, isoOf(prof && prof.asOf), isoOf(fil.latestFiled), moves.length ? moves[0].iso : null,
      quoteTimes.length ? nyIso(quoteTimes[quoteTimes.length - 1]) : null
    ])]);
  }

  // ---- people/ ----
  {
    const bc = breadcrumb([['Home', '/'], ['People', '/people/']]);
    const asOfText = indexIso ? fmtDate(indexIso) : '';
    const items = people.map(p => `<li><a href="/people/${p.slug}/">${avatar(p.name, p.sector || 'Other', 44)}<span class="plinfo">` +
      `<span class="pln serif">${esc(p.name)}</span>` +
      `<span class="plw">${esc('#' + p.rank + ' · ' + (p.worth || ''))}</span>` +
      `<span class="plx">${esc([p.sector, p.source].filter(Boolean).join(' · '))}</span></span></a></li>`).join('\n');
    const body = `${bc.html}
<div class="wrap pagehead"><h1 class="serif">The ${people.length} richest people</h1><p>${esc('Ranked by net worth per ' + (index.source || 'Forbes Real-Time Billionaires') + (asOfText ? ' as of ' + asOfText : '') + '. Open a name for their companies, holdings, SEC filings and latest moves.')}</p></div>
<div class="wrap pagebody"><ol class="plist" style="padding-top:12px">
${items}
</ol></div>`;
    out.set('people/index.html', page({
      title: `The ${people.length} richest people: holdings and latest moves · Billionaires Digest`,
      description: `The world's ${people.length} richest people ranked by net worth${asOfText ? ' as of ' + asOfText : ''}, each with their companies, tracked holdings, SEC filings and latest moves.`,
      path: '/people/',
      ogImage: ogLatest,
      dateline: 'People',
      updated: asOfText ? `Net worths as of ${asOfText}` : '',
      jsonLd: [bc.ld],
      body
    }));
    sitemap.push(['/people/', indexIso]);
  }

  // ---- editions/<date>/ ----
  for (const { iso, ed } of editions) {
    const long = longDate(iso);
    const stories = arr(ed.stories).filter(s => s && typeof s === 'object');
    const lede = ed.lede && ed.lede.headline ? ed.lede : null;
    const bc = breadcrumb([['Home', '/'], ['Editions', '/editions/'], [fmtDate(iso), `/editions/${iso}/`]]);
    let ledeHtml = '';
    if (lede) {
      const want = String(lede.ini || '').toUpperCase();
      let lp = null;
      if (want) {
        const names = [];
        for (const s of stories) { if (s.who) names.push(s.who); for (const n of arr(s.people)) names.push(n); }
        for (const t of arr(ed.top10)) if (t && t.name) names.push(t.name);
        lp = names.find(n => initials(n) === want) || null;
      }
      const lpHref = lp ? personHref(lp) : null;
      const av = avatar(lp || '', lp ? personSector(lp, stories) : 'Other', '100%', 22, lede.ini || (lp ? initials(lp) : '•'));
      ledeHtml = `<section class="lede"><div class="wrap">
  <div><div class="label" style="color:var(--accent)">${esc(lede.kicker || 'Lede of the day')}</div><h1 class="serif">${esc(lede.headline)}</h1><p>${esc(lede.dek || '')}</p></div>
  <div><div class="portrait">${lpHref ? `<a href="${esc(lpHref)}" aria-label="${esc(lp)}" style="color:inherit;display:block">${av}</a>` : av}</div></div>
</div></section>`;
    }
    const side = [
      ledgerBox(ed.ledger),
      consensusBox(ed.consensus),
      editionFilingsBox(ed.filings),
      listBox('What to watch', ed.watch),
      listBox('Quick hits', ed.quickHits),
      listBox('If you run a business, not a fund', ed.memo, true)
    ].filter(Boolean).join('\n');
    const hTag = lede ? 'h2' : 'h1';
    const body = `${bc.html}
${ledeHtml}
<section class="main"><div class="wrap">
<div>
<div class="feedhead"><${hTag} class="serif">Signal feed</${hTag}><span class="label">${esc(plural(stories.length, 'move', 'moves'))}</span></div>
${stories.map(s => story(s, { personHref })).join('\n')}
<p class="note"><a class="backlink" href="/editions/">← All editions</a></p>
</div>
<aside class="side">
${side}
</aside>
</div></section>`;
    const ogDated = await exists(P('og', iso + '.png'));
    const description = lede
      ? clip(lede.headline + '. ' + (lede.dek || ''), 200)
      : `${plural(stories.length, 'move', 'moves')} from the world's 100 richest people on ${long}.`;
    out.set(`editions/${iso}/index.html`, page({
      title: `${long} edition · Billionaires Digest`,
      description,
      path: `/editions/${iso}/`,
      ogImage: ogDated ? `${SITE}/og/${iso}.png` : ogLatest,
      ogType: 'article',
      dateline: str(ed.date) || long,
      updated: str(ed.updated),
      jsonLd: [bc.ld],
      body
    }));
    sitemap.push([`/editions/${iso}/`, iso]);
  }

  // ---- editions/ ----
  {
    const bc = breadcrumb([['Home', '/'], ['Editions', '/editions/']]);
    const rows = editions.map(({ iso, ed }) => {
      const n = arr(ed.stories).filter(s => s && typeof s === 'object').length;
      const h = (ed.lede && ed.lede.headline) || ('Edition of ' + fmtDate(iso));
      return `<li class="edrow"><a href="/editions/${iso}/"><div><div class="eddate">${esc(longDate(iso))}</div><h2 class="edh serif">${esc(h)}</h2><div class="edmeta">${esc(plural(n, 'move', 'moves'))}</div></div></a></li>`;
    }).join('\n');
    const body = `${bc.html}
<div class="wrap pagehead"><h1 class="serif">Every edition</h1><p>Each morning's digest of what the world's 100 richest are buying, selling and building, newest first.</p></div>
<div class="wrap pagebody">${editions.length ? `<ul class="edlist">\n${rows}\n</ul>` : '<p class="note">No editions yet.</p>'}</div>`;
    out.set('editions/index.html', page({
      title: 'Every edition · Billionaires Digest',
      description: "Every edition of Billionaires Digest, newest first: the daily moves of the world's 100 richest people.",
      path: '/editions/',
      ogImage: ogLatest,
      dateline: 'Editions',
      updated: editions.length ? `Latest: ${fmtDate(editions[0].iso)}` : '',
      jsonLd: [bc.ld],
      body
    }));
    sitemap.push(['/editions/', editions.length ? editions[0].iso : null]);
  }

  // ---- write pages (only when changed) ----
  let written = 0;
  for (const [rel, content] of out) {
    const abs = P(rel);
    let old = null;
    try { old = await readFile(abs, 'utf8'); } catch { /* new */ }
    if (old === content) continue;
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content);
    written++;
  }

  // ---- remove stale generated pages (only inside people/ and editions/) ----
  const removed = [];
  const keepPeople = new Set(people.map(p => p.slug));
  const keepEds = new Set(editions.map(e => e.iso));
  for (const [dir, keep, re] of [['people', keepPeople, SLUG_RE], ['editions', keepEds, DATE_RE]]) {
    let names = [];
    try { names = await readdir(P(dir)); } catch { continue; }
    for (const n of names) {
      if (keep.has(n) || !re.test(n)) continue;
      const abs = P(dir, n);
      let st;
      try { st = await stat(abs); } catch { continue; }
      if (!st.isDirectory()) continue;
      await rm(abs, { recursive: true, force: true });
      removed.push(`${dir}/${n}/`);
    }
  }

  // ---- sitemap.xml + robots.txt ----
  const newest = editions.length ? editions[0].iso : null;
  const top = [['/', newest], ['/archive.html', newest], ['/sectors.html', maxIso([newest, indexIso])], ['/about.html', null]];
  const peopleIdx = sitemap.findIndex(x => x[0] === '/people/');
  const entries = [
    ...top,
    sitemap[peopleIdx],
    ...sitemap.filter(x => x[0].startsWith('/people/') && x[0] !== '/people/'),
    sitemap.find(x => x[0] === '/editions/'),
    ...sitemap.filter(x => x[0].startsWith('/editions/') && x[0] !== '/editions/')
  ];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(([p, lm]) => `  <url><loc>${esc(SITE + p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
  for (const [rel, content] of [['sitemap.xml', xml], ['robots.txt', robots]]) {
    let old = null;
    try { old = await readFile(P(rel), 'utf8'); } catch { /* new */ }
    if (old !== content) { await writeFile(P(rel), content); written++; }
  }

  return { people: people.length, editions: editions.length, pages: out.size, written, removed, urls: entries.length };
}

// run directly: node scripts/build-pages.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const r = await buildPages('.');
    console.log(`Static pages: ${r.people} people, ${r.editions} editions, ${r.pages} pages (${r.written} files changed), ${r.urls} sitemap URLs.` +
      (r.removed.length ? ` Removed stale: ${r.removed.join(', ')}.` : ''));
  } catch (err) {
    console.error(`build-pages failed: ${err?.stack || err}`);
    process.exit(1);
  }
}
