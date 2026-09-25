/* Billionaires Digest: Billionaire Fantasy League (fantasy.html). ES5.
   Reads data/fantasy/index.json, weeks/<W>.json and days/<date>.json. Rules live in assets/fantasy-core.js;
   this file is UI only (lineup builder, player drawer, matchup, season). UI kit: assets/game-ui.css.
   The player's teams are kept in this browser only (localStorage, with an in-memory fallback). Game only. */
(function(){
  BD.initTheme();
  var C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr;
  var KEY = 'bd-fantasy-v1';
  var DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var $ = function(id){ return document.getElementById(id); };
  var mqSheet = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false };

  // ---- clock (?now=ISO overrides it, for testing only) ----
  var nowOverride = null;
  (function(){
    var m = /[?&]now=([^&]+)/.exec(location.search);
    if (!m) return;
    var t = Date.parse(decodeURIComponent(m[1]));
    if (isFinite(t)) nowOverride = { at: t, started: Date.now() };
  })();
  function now(){ return nowOverride ? nowOverride.at + (Date.now() - nowOverride.started) : Date.now(); }

  // ---- storage ----
  var memory = null;
  function blank(){ return { v: 1, teams: {}, draft: { picks: [], captain: null }, record: null }; }
  function load(){
    var s = null;
    try { var raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = memory; }
    if (!s || typeof s !== 'object') s = memory || blank();
    if (!s.teams || typeof s.teams !== 'object') s.teams = {};
    if (!s.draft || !(s.draft.picks instanceof Array)) s.draft = { picks: [], captain: null };
    return s;
  }
  function persist(){
    memory = store;
    try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }
  var store = load();

  // ---- data ----
  function getJson(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function optJson(u){ return getJson(u).then(null, function(){ return null; }); }
  var weekCache = {}, dayCache = {};
  function loadWeek(id){ if (!weekCache[id]) weekCache[id] = optJson('data/fantasy/weeks/' + id + '.json'); return weekCache[id]; }
  function loadDay(d){ if (!dayCache[d]) dayCache[d] = optJson('data/fantasy/days/' + d + '.json'); return dayCache[d]; }

  var S = { index: null, draftWk: null, draftWeek: null, salaryFallback: false, sbWk: null, prevWk: null, lastDay: null,
            days: {}, people: {}, worth: {}, stats: {}, sparkDates: [], picks: [], captain: null };
  var UI = { tab: 'lineup', sector: '', q: '', afford: false, sort: 'rank', dir: 'asc', opp: null, day: 'week' };

  // ---- formatting ----
  function signed(n){ return typeof n === 'number' ? (n > 0 ? '+' + n : String(n)) : '—'; }
  function cls(n){ return typeof n === 'number' ? (n > 0 ? 'g-up' : (n < 0 ? 'g-down' : 'g-flat')) : 'g-flat'; }
  function dayLabel(d){ return DAYN[C.weekday(d)] + ' ' + BD.MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }
  function shortDate(d){ return BD.MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }
  function weekName(id){ return C.isPractice(id) ? 'the practice week' : 'the week of ' + shortDate(C.weekMonday(id)); }
  function weekTitle(id){ return C.isPractice(id) ? 'Practice week' : 'Week of ' + shortDate(C.weekMonday(id)); }
  function lockText(ms){
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) + ' ET';
    } catch (e) { return new Date(ms).toUTCString(); }
  }
  function spanParts(ms){
    var m = Math.max(0, Math.floor(ms / 60000));
    return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
  }
  function span(ms){ var p = spanParts(ms); return (p.d ? p.d + 'd ' : '') + (p.d || p.h ? p.h + 'h ' : '') + p.m + 'm'; }
  function say(t){ var n = $('live'); n.textContent = ''; setTimeout(function(){ n.textContent = t; }, 30); }
  function msg(id, t, bad){ var n = $(id); n.textContent = t || ''; n.className = 'fl-msg' + (bad ? ' bad' : ''); }
  function toast(t, bad){
    var region = $('toasts'), n = el('div', 'g-toast' + (bad ? ' g-toast--bad' : ''), t);
    region.appendChild(n);
    while (region.children.length > 3) region.removeChild(region.firstChild);
    setTimeout(function(){ if (n.parentNode) n.parentNode.removeChild(n); }, 4200);
  }
  function person(slug){ return S.people[slug] || { slug: slug, name: slug, sector: 'Other' }; }
  function avatar(slug, size){ var p = person(slug); return BD.avatar({ name: p.name, sector: p.sector || 'Other' }, size); }
  function salaries(){ return (S.draftWk && S.draftWk.salaries) || {}; }
  function capUsed(){ var s = salaries(), t = 0; S.picks.forEach(function(p){ t += s[p] || 0; }); return t; }
  function btn(cls, text, attrs){
    var b = el('button', cls, text); b.type = 'button';
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) b.setAttribute(k, attrs[k]);
    return b;
  }
  function nameBtn(slug, cls){
    var b = btn('g-link g-rp__name' + (cls ? ' ' + cls : ''), person(slug).name, { 'data-open': slug, 'aria-haspopup': 'dialog' });
    return b;
  }

  // ---- per-player form (pure UI helpers over the week files) ----
  function ptsOn(d, slug){
    var wks = [S.sbWk, S.prevWk];
    for (var i = 0; i < wks.length; i++){
      var w = wks[i];
      if (w && w.daily && w.daily[d] && typeof w.daily[d][slug] === 'number') return w.daily[d][slug];
    }
    return null;
  }
  function computeStats(){
    var dates = {};
    [S.prevWk, S.sbWk].forEach(function(w){ if (w) arr(w.days).forEach(function(d){ dates[d] = 1; }); });
    S.sparkDates = Object.keys(dates).sort().slice(-5);
    var lastDate = S.sparkDates[S.sparkDates.length - 1] || null;
    var wtd = S.sbWk && arr(S.sbWk.days).length ? arr(S.sbWk.days) : S.sparkDates;
    var news = (S.index && S.index.news) || {};
    var pool = arr(S.draftWk && S.draftWk.draftable);
    // top 10 on the last scored day
    var lastRank = {};
    if (lastDate){
      pool.map(function(p){ return { s: p.slug, v: ptsOn(lastDate, p.slug) }; })
        .filter(function(x){ return typeof x.v === 'number' && x.v > 0; })
        .sort(function(a, b){ return b.v - a.v; })
        .slice(0, 10).forEach(function(x, i){ lastRank[x.s] = i + 1; });
    }
    // insider buys (Form 4 code P) in day files within 14 days of the newest day
    var buyCut = lastDate ? C.addDays(lastDate, -14) : null;
    var st = {};
    pool.forEach(function(p){
      var series = S.sparkDates.map(function(d){ return ptsOn(d, p.slug); });
      var vals = wtd.map(function(d){ return ptsOn(d, p.slug); }).filter(function(v){ return typeof v === 'number'; });
      var avg = vals.length ? vals.reduce(function(a, b){ return a + b; }, 0) / vals.length : null;
      var tail = series.slice(-3), streak = tail.length === 3 && tail.every(function(v){ return typeof v === 'number' && v > 0; });
      var buy = null;
      Object.keys(S.days).sort().forEach(function(d){
        var e = S.days[d] && S.days[d].people && S.days[d].people[p.slug];
        if (e && e.bonuses && e.bonuses.insiderBuy > 0 && (!buyCut || d >= buyCut)) buy = d;
      });
      st[p.slug] = {
        avg: avg, n: vals.length, series: series, last: lastDate ? ptsOn(lastDate, p.slug) : null,
        hot: !!lastRank[p.slug] || streak, hotWhy: lastRank[p.slug] ? 'No. ' + lastRank[p.slug] + ' on ' + dayLabel(lastDate) : (streak ? 'Up three scored days running' : ''),
        news: news[p.slug] || 0, buy: buy
      };
    });
    S.stats = st;
  }
  function stat(slug){ return S.stats[slug] || { avg: null, n: 0, series: [], last: null, hot: false, news: 0, buy: null }; }
  function avgTxt(slug){ var a = stat(slug).avg; return a == null ? '—' : signed(Math.round(a)); }
  function projection(picks, captain){
    var t = 0, any = false;
    picks.forEach(function(s){ var a = stat(s).avg; if (a == null) return; any = true; t += s === captain ? a * C.CAPTAIN_MULT : a; });
    return any ? Math.round(t) : null;
  }
  function badges(slug, withNews){
    var b = el('span', 'g-badges'), s = stat(slug);
    if (s.hot){ var h = el('span', 'g-badge g-badge--hot', 'Hot'); h.title = s.hotWhy; b.appendChild(h); }
    if (withNews !== false && s.news){ var n = el('span', 'g-badge g-badge--news', 'News ' + s.news); n.title = s.news + (s.news === 1 ? ' story' : ' stories') + ' in recent editions'; b.appendChild(n); }
    if (s.buy){ var i = el('span', 'g-badge g-badge--buy', 'Insider buy'); i.title = 'Form 4 open-market purchase, ' + dayLabel(s.buy); b.appendChild(i); }
    return b.childNodes.length ? b : null;
  }

  // ---- SVG helpers ----
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs){ var n = document.createElementNS(SVGNS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function spark(values){
    var W = 72, H = 24, pad = 3;
    var pts = [];
    values.forEach(function(v, i){ if (typeof v === 'number') pts.push({ i: i, v: v }); });
    var root = svg('svg', { 'class': 'g-spark', viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });
    if (!pts.length) return root;
    var n = Math.max(values.length, 2);
    var lo = Math.min(0, Math.min.apply(null, pts.map(function(p){ return p.v; })));
    var hi = Math.max(0, Math.max.apply(null, pts.map(function(p){ return p.v; })));
    if (hi === lo) hi = lo + 1;
    function x(i){ return pad + i * (W - 2 * pad) / (n - 1); }
    function y(v){ return pad + (hi - v) * (H - 2 * pad) / (hi - lo); }
    root.appendChild(svg('line', { 'class': 'g-spark__zero', x1: 0, x2: W, y1: y(0), y2: y(0) }));
    if (pts.length >= 2){
      var d = pts.map(function(p, k){ return (k ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
      var first = pts[0].v, last = pts[pts.length - 1].v;
      root.setAttribute('class', 'g-spark ' + (last > first ? 'g-spark--up' : (last < first ? 'g-spark--down' : '')));
      root.appendChild(svg('path', { d: d }));
      var lp = pts[pts.length - 1];
      root.appendChild(svg('circle', { cx: x(lp.i), cy: y(lp.v), r: 2.5, 'class': lp.v > 0 ? 'up' : (lp.v < 0 ? 'down' : '') }));
    } else {
      // fewer than two scored days: dots only
      pts.forEach(function(p){ root.appendChild(svg('circle', { cx: x(p.i), cy: y(p.v), r: 3, 'class': p.v > 0 ? 'up' : (p.v < 0 ? 'down' : '') })); });
    }
    return root;
  }
  function sparkText(slug){
    var parts = [];
    S.sparkDates.forEach(function(d, i){ var v = stat(slug).series[i]; if (typeof v === 'number') parts.push(DAYN[C.weekday(d)] + ' ' + signed(v)); });
    return parts.length ? 'Recent days: ' + parts.join(', ') : 'No scored days yet';
  }
  function barChart(dates, values, label){
    var W = 320, H = 160, top = 18, bot = 38, bw = Math.min(44, (W - 20) / Math.max(dates.length, 1) - 12);
    var nums = values.filter(function(v){ return typeof v === 'number'; });
    var lo = Math.min(0, Math.min.apply(null, nums.concat([0]))), hi = Math.max(0, Math.max.apply(null, nums.concat([0])));
    if (hi - lo < 100){ var padv = (100 - (hi - lo)) / 2; hi += padv; lo -= padv; }   // keep small days small
    function y(v){ return top + (hi - v) * (H - top - bot) / (hi - lo); }
    var root = svg('svg', { 'class': 'fl-bars', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label });
    root.appendChild(svg('line', { 'class': 'fl-bars__zero', x1: 0, x2: W, y1: y(0), y2: y(0) }));
    var step = (W - 20) / Math.max(dates.length, 1);
    dates.forEach(function(d, i){
      var v = values[i], cx = 10 + step * i + step / 2;
      var t = svg('text', { x: cx, y: H - 6, 'text-anchor': 'middle', 'class': 'fl-bars__lab' }); t.textContent = DAYN[C.weekday(d)] + ' ' + (+d.slice(8, 10)); root.appendChild(t);
      if (typeof v !== 'number') return;
      var y0 = y(0), y1 = y(v), hgt = Math.max(1.5, Math.abs(y1 - y0));
      root.appendChild(svg('rect', { x: cx - bw / 2, y: v >= 0 ? y0 - hgt : y0, width: bw, height: hgt, rx: 1.5, 'class': v > 0 ? 'up' : (v < 0 ? 'down' : 'flat') }));
      var vt = svg('text', { x: cx, y: v >= 0 ? y0 - hgt - 5 : y0 + hgt + 12, 'text-anchor': 'middle', 'class': 'fl-bars__val' }); vt.textContent = signed(v); root.appendChild(vt);
    });
    return root;
  }

  // ---- modal stack (drawer + phone lineup sheet): focus trap, Esc, return focus ----
  var modals = [];
  function focusables(root){
    return Array.prototype.filter.call(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,summary,[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0 || n === document.activeElement; });
  }
  function openModal(m){
    modals.push(m);
    document.documentElement.classList.add('g-lock');
    var f = focusables(m.panel);
    (m.initial || f[0] || m.panel).focus();
  }
  function closeModal(m, noFocus){
    var i = modals.indexOf(m);
    if (i < 0) return;
    modals.splice(i, 1);
    if (!modals.length) document.documentElement.classList.remove('g-lock');
    m.onClose();
    if (!noFocus && m.opener && document.contains(m.opener) && m.opener.getClientRects().length) m.opener.focus();
  }
  document.addEventListener('keydown', function(e){
    var m = modals[modals.length - 1];
    if (!m) return;
    if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); closeModal(m); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(m.panel);
    if (!f.length){ e.preventDefault(); m.panel.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!m.panel.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === m.panel)){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  // ---- tablists: roving tabindex + arrow keys ----
  function wireTablist(list, pick){
    list.addEventListener('keydown', function(e){
      var tabs = Array.prototype.filter.call(list.querySelectorAll('[role="tab"]'), function(t){ return !t.disabled; });
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j == null) return;
      e.preventDefault();
      pick(tabs[j], true);
    });
  }
  function selectTab(list, tab){
    Array.prototype.forEach.call(list.querySelectorAll('[role="tab"]'), function(t){
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
  }

  // ---- main tabs + URL hash ----
  var TABS = ['lineup', 'matchup', 'season', 'how'];
  var LEGACY = { draft: 'lineup', team: 'lineup', scoreboard: 'matchup', rules: 'how', undraftable: 'how' };
  function tabFromHash(){
    var h = String(location.hash || '').replace(/^#/, '');
    if (TABS.indexOf(h) >= 0) return h;
    return LEGACY[h] || null;
  }
  function setTab(name, focusTab, fromHash){
    if (TABS.indexOf(name) < 0) name = 'lineup';
    UI.tab = name;
    var list = $('maintabs');
    selectTab(list, $('tab-' + name));
    TABS.forEach(function(t){ $('panel-' + t).hidden = t !== name; });
    if (focusTab) $('tab-' + name).focus();
    if (!fromHash){
      try { history.replaceState(null, '', location.pathname + location.search + '#' + name); } catch (e) { location.hash = name; }
    }
    if (name !== 'lineup') closeSheet(true);
    renderBar();
  }
  wireTablist($('maintabs'), function(t, focus){ setTab(t.getAttribute('data-tab'), focus); });
  window.addEventListener('hashchange', function(){ var t = tabFromHash(); if (t && t !== UI.tab) setTab(t, false, true); });

  // ---- roster editing ----
  function saveDraft(){ store.draft = { picks: S.picks.slice(), captain: S.captain, week: S.draftWeek }; persist(); }
  function savedTeam(){ return store.teams[S.draftWeek] || null; }
  function dirty(){
    var t = savedTeam();
    if (!t) return S.picks.length > 0;
    return t.captain !== S.captain || t.picks.slice().sort().join() !== S.picks.slice().sort().join();
  }
  function capLine(){ var u = capUsed(); return 'Budget used ' + u + ' of ' + C.CAP + ', ' + (C.CAP - u) + ' left.'; }
  function blockReason(slug){
    if (S.picks.indexOf(slug) >= 0) return '';
    if (S.picks.length >= C.PICKS) return 'Lineup full';
    var over = capUsed() + (salaries()[slug] || 0) - C.CAP;
    return over > 0 ? 'Over by ' + over : '';
  }
  function afterChange(){ saveDraft(); renderLineup(); renderPool(); renderMatch(); refreshDrawer(); }
  function addPick(slug){
    if (blockReason(slug) || S.picks.indexOf(slug) >= 0) return false;
    S.picks.push(slug);
    if (!S.captain) S.captain = slug;
    afterChange();
    say('Added ' + person(slug).name + '. ' + capLine() + (S.captain === slug ? ' Captain.' : ''));
    return true;
  }
  function removePick(slug){
    var i = S.picks.indexOf(slug);
    if (i < 0) return;
    S.picks.splice(i, 1);
    if (S.captain === slug) S.captain = S.picks[0] || null;
    afterChange();
    say('Removed ' + person(slug).name + '. ' + capLine() + (S.captain ? ' Captain: ' + person(S.captain).name + '.' : ''));
  }
  function setCaptain(slug){
    if (S.picks.indexOf(slug) < 0) return;
    S.captain = slug;
    saveDraft(); renderLineup(); renderMatch(); refreshDrawer();
    say(person(slug).name + ' is captain and scores 1.5 times.');
  }

  // ---- header strip ----
  function marketState(t){
    var d = C.nyDate(t), p = C.nyParts(t), mins = p.h * 60 + p.mi;
    if (!C.isWeekday(d)) return 'final';
    if (mins < 570) return 'upcoming';
    if (mins < 960) return 'live';
    return 'final';
  }
  function renderHead(){
    var t = now(), dw = C.draftWeek(t), info = C.weekInfo(dw);
    var wl = S.sbWk ? weekTitle(S.sbWk.week) : weekTitle(dw);
    $('weeklabel').textContent = wl + (S.sbWk && S.sbWk.final ? ' · final' : '');
    var st = marketState(t);
    var pill = $('livepill'); pill.innerHTML = '';
    var pe = el('span', 'g-pill g-pill--' + st);
    pe.appendChild(el('span', 'g-pill__dot'));
    pe.appendChild(document.createTextNode(st === 'live' ? 'Live' : (st === 'upcoming' ? 'Upcoming' : 'Final')));
    pe.title = st === 'live' ? 'US market is open (9:30 AM–4 PM ET). Points update after the close.' : (st === 'upcoming' ? 'US market opens 9:30 AM ET today' : 'US market is closed');
    pill.appendChild(pe);
    var cd = $('countdown'), p = spanParts(info.locksAt - t);
    cd.innerHTML = '';
    cd.appendChild(el('span', 'g-countdown__label', 'Lineup locks in'));
    var tm = el('span', 'g-countdown__time');
    [[p.d, 'd'], [p.h, 'h'], [p.m, 'm']].forEach(function(x, i){ if (i === 0 && !x[0]) return; tm.appendChild(el('b', null, String(x[0]))); tm.appendChild(el('small', null, x[1])); });
    cd.appendChild(tm);
    cd.setAttribute('aria-label', 'Lineup for ' + weekName(dw) + ' locks in ' + span(info.locksAt - t));
    $('lockat').textContent = weekTitle(dw) + ' · locks ' + lockText(info.locksAt);
    if (S.draftWeek && dw !== S.draftWeek) init();
  }
  function renderChips(){
    var box = $('recordchips'); box.innerHTML = '';
    var r = store.record;
    function chip(label, val, win){ var c = el('span', 'g-chip' + (win ? ' g-chip--win' : '')); c.appendChild(document.createTextNode(label)); c.appendChild(el('b', 'g-num', val)); box.appendChild(c); }
    if (r && r.played){
      chip('vs S&P 500', r.winsSpy + '–' + (r.played - r.winsSpy), r.winsSpy * 2 > r.played);
      chip('vs Top 5', r.winsTop5 + '–' + (r.played - r.winsTop5), r.winsTop5 * 2 > r.played);
      chip('Streak', r.streak ? 'W' + r.streak : '—', r.streak > 0);
      if (r.best) chip('Best week', signed(r.best.points), false);
    } else {
      var first = S.index && S.index.firstRealWeek;
      chip('Season record', '0–0', false);
      if (first && C.weekMonday(first) > C.nyDate(now())) chip('Season opens', dayLabel(C.weekMonday(first)), false);
    }
  }

  // ---- lineup card ----
  function orderedPicks(){
    var p = S.picks.slice();
    if (S.captain && p.indexOf(S.captain) > 0){ p.splice(p.indexOf(S.captain), 1); p.unshift(S.captain); }
    return p;
  }
  function renderLineup(){
    var sal = salaries(), t = now();
    var info = C.weekInfo(S.draftWeek);
    $('lineupweek').textContent = weekTitle(S.draftWeek) + ' (' + shortDate(info.start) + '–' + shortDate(info.end) + '). Locks ' + lockText(info.locksAt) + '.' +
      (S.salaryFallback ? ' Salaries for that week are not out yet, so these are this week\'s; they may change when the week opens.' : '');
    var saved = savedTeam(), isDirty = dirty();
    var stEl = $('lineupstatus');
    stEl.textContent = saved ? (isDirty ? 'Unsaved changes' : 'Saved') : (S.picks.length ? 'Not saved' : '');
    stEl.className = 'g-card__kicker' + (saved && !isDirty ? ' g-gold' : '');

    // lock / late-entry banner
    var lb = $('lockbanner'); lb.innerHTML = '';
    var lw = C.lockedWeek(t), li = C.weekInfo(lw);
    if (t >= li.locksAt && C.nyDate(t) <= li.end && !C.isPractice(lw)){
      var ban = el('div', 'fl-banner');
      ban.appendChild(el('strong', null, weekTitle(lw) + ' is locked and live.'));
      var mine = store.teams[lw];
      var from = C.lateFrom(t);
      ban.appendChild(document.createTextNode(' You are building for ' + weekName(S.draftWeek) + '. ' +
        (mine ? 'Your lineup for ' + weekName(lw) + ' is in: follow it in Matchup.' :
          (from ? 'Late entry: your first save also enters this week, scoring from ' + dayLabel(from) + '.' : 'No trading days are left this week for a late entry.'))));
      lb.appendChild(ban);
    } else if (S.sbWk && S.sbWk.practice){
      lb.appendChild(el('p', 'fl-banner fl-banner--soft', 'Practice: see how your picks would have scored on the sample days in Matchup. Practice does not count in your season.'));
    }

    // budget
    var used = capUsed(), left = C.CAP - used, open = C.PICKS - S.picks.length, over = used > C.CAP;
    var bb = $('budget'); bb.innerHTML = ''; bb.className = 'g-budget-bar' + (over ? ' g-budget-bar--over' : '');
    var row = el('div', 'g-budget-bar__row');
    var big = el('span', 'g-budget-bar__left g-num', over ? String(used - C.CAP) : String(left));
    big.appendChild(el('small', null, over ? 'over budget' : 'left'));
    row.appendChild(big);
    row.appendChild(el('span', 'g-budget-bar__meta', used + ' of ' + C.CAP + ' used'));
    bb.appendChild(row);
    var track = el('div', 'g-budget-bar__track');
    track.setAttribute('role', 'meter'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(C.CAP));
    track.setAttribute('aria-valuenow', String(used)); track.setAttribute('aria-label', 'Budget used');
    track.setAttribute('aria-valuetext', used + ' of ' + C.CAP + ' used, ' + (over ? (used - C.CAP) + ' over' : left + ' left'));
    var fill = el('span', 'g-budget-bar__fill'); fill.style.width = Math.min(100, used / C.CAP * 100) + '%';
    track.appendChild(fill); bb.appendChild(track);
    bb.appendChild(el('span', 'g-budget-bar__meta', open > 0 ? 'Avg left per open slot: ' + (over ? 0 : Math.floor(left / open)) + ' (' + open + ' open)' : 'All five slots filled'));

    // cap warning when the remaining picks can no longer fit
    var cw = $('capwarn'); cw.innerHTML = '';
    if (open > 0 && S.picks.length){
      var rest = [];
      for (var k in sal) if (S.picks.indexOf(k) < 0) rest.push(sal[k]);
      rest.sort(function(a, b){ return a - b; });
      var min = 0; for (var j = 0; j < open && j < rest.length; j++) min += rest[j];
      if (min > left) cw.appendChild(el('p', 'fl-msg bad', 'The cheapest ' + open + ' left cost ' + min + ', more than your ' + left + ' left. Swap someone out to finish your lineup.'));
    }

    // slots
    var ol = $('slots'); ol.innerHTML = '';
    var order = orderedPicks();
    for (var i = 0; i < C.PICKS; i++){
      var slug = order[i];
      var li2 = el('li', 'fl-slot' + (slug ? (slug === S.captain ? ' is-captain' : '') : ' is-empty'));
      if (!slug){
        li2.appendChild(el('span', 'fl-slot__plus', '+'));
        var eb = btn('g-link fl-slot__add', 'Add a billionaire', { 'data-fill': '1' });
        li2.appendChild(eb);
        li2.appendChild(el('span', 'fl-slot__hint', i === 0 && !S.picks.length ? 'Captain slot · 1.5×' : ''));
        ol.appendChild(li2);
        continue;
      }
      var p = person(slug), isCap = slug === S.captain;
      li2.appendChild(avatar(slug, 36));
      var main = el('div', 'fl-slot__main');
      main.appendChild(nameBtn(slug));
      main.appendChild(el('span', 'g-rp__sub', 'Salary ' + (sal[slug] != null ? sal[slug] : '—') + ' · Avg ' + avgTxt(slug) + (isCap ? ' · Captain 1.5×' : '')));
      li2.appendChild(main);
      var cb = btn('fl-cbtn' + (isCap ? ' is-on' : ''), 'C', {
        'data-captain': slug, 'aria-pressed': isCap ? 'true' : 'false',
        'aria-label': isCap ? p.name + ' is captain (1.5×)' : 'Make ' + p.name + ' captain'
      });
      cb.title = isCap ? 'Captain: scores 1.5×' : 'Make captain (1.5×)';
      li2.appendChild(cb);
      li2.appendChild(btn('g-btn g-btn--icon g-btn--remove', '–', { 'data-remove': slug, 'aria-label': 'Remove ' + p.name }));
      ol.appendChild(li2);
    }

    // projection
    var pr = $('proj'); pr.innerHTML = '';
    var pv = projection(S.picks, S.captain);
    var sg = el('div', 'g-stat g-stat--sm' + (pv != null && pv > 0 ? ' g-stat--gold' : ''));
    sg.appendChild(el('span', 'g-stat__label', 'Projected points'));
    sg.appendChild(el('span', 'g-stat__num', pv == null ? '—' : signed(pv)));
    sg.appendChild(el('span', 'g-stat__sub', 'Projection = recent average per pick, captain 1.5×. An estimate, not a forecast.'));
    pr.appendChild(sg);

    // buttons
    var v = C.validateTeam(S.picks, S.captain, sal);
    var sb = $('savebtn');
    sb.disabled = !v.ok || !isDirty;
    sb.textContent = saveLabel(v, saved, isDirty);
    $('clearbtn').disabled = !S.picks.length;
    renderBar();
    renderSync();
  }
  function saveLabel(v, saved, isDirty){
    if (saved && !isDirty) return 'Saved';
    if (S.picks.length < C.PICKS) return 'Pick ' + (C.PICKS - S.picks.length) + ' more';
    if (v.used > C.CAP) return 'Over budget by ' + (v.used - C.CAP);
    return 'Save lineup';
  }

  function saveTeam(){
    var v = C.validateTeam(S.picks, S.captain, salaries());
    if (!v.ok){ msg('teammsg', v.errors.join('. ') + '.', true); toast(v.errors.join('. ') + '.', true); return; }
    var t = now();
    var team = { picks: S.picks.slice(), captain: S.captain, savedAt: new Date(t).toISOString() };
    store.teams[S.draftWeek] = team;
    var text = 'Lineup saved for ' + weekName(S.draftWeek) + '.';
    // late entry into the running week
    var lw = C.lockedWeek(t), from = C.lateFrom(t);
    if (!C.isPractice(lw) && !store.teams[lw] && from && S.sbWk && S.sbWk.week === lw && S.picks.every(function(s){ return S.sbWk.salaries[s] != null; })){
      store.teams[lw] = { picks: S.picks.slice(), captain: S.captain, savedAt: team.savedAt, lateFrom: from };
      text += ' You are also in this week as a late entry, scoring from ' + dayLabel(from) + '.';
    }
    var ok = persist();
    if (!ok) text += ' Your browser is not keeping site data, so this team will be gone when you close the page. Copy your team code to keep it.';
    msg('teammsg', text, !ok);
    toast(text, !ok);
    renderLineup(); renderMatch(); renderSeason();
    // online copy (never blocks or undoes the local save)
    if (onlinePlaying()) syncTeam(S.draftWeek, team);
  }

  // ---- phone bottom bar + lineup sheet ----
  var sheet = null;
  function renderBar(){
    var bar = $('bottombar');
    var show = UI.tab === 'lineup' && mqSheet.matches && !!S.draftWk;
    bar.hidden = !show;
    document.body.classList.toggle('has-bottombar', show);
    if (!show) return;
    var used = capUsed(), pv = projection(S.picks, S.captain);
    $('barmain').textContent = S.picks.length + '/' + C.PICKS + ' picked · ' + (used > C.CAP ? (used - C.CAP) + ' over' : (C.CAP - used) + ' left');
    $('barsub').textContent = (pv == null ? 'No projection yet' : 'Projected ' + signed(pv)) + ' · Tap to view lineup';
    var v = C.validateTeam(S.picks, S.captain, salaries()), saved = savedTeam(), isDirty = dirty();
    var b = $('barsave');
    b.disabled = !v.ok || !isDirty;
    b.textContent = saved && !isDirty ? 'Saved' : 'Save';
    b.setAttribute('aria-label', saved && !isDirty ? 'Lineup saved' : (v.ok ? 'Save lineup' : saveLabel(v, saved, isDirty)));
  }
  function openSheet(opener){
    if (sheet || !mqSheet.matches) return;
    var card = $('lineupcard');
    card.classList.add('is-open');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    $('sheetscrim').hidden = false;
    $('barsum').setAttribute('aria-expanded', 'true');
    sheet = { panel: card, opener: opener || $('barsum'), initial: $('sheetclose'), onClose: function(){
      card.classList.remove('is-open'); card.removeAttribute('role'); card.removeAttribute('aria-modal');
      $('sheetscrim').hidden = true; $('barsum').setAttribute('aria-expanded', 'false'); sheet = null;
    } };
    openModal(sheet);
  }
  function closeSheet(noFocus){ if (sheet) closeModal(sheet, noFocus); }
  function onMq(){ if (!mqSheet.matches) closeSheet(true); renderBar(); }
  if (mqSheet.addEventListener) mqSheet.addEventListener('change', onMq); else if (mqSheet.addListener) mqSheet.addListener(onMq);

  // ---- player pool ----
  var SORTS = {
    rank:   { label: 'Rank',     def: 'asc',  key: function(p){ return p.rank; } },
    salary: { label: 'Salary',   def: 'desc', key: function(p){ return salaries()[p.slug]; } },
    avg:    { label: 'Avg pts',  def: 'desc', key: function(p){ var a = stat(p.slug).avg; return a == null ? -1e9 : a; } },
    last:   { label: 'Last day', def: 'desc', key: function(p){ var a = stat(p.slug).last; return a == null ? -1e9 : a; } },
    hot:    { label: 'Hot',      def: 'desc', key: function(p){ var s = stat(p.slug); return (s.hot ? 1e6 : 0) + (s.buy ? 1e5 : 0) + (s.last == null ? -1e5 : s.last); } },
    news:   { label: 'News',     def: 'desc', key: function(p){ return stat(p.slug).news; } }
  };
  var COLS = [
    { id: 'who', label: 'Player', sort: 'rank' },
    { id: 'sal', label: 'Salary', sort: 'salary' },
    { id: 'avg', label: 'Avg', sort: 'avg' },
    { id: 'spark', label: 'Last 5' },
    { id: 'last', label: 'Last day', sort: 'last' },
    { id: 'news', label: 'News', sort: 'news' },
    { id: 'act', label: 'Add' }
  ];
  function setSort(key, toggle){
    if (!SORTS[key]) return;
    if (toggle && UI.sort === key) UI.dir = UI.dir === 'asc' ? 'desc' : 'asc';
    else { UI.sort = key; UI.dir = SORTS[key].def; }
    var sel = $('sortsel'); if (sel) sel.value = UI.sort;
    renderPoolHead(); renderPool();
  }
  function renderPoolHead(){
    var tr = $('poolhead'); tr.innerHTML = '';
    COLS.forEach(function(c){
      var th = el('th', 'fl-c-' + c.id); th.scope = 'col';
      if (c.sort){
        var active = UI.sort === c.sort;
        th.setAttribute('aria-sort', active ? (UI.dir === 'asc' ? 'ascending' : 'descending') : 'none');
        th.appendChild(btn('g-sort', c.label, { 'data-sort': c.sort }));
      } else if (c.id === 'act') th.appendChild(el('span', 'g-sr', c.label));
      else th.appendChild(document.createTextNode(c.label));
      tr.appendChild(th);
    });
  }
  function renderSectors(){
    var box = $('sectortabs'); box.innerHTML = '';
    var counts = {}, total = 0;
    arr(S.draftWk && S.draftWk.draftable).forEach(function(p){ counts[p.sector] = (counts[p.sector] || 0) + 1; total++; });
    if (UI.sector && !counts[UI.sector]) UI.sector = '';
    var list = [''].concat(Object.keys(counts).sort());
    list.forEach(function(s, i){
      var on = UI.sector === s;
      var t = btn('g-tab', s || 'All', { role: 'tab', 'aria-selected': on ? 'true' : 'false', 'aria-controls': 'poolpanel', 'data-sector': s, id: 'sec-' + i });
      t.tabIndex = on ? 0 : -1;
      t.appendChild(el('span', 'g-tab__n', String(s ? counts[s] : total)));
      box.appendChild(t);
    });
    var wrap = document.querySelector('.fl-poolwrap');
    wrap.id = 'poolpanel'; wrap.setAttribute('role', 'tabpanel');
    var cur = box.querySelector('[aria-selected="true"]'); if (cur) wrap.setAttribute('aria-labelledby', cur.id);
  }
  function setSector(s, focus){
    UI.sector = s;
    renderSectors(); renderPool();
    if (focus){ var t = $('sectortabs').querySelector('[aria-selected="true"]'); if (t) t.focus(); }
  }
  wireTablist($('sectortabs'), function(t, focus){ setSector(t.getAttribute('data-sector') || '', focus); });

  function renderPool(){
    var body = $('pool');
    var wk = S.draftWk;
    body.innerHTML = '';
    if (!wk){ var r0 = el('tr'), c0 = el('td', 'tempty', 'The player pool is not available right now.'); c0.colSpan = 7; r0.appendChild(c0); body.appendChild(r0); return; }
    var sal = wk.salaries;
    var q = BD.norm(UI.q);
    var rows = arr(wk.draftable).filter(function(p){
      if (UI.sector && p.sector !== UI.sector) return false;
      if (q){
        var hay = BD.norm(p.name + ' ' + arr(p.holdings).map(function(h){ return h.ticker + ' ' + h.name; }).join(' '));
        if (hay.indexOf(q) < 0) return false;
      }
      if (UI.afford && S.picks.indexOf(p.slug) < 0 && blockReason(p.slug)) return false;
      return true;
    });
    var so = SORTS[UI.sort] || SORTS.rank, sign = UI.dir === 'asc' ? 1 : -1;
    rows.sort(function(a, b){ return sign * (so.key(a) - so.key(b)) || a.rank - b.rank; });
    var lastDate = S.sparkDates[S.sparkDates.length - 1];
    $('draftcount').textContent = rows.length + ' of ' + arr(wk.draftable).length + ' players · sorted by ' + so.label.toLowerCase() +
      (lastDate ? ' · last scored ' + dayLabel(lastDate) + (C.isPractice(C.isoWeek(lastDate)) ? ' (practice)' : '') : '');
    if (!rows.length){ var r1 = el('tr'), c1 = el('td', 'tempty', 'Nobody matches these filters.'); c1.colSpan = 7; r1.appendChild(c1); body.appendChild(r1); return; }
    var frag = document.createDocumentFragment();
    rows.forEach(function(p){
      var picked = S.picks.indexOf(p.slug) >= 0, s = stat(p.slug);
      var tr = el('tr', 'g-row-player' + (picked ? ' is-picked' : '') + (S.captain === p.slug ? ' is-captain' : ''));
      // who
      var tdw = el('td', 'fl-c-who');
      var who = el('div', 'g-rp__who');
      who.appendChild(avatar(p.slug, 40));
      var tx = el('div', 'g-rp__text');
      var nb = nameBtn(p.slug);
      tx.appendChild(nb);
      var top2 = arr(p.holdings).slice(0, 2).map(function(h){ var pct = h.weight * 100; return h.ticker + ' ' + (pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)) + '%'; });
      tx.appendChild(el('span', 'g-rp__sub', '#' + p.rank + ' · ' + p.sector + (top2.length ? ' · ' + top2.join(', ') : '') + (arr(p.holdings).length > 2 ? ' +' + (p.holdings.length - 2) : '')));
      var bd = badges(p.slug, false); if (bd) tx.appendChild(bd);
      who.appendChild(tx);
      if (S.captain === p.slug) who.appendChild(el('span', 'g-badge g-badge--captain', 'C')).setAttribute('title', 'Your captain');
      tdw.appendChild(who); tr.appendChild(tdw);
      // numbers
      function num(id, label, text, c){ var td = el('td', 'fl-c-' + id); td.setAttribute('data-label', label); td.appendChild(el('span', c || null, text)); tr.appendChild(td); return td; }
      num('sal', 'Salary', String(sal[p.slug]), 'g-rp__sal g-num');
      num('avg', 'Avg', avgTxt(p.slug), 'g-rp__pts g-num ' + cls(s.avg == null ? null : Math.round(s.avg)));
      var tds = el('td', 'fl-c-spark'); tds.setAttribute('data-label', 'Last 5');
      tds.appendChild(spark(s.series)); tds.appendChild(el('span', 'g-sr', sparkText(p.slug))); tr.appendChild(tds);
      num('last', 'Last day', signed(s.last), 'g-num ' + cls(s.last));
      num('news', 'News', s.news ? String(s.news) : '0', 'g-num' + (s.news ? '' : ' g-flat'));
      // action
      var tda = el('td', 'fl-c-act'), act = el('div', 'g-rp__act');
      var reason = blockReason(p.slug);
      var b = btn('g-btn g-btn--icon ' + (picked ? 'g-btn--remove' : 'g-btn--add'), picked ? '–' : '+', {
        'aria-label': (picked ? 'Remove ' : 'Add ') + p.name + ', salary ' + sal[p.slug]
      });
      b.setAttribute(picked ? 'data-remove' : 'data-add', p.slug);
      act.appendChild(b);
      if (reason){
        b.disabled = true;
        var rid = 'why-' + p.slug;
        b.setAttribute('aria-describedby', rid);
        var w = el('span', 'g-rp__why', reason); w.id = rid; act.appendChild(w);
      }
      tda.appendChild(act); tr.appendChild(tda);
      frag.appendChild(tr);
    });
    body.appendChild(frag);
  }

  // ---- player drawer ----
  var drawer = null;
  function openPlayer(slug, opener){
    if (drawer){ drawer.slug = slug; refreshDrawer(); return; }
    var root = $('drawer');
    root.hidden = false;
    drawer = { slug: slug, panel: $('drawerpanel'), opener: opener, onClose: function(){ root.hidden = true; drawer = null; } };
    renderDrawer();
    drawer.initial = root.querySelector('.g-drawer__close');
    openModal(drawer);
  }
  function refreshDrawer(){
    if (!drawer) return;
    var had = document.activeElement && drawer.panel.contains(document.activeElement) ? document.activeElement.getAttribute('data-dact') : null;
    renderDrawer();
    if (had){ var n = drawer.panel.querySelector('[data-dact="' + had + '"]'); if (n && !n.disabled) n.focus(); else drawer.panel.querySelector('.g-drawer__close').focus(); }
  }
  function renderDrawer(){
    var slug = drawer.slug, p = person(slug), s = stat(slug), sal = salaries()[slug];
    var head = $('drawerhead'), body = $('drawerbody'), foot = $('drawerfoot');
    head.innerHTML = ''; body.innerHTML = ''; foot.innerHTML = '';
    head.appendChild(avatar(slug, 64));
    var ht = el('div', 'fl-dhead');
    ht.appendChild(el('div', 'g-card__kicker', (p.rank ? '#' + p.rank + ' richest · ' : '') + (p.sector || 'Other')));
    var h = el('h2', 'g-drawer__title', p.name); h.id = 'drawertitle'; ht.appendChild(h);
    var worth = S.worth[slug];
    ht.appendChild(el('div', 'fl-dhead__sub', (worth ? 'Net worth ' + worth + ' · ' : '') + 'Salary ' + (sal != null ? sal : '—') + (S.captain === slug ? ' · Your captain' : (S.picks.indexOf(slug) >= 0 ? ' · In your lineup' : ''))));
    head.appendChild(ht);
    head.appendChild(btn('g-btn g-btn--icon g-drawer__close', '×', { 'data-close': '1', 'aria-label': 'Close player card' }));

    // stats
    var g = el('div', 'g-stats fl-dstats');
    [['Salary', sal != null ? String(sal) : '—', ''], ['Avg pts', avgTxt(slug), cls(s.avg == null ? null : Math.round(s.avg))], ['Last day', signed(s.last), cls(s.last)], ['News', String(s.news), '']].forEach(function(x){
      var d = el('div', 'g-stat g-stat--sm'); d.appendChild(el('span', 'g-stat__label', x[0])); d.appendChild(el('span', 'g-stat__num ' + x[2], x[1])); g.appendChild(d);
    });
    body.appendChild(g);
    var bd = badges(slug); if (bd){ bd.className += ' fl-dbadges'; body.appendChild(bd); }

    // daily points chart
    var sec = el('section', 'fl-dsec');
    sec.appendChild(el('h3', 'fl-dsec__h', 'Daily points'));
    var dates = S.sbWk && arr(S.sbWk.days).length ? C.weekDays(S.sbWk.week) : S.sparkDates;
    if (dates.length){
      var vals = dates.map(function(d){ return ptsOn(d, slug); });
      sec.appendChild(barChart(dates, vals, 'Daily points for ' + p.name + ': ' + dates.map(function(d, i){ return dayLabel(d) + ' ' + signed(vals[i]); }).join(', ')));
      var det = el('details', 'tdetails fl-dtable');
      det.appendChild(el('summary', null, 'Show as a table'));
      var t = el('table', 'g-table'), tb = el('tbody');
      var hr = el('tr'); ['Day', 'Points'].forEach(function(x){ var th = el('th', null, x); th.scope = 'col'; hr.appendChild(th); });
      var th0 = el('thead'); th0.appendChild(hr); t.appendChild(th0);
      dates.forEach(function(d, i){ var tr = el('tr'), th = el('th', null, dayLabel(d)); th.scope = 'row'; tr.appendChild(th); tr.appendChild(el('td', cls(vals[i]), signed(vals[i]))); tb.appendChild(tr); });
      t.appendChild(tb); det.appendChild(t); sec.appendChild(det);
    } else sec.appendChild(el('p', 'tnote', 'No scored days yet.'));
    // last day breakdown
    var ld = S.lastDay && S.lastDay.people && S.lastDay.people[slug];
    if (ld){
      var bits = ['Price ' + signed(ld.pricePoints) + ' (' + (ld.returnPct > 0 ? '+' : '') + (Math.round(ld.returnPct * 100) / 100) + '%)'];
      if (ld.bonuses && ld.bonuses.insiderBuy) bits.push('insider buy +' + ld.bonuses.insiderBuy);
      if (ld.bonuses && ld.bonuses.stories) bits.push('news +' + ld.bonuses.stories);
      sec.appendChild(el('p', 'fl-dnote', dayLabel(S.lastDay.date) + ': ' + bits.join(' · ') + ' = ' + signed(ld.points) + ' points.'));
    }
    body.appendChild(sec);

    // holdings
    var hs = el('section', 'fl-dsec');
    hs.appendChild(el('h3', 'fl-dsec__h', 'Portfolio' + (p.method ? ' · ' + p.method : '')));
    var chg = {};
    if (ld) arr(ld.holdings).forEach(function(x){ chg[x.ticker] = x.changePct; });
    var ul = el('ul', 'fl-holdlist');
    arr(p.holdings).forEach(function(x){
      var li = el('li');
      var top = el('div', 'fl-holdlist__top');
      top.appendChild(el('strong', 'g-num', x.ticker));
      top.appendChild(el('span', 'fl-holdlist__name', x.name + (x.adr ? ' (US ADR line)' : '')));
      var c = chg[x.ticker];
      top.appendChild(el('span', 'g-num fl-holdlist__chg ' + cls(typeof c === 'number' ? (c > 0 ? 1 : (c < 0 ? -1 : 0)) : null), typeof c === 'number' ? (c > 0 ? '+' : '') + c.toFixed(2) + '%' : '—'));
      li.appendChild(top);
      var pct = x.weight * 100;
      var meta = el('div', 'fl-holdlist__meta');
      var bar = el('span', 'fl-holdlist__bar'); var bf = el('span'); bf.style.width = Math.max(1, Math.min(100, pct)) + '%'; bar.appendChild(bf); meta.appendChild(bar);
      meta.appendChild(el('span', 'g-num', (pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)) + '%'));
      meta.appendChild(el('span', 'fl-tier' + (x.tier === 'stakes' ? ' is-stake' : ''), x.tier === 'controls' ? 'Controls' : (x.tier === 'stakes' ? 'Stake' : (x.tier || ''))));
      li.appendChild(meta);
      ul.appendChild(li);
    });
    hs.appendChild(ul);
    hs.appendChild(el('p', 'tnote', ld ? 'Change is for ' + dayLabel(S.lastDay.date) + ', the last scored day.' : 'No daily change saved yet.'));
    body.appendChild(hs);

    // news
    var ns = el('section', 'fl-dsec');
    ns.appendChild(el('h3', 'fl-dsec__h', 'News'));
    ns.appendChild(el('p', 'fl-dnote', s.news ? s.news + (s.news === 1 ? ' story' : ' stories') + ' in recent editions of the Digest (+10 points each on the day).' : 'No stories in recent editions.'));
    var a = el('a', 'g-btn', 'Profile and stories'); a.href = 'people/' + encodeURIComponent(slug) + '/'; ns.appendChild(a);
    body.appendChild(ns);

    // actions
    var picked = S.picks.indexOf(slug) >= 0, reason = blockReason(slug);
    if (!sal && !picked){ foot.appendChild(el('p', 'tnote', 'Not draftable this week.')); return; }
    var ab = btn('g-btn ' + (picked ? '' : 'g-btn--primary'), picked ? 'Remove from lineup' : (reason ? reason : 'Add to lineup'), { 'data-dact': 'toggle' });
    ab.setAttribute(picked ? 'data-remove' : 'data-add', slug);
    if (reason) ab.disabled = true;
    foot.appendChild(ab);
    var isCap = S.captain === slug;
    var cb = btn('g-btn' + (isCap ? ' g-btn--primary' : ''), isCap ? 'Captain · 1.5×' : 'Make captain', { 'data-dact': 'captain', 'aria-pressed': isCap ? 'true' : 'false' });
    if (picked) cb.setAttribute('data-captain', slug);
    else if (!reason) cb.setAttribute('data-addcap', slug);
    else cb.disabled = true;
    foot.appendChild(cb);
  }

  // ---- matchup ----
  function dayPeople(wk, d){ var o = {}, m = (wk.daily && wk.daily[d]) || {}; for (var k in m) o[k] = { points: m[k] }; return { people: o }; }
  function teamWeek(wk, team){
    var byDay = {}, total = 0, bySlug = {}, perDay = {};
    team.picks.forEach(function(s){ bySlug[s] = 0; });
    arr(wk.days).forEach(function(d){
      if (team.lateFrom && d < team.lateFrom){ byDay[d] = null; perDay[d] = null; return; }
      var r = C.teamDay(team.picks, team.captain, dayPeople(wk, d));
      byDay[d] = r.total; total += r.total; perDay[d] = r.bySlug;
      for (var s in r.bySlug) bySlug[s] += r.bySlug[s];
    });
    return { byDay: byDay, total: total, bySlug: bySlug, perDay: perDay };
  }
  function matchTeam(wk){
    if (!wk) return null;
    if (wk.practice) return S.picks.length === C.PICKS && S.captain ? { picks: S.picks.slice(), captain: S.captain } : null;
    return store.teams[wk.week] || null;
  }
  function weekOver(wk){ return !!wk.final || C.nyDate(now()) > wk.end; }
  function emptyState(title, text, cta){
    var e = el('div', 'g-empty');
    e.appendChild(el('h2', 'g-empty__title', title));
    e.appendChild(el('p', null, text));
    if (cta) e.appendChild(btn('g-btn g-btn--primary', cta, { 'data-goto': 'lineup' }));
    return e;
  }
  function renderMatch(){
    var box = $('matchbox'); box.innerHTML = '';
    var wk = S.sbWk;
    if (!wk){ box.appendChild(emptyState('No scores yet', 'The first scores arrive after the first trading day of the week.', 'Build your lineup')); return; }
    var team = matchTeam(wk);
    var head = el('div', 'fl-mhead');
    var hh = el('h2', 'serif fl-h2', weekTitle(wk.week)); head.appendChild(hh);
    head.appendChild(el('p', 'fl-mhead__sub', shortDate(wk.start) + '–' + shortDate(wk.end) + (weekOver(wk) ? ' · final' : '') + (wk.practice ? ' · practice, not counted in your season' : '')));
    box.appendChild(head);
    if (!team){
      if (wk.practice) box.appendChild(emptyState('Pick five to see your matchup', 'Choose five billionaires and a captain on the Lineup tab. Your practice lineup is scored on the sample days so you can see how the head-to-head works.', 'Build your lineup'));
      else box.appendChild(emptyState('You are not in this week', 'Save a lineup and it counts from next week' + (C.lateFrom(now()) ? ', or right away as a late entry from the next trading day.' : '.'), 'Build your lineup'));
      return;
    }
    var bm = wk.benchmarks || {};
    var over = weekOver(wk);
    var opps = [
      { id: 'spy', label: 'S&P 500', ok: typeof bm.spy === 'number' || arr(wk.days).length === 0, why: 'No SPY quotes saved for these days' },
      { id: 'top5', label: 'Top 5 richest', ok: !!bm.top5, why: 'Not available' },
      { id: 'perfect', label: 'Perfect team', ok: !!bm.perfect, why: 'Worked out after Friday' }
    ];
    if (!UI.opp || !opps.filter(function(o){ return o.id === UI.opp && o.ok; }).length){
      var firstOk = opps.filter(function(o){ return o.ok; })[0];
      UI.opp = firstOk ? firstOk.id : 'spy';
    }
    var og = el('div', 'fl-opps'); og.setAttribute('role', 'group'); og.setAttribute('aria-label', 'Opponent');
    og.appendChild(el('span', 'g-stat__label', 'Versus'));
    opps.forEach(function(o){
      var b = btn('g-btn fl-opp' + (UI.opp === o.id ? ' is-on' : ''), o.label, { 'data-opp': o.id, 'aria-pressed': UI.opp === o.id ? 'true' : 'false' });
      if (!o.ok){ b.disabled = true; b.title = o.why; b.appendChild(el('small', null, o.id === 'perfect' ? 'after Friday' : 'n/a')); }
      og.appendChild(b);
    });
    box.appendChild(og);

    var mine = teamWeek(wk, team);
    var opp = null, oppTeam = null;
    if (UI.opp === 'spy') opp = { total: typeof bm.spy === 'number' ? bm.spy : null, byDay: wk.spyDaily || {} };
    else { oppTeam = UI.opp === 'top5' ? bm.top5 : bm.perfect; opp = oppTeam ? teamWeek(wk, oppTeam) : null; }
    var oppName = opps.filter(function(o){ return o.id === UI.opp; })[0].label;
    var any = arr(wk.days).length > 0;
    var a = any ? mine.total : null, b2 = opp && any ? opp.total : null;

    // scoreboard
    var sb = el('div', 'g-matchup g-terminal');
    var teams = el('div', 'g-matchup__teams');
    function side(name, score, win, cl, result){
      var sd = el('div', 'g-matchup__side ' + cl + (win ? ' is-winning' : ''));
      sd.appendChild(el('span', 'g-matchup__name', name));
      sd.appendChild(el('span', 'g-matchup__score', score == null ? '—' : signed(score)));
      if (result) sd.appendChild(el('span', 'g-matchup__result g-pill ' + (result === 'W' ? 'g-pill--live fl-win' : 'g-pill--final'), result === 'W' ? 'Final · Won' : (result === 'L' ? 'Final · Lost' : 'Final · Tie')));
      return sd;
    }
    var both = typeof a === 'number' && typeof b2 === 'number';
    var ra = null, rb = null;
    if (over && both){ ra = a > b2 ? 'W' : (a < b2 ? 'L' : 'T'); rb = a < b2 ? 'W' : (a > b2 ? 'L' : 'T'); }
    teams.appendChild(side('My team' + (team.lateFrom ? ' · late entry' : ''), a, both && a > b2, 'g-matchup__side--a', ra));
    teams.appendChild(el('span', 'g-matchup__vs', 'vs'));
    teams.appendChild(side(oppName, b2, both && b2 > a, 'g-matchup__side--b', rb));
    sb.appendChild(teams);
    // win chance (estimate)
    var pr = el('div', 'g-matchup__prob');
    if (both){
      var pA;
      var today = C.nyDate(now());
      var left = C.weekDays(wk.week).filter(function(d){ return arr(wk.days).indexOf(d) < 0 && d >= today; }).length;
      if (over || !left) pA = a > b2 ? 1 : (a < b2 ? 0 : 0.5);
      else {
        var lead = a - b2, spread = 220 * Math.sqrt(left);   // typical swing over the days left
        pA = 1 / (1 + Math.exp(-1.6 * lead / spread));
      }
      var pct = Math.round(pA * 100);
      if (!over && left) pct = Math.min(99, Math.max(1, pct));
      var row = el('div', 'g-matchup__probrow');
      if (over || !left){
        row.appendChild(el('span', null, 'Final · ' + (a > b2 ? 'won by ' + (a - b2) : (a < b2 ? 'lost by ' + (b2 - a) : 'tie'))));
        row.appendChild(el('span', null, oppName));
      } else {
        row.appendChild(el('span', null, 'Win chance · My team ' + pct + '%'));
        row.appendChild(el('span', null, oppName + ' ' + (100 - pct) + '%'));
      }
      pr.appendChild(row);
      var bar = el('div', 'g-matchup__bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', (over ? 'Final result: ' : 'Estimated win chance: ') + 'my team ' + pct + ' percent, ' + oppName + ' ' + (100 - pct) + ' percent');
      var sa = el('span', 'a'); sa.style.width = pct + '%'; var sbb = el('span', 'b'); sbb.style.width = (100 - pct) + '%';
      bar.appendChild(sa); bar.appendChild(sbb); pr.appendChild(bar);
      pr.appendChild(el('p', 'g-matchup__note', over ? 'Week is over.' : 'Estimate: the current lead weighed against the ' + left + ' trading day' + (left === 1 ? '' : 's') + ' left. Not a forecast.'));
    } else {
      pr.appendChild(el('p', 'g-matchup__note', !any ? 'No trading day has been scored yet.' : 'No score for ' + oppName + ' this week.'));
    }
    sb.appendChild(pr);
    box.appendChild(sb);

    // day tabs
    var days = C.weekDays(wk.week);
    var dayIds = ['week'].concat(days);
    if (dayIds.indexOf(UI.day) < 0) UI.day = 'week';
    var tl = el('div', 'g-tabs g-tabs--seg fl-daytabs'); tl.setAttribute('role', 'tablist'); tl.setAttribute('aria-label', 'Day'); tl.id = 'daytabs';
    dayIds.forEach(function(d, i){
      var on = UI.day === d;
      var scored = d === 'week' || arr(wk.days).indexOf(d) >= 0;
      var t = btn('g-tab', d === 'week' ? 'Week' : DAYN[C.weekday(d)], { role: 'tab', id: 'day-' + i, 'aria-selected': on ? 'true' : 'false', 'aria-controls': 'daypanel', 'data-day': d });
      t.tabIndex = on ? 0 : -1;
      var mv = d === 'week' ? (any ? mine.total : null) : mine.byDay[d];
      t.appendChild(el('small', null, d === 'week' ? 'Total' : (scored ? (typeof mv === 'number' ? signed(mv) : (mv === null && team.lateFrom ? 'before entry' : '—')) : (d < C.nyDate(now()) ? (over ? 'no market' : 'no data') : shortDate(d)))));
      tl.appendChild(t);
    });
    box.appendChild(tl);
    wireTablist(tl, function(t, focus){ UI.day = t.getAttribute('data-day'); renderMatch(); if (focus){ var n = $('daytabs').querySelector('[aria-selected="true"]'); if (n) n.focus(); } });

    var panel = el('div', 'fl-daypanel'); panel.id = 'daypanel'; panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'day-' + dayIds.indexOf(UI.day));
    var d0 = UI.day, isWeek = d0 === 'week', scoredDay = isWeek || arr(wk.days).indexOf(d0) >= 0;
    var cols = el('div', 'fl-vs');
    function colList(title, tm, res, total){
      var col = el('div', 'fl-vs__col');
      col.appendChild(el('h3', 'fl-vs__h', title));
      var ul = el('ul', 'fl-vs__list');
      if (!tm){
        var li0 = el('li', 'fl-vs__row');
        var nm = el('span', 'g-rp__text'); nm.appendChild(el('strong', null, 'SPY')); nm.appendChild(el('span', 'g-rp__sub', 'S&P 500 × 5'));
        li0.appendChild(nm);
        var v0 = isWeek ? total : (res && typeof res[d0] === 'number' ? res[d0] : null);
        li0.appendChild(el('span', 'fl-vs__pts g-num ' + cls(v0), scoredDay && v0 != null ? signed(v0) : '—'));
        ul.appendChild(li0);
      } else {
        var order = tm.picks.slice();
        if (order.indexOf(tm.captain) > 0){ order.splice(order.indexOf(tm.captain), 1); order.unshift(tm.captain); }
        order.forEach(function(s){
          var li = el('li', 'fl-vs__row' + (s === tm.captain ? ' is-captain' : ''));
          var w = el('span', 'fl-vs__who');
          w.appendChild(avatar(s, 28));
          var tx = el('span', 'g-rp__text');
          tx.appendChild(nameBtn(s));
          if (s === tm.captain) tx.appendChild(el('span', 'g-rp__sub g-gold', 'Captain · 1.5×'));
          w.appendChild(tx);
          li.appendChild(w);
          var v = null;
          if (isWeek) v = res ? res.bySlug[s] : null;
          else if (res && res.perDay[d0]) v = res.perDay[d0][s];
          var txt = !scoredDay || !any ? '—' : (res && !isWeek && res.perDay[d0] === null ? 'before entry' : signed(v));
          li.appendChild(el('span', 'fl-vs__pts g-num ' + cls(v), txt));
          ul.appendChild(li);
        });
      }
      col.appendChild(ul);
      var tot = isWeek ? total : (tm ? (res && typeof res.byDay[d0] === 'number' ? res.byDay[d0] : null) : (res && typeof res[d0] === 'number' ? res[d0] : null));
      var f = el('div', 'fl-vs__total'); f.appendChild(el('span', 'g-stat__label', isWeek ? 'Week total' : dayLabel(d0))); f.appendChild(el('strong', 'g-num ' + cls(tot), scoredDay && tot != null && any ? signed(tot) : '—'));
      col.appendChild(f);
      return col;
    }
    cols.appendChild(colList('My team', team, mine, mine.total));
    cols.appendChild(colList(oppName, oppTeam, UI.opp === 'spy' ? opp.byDay : opp, opp ? opp.total : null));
    panel.appendChild(cols);
    if (!scoredDay) panel.appendChild(el('p', 'tnote', C.isWeekday(d0) && d0 < C.nyDate(now()) && over ? 'No market that day.' : 'Not scored yet. Scores arrive after the close.'));
    box.appendChild(panel);

    if (!bm.perfect) box.appendChild(el('p', 'tnote', 'Perfect team: the best possible lineup under the cap, worked out after the week ends.'));
    if (UI.opp === 'spy' && typeof bm.spy !== 'number' && any) box.appendChild(el('p', 'tnote', 'No SPY quote was saved for these days, so the S&P 500 benchmark is not available.'));
  }

  // ---- season record ----
  var seasonSeq = 0;
  function renderSeason(){
    var box = $('seasonbox');
    var weeks = arr(S.index && S.index.weeks).filter(function(w){ return w.final && !w.practice && store.teams[w.week]; });
    var seq = ++seasonSeq;
    if (!weeks.length){
      box.innerHTML = '';
      var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
      box.appendChild(emptyState('No finished weeks yet', (first ? 'The first real week starts ' + dayLabel(first) + '. ' : '') + 'Save a lineup before the lock, and your record against the S&P 500, the Top 5 richest and the perfect team builds here week by week.', 'Build your lineup'));
      renderChips();
      return;
    }
    Promise.all(weeks.map(function(w){ return loadWeek(w.week); })).then(function(files){
      if (seq !== seasonSeq) return;
      var rec = { played: 0, winsSpy: 0, winsTop5: 0, winsPerfect: 0, best: null, streak: 0, rows: [] };
      files.forEach(function(wk, i){
        if (!wk) return;
        var team = store.teams[weeks[i].week];
        var mine = teamWeek(wk, team).total;
        var t5 = wk.benchmarks.top5 ? teamWeek(wk, wk.benchmarks.top5).total : null;
        var spy = wk.benchmarks.spy, pf = wk.benchmarks.perfect ? wk.benchmarks.perfect.points : null;
        rec.played++;
        var beatSpy = typeof spy === 'number' && mine > spy;
        if (beatSpy) rec.winsSpy++;
        if (typeof t5 === 'number' && mine > t5) rec.winsTop5++;
        if (typeof pf === 'number' && mine >= pf) rec.winsPerfect++;
        if (!rec.best || mine > rec.best.points) rec.best = { week: wk.week, points: mine };
        rec.rows.push({ week: wk.week, mine: mine, spy: spy, top5: t5, perfect: pf, beatSpy: beatSpy, team: team });
      });
      rec.rows.sort(function(a, b){ return a.week < b.week ? 1 : -1; });
      for (var i = 0; i < rec.rows.length && rec.rows[i].beatSpy; i++) rec.streak++;
      store.record = { played: rec.played, winsSpy: rec.winsSpy, winsTop5: rec.winsTop5, winsPerfect: rec.winsPerfect, best: rec.best, streak: rec.streak };
      persist();
      renderChips();
      box.innerHTML = '';
      var g = el('div', 'g-stats fl-rec');
      [['Weeks played', String(rec.played), ''], ['vs S&P 500', rec.winsSpy + '–' + (rec.played - rec.winsSpy), rec.winsSpy * 2 > rec.played ? 'gold' : ''],
       ['vs Top 5 richest', rec.winsTop5 + '–' + (rec.played - rec.winsTop5), rec.winsTop5 * 2 > rec.played ? 'gold' : ''],
       ['Matched perfect', rec.winsPerfect + ' of ' + rec.played, ''],
       ['Best week', rec.best ? signed(rec.best.points) : '—', 'gold', rec.best ? shortDate(C.weekMonday(rec.best.week)) : ''],
       ['Streak', rec.streak ? 'W' + rec.streak : '—', rec.streak ? 'gold' : '', 'weeks beating the S&P 500']].forEach(function(x){
        var d = el('div', 'g-stat' + (x[2] ? ' g-stat--gold' : ''));
        d.appendChild(el('span', 'g-stat__label', x[0])); d.appendChild(el('span', 'g-stat__num', x[1]));
        if (x[3]) d.appendChild(el('span', 'g-stat__sub', x[3]));
        g.appendChild(d);
      });
      box.appendChild(g);
      box.appendChild(el('h3', 'fl-dsec__h fl-histh', 'Weekly history'));
      var wrap = el('div', 'g-table-wrap'), t = el('table', 'g-table g-table--cards fl-hist');
      t.appendChild(el('caption', null, 'Finished weeks, newest first. W = you beat that benchmark.'));
      var hr = el('tr'); ['Week', 'My points', 'S&P 500', 'Top 5', 'Perfect'].forEach(function(x){ var th = el('th', null, x); th.scope = 'col'; hr.appendChild(th); });
      var th0 = el('thead'); th0.appendChild(hr); t.appendChild(th0);
      var tb = el('tbody');
      function res(label, mine, v, winIfGe){
        var td = el('td'); td.setAttribute('data-label', label);
        if (typeof v !== 'number'){ td.appendChild(el('span', 'g-flat', 'n/a')); return td; }
        var w = winIfGe ? mine >= v : mine > v;
        var s = el('span', 'fl-res');
        s.appendChild(el('span', 'g-badge ' + (w ? 'fl-w' : 'fl-l'), w ? 'W' : 'L'));
        s.appendChild(el('span', 'g-num ' + cls(v), signed(v)));
        td.appendChild(s); return td;
      }
      rec.rows.forEach(function(r){
        var tr = el('tr'), th = el('th', null, 'Week of ' + shortDate(C.weekMonday(r.week)) + (rec.best && rec.best.week === r.week ? ' · best' : '')); th.scope = 'row';
        tr.appendChild(th);
        var tm = el('td'); tm.setAttribute('data-label', 'My points'); tm.appendChild(el('strong', 'g-num ' + cls(r.mine), signed(r.mine))); tr.appendChild(tm);
        tr.appendChild(res('S&P 500', r.mine, r.spy)); tr.appendChild(res('Top 5', r.mine, r.top5)); tr.appendChild(res('Perfect', r.mine, r.perfect, true));
        tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
    });
  }

  // ---- export / import / share ----
  function copyText(text, okMsg){
    function fallback(){
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'fl-copy';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (ok){ msg('iomsg', okMsg); toast(okMsg); }
      else { msg('iomsg', 'Copy this: ' + text); say('Copy failed. The text is shown below the buttons.'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ msg('iomsg', okMsg); toast(okMsg); }, fallback);
    } else fallback();
  }
  function exportCode(){
    var n = 0; for (var k in store.teams) n++;
    if (!n){ msg('iomsg', 'Save a lineup first.', true); toast('Save a lineup first.', true); return; }
    var code = C.exportCode(store.teams);
    $('importcode').value = code;
    copyText(code, 'Team code copied. It is also in the box below.');
  }
  function importCode(){
    var v = $('importcode').value;
    var teams;
    try { teams = C.importCode(v); } catch (e) { msg('iomsg', 'That code did not work. Check that you pasted all of it.', true); toast('That code did not work.', true); return; }
    var n = 0;
    for (var w in teams){ store.teams[w] = teams[w]; store.teams[w].savedAt = new Date(now()).toISOString(); n++; }
    if (!n){ msg('iomsg', 'That code has no teams in it.', true); toast('That code has no teams in it.', true); return; }
    persist();
    var t = store.teams[S.draftWeek];
    if (t){ S.picks = t.picks.filter(function(s){ return salaries()[s] != null; }).slice(0, C.PICKS); S.captain = S.picks.indexOf(t.captain) >= 0 ? t.captain : (S.picks[0] || null); saveDraft(); }
    var text = 'Imported ' + n + (n === 1 ? ' week.' : ' weeks.');
    msg('iomsg', text); toast(text);
    renderLineup(); renderPool(); renderMatch(); renderSeason();
  }
  function shareWeek(){
    var wk = S.sbWk;
    var team = wk && matchTeam(wk);
    if (!wk || !team){ msg('iomsg', 'You have no team in this week to share yet.', true); toast('No team to share yet.', true); return; }
    var mine = teamWeek(wk, team).total;
    var t5 = wk.benchmarks.top5 ? teamWeek(wk, wk.benchmarks.top5).total : null;
    var parts = ['Billionaire Fantasy League, ' + (wk.practice ? 'practice week' : 'week of ' + shortDate(wk.start)) + ': ' + signed(mine) + ' points' + (wk.final ? '' : ' so far') + '.'];
    var vs = [];
    if (typeof wk.benchmarks.spy === 'number') vs.push('S&P 500 ' + signed(wk.benchmarks.spy));
    if (t5 != null) vs.push('Top 5 richest ' + signed(t5));
    if (wk.benchmarks.perfect) vs.push('perfect team ' + signed(wk.benchmarks.perfect.points));
    if (vs.length) parts.push('Versus ' + vs.join(', ') + '.');
    parts.push('My team: ' + team.picks.map(function(s){ return person(s).name + (s === team.captain ? ' (C)' : ''); }).join(', ') + '.');
    parts.push('A free game, not financial advice. https://billionairesdigest.com/fantasy.html');
    copyText(parts.join(' '), 'Your week summary is copied.');
  }

  // ---- not draftable ----
  function renderNoDraft(){
    var ul = $('nodraft');
    ul.innerHTML = '';
    var list = arr(S.index && S.index.notDraftable).slice().sort(function(a, b){ return a.rank - b.rank; });
    $('nodraftsummary').textContent = 'Show ' + list.length + ' people who cannot be drafted (no daily market price)';
    list.forEach(function(p){
      S.people[p.slug] = S.people[p.slug] || p;
      var li = el('li');
      var a = el('a', 'fl-ndlink', p.name); a.href = 'people/' + encodeURIComponent(p.slug) + '/';
      li.appendChild(a);
      li.appendChild(el('span', 'g-rp__sub', '#' + p.rank + ' · ' + (p.sector || 'Other') + ' · private wealth'));
      ul.appendChild(li);
    });
  }

  // ---- online play (assets/game-client.js + assets/account.js). Offline-first: the local save always happens;
  // when the player is online with a nickname, each save is also sent with save_roster. ----
  var SYNCKEY = 'bd-fantasy-sync-v1';
  var ON = { ready: false, acct: null, remote: {}, asked: {}, busy: false };   // remote[week] = signature of the server copy ('' = none)
  function onlinePlaying(){ var a = ON.acct; return !!(ON.ready && a && a.enabled && a.signedIn && a.me); }
  function teamSig(t){ return t && t.picks ? arr(t.picks).slice().sort().join(',') + '|' + t.captain : ''; }
  function syncMarks(){ try { return JSON.parse(localStorage.getItem(SYNCKEY) || '{}') || {}; } catch (e) { return {}; } }
  function markSynced(week, team){
    var m = syncMarks(); m[ON.acct.me.id + ':' + week] = teamSig(team);
    try { localStorage.setItem(SYNCKEY, JSON.stringify(m)); } catch (e) {}
  }
  function isSynced(week){
    var t = store.teams[week];
    if (!t || !onlinePlaying()) return false;
    if (ON.remote[week] != null) return ON.remote[week] === teamSig(t);
    return syncMarks()[ON.acct.me.id + ':' + week] === teamSig(t);
  }
  function fetchRemote(){
    var wk = S.draftWeek;
    if (!onlinePlaying() || !wk || ON.asked[wk] || !BDGame.myRoster) return;
    ON.asked[wk] = true;
    BDGame.myRoster(wk).then(function(r){ ON.remote[wk] = r ? teamSig(r) : ''; renderSync(); }, function(){});
  }
  function syncTeam(week, team){
    if (!onlinePlaying() || ON.busy) return;
    ON.busy = true; renderSync();
    var nick = ON.acct.me.nickname;
    BDGame.syncRoster(week, team.picks.slice(), team.captain).then(function(r){
      ON.busy = false;
      if (r && r.ok){
        ON.remote[week] = teamSig(team); markSynced(week, team);
        toast('Synced to the online leaderboard as ' + nick + '.');
      } else if (r && !r.skipped){
        toast('Saved in this browser, but not online: ' + r.reason, true);   // the server's own plain message (lock, cap …)
      }
      renderSync();
    });
  }
  function renderSync(){
    var box = $('syncstatus');
    if (!box) return;
    box.innerHTML = '';
    box.hidden = !onlinePlaying() || !S.draftWeek;
    if (box.hidden) return;
    var saved = savedTeam(), ok = saved && !dirty() && isSynced(S.draftWeek);
    var st = el('span', 'fl-sync__state ' + (ok ? 'is-ok' : 'is-off'), ON.busy ? 'Syncing…' : (ok ? 'Synced ✓' : 'Not synced'));
    box.appendChild(st);
    if (ON.busy) return;
    if (ok){ box.appendChild(el('span', null, 'Online leaderboard has this lineup')); return; }
    if (!saved || dirty()){ box.appendChild(el('span', null, 'Save your lineup to sync it')); return; }
    var b = btn('g-link', 'Sync now', { 'aria-label': 'Sync this saved lineup to the online leaderboard' });
    b.addEventListener('click', function(){ var t = savedTeam(); if (t) syncTeam(S.draftWeek, t); });
    box.appendChild(b);
  }
  function renderOnline(){
    $('online').hidden = window.BD_GAME_ONLINE !== true;
    var chip = $('onlinechip'), line = $('onlinesync');
    chip.innerHTML = '';
    chip.hidden = !onlinePlaying();
    line.hidden = !onlinePlaying();
    if (onlinePlaying()){
      var me = ON.acct.me, coins = Number(me.coins || 0).toLocaleString('en-US');
      chip.appendChild(document.createTextNode('Online as '));
      chip.appendChild(el('b', null, me.nickname));
      chip.appendChild(document.createTextNode(' · '));
      chip.appendChild(el('b', 'g-num', coins));
      chip.appendChild(document.createTextNode(' coins'));
      chip.setAttribute('aria-label', 'Online as ' + me.nickname + ', ' + coins + ' play-money coins');
      line.textContent = 'Your lineup will sync to the online leaderboard each time you save.';
      fetchRemote();
    }
    renderSync();
  }
  ((BD.game && BD.game.ready) || Promise.resolve(false)).then(function(ok){
    if (!ok) return;
    window.BD_GAME_ONLINE = true;
    ON.ready = true;
    renderOnline();
    if (window.BDAccount) BDAccount.onChange(function(a){
      var who = a && a.me ? a.me.id : null, was = ON.acct && ON.acct.me ? ON.acct.me.id : null;
      if (who !== was){ ON.remote = {}; ON.asked = {}; }
      ON.acct = a; renderOnline();
    });
  }, function(){});

  // ---- wiring ----
  document.addEventListener('click', function(e){
    var t = e.target;
    if (t.closest && t.closest('[data-close]') && drawer && drawer.panel.parentNode.contains(t)){ closeModal(drawer); return; }
    if (t === $('sheetscrim')){ closeSheet(); return; }
    var b = t.closest ? t.closest('button') : null;
    if (!b || b.disabled) return;
    var s;
    if ((s = b.getAttribute('data-tab'))) { setTab(s); return; }
    if ((s = b.getAttribute('data-open'))) { openPlayer(s, b); return; }
    if ((s = b.getAttribute('data-sort'))) { setSort(s, true); var nb = document.querySelector('#poolhead [data-sort="' + s + '"]'); if (nb) nb.focus(); return; }
    if (b.hasAttribute('data-sector')) { setSector(b.getAttribute('data-sector') || '', true); return; }
    if ((s = b.getAttribute('data-goto'))) { closeSheet(true); setTab(s, true); return; }
    if ((s = b.getAttribute('data-opp'))) { UI.opp = s; renderMatch(); var ob = document.querySelector('[data-opp="' + s + '"]'); if (ob) ob.focus(); return; }
    if ((s = b.getAttribute('data-day'))) { UI.day = s; renderMatch(); var db = document.querySelector('[data-day="' + s + '"]'); if (db) db.focus(); return; }
    if (b.hasAttribute('data-fill')) { closeSheet(true); var q = $('q'); q.focus(); if (q.scrollIntoView) q.scrollIntoView({ block: 'center', behavior: BD.reducedMotion() ? 'auto' : 'smooth' }); return; }
    var dact = b.getAttribute('data-dact');
    var inPool = !!(b.closest && b.closest('#pool'));
    if ((s = b.getAttribute('data-add'))) { if (addPick(s) && !dact) refocus(inPool ? '#pool' : null, 'data-remove', s); }
    else if ((s = b.getAttribute('data-addcap'))) { if (addPick(s)) setCaptain(s); }
    else if ((s = b.getAttribute('data-remove'))) { removePick(s); if (!dact){ if (inPool) refocus('#pool', 'data-add', s); else focusSlot(); } }
    else if ((s = b.getAttribute('data-captain'))) { setCaptain(s); if (!dact) refocus('#slots', 'data-captain', s); }
  });
  function refocus(scope, attr, slug){
    var n = document.querySelector((scope || '') + ' [' + attr + '="' + slug + '"]');
    if (n && !n.disabled) n.focus();
    else if (scope === '#pool'){ var r = document.querySelector('#pool [data-open="' + slug + '"]'); if (r) r.focus(); }
  }
  function focusSlot(){ var n = document.querySelector('#slots button:not([disabled])') || $('savebtn'); if (n && !n.disabled) n.focus(); else $('lineuph').focus(); }
  $('savebtn').addEventListener('click', saveTeam);
  $('barsave').addEventListener('click', saveTeam);
  $('barsum').addEventListener('click', function(){ openSheet(this); });
  $('sheetclose').addEventListener('click', function(){ closeSheet(); });
  $('clearbtn').addEventListener('click', function(){ S.picks = []; S.captain = null; afterChange(); say('Picks cleared. ' + capLine()); focusSlot(); });
  $('exportbtn').addEventListener('click', exportCode);
  $('importbtn').addEventListener('click', importCode);
  $('sharebtn').addEventListener('click', shareWeek);
  var qt = null;
  $('q').addEventListener('input', function(){ var v = this.value; clearTimeout(qt); qt = setTimeout(function(){ UI.q = v; renderPool(); }, 120); });
  $('afford').addEventListener('change', function(){ UI.afford = this.checked; renderPool(); });
  // sort select (for phones, where column headers are hidden; also the only way to sort by Hot)
  (function(){
    var f = document.querySelector('.fl-filters');
    var w = el('div', 'fl-sortsel');
    var lab = el('label', 'g-sr', 'Sort players by'); lab.htmlFor = 'sortsel'; w.appendChild(lab);
    var sel = el('select', 'g-input'); sel.id = 'sortsel';
    ['rank', 'salary', 'avg', 'last', 'hot', 'news'].forEach(function(k){ var o = el('option', null, 'Sort: ' + SORTS[k].label); o.value = k; sel.appendChild(o); });
    sel.addEventListener('change', function(){ setSort(this.value, false); });
    w.appendChild(sel);
    f.insertBefore(w, f.lastElementChild);
  })();

  function fail(){
    ['matchbox', 'seasonbox'].forEach(function(id){ var n = $(id); n.innerHTML = ''; n.appendChild(el('p', 'tempty', 'The game data is not available right now. Try again later.')); });
    var p = $('pool'); p.innerHTML = ''; var r = el('tr'), c = el('td', 'tempty', 'The player pool is not available right now.'); c.colSpan = 7; r.appendChild(c); p.appendChild(r);
    $('weeklabel').textContent = 'Data unavailable';
  }

  var ticking = false;
  function init(){
    var t = now();
    if (nowOverride){ var tc = $('testclock'); tc.hidden = false; tc.textContent = 'Test clock (for testing only): ' + new Date(t).toISOString(); }
    getJson('data/fantasy/index.json').then(function(ix){
      S.index = ix;
      S.draftWeek = C.draftWeek(t);
      var weeks = arr(ix.weeks).map(function(w){ return w.week; });
      var lw = C.lockedWeek(t);
      var sbId = null;
      for (var i = weeks.length - 1; i >= 0; i--) if (weeks[i] <= lw) { sbId = weeks[i]; break; }
      var prevId = sbId && weeks.indexOf(sbId) > 0 ? weeks[weeks.indexOf(sbId) - 1] : null;
      var latestWeek = weeks.length ? weeks[weeks.length - 1] : null;
      function listed(id){ return weeks.indexOf(id) >= 0 ? loadWeek(id) : null; }
      return Promise.all([
        listed(S.draftWeek),
        sbId ? loadWeek(sbId) : null,
        ix.latestDay ? loadDay(ix.latestDay) : null,
        latestWeek ? loadWeek(latestWeek) : null,
        prevId ? loadWeek(prevId) : null
      ]).then(function(r){
        S.draftWk = r[0]; S.salaryFallback = false;
        if (!S.draftWk && r[3]){ S.draftWk = r[3]; S.salaryFallback = true; }
        S.sbWk = r[1]; S.lastDay = r[2]; S.prevWk = r[4];
        // day files for the scored days (insider-buy badges, holding changes); optional
        var dset = {};
        [S.prevWk, S.sbWk].forEach(function(w){ if (w) arr(w.days).forEach(function(d){ dset[d] = 1; }); });
        return Promise.all(Object.keys(dset).map(function(d){ return loadDay(d).then(function(x){ if (x) S.days[d] = x; }); }));
      }).then(function(){
        arr(S.draftWk && S.draftWk.draftable).forEach(function(p){ S.people[p.slug] = p; });
        arr(S.sbWk && S.sbWk.draftable).forEach(function(p){ S.people[p.slug] = S.people[p.slug] || p; });
        arr(S.prevWk && S.prevWk.draftable).forEach(function(p){ S.people[p.slug] = S.people[p.slug] || p; });
        renderNoDraft();
        computeStats();
        // roster: saved team for the draft week, else the unsaved working draft
        var saved = store.teams[S.draftWeek];
        var src = saved || store.draft || { picks: [] };
        var sal = salaries();
        S.picks = arr(src.picks).filter(function(s){ return sal[s] != null; }).slice(0, C.PICKS);
        S.captain = S.picks.indexOf(src.captain) >= 0 ? src.captain : (S.picks[0] || null);
        $('updated').textContent = ix.latestDay ? 'Scores through ' + dayLabel(ix.latestDay) : '';
        renderHead(); renderChips(); renderSectors(); renderPoolHead(); renderLineup(); renderPool(); renderMatch(); renderSeason(); renderOnline();
        if (!ticking){ ticking = true; setInterval(renderHead, 20000); }
      });
    }).then(null, function(err){ if (window.console) console.warn(err); fail(); });
    // net worth for the player card (optional)
    if (BD.loadPeople) BD.loadPeople().then(function(px){
      arr(px && px.people).forEach(function(p){ if (p.worth) S.worth[p.slug] = p.worth; });
      if (drawer) refreshDrawer();
    }, function(){});
  }
  setTab(tabFromHash() || 'lineup', false, !tabFromHash());
  window.addEventListener('load', renderOnline);
  init();
})();
