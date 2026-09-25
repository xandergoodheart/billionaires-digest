// Static HTML versions of the site's browser renderers (assets/common.js and index.html).
// Every piece of data text goes through esc(); every link through safeUrl().

import {
  esc, safeUrl, arr, str, dirClass, arrow, joinBits, initials, fmtDate, monYear, clip,
  fmtShares, fmtUsd, fmtPrice, sectorArt, sectorHref
} from './util.mjs';

const EXT = 'target="_blank" rel="noopener noreferrer"';

// ---- sector-plate avatar (matches BD.avatar) ----
// size: px number or CSS length (then pass iniPx)
export function avatar(name, sector, size, iniPx, ini) {
  const fs = iniPx || (typeof size === 'number' ? Math.max(11, Math.round(size * 0.19)) : 11);
  const drop = Math.round(fs * 0.5);
  const av = typeof size === 'number' ? size + 'px' : String(size);
  return `<span class="av" aria-hidden="true" style="--av:${esc(av)};margin-bottom:${drop + 2}px">` +
    `<span class="avimg" style="background-image:url('${esc(sectorArt(sector))}')"></span>` +
    `<span class="avini" style="font-size:${fs}px;bottom:${-drop}px">${esc(ini || initials(name))}</span></span>`;
}

// ---- story card (matches BD.renderStory) ----
// opts.personHref(who) -> href or null; opts.dateLabel: text shown above the card
export function story(s, opts = {}) {
  const img = `<img class="sart" src="${esc(sectorArt(s.sector))}" alt="" width="72" height="72" loading="lazy" decoding="async">`;
  const href = s.who && opts.personHref ? opts.personHref(s.who) : null;
  const row = [];
  row.push(href ? `<a class="who" href="${esc(href)}">${esc(s.who)}</a>` : `<span class="who">${esc(s.who || '')}</span>`);
  if (s.type) row.push(`<span class="badge">${esc(s.type)}</span>`);
  if (s.sector) row.push(`<span class="badge">${esc(s.sector)}</span>`);
  if (s.tickers) row.push(`<span class="label">${esc(s.tickers)}</span>`);
  if (s.read) row.push(`<span class="read ${dirClass(s.direction)}">${esc('AI read · ' + arrow(s.direction) + s.read)}</span>`);
  const quad = [['The move', s.move, 'q-move'], ['Why it matters', s.why, 'q-why'], ['The bear case', s.bear, 'q-bear'], ['What to watch', s.watch, 'q-watch']]
    .filter(x => x[1])
    .map(x => `<div class="${x[2]}"><h4>${x[0]}</h4><p>${esc(x[1])}</p></div>`).join('');
  const u = safeUrl(s.url);
  const mail = 'mailto:hello@billionairesdigest.com?subject=' + encodeURIComponent('Correction: ' + (s.headline || '')) +
    '&body=' + encodeURIComponent('Story: ' + (s.headline || '') + '\nSource: ' + (u || '') + "\n\nWhat's wrong:\n");
  const src = `<div class="src"><span>${esc('Source · ' + (s.source || 'Unlisted'))}</span>` +
    (u ? `<a href="${esc(u)}" ${EXT}>Read original ↗</a>` : '') +
    `<a class="report" href="${esc(mail)}">Report an error</a></div>`;
  const dl = opts.dateLabel ? `<div class="label storydate">${opts.dateLabel}</div>` : '';
  const hTag = opts.hTag || 'h3';
  return `<article class="story">${dl}<div class="sgrid">${img}<div class="sbody">` +
    `<div class="srow">${row.join('')}</div>` +
    `<${hTag} class="serif">${esc(s.headline || '')}</${hTag}>` +
    (s.correction && typeof s.correction === 'string' ? `<p class="correction">${esc(s.correction)}</p>` : '') +
    `<div class="quad">${quad}</div>${src}</div></div></article>`;
}

// ---- footprint (matches the person card's Footprint tab) ----
const WHAT_MAX = 120;
function shortRole(r) {
  let s = str(r);
  const i = s.search(/[;(]/);
  if (i > 0) s = s.slice(0, i);
  return clip(s.replace(/[\s,:–—-]+$/, ''), 40);
}
function shortStake(st) {
  const s = str(st);
  const m = /^\s*([~<>≈]?\s*\d+(?:[.,]\d+)?\s*%)/.exec(s);
  return m ? m[1].replace(/\s+/g, '') : clip(s, 32);
}
function stakeShort(e) {
  const sh = e.stake ? shortStake(e.stake) : '';
  const when = e.stakeAsOf || e.date;
  return joinBits([sh, when ? 'as of ' + monYear(when) : '']);
}
function shortPrice(p) {
  if (typeof p === 'number' && isFinite(p)) {
    if (p >= 1e9) return '$' + (Math.round(p / 1e8) / 10) + 'B';
    if (p >= 1e6) return '$' + (Math.round(p / 1e5) / 10) + 'M';
    return '$' + Math.round(p).toLocaleString('en-US');
  }
  return clip(str(p), 32);
}
function shortWhen(x) {
  const s = str(x);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
  if (/^\d{4}-\d{2}$/.test(s)) return monYear(s);
  return clip(s, 40);
}
function fullRows(pairs) { return pairs.filter(p => str(p[1]) !== '').map(p => [p[0], str(p[1])]); }
function stakeFull(e) { return [['Stake', e.stake], ['Stake as of', e.stakeAsOf]]; }
function fpControls(e) {
  const role = str(e.role), stake = str(e.stake);
  return {
    main: e.name,
    bits: [joinBits([e.ticker, e.exchange]), role ? shortRole(role) : '', stakeShort(e)],
    full: fullRows([['Ticker', e.ticker], ['Exchange', e.exchange], ['Role', role]].concat(stakeFull(e))),
    lossy: (!!role && shortRole(role) !== role) || (!!stake && shortStake(stake) !== stake)
  };
}
function fpStakes(e) {
  const stake = str(e.stake);
  return {
    main: e.name,
    bits: [e.ticker, stakeShort(e)],
    full: fullRows([['Ticker', e.ticker]].concat(stakeFull(e))),
    lossy: !!stake && shortStake(stake) !== stake
  };
}
function fpVehicles(e) {
  return {
    main: e.name,
    bits: [e.type, e.cik ? 'CIK ' + e.cik : null, e.files13F === true ? 'Files 13F' : null],
    full: fullRows([['Type', e.type], ['Notes', e.notes]]),
    lossy: !!str(e.notes)
  };
}
function fpWhat(e, dateKey) {
  const what = str(e.what);
  const d = dateKey ? str(e[dateKey]) : '';
  return {
    main: clip(what, WHAT_MAX),
    bits: [d ? monYear(d) : ''],
    full: fullRows([['In full', what], ['Date', d]]),
    lossy: clip(what, WHAT_MAX) !== what
  };
}
function fpRealEstate(e) {
  const type = str(e.type), price = e.price, date = str(e.date);
  const pShort = price != null && price !== '' ? shortPrice(price) : '';
  return {
    main: e.area,
    bits: [clip(type, 40), pShort, date ? monYear(date) : ''],
    full: fullRows([['Type', type], ['Price', price], ['Date', date], ['Via', e.via]]),
    lossy: clip(type, 40) !== type || (typeof price === 'string' && pShort !== str(price)) || (!!date && monYear(date) !== date && !/^\d{4}-\d{2}(-\d{2})?$/.test(date)) || !!str(e.via)
  };
}
function fpGiving(e) { return { main: e.name, bits: [e.ein ? 'EIN ' + e.ein : null], full: [], lossy: false }; }
export const GROUPS = [
  ['controls', 'Companies', fpControls],
  ['stakes', 'Stakes', fpStakes],
  ['vehicles', 'Investment vehicles', fpVehicles],
  ['privateDeals', 'Private deals', e => fpWhat(e, 'date')],
  ['realEstate', 'Real estate', fpRealEstate],
  ['trophies', 'Trophies', e => fpWhat(e)],
  ['policy', 'Legal & regulatory', e => fpWhat(e)],
  ['giving', 'Giving', fpGiving]
];
function moreBox(full) {
  return `<details class="fpmore"><summary>More</summary><dl>${full.map(p => `<dt>${esc(p[0])}</dt><dd>${esc(p[1])}</dd>`).join('')}</dl></details>`;
}
function srcLink(u, text) {
  const su = safeUrl(u);
  return su ? `<a href="${esc(su)}" ${EXT}>${esc(text || 'source ↗')}</a>` : '';
}
function fpRow(x, source, sources) {
  const detail = joinBits(arr(x.bits));
  let det = '';
  if (detail || x.quote) det = `<span class="fpdet">${esc(detail)}${x.quote ? (detail ? ' · ' : '') + x.quote : ''}</span>`;
  const more = x.lossy && arr(x.full).length ? moreBox(x.full) : '';
  const main = `<div class="fpmain">${esc(x.main || '')}${det}${more}</div>`;
  const list = arr(sources).filter(u => !!safeUrl(u));
  let links;
  if (list.length > 1) links = `<span class="fpsrcs">${list.map((u, i) => srcLink(u, 'source ' + (i + 1) + ' ↗')).join('')}</span>`;
  else links = srcLink(list.length ? list[0] : source);
  return `<div class="fprow">${main}${links}</div>`;
}

// ---- market quotes (same rules as index.html) ----
function usListing(exchange) {
  const s = str(exchange);
  if (!s) return true;
  return !/delisted|proposed/i.test(s) && /^(nasdaq|nyse)\b/i.test(s);
}
export function quoteFor(e, quotes) {
  if (!quotes || !e) return null;
  const raw = str(e.ticker);
  if (!raw || /\(/.test(raw) || !usListing(e.exchange)) return null;
  const toks = raw.split('/').map(t => t.replace(/^[A-Za-z]+:\s*/, '').trim()).filter(Boolean);
  for (const t of toks) {
    const q = Object.prototype.hasOwnProperty.call(quotes, t) ? quotes[t] : null;
    if (q && typeof q.price === 'number' && isFinite(q.price) && q.price > 0) return { sym: toks.length > 1 ? t : '', q };
  }
  return null;
}
function quoteHtml(qb) {
  const pct = qb.q.changePct, has = typeof pct === 'number' && isFinite(pct);
  const dir = !has ? 'flat' : (pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat'));
  const t = (qb.sym ? qb.sym + ' ' : '') + fmtPrice(qb.q.price) + (has ? ' ' + arrow(dir) + Math.abs(pct).toFixed(2) + '%' : '');
  return `<span class="fpq ${dirClass(dir)}">${esc(t)}</span>`;
}

// returns { html, quoteTimes: [iso timestamps of quotes shown], any }
export function footprint(name, prof, quotes) {
  if (!prof) return { html: `<p class="pcnote">${esc('Footprint research for ' + name + ' is coming soon.')}</p>`, quoteTimes: [], any: false };
  const out = [], quoteTimes = [];
  let any = false;
  for (const [key, label, fn] of GROUPS) {
    const items = arr(prof[key]).filter(e => e && typeof e === 'object');
    if (!items.length) continue;
    const rows = [];
    for (const e of items) {
      const x = fn(e);
      if (!x.main) continue;
      if (key === 'controls' || key === 'stakes') {
        const qb = quoteFor(e, quotes);
        if (qb) { x.quote = quoteHtml(qb); if (qb.q.time) quoteTimes.push(String(qb.q.time)); }
      }
      rows.push(fpRow(x, e.source, e.sources));
    }
    if (!rows.length) continue;
    any = true;
    out.push(`<div class="fpg"><h3 class="fph">${esc(label)}</h3>${rows.join('')}</div>`);
  }
  if (!any) out.push(`<p class="pcnote">${esc('No sourced footprint entries on file for ' + name + ' yet.')}</p>`);
  if (prof.gaps) out.push(`<p class="pcnote">${esc('Research gaps: ' + prof.gaps)}</p>`);
  return { html: out.join(''), quoteTimes, any };
}

export function watchList(name, prof) {
  if (!prof) return `<p class="pcnote">${esc('Watch items for ' + name + ' are coming soon.')}</p>`;
  const items = arr(prof.watch).filter(e => e && e.what);
  if (!items.length) return `<p class="pcnote">${esc('No watch items on file for ' + name + '.')}</p>`;
  return `<div class="fpg">${items.map(e => {
    const what = str(e.what), when = str(e.when);
    return fpRow({
      main: clip(what, WHAT_MAX),
      bits: [when ? shortWhen(when) : ''],
      full: fullRows([['In full', what], ['When', when]]),
      lossy: clip(what, WHAT_MAX) !== what || (!!when && shortWhen(when) !== when && !/^\d{4}-\d{2}(-\d{2})?$/.test(when))
    }, e.source, e.sources);
  }).join('')}</div>`;
}

// ---- SEC filings (matches the person card's Filings tab) ----
export function formLabel(code) {
  const c = str(code).toUpperCase().replace(/^SC\s+/, 'SCHEDULE ');
  if (/^4(\/A)?$/.test(c)) return 'Form 4 · insider trade';
  if (/^144(\/A)?$/.test(c)) return 'Form 144 · planned sale';
  if (/13[DG]\b/.test(c)) return '13D/13G · big stake';
  if (/^13F/.test(c)) return '13F · fund holdings';
  if (/^8-K/.test(c)) return '8-K · company event';
  if (/^3(\/A)?$/.test(c)) return 'Form 3 · new insider';
  if (/^D(\/A)?$/.test(c)) return 'Form D · private raise';
  return c ? 'Form ' + c : 'SEC filing';
}
const TX_VERB = { P: 'Bought', S: 'Sold', F: 'Withheld for tax', G: 'Gifted', X: 'Exercised', M: 'Exercised', C: 'Converted', A: 'Awarded', D: 'Disposed' };
export function txLine(s) {
  const verb = TX_VERB[str(s.code).toUpperCase()] || str(s.codeLabel) || 'Traded';
  const toks = str(s.ticker).split(/[\s,/]+/).filter(Boolean);
  const cls = /\bClass\s+([A-Z])\b/i.exec(str(s.securityTitle));
  let tk = toks[0] || '';
  if (cls) toks.forEach(t => { if (t.toUpperCase().slice(-2) === '.' + cls[1].toUpperCase()) tk = t; });
  if (!tk) tk = clip(str(s.issuer), 28);
  const bits = [verb];
  if (typeof s.shares === 'number' && isFinite(s.shares) && s.shares > 0) bits.push(fmtShares(s.shares));
  if (tk) bits.push(tk);
  let t = bits.join(' ');
  if (typeof s.value === 'number' && isFinite(s.value) && s.value > 0) t += ' · ~' + fmtUsd(s.value);
  return t;
}
export function sortFilings(list) {
  return arr(list).filter(f => f && typeof f === 'object')
    .map((f, i) => ({ f, i }))
    .sort((a, b) => { const x = str(a.f.filed), y = str(b.f.filed); return x < y ? 1 : (x > y ? -1 : a.i - b.i); })
    .map(x => x.f);
}
function filingRow(f) {
  const who = str(f.person) || str(f.filer);
  const label = formLabel(f.form);
  const u = safeUrl(f.url) || safeUrl(f.indexUrl);
  let top;
  if (u) {
    const aria = label + (who ? ', ' + who : '') + (f.filed ? ', filed ' + fmtDate(str(f.filed)) : '') + ' (opens on SEC EDGAR)';
    top = `<a class="filform" href="${esc(u)}" ${EXT} aria-label="${esc(aria)}">${esc(label)} ↗</a>`;
  } else top = `<span class="filform">${esc(label)}</span>`;
  const lines = f.form4 ? arr(f.form4.summary).filter(s => s && typeof s === 'object') : [];
  let tx = '';
  if (lines.length) {
    tx = `<div class="filtx">${lines.slice(0, 3).map(s => `<span class="${dirClass(s.direction)}">${esc(txLine(s))}</span>`).join('')}` +
      (lines.length > 3 ? `<span class="flat">+${lines.length - 3} more</span>` : '') + '</div>';
  }
  const meta = joinBits([str(f.filer), f.filed ? 'filed ' + fmtDate(str(f.filed)) : '']);
  return `<div class="filrow"><div class="filtop">${top}</div>${tx}${meta ? `<div class="filmeta">${esc(meta)}</div>` : ''}</div>`;
}
// data: the by-person filings file or null. Returns { html, latestFiled }
export function filings(data, limit) {
  if (!data) return { html: `<p class="pcnote">This person doesn't file with the SEC.</p>`, latestFiled: null };
  const days = typeof data.windowDays === 'number' && data.windowDays > 0 ? data.windowDays : 90;
  const all = sortFilings(data.filings);
  if (!all.length) return { html: `<p class="pcnote">${esc('No SEC filings in the last ' + days + ' days.')}</p>`, latestFiled: null };
  const list = all.slice(0, limit);
  const note = all.length > list.length ? `<p class="pcnote">${esc('Showing the ' + list.length + ' newest of ' + all.length + ' filings in the last ' + days + ' days.')}</p>` : '';
  return {
    html: `<div class="fpg"><h3 class="fph">${esc('SEC filings · last ' + days + ' days')}</h3>${list.map(filingRow).join('')}</div>${note}`,
    latestFiled: str(list[0].filed) || null
  };
}

// ---- edition sidebar and lede ----
export function listBox(title, items, strong) {
  const list = arr(items).filter(x => x != null && String(x).trim() !== '');
  if (!list.length) return '';
  return `<div class="box${strong ? ' strong' : ''}"><h3 class="serif">${esc(title)}</h3><div class="list">${list.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>`;
}
export function consensusBox(c) {
  if (!c || !c.headline) return '';
  return `<div class="consensus"><img class="cart" src="/assets/art/consensus.jpg" alt="" width="64" height="64" loading="lazy" decoding="async">` +
    `<div class="label">Consensus alert</div><div class="t serif">${esc(c.headline)}</div>` +
    (c.body ? `<p>${esc(c.body)}</p>` : '') +
    `<div class="tags">${arr(c.tags).map(t => `<span>${esc(t)}</span>`).join('')}</div></div>`;
}
export function ledgerBox(l) {
  if (!l || !l.headline) return '';
  const u = safeUrl(l.url);
  return `<div class="box strong ledger"><div class="display mark">THE LEDGER</div><div class="t serif">${esc(l.headline)}</div>` +
    (l.teaser ? `<p>${esc(l.teaser)}</p>` : '') +
    (u ? `<a href="${esc(u)}" ${EXT} style="display:inline-flex;min-height:44px;align-items:center;font-size:12px">Read the column</a>` : '') + '</div>';
}
export function editionFilingsBox(list) {
  const rows = arr(list).filter(f => f && typeof f === 'object');
  if (!rows.length) return '';
  return `<div class="box"><h3 class="serif">Filings tracker</h3><div class="frow h"><span>Filer</span><span>Form</span><span>Change</span></div>` +
    rows.map(f => `<div class="frow"><span>${esc(f.filer || '')}</span><span class="flat">${esc(f.form || '')}</span><span class="${dirClass(f.direction)}">${esc(arrow(f.direction) + (f.change || ''))}</span></div>`).join('') +
    `<p class="note">Form 4 insider trades post within 2 business days. 13F fund holdings can arrive 45 days after quarter end.</p></div>`;
}
export function sectorLink(sector) {
  return `<a href="${esc(sectorHref(sector))}">${esc(sector)}</a>`;
}
