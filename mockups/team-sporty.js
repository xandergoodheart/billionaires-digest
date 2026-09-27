/* Billionaires Digest v2 MOCKUP, style option B: "Sporty with game moments" My team (mockups/team-sporty.html). ES5, no globals.
   The approved light v2 My team (assets/v2/team.js, same classes from team.css) plus restrained game moments:
   score reveal (count-up with a short reel roll), streak flame chip + level/XP bar in the hero, a badges card,
   "Lucky five" in Next round, a one-time win/lead shimmer, captain row glow and the "$ eyes" close-up on player tap.
   Data: loaded the way mockups/slot-machine.js does it (../data/fantasy/*, BDFantasyStore state seeded by hand).
   Game layer uses only real or transparently derived facts (same rules as option A):
     streak, badges <- BDFantasyStore.pure.seasonRecord over finished real weeks you saved a team for
     XP / level     <- weeks played x100 + weeks beat the S&P 500 x50; a level every 500 XP (formula on the page)
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

  // One generic, original cartoon tycoon (same drawing as the Lucky five close-up). Eyes swap to "$" when zoomed.
  var FACE = '<svg class="sp-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#D62D27"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="sp-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="sp-dollar" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="800" font-size="19" text-anchor="middle" fill="#08764A">' +
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
  function getJson(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function optJson(u){ return getJson(u).then(null, function(){ return null; }); }
  function surname(name){
    var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').trim().split(/\s+/);
    return ws[ws.length - 1] || '';
  }
  function personHref(slug){ return '../player.html?p=' + encodeURIComponent(slug); }
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
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? '../' + u : null; }
  function portrait(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? { img: safePath(p.img), dollar: safePath(p.dollar) } : { img: null, dollar: null };
  }
  function avatar(p){
    var pic = portrait(p.slug);
    var a = el('span', 'v2-av', pic.img ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic.img){ var im = el('img'); im.src = pic.img; im.alt = ''; a.appendChild(im); }
    return a;
  }
  function tickers(p){
    var seen = {}, out = [];
    arr(p.holdings).forEach(function(h){ if (h && h.ticker && !seen[h.ticker]){ seen[h.ticker] = 1; out.push(h.ticker); } });
    return out.slice(0, 3).join(' · ');
  }
  function orderedPicks(team){
    var p = team.picks.slice();
    if (team.captain && p.indexOf(team.captain) > 0){ p.splice(p.indexOf(team.captain), 1); p.unshift(team.captain); }
    return p;
  }

  // ---- score reveal: digits roll up to the real value once (instantly with reduced motion) ----
  function reel(box, value, srText){
    clear(box);
    var txt = value == null ? '—' : plainTxt(value);
    box.appendChild(el('span', 'v2-sr', srText));
    var vis = el('span', 'sp-odo');
    vis.setAttribute('aria-hidden', 'true');
    var strips = [];
    for (var i = 0; i < txt.length; i++){
      var ch = txt.charAt(i);
      if (/[0-9]/.test(ch)){
        var col = el('span', 'sp-odo__col'), strip = el('span', 'sp-odo__strip');
        for (var k = 0; k < 20; k++) strip.appendChild(el('span', 'sp-odo__d', String(k % 10)));
        col.appendChild(strip); vis.appendChild(col);
        strips.push({ s: strip, to: 10 + (+ch) });
      } else vis.appendChild(el('span', 'sp-odo__ch', ch));
    }
    box.appendChild(vis);
    if (reduced()){ strips.forEach(function(x){ x.s.style.transform = 'translateY(' + (-x.to) + 'em)'; }); return; }
    void vis.offsetWidth;
    strips.forEach(function(x, j){
      x.s.style.transition = 'transform ' + (900 + j * 180) + 'ms cubic-bezier(.2,.75,.25,1) ' + (j * 60) + 'ms';
      x.s.style.transform = 'translateY(' + (-x.to) + 'em)';
    });
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
  function signedIn(){ return !!(acct && acct.enabled && acct.signedIn && acct.me); }
  function teamName(){ return signedIn() && acct.me.nickname ? acct.me.nickname : 'Your team'; }
  function bench(v){ return v.mode === 'scoring' && v.any && v.wk.benchmarks && typeof v.wk.benchmarks.spy === 'number' ? v.wk.benchmarks.spy : null; }
  function winState(v){
    var bm = bench(v);
    if (bm == null) return null;
    var diff = v.res.total - bm, over = F.weekOver(v.wk);
    if (diff > 0) return { word: over ? 'Beat the S&P 500' : 'Leading the S&P 500', win: true };
    if (diff < 0) return { word: over ? 'Lost to the S&P 500' : 'Behind the S&P 500', win: false };
    return { word: 'Tied with the S&P 500', win: false };
  }

  // ---- hero (team.js layout + score reveal, streak flame, level/XP) ----
  function renderHero(v){
    var S = F.state, hero = clear($('hero'));
    hero.removeAttribute('aria-busy');
    hero.className = 'v2-hero v2-hero--team sp-hero';
    var weekId = v.mode === 'scoring' ? v.wk.week : S.draftWeek;
    var main = el('div', 'v2-hero__main');
    main.appendChild(el('span', 'v2-kicker', 'Your team / ' + fmt.weekTitle(weekId)));
    var h = el('h1', 'v2-h1 v2-hero__name', teamName()); h.id = 'teamname';
    main.appendChild(h);
    var score = el('div', 'v2-hero__score');
    var total = v.any ? v.res.total : null;
    var num = el('span', 'v2-hero-num sp-hero-num');
    score.appendChild(num);
    score.appendChild(el('span', 'v2-label', 'Fantasy points'));
    main.appendChild(score);
    var note = scoringNote(v);
    if (note) main.appendChild(el('p', 'v2-hero__note', note));
    main.appendChild(gameRow());
    hero.appendChild(main);

    var benchBox = el('div', 'v2-hero__bench');
    var pillBox = el('div', 'v2-hero__pill');
    var pill = statusPill(v);
    if (pill) pillBox.appendChild(pill);
    benchBox.appendChild(pillBox);
    benchBox.appendChild(el('span', 'v2-label', 'Vs S&P 500 benchmark'));
    var bm = bench(v);
    var ws = v.mode === 'scoring' && v.any ? winState(v) : null;
    if (bm != null){
      var diff = total - bm;
      benchBox.appendChild(el('p', 'v2-hero__diff ' + numCls(diff), signedTxt(diff)));
      benchBox.appendChild(el('p', 'v2-hero__bm', 'Benchmark: ' + plainTxt(bm) + ' fantasy points'));
      if (ws) benchBox.appendChild(el('p', 'sp-result' + (ws.win ? ' is-win' : ''), ws.word + (v.wk.practice ? ' (practice)' : '')));
    } else {
      benchBox.appendChild(el('p', 'v2-hero__diff', '—'));
      benchBox.appendChild(el('p', 'v2-hero__bm', v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.'));
    }
    hero.appendChild(benchBox);
    reel(num, total, total == null ? 'No fantasy points yet' : plainTxt(total) + ' fantasy points');
    return ws;
  }
  function gameRow(){
    var rec = season || { played: 0, winsSpy: 0, streak: 0 };
    var S = F.state;
    var row = el('div', 'sp-game');
    // streak flame chip
    var chip = el('span', 'sp-flame' + (rec.streak > 0 ? ' is-lit' : ''));
    var ic = el('span', 'sp-flame__icon'); ic.setAttribute('aria-hidden', 'true');
    chip.appendChild(ic);
    var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
    var stxt;
    if (!rec.played) stxt = 'Start your streak Monday' + (first ? ', ' + fmt.shortDate(first) : '');
    else if (!rec.streak) stxt = 'No streak yet · beat the S&P 500 to start one';
    else stxt = rec.streak + '-week streak beating the S&P 500';
    chip.appendChild(el('span', null, stxt));
    row.appendChild(chip);
    // level + XP
    var xp = rec.played * XP_WEEK + rec.winsSpy * XP_WIN, level = 1 + Math.floor(xp / XP_LEVEL), into = xp % XP_LEVEL;
    var lv = el('div', 'sp-xp');
    var top = el('div', 'sp-xp__top');
    top.appendChild(el('span', 'sp-xp__lvl', 'Level ' + level));
    top.appendChild(el('span', 'sp-xp__n num', xp + ' XP · ' + (XP_LEVEL - into) + ' to level ' + (level + 1)));
    lv.appendChild(top);
    var bar = el('div', 'sp-xp__bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'XP toward level ' + (level + 1));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(XP_LEVEL));
    bar.setAttribute('aria-valuenow', String(into));
    bar.setAttribute('aria-valuetext', into + ' of ' + XP_LEVEL + ' XP');
    var fill = el('span', 'sp-xp__fill'); fill.style.width = (into / XP_LEVEL * 100) + '%';
    bar.appendChild(fill);
    lv.appendChild(bar);
    var how = el('p', 'sp-xp__how');
    how.appendChild(document.createTextNode(rec.played + ' weeks × ' + XP_WEEK + ' + ' + rec.winsSpy + ' wins × ' + XP_WIN + ' = ' + xp + ' XP · '));
    how.appendChild(link(null, 'How XP works', '#xpnote'));
    lv.appendChild(how);
    row.appendChild(lv);
    return row;
  }
  function scoringNote(v){
    if (v.mode === 'none') return 'No team yet. Draft five billionaires before the next lock.';
    if (v.any){
      if (v.team.lateFrom) return 'Late entry: scoring from ' + fmt.dayLabel(v.team.lateFrom) + '.';
      return '';
    }
    var start = v.mode === 'upcoming' ? C.weekInfo(v.weekId).start : ((v.team && v.team.lateFrom) || v.wk.start);
    if (!start) return '';
    if (F.now() < C.nyToUtc(start, 9, 30)) return (v.mode === 'upcoming' ? 'Starts ' : 'Scoring starts ') + weekdayLong(start) + ', ' + fmt.shortDate(start) + ' · 9:30 AM ET';
    return 'The first scores arrive after the market closes.';
  }
  function statusPill(v){
    if (v.mode === 'none') return null;
    var t, live = false;
    if (v.mode === 'upcoming') t = C.isPractice(v.weekId) ? 'Practice' : 'Upcoming';
    else if (v.wk.practice) t = 'Practice';
    else if (F.weekOver(v.wk)) t = 'Final';
    else if (v.any){ t = 'Live · through ' + fmt.dayLabel(v.res.scored[v.res.scored.length - 1]); live = true; }
    else { t = 'Live'; live = true; }
    return el('span', 'v2-pill' + (live ? ' v2-pill--live' : ''), t);
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

  // ---- starting five (team.js table; name opens the close-up; captain row glows) ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    if (v.mode === 'none'){
      meta.textContent = '';
      var e = el('div', 'v2-empty');
      e.appendChild(el('h3', 'v2-h2', 'Draft your starting five'));
      e.appendChild(el('p', null, 'Pick five billionaires under a ' + C.CAP + '-point cap and choose a captain, who scores 1.5 times. Your team scores on their real, disclosed stock holdings each trading day.'));
      var b = el('div', 'sp-btnrow');
      b.appendChild(link('v2-btn v2-btn--primary', 'Go to the Draft room', '../draft.html'));
      b.appendChild(link('v2-btn v2-btn--secondary', 'Lucky five', '../draft.html'));
      e.appendChild(b);
      body.appendChild(e);
      return;
    }
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var tbl = el('table', 'v2-table v2-five sp-five');
    tbl.appendChild(el('caption', 'v2-sr', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.') + ' Select a name for the close-up.'));
    var thead = el('thead'), hr = el('tr');
    [['Player', ''], ['Cap', 'n'], ['Base pts', 'n'], ['Multiplier', 'n'], ['Team pts', 'n']].forEach(function(x){
      var th = el('th', x[1] || null, x[0]); th.scope = 'col'; hr.appendChild(th);
    });
    thead.appendChild(hr); tbl.appendChild(thead);
    var tb = el('tbody');
    orderedPicks(v.team).forEach(function(slug){
      var p = F.person(slug), isC = slug === v.team.captain;
      var tr = el('tr', isC ? 'sp-capt' : null);
      var tdP = el('td', 'v2-five__p');
      var pl = el('div', 'v2-player');
      pl.appendChild(avatar(p));
      var tx = el('div', 'v2-player__txt');
      var nb = el('button', 'v2-player__name sp-namebtn', p.name);
      nb.type = 'button';
      nb.setAttribute('data-slug', slug);
      nb.setAttribute('aria-haspopup', 'dialog');
      nb.setAttribute('aria-label', 'Close-up of ' + p.name + (isC ? ', captain' : ''));
      tx.appendChild(nb);
      var tk = tickers(p);
      tx.appendChild(el('span', 'v2-player__sub', tk || p.sector || ''));
      pl.appendChild(tx);
      if (isC){ var bc = el('span', 'v2-badge-c', 'C'); bc.title = 'Captain: scores 1.5 times'; bc.setAttribute('aria-label', 'Captain'); pl.appendChild(bc); }
      tdP.appendChild(pl); tr.appendChild(tdP);

      var tdCap = el('td', 'n v2-five__cap', typeof sal[slug] === 'number' ? String(sal[slug]) : '—'); tdCap.setAttribute('data-label', 'Cap'); tr.appendChild(tdCap);
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var tdB = el('td', 'n v2-five__base' + (base == null ? '' : ' ' + numCls(base)), base == null ? '—' : signedTxt(base)); tdB.setAttribute('data-label', 'Base'); tr.appendChild(tdB);
      var tdM = el('td', 'n v2-five__m'); tdM.setAttribute('data-label', 'Mult.');
      tdM.appendChild(el('span', 'v2-mult' + (isC ? ' sp-mult-c' : ''), isC ? C.CAPTAIN_MULT + 'x' : '1x')); tr.appendChild(tdM);
      var pts = v.any ? v.res.bySlug[slug] : null;
      var tdT = el('td', 'n v2-strong v2-five__t' + (pts == null ? '' : ' ' + numCls(pts)), pts == null ? '—' : signedTxt(pts));
      tdT.setAttribute('data-label', 'Team pts'); tr.appendChild(tdT);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ---- badges: earned only from real record facts ----
  function renderBadges(v){
    var body = clear($('badgebody')), rec = season || { played: 0, winsSpy: 0, winsTop5: 0, winsPerfect: 0, streak: 0 };
    var practiced = v.mode === 'scoring' && v.wk.practice && v.any;
    var list = [
      ['Practice run', practiced, 'Score a team in the practice week.', 'Scored a team in the practice week.'],
      ['First week', rec.played >= 1, 'Finish one real week with a saved team.', 'Finished a real week.'],
      ['Beat the market', rec.winsSpy >= 1, 'Beat the S&P 500 in a real week.', 'Beat the S&P 500 in a real week.'],
      ['Beat the Top 5', rec.winsTop5 >= 1, 'Outscore the five richest people in a real week.', 'Outscored the Top 5 richest.'],
      ['Hot streak', rec.streak >= 3, 'Beat the S&P 500 three weeks in a row.', 'Three weeks in a row beating the S&P 500.'],
      ['Perfect week', rec.winsPerfect >= 1, 'Match the best possible team in a week.', 'Matched the perfect team.']
    ];
    var n = list.filter(function(b){ return b[1]; }).length;
    $('badgemeta').textContent = n + ' of ' + list.length + ' earned';
    var ul = el('ul', 'sp-badges');
    list.forEach(function(b){
      var li = el('li', 'sp-badge' + (b[1] ? ' is-earned' : ' is-locked'));
      var disc = el('span', 'sp-badge__disc'); disc.setAttribute('aria-hidden', 'true');
      disc.appendChild(el('span', 'sp-badge__star'));
      li.appendChild(disc);
      li.appendChild(el('span', 'sp-badge__name', b[0]));
      li.appendChild(el('span', 'sp-badge__state', (b[1] ? 'Earned · ' + b[3] : 'Locked · ' + b[2])));
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  // ---- next round (+ Lucky five) ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    body.appendChild(el('p', 'v2-next__when', nyFmt(info.locksAt, { weekday: 'long' }) + ' / ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET'));
    body.appendChild(el('p', 'v2-next__sub', 'Set your next roster before the lock.'));
    var cd = el('p', 'v2-next__cd'); cd.id = 'countdown';
    body.appendChild(cd);
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('v2-btn v2-btn--primary v2-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', '../draft.html'));
    var lucky = link('v2-btn v2-btn--secondary v2-btn--block sp-lucky', 'Lucky five', '../draft.html');
    body.appendChild(lucky);
    body.appendChild(el('p', 'sp-small', 'Lucky five spins a random team that fits the cap, in the Draft room.'));
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
  }
  function tick(){
    var S = F.state, cd = $('countdown');
    if (!cd || !S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek), t = F.now();
    if (t >= info.locksAt){ cd.textContent = fmt.weekTitle(S.draftWeek) + ' has locked. Reload the page for the next round.'; return; }
    cd.textContent = fmt.weekTitle(S.draftWeek) + ' · locks in ' + span(info.locksAt - t);
  }

  // ---- news (latest edition; stories matched to your players by name, as team.js) ----
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
    if (!items.length) body.appendChild(el('p', 'v2-msg', 'No stories about your players in the latest edition.'));
    else {
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
    if (iso){
      var f = el('p', 'v2-news__foot');
      f.appendChild(link(null, 'Read the ' + BD.monDay(iso) + ' edition', '../editions/' + iso + '/'));
      body.appendChild(f);
    }
  }

  // ---- leagues (simplified for the mockup: sign-in state only) ----
  function renderLeagues(){
    var head = $('leaguesh'), body = clear($('leaguesbody'));
    if (!signedIn()){
      head.textContent = 'Play against your friends.';
      body.appendChild(el('p', null, 'Private leagues with a join code. Sign in to create or join one.'));
      body.appendChild(link('v2-btn v2-btn--primary', 'Go to Leagues', '../leagues.html'));
      return;
    }
    head.textContent = 'Your leagues';
    body.appendChild(el('p', null, 'Online as ' + acct.me.nickname + ' · ' + Number(acct.me.coins || 0).toLocaleString('en-US') + ' play-money coins.'));
    body.appendChild(link('v2-btn v2-btn--secondary', 'Standings and invites', '../leagues.html'));
  }

  // ---- win / lead moment: one gold shimmer across the hero and a few confetti bits inside it (never looping) ----
  function celebrate(){
    if (reduced()) return;
    var hero = $('hero');
    var box = el('span', 'sp-confetti'); box.setAttribute('aria-hidden', 'true');
    var colors = ['#FFD978', '#5CCB95', '#FFFFFF', '#D62D27'];
    for (var i = 0; i < 18; i++){
      var c = el('span', 'sp-confetti__p');
      c.style.left = (4 + Math.random() * 92) + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.round(Math.random() * 400) + 'ms';
      c.style.setProperty('--dx', Math.round(Math.random() * 60 - 30) + 'px');
      c.style.setProperty('--rot', Math.round(Math.random() * 540 - 270) + 'deg');
      box.appendChild(c);
    }
    hero.appendChild(box);
    hero.classList.add('is-celebrate');
    setTimeout(function(){ hero.classList.remove('is-celebrate'); if (box.parentNode) box.parentNode.removeChild(box); }, 2600);
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
    else { var im = el('img', 'sp-zoom__img'); im.src = src; im.alt = ''; face.appendChild(im); }
    $('cu-kick').textContent = cartoon ? 'Close-up · Portrait coming soon' : 'Close-up';
    $('cu-name').textContent = p.name + (isC ? ' · Captain' : '');
    $('cu-cap').textContent = typeof sal[slug] === 'number' ? String(sal[slug]) : '—';
    var pts = v && v.any ? v.res.bySlug[slug] : null;
    var ptd = clear($('cu-pts'));
    if (pts == null) ptd.appendChild(el('span', 'is-zero', 'No points yet'));
    else ptd.appendChild(el('span', pts > 0 ? 'is-pos' : (pts < 0 ? 'is-neg' : 'is-zero'), signedTxt(pts)));
    $('cu-ptsk').textContent = 'Team pts this week' + (v && v.wk && v.wk.practice ? ' (practice)' : '');
    $('cu-sector').textContent = p.sector || 'Other';
    $('cu-link').href = personHref(slug);
    cuT.forEach(clearTimeout); cuT = [];
    zoom.className = 'sp-zoom' + (cartoon ? ' is-cartoon' : ' is-portrait');
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
    var b = e.target.closest && e.target.closest('.sp-namebtn');
    if (b) openCloseup(b.getAttribute('data-slug'), b);
  });

  // ---- page ----
  function renderAll(){
    var v = view();
    curView = v;
    var ws = renderHero(v);
    renderStrip(v); renderFive(v); renderBadges(v); renderNext(); renderNews(v); renderLeagues();
    var tot = v.any ? v.res.total : null;
    say(teamName() + '. ' + (tot == null ? 'No fantasy points yet.' : plainTxt(tot) + ' fantasy points.' + (ws ? ' ' + ws.word + '.' : '')));
    if (ws && ws.win) setTimeout(celebrate, 1300);
  }
  function fail(){
    var hero = clear($('hero'));
    hero.removeAttribute('aria-busy');
    hero.appendChild(el('span', 'v2-kicker', 'Your team'));
    var h = el('h1', 'v2-h1 v2-hero__name', 'Your team'); h.id = 'teamname'; hero.appendChild(h);
    hero.appendChild(el('p', 'v2-hero__note', 'The game data is not available right now. Try again later.'));
    clear($('fivebody')).appendChild(el('p', 'v2-msg', 'Your team will show here when the game data loads.'));
    clear($('badgebody')).appendChild(el('p', 'v2-msg', 'Not available right now.'));
    clear($('nextbody')).appendChild(el('p', 'v2-msg', 'Lineups lock every Monday at 9:30 AM ET.'));
    clear($('newsbody')).appendChild(el('p', 'v2-msg', 'Not available right now.'));
    renderLeagues();
    say('The game data is not available right now.');
  }

  if (window.BDAccount && window.BDAccount.onChange){
    window.BDAccount.onChange(function(a){
      acct = a;
      renderLeagues();
      if (!F.state.loaded) return;
      var h = $('teamname'); if (h) h.textContent = teamName();
    });
  }
  BD.getJson('../digest.json').then(function(d){ digest = d; digestState = 'ok'; }, function(){ digestState = 'error'; })
    .then(function(){ if (F.state.loaded) renderNews(view()); });
  renderLeagues();
  load().then(renderAll, function(err){ if (window.console) console.warn(err); fail(); });
})();
