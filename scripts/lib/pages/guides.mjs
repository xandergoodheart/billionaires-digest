// Guides for the static page builder: plain-language explainers.
// Examples are pulled from our own SEC filing data (data/filings/by-person/*.json) and link to the real filings.

import { esc, safeUrl, arr, str, fmtDate } from './util.mjs';
import { txLine, sortFilings } from './render.mjs';

const EXT = 'target="_blank" rel="noopener noreferrer"';
const EDGAR_SEARCH = 'https://www.sec.gov/edgar/search/';

export const GUIDES = [
  {
    slug: 'filings-101',
    title: 'Filings 101: how to read the SEC forms behind the moves',
    short: 'Filings 101',
    blurb: 'What Form 4, Form 144, 10b5-1 plans, 13D and 13G, 13F, 8-K, S-1 and Form D are, when they are filed, and what they do and do not tell you.'
  }
];

// newest filing (by filed date) whose form matches re; prefer ones with a Form 4 summary when wantSummary
function pick(all, re, wantSummary) {
  const list = sortFilings(all.filter(f => re.test(str(f.form).toUpperCase())));
  if (wantSummary) {
    const withTx = list.find(f => f.form4 && arr(f.form4.summary).some(s => s && typeof s === 'object'));
    if (withTx) return withTx;
  }
  return list[0] || null;
}

function example(f, what) {
  if (!f) return `<p class="gex"><span class="label">From our data</span> ${esc('No ' + what + ' among the filings we track from the last 90 days.')}</p>`;
  const u = safeUrl(f.url) || safeUrl(f.indexUrl);
  const who = str(f.person);
  const bits = [];
  bits.push((who ? `<a href="/people/${esc(str(f.personSlug))}/">${esc(who)}</a>` : '') +
    (str(f.filer) && str(f.filer) !== who ? esc((who ? ' · filed by ' : '') + str(f.filer)) : ''));
  if (f.filed) bits.push(esc('filed ' + fmtDate(str(f.filed))));
  const lines = f.form4 ? arr(f.form4.summary).filter(s => s && typeof s === 'object').slice(0, 2).map(s => esc(txLine(s))) : [];
  const issuer = f.form4 && str(f.form4.issuer) ? esc('Issuer: ' + str(f.form4.issuer)) : '';
  return `<p class="gex"><span class="label">From our data</span> ${bits.filter(Boolean).join(' · ')}` +
    (issuer ? ` · ${issuer}` : '') + (lines.length ? ` · ${lines.join('; ')}` : '') +
    (u ? ` · <a href="${esc(u)}" ${EXT}>${esc('Read the filing on EDGAR ↗')}</a>` : '') + '</p>';
}

function section(id, title, parts, ex) {
  const dl = [['What it is', parts.what], ['When it’s filed', parts.when], ['What it tells you', parts.tells], ['What it doesn’t', parts.not]]
    .filter(p => p[1]).map(p => `<dt>${esc(p[0])}</dt><dd>${esc(p[1])}</dd>`).join('');
  return `<section class="gsec" aria-labelledby="${id}"><h2 class="sech2 serif" id="${id}">${esc(title)}</h2>${parts.intro ? `<p>${parts.intro}</p>` : ''}<dl class="gdl">${dl}</dl>${parts.extra || ''}${ex}</section>`;
}

// all: every filing object from data/filings/by-person/*.json
export function renderFilings101(all) {
  const f4 = pick(all, /^4(\/A)?$/, true);
  const f144 = pick(all, /^144(\/A)?$/);
  const f13d = pick(all, /13D/);
  const f13g = pick(all, /13G/);
  const f13f = pick(all, /^13F/);
  const f8k = pick(all, /^8-K/);
  const fs1 = pick(all, /^S-1(\/A)?$/);
  const fd = pick(all, /^D(\/A)?$/);

  const codes = [
    ['P', 'Open-market or private purchase', 'They bought shares with their own money. The clearest signal.'],
    ['S', 'Open-market or private sale', 'They sold. Often routine (taxes, diversification, a pre-set plan).'],
    ['A', 'Grant or award from the company', 'Pay, not a purchase. Common for directors and executives.'],
    ['M', 'Option exercise or conversion', 'Turned options or units into shares. Often paired with a sale.'],
    ['G', 'Gift', 'Shares given away, often to a family trust or charity. No money changes hands.'],
    ['F', 'Shares withheld to pay tax or the exercise price', 'The company kept some shares to cover a bill. Not a market sale.']
  ];
  const codeTable = `<div class="gtable" role="region" aria-label="Form 4 transaction codes" tabindex="0"><table><thead><tr><th scope="col">Code</th><th scope="col">Meaning</th><th scope="col">How to read it</th></tr></thead><tbody>` +
    codes.map(c => `<tr><th scope="row">${esc(c[0])}</th><td>${esc(c[1])}</td><td>${esc(c[2])}</td></tr>`).join('') +
    `</tbody></table></div>`;

  const secs = [
    section('form-4', 'Form 4: insider trades', {
      what: 'A report of a trade by a company insider: a director, an officer, or anyone who owns more than 10% of a company’s shares.',
      when: 'Within 2 business days of the trade.',
      tells: 'Who traded, which shares, how many, at what price, and how many they hold afterwards. A letter code says what kind of trade it was.',
      not: 'Why they traded. A sale is often routine, and big holders frequently sell on a pre-set schedule (see 10b5-1 plans below).',
      extra: codeTable
    }, example(f4, 'Form 4 filings')),
    section('form-144', 'Form 144: planned sales', {
      what: 'A notice that an insider or other “affiliate” plans to sell restricted or control shares.',
      when: 'On or before the day the sale order is placed, when the planned sales in a 3-month period are over 5,000 shares or $50,000.',
      tells: 'That a sale is coming, roughly how many shares, and through which broker.',
      not: 'That the sale happened. The trade itself shows up later on a Form 4, and the planned amount can differ from what is actually sold.'
    }, example(f144, 'Form 144 notices')),
    section('10b5-1', '10b5-1 plans: pre-set trading schedules', {
      what: 'A written plan, set up in advance, that trades shares automatically on a schedule or at set prices. It lets insiders sell (or buy) even when they later learn private news.',
      when: 'The plan itself is not filed with the SEC. Trades made under it are reported on Form 4, which has a box to mark trades made under a plan. Directors and officers must wait a cooling-off period before the first trade under a new plan.',
      tells: 'That a trade was decided months earlier, so it says less about what the insider thinks today.',
      not: 'The plan’s full terms, or whether the plan was changed or cancelled before a trade.'
    }, `<p class="gex"><span class="label">From our data</span> Our filing data does not yet record the 10b5-1 box, so we can’t point to an example here.</p>`),
    section('13d-13g', 'Schedule 13D vs 13G: big stakes', {
      what: 'Reports filed by anyone who owns more than 5% of a class of a public company’s voting shares. 13D is for owners who may try to influence or control the company (activists, acquirers). 13G is a shorter form for passive owners, like index funds or founders who are not seeking change.',
      when: '13D within 5 business days of crossing 5%, with amendments for material changes. 13G deadlines are longer and depend on the type of owner.',
      tells: 'The size of the stake, and for a 13D the owner’s stated plans, such as pushing for board seats or a sale.',
      not: 'Day-to-day trading. Between amendments, the stake can change without a new filing.'
    }, example(f13d, 'Schedule 13D filings') + example(f13g, 'Schedule 13G filings')),
    section('13f', 'Form 13F: quarterly fund holdings', {
      what: 'A list of US-listed stocks and some other securities held by an investment manager that oversees $100 million or more in them.',
      when: 'Every quarter, within 45 days after the quarter ends. So the snapshot is already up to 45 days old when it is filed.',
      tells: 'What a fund (for example a billionaire’s family office or hedge fund) held at the end of the quarter, and by comparison with the last one, what it bought or sold.',
      not: 'Short positions, most non-US holdings, cash, or anything traded since the quarter ended. It is a snapshot, not a live portfolio.'
    }, example(f13f, 'Form 13F reports')),
    section('8-k', '8-K: company events', {
      what: 'A company’s report of a major event: a merger, a CEO change, a big contract, results, a bankruptcy.',
      when: 'Usually within 4 business days of the event.',
      tells: 'That something important happened, in the company’s own words, often with the press release or agreement attached.',
      not: 'Analysis. The company decides how to describe the event.'
    }, example(f8k, '8-K reports')),
    section('s-1', 'S-1: going public', {
      what: 'The registration statement a company files to sell shares to the public for the first time (an IPO).',
      when: 'Before the IPO, often with several amendments (S-1/A) as the deal takes shape.',
      tells: 'The company’s business, finances, risks, and who owns what before the listing, including founders’ and big investors’ stakes.',
      not: 'The final price or whether the IPO will happen. Those come later.'
    }, example(fs1, 'S-1 filings')),
    section('form-d', 'Form D: private raises', {
      what: 'A short notice that a company or fund sold securities privately, without a public offering.',
      when: 'Within 15 days after the first sale in the offering.',
      tells: 'That a raise happened, roughly how much was offered and sold, and some of the people running the issuer.',
      not: 'Who invested or at what valuation.'
    }, example(fd, 'Form D notices'))
  ];

  const toc = `<nav class="gtoc" aria-label="On this page"><ol>` +
    [['form-4', 'Form 4'], ['form-144', 'Form 144'], ['10b5-1', '10b5-1 plans'], ['13d-13g', '13D vs 13G'], ['13f', 'Form 13F'], ['8-k', '8-K'], ['s-1', 'S-1'], ['form-d', 'Form D']]
      .map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('') + `</ol></nav>`;

  const latest = sortFilings(all)[0];
  return {
    body: `<div class="wrap pagehead"><h1 class="serif">Filings 101</h1><p>Most of what the world’s richest people do with public companies shows up first in a filing with the US Securities and Exchange Commission (SEC). Here is what each common form is, when it’s filed, and what it can and can’t tell you, with real examples from the filings we track.</p></div>
<div class="wrap pagebody gbody">
${toc}
${secs.join('\n')}
<section class="gsec" aria-labelledby="find"><h2 class="sech2 serif" id="find">Find filings yourself</h2>
<p>Every filing is public on EDGAR, the SEC’s filing system. Search by person, company or form type with <a href="${EDGAR_SEARCH}" ${EXT}>EDGAR full-text search ↗</a>. Our person pages list each tracked person’s filings from the last 90 days, and our <a href="/companies/">company pages</a> show insider trades by the billionaires who hold each company.</p>
<p class="pcnote">This guide explains filings in general terms. It is for information only and is not legal or financial advice.</p>
</section>
</div>`,
    lastmod: latest ? str(latest.filed).slice(0, 10) || null : null
  };
}

export function renderGuidesIndex() {
  return `<div class="wrap pagehead"><h1 class="serif">Guides</h1><p>Plain-language explainers for reading the moves of the world’s richest people.</p></div>
<div class="wrap pagebody"><ul class="edlist">
${GUIDES.map(g => `<li class="edrow"><a href="/guides/${esc(g.slug)}/"><div><div class="eddate">Guide</div><h2 class="edh serif">${esc(g.title)}</h2><div class="edmeta">${esc(g.blurb)}</div></div></a></li>`).join('\n')}
</ul></div>`;
}

export const GUIDE_CSS = `.gbody{max-width:820px}
.gbody p{font-size:15px;line-height:1.7}
.gtoc ol{list-style:none;margin:20px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:0 4px}
.gtoc a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px 0 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none}
.gtoc a:hover{text-decoration:underline}
.gdl{margin:14px 0 0;display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 20px;font-size:15px;line-height:1.65}
.gdl dt{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);padding-top:4px}
.gdl dd{margin:0}
.gex{margin:16px 0 0;padding:10px 14px;border-left:2px solid var(--accent);background:var(--panel);font-size:13px!important;line-height:1.6!important;overflow-wrap:anywhere}
.gex .label{margin-right:6px}
.gtable{margin:16px 0 0;overflow-x:auto}
.gtable table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.5}
.gtable th,.gtable td{text-align:left;vertical-align:top;padding:8px 10px 8px 0;border-top:1px solid var(--line)}
.gtable thead th{font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:500;color:var(--muted);border-top:none}
.gtable tbody th{font-weight:600;color:var(--accent);width:44px}
@media (max-width:600px){.gdl{grid-template-columns:minmax(0,1fr);gap:2px 0}.gdl dd{margin-bottom:10px}}`;
