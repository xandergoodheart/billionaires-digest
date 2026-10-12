import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ogSectors, fitHeadline, updateOgMeta, renderCardOg, renderOg, ogTree, cardTree, OG_WIDTH, OG_HEIGHT } from './og.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('ogSectors keeps the first 3 distinct sectors in order', () => {
  const d = { stories: [{ sector: 'Finance' }, { sector: 'Finance' }, {}, { sector: 'Media' }, { sector: 'Energy' }] };
  assert.deepEqual(ogSectors(d), ['Finance', 'Other', 'Media']);
  assert.deepEqual(ogSectors({}), []);
});

test('fitHeadline shrinks long headlines and never exceeds the line limit', () => {
  const short = fitHeadline('BUFFETT BUYS CHEVRON', { maxWidth: 1040, maxHeight: 216 });
  const long = fitHeadline('MUSK, BEZOS AND ZUCKERBERG TOGETHER SELL A COMBINED $42.7B OF STOCK IN ONE WEEK AS THE MARKET WOBBLES ON NEW', { maxWidth: 1040, maxHeight: 216 });
  assert.ok(short.size > long.size);
  assert.ok(long.lines <= 3 && short.lines <= 3);
  assert.ok(long.lines * long.size <= 216 || long.size === 52);
});

test('updateOgMeta replaces og:image and twitter tags', () => {
  const html = '<head><meta property="og:url" content="x"><meta property="og:image" content="old"></head>';
  const out = updateOgMeta(html, 'https://example.com/og/a.png');
  assert.match(out, /og:image" content="https:\/\/example.com\/og\/a.png"/);
  assert.match(out, /twitter:card" content="summary_large_image"/);
  assert.match(out, /twitter:image" content="https:\/\/example.com\/og\/a.png"/);
});

// PNG width/height live in the IHDR chunk at bytes 16..24.
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
const DIGEST = { date: 'Sunday, September 27, 2026', lede: { headline: 'Test headline' }, stories: [{ sector: 'Finance' }, { sector: 'Media' }] };
const CARD = { kicker: 'PROTOTYPE', title: '5 CASINO LOOKS', subtitle: 'play money' };

test('renderOg and renderCardOg return 1200x630 PNGs', async () => {
  const a = await renderOg(DIGEST);
  const b = await renderCardOg(CARD);
  for (const buf of [a, b]) {
    assert.deepEqual(buf.subarray(0, 4), PNG);
    assert.deepEqual(pngSize(buf), { w: 1200, h: 630 });
  }
  assert.equal(OG_WIDTH, 1200);
  assert.equal(OG_HEIGHT, 630);
});

test('share cards use the ESPN look: no gold/brass/bulbs, black bar, red accent, no images', () => {
  for (const tree of [ogTree(DIGEST), cardTree(CARD)]) {
    const json = JSON.stringify(tree);
    assert.doesNotMatch(json, /#F5C542|#FFE08A|#B8912F|#8E6B1C|#FBEAB0|#B98E32|#7A5A1A|#E9C766|#5A420F|245,\s*197,\s*66|255,\s*224,\s*138/i, 'gold colour found');
    assert.doesNotMatch(json, /gradient/i, 'gradient found');
    assert.doesNotMatch(json, /"type":"img"/, 'image found');
    assert.match(json, /#0B0B0C/i); // top bar
    assert.match(json, /#D62D27/i); // brand red logo / accent line
    assert.match(json, /BILLIONAIRES DIGEST/);
    assert.match(json, /Follow the money/);
    assert.equal(tree.props.style.width, 1200);
    assert.equal(tree.props.style.height, 630);
  }
});

test('edition card shows the date, kicker, uppercase headline and sector chips', () => {
  const json = JSON.stringify(ogTree(DIGEST));
  assert.match(json, /SUNDAY, SEPTEMBER 27, 2026/);
  assert.match(json, /LEDE OF THE DAY/);
  assert.match(json, /TEST HEADLINE/);
  assert.match(json, /"children":"Finance"/);
  assert.match(json, /"children":"Media"/);
});

test('edition card headline uses the fitted size', () => {
  const long = 'Musk, Bezos and Zuckerberg together sell a combined $42.7B of stock in one week as the market wobbles on new';
  const json = JSON.stringify(ogTree({ lede: { headline: long } }));
  const fit = fitHeadline(long.toUpperCase().slice(0, 110), { maxWidth: 1040, maxHeight: 216, maxLines: 3 });
  assert.match(json, new RegExp(`"fontSize":${fit.size},`));
});

test('updateOgMeta edits the front page (index.html) tags in place; news.html uses the static latest.png', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const html = await readFile(root + 'index.html', 'utf8');
  const count = (h, re) => (h.match(re) || []).length;
  for (const re of [/<meta property="og:image" content="[^"]*">/g, /<meta name="twitter:card" content="summary_large_image">/g, /<meta name="twitter:image" content="[^"]*">/g]) {
    assert.equal(count(html, re), 1, String(re));
  }
  const out = updateOgMeta(html, 'https://billionairesdigest.com/og/2030-01-02.png');
  assert.equal(count(out, /og\/2030-01-02\.png/g), 2);
  // only the two image URLs changed: no tag was inserted
  assert.equal(out.split('\n').length, html.split('\n').length);
  assert.equal(out.replace(/og\/[^"]+\.png/g, 'X'), html.replace(/og\/[^"]+\.png/g, 'X'));
  const news = await readFile(root + 'news.html', 'utf8');
  assert.match(news, /<meta property="og:image" content="https:\/\/billionairesdigest\.com\/og\/latest\.png">/);
  assert.match(news, /<meta name="twitter:image" content="https:\/\/billionairesdigest\.com\/og\/latest\.png">/);
});
