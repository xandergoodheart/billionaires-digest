import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { briefContent, buildBrief, hasRawPrice, withoutPrices, withUtm, escapeHtml, chunk, nyDate, filingLabel, fmtEst, CONTACT_EMAIL } from './brief.mjs';

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

test('content: only stories with a safe source link and no price in the headline, at most 8', () => {
  const c = briefContent(DIGEST);
  assert.deepEqual(c.stories.map(s => s.headline), ['Story one & more', 'Deal worth $1.1 billion', 'Fourth']);
  assert.equal(c.enough, true);
  assert.equal(c.lede.dek, 'The fortune passed $200 billion.');
  assert.equal(briefContent({ stories: Array(12).fill(DIGEST.stories[0]) }).stories.length, 8);
  assert.equal(briefContent({ stories: Array(12).fill(DIGEST.stories[0]) }, { max: 5 }).stories.length, 5);
  assert.equal(briefContent({}).enough, false);
});

test('email: unsubscribe link, place in line, referral link, footer', () => {
  const b = buildBrief(briefContent(DIGEST), RECIPIENT, OPTS);
  const unsub = 'https://billionairesdigest.com/unsubscribe.html?t=11111111-2222-3333-4444-555555555555';
  assert.ok(b.html.includes(`href="${unsub}"`));
  assert.ok(b.text.includes(unsub));
  assert.equal(b.headers['List-Unsubscribe'], `<${unsub}>`);
  assert.ok(b.html.includes('#1,234') && b.html.includes('your place in line for Season 1'));
  assert.ok(b.text.includes("#1,234 in line for Season 1 (opens Monday, Nov 9)"));
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
  assert.ok(b.text.includes('Story one & more'));   // gallery cards show the move, not the headline (approved design)
  assert.ok(!/Story one & more/.test(b.html));
  assert.ok(b.html.includes('href="https://z.example/c?a=1&amp;b=2"'));
  assert.ok(!b.html.includes('javascript:'));
  assert.ok(b.html.includes('news.html?utm_source=brief&amp;utm_medium=email&amp;utm_campaign=2026-10-04'));
  assert.ok(!b.html.includes('forbes.com/a?utm'));
  assert.equal(withUtm('https://www.forbes.com/a', 'x'), 'https://www.forbes.com/a');
  assert.equal(escapeHtml(`<'&">`), '&lt;&#39;&amp;&quot;&gt;');
});

test('email: no place-in-line block without a position', () => {
  const b = buildBrief(briefContent(DIGEST), { unsub_token: 't' }, OPTS);
  assert.ok(!b.html.includes('in line for Season 1') && !b.text.includes('in line for Season 1'));
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

// ---------------------------------------------------------------- Portrait Gallery + The Daily Swing
const SEC = n => `https://www.sec.gov/Archives/edgar/data/${n}/primary_doc.xml`;
const holding = (ticker, estChange, source) => ({ ticker, shares: 10, change: 1.23, estChange, source });
const LB = {
  generated: '2026-10-18',
  notes: { movers: "Estimated; partial. Estimated from disclosed share counts × today's price change in US-listed holdings. Not a full net worth. Covers only disclosed share counts in US-listed holdings; may undercount. Shown only when these holdings are a large part of the person's wealth. For people whose holdings are shared (config/wealth-overrides.json, e.g. the X family), the estimate differs." },
  gainers: [
    { name: 'Gain Two', slug: 'gain-two', estDailyChange: 2e9, holdings: [holding('AAA', 2e9, SEC(2))] },
    { name: 'Gain One', slug: 'gain-one', estDailyChange: 5e9, holdings: [holding('SMALL', 1e8, SEC(9)), holding('BIG', 4.9e9, SEC(1))] },
    { name: 'Gain Three', slug: 'gain-three', estDailyChange: 1.5e9, holdings: [holding('CCC', 1.5e9, 'javascript:alert(1)')] },
    ...[4, 5, 6, 7].map(i => ({ name: `Gain ${i}`, slug: `gain-${i}`, estDailyChange: 1e9 - i * 1e8, holdings: [holding('DDD', 1e9 - i * 1e8, SEC(i))] }))
  ],
  losers: [
    { name: 'Drop One', slug: 'drop-one', estDailyChange: -9e9, holdings: [holding('EEE', -9e9, 'https://www.stocktitan.net/sec-filings/x.html')] },
    { name: 'Drop Two', slug: 'drop-two', estDailyChange: -3e7, holdings: [holding('FFF', -3e7, SEC(3))] }
  ]
};
const LATEST = { quotes: {
  BIG: { changePct: 3.456, time: '2026-10-16T20:00:00.000Z' }, AAA: { changePct: -0.5, time: '2026-10-16T20:00:00.000Z' },
  EEE: { changePct: -4.04, time: '2026-10-16T20:00:00.000Z' }
} };
const PORTRAITS = { slugs: ['jane-roe', 'gain-one', 'john-doe'], names: { 'jane roe': 'jane-roe', 'john doe': 'john-doe' }, profiles: ['gain-one', 'gain-two'] };
const LAUNCH = { seasonStart: '2026-11-09', seasonStartLabel: 'Monday, Nov 9' };
const GDIGEST = {
  date: 'Sunday, October 18, 2026',
  lede: { headline: 'Lede headline here', dek: 'Smith deal closes. It cost $12.50 a share.', ini: 'MS' },
  stories: [
    { who: 'Jane Roe', via: 'Roe Corp', sector: 'Finance', type: 'Markets', direction: 'up', headline: 'Jane story', move: 'Jane fact one.', why: 'OPINION-WHY-JANE.', bear: 'OPINION-BEAR-JANE.', read: 'OPINION-READ-JANE', watch: 'Next week.', source: 'Src A', url: 'https://a.example/1' },
    { who: 'Mary Smith & family', via: 'Smith & Sons', sector: 'Retail', type: 'Deal', direction: 'down', headline: 'Mary story', move: 'Mary fact.', why: 'OPINION-WHY-MARY.', read: 'OPINION-READ-MARY', source: 'Src B', url: 'https://b.example/2' },
    { who: 'John Doe', via: 'Doe Inc', sector: 'AI & tech', type: 'Launch', direction: 'flat', headline: 'John story', move: 'John fact. Shares closed at $99.10.', why: 'OPINION-WHY-JOHN.', bear: 'OPINION-BEAR-JOHN.', read: 'OPINION-READ-JOHN', source: 'Src C', url: 'https://c.example/3' },
    { who: 'Kim Lee', via: 'Lee Co', sector: 'Energy', type: 'Deal', direction: 'up', headline: 'Kim story', move: 'Kim fact.', why: 'OPINION-WHY-KIM.', source: 'Src D', url: 'https://d.example/4' }
  ],
  quickHits: ['Quick one.', 'Quick two at $5.25 a share.']
};
const extras = (over = {}) => ({ leaderboards: LB, latest: LATEST, portraits: PORTRAITS, launch: LAUNCH, today: '2026-10-18', ...over });

test('gallery: cover is the lede person, face is the first other story with a portrait, the rest are cards', () => {
  const c = briefContent(GDIGEST, extras());
  assert.equal(c.cover.name, 'Mary Smith & family');
  assert.equal(c.cover.portrait, null);
  assert.equal(c.cover.initials, 'MS');
  assert.equal(c.face.who, 'Jane Roe');
  assert.deepEqual(c.gallery.map(s => s.who), ['John Doe', 'Kim Lee']);
  assert.equal(c.lede.dek, 'Smith deal closes.');
  assert.equal(c.gallery[0].summary, 'John fact.');
  assert.deepEqual(c.quickHits, ['Quick one.']);
  assert.equal(c.faces, 4 + 7);   // 4 story people + 5 gainers + 2 losers, no overlaps
});

test('daily swing: top 5 each way, main ticker = largest holding move, % from latest, filing labels, price day', () => {
  const sw = briefContent(GDIGEST, extras()).swing;
  assert.deepEqual(sw.up.map(r => r.name), ['Gain One', 'Gain Two', 'Gain 4', 'Gain 5', 'Gain 6']);   // Gain Three: unsafe filing link
  assert.deepEqual(sw.down.map(r => r.name), ['Drop One', 'Drop Two']);
  const g1 = sw.up[0];
  assert.equal(g1.ticker, 'BIG');
  assert.equal(g1.pct, 3.456);
  assert.equal(g1.estText, '+$5.0B');
  assert.equal(g1.filingLabel, 'SEC filing');
  assert.equal(g1.profile, 'https://billionairesdigest.com/people/gain-one/');
  assert.equal(sw.up[2].profile, null);   // no people/ page
  assert.equal(sw.up[2].pct, null);       // no quote
  assert.equal(sw.down[0].estText, '−$9.0B');
  assert.equal(sw.down[0].filingLabel, 'Filing copy (stocktitan.net)');
  assert.equal(sw.down[1].estText, '−$30M');
  assert.equal(sw.priceDay, 'Friday, Oct 16');
  assert.equal(sw.method, "Estimated; partial. Estimated from disclosed share counts × today's price change in US-listed holdings. Not a full net worth. Covers only disclosed share counts in US-listed holdings; may undercount.");
});

test('daily swing: left out when leaderboards are missing, empty or more than 4 days old', () => {
  assert.equal(briefContent(GDIGEST, extras({ leaderboards: null })).swing, null);
  assert.equal(briefContent(GDIGEST, extras({ leaderboards: { ...LB, gainers: [], losers: [] } })).swing, null);
  assert.equal(briefContent(GDIGEST, extras({ leaderboards: { ...LB, generated: '2026-10-13' } })).swing, null);
  assert.ok(briefContent(GDIGEST, extras({ leaderboards: { ...LB, generated: '2026-10-14' } })).swing);
  const b = buildBrief(briefContent(GDIGEST, extras({ leaderboards: null })), RECIPIENT, OPTS);
  assert.ok(!b.html.includes('Daily Swing') && !b.text.includes('DAILY SWING'));
});

test('daily swing: never called net worth, method line + How we estimate link, filing links', () => {
  const c = briefContent(GDIGEST, extras());
  const b = buildBrief(c, RECIPIENT, OPTS);
  const method = escapeHtml(c.swing.method);
  assert.ok(b.html.includes(method));
  assert.ok(!/net worth/i.test(b.html.split(method).join('')));
  assert.ok(!/net worth/i.test(b.text.split(c.swing.method).join('')));
  assert.ok(b.html.includes('flows.html?utm_source=brief&amp;utm_medium=email&amp;utm_campaign=2026-10-04'));
  assert.ok(b.html.includes('How we estimate'));
  assert.ok(b.html.includes(`href="${SEC(1)}"`) && b.html.includes('Filing copy (stocktitan.net)'));
  assert.ok(b.html.includes('BIG &#9650;3.5%'));
  assert.ok(b.html.includes('Friday, Oct 16 close'));
});

test('images: absolute https portrait JPGs by default, local base for the preview, alt/size/background on every img', () => {
  const c = briefContent(GDIGEST, extras());
  const b = buildBrief(c, RECIPIENT, OPTS);
  const imgs = b.html.match(/<img [^>]+>/g);
  assert.ok(imgs.length >= 3);
  for (const tag of imgs) {
    assert.match(tag, /src="https:\/\/billionairesdigest\.com\/assets\/portraits\/email\/[a-z0-9-]+\.jpg"/);
    assert.match(tag, / alt="[^"]+"/);
    assert.match(tag, / width="\d+" height="\d+"/);
    assert.match(tag, /background:#/);
  }
  assert.ok(b.html.includes('alt="Jane Roe"') && b.html.includes('alt="Gain One"'));
  assert.ok(!b.html.includes('email/mary-smith-family.jpg') && !b.html.includes('email/kim-lee.jpg'));   // initials circles
  assert.ok(b.html.includes('aria-label="Mary Smith &amp; family"'));
  assert.ok(!/\.webp|\.svg/.test(b.html));
  const local = buildBrief(c, RECIPIENT, { ...OPTS, assetBase: '../assets/portraits/email/' });
  assert.ok(local.html.includes('src="../assets/portraits/email/jane-roe.jpg"'));
  assert.ok(!local.html.includes('billionairesdigest.com/assets/portraits'));
});

test('opinion text appears only under an Opinion / Our read label (html and text)', () => {
  const b = buildBrief(briefContent(GDIGEST, extras()), RECIPIENT, OPTS);
  const opinions = ['OPINION-WHY-JANE', 'OPINION-BEAR-JANE', 'OPINION-READ-JANE', 'OPINION-WHY-MARY', 'OPINION-READ-MARY'];
  for (const o of opinions) {
    const i = b.html.indexOf(o);
    assert.ok(i > 0, o);
    const before = b.html.slice(Math.max(0, i - 900), i);
    const lab = Math.max(before.lastIndexOf('Opinion'), before.lastIndexOf('OPINION &middot;'), before.lastIndexOf('OUR READ'));
    assert.ok(lab >= 0, `${o} has no opinion label`);
    assert.ok(!/The move/i.test(before.slice(lab)), `${o} sits under The move`);
    const line = b.text.split('\n').find(l => l.includes(o));
    assert.match(line, /\(opinion\)/);
  }
  // gallery cards carry facts only
  for (const o of ['OPINION-WHY-JOHN', 'OPINION-BEAR-JOHN', 'OPINION-READ-JOHN', 'OPINION-WHY-KIM']) {
    assert.ok(!b.html.includes(o) && !b.text.includes(o), o);
  }
});

test('wording we write has no betting words; verbatim news may', () => {
  const neutral = { ...GDIGEST, stories: GDIGEST.stories.map(s => ({ ...s })) };
  for (const started of [false, true]) {
    const b = buildBrief(briefContent(neutral, extras({ today: started ? '2026-11-10' : '2026-10-18',
      launch: { ...LAUNCH, seasonStart: started ? '2026-10-01' : '2026-11-09' } })), RECIPIENT, OPTS);
    for (const out of [b.html, b.text, b.subject]) {
      assert.ok(!/\b(bet|bets|betting|wager\w*|odds|gambl\w*|jackpot|casino|sportsbook|parlay|stake to win)\b/i.test(out));
    }
  }
  const news = { ...GDIGEST, stories: [{ ...GDIGEST.stories[2], move: 'He likened investors to "gamblers" in a casino.' }, ...GDIGEST.stories.slice(1)] };
  assert.ok(buildBrief(briefContent(news, extras()), RECIPIENT, OPTS).html.includes('&quot;gamblers&quot; in a casino'));
});

test('game card: place in line before Season 1, Play this week button from the season start', () => {
  const before = buildBrief(briefContent(GDIGEST, extras()), RECIPIENT, OPTS);
  assert.ok(before.html.includes('Season 1 opens Monday, Nov 9') && before.html.includes('#1,234'));
  assert.ok(!before.html.includes('Play this week'));
  const onDay = { ...GDIGEST, date: 'Monday, November 9, 2026' };
  const after = buildBrief(briefContent(onDay, extras({ leaderboards: null })), RECIPIENT, OPTS);
  assert.ok(after.html.includes('Play this week') && after.text.includes('Play this week'));
  assert.ok(!after.html.includes('your place in line'));
  assert.ok(after.html.includes('team.html?utm_source=brief'));
  assert.ok(/Play money only/.test(before.html) && /Play money only/.test(after.text));
  // Manage email settings link only once the Brief switch is on
  assert.ok(!before.html.includes('account.html'));
  assert.ok(buildBrief(briefContent(GDIGEST, extras({ launch: { ...LAUNCH, briefSignup: true } })), RECIPIENT, OPTS).html.includes('account.html?utm_source=brief'));
});

test('plain text follows the html order', () => {
  const b = buildBrief(briefContent(GDIGEST, extras()), RECIPIENT, OPTS);
  const order = ['THE BILLIONAIRE BRIEF', 'THE COVER', 'FACE OF THE DAY', 'THE DAILY SWING', 'THE GALLERY', 'QUICK HITS', 'YOUR SPOT IN THE FANTASY GAME', "Read today's full edition", 'Unsubscribe:'];
  const at = order.map(k => b.text.indexOf(k));
  assert.ok(at.every(i => i >= 0), JSON.stringify(at));
  assert.deepEqual([...at].sort((x, y) => x - y), at);
  const hOrder = ['THE COVER', 'FACE OF THE DAY', 'The Daily Swing', 'The Gallery', 'Quick Hits', 'YOUR SPOT IN THE FANTASY GAME', 'Unsubscribe'];
  const hAt = hOrder.map(k => b.html.indexOf(k));
  assert.ok(hAt.every(i => i >= 0) && [...hAt].sort((x, y) => x - y).every((v, i) => v === hAt[i]), JSON.stringify(hAt));
});

test('mail-app construction: one style block, color-scheme metas, hidden preheader, no scripts or forms', () => {
  const b = buildBrief(briefContent(GDIGEST, extras()), RECIPIENT, OPTS);
  assert.equal(b.html.match(/<style>/g).length, 1);
  assert.ok(b.html.includes('<meta name="color-scheme" content="light dark">'));
  assert.ok(b.html.includes('prefers-color-scheme:dark') && b.html.includes('@media (max-width:620px)'));
  assert.ok(/<div style="display:none;[^"]*">Lede headline here/.test(b.html));
  assert.ok(!/<script|<form|<input|javascript:/i.test(b.html));
});

test('full real day (digest + leaderboards + prices + portraits) stays under 100 KB', async () => {
  const read = async p => JSON.parse(await readFile(new URL(`../../${p}`, import.meta.url), 'utf8'));
  const { loadPortraitIndex } = await import('./brief-portraits.mjs');
  const digest = await read('digest.json');
  const leaderboards = await read('data/insights/leaderboards.json');
  const c0 = briefContent(digest);
  // pin the leaderboards to the edition day so the swing is always included here
  const c = briefContent(digest, { leaderboards: { ...leaderboards, generated: c0.iso }, latest: await read('data/prices/latest.json'),
    portraits: await loadPortraitIndex(new URL('../../', import.meta.url).pathname), launch: await read('config/launch.json') });
  assert.ok(c.swing && c.swing.up.length + c.swing.down.length >= 2);
  const b = buildBrief(c, RECIPIENT, OPTS);
  assert.ok(Buffer.byteLength(b.html) < 100 * 1024, `${Buffer.byteLength(b.html)} bytes`);
  // a full 8-story day with a full swing (5 + 5) also fits
  const many = { ...digest, stories: Array.from({ length: 8 }, (_, i) => digest.stories[i % digest.stories.length]) };
  const fullLb = { ...leaderboards, generated: c0.iso, gainers: [...leaderboards.gainers, ...leaderboards.gainers].slice(0, 5),
    losers: [...leaderboards.losers, ...leaderboards.losers].slice(0, 5) };
  const big = buildBrief(briefContent(many, { ...c, leaderboards: fullLb, portraits: await loadPortraitIndex(new URL('../../', import.meta.url).pathname) }), RECIPIENT, OPTS);
  assert.ok(Buffer.byteLength(big.html) < 100 * 1024, `${Buffer.byteLength(big.html)} bytes`);
  for (const out of [b.html, b.text]) assert.equal(hasRawPrice(out.replace(/<[^>]+>/g, ' ')), false);
});

test('filing labels and estimate formatting', () => {
  assert.equal(filingLabel('https://www.sec.gov/x'), 'SEC filing');
  assert.equal(filingLabel('https://efts.sec.gov/x'), 'SEC filing');
  assert.equal(filingLabel('https://notsec.gov.example.com/x'), 'Filing copy (notsec.gov.example.com)');
  assert.equal(filingLabel('javascript:1'), null);
  assert.equal(fmtEst(1603110310), '+$1.6B');
  assert.equal(fmtEst(-22024802473), '−$22.0B');
  assert.equal(fmtEst(45e6), '+$45M');
  assert.equal(hasRawPrice('+$1.6B'), false);
  assert.equal(hasRawPrice('+$45M'), false);
});

test('cover person: initials AND surname in the lede, otherwise an initials medallion with no name plate', async () => {
  const d = JSON.parse(await readFile(new URL('../../digest.json', import.meta.url), 'utf8'));
  const dimon = briefContent({ ...d, lede: { headline: 'Dimon flags hidden strain as bank profits miss', dek: 'JPMorgan missed.', ini: 'JD' },
    stories: [{ who: 'Jamie Dimon', headline: 'JPM story', move: 'Fact.', source: 'S', url: 'https://s.example/1' }] }, extras());
  assert.equal(dimon.cover.name, 'Jamie Dimon');
  // same initials, surname not in the lede: no name plate
  const collision = briefContent({ ...GDIGEST, lede: { headline: 'Banks warn on hidden strain', dek: 'Profits missed.', ini: 'MS' } }, extras());
  assert.equal(collision.cover.story, null);
  assert.equal(collision.cover.name, null);
  assert.equal(collision.cover.initials, 'MS');
  const b = buildBrief(collision, RECIPIENT, OPTS);
  assert.ok(b.html.includes('THE COVER') && !b.html.includes('>Mary Smith &amp; family</div>'));
  assert.ok(b.html.includes('aria-label="MS"'));
  // no initials on the lede: medallion, no person
  const noIni = briefContent({ ...GDIGEST, lede: { headline: 'Smith deal closes', dek: '' } }, extras());
  assert.equal(noIni.cover.story, null);
  assert.equal(noIni.cover.name, null);
  // "& family" is ignored when finding the surname
  const fam = briefContent({ ...GDIGEST, lede: { headline: 'Walton heirs sell', dek: '', ini: 'RW' },
    stories: [{ who: 'Rob Walton & family', headline: 'H', move: 'F.', source: 'S', url: 'https://s.example/2' }] }, extras());
  assert.equal(fam.cover.name, 'Rob Walton & family');
});
