// "The Billionaire Brief": pure builders for the email (no network, no file access).
// Design: "The Portrait Gallery" + "The Daily Swing" (docs/BRIEF-REDESIGN-PLAN.md Part A, approved 2026-10-18).
// Text comes only from that day's digest.json, copied verbatim; no new facts are written here. Sentences quoting a
// raw stock/share price (e.g. "$236.13") are left out; fortune and deal sizes ("$204.5 billion") stay. Opinion fields
// (why / bear / read) only ever appear under a label containing "Opinion" or "Our read". The Daily Swing figures come
// from data/insights/leaderboards.json (estimates from disclosed share counts; never called net worth).

export const SITE = 'https://billionairesdigest.com';
export const CONTACT_EMAIL = 'hello@billionairesdigest.com';
export const EMAIL_PORTRAIT_BASE = `${SITE}/assets/portraits/email/`;

// A dollar amount that is NOT followed by a scale word (billion, million, ...): treated as a raw price.
const PRICE_RE = /\$\s?\d[\d,]*(?:\.\d+)?(?!\d|[.,]\d|\s*(?:billion|million|trillion|thousand|bn\b|mn\b|[BMKT]\b))/i;
export const hasRawPrice = s => PRICE_RE.test(String(s || ''));

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// http(s) URLs only; anything else is dropped
export function safeUrl(u) {
  try {
    const x = new URL(String(u || ''));
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch { return null; }
}

// utm tags on our own links only (that is where clicks can be counted)
export function withUtm(u, campaign) {
  const s = safeUrl(u);
  if (!s) return null;
  const x = new URL(s);
  if (x.hostname !== new URL(SITE).hostname) return s;
  x.searchParams.set('utm_source', 'brief');
  x.searchParams.set('utm_medium', 'email');
  x.searchParams.set('utm_campaign', String(campaign || ''));
  return x.href;
}

// Split into sentences and drop the ones that quote a raw price.
export function withoutPrices(text) {
  const parts = String(text || '').trim().split(/(?<=[a-z0-9)%'"”][.!?])\s+(?=[A-Z0-9"“'])/);
  return parts.filter(p => p && !hasRawPrice(p)).join(' ').trim();
}

// Same normalisation as BDPortraitFor in assets/v2/portraits.js.
export function normName(n) {
  return String(n == null ? '' : n).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s*&\s*family\s*$/, '').replace(/\s+/g, ' ').trim();
}

const SLUG_RE = /^[a-z0-9-]+$/;
const slugify = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const nameWords = n => String(n || '').replace(/\s*&\s*family\s*$/i, '').split(/\s+/).filter(w => /^\p{L}/u.test(w));
// "Jay Y. Lee" -> "JL"; "Andreas von Bechtolsheim & family" -> "AB"
export function initialsOf(name) {
  const w = nameWords(name);
  if (!w.length) return '';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}
function initialsVariants(name) {
  const caps = nameWords(name).filter(x => /^\p{Lu}/u.test(x));
  return new Set([initialsOf(name), caps.slice(0, 2).map(x => x[0]).join('').toUpperCase()]);
}

// surname = last word of the name, ignoring a trailing "& family" / "family"; whole-word, case-insensitive match
function surnameIn(name, text) {
  const w = String(name || '').replace(/\s*&?\s*family\s*$/i, '').trim().split(/\s+/);
  const sur = (w[w.length - 1] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!sur) return false;
  const t = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return new RegExp(`(^|[^\\p{L}])${sur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(t);
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// "Sunday, October 18, 2026" -> "2026-10-18"
function editionIso(date) {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(String(date || ''));
  const mi = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return mi < 0 ? null : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayDiff = (a, b) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;
// trading-day label in New York, e.g. "Friday, Oct 16"
const nyDayLabel = t => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(t));

// +$1.6B / −$22.0B / +$45M
export function fmtEst(n) {
  const a = Math.abs(n);
  const body = a >= 1e8 ? `$${(a / 1e9).toFixed(1)}B` : `$${Math.max(1, Math.round(a / 1e6))}M`;
  return (n < 0 ? '−' : '+') + body;
}

// "SEC filing" for sec.gov links, otherwise "Filing copy (<host>)"
export function filingLabel(u) {
  const s = safeUrl(u);
  if (!s) return null;
  const host = new URL(s).hostname.replace(/^www\./, '');
  return host === 'sec.gov' || host.endsWith('.sec.gov') ? 'SEC filing' : `Filing copy (${host})`;
}

// First four sentences of the leaderboards' own method note, verbatim.
function methodLine(notes) {
  const t = notes && typeof notes.movers === 'string' ? notes.movers.trim() : '';
  if (!t) return 'Estimated from disclosed share counts. Not a full net worth.';
  return t.split(/(?<=\.)\s+(?=[A-Z])/).slice(0, 4).join(' ');
}

function portraitIndex(p) {
  const x = p && typeof p === 'object' ? p : {};
  return {
    slugs: new Set((Array.isArray(x.slugs) ? x.slugs : []).filter(s => SLUG_RE.test(String(s)))),
    names: x.names && typeof x.names === 'object' ? x.names : {},
    profiles: Array.isArray(x.profiles) ? new Set(x.profiles) : null
  };
}
function slugForName(name, idx) {
  const s = idx.names[normName(name)];
  return SLUG_RE.test(String(s || '')) ? s : slugify(name);
}

function buildSwing(lb, latest, iso, idx) {
  if (!lb || typeof lb !== 'object' || !iso) return null;
  const gen = String(lb.generated || '').slice(0, 10);
  if (!ISO_RE.test(gen)) return null;
  const age = dayDiff(iso, gen);
  if (!(age >= -1 && age <= 4)) return null;   // more than 4 days old (or from a later day): leave it out
  const quotes = latest && latest.quotes && typeof latest.quotes === 'object' ? latest.quotes : {};
  const times = [];
  const toRow = r => {
    const holdings = (Array.isArray(r.holdings) ? r.holdings : []).filter(h => h && h.ticker && Number.isFinite(h.estChange));
    const main = holdings.sort((a, b) => Math.abs(b.estChange) - Math.abs(a.estChange))[0];
    const filing = main && safeUrl(main.source);
    if (!filing) return null;   // every figure links the filing behind the share count
    const q = quotes[main.ticker];
    const pct = q && Number.isFinite(q.changePct) ? q.changePct : null;
    if (pct != null && q.time && !Number.isNaN(Date.parse(q.time))) times.push(q.time);
    return {
      name: String(r.name), slug: r.slug, initials: initialsOf(r.name),
      portrait: idx.slugs.has(r.slug) ? r.slug : null,
      profile: !idx.profiles || idx.profiles.has(r.slug) ? `${SITE}/people/${r.slug}/` : null,
      est: r.estDailyChange, estText: fmtEst(r.estDailyChange),
      ticker: String(main.ticker), pct, filing, filingLabel: filingLabel(filing)
    };
  };
  const pick = (list, sign) => (Array.isArray(list) ? list : [])
    .filter(r => r && r.name && SLUG_RE.test(String(r.slug || '')) && Number.isFinite(r.estDailyChange) && sign * r.estDailyChange > 0)
    .sort((a, b) => sign * (b.estDailyChange - a.estDailyChange)).map(toRow).filter(Boolean).slice(0, 5);
  const up = pick(lb.gainers, 1);
  const down = pick(lb.losers, -1);
  if (!up.length && !down.length) return null;
  const last = times.sort().pop();
  return { up, down, priceDay: last ? nyDayLabel(last) : null, method: methodLine(lb.notes), methodLink: `${SITE}/flows.html` };
}

// What goes in the Brief, picked from a digest object.
// extras (all optional): { leaderboards, latest, portraits: { slugs, names, profiles }, launch, today, min, max }
export function briefContent(digest, extras = {}) {
  const x = extras || {};
  const min = Number.isFinite(x.min) ? x.min : 3;
  const max = Number.isFinite(x.max) ? x.max : 8;
  const idx = portraitIndex(x.portraits);
  const d = digest || {};
  const iso = editionIso(d.date) || (ISO_RE.test(String(x.today || '')) ? x.today : null);
  const lede = d.lede && d.lede.headline && !hasRawPrice(d.lede.headline)
    ? { headline: String(d.lede.headline), dek: withoutPrices(d.lede.dek), ini: String(d.lede.ini || '').toUpperCase().slice(0, 3) }
    : null;

  const usable = [];
  for (const s of Array.isArray(d.stories) ? d.stories : []) {
    if (!s || !s.headline || hasRawPrice(s.headline)) continue;
    const url = safeUrl(s.url);
    if (!url) continue;   // every fact links its source
    const who = String(s.who || (Array.isArray(s.people) && s.people[0]) || '').trim();
    const slug = who ? slugForName(who, idx) : null;
    usable.push({
      headline: String(s.headline), summary: withoutPrices(s.move), source: String(s.source || 'Source'), url,
      who, slug, initials: initialsOf(who), portrait: slug && idx.slugs.has(slug) ? slug : null,
      company: String(s.via || ''), sector: String(s.sector || ''), type: String(s.type || ''),
      direction: ['up', 'down', 'flat'].includes(s.direction) ? s.direction : null,
      why: withoutPrices(s.why), bear: withoutPrices(s.bear), read: withoutPrices(s.read), watch: withoutPrices(s.watch)
    });
  }
  // the lede's person: the first story whose person has the lede's initials AND whose surname is in the lede text
  const ledeText = lede ? `${lede.headline} ${lede.dek}`.toLowerCase() : '';
  const ledeIdx = lede && lede.ini ? usable.findIndex(s => s.who && initialsVariants(s.who).has(lede.ini)
    && surnameIn(s.who, ledeText)) : -1;
  const stories = usable.slice(0, max);
  if (ledeIdx >= max && max > 0) stories[max - 1] = usable[ledeIdx];
  const coverStory = ledeIdx >= 0 ? usable[ledeIdx] : null;
  const rest = stories.filter(s => s !== coverStory);
  const face = rest.find(s => s.portrait) || null;
  const gallery = rest.filter(s => s !== face);

  const quickHits = (Array.isArray(d.quickHits) ? d.quickHits : []).map(withoutPrices).filter(Boolean).slice(0, 6);
  const swing = buildSwing(x.leaderboards, x.latest, iso, idx);
  const launch = x.launch && typeof x.launch === 'object' ? x.launch : {};
  const seasonStart = ISO_RE.test(String(launch.seasonStart || '')) ? launch.seasonStart : null;
  const game = {
    seasonStart, seasonLabel: launch.seasonStartLabel ? String(launch.seasonStartLabel) : null,
    started: Boolean(seasonStart && iso && iso >= seasonStart),
    manageLink: launch.briefSignup === true
  };
  const shown = [coverStory, ...rest].filter(Boolean);
  const faces = new Set([...shown.map(s => normName(s.who)).filter(Boolean),
    ...(swing ? [...swing.up, ...swing.down].map(r => normName(r.name)) : [])]).size;
  return {
    date: String(d.date || ''), iso, lede, stories: shown, enough: shown.length >= min,
    cover: lede ? { story: coverStory, name: coverStory ? coverStory.who : null, portrait: coverStory ? coverStory.portrait : null,
      initials: coverStory ? coverStory.initials : lede.ini } : null,
    face, gallery, quickHits, swing, game, faces
  };
}

// ---------------------------------------------------------------- HTML pieces
const D = "'Barlow Condensed','Arial Narrow',Impact,'Arial Black',Arial,sans-serif";
const B = "Barlow,'Helvetica Neue',Helvetica,Arial,sans-serif";
const INK = '#121417', MUTED = '#555C66', LINE = '#DCDFE3', RED = '#C1231E', BRAND = '#D62D27', LINK = '#1F56B8',
  GREEN = '#08764A', BAR = '#0B0B0C', CARD = '#FFFFFF', PAGE = '#E4E5E8', TINT = '#F4F5F7',
  FRAME = '#0F3D2E', GOLD = '#C9A227', ONINK_MUTED = '#B9BFC7';
const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const e = escapeHtml;
const NUM_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const label = (txt, color = MUTED, cls = 'mu', pad = '') =>
  `<div class="${cls}" style="${pad}font-family:${D};font-weight:800;font-size:13px;line-height:14px;letter-spacing:2px;text-transform:uppercase;color:${color};">${txt}</div>`;
const gap = () => `<tr><td class="pg" height="14" bgcolor="${PAGE}" style="background:${PAGE};height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
const pill = (txt, bg, color = '#FFFFFF', extra = '') =>
  `<table ${T} style="border-collapse:separate;${extra}"><tr><td bgcolor="${bg}" style="background:${bg};border-radius:3px;padding:5px 10px;font-family:${D};font-weight:800;font-size:14px;line-height:14px;letter-spacing:2px;color:${color};white-space:nowrap;">${txt}</td></tr></table>`;
const DIR = { up: [GREEN, '&#9650; UP'], down: [RED, '&#9660; DOWN'], flat: [MUTED, '&#9656; FLAT'] };
const dirChip = d => {
  const m = DIR[d];
  return m ? `<table ${T} style="border-collapse:separate;"><tr><td bgcolor="${m[0]}" style="background:${m[0]};border-radius:3px;padding:4px 8px;font-family:${D};font-weight:800;font-size:13px;line-height:14px;letter-spacing:1px;color:#FFFFFF;white-space:nowrap;">${m[1]}</td></tr></table>` : '';
};
const link = (href, txt, color = LINK, cls = 'lk', extra = '') =>
  `<a href="${e(href)}" class="${cls}" style="color:${color};font-weight:700;text-decoration:underline;${extra}">${txt}</a>`;
const sourceLink = (s, color, cls) => link(s.url, `Source: ${e(s.source)}&nbsp;&#8599;`, color, cls);
const button = (href, txt, bg = BRAND) =>
  `<table ${T} style="border-collapse:separate;"><tr><td bgcolor="${bg}" style="background:${bg};border-radius:4px;mso-padding-alt:12px 20px;"><a href="${e(href)}" style="display:inline-block;padding:12px 20px;font-family:${D};font-weight:800;font-size:17px;line-height:18px;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${txt}</a></td></tr></table>`;
// initials medallion: dark-green frame with a gold disc (no picture of the person)
const medallion = (ini, name, size, disc, font, cls = '') =>
  `<table ${T} class="${cls}" width="${size}" height="${size}" bgcolor="${FRAME}" style="width:${size}px;height:${size}px;background:${FRAME};"><tr><td align="center" valign="middle"><table ${T} class="${cls ? cls + 'c' : ''}" width="${disc}" height="${disc}" bgcolor="${GOLD}" style="width:${disc}px;height:${disc}px;background:${GOLD};border-radius:50%;border-collapse:separate;"><tr><td align="center" valign="middle" role="img" aria-label="${e(name || ini)}" class="${cls ? cls + 't' : ''}" style="font-family:${D};font-weight:800;font-size:${font}px;line-height:${disc}px;letter-spacing:1px;color:#0B0B0C;">${e(ini)}</td></tr></table></td></tr></table>`;
const ALT = `color:#F1F2F4;font-family:${D};font-weight:800;font-size:16px;line-height:20px;text-align:center;background:${FRAME};`;
const sectionHead = (title, sub) => `
<tr><td class="cd px" bgcolor="${CARD}" style="background:${CARD};padding:26px 24px 6px 24px;">
<table ${T} width="100%"><tr><td width="10" bgcolor="${BRAND}" style="width:10px;background:${BRAND};font-size:0;line-height:0;">&nbsp;</td><td style="padding-left:12px;">
<div class="tx" style="font-family:${D};font-weight:800;font-size:28px;line-height:28px;letter-spacing:1px;text-transform:uppercase;color:${INK};">${title}</div>
${sub ? `<div class="mu" style="padding-top:4px;font-family:${B};font-size:13px;line-height:18px;color:${MUTED};">${sub}</div>` : ''}
</td></tr></table></td></tr>`;
const text = (t, size = 15, lh = 22, pad = 'padding-top:10px;', extra = '') =>
  `<div class="tx" style="${pad}font-family:${B};font-size:${size}px;line-height:${lh}px;color:${INK};${extra}">${e(t)}</div>`;

const placeLine = (r, seasonLabel) => !r || !(r.position > 0) ? ''
  : `You're #${Number(r.position).toLocaleString('en-US')} in line for Season 1 (opens ${seasonLabel}).`;
const unsubUrl = token => `${SITE}/unsubscribe.html?t=${encodeURIComponent(String(token || ''))}`;

// One recipient's email: { subject, html, text, headers }.
// recipient: { position, unsub_token, referral_code }; opts: { campaign: 'YYYY-MM-DD', seasonLabel, assetBase }.
// assetBase: where the portrait JPGs live (default: the live site; the dry run points it at local files).
export function buildBrief(content, recipient, opts = {}) {
  const c = content || {};
  const r = recipient || {};
  const { campaign } = opts;
  const base = String(opts.assetBase || EMAIL_PORTRAIT_BASE).replace(/\/?$/, '/');
  const img = slug => SLUG_RE.test(String(slug || '')) ? `${base}${slug}.jpg` : null;
  const U = u => withUtm(u, campaign);
  const game = c.game || {};
  const seasonLabel = opts.seasonLabel || game.seasonLabel || 'Monday, Nov 9';
  const unsub = unsubUrl(r.unsub_token);
  const full = U(`${SITE}/news.html`);
  const refUrl = r.referral_code ? U(`${SITE}/?ref=${encodeURIComponent(r.referral_code)}`) : null;
  const place = placeLine(r, seasonLabel);
  const stories = Array.isArray(c.stories) ? c.stories : [];
  const gallery = Array.isArray(c.gallery) ? c.gallery : stories.filter(s => s !== c.face && s !== (c.cover && c.cover.story));
  const quickHits = Array.isArray(c.quickHits) ? c.quickHits : [];
  const subject = `The Billionaire Brief${c.lede ? ': ' + c.lede.headline : ''}`;
  const preheader = c.lede ? c.lede.headline : (stories[0] ? stories[0].headline : 'Today in billionaire moves');
  const counts = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}${c.faces ? ` &middot; ${c.faces} ${c.faces === 1 ? 'face' : 'faces'}` : ''}`;
  const sw = c.swing;
  const h = [];   // html parts
  const t = [];   // plain-text lines

  // ---- masthead ----
  h.push(`
<tr><td bgcolor="${BAR}" class="px" style="background:${BAR};padding:16px 24px 14px 24px;font-family:${D};font-weight:800;font-size:30px;line-height:30px;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;">The Billionaire <span style="color:#FF4A42;">Brief</span></td></tr>
<tr><td bgcolor="${BRAND}" height="5" style="background:${BRAND};height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td bgcolor="${BAR}" class="px" style="background:${BAR};padding:9px 24px 10px 24px;">
<table ${T} width="100%"><tr><td valign="middle" style="font-family:${B};font-size:12px;line-height:17px;color:${ONINK_MUTED};">${e(c.date)} &middot; ${counts}</td>
<td valign="middle" align="right" style="font-family:${B};font-size:12px;line-height:17px;white-space:nowrap;padding-left:8px;"><a href="${e(full)}" style="color:#FFFFFF;text-decoration:underline;">View online</a></td></tr></table></td></tr>`);
  t.push('THE BILLIONAIRE BRIEF', `${c.date} · ${stories.length} stories${c.faces ? ` · ${c.faces} faces` : ''}`, `View online: ${full}`, '');

  // ---- the cover ----
  if (c.lede) {
    const cv = c.cover || {};
    const st = cv.story;
    const pic = cv.portrait && img(cv.portrait)
      ? `<img src="${e(img(cv.portrait))}" width="200" height="200" alt="${e(cv.name)}" style="display:block;width:200px;height:200px;border:0;${ALT}">`
      : medallion(cv.initials || c.lede.ini || '', cv.name, 184, 140, 64);
    h.push(`
<tr><td bgcolor="${BAR}" align="center" class="px" style="background:${BAR};padding:30px 24px 26px 24px;">
${pill('THE COVER', BRAND, '#FFFFFF', 'margin:0 auto;')}
<table ${T} bgcolor="#1B1C1E" style="margin:18px auto 0 auto;background:#1B1C1E;border:1px solid #3A3D42;"><tr><td style="padding:10px;font-size:0;line-height:0;">${pic}</td></tr></table>
${cv.name ? `<div style="padding-top:16px;font-family:${D};font-weight:800;font-size:28px;line-height:28px;letter-spacing:3px;text-transform:uppercase;color:#FFFFFF;">${e(cv.name)}</div>` : ''}
${st && (st.company || st.sector) ? `<div style="padding-top:5px;font-family:${B};font-size:13px;line-height:18px;letter-spacing:1px;color:${ONINK_MUTED};">${[st.company, st.sector].filter(Boolean).map(e).join(' &middot; ')}</div>` : ''}
</td></tr>
<tr><td bgcolor="${BRAND}" class="px" style="background:${BRAND};padding:24px 24px 26px 24px;">
<h1 class="h1" style="margin:0;font-family:${D};font-weight:800;font-size:58px;line-height:54px;text-transform:uppercase;color:#FFFFFF;">${e(c.lede.headline)}</h1>
${c.lede.dek ? `<p style="margin:14px 0 0 0;font-family:${B};font-size:17px;line-height:25px;color:#FFFFFF;">${e(c.lede.dek)}</p>` : ''}
</td></tr>`);
    t.push('THE COVER', ...(cv.name ? [`${cv.name}${st && st.company ? ` · ${st.company}` : ''}`] : []), c.lede.headline.toUpperCase());
    if (c.lede.dek) t.push(c.lede.dek);
    t.push('');
    if (st) {
      const op = [st.read ? `<span class="tx" style="font-weight:700;color:${INK};">${e(st.read)}${/[.!?]$/.test(st.read) ? '' : '.'}</span>` : '',
        st.why ? `<span class="tx" style="color:${INK};">${e(st.why)}</span>` : ''].filter(Boolean).join(' ');
      h.push(`
<tr><td class="cd px" bgcolor="${CARD}" style="background:${CARD};padding:20px 24px 22px 24px;">
${label(`The move &middot; ${e(st.headline)}`, RED, 'rd')}
${st.summary ? text(st.summary, 20, 27, 'padding-top:8px;', 'font-weight:700;') : ''}
<div style="padding-top:8px;font-family:${B};font-size:14px;line-height:20px;">${sourceLink(st)}</div>
${op ? `<table ${T} width="100%" style="margin-top:14px;"><tr><td class="tint" bgcolor="${TINT}" style="background:${TINT};border-left:4px solid ${BRAND};padding:10px 12px;font-family:${B};font-size:14px;line-height:20px;">
<span class="mu" style="font-family:${D};font-weight:800;font-size:13px;letter-spacing:2px;color:${MUTED};">OUR READ &middot; OPINION</span><br>${op}</td></tr></table>` : ''}
</td></tr>`);
      t.push(`THE MOVE · ${st.headline}`);
      if (st.summary) t.push(st.summary);
      t.push(`Source: ${st.source} ${st.url}`);
      if (st.read || st.why) t.push(`Our read (opinion): ${[st.read, st.why].filter(Boolean).join(' · ')}`);
      t.push('');
    }
  }

  // ---- face of the day ----
  const f = c.face;
  let no = 1;
  if (f && img(f.portrait)) {
    const meta = [f.company, f.sector, f.type].filter(Boolean);
    const ops = [['Why it matters &middot; Opinion', f.why, 15, 22, B], ['The other side &middot; Opinion', f.bear, 15, 22, B], ['Our read &middot; Opinion', f.read, 22, 24, D]]
      .filter(o => o[1]);
    h.push(gap(), `
<tr><td bgcolor="${BAR}" class="px" style="background:${BAR};padding:22px 24px 0 24px;">
<table ${T} width="100%"><tr><td valign="middle">${pill('FACE OF THE DAY', GOLD, '#0B0B0C')}</td>
<td valign="middle" align="right" style="font-family:${D};font-weight:800;font-size:14px;line-height:14px;letter-spacing:2px;color:${ONINK_MUTED};">No. 01</td></tr></table></td></tr>
<tr><td bgcolor="${BAR}" class="px" style="background:${BAR};padding:16px 24px 0 24px;">
<table ${T} width="100%"><tr><td bgcolor="${FRAME}" style="background:${FRAME};font-size:0;line-height:0;"><img src="${e(img(f.portrait))}" width="552" height="552" alt="${e(f.who)}" class="full" style="display:block;width:100%;max-width:552px;height:auto;border:0;${ALT}font-size:24px;"></td></tr></table></td></tr>
<tr><td bgcolor="${BAR}" class="px" style="background:${BAR};padding:14px 24px 18px 24px;">
<table ${T} width="100%"><tr><td valign="middle" class="h2" style="font-family:${D};font-weight:800;font-size:40px;line-height:38px;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;">${e(f.who)}</td>
<td valign="middle" align="right" width="1" style="padding-left:10px;">${dirChip(f.direction)}</td></tr></table>
${meta.length ? `<div style="padding-top:5px;font-family:${B};font-size:13px;line-height:18px;letter-spacing:1px;color:${ONINK_MUTED};">${meta.map(e).join(' &middot; ')}</div>` : ''}
</td></tr>
<tr><td class="cd px" bgcolor="${CARD}" style="background:${CARD};padding:20px 24px 24px 24px;">
<h2 class="tx" style="margin:0;font-family:${D};font-weight:800;font-size:30px;line-height:31px;color:${INK};">${e(f.headline)}</h2>
${label('The move', RED, 'rd', 'padding-top:14px;')}
${f.summary ? text(f.summary, 16, 24, 'padding-top:6px;') : ''}
<div style="padding-top:8px;font-family:${B};font-size:14px;line-height:20px;">${sourceLink(f)}</div>
${ops.length ? `<table ${T} width="100%" style="margin-top:16px;"><tr><td class="tint" bgcolor="${TINT}" style="background:${TINT};border-left:4px solid ${GOLD};padding:14px;">
${ops.map((o, i) => `${label(o[0], MUTED, 'mu', i ? 'padding-top:12px;' : '')}<div class="tx" style="padding-top:5px;font-family:${o[4]};${o[4] === D ? 'font-weight:800;' : ''}font-size:${o[2]}px;line-height:${o[3]}px;color:${INK};">${e(o[1])}</div>`).join('\n')}
</td></tr></table>` : ''}
${f.watch ? `<div class="tx" style="padding-top:14px;font-family:${B};font-size:14px;line-height:20px;color:${INK};"><strong>What to watch:</strong> ${e(f.watch)}</div>` : ''}
<div style="padding-top:16px;">${button(full, 'Read our take &rarr;')}</div>
</td></tr>`);
    no = 2;
    t.push('FACE OF THE DAY', `${f.who}${f.direction ? ` (${f.direction.toUpperCase()})` : ''}${meta.length ? ` · ${meta.join(' · ')}` : ''}`, f.headline);
    if (f.summary) t.push(`The move: ${f.summary}`);
    t.push(`Source: ${f.source} ${f.url}`);
    if (f.why) t.push(`Why it matters (opinion): ${f.why}`);
    if (f.bear) t.push(`The other side (opinion): ${f.bear}`);
    if (f.read) t.push(`Our read (opinion): ${f.read}`);
    if (f.watch) t.push(`What to watch: ${f.watch}`);
    t.push(`Read our take: ${full}`, '');
  }

  // ---- the daily swing ----
  if (sw && (sw.up.length || sw.down.length)) {
    const K = {
      up: { accent: GREEN, onDark: '#4FD99B', cls: 'gn', arrow: '&#9650;', label: 'UP', sub: 'Biggest est. gains', rows: sw.up },
      down: { accent: RED, onDark: '#FF7A73', cls: 'rd', arrow: '&#9660;', label: 'DOWN', sub: 'Biggest est. drops', rows: sw.down }
    };
    const avatar = (row, size, ring) => row.portrait && img(row.portrait)
      ? `<img src="${e(img(row.portrait))}" width="${size}" height="${size}" alt="${e(row.name)}" style="display:block;${size > 60 ? 'margin:0 auto;' : ''}width:${size}px;height:${size}px;border-radius:50%;border:${ring};background:${FRAME};color:#F1F2F4;font-family:${B};font-size:${size > 60 ? 12 : 8}px;line-height:${size > 60 ? 14 : 10}px;text-align:center;">`
      : `<table ${T} width="${size}" height="${size}" bgcolor="${GOLD}" style="${size > 60 ? 'margin:0 auto;' : ''}width:${size}px;height:${size}px;background:${GOLD};border-radius:50%;border:${ring};border-collapse:separate;"><tr><td align="center" valign="middle" role="img" aria-label="${e(row.name)}" style="font-family:${D};font-weight:800;font-size:${Math.round(size * 0.38)}px;line-height:${size}px;letter-spacing:1px;color:#0B0B0C;">${e(row.initials)}</td></tr></table>`;
    const tick = (row, big) => {
      if (row.pct == null) return `<span style="font-family:${D};font-weight:800;font-size:${big ? 14 : 12}px;letter-spacing:1px;color:${big ? '#FFFFFF' : MUTED};" class="${big ? '' : 'mu'}">${e(row.ticker)}</span>`;
      const col = row.pct > 0 ? GREEN : row.pct < 0 ? RED : MUTED;
      const ar = row.pct > 0 ? '&#9650;' : row.pct < 0 ? '&#9660;' : '&#9656;';
      return `<span style="display:inline-block;background:${col};border-radius:3px;padding:${big ? '4px 8px' : '2px 6px'};font-family:${D};font-weight:800;font-size:${big ? 14 : 12}px;line-height:${big ? 15 : 13}px;letter-spacing:1px;color:#FFFFFF;white-space:nowrap;">${e(row.ticker)} ${ar}${Math.abs(row.pct).toFixed(1)}%</span>`;
    };
    const fil = (row, color, cls) => link(row.filing, `${e(row.filingLabel)}&nbsp;&#8599;`, color, cls, `font-family:${B};font-size:12px;line-height:16px;white-space:nowrap;`);
    const nameEl = (row, style) => row.profile
      ? `<a href="${e(U(row.profile))}" ${style}>${e(row.name)}</a>` : `<div ${style}>${e(row.name)}</div>`;
    const swRow = (row, i, k, max, last) => {
      const pct = Math.max(4, Math.round((Math.abs(row.est) / max) * 100));
      return `<tr><td class="ln" style="padding:12px 0 ${last ? 4 : 12}px 0;${last ? '' : `border-bottom:1px solid ${LINE};`}">
<table ${T} width="100%"><tr><td width="56" valign="top" style="width:56px;padding:0 10px 0 0;">${avatar(row, 48, `2px solid ${k.accent}`)}</td>
<td valign="top">${label(`No. ${i + 1}`, MUTED, 'mu')}
${nameEl(row, `class="tx" style="display:block;padding-top:3px;font-family:${D};font-weight:800;font-size:18px;line-height:19px;text-transform:uppercase;color:${INK};text-decoration:none;"`)}
<div style="padding-top:5px;">${tick(row, false)} &nbsp;${fil(row, LINK, 'lk')}</div></td>
<td valign="top" align="right" class="${k.cls} est" style="padding-left:8px;font-family:${D};font-weight:800;font-size:24px;line-height:24px;color:${k.accent};white-space:nowrap;">${e(row.estText)}</td></tr></table>
<table ${T} width="100%" style="margin-top:9px;table-layout:fixed;"><tr><td width="${pct}%" height="4" bgcolor="${k.accent}" style="width:${pct}%;height:4px;background:${k.accent};font-size:0;line-height:0;">&nbsp;</td><td class="tint" height="4" bgcolor="${TINT}" style="height:4px;background:${TINT};font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>`;
    };
    const block = (k, width) => {
      const top = k.rows[0];
      const max = Math.abs(top.est);
      return `
<td class="swc" width="${width}" valign="top" style="padding:6px;">
<table ${T} width="100%" style="border-collapse:collapse;">
<tr><td bgcolor="${k.accent}" style="background:${k.accent};padding:9px 14px;"><table ${T} width="100%"><tr>
<td valign="middle" style="font-family:${D};font-weight:800;font-size:24px;line-height:24px;letter-spacing:2px;color:#FFFFFF;">${k.arrow} ${k.label}</td>
<td valign="middle" align="right" style="font-family:${D};font-weight:700;font-size:13px;line-height:14px;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;">${k.sub}</td></tr></table></td></tr>
<tr><td bgcolor="${BAR}" align="center" style="background:${BAR};padding:18px 14px 16px 14px;border-bottom:4px solid ${k.accent};">
<div style="font-family:${D};font-weight:800;font-size:12px;line-height:12px;letter-spacing:3px;color:${GOLD};padding-bottom:10px;">NO. 1 MOVER</div>
${avatar(top, 120, `4px solid ${k.accent}`)}
${nameEl(top, `style="display:block;padding-top:12px;font-family:${D};font-weight:800;font-size:24px;line-height:25px;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;"`)}
<div class="big" style="padding-top:6px;font-family:${D};font-weight:800;font-size:56px;line-height:54px;color:${k.onDark};white-space:nowrap;">${e(top.estText)}</div>
<div style="padding-top:2px;font-family:${B};font-size:12px;line-height:16px;letter-spacing:1px;color:${ONINK_MUTED};">est. change</div>
<div style="padding-top:10px;">${tick(top, true)} &nbsp;${fil(top, '#9CC0FF', '')}</div>
</td></tr>
${k.rows.length > 1 ? `<tr><td class="cd" bgcolor="${CARD}" style="background:${CARD};padding:4px 2px 0 2px;"><table ${T} width="100%">
<tr><td style="padding:8px 0 0 0;"><table ${T} width="100%"><tr><td>${label(`Next ${NUM_WORDS[k.rows.length - 1] ? NUM_WORDS[k.rows.length - 1].toLowerCase() : k.rows.length - 1}`)}</td><td align="right">${label('Est. change')}</td></tr></table></td></tr>
${k.rows.slice(1).map((row, i) => swRow(row, i + 1, k, max, i === k.rows.length - 2)).join('')}
</table></td></tr>` : ''}
</table></td>`;
    };
    const blocks = ['up', 'down'].filter(d => K[d].rows.length);
    h.push(gap(), sectionHead('The Daily Swing', `Biggest estimated one-day moves in public stakes${sw.priceDay ? ` &middot; ${e(sw.priceDay)} close` : ''}`), `
<tr><td class="cd gridpad" bgcolor="${CARD}" style="background:${CARD};padding:8px 12px 4px 12px;"><table ${T} width="100%"><tr>${blocks.map(d => block(K[d], blocks.length === 2 ? '50%' : '100%')).join('')}</tr></table></td></tr>
<tr><td class="cd px" bgcolor="${CARD}" style="background:${CARD};padding:8px 24px 24px 24px;">
<div class="mu" style="font-family:${B};font-size:13px;line-height:19px;color:${MUTED};">${e(sw.method)}</div>
<div style="padding-top:6px;font-family:${B};font-size:14px;line-height:20px;">${link(U(sw.methodLink), 'How we estimate &rarr;')}</div>
</td></tr>`);
    t.push('THE DAILY SWING', `Biggest estimated one-day moves in public stakes${sw.priceDay ? ` · ${sw.priceDay} close` : ''}`);
    for (const d of blocks) {
      t.push(d === 'up' ? 'UP: biggest est. gains' : 'DOWN: biggest est. drops');
      K[d].rows.forEach((row, i) => t.push(`${i + 1}. ${row.name} ${row.estText} est. · ${row.ticker}${row.pct == null ? '' : ` ${row.pct > 0 ? '+' : row.pct < 0 ? '−' : ''}${Math.abs(row.pct).toFixed(1)}%`} · ${row.filingLabel}: ${row.filing}`));
    }
    t.push(sw.method, `How we estimate: ${U(sw.methodLink)}`, '');
  }

  // ---- the gallery ----
  if (gallery.length) {
    const card = s => {
      const n = no++;
      const pic = s.portrait && img(s.portrait)
        ? `<img src="${e(img(s.portrait))}" width="276" height="276" alt="${e(s.who)}" style="display:block;width:100%;max-width:276px;height:auto;border:0;${ALT}">`
        : medallion(s.initials || '?', s.who, 276, 176, 72, 'med');
      const meta = [s.company, s.type].filter(Boolean);
      return `
<td class="col" width="50%" valign="top" style="padding:6px;">
<table ${T} class="cd" width="100%" bgcolor="${CARD}" style="background:${CARD};border-collapse:collapse;border:1px solid ${LINE};"><tr>
<td class="pic" bgcolor="#FFFFFF" align="center" valign="top" style="display:block;width:100%;background:#FFFFFF;padding:0;font-size:0;line-height:0;">${pic}</td>
<td class="txt" valign="top" style="display:block;padding:14px 16px 18px 16px;">
${label(`No. ${String(n).padStart(2, '0')}${s.sector ? ` &middot; ${e(s.sector)}` : ''}`)}
<table ${T} width="100%" style="margin-top:6px;"><tr><td valign="middle" class="tx nm" style="font-family:${D};font-weight:800;font-size:24px;line-height:24px;text-transform:uppercase;color:${INK};">${e(s.who || s.company)}</td>
<td valign="middle" align="right" width="1" class="chip" style="padding-left:8px;">${dirChip(s.direction)}</td></tr></table>
${meta.length ? `<div class="mu" style="padding-top:3px;font-family:${B};font-size:13px;line-height:18px;color:${MUTED};">${meta.map(e).join(' &middot; ')}</div>` : ''}
${text(s.summary || s.headline, 15, 22)}
<div style="padding-top:10px;font-family:${B};font-size:14px;line-height:22px;">${sourceLink(s)}</div>
<div style="padding-top:2px;font-family:${B};font-size:14px;line-height:22px;"><a href="${e(full)}" class="rd" style="color:${RED};font-weight:700;text-decoration:none;">Read our take &rarr;</a></div>
</td></tr></table></td>`;
    };
    const rows = [];
    for (let i = 0; i < gallery.length; i += 2) {
      rows.push(`<tr>${card(gallery[i])}${gallery[i + 1] ? card(gallery[i + 1]) : '<td class="col" width="50%" style="padding:6px;"></td>'}</tr>`);
    }
    const n = gallery.length;
    h.push(gap(), sectionHead('The Gallery', `${NUM_WORDS[n] || n} more ${n === 1 ? 'story' : 'stories'} from today&rsquo;s edition. Facts first, with the source under each.`), `
<tr><td class="cd gridpad" bgcolor="${CARD}" style="background:${CARD};padding:8px 12px 14px 12px;"><table ${T} width="100%">${rows.join('')}</table></td></tr>`);
    t.push('THE GALLERY');
    for (const s of gallery) {
      t.push(`${s.who ? s.who + ' · ' : ''}${s.headline}${s.direction ? ` (${s.direction.toUpperCase()})` : ''}`);
      if (s.summary) t.push(s.summary);
      t.push(`Source: ${s.source} ${s.url}`, '');
    }
  }

  // ---- quick hits ----
  if (quickHits.length) {
    h.push(gap(), sectionHead('Quick Hits', link(full, 'From the full edition', LINK, 'lk', 'font-weight:400;')), `
<tr><td class="cd px" bgcolor="${CARD}" style="background:${CARD};padding:8px 24px 22px 24px;"><table ${T} width="100%">
${quickHits.map((q, i) => `<tr><td valign="top" width="22" style="width:22px;padding:${i ? 14 : 10}px 0 0 0;"><table ${T}><tr><td width="10" height="10" bgcolor="${BRAND}" style="width:10px;height:10px;background:${BRAND};font-size:0;line-height:0;">&nbsp;</td></tr></table></td>
<td valign="top" class="tx ln" style="padding:${i ? 8 : 4}px 0 ${i === quickHits.length - 1 ? 0 : 8}px 0;${i === quickHits.length - 1 ? '' : `border-bottom:1px solid ${LINE};`}font-family:${B};font-size:15px;line-height:22px;color:${INK};">${e(q)}</td></tr>`).join('\n')}
</table></td></tr>`);
    t.push('QUICK HITS', ...quickHits.map(q => `- ${q}`), `From the full edition: ${full}`, '');
  }

  // ---- the game ----
  const playNote = 'Play money only: no purchases, cash-out or prizes.';
  const muted = (s, pad = 'padding-top:12px;') => `<div style="${pad}font-family:${B};font-size:13px;line-height:18px;color:${ONINK_MUTED};">${s}</div>`;
  let gameBody;
  if (game.started) {
    const play = U(`${SITE}/team.html`);
    gameBody = `${label('Season 1 is on', GOLD, '')}
<div style="padding-top:8px;font-family:${B};font-size:15px;line-height:22px;color:#FFFFFF;">Pick your team for this week.</div>
<div style="padding-top:14px;">${button(play, 'Play this week &rarr;')}</div>`;
    t.push('THE FANTASY GAME', 'Season 1 is on. Pick your team for this week.', `Play this week: ${play}`);
  } else {
    const spot = U(`${SITE}/`);
    gameBody = `${label(`Season 1 opens ${e(seasonLabel)}`, GOLD, '')}
${r.position > 0 ? `<div style="padding-top:6px;font-family:${D};font-weight:800;font-size:64px;line-height:60px;color:#FFFFFF;">#${Number(r.position).toLocaleString('en-US')}</div>
<div style="font-family:${B};font-size:14px;line-height:20px;color:${ONINK_MUTED};">your place in line for Season 1</div>`
      : `<div style="padding-top:8px;font-family:${B};font-size:15px;line-height:22px;color:#FFFFFF;">The game is open for preseason.</div>`}
${refUrl ? `<div style="padding-top:12px;font-family:${B};font-size:14px;line-height:20px;color:#FFFFFF;">Each friend who confirms moves you up. Your link: <a href="${e(refUrl)}" style="color:#FFFFFF;text-decoration:underline;">${e(SITE.replace(/^https:\/\//, ''))}/?ref=${e(r.referral_code)}</a></div>` : ''}
<div style="padding-top:14px;">${button(spot, 'See your spot &rarr;')}</div>`;
    t.push('YOUR SPOT IN THE FANTASY GAME', `Season 1 opens ${seasonLabel}.`);
    if (place) t.push(place); else t.push('The game is open for preseason.');
    if (refUrl) t.push(`Each friend who confirms moves you up. Your link: ${refUrl}`);
    t.push(`See your spot: ${spot}`);
  }
  t.push(playNote, '');
  h.push(gap(), `
<tr><td bgcolor="${BRAND}" class="px" style="background:${BRAND};padding:10px 24px;font-family:${D};font-weight:800;font-size:16px;line-height:18px;letter-spacing:2px;color:#FFFFFF;">${game.started ? 'THE FANTASY GAME' : 'YOUR SPOT IN THE FANTASY GAME'}</td></tr>
<tr><td bgcolor="${BAR}" class="px" style="background:${BAR};padding:22px 24px 24px 24px;">${gameBody}${muted(e(playNote))}</td></tr>`);

  // ---- full edition + footer ----
  const manage = game.manageLink ? U(`${SITE}/account.html`) : null;
  h.push(gap(), `
<tr><td class="cd px" bgcolor="${CARD}" align="center" style="background:${CARD};padding:22px 24px;"><table ${T} style="margin:0 auto;"><tr><td>${button(full, 'Read today&rsquo;s full edition &rarr;')}</td></tr></table></td></tr>
<tr><td bgcolor="${BRAND}" height="5" style="background:${BRAND};height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td bgcolor="${BAR}" class="px" style="background:${BAR};padding:22px 24px 28px 24px;font-family:${B};font-size:13px;line-height:20px;color:${ONINK_MUTED};">
<div style="font-family:${D};font-weight:800;font-size:20px;line-height:20px;letter-spacing:1px;color:#FFFFFF;">THE BILLIONAIRE <span style="color:#FF4A42;">BRIEF</span></div>
<p style="margin:12px 0 0 0;color:#FFFFFF;">For information only &middot; not financial advice. Free to play &middot; bragging rights only.</p>
<p style="margin:8px 0 0 0;">You get this because you asked for The Billionaire Brief on Billionaires Digest.</p>
<p style="margin:10px 0 0 0;"><a href="${e(unsub)}" style="color:#FFFFFF;text-decoration:underline;">Unsubscribe</a>${manage ? ` &nbsp;&middot;&nbsp; <a href="${e(manage)}" style="color:#FFFFFF;text-decoration:underline;">Manage email settings</a>` : ''}</p>
<p style="margin:10px 0 0 0;">Billionaires Digest &middot; <a href="mailto:${CONTACT_EMAIL}" style="color:#FFFFFF;text-decoration:underline;">${CONTACT_EMAIL}</a></p>
<p style="margin:10px 0 0 0;font-size:12px;line-height:17px;">Portraits are painted illustrations, not photographs.</p>
</td></tr>`);
  t.push(`Read today's full edition: ${full}`, '', 'For information only · not financial advice. Free to play · bragging rights only.',
    'You get this because you asked for The Billionaire Brief on Billionaires Digest.', `Unsubscribe: ${unsub}`);
  if (manage) t.push(`Manage email settings: ${manage}`);
  t.push(`Billionaires Digest · ${CONTACT_EMAIL}`, 'Portraits are painted illustrations, not photographs.');

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${e(subject)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;600;700&display=swap');
body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;}
a{word-break:break-word;overflow-wrap:anywhere;}
@media (max-width:620px){
.wrap{width:100%!important;}
.px{padding-left:16px!important;padding-right:16px!important;}
.gridpad{padding-left:10px!important;padding-right:10px!important;}
.col{display:block!important;width:100%!important;box-sizing:border-box;}
.pic{display:table-cell!important;width:104px!important;vertical-align:top!important;background:transparent!important;padding:14px 0 0 14px!important;}
.pic img{width:104px!important;height:104px!important;max-width:104px!important;}
.txt{display:table-cell!important;padding:12px 12px 14px 14px!important;}
.med{width:104px!important;height:104px!important;}
.medc{width:74px!important;height:74px!important;}
.medt{font-size:30px!important;line-height:74px!important;}
.h1{font-size:46px!important;line-height:44px!important;}
.h2{font-size:32px!important;line-height:32px!important;}
.full{width:100%!important;height:auto!important;}
}
@media (max-width:599px){.swc{display:block!important;width:100%!important;box-sizing:border-box;}}
@media (max-width:420px){
.nm{display:block!important;font-size:20px!important;line-height:21px!important;}
.chip{display:block!important;width:auto!important;padding:6px 0 0 0!important;text-align:left!important;}
.est{font-size:20px!important;line-height:20px!important;}
.big{font-size:44px!important;line-height:44px!important;}
.h1{font-size:40px!important;line-height:39px!important;}
}
@media (prefers-color-scheme:dark){
.pg{background:#0E0F10!important;}
.cd{background:#1D1F22!important;border-color:#33373C!important;}
.tint{background:#25282C!important;}
.tx{color:#F1F2F4!important;}
.mu{color:#A9B0B9!important;}
.rd{color:#FF6B64!important;}
.gn{color:#4FD99B!important;}
.lk{color:#8AB4FF!important;}
.ln{border-color:#33373C!important;}
}
</style>
</head>
<body class="pg" style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE};opacity:0;">${e(preheader)}${'&zwnj;&nbsp;'.repeat(30)}</div>
<table ${T} class="pg" width="100%" bgcolor="${PAGE}" style="background:${PAGE};"><tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table ${T} class="wrap" width="600" style="width:600px;max-width:600px;">
${h.join('\n')}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>
`;

  return {
    subject,
    html,
    text: t.join('\n') + '\n',
    // No List-Unsubscribe-Post (one-click): unsubscribe.html is a static page and cannot take a POST.
    headers: { 'List-Unsubscribe': `<${unsub}>` }
  };
}

// New York calendar date, YYYY-MM-DD
export function nyDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
