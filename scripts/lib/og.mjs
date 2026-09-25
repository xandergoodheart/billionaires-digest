// Open Graph image for an edition: 1200x630 PNG rendered with satori (layout -> SVG)
// and resvg (SVG -> PNG). Fonts and art are read from assets/ next to this repo.
// Used by publish-digest.mjs (after the edition is written) and render-og.mjs (by hand).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = path.join(REPO, 'assets');

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const SITE_URL = 'https://billionairesdigest.com';

const C = { bg: '#0F100D', text: '#EFE8D8', soft: '#C9C0AC', muted: '#A89F8C', accent: '#E3A340', line: '#2A2B25' };

const SECTOR_ART = {
  'AI & tech': 'ai', 'Finance': 'finance', 'Aerospace': 'aerospace', 'Luxury & retail': 'luxury',
  'Real estate': 'realestate', 'Energy': 'energy', 'Media': 'media', 'Autos': 'autos',
  'Industrials': 'industrials', 'Health': 'health'
};

let fontsPromise = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(ASSETS, 'fonts', 'DMSerifDisplay-Regular.ttf')),
      readFile(path.join(ASSETS, 'fonts', 'Newsreader72pt-SemiBold.ttf')),
      readFile(path.join(ASSETS, 'fonts', 'Inter-Regular.ttf')),
      readFile(path.join(ASSETS, 'fonts', 'Inter-SemiBold.ttf'))
    ]).then(([dm, news, interReg, interSemi]) => [
      { name: 'DM Serif Display', data: dm, weight: 400, style: 'normal' },
      { name: 'Newsreader', data: news, weight: 600, style: 'normal' },
      { name: 'Inter', data: interReg, weight: 400, style: 'normal' },
      { name: 'Inter', data: interSemi, weight: 600, style: 'normal' }
    ]);
    fontsPromise.catch(() => { fontsPromise = null; });
  }
  return fontsPromise;
}

async function jpgDataUri(file) {
  const buf = await readFile(path.join(ASSETS, 'art', file));
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function sectorFile(sector) { return `sector-${SECTOR_ART[sector] || 'other'}.jpg`; }

// The first 3 distinct sectors of the edition's stories, in story order.
export function ogSectors(digest) {
  const all = (Array.isArray(digest?.stories) ? digest.stories : [])
    .map(s => (s && typeof s.sector === 'string' && s.sector) || 'Other');
  const out = [];
  for (const s of all) { if (out.length >= 3) break; if (!out.includes(s)) out.push(s); }
  return out;
}

function clip(s, max) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:·–—-]+$/, '') + '…';
}

// tiny element helper for satori (no JSX)
function h(type, style, ...children) {
  const kids = children.flat().filter(c => c != null && c !== false);
  const props = { style };
  if (kids.length === 1) props.children = kids[0];
  else if (kids.length) props.children = kids;
  return { type, props };
}
function img(src, style) { return { type: 'img', props: { src, style, width: style.width, height: style.height } }; }

// Returns a PNG Buffer (1200x630).
export async function renderOg(digest) {
  const fonts = await loadFonts();
  const hero = await jpgDataUri('hero-flow.jpg');
  const sectors = ogSectors(digest);
  const arts = await Promise.all(sectors.map(s => jpgDataUri(sectorFile(s))));

  const headline = clip(digest?.lede?.headline || 'Follow the money', 110);
  const hSize = headline.length <= 48 ? 66 : headline.length <= 80 ? 58 : 50;
  const date = String(digest?.date || '').trim();

  const circles = arts.map((src, i) => h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 22 },
    img(src, { width: 92, height: 92, borderRadius: 46, border: `3px solid ${C.text}`, objectFit: 'cover' }),
    h('div', { display: 'flex', marginTop: 10, fontFamily: 'Inter', fontSize: 15, letterSpacing: 2, textTransform: 'uppercase', color: C.muted }, sectors[i])
  ));

  const root = h('div', {
    width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', flexDirection: 'column', position: 'relative',
    backgroundColor: C.bg, color: C.text, fontFamily: 'Inter'
  },
    // hero art, faint on the right like the site's lede
    img(hero, { position: 'absolute', right: 0, top: 0, width: 760, height: OG_HEIGHT, objectFit: 'cover', opacity: 0.6 }),
    h('div', { position: 'absolute', left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT, display: 'flex',
      backgroundImage: 'linear-gradient(90deg, #0F100D 0%, rgba(15,16,13,0.92) 45%, rgba(15,16,13,0.45) 75%, rgba(15,16,13,0.25) 100%)' }),
    h('div', { position: 'absolute', left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', flexDirection: 'column', padding: '52px 72px 44px' },
      // masthead
      h('div', { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 18, borderBottom: `3px solid ${C.text}` },
        h('div', { display: 'flex', fontFamily: 'DM Serif Display', fontSize: 64, lineHeight: 1 },
          h('span', { color: C.text }, 'Billionaires '),
          h('span', { color: C.accent }, 'Digest')
        ),
        h('div', { display: 'flex', fontSize: 18, letterSpacing: 2.5, textTransform: 'uppercase', color: C.muted, paddingBottom: 6 }, date)
      ),
      // lede
      h('div', { display: 'flex', flexDirection: 'column', marginTop: 34, width: 820 },
        h('div', { display: 'flex', fontSize: 17, letterSpacing: 3, textTransform: 'uppercase', color: C.accent }, 'Lede of the day'),
        h('div', { display: 'block', marginTop: 12, fontFamily: 'Newsreader', fontSize: hSize, lineHeight: 1.08, color: C.text, lineClamp: 3 }, headline)
      ),
      // sector plates + footer
      h('div', { display: 'flex', marginTop: 'auto', alignItems: 'flex-end', justifyContent: 'space-between' },
        h('div', { display: 'flex' }, circles),
        h('div', { display: 'flex', fontSize: 20, letterSpacing: 1.5, color: C.soft, paddingBottom: 30 },
          h('span', {}, 'billionairesdigest.com · '),
          h('span', { color: C.accent }, 'Follow the money')
        )
      )
    )
  );

  const svg = await satori(root, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return png;
}

// ---- meta tags in index.html ----
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Points og:image and twitter:image at imageUrl and makes twitter:card summary_large_image.
// Only these three meta tags are touched; missing ones are added after og:url (or before </head>).
export function updateOgMeta(html, imageUrl) {
  const url = escAttr(imageUrl);
  const tags = [
    { re: /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, tag: `<meta property="og:image" content="${url}">` },
    { re: /<meta\s+name="twitter:card"\s+content="[^"]*"\s*\/?>/i, tag: '<meta name="twitter:card" content="summary_large_image">' },
    { re: /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, tag: `<meta name="twitter:image" content="${url}">` }
  ];
  let out = html;
  for (const t of tags) {
    if (t.re.test(out)) {
      out = out.replace(t.re, () => t.tag);
    } else {
      const anchor = /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i.exec(out);
      if (anchor) out = out.slice(0, anchor.index + anchor[0].length) + '\n' + t.tag + out.slice(anchor.index + anchor[0].length);
      else out = out.replace(/<\/head>/i, () => `${t.tag}\n</head>`);
    }
  }
  return out;
}

// Renders og/<isoDate>.png and og/latest.png under root and points index.html's meta tags at the dated file.
export async function publishOg(digest, isoDate, root = '.') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))) throw new Error(`bad date ${isoDate}`);
  const png = await renderOg(digest);
  const dir = path.join(root, 'og');
  await mkdir(dir, { recursive: true });
  const dated = path.join(dir, `${isoDate}.png`);
  await writeFile(dated, png);
  await writeFile(path.join(dir, 'latest.png'), png);
  const indexPath = path.join(root, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const next = updateOgMeta(html, `${SITE_URL}/og/${isoDate}.png`);
  if (next !== html) await writeFile(indexPath, next);
  return { dated, latest: path.join(dir, 'latest.png'), bytes: png.length, metaChanged: next !== html };
}
