/* Billionaires Digest v2 MOCKUP, casino variation A4: "Classic fruit machine" My team (mockups/team-fruit.html). ES5, no globals.
   Same data + team logic as mockups/team-arcade.js (option A): ../data/fantasy/*, BDFantasyStore seeded by hand (incl. the
   working draft), scoring / upcoming / none. Only the visual world changes.
   Game layer uses only real or transparently derived facts:
     streak, tokens  <- BDFantasyStore.pure.seasonRecord over finished real weeks you saved a team for
     XP / level      <- weeks played x100 + weeks beat the S&P 500 x50; a level every 500 XP (formula shown on the page)
     coins           <- BDAccount (game-client.js) only when signed in; otherwise "Sign in" text
   The close-up face is one made-up cartoon (portrait placeholder), never a real person. Play money only, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, BD = window.BD;
  if (!F || !C || !BD) return;
  var DATA = '../data/fantasy/';
  var MINUS = '−';
  var XP_WEEK = 100, XP_WIN = 50, XP_LEVEL = 500;
  var el = BD.el, arr = BD.arr;
  var fmt = F.fmt;
  var $ = function(id){ return document.getElementById(id); };

  // One generic, original cartoon tycoon (same drawing as option A). Eyes swap to "$" when zoomed.
  var FACE = '<svg class="fm-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#B3201A"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="fm-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="fm-dollar" font-family="Alfa Slab One, Barlow Condensed, Arial Narrow, Arial, sans-serif" font-size="16" text-anchor="middle" fill="#08764A">' +
    '<text x="46" y="68">$</text><text x="74" y="68">$</text></g>' +
    '<circle cx="36" cy="80" r="5" fill="#E8918A" opacity=".45"/><circle cx="84" cy="80" r="5" fill="#E8918A" opacity=".45"/>' +
    '<path d="M60 70 q-3 6 0 9" stroke="#13171C" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M42 86 q9 -8 18 -1 q9 -7 18 1" stroke="#13171C" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M50 93 q10 7 20 0" stroke="#13171C" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  // Fruit-machine symbols for the enamel tokens (original drawings, no logos). viewBox 0 0 40 40.
  var SYM = {
    lemon: '<ellipse cx="20" cy="21" rx="14" ry="10.5" fill="#F4C92A" stroke="#6B4A00" stroke-width="2"/><path d="M6 21 l-3 0 M34 21 l3 0" stroke="#6B4A00" stroke-width="2.4" stroke-linecap="round"/><path d="M14 17 q5 -3 10 0" stroke="#FFF3B0" stroke-width="2" fill="none" stroke-linecap="round"/>',
    cherry: '<path d="M14 26 q2 -12 12 -19 M26 27 q-2 -10 0 -20" stroke="#2F5E1E" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M26 7 q6 -1 8 4 q-6 1 -8 -4z" fill="#3F8A2A"/><circle cx="13" cy="28" r="7" fill="#C8201A" stroke="#5A0906" stroke-width="2"/><circle cx="27" cy="29" r="7" fill="#C8201A" stroke="#5A0906" stroke-width="2"/><circle cx="11" cy="26" r="1.8" fill="#FFD6CF"/><circle cx="25" cy="27" r="1.8" fill="#FFD6CF"/>',
    bell: '<path d="M20 5 q-10 0 -10 13 l0 7 l-4 5 l28 0 l-4 -5 l0 -7 q0 -13 -10 -13z" fill="#E7B53A" stroke="#5E4200" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="33" r="3.5" fill="#E7B53A" stroke="#5E4200" stroke-width="2"/><path d="M15 12 q-2 4 -2 10" stroke="#FFF1BF" stroke-width="2" fill="none" stroke-linecap="round"/>',
    bar: '<rect x="4" y="13" width="32" height="14" rx="2" fill="#1C2B4A" stroke="#0A1020" stroke-width="2"/><text x="20" y="24.5" text-anchor="middle" font-family="Alfa Slab One, Arial Black, Arial, sans-serif" font-size="11" fill="#F6EBD2">BAR</text>',
    seven: '<path d="M8 8 l24 0 l0 5 q-9 8 -11 21 l-7 0 q2 -12 10 -20 l-16 0z" fill="#C8201A" stroke="#5A0906" stroke-width="2" stroke-linejoin="round"/>',
    star: '<path d="M20 4 l4.6 10 l10.9 1.2 l-8.1 7.4 l2.3 10.8 l-9.7 -5.5 l-9.7 5.5 l2.3 -10.8 l-8.1 -7.4 l10.9 -1.2z" fill="#2E9B4F" stroke="#0E3F1E" stroke-width="2" stroke-linejoin="round"/>'
  };
  function symbol(name){ return '<svg class="fm-sym" viewBox="0 0 40 40" aria-hidden="true" focusable="false">' + SYM[name] + '</svg>'; }

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
    var a = el('span', 'v2-av fm-plate', pic.img ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic.img){ var im = el('img'); im.src = pic.img; im.alt = ''; a.appendChild(im); }
    return a;
  }

  // ---- mechanical drums: each digit is a cream drum whose strip rolls three turns, then settles on the payline.
  //      The real value is in sr-only text; the drums are aria-hidden. Returns a replay function. ----
  var TURNS = 3;
  function drums(box, value, signed, srText){
    clear(box);
    var txt = value == null ? '' : (signed ? signedTxt(value) : plainTxt(value));
    box.appendChild(el('span', 'v2-sr', srText || txt));
    var vis = el('span', 'fm-drums num');
    vis.setAttribute('aria-hidden', 'true');
    var strips = [];
    if (value == null){ // unlit machine: four blank drums (the text says why)
      for (var b = 0; b < 4; b++){ var bd = el('span', 'fm-drum fm-drum--blank'); bd.appendChild(el('span', 'fm-drum__sym', '·')); vis.appendChild(bd); }
    } else {
      for (var i = 0; i < txt.length; i++){
        var ch = txt.charAt(i), drum = el('span', 'fm-drum');
        if (/[0-9]/.test(ch)){
          var strip = el('span', 'fm-drum__strip');
          for (var k = 0; k < 10 * (TURNS + 1); k++) strip.appendChild(el('span', 'fm-drum__d', String(k % 10)));
          drum.appendChild(strip);
          strips.push({ s: strip, to: 10 * TURNS + (+ch) });
        } else { drum.className += ' fm-drum--sign'; drum.appendChild(el('span', 'fm-drum__sym', ch)); }
        vis.appendChild(drum);
      }
    }
    box.appendChild(vis);
    function place(x){ x.s.style.transform = 'translateY(' + (-x.to) + 'em)'; }
    function play(){
      if (reduced()){ strips.forEach(function(x){ x.s.style.transition = 'none'; place(x); }); return; }
      strips.forEach(function(x){ x.s.style.transition = 'none'; x.s.style.transform = 'translateY(0)'; });
      void vis.offsetWidth;
      strips.forEach(function(x, j){
        // each drum stops a beat after the one before, with a small mechanical overshoot
        x.s.style.transition = 'transform ' + (1000 + j * 380) + 'ms cubic-bezier(.25,.6,.3,1.08) ' + (j * 60) + 'ms';
        place(x);
      });
    }
    play();
    return { play: play, ms: 1000 + strips.length * 440 };
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
  // brass plate: the result in words (never color alone)
  function result(v){
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

  // ---- hero: the machine ----
  var reveal = null; // { total, vs, plate } replays for the lever
  function renderHero(v){
    var S = F.state, box = clear($('heroin')), hero = $('hero');
    hero.removeAttribute('aria-busy');
    var weekId = v.mode === 'scoring' ? v.wk.week : S.draftWeek;
    var mq = el('div', 'fm-marquee');
    mq.appendChild(el('span', 'fm-marquee__t', 'Weekly jackpot'));
    var sub = el('span', 'fm-marquee__sub');
    sub.appendChild(el('span', null, fmt.weekTitle(weekId)));
    var sw = statusWord(v);
    if (sw) sub.appendChild(el('span', 'fm-status', sw));
    mq.appendChild(sub);
    box.appendChild(mq);
    var h = el('h1', 'fm-name', teamName()); h.id = 'teamname';
    box.appendChild(h);

    var total = v.any ? v.res.total : null;
    var reel = el('div', 'fm-reelbox');
    reel.appendChild(el('span', 'fm-label', 'Team total · fantasy points'));
    var win = el('div', 'fm-window fm-window--big ' + (total == null ? 'is-zero' : numCls(total)));
    var dz = el('div', 'fm-drumset');
    win.appendChild(dz);
    var pay = el('span', 'fm-payline');
    pay.setAttribute('aria-hidden', 'true');
    pay.appendChild(el('span', 'fm-payline__tag', 'Payline'));
    win.appendChild(pay);
    reel.appendChild(win);
    var grid = el('div', 'fm-hero-grid');
    grid.appendChild(reel);

    var low = el('div', 'fm-low');
    var side = el('div', 'fm-vs');
    side.appendChild(el('span', 'fm-label', 'Vs S&P 500'));
    var bm = bench(v), diff = bm == null ? null : total - bm;
    var win2 = el('div', 'fm-window fm-window--mid ' + (diff == null ? 'is-zero' : numCls(diff)));
    var dz2 = el('div', 'fm-drumset');
    win2.appendChild(dz2);
    var pay2 = el('span', 'fm-payline fm-payline--thin');
    pay2.setAttribute('aria-hidden', 'true');
    win2.appendChild(pay2);
    side.appendChild(win2);
    side.appendChild(el('span', 'fm-vs__sub', bm == null
      ? (v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.')
      : 'S&P 500 scored ' + plainTxt(bm) + ' fantasy points'));
    low.appendChild(side);

    var R = result(v);
    var pl = el('div', 'fm-brass ' + R.cls);
    pl.appendChild(el('span', 'fm-brass__screw fm-brass__screw--l'));
    pl.appendChild(el('span', 'fm-brass__k', 'Result'));
    pl.appendChild(el('span', 'fm-brass__word', R.word));
    pl.appendChild(el('span', 'fm-brass__screw fm-brass__screw--r'));
    low.appendChild(pl);
    grid.appendChild(low);
    box.appendChild(grid);

    var note = scoringNote(v);
    if (note) box.appendChild(el('p', 'fm-note', note));

    var a = drums(dz, total, false, total == null ? 'No team points yet' : 'Team total: ' + plainTxt(total) + ' fantasy points');
    var b = drums(dz2, diff, true, diff == null ? 'Versus S&P 500: no comparison yet' : 'Versus S&P 500: ' + signedTxt(diff) + ' points');
    function stamp(){
      if (reduced()) return;
      pl.classList.remove('is-stamp'); void pl.offsetWidth; pl.classList.add('is-stamp');
    }
    setTimeout(stamp, Math.max(a.ms, b.ms) - 200);
    reveal = { a: a, b: b, stamp: stamp };
    $('lever').disabled = false;
    return R;
  }

  // ---- lever: one pull animation, then the drums roll again ----
  var pulling = false;
  $('lever').addEventListener('click', function(){
    if (!reveal || pulling) return;
    var lev = $('lever');
    if (reduced()){ reveal.a.play(); reveal.b.play(); say('Reveal replayed.'); return; }
    pulling = true;
    lev.classList.remove('is-pulled'); void lev.offsetWidth; lev.classList.add('is-pulled');
    setTimeout(function(){ reveal.a.play(); reveal.b.play(); }, 380);
    setTimeout(reveal.stamp, 380 + Math.max(reveal.a.ms, reveal.b.ms) - 200);
    setTimeout(function(){ lev.classList.remove('is-pulled'); pulling = false; }, 950);
  });

  // ---- starting five: drum windows on a lit glass panel ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    $('fivehint').hidden = v.mode === 'none';
    if (v.mode === 'none'){
      meta.textContent = '';
      var e = el('div', 'fm-empty');
      for (var i = 0; i < 5; i++){
        var ph = el('div', 'fm-empty__slot');
        ph.setAttribute('aria-hidden', 'true');
        ph.appendChild(el('span', 'fm-empty__q', '?'));
        e.appendChild(ph);
      }
      body.appendChild(e);
      var t = el('div', 'fm-empty__txt');
      t.appendChild(el('h3', 'fm-h3', 'Five empty drums'));
      t.appendChild(el('p', null, 'Pick five billionaires under a ' + C.CAP + '-point cap and choose a captain, who scores 1.5 times. Your team scores on their real, disclosed stock holdings each trading day.'));
      var b = el('div', 'fm-btnrow');
      b.appendChild(link('fm-btn fm-btn--gold', 'Go to the Draft room', '../draft.html'));
      b.appendChild(link('fm-btn fm-btn--ghost', 'Lucky five', '../draft.html'));
      t.appendChild(b);
      body.appendChild(t);
      return;
    }
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var ul = el('ul', 'fm-five');
    ul.setAttribute('aria-label', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.'));
    orderedPicks(v.team).forEach(function(slug, i){
      var p = F.person(slug), isC = slug === v.team.captain;
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var pts = v.any ? v.res.bySlug[slug] : null;
      var li = el('li', 'fm-slot' + (isC ? ' is-captain' : ''));
      li.style.setProperty('--i', String(i));
      var btn = el('button', 'fm-slot__btn');
      btn.type = 'button';
      btn.setAttribute('data-slug', slug);
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-label', 'Close-up of ' + p.name + (isC ? ', captain, scores 1.5 times' : '') +
        '. Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : 'unknown') +
        (base == null ? '. No points yet.' : '. Base ' + signedTxt(base) + ' points, team ' + signedTxt(pts) + ' points.'));
      var win = el('span', 'fm-slot__win');
      var drum = el('span', 'fm-slot__drum');
      drum.appendChild(plate(p));
      drum.appendChild(el('span', 'fm-slot__name', p.name));
      win.appendChild(drum);
      btn.appendChild(win);
      if (isC){
        var st = el('span', 'fm-stamp');
        st.appendChild(el('span', 'fm-stamp__x', '×1.5'));
        st.appendChild(el('span', 'fm-stamp__k', 'Captain'));
        btn.appendChild(st);
      }
      btn.appendChild(el('span', 'fm-slot__sector', p.sector || 'Other'));
      var stats = el('span', 'fm-slot__stats');
      stats.appendChild(el('span', 'fm-chip num', 'Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : '—')));
      stats.appendChild(el('span', 'fm-chip num', 'Base ' + (base == null ? '—' : signedTxt(base))));
      btn.appendChild(stats);
      var pv = el('span', 'fm-pts');
      pv.appendChild(el('span', 'fm-pts__v num ' + (pts == null ? 'is-zero' : numCls(pts)), pts == null ? '—' : signedTxt(pts)));
      pv.appendChild(el('span', 'fm-pts__k', 'team pts'));
      btn.appendChild(pv);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    if (!reduced()){
      ul.classList.add('is-rolling');
      setTimeout(function(){ ul.classList.remove('is-rolling'); }, 2400);
    }
  }

  // ---- next round: vintage ticket with the lock countdown ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    var cd = el('p', 'fm-next__cd');
    cd.appendChild(el('span', 'fm-next__k', 'Locks in'));
    var v = el('span', 'fm-next__v num'); v.id = 'countdown';
    cd.appendChild(v);
    body.appendChild(cd);
    body.appendChild(el('p', 'fm-next__when', fmt.weekTitle(S.draftWeek) + ' · ' + nyFmt(info.locksAt, { weekday: 'long' }) + ' ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET'));
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('fm-btn fm-btn--red fm-btn--big fm-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', '../draft.html'));
    body.appendChild(link('fm-btn fm-btn--ink fm-btn--block', 'Lucky five', '../draft.html'));
    body.appendChild(el('p', 'fm-small fm-small--ink', 'Lucky five spins a random team that fits the cap. It lives in the Draft room.'));
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
  }
  function tick(){
    var S = F.state, cd = $('countdown');
    if (!cd || !S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek), t = F.now();
    cd.textContent = t >= info.locksAt ? 'Locked. Reload for the next round.' : span(info.locksAt - t);
  }

  // ---- streak (tally marks) and level (brass thermometer), formula on the page ----
  function xpOf(rec){ return rec.played * XP_WEEK + rec.winsSpy * XP_WIN; }
  function renderLevel(){
    var body = clear($('levelbody')), rec = season || { played: 0, winsSpy: 0, streak: 0 };
    var S = F.state;
    var sm = el('div', 'fm-streak');
    sm.appendChild(el('span', 'fm-label fm-label--cream', 'Streak · weeks beating the S&P 500'));
    var card = el('div', 'fm-tally');
    card.setAttribute('aria-hidden', 'true');
    var shown = Math.min(rec.streak, 15);
    if (!shown) card.appendChild(el('span', 'fm-tally__none', 'No marks yet'));
    for (var g = 0; g < Math.ceil(shown / 5); g++){
      var grp = el('span', 'fm-tally__g');
      var inG = Math.min(5, shown - g * 5);
      for (var m = 0; m < Math.min(inG, 4); m++) grp.appendChild(el('span', 'fm-tally__m'));
      if (inG === 5) grp.appendChild(el('span', 'fm-tally__x'));
      card.appendChild(grp);
    }
    if (rec.streak > 15) card.appendChild(el('span', 'fm-tally__more', '+' + (rec.streak - 15)));
    sm.appendChild(card);
    var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
    var stxt;
    if (!rec.played) stxt = 'Start your streak Monday' + (first ? ' (' + fmt.shortDate(first) + ')' : '') + '.';
    else if (!rec.streak) stxt = 'No streak right now. Beat the S&P 500 this week to start one.';
    else stxt = rec.streak + (rec.streak === 1 ? ' week' : ' weeks') + ' in a row beating the S&P 500.';
    sm.appendChild(el('p', 'fm-streak__txt', stxt));
    body.appendChild(sm);

    var xp = xpOf(rec), level = 1 + Math.floor(xp / XP_LEVEL), into = xp % XP_LEVEL;
    var lv = el('div', 'fm-xp');
    var thermo = el('div', 'fm-thermo');
    thermo.setAttribute('role', 'progressbar');
    thermo.setAttribute('aria-label', 'XP toward level ' + (level + 1));
    thermo.setAttribute('aria-valuemin', '0');
    thermo.setAttribute('aria-valuemax', String(XP_LEVEL));
    thermo.setAttribute('aria-valuenow', String(into));
    thermo.setAttribute('aria-valuetext', into + ' of ' + XP_LEVEL + ' XP');
    var tube = el('span', 'fm-thermo__tube');
    var fill = el('span', 'fm-thermo__fill');
    tube.appendChild(fill);
    thermo.appendChild(tube);
    thermo.appendChild(el('span', 'fm-thermo__bulb'));
    var scale = el('span', 'fm-thermo__scale');
    scale.setAttribute('aria-hidden', 'true');
    for (var s = XP_LEVEL; s >= 0; s -= 100) scale.appendChild(el('span', 'fm-thermo__tick num', String(s)));
    thermo.appendChild(scale);
    lv.appendChild(thermo);
    var info = el('div', 'fm-xp__info');
    info.appendChild(el('span', 'fm-xp__lvl', 'Level ' + level));
    info.appendChild(el('span', 'fm-xp__n num', xp + ' XP'));
    var why = el('p', 'fm-small');
    why.appendChild(document.createTextNode((XP_LEVEL - into) + ' XP to level ' + (level + 1) + '. '));
    why.appendChild(el('span', 'fm-formula', rec.played + ' weeks × ' + XP_WEEK + ' + ' + rec.winsSpy + ' wins × ' + XP_WIN + ' = ' + xp + ' XP'));
    why.appendChild(document.createTextNode(' '));
    why.appendChild(link('fm-link', 'How XP works', '#xpnote'));
    info.appendChild(why);
    lv.appendChild(info);
    body.appendChild(lv);
    var pct = (into / XP_LEVEL * 100) + '%';
    if (reduced()) fill.style.height = pct;
    else { fill.style.height = '0%'; void fill.offsetWidth; setTimeout(function(){ fill.style.height = pct; }, 300); }
  }

  // ---- enamel tokens: earned only from real record facts ----
  function renderBadges(v){
    var body = clear($('badgebody')), rec = season || { played: 0, winsSpy: 0, winsTop5: 0, winsPerfect: 0, streak: 0 };
    var practiced = v.mode === 'scoring' && v.wk.practice && v.any;
    var list = [
      ['Practice run', practiced, 'Score a team in the practice week.', 'You scored a team in the practice week.', 'lemon'],
      ['First week', rec.played >= 1, 'Finish one real week with a saved team.', 'You finished a real week.', 'cherry'],
      ['Beat the market', rec.winsSpy >= 1, 'Beat the S&P 500 in a real week.', 'You beat the S&P 500 in a real week.', 'bell'],
      ['Beat the Top 5', rec.winsTop5 >= 1, 'Outscore the five richest people in a real week.', 'You outscored the Top 5 richest.', 'bar'],
      ['Hot streak', rec.streak >= 3, 'Beat the S&P 500 three weeks in a row.', 'Three weeks in a row beating the S&P 500.', 'seven'],
      ['Perfect week', rec.winsPerfect >= 1, 'Match the best possible team in a week.', 'You matched the perfect team.', 'star']
    ];
    var n = list.filter(function(b){ return b[1]; }).length;
    body.appendChild(el('p', 'fm-small fm-small--cream', n + ' of ' + list.length + ' tokens earned'));
    var ul = el('ul', 'fm-tokens');
    list.forEach(function(b){
      var li = el('li', 'fm-token' + (b[1] ? ' is-earned' : ' is-locked'));
      var disc = el('span', 'fm-token__disc');
      disc.setAttribute('aria-hidden', 'true');
      disc.innerHTML = symbol(b[4]);
      li.appendChild(disc);
      var t = el('span', 'fm-token__txt');
      t.appendChild(el('span', 'fm-token__name', b[0]));
      t.appendChild(el('span', 'fm-token__state', b[1] ? 'Earned · ' + b[3] : 'Locked · ' + b[2]));
      li.appendChild(t);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  // ---- play-money coins (only from the online game when signed in) ----
  function renderCoins(){
    var box = clear($('coinbody'));
    var row = el('div', 'fm-coins__row');
    var disc = el('span', 'fm-coins__disc');
    disc.setAttribute('aria-hidden', 'true');
    row.appendChild(disc);
    var t = el('div', 'fm-coins__txt');
    t.appendChild(el('span', 'fm-label fm-label--cream', 'Play-money coins'));
    if (acct && acct.signedIn && acct.me && typeof acct.me.coins === 'number'){
      t.appendChild(el('span', 'fm-coins__v num', Number(acct.me.coins).toLocaleString('en-US') + ' coins'));
      t.appendChild(el('span', 'fm-small fm-small--cream', 'Play money only. No purchases, cash-out or prizes.'));
    } else {
      t.appendChild(el('span', 'fm-coins__v fm-coins__v--off', 'Sign in to get play-money coins'));
      var p = el('span', 'fm-small fm-small--cream');
      p.appendChild(link('fm-link', 'Sign in on Leagues', '../leagues.html'));
      p.appendChild(document.createTextNode(' · no purchases, cash-out or prizes'));
      t.appendChild(p);
    }
    row.appendChild(t);
    box.appendChild(row);
  }

  // ---- celebration: one short shower of brass tokens from the payout tray, never looping, never with reduced motion ----
  function celebrate(){
    if (reduced()) return;
    var box = clear($('burst'));
    for (var i = 0; i < 30; i++){
      var c = el('span', 'fm-burst__p' + (i % 4 === 0 ? ' is-red' : ''));
      c.style.left = (5 + Math.random() * 90) + '%';
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
    else { var im = el('img', 'fm-zoom__img'); im.src = src; im.alt = ''; face.appendChild(im); }
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
    zoom.className = 'fm-zoom' + (cartoon ? ' is-cartoon' : ' is-portrait');
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
    var b = e.target.closest && e.target.closest('.fm-slot__btn');
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
    if (R.win) setTimeout(celebrate, reduced() ? 0 : 1800);
  }
  function fail(){
    var box = clear($('heroin'));
    $('hero').removeAttribute('aria-busy');
    var mq = el('div', 'fm-marquee'); mq.appendChild(el('span', 'fm-marquee__t', 'Weekly jackpot')); box.appendChild(mq);
    var h = el('h1', 'fm-name', 'Your team'); h.id = 'teamname'; box.appendChild(h);
    box.appendChild(el('p', 'fm-note', 'The game data is not available right now. Try again later.'));
    ['fivebody', 'nextbody', 'levelbody', 'badgebody'].forEach(function(id){ clear($(id)).appendChild(el('p', 'fm-small', 'Not available right now.')); });
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
