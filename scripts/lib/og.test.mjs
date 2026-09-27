import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ogSectors, fitHeadline, updateOgMeta, renderCardOg, renderOg } from './og.mjs';

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

test('renderOg and renderCardOg return PNGs', async () => {
  const a = await renderOg({ date: 'Sunday, September 27, 2026', lede: { headline: 'Test headline' }, stories: [{ sector: 'Finance' }] });
  const b = await renderCardOg({ kicker: 'PROTOTYPE', title: '5 CASINO LOOKS', subtitle: 'play money' });
  assert.deepEqual(a.subarray(0, 4), PNG);
  assert.deepEqual(b.subarray(0, 4), PNG);
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
