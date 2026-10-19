// Helpers for scripts/build-company-about.mjs: "what the company does" cards for the tickers players score on.
// Pure functions only (tested in scripts/lib/company-about.test.mjs).

export const MAX_WHAT = 220;
export const REQUIRED = ['ticker', 'name', 'industry', 'sourceName', 'sourceUrl', 'asOf'];   // + hq for SEC filers (cik)

// Annual-report forms, best first.
export const ANNUAL_FORMS = ['10-K', '20-F', '40-F', '10-K405', '10-KT', '20-F/A', '10-K/A'];

// SEC submissions JSON -> the newest annual report { form, filed, accession, primaryDocument } or null.
// Companies that listed too recently to have one fall back to their IPO prospectus (424B4, else S-1 / F-1);
// registered funds to their annual shareholder report (N-CSR).
export function latestAnnual(sub) {
  const r = sub && sub.filings && sub.filings.recent;
  if (!r || !Array.isArray(r.form)) return null;
  const tiers = [['10-K', '20-F', '40-F', '10-KT'], ['424B4'], ['S-1', 'F-1'], ['N-CSR']];
  for (const forms of tiers) {
    let best = null;
    for (let i = 0; i < r.form.length; i++) {
      if (!forms.includes(r.form[i])) continue;
      const row = { form: r.form[i], filed: r.filingDate[i], accession: r.accessionNumber[i], primaryDocument: r.primaryDocument[i] };
      if (!best || row.filed > best.filed) best = row;
    }
    if (best) return best;
  }
  return null;
}

export function archiveUrl(cik, accession, doc) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accession).replace(/-/g, '')}/${doc}`;
}

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico'
};
function titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s\-'(])([a-z])/g, (m, a, b) => a + b.toUpperCase()).trim();
}
// SEC business address -> "Austin, Texas" / "Dublin, Ireland". Empty string when missing.
export function hqOf(sub) {
  const a = sub && sub.addresses && (sub.addresses.business || sub.addresses.mailing);
  if (!a || !a.city) return '';
  const code = String(a.stateOrCountry || '').toUpperCase();
  const where = STATES[code] || a.stateOrCountryDescription || '';
  return [titleCase(a.city), where].filter(Boolean).join(', ');
}

// HTML filing -> plain text.
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|ix:header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h\d|br|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#8217;|&rsquo;|&#x2019;/gi, '’').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8212;|&mdash;/gi, '—').replace(/&#8211;|&ndash;/gi, '–').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// The start of the Business section (10-K "Item 1. Business", 20-F "Item 4. Information on the Company",
// 40-F annual information form "Description of the Business" / "Business"): skips table-of-contents hits by picking
// the first heading followed by real prose. Returns up to `len` characters, or '' when nothing is found.
export function businessExcerpt(text, len = 4000) {
  const t = String(text || '');
  const sp = (w) => w.split('').join('\\s?');   // headings styled letter by letter ("B USINESS")
  const res = [
    new RegExp('items?\\s*1\\.?\\s*(?:and\\s*2\\.?\\s*)?[\\-–—:.]?\\s*' + sp('business'), 'gi'),
    new RegExp('item\\s*4\\.?\\s*[\\-–—:]?\\s*' + sp('information') + '\\s+on\\s+the\\s+' + sp('company'), 'gi'),
    new RegExp(sp('business') + '\\s+' + sp('overview'), 'gi'),
    new RegExp(sp('description') + '\\s+of\\s+the\\s+' + sp('business'), 'gi'),
    new RegExp('general\\s+development\\s+of\\s+the\\s+' + sp('business'), 'gi'),
    /\boverview\b/gi
  ];
  for (const re of res) {
    let m;
    while ((m = re.exec(t))) {
      const after = t.slice(m.index, m.index + 700);
      const tocLike = /item\s*1a|item\s*2\b|item\s*5\b|risk factors/i.test(after.slice(20, 260)) || (after.match(/\n/g) || []).length > 14;
      const words = after.slice(m[0].length).split(/\s+/).filter((w) => /^[a-z]{3,}/i.test(w)).length;
      if (!tocLike && words > 60) return t.slice(m.index, m.index + len);
    }
  }
  return '';
}

// Sentences in a short text; initials and common abbreviations ("U.S.", "J.P.", "Inc.") do not end one.
export function countSentences(t) {
  const s = String(t || '').replace(/\b(?:[A-Z]\.){2,}/g, (m) => m.replace(/\./g, '·')).replace(/\b(Inc|Co|Corp|Ltd|No|St|Mr|Ms|Dr|vs)\./g, '$1·');
  return s.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).filter((x) => x.trim()).length;
}

// Validate one about.json entry. Returns a list of problems ([] when fine).
export function checkEntry(e) {
  const bad = [];
  if (!e || typeof e !== 'object') return ['not an object'];
  if (e.cik && (typeof e.hq !== 'string' || !e.hq.trim())) bad.push('missing hq');
  for (const k of REQUIRED) if (typeof e[k] !== 'string' || !e[k].trim()) bad.push('missing ' + k);
  if (e.whatTheyDo != null) {
    if (typeof e.whatTheyDo !== 'string' || !e.whatTheyDo.trim()) bad.push('empty whatTheyDo');
    else {
      if (e.whatTheyDo.length > MAX_WHAT) bad.push('whatTheyDo over ' + MAX_WHAT + ' chars');
      const sentences = countSentences(e.whatTheyDo);
      if (sentences > 2) bad.push('whatTheyDo over 2 sentences');
    }
  }
  if (typeof e.sourceUrl === 'string' && !/^https:\/\/[^\s"'<>]+$/.test(e.sourceUrl)) bad.push('sourceUrl not https');
  if (typeof e.asOf === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(e.asOf)) bad.push('asOf not YYYY-MM-DD');
  if (e.note != null) {
    if (!e.note || typeof e.note.text !== 'string' || !e.note.text.trim()) bad.push('note without text');
    else if (!/^https:\/\//.test(e.note.sourceUrl || '')) bad.push('note without https source');
  }
  return bad;
}
