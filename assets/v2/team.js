/* Billionaires Digest v3: My team (team.html), sports-network look (approved concept 06). ES5, UI only.
   State and rules come from BDFantasyStore (assets/v2/fantasy-store.js) and BDFantasyCore. Real data only:
   when there is no team or no scored day yet, the page says so instead of showing numbers.
   No team in this browser -> the fantasy landing (Draft your team / Create a league / Join a league / Lucky five).
   With a team: dark score card vs the S&P 500, starting five table, season (streak, XP, badges, coins),
   next round, team news, leagues.
     streak, badges  <- BDFantasyStore.pure.seasonRecord over finished real weeks you saved a team for
     XP / level      <- weeks played x100 + weeks beat the S&P 500 x50; a level every 500 XP (formula shown on the page)
     coins           <- the online game (BDFantasyStore.me()) only when signed in; otherwise "Sign in" text
   The profile preview shows initials (or an approved illustrated portrait from BDPortraits), never a photo.
   Play money only, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr;
  var fmt = F.fmt;
  var MINUS = '−';
  var XP_WEEK = 100, XP_WIN = 50, XP_LEVEL = 500;
  var $ = function(id){ return document.getElementById(id); };

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
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
  function tickerOf(p){ var h = arr(p && p.holdings)[0]; return h && h.ticker ? h.ticker : ''; }
  // portraits: only plain site-relative paths from window.BDPortraits (assets/v2/portraits.js)
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? u : null; }
  function portrait(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? { img: safePath(p.img) } : { img: safePath(window.BDPortraitFallback) };
  }
  function plate(p, cls){
    var pic = portrait(p.slug);
    var a = el('span', 'v2-av ' + (cls || '') + (pic.img ? ' v2-av--pic' : ''), pic.img ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic.img){ var im = el('img'); im.src = pic.img; im.alt = ''; a.appendChild(im); }
    return a;
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
  // result in words (never color alone)
  function lamp(v){
    if (v.mode === 'none') return { word: 'No team yet', cls: 'is-off' };
    if (v.mode === 'upcoming') return { word: 'Ready', cls: 'is-off' };
    if (!v.any) return { word: 'Waiting for scores', cls: 'is-off' };
    var bm = bench(v);
    if (bm == null) return { word: 'No benchmark yet', cls: 'is-off' };
    var diff = v.res.total - bm, over = F.weekOver(v.wk);
    if (diff > 0) return { word: over ? 'Win' : 'Leading', cls: 'is-win' };
    if (diff < 0) return { word: over ? 'Loss' : 'Trailing', cls: 'is-loss' };
    return { word: 'Tied', cls: 'is-off' };
  }
  function scoringNote(v){
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
  function statusText(v){
    if (v.mode === 'upcoming') return { t: C.isPractice(v.weekId) ? 'Practice' : 'Upcoming', live: false };
    if (v.wk.practice) return { t: F.weekOver(v.wk) ? 'Practice · final' : 'Practice', live: false };
    if (F.weekOver(v.wk)) return { t: 'Final', live: false };
    if (v.any) return { t: 'Live · through ' + fmt.dayLabel(v.res.scored[v.res.scored.length - 1]), live: true };
    return { t: 'Live', live: true };
  }

  // ---- landing (no team) vs team view ----
  function showLanding(on){
    $('landing').hidden = !on;
    $('landmore').hidden = !on;
    $('teamview').hidden = on;
    $('playline').hidden = on;
  }
  function renderLandingNext(){
    var S = F.state, p = clear($('landnext'));
    if (!S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek);
    p.appendChild(document.createTextNode('Next lineup lock: ' + fmt.weekTitle(S.draftWeek) + ' · ' + nyFmt(info.locksAt, { weekday: 'long' }) + ' ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET. '));
    p.appendChild(link(null, 'Read the rules', 'play-terms.html'));
  }

  // ---- hero: dark score card vs the S&P 500 ----
  function renderHero(v){
    var box = clear($('heroin')), hero = $('hero');
    hero.removeAttribute('aria-busy');
    var weekId = v.mode === 'scoring' ? v.wk.week : F.state.draftWeek;
    var top = el('div', 'tm-score__top');
    top.appendChild(el('span', 'tm-score__k', 'Your team / ' + fmt.weekTitle(weekId)));
    var st = statusText(v);
    top.appendChild(el('span', 'v2-pill' + (st.live ? ' v2-pill--live' : ''), st.t));
    box.appendChild(top);
    var grid = el('div', 'tm-score__grid');
    var left = el('div', 'tm-score__main');
    var h = el('h1', 'tm-score__name', teamName()); h.id = 'teamname';
    left.appendChild(h);
    var total = v.any ? v.res.total : null;
    var row = el('div', 'tm-score__row');
    var big = el('span', 'tm-score__big num', total == null ? '—' : plainTxt(total));
    row.appendChild(big);
    row.appendChild(el('span', 'tm-score__unit', total == null ? 'No points yet' : 'Fantasy points'));
    left.appendChild(row);
    grid.appendChild(left);

    var right = el('div', 'tm-score__vs');
    right.appendChild(el('span', 'tm-score__k', 'Vs S&P 500 benchmark'));
    var bm = bench(v), diff = bm == null ? null : total - bm;
    right.appendChild(el('span', 'tm-score__diff num ' + (diff == null ? 'v2-zero' : numCls(diff)), diff == null ? '—' : signedTxt(diff)));
    right.appendChild(el('span', 'tm-score__sub', bm == null
      ? (v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.')
      : 'Benchmark: ' + plainTxt(bm) + ' fantasy points'));
    var L = lamp(v);
    var lb = el('span', 'v2-lamp ' + L.cls);
    lb.appendChild(el('span', 'v2-lamp__k', 'Result'));
    lb.appendChild(el('span', 'v2-lamp__word', L.word));
    right.appendChild(lb);
    grid.appendChild(right);
    box.appendChild(grid);
    var note = scoringNote(v);
    if (note) box.appendChild(el('p', 'tm-score__note', note));
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

  // ---- starting five: table ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    $('fivehint').hidden = false;
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var wrap = el('div', 'tm-tablewrap');
    var t = el('table', 'v2-table tm-table');
    var cap = el('caption', 'v2-sr', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.'));
    t.appendChild(cap);
    var thead = el('thead'), hr = el('tr');
    [['Player', ''], ['Cap', 'n'], ['Base pts', 'n'], ['Mult', 'n tm-hide-sm'], ['Team pts', 'n']].forEach(function(c){
      var th = el('th', c[1] || null, c[0]); th.scope = 'col'; hr.appendChild(th);
    });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    orderedPicks(v.team).forEach(function(slug){
      var p = F.person(slug), isC = slug === v.team.captain;
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var pts = v.any ? v.res.bySlug[slug] : null;
      var tr = el('tr', isC ? 'is-captain' : null);
      var th = el('th'); th.scope = 'row';
      var cell = el('div', 'v2-player');
      cell.appendChild(plate(p, 'v2-av--sm'));
      var txt = el('span', 'v2-player__txt');
      var b = el('button', 'tm-name', p.name);
      b.type = 'button';
      b.setAttribute('data-slug', slug);
      b.setAttribute('aria-haspopup', 'dialog');
      txt.appendChild(b);
      txt.appendChild(el('span', 'v2-player__sub', [tickerOf(p), p.sector || 'Other'].filter(Boolean).join(' · ')));
      cell.appendChild(txt);
      if (isC){ var c = el('span', 'v2-badge-c', 'C'); c.title = 'Captain, scores ' + C.CAPTAIN_MULT + ' times'; c.appendChild(el('span', 'v2-sr', ' captain')); cell.appendChild(c); }
      th.appendChild(cell);
      tr.appendChild(th);
      tr.appendChild(el('td', 'n', typeof sal[slug] === 'number' ? String(sal[slug]) : '—'));
      tr.appendChild(el('td', 'n ' + (base == null ? 'v2-zero' : numCls(base)), base == null ? '—' : signedTxt(base)));
      tr.appendChild(el('td', 'n tm-hide-sm', isC ? C.CAPTAIN_MULT + 'x' : '1x'));
      tr.appendChild(el('td', 'n v2-strong ' + (pts == null ? 'v2-zero' : numCls(pts)), pts == null ? '—' : signedTxt(pts)));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    body.appendChild(wrap);
  }

  // ---- next round: lock countdown ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    body.appendChild(el('p', 'tm-next__when', nyFmt(info.locksAt, { weekday: 'long' }) + ' / ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET'));
    var cd = el('p', 'tm-next__cd');
    cd.appendChild(el('span', 'tm-next__k', fmt.weekTitle(S.draftWeek) + ' locks in '));
    var v = el('span', 'tm-next__v num'); v.id = 'countdown';
    cd.appendChild(v);
    body.appendChild(cd);
    body.appendChild(el('p', 'tm-small', 'Set your next roster before the lock.'));
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('v2-btn v2-btn--primary v2-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', 'draft.html'));
    var p = el('p', 'tm-small tm-next__lucky');
    p.appendChild(document.createTextNode('Feeling lucky? '));
    p.appendChild(link('tm-link', 'Try Lucky five', 'draft.html#lucky'));
    p.appendChild(document.createTextNode(': a random team that fits the cap, opened in the Draft room. It never saves by itself.'));
    body.appendChild(p);
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 20000);
  }
  function tick(){
    var S = F.state, cd = $('countdown');
    if (!cd || !S.draftWeek) return;
    var info = C.weekInfo(S.draftWeek), t = F.now();
    var locked = t >= info.locksAt;
    cd.className = 'tm-next__v num' + (locked ? ' is-locked' : '');
    cd.textContent = locked ? 'now. Reload the page for the next round.' : span(info.locksAt - t);
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

  // ---- profile preview dialog ----
  var dlg = $('closeup'), lastFocus = null, curView = null;
  function dlgFocusables(){
    return Array.prototype.filter.call(dlg.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  function openCloseup(slug, from){
    var v = curView, p = F.person(slug), face = clear($('cu-face'));
    var sal = (v && v.wk && v.wk.salaries) || {};
    var isC = v && v.team && v.team.captain === slug;
    lastFocus = from || document.activeElement;
    face.appendChild(plate(p, 'v2-av--lg'));
    $('cu-kick').textContent = isC ? 'Player profile · Captain (' + C.CAPTAIN_MULT + 'x)' : 'Player profile';
    $('cu-name').textContent = p.name;
    $('cu-sector').textContent = p.sector || 'Other';
    $('cu-cap').textContent = typeof sal[slug] === 'number' ? String(sal[slug]) : '—';
    var pts = v && v.any ? v.res.bySlug[slug] : null;
    var ptd = clear($('cu-pts'));
    if (pts == null) ptd.appendChild(el('span', 'v2-zero', 'No points yet'));
    else ptd.appendChild(el('span', numCls(pts), signedTxt(pts)));
    $('cu-ptsk').textContent = 'Team pts this week' + (v && v.wk && v.wk.practice ? ' (practice)' : '');
    var hold = arr(p.holdings).map(function(h){ return h.ticker; }).filter(Boolean).slice(0, 4);
    $('cu-hold').textContent = hold.length ? hold.join(', ') : '—';
    $('cu-link').href = personHref(slug);
    dlg.removeAttribute('hidden');
    document.documentElement.classList.add('v2-lock');
    $('cu-close').focus();
  }
  function closeCloseup(){
    if (dlg.hasAttribute('hidden')) return;
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
    var b = e.target.closest && e.target.closest('.tm-name');
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
    if (v.mode === 'none'){
      showLanding(true);
      renderLandingNext();
      $('scorestrip').hidden = true;
      say('No team in this browser yet. Draft your team, create a league or join one.');
      return;
    }
    showLanding(false);
    var L = renderHero(v);
    renderStrip(v); renderFive(v); renderNext(); renderLevel(); renderBadges(v); renderCoins(); renderNews(v); renderLeagues();
    var tot = v.any ? v.res.total : null;
    say(teamName() + '. ' + (tot == null ? 'No team points yet.' : 'Team total ' + plainTxt(tot) + ' fantasy points. Result: ' + L.word + '.'));
  }
  function fail(){
    showLanding(false);
    var box = clear($('heroin'));
    $('hero').removeAttribute('aria-busy');
    box.appendChild(el('span', 'tm-score__k', 'Your team'));
    var h = el('h1', 'tm-score__name', 'Your team'); h.id = 'teamname'; box.appendChild(h);
    box.appendChild(el('p', 'tm-score__note', 'The game data is not available right now. Try again later.'));
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
    if (kind === 'online'){ var h = $('teamname'); if (h && curView && curView.mode !== 'none') h.textContent = teamName(); renderLeagues(); renderCoins(); }
  });

  BD.getJson('digest.json').then(function(d){ digest = d; digestState = 'ok'; }, function(){ digestState = 'error'; })
    .then(function(){ if (F.state.loaded && curView && curView.mode !== 'none') renderNews(view()); });

  renderLeagues();
  F.init().then(function(){ return loadSeason(); }).then(function(){ renderAll(); }, function(err){ if (window.console) console.warn(err); fail(); });
})();
