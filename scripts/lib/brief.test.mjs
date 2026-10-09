import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { briefContent, buildBrief, hasRawPrice, withoutPrices, withUtm, escapeHtml, chunk, nyDate, CONTACT_EMAIL } from './brief.mjs';

const DIGEST = {
  date: 'Sunday, October 4, 2026',
  lede: { headline: 'Big <b>day</b> for "chips"', dek: 'Shares closed at $236.13 on Friday. The fortune passed $200 billion.' },
  stories: [
    { headline: 'Story one & more', move: 'Shares hit $236.13 on Oct 2. Net worth reached $204.5 billion that day.', source: 'Forbes', url: 'https://www.forbes.com/a' },
    { headline: 'Stock jumps to $99.50', move: 'Nothing else.', source: 'X', url: 'https://x.example/b' },
    { headline: 'No source link', move: 'Fine text.', source: 'Y', url: 'javascript:alert(1)' },
    { headline: 'Deal worth $1.1 billion', move: 'A $1.1 billion purchase closed. <script>alert(1)</script>', source: 'Z', url: 'https://z.example/c?a=1&b=2' },
    { headline: 'Fourth', move: 'Plain words.', source: 'W', url: 'https://w.example/d' }
  ]
};
const RECIPIENT = { position: 1234, unsub_token: '11111111-2222-3333-4444-555555555555', referral_code: 'ABCD2345' };
const OPTS = { campaign: '2026-10-04', seasonLabel: 'Monday, Nov 9' };

test('price filter keeps fortune and deal sizes, drops raw prices', () => {
  for (const s of ['$236.13', 'at $99 a share', '$ 12', '$1,050.25']) assert.equal(hasRawPrice(s), true, s);
  for (const s of ['$204.5 billion', '$4.7 billion', '$30 billion', '$8 million', '$1.2B', 'no money', '36%']) assert.equal(hasRawPrice(s), false, s);
  assert.equal(withoutPrices('Shares hit $236.13 on Oct 2. Net worth reached $204.5 billion.'), 'Net worth reached $204.5 billion.');
});

test('content: only stories with a safe source link and no price in the headline, at most 5', () => {
  const c = briefContent(DIGEST);
  assert.deepEqual(c.stories.map(s => s.headline), ['Story one & more', 'Deal worth $1.1 billion', 'Fourth']);
  assert.equal(c.enough, true);
  assert.equal(c.lede.dek, 'The fortune passed $200 billion.');
  assert.equal(briefContent({ stories: Array(9).fill(DIGEST.stories[0]) }).stories.length, 5);
  assert.equal(briefContent({}).enough, false);
});

test('email: unsubscribe link, place in line, referral link, footer', () => {
  const b = buildBrief(briefContent(DIGEST), RECIPIENT, OPTS);
  const unsub = 'https://billionairesdigest.com/unsubscribe.html?t=11111111-2222-3333-4444-555555555555';
  assert.ok(b.html.includes(`href="${unsub}"`));
  assert.ok(b.text.includes(unsub));
  assert.equal(b.headers['List-Unsubscribe'], `<${unsub}>`);
  assert.ok(b.html.includes("#1,234 in line for Season 1 (opens Monday, Nov 9)"));
  assert.ok(b.html.includes('?ref=ABCD2345'));
  assert.ok(b.html.includes(`mailto:${CONTACT_EMAIL}`));
  assert.ok(/not financial advice/.test(b.html) && /not financial advice/.test(b.text));
  // the only email address anywhere in the message is the public business address
  const emails = new Set((b.html + b.text).match(/[\w.+-]+@[\w-]+\.[\w.]+/g));
  assert.deepEqual([...emails], [CONTACT_EMAIL]);
  assert.ok(b.subject.startsWith('The Billionaire Brief: '));
});

test('email: no raw prices anywhere', () => {
  const b = buildBrief(briefContent(DIGEST), RECIPIENT, OPTS);
  for (const out of [b.html, b.text, b.subject]) {
    assert.ok(!out.includes('236.13') && !out.includes('99.50'));
    assert.equal(hasRawPrice(out.replace(/<[^>]+>/g, ' ')), false);
  }
});

test('email: text is escaped, unsafe links dropped, utm only on our links', () => {
  const b = buildBrief(briefContent(DIGEST), RECIPIENT, OPTS);
  assert.ok(!b.html.includes('<script>'));
  assert.ok(b.html.includes('&lt;script&gt;'));
  assert.ok(b.html.includes('Big &lt;b&gt;day&lt;/b&gt; for &quot;chips&quot;'));
  assert.ok(b.html.includes('Story one &amp; more'));
  assert.ok(b.html.includes('href="https://z.example/c?a=1&amp;b=2"'));
  assert.ok(!b.html.includes('javascript:'));
  assert.ok(b.html.includes('news.html?utm_source=brief&amp;utm_medium=email&amp;utm_campaign=2026-10-04'));
  assert.ok(!b.html.includes('forbes.com/a?utm'));
  assert.equal(withUtm('https://www.forbes.com/a', 'x'), 'https://www.forbes.com/a');
  assert.equal(escapeHtml(`<'&">`), '&lt;&#39;&amp;&quot;&gt;');
});

test('email: no place-in-line block without a position', () => {
  const b = buildBrief(briefContent(DIGEST), { unsub_token: 't' }, OPTS);
  assert.ok(!b.html.includes('in line for Season 1'));
  assert.ok(b.html.includes('unsubscribe.html?t=t'));
});

test('real digest.json builds without raw prices', async () => {
  const d = JSON.parse(await readFile(new URL('../../digest.json', import.meta.url), 'utf8'));
  const c = briefContent(d);
  const b = buildBrief(c, RECIPIENT, OPTS);
  assert.equal(hasRawPrice(b.text), false);
  for (const s of c.stories) assert.match(s.url, /^https?:\/\//);
});

test('helpers', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(nyDate(new Date('2026-10-05T03:00:00Z')), '2026-10-04');
});
