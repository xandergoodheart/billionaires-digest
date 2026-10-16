/* Billionaires Digest v3: the Draft room's scouting drawer (draft.html). ES5, UI only. Global: BDScout.
   Click a row in the player pool (or its name) to get to know a player without leaving the draft: portrait, name,
   nickname, sector, who they are (text already on file), what they score on, the last 10 trading days, week
   points / avg per day / cap / Public Stake Value rank, and any insider buy, upcoming earnings and "why the stock
   moved" (the same rules as the home page's Players to watch cards, shared through BDScoutCore).
   Desktop: a 420px drawer on the right; phone (< 768px): a bottom sheet. Accessible dialog: focus trap, Esc,
   focus returns to the row's name button; the page keeps its scroll position.
   BDScout.open(slug, opts) opts: {
     opener, restoreFocus(slug) -> element, list() -> [slug] (prev / next order),
     stats(slug) -> { week, avg, cap, stakeRank, stakeOf }, actions(slug) -> [{ key, label, variant, why, note,
     ariaLabel, pressed, onClick(slug, button) }], href(slug) -> full profile link }.
   Extra data loads on the first open and is cached for the page. Real data only; game only, play money, no prizes.
   Not financial advice. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, SC = window.BDScoutCore, P = window.BDPlayersCore;
  if (!window.BD || !F || !C || !SC) return;
  var el = BD.el, arr = BD.arr;
  var MINUS = '−', DAYS = 10, NS = 'http://www.w3.org/2000/svg';
  var ui = null, D = null, seq = 0;

  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function txt(s){ return document.createTextNode(s); }
  function sr(s){ return el('span', 'v2-sr', s); }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function has(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function signed(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  function visibleEl(n){ return !!n && document.contains(n) && n.getClientRects().length > 0; }
  function svgEl(tag, attrs){ var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? u : null; }
  function portraitSrc(slug){
    var Pt = window.BDPortraits, p = Pt && has(Pt, slug) ? Pt[slug] : null;
    return p ? safePath(p.img) : safePath(window.BDPortraitFallback);
  }
  function dayLabel(d){ return F.fmt.dayLabel(d); }
  function today(){ return C.nyDate(F.now()); }
  function ext(cls, text, url){
    var u = BD.safeUrl(url);
    if (!u) return null;
    var a = el('a', cls, text); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.appendChild(sr(' (opens in a new tab)'));
    return a;
  }

  // ---- data: each file once per page ----
  var cache = {};
  function once(key, fn){ if (!cache[key]) cache[key] = Promise.resolve().then(fn).then(null, function(){ return null; }); return cache[key]; }
  function optJson(u){ return once(u, function(){ return BD.getJson(u); }); }
  function profile(slug){
    return once('prof:' + slug, function(){
      return BD.loadPeople().then(function(){ var ip = BD.indexBySlug(slug); return ip && ip.hasProfile ? BD.loadProfile(slug) : null; });
    });
  }
  function ceoEntry(file, slug){ var hit = null; arr(file && file.people).forEach(function(p){ if (p && p.slug === slug) hit = p; }); return hit; }
  // the last DAYS scored trading days: this scoring week and the one before (already loaded), then older weeks
  function windowData(){
    return once('window', function(){
      var S = F.state, weeks = arr(S.index && S.index.weeks), base = -1, id = (S.sbWk && S.sbWk.week) || (S.index && S.index.currentWeek);
      for (var i = 0; i < weeks.length; i++) if (weeks[i].week === id) base = i;
      var wks = [S.sbWk, S.prevWk].filter(Boolean);
      function more(k){
        if (SC.recentDates(wks, DAYS).length >= DAYS || base - k < 0 || k > 4) return Promise.resolve();
        return F.loadWeek(weeks[base - k].week).then(function(w){ if (w) wks.push(w); return more(k + 1); }, function(){ return null; });
      }
      return more(2).then(function(){ return { wks: wks, dates: SC.recentDates(wks, DAYS) }; });
    });
  }

  // ---- build once ----
  function build(){
    if (ui) return ui;
    var root = el('div', 'sc'); root.id = 'scout';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'sc-name');
    root.hidden = true;
    var panel = el('div', 'sc__panel'); panel.tabIndex = -1;
    var bar = el('div', 'sc__bar v2-dark');
    var nav = el('div', 'sc__nav');
    var prev = btn('sc__step', null); prev.setAttribute('data-sc-key', 'prev'); prev.setAttribute('aria-label', 'Previous player');
    prev.appendChild(chev('M15 6l-6 6 6 6'));
    var next = btn('sc__step', null); next.setAttribute('data-sc-key', 'next'); next.setAttribute('aria-label', 'Next player');
    next.appendChild(chev('M9 6l6 6-6 6'));
    var pos = el('span', 'sc__pos num');
    nav.appendChild(prev); nav.appendChild(next); nav.appendChild(pos);
    bar.appendChild(nav);
    var close = btn('sc__close', 'Close'); close.setAttribute('data-sc-key', 'close'); close.setAttribute('aria-label', 'Close scouting report');
    bar.appendChild(close);
    panel.appendChild(bar);
    var head = el('div', 'sc__head v2-dark'); panel.appendChild(head);
    var body = el('div', 'sc__body'); panel.appendChild(body);
    var foot = el('div', 'sc__foot');
    var acts = el('div', 'sc__acts'); foot.appendChild(acts);
    var why = el('p', 'sc__why'); why.id = 'sc-why'; why.hidden = true; foot.appendChild(why);
    var more = el('a', 'sc__more', 'Full profile →'); more.setAttribute('data-sc-key', 'more'); foot.appendChild(more);
    panel.appendChild(foot);
    root.appendChild(panel);
    root.addEventListener('click', function(e){ if (e.target === root) api.close(); });
    close.addEventListener('click', function(){ api.close(); });
    prev.addEventListener('click', function(){ go(-1); });
    next.addEventListener('click', function(){ go(1); });
    body.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-sc-co],[data-sc-player],[data-sc-mover]') : null;
      if (!b || !D) return;
      if (b.hasAttribute('data-sc-co')) toggleCompany(b.getAttribute('data-sc-co'), false);
      else if (b.hasAttribute('data-sc-mover')){ if (D.openTk !== b.getAttribute('data-sc-mover')) toggleCompany(b.getAttribute('data-sc-mover'), true); else { var hb = ui.body.querySelector('[data-sc-co="' + D.openTk + '"]'); if (hb) hb.focus(); } }
      else { show(b.getAttribute('data-sc-player')); ui.close.focus(); var live = document.getElementById('live'); if (live){ var t = entry().name + ', ' + ui.pos.textContent; live.textContent = ''; setTimeout(function(){ live.textContent = t; }, 30); } }
    });
    acts.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-sc-act]') : null;
      if (!b || !D) return;
      var a = actions()[+b.getAttribute('data-sc-act')];
      if (a && typeof a.onClick === 'function') a.onClick(D.slug, b);
    });
    document.body.appendChild(root);
    ui = { root: root, panel: panel, prev: prev, next: next, pos: pos, close: close, head: head, body: body, acts: acts, why: why, more: more };
    return ui;
  }
  function chev(d){
    var s = svgEl('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('path', { d: d, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }

  // ---- parts ----
  function list(){ var l = null; try { l = D.opts.list ? D.opts.list() : null; } catch (e) {} return arr(l); }
  function order(){
    // the live sorted list; if this player dropped out of it (a filter changed), keep stepping through the old one
    var l = list();
    if (l.indexOf(D.slug) >= 0) D.order = l;
    return D.order || [];
  }
  function stats(){ var s = null; try { s = D.opts.stats ? D.opts.stats(D.slug) : null; } catch (e) {} return s || {}; }
  function actions(){ var a = null; try { a = D.opts.actions ? D.opts.actions(D.slug) : null; } catch (e) {} return arr(a); }
  function entry(){
    var l = arr(F.state.draftWk && F.state.draftWk.draftable);
    for (var i = 0; i < l.length; i++) if (l[i].slug === D.slug) return l[i];
    return F.person(D.slug);
  }

  function renderNav(){
    var o = order(), i = o.indexOf(D.slug);
    ui.prev.disabled = i <= 0;
    ui.next.disabled = i < 0 || i >= o.length - 1;
    ui.pos.textContent = i >= 0 ? (i + 1) + ' of ' + o.length : '';
  }
  function renderHead(){
    var box = clear(ui.head), p = entry(), pic = portraitSrc(D.slug);
    var face = el('span', 'v2-av sc__face' + (pic ? ' v2-av--pic' : ''), pic ? '' : BD.initials(p.name));
    face.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other')); face.setAttribute('aria-hidden', 'true');
    if (pic){ var im = el('img'); im.src = pic; im.alt = ''; face.appendChild(im); }
    box.appendChild(face);
    var who = el('div', 'sc__who');
    var nk = window.BDDossier && window.BDDossier.nickname ? window.BDDossier.nickname(D.slug) : null;
    if (nk) who.appendChild(el('p', 'sc__nick', nk));
    var h = el('h2', 'sc__name', p.name); h.id = 'sc-name';
    var badge = window.BDCeoBadge ? window.BDCeoBadge(p) || window.BDCeoBadge(D.slug) : null;
    if (badge) h.appendChild(badge);
    who.appendChild(h);
    who.appendChild(el('p', 'sc__sector', p.sector || 'Other'));
    var S = F.state;
    if (S.picks.indexOf(D.slug) >= 0) who.appendChild(el('span', 'sc__on', S.captain === D.slug ? 'On your team · Captain' : 'On your team'));
    box.appendChild(who);
  }
  function sec(title){ var s = el('section', 'sc-sec'); s.appendChild(el('h3', 'sc-sec__h', title)); return s; }
  function note(box, t, cls){ box.appendChild(el('p', 'sc-note' + (cls ? ' ' + cls : ''), t)); }

  function renderWho(box){
    var x = D.x, s = sec('Who they are');
    if (x.prof === undefined || x.ceos === undefined){ note(s, 'Loading…', 'v2-loading'); box.appendChild(s); return; }
    var w = SC.whoLine(x.prof, ceoEntry(x.ceos, D.slug));
    if (!w){ note(s, 'No short profile on file yet.'); box.appendChild(s); return; }
    var p = el('p', 'sc-who', w.text + ' ');
    var a = w.url ? ext('sc-src', 'Source', w.url) : null;
    if (a) p.appendChild(a);
    s.appendChild(p);
    box.appendChild(s);
  }
  function stat(dl, k, v, cls, sub){
    var d = el('div', 'sc-stat');
    d.appendChild(el('dt', 'sc-stat__k', k));
    var dd = el('dd', 'sc-stat__v num' + (cls ? ' ' + cls : ''), v);
    if (sub) dd.appendChild(el('span', 'sc-stat__sub', sub));
    d.appendChild(dd); dl.appendChild(d);
  }
  function renderStats(box){
    var st = stats(), dl = el('dl', 'sc-stats');
    var wk = F.state.sbWk;
    stat(dl, 'Week pts', st.week == null ? '—' : signed(st.week), st.week == null ? '' : numCls(st.week), wk ? (wk.practice ? 'practice week' : F.fmt.weekName(wk.week)) : 'no scored week');
    var a = st.avg == null ? null : Math.round(st.avg);
    stat(dl, 'Avg/day', a == null ? '—' : signed(a), a == null ? '' : numCls(a), 'recent days');
    stat(dl, 'Cap cost', st.cap == null ? '—' : String(st.cap), '', st.cap == null ? 'not draftable' : 'of ' + C.CAP);
    stat(dl, 'Stake rank', st.stakeRank ? '#' + st.stakeRank : '—', '', st.stakeRank ? BD.STAKE_LABEL : 'no US-listed stake');
    box.appendChild(dl);
  }
  // ---- companies: each "Scores on" row expands a company card (data/companies/about.json, one open at a time) ----
  function aboutData(){
    return once('about', function(){
      return Promise.all([BD.getJson('data/companies/about.json'), BD.getJson('data/companies/pages.json').then(null, function(){ return null; })])
        .then(function(r){ return { cos: (r[0] && r[0].companies) || {}, pages: (r[1] && r[1].pages) || {} }; });
    });
  }
  function holdersOf(tk){
    return arr(F.state.draftWk && F.state.draftWk.draftable).filter(function(p){
      return arr(p.holdings).some(function(h){ return h && h.ticker === tk; });
    }).sort(function(a, b){ return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
  }
  function coCard(h){
    var card = el('div', 'sc-co'); card.id = 'sc-co-' + h.ticker.replace(/[^A-Za-z0-9]/g, '_');
    var ab = D.x.about, e = ab && has(ab.cos, h.ticker) ? ab.cos[h.ticker] : null;
    if (ab === undefined){ note(card, 'Loading the company card…', 'v2-loading'); return card; }
    if (e && e.whatTheyDo) card.appendChild(el('p', 'sc-co__what', e.whatTheyDo));
    else card.appendChild(el('p', 'sc-note', 'No company description on file yet.'));
    var where = e ? [e.industry, e.hq].filter(Boolean).join(' · ') : '';
    if (where) card.appendChild(el('p', 'sc-co__meta', where));
    if (e && e.note && e.note.text){
      var np = el('p', 'sc-co__note', e.note.text + ' ');
      var na = ext('sc-src', 'Source', e.note.sourceUrl); if (na) np.appendChild(na);
      card.appendChild(np);
    }
    if (e && e.sourceUrl){
      var sp = el('p', 'sc-co__src', 'Source: ');
      var sa = ext('sc-src', (e.sourceName || 'source') + ' ↗', e.sourceUrl); if (sa) sp.appendChild(sa);
      card.appendChild(sp);
    }
    var who = holdersOf(h.ticker);
    if (who.length){
      var wp = el('div', 'sc-co__who');
      wp.appendChild(el('span', 'sc-co__k', 'Players who score on it: '));
      who.forEach(function(p, i){
        if (i) wp.appendChild(txt(', '));
        if (p.slug === D.slug){ wp.appendChild(el('span', 'sc-co__me', p.name)); return; }
        var b = btn('sc-co__p', p.name); b.setAttribute('data-sc-player', p.slug); b.setAttribute('data-sc-key', 'pl-' + p.slug);
        wp.appendChild(b);
      });
      card.appendChild(wp);
    }
    var slug = ab && ab.pages[h.ticker];
    if (slug && /^[a-z0-9-]+$/.test(slug)){ var ca = el('a', 'sc-co__page', 'Company page →'); ca.href = 'companies/' + slug + '/'; ca.setAttribute('data-sc-key', 'copage'); card.appendChild(ca); }
    return card;
  }
  function renderHoldings(box){
    var hs = arr(entry().holdings).filter(function(h){ return h && h.ticker; }).slice().sort(function(a, b){ return (b.weight || 0) - (a.weight || 0); });
    var s = sec('Scores on');
    if (!hs.length){ note(s, 'No listed holdings in this week\'s game file.'); box.appendChild(s); return; }
    var ul = el('ul', 'sc-hold');
    var shown = hs.slice(0, 6);
    if (D.openTk && !shown.some(function(h){ return h.ticker === D.openTk; })) shown = shown.concat(hs.filter(function(h){ return h.ticker === D.openTk; }));
    shown.forEach(function(h){
      var li = el('li', 'sc-hold__i'), open = D.openTk === h.ticker;
      var top = btn('sc-hold__row' + (open ? ' is-open' : ''), null);
      top.setAttribute('aria-expanded', open ? 'true' : 'false');
      top.setAttribute('data-sc-co', h.ticker); top.setAttribute('data-sc-key', 'co-' + h.ticker);
      top.appendChild(el('strong', 'sc-hold__tk', h.ticker));
      top.appendChild(el('span', 'sc-hold__n', h.name || h.ticker));
      var w = typeof h.weight === 'number' ? h.weight : null;
      top.appendChild(el('span', 'sc-hold__w num', w == null ? '—' : (P && P.weightPct ? P.weightPct(w) : Math.round(w * 100) + '%')));
      var chv = svgEl('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'class': 'sc-hold__chev', 'aria-hidden': 'true', focusable: 'false' });
      chv.appendChild(svgEl('path', { d: 'M4 6l4 4 4-4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      top.appendChild(chv);
      top.appendChild(sr(open ? ': hide company card' : ': show what the company does'));
      li.appendChild(top);
      if (w != null){ var bar = el('span', 'sc-hold__bar'); bar.setAttribute('aria-hidden', 'true'); var f = el('span'); f.style.width = Math.max(2, Math.min(100, w * 100)) + '%'; bar.appendChild(f); li.appendChild(bar); }
      if (open){ var card = coCard(h); top.setAttribute('aria-controls', card.id); li.appendChild(card); }
      ul.appendChild(li);
    });
    s.appendChild(ul);
    if (hs.length > shown.length) note(s, 'And ' + (hs.length - shown.length) + ' more on the full profile.');
    box.appendChild(s);
  }
  function toggleCompany(tk, focus){
    D.openTk = D.openTk === tk ? null : tk;
    if (D.openTk && D.x.about === undefined){ var token = D.seq; aboutData().then(function(v){ if (!D || D.seq !== token) return; D.x.about = v || { cos: {}, pages: {} }; renderAll(); }); }
    renderAll();
    var b = ui.body.querySelector('[data-sc-co="' + tk + '"]');
    if (b){ if (focus) b.focus(); if (b.scrollIntoView && D.openTk) b.scrollIntoView({ block: 'nearest' }); }
  }
  function renderChart(box){
    var s = sec('Recent form'), win = D.x.win;
    if (win === undefined){ note(s, 'Loading the last ' + DAYS + ' trading days…', 'v2-loading'); box.appendChild(s); return; }
    var rows = win ? SC.chartRows(win.wks, win.dates, D.slug) : [];
    if (!rows.length || !rows.some(function(r){ return r.v != null; })){ note(s, 'No scored days yet.'); box.appendChild(s); return; }
    var fig = el('figure', 'sc-chart');
    var W = 380, H = 84, pad = 4, n = rows.length, slot = W / n, bw = Math.max(6, slot - 8);
    var vals = rows.map(function(r){ return r.v; }).filter(function(v){ return v != null; });
    var hi = Math.max.apply(null, vals.concat([0])), lo = Math.min.apply(null, vals.concat([0]));
    if (hi === lo) hi = lo + 1;
    function y(v){ return pad + (hi - v) / (hi - lo) * (H - 2 * pad); }
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'class': 'sc-chart__svg', focusable: 'false', 'aria-hidden': 'true' });
    rows.forEach(function(r, i){
      if (r.v == null || r.v === 0) return;
      svg.appendChild(svgEl('path', { d: SC.barPath(i * slot + (slot - bw) / 2, bw, y(0), y(r.v)), 'class': r.v > 0 ? 'sc-chart__bar is-pos' : 'sc-chart__bar is-neg' }));
    });
    svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: y(0), y2: y(0), 'class': 'sc-chart__base' }));
    fig.appendChild(svg);
    var ax = el('div', 'sc-chart__ax'); ax.setAttribute('aria-hidden', 'true');
    ax.appendChild(el('span', null, dayLabel(rows[0].d))); ax.appendChild(el('span', null, dayLabel(rows[n - 1].d)));
    fig.appendChild(ax);
    fig.appendChild(el('figcaption', 'sc-chart__cap', 'Daily points, last ' + n + ' trading days'));
    // the same numbers as a table for screen readers
    var tw = el('div', 'v2-sr'), tb = el('table'), tbody = el('tbody');
    tb.appendChild(el('caption', null, entry().name + ': daily points, last ' + n + ' trading days'));
    rows.forEach(function(r){ var tr = el('tr'); tr.appendChild(el('th', null, dayLabel(r.d))); tr.appendChild(el('td', null, r.v == null ? 'no score' : signed(r.v))); tbody.appendChild(tr); });
    tb.appendChild(tbody); tw.appendChild(tb); fig.appendChild(tw);
    s.appendChild(fig);
    box.appendChild(s);
  }
  function signal(ul, kind, head, body, a){
    var li = el('li', 'sc-sig sc-sig--' + kind);
    li.appendChild(el('strong', 'sc-sig__h', head));
    var p = el('span', 'sc-sig__t', body);
    if (a){ p.appendChild(txt(' ')); p.appendChild(a); }
    li.appendChild(p);
    ul.appendChild(li);
  }
  function renderSignals(box){
    var x = D.x, s = sec('Watch for'), ul = el('ul', 'sc-sigs'), slug = D.slug, cut = C.addDays(today(), -14);
    var bd = SC.buyDay(F.state.days || {}, slug, cut);
    if (bd){
      var f = x.filings ? SC.buyFiling(x.filings, cut) : null;
      var tk = f && f.form4 && f.form4.ticker ? ' (' + f.form4.ticker + ')' : '';
      signal(ul, 'buy', 'Insider buy', f ? 'Form 4 purchase filed ' + dayLabel(f.filed) + tk + '.' : 'Scored an insider-buy bonus on ' + dayLabel(bd) + '.', f ? ext('sc-src', 'SEC filing', f.url) : null);
    }
    var ix = F.state.index, e = x.cal ? SC.earnings(x.cal, ix && ix.weeks, (F.state.sbWk && F.state.sbWk.week) || (ix && ix.currentWeek), slug) : null;
    if (e){ var ea = el('a', 'sc-src', 'Calendar'); ea.href = 'calendar.html'; signal(ul, 'earn', 'Earnings ' + dayLabel(e.e.date), e.e.title + '.', ea); }
    var win = x.win, tks = arr(entry().holdings).map(function(h){ return h && h.ticker; });
    var mv = x.movers && win ? SC.latestMover(x.movers, tks, win.dates, slug) : null;
    if (mv){
      var pct = typeof mv.changePct === 'number' ? ' ' + (mv.changePct > 0 ? '+' : MINUS) + Math.abs(mv.changePct).toFixed(1) + '%' : '';
      signal(ul, 'move', 'Why ' + mv.ticker + ' moved' + pct + ', ' + dayLabel(mv.date), mv.why, ext('sc-src', mv.sourceName || 'Source', mv.sourceUrl));
      var mb = btn('sc-co__p sc-sig__co', 'About ' + mv.ticker); mb.setAttribute('data-sc-mover', mv.ticker); mb.setAttribute('data-sc-key', 'mv-' + mv.ticker);
      mb.setAttribute('aria-label', 'What ' + mv.ticker + ' does: open its company card');
      ul.lastChild.appendChild(mb);
    }
    if (ul.firstChild) s.appendChild(ul);
    else if (x.cal === undefined || x.movers === undefined || x.win === undefined) note(s, 'Loading…', 'v2-loading');
    else note(s, 'No insider buy in the last 14 days, no exact earnings date this week or next, and no "why it moved" note in the last ' + DAYS + ' trading days.');
    box.appendChild(s);
  }
  function renderActs(){
    var box = clear(ui.acts), list = actions(), whys = [];
    list.forEach(function(a, i){
      var b = btn('v2-btn v2-btn--' + (a.variant || 'secondary') + ' sc__btn' + (a.why ? ' is-blocked' : '') + (a.pressed ? ' is-on' : ''), a.label);
      b.setAttribute('data-sc-act', String(i)); b.setAttribute('data-sc-key', 'act-' + (a.key || i));
      if (a.pressed != null) b.setAttribute('aria-pressed', a.pressed ? 'true' : 'false');
      if (a.ariaLabel) b.setAttribute('aria-label', a.ariaLabel);
      if (a.why){ b.setAttribute('aria-disabled', 'true'); b.setAttribute('data-why', a.why); b.setAttribute('aria-describedby', 'sc-why'); whys.push(a.note || a.why); }
      box.appendChild(b);
    });
    ui.why.textContent = whys.join(' ');
    ui.why.hidden = !whys.length;
    ui.more.href = D.opts.href ? D.opts.href(D.slug) : 'player.html?p=' + encodeURIComponent(D.slug);
    ui.more.setAttribute('aria-label', 'Full profile: ' + entry().name);
  }
  function renderAll(){
    if (!D) return;
    var ae = document.activeElement, inside = ui.root.contains(ae), key = inside && ae ? ae.getAttribute('data-sc-key') : null;
    var top = ui.panel.scrollTop;
    renderNav(); renderHead();
    var body = clear(ui.body);
    renderWho(body); renderStats(body); renderChart(body); renderHoldings(body); renderSignals(body);
    body.appendChild(el('p', 'sc-note sc-foot', 'Play money only · For information only · not financial advice'));
    renderActs();
    ui.panel.scrollTop = top;
    if (inside && !ui.root.contains(ae)){
      var n = key ? ui.root.querySelector('[data-sc-key="' + key + '"]') : null;
      (n && visibleEl(n) && !n.disabled ? n : ui.close).focus();
    } else if (inside && ae && ae.disabled) ui.close.focus();
  }

  // ---- load (first open fetches the shared files; per-player files once each) ----
  function load(token){
    var slug = D.slug, x = D.x;
    function done(k){ return function(v){ if (!D || D.seq !== token) return; x[k] = v == null ? null : v; renderAll(); }; }
    profile(slug).then(done('prof'));
    optJson('data/ceos/index.json').then(done('ceos'));
    optJson('data/insights/calendar.json').then(done('cal'));
    once('movers', function(){ return BD.getJson('data/fantasy/movers.json').then(function(d){ return d && d.movers && typeof d.movers === 'object' ? d.movers : {}; }); }).then(done('movers'));
    windowData().then(done('win'));
    if (SC.buyDay(F.state.days || {}, slug, C.addDays(today(), -14))) once('filings:' + slug, function(){ return BD.loadPersonFilings ? BD.loadPersonFilings(slug) : BD.getJson('data/filings/by-person/' + slug + '.json'); }).then(done('filings'));
    else x.filings = null;
  }
  function show(slug){
    D.slug = slug; D.seq = ++seq; D.x = {}; D.openTk = null;
    renderAll();
    ui.panel.scrollTop = 0;
    load(D.seq);
  }
  function go(delta){
    if (!D) return;
    var to = SC.step(order(), D.slug, delta);
    if (!to) return;
    show(to);
    var b = delta < 0 ? ui.prev : ui.next;
    (b.disabled ? (delta < 0 ? ui.next : ui.prev) : b).focus();
    if (document.activeElement && document.activeElement.disabled) ui.close.focus();
    var live = document.getElementById('live');
    if (live){ live.textContent = ''; var t = entry().name + ', ' + ui.pos.textContent; setTimeout(function(){ live.textContent = t; }, 30); }
  }

  // ---- keyboard: Esc closes, Tab stays inside ----
  function focusables(){
    return Array.prototype.filter.call(ui.panel.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  document.addEventListener('keydown', function(e){
    if (!D || !ui || ui.root.hidden || e.defaultPrevented) return;
    if (window.BDDossier && window.BDDossier.isOpen && window.BDDossier.isOpen()) return;
    if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); api.close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length){ e.preventDefault(); ui.panel.focus(); return; }
    var first = f[0], last = f[f.length - 1], ae = document.activeElement;
    if (!ui.panel.contains(ae) || ae === ui.panel){ e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && ae === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && ae === last){ e.preventDefault(); first.focus(); }
  });

  var hadLock = false;
  var api = {
    open: function(slug, opts){
      if (!slug) return;
      build();
      var wasOpen = !!D;
      if (!wasOpen) hadLock = document.documentElement.classList.contains('v2-lock');
      D = { slug: slug, opts: opts || {}, opener: wasOpen ? D.opener : ((opts && opts.opener) || document.activeElement), order: null, x: {} };
      D.order = list();
      ui.root.hidden = false;
      document.documentElement.classList.add('v2-lock');
      show(slug);
      ui.close.focus();
    },
    close: function(){
      if (!D || !ui) return;
      var d = D;
      ui.root.hidden = true;
      if (!hadLock) document.documentElement.classList.remove('v2-lock');
      D = null;
      var back = null;
      if (typeof d.opts.restoreFocus === 'function'){ try { back = d.opts.restoreFocus(d.slug); } catch (e) { back = null; } }
      if (!visibleEl(back)) back = visibleEl(d.opener) ? d.opener : null;
      if (back){
        try { back.focus({ preventScroll: true }); } catch (e2) { back.focus(); }
        var r = back.getBoundingClientRect();
        if ((r.top < 0 || r.bottom > window.innerHeight) && back.scrollIntoView) back.scrollIntoView({ block: 'center' });
      }
    },
    refresh: function(){ if (D) renderAll(); },
    isOpen: function(){ return !!D; },
    current: function(){ return D ? D.slug : null; }
  };
  window.BDScout = api;
})();
