// Open Graph image for an edition: 1200x630 PNG rendered with satori (layout -> SVG)
// and resvg (SVG -> PNG). Fonts are read from assets/ next to this repo.
// Used by publish-digest.mjs (after the edition is written) and render-og.mjs (by hand).
// Style: ESPN-like (black top bar, red accent line, dark card, white condensed headline).

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

// ESPN-style palette (assets/v2/tokens.css): black top bar, dark card, white display type, brand red accents.
export const C = {
  bar: '#0B0B0C', card: '#16181B', rule: '#2C2F34', text: '#FFFFFF', soft: '#B9BFC7', muted: '#9AA1AA',
  red: '#D62D27', redInk: '#FF5A52'
};
const DISPLAY = 'Barlow Condensed';
const BODY = 'Barlow';

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
// ---- shared ESPN-style pieces ----
const BAR_H = 96;
const PAD_X = 48;

function logo(size = 52) {
  return h('div', { width: size, height: size, borderRadius: 4, backgroundColor: C.red, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: DISPLAY, fontWeight: 800, fontSize: Math.round(size * 0.56), color: C.text, letterSpacing: 0.5 }, 'BD');
}

// Near-black top bar: red square logo + wordmark on the left, `right` (date or kicker) on the right.
function topBar(right) {
  return h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: BAR_H, padding: `0 ${PAD_X}px`,
    backgroundColor: C.bar },
    h('div', { display: 'flex', alignItems: 'center' },
      logo(52),
      h('div', { display: 'flex', marginLeft: 18, fontFamily: DISPLAY, fontWeight: 800, fontSize: 38, lineHeight: 1, letterSpacing: 1.5, color: C.text },
        'BILLIONAIRES DIGEST')
    ),
    right || null
  );
}

function footer(left) {
  return h('div', { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
    left || h('div', { display: 'flex' }),
    h('div', { display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 21, letterSpacing: 0.5, color: C.soft },
      h('span', {}, 'billionairesdigest.com'),
      h('span', { color: C.muted, margin: '0 10px' }, '·'),
      h('span', { color: C.redInk }, 'Follow the money')
    )
  );
}

// Full 1200x630 frame: top bar, 6px brand-red accent line, dark card body.
function frame(right, content) {
  return h('div', { width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', flexDirection: 'column', backgroundColor: C.card },
    topBar(right),
    h('div', { display: 'flex', height: 6, backgroundColor: C.red }),
    h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: `34px ${PAD_X}px 36px` }, content)
  );
}

// Outlined pill with a sector name.
function chip(label) {
  return h('div', { display: 'flex', padding: '7px 16px 6px', marginRight: 10, borderRadius: 999, border: `2px solid ${C.soft}`,
    fontFamily: BODY, fontWeight: 600, fontSize: 15, letterSpacing: 1.5, textTransform: 'uppercase', color: C.text, whiteSpace: 'nowrap' }, label);
}

async function toPng(root) {
  const fonts = await loadFonts();
  const svg = await satori(root, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}

// Layout tree for an edition card (exported for tests).
export function ogTree(digest) {
  const sectors = ogSectors(digest);
  const raw = clip(digest?.lede?.headline || 'Follow the money', 110).toUpperCase();
  const fit = fitHeadline(raw, { maxWidth: 1040, maxHeight: 216, maxLines: 3, lineHeight: 1 });
  const date = String(digest?.date || '').trim().toUpperCase();

  const content = [
    h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' },
      h('div', { display: 'flex', alignItems: 'center' },
        h('div', { width: 12, height: 12, borderRadius: 6, backgroundColor: C.red, marginRight: 12 }),
        h('div', { display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, letterSpacing: 4, color: C.redInk }, 'LEDE OF THE DAY')
      ),
      h('div', { display: 'block', marginTop: 12, fontFamily: DISPLAY, fontWeight: 800, fontSize: fit.size, lineHeight: 1,
        letterSpacing: 0.5, color: C.text, lineClamp: 3 }, fit.text)
    ),
    footer(h('div', { display: 'flex' }, sectors.map(chip)))
  ];
  return frame(h('div', { display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 18, letterSpacing: 2.5, color: C.soft }, date), content);
}

// Returns a PNG Buffer (1200x630).
export async function renderOg(digest) {
  return toPng(ogTree(digest));
}

// Layout tree for a static share card (exported for tests).
export function cardTree({ kicker = '', title = 'BILLIONAIRES DIGEST', subtitle = '' } = {}) {
  const t = String(title).replace(/\s+/g, ' ').trim().toUpperCase();
  // One big line when the title allows it (>= 100px), otherwise up to two lines.
  const one = fitHeadline(t, { maxWidth: 1000, maxHeight: 250, maxLines: 1, sizes: [150, 140, 130, 120, 110, 100], lineHeight: 0.95, spacing: 2 });
  const fit = one.lines === 1 && one.text === t ? one : fitHeadline(t, { maxWidth: 1000, maxHeight: 250, maxLines: 2, lineHeight: 0.95,
    sizes: [150, 140, 130, 120, 110, 100, 90, 80, 72], spacing: 2 });
  const sub = clip(subtitle, 150);
  const content = [
    h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
      h('div', { display: 'flex', width: 1000, textAlign: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontWeight: 800, fontSize: fit.size,
        lineHeight: 0.95, letterSpacing: 2, color: C.text }, fit.text),
      sub ? h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', marginTop: 22, maxWidth: 900,
        fontFamily: BODY, fontWeight: 600, fontSize: 28, lineHeight: 1.3, color: C.soft }, sub) : null
    ),
    footer(h('div', { display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 16, letterSpacing: 1.5, color: C.muted }, 'PLAY MONEY · FOR INFORMATION ONLY'))
  ];
  const right = kicker
    ? h('div', { display: 'flex', padding: '7px 16px 6px', borderRadius: 4, backgroundColor: C.red,
        fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, letterSpacing: 3, color: C.text }, String(kicker).toUpperCase())
    : null;
  return frame(right, content);
}

// Static share card in the same frame (prototype pages, previews). Returns a PNG Buffer (1200x630).
export async function renderCardOg(opts = {}) {
  return toPng(cardTree(opts));
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
