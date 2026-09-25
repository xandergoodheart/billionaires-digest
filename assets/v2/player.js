/* Billionaires Digest v2: Player profile (player.html?p=<slug>). ES5, UI only.
   Facts come from data/people/index.json (Forbes rank, net worth), data/people/<slug>.json (sourced profile), the
   fantasy week and day files (via BDFantasyStore) and the latest digest.json. Nothing is made up: when a field is
   missing it is left out. "+ Add to team" uses the same store action as the Draft room.
   Game only: play money, no prizes. Not financial advice. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, P = window.BDPlayersCore;
  var el = BD.el, arr = BD.arr, fmt = F.fmt;
  var MINUS = '−';
  var $ = function(id){ return document.getElementById(id); };
  var TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'gamelog', label: 'Game log' },
    { key: 'news', label: 'News' },
    { key: 'company', label: 'Company' },
    { key: 'scoring', label: 'Scoring' }
  ];

  // ---- helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function txt(s){ return document.createTextNode(s); }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function sr(text){ return el('span', 'v2-sr', text); }
  function say(t){ var n = $('live'); n.textContent = ''; setTimeout(function(){ n.textContent = t; }, 30); }
  function str(x){ return x == null ? '' : String(x).trim(); }
  function extLink(url, text, cls){
    var u = BD.safeUrl(url);
    if (!u) return null;
    var a = link(cls || 'pp-src', text || 'Source', u);
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.appendChild(sr(' (opens in a new tab)'));
    return a;
  }
  function when(x){
    var s = str(x);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return BD.fmtDate(s);
    if (/^\d{4}-\d{2}$/.test(s)) return BD.monYear(s);
    return s;
  }
  function card(id, title, meta){
    var sec = el('section', 'v2-card pp-card');
    var head = el('div', 'v2-card__head');
    var h = el('h2', 'v2-h2', title); h.id = id + '-h';
    head.appendChild(h);
    if (meta) head.appendChild(el('span', 'v2-card__meta', meta));
    sec.appendChild(head);
    sec.setAttribute('aria-labelledby', h.id);
    return sec;
  }
  function empty(text){ return el('p', 'v2-msg pp-empty', text); }

  // ---- which player ----
  var slug = (function(){
    var m = /[?&]p=([^&#]*)/.exec(location.search || '');
    var s = '';
    try { s = m ? decodeURIComponent(m[1]) : ''; } catch (e) { s = ''; }
    return /^[a-z0-9][a-z0-9-]{0,80}$/.test(s) ? s : '';
  })();

  var D = { idx: null, peopleIx: null, prof: null, pool: null, nd: null, digest: null, digestState: 'loading' };
  var UI = { tab: 'overview', msg: null };

  function name(){ return (D.idx && D.idx.name) || (D.pool && D.pool.name) || (D.nd && D.nd.name) || slug; }
  function sector(){ return (D.pool && D.pool.sector) || (D.idx && D.idx.sector) || (D.nd && D.nd.sector) || 'Other'; }
  function rank(){ var r = (D.idx && D.idx.rank) || (D.pool && D.pool.rank) || (D.nd && D.nd.rank); return typeof r === 'number' ? r : null; }
  function sal(){ var s = F.salaries()[slug]; return typeof s === 'number' ? s : null; }
  function draftPool(){ return arr(F.state.draftWk && F.state.draftWk.draftable); }
  function weekPts(){ return F.weekPoints(F.state.sbWk, slug); }
  function avgPts(){ var a = F.stat(slug).avg; return typeof a === 'number' ? Math.round(a) : null; }
  function secRank(){ return F.state.sbWk ? P.sectorRank(draftPool(), slug, function(s){ return F.weekPoints(F.state.sbWk, s); }) : null; }
  function holdings(){ return arr(D.pool && D.pool.holdings); }
  function series(){ return P.dailySeries([F.state.prevWk, F.state.sbWk], slug); }
  function logRows(){ return P.gameLog(F.state.days, series().map(function(x){ return x.date; }), slug); }
  function inSavedTeam(){
    var t = F.savedTeam(), live = F.state.sbWk ? F.matchTeam(F.state.sbWk) : null;
    return (t && arr(t.picks).indexOf(slug) >= 0) || (live && arr(live.picks).indexOf(slug) >= 0);
  }
  function weekLabel(){ var w = F.state.sbWk; return w ? (w.practice ? 'Practice week' : fmt.weekTitle(w.week)) : ''; }

  // ---- not found ----
  function notFound(){
    var page = clear($('page'));
    page.removeAttribute('aria-busy');
    document.title = 'Player not found · Billionaires Digest';
    var sec = el('section', 'v2-card pp-notfound');
    var h = el('h1', 'v2-h1', 'Player not found'); sec.appendChild(h);
    sec.appendChild(el('p', 'v2-lede', slug ? 'We could not find a player called "' + slug + '".' : 'This link does not say which player to show.'));
    sec.appendChild(el('p', null, 'The player list has everyone in the game this week.'));
    sec.appendChild(link('v2-btn v2-btn--primary', 'See all players', 'players.html'));
    page.appendChild(sec);
    renderCrumbs(null);
  }

  // ---- breadcrumb ----
  function renderCrumbs(withPlayer){
    var ol = clear($('crumbs').querySelector('ol'));
    var li = el('li'); li.appendChild(link(null, 'Players', 'players.html')); ol.appendChild(li);
    if (!withPlayer) return;
    var s = sector();
    li = el('li'); li.appendChild(link(null, s, 'players.html?sector=' + encodeURIComponent(s))); ol.appendChild(li);
    li = el('li'); var cur = el('span', null, name()); cur.setAttribute('aria-current', 'page'); li.appendChild(cur); ol.appendChild(li);
  }

  // ---- hero ----
  function stat(label, value, cls, sub, id){
    var d = el('div', 'pp-stat');
    var v = el('span', 'pp-stat__v num' + (cls ? ' ' + cls : ''), value);
    if (id) v.id = id;
    d.appendChild(v);
    d.appendChild(el('span', 'pp-stat__k', label));
    if (sub) d.appendChild(el('span', 'pp-stat__sub', sub));
    return d;
  }
  function renderHero(){
    var hero = el('section', 'pp-hero');
    hero.setAttribute('aria-labelledby', 'pname');
    // portrait slot: initials on a sector plate until the illustrated portraits are approved
    var art = el('div', 'pp-hero__art');
    var av = el('span', 'v2-av pp-av', BD.initials(name()));
    av.setAttribute('data-sector', BD.sectorSlug(sector()));
    av.setAttribute('aria-hidden', 'true');
    art.appendChild(av);
    hero.appendChild(art);

    var main = el('div', 'pp-hero__main');
    var tks = P.tickers(D.pool || {});
    if (tks.length){
      var pill = tks.slice(0, 3).join(' · ');
      var first = holdings()[0];
      if (tks.length === 1 && first && first.name) pill += ' / ' + first.name;
      else if (tks.length > 3) pill += ' +' + (tks.length - 3) + ' more';
      main.appendChild(el('span', 'v2-pill pp-hero__pill', pill));
    }
    var h = el('h1', 'v2-display pp-hero__name', name()); h.id = 'pname';
    main.appendChild(h);
    var sub = el('p', 'pp-hero__sub');
    var bits = [];
    if (D.idx && D.idx.source) bits.push(D.idx.source);
    bits.push(sector());
    sub.textContent = bits.join(' / ');
    main.appendChild(sub);
    var r = rank();
    if (r != null || (D.idx && D.idx.worth)){
      var fb = el('p', 'pp-hero__forbes');
      fb.appendChild(txt((r != null ? 'No. ' + r + ' on Forbes' : 'Forbes') + (D.idx && D.idx.worth ? ' · ' + D.idx.worth : '')));
      var ix = D.peopleIx;
      if (ix && ix.sourceUrl){
        fb.appendChild(txt(' · '));
        var a = extLink(ix.sourceUrl, (ix.source || 'Source') + (ix.asOf ? ', ' + BD.fmtDate(BD.isoOf(ix.asOf)) : ''), 'pp-hero__src');
        if (a) fb.appendChild(a);
      }
      main.appendChild(fb);
    }
    hero.appendChild(main);

    var side = el('div', 'pp-hero__side');
    var act = el('div', 'pp-act'); act.id = 'act';
    side.appendChild(act);
    var stats = el('div', 'pp-stats');
    var w = weekPts(), a2 = avgPts(), s = sal(), sr2 = secRank();
    stats.appendChild(stat('Week pts', w == null ? '—' : signedTxt(w), w == null ? '' : numCls(w), weekLabel()));
    stats.appendChild(stat('Avg pts/day', a2 == null ? '—' : signedTxt(a2), a2 == null ? '' : numCls(a2), a2 == null ? '' : 'recent scored days'));
    stats.appendChild(stat('Cap cost', s == null ? '—' : String(s), '', s == null ? 'not draftable' : 'of ' + C.CAP));
    stats.appendChild(stat('Sector rank', sr2 ? sr2.rank + ' of ' + sr2.of : '—', '', sr2 ? sr2.sector + ', week pts' : ''));
    side.appendChild(stats);
    hero.appendChild(side);
    return hero;
  }
  function ndReason(){ var r = (D.nd && D.nd.reason) || 'Not in this week\'s player pool'; return r.charAt(0).toLowerCase() + r.slice(1); }
  function renderAction(){
    var box = $('act');
    if (!box) return;
    clear(box);
    var S = F.state, picked = S.picks.indexOf(slug) >= 0, s = sal();
    var b;
    if (s == null){
      box.appendChild(el('p', 'pp-act__why', 'Can\'t be drafted this week: ' + ndReason() + '.'));
    } else if (picked){
      b = btn('v2-btn v2-btn--selected pp-act__btn', 'In your team');
      b.setAttribute('aria-pressed', 'true');
      b.setAttribute('aria-label', name() + ' is in your picks. Press to remove.');
      b.appendChild(el('span', 'pp-act__hint', 'Remove'));
    } else {
      var why = F.blockReason(slug);
      b = btn('v2-btn v2-btn--primary pp-act__btn' + (why ? ' is-blocked' : ''), '+ Add to team');
      b.setAttribute('aria-pressed', 'false');
      if (why){ b.setAttribute('aria-disabled', 'true'); b.setAttribute('aria-label', 'Add ' + name() + ' to your team: ' + why); b.setAttribute('data-why', why); }
      else b.setAttribute('aria-label', 'Add ' + name() + ' to your team, cap ' + s);
    }
    if (b){ b.id = 'addbtn'; box.appendChild(b); }
    var why2 = b && b.getAttribute('data-why');
    if (why2) box.appendChild(el('p', 'pp-act__why', why2 === 'Lineup full' ? 'Your five is full. Remove someone in the Draft room first.' : 'Over the cap by ' + why2.replace(/^Over by /, '') + '. Free up cap in the Draft room first.'));
    var n = S.picks.length, left = C.CAP - F.capUsed();
    var line = el('p', 'pp-act__line');
    line.appendChild(txt(UI.msg ? UI.msg + ' ' : ''));
    line.appendChild(txt('Your draft: ' + n + ' of ' + C.PICKS + ', ' + (left < 0 ? 'over by ' + Math.abs(left) : plainTxt(left) + ' cap left') + '. '));
    if (inSavedTeam() && !picked) line.appendChild(txt('In your saved team. '));
    line.appendChild(link('pp-act__link', 'Draft room', 'draft.html'));
    box.appendChild(line);
  }

  // ---- tabs (ARIA tablist, arrow keys, Home/End) ----
  function renderTabs(page){
    var bar = el('div', 'pp-tabs');
    var list = el('div', 'pp-tabs__list'); list.setAttribute('role', 'tablist'); list.setAttribute('aria-label', name() + ' sections');
    TABS.forEach(function(t){
      var b = btn('pp-tab', t.label);
      b.id = 'tab-' + t.key; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'panel-' + t.key);
      b.setAttribute('data-tab', t.key);
      list.appendChild(b);
    });
    bar.appendChild(list);
    page.appendChild(bar);
    TABS.forEach(function(t){
      var p = el('div', 'pp-panel'); p.id = 'panel-' + t.key;
      p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'tab-' + t.key); p.tabIndex = 0;
      page.appendChild(p);
    });
    list.addEventListener('keydown', function(e){
      var keys = TABS.map(function(t){ return t.key; }), i = keys.indexOf(UI.tab), j = null;
      if (e.key === 'ArrowRight' || e.key === 'Right') j = (i + 1) % keys.length;
      else if (e.key === 'ArrowLeft' || e.key === 'Left') j = (i - 1 + keys.length) % keys.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = keys.length - 1;
      if (j == null) return;
      e.preventDefault();
      showTab(keys[j], true);
    });
  }
  function showTab(key, focus){
    UI.tab = key;
    TABS.forEach(function(t){
      var b = $('tab-' + t.key), p = $('panel-' + t.key), on = t.key === key;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      p.hidden = !on;
    });
    if (focus) $('tab-' + key).focus();
    try { if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + (key === 'overview' ? '' : '#' + key)); } catch (e) {}
  }

  // ---- overview: daily points chart + scouting report ----
  function chart(pts){
    var NS = 'http://www.w3.org/2000/svg';
    function s(tag, attrs, text){ var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; }
    // top and bottom keep room for a value label above a positive bar and below a negative one
    var W = 640, H = 280, top = 34, bottom = 46 + 30, n = pts.length;
    var maxPos = 0, maxNeg = 0;
    pts.forEach(function(x){ if (x.points != null){ if (x.points > maxPos) maxPos = x.points; if (x.points < maxNeg) maxNeg = x.points; } });
    var span = (maxPos - maxNeg) || 1;
    var plotH = H - top - bottom;
    var zeroY = top + plotH * (maxPos / span);
    if (maxPos === 0 && maxNeg === 0) zeroY = top + plotH / 2;
    var slot = W / Math.max(n, 1), bw = Math.min(64, slot * 0.55);
    var desc = pts.map(function(x){ return fmt.dayLabel(x.date) + ' ' + (x.points == null ? 'no score' : signedTxt(x.points)); }).join(', ');
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'pp-chart__svg', role: 'img', 'aria-label': 'Daily fantasy points for ' + name() + ': ' + desc + '.', preserveAspectRatio: 'xMidYMid meet' });
    svg.appendChild(s('line', { x1: 0, x2: W, y1: zeroY, y2: zeroY, 'class': 'pp-chart__zero' }));
    pts.forEach(function(x, i){
      var cx = slot * i + slot / 2;
      if (x.points != null && x.points !== 0){
        var hgt = Math.max(2, Math.abs(x.points) / span * plotH);
        var y = x.points > 0 ? zeroY - hgt : zeroY;
        svg.appendChild(s('rect', { x: cx - bw / 2, y: y, width: bw, height: hgt, 'class': x.points > 0 ? 'pp-chart__pos' : 'pp-chart__neg' }));
        var ly = x.points > 0 ? y - 8 : y + hgt + 20;
        svg.appendChild(s('text', { x: cx, y: ly, 'text-anchor': 'middle', 'class': 'pp-chart__val' }, signedTxt(x.points)));
      } else {
        svg.appendChild(s('text', { x: cx, y: zeroY - 8, 'text-anchor': 'middle', 'class': 'pp-chart__val' }, x.points == null ? 'no score' : '0'));
      }
      svg.appendChild(s('text', { x: cx, y: H - 22, 'text-anchor': 'middle', 'class': 'pp-chart__day' }, fmt.DAYN[C.weekday(x.date)].toUpperCase()));
      svg.appendChild(s('text', { x: cx, y: H - 4, 'text-anchor': 'middle', 'class': 'pp-chart__date' }, fmt.shortDate(x.date)));
    });
    return svg;
  }
  function renderOverview(){
    var panel = clear($('panel-overview'));
    var grid = el('div', 'v2-grid');
    // chart
    var pts = series();
    var c = card('daily', 'Daily points', weekLabel() || null);
    c.className += ' span-8';
    var anyPts = pts.some(function(x){ return x.points != null; });
    if (!anyPts){
      c.appendChild(empty(F.state.draftWk && sal() == null ? name() + ' is not in the game this week, so there are no daily points.' : 'No scored days yet. Points show here after the first trading day of a week.'));
    } else {
      c.appendChild(el('p', 'pp-chart__k', 'Fantasy points per trading day, before the captain bonus'));
      var wrap = el('div', 'pp-chart');
      wrap.appendChild(chart(pts));
      c.appendChild(wrap);
      // same numbers as a table for screen readers
      var t = el('table', 'v2-sr');
      t.appendChild(el('caption', null, 'Daily fantasy points for ' + name()));
      var th = el('thead'), tr = el('tr');
      tr.appendChild(el('th', null, 'Day')); tr.appendChild(el('th', null, 'Points'));
      th.appendChild(tr); t.appendChild(th);
      var tb = el('tbody');
      pts.forEach(function(x){ var r = el('tr'); r.appendChild(el('td', null, fmt.dayLabel(x.date))); r.appendChild(el('td', null, x.points == null ? 'no score' : signedTxt(x.points))); tb.appendChild(r); });
      t.appendChild(tb); c.appendChild(t);
      var w = weekPts();
      if (w != null) c.appendChild(el('p', 'pp-note', 'Total so far in ' + (F.state.sbWk ? fmt.weekName(F.state.sbWk.week) : 'this week') + ': ' + signedTxt(w) + ' points.'));
    }
    grid.appendChild(c);
    // scouting report
    var r = card('scout', 'The scouting report');
    r.className += ' span-4 pp-scout';
    renderScout(r);
    grid.appendChild(r);
    panel.appendChild(grid);
  }
  function scoutItem(list, label, body){
    var li = el('li', 'pp-scout__item');
    li.appendChild(el('span', 'pp-scout__k', label));
    var d = el('div', 'pp-scout__v');
    body(d);
    li.appendChild(d);
    list.appendChild(li);
  }
  function renderScout(box){
    var ul = el('ul', 'pp-scout__list'), prof = D.prof, st = F.stat(slug), hs = holdings();
    // what scores
    if (hs.length){
      scoutItem(ul, 'Scores on', function(d){
        var parts = hs.slice(0, 4).map(function(h){ return h.ticker + (h.name ? ' (' + h.name + ')' : '') + ' ' + P.weightPct(h.weight); });
        d.appendChild(txt(parts.join(', ') + (hs.length > 4 ? ', and ' + (hs.length - 4) + ' more' : '') + '.'));
        if (D.pool.method) d.appendChild(el('span', 'pp-scout__meta', 'Weights: ' + D.pool.method + '.'));
      });
    } else if (sal() == null){
      scoutItem(ul, 'In the game', function(d){ d.appendChild(txt('Can\'t be drafted this week: ' + ndReason() + '.')); });
    }
    if (sal() != null) scoutItem(ul, 'Cap cost', function(d){ d.appendChild(txt(sal() + ' of ' + C.CAP + ' this week' + (F.state.draftWk && F.state.draftWk.salaryMethod ? ' (' + F.state.draftWk.salaryMethod + ')' : '') + '.')); });
    // form, only from the data
    var form = [];
    if (st.hot && st.hotWhy) form.push(st.hotWhy + '.');
    if (st.buy) form.push('Insider buy filed ' + fmt.dayLabel(st.buy) + ' (+25 that day).');
    if (st.news) form.push(st.news + (st.news === 1 ? ' story' : ' stories') + ' in the latest edition (+10 each).');
    if (form.length) scoutItem(ul, 'Recent form', function(d){ d.appendChild(txt(form.join(' '))); });
    if (prof){
      var ctl = arr(prof.controls).filter(function(e){ return e && e.name; });
      if (ctl.length) scoutItem(ul, 'Controls', function(d){
        var inner = el('ul', 'pp-facts');
        ctl.slice(0, 3).forEach(function(e){
          var li = el('li');
          li.appendChild(el('strong', null, e.name + (e.ticker ? ' (' + e.ticker + ')' : '')));
          if (e.role) li.appendChild(txt(': ' + e.role));
          var a = extLink(e.source); if (a){ li.appendChild(txt(' ')); li.appendChild(a); }
          inner.appendChild(li);
        });
        d.appendChild(inner);
      });
      var watch = arr(prof.watch).filter(function(e){ return e && e.what; });
      if (watch.length) scoutItem(ul, 'What to watch', function(d){
        var inner = el('ul', 'pp-facts');
        watch.slice(0, 3).forEach(function(e){
          var li = el('li');
          li.appendChild(txt(e.what + (e.when ? ' (' + when(e.when) + ')' : '')));
          var a = extLink(e.source); if (a){ li.appendChild(txt(' ')); li.appendChild(a); }
          inner.appendChild(li);
        });
        d.appendChild(inner);
      });
      if (str(prof.gaps)) scoutItem(ul, 'Not verified', function(d){
        var det = el('details', 'pp-gaps');
        det.appendChild(el('summary', null, 'What our research could not confirm'));
        det.appendChild(el('p', null, str(prof.gaps)));
        d.appendChild(det);
      });
    }
    box.appendChild(ul);
    var foot = el('div', 'pp-scout__foot');
    var sb = btn('v2-link pp-scout__link', 'View scoring breakdown'); sb.setAttribute('data-goto', 'scoring');
    foot.appendChild(sb);
    if (D.idx && D.idx.hasProfile) foot.appendChild(link('v2-btn v2-btn--ghost pp-scout__full', 'Full profile and filings', 'people/' + encodeURIComponent(slug) + '/'));
    box.appendChild(foot);
  }

  // ---- game log ----
  function renderGameLog(){
    var panel = clear($('panel-gamelog'));
    var c = card('log', 'Game log', weekLabel() || null);
    var rows = logRows();
    if (!rows.length){
      c.appendChild(empty(sal() == null && !D.pool ? name() + ' is not in the game this week, so there is no game log.' : 'No scored days yet. Each trading day shows here once it is scored.'));
      panel.appendChild(c); return;
    }
    c.appendChild(el('p', 'pp-chart__k', 'Points per trading day, before the captain bonus. Price points = portfolio return % × 100, rounded.'));
    var wrap = el('div', 'pp-scroll'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Game log table, scrolls sideways');
    var t = el('table', 'v2-table pp-log');
    t.appendChild(el('caption', 'v2-sr', 'Game log for ' + name() + ', newest day first'));
    var th = el('thead'), tr = el('tr');
    [['Date', ''], ['Holdings that day', ''], ['Return', 'n'], ['Price pts', 'n'], ['Insider buy', 'n'], ['Stories', 'n'], ['Total', 'n']].forEach(function(x){ var h = el('th', x[1] || null, x[0]); h.scope = 'col'; tr.appendChild(h); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function(r){
      var row = el('tr');
      var d = el('th', 'pp-log__date', fmt.dayLabel(r.date)); d.scope = 'row'; row.appendChild(d);
      var hc = el('td', 'pp-log__hold');
      function hline(h){ var sp = el('span', 'pp-log__h'); sp.appendChild(txt(h.ticker + ' ')); sp.appendChild(el('span', h.changePct == null ? 'v2-zero' : numCls(h.changePct), P.pct(h.changePct))); return sp; }
      r.holdings.slice(0, 3).forEach(function(h){ hc.appendChild(hline(h)); });
      if (r.holdings.length > 3){
        var det = el('details', 'pp-log__more');
        det.appendChild(el('summary', null, 'All ' + r.holdings.length + ' holdings'));
        var box = el('div', 'pp-log__all');
        r.holdings.forEach(function(h){ var sp = hline(h); sp.appendChild(el('span', 'pp-log__w', ' · weight ' + P.weightPct(h.weight))); box.appendChild(sp); });
        det.appendChild(box); hc.appendChild(det);
      }
      row.appendChild(hc);
      row.appendChild(el('td', 'n ' + (r.returnPct == null ? 'v2-zero' : numCls(r.returnPct)), P.pct(r.returnPct)));
      row.appendChild(el('td', 'n ' + (r.pricePoints == null ? 'v2-zero' : numCls(r.pricePoints)), r.pricePoints == null ? '—' : signedTxt(r.pricePoints)));
      row.appendChild(el('td', 'n ' + numCls(r.insiderBuy), r.insiderBuy ? signedTxt(r.insiderBuy) : '0'));
      row.appendChild(el('td', 'n ' + numCls(r.stories), r.stories ? signedTxt(r.stories) : '0'));
      row.appendChild(el('td', 'n pp-log__tot ' + (r.points == null ? 'v2-zero' : numCls(r.points)), r.points == null ? '—' : signedTxt(r.points)));
      tb.appendChild(row);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    c.appendChild(wrap);
    panel.appendChild(c);
  }

  // ---- news ----
  function renderNews(){
    var panel = clear($('panel-news'));
    var c = card('pnews', 'News');
    if (D.digestState === 'loading'){ c.appendChild(el('p', 'v2-loading', 'Loading the latest edition…')); panel.appendChild(c); return; }
    var dg = D.digest, items = [];
    if (dg) arr(dg.stories).forEach(function(s){ if (s && s.headline && BD.storyMatches(s, name())) items.push(s); });
    var iso = dg ? BD.isoFromLong(dg.date) : null;
    if (!dg) c.appendChild(empty('The latest edition is not available right now.'));
    else if (!items.length) c.appendChild(empty('No stories about ' + name() + ' in the latest edition' + (iso ? ' (' + BD.fmtDate(iso) + ')' : '') + '.'));
    else {
      var ul = el('ul', 'v2-news pp-news');
      items.forEach(function(s){
        var li = el('li');
        li.appendChild(el('span', 'v2-kicker', (s.type || s.sector || 'Story') + (iso ? ' / ' + BD.monDay(iso) : '')));
        var u = BD.safeUrl(s.url);
        if (u){
          var a = link('v2-news__h', s.headline, u); a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.appendChild(sr(' (opens the source in a new tab)'));
          li.appendChild(a);
        } else li.appendChild(el('span', 'v2-news__h', s.headline));
        if (s.move) li.appendChild(el('p', 'pp-news__move', s.move));
        if (s.source) li.appendChild(el('span', 'v2-news__src', 'Source · ' + s.source));
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }
    var counts = (F.state.index && F.state.index.news) || {}, eds = arr(F.state.index && F.state.index.newsEditions);
    if (counts[slug] > 0){
      c.appendChild(el('p', 'v2-news__foot', 'In the game: ' + counts[slug] + (counts[slug] === 1 ? ' story' : ' stories') + ' in the ' + (eds.length ? eds.map(function(d){ return BD.monDay(d); }).join(', ') + ' edition' + (eds.length > 1 ? 's' : '') : 'latest edition') + '. Each story is worth +10 points on its day.'));
    }
    if (iso){
      var f = el('p', 'v2-news__foot');
      f.appendChild(link(null, 'Read the ' + BD.monDay(iso) + ' edition', 'editions/' + iso + '/'));
      c.appendChild(f);
    }
    panel.appendChild(c);
  }

  // ---- company ----
  function factRow(ul, main, bits, source, notes){
    var li = el('li', 'pp-fact');
    var m = el('div', 'pp-fact__main');
    m.appendChild(el('strong', null, main));
    var b = arr(bits).filter(function(x){ return str(x); });
    if (b.length) m.appendChild(el('span', 'pp-fact__bits', b.join(' · ')));
    if (str(notes)) m.appendChild(el('span', 'pp-fact__notes', str(notes)));
    li.appendChild(m);
    var a = extLink(source);
    if (a) li.appendChild(a);
    ul.appendChild(li);
  }
  function renderCompany(){
    var panel = clear($('panel-company')), prof = D.prof, any = false;
    var grid = el('div', 'v2-grid');
    var hs = holdings();
    if (hs.length){
      any = true;
      var c = card('hold', 'Holdings that score', D.pool.method || null);
      c.className += ' span-12';
      var wrap = el('div', 'pp-scroll'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Holdings table, scrolls sideways');
      var t = el('table', 'v2-table pp-hold');
      t.appendChild(el('caption', 'v2-sr', 'Holdings that score for ' + name() + ' this week'));
      var tr = el('tr');
      [['Ticker', ''], ['Company', ''], ['Weight', 'n'], ['Group', '']].forEach(function(x){ var h = el('th', x[1] || null, x[0]); h.scope = 'col'; tr.appendChild(h); });
      var th = el('thead'); th.appendChild(tr); t.appendChild(th);
      var tb = el('tbody');
      hs.slice().sort(function(a, b){ return (b.weight || 0) - (a.weight || 0); }).forEach(function(h){
        var r = el('tr');
        var tk = el('th', 'pp-hold__tk', h.ticker); tk.scope = 'row'; r.appendChild(tk);
        r.appendChild(el('td', null, h.name || '—'));
        r.appendChild(el('td', 'n', P.weightPct(h.weight)));
        r.appendChild(el('td', null, h.tier === 'controls' ? 'Controls' : (h.tier === 'stakes' ? 'Stake' : (h.tier || '—'))));
        tb.appendChild(r);
      });
      t.appendChild(tb); wrap.appendChild(t); c.appendChild(wrap);
      var note = el('p', 'pp-note');
      note.appendChild(txt('The daily move of these holdings, by weight, sets the price points. '));
      note.appendChild(link(null, 'How weights work', 'play-terms.html#how'));
      c.appendChild(note);
      grid.appendChild(c);
    }
    if (prof){
      var ctl = arr(prof.controls).filter(function(e){ return e && e.name; });
      if (ctl.length){
        any = true;
        var c2 = card('ctl', 'Companies they control'); c2.className += ' span-6';
        var ul = el('ul', 'pp-factlist');
        ctl.forEach(function(e){ factRow(ul, e.name, [[e.ticker, e.exchange].filter(Boolean).join(' · '), e.role, e.stake ? 'Stake: ' + e.stake + (e.stakeAsOf ? ' (as of ' + when(e.stakeAsOf) + ')' : '') : ''], e.source); });
        c2.appendChild(ul); grid.appendChild(c2);
      }
      var veh = arr(prof.vehicles).filter(function(e){ return e && e.name; });
      if (veh.length){
        any = true;
        var c3 = card('veh', 'Holding vehicles'); c3.className += ' span-6';
        var ul3 = el('ul', 'pp-factlist');
        veh.forEach(function(e){ factRow(ul3, e.name, [e.type], e.source, e.notes); });
        c3.appendChild(ul3); grid.appendChild(c3);
      }
      // real estate: city or area only, exactly as in the data
      var re = arr(prof.realEstate).filter(function(e){ return e && str(e.area); });
      if (re.length){
        any = true;
        var c4 = card('re', 'Real estate', 'City or area only'); c4.className += ' span-6';
        var ul4 = el('ul', 'pp-factlist');
        re.forEach(function(e){ factRow(ul4, str(e.area), [e.type, e.date ? when(e.date) : ''], e.source); });
        c4.appendChild(ul4); grid.appendChild(c4);
      }
    }
    if (!any){
      var c5 = card('co', 'Company');
      c5.className += ' span-12';
      c5.appendChild(empty('No company details on file for ' + name() + '.'));
      grid.appendChild(c5);
    }
    panel.appendChild(grid);
    if (D.idx && D.idx.hasProfile){
      var p = el('p', 'pp-more');
      p.appendChild(link('v2-btn v2-btn--ghost', 'Full profile and filings', 'people/' + encodeURIComponent(slug) + '/'));
      panel.appendChild(p);
    }
  }

  // ---- scoring ----
  function renderScoring(){
    var panel = clear($('panel-scoring'));
    var c = card('how', 'How ' + name() + ' scores');
    var rows = logRows(), last = rows[0] || null;
    var rules = (last && F.state.days[last.date] && F.state.days[last.date].rules) || {};
    var buyPts = typeof rules.insiderBuy === 'number' ? rules.insiderBuy : 25;
    var storyPts = typeof rules.perStory === 'number' ? rules.perStory : 10;
    if (sal() == null){
      c.appendChild(el('p', 'v2-lede', name() + ' can\'t be drafted this week: ' + ndReason() + '.'));
      c.appendChild(el('p', null, 'Private companies, funds and family holdings have no daily price, so people whose wealth is mostly private cannot be drafted.'));
    }
    c.appendChild(el('p', 'pp-chart__k', 'Each trading day (Monday to Friday, US market days), a player earns:'));
    var ol = el('ol', 'pp-rules');
    function rule(title, body, mine){
      var li = el('li');
      li.appendChild(el('strong', null, title));
      li.appendChild(el('span', null, body));
      if (mine) li.appendChild(el('span', 'pp-rules__mine', mine));
      ol.appendChild(li);
    }
    var hs = holdings();
    var port = hs.length ? 'Portfolio: ' + hs.slice(0, 4).map(function(h){ return h.ticker + ' ' + P.weightPct(h.weight); }).join(', ') + (hs.length > 4 ? ', and ' + (hs.length - 4) + ' more' : '') + (D.pool.method ? ' (' + D.pool.method + ').' : '.') : '';
    var lastTxt = last && last.returnPct != null && last.pricePoints != null ? ' On ' + fmt.dayLabel(last.date) + ' the portfolio moved ' + P.pct(last.returnPct) + ', so price points were ' + signedTxt(last.pricePoints) + '.' : '';
    rule('Price points', 'The portfolio\'s return that day × 100, rounded. +1.23% is +123; a down day is negative. A quote that did not trade that day counts as 0%.', (port + lastTxt).trim());
    rule('Insider buy: +' + buyPts, 'For each Form 4 open-market purchase (code P) filed that day.', last ? 'On ' + fmt.dayLabel(last.date) + ': ' + (last.insiderBuy ? signedTxt(last.insiderBuy) : '0') + '.' + (F.stat(slug).buy ? ' Most recent: ' + fmt.dayLabel(F.stat(slug).buy) + '.' : '') : '');
    rule('Stories: +' + storyPts + ' each', 'For each story about them in that day\'s Digest.', last ? 'On ' + fmt.dayLabel(last.date) + ': ' + (last.stories ? signedTxt(last.stories) : '0') + '.' : '');
    var capTxt = '';
    if (last && last.points != null) capTxt = 'On ' + fmt.dayLabel(last.date) + ': ' + signedTxt(last.points) + ' points, or ' + signedTxt(C.captainPoints(last.points)) + ' as captain.';
    rule('Captain: × ' + C.CAPTAIN_MULT, 'If you make them captain, their total for the day is multiplied by ' + C.CAPTAIN_MULT + ' and rounded.', capTxt);
    c.appendChild(ol);
    var s = sal();
    var capP = el('p', 'pp-note');
    capP.appendChild(txt((s != null ? 'Cap cost this week: ' + s + ' of ' + C.CAP + '. ' : '') + 'Salaries follow Forbes rank among draftable people: ranks 1–5 cost 30, 6–10 cost 26, 11–20 cost 22, 21–35 cost 18, 36–50 cost 14, 51–75 cost 10, 76–100 cost 7. They are frozen when the week opens. After four weeks of results, salaries move up to ±4 by recent form. '));
    capP.appendChild(link(null, 'Full rules', 'play-terms.html#how'));
    c.appendChild(capP);
    panel.appendChild(c);
  }

  // ---- page ----
  function renderPage(){
    var page = clear($('page'));
    page.removeAttribute('aria-busy');
    document.title = name() + ' · Players · Billionaires Digest';
    renderCrumbs(true);
    page.appendChild(renderHero());
    renderTabs(page);
    renderAction();
    renderOverview(); renderGameLog(); renderNews(); renderCompany(); renderScoring();
    var h = (location.hash || '').replace('#', '');
    showTab(TABS.some(function(t){ return t.key === h; }) ? h : 'overview', false);
  }

  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var t;
    if ((t = b.getAttribute('data-tab'))){ showTab(t, false); return; }
    if ((t = b.getAttribute('data-goto'))){ showTab(t, true); window.scrollTo(0, $('tab-' + t).getBoundingClientRect().top + window.pageYOffset - 16); return; }
    if (b.id === 'addbtn'){
      var r;
      if (b.getAttribute('aria-disabled') === 'true'){ say('Cannot add ' + name() + ': ' + b.getAttribute('data-why') + '.'); return; }
      if (F.state.picks.indexOf(slug) >= 0){ r = F.removePick(slug); if (r.ok) UI.msg = 'Removed from your picks.'; }
      else { r = F.addPick(slug); if (r.ok) UI.msg = 'Added to your picks' + (F.state.captain === slug ? ' as captain' : '') + '. Save your team in the Draft room.'; }
      if (r && r.ok) say(UI.msg + ' ' + F.capLine());
      // renderAction runs from the store's 'roster' event
      var nb = $('addbtn'); if (nb) nb.focus();
    }
  });
  F.onChange(function(kind){ if (F.state.loaded && D.ready && (kind === 'roster' || kind === 'saved')) renderAction(); });

  function fail(){
    var page = clear($('page'));
    page.removeAttribute('aria-busy');
    var sec = el('section', 'v2-card pp-notfound');
    sec.appendChild(el('h1', 'v2-h1', 'Player'));
    sec.appendChild(el('p', 'v2-msg v2-msg--bad', 'The player data is not available right now. Try again later.'));
    var rb = btn('v2-btn v2-btn--ghost', 'Try again'); rb.addEventListener('click', function(){ location.reload(); });
    sec.appendChild(rb);
    page.appendChild(sec);
    say('The player data is not available right now.');
  }

  if (F.testClock() != null){ var tcb = $('testclock'); tcb.hidden = false; tcb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }
  if (!slug){ notFound(); return; }

  BD.getJson('digest.json').then(function(d){ D.digest = d; D.digestState = 'ok'; }, function(){ D.digestState = 'error'; })
    .then(function(){ if (D.ready) renderNews(); });

  // the profile file is only asked for when the people index says it exists (no 404s for unknown links)
  var peopleP = BD.loadPeople().then(null, function(){ return null; });
  var profP = peopleP.then(function(){
    var ip = BD.indexBySlug(slug);
    return ip && ip.hasProfile ? BD.loadProfile(slug).then(null, function(){ return null; }) : null;
  });
  Promise.all([F.init(), peopleP, profP]).then(function(r){
    D.peopleIx = r[1]; D.prof = r[2];
    D.idx = BD.indexBySlug(slug);
    draftPool().forEach(function(p){ if (p.slug === slug) D.pool = p; });
    if (!D.pool && F.state.people[slug]) D.pool = F.state.people[slug];
    arr(F.state.index && F.state.index.notDraftable).forEach(function(p){ if (p && p.slug === slug) D.nd = p; });
    if (!D.idx && !D.pool && !D.nd){ notFound(); return; }
    D.ready = true;
    renderPage();
  }, function(err){ if (window.console) console.warn(err); fail(); });
})();
