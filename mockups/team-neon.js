/* Billionaires Digest v2 MOCKUP, casino variation A3: "Vegas neon strip" My team (mockups/team-neon.html). ES5, no globals.
   Same content and team logic as option A (mockups/team-arcade.js): real game data from ../data/fantasy/*, BDFantasyStore
   state seeded by hand (incl. the unsaved working draft), scoring / upcoming / none.
   Game layer uses only real or transparently derived facts:
     streak, badges  <- BDFantasyStore.pure.seasonRecord over finished real weeks you saved a team for
     XP / level      <- weeks played x100 + weeks beat the S&P 500 x50; a level every 500 XP (formula shown on the page)
     coins           <- BDAccount (game-client.js) only when signed in; otherwise "Sign in" text
   The close-up face is one made-up cartoon (portrait placeholder), never a real person. Play money only, no prizes.
   Motion: sign flicker, letter light-up, count-up, card power-on, gauge fill, one burst. Each runs once; none with reduced motion. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, BD = window.BD;
  if (!F || !C || !BD) return;
  var DATA = '../data/fantasy/';
  var MINUS = '−';
  var XP_WEEK = 100, XP_WIN = 50, XP_LEVEL = 500;
  var el = BD.el, arr = BD.arr;
  var fmt = F.fmt;
  var $ = function(id){ return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';

  // One generic, original cartoon tycoon (same drawing as option A). Eyes swap to "$" when zoomed.
  var FACE = '<svg class="ne-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#FF3EA5"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="ne-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="ne-dollar" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="800" font-size="19" text-anchor="middle" fill="#08764A">' +
    '<text x="46" y="69">$</text><text x="74" y="69">$</text></g>' +
    '<circle cx="36" cy="80" r="5" fill="#E8918A" opacity=".45"/><circle cx="84" cy="80" r="5" fill="#E8918A" opacity=".45"/>' +
    '<path d="M60 70 q-3 6 0 9" stroke="#13171C" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M42 86 q9 -8 18 -1 q9 -7 18 1" stroke="#13171C" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M50 93 q10 7 20 0" stroke="#13171C" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  // neon pin icons (24x24 strokes)
  var ICON = {
    flag: 'M6 21V4 M6 4h11l-2.5 4L17 12H6',
    star: 'M12 2.8l2.8 5.8 6.4.8-4.7 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.8 9.4l6.4-.8z',
    up: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
    crown: 'M3 19h18 M4.5 16L3 7l5 4 4-6 4 6 5-4-1.5 9z',
    flame: 'M12 21.5c3.9 0 6.5-2.7 6.5-6.3 0-3.6-2.6-5.7-3.8-9.2-1.7 1.6-2.6 3.3-2.7 5.1-1-.9-1.8-2-2-3.7-2.6 2.5-4.5 4.8-4.5 7.8 0 3.6 2.6 6.3 6.5 6.3z',
    gem: 'M6.5 3.5h11l4 5.5-10.5 12L.5 9z M.5 9h21 M9 3.5l2 17.5 2-17.5'
  };

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'is-pos' : (n < 0 ? 'is-neg' : 'is-zero'); }
  function reduced(){ return BD.reducedMotion(); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function hide(n){ n.setAttribute('aria-hidden', 'true'); return n; }
  var liveT = null;
  function say(t){ var n = $('live'); n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 40); }
  function getJson(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function optJson(u){ return getJson(u).then(null, function(){ return null; }); }
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
  function svg(tag, attrs){
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    return n;
  }
  // portraits: only plain site-relative paths from window.BDPortraits (empty until the style is approved)
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? '../' + u : null; }
  function portrait(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? { img: safePath(p.img), dollar: safePath(p.dollar) } : { img: null, dollar: null };
  }
  function plate(p){
    var pic = portrait(p.slug);
    var a = el('span', 'v2-av ne-plate', pic.img ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    hide(a);
    if (pic.img){ var im = el('img'); im.src = pic.img; im.alt = ''; a.appendChild(im); }
    return a;
  }

  // ---- neon number: visible digits count up once (aria-hidden); the real value sits in screen-reader text ----
  function neonNum(box, value, signed, srText){
    clear(box);
    var txt = value == null ? '' : (signed ? signedTxt(value) : plainTxt(value));
    box.appendChild(el('span', 'v2-sr', srText));
    var vis = hide(el('span', 'ne-num__v num', value == null ? '– –' : txt));
    if (value == null) vis.className += ' is-off';
    box.appendChild(vis);
    if (value == null || reduced() || !window.requestAnimationFrame) return;
    var t0 = null, dur = 1300, to = value;
    function frame(t){
      if (t0 == null) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), n = Math.round(to * e);
      vis.textContent = k < 1 ? (signed ? signedTxt(n) : plainTxt(n)) : txt;
      if (k < 1) requestAnimationFrame(frame);
    }
    vis.textContent = signed ? signedTxt(0) : '0';
    setTimeout(function(){ requestAnimationFrame(frame); }, 700);
    setTimeout(function(){ t0 = -1e9; vis.textContent = txt; }, 700 + dur + 1500); // safety: always land on the real value
  }

  // ---- a neon word whose letters light one by one (visual only; the word is also in sr text) ----
  function litWord(cls, word, delay){
    var w = el('span', cls);
    w.appendChild(el('span', 'v2-sr', word));
    var vis = hide(el('span', 'ne-lit'));
    for (var i = 0; i < word.length; i++){
      var ch = word.charAt(i);
      var s = el('span', 'ne-lit__c', ch);
      s.style.animationDelay = (delay + i * 110) + 'ms';
      vis.appendChild(s);
    }
    w.appendChild(vis);
    return w;
  }

  // ---- data: same week choice as BDFantasyStore.init (draft week salaries, scoring week points) ----
  var season = null;
  function load(){
    return getJson(DATA + 'index.json').then(function(ix){
      var S = F.state, t = F.now(), dw = C.draftWeek(t), lw = C.lockedWeek(t);
      var weeks = arr(ix.weeks).map(function(w){ return w.week; });
      var sbId = null;
      for (var i = weeks.length - 1; i >= 0; i--) if (weeks[i] <= lw){ sbId = weeks[i]; break; }
      var latest = weeks.length ? weeks[weeks.length - 1] : null;
      var store = F.store();
      var finished = arr(ix.weeks).filter(function(w){ return w.final && !w.practice && store.teams[w.week]; }).map(function(w){ return w.week; });
      return Promise.all([
        weeks.indexOf(dw) >= 0 ? optJson(DATA + 'weeks/' + dw + '.json') : null,
        sbId ? optJson(DATA + 'weeks/' + sbId + '.json') : null,
        latest ? optJson(DATA + 'weeks/' + latest + '.json') : null,
        Promise.all(finished.map(function(id){ return optJson(DATA + 'weeks/' + id + '.json'); }))
      ]).then(function(r){
        S.index = ix;
        S.draftWeek = dw;
        S.draftWk = r[0]; S.salaryFallback = false;
        if (!S.draftWk && r[2]){ S.draftWk = r[2]; S.salaryFallback = true; }
        S.sbWk = r[1];
        if (!S.draftWk) throw new Error('no week');
        arr(S.draftWk.draftable).forEach(function(p){ S.people[p.slug] = p; });
        arr(S.sbWk && S.sbWk.draftable).forEach(function(p){ S.people[p.slug] = S.people[p.slug] || p; });
        // working roster, exactly as BDFantasyStore.restoreRoster (saved draft-week team, else the unsaved draft)
        var src = store.teams[dw] || store.draft || { picks: [] }, sal = S.draftWk.salaries || {};
        S.picks = arr(src.picks).filter(function(s){ return sal[s] != null; }).slice(0, C.PICKS);
        S.captain = S.picks.indexOf(src.captain) >= 0 ? src.captain : (S.picks[0] || null);
        S.loaded = true;
        var files = r[3] || [];
        season = F.pure.seasonRecord(files.map(function(wk, j){ return { wk: wk, team: store.teams[finished[j]] }; }));
      });
    });
  }

  // ---- which team the page shows (same as team.js / option A) ----
  function view(){
    var S = F.state, wk = S.sbWk, team = wk ? F.matchTeam(wk) : null;
    if (team){
      var res = F.teamWeek(wk, team);
      return { mode: 'scoring', wk: wk, team: team, res: res, any: res.scored.length > 0 };
    }
    var saved = F.store().teams[S.draftWeek];
    if (saved && saved.picks && S.draftWk) return { mode: 'upcoming', wk: S.draftWk, weekId: S.draftWeek, team: saved, res: null, any: false };
    return { mode: 'none', wk: null, team: null, res: null, any: false };
  }
  var acct = null;
  function teamName(){ return acct && acct.signedIn && acct.me && acct.me.nickname ? acct.me.nickname : 'Your team'; }
  function bench(v){ return v.mode === 'scoring' && v.any && v.wk.benchmarks && typeof v.wk.benchmarks.spy === 'number' ? v.wk.benchmarks.spy : null; }
  // result sign: always a word (colour only adds to it)
  function result(v){
    if (v.mode === 'none') return { word: 'No team yet', cls: 'is-off', win: false };
    if (v.mode === 'upcoming') return { word: 'Ready', cls: 'is-off', win: false };
    if (!v.any) return { word: 'Waiting', cls: 'is-off', win: false, sub: 'for the first scores' };
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
    var start = v.mode === 'upcoming' ? C.weekInfo(v.weekId).start : ((v.team && v.team.lateFrom) || v.wk.start);
    if (!start) return '';
    if (F.now() < C.nyToUtc(start, 9, 30)) return (v.mode === 'upcoming' ? 'Starts ' : 'Scoring starts ') + weekdayLong(start) + ', ' + fmt.shortDate(start) + ' · 9:30 AM ET';
    return 'The first scores arrive after the market closes.';
  }
  function statusWord(v){
    if (v.mode === 'none') return '';
    if (v.mode === 'upcoming') return C.isPractice(v.weekId) ? 'Practice' : 'Upcoming';
    if (v.wk.practice) return F.weekOver(v.wk) ? 'Practice · final' : 'Practice';
    if (F.weekOver(v.wk)) return 'Final';
    if (v.any) return 'Live · through ' + fmt.dayLabel(v.res.scored[v.res.scored.length - 1]);
    return 'Live';
  }

  // ---- hero: "Tonight's total" neon sign ----
  function renderHero(v){
    var S = F.state, box = clear($('heroin')), hero = $('hero');
    hero.removeAttribute('aria-busy');
    var weekId = v.mode === 'scoring' ? v.wk.week : S.draftWeek;
    var top = el('div', 'ne-hero__top');
    top.appendChild(el('span', 'ne-kicker', fmt.weekTitle(weekId)));
    var sw = statusWord(v);
    if (sw) top.appendChild(el('span', 'ne-status', sw));
    box.appendChild(top);
    var sign = el('p', 'ne-sign ne-sign--title');
    sign.appendChild(el('span', 'ne-sign__tube', 'Tonight\'s total'));
    box.appendChild(sign);
    var h = el('h1', 'ne-hero__name', teamName()); h.id = 'teamname';
    box.appendChild(h);

    var grid = el('div', 'ne-hero__grid');
    var total = v.any ? v.res.total : null;
    var main = el('div', 'ne-meter ne-meter--main');
    main.appendChild(el('span', 'ne-meter__k', 'Team total · fantasy points'));
    var n1 = el('div', 'ne-num ne-num--big ' + (total == null ? 'is-zero' : numCls(total)));
    main.appendChild(n1);
    grid.appendChild(main);

    var R = result(v);
    var rs = el('div', 'ne-result ' + R.cls);
    rs.appendChild(el('span', 'ne-result__k', 'Result'));
    rs.appendChild(litWord('ne-result__word', R.word, 1500));
    if (R.sub) rs.appendChild(el('span', 'ne-result__sub', R.sub));
    grid.appendChild(rs);

    var side = el('div', 'ne-meter ne-meter--vs');
    side.appendChild(el('span', 'ne-meter__k', 'Vs S&P 500'));
    var bm = bench(v), diff = bm == null ? null : total - bm;
    var n2 = el('div', 'ne-num ne-num--mid ' + (diff == null ? 'is-zero' : numCls(diff)));
    side.appendChild(n2);
    side.appendChild(el('span', 'ne-meter__sub', bm == null
      ? (v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.')
      : 'S&P 500 scored ' + plainTxt(bm) + ' fantasy points'));
    grid.appendChild(side);
    box.appendChild(grid);

    var note = scoringNote(v);
    if (note) box.appendChild(el('p', 'ne-hero__note', note));

    neonNum(n1, total, false, total == null ? 'No team points yet' : 'Team total: ' + plainTxt(total) + ' fantasy points');
    neonNum(n2, diff, true, diff == null ? 'Versus S&P 500: no comparison yet' : 'Versus S&P 500: ' + signedTxt(diff) + ' points');
    if (!reduced()){
      hero.classList.add('is-flicker');
      setTimeout(function(){ hero.classList.remove('is-flicker'); }, 4200);
    }
    return R;
  }

  // ---- starting five: neon marquee cards ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    $('fivehint').hidden = v.mode === 'none';
    if (v.mode === 'none'){
      meta.textContent = '';
      var e = hide(el('div', 'ne-empty'));
      for (var i = 0; i < 5; i++){
        var ph = el('div', 'ne-empty__slot');
        ph.appendChild(el('span', 'ne-empty__q', '?'));
        e.appendChild(ph);
      }
      body.appendChild(e);
      var t = el('div', 'ne-empty__txt');
      t.appendChild(el('h3', 'ne-h3', 'Five dark marquees'));
      t.appendChild(el('p', null, 'Pick five billionaires under a ' + C.CAP + '-point cap and choose a captain, who scores 1.5 times. Your team scores on their real, disclosed stock holdings each trading day.'));
      var b = el('div', 'ne-btnrow');
      b.appendChild(link('ne-btn ne-btn--gold', 'Go to the Draft room', '../draft.html'));
      b.appendChild(link('ne-btn ne-btn--cyan', 'Lucky five', '../draft.html'));
      t.appendChild(b);
      body.appendChild(t);
      return;
    }
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var ul = el('ul', 'ne-cards');
    ul.setAttribute('aria-label', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.'));
    orderedPicks(v.team).forEach(function(slug, i){
      var p = F.person(slug), isC = slug === v.team.captain;
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var pts = v.any ? v.res.bySlug[slug] : null;
      var li = el('li', 'ne-card' + (isC ? ' is-captain' : ''));
      li.style.setProperty('--i', String(i));
      var btn = el('button', 'ne-card__btn');
      btn.type = 'button';
      btn.setAttribute('data-slug', slug);
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-label', 'Close-up of ' + p.name + (isC ? ', captain, scores 1.5 times' : '') +
        '. Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : 'unknown') +
        (base == null ? '. No points yet.' : '. Base ' + signedTxt(base) + ' points, team ' + signedTxt(pts) + ' points.'));
      var inner = el('span', 'ne-card__in');
      var topr = el('span', 'ne-card__top');
      topr.appendChild(plate(p));
      if (isC) topr.appendChild(el('span', 'ne-capt', '×1.5 Captain'));
      else topr.appendChild(el('span', 'ne-card__slot num', 'Seat ' + (i + 1)));
      inner.appendChild(topr);
      inner.appendChild(el('span', 'ne-card__name', p.name));
      inner.appendChild(el('span', 'ne-card__sector', p.sector || 'Other'));
      var chips = el('span', 'ne-card__chips');
      chips.appendChild(el('span', 'ne-chip num', 'Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : '—')));
      chips.appendChild(el('span', 'ne-chip num', 'Base ' + (base == null ? '—' : signedTxt(base))));
      inner.appendChild(chips);
      var pt = el('span', 'ne-card__pts');
      pt.appendChild(el('span', 'ne-card__v num ' + (pts == null ? 'is-zero' : numCls(pts)), pts == null ? '—' : signedTxt(pts)));
      pt.appendChild(el('span', 'ne-card__k', 'team pts'));
      inner.appendChild(pt);
      btn.appendChild(inner);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    if (!reduced()){
      ul.classList.add('is-powering');
      setTimeout(function(){ ul.classList.remove('is-powering'); }, 2600);
    }
  }

  // ---- next round: "Doors close in…" ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    var cd = el('p', 'ne-next__cd');
    cd.appendChild(el('span', 'ne-sign ne-sign--doors', 'Doors close in…'));
    var v = el('span', 'ne-next__v num'); v.id = 'countdown';
    cd.appendChild(v);
    body.appendChild(cd);
    body.appendChild(el('p', 'ne-next__when', fmt.weekTitle(S.draftWeek) + ' · ' + nyFmt(info.locksAt, { weekday: 'long' }) + ' ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET'));
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('ne-btn ne-btn--gold ne-btn--big ne-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', '../draft.html'));
    body.appendChild(link('ne-btn ne-btn--cyan ne-btn--block', 'Lucky five', '../draft.html'));
    body.appendChild(el('p', 'ne-small', 'Lucky five spins a random team that fits the cap. It lives in the Draft room.'));
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
  }
  function tick(){
    var S = F.state, cd = $('countdown');
    if (!cd || !S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek), t = F.now();
    cd.textContent = t >= info.locksAt ? 'Locked. Reload for the next round.' : span(info.locksAt - t);
  }

  // ---- streak tubes + level gauge (derived, formula on the page) ----
  function xpOf(rec){ return rec.played * XP_WEEK + rec.winsSpy * XP_WIN; }
  function renderLevel(){
    var body = clear($('levelbody')), rec = season || { played: 0, winsSpy: 0, streak: 0 };
    var S = F.state;
    var sm = el('div', 'ne-streak');
    sm.appendChild(el('span', 'ne-meter__k', 'Streak · weeks beating the S&P 500'));
    var tubes = hide(el('span', 'ne-tubes'));
    for (var i = 0; i < 5; i++){
      var tb = el('span', 'ne-tube' + (i < rec.streak ? ' is-lit' : ''));
      tb.style.setProperty('--i', String(i));
      tubes.appendChild(tb);
    }
    sm.appendChild(tubes);
    var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
    var stxt;
    if (!rec.played) stxt = 'Start your streak Monday' + (first ? ' (' + fmt.shortDate(first) + ')' : '') + '.';
    else if (!rec.streak) stxt = 'No streak right now. Beat the S&P 500 this week to start one.';
    else stxt = rec.streak + (rec.streak === 1 ? ' week' : ' weeks') + ' in a row beating the S&P 500.';
    sm.appendChild(el('p', 'ne-streak__txt', stxt));
    body.appendChild(sm);

    var xp = xpOf(rec), level = 1 + Math.floor(xp / XP_LEVEL), into = xp % XP_LEVEL, pct = into / XP_LEVEL * 100;
    var g = el('div', 'ne-gauge');
    g.setAttribute('role', 'progressbar');
    g.setAttribute('aria-label', 'XP toward level ' + (level + 1));
    g.setAttribute('aria-valuemin', '0');
    g.setAttribute('aria-valuemax', String(XP_LEVEL));
    g.setAttribute('aria-valuenow', String(into));
    g.setAttribute('aria-valuetext', 'Level ' + level + ', ' + into + ' of ' + XP_LEVEL + ' XP');
    var s = svg('svg', { viewBox: '0 0 200 116', 'class': 'ne-gauge__svg', 'aria-hidden': 'true', focusable: 'false' });
    var d = 'M20 104 A80 80 0 0 1 180 104';
    s.appendChild(svg('path', { d: d, 'class': 'ne-gauge__track', pathLength: '100' }));
    for (var k = 0; k <= 10; k++){
      var a = Math.PI - (Math.PI * k / 10), r1 = 94, r2 = k % 5 ? 90 : 86;
      s.appendChild(svg('line', { x1: (100 + r1 * Math.cos(a)).toFixed(1), y1: (104 - r1 * Math.sin(a)).toFixed(1),
        x2: (100 + r2 * Math.cos(a)).toFixed(1), y2: (104 - r2 * Math.sin(a)).toFixed(1), 'class': 'ne-gauge__tick' }));
    }
    var fill = svg('path', { d: d, 'class': 'ne-gauge__fill' + (pct > 0 ? '' : ' is-empty'), pathLength: '100' });
    s.appendChild(fill);
    g.appendChild(s);
    var mid = hide(el('span', 'ne-gauge__mid'));
    mid.appendChild(el('span', 'ne-gauge__lv', 'Level'));
    mid.appendChild(el('span', 'ne-gauge__n num', String(level)));
    g.appendChild(mid);
    body.appendChild(g);
    var row = el('div', 'ne-xp__row');
    row.appendChild(el('span', 'ne-xp__n num', xp + ' XP'));
    row.appendChild(el('span', 'ne-xp__to num', (XP_LEVEL - into) + ' XP to level ' + (level + 1)));
    body.appendChild(row);
    var why = el('p', 'ne-small');
    why.appendChild(el('span', 'ne-formula', rec.played + ' weeks × ' + XP_WEEK + ' + ' + rec.winsSpy + ' wins × ' + XP_WIN + ' = ' + xp + ' XP'));
    why.appendChild(document.createTextNode(' '));
    why.appendChild(link('ne-link', 'How XP works', '#xpnote'));
    body.appendChild(why);
    if (reduced()){ fill.style.strokeDasharray = pct + ' 100'; return; }
    fill.style.strokeDasharray = '0 100';
    void g.offsetWidth;
    setTimeout(function(){ fill.style.transition = 'stroke-dasharray 1.2s cubic-bezier(.2,.75,.25,1)'; fill.style.strokeDasharray = pct + ' 100'; }, 900);
  }

  // ---- badges as neon pins: earned only from real record facts ----
  function renderBadges(v){
    var body = clear($('badgebody')), rec = season || { played: 0, winsSpy: 0, winsTop5: 0, winsPerfect: 0, streak: 0 };
    var practiced = v.mode === 'scoring' && v.wk.practice && v.any;
    var list = [
      ['Practice run', practiced, 'Score a team in the practice week.', 'You scored a team in the practice week.', 'flag', 'cyan'],
      ['First week', rec.played >= 1, 'Finish one real week with a saved team.', 'You finished a real week.', 'star', 'gold'],
      ['Beat the market', rec.winsSpy >= 1, 'Beat the S&P 500 in a real week.', 'You beat the S&P 500 in a real week.', 'up', 'pink'],
      ['Beat the Top 5', rec.winsTop5 >= 1, 'Outscore the five richest people in a real week.', 'You outscored the Top 5 richest.', 'crown', 'gold'],
      ['Hot streak', rec.streak >= 3, 'Beat the S&P 500 three weeks in a row.', 'Three weeks in a row beating the S&P 500.', 'flame', 'pink'],
      ['Perfect week', rec.winsPerfect >= 1, 'Match the best possible team in a week.', 'You matched the perfect team.', 'gem', 'cyan']
    ];
    var n = list.filter(function(b){ return b[1]; }).length;
    body.appendChild(el('p', 'ne-small', n + ' of ' + list.length + ' pins lit'));
    var ul = el('ul', 'ne-pins');
    list.forEach(function(b){
      var li = el('li', 'ne-pin ne-pin--' + b[5] + (b[1] ? ' is-earned' : ' is-locked'));
      var disc = hide(el('span', 'ne-pin__disc'));
      var s = svg('svg', { viewBox: '0 0 24 24', 'class': 'ne-pin__svg', focusable: 'false' });
      s.appendChild(svg('path', { d: ICON[b[4]] }));
      disc.appendChild(s);
      li.appendChild(disc);
      var t = el('span', 'ne-pin__txt');
      t.appendChild(el('span', 'ne-pin__name', b[0]));
      t.appendChild(el('span', 'ne-pin__state', b[1] ? 'Earned · ' + b[3] : 'Locked · ' + b[2]));
      li.appendChild(t);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  // ---- play-money coins (only from the online game when signed in) ----
  function renderCoins(){
    var box = clear($('coinbody'));
    var row = el('div', 'ne-coins__row');
    row.appendChild(hide(el('span', 'ne-coins__chip')));
    var t = el('div', 'ne-coins__txt');
    t.appendChild(el('span', 'ne-meter__k', 'Play-money coins'));
    if (acct && acct.signedIn && acct.me && typeof acct.me.coins === 'number'){
      t.appendChild(el('span', 'ne-coins__v num', Number(acct.me.coins).toLocaleString('en-US') + ' coins'));
      t.appendChild(el('span', 'ne-small', 'Play money only. No purchases, cash-out or prizes.'));
    } else {
      t.appendChild(el('span', 'ne-coins__v ne-coins__v--off', 'Sign in to get play-money coins'));
      var p = el('span', 'ne-small');
      p.appendChild(link('ne-link', 'Sign in on Leagues', '../leagues.html'));
      p.appendChild(document.createTextNode(' · no purchases, cash-out or prizes'));
      t.appendChild(p);
    }
    row.appendChild(t);
    box.appendChild(row);
  }

  // ---- celebration: one short neon-spark burst, never looping, never with reduced motion ----
  function celebrate(){
    if (reduced()) return;
    var box = clear($('burst'));
    var colors = ['#FF3EA5', '#22E4FF', '#FFD447', '#FFFFFF'];
    for (var i = 0; i < 34; i++){
      var c = el('span', 'ne-burst__p');
      var col = colors[i % colors.length];
      c.style.left = (5 + Math.random() * 90) + '%';
      c.style.background = col;
      c.style.boxShadow = '0 0 8px ' + col + ', 0 0 16px ' + col;
      c.style.animationDelay = Math.round(Math.random() * 500) + 'ms';
      c.style.animationDuration = (1400 + Math.round(Math.random() * 900)) + 'ms';
      c.style.setProperty('--dx', Math.round(Math.random() * 160 - 80) + 'px');
      c.style.setProperty('--rot', Math.round(Math.random() * 540 - 270) + 'deg');
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
    else { var im = el('img', 'ne-zoom__img'); im.src = src; im.alt = ''; face.appendChild(im); }
    $('cu-kick').textContent = cartoon ? 'Close-up · Portrait coming soon' : 'Close-up';
    $('cu-name').textContent = p.name + (isC ? ' · Captain' : '');
    $('cu-cap').textContent = typeof sal[slug] === 'number' ? String(sal[slug]) : '—';
    var pts = v && v.any ? v.res.bySlug[slug] : null;
    var ptd = clear($('cu-pts'));
    if (pts == null) ptd.appendChild(el('span', 'is-zero', 'No points yet'));
    else ptd.appendChild(el('span', numCls(pts), signedTxt(pts)));
    $('cu-ptsk').textContent = 'Team pts this week' + (v && v.wk && v.wk.practice ? ' (practice)' : '');
    $('cu-sector').textContent = p.sector || 'Other';
    $('cu-link').href = '../player.html?p=' + encodeURIComponent(slug);
    cuT.forEach(clearTimeout); cuT = [];
    zoom.className = 'ne-zoom' + (cartoon ? ' is-cartoon' : ' is-portrait');
    dlg.removeAttribute('hidden');
    document.documentElement.classList.add('v2-lock');
    $('cu-close').focus();
    if (reduced()){ zoom.className += ' is-zoomed is-rich is-static'; return; }
    void zoom.offsetWidth;
    cuT.push(setTimeout(function(){ zoom.classList.add('is-zoomed'); }, 30));
    cuT.push(setTimeout(function(){ zoom.classList.add('is-rich', 'is-sparkle'); }, 720));
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
    var b = e.target.closest && e.target.closest('.ne-card__btn');
    if (b) openCloseup(b.getAttribute('data-slug'), b);
  });

  // ---- page ----
  function renderAll(){
    var v = view();
    curView = v;
    var R = renderHero(v);
    renderFive(v); renderNext(); renderLevel(); renderBadges(v); renderCoins();
    var tot = v.any ? v.res.total : null;
    say(teamName() + '. ' + (tot == null ? 'No team points yet.' : 'Team total ' + plainTxt(tot) + ' fantasy points. Result: ' + R.word + '.'));
    if (R.win) setTimeout(celebrate, reduced() ? 0 : 2200);
  }
  function fail(){
    var box = clear($('heroin'));
    $('hero').removeAttribute('aria-busy');
    var sign = el('p', 'ne-sign ne-sign--title');
    sign.appendChild(el('span', 'ne-sign__tube', 'Tonight\'s total'));
    box.appendChild(sign);
    var h = el('h1', 'ne-hero__name', 'Your team'); h.id = 'teamname'; box.appendChild(h);
    box.appendChild(el('p', 'ne-hero__note', 'The game data is not available right now. Try again later.'));
    ['fivebody', 'nextbody', 'levelbody', 'badgebody'].forEach(function(id){ clear($(id)).appendChild(el('p', 'ne-small', 'Not available right now.')); });
    renderCoins();
    say('The game data is not available right now.');
  }

  if (window.BDAccount && window.BDAccount.onChange){
    window.BDAccount.onChange(function(a){
      acct = a;
      if (!F.state.loaded) return;
      renderCoins();
      var h = $('teamname'); if (h) h.textContent = teamName();
    });
  }
  load().then(renderAll, function(err){ if (window.console) console.warn(err); fail(); });
})();
