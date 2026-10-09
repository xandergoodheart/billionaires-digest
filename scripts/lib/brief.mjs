// "The Billionaire Brief": pure builders for the waitlist email (no network, no file access).
// Content comes only from fields already in digest.json (lede headline/dek, story headline/move/source/url).
// No new facts are written here. Sentences quoting a raw stock/share price (e.g. "$236.13") are left out;
// fortune and deal sizes ("$204.5 billion") stay.

export const SITE = 'https://billionairesdigest.com';
export const CONTACT_EMAIL = 'hello@billionairesdigest.com';

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

// What goes in the Brief, picked from a digest object.
export function briefContent(digest, { min = 3, max = 5 } = {}) {
  const d = digest || {};
  const lede = d.lede && d.lede.headline && !hasRawPrice(d.lede.headline)
    ? { headline: String(d.lede.headline), dek: withoutPrices(d.lede.dek) }
    : null;
  const stories = [];
  for (const s of Array.isArray(d.stories) ? d.stories : []) {
    if (stories.length >= max) break;
    if (!s || !s.headline || hasRawPrice(s.headline)) continue;
    const url = safeUrl(s.url);
    if (!url) continue;   // every fact links its source
    stories.push({ headline: String(s.headline), summary: withoutPrices(s.move), source: String(s.source || 'Source'), url });
  }
  return { date: String(d.date || ''), lede, stories, enough: stories.length >= min };
}

const unsubUrl = token => `${SITE}/unsubscribe.html?t=${encodeURIComponent(String(token || ''))}`;

function placeLine(r, seasonLabel) {
  if (!r || !(r.position > 0)) return '';
  return `You're #${Number(r.position).toLocaleString('en-US')} in line for Season 1 (opens ${seasonLabel}).`;
}

// One recipient's email: { subject, html, text, headers }.
// recipient: { position, unsub_token, referral_code }; campaign: 'YYYY-MM-DD'.
export function buildBrief(content, recipient, { campaign, seasonLabel = 'Monday, Nov 9' } = {}) {
  const c = content;
  const r = recipient || {};
  const unsub = unsubUrl(r.unsub_token);
  const newsUrl = withUtm(`${SITE}/news.html`, campaign);
  const refUrl = r.referral_code ? withUtm(`${SITE}/?ref=${encodeURIComponent(r.referral_code)}`, campaign) : null;
  const place = placeLine(r, seasonLabel);
  const subject = `The Billionaire Brief${c.lede ? ': ' + c.lede.headline : ''}`;

  const storyHtml = c.stories.map(s => `
    <tr><td style="padding:14px 0;border-top:1px solid #e5e5e5">
      <div style="font:700 17px/1.3 Georgia,serif;color:#111">${escapeHtml(s.headline)}</div>
      ${s.summary ? `<div style="font:15px/1.5 Arial,sans-serif;color:#333;margin-top:6px">${escapeHtml(s.summary)}</div>` : ''}
      <div style="font:13px Arial,sans-serif;margin-top:6px"><a href="${escapeHtml(s.url)}" style="color:#0a58ca">Source: ${escapeHtml(s.source)}</a></div>
    </td></tr>`).join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;padding:20px">
  <tr><td style="font:700 22px Georgia,serif;color:#111">The Billionaire Brief</td></tr>
  <tr><td style="font:13px Arial,sans-serif;color:#666;padding-bottom:10px">${escapeHtml(c.date)}</td></tr>
  ${place ? `<tr><td style="font:15px Arial,sans-serif;color:#111;background:#fff8e1;padding:10px">${escapeHtml(place)}${refUrl ? ` Each friend who confirms moves you up. Your link: <a href="${escapeHtml(refUrl)}" style="color:#0a58ca">${escapeHtml(SITE.replace(/^https:\/\//, ''))}/?ref=${escapeHtml(r.referral_code)}</a>` : ''}</td></tr>` : ''}
  ${c.lede ? `<tr><td style="padding-top:14px"><div style="font:700 20px/1.3 Georgia,serif;color:#111">${escapeHtml(c.lede.headline)}</div>${c.lede.dek ? `<div style="font:15px/1.5 Arial,sans-serif;color:#333;margin-top:6px">${escapeHtml(c.lede.dek)}</div>` : ''}</td></tr>` : ''}
  ${storyHtml}
  <tr><td style="padding:16px 0;border-top:1px solid #e5e5e5;font:15px Arial,sans-serif"><a href="${escapeHtml(newsUrl)}" style="color:#0a58ca">Read today's full edition</a></td></tr>
  <tr><td style="font:12px/1.6 Arial,sans-serif;color:#666;border-top:1px solid #e5e5e5;padding-top:12px">
    For information only &middot; not financial advice. Free to play &middot; bragging rights only.<br>
    You get this because you joined the Billionaires Digest waitlist. <a href="${escapeHtml(unsub)}" style="color:#666">Unsubscribe</a><br>
    Billionaires Digest &middot; <a href="mailto:${CONTACT_EMAIL}" style="color:#666">${CONTACT_EMAIL}</a>
  </td></tr>
</table></td></tr></table>
</body></html>
`;

  const lines = ['THE BILLIONAIRE BRIEF', c.date, ''];
  if (place) { lines.push(place); if (refUrl) lines.push(`Each friend who confirms moves you up. Your link: ${refUrl}`); lines.push(''); }
  if (c.lede) { lines.push(c.lede.headline); if (c.lede.dek) lines.push(c.lede.dek); lines.push(''); }
  for (const s of c.stories) { lines.push(s.headline); if (s.summary) lines.push(s.summary); lines.push(`Source: ${s.source} ${s.url}`, ''); }
  lines.push(`Read today's full edition: ${newsUrl}`, '', 'For information only · not financial advice. Free to play · bragging rights only.',
    `Unsubscribe: ${unsub}`, `Billionaires Digest · ${CONTACT_EMAIL}`);

  return {
    subject,
    html,
    text: lines.join('\n') + '\n',
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
