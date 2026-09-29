/* Billionaires Digest v3: player dossier pop-up, one shared dialog used on the Draft room, Players, My team and
   Scores pages. ES5, UI only. Global: BDDossier { open(slug, opts), close(), refresh(), isOpen(), loadNicknames(),
   nickname(slug) }.
   opts: { opener (element to return focus to), restoreFocus() -> element, week (week file) or weekId,
           actions: [{ label, onClick(slug, button), pressed?, why? (blocked reason), note? (shown for why), variant?,
           ariaLabel?, key? }] or a function
           returning that list (called on every render) }.
   Any link or button with data-dossier="<slug>" opens it on a plain click; middle-click and modifier-clicks keep
   following the link (names stay links to player.html as a fallback).
   Needs BD (assets/common.js), BDFantasyCore, BDFantasyStore and BDDossierCore (assets/v2/dossier-core.js);
   BDPortraits (assets/v2/portraits.js) is optional.
   Real data only: every figure comes from the site's data files with its date and source; when a file or field
   is missing the item is left out or shows "—". CEOs (data/ceos/index.json) get a CEO version: role and company,
   bio and sources from that file, no net worth. Game only: play money, no prizes. Not financial advice. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, K = window.BDDossierCore;
  if (!window.BD || !F || !C || !K) return;
  var el = BD.el, arr = BD.arr, fmt = F.fmt;
  var MINUS = '−';
  var TABS = [{ key: 'log', label: 'Game log' }, { key: 'co', label: 'Company stats' }, { key: 'scout', label: 'Scouting report' }];

  // ---- helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function txt(s){ return document.createTextNode(s); }
  function numCls(n){ return typeof n !== 'number' ? 'v2-zero' : (n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero')); }
  function sr(text){ return el('span', 'v2-sr', text); }
  function str(x){ return x == null ? '' : String(x).trim(); }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function link(cls, text, href, key){ var a = el('a', cls, text); a.href = href; if (key) a.setAttribute('data-dz-key', key); return a; }
  function ext(cls, text, url, key){
    var u = BD.safeUrl(url);
    if (!u) return null;
    var a = link(cls, text, u, key);
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.appendChild(sr(' (opens in a new tab)'));
    return a;
  }
  function has(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function visibleEl(n){ return !!n && document.contains(n) && n.getClientRects().length > 0; }
  function isoDate(x){ return BD.isoOf(x); }
  function dateTxt(x){ var i = isoDate(x); return i ? BD.fmtDate(i) : ''; }
  // an ISO time -> its New York calendar date (quotes are stamped in UTC)
  function nyDateOf(t){ var ms = Date.parse(t || ''); return isFinite(ms) ? C.nyDate(ms) : isoDate(t); }
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? u : null; }
  function portraitSrc(slug){
    var P = window.BDPortraits, p = P && has(P, slug) ? P[slug] : null;
    return p ? safePath(p.img) : safePath(window.BDPortraitFallback);
  }
  function playerHref(slug){ return 'player.html?p=' + encodeURIComponent(slug); }
  function weekLabel(wk){ return wk ? (wk.practice ? 'Practice week' : fmt.weekTitle(wk.week)) : ''; }

  // ---- data (each file loaded once per page; a missing file resolves to null) ----
  var cache = {};
  function once(key, fn){ if (!cache[key]) cache[key] = Promise.resolve().then(fn).then(null, function(){ return null; }); return cache[key]; }
  function optJson(u){ return once(u, function(){ return BD.getJson(u); }); }
  function loadNicknames(){ return optJson('data/fantasy/nicknames.json').then(function(x){ nickFile = x; return x; }); }
  var nickFile = null;
  function nickname(slug){ return K.nickname(nickFile, slug); }
  function peopleIx(){ return once('people', function(){ return BD.loadPeople(); }); }
  function profile(slug){
    return once('prof:' + slug, function(){
      return peopleIx().then(function(){
        var ip = BD.indexBySlug(slug);
        return ip && ip.hasProfile ? BD.loadProfile(slug) : null;
      });
    });
  }
  function dayFile(d){
    if (F.state.days && F.state.days[d]) return Promise.resolve(F.state.days[d]);
    return optJson('data/fantasy/days/' + d + '.json');
  }
  function weekDays(wk){
    var out = {};
    return Promise.all(arr(wk && wk.days).map(function(d){ return dayFile(d).then(function(x){ if (x) out[d] = x; }); })).then(function(){ return out; });
  }
  // every real week listed in the index, for season totals
  function seasonWeeks(){
    return once('season', function(){
      return F.init().then(function(){
        var lw = C.lockedWeek(F.now());
        var ws = arr(F.state.index && F.state.index.weeks).filter(function(w){ return w && !w.practice && w.days > 0 && w.week <= lw; });
        return Promise.all(ws.map(function(w){ return F.loadWeek(w.week); }));
      });
    });
  }

  // ---- state for the open dossier ----
  var D = null;         // { slug, opts, seq, tab, wk, x: { … loaded data } }
  var seq = 0;
  var ui = null;        // DOM nodes of the shared dialog
  var hadLock = false;

  function build(){
    if (ui) return ui;
    var root = el('div', 'dz');
    root.id = 'bd-dossier';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'dz-name');
    root.hidden = true;
    var panel = el('div', 'dz__panel'); panel.tabIndex = -1;
    var head = el('div', 'dz__head v2-dark');
    var bar = el('div', 'dz__bar v2-dark');
    var kick = el('span', 'dz__kick');
    kick.appendChild(el('span', null, 'Player dossier'));
    var wkl = el('span', 'dz__wk'); kick.appendChild(wkl);
    bar.appendChild(kick);
    var close = btn('dz__close', 'Close'); close.setAttribute('data-dz-key', 'close');
    close.setAttribute('aria-label', 'Close player dossier');
    close.addEventListener('click', function(){ api.close(); });
    bar.appendChild(close);
    panel.appendChild(bar);
    var id = el('div', 'dz__id'); head.appendChild(id);
    panel.appendChild(head);
    var body = el('div', 'dz__body');
    var stats = el('dl', 'dz-stats'); body.appendChild(stats);
    var tape = el('section', 'dz-sec dz-tape'); body.appendChild(tape);
    var tabs = el('div', 'dz-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Dossier sections');
    var panels = {};
    TABS.forEach(function(t){
      var b = btn('dz-tab', t.label);
      b.id = 'dz-tab-' + t.key; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'dz-panel-' + t.key);
      b.setAttribute('data-dz-tab', t.key); b.setAttribute('data-dz-key', 'tab-' + t.key);
      tabs.appendChild(b);
      var p = el('div', 'dz-panel'); p.id = 'dz-panel-' + t.key; p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', b.id); p.tabIndex = 0; p.hidden = true;
      panels[t.key] = p;
    });
    body.appendChild(tabs);
    TABS.forEach(function(t){ body.appendChild(panels[t.key]); });
    panel.appendChild(body);
    var foot = el('div', 'dz__foot');
    var acts = el('div', 'dz__acts'); foot.appendChild(acts);
    var why = el('p', 'dz__why'); why.hidden = true; foot.appendChild(why);
    foot.appendChild(el('p', 'dz__note', 'Play money only · For information only · not financial advice'));
    panel.appendChild(foot);
    root.appendChild(panel);
    root.addEventListener('click', function(e){ if (e.target === root) api.close(); });
    tabs.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-dz-tab]') : null;
      if (b) showTab(b.getAttribute('data-dz-tab'), false);
    });
    tabs.addEventListener('keydown', function(e){
      if (!D) return;
      var i = -1, j = null, n = TABS.length;
      TABS.forEach(function(t, k){ if (t.key === D.tab) i = k; });
      if (e.key === 'ArrowRight' || e.key === 'Right') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'Left') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j == null) return;
      e.preventDefault();
      showTab(TABS[j].key, true);
    });
    acts.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-dz-act]') : null;
      if (!b || !D) return;
      var list = actions(), a = list[+b.getAttribute('data-dz-act')];
      if (a && typeof a.onClick === 'function') a.onClick(D.slug, b);
    });
    document.body.appendChild(root);
    ui = { root: root, panel: panel, wk: wkl, close: close, id: id, stats: stats, tape: tape, tabs: tabs, panels: panels, acts: acts, why: why };
    return ui;
  }

  // keep focus on the same control (by data-dz-key) when a part re-renders
  function keepFocus(fn){
    var ae = document.activeElement, inside = !!(ui && ae && ui.root.contains(ae));
    var key = inside ? ae.getAttribute('data-dz-key') : null;
    fn();
    if (!inside || !D || ui.root.contains(ae)) return;
    if (key){ var n = ui.root.querySelector('[data-dz-key="' + key + '"]'); if (n && visibleEl(n)){ n.focus(); return; } }
    ui.close.focus();
  }

  // ---- parts ----
  function person(){ return F.person(D.slug); }
  function poolEntry(){
    var wk = D.wk, list = arr(wk && wk.draftable);
    for (var i = 0; i < list.length; i++) if (list[i].slug === D.slug) return list[i];
    return person();
  }
  function primary(){ return K.primaryHolding(poolEntry()) || K.primaryHolding(person()); }
  // CEO players: a pool entry with type "ceo", a slug in BDCeos (assets/v2/portraits.js) or an entry in data/ceos
  function isCeo(){ return !!((window.BDIsCeo && (window.BDIsCeo(poolEntry()) || window.BDIsCeo(D.slug))) || ceo()); }
  function ceo(){ return D.x.ceos && K.ceoEntry ? K.ceoEntry(D.x.ceos, D.slug) : null; /* K.ceo* is missing only in a cached older file */ }
  function control0(){ var p = D.x.prof; var c = p && arr(p.controls).filter(function(e){ return e && e.name; })[0]; return c || null; }
  function sectorOf(){ var p = person(), ix = BD.indexBySlug(D.slug), c = ceo(); return p.sector || (ix && ix.sector) || (D.x.prof && D.x.prof.sector) || (c && c.sector) || 'Other'; }
  function nameOf(){ var p = person(), ix = BD.indexBySlug(D.slug), c = ceo(); return (p && p.name !== D.slug ? p.name : null) || (ix && ix.name) || (D.x.prof && D.x.prof.name) || (c && c.name) || D.slug; }

  function renderId(){
    var box = clear(ui.id), p = person(), pic = portraitSrc(D.slug);
    ui.wk.textContent = D.wk ? ' · ' + weekLabel(D.wk) : '';
    var face = el('span', 'v2-av dz-face' + (pic ? ' v2-av--pic' : ''), pic ? '' : BD.initials(nameOf()));
    face.setAttribute('data-sector', BD.sectorSlug(sectorOf()));
    face.setAttribute('aria-hidden', 'true');
    if (pic){ var im = el('img'); im.src = pic; im.alt = ''; face.appendChild(im); }
    box.appendChild(face);
    var t = el('div', 'dz__who');
    var nk = nickname(D.slug);
    if (nk) t.appendChild(el('p', 'dz__nick', nk));
    var h = el('h2', 'dz__name', nameOf()); h.id = 'dz-name';
    var ceoB = isCeo() && window.BDCeoBadge ? window.BDCeoBadge(D.slug) || window.BDCeoBadge({ type: 'ceo' }) : null;
    if (ceoB) h.appendChild(ceoB);
    t.appendChild(h);
    var ph = primary(), c0 = control0(), cx = ceo();
    // CEOs: the company is on the role line below, so this line is just the ticker
    var coName = isCeo() ? '' : ((ph && ph.name) || (c0 && c0.name) || '');
    var tk = (ph && ph.ticker) || (c0 && c0.ticker) || (cx && cx.ticker) || '';
    if (coName || tk){
      var co = el('p', 'dz__co');
      if (coName) co.appendChild(txt(coName + ' '));
      if (tk){ var pill = el('span', 'dz__tk', tk); pill.appendChild(sr(' (ticker)')); co.appendChild(pill); }
      t.appendChild(co);
    }
    var role = c0 && str(c0.role);
    if (isCeo()){ var rl = K.ceoRoleLine ? K.ceoRoleLine(cx) : ''; t.appendChild(el('p', 'dz__role', rl || (D.x.ceos === undefined ? 'CEO' : sectorOf()))); }
    else t.appendChild(el('p', 'dz__role', (role ? role + ' · ' : '') + sectorOf()));
    var picked = F.state.picks && F.state.picks.indexOf(D.slug) >= 0;
    if (picked && D.opts.showTeam) t.appendChild(el('span', 'dz__on', F.state.captain === D.slug ? 'On your team · Captain' : 'On your team'));
    box.appendChild(t);
  }

  function stat(dl, k, v, cls, sub){
    var d = el('div', 'dz-stat');
    d.appendChild(el('dt', 'dz-stat__k', k));
    var dd = el('dd', 'dz-stat__v num' + (cls ? ' ' + cls : ''), v);
    if (sub) dd.appendChild(el('span', 'dz-stat__sub', sub));
    d.appendChild(dd);
    dl.appendChild(d);
  }
  function renderStats(){
    var dl = clear(ui.stats), slug = D.slug;
    var w = F.weekPoints(D.wk, slug);
    stat(dl, 'Week pts', w == null ? '—' : K.signed(w), w == null ? '' : numCls(w), D.wk ? (D.wk.practice ? 'practice week' : fmt.weekTitle(D.wk.week)) : 'no scored week');
    var s = D.x.season;
    if (s === undefined){ stat(dl, 'Season total', '…', '', 'loading'); stat(dl, 'Season rank', '…', '', 'loading'); }
    else {
      var tot = s && s.totals[slug];
      stat(dl, 'Season total', tot ? K.signed(tot.total) : '—', tot ? numCls(tot.total) : '', tot ? tot.days + (tot.days === 1 ? ' scored day' : ' scored days') : 'no real-week points yet');
      var pool = arr(F.state.draftWk && F.state.draftWk.draftable).map(function(p){ return p.slug; });
      var r = s ? K.seasonRank(s.totals, pool, slug) : null;
      stat(dl, 'Season rank', r ? '#' + r.rank + ' / ' + r.of : '—', '', r ? 'by season total' : '');
    }
    var sal = F.salaries()[slug];
    stat(dl, 'Draft cost', typeof sal === 'number' ? String(sal) : '—', '', typeof sal === 'number' ? 'cap, of ' + C.CAP : 'not draftable');
  }

  function fact(dl, k, v, sub){
    var d = el('div', 'dz-fact');
    d.appendChild(el('dt', 'dz-fact__k', k));
    var dd = el('dd', 'dz-fact__v', v);
    if (sub) dd.appendChild(el('span', 'dz-fact__sub', sub));
    d.appendChild(dd);
    dl.appendChild(d);
  }
  // market cap (est.): SEC share count × latest price, from the files; null when either is missing
  function capFact(){
    var x = D.x, ph = primary(), tk = ph && ph.ticker;
    var fin = tk && x.fin ? K.financials(x.fin, tk) : null;
    var q = tk && x.prices && x.prices.quotes && has(x.prices.quotes, tk) ? x.prices.quotes[tk] : null;
    var cap = fin && fin.shares && q ? K.marketCap(fin.shares.value, q.price) : null;
    if (cap == null) return null;
    var qd = nyDateOf(q.time) || nyDateOf(x.prices.generated);
    return { cap: cap, tk: tk, sub: 'SEC share count ' + (dateTxt(fin.shares.asOf) || 'date not stated') + ' × price ' + (qd ? BD.fmtDate(qd) : 'date not stated') + (tk ? ' (' + tk + ')' : '') };
  }
  function renderCeoTape(box){
    var x = D.x, c = ceo();
    var dl = el('dl', 'dz-facts');
    if (c && typeof c.roleSince === 'number') fact(dl, 'Role since', String(c.roleSince), str(c.company) ? 'at ' + str(c.company) : '');
    fact(dl, 'Sector', sectorOf());
    if (c && str(c.company)) fact(dl, 'Company', str(c.company), [str(c.ticker), str(c.exchange)].filter(Boolean).join(' · '));
    var cf = capFact();
    if (cf) fact(dl, 'Market cap (est.)', K.money(cf.cap), cf.sub);
    box.appendChild(dl);
    if (x.ceos === undefined){ loading(box, 'Loading the profile…'); return; }
    if (!c) return;
    if (str(c.bio)) box.appendChild(el('p', 'dz-note dz-bio', str(c.bio)));
    var srcs = K.ceoSources ? K.ceoSources(c) : [];
    var src = el('p', 'dz-src'), bits = 0;
    if (srcs.length){
      src.appendChild(txt('Sources: '));
      srcs.forEach(function(sx, i){
        if (i) src.appendChild(txt(' · '));
        var a = ext(null, sx.title + (sx.date ? ' (' + (dateTxt(sx.date) || sx.date) + ')' : ''), sx.url, 'src-ceo-' + i);
        if (a) src.appendChild(a);
      });
      bits++;
    }
    if (cf){
      if (bits) src.appendChild(txt(' · '));
      src.appendChild(txt('Prices: ' + (x.prices.provider || 'market data') + '; shares: SEC filings')); bits++;
    }
    if (bits) box.appendChild(src);
  }
  function renderTape(){
    var box = clear(ui.tape), x = D.x, c0 = control0(), prof = x.prof;
    if (isCeo()){ box.appendChild(el('h3', 'dz-sec__h dz-sec__h--red', 'Tale of the tape')); renderCeoTape(box); return; }
    box.appendChild(el('h3', 'dz-sec__h dz-sec__h--red', 'Tale of the tape'));
    var dl = el('dl', 'dz-facts');
    var since = c0 ? K.roleSince(c0.role) : null;
    if (since) fact(dl, 'Role since', String(since), c0.name ? 'at ' + c0.name : '');
    fact(dl, 'Sector', sectorOf());
    var ix = BD.indexBySlug(D.slug), pix = BD.getPeople();
    var worth = (prof && str(prof.worth)) || (ix && str(ix.worth)) || '';
    var wAsOf = (prof && prof.asOf) || (pix && pix.asOf) || '';
    if (worth) fact(dl, 'Net worth', worth, 'Forbes Real-Time' + (dateTxt(wAsOf) ? ', ' + dateTxt(wAsOf) : ''));
    else if (x.prof === undefined) fact(dl, 'Net worth', '…', 'loading');
    var ph = primary(), tk = ph && ph.ticker;
    var fin = tk && x.fin ? K.financials(x.fin, tk) : null;
    var q = tk && x.prices && x.prices.quotes && has(x.prices.quotes, tk) ? x.prices.quotes[tk] : null;
    var cap = fin && fin.shares && q ? K.marketCap(fin.shares.value, q.price) : null;
    if (cap != null){
      var qd = nyDateOf(q.time) || nyDateOf(x.prices.generated);
      fact(dl, 'Market cap (est.)', K.money(cap), 'SEC share count ' + (dateTxt(fin.shares.asOf) || 'date not stated') + ' × price ' + (qd ? BD.fmtDate(qd) : 'date not stated') + (tk ? ' (' + tk + ')' : ''));
    }
    box.appendChild(dl);
    var src = el('p', 'dz-src');
    var bits = 0;
    if (pix && BD.safeUrl(pix.sourceUrl)){
      var a = ext(null, (pix.source || 'Forbes Real-Time') + (dateTxt(pix.asOf) ? ', ' + dateTxt(pix.asOf) : ''), pix.sourceUrl, 'src-forbes');
      src.appendChild(txt('Net worth: ')); src.appendChild(a); bits++;
    }
    if (c0 && BD.safeUrl(c0.source)){
      if (bits) src.appendChild(txt(' · '));
      src.appendChild(txt('Role: ')); src.appendChild(ext(null, 'source', c0.source, 'src-role')); bits++;
    }
    if (cap != null){
      if (bits) src.appendChild(txt(' · '));
      src.appendChild(txt('Prices: ' + (x.prices.provider || 'market data') + '; shares: SEC filings')); bits++;
    }
    if (ix && ix.hasProfile){
      if (bits) src.appendChild(txt(' · '));
      src.appendChild(link(null, 'Full profile', 'people/' + encodeURIComponent(D.slug) + '/', 'src-prof')); bits++;
    }
    if (bits) box.appendChild(src);
  }

  // ---- tabs ----
  function showTab(key, focus){
    D.tab = key;
    TABS.forEach(function(t){
      var b = document.getElementById('dz-tab-' + t.key), on = t.key === key;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      ui.panels[t.key].hidden = !on;
      if (on && focus) b.focus();
    });
  }
  function empty(box, text){ box.appendChild(el('p', 'dz-empty', text)); }
  function loading(box, text){ box.appendChild(el('p', 'v2-loading dz-empty', text)); }

  function renderLog(){
    var box = clear(ui.panels.log), wk = D.wk, x = D.x;
    if (!wk){ empty(box, 'No scored week yet. Points show here after the first trading day of a week.'); return; }
    if (x.days === undefined){ loading(box, 'Loading the game log…'); return; }
    var lg = K.weekLog(wk, x.days, D.slug, wk.captainMultiplier);
    box.appendChild(el('h3', 'dz-sec__h', 'Game log · ' + weekLabel(wk)));
    if (!lg){ empty(box, 'No scored days for ' + nameOf() + ' in ' + fmt.weekName(wk.week) + ' yet.'); return; }
    var mult = lg.mult;
    // the math row: returns -> base points -> captain
    var row = el('ol', 'dz-math');
    function step(k, v, cls, sub){
      var li = el('li', 'dz-math__s');
      li.appendChild(el('span', 'dz-math__k', k));
      li.appendChild(el('span', 'dz-math__v num ' + cls, v));
      if (sub) li.appendChild(el('span', 'dz-math__sub', sub));
      row.appendChild(li);
    }
    step(lg.n === 1 ? 'Portfolio return' : 'Daily returns added up', K.pct(lg.returnSum, 2), numCls(lg.returnSum), lg.n + (lg.n === 1 ? ' day' : ' days'));
    step('Base pts', K.signed(lg.points), numCls(lg.points), lg.pricePoints != null ? 'price ' + K.signed(lg.pricePoints) + (lg.bonuses ? ', bonuses ' + K.signed(lg.bonuses) : '') : '');
    step(mult != null ? 'If captain ×' + mult : 'If captain', K.signed(lg.captain), numCls(lg.captain), mult != null ? 'rounded each day' : '');
    box.appendChild(row);
    var rt = K.rulesText(lg.rules);
    var rp = el('p', 'dz-note', (rt ? rt + ' ' : '') + (mult != null ? 'Captain: day total × ' + mult + ', rounded.' : ''));
    box.appendChild(rp);
    var wrap = el('div', 'dz-scroll'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Day by day, scrolls sideways');
    wrap.setAttribute('data-dz-key', 'logscroll');
    var t = el('table', 'v2-table dz-table');
    t.appendChild(el('caption', 'v2-sr', 'Day by day for ' + nameOf() + ', ' + weekLabel(wk)));
    var thead = el('thead'), hr = el('tr');
    [['Day', ''], ['Return', 'n'], ['Points', 'n'], ['If captain', 'n']].forEach(function(c){ var th = el('th', c[1] || null, c[0]); th.scope = 'col'; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    lg.rows.forEach(function(r){
      var tr = el('tr');
      var th = el('th', 'dz-table__d', fmt.dayLabel(r.date)); th.scope = 'row'; tr.appendChild(th);
      tr.appendChild(el('td', 'n ' + numCls(r.returnPct), K.pct(r.returnPct, 2)));
      var pc = el('td', 'n v2-strong ' + numCls(r.points), K.signed(r.points));
      if (r.insiderBuy || r.stories){
        var extra = [];
        if (r.insiderBuy) extra.push('insider buy ' + K.signed(r.insiderBuy));
        if (r.stories) extra.push('stories ' + K.signed(r.stories));
        pc.appendChild(el('span', 'dz-table__sub', extra.join(', ')));
      }
      tr.appendChild(pc);
      tr.appendChild(el('td', 'n ' + numCls(r.captain), K.signed(r.captain)));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
    box.appendChild(el('p', 'dz-note', 'From the game file for ' + fmt.weekName(wk.week) + '. Past days only; not a forecast.'));
  }

  function renderCompany(){
    var box = clear(ui.panels.co), x = D.x, ph = primary(), tk = ph && ph.ticker;
    box.appendChild(el('h3', 'dz-sec__h', 'Company box score' + (tk ? ' · ' + tk : '')));
    if (tk && x.fin === undefined){ loading(box, 'Loading company numbers…'); }
    else {
      var f = tk && x.fin ? K.financials(x.fin, tk) : null;
      if (!f || (!f.quarter && !f.ttm)) empty(box, 'No SEC financials for this company (foreign or private filer).');
      else {
        var q = f.quarter, t = f.ttm;
        var wrap = el('div', 'dz-scroll'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Company box score, scrolls sideways');
        wrap.setAttribute('data-dz-key', 'coscroll');
        var tbl = el('table', 'v2-table dz-table dz-co');
        tbl.appendChild(el('caption', 'v2-sr', 'Company box score for ' + ((ph && ph.name) || f.name || tk) + ' (' + tk + ') from SEC filings'));
        var thead = el('thead'), hr = el('tr');
        var th0 = el('th', null, 'Figure'); th0.scope = 'col'; hr.appendChild(th0);
        function head(label, p){
          var th = el('th', 'n', label); th.scope = 'col';
          if (p){
            var span = (p.start && p.end) ? BD.fmtDate(isoDate(p.start)) + ' – ' + BD.fmtDate(isoDate(p.end)) : (p.end ? 'to ' + BD.fmtDate(isoDate(p.end)) : '');
            var meta = [span, [p.form, p.filed ? 'filed ' + dateTxt(p.filed) : ''].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
            if (meta) th.appendChild(el('span', 'dz-co__meta', meta));
          }
          hr.appendChild(th);
        }
        head('Latest quarter', q); head('Last 12 months', t);
        thead.appendChild(hr); tbl.appendChild(thead);
        var tb = el('tbody');
        [['Revenue', 'revenue', K.money], ['Net income', 'netIncome', K.money], ['Diluted EPS', 'eps', K.eps], ['Revenue growth vs a year earlier', 'growth', function(v){ return K.pct(v, 1); }], ['Net margin', 'margin', function(v){ return K.plainPct(v, 1); }]].forEach(function(r){
          var tr = el('tr');
          var th = el('th', null, r[0]); th.scope = 'row'; tr.appendChild(th);
          [q, t].forEach(function(p){
            var v = p ? p[r[1]] : null;
            tr.appendChild(el('td', 'n' + (r[1] === 'netIncome' || r[1] === 'growth' ? ' ' + numCls(v) : ''), v == null ? '—' : r[2](v)));
          });
          tb.appendChild(tr);
        });
        tbl.appendChild(tb); wrap.appendChild(tbl); box.appendChild(wrap);
        var src = el('p', 'dz-note');
        src.appendChild(txt('Source: SEC filings (10-Q / 10-K), XBRL company facts' + (f.asOf ? ', checked ' + dateTxt(f.asOf) : '') + '. '));
        var a = ext('dz-more', 'SEC filings ↗', f.secUrl, 'securl');
        if (a) src.appendChild(a);
        box.appendChild(src);
      }
    }
    var tip = el('div', 'dz-tip');
    tip.appendChild(el('strong', null, 'Scouting stats. Zero bonus points.'));
    tip.appendChild(el('p', null, 'Company profit helps you judge a pick; the score follows the stock.'));
    box.appendChild(tip);
  }

  function filingLine(fl){
    var bits = [];
    var s = fl.form4 && arr(fl.form4.summary)[0];
    if (s){
      bits.push([s.ticker || s.issuer, s.codeLabel].filter(Boolean).join(' · '));
      if (typeof s.shares === 'number') bits.push(BD.fmtShares(s.shares) + ' shares');
    } else if (str(fl.description) && str(fl.description).toUpperCase() !== ('FORM ' + str(fl.form)).toUpperCase()) bits.push(str(fl.description));
    return bits.filter(Boolean).join(', ');
  }
  function renderScout(){
    var box = clear(ui.panels.scout), x = D.x, name = nameOf();
    box.appendChild(el('h3', 'dz-sec__h', 'Scouting report'));
    // holdings that score this week
    var hs = arr(poolEntry().holdings).filter(function(h){ return h && h.ticker; });
    var s1 = el('section', 'dz-sub');
    s1.appendChild(el('h4', 'dz-sub__h', 'Scores on'));
    if (!hs.length) empty(s1, 'No listed holdings in this week\'s game file.');
    else {
      var ul = el('ul', 'dz-list');
      hs.slice().sort(function(a, b){ return (b.weight || 0) - (a.weight || 0); }).slice(0, 5).forEach(function(h){
        var li = el('li');
        li.appendChild(el('strong', null, h.ticker));
        li.appendChild(txt((h.name ? ' ' + h.name : '') + (typeof h.weight === 'number' ? ' · ' + (Math.round(h.weight * 1000) / 10) + '% weight' : '')));
        ul.appendChild(li);
      });
      s1.appendChild(ul);
      if (hs.length > 5) s1.appendChild(el('p', 'dz-note', 'And ' + (hs.length - 5) + ' more on the player page.'));
    }
    box.appendChild(s1);
    // latest filings (SEC EDGAR, data/filings/by-person); CEOs: a link to their company's filings
    var s2 = el('section', 'dz-sub');
    if (isCeo()){
      s2.appendChild(el('h4', 'dz-sub__h', 'Company filings'));
      var fl = K.ceoFilingsLink ? K.ceoFilingsLink(ceo()) : null;
      if (x.ceos === undefined) loading(s2, 'Loading…');
      else if (!fl) empty(s2, 'No filings link on file.');
      else {
        var cp = el('p', 'dz-note');
        cp.appendChild(txt((str(ceo().company) || name) + ': '));
        cp.appendChild(ext('dz-more', fl.label + ' ↗', fl.url, 'ceo-filings'));
        s2.appendChild(cp);
        s2.appendChild(el('p', 'dz-note', 'Insider-buy points come from our SEC Form 4 feed, which covers the billionaires only, so CEOs score 0 there for now.'));
      }
    }
    else if (x.filings === undefined) loading(s2, 'Loading filings…');
    else {
      var fls = arr(x.filings && x.filings.filings).filter(function(f){ return f && f.filed; }).sort(function(a, b){ return a.filed < b.filed ? 1 : (a.filed > b.filed ? -1 : 0); }).slice(0, 3);
      if (!fls.length) empty(s2, 'No SEC filings for ' + name + ' in our data' + (x.filings && x.filings.windowDays ? ' (last ' + x.filings.windowDays + ' days)' : '') + '.');
      else {
        var ul2 = el('ul', 'dz-list');
        fls.forEach(function(f, i){
          var li = el('li');
          li.appendChild(el('strong', null, 'Form ' + f.form));
          li.appendChild(txt(' · filed ' + dateTxt(f.filed)));
          var line = filingLine(f);
          if (line) li.appendChild(el('span', 'dz-list__sub', line));
          var a = ext('dz-list__src', 'SEC filing', f.indexUrl || f.url, 'fl-' + i);
          if (a){ li.appendChild(txt(' ')); li.appendChild(a); }
          ul2.appendChild(li);
        });
        s2.appendChild(ul2);
        s2.appendChild(el('p', 'dz-note', 'Source: SEC EDGAR' + (x.filings.windowDays ? ', last ' + x.filings.windowDays + ' days' : '') + (x.filings.generated ? ', checked ' + dateTxt(x.filings.generated) : '') + '.'));
      }
    }
    box.appendChild(s2);
    // Digest stories (latest edition, same match as the player page News tab)
    var s3 = el('section', 'dz-sub');
    s3.appendChild(el('h4', 'dz-sub__h', 'In the Digest'));
    if (x.digest === undefined) loading(s3, 'Loading the latest edition…');
    else if (!x.digest) empty(s3, 'The latest edition is not available right now.');
    else {
      var iso = BD.isoFromLong(x.digest.date);
      var items = arr(x.digest.stories).filter(function(s){ return s && s.headline && BD.storyMatches(s, name); }).slice(0, 3);
      if (!items.length) empty(s3, 'No stories about ' + name + ' in the latest edition' + (iso ? ' (' + BD.fmtDate(iso) + ')' : '') + '.');
      else {
        var ul3 = el('ul', 'dz-list');
        items.forEach(function(s, i){
          var li = el('li');
          var a = ext('dz-list__h', s.headline, s.url, 'st-' + i);
          li.appendChild(a || el('span', 'dz-list__h', s.headline));
          if (s.source) li.appendChild(el('span', 'dz-list__sub', 'Source · ' + s.source));
          ul3.appendChild(li);
        });
        s3.appendChild(ul3);
        if (iso){ var ep = el('p', 'dz-note'); ep.appendChild(link(null, 'Read the ' + BD.fmtDate(iso) + ' edition', 'editions/' + iso + '/', 'edition')); s3.appendChild(ep); }
      }
    }
    box.appendChild(s3);
    // more
    var s4 = el('section', 'dz-sub');
    s4.appendChild(el('h4', 'dz-sub__h', 'More on ' + name));
    var ul4 = el('ul', 'dz-links');
    function li4(a){ var li = el('li'); li.appendChild(a); ul4.appendChild(li); }
    li4(link('dz-more', 'Full player page', playerHref(D.slug), 'more-player'));
    var inLife = x.life && arr(x.life.people).some(function(p){ return p && p.slug === D.slug; });
    if (inLife) li4(link('dz-more', 'Play Billionaire Life as ' + name, 'life-play.html?p=' + encodeURIComponent(D.slug), 'more-life'));
    var nm = x.moves ? arr(x.moves.markets).filter(function(m){ return m && m.person && m.person.slug === D.slug; }).length : 0;
    if (nm) li4(link('dz-more', 'Next Moves: ' + nm + (nm === 1 ? ' market' : ' markets') + ' on ' + name, 'moves.html?p=' + encodeURIComponent(D.slug), 'more-moves'));
    s4.appendChild(ul4);
    box.appendChild(s4);
  }

  // ---- actions ----
  function actions(){
    var a = D && D.opts.actions;
    if (typeof a === 'function'){ try { a = a(D.slug); } catch (e) { a = null; } }
    return arr(a);
  }
  function renderActs(){
    var box = clear(ui.acts), list = actions(), whys = [];
    if (!list.length){
      box.appendChild(link('v2-btn v2-btn--ghost dz__btn', 'Open player page', playerHref(D.slug), 'act-player'));
      if (!/draft\.html$/.test(location.pathname)) box.appendChild(link('v2-btn v2-btn--primary dz__btn', 'Draft room →', 'draft.html', 'act-draft'));
    }
    list.forEach(function(a, i){
      var v = a.variant || (i === 0 ? 'primary' : 'secondary');
      var b = btn('v2-btn v2-btn--' + v + ' dz__btn' + (a.pressed ? ' is-on' : '') + (a.why ? ' is-blocked' : ''), a.label);
      b.setAttribute('data-dz-act', String(i));
      b.setAttribute('data-dz-key', 'act-' + (a.key || i));
      if (a.pressed != null) b.setAttribute('aria-pressed', a.pressed ? 'true' : 'false');
      if (a.why){ b.setAttribute('aria-disabled', 'true'); b.setAttribute('data-why', a.why); whys.push(a.note || a.why); }
      if (a.ariaLabel) b.setAttribute('aria-label', a.ariaLabel);
      box.appendChild(b);
    });
    ui.why.textContent = whys.length ? whys[0] : '';
    ui.why.hidden = !whys.length;
  }

  function renderAll(){
    if (!D) return;
    keepFocus(function(){
      renderId(); renderStats(); renderTape(); renderLog(); renderCompany(); renderScout(); renderActs();
      showTab(D.tab, false);
    });
  }

  // ---- open / close / keyboard ----
  function focusables(){
    return Array.prototype.filter.call(ui.panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  document.addEventListener('keydown', function(e){
    if (!D || !ui || ui.root.hidden) return;
    if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); api.close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length){ e.preventDefault(); ui.panel.focus(); return; }
    var first = f[0], last = f[f.length - 1], ae = document.activeElement;
    if (!ui.panel.contains(ae) || ae === ui.panel){ e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && ae === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && ae === last){ e.preventDefault(); first.focus(); }
  });
  // plain clicks on [data-dossier] open it; middle / modifier clicks keep the link's own behaviour
  document.addEventListener('click', function(e){
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target && e.target.closest ? e.target.closest('[data-dossier]') : null;
    if (!t || (ui && ui.root.contains(t))) return;
    var slug = t.getAttribute('data-dossier');
    if (!slug) return;
    e.preventDefault();
    api.open(slug, { opener: t, weekId: t.getAttribute('data-dossier-week') || null });
  });

  function load(token){
    var slug = D.slug, x = D.x;
    function done(key){ return function(v){ if (!D || D.seq !== token) return; x[key] = v == null ? null : v; renderAll(); }; }
    // week file for the game log, then its day files
    var wkP = D.opts.week ? Promise.resolve(D.opts.week)
      : (D.opts.weekId ? F.loadWeek(D.opts.weekId) : F.init().then(function(){ return F.state.sbWk; }));
    wkP.then(null, function(){ return null; }).then(function(wk){
      if (!D || D.seq !== token) return;
      if (wk) D.wk = wk;
      return weekDays(D.wk).then(done('days'));
    });
    seasonWeeks().then(function(files){
      if (!D || D.seq !== token) return;
      x.season = files ? { totals: K.seasonTotals(files) } : null;
      renderAll();
    });
    peopleIx().then(function(){ return profile(slug); }).then(done('prof'));
    optJson('data/financials/index.json').then(done('fin'));
    BD.loadPrices().then(done('prices'));
    optJson('data/ceos/index.json').then(done('ceos'));
    if (isCeo()) x.filings = null;
    else once('filings:' + slug, function(){ return BD.loadPersonFilings(slug); }).then(done('filings'));
    optJson('digest.json').then(done('digest'));
    optJson('data/life/index.json').then(done('life'));
    optJson('data/moves/markets.json').then(done('moves'));
    loadNicknames().then(function(){ if (D && D.seq === token) renderAll(); });
  }

  var api = {
    open: function(slug, opts){
      if (!slug) return;
      build();
      var wasOpen = !!D && !ui.root.hidden;
      var o = opts || {};
      if (!wasOpen){ hadLock = document.documentElement.classList.contains('v2-lock'); }
      var opener = wasOpen && D ? D.opener : (o.opener || document.activeElement);
      D = { slug: slug, opts: o, seq: ++seq, tab: 'log', wk: o.week || (o.weekId ? null : F.state.sbWk) || null, x: {}, opener: opener };
      renderAll();
      ui.root.hidden = false;
      document.documentElement.classList.add('v2-lock');
      ui.panel.scrollTop = 0;
      ui.close.focus();
      load(D.seq);
    },
    close: function(){
      if (!D || !ui || ui.root.hidden) return;
      var d = D;
      ui.root.hidden = true;
      if (!hadLock) document.documentElement.classList.remove('v2-lock');
      D = null;
      var back = null;
      if (typeof d.opts.restoreFocus === 'function'){ try { back = d.opts.restoreFocus(d.slug); } catch (e) { back = null; } }
      if (!visibleEl(back)) back = visibleEl(d.opener) ? d.opener : null;
      if (back) back.focus();
      if (typeof d.opts.onClose === 'function'){ try { d.opts.onClose(d.slug); } catch (e2) {} }
    },
    refresh: function(){ if (D && ui && !ui.root.hidden) renderAll(); },
    isOpen: function(){ return !!D && !!ui && !ui.root.hidden; },
    current: function(){ return D ? D.slug : null; },
    loadNicknames: loadNicknames,
    nickname: nickname
  };
  window.BDDossier = api;
})();
