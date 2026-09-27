/* Billionaires Digest v2: the front door (index.html) — PLAY first, casino arcade. ES5, IIFE, UI only.
   Real data only, each block on its own (one failing never blanks the others):
     hero + My team / Draft room / Scores tiles <- BDFantasyStore (assets/v2/fantasy-store.js; same browser team as team.html)
     Next Moves tile                            <- data/moves/markets.json (+ this browser's practice prices, bd-moves-v1)
     The Book tile                              <- data/book/index.json
     Leagues tile                               <- BDGame.myLeagues() only when signed in to the online game
     Today's lede                               <- digest.json (the latest edition; the full edition lives at news.html)
   Old links: index.html#person=<slug> is forwarded to news.html by a one-line script in the page head.
   Motion: one odometer roll + one bulb chase on load; none with reduced motion. Play money only, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr;
  var MINUS = '−';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var $ = function(id){ return document.getElementById(id); };

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  function reduced(){ return BD.reducedMotion(); }
  function msg(box, text){ clear(box).appendChild(el('p', 'hm-tile__msg', text)); }
  function nyFmt(ms, opts){
    try { opts.timeZone = 'America/New_York'; return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)); }
    catch (e) { return new Date(ms).toUTCString(); }
  }
  function lockText(ms){
    return nyFmt(ms, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + nyFmt(ms, { hour: 'numeric', minute: '2-digit' }) + ' ET';
  }
  function span(ms){
    var m = Math.max(0, Math.floor(ms / 60000));
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + mi + 'm';
  }
  function isoDay(s){
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : '';
  }
  var liveT = null;
  function say(t){ var n = $('live'); n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 40); }

  // ---- odometer (same component as team.html: .v2-odo in ui.css); the real value is text for screen readers ----
  function odometer(box, value, srText){
    clear(box);
    var txt = value == null ? '—' : plainTxt(value);
    box.appendChild(el('span', 'v2-sr', srText || txt));
    var vis = el('span', 'v2-odo__digits num');
    vis.setAttribute('aria-hidden', 'true');
    var strips = [];
    if (value == null){
      for (var b = 0; b < 3; b++) vis.appendChild(el('span', 'v2-odo__ch v2-odo__blank', ''));
    } else {
      for (var i = 0; i < txt.length; i++){
        var ch = txt.charAt(i);
        if (/[0-9]/.test(ch)){
          var col = el('span', 'v2-odo__col'), strip = el('span', 'v2-odo__strip');
          for (var k = 0; k < 20; k++) strip.appendChild(el('span', 'v2-odo__d', String(k % 10)));
          col.appendChild(strip); vis.appendChild(col);
          strips.push({ s: strip, to: 10 + (+ch) });
        } else vis.appendChild(el('span', 'v2-odo__ch', ch));
      }
    }
    box.appendChild(vis);
    if (reduced()){ strips.forEach(function(x){ x.s.style.transform = 'translateY(' + (-x.to) + 'em)'; }); return; }
    void vis.offsetWidth;
    strips.forEach(function(x, j){
      x.s.style.transition = 'transform ' + (1000 + j * 240) + 'ms cubic-bezier(.2,.75,.25,1.02) ' + (j * 90) + 'ms';
      x.s.style.transform = 'translateY(' + (-x.to) + 'em)';
    });
  }
  function chaseBulbs(){
    if (reduced()) return;
    var rows = document.querySelectorAll('.hm-hero .v2-bulbs');
    Array.prototype.forEach.call(rows, function(r){ r.classList.add('is-chasing'); });
    setTimeout(function(){ Array.prototype.forEach.call(rows, function(r){ r.classList.remove('is-chasing'); }); }, 3800);
  }

  // ---- which team this browser has (same rules as team.html, plus an unsaved working draft) ----
  // scoring: the team in the current/latest locked week (practice week: the working draft)
  // upcoming: no scoring team, but one is saved for the draft week
  // draft: only an unsaved working draft with at least one pick; none: nothing at all
  function view(){
    var S = F.state, wk = S.sbWk, team = wk ? F.matchTeam(wk) : null;
    if (team){
      var res = F.teamWeek(wk, team);
      return { mode: 'scoring', wk: wk, team: team, res: res, any: res.scored.length > 0 };
    }
    var saved = F.store().teams[S.draftWeek];
    if (saved && saved.picks && S.draftWk) return { mode: 'upcoming', wk: S.draftWk, weekId: S.draftWeek, team: saved, res: null, any: false };
    var d = F.store().draft;
    if (d && arr(d.picks).length) return { mode: 'draft', wk: null, team: { picks: arr(d.picks), captain: d.captain || null }, res: null, any: false };
    return { mode: 'none', wk: null, team: null, res: null, any: false };
  }
  function bench(v){ return v.mode === 'scoring' && v.any && v.wk.benchmarks && typeof v.wk.benchmarks.spy === 'number' ? v.wk.benchmarks.spy : null; }
  // result lamp in words (never color alone)
  function lamp(v){
    if (v.mode === 'draft') return { word: 'Draft in progress', cls: 'is-off' };
    if (v.mode === 'upcoming') return { word: 'Ready', cls: 'is-off' };
    if (!v.any) return { word: 'Waiting for scores', cls: 'is-off' };
    var bm = bench(v);
    if (bm == null) return { word: 'No benchmark yet', cls: 'is-off' };
    var diff = v.res.total - bm, over = F.weekOver(v.wk);
    if (diff > 0) return { word: over ? 'Win' : 'Leading', cls: 'is-win' };
    if (diff < 0) return { word: over ? 'Loss' : 'Trailing', cls: 'is-loss' };
    return { word: 'Tied', cls: 'is-off' };
  }
  function weekLabel(v){
    if (v.mode === 'scoring') return F.fmt.weekTitle(v.wk.week);
    if (v.mode === 'upcoming') return F.fmt.weekTitle(v.weekId);
    return F.state.draftWeek ? F.fmt.weekTitle(F.state.draftWeek) : '';
  }
  function captainName(v){
    var c = v.team && v.team.captain;
    if (!c) return null;
    var p = F.person(c);
    return p && p.name ? p.name : null;
  }

  // ---- hero ----
  function heroButtonsNew(box){
    var row = el('div', 'v2-btnrow hm-hero__btns');
    row.appendChild(link('v2-btn v2-btn--gold v2-btn--big', 'Draft your five', 'draft.html'));
    row.appendChild(link('v2-btn v2-btn--secondary v2-btn--big', 'Lucky five', 'draft.html#lucky'));
    box.appendChild(row);
    box.appendChild(el('p', 'hm-hero__small', 'Lucky five spins a random team that fits the cap. It opens in the Draft room and never saves by itself.'));
  }
  function renderHero(v){
    var box = clear($('hmteam'));
    box.removeAttribute('aria-busy');
    if (v.mode === 'none'){
      box.classList.add('is-new');
      box.appendChild(el('p', 'hm-hero__lead', 'No team in this browser yet. Pick five, name a captain, and your team scores every trading day.'));
      heroButtonsNew(box);
      say('Play the billionaires. No team yet.');
      return null;
    }
    box.classList.remove('is-new');
    var jp = el('div', 'hm-jp');
    var top = el('div', 'hm-jp__top');
    var wl = weekLabel(v);
    top.appendChild(el('span', 'v2-kicker', 'Your team' + (wl ? ' · ' + wl : '')));
    // the kicker already says "Practice week"; real weeks get a Final / Live pill
    if (v.mode === 'scoring' && !v.wk.practice) top.appendChild(F.weekOver(v.wk) ? el('span', 'v2-pill', 'Final') : el('span', 'v2-pill v2-pill--live', 'Live'));
    jp.appendChild(top);

    var grid = el('div', 'hm-jp__grid');
    var total = v.any ? v.res.total : null;
    var meter = el('div', 'hm-jp__meter');
    meter.appendChild(el('span', 'hm-jp__k', 'Team total · fantasy points'));
    var odo = el('div', 'v2-odo v2-odo--mid v2-odo--gold ' + (total == null ? 'v2-zero' : numCls(total)));
    meter.appendChild(odo);
    grid.appendChild(meter);
    var L = lamp(v);
    var lb = el('div', 'v2-lamp hm-jp__lamp ' + L.cls);
    lb.appendChild(el('span', 'v2-lamp__k', 'Vs S&P 500'));
    lb.appendChild(el('span', 'v2-lamp__word', L.word));
    grid.appendChild(lb);
    jp.appendChild(grid);

    var bits = [];
    var bm = bench(v);
    if (bm != null) bits.push(signedTxt(total - bm) + ' vs the S&P 500 (it scored ' + plainTxt(bm) + ')');
    else if (v.mode === 'draft') bits.push(v.team.picks.length + ' of ' + C.PICKS + ' picked, not saved yet');
    else if (v.mode === 'upcoming') bits.push('Saved. Scoring starts when the week opens.');
    else if (!v.any) bits.push('The first scores arrive after the market closes.');
    var cap = captainName(v);
    bits.push(cap ? 'Captain: ' + cap : 'No captain yet');
    jp.appendChild(el('p', 'hm-jp__line', bits.join(' · ')));

    var row = el('div', 'v2-btnrow');
    row.appendChild(link('v2-btn v2-btn--gold v2-btn--big', 'Open My team', 'team.html'));
    if (v.mode === 'draft') row.appendChild(link('v2-btn v2-btn--ghost', 'Finish your draft', 'draft.html'));
    jp.appendChild(row);
    box.appendChild(jp);
    odometer(odo, total, total == null ? 'No team points yet' : 'Team total: ' + plainTxt(total) + ' fantasy points');
    say('Your team. ' + (total == null ? 'No team points yet.' : 'Team total ' + plainTxt(total) + ' fantasy points.') + ' Result: ' + L.word + '.');
    return L;
  }
  function heroFail(){
    var box = clear($('hmteam'));
    box.removeAttribute('aria-busy');
    box.appendChild(el('p', 'hm-hero__lead', 'The game data is not available right now, so your team cannot show here. You can still open the game.'));
    var row = el('div', 'v2-btnrow hm-hero__btns');
    row.appendChild(link('v2-btn v2-btn--gold v2-btn--big', 'Draft your five', 'draft.html'));
    row.appendChild(link('v2-btn v2-btn--ghost v2-btn--big', 'Open My team', 'team.html'));
    box.appendChild(row);
  }

  // ---- game tiles fed by the fantasy store ----
  function renderTeamTile(v){
    var box = clear($('d-team'));
    if (v.mode === 'none'){ box.appendChild(el('p', 'hm-tile__msg', 'No team yet.')); return; }
    var L = lamp(v);
    var p = el('p', 'hm-tile__big');
    if (v.any){
      p.appendChild(el('span', 'num ' + numCls(v.res.total), plainTxt(v.res.total)));
      p.appendChild(document.createTextNode(' pts · ' + L.word));
    } else p.appendChild(document.createTextNode(L.word));
    box.appendChild(p);
    var cap = captainName(v);
    box.appendChild(el('p', 'hm-tile__msg', weekLabel(v) + (cap ? ' · Captain ' + cap : '')));
  }
  var cdTimer = null;
  function renderDraftTile(){
    var S = F.state, box = clear($('d-draft'));
    if (!S.draftWeek){ msg(box, 'Lineups lock every Monday at 9:30 AM ET.'); return; }
    var info = C.weekInfo(S.draftWeek);
    var p = el('p', 'hm-tile__big');
    p.appendChild(document.createTextNode('Locks in '));
    var cd = el('span', 'num'); cd.id = 'hmcd';
    p.appendChild(cd);
    box.appendChild(p);
    box.appendChild(el('p', 'hm-tile__msg', F.fmt.weekTitle(S.draftWeek) + ' · ' + lockText(info.locksAt)));
    box.appendChild(link('hm-tile__more', 'Lucky five', 'draft.html#lucky'));
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
  }
  function tick(){
    var S = F.state, cd = $('hmcd');
    if (!cd || !S.draftWeek) return;
    var at = C.weekInfo(S.draftWeek).locksAt, t = F.now();
    cd.textContent = t >= at ? 'now (reload for the next round)' : span(at - t);
  }
  function renderScoresTile(){
    var S = F.state, box = clear($('d-scores')), wk = S.sbWk;
    if (!wk){ box.appendChild(el('p', 'hm-tile__msg', 'No scored week yet.')); }
    else {
      var t;
      if (wk.practice) t = F.weekOver(wk) ? 'Practice week · final' : 'Practice week';
      else if (F.weekOver(wk)) t = F.fmt.weekTitle(wk.week) + ' · final';
      else {
        var days = arr(wk.days).filter(function(d){ return wk.daily && wk.daily[d]; });
        t = F.fmt.weekTitle(wk.week) + (days.length ? ' · scored through ' + F.fmt.dayLabel(days[days.length - 1]) : ' · first scores after the close');
      }
      box.appendChild(el('p', 'hm-tile__big', t));
    }
    box.appendChild(link('hm-tile__more', 'Leaderboard', 'scores.html#leaderboard'));
  }
  function storeFail(){
    msg($('d-team'), 'Not available right now.');
    msg($('d-draft'), 'Lineups lock every Monday at 9:30 AM ET.');
    $('d-draft').appendChild(link('hm-tile__more', 'Lucky five', 'draft.html#lucky'));
    msg($('d-scores'), 'Not available right now.');
    $('d-scores').appendChild(link('hm-tile__more', 'Leaderboard', 'scores.html#leaderboard'));
  }

  // ---- Next Moves: open markets from data/moves/markets.json ----
  // "Now" is this browser's practice price (moves.html keeps practice trades in bd-moves-v1, LMSR); with no practice
  // trades it equals the starting odds.
  function practiceState(){
    try { var s = JSON.parse(window.localStorage.getItem('bd-moves-v1') || 'null'); return s && s.v === 1 && s.mk ? s.mk : {}; }
    catch (e) { return {}; }
  }
  function clampP(p){ p = Number(p); if (!(p > 0 && p < 1)) p = 0.5; return Math.min(0.99, Math.max(0.01, p)); }
  function pct(p){ var n = Math.round(p * 100); return Math.min(99, Math.max(1, n)) + '%'; }
  function renderMoves(data){
    var box = clear($('d-moves'));
    if (!data){ msg(box, 'Could not load the markets right now.'); return; }
    var now = Date.now(), mk = practiceState();
    var open = arr(data.markets).filter(function(m){
      return m && m.question && m.status !== 'closed' && new Date(m.closes_at).getTime() > now;
    });
    if (!open.length){ msg(box, 'No markets are open right now. New ones open as fresh SEC filings come in.'); return; }
    var p = el('p', 'hm-tile__big');
    p.appendChild(el('span', 'num', String(open.length)));
    p.appendChild(document.createTextNode(open.length === 1 ? ' open market' : ' open markets'));
    box.appendChild(p);
    var top = open.map(function(m, i){ return { m: m, i: i, t: new Date(m.closes_at).getTime() }; })
      .sort(function(a, b){ return a.t - b.t || a.i - b.i; }).slice(0, 3);
    box.appendChild(el('p', 'hm-tile__msg', 'Closing soonest:'));
    var ul = el('ul', 'hm-mv');
    top.forEach(function(x){
      var m = x.m, b = +m.b || 100, start = clampP(m.startProb), s = mk[m.slug];
      var nowP = s && typeof s.qy === 'number' && typeof s.qn === 'number' ? 1 / (1 + Math.exp((s.qn - s.qy) / b)) : start;
      var li = el('li', 'hm-mv__i');
      li.appendChild(el('span', 'hm-mv__q', m.question));
      var odds = el('span', 'hm-mv__odds');
      odds.appendChild(el('span', 'hm-mv__now num', 'Yes ' + pct(nowP)));
      odds.appendChild(el('span', 'hm-mv__start', 'started ' + pct(start)));
      li.appendChild(odds);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el('p', 'hm-tile__fine', 'Odds move with practice trades in this browser. Play-money coins, no cash value.'));
  }

  // ---- The Book: latest week from data/book/index.json ----
  function renderBook(idx){
    var box = clear($('d-book'));
    var w = idx && arr(idx.weeks).filter(function(x){ return x && x.week === idx.latest; })[0];
    if (!w){ msg(box, idx ? 'No lines posted yet.' : 'Could not load the lines right now.'); return; }
    box.appendChild(el('p', 'hm-tile__big', 'Week of ' + isoDay(w.start) + (w.end ? ' to ' + isoDay(w.end) : '')));
    var at = Date.parse(w.locksAt);
    if (isFinite(at)) box.appendChild(el('p', 'hm-tile__msg', (Date.now() < at ? 'Locks ' : 'Locked ') + lockText(at)));
  }

  // ---- Leagues: only when signed in to the online game ----
  var leagues = { who: null, state: 'idle', rows: [] };
  function renderLeagues(){
    var box = clear($('d-leagues'));
    if (!F.onlinePlaying() || !window.BDGame || !BDGame.myLeagues){ msg(box, 'Sign in to create a league or join one with a code.'); return; }
    var me = F.me();
    if (leagues.who !== me.id){ leagues.who = me.id; leagues.state = 'idle'; }
    if (leagues.state === 'idle'){
      leagues.state = 'loading';
      BDGame.myLeagues().then(function(rows){ leagues.rows = arr(rows); leagues.state = 'ok'; renderLeagues(); },
        function(){ leagues.state = 'error'; renderLeagues(); });
    }
    if (leagues.state === 'loading'){ box.appendChild(el('p', 'v2-loading', 'Loading your leagues…')); return; }
    if (leagues.state === 'error'){ msg(box, 'Could not load your leagues right now.'); return; }
    var n = leagues.rows.length;
    if (!n){ msg(box, 'You are not in a league yet.'); return; }
    var p = el('p', 'hm-tile__big');
    p.appendChild(el('span', 'num', String(n)));
    p.appendChild(document.createTextNode(n === 1 ? ' league' : ' leagues'));
    box.appendChild(p);
    box.appendChild(el('p', 'hm-tile__msg', leagues.rows.slice(0, 2).map(function(l){ return l.name; }).join(' · ')));
  }

  // ---- Today's lede (digest.json) ----
  function renderLede(d){
    var box = clear($('ledebody'));
    var lede = d && d.lede && d.lede.headline ? d.lede : null;
    var h = el('h2', 'hm-lede__h', lede ? lede.headline : "Today's edition"); h.id = 'ledeh';
    box.appendChild(h);
    if (!d){ box.appendChild(el('p', 'hm-lede__dek', "Today's edition could not load here. Open the news page to read it.")); return; }
    if (lede && lede.dek) box.appendChild(el('p', 'hm-lede__dek', lede.dek));
    if (!lede) box.appendChild(el('p', 'hm-lede__dek', 'The morning edition is on the press.'));
    if (d.date) box.appendChild(el('p', 'hm-lede__date', String(d.date)));
  }

  // ---- page ----
  var tc = F.testClock();
  if (tc != null){ var tb = $('testclock'); tb.hidden = false; tb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }

  F.onChange(function(kind){ if (kind === 'online') renderLeagues(); });
  renderLeagues();

  BD.getJson('digest.json').then(renderLede, function(){ renderLede(null); });
  BD.getJson('data/moves/markets.json').then(renderMoves, function(){ renderMoves(null); });
  BD.getJson('data/book/index.json').then(renderBook, function(){ renderBook(null); });

  F.init().then(function(){
    var v = view();
    var L = renderHero(v);
    renderTeamTile(v); renderDraftTile(); renderScoresTile();
    chaseBulbs();
    return L;
  }, function(err){
    if (window.console) console.warn(err);
    heroFail(); storeFail();
  });
})();
