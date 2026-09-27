/* Billionaires Digest v2 MOCKUP, casino variation A2: "High roller VIP room" My team (mockups/team-vip.html). ES5, no globals.
   Same team logic and data as mockups/team-arcade.js (option A): ../data/fantasy/*, BDFantasyStore seeded by hand,
   scoring team / upcoming / none. Only the visual world changes: a private salon (lacquer, velvet, gold leaf).
   Game layer uses only real or transparently derived facts:
     streak, medals <- BDFantasyStore.pure.seasonRecord over finished real weeks you saved a team for
     XP / level     <- weeks played x100 + weeks beat the S&P 500 x50; a level every 500 XP (formula shown on the page)
     coins          <- BDAccount (game-client.js) only when signed in; otherwise "Sign in" text
     chip stack     <- decoration only: one chip per 20 points of the real team total (max 10), said on the page
   The close-up face is one made-up cartoon (portrait placeholder), never a real person. Play money only, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, BD = window.BD;
  if (!F || !C || !BD) return;
  var DATA = '../data/fantasy/';
  var MINUS = '−';
  var XP_WEEK = 100, XP_WIN = 50, XP_LEVEL = 500;
  var PTS_PER_CHIP = 20, MAX_CHIPS = 10;
  var el = BD.el, arr = BD.arr;
  var fmt = F.fmt;
  var $ = function(id){ return document.getElementById(id); };

  // One generic, original cartoon tycoon (same drawing as option A). Eyes swap to "$" when zoomed.
  var FACE = '<svg class="vp-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#7A1426"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="vp-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="vp-dollar" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="800" font-size="19" text-anchor="middle" fill="#08764A">' +
    '<text x="46" y="69">$</text><text x="74" y="69">$</text></g>' +
    '<circle cx="36" cy="80" r="5" fill="#E8918A" opacity=".45"/><circle cx="84" cy="80" r="5" fill="#E8918A" opacity=".45"/>' +
    '<path d="M60 70 q-3 6 0 9" stroke="#13171C" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M42 86 q9 -8 18 -1 q9 -7 18 1" stroke="#13171C" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M50 93 q10 7 20 0" stroke="#13171C" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M44 108 L60 100 L76 108 L60 116 Z" fill="#7A1426" stroke="#13171C" stroke-width="2"/>' +
    '</svg>';

  // Art-deco medallion emblems (original geometry, one per medal)
  var EMBLEMS = [
    '<path d="M20 8 L23 17 L32 17 L25 22 L28 31 L20 26 L12 31 L15 22 L8 17 L17 17 Z"/>',
    '<path d="M20 9 L31 20 L20 31 L9 20 Z"/><path d="M20 14 L26 20 L20 26 L14 20 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    '<path d="M9 28 L16 18 L21 23 L31 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 11 L31 11 L31 17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    '<rect x="9" y="22" width="4" height="9"/><rect x="15" y="17" width="4" height="14"/><rect x="21" y="12" width="4" height="19"/><rect x="27" y="8" width="4" height="23"/>',
    '<path d="M20 7 C25 14 29 18 26 25 C24 30 16 30 14 25 C12 20 16 17 17 12 C19 16 21 18 20 7 Z"/>',
    '<circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="20" cy="20" r="5"/>'
  ];
  function rays(){
    var s = '';
    for (var i = 0; i < 16; i++){
      var a = i * Math.PI / 8, x1 = 32 + Math.cos(a) * 22, y1 = 32 + Math.sin(a) * 22, x2 = 32 + Math.cos(a) * 28, y2 = 32 + Math.sin(a) * 28;
      s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
    }
    return s;
  }
  var RAYS = rays();
  function medalSvg(i){
    return '<svg class="vp-medal__svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<circle cx="32" cy="32" r="30" class="vp-medal__rim"/>' +
      '<circle cx="32" cy="32" r="20" class="vp-medal__face"/>' +
      '<g class="vp-medal__rays" stroke-width="1.4">' + RAYS + '</g>' +
      '<g class="vp-medal__emb" transform="translate(12 12)">' + EMBLEMS[i % EMBLEMS.length] + '</g>' +
      '</svg>';
  }
  // Velvet rope with two brass stanchions (decoration)
  var ROPE = '<svg class="vp-rope__svg" viewBox="0 0 320 90" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">' +
    '<defs><linearGradient id="vpBrass" x1="0" x2="1"><stop offset="0" stop-color="#7A5A1A"/><stop offset=".45" stop-color="#F3D98A"/><stop offset="1" stop-color="#8E6B1C"/></linearGradient>' +
    '<linearGradient id="vpVel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B0263F"/><stop offset=".5" stop-color="#6E0F22"/><stop offset="1" stop-color="#3A0612"/></linearGradient></defs>' +
    '<path d="M40 24 C110 78 210 78 280 24" fill="none" stroke="url(#vpVel)" stroke-width="10" stroke-linecap="round"/>' +
    '<path d="M40 22 C110 74 210 74 280 22" fill="none" stroke="#E07A8C" stroke-opacity=".35" stroke-width="2"/>' +
    '<g fill="url(#vpBrass)"><rect x="34" y="18" width="12" height="62" rx="2"/><rect x="274" y="18" width="12" height="62" rx="2"/>' +
    '<circle cx="40" cy="14" r="9"/><circle cx="280" cy="14" r="9"/><rect x="24" y="80" width="32" height="7" rx="3"/><rect x="264" y="80" width="32" height="7" rx="3"/></g>' +
    '</svg>';

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'is-pos' : (n < 0 ? 'is-neg' : 'is-zero'); }
  function reduced(){ return BD.reducedMotion(); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
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
  // portraits: only plain site-relative paths from window.BDPortraits (empty until the style is approved)
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? '../' + u : null; }
  function portrait(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? { img: safePath(p.img), dollar: safePath(p.dollar) } : { img: null, dollar: null };
  }
  function plate(p){
    var pic = portrait(p.slug);
    var a = el('span', 'v2-av vp-plate', pic.img ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic.img){ var im = el('img'); im.src = pic.img; im.alt = ''; a.appendChild(im); }
    return a;
  }

  // ---- odometer: each digit is a strip 0-9 0-9 that rolls to its value; the real value is in text for screen readers ----
  function odometer(box, value, signed, srText){
    clear(box);
    var txt = value == null ? '—' : (signed ? signedTxt(value) : plainTxt(value));
    box.appendChild(el('span', 'v2-sr', srText || txt));
    var vis = el('span', 'vp-odo__digits num');
    vis.setAttribute('aria-hidden', 'true');
    var strips = [];
    for (var i = 0; i < txt.length; i++){
      var ch = txt.charAt(i);
      if (/[0-9]/.test(ch)){
        var col = el('span', 'vp-odo__col'), strip = el('span', 'vp-odo__strip');
        for (var k = 0; k < 20; k++) strip.appendChild(el('span', 'vp-odo__d', String(k % 10)));
        col.appendChild(strip); vis.appendChild(col);
        strips.push({ s: strip, to: 10 + (+ch) });
      } else vis.appendChild(el('span', 'vp-odo__ch', ch));
    }
    if (value == null){ // unlit counter: blank windows, no number (the text above says why)
      clear(vis);
      for (var b = 0; b < 4; b++) vis.appendChild(el('span', 'vp-odo__ch vp-odo__blank', ''));
    }
    box.appendChild(vis);
    if (reduced()){ strips.forEach(function(x){ x.s.style.transform = 'translateY(' + (-x.to) + 'em)'; }); return; }
    void vis.offsetWidth;
    strips.forEach(function(x, j){
      x.s.style.transition = 'transform ' + (1100 + j * 260) + 'ms cubic-bezier(.2,.75,.25,1.02) ' + (j * 90) + 'ms';
      x.s.style.transform = 'translateY(' + (-x.to) + 'em)';
    });
  }

  // ---- data: same week choice as BDFantasyStore.init (draft week salaries, scoring week points) ----
  var season = null; // seasonRecord result, or { played: 0 } when there are no finished real weeks with a saved team
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

  // ---- which team the page shows (same as team.js) ----
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

  // ---- one gold shimmer sweep, then the class comes off (never with reduced motion) ----
  function shimmer(node, delay){
    if (reduced() || !node) return;
    setTimeout(function(){
      node.classList.add('is-shimmer');
      setTimeout(function(){ node.classList.remove('is-shimmer'); }, 1500);
    }, delay || 0);
  }

  // ---- chip stack: decoration that grows with the real total (one chip per 20 points, max 10) ----
  function chipStack(total){
    var wrap = el('div', 'vp-stack');
    wrap.setAttribute('aria-hidden', 'true');
    var n = total == null ? 0 : Math.min(MAX_CHIPS, Math.max(1, Math.ceil(Math.abs(total) / PTS_PER_CHIP)));
    var tones = ['is-burg', 'is-black', 'is-ivory'];
    var cols = total == null ? [] : (n > 5 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n]);
    if (!cols.length){ wrap.appendChild(el('span', 'vp-stack__ring')); return wrap; }
    cols.forEach(function(count, c){
      var col = el('span', 'vp-stack__col');
      for (var i = 0; i < count; i++){
        var chip = el('span', 'vp-chip ' + (total < 0 ? 'is-black' : tones[(i + c) % 3]));
        chip.style.setProperty('--i', String(i + c * 2));
        col.appendChild(chip);
      }
      wrap.appendChild(col);
    });
    return wrap;
  }

  // ---- hero: the private table ----
  function renderHero(v){
    var S = F.state, box = clear($('heroin')), hero = $('hero');
    hero.removeAttribute('aria-busy');
    var weekId = v.mode === 'scoring' ? v.wk.week : S.draftWeek;
    var top = el('div', 'vp-salon__top');
    top.appendChild(el('span', 'vp-kicker', 'The private table · ' + fmt.weekTitle(weekId)));
    var sw = statusWord(v);
    if (sw) top.appendChild(el('span', 'vp-status', sw));
    box.appendChild(top);
    var h = el('h1', 'vp-salon__name', teamName()); h.id = 'teamname';
    box.appendChild(h);

    var grid = el('div', 'vp-salon__grid');
    var total = v.any ? v.res.total : null;

    var main = el('div', 'vp-meter vp-meter--main');
    main.appendChild(chipStack(total));
    var plaque = el('div', 'vp-plaque');
    plaque.appendChild(el('span', 'vp-plaque__k', 'Team total · fantasy points'));
    var odo = el('div', 'vp-odo vp-odo--big ' + (total == null ? 'is-zero' : numCls(total)));
    plaque.appendChild(odo);
    main.appendChild(plaque);
    grid.appendChild(main);

    var L = lamp(v);
    var seal = el('div', 'vp-seal ' + L.cls);
    seal.appendChild(el('span', 'vp-seal__k', 'Result'));
    seal.appendChild(el('span', 'vp-seal__word', L.word));
    grid.appendChild(seal);

    var side = el('div', 'vp-meter vp-meter--vs');
    var p2 = el('div', 'vp-plaque vp-plaque--sm');
    p2.appendChild(el('span', 'vp-plaque__k', 'Vs S&P 500'));
    var bm = bench(v), diff = bm == null ? null : total - bm;
    var odo2 = el('div', 'vp-odo vp-odo--mid ' + (diff == null ? 'is-zero' : numCls(diff)));
    p2.appendChild(odo2);
    side.appendChild(p2);
    side.appendChild(el('span', 'vp-meter__sub', bm == null
      ? (v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.')
      : 'S&P 500 scored ' + plainTxt(bm) + ' fantasy points'));
    grid.appendChild(side);
    box.appendChild(grid);

    var note = scoringNote(v);
    if (note) box.appendChild(el('p', 'vp-salon__note', note));
    box.appendChild(el('p', 'vp-small vp-salon__chipnote', total == null
      ? 'No chips on the table until your first points arrive.'
      : 'One chip for every ' + PTS_PER_CHIP + ' points (up to ' + MAX_CHIPS + '). Decoration only, never money.'));

    odometer(odo, total, false, total == null ? 'No team points yet' : 'Team total: ' + plainTxt(total) + ' fantasy points');
    odometer(odo2, diff, true, diff == null ? 'Versus S&P 500: no comparison yet' : 'Versus S&P 500: ' + signedTxt(diff) + ' points');
    if (!reduced()){
      hero.classList.add('is-dealing');
      setTimeout(function(){ hero.classList.remove('is-dealing'); }, 2000);
    }
    shimmer(plaque, 1500);
    return L;
  }

  // ---- starting five: VIP membership cards ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    $('fivehint').hidden = v.mode === 'none';
    if (v.mode === 'none'){
      meta.textContent = '';
      var e = el('div', 'vp-empty');
      for (var i = 0; i < 5; i++){
        var ph = el('div', 'vp-empty__card');
        ph.setAttribute('aria-hidden', 'true');
        ph.appendChild(el('span', 'vp-empty__no', 'No. 0' + (i + 1)));
        ph.appendChild(el('span', 'vp-empty__q', 'Reserved'));
        e.appendChild(ph);
      }
      body.appendChild(e);
      var t = el('div', 'vp-empty__txt');
      t.appendChild(el('h3', 'vp-h3', 'Five seats, all reserved for you'));
      t.appendChild(el('p', null, 'Pick five billionaires under a ' + C.CAP + '-point cap and choose a captain, who scores 1.5 times. Your team scores on their real, disclosed stock holdings each trading day.'));
      var b = el('div', 'vp-btnrow');
      b.appendChild(link('vp-btn vp-btn--gold', 'Go to the Draft room', '../draft.html'));
      b.appendChild(link('vp-btn vp-btn--ghost', 'Lucky five', '../draft.html'));
      t.appendChild(b);
      body.appendChild(t);
      return;
    }
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var ul = el('ul', 'vp-cards');
    ul.setAttribute('aria-label', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.'));
    var capCard = null;
    orderedPicks(v.team).forEach(function(slug, i){
      var p = F.person(slug), isC = slug === v.team.captain;
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var pts = v.any ? v.res.bySlug[slug] : null;
      var li = el('li', 'vp-card' + (isC ? ' is-captain' : ''));
      li.style.setProperty('--i', String(i));
      var btn = el('button', 'vp-card__btn');
      btn.type = 'button';
      btn.setAttribute('data-slug', slug);
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-label', 'Close-up of ' + p.name + (isC ? ', captain, scores 1.5 times' : '') +
        '. Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : 'unknown') +
        (base == null ? '. No points yet.' : '. Base ' + signedTxt(base) + ' points, team ' + signedTxt(pts) + ' points.'));
      var head = el('span', 'vp-card__head');
      head.appendChild(el('span', 'vp-card__club', isC ? 'Captain' : 'Member'));
      head.appendChild(el('span', 'vp-card__no num', 'No. 0' + (i + 1)));
      btn.appendChild(head);
      var frame = el('span', 'vp-card__frame');
      frame.appendChild(plate(p));
      btn.appendChild(frame);
      if (isC) btn.appendChild(el('span', 'vp-capt', '×1.5 Captain'));
      btn.appendChild(el('span', 'vp-card__name', p.name));
      btn.appendChild(el('span', 'vp-card__sector', p.sector || 'Other'));
      var dl = el('span', 'vp-card__lines');
      var l1 = el('span', 'vp-card__line'); l1.appendChild(el('span', null, 'Cap')); l1.appendChild(el('span', 'num', typeof sal[slug] === 'number' ? String(sal[slug]) : '—'));
      var l2 = el('span', 'vp-card__line'); l2.appendChild(el('span', null, 'Base')); l2.appendChild(el('span', 'num', base == null ? '—' : signedTxt(base)));
      dl.appendChild(l1); dl.appendChild(l2);
      btn.appendChild(dl);
      var foil = el('span', 'vp-foil');
      foil.appendChild(el('span', 'vp-foil__v num ' + (pts == null ? 'is-zero' : numCls(pts)), pts == null ? '—' : signedTxt(pts)));
      foil.appendChild(el('span', 'vp-foil__k', 'team pts'));
      btn.appendChild(foil);
      li.appendChild(btn);
      ul.appendChild(li);
      if (isC) capCard = btn;
    });
    body.appendChild(ul);
    if (!reduced()){
      ul.classList.add('is-dealing');
      setTimeout(function(){ ul.classList.remove('is-dealing'); }, 1900);
    }
    shimmer(capCard, 1900);
  }

  // ---- next round: velvet rope, lock countdown ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    var ropeBox = el('div', 'vp-rope__art');
    ropeBox.innerHTML = ROPE;
    body.appendChild(ropeBox);
    var cd = el('p', 'vp-next__cd');
    cd.appendChild(el('span', 'vp-next__k', 'Next round locks in'));
    var v = el('span', 'vp-next__v num'); v.id = 'countdown';
    cd.appendChild(v);
    body.appendChild(cd);
    body.appendChild(el('p', 'vp-next__when', fmt.weekTitle(S.draftWeek) + ' · ' + nyFmt(info.locksAt, { weekday: 'long' }) + ' ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET'));
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('vp-btn vp-btn--gold vp-btn--big vp-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', '../draft.html'));
    body.appendChild(link('vp-btn vp-btn--ghost vp-btn--block', 'Lucky five', '../draft.html'));
    body.appendChild(el('p', 'vp-small', 'Lucky five deals a random team that fits the cap. It lives in the Draft room.'));
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
  }
  function tick(){
    var S = F.state, cd = $('countdown');
    if (!cd || !S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek), t = F.now();
    cd.textContent = t >= info.locksAt ? 'Closed. Reload for the next round.' : span(info.locksAt - t);
  }

  // ---- streak and level (derived, formula on the page) ----
  function xpOf(rec){ return rec.played * XP_WEEK + rec.winsSpy * XP_WIN; }
  function renderLevel(){
    var body = clear($('levelbody')), rec = season || { played: 0, winsSpy: 0, streak: 0 };
    var S = F.state;
    var sm = el('div', 'vp-streak');
    sm.appendChild(el('span', 'vp-meter__k', 'Streak · weeks beating the S&P 500'));
    var row = el('span', 'vp-streak__chips');
    row.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 5; i++) row.appendChild(el('span', 'vp-streak__c' + (i < rec.streak ? ' is-lit' : '')));
    sm.appendChild(row);
    var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
    var stxt;
    if (!rec.played) stxt = 'Start your streak Monday' + (first ? ' (' + fmt.shortDate(first) + ')' : '') + '.';
    else if (!rec.streak) stxt = 'No streak right now. Beat the S&P 500 this week to start one.';
    else stxt = rec.streak + (rec.streak === 1 ? ' week' : ' weeks') + ' in a row beating the S&P 500.';
    sm.appendChild(el('p', 'vp-streak__txt', stxt));
    body.appendChild(sm);

    var xp = xpOf(rec), level = 1 + Math.floor(xp / XP_LEVEL), into = xp % XP_LEVEL;
    var lv = el('div', 'vp-xp');
    var r2 = el('div', 'vp-xp__row');
    r2.appendChild(el('span', 'vp-xp__lvl', 'Level ' + level));
    r2.appendChild(el('span', 'vp-xp__n num', xp + ' XP'));
    lv.appendChild(r2);
    var bar = el('div', 'vp-xp__bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'XP toward level ' + (level + 1));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(XP_LEVEL));
    bar.setAttribute('aria-valuenow', String(into));
    bar.setAttribute('aria-valuetext', into + ' of ' + XP_LEVEL + ' XP');
    var fill = el('span', 'vp-xp__fill');
    fill.style.width = (into / XP_LEVEL * 100) + '%';
    bar.appendChild(fill);
    lv.appendChild(bar);
    var why = el('p', 'vp-small');
    why.appendChild(document.createTextNode((XP_LEVEL - into) + ' XP to level ' + (level + 1) + '. '));
    why.appendChild(el('span', 'vp-formula', rec.played + ' weeks × ' + XP_WEEK + ' + ' + rec.winsSpy + ' wins × ' + XP_WIN + ' = ' + xp + ' XP'));
    why.appendChild(document.createTextNode(' '));
    why.appendChild(link('vp-link', 'How XP works', '#xpnote'));
    lv.appendChild(why);
    body.appendChild(lv);
  }

  // ---- medals: earned only from real record facts ----
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
    body.appendChild(el('p', 'vp-small', n + ' of ' + list.length + ' medals earned'));
    var ul = el('ul', 'vp-medals');
    list.forEach(function(b, i){
      var li = el('li', 'vp-medal' + (b[1] ? ' is-earned' : ' is-locked'));
      var disc = el('span', 'vp-medal__disc');
      disc.innerHTML = medalSvg(i);
      li.appendChild(disc);
      var t = el('span', 'vp-medal__txt');
      t.appendChild(el('span', 'vp-medal__name', b[0]));
      t.appendChild(el('span', 'vp-medal__state', b[1] ? 'Earned · ' + b[3] : 'Locked · ' + b[2]));
      li.appendChild(t);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  // ---- play-money coins (only from the online game when signed in) ----
  function renderCoins(){
    var box = clear($('coinbody'));
    var row = el('div', 'vp-coins__row');
    var disc = el('span', 'vp-coins__disc');
    disc.setAttribute('aria-hidden', 'true');
    row.appendChild(disc);
    var t = el('div', 'vp-coins__txt');
    t.appendChild(el('span', 'vp-meter__k', 'Play-money coins'));
    if (acct && acct.signedIn && acct.me && typeof acct.me.coins === 'number'){
      t.appendChild(el('span', 'vp-coins__v num', Number(acct.me.coins).toLocaleString('en-US') + ' coins'));
      t.appendChild(el('span', 'vp-small', 'Play money only. No purchases, cash-out or prizes.'));
    } else {
      t.appendChild(el('span', 'vp-coins__v vp-coins__v--off', 'Sign in to get play-money coins'));
      var p = el('span', 'vp-small');
      p.appendChild(link('vp-link', 'Sign in on Leagues', '../leagues.html'));
      p.appendChild(document.createTextNode(' · no purchases, cash-out or prizes'));
      t.appendChild(p);
    }
    row.appendChild(t);
    box.appendChild(row);
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
    else { var im = el('img', 'vp-zoom__img'); im.src = src; im.alt = ''; face.appendChild(im); }
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
    zoom.className = 'vp-zoom' + (cartoon ? ' is-cartoon' : ' is-portrait');
    dlg.removeAttribute('hidden');
    document.documentElement.classList.add('v2-lock');
    $('cu-close').focus();
    if (reduced()){ zoom.className += ' is-zoomed is-rich is-static'; return; }
    void zoom.offsetWidth;
    cuT.push(setTimeout(function(){ zoom.classList.add('is-zoomed'); }, 30));
    cuT.push(setTimeout(function(){ zoom.classList.add('is-rich', 'is-shimmer'); }, 720));
    cuT.push(setTimeout(function(){ zoom.classList.remove('is-shimmer'); }, 2000));
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
    var b = e.target.closest && e.target.closest('.vp-card__btn');
    if (b) openCloseup(b.getAttribute('data-slug'), b);
  });

  // ---- page ----
  function renderAll(){
    var v = view();
    curView = v;
    var L = renderHero(v);
    renderFive(v); renderNext(); renderLevel(); renderBadges(v); renderCoins();
    var tot = v.any ? v.res.total : null;
    say(teamName() + '. ' + (tot == null ? 'No team points yet.' : 'Team total ' + plainTxt(tot) + ' fantasy points. Result: ' + L.word + '.'));
  }
  function fail(){
    var box = clear($('heroin'));
    $('hero').removeAttribute('aria-busy');
    box.appendChild(el('span', 'vp-kicker', 'The private table'));
    var h = el('h1', 'vp-salon__name', 'Your team'); h.id = 'teamname'; box.appendChild(h);
    box.appendChild(el('p', 'vp-salon__note', 'The game data is not available right now. Try again later.'));
    ['fivebody', 'nextbody', 'levelbody', 'badgebody'].forEach(function(id){ clear($(id)).appendChild(el('p', 'vp-small', 'Not available right now.')); });
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
