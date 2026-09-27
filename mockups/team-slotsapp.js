/* Billionaires Digest v2 MOCKUP, casino variation A5: "Mobile slots app" My team (mockups/team-slotsapp.html). ES5, no globals.
   Same content and team logic as mockups/team-arcade.js (option A): real game data from ../data/fantasy/*, BDFantasyStore
   seeded by hand (saved team for the draft week, else the working draft), scoring / upcoming / none views.
   Game layer uses only real or transparently derived facts:
     streak, badges  <- BDFantasyStore.pure.seasonRecord over finished real weeks you saved a team for
     XP / level      <- weeks played x100 + weeks beat the S&P 500 x50; a level every 500 XP (formula shown on the page)
     coins           <- BDAccount (game-client.js) only when signed in; otherwise a "Sign in" pill
   The banner word ("BIG WIN!", "NICE!", "UNLUCKY"...) is always backed by the plain result in words.
   The close-up face is one made-up cartoon (portrait placeholder), never a real person. Play money only, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, BD = window.BD;
  if (!F || !C || !BD) return;
  var DATA = '../data/fantasy/';
  var MINUS = '−';
  var XP_WEEK = 100, XP_WIN = 50, XP_LEVEL = 500;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var el = BD.el, arr = BD.arr;
  var fmt = F.fmt;
  var $ = function(id){ return document.getElementById(id); };

  // One generic, original cartoon tycoon (same drawing as the Lucky five close-up). Eyes swap to "$" when zoomed.
  var FACE = '<svg class="sa-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#D62D27"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="sa-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="sa-dollar" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="800" font-size="19" text-anchor="middle" fill="#08764A">' +
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
    var a = el('span', 'v2-av sa-plate', pic.img ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic.img){ var im = el('img'); im.src = pic.img; im.alt = ''; a.appendChild(im); }
    return a;
  }

  function svgEl(tag, attrs){
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    return n;
  }
  // flame icon (pure SVG path); lit = orange/yellow, unlit = dim purple
  function flame(cls){
    var s = svgEl('svg', { viewBox: '0 0 24 30', 'class': 'sa-flame ' + (cls || ''), 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('path', { 'class': 'sa-flame__out', d: 'M12 1c1 5 7 8 7 16a7 7 0 0 1-14 0c0-4 2-6 3-8 0 3 1 5 3 5-1-5 0-9 1-13z' }));
    s.appendChild(svgEl('path', { 'class': 'sa-flame__in', d: 'M12 13c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 1 2 2 2-.5-2 0-4 0-6z' }));
    return s;
  }
  // progress ring: returns { svg, arc, len }
  function ring(size, stroke, frac, cls){
    var r = (size - stroke) / 2, len = 2 * Math.PI * r, c = size / 2;
    var s = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, 'class': 'sa-ring ' + (cls || ''), 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('circle', { 'class': 'sa-ring__track', cx: c, cy: c, r: r, 'stroke-width': stroke, fill: 'none' }));
    var arc = svgEl('circle', { 'class': 'sa-ring__arc', cx: c, cy: c, r: r, 'stroke-width': stroke, fill: 'none',
      'stroke-linecap': 'round', 'stroke-dasharray': len.toFixed(2), transform: 'rotate(-90 ' + c + ' ' + c + ')' });
    s.appendChild(arc);
    var target = len * (1 - Math.max(0, Math.min(1, frac)));
    if (reduced()) arc.setAttribute('stroke-dashoffset', target.toFixed(2));
    else {
      arc.setAttribute('stroke-dashoffset', len.toFixed(2));
      setTimeout(function(){ arc.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.3,.8,.3,1)'; arc.setAttribute('stroke-dashoffset', target.toFixed(2)); }, 250);
    }
    return s;
  }

  // ---- count-up number: visible digits are aria-hidden; the real value is in sr-only text ----
  function countUp(box, value, signed, srText){
    clear(box);
    box.appendChild(el('span', 'v2-sr', srText));
    var vis = el('span', 'sa-count__n num');
    vis.setAttribute('aria-hidden', 'true');
    box.appendChild(vis);
    function show(n){ vis.textContent = value == null ? '—' : (signed ? signedTxt(n) : plainTxt(n)); }
    if (value == null || reduced() || !window.requestAnimationFrame){ show(value); return; }
    var t0 = null, dur = 1300;
    show(0);
    requestAnimationFrame(function step(ts){
      if (t0 == null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      show(Math.round(value * e));
      if (k < 1) requestAnimationFrame(step);
    });
  }
  function once(node, cls, ms){
    if (reduced()) return;
    node.classList.add(cls);
    setTimeout(function(){ node.classList.remove(cls); }, ms);
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

  // banner: a big game word, always paired with the plain result sentence
  function banner(v, L){
    if (v.mode === 'none') return { big: 'No team yet', tone: 'is-off', say: 'You have no team for this week yet.' };
    if (v.mode === 'upcoming') return { big: 'Ready!', tone: 'is-off', say: 'Your team is set. Scoring has not started yet.' };
    if (!v.any) return { big: 'Get ready', tone: 'is-off', say: 'Waiting for the first scores.' };
    var bm = bench(v);
    if (bm == null) return { big: 'Scores in', tone: 'is-off', say: 'Your team has points. There is no S&P 500 result to compare with yet.' };
    var diff = v.res.total - bm, over = F.weekOver(v.wk), by = Math.abs(diff) + (Math.abs(diff) === 1 ? ' point' : ' points');
    var pr = v.wk.practice ? ' (practice week)' : '';
    if (diff > 0 && over) return { big: pr ? 'Nice!' : 'Big win!', tone: 'is-win', say: 'Result: Win' + pr + '. Your team beat the S&P 500 by ' + by + '.' };
    if (diff > 0) return { big: 'Nice!', tone: 'is-win', say: 'Result: Leading' + pr + '. Your team is ahead of the S&P 500 by ' + by + ' so far.' };
    if (diff < 0) return { big: 'Unlucky', tone: 'is-loss', say: 'Result: ' + (over ? 'Loss' : 'Trailing') + pr + '. Your team is behind the S&P 500 by ' + by + (over ? '.' : ' so far.') };
    return { big: 'Tied', tone: 'is-off', say: 'Result: Tied with the S&P 500' + pr + '.' };
  }

  // ---- HUD: level badge with XP ring, streak flame, coins-or-sign-in pill ----
  function xpOf(rec){ return rec.played * XP_WEEK + rec.winsSpy * XP_WIN; }
  function rec0(){ return season || { played: 0, winsSpy: 0, winsTop5: 0, winsPerfect: 0, streak: 0 }; }
  function renderHud(){
    var rec = rec0(), xp = xpOf(rec), level = 1 + Math.floor(xp / XP_LEVEL), into = xp % XP_LEVEL;
    var lv = clear($('hudlvl'));
    var badge = el('a', 'sa-hud__badge');
    badge.href = '#levelh';
    badge.setAttribute('aria-label', 'Level ' + level + ', ' + into + ' of ' + XP_LEVEL + ' XP to the next level');
    badge.appendChild(ring(52, 6, into / XP_LEVEL, 'sa-ring--hud'));
    badge.appendChild(el('span', 'sa-hud__lvnum num', String(level)));
    lv.appendChild(badge);
    var lt = el('span', 'sa-hud__txt');
    lt.setAttribute('aria-hidden', 'true');
    lt.appendChild(el('span', 'sa-hud__k', 'Level ' + level));
    lt.appendChild(el('span', 'sa-hud__v num', into + ' / ' + XP_LEVEL + ' XP'));
    lv.appendChild(lt);

    var st = clear($('hudstreak'));
    st.appendChild(flame(rec.streak ? 'is-lit' : ''));
    var sx = el('span', 'sa-hud__txt');
    sx.appendChild(el('span', 'sa-hud__k', 'Streak'));
    sx.appendChild(el('span', 'sa-hud__v num', rec.streak + (rec.streak === 1 ? ' week' : ' weeks')));
    st.appendChild(sx);

    var co = clear($('hudcoins'));
    if (acct && acct.signedIn && acct.me && typeof acct.me.coins === 'number'){
      var pill = el('span', 'sa-coinpill');
      pill.appendChild(el('span', 'sa-coindisc', ''));
      pill.firstChild.setAttribute('aria-hidden', 'true');
      pill.appendChild(el('span', 'num', Number(acct.me.coins).toLocaleString('en-US') + ' coins'));
      co.appendChild(pill);
    } else {
      var a = link('sa-coinpill sa-coinpill--in', '', '../leagues.html');
      var d = el('span', 'sa-coindisc', ''); d.setAttribute('aria-hidden', 'true');
      a.appendChild(d);
      a.appendChild(el('span', null, 'Sign in for coins'));
      co.appendChild(a);
    }
  }

  // ---- hero: glossy score panel with banner ----
  function renderHero(v){
    var S = F.state, box = clear($('heroin')), hero = $('hero');
    hero.removeAttribute('aria-busy');
    var weekId = v.mode === 'scoring' ? v.wk.week : S.draftWeek;
    var top = el('div', 'sa-hero__top');
    top.appendChild(el('span', 'sa-kicker', 'This week\'s spin · ' + fmt.weekTitle(weekId)));
    var sw = statusWord(v);
    if (sw) top.appendChild(el('span', 'sa-status', sw));
    box.appendChild(top);
    var h = el('h1', 'sa-hero__name', teamName()); h.id = 'teamname';
    box.appendChild(h);

    var L = lamp(v), B = banner(v, L);
    var ban = el('div', 'sa-banner ' + B.tone);
    ban.id = 'banner';
    var bw = el('p', 'sa-banner__word', B.big);
    ban.appendChild(bw);
    box.appendChild(ban);

    var panel = el('div', 'sa-score');
    var total = v.any ? v.res.total : null;
    var main = el('div', 'sa-score__main');
    main.appendChild(el('span', 'sa-score__k', 'Team total · fantasy points'));
    var cnt = el('div', 'sa-count sa-count--big ' + (total == null ? 'is-zero' : numCls(total)));
    main.appendChild(cnt);
    panel.appendChild(main);

    var bm = bench(v), diff = bm == null ? null : total - bm;
    var vs = el('div', 'sa-vs ' + (diff == null ? 'is-zero' : numCls(diff)));
    vs.appendChild(el('span', 'sa-vs__k', 'VS S&P 500'));
    var cnt2 = el('div', 'sa-count sa-count--mid');
    vs.appendChild(cnt2);
    vs.appendChild(el('span', 'sa-vs__sub', bm == null
      ? (v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.')
      : 'S&P 500 scored ' + plainTxt(bm) + ' fantasy points'));
    panel.appendChild(vs);
    box.appendChild(panel);

    box.appendChild(el('p', 'sa-result', B.say));
    var note = scoringNote(v);
    if (note) box.appendChild(el('p', 'sa-hero__note', note));
    if (v.mode === 'none') {
      var r = el('div', 'sa-btnrow');
      r.appendChild(link('sa-btn sa-btn--green sa-btn--big', 'Go to the Draft room', '../draft.html'));
      box.appendChild(r);
    }

    countUp(cnt, total, false, total == null ? 'No team points yet' : 'Team total: ' + plainTxt(total) + ' fantasy points');
    countUp(cnt2, diff, true, diff == null ? 'Versus S&P 500: no comparison yet' : 'Versus S&P 500: ' + signedTxt(diff) + ' points');
    if (!reduced()){
      ban.classList.add('is-pop');
      hero.classList.add('is-intro');
      setTimeout(function(){ ban.classList.remove('is-pop'); hero.classList.remove('is-intro'); }, 2600);
    }
    return { L: L, B: B };
  }

  // ---- starting five: glossy tiles ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    $('fivehint').hidden = v.mode === 'none';
    if (v.mode === 'none'){
      meta.textContent = '';
      meta.hidden = true;
      var e = el('div', 'sa-empty');
      for (var i = 0; i < 5; i++){
        var ph = el('div', 'sa-empty__slot');
        ph.setAttribute('aria-hidden', 'true');
        ph.appendChild(el('span', 'sa-empty__q', '?'));
        e.appendChild(ph);
      }
      body.appendChild(e);
      var t = el('div', 'sa-empty__txt');
      t.appendChild(el('h3', 'sa-h3', 'Five empty slots'));
      t.appendChild(el('p', null, 'Pick five billionaires under a ' + C.CAP + '-point cap and choose a captain, who scores 1.5 times. Your team scores on their real, disclosed stock holdings each trading day.'));
      var b = el('div', 'sa-btnrow');
      b.appendChild(link('sa-btn sa-btn--green', 'Go to the Draft room', '../draft.html'));
      b.appendChild(link('sa-btn sa-btn--blue', 'Lucky five', '../draft.html'));
      t.appendChild(b);
      body.appendChild(t);
      return;
    }
    meta.hidden = false;
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var ul = el('ul', 'sa-tiles');
    ul.setAttribute('aria-label', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.'));
    orderedPicks(v.team).forEach(function(slug, i){
      var p = F.person(slug), isC = slug === v.team.captain;
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var pts = v.any ? v.res.bySlug[slug] : null;
      var li = el('li', 'sa-tile' + (isC ? ' is-captain' : ''));
      li.style.setProperty('--i', String(i));
      var btn = el('button', 'sa-tile__btn');
      btn.type = 'button';
      btn.setAttribute('data-slug', slug);
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-label', 'Close-up of ' + p.name + (isC ? ', captain, scores 1.5 times' : '') +
        '. Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : 'unknown') +
        (base == null ? '. No points yet.' : '. Base ' + signedTxt(base) + ' points, team ' + signedTxt(pts) + ' points.'));
      if (isC) btn.appendChild(el('span', 'sa-capt', '×1.5 Captain'));
      var gem = el('span', 'sa-tile__gem');
      gem.appendChild(plate(p));
      btn.appendChild(gem);
      var txt = el('span', 'sa-tile__txt');
      txt.appendChild(el('span', 'sa-tile__name', p.name));
      txt.appendChild(el('span', 'sa-tile__sector', p.sector || 'Other'));
      var chips = el('span', 'sa-tile__chips');
      chips.appendChild(el('span', 'sa-chip num', 'Cap ' + (typeof sal[slug] === 'number' ? sal[slug] : '—')));
      chips.appendChild(el('span', 'sa-chip num', 'Base ' + (base == null ? '—' : signedTxt(base))));
      txt.appendChild(chips);
      btn.appendChild(txt);
      var coin = el('span', 'sa-tile__pts');
      coin.appendChild(el('span', 'sa-tile__v num ' + (pts == null ? 'is-zero' : numCls(pts)), pts == null ? '—' : signedTxt(pts)));
      coin.appendChild(el('span', 'sa-tile__k', 'team pts'));
      btn.appendChild(coin);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    once(ul, 'is-dealing', 2000);
  }

  // ---- spin again: lock countdown ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    var day = nyFmt(info.locksAt, { weekday: 'long' });
    var h = el('h2', 'sa-spin__title', 'Spin again ' + day); h.id = 'nexth';
    body.appendChild(h);
    var cd = el('p', 'sa-spin__cd');
    cd.appendChild(el('span', 'sa-spin__k', 'Next round locks in'));
    var v = el('span', 'sa-spin__v num'); v.id = 'countdown';
    cd.appendChild(v);
    body.appendChild(cd);
    body.appendChild(el('p', 'sa-spin__when', fmt.weekTitle(S.draftWeek) + ' · ' + day + ' ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET'));
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('sa-btn sa-btn--green sa-btn--big sa-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', '../draft.html'));
    body.appendChild(link('sa-btn sa-btn--blue sa-btn--block', 'Lucky five', '../draft.html'));
    body.appendChild(el('p', 'sa-small', 'Lucky five spins a random team that fits the cap. It lives in the Draft room.'));
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
    once($('spin'), 'is-pulse', 3200);
  }
  function tick(){
    var S = F.state, cd = $('countdown');
    if (!cd || !S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek), t = F.now();
    cd.textContent = t >= info.locksAt ? 'Locked. Reload for the next round.' : span(info.locksAt - t);
  }

  // ---- level ring + streak flames (derived, formula on the page) ----
  function renderLevel(){
    var body = clear($('levelbody')), rec = rec0(), S = F.state;
    var xp = xpOf(rec), level = 1 + Math.floor(xp / XP_LEVEL), into = xp % XP_LEVEL;
    var wrap = el('div', 'sa-lvl');
    var rw = el('div', 'sa-lvl__ring');
    rw.setAttribute('role', 'progressbar');
    rw.setAttribute('aria-label', 'XP toward level ' + (level + 1));
    rw.setAttribute('aria-valuemin', '0');
    rw.setAttribute('aria-valuemax', String(XP_LEVEL));
    rw.setAttribute('aria-valuenow', String(into));
    rw.setAttribute('aria-valuetext', 'Level ' + level + '. ' + into + ' of ' + XP_LEVEL + ' XP');
    rw.appendChild(ring(140, 14, into / XP_LEVEL, 'sa-ring--big'));
    var mid = el('span', 'sa-lvl__mid');
    mid.setAttribute('aria-hidden', 'true');
    mid.appendChild(el('span', 'sa-lvl__k', 'Level'));
    mid.appendChild(el('span', 'sa-lvl__n num', String(level)));
    rw.appendChild(mid);
    wrap.appendChild(rw);
    var side = el('div', 'sa-lvl__side');
    side.appendChild(el('span', 'sa-lvl__xp num', xp + ' XP'));
    side.appendChild(el('span', 'sa-small', (XP_LEVEL - into) + ' XP to level ' + (level + 1)));
    side.appendChild(el('span', 'sa-formula num', rec.played + ' weeks × ' + XP_WEEK + ' + ' + rec.winsSpy + ' wins × ' + XP_WIN + ' = ' + xp + ' XP'));
    side.appendChild(link('sa-link', 'How XP works', '#xpnote'));
    wrap.appendChild(side);
    body.appendChild(wrap);

    var sm = el('div', 'sa-streak');
    sm.appendChild(el('span', 'sa-label', 'Streak · weeks beating the S&P 500'));
    var fl = el('span', 'sa-streak__flames');
    fl.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 5; i++) fl.appendChild(flame(i < rec.streak ? 'is-lit' : ''));
    sm.appendChild(fl);
    var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
    var stxt;
    if (!rec.played) stxt = 'Start your streak Monday' + (first ? ' (' + fmt.shortDate(first) + ')' : '') + '.';
    else if (!rec.streak) stxt = 'No streak right now. Beat the S&P 500 this week to start one.';
    else stxt = rec.streak + (rec.streak === 1 ? ' week' : ' weeks') + ' in a row beating the S&P 500.';
    sm.appendChild(el('p', 'sa-streak__txt', stxt));
    body.appendChild(sm);
  }

  // ---- badges as collectibles: earned only from real record facts ----
  var GEMS = ['sa-gem--teal', 'sa-gem--blue', 'sa-gem--green', 'sa-gem--pink', 'sa-gem--orange', 'sa-gem--gold'];
  function renderBadges(v){
    var body = clear($('badgebody')), rec = rec0();
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
    var cnt = el('p', 'sa-collect__n');
    cnt.appendChild(el('span', 'sa-pill num', n + ' / ' + list.length));
    cnt.appendChild(document.createTextNode(' badges collected'));
    body.appendChild(cnt);
    var ul = el('ul', 'sa-badges');
    list.forEach(function(b, i){
      var li = el('li', 'sa-badge' + (b[1] ? ' is-earned' : ' is-locked'));
      var gem = el('span', 'sa-gem ' + GEMS[i]);
      gem.setAttribute('aria-hidden', 'true');
      gem.appendChild(el('span', b[1] ? 'sa-gem__star' : 'sa-gem__lock'));
      li.appendChild(gem);
      li.appendChild(el('span', 'sa-badge__name', b[0]));
      li.appendChild(el('span', 'sa-badge__state', b[1] ? 'Earned · ' + b[3] : 'Locked · ' + b[2]));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    if (n) once(ul, 'is-shine', 2600);
  }

  // ---- play-money coins (only from the online game when signed in) ----
  function renderCoins(){
    var box = clear($('coinbody'));
    var row = el('div', 'sa-coins__row');
    var disc = el('span', 'sa-coindisc sa-coindisc--big');
    disc.setAttribute('aria-hidden', 'true');
    row.appendChild(disc);
    var t = el('div', 'sa-coins__txt');
    t.appendChild(el('span', 'sa-label', 'Play-money coins'));
    if (acct && acct.signedIn && acct.me && typeof acct.me.coins === 'number'){
      t.appendChild(el('span', 'sa-coins__v num', Number(acct.me.coins).toLocaleString('en-US') + ' coins'));
      t.appendChild(el('span', 'sa-small', 'Play money only. No purchases, cash-out or prizes.'));
    } else {
      t.appendChild(el('span', 'sa-coins__v sa-coins__v--off', 'Sign in to get play-money coins'));
      var p = el('span', 'sa-small');
      p.appendChild(link('sa-link', 'Sign in on Leagues', '../leagues.html'));
      p.appendChild(document.createTextNode(' · no purchases, cash-out or prizes'));
      t.appendChild(p);
    }
    row.appendChild(t);
    box.appendChild(row);
    renderHud();
  }

  // ---- celebration: one short coin shower, never looping, never with reduced motion ----
  function celebrate(){
    if (reduced()) return;
    var box = clear($('burst'));
    for (var i = 0; i < 34; i++){
      var c = el('span', 'sa-burst__p' + (i % 4 === 0 ? ' is-star' : ''));
      c.style.left = (4 + Math.random() * 92) + '%';
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
    else { var im = el('img', 'sa-zoom__img'); im.src = src; im.alt = ''; face.appendChild(im); }
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
    zoom.className = 'sa-zoom' + (cartoon ? ' is-cartoon' : ' is-portrait');
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
    var b = e.target.closest && e.target.closest('.sa-tile__btn');
    if (b) openCloseup(b.getAttribute('data-slug'), b);
  });

  // ---- page ----
  function renderAll(){
    var v = view();
    curView = v;
    var R = renderHero(v);
    renderFive(v); renderNext(); renderLevel(); renderBadges(v); renderCoins();
    var tot = v.any ? v.res.total : null;
    say(teamName() + '. ' + (tot == null ? 'No team points yet. ' : 'Team total ' + plainTxt(tot) + ' fantasy points. ') + R.B.say);
    if (R.L.win) setTimeout(celebrate, reduced() ? 0 : 1300);
  }
  function fail(){
    var box = clear($('heroin'));
    $('hero').removeAttribute('aria-busy');
    box.appendChild(el('span', 'sa-kicker', 'This week\'s spin'));
    var h = el('h1', 'sa-hero__name', 'Your team'); h.id = 'teamname'; box.appendChild(h);
    box.appendChild(el('p', 'sa-hero__note', 'The game data is not available right now. Try again later.'));
    ['fivebody', 'nextbody', 'levelbody', 'badgebody'].forEach(function(id){ clear($(id)).appendChild(el('p', 'sa-small', 'Not available right now.')); });
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
