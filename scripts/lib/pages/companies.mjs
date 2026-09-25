// "Who owns this?" company index for the static page builder (scripts/build-pages.mjs).
// Companies come only from the profiles' controls and stakes entries (vehicles are not companies).
// Nothing here is invented: every holder row is a profile entry with its own source link.

import { esc, safeUrl, arr, str, norm, slug, isoOf, fmtDate, monYear, nyStamp, clip, joinBits, plural } from './util.mjs';
import { avatar, story, quoteFor, quoteHtml, filingRow, sortFilings, shortRole, fullRows, fpRow } from './render.mjs';

// Tickers that are the same company (share classes, old symbols).
export const TICKER_ALIASES = { 'GOOG': 'GOOGL', 'BRK.A': 'BRK.B', 'FB': 'META', 'LEN.B': 'LEN' };
// Display names for companies whose profile names vary or are long legal names.
export const DISPLAY = { 'GOOGL': 'Alphabet', 'BRK.B': 'Berkshire Hathaway', 'META': 'Meta Platforms', 'SPCX': 'SpaceX', 'ITX': 'Inditex', 'MC': 'LVMH', 'RUM': 'Rumble' };
// Normalized names (see companyNorm) that mean a ticker company.
export const NAME_ALIASES = {
  'google': 'GOOGL', 'alphabet': 'GOOGL', 'alphabet google': 'GOOGL',
  'facebook': 'META', 'meta': 'META',
  'spacex': 'SPCX', 'space exploration technologies': 'SPCX',
  'inditex': 'ITX', 'lvmh': 'MC'
};
// Entries that summarize or describe rather than name one company.
const SKIP_RE = /\b(ownership transfer|control chain|voting control|overall|results|operating companies)\b|^other\b|^financial interest\b|^wealth derives\b|\bincl\./i;

const SUFFIX_RE = /(?:[\s,]+)(?:inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited|l\.?l\.?c\.?|plc|s\.?a\.?b\.? de c\.?v\.?|s\.?a\.? de c\.?v\.?|s\.?a\.?|s\.?p\.?a\.?|s\.?l\.?|sas|ag|n\.?v\.?|se|pbc|holdings?|group|co\.?|pty|class [a-z]|common(?: stock)?|13f)\s*$/i;

// the company name at the start of a profile entry: text before " — ", " (", "; " or ": "
// returns { head, summary } where summary=true when the entry opens with "Something: ..." (a list or note, not a company)
export function headOf(name) {
  const s = str(name);
  const m = /\s+[—–-]\s+|\s*\(|;\s|:\s/.exec(s);
  if (!m) return { head: s, summary: false };
  return { head: s.slice(0, m.index).trim(), summary: m[0].trim() === ':' };
}
// Profile entries that are notes or summaries, not one company (shared with scripts/build-network.mjs).
export function isNoteEntry(e) {
  if (!e || typeof e !== 'object' || !str(e.name)) return true;
  const h = headOf(e.name);
  return h.summary || !h.head || SKIP_RE.test(h.head);
}

// Former holdings (shared with scripts/build-network.mjs). An entry is former only when
//  - the name's tail (text after the company name: parenthetical or " - note") or the stake says
//    historical / historic / former holder / (sold) / exited / fully exited, or a bare "former" note ("(former; ...)"), or
//  - the stake is 0%, "0 shares" or "(exited)".
// "formerly <old name>" and "former <title>" (former CEO, chairman, employer ...) never count.
const FORMER_TAIL_RE = /\b(historical|historic|former holder|exited|fully exited)\b|\(sold\)|\bformer\b(?=\s*[;,)]|\s*$)/i;
const ZERO_STAKE_RE = /^\s*~?0(?:\.0+)?\s*%|\b0 shares\b|\(exited\)/i;
export function isFormerEntry(e) {
  if (!e || typeof e !== 'object') return false;
  const name = str(e.name), stake = str(e.stake);
  const tail = name.slice(headOf(name).head.length);
  return FORMER_TAIL_RE.test(tail) || FORMER_TAIL_RE.test(stake) || ZERO_STAKE_RE.test(stake);
}

export function stripSuffixes(name) {
  let s = str(name).replace(/[\s,&]+$/, '');
  for (let i = 0; i < 6; i++) {
    const t = s.replace(SUFFIX_RE, '').replace(/[\s,&]+$/, '');
    if (t === s || t.length < 2) break;
    s = t;
  }
  return s;
}
export function companyNorm(name) { return norm(stripSuffixes(name)).replace(/^the /, ''); }

// tickers written in a profile: "BABA / 9988", "ASX:ARU", "KLG (delisted)", "LEN, LEN.B" -> [{ sym, exch }]
export function parseTickers(raw) {
  const s = str(raw).replace(/\([^)]*\)/g, ' ');
  const out = [];
  for (let t of s.split(/\s*[\/,·]\s*/)) {
    t = t.trim();
    if (!t) continue;
    let exch = '';
    const m = /^([A-Za-z]+):\s*(.+)$/.exec(t);
    if (m) { exch = m[1].toUpperCase(); t = m[2]; }
    t = t.toUpperCase().replace(/\s+/g, ' ');
    if (!/^[A-Z0-9][A-Z0-9.\- ]{0,15}$/.test(t)) continue;
    out.push({ sym: t, exch });
  }
  return out;
}
export function tickerKey(sym) { const t = str(sym).toUpperCase(); return TICKER_ALIASES[t] || t; }

// ---- build the index ----
// people: sorted index people (with rank); profiles: Map slug -> profile
// returns { list (sorted by name), bySlug, entryLink(entry) -> {href, head} | null }
export function buildCompanyIndex(people, profiles) {
  const rows = []; // { person, group, e, head, tickers }
  for (const p of people) {
    const prof = profiles.get(p.slug);
    if (!prof) continue;
    for (const group of ['controls', 'stakes']) {
      for (const e of arr(prof[group])) {
        if (isNoteEntry(e)) continue;
        if (!arr(e.sources).concat([e.source]).some(u => safeUrl(u))) continue; // sourced entries only
        rows.push({ person: p, group, e, head: headOf(e.name).head, tickers: parseTickers(e.ticker), former: isFormerEntry(e) });
      }
    }
  }
  // ticker companies first, so name-only entries can join them by name
  const byKey = new Map();
  const nameToKey = new Map(Object.entries(NAME_ALIASES).map(([n, k]) => [n, 'T:' + k]));
  const add = (key, r) => { if (!byKey.has(key)) byKey.set(key, { key, rows: [] }); byKey.get(key).rows.push(r); r.key = key; };
  // (same name under two tickers, e.g. a Shenzhen and a Hong Kong listing, is one company: first ticker in data order wins)
  const tickerRedirect = new Map();
  for (const r of rows) {
    if (!r.tickers.length) continue;
    let key = 'T:' + tickerKey(r.tickers[0].sym);
    const n = companyNorm(r.head);
    if (tickerRedirect.has(key)) key = tickerRedirect.get(key);
    else if (n && nameToKey.has(n) && nameToKey.get(n) !== key && !byKey.has(key)) { tickerRedirect.set(key, nameToKey.get(n)); key = nameToKey.get(n); }
    add(key, r);
    if (n && !nameToKey.has(n)) nameToKey.set(n, key);
  }
  for (const r of rows) {
    if (r.tickers.length) continue;
    const n = companyNorm(r.head);
    if (!n) continue;
    add(nameToKey.get(n) || 'N:' + n, r);
  }

  const list = [];
  for (const c of [...byKey.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) {
    const ticker = c.key.startsWith('T:') ? c.key.slice(2) : '';
    // display name: override -> most common stripped head (controls first) -> shortest -> alphabetical
    let name = ticker && DISPLAY[ticker];
    if (!name) {
      const counts = new Map();
      for (const r of c.rows) {
        const n = stripSuffixes(r.head);
        const w = (counts.get(n) || 0) + (r.group === 'controls' ? 10 : 1);
        counts.set(n, w);
      }
      name = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1))[0][0];
    }
    const syms = [], exchs = [];
    for (const r of c.rows) {
      for (const t of r.tickers) if ((tickerKey(t.sym) === ticker || t === r.tickers[0]) && !syms.includes(t.sym)) syms.push(t.sym);
      for (const t of r.tickers) if (t.exch && !exchs.includes(t.exch)) exchs.push(t.exch);
    }
    for (const r of c.rows) if (r.tickers.length && str(r.e.exchange) && !exchs.includes(str(r.e.exchange))) exchs.push(str(r.e.exchange));
    syms.sort((a, b) => (a === ticker ? -1 : b === ticker ? 1 : a < b ? -1 : a > b ? 1 : 0));
    // holders: people with at least one current entry; formerHolders: people whose entries are all former
    const holders = new Map(), formers = new Map(); // person slug -> { person, rows }
    for (const r of c.rows) {
      const m = r.former ? formers : holders;
      if (!m.has(r.person.slug)) m.set(r.person.slug, { person: r.person, rows: [] });
      m.get(r.person.slug).rows.push(r);
    }
    for (const slug of holders.keys()) formers.delete(slug);
    const byRank = (a, b) => a.person.rank - b.person.rank || (a.person.slug < b.person.slug ? -1 : 1);
    const hl = [...holders.values()].sort(byRank);
    for (const h of hl) h.rows = h.rows.filter(r => !r.former);
    const fl = [...formers.values()].sort(byRank);
    const tickerKeys = new Set(syms.map(tickerKey));
    list.push({ key: c.key, ticker, tickerKeys, syms, exchs, name, rows: c.rows, holders: hl, holderCount: hl.length, formerHolders: fl });
  }
  // slugs: from the display name, deterministic tie-break by key order
  const used = new Set();
  for (const c of list) {
    let s = slug(c.name) || slug(c.ticker) || 'company';
    if (s.length > 60) s = s.slice(0, 60).replace(/-[^-]*$/, '') || s.slice(0, 60);
    if (used.has(s) && c.ticker) s = s + '-' + slug(c.ticker);
    let base = s, i = 2;
    while (used.has(s)) s = base + '-' + (i++);
    used.add(s);
    c.slug = s;
    c.href = `/companies/${s}/`;
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || (a.slug < b.slug ? -1 : 1));
  const bySlug = new Map(list.map(c => [c.slug, c]));
  const byEntry = new WeakMap();
  for (const c of list) for (const r of c.rows) byEntry.set(r.e, { href: c.href, head: r.head });
  return { list, bySlug, entryLink: e => byEntry.get(e) || null };
}

// ---- matching filings and stories ----
function storyTokens(s) { return str(s.tickers).split(/[\s·,\/]+/).map(t => t.toUpperCase()).filter(Boolean); }
function wordIn(hay, needle) { return needle && (' ' + norm(hay) + ' ').indexOf(' ' + needle + ' ') >= 0; }
export function storyMatchesCompany(s, c, keySet) {
  if (!s || typeof s !== 'object') return false;
  if (c.ticker) {
    for (const t of storyTokens(s)) {
      const k = tickerKey(t);
      if (c.tickerKeys.has(k)) return true;
      const base = t.replace(/\.[A-Z]{1,2}$/, '');
      if (base !== t && !keySet.has(k) && c.tickerKeys.has(tickerKey(base))) return true; // MC.PA -> MC
    }
  }
  const n = companyNorm(c.name);
  const nameOk = n.length >= (c.ticker ? 4 : 6) || n.indexOf(' ') > 0;
  const via = companyNorm(str(s.via));
  if (via && (via === n || (c.ticker && NAME_ALIASES[via] === c.ticker))) return true;
  if (nameOk && wordIn(s.headline, n)) return true;
  if (c.ticker && c.ticker.length >= 3 && /^[A-Z]+$/.test(c.ticker) && new RegExp('\\b' + c.ticker + '\\b').test(str(s.headline))) return true;
  return false;
}
export function form4Matches(f, c) {
  if (!c.ticker || !f || !f.form4) return false;
  return parseTickers(f.form4.ticker).some(t => c.tickerKeys.has(tickerKey(t.sym)));
}

// ---- rendering ----
function holderEntryRow(c, r) {
  const e = r.e;
  const role = str(e.role), stake = str(e.stake), asOf = str(e.stakeAsOf || e.date);
  const label = r.group === 'controls' ? (role ? shortRole(role) : 'Controls') : 'Stake';
  const entryText = str(e.name);
  const showEntry = stripSuffixes(r.head) !== entryText && entryText !== r.head ? clip(entryText, 140) : '';
  const bits = [showEntry, stake ? clip(stake, 80) : '', asOf ? 'as of ' + monYear(asOf) : ''];
  const lossy = (!!showEntry && showEntry !== entryText) || (!!stake && clip(stake, 80) !== stake) || (r.group === 'controls' && !!role && shortRole(role) !== role);
  return fpRow({
    main: label,
    bits,
    full: fullRows([['Entry', entryText], ['Ticker', e.ticker], ['Exchange', e.exchange], ['Role', role], ['Stake', stake], ['Stake as of', e.stakeAsOf]]),
    lossy
  }, e.source, e.sources);
}

function holderBlock(c, h) {
  const p = h.person;
  return `<li class="cohold"><a class="cohwho" href="/people/${esc(p.slug)}/">${avatar(p.name, p.sector || 'Other', 44)}<span class="plinfo">` +
    `<span class="pln serif">${esc(p.name)}</span><span class="plw">${esc('#' + p.rank + (p.worth ? ' · ' + p.worth : ''))}</span></span></a>` +
    `<div class="fpg">${h.rows.map(r => holderEntryRow(c, r)).join('')}</div></li>`;
}

// ctx: { quotes, pricesProvider, editions: [{iso, ed}], filingsBySlug: Map slug -> data, personHref, related: [company] }
// returns { body, description, lastmods: [iso...] }
export function renderCompany(c, ctx) {
  const lastmods = [];
  // price
  let priceHtml = '';
  for (const r of c.rows) {
    const qb = quoteFor(r.e, ctx.quotes);
    if (!qb) continue;
    const t = qb.q.time ? nyStamp(String(qb.q.time)) : '';
    priceHtml = `<div class="coquote">${quoteHtml({ sym: qb.sym || (r.tickers[0] && r.tickers[0].sym) || '', q: qb.q })}` +
      `<span class="coqnote">${esc(joinBits([t ? 'as of ' + t : '', ctx.pricesProvider ? 'via ' + ctx.pricesProvider : '']))}</span></div>`;
    if (qb.q.time) lastmods.push(isoOf(String(qb.q.time)));
    break;
  }
  const exch = c.exchs.slice().sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0] || '';
  const idLine = joinBits([c.syms.join(' / '), clip(exch, 40)]);

  // holders
  const holdersHtml = c.holders.length
    ? `<ol class="coholders">${c.holders.map(h => holderBlock(c, h)).join('')}</ol>`
    : `<p class="pcnote">${esc('None of the tracked people currently holds ' + c.name + ' in our profiles. Former holders are listed below.')}</p>`;
  const formerHtml = c.formerHolders.length
    ? `<section class="ppsec" aria-labelledby="former"><h2 class="sech2 serif" id="former">Former holders</h2>
<ol class="coholders">${c.formerHolders.map(h => holderBlock(c, h)).join('')}</ol>
<p class="pcnote">Their profiles describe these holdings as sold, exited or historical. They are not counted as holders above.</p>
</section>`
    : '';

  // filings: Form 4s from any holder's filings whose issuer ticker matches, within each file's window
  const seen = new Set(), fl = [];
  for (const h of c.holders.concat(c.formerHolders)) {
    const data = ctx.filingsBySlug.get(h.person.slug);
    if (!data) continue;
    const days = typeof data.windowDays === 'number' && data.windowDays > 0 ? data.windowDays : 90;
    const gen = isoOf(data.generated);
    let cutoff = null;
    if (gen) { const d = new Date(gen + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); cutoff = d.toISOString().slice(0, 10); }
    for (const f of arr(data.filings)) {
      if (!f || !/^4(\/A)?$/i.test(str(f.form)) || !form4Matches(f, c)) continue;
      if (cutoff && str(f.filed) && str(f.filed) < cutoff) continue;
      const id = str(f.accession) || str(f.url);
      if (seen.has(id)) continue;
      seen.add(id);
      fl.push({ ...f, _person: h.person });
    }
  }
  const filingsSorted = sortFilings(fl);
  if (filingsSorted.length) lastmods.push(isoOf(filingsSorted[0].filed));
  const filingsHtml = c.ticker
    ? (filingsSorted.length
      ? `<div class="fpg">${filingsSorted.map(f => filingRow(f, `<a class="filwho" href="/people/${esc(f._person.slug)}/">${esc(f._person.name)}</a>`)).join('')}</div>`
      : `<p class="pcnote">${esc('No Form 4 insider trades in ' + c.name + ' from the holders above in the last 90 days.')}</p>`)
    : `<p class="pcnote">${esc(c.name + ' has no US ticker in our data, so there are no Form 4 insider trades to show.')}</p>`;

  // moves
  const keySet = ctx.keySet;
  const moves = [];
  for (const { iso, ed } of ctx.editions) for (const s of arr(ed.stories)) if (storyMatchesCompany(s, c, keySet)) moves.push({ iso, s });
  if (moves.length) lastmods.push(moves[0].iso);
  const movesHtml = moves.length
    ? moves.map(m => story(m.s, { personHref: ctx.personHref, dateLabel: `<a href="/editions/${m.iso}/">${esc(fmtDate(m.iso))} edition</a>` })).join('')
    : `<p class="pcnote">${esc('No digest stories about ' + c.name + ' yet. The archive grows every morning.')}</p>`;

  // related
  const relHtml = ctx.related.length
    ? `<ul class="colist corel">${ctx.related.map(x => `<li><a href="${esc(x.c.href)}"><span class="con serif">${esc(x.c.name)}</span>` +
      `<span class="cox">${esc(joinBits([x.c.syms[0] || '', plural(x.shared, 'shared holder', 'shared holders')]))}</span></a></li>`).join('')}</ul>`
    : `<p class="pcnote">No other tracked companies share these holders.</p>`;

  const body = `<div class="wrap pp">
<section class="pcard" aria-label="${esc('Company: ' + c.name)}">
  <div class="pcrank">${esc(idLine || 'No ticker in our data')}</div>
  <h1 class="pcname serif">${esc('Who owns ' + c.name + '?')}</h1>
  <p class="pcsrc">${esc(c.holderCount
    ? plural(c.holderCount, 'of the world’s richest people holds', 'of the world’s richest people hold') + ' ' + c.name + ' in our tracked profiles.'
    : 'No current holders among the world’s richest in our tracked profiles; ' + plural(c.formerHolders.length, 'former holder', 'former holders') + '.')}</p>
  ${priceHtml}
</section>
<section class="ppsec" aria-labelledby="holders"><h2 class="sech2 serif" id="holders">Billionaire holders</h2>
${holdersHtml}
<p class="pcnote">Each row is a sourced entry from that person’s profile. Stakes are as of the date shown, not today.</p>
</section>
${formerHtml}
<section class="ppsec" aria-labelledby="filings"><h2 class="sech2 serif" id="filings">Recent SEC filings</h2>
${filingsHtml}
<p class="pcnote">Form 4 insider trades post within 2 business days. New to filings? Read <a href="/guides/filings-101/">Filings 101</a>.</p>
</section>
<section class="ppsec" aria-labelledby="moves"><h2 class="sech2 serif" id="moves">Recent moves</h2>
${movesHtml}
</section>
<section class="ppsec" aria-labelledby="related"><h2 class="sech2 serif" id="related">Related</h2>
<p class="pcnote" style="margin-top:10px">Other companies held by the same people.</p>
${relHtml}
</section>
<p class="note"><a class="backlink" href="/companies/">← All companies</a></p>
</div>`;

  const names = (c.holders.length ? c.holders : c.formerHolders).map(h => h.person.name);
  const who = names.length <= 3 ? names.join(', ') : names.slice(0, 3).join(', ') + ' and ' + (names.length - 3) + ' more';
  const count = c.holderCount ? plural(c.holderCount, 'billionaire holder', 'billionaire holders') : plural(c.formerHolders.length, 'former billionaire holder', 'former billionaire holders');
  const description = clip(`Who owns ${c.name}${c.syms[0] ? ' (' + c.syms[0] + ')' : ''}? ${who} — ${count} with sourced stakes, SEC insider filings and recent moves.`, 220);
  for (const h of c.holders.concat(c.formerHolders)) { const pr = ctx.profiles.get(h.person.slug); if (pr && pr.asOf) lastmods.push(isoOf(pr.asOf)); }
  return { body, description, lastmods };
}

// companies/index.html body
export function renderCompanyIndex(list, peopleCount) {
  const most = list.filter(c => c.holderCount >= 2)
    .slice().sort((a, b) => b.holderCount - a.holderCount || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .slice(0, 24);
  const item = c => `<li><a href="${esc(c.href)}"><span class="con serif">${esc(c.name)}</span>` +
    `<span class="cox">${esc(joinBits([c.syms[0] || '', c.holderCount ? plural(c.holderCount, 'holder', 'holders') : 'former holders only']))}</span></a></li>`;
  const groups = new Map();
  for (const c of list) {
    const ch = norm(c.name).charAt(0).toUpperCase();
    const L = /^[A-Z]$/.test(ch) ? ch : '#';
    if (!groups.has(L)) groups.set(L, []);
    groups.get(L).push(c);
  }
  const letters = [...groups.keys()].sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a < b ? -1 : 1);
  const lid = L => L === '#' ? 'other' : L.toLowerCase();
  const jump = `<nav class="cojump" aria-label="Jump to letter">${letters.map(L => `<a href="#${lid(L)}">${esc(L)}</a>`).join('')}</nav>`;
  const az = letters.map(L => `<section class="coaz" aria-labelledby="${lid(L)}"><h2 class="sech2 serif" id="${lid(L)}">${esc(L === '#' ? '0–9' : L)}</h2>` +
    `<ul class="colist">${groups.get(L).map(item).join('')}</ul></section>`).join('\n');
  return `<div class="wrap pagehead"><h1 class="serif">Who owns this?</h1><p>${esc(list.length + ' companies held by the world’s ' + peopleCount + ' richest people, from the sourced entries in their profiles. Open a company to see who holds it, their stakes, SEC filings and recent moves. Use your browser’s find (Ctrl+F or ⌘F) to search.')}</p></div>
<div class="wrap pagebody">
${most.length ? `<section aria-labelledby="most"><h2 class="sech2 serif" id="most">Most-held companies</h2><p class="pcnote">By number of top-${peopleCount} holders.</p><ul class="colist">${most.map(item).join('')}</ul></section>` : ''}
${jump}
${az}
</div>`;
}

// related companies: others held by the same people, most shared holders first, then most holders overall
export function relatedFor(c, bySlugPerson) {
  const score = new Map();
  for (const h of c.holders) for (const o of bySlugPerson.get(h.person.slug) || []) {
    if (o === c) continue;
    score.set(o, (score.get(o) || 0) + 1);
  }
  return [...score.entries()].map(([o, shared]) => ({ c: o, shared }))
    .sort((a, b) => b.shared - a.shared || b.c.holderCount - a.c.holderCount || a.c.name.localeCompare(b.c.name, 'en', { sensitivity: 'base' }) || (a.c.slug < b.c.slug ? -1 : 1))
    .slice(0, 8);
}

export const COMPANY_CSS = `.coholders{list-style:none;margin:0;padding:0}
.cohold{padding:14px 0 6px;border-bottom:1px solid var(--line)}
.cohold:last-child{border-bottom:none}
.cohwho{display:inline-flex;align-items:center;gap:14px;min-height:44px;color:inherit;text-decoration:none;margin-bottom:4px}
.cohwho:hover .pln{text-decoration:underline}
.cohwho .av{color:var(--text)}
.cohold .fprow:first-child{border-top:none}
.coquote{margin-top:12px;font-size:15px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline}
.coqnote{font-size:11px;color:var(--muted)}
.colist{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0 24px}
.colist li{border-bottom:1px solid var(--line)}
.colist a{display:flex;flex-direction:column;justify-content:center;min-height:44px;padding:10px 0 8px;color:inherit;text-decoration:none}
.colist a:hover .con{text-decoration:underline}
.con{font-size:17px;line-height:1.2;overflow-wrap:anywhere}
.cox{font-size:11px;color:var(--muted);overflow-wrap:anywhere}
.cojump{display:flex;flex-wrap:wrap;gap:0 2px;margin-top:24px}
.cojump a{min-width:36px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-size:13px;font-weight:600}
.cojump a:hover{text-decoration:underline}`;
