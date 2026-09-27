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

// Casino palette (assets/v2/tokens.css). Text colours are chosen for high contrast on the felt.
const C = {
  felt: '#07080A', panel: '#0B0C0F', text: '#F4F1E8', soft: '#DCD5C2', muted: '#BDB6A4',
  gold: '#F5C542', gold2: '#FFE08A', brass: '#B8912F', goldDk: '#8E6B1C', red: '#D62D27', redInk: '#FF5A52'
};
const BRASS = 'linear-gradient(145deg, #FBEAB0 0%, #B98E32 22%, #F5C542 45%, #7A5A1A 70%, #E9C766 100%)';
const RED_BTN = 'linear-gradient(180deg, #F0554F 0%, #D62D27 50%, #A81E19 100%)';
const DISPLAY = 'Barlow Condensed';
const BODY = 'Barlow';

const SECTOR_ART = {
  'AI & tech': 'ai', 'Finance': 'finance', 'Aerospace': 'aerospace', 'Luxury & retail': 'luxury',
  'Real estate': 'realestate', 'Energy': 'energy', 'Media': 'media', 'Autos': 'autos',
  'Industrials': 'industrials', 'Health': 'health'
};

let fontsPromise = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(ASSETS, 'fonts', 'BarlowCondensed-ExtraBold.ttf')),
      readFile(path.join(ASSETS, 'fonts', 'Barlow-SemiBold.ttf'))
    ]).then(([cond, body]) => [
      { name: DISPLAY, data: cond, weight: 800, style: 'normal' },
      { name: BODY, data: body, weight: 600, style: 'normal' }
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

// Advance widths (per 1000 em) of Barlow Condensed ExtraBold, read from the TTF, so headlines can be
// sized before satori lays them out. Unknown characters count as a wide capital (safe side).
const BC800 = {"0":456,"1":294,"2":451,"3":446,"4":508,"5":450,"6":451,"7":422,"8":446,"9":446,"A":508,"B":477,"C":470,"D":480,"E":441,"F":427,"G":473,"H":483,"I":235,"J":462,"K":505,"L":437,"M":558,"N":522,"O":479,"P":474,"Q":467,"R":481,"S":454,"T":485,"U":480,"V":506,"W":707,"X":490,"Y":492,"Z":419," ":200,".":235,",":223,":":298,";":246,"!":289,"?":462,"'":188,"\"":385,"$":454,"%":761,"&":624,"(":343,")":343,"-":337,"–":383,"—":593,"/":444,"+":437,"·":235,"…":739,"’":211,"‘":211,"“":389,"”":389,"#":626,"@":760};
function textWidth(s, size, spacing = 0) {
  let w = 0;
  for (const ch of s) w += (BC800[ch] ?? 560) * size / 1000 + spacing;
  return w;
}
// Greedy word wrap with the width table above; returns the lines.
function wrapLines(text, size, maxWidth, spacing = 0) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (!cur || textWidth(next, size, spacing) <= maxWidth) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Picks the largest display size at which `text` (already uppercase) fits in maxLines lines of maxWidth
// and maxHeight. Falls back to the smallest size and clips the text to fit.
export function fitHeadline(text, { maxWidth, maxHeight, maxLines = 3, sizes = [96, 90, 84, 78, 72, 66, 60, 56, 52], lineHeight = 1, spacing = 0.5 }) {
  const room = maxWidth * 0.97; // small safety margin for kerning differences
  for (const size of sizes) {
    const lines = wrapLines(text, size, room, spacing);
    if (lines.length <= maxLines && lines.length * size * lineHeight <= maxHeight) return { size, text, lines: lines.length };
  }
  const size = sizes[sizes.length - 1];
  let t = text;
  while (t.length > 10 && wrapLines(t, size, room, spacing).length > maxLines) t = clip(t, t.length - 4);
  return { size, text: t, lines: Math.min(maxLines, wrapLines(t, size, room, spacing).length) };
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

// ---- shared casino pieces ----
const BULBS = 44;
function bulbRow(pos) {
  const bulbs = [];
  for (let i = 0; i < BULBS; i++) {
    bulbs.push(h('div', { width: 11, height: 11, borderRadius: 6, backgroundColor: C.gold2,
      boxShadow: '0 0 7px 2px rgba(255,224,138,0.65)' }));
  }
  return h('div', { position: 'absolute', left: 30, right: 30, [pos]: 8, height: 11, display: 'flex', justifyContent: 'space-between' }, bulbs);
}

function logo(size = 54) {
  return h('div', { width: size, height: size, borderRadius: Math.round(size * 0.16), backgroundImage: RED_BTN,
    border: '2px solid #FF8A80', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: DISPLAY, fontWeight: 800, fontSize: Math.round(size * 0.56), color: '#FFFFFF', letterSpacing: 0.5,
    boxShadow: '0 0 14px rgba(255,59,59,0.45)' }, 'BD');
}

function masthead(right) {
  return h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    h('div', { display: 'flex', alignItems: 'center' },
      logo(54),
      h('div', { display: 'flex', marginLeft: 18, fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: 1.5 },
        h('span', { color: C.text }, 'BILLIONAIRES'),
        h('span', { color: C.gold, marginLeft: 10 }, 'DIGEST')
      )
    ),
    right || null
  );
}

function footer(left) {
  return h('div', { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
    left || h('div', { display: 'flex' }),
    h('div', { display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 21, letterSpacing: 0.5, color: C.soft },
      h('span', {}, 'billionairesdigest.com'),
      h('span', { color: C.goldDk, margin: '0 10px' }, '·'),
      h('span', { color: C.gold }, 'Follow the money')
    )
  );
}

// Felt background, brass outer frame, dark bulb band (bulbs top and bottom), thin gold inner frame.
function cabinet(content) {
  return h('div', { width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', padding: 16, backgroundColor: C.felt },
    h('div', { display: 'flex', flexGrow: 1, borderRadius: 26, padding: 6, backgroundImage: BRASS },
      h('div', { display: 'flex', flexGrow: 1, position: 'relative', borderRadius: 21, backgroundColor: C.panel, padding: '27px 10px' },
        bulbRow('top'),
        bulbRow('bottom'),
        h('div', { display: 'flex', flexGrow: 1, borderRadius: 14, border: `2px solid ${C.brass}`, backgroundColor: C.felt,
          backgroundImage: 'radial-gradient(ellipse 75% 70% at 50% 42%, rgba(40,70,52,0.40) 0%, rgba(14,20,17,0.35) 55%, rgba(0,0,0,0.85) 100%)' },
          h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '26px 42px 26px' }, content)
        )
      )
    )
  );
}

async function toPng(root) {
  const fonts = await loadFonts();
  const svg = await satori(root, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}

// Returns a PNG Buffer (1200x630).
export async function renderOg(digest) {
  const sectors = ogSectors(digest);
  const arts = await Promise.all(sectors.map(s => jpgDataUri(sectorFile(s))));

  const raw = clip(digest?.lede?.headline || 'Follow the money', 110).toUpperCase();
  const fit = fitHeadline(raw, { maxWidth: 1040, maxHeight: 216, maxLines: 3, lineHeight: 1 });
  const date = String(digest?.date || '').trim().toUpperCase();

  const plates = arts.map((src, i) => h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 132, marginRight: 8 },
    img(src, { width: 64, height: 64, borderRadius: 32, border: `3px solid ${C.gold}`, objectFit: 'cover' }),
    h('div', { display: 'flex', marginTop: 8, fontFamily: BODY, fontWeight: 600, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: C.soft, whiteSpace: 'nowrap' }, sectors[i])
  ));

  const content = [
    masthead(h('div', { display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 18, letterSpacing: 2.5, color: C.soft }, date)),
    h('div', { display: 'flex', height: 2, marginTop: 18, backgroundColor: C.goldDk }),
    h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' },
      h('div', { display: 'flex', alignItems: 'center' },
        h('div', { width: 12, height: 12, borderRadius: 6, backgroundColor: C.redInk, boxShadow: '0 0 8px 2px rgba(255,59,59,0.7)', marginRight: 12 }),
        h('div', { display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, letterSpacing: 4, color: C.gold }, 'LEDE OF THE DAY')
      ),
      h('div', { display: 'block', marginTop: 10, fontFamily: DISPLAY, fontWeight: 800, fontSize: fit.size, lineHeight: 1,
        letterSpacing: 0.5, color: C.text, lineClamp: 3, textShadow: '0 2px 0 rgba(0,0,0,0.6)' }, fit.text)
    ),
    footer(h('div', { display: 'flex', marginLeft: -34 }, plates))
  ];
  return toPng(cabinet(content));
}

// Static share card in the same cabinet (prototype pages, previews). Returns a PNG Buffer (1200x630).
export async function renderCardOg({ kicker = '', title = 'BILLIONAIRES DIGEST', subtitle = '' } = {}) {
  const t = String(title).replace(/\s+/g, ' ').trim().toUpperCase();
  // One big line when the title allows it (>= 100px), otherwise up to two lines.
  const one = fitHeadline(t, { maxWidth: 1000, maxHeight: 250, maxLines: 1, sizes: [150, 140, 130, 120, 110, 100], lineHeight: 0.95, spacing: 2 });
  const fit = one.lines === 1 && one.text === t ? one : fitHeadline(t, { maxWidth: 1000, maxHeight: 250, maxLines: 2, lineHeight: 0.95,
    sizes: [150, 140, 130, 120, 110, 100, 90, 80, 72], spacing: 2 });
  const sub = clip(subtitle, 150);
  const content = [
    masthead(kicker
      ? h('div', { display: 'flex', padding: '7px 16px 6px', borderRadius: 8, backgroundImage: RED_BTN, border: '2px solid #FF8A80',
          fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, letterSpacing: 3, color: '#FFFFFF' }, String(kicker).toUpperCase())
      : null),
    h('div', { display: 'flex', height: 2, marginTop: 18, backgroundColor: C.goldDk }),
    h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
      h('div', { display: 'flex', width: 1000, textAlign: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontWeight: 800, fontSize: fit.size,
        lineHeight: 0.95, letterSpacing: 2, color: C.gold, textShadow: '0 0 24px rgba(245,197,66,0.45), 0 3px 0 #5A420F' }, fit.text),
      sub ? h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', marginTop: 22, maxWidth: 900,
        fontFamily: BODY, fontWeight: 600, fontSize: 28, lineHeight: 1.3, color: C.text }, sub) : null
    ),
    footer(h('div', { display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 16, letterSpacing: 1.5, color: C.muted }, 'PLAY MONEY · FOR INFORMATION ONLY'))
  ];
  return toPng(cabinet(content));
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
