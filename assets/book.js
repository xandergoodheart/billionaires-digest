/* book.html: The Book, a play-money sportsbook on billionaires' price moves and the fantasy week. ES5, needs common.js, game-client.js, account.js.
   UI kit: assets/game-ui.css (g-card, g-tabs, g-drawer, g-bottombar, g-countdown, g-toast); layout: assets/game.css (gp-) + assets/book.css (bk-).
   Odds come from data/book/<week>.json (built by scripts/build-book.mjs); when the game is online the live prices from the
   database win (they freeze once someone bets). Anyone can browse and build a slip; placing a bet needs Play online. */
(function(){
  BD.initTheme();
  var $ = function(id){ return document.getElementById(id); };
  var el = BD.el;
  if (!window.BDAccount || !window.BDGame) {   // a game script failed to load: never throw
    var soon = $('gameaccount'); if (soon) soon.textContent = 'Multiplayer is coming soon.';
  }
  // limits mirror place_bet (supabase/migrations/0003_book_wealth.sql); the week file's "limits" replaces them when loaded
  var LIM = { minStake: 1, maxStake: 500, maxLegs: 4, maxPayout: 10000,
    longShots: [{ minDecimal: 21, maxStake: 50 }, { minDecimal: 6, maxStake: 150 }] };
  var TABS = ['blasts', 'ladders', 'races', 'matchups', 'player', 'futures', 'props', 'mybets'];
  var RUNGS = [-10, -5, -2, 2, 5, 10];   // ladder strikes, downside to upside
  var MINUS = '−';
  var S = {
    week: null, file: null, events: [], bySel: {}, byEvent: {}, source: 'file', loadErr: '',
    slip: [], mode: 'single', stake: '10', busy: false, msg: '', msgBad: false,
    tab: 'blasts', query: '', bquery: '', bets: null, betsErr: '', board: null,
    boardMode: 'week', season: null, seasonErr: '', seasonLoading: false
  };
  var acct = { enabled: false, loading: true, signedIn: false, me: null };

  // ---------- small helpers ----------
  function load(key, fb){ try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch(e){ return fb; } }
  function save(key, v){ try { localStorage.setItem(key, JSON.stringify(v)); } catch(e){} }
  function num(n){ return Number(n || 0).toLocaleString('en-US'); }
  function am(a){ a = Number(a); return (a > 0 ? '+' : MINUS) + Math.abs(a); }
  function amSpoken(a){ a = Number(a); return (a > 0 ? 'plus ' : 'minus ') + Math.abs(a); }
  function lineText(n){ n = Number(n); return (n > 0 ? '+' : n < 0 ? MINUS : '') + Math.abs(n).toFixed(1); }
  function decToAm(d){ return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)); }
  function payoutOf(stake, dec){ return Math.min(LIM.maxPayout, Math.floor(stake * dec + 1e-9)); }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function nyTime(iso){
    try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'; }
    catch(e){ return iso; }
  }
  // "Mon 9:30 AM ET" (with the date when it is more than 6 days away)
  function closeText(iso){
    var t = Date.parse(iso); if (!isFinite(t)) return '';
    var o = { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' };
    if (t - Date.now() > 6 * 864e5) { o.month = 'short'; o.day = 'numeric'; }
    try { return new Date(t).toLocaleString('en-US', o) + ' ET'; } catch(e){ return iso; }
  }
  function nyToday(){
    try { var p = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p; } catch(e){}
    return new Date().toISOString().slice(0, 10);
  }
  function dayText(ymd){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); if (!m) return ymd || '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + monDay(ymd);
  }
  function usdText(v){
    v = Number(v); if (!isFinite(v)) return '';
    return v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : '$' + (v / 1e9).toFixed(1) + 'B';
  }
  function lcFirst(t){ t = String(t || ''); return t.charAt(0).toLowerCase() + t.slice(1); }
  // the most one bet may stake at these decimal odds (combined odds for a parlay)
  function capFor(dec){
    var cap = LIM.maxStake;
    (LIM.longShots || []).forEach(function(ls){ if (dec >= Number(ls.minDecimal) - 1e-9) cap = Math.min(cap, Number(ls.maxStake)); });
    return cap;
  }
  function monDay(ymd){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? BD.MONTHS[+m[2] - 1] + ' ' + (+m[3]) : ymd; }
  function playing(){ return !!(acct.enabled && acct.signedIn && acct.me); }
  function isOpen(ev){ return !!ev && ev.status === 'open' && Date.parse(ev.closesAt) > Date.now(); }
  function toast(t, bad){
    if (bad && !$('slipsheet').hidden) return;
    var region = $('toasts'), n = el('div', 'g-toast' + (bad ? ' g-toast--bad' : ''), t);
    region.appendChild(n);
    while (region.children.length > 3) region.removeChild(region.firstChild);
    setTimeout(function(){ if (n.parentNode) n.parentNode.removeChild(n); }, 4200);
  }

  // ---------- data ----------
  function fromFile(b){
    return (b.events || []).map(function(e){
      return { id: e.id, type: e.type, title: e.title, params: e.params || {}, settlesFrom: e.settlesFrom || '', sort: e.sort || 0,
        closesAt: e.closesAt || b.locksAt, status: 'open', result: null,
        selections: (e.selections || []).map(function(s){
          return { id: s.id, eventId: e.id, label: s.label, line: s.line == null ? null : Number(s.line), american: Number(s.americanOdds),
            decimal: Number(s.decimalOdds), fair: s.fairProb, market: s.market, person: s.person, sector: s.sector, result: null };
        }) };
    });
  }
  function fromDb(rows){
    return rows.map(function(e){
      return { id: e.id, type: e.type, title: e.title, params: e.params || {}, settlesFrom: e.settles_from || '', sort: e.sort || 0,
        closesAt: e.closes_at, status: e.status, result: e.result || null,
        selections: (e.selections || []).map(function(s){
          var m = s.meta || {};
          return { id: s.id, eventId: e.id, label: s.label, line: s.line == null ? null : Number(s.line), american: Number(s.american_odds),
            decimal: Number(s.decimal_odds), fair: s.fair_prob, market: m.market, person: m.person, sector: m.sector, result: s.result || null };
        }) };
    });
  }
  function setEvents(list, source){
    S.events = list.slice().sort(function(a, b){ return a.sort - b.sort; });
    S.source = source; S.bySel = {}; S.byEvent = {};
    S.events.forEach(function(ev){ S.byEvent[ev.id] = ev; ev.selections.forEach(function(s){ S.bySel[s.id] = s; }); });
    reconcileSlip();
  }
  // keep the slip in step with the book: drop picks that are gone or closed, flag odds that moved
  function reconcileSlip(){
    var kept = [];
    S.slip.forEach(function(p){
      var s = S.bySel[p.id], ev = s && S.byEvent[s.eventId];
      if (!s || !isOpen(ev)) return;
      if (s.decimal !== p.decimal) { p.prev = p.prev != null ? p.prev : p.american; p.american = s.american; p.decimal = s.decimal; p.changed = true; }
      kept.push(p);
    });
    S.slip = kept;
    persistSlip();
  }
  function persistSlip(){ if (S.week) save('bd-book-slip', { week: S.week, slip: S.slip, mode: S.mode, stake: S.stake }); }

  function loadFile(){
    return BD.getJson('data/book/index.json').then(function(idx){
      if (!idx || !idx.latest) throw new Error('no book');
      S.week = idx.latest;
      return BD.getJson('data/book/' + encodeURIComponent(idx.latest) + '.json');
    }).then(function(b){
      S.file = b;
      var saved = load('bd-book-slip', null);
      if (saved && saved.week === S.week) {
        S.slip = (saved.slip || []).filter(function(p){ return p && typeof p.id === 'string'; }).slice(0, LIM.maxLegs);
        S.mode = saved.mode === 'parlay' ? 'parlay' : 'single';
        if (saved.stake) S.stake = String(saved.stake);
      }
      if (b.method) $('methodtext').textContent = b.method;
      if (b.limits) ['minStake', 'maxStake', 'maxLegs', 'maxPayout', 'longShots'].forEach(function(k){ if (b.limits[k] != null) LIM[k] = b.limits[k]; });
      setEvents(fromFile(b), 'file');
    });
  }
  function loadLive(){
    if (!acct.enabled || !S.week || !BDGame.bookWeek) return Promise.resolve();
    return BDGame.bookWeek(S.week).then(function(rows){
      if (rows && rows.length) setEvents(fromDb(rows), 'db');
    }, function(){ /* keep the published odds */ });
  }

  // ---------- header ----------
  function pill(kind, text){
    var box = $('statuspill'); box.innerHTML = '';
    var p = el('span', 'g-pill g-pill--' + kind); p.appendChild(el('span', 'g-pill__dot')); p.appendChild(document.createTextNode(text));
    box.appendChild(p);
  }
  function parts(ms){ var m = Math.max(0, Math.floor(ms / 60000)); return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 }; }
  function spanText(ms){ var p = parts(ms); return (p.d ? p.d + ' days ' : '') + (p.d || p.h ? p.h + ' hours ' : '') + p.m + ' minutes'; }
  function renderHead(){
    var b = S.file, cd = $('lockcd');
    if (!b) { pill('final', S.loadErr ? 'No odds yet' : 'Loading'); cd.hidden = true; return; }
    $('weekstat').textContent = monDay(b.start) + '–' + monDay(b.end);
    var lock = Date.parse(b.locksAt), left = lock - Date.now();
    var settled = S.events.length && S.events.every(function(e){ return e.status === 'settled' || e.status === 'void'; });
    if (settled) { pill('final', 'Settled'); cd.hidden = true; return; }
    // after the weekly lock, daily boards can still be open: count down to the next one that closes
    var next = nextClose(), label = 'Locks in', at = b.locksAt;
    if (left <= 0 && next) { at = next; left = Date.parse(next) - Date.now(); label = 'Next close in'; }
    if (left > 0) {
      pill('live', label === 'Locks in' ? 'Betting open' : 'Daily boards open');
      cd.hidden = false; cd.innerHTML = '';
      cd.appendChild(el('span', 'g-countdown__label', label));
      var tm = el('span', 'g-countdown__time'), p = parts(left);
      [[p.d, 'd'], [p.h, 'h'], [p.m, 'm']].forEach(function(x, i){ if (i === 0 && !x[0]) return; tm.appendChild(el('b', null, String(x[0]))); tm.appendChild(el('small', null, x[1])); });
      cd.appendChild(tm);
      cd.setAttribute('aria-label', (label === 'Locks in' ? 'Betting locks in ' : 'The next market closes in ') + spanText(left) + ', ' + nyTime(at));
    } else {
      pill('live', 'Live · betting closed');
      cd.hidden = true;
    }
  }
  function nextClose(){
    var best = null;
    S.events.forEach(function(e){ if (isOpen(e) && (best == null || Date.parse(e.closesAt) < Date.parse(best))) best = e.closesAt; });
    return best;
  }
  setInterval(function(){ renderHead(); }, 60000);

  // ---------- tabs ----------
  var tablist = $('booktabs');
  function tabFromHash(){ var h = String(location.hash || '').replace('#', ''); return TABS.indexOf(h) >= 0 ? h : null; }
  function setTab(name, focus, fromHash){
    if (TABS.indexOf(name) < 0) name = 'blasts';
    S.tab = name;
    TABS.forEach(function(t){
      var tab = $('tab-' + t), on = t === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false'); tab.tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
    });
    if (focus) $('tab-' + name).focus();
    showTab($('tab-' + name));
    if (!fromHash && history.replaceState) { try { history.replaceState(null, '', '#' + name); } catch(e){} }
    save('bd-book-tab', name);
    if (name === 'mybets') loadMyBets();
  }
  // keep the selected tab visible inside the sideways-scrolling tab bar (phones) without scrolling the page
  function showTab(tab){
    var tr = tab.getBoundingClientRect(), lr = tablist.getBoundingClientRect();
    if (!lr.width) return;
    if (tr.left < lr.left) tablist.scrollLeft -= (lr.left - tr.left) + 16;
    else if (tr.right > lr.right) tablist.scrollLeft += (tr.right - lr.right) + 16;
  }
  tablist.addEventListener('click', function(e){ var t = e.target.closest && e.target.closest('[role="tab"]'); if (t) setTab(t.getAttribute('data-tab'), false); });
  tablist.addEventListener('keydown', function(e){
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    var i = tabs.indexOf(document.activeElement); if (i < 0) return;
    var j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j == null) return;
    e.preventDefault(); setTab(tabs[j].getAttribute('data-tab'), true);
  });
  window.addEventListener('hashchange', function(){ var t = tabFromHash(); if (t && t !== S.tab) setTab(t, false, true); });

  // ---------- odds buttons ----------
  function inSlip(id){ for (var i = 0; i < S.slip.length; i++) if (S.slip[i].id === id) return i; return -1; }
  function personName(slug){
    var m = S.file && S.file.model && S.file.model[slug];
    if (m && m.name) return m.name;
    return String(slug || '').replace(/-family$/, '').split('-').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }
  // what a pick says in the slip and to a screen reader
  function pickText(s){
    var ev = S.byEvent[s.eventId];
    if (s.market === 'over' || s.market === 'under') return personName(s.person) + ' ' + (s.market === 'over' ? 'over ' : 'under ') + Number(s.line).toFixed(1) + ' points';
    if (ev && ev.type === 'prop_insider') return personName(ev.params.slug) + ' insider buy: ' + s.label;
    if (ev && ev.type === 'futures_top') return s.label + ' to top the week';
    if (ev && ev.type === 'prop_sector') return s.label + ' top sector';
    var P = (ev && ev.params) || {};
    if (ev && ev.type === 'blast') return personName(s.person) + ': ' + lcFirst(ev.title);
    if (ev && ev.type === 'ladder') return personName(P.slug || s.person) + ' ' + lcFirst(s.label) + ' this week';
    if (ev && ev.type === 'bracket') return personName(P.slug || s.person) + ' this week: ' + lcFirst(s.label);
    if (ev && ev.type === 'race') {
      return (s.market === 'no' ? 'No: ' + personName(P.chaser) + ' does not pass ' : 'Yes: ' + personName(P.chaser) + ' passes ') +
        personName(P.leader) + (P.to ? ' by the ' + dayText(P.to) + ' close' : '');
    }
    if (ev && ev.type === 'duel') {
      var other = s.person === P.a ? P.b : P.a;
      return s.label + ' (dollar change vs ' + personName(other) + ')';
    }
    return s.label;
  }
  function oddBtn(s, text){
    var ev = S.byEvent[s.eventId];
    var b = btn('bk-odd' + (text ? '' : ' bk-odd--center'));
    b.setAttribute('data-sel', s.id);
    b.setAttribute('aria-pressed', inSlip(s.id) >= 0 ? 'true' : 'false');
    if (text) b.appendChild(el('span', 'bk-odd__label', text));
    b.appendChild(el('span', 'bk-odd__price', am(s.american)));
    var res = s.result ? ', result: ' + (s.result === 'win' ? 'won' : s.result === 'lose' ? 'lost' : 'void') : '';
    b.setAttribute('aria-label', pickText(s) + ', odds ' + amSpoken(s.american) + res);
    if (!isOpen(ev)) b.disabled = true;
    if (s.result) b.className += ' is-' + s.result;
    return b;
  }
  function syncPressed(){
    Array.prototype.forEach.call(document.querySelectorAll('.bk-odd[data-sel]'), function(b){
      b.setAttribute('aria-pressed', inSlip(b.getAttribute('data-sel')) >= 0 ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.bk-odd[data-sel]');
    if (b && !b.disabled) togglePick(b.getAttribute('data-sel'));
  });

  function card(ev, sub){
    var art = el('article', 'g-card bk-ev');
    art.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
    var head = el('div', 'bk-ev__head');
    var h = el('h3', 'bk-ev__title', ev.title); h.id = 'ev-' + cssId(ev.id);
    head.appendChild(h);
    head.appendChild(el('span', 'bk-ev__meta', metaText(ev, sub)));
    art.appendChild(head);
    return art;
  }
  function metaText(ev, sub){
    return ev.status === 'settled' ? 'Settled' : ev.status === 'void' ? 'Void' : isOpen(ev) ? (sub || 'Closes ' + closeText(ev.closesAt)) : 'Closed';
  }
  function cssId(id){ return String(id).replace(/[^A-Za-z0-9_-]/g, '_'); }
  function foot(art, ev, text){
    var t = text || '';
    if (ev.result && ev.result.note) t = ev.result.note;
    if (t) art.appendChild(el('p', 'bk-ev__foot', t));
  }
  function list(panel, items){
    var ul = el('ul', 'bk-list');
    items.forEach(function(n){ var li = el('li'); li.appendChild(n); ul.appendChild(li); });
    panel.appendChild(ul);
  }
  // how an event settles (its source), folded away so the cards stay short
  function rule(art, ev, what){
    if (!ev || !ev.settlesFrom) return;
    var d = el('details', 'bk-rule');
    d.appendChild(el('summary', null, what ? 'How the ' + what + ' settles' : 'How it settles'));
    d.appendChild(el('p', null, ev.settlesFrom));
    art.appendChild(d);
  }
  function empty(panel, title, text){
    var d = el('div', 'g-empty'); d.appendChild(el('h2', 'g-empty__title', title)); if (text) d.appendChild(el('p', null, text)); panel.appendChild(d);
  }
  function ofType(t){ return S.events.filter(function(e){ return e.type === t; }); }
  function sel(ev, market, person){ return ev.selections.filter(function(s){ return s.market === market && (person == null || s.person === person); })[0] || null; }

  function renderMatchups(){
    var p = $('panel-matchups'); p.innerHTML = '';
    var evs = ofType('h2h');
    if (!evs.length) return empty(p, 'No matchups this week', 'Head-to-heads open with the week\'s odds.');
    p.appendChild(el('p', 'bk-note', 'Who scores more fantasy points this week? Moneyline: pick the winner. Spread: the favorite has to win by more than the line.'));
    list(p, evs.map(function(ev){
      var art = card(ev);
      var g = el('div', 'bk-grid');
      g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
      g.appendChild(el('span', 'bk-grid__h', 'Person')); g.appendChild(el('span', 'bk-grid__h', 'To win')); g.appendChild(el('span', 'bk-grid__h', 'Spread'));
      [ev.params.a, ev.params.b].forEach(function(slug){
        var ml = sel(ev, 'ml', slug), sp = sel(ev, 'spread', slug);
        g.appendChild(el('span', 'bk-grid__name', personName(slug)));
        g.appendChild(ml ? oddBtn(ml) : el('span'));
        g.appendChild(sp ? oddBtn(sp, lineText(sp.line)) : el('span'));
      });
      art.appendChild(g);
      foot(art, ev);
      return art;
    }));
  }
  function renderPlayer(){
    var p = $('panel-player'); p.innerHTML = '';
    var evs = ofType('player_ou');
    if (!evs.length) return empty(p, 'No player props this week');
    p.appendChild(el('p', 'bk-note', 'Weekly fantasy points, over or under. Each line has its own price: the further from the middle, the bigger the payout.'));
    list(p, evs.map(function(ev){
      var art = card(ev);
      var g = el('div', 'bk-ladder');
      g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
      ev.selections.filter(function(s){ return s.market === 'over'; }).forEach(function(o){
        var u = ev.selections.filter(function(s){ return s.market === 'under' && s.line === o.line; })[0];
        g.appendChild(oddBtn(o, 'O ' + lineText(o.line).replace(/^\+/, '')));
        g.appendChild(u ? oddBtn(u, 'U ' + lineText(u.line).replace(/^\+/, '')) : el('span'));
      });
      art.appendChild(g);
      foot(art, ev);
      return art;
    }));
  }
  function renderFutures(){
    var p = $('panel-futures'); p.innerHTML = '';
    var ev = ofType('futures_top')[0];
    if (!ev) return empty(p, 'No futures this week');
    var art = card(ev);
    art.appendChild(el('p', 'bk-note', 'Who finishes the week with the most fantasy points? Every draftable person has a price.'));
    var box = el('div', 'bk-search');
    var lab = el('label', 'g-label', 'Find a person'); lab.htmlFor = 'futq';
    var q = el('input', 'g-input'); q.type = 'search'; q.id = 'futq'; q.autocomplete = 'off'; q.value = S.query;
    q.setAttribute('aria-controls', 'futlist'); q.setAttribute('aria-describedby', 'futcount');
    var count = el('p', 'g-hint'); count.id = 'futcount'; count.setAttribute('aria-live', 'polite');
    box.appendChild(lab); box.appendChild(q); box.appendChild(count);
    art.appendChild(box);
    var ul = el('ul', 'bk-futures'); ul.id = 'futlist';
    ul.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
    ev.selections.forEach(function(s){ var li = el('li'); li.setAttribute('data-name', BD.norm(s.label)); li.appendChild(oddBtn(s, s.label)); ul.appendChild(li); });
    art.appendChild(ul);
    function filter(){
      var v = BD.norm(q.value), shown = 0;
      Array.prototype.forEach.call(ul.children, function(li){ var on = !v || li.getAttribute('data-name').indexOf(v) >= 0; li.hidden = !on; if (on) shown++; });
      count.textContent = v ? shown + ' of ' + ev.selections.length + ' shown' : ev.selections.length + ' people';
    }
    q.addEventListener('input', function(){ S.query = q.value; filter(); });
    filter();
    foot(art, ev, ev.settlesFrom);
    p.appendChild(art);
  }
  function renderProps(){
    var p = $('panel-props'); p.innerHTML = '';
    var ins = ofType('prop_insider'), sec = ofType('prop_sector');
    if (!ins.length && !sec.length) return empty(p, 'No props this week');
    if (ins.length) {
      p.appendChild(el('h2', 'bk-h3', 'Insider buy by Friday'));
      p.appendChild(el('p', 'bk-note', 'Will they file a Form 4 on SEC EDGAR showing an open-market purchase (code P) this week? Only people with a buy in the last 90 days get a line.'));
      list(p, ins.map(function(ev){
        var art = card(ev);
        var g = el('div', 'bk-ladder'); g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
        ev.selections.forEach(function(s){ g.appendChild(oddBtn(s, s.label)); });
        art.appendChild(g);
        var n = ev.params && ev.params.recentBuyDays;
        foot(art, ev, n ? n + ' day' + (n === 1 ? '' : 's') + ' with an insider buy in the last 90 days.' : '');
        return art;
      }));
    }
    sec.forEach(function(ev){
      p.appendChild(el('h2', 'bk-h3', 'Top sector of the week'));
      var art = card(ev);
      art.appendChild(el('p', 'bk-note', 'Highest average fantasy points per draftable person (sectors with 3 or more people).'));
      var g = el('div', 'bk-picks'); g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
      ev.selections.forEach(function(s){ g.appendChild(oddBtn(s, s.label)); });
      art.appendChild(g);
      foot(art, ev);
      p.appendChild(art);
    });
  }
  // ---------- price markets: Blasts ----------
  function boardCard(ev){
    var art = card(ev);
    var ul = el('ul', 'bk-boardlist');
    ul.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
    ev.selections.forEach(function(s){
      var li = el('li'); li.setAttribute('data-name', BD.norm(personName(s.person) + ' ' + s.label));
      li.appendChild(oddBtn(s, personName(s.person) || s.label)); ul.appendChild(li);
    });
    art.appendChild(ul);
    art.appendChild(el('p', 'bk-ev__foot bk-nomatch', 'No one on this board matches.')).hidden = true;
    foot(art, ev);
    rule(art, ev);
    return art;
  }
  function renderBlasts(){
    var p = $('panel-blasts'); p.innerHTML = '';
    var evs = ofType('blast');
    if (!evs.length) return empty(p, 'No price boards this week', 'Boards open with the week\'s odds.');
    p.appendChild(el('p', 'bk-note', 'Who moves most? Each board pays the person with the biggest move, measured from the opening price to the closing price. % boards follow each person\'s holdings basket; $ boards follow tracked stock wealth (share counts from SEC filings times the price). A tie voids the tied picks.'));
    var box = el('div', 'bk-search');
    var lab = el('label', 'g-label', 'Find a person'); lab.htmlFor = 'blastq';
    var q = el('input', 'g-input'); q.type = 'search'; q.id = 'blastq'; q.autocomplete = 'off'; q.value = S.bquery;
    q.setAttribute('aria-describedby', 'blastcount');
    var count = el('p', 'g-hint'); count.id = 'blastcount'; count.setAttribute('aria-live', 'polite');
    box.appendChild(lab); box.appendChild(q); box.appendChild(count);
    p.appendChild(box);

    var weekly = evs.filter(function(e){ return e.params && e.params.period === 'week'; });
    var byDay = {}, days = [];
    evs.forEach(function(e){
      var d = e.params && e.params.period; if (!d || d === 'week') return;
      if (!byDay[d]) { byDay[d] = []; days.push(d); }
      byDay[d].push(e);
    });
    days.sort();
    // the "Today" strip: the next day with an open board, else the latest day (its results)
    var cur = null;
    days.forEach(function(d){ if (!cur && byDay[d].some(isOpen)) cur = d; });
    if (!cur && days.length) cur = days[days.length - 1];
    if (cur) {
      var strip = el('section', 'bk-today');
      strip.setAttribute('aria-labelledby', 'todayh');
      var h = el('h2', 'bk-h3', (cur === nyToday() ? 'Today · ' : 'Next up · ') + dayText(cur)); h.id = 'todayh';
      strip.appendChild(h);
      list(strip, byDay[cur].map(boardCard));
      p.appendChild(strip);
    }
    if (weekly.length) {
      p.appendChild(el('h2', 'bk-h3', 'This week'));
      list(p, weekly.map(boardCard));
    }
    var rest = days.filter(function(d){ return d !== cur; });
    if (rest.length) {
      var more = el('details', 'bk-more');
      more.appendChild(el('summary', null, 'Other days this week (' + rest.length + ')'));
      rest.forEach(function(d){
        more.appendChild(el('h3', 'bk-h4', dayText(d)));
        list(more, byDay[d].map(boardCard));
      });
      p.appendChild(more);
    }
    function filter(){
      var v = BD.norm(q.value), shown = 0, total = 0;
      Array.prototype.forEach.call(p.querySelectorAll('.bk-ev'), function(art){
        var any = false;
        Array.prototype.forEach.call(art.querySelectorAll('li[data-name]'), function(li){
          var on = !v || li.getAttribute('data-name').indexOf(v) >= 0; li.hidden = !on; total++; if (on) { shown++; any = true; }
        });
        var nm = art.querySelector('.bk-nomatch'); if (nm) nm.hidden = any;
      });
      count.textContent = v ? shown + ' of ' + total + ' picks shown' : '';
    }
    q.addEventListener('input', function(){ S.bquery = q.value; filter(); });
    filter();
  }

  // ---------- price markets: Ladders (strike ladder + range, one card per person) ----------
  function rungText(k){ return (k > 0 ? '+' : MINUS) + Math.abs(k) + '%'; }
  function bandText(r){
    var lo = r && r[0], hi = r && r[1];
    function n(x){ return (x > 0 ? '+' : x < 0 ? MINUS : '') + Math.abs(x); }
    if (lo == null && hi != null) return 'Below ' + n(hi) + '%';
    if (hi == null && lo != null) return n(lo) + '% up';
    if (lo == null) return '';
    return n(lo) + ' to ' + n(hi) + '%';
  }
  function rungBtn(s, top){
    var b = oddBtn(s);
    b.className = b.className.replace(' bk-odd--center', '') + ' bk-odd--rung';
    b.insertBefore(el('span', 'bk-odd__label', top), b.firstChild);
    return b;
  }
  function basketText(basket){
    if (!basket || !basket.length) return '';
    var top = basket.slice(0, 4).map(function(x){ return x.ticker + ' ' + Math.round(x.weight * 100) + '%'; });
    return 'Tracks ' + top.join(' · ') + (basket.length > 4 ? ' · ' + (basket.length - 4) + ' more' : '') + '.';
  }
  function renderLadders(){
    var p = $('panel-ladders'); p.innerHTML = '';
    var lad = ofType('ladder'), br = ofType('bracket'), slugs = [], by = {};
    lad.concat(br).forEach(function(e){
      var slug = e.params && e.params.slug; if (!slug) return;
      if (!by[slug]) { by[slug] = {}; slugs.push(slug); }
      by[slug][e.type] = e;
    });
    if (!slugs.length) return empty(p, 'No ladders this week', 'Ladders open with the week\'s odds.');
    p.appendChild(el('p', 'bk-note', 'How far will each person\'s holdings basket move this week, from the opening price to Friday\'s closing price? Ladder: "+5%" wins if the week ends up 5% or more, "' + MINUS + '5%" if it ends down 5% or more. The further out, the bigger the payout. Range: pick the band the move lands in.'));
    list(p, slugs.map(function(slug){
      var L = by[slug].ladder, B = by[slug].bracket, main = L || B;
      var art = el('article', 'g-card bk-ev');
      var hid = 'ev-' + cssId(main.id);
      art.setAttribute('aria-labelledby', hid);
      var head = el('div', 'bk-ev__head');
      var h = el('h3', 'bk-ev__title', personName(slug)); h.id = hid;
      head.appendChild(h);
      head.appendChild(el('span', 'bk-ev__meta', metaText(main)));
      art.appendChild(head);
      if (L) {
        var lg = el('div', 'bk-rungs'); lg.setAttribute('role', 'group'); lg.setAttribute('aria-label', personName(slug) + ': move ladder, ' + (isOpen(L) ? 'closes ' + closeText(L.closesAt) : 'closed'));
        lg.appendChild(el('span', 'bk-rungs__h', 'Ladder'));
        RUNGS.forEach(function(k, i){
          if (i === 3) lg.appendChild(el('span', 'bk-rungs__zero'));
          var s = L.selections.filter(function(x){ return x.market === 'strike' && Number(x.line) === k; })[0];
          lg.appendChild(s ? rungBtn(s, rungText(k)) : el('span', 'bk-rungs__gap'));
        });
        var ax = el('div', 'bk-rungs__axis'); ax.setAttribute('aria-hidden', 'true');
        ax.appendChild(el('span', null, '← Down')); ax.appendChild(el('span', null, 'Up →'));
        lg.appendChild(ax);
        art.appendChild(lg);
      }
      if (B) {
        var bg = el('div', 'bk-rungs bk-rungs--range'); bg.setAttribute('role', 'group'); bg.setAttribute('aria-label', personName(slug) + ': range of the week\'s move, ' + (isOpen(B) ? 'closes ' + closeText(B.closesAt) : 'closed'));
        bg.appendChild(el('span', 'bk-rungs__h', 'Range'));
        var bk = (B.params && B.params.buckets) || {};
        B.selections.forEach(function(s, i){
          if (i === 3 && B.selections.length === 6) bg.appendChild(el('span', 'bk-rungs__zero'));
          bg.appendChild(rungBtn(s, bandText(bk[s.id]) || s.label));
        });
        art.appendChild(bg);
      }
      var bt = basketText(main.params && main.params.basket);
      if (bt) art.appendChild(el('p', 'bk-ev__foot', bt));
      if (L) foot(art, L);
      if (B && B.result && B.result.note) foot(art, B);
      var both = L && B && B.settlesFrom !== L.settlesFrom;
      rule(art, L, both ? 'ladder' : '');
      if (B && (!L || both)) rule(art, B, both ? 'range' : '');
      return art;
    }));
  }

  // ---------- price markets: Races (rank flips + dollar duels) ----------
  function nowLine(P, slugs){
    var v = (P && P.value0) || {};
    var bits = slugs.filter(function(x){ return v[x] != null; }).map(function(x){ return personName(x) + ' ' + usdText(v[x]); });
    if (!bits.length) return '';
    return 'Tracked stock wealth' + (P.value0Date ? ' at the ' + dayText(P.value0Date) + ' close' : ' now') + ': ' + bits.join(' · ') + '.';
  }
  function renderRaces(){
    var p = $('panel-races'); p.innerHTML = '';
    var races = ofType('race'), duels = ofType('duel');
    if (!races.length && !duels.length) return empty(p, 'No races this week', 'Races open with the week\'s odds.');
    if (races.length) {
      p.appendChild(el('h2', 'bk-h3', 'Rank races'));
      p.appendChild(el('p', 'bk-note', 'Will one fortune pass the one just above it by Friday\'s close? Based on tracked stock wealth: share counts from SEC filings times the closing price.'));
      list(p, races.map(function(ev){
        var art = card(ev), P = ev.params || {};
        var nl = nowLine(P, [P.chaser, P.leader]); if (nl) art.appendChild(el('p', 'bk-ev__foot', nl));
        var g = el('div', 'bk-ladder'); g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
        ev.selections.forEach(function(s){ g.appendChild(oddBtn(s, s.label)); });
        art.appendChild(g);
        foot(art, ev); rule(art, ev);
        return art;
      }));
    }
    if (duels.length) {
      p.appendChild(el('h2', 'bk-h3', 'Dollar duels'));
      p.appendChild(el('p', 'bk-note', 'Whose tracked stock wealth gains more dollars this week (or loses less)? "To win": pick the bigger gain. "By $X+": that person has to win by more than that amount.'));
      list(p, duels.map(function(ev){
        var art = card(ev), P = ev.params || {};
        var nl = nowLine(P, [P.a, P.b]); if (nl) art.appendChild(el('p', 'bk-ev__foot', nl));
        var lines = [];
        ev.selections.forEach(function(s){ if (s.market === 'by' && lines.indexOf(Number(s.line)) < 0) lines.push(Number(s.line)); });
        lines.sort(function(a, b){ return a - b; });
        var g = el('div', 'bk-grid bk-grid--duel');
        g.style.gridTemplateColumns = 'minmax(0,1fr) repeat(' + (1 + lines.length) + ', minmax(64px,auto))';
        g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', 'ev-' + cssId(ev.id));
        g.appendChild(el('span', 'bk-grid__h', 'Person')); g.appendChild(el('span', 'bk-grid__h', 'To win'));
        lines.forEach(function(x){ g.appendChild(el('span', 'bk-grid__h', 'By $' + x + 'B+')); });
        [P.a, P.b].forEach(function(slug){
          var ml = sel(ev, 'ml', slug);
          g.appendChild(el('span', 'bk-grid__name', personName(slug)));
          g.appendChild(ml ? oddBtn(ml) : el('span'));
          lines.forEach(function(x){
            var s = ev.selections.filter(function(y){ return y.market === 'by' && y.person === slug && Number(y.line) === x; })[0];
            g.appendChild(s ? oddBtn(s) : el('span'));
          });
        });
        art.appendChild(g);
        foot(art, ev); rule(art, ev);
        return art;
      }));
    }
  }

  function renderPanels(){
    var st = $('bookstatus');
    if (S.loadErr) { st.textContent = S.loadErr; st.className = 'g-msg bk-status g-msg--bad'; }
    else if (!S.file) { st.textContent = 'Loading the odds…'; st.className = 'g-msg bk-status'; }
    else {
      st.className = 'g-msg bk-status';
      var nx = nextClose();
      st.textContent = 'Week of ' + monDay(S.file.start) + ' · ' + (Date.parse(S.file.locksAt) > Date.now() ? 'weekly betting locks ' + nyTime(S.file.locksAt)
        : nx ? 'weekly betting closed; next close ' + nyTime(nx) : 'betting closed') +
        (S.source === 'file' ? ' · published odds' : ' · live odds');
    }
    renderBlasts(); renderLadders(); renderRaces(); renderMatchups(); renderPlayer(); renderFutures(); renderProps();
    renderHead();
  }

  // ---------- slip ----------
  function togglePick(id){
    var s = S.bySel[id]; if (!s) return;
    var i = inSlip(id);
    S.msg = ''; S.msgBad = false;
    if (i >= 0) S.slip.splice(i, 1);
    else {
      // one pick per event: a new pick replaces the old one from the same event
      var same = -1;
      for (var k = 0; k < S.slip.length; k++) if (S.slip[k].eventId === s.eventId) same = k;
      if (same >= 0) S.slip.splice(same, 1);
      else if (S.slip.length >= LIM.maxLegs) { S.msg = 'The slip holds up to ' + LIM.maxLegs + ' picks.'; S.msgBad = true; renderSlip(); announce(S.msg); return; }
      var ev = S.byEvent[s.eventId];
      S.slip.push({ id: s.id, eventId: s.eventId, eventTitle: ev ? ev.title : '', label: pickText(s), american: s.american, decimal: s.decimal });
    }
    if (S.slip.length < 2) S.mode = 'single';
    else if (i < 0 && S.slip.length === 2 && !S.modeTouched) S.mode = 'parlay';
    persistSlip(); syncPressed(); renderSlip(); renderBar();
    announce(S.slip.length ? summaryText() : 'Bet slip is empty.');
  }
  function stakeVal(){ var v = Number(S.stake); return isFinite(v) ? Math.floor(v) : 0; }
  function parlayDec(){ var d = 1; S.slip.forEach(function(p){ d *= p.decimal; }); return d; }
  function totals(){
    var st = stakeVal(), n = S.slip.length;
    if (!n) return { stake: 0, payout: 0, win: 0, bets: 0 };
    if (S.mode === 'parlay' && n > 1) { var pay = payoutOf(st, parlayDec()); return { stake: st, payout: pay, win: pay - st, bets: 1, dec: parlayDec() }; }
    var tp = 0; S.slip.forEach(function(p){ tp += payoutOf(st, p.decimal); });
    return { stake: st * n, payout: tp, win: tp - st * n, bets: n };
  }
  // the most each bet in the slip may stake: combined odds for a parlay, the longest single otherwise
  function slipCap(){
    if (!S.slip.length) return LIM.maxStake;
    if (S.mode === 'parlay' && S.slip.length > 1) return capFor(parlayDec());
    var cap = LIM.maxStake;
    S.slip.forEach(function(p){ cap = Math.min(cap, capFor(p.decimal)); });
    return cap;
  }
  function capHint(){
    var cap = slipCap(), n = S.slip.length, parlay = S.mode === 'parlay' && n > 1;
    var tail = ' The most a bet pays back is ' + num(LIM.maxPayout) + '.';
    if (cap >= LIM.maxStake) return LIM.minStake + ' to ' + LIM.maxStake + ' coins per bet.' + tail;
    return (parlay ? 'Long-shot parlay: ' : n > 1 ? 'Long shot in the slip: ' : 'Long shot: ') + 'the most you can stake is ' + cap + ' coins' +
      (!parlay && n > 1 ? ' per bet' : '') + ' (' + (cap <= 50 ? 'odds of +2000 or longer' : 'odds of +500 or longer') + ').' + tail;
  }
  function problem(){
    var st = stakeVal(), t = totals();
    if (!S.slip.length) return 'Add a pick to start.';
    if (!(Number(S.stake) >= LIM.minStake)) return 'Enter a stake of at least ' + LIM.minStake + ' coin.';
    if (st > LIM.maxStake) return 'The most you can stake on one bet is ' + LIM.maxStake + ' coins.';
    var cap = slipCap();
    if (st > cap) return 'Long shots are capped at ' + cap + ' coins.';
    if (playing() && t.stake > Number(acct.me.coins)) return 'You have ' + num(acct.me.coins) + ' coins' + (t.bets > 1 ? ' (these ' + t.bets + ' bets need ' + num(t.stake) + ').' : '.');
    return '';
  }
  function summaryText(){
    var t = totals(), n = S.slip.length;
    if (!n) return 'Bet slip is empty.';
    var head = n + (n === 1 ? ' pick' : ' picks') + (S.mode === 'parlay' && n > 1 ? ', parlay ' + amSpoken(decToAm(t.dec)) : n > 1 ? ', ' + n + ' single bets' : '');
    return head + '. Stake ' + num(t.stake) + ', to win ' + num(t.win) + ', payout ' + num(t.payout) + ' coins.';
  }
  var liveTimer = null;
  function announce(text){
    var r = $('sliplive'); if (!r) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function(){ r.textContent = text; }, 350);
  }

  function renderSlip(){
    var box = $('slip');
    var act = document.activeElement, keep = act && box.contains(act) && act.id ? act.id : null;
    box.innerHTML = '';
    var head = el('div', 'g-card__head');
    head.appendChild(el('h2', 'g-card__title', 'Bet slip'));
    var n = S.slip.length;
    if (n) {
      var clr = el('button', 'g-link', 'Clear'); clr.type = 'button'; clr.id = 'slipclear';
      clr.setAttribute('aria-label', 'Clear all ' + n + ' picks');
      clr.addEventListener('click', function(){ S.slip = []; S.mode = 'single'; S.msg = ''; persistSlip(); syncPressed(); renderSlip(); renderBar(); announce('Bet slip cleared.'); });
      head.appendChild(clr);
    } else head.appendChild(el('span', 'g-card__kicker', 'Empty'));
    box.appendChild(head);
    if (!n) {
      box.appendChild(el('p', 'bk-slip__empty', 'Tap any price to add it here. Combine 2 to 4 picks from different events into a parlay.'));
      if (S.msg) { var m0 = el('p', 'g-msg' + (S.msgBad ? ' g-msg--bad' : ''), S.msg); box.appendChild(m0); }
      restore(keep);
      return;
    }
    // picks
    var ul = el('ul', 'bk-slip__list'); ul.setAttribute('aria-label', 'Picks');
    S.slip.forEach(function(p, i){
      var li = el('li', 'bk-leg' + (p.changed ? ' is-changed' : ''));
      var tx = el('div', 'bk-leg__text');
      tx.appendChild(el('span', 'bk-leg__ev', p.eventTitle));
      tx.appendChild(el('span', 'bk-leg__pick', p.label));
      li.appendChild(tx);
      li.appendChild(el('span', 'bk-leg__odds', am(p.american)));
      var rm = btn('g-btn g-btn--icon', '×'); rm.id = 'rm-' + i;
      rm.setAttribute('aria-label', 'Remove ' + p.label);
      rm.addEventListener('click', function(){ togglePick(p.id); var next = $('rm-' + Math.min(i, S.slip.length - 1)) || $('slipclear') || $('tab-' + S.tab); if (next) next.focus(); });
      li.appendChild(rm);
      var lc = capFor(p.decimal);
      if (lc < LIM.maxStake && !(S.mode === 'parlay' && n > 1)) li.appendChild(el('span', 'bk-leg__cap', 'Long shot · max ' + lc + ' coins'));
      if (p.changed) li.appendChild(el('span', 'bk-leg__moved', 'Odds moved' + (p.prev != null ? ' from ' + am(p.prev) : '') + ' to ' + am(p.american) + '.'));
      ul.appendChild(li);
    });
    box.appendChild(ul);

    // single / parlay
    var fs = el('fieldset', 'bk-mode');
    fs.appendChild(el('legend', null, 'Bet type'));
    [['single', n > 1 ? n + ' singles' : 'Single'], ['parlay', 'Parlay']].forEach(function(m){
      var lab = el('label'); var r = el('input'); r.type = 'radio'; r.name = 'betmode'; r.value = m[0]; r.id = 'mode-' + m[0];
      r.checked = S.mode === m[0]; if (m[0] === 'parlay' && n < 2) r.disabled = true;
      r.addEventListener('change', function(){ if (r.checked) { S.mode = m[0]; S.modeTouched = true; persistSlip(); renderSlip(); renderBar(); announce(summaryText()); } });
      lab.appendChild(r); lab.appendChild(document.createTextNode(m[1]));
      lab.appendChild(el('small', null, m[0] === 'parlay' ? (n > 1 ? am(decToAm(parlayDec())) : '2+ picks') : (n > 1 ? 'stake each' : am(S.slip[0].american))));
      fs.appendChild(lab);
    });
    box.appendChild(fs);

    // stake
    var sk = el('div', 'bk-stake');
    var lab = el('label', 'g-label', S.mode === 'parlay' || n === 1 ? 'Stake (coins)' : 'Stake per bet (coins)'); lab.htmlFor = 'stake';
    var inp = el('input', 'g-input g-num'); inp.id = 'stake'; inp.type = 'number'; inp.min = '1'; inp.max = String(slipCap()); inp.step = '1';
    inp.inputMode = 'numeric'; inp.value = S.stake; inp.setAttribute('aria-describedby', 'stakehint slipmsg');
    sk.appendChild(lab); sk.appendChild(inp);
    var chips = el('div', 'bk-chips');
    [10, 50, 100, 'max'].forEach(function(v){
      var c = btn('g-btn', v === 'max' ? 'Max' : String(v));
      c.setAttribute('aria-label', v === 'max' ? 'Stake the most allowed' : 'Stake ' + v + ' coins');
      c.addEventListener('click', function(){
        var val = v;
        if (v === 'max') {
          var per = S.mode === 'parlay' && n > 1 ? 1 : n;
          var bal = playing() ? Number(acct.me.coins) : LIM.maxStake * per;
          val = Math.max(1, Math.min(slipCap(), Math.floor(bal / per)));
        }
        inp.value = String(val); S.stake = String(val); persistSlip(); update(); inp.focus();
      });
      chips.appendChild(c);
    });
    sk.appendChild(chips);
    var hint = el('p', 'g-hint', capHint()); hint.id = 'stakehint'; sk.appendChild(hint);
    box.appendChild(sk);

    // totals
    var sum = el('div', 'bk-sum');
    var a = el('div'); a.appendChild(el('span', 'g-stat__label', 'Total stake')); var aN = el('span', 'g-stat__num g-num'); a.appendChild(aN);
    var w = el('div', 'bk-sum__win'); w.appendChild(el('span', 'g-stat__label', 'To win')); var wN = el('span', 'g-stat__num g-num'); w.appendChild(wN);
    sum.appendChild(a); sum.appendChild(w);
    box.appendChild(sum);
    var payLine = el('p', 'bk-slip__fine'); box.appendChild(payLine);

    // action
    var ft = el('div', 'bk-slip__foot');
    var msg = el('p', 'g-msg'); msg.id = 'slipmsg'; msg.setAttribute('role', 'status');
    var go = btn('g-btn g-btn--primary g-btn--block'); go.id = 'placebet';
    ft.appendChild(go); ft.appendChild(msg);
    ft.appendChild(el('p', 'bk-slip__fine', 'Play money only. The odds you place at are the odds you get; if they move first, we\'ll ask you to review.'));
    box.appendChild(ft);

    function update(){
      var t = totals(), pr = problem();
      aN.textContent = num(t.stake); wN.textContent = num(t.win);
      payLine.textContent = 'Payout if ' + (S.mode === 'parlay' && n > 1 ? 'every pick wins' : 'every bet wins') + ': ' + num(t.payout) + ' coins' +
        (S.mode === 'parlay' && n > 1 ? ' (odds ' + am(decToAm(t.dec)) + ')' : '') + (t.payout >= LIM.maxPayout ? ' · capped at ' + num(LIM.maxPayout) : '') + '.';
      if (pr) inp.setAttribute('aria-invalid', /stake|capped/i.test(pr) ? 'true' : 'false'); else inp.removeAttribute('aria-invalid');
      if (S.busy) { go.textContent = 'Placing…'; go.disabled = true; }
      else if (!acct.enabled) { go.textContent = acct.loading ? 'Loading…' : 'Online betting coming soon'; go.disabled = true; }
      else if (!playing()) { go.textContent = 'Play online to bet'; go.disabled = false; }
      else { go.textContent = t.bets > 1 ? 'Place ' + t.bets + ' bets' : (S.mode === 'parlay' && n > 1 ? 'Place parlay' : 'Place bet'); go.disabled = !!pr; }
      var text = '', bad = false;
      if (S.msg) { text = S.msg; bad = S.msgBad; }
      else if (pr) { text = pr; bad = true; }
      else if (!playing() && acct.enabled) text = 'Anyone can build a slip. To place it, press Play online above and pick a nickname.';
      msg.className = 'g-msg' + (bad ? ' g-msg--bad' : '');
      msg.textContent = text;
      renderBar();
    }
    inp.addEventListener('input', function(){ S.stake = inp.value; S.msg = ''; S.msgBad = false; persistSlip(); update(); announce(summaryText()); });
    go.addEventListener('click', function(){
      if (!playing()) { goPlayOnline(); return; }
      place();
    });
    update();
    restore(keep);
  }
  function restore(id){ if (id && $(id)) $(id).focus(); }
  function goPlayOnline(){
    closeSheet(false);
    var acctBox = $('gameaccount');
    if (acctBox && acctBox.scrollIntoView) acctBox.scrollIntoView({ block: 'center', behavior: BD.reducedMotion() ? 'auto' : 'smooth' });
    var b = $('gx-play') || $('gx-nick');
    if (b) b.focus();
    S.msg = 'Press Play online above (a guest account, no email) and pick a nickname. Your slip stays here.'; S.msgBad = false;
    renderSlip();
  }

  // ---------- placing ----------
  function place(){
    var pr = problem(); if (pr || S.busy) return;
    var stake = stakeVal(), picks = S.slip.slice(), parlay = S.mode === 'parlay' && picks.length > 1;
    S.busy = true; S.msg = ''; S.msgBad = false; renderSlip();
    var placed = [], total = 0;
    function done(err){
      S.busy = false;
      // placed singles leave the slip
      S.slip = S.slip.filter(function(p){ return placed.indexOf(p.id) < 0; });
      if (!S.slip.length) S.mode = 'single';
      persistSlip(); syncPressed();
      S.bets = null;
      var after = BDAccount.refresh();
      if (err) {
        var m = (err && err.message) || 'Could not place the bet.';
        if (/Odds changed/i.test(m)) {
          return refreshOdds().then(function(){
            S.msg = 'Odds changed — review your slip. The new prices are marked; press place again to accept them.'; S.msgBad = true;
            renderPanels(); renderSlip(); toast('Odds changed — review your slip', true); announce(S.msg);
            var f = $('placebet'); if (f && sheetOpen()) f.focus();
          });
        }
        if (/closed|no longer available/i.test(m)) refreshOdds().then(function(){ renderPanels(); renderSlip(); });
        S.msg = (placed.length ? placed.length + ' bet' + (placed.length > 1 ? 's' : '') + ' placed. ' : '') + m; S.msgBad = true;
        renderSlip(); toast(m, true); announce(S.msg);
        return after;
      }
      var text = parlay ? 'Parlay placed: ' + picks.length + ' picks, ' + num(stake) + ' coins to win ' + num(total - stake) + '.'
        : (placed.length > 1 ? placed.length + ' bets placed, ' + num(stake * placed.length) + ' coins to win up to ' + num(total - stake * placed.length) + '.'
          : 'Bet placed: ' + picks[0].label + ', ' + num(stake) + ' coins to win ' + num(total - stake) + '.');
      S.msg = text; S.msgBad = false;
      renderSlip(); renderBar(); toast(text); announce(text);
      if (!S.slip.length) closeSheet(true);
      if (S.tab === 'mybets') loadMyBets();
      return after;
    }
    if (parlay) {
      BDGame.placeBet(picks.map(function(p){ return p.id; }), stake, picks.map(function(p){ return p.decimal; }))
        .then(function(r){ placed = picks.map(function(p){ return p.id; }); total = r.potential_payout; done(); }, done);
      return;
    }
    var i = 0;
    (function next(){
      if (i >= picks.length) return done();
      var p = picks[i++];
      BDGame.placeBet([p.id], stake, [p.decimal]).then(function(r){ placed.push(p.id); total += r.potential_payout; next(); }, done);
    })();
  }
  // re-read the prices of the picks in the slip (and the book) after the server refused a price
  function refreshOdds(){
    if (!BDGame.bookSelections || !S.slip.length) return loadLive();
    return BDGame.bookSelections(S.slip.map(function(p){ return p.id; })).then(function(rows){
      var seen = {};
      (rows || []).forEach(function(r){
        seen[r.id] = true;
        var s = S.bySel[r.id];
        if (s) { s.american = Number(r.american_odds); s.decimal = Number(r.decimal_odds); s.result = r.result || null; }
      });
      S.slip.forEach(function(p){
        var s = S.bySel[p.id];
        if (!seen[p.id] || !s) { p.gone = true; return; }
        if (s.decimal !== p.decimal) { p.prev = p.american; p.american = s.american; p.decimal = s.decimal; p.changed = true; }
      });
      S.slip = S.slip.filter(function(p){ return !p.gone; });
      persistSlip();
      return loadLive();
    }, function(){ return loadLive(); }).then(function(){ reconcileSlip(); });
  }

  // ---------- phone bar + bottom sheet ----------
  var mq = window.matchMedia ? window.matchMedia('(max-width: 999px)') : { matches: false, addListener: function(){} };
  var sheet = $('slipsheet'), panel = $('sheetpanel'), opener = null;
  function renderBar(){
    var bar = $('slipbar'), n = S.slip.length;
    bar.hidden = !n;
    document.getElementById('app').classList.toggle('has-slip', !!n);
    document.body.classList.toggle('has-bottombar', !!n && mq.matches);
    if (!n) { if (sheetOpen()) closeSheet(false); return; }
    var t = totals();
    $('slipbarmain').textContent = n + (n === 1 ? ' pick' : ' picks') + ' · ' +
      (S.mode === 'parlay' && n > 1 ? 'Parlay ' + am(decToAm(t.dec)) : (n === 1 ? am(S.slip[0].american) : n + ' singles')) +
      (t.win > 0 ? ' · to win ' + num(t.win) : '');
  }
  function sheetOpen(){ return !sheet.hidden; }
  function openSheet(from){
    opener = from || document.activeElement;
    $('sheetbody').appendChild($('slip'));
    $('sheetbody').className = 'g-drawer__body bk-sheet';
    sheet.hidden = false;
    document.documentElement.classList.add('g-lock');
    $('slipbarsum').setAttribute('aria-expanded', 'true');
    renderSlip();
    panel.focus();
  }
  function closeSheet(restoreFocus){
    if (!sheetOpen()) return;
    sheet.hidden = true;
    document.documentElement.classList.remove('g-lock');
    $('slipslot').appendChild($('slip'));
    $('slipbarsum').setAttribute('aria-expanded', 'false');
    if (restoreFocus === false) return;
    if (opener && document.contains(opener) && opener.getClientRects().length) opener.focus();
    else if (!$('slipbar').hidden) $('slipbarsum').focus();
    else $('tab-' + S.tab).focus();
  }
  $('slipbarsum').addEventListener('click', function(){ openSheet(this); });
  $('slipbaropen').addEventListener('click', function(){ openSheet(this); });
  sheet.addEventListener('click', function(e){ if (e.target.closest && e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', function(e){
    if (!sheetOpen()) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
    if (!f.length) { e.preventDefault(); panel.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  function onMq(){ if (!mq.matches && sheetOpen()) closeSheet(false); renderBar(); }
  if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);

  // ---------- my bets ----------
  function loadMyBets(){
    var p = $('panel-mybets');
    if (acct.loading) { p.innerHTML = ''; p.appendChild(el('p', 'g-msg', 'Loading…')); return; }
    if (!playing()) { renderMyBets(); return; }
    if (S.betsLoading) return;
    S.betsLoading = true;
    Promise.all([BDGame.myBets(100), S.week ? BDGame.bookLeaderboard(S.week, 10).then(null, function(){ return []; }) : Promise.resolve([])]).then(function(r){
      S.bets = r[0] || []; S.board = r[1] || []; S.betsErr = '';
    }, function(e){ S.betsErr = 'Could not load your bets. ' + e.message; }).then(function(){ S.betsLoading = false; renderMyBets(); });
    if (S.boardMode === 'season') loadSeason();
  }
  function loadSeason(){
    if (S.seasonLoading || !BDGame.bookSeasonLeaderboard) return;
    S.seasonLoading = true; S.seasonErr = '';
    BDGame.bookSeasonLeaderboard(20).then(function(rows){ S.season = rows || []; }, function(e){ S.seasonErr = 'Could not load the season table. ' + ((e && e.message) || ''); })
      .then(function(){ S.seasonLoading = false; if (S.tab === 'mybets') renderMyBets(); });
  }
  function signed(n){ n = Number(n) || 0; return (n > 0 ? '+' : n < 0 ? MINUS : '') + num(Math.abs(n)); }
  function roiText(r){ if (r == null || !isFinite(Number(r))) return '—'; var v = Number(r) * 100; return (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(1) + '%'; }
  // "Top bettors": this week (book_leaderboard) or the season (book_season_leaderboard)
  function renderBoard(p){
    var season = S.boardMode === 'season';
    p.appendChild(el('h2', 'bk-h3', 'Top bettors'));
    var tg = el('div', 'bk-toggle'); tg.setAttribute('role', 'group'); tg.setAttribute('aria-label', 'Leaderboard period');
    [['week', 'This week'], ['season', 'Season']].forEach(function(m){
      var b = btn('bk-toggle__btn', m[1]); b.id = 'board-' + m[0];
      b.setAttribute('aria-pressed', S.boardMode === m[0] ? 'true' : 'false');
      b.addEventListener('click', function(){
        if (S.boardMode === m[0]) return;
        S.boardMode = m[0];
        if (m[0] === 'season' && !S.season) loadSeason();
        renderMyBets();
        var f = $('board-' + m[0]); if (f) f.focus();
      });
      tg.appendChild(b);
    });
    p.appendChild(tg);
    var rows = season ? S.season : S.board;
    if (season && S.seasonErr) { p.appendChild(el('p', 'g-msg g-msg--bad', S.seasonErr)); return; }
    if (season && !rows) { p.appendChild(el('p', 'g-msg', 'Loading the season table…')); return; }
    if (!rows || !rows.length) {
      p.appendChild(el('p', 'g-msg', season ? 'No one has 10 settled bets yet. The season table lists players with 10 or more.' : 'No settled bets this week yet.'));
      return;
    }
    var wrap = el('div', 'g-table-wrap bk-board');
    var t = el('table', 'g-table gp-board');
    t.appendChild(el('caption', null, season
      ? 'Season: net coins from settled bets (payouts minus stakes) and return on stake (net divided by coins staked). Players with 10 or more settled bets. Nicknames only.'
      : 'Net coins won from settled bets this week (payouts minus stakes). Nicknames only.'));
    var th = el('thead'), tr = el('tr');
    (season ? ['#', 'Player', 'Bets', 'Net', 'ROI'] : ['#', 'Player', 'Bets', 'Net']).forEach(function(h){ var c = el('th', null, h); c.scope = 'col'; tr.appendChild(c); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function(r){
      var row = el('tr', r.is_me ? 'is-me' : null);
      row.appendChild(el('td', 'gp-rank', String(r.rank)));
      var nm = el('th', null, r.nickname); nm.scope = 'row'; if (r.is_me) nm.appendChild(el('span', 'gp-you', 'You')); row.appendChild(nm);
      row.appendChild(el('td', 'g-num', num(r.bets)));
      var net = Number(r.net); row.appendChild(el('td', 'g-num ' + (net > 0 ? 'g-up' : net < 0 ? 'g-down' : ''), signed(net)));
      if (season) { var roi = Number(r.roi); row.appendChild(el('td', 'g-num ' + (roi > 0 ? 'g-up' : roi < 0 ? 'g-down' : ''), roiText(r.roi))); }
      tb.appendChild(row);
    });
    t.appendChild(tb); wrap.appendChild(t); p.appendChild(wrap);
  }
  function resultWord(r){ return r === 'win' ? 'Won' : r === 'lose' ? 'Lost' : r === 'void' ? 'Void' : 'Open'; }
  function betCard(b){
    var art = el('article', 'g-card bk-bet');
    var head = el('div', 'bk-bet__head');
    var legs = b.legs || [];
    head.appendChild(el('span', 'bk-bet__kind', b.is_parlay ? 'Parlay · ' + legs.length + ' picks' : 'Single'));
    var st = b.status === 'won' ? 'Won' : b.status === 'lost' ? 'Lost' : b.status === 'void' ? 'Void (refunded)' : 'Open';
    head.appendChild(el('span', 'bk-res bk-res--' + b.status, st));
    art.appendChild(head);
    var money = el('p', 'bk-bet__money');
    money.appendChild(document.createTextNode('Stake '));
    money.appendChild(el('b', 'g-num', num(b.stake)));
    if (b.status === 'open') { money.appendChild(document.createTextNode(' · to win ')); money.appendChild(el('b', 'g-num', num(b.potential_payout - b.stake))); money.appendChild(document.createTextNode(' · payout ' + num(b.potential_payout))); }
    else { money.appendChild(document.createTextNode(' · paid back ')); money.appendChild(el('b', 'g-num', num(b.payout || 0))); var net = (b.payout || 0) - b.stake; money.appendChild(document.createTextNode(' (' + (net > 0 ? '+' : net < 0 ? MINUS : '') + num(Math.abs(net)) + ')')); }
    money.appendChild(document.createTextNode(' · ' + nyTime(b.created_at)));
    art.appendChild(money);
    var ul = el('ul', 'bk-bet__legs');
    legs.forEach(function(l){
      var li = el('li');
      li.appendChild(el('span', null, l.event_title + ': ' + l.label + ' (' + am(l.american_odds) + ')'));
      li.appendChild(el('span', 'bk-res bk-res--' + (l.result || 'open'), resultWord(l.result)));
      ul.appendChild(li);
    });
    art.appendChild(ul);
    return art;
  }
  function renderMyBets(){
    var p = $('panel-mybets'); p.innerHTML = '';
    if (!acct.enabled) { empty(p, 'Online betting is coming soon', 'You can browse the odds and build a slip now.'); return; }
    if (!playing()) {
      var d = el('div', 'g-empty');
      d.appendChild(el('h2', 'g-empty__title', 'Play online to see your bets'));
      d.appendChild(el('p', null, 'Start a guest account (no email or password) and pick a nickname. Everyone starts with 1,000 play-money coins.'));
      var b = btn('g-btn g-btn--primary', 'Play online'); b.addEventListener('click', goPlayOnline); d.appendChild(b);
      p.appendChild(d); return;
    }
    if (S.betsErr) { p.appendChild(el('p', 'g-msg g-msg--bad', S.betsErr)); return; }
    if (!S.bets) { p.appendChild(el('p', 'g-msg', 'Loading your bets…')); return; }
    var open = S.bets.filter(function(b){ return b.status === 'open'; }), done = S.bets.filter(function(b){ return b.status !== 'open'; });
    p.appendChild(el('h2', 'bk-h3', 'Open bets (' + open.length + ')'));
    if (!open.length) p.appendChild(el('p', 'g-msg', 'No open bets. Tap a price to start a slip.'));
    else { var u1 = el('ul', 'bk-bets'); open.forEach(function(b){ var li = el('li'); li.appendChild(betCard(b)); u1.appendChild(li); }); p.appendChild(u1); }
    p.appendChild(el('h2', 'bk-h3', 'Settled (' + done.length + ')'));
    if (!done.length) p.appendChild(el('p', 'g-msg', 'Nothing settled yet. Price bets settle once the closing prices are in; fantasy bets after Friday\'s scores.'));
    else { var u2 = el('ul', 'bk-bets'); done.forEach(function(b){ var li = el('li'); li.appendChild(betCard(b)); u2.appendChild(li); }); p.appendChild(u2); }
    renderBoard(p);
  }

  // ---------- start ----------
  var live = el('p', 'g-sr'); live.id = 'sliplive'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  document.getElementById('app').appendChild(live);
  var first = tabFromHash() || load('bd-book-tab', 'blasts');
  setTab(first, false, !!tabFromHash());
  renderSlip(); renderBar();
  loadFile().then(null, function(){ S.loadErr = 'The odds for the next week are not published yet. They appear after the weekend data run.'; })
    .then(function(){ renderPanels(); renderSlip(); renderBar(); });
  if (window.BDAccount) {
    BDAccount.onChange(function(s){
      acct = s;
      var go = function(){ return loadLive().then(function(){ renderPanels(); syncPressed(); renderSlip(); renderBar(); S.season = null; if (S.tab === 'mybets') { S.bets = null; loadMyBets(); } }); };
      if (S.file) go(); else setTimeout(function wait(){ if (S.file || S.loadErr) go(); else setTimeout(wait, 100); }, 100);
    });
  }
})();
