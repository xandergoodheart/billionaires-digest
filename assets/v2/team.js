/* Billionaires Digest v2: My team (team.html), casino arcade (port of mockups/team-arcade.*). ES5, UI only.
   State and rules come from BDFantasyStore (assets/v2/fantasy-store.js) and BDFantasyCore. Real data only:
   when there is no team or no scored day yet, the page says so instead of showing numbers.
   Game layer uses only real or transparently derived facts:
     streak, badges  <- BDFantasyStore.pure.seasonRecord over finished real weeks you saved a team for
     XP / level      <- weeks played x100 + weeks beat the S&P 500 x50; a level every 500 XP (formula shown on the page)
     coins           <- the online game (BDFantasyStore.me()) only when signed in; otherwise "Sign in" text
   The close-up face is one made-up cartoon (portrait placeholder), never a real person. Play money only, no prizes.
   Motion (odometer roll, reel roll, bulb chase, win burst) runs once per page load; none with reduced motion. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr;
  var fmt = F.fmt;
  var MINUS = '−';
  var XP_WEEK = 100, XP_WIN = 50, XP_LEVEL = 500;
  var $ = function(id){ return document.getElementById(id); };

  // One generic, original cartoon tycoon (same drawing as the Lucky five close-up). Eyes swap to "$" when zoomed.
  var FACE = '<svg class="tm-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#D62D27"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="tm-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="tm-dollar" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="800" font-size="19" text-anchor="middle" fill="#08764A">' +
    '<text x="46" y="69">$</text><text x="74" y="69">$</text></g>' +
    '<circle cx="36" cy="80" r="5" fill="#E8918A" opacity=".45"/><circle cx="84" cy="80" r="5" fill="#E8918A" opacity=".45"/>' +
    '<path d="M60 70 q-3 6 0 9" stroke="#13171C" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M42 86 q9 -8 18 -1 q9 -7 18 1" stroke="#13171C" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M50 93 q10 7 20 0" stroke="#13171C" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  function reduced(){ return BD.reducedMotion(); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  var liveT = null;
  function say(t){ var n = $('live'); n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 40); }
  function surname(name){
    var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').trim().split(/\s+/);
    return ws[ws.length - 1] || '';
  }
  function personHref(slug){ return 'player.html?p=' + encodeURIComponent(slug); }
  function nyFmt(ms, opts){
    try { opts.timeZone = 'America/New_York'; return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)); }
    catch (e) { return new Date(ms).toUTCString(); }
  }
  function weekdayLong(date){ return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][C.weekday(date)]; }
  function span(ms){
    var m = Math.max(0, Math.floor(ms / 60000));
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + mi + 'm';
  }
  function orderedPicks(team){
    var p = team.picks.slice();
    if (team.captain && p.indexOf(team.captain) > 0){ p.splice(p.indexOf(team.captain), 1); p.unshift(team.captain); }
    return p;
  }
  // portraits: only plain site-relative paths from window.BDPortraits (empty until the style is approved)
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? u : null; }
  function portrait(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? { img: safePath(p.img), dollar: safePath(p.dollar) } : { img: null, dollar: null };
  }
  function plate(p){
    var pic = portrait(p.slug);
    var a = el('span', 'v2-av tm-plate', pic.img ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic.img){ var im = el('img'); im.src = pic.img; im.alt = ''; a.appendChild(im); }
    return a;
  }

  // ---- odometer: each digit is a strip 0-9 0-9 that rolls to its value; the real value is in text for screen readers.
  // Rolls only on the first render of the page (rolled flag); re-renders (sign-in, etc.) set the digits directly.
  var rolled = false;
  function odometer(box, value, signed, srText){
    clear(box);
    var txt = value == null ? '—' : (signed ? signedTxt(value) : plainTxt(value));
    box.appendChild(el('span', 'v2-sr', srText || txt));
    var vis = el('span', 'v2-odo__digits num');
    vis.setAttribute('aria-hidden', 'true');
    var strips = [];
    if (value == null){ // unlit counter: blank windows, no number (the text next to it says why)
      for (var b = 0; b < 4; b++) vis.appendChild(el('span', 'v2-odo__ch v2-odo__blank', ''));
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
    if (rolled || reduced()){ strips.forEach(function(x){ x.s.style.transform = 'translateY(' + (-x.to) + 'em)'; }); return; }
    void vis.offsetWidth;
    strips.forEach(function(x, j){
      x.s.style.transition = 'transform ' + (1100 + j * 260) + 'ms cubic-bezier(.2,.75,.25,1.02) ' + (j * 90) + 'ms';
      x.s.style.transform = 'translateY(' + (-x.to) + 'em)';
    });
  }

  // ---- marquee bulbs: one short chase on load, never with reduced motion ----
  function chaseBulbs(){
    if (reduced()) return;
    var rows = document.querySelectorAll('.tm-jackpot .v2-bulbs');
    Array.prototype.forEach.call(rows, function(r){ r.classList.add('is-chasing'); });
    setTimeout(function(){ Array.prototype.forEach.call(rows, function(r){ r.classList.remove('is-chasing'); }); }, 3800);
  }

  // ---- which team the page shows ----
  // scoring: the team in the current/latest locked week (practice week: the working draft);
  // upcoming: no scoring team, but one is saved for the draft week; none: nothing saved.
  function view(){
    var S = F.state, wk = S.sbWk, team = wk ? F.matchTeam(wk) : null;
    if (team) {
      var res = F.teamWeek(wk, team);
      return { mode: 'scoring', wk: wk, team: team, res: res, any: res.scored.length > 0 };
    }
    var saved = F.store().teams[S.draftWeek];
    if (saved && saved.picks && S.draftWk) return { mode: 'upcoming', wk: S.draftWk, weekId: S.draftWeek, team: saved, res: null, any: false };
    return { mode: 'none', wk: null, team: null, res: null, any: false };
  }

  function teamName(){ var me = F.me(); return me && me.nickname ? me.nickname : 'Your team'; }
  function bench(v){ return v.mode === 'scoring' && v.any && v.wk.benchmarks && typeof v.wk.benchmarks.spy === 'number' ? v.wk.benchmarks.spy : null; }
  // lamp: the result in words (never color alone)
  function lamp(v){
    if (v.mode === 'none') return { word: 'No team yet', cls: 'is-off', win: false };
    if (v.mode === 'upcoming') return { word: 'Ready', cls: 'is-off', win: false };
    if (!v.any) return { word: 'Waiting for scores', cls: 'is-off', win: false };
    var bm = bench(v);
    if (bm == null) return { word: 'No benchmark yet', cls: 'is-off', win: false };
    var diff = v.res.total - bm, over = F.weekOver(v.wk);
    if (diff > 0) return { word: over ? 'Win' : 'Leading', cls: 'is-win', win: true };
    if (diff < 0) return { word: over ? 'Loss' : 'Trailing', cls: 'is-loss', win: false };
    return { word: 'Tied', cls: 'is-off', win: false };
  }
  function scoringNote(v){
    if (v.mode === 'none') return 'No team yet. Draft five billionaires before the next lock.';
    if (v.any){
      if (v.team.lateFrom) return 'Late entry: scoring from ' + fmt.dayLabel(v.team.lateFrom) + '.';
      if (v.wk.practice) return 'Practice week: your working draft scores here. It does not count for your streak or XP.';
      return '';
    }
    // upcoming: the draft week itself (its salaries may come from a fallback week file)
    var start = v.mode === 'upcoming' ? C.weekInfo(v.weekId).start : ((v.team && v.team.lateFrom) || v.wk.start);
    if (!start) return '';
    if (F.now() < C.nyToUtc(start, 9, 30)) return (v.mode === 'upcoming' ? 'Starts ' : 'Scoring starts ') + weekdayLong(start) + ', ' + fmt.shortDate(start) + ' · 9:30 AM ET';
    return 'The first scores arrive after the market closes.';
  }
  function statusPill(v){
    if (v.mode === 'none') return null;
    var t, live = false;
    if (v.mode === 'upcoming') t = C.isPractice(v.weekId) ? 'Practice' : 'Upcoming';
    else if (v.wk.practice) t = F.weekOver(v.wk) ? 'Practice · final' : 'Practice';
    else if (F.weekOver(v.wk)) t = 'Final';
    else if (v.any){ t = 'Live · through ' + fmt.dayLabel(v.res.scored[v.res.scored.length - 1]); live = true; }
    else { t = 'Live'; live = true; }
    return el('span', 'v2-pill' + (live ? ' v2-pill--live' : ''), t);
  }

  // ---- hero: weekly jackpot ----
  function renderHero(v){
    var S = F.state, box = clear($('heroin')), hero = $('hero');
    hero.removeAttribute('aria-busy');
    var weekId = v.mode === 'scoring' ? v.wk.week : S.draftWeek;
    var top = el('div', 'tm-jackpot__top');
    top.appendChild(el('span', 'v2-kicker', 'Weekly jackpot · ' + fmt.weekTitle(weekId)));
    var pill = statusPill(v);
    if (pill) top.appendChild(pill);
    box.appendChild(top);
    var h = el('h1', 'tm-jackpot__name', teamName()); h.id = 'teamname';
    box.appendChild(h);

    var grid = el('div', 'tm-jackpot__grid');
    var total = v.any ? v.res.total : null;
    var main = el('div', 'tm-meter tm-meter--main');
    main.appendChild(el('span', 'tm-meter__k', 'Team total · fantasy points'));
    var odo = el('div', 'v2-odo v2-odo--big v2-odo--gold ' + (total == null ? 'v2-zero' : numCls(total)));
    main.appendChild(odo);
    grid.appendChild(main);

    var L = lamp(v);
    var lampBox = el('div', 'v2-lamp ' + L.cls);
    lampBox.appendChild(el('span', 'v2-lamp__k', 'Result'));
    lampBox.appendChild(el('span', 'v2-lamp__word', L.word));
    grid.appendChild(lampBox);

    var side = el('div', 'tm-meter tm-meter--vs');
    side.appendChild(el('span', 'tm-meter__k', 'Vs S&P 500'));
    var bm = bench(v), diff = bm == null ? null : total - bm;
    var odo2 = el('div', 'v2-odo v2-odo--mid ' + (diff == null ? 'v2-zero' : numCls(diff)));
    side.appendChild(odo2);
    side.appendChild(el('span', 'tm-meter__sub', bm == null
      ? (v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.')
      : 'S&P 500 scored ' + plainTxt(bm) + ' fantasy points'));
    grid.appendChild(side);
    box.appendChild(grid);

    var note = scoringNote(v);
    if (note) box.appendChild(el('p', 'tm-jackpot__note', note));

    odometer(odo, total, false, total == null ? 'No team points yet' : 'Team total: ' + plainTxt(total) + ' fantasy points');
    odometer(odo2, diff, true, diff == null ? 'Versus S&P 500: no comparison yet' : 'Versus S&P 500: ' + signedTxt(diff) + ' points');
    return L;
  }

  // ---- score strip (phone) ----
  function renderStrip(v){
    var strip = $('scorestrip'), box = clear($('scorestripin'));
    if (v.mode !== 'scoring' || !v.any){ strip.hidden = true; return; }
    var top = v.team.picks.slice().sort(function(a, b){ return v.res.bySlug[b] - v.res.bySlug[a]; }).slice(0, 2);
    top.forEach(function(slug, i){
      var c = el('div', 'v2-strip__cell');
      c.appendChild(el('span', 'v2-strip__k', i === 0 ? fmt.weekTitle(v.wk.week) : ' '));
      var pts = v.res.bySlug[slug];
      var val = el('span', 'v2-strip__v');
      val.appendChild(document.createTextNode(surname(F.person(slug).name) + ' '));
      val.appendChild(el('span', numCls(pts), signedTxt(pts)));
      c.appendChild(val);
      box.appendChild(c);
    });
    strip.hidden = false;
  }

  // ---- starting five: slot-reel cards ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    $('fivehint').hidden = v.mode === 'none';
    if (v.mode === 'none'){
      meta.textContent = '';
      var e = el('div', 'tm-empty');
      for (var i = 0; i < 5; i++){
        var ph = el('div', 'tm-empty__slot');
        ph.setAttribute('aria-hidden', 'true');
        ph.appendChild(el('span', 'tm-empty__q', '?'));
        e.appendChild(ph);
      }
      body.appendChild(e);
      var t = el('div', 'tm-empty__txt');
      t.appendChild(el('h3', 'v2-h3', 'Five empty reels'));
      t.appendChild(el('p', null, 'Pick five billionaires under a ' + C.CAP + '-point cap and choose a captain, who scores 1.5 times. Your team scores on their real, disclosed stock holdings each trading day.'));
      var b = el('div', 'v2-btnrow');
      b.appendChild(link('v2-btn v2-btn--gold', 'Go to the Draft room', 'draft.html'));
      b.appendChild(link('v2-btn v2-btn--secondary', 'Lucky five', 'draft.html#lucky'));
      t.appendChild(b);
      body.appendChild(t);
      return;
    }
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var ul = el('ul', 'tm-reels');
    ul.setAttribute('aria-label', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.'));
    orderedPicks(v.team).forEach(function(slug, i){
      var p = F.person(slug), isC = slug === v.team.captain;
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var pts = v.any ? v.res.bySlug[slug] : null;
      var li = el('li', 'tm-reel' + (isC ? ' is-captain' : ''));
      li.style.setProperty('--i', String(i));
      var btn = el('button', 'tm-reel__btn');
      btn.type = 'button';
      btn.setAttribute('data-slug', slug);
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-label', 'Close-up of ' + p.name + (isC ? ', captain, scores 1.5 times' : '') +
        '. Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : 'unknown') +
        (base == null ? '. No points yet.' : '. Base ' + signedTxt(base) + ' points, team ' + signedTxt(pts) + ' points.'));
      var win = el('span', 'tm-reel__window');
      win.appendChild(plate(p));
      btn.appendChild(win);
      if (isC) btn.appendChild(el('span', 'tm-capt', '×' + C.CAPTAIN_MULT + ' Captain'));
      btn.appendChild(el('span', 'tm-reel__name', p.name));
      btn.appendChild(el('span', 'tm-reel__sector', p.sector || 'Other'));
      var chips = el('span', 'tm-reel__chips');
      chips.appendChild(el('span', 'tm-chip num', 'Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : '—')));
      chips.appendChild(el('span', 'tm-chip num', 'Base ' + (base == null ? '—' : signedTxt(base))));
      btn.appendChild(chips);
      var coin = el('span', 'tm-coin');
      coin.appendChild(el('span', 'tm-coin__v num ' + (pts == null ? 'v2-zero' : numCls(pts)), pts == null ? '—' : signedTxt(pts)));
      coin.appendChild(el('span', 'tm-coin__k', 'team pts'));
      btn.appendChild(coin);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    if (!rolled && !reduced()){
      ul.classList.add('is-rolling');
      setTimeout(function(){ ul.classList.remove('is-rolling'); }, 2200);
    }
  }

  // ---- next spin: lock countdown ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    var cd = el('p', 'tm-next__cd');
    cd.appendChild(el('span', 'tm-next__k', 'Next spin locks in'));
    var v = el('span', 'tm-next__v num'); v.id = 'countdown';
    cd.appendChild(v);
    body.appendChild(cd);
    body.appendChild(el('p', 'tm-next__when', fmt.weekTitle(S.draftWeek) + ' · ' + nyFmt(info.locksAt, { weekday: 'long' }) + ' ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET'));
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('v2-btn v2-btn--gold v2-btn--big v2-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', 'draft.html'));
    body.appendChild(link('v2-btn v2-btn--secondary v2-btn--block', 'Lucky five', 'draft.html#lucky'));
    body.appendChild(el('p', 'tm-small', 'Lucky five spins a random team that fits the cap. It opens in the Draft room and never saves by itself.'));
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
  }
  function tick(){
    var S = F.state, cd = $('countdown');
    if (!cd || !S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek), t = F.now();
    var locked = t >= info.locksAt;
    cd.className = 'tm-next__v num' + (locked ? ' is-locked' : '');
    cd.textContent = locked ? fmt.weekTitle(S.draftWeek) + ' has locked. Reload the page for the next round.' : span(info.locksAt - t);
  }

  // ---- season record (finished real weeks with a saved team) -> streak, XP, badges ----
  var season = null;
  function loadSeason(){
    var S = F.state, store = F.store();
    var finished = arr(S.index && S.index.weeks).filter(function(w){ return w.final && !w.practice && store.teams[w.week]; }).map(function(w){ return w.week; });
    return Promise.all(finished.map(function(id){ return F.loadWeek(id); })).then(function(files){
      season = F.pure.seasonRecord(files.map(function(wk, j){ return { wk: wk, team: store.teams[finished[j]] }; }));
    }, function(){ season = null; });
  }
  function xpOf(rec){ return rec.played * XP_WEEK + rec.winsSpy * XP_WIN; }
  function renderLevel(){
    var body = clear($('levelbody')), rec = season || { played: 0, winsSpy: 0, streak: 0 };
    var S = F.state;
    // streak meter: five lamps; lit = consecutive weeks beating the S&P 500 (newest first)
    var sm = el('div', 'tm-streak');
    sm.appendChild(el('span', 'tm-meter__k', 'Streak · weeks beating the S&P 500'));
    var lamps = el('span', 'tm-streak__lamps');
    lamps.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 5; i++) lamps.appendChild(el('span', 'tm-streak__l' + (i < rec.streak ? ' is-lit' : '')));
    sm.appendChild(lamps);
    var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
    var stxt;
    if (!rec.played) stxt = 'Start your streak Monday' + (first ? ' (' + fmt.shortDate(first) + ')' : '') + '.';
    else if (!rec.streak) stxt = 'No streak right now. Beat the S&P 500 this week to start one.';
    else stxt = rec.streak + (rec.streak === 1 ? ' week' : ' weeks') + ' in a row beating the S&P 500.';
    sm.appendChild(el('p', 'tm-streak__txt', stxt));
    body.appendChild(sm);

    var xp = xpOf(rec), level = 1 + Math.floor(xp / XP_LEVEL), into = xp % XP_LEVEL;
    var lv = el('div', 'tm-xp');
    var row = el('div', 'tm-xp__row');
    row.appendChild(el('span', 'tm-xp__lvl', 'Level ' + level));
    row.appendChild(el('span', 'tm-xp__n num', xp + ' XP'));
    lv.appendChild(row);
    var bar = el('div', 'tm-xp__bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'XP toward level ' + (level + 1));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(XP_LEVEL));
    bar.setAttribute('aria-valuenow', String(into));
    bar.setAttribute('aria-valuetext', into + ' of ' + XP_LEVEL + ' XP');
    var fill = el('span', 'tm-xp__fill');
    fill.style.width = (into / XP_LEVEL * 100) + '%';
    bar.appendChild(fill);
    lv.appendChild(bar);
    var why = el('p', 'tm-small');
    why.appendChild(document.createTextNode((XP_LEVEL - into) + ' XP to level ' + (level + 1) + '. '));
    why.appendChild(el('span', 'tm-formula', rec.played + ' weeks × ' + XP_WEEK + ' + ' + rec.winsSpy + ' wins × ' + XP_WIN + ' = ' + xp + ' XP'));
    why.appendChild(document.createTextNode(' '));
    why.appendChild(link('tm-link', 'How XP works', '#xpnote'));
    lv.appendChild(why);
    body.appendChild(lv);
  }

  // ---- badges: earned only from real record facts ----
  function renderBadges(v){
    var body = clear($('badgebody')), rec = season || { played: 0, winsSpy: 0, winsTop5: 0, winsPerfect: 0, streak: 0 };
    var practiced = v.mode === 'scoring' && v.wk.practice && v.any;
    var list = [
      ['Practice run', practiced, 'Score a team in the practice week.', 'You scored a team in the practice week.'],
      ['First week', rec.played >= 1, 'Finish one real week with a saved team.', 'You finished a real week.'],
      ['Beat the market', rec.winsSpy >= 1, 'Beat the S&P 500 in a real week.', 'You beat the S&P 500 in a real week.'],
      ['Beat the Top 5', rec.winsTop5 >= 1, 'Outscore the five richest people in a real week.', 'You outscored the Top 5 richest.'],
      ['Hot streak', rec.streak >= 3, 'Beat the S&P 500 three weeks in a row.', 'Three weeks in a row beating the S&P 500.'],
      ['Perfect week', rec.winsPerfect >= 1, 'Match the best possible team in a week.', 'You matched the perfect team.']
    ];
    var n = list.filter(function(b){ return b[1]; }).length;
    body.appendChild(el('p', 'tm-small', n + ' of ' + list.length + ' badges earned'));
    var ul = el('ul', 'tm-badges');
    list.forEach(function(b){
      var li = el('li', 'tm-badge' + (b[1] ? ' is-earned' : ' is-locked'));
      var disc = el('span', 'tm-badge__disc');
      disc.setAttribute('aria-hidden', 'true');
      disc.appendChild(el('span', 'tm-badge__star'));
      li.appendChild(disc);
      var t = el('span', 'tm-badge__txt');
      t.appendChild(el('span', 'tm-badge__name', b[0]));
      t.appendChild(el('span', 'tm-badge__state', b[1] ? 'Earned · ' + b[3] : 'Locked · ' + b[2]));
      li.appendChild(t);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  // ---- play-money coins (only from the online game when signed in) ----
  function renderCoins(){
    var box = clear($('coinbody')), me = F.me();
    var row = el('div', 'tm-coins__row');
    var disc = el('span', 'tm-coins__disc');
    disc.setAttribute('aria-hidden', 'true');
    row.appendChild(disc);
    var t = el('div', 'tm-coins__txt');
    t.appendChild(el('span', 'tm-meter__k', 'Play-money coins'));
    if (me && typeof me.coins === 'number'){
      t.appendChild(el('span', 'tm-coins__v num', Number(me.coins).toLocaleString('en-US') + ' coins'));
      t.appendChild(el('span', 'tm-small', 'Play money only. No purchases, cash-out or prizes.'));
    } else {
      t.appendChild(el('span', 'tm-coins__v tm-coins__v--off', me ? 'Coins not available right now' : 'Sign in to get play-money coins'));
      var p = el('span', 'tm-small');
      if (!me) p.appendChild(link('tm-link', 'Sign in on Leagues', 'leagues.html'));
      p.appendChild(document.createTextNode((me ? '' : ' · ') + 'no purchases, cash-out or prizes'));
      t.appendChild(p);
    }
    row.appendChild(t);
    box.appendChild(row);
  }

  // ---- news (latest edition; stories matched to your players by name, as on the people pages) ----
  var digest = null, digestState = 'loading';
  function renderNews(v){
    var body = clear($('newsbody'));
    if (!v.team){ body.appendChild(el('p', 'v2-msg', 'Draft your team to see stories about your players here.')); return; }
    if (digestState === 'loading'){ body.appendChild(el('p', 'v2-loading', 'Loading the latest edition…')); return; }
    if (digestState === 'error' || !digest){ body.appendChild(el('p', 'v2-msg', 'The latest edition is not available right now.')); return; }
    var picks = orderedPicks(v.team), items = [];
    arr(digest.stories).forEach(function(s){
      if (!s || !s.headline) return;
      for (var i = 0; i < picks.length; i++){
        if (BD.storyMatches(s, F.person(picks[i]).name)){ items.push({ s: s, slug: picks[i] }); return; }
      }
    });
    var iso = BD.isoFromLong(digest.date);
    if (!items.length){
      body.appendChild(el('p', 'v2-msg', 'No stories about your players in the latest edition.'));
    } else {
      var ul = el('ul', 'v2-news');
      items.slice(0, 4).forEach(function(x){
        var li = el('li');
        li.appendChild(el('span', 'v2-kicker', surname(F.person(x.slug).name) + ' / ' + (x.s.type || x.s.sector || 'Story')));
        var u = BD.safeUrl(x.s.url);
        if (u){
          var a = link('v2-news__h', x.s.headline, u); a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.appendChild(el('span', 'v2-sr', ' (opens the source in a new tab)'));
          li.appendChild(a);
        } else li.appendChild(el('span', 'v2-news__h', x.s.headline));
        if (x.s.source) li.appendChild(el('span', 'v2-news__src', 'Source · ' + x.s.source));
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    // recent-edition counts from the game index (same counts that score +10 per story)
    var counts = (F.state.index && F.state.index.news) || {};
    var recent = picks.filter(function(s){ return counts[s] > 0; });
    if (!items.length && recent.length){
      var p = el('p', 'v2-news__foot');
      p.appendChild(document.createTextNode('In recent editions: '));
      recent.forEach(function(s, i){
        if (i) p.appendChild(document.createTextNode(', '));
        p.appendChild(link(null, surname(F.person(s).name) + ' (' + counts[s] + ')', personHref(s)));
      });
      p.appendChild(document.createTextNode('.'));
      body.appendChild(p);
    }
    if (iso){
      var f = el('p', 'v2-news__foot');
      f.appendChild(link(null, 'Read the ' + BD.monDay(iso) + ' edition', 'editions/' + iso + '/'));
      body.appendChild(f);
    }
  }

  // ---- leagues ----
  var leagues = { state: 'idle', rows: [], who: null };
  function renderLeagues(){
    var head = $('leaguesh'), body = clear($('leaguesbody'));
    if (!F.onlinePlaying()){
      head.textContent = 'Play against your friends.';
      body.appendChild(el('p', null, 'Private leagues with a join code. Sign in to create or join one.'));
      body.appendChild(link('v2-btn v2-btn--primary', 'Go to Leagues', 'leagues.html'));
      return;
    }
    head.textContent = 'Your leagues';
    var me = F.me();
    if (leagues.who !== me.id){ leagues.who = me.id; leagues.state = 'idle'; }
    if (leagues.state === 'idle'){
      leagues.state = 'loading';
      BDGame.myLeagues().then(function(rows){ leagues.rows = arr(rows); leagues.state = 'ok'; renderLeagues(); },
        function(){ leagues.state = 'error'; renderLeagues(); });
    }
    if (leagues.state === 'loading'){ body.appendChild(el('p', 'v2-loading', 'Loading your leagues…')); return; }
    if (leagues.state === 'error'){
      body.appendChild(el('p', null, 'Could not load your leagues right now.'));
      body.appendChild(link('v2-btn v2-btn--secondary', 'Open Leagues', 'leagues.html'));
      return;
    }
    if (!leagues.rows.length){
      body.appendChild(el('p', null, 'You are not in a league yet. Create one and share the join code, or join a friend\'s.'));
      body.appendChild(link('v2-btn v2-btn--primary', 'Create or join a league', 'leagues.html'));
      return;
    }
    var ul = el('ul', 'v2-leagues');
    leagues.rows.forEach(function(l){
      var li = el('li');
      li.appendChild(link(null, l.name, 'leagues.html'));
      var n = Number(l.members || 0);
      li.appendChild(el('span', 'v2-small num', n + (n === 1 ? ' member' : ' members')));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    body.appendChild(link('v2-btn v2-btn--secondary', 'Standings and invites', 'leagues.html'));
  }

  // ---- celebration: one short coin burst, never looping, never with reduced motion ----
  function celebrate(){
    if (reduced()) return;
    var box = clear($('burst'));
    var colors = ['#F5C542', '#FFE08A', '#FF3B3B', '#39E07A', '#FFFFFF'];
    for (var i = 0; i < 36; i++){
      var c = el('span', 'tm-burst__p' + (i % 3 === 0 ? ' is-coin' : ''));
      c.style.left = (5 + Math.random() * 90) + '%';
      c.style.background = i % 3 === 0 ? '' : colors[i % colors.length];
      c.style.animationDelay = Math.round(Math.random() * 500) + 'ms';
      c.style.animationDuration = (1400 + Math.round(Math.random() * 900)) + 'ms';
      c.style.setProperty('--dx', Math.round(Math.random() * 160 - 80) + 'px');
      c.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
      box.appendChild(c);
    }
    box.classList.add('is-on');
    setTimeout(function(){ box.classList.remove('is-on'); clear(box); }, 3200);
  }

  // ---- close-up dialog ($ eyes) ----
  var dlg = $('closeup'), lastFocus = null, cuT = [], curView = null;
  function dlgFocusables(){
    return Array.prototype.filter.call(dlg.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  function openCloseup(slug, from){
    var v = curView, p = F.person(slug), zoom = $('cu-zoom'), face = clear($('cu-face')), pic = portrait(slug);
    var sal = (v && v.wk && v.wk.salaries) || {};
    var isC = v && v.team && v.team.captain === slug;
    lastFocus = from || document.activeElement;
    var src = pic.dollar || pic.img, cartoon = !src;
    if (cartoon) face.innerHTML = FACE;
    else { var im = el('img', 'tm-zoom__img'); im.src = src; im.alt = ''; face.appendChild(im); }
    $('cu-kick').textContent = cartoon ? 'Close-up · Portrait coming soon' : 'Close-up';
    $('cu-name').textContent = p.name + (isC ? ' · Captain' : '');
    $('cu-cap').textContent = typeof sal[slug] === 'number' ? String(sal[slug]) : '—';
    var pts = v && v.any ? v.res.bySlug[slug] : null;
    var ptd = clear($('cu-pts'));
    if (pts == null) ptd.appendChild(el('span', 'v2-zero', 'No points yet'));
    else ptd.appendChild(el('span', numCls(pts), signedTxt(pts)));
    $('cu-ptsk').textContent = 'Team pts this week' + (v && v.wk && v.wk.practice ? ' (practice)' : '');
    $('cu-sector').textContent = p.sector || 'Other';
    $('cu-link').href = personHref(slug);
    cuT.forEach(clearTimeout); cuT = [];
    zoom.className = 'tm-zoom' + (cartoon ? ' is-cartoon' : ' is-portrait');
    dlg.removeAttribute('hidden');
    document.documentElement.classList.add('v2-lock');
    $('cu-close').focus();
    if (reduced()){ zoom.className += ' is-zoomed is-rich is-static'; return; }
    void zoom.offsetWidth;
    cuT.push(setTimeout(function(){ zoom.classList.add('is-zoomed'); }, 30));
    cuT.push(setTimeout(function(){ zoom.classList.add('is-rich'); zoom.classList.add('is-sparkle'); }, 720));
    cuT.push(setTimeout(function(){ zoom.classList.remove('is-sparkle'); }, 2200));
  }
  function closeCloseup(){
    if (dlg.hasAttribute('hidden')) return;
    cuT.forEach(clearTimeout); cuT = [];
    dlg.setAttribute('hidden', '');
    document.documentElement.classList.remove('v2-lock');
    clear($('cu-face'));
    if (lastFocus && document.contains(lastFocus) && lastFocus.getClientRects().length) lastFocus.focus();
  }
  dlg.addEventListener('click', function(e){ if (e.target === dlg) closeCloseup(); });
  $('cu-close').addEventListener('click', closeCloseup);
  document.addEventListener('keydown', function(e){
    if (dlg.hasAttribute('hidden')) return;
    if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); closeCloseup(); return; }
    if (e.key !== 'Tab') return;
    var f = dlgFocusables();
    if (!f.length){ e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
  $('fivebody').addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.tm-reel__btn');
    if (b) openCloseup(b.getAttribute('data-slug'), b);
  });
  // "How XP works" link: move focus to the note so keyboard and screen-reader users land on it
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href="#xpnote"]');
    if (!a) return;
    var n = $('xpnote');
    if (n) setTimeout(function(){ n.focus(); }, 0);
  });

  // ---- page ----
  function renderAll(){
    var v = view();
    curView = v;
    var L = renderHero(v);
    renderStrip(v); renderFive(v); renderNext(); renderLevel(); renderBadges(v); renderCoins(); renderNews(v); renderLeagues();
    var first = !rolled;
    rolled = true;
    var tot = v.any ? v.res.total : null;
    say(teamName() + '. ' + (tot == null ? 'No team points yet.' : 'Team total ' + plainTxt(tot) + ' fantasy points. Result: ' + L.word + '.'));
    if (first){
      chaseBulbs();
      if (L.win) setTimeout(celebrate, 1400);
    }
  }
  function fail(){
    var box = clear($('heroin'));
    $('hero').removeAttribute('aria-busy');
    box.appendChild(el('span', 'v2-kicker', 'Weekly jackpot'));
    var h = el('h1', 'tm-jackpot__name', 'Your team'); h.id = 'teamname'; box.appendChild(h);
    box.appendChild(el('p', 'tm-jackpot__note', 'The game data is not available right now. Try again later.'));
    var r = el('button', 'v2-btn v2-btn--ghost', 'Try again'); r.type = 'button';
    r.addEventListener('click', function(){ location.reload(); });
    box.appendChild(r);
    clear($('fivebody')).appendChild(el('p', 'v2-msg', 'Your team will show here when the game data loads.'));
    clear($('nextbody')).appendChild(el('p', 'v2-msg', 'Lineups lock every Monday at 9:30 AM ET.'));
    ['levelbody', 'badgebody'].forEach(function(id){ clear($(id)).appendChild(el('p', 'v2-msg', 'Not available right now.')); });
    clear($('newsbody')).appendChild(el('p', 'v2-msg', 'Not available right now.'));
    renderCoins();
    renderLeagues();
    say('The game data is not available right now.');
  }

  var tc = F.testClock();
  if (tc != null){ var b = $('testclock'); b.hidden = false; b.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }

  F.onChange(function(kind){
    if (!F.state.loaded) { if (kind === 'online') renderLeagues(); return; }
    if (kind === 'online'){ var h = $('teamname'); if (h) h.textContent = teamName(); renderLeagues(); renderCoins(); }
  });

  BD.getJson('digest.json').then(function(d){ digest = d; digestState = 'ok'; }, function(){ digestState = 'error'; })
    .then(function(){ if (F.state.loaded) renderNews(view()); });

  renderLeagues();
  F.init().then(function(){ return loadSeason(); }).then(function(){ renderAll(); }, function(err){ if (window.console) console.warn(err); fail(); });
})();
