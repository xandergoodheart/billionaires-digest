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
