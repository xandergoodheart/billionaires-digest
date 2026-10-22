// node --test scripts/lib/
// data/companies/about.json shape + the helpers in scripts/lib/company-about.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestAnnual, hqOf, htmlToText, businessExcerpt, checkEntry, countSentences, archiveUrl, MAX_WHAT } from './company-about.mjs';
import { aboutFor } from './pages/companies.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ABOUT = JSON.parse(readFileSync(join(ROOT, 'data', 'companies', 'about.json'), 'utf8'));
const TEXT = JSON.parse(readFileSync(join(ROOT, 'data', 'companies', 'about-text.json'), 'utf8'));
// company-run sites allowed for non-SEC filers (their own annual report or investor pages)
const COMPANY_HOSTS = /^https:\/\/(www\.)?(inditex\.com|lvmh\.com|kering\.com|loreal-finance\.com|tencent\.com|fastretailing\.com|group\.softbank)\//;

test('about.json: every entry has the required fields, safe sources and short summaries', () => {
  const cos = ABOUT.companies;
  assert.ok(cos && Object.keys(cos).length > 100, 'expected 100+ companies');
  for (const [k, e] of Object.entries(cos)) {
    assert.equal(e.ticker, k, k + ': ticker key');
    assert.deepEqual(checkEntry(e), [], k + ': ' + checkEntry(e).join('; '));
    assert.ok(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/[^\s/]+$/.test(e.sourceUrl) || COMPANY_HOSTS.test(e.sourceUrl), k + ': source must be an SEC filing or the company site: ' + e.sourceUrl);
    if (/sec\.gov/.test(e.sourceUrl)) assert.ok(e.cik && e.form, k + ': SEC entries keep cik and form');
    if (e.whatTheyDo) {
      assert.ok(e.whatTheyDo.length <= MAX_WHAT, k + ': too long');
      assert.ok(countSentences(e.whatTheyDo) <= 2, k + ': more than 2 sentences');
      assert.ok(!/\b(leading|largest|best|world-class|premier)\b/i.test(e.whatTheyDo), k + ': no superlatives');
      assert.equal(e.whatTheyDo, TEXT[k].whatTheyDo, k + ': summary comes from about-text.json');
    }
    assert.ok(e.asOf <= new Date().toISOString().slice(0, 10), k + ': asOf in the future');
  }
});

test('about-text.json: summaries are hand-written entries keyed by ticker', () => {
  for (const [k, t] of Object.entries(TEXT)) {
    if (t.whatTheyDo != null) assert.ok(typeof t.whatTheyDo === 'string' && t.whatTheyDo.length <= MAX_WHAT, k);
    if (t.source) for (const f of ['sourceName', 'sourceUrl', 'asOf', 'industry']) assert.ok(t.source[f], k + ': source.' + f);
    if (t.note) assert.ok(/^https:\/\//.test(t.note.sourceUrl) && t.note.text, k + ': note needs text + https source');
  }
});

test('latestAnnual: newest 10-K / 20-F / 40-F, else prospectus, else N-CSR', () => {
  const sub = (rows) => ({ filings: { recent: { form: rows.map((r) => r[0]), filingDate: rows.map((r) => r[1]), accessionNumber: rows.map((r, i) => 'a-' + i), primaryDocument: rows.map((r, i) => 'd' + i + '.htm') } } });
  assert.equal(latestAnnual(sub([['10-Q', '2026-08-01'], ['10-K', '2025-02-01'], ['10-K', '2026-02-01'], ['8-K', '2026-03-01']])).filed, '2026-02-01');
  assert.equal(latestAnnual(sub([['20-F', '2026-04-01']])).form, '20-F');
  assert.equal(latestAnnual(sub([['S-1', '2026-03-01'], ['424B4', '2026-04-01']])).form, '424B4');
  assert.equal(latestAnnual(sub([['N-CSR', '2025-12-29'], ['N-PORT', '2026-01-01']])).form, 'N-CSR');
  assert.equal(latestAnnual(sub([['8-K', '2026-01-01']])), null);
  assert.equal(latestAnnual(null), null);
  assert.equal(archiveUrl('0000320193', '0000320193-25-000079', 'aapl.htm'), 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl.htm');
});

test('hqOf: US state names and foreign countries', () => {
  assert.equal(hqOf({ addresses: { business: { city: 'AUSTIN', stateOrCountry: 'TX' } } }), 'Austin, Texas');
  assert.equal(hqOf({ addresses: { business: { city: 'DUBLIN 2', stateOrCountry: 'L2', stateOrCountryDescription: 'Ireland' } } }), 'Dublin 2, Ireland');
  assert.equal(hqOf({}), '');
});

test('htmlToText + businessExcerpt: skips the table of contents, finds the section', () => {
  const html = '<p>Item 1.</p><p>Business</p><p>3</p><p>Item 1A</p><p>Risk Factors</p><p>12</p>' +
    '<p>ITEM 1. B USINESS</p><p>Acme&#x2019;s team makes widgets &amp; gadgets for homes and offices. ' + 'Widgets are sold through stores and online channels across many markets every single year. '.repeat(8) + '</p>';
  const ex = businessExcerpt(htmlToText(html), 500);
  assert.match(ex, /^ITEM 1\. B USINESS/);
  assert.match(ex, /Acme’s team makes widgets & gadgets/);
  assert.equal(businessExcerpt('nothing here'), '');
});

test('countSentences and checkEntry limits', () => {
  assert.equal(countSentences('Works in the U.S. Midwest. Sells J.P. Morgan cards.'), 2);
  assert.equal(countSentences('One. Two. Three.'), 3);
  const ok = { ticker: 'X', name: 'X', industry: 'Retail', hq: 'Austin, Texas', cik: '1', sourceName: 'X 10-K', sourceUrl: 'https://www.sec.gov/x', asOf: '2026-01-01', whatTheyDo: 'X sells things.' };
  assert.deepEqual(checkEntry(ok), []);
  assert.ok(checkEntry({ ...ok, whatTheyDo: 'a'.repeat(221) }).length);
  assert.ok(checkEntry({ ...ok, sourceUrl: 'http://x' }).length);
  assert.ok(checkEntry({ ...ok, hq: '' }).length);
  assert.deepEqual(checkEntry({ ...ok, hq: '', cik: undefined }), []);
  assert.ok(checkEntry({ ...ok, note: { text: 'x', sourceUrl: 'ftp://x' } }).length);
});

test('aboutFor: by ticker (aliases count) or by company name', () => {
  const cos = { GOOGL: { ticker: 'GOOGL', name: 'Alphabet Inc.' }, IDEXY: { ticker: 'IDEXY', name: 'Inditex' } };
  assert.equal(aboutFor({ name: 'Alphabet', ticker: 'GOOGL', tickerKeys: new Set(['GOOGL']) }, cos).ticker, 'GOOGL');
  assert.equal(aboutFor({ name: 'Inditex', ticker: 'ITX', tickerKeys: new Set(['ITX']) }, cos).ticker, 'IDEXY');
  assert.equal(aboutFor({ name: 'Nobody Corp', ticker: '', tickerKeys: new Set() }, cos), null);
});
