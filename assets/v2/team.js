/* Billionaires Digest v2: My team (team.html). ES5, UI only.
   State and rules come from BDFantasyStore (assets/v2/fantasy-store.js) and BDFantasyCore. Real data only:
   when there is no team or no scored day yet, the page says so instead of showing numbers. Game only. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr;
  var fmt = F.fmt;
  var MINUS = '−';
  var $ = function(id){ return document.getElementById(id); };

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function say(t){ var n = $('live'); n.textContent = ''; setTimeout(function(){ n.textContent = t; }, 30); }
  function surname(name){
    var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').trim().split(/\s+/);
    return ws[ws.length - 1] || '';
  }
  function personHref(slug){ return 'people/' + encodeURIComponent(slug) + '/'; }
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
  function avatar(p){
    var a = el('span', 'v2-av', BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
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

  // ---- hero ----
  function renderHero(v){
    var S = F.state, hero = clear($('hero'));
    hero.removeAttribute('aria-busy');
    hero.className = 'v2-hero v2-hero--team';
    var weekId = v.mode === 'scoring' ? v.wk.week : S.draftWeek;
    var main = el('div', 'v2-hero__main');
    main.appendChild(el('span', 'v2-kicker', 'Your team / ' + fmt.weekTitle(weekId)));
    var h = el('h1', 'v2-h1 v2-hero__name', teamName()); h.id = 'teamname';
    main.appendChild(h);
    var score = el('div', 'v2-hero__score');
    var total = v.any ? v.res.total : null;
    score.appendChild(el('span', 'v2-hero-num', total == null ? '—' : plainTxt(total)));
    score.appendChild(el('span', 'v2-label', 'Fantasy points'));
    main.appendChild(score);
    var note = scoringNote(v);
    if (note) main.appendChild(el('p', 'v2-hero__note', note));
    hero.appendChild(main);

    var bench = el('div', 'v2-hero__bench');
    var pillBox = el('div', 'v2-hero__pill');
    var pill = statusPill(v);
    if (pill) pillBox.appendChild(pill);
    bench.appendChild(pillBox);
    bench.appendChild(el('span', 'v2-label', 'Vs S&P 500 benchmark'));
    var bm = v.wk && v.wk.benchmarks ? v.wk.benchmarks.spy : null;
    if (v.mode === 'scoring' && v.any && typeof bm === 'number'){
      var diff = total - bm;
      bench.appendChild(el('p', 'v2-hero__diff ' + numCls(diff), signedTxt(diff)));
      bench.appendChild(el('p', 'v2-hero__bm', 'Benchmark: ' + plainTxt(bm) + ' fantasy points'));
    } else {
      bench.appendChild(el('p', 'v2-hero__diff', '—'));
      bench.appendChild(el('p', 'v2-hero__bm', v.mode === 'scoring' && v.any ? 'No S&P 500 quotes saved for these days yet.' : 'The benchmark starts with the first scored day.'));
    }
    hero.appendChild(bench);
  }
  function scoringNote(v){
    if (v.mode === 'none') return 'No team yet. Draft five billionaires before the next lock.';
    if (v.any){
      if (v.team.lateFrom) return 'Late entry: scoring from ' + fmt.dayLabel(v.team.lateFrom) + '.';
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
      c.appendChild(el('span', 'v2-strip__k', i === 0 ? fmt.weekTitle(v.wk.week) : ' '));
      var pts = v.res.bySlug[slug];
      var val = el('span', 'v2-strip__v');
      val.appendChild(document.createTextNode(surname(F.person(slug).name) + ' '));
      val.appendChild(el('span', numCls(pts), signedTxt(pts)));
      c.appendChild(val);
      box.appendChild(c);
    });
    strip.hidden = false;
  }

  // ---- starting five ----
  function renderFive(v){
    var body = clear($('fivebody')), meta = $('capmeta');
    if (v.mode === 'none'){
      meta.textContent = '';
      var e = el('div', 'v2-empty');
      e.appendChild(el('h3', 'v2-h2', 'Draft your starting five'));
      e.appendChild(el('p', null, 'Pick five billionaires under a ' + C.CAP + '-point cap and choose a captain, who scores 1.5 times. Your team scores on their real, disclosed stock holdings each trading day.'));
      e.appendChild(link('v2-btn v2-btn--primary', 'Go to the Draft room', 'draft.html'));
      body.appendChild(e);
      return;
    }
    var sal = (v.wk && v.wk.salaries) || {};
    var used = 0, missing = false;
    v.team.picks.forEach(function(s){ if (typeof sal[s] === 'number') used += sal[s]; else missing = true; });
    meta.textContent = (missing ? '—' : used) + ' / ' + C.CAP + ' cap used';

    var tbl = el('table', 'v2-table v2-five');
    var cap = el('caption', 'v2-sr', 'Your starting five for ' + fmt.weekName(v.mode === 'scoring' ? v.wk.week : v.weekId) + (v.any ? '' : '. No scored days yet.'));
    tbl.appendChild(cap);
    var thead = el('thead'), hr = el('tr');
    [['Player', ''], ['Cap', 'n'], ['Base pts', 'n'], ['Multiplier', 'n'], ['Team pts', 'n']].forEach(function(x){
      var th = el('th', x[1] || null, x[0]); th.scope = 'col'; hr.appendChild(th);
    });
    thead.appendChild(hr); tbl.appendChild(thead);
    var tb = el('tbody');
    orderedPicks(v.team).forEach(function(slug){
      var p = F.person(slug), isC = slug === v.team.captain;
      var tr = el('tr');
      var tdP = el('td', 'v2-five__p');
      var pl = el('div', 'v2-player');
      pl.appendChild(avatar(p));
      var tx = el('div', 'v2-player__txt');
      tx.appendChild(link('v2-player__name', p.name, personHref(slug)));
      var tk = tickers(p);
      tx.appendChild(el('span', 'v2-player__sub', tk || p.sector || ''));
      pl.appendChild(tx);
      if (isC){ var b = el('span', 'v2-badge-c', 'C'); b.title = 'Captain: scores 1.5 times'; b.setAttribute('aria-label', 'Captain'); pl.appendChild(b); }
      tdP.appendChild(pl); tr.appendChild(tdP);

      var tdCap = el('td', 'n v2-five__cap', typeof sal[slug] === 'number' ? String(sal[slug]) : '—'); tdCap.setAttribute('data-label', 'Cap'); tr.appendChild(tdCap);
      var base = v.any ? v.res.baseBySlug[slug] : null;
      var tdB = el('td', 'n v2-five__base' + (base == null ? '' : ' ' + numCls(base)), base == null ? '—' : signedTxt(base)); tdB.setAttribute('data-label', 'Base'); tr.appendChild(tdB);
      var tdM = el('td', 'n v2-five__m'); tdM.setAttribute('data-label', 'Mult.');
      tdM.appendChild(el('span', 'v2-mult', isC ? C.CAPTAIN_MULT + 'x' : '1x')); tr.appendChild(tdM);
      var pts = v.any ? v.res.bySlug[slug] : null;
      var tdT = el('td', 'n v2-strong v2-five__t' + (pts == null ? '' : ' ' + numCls(pts)), pts == null ? '—' : signedTxt(pts));
      tdT.setAttribute('data-label', 'Team pts'); tr.appendChild(tdT);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ---- next round ----
  var cdTimer = null;
  function renderNext(){
    var S = F.state, body = clear($('nextbody'));
    var info = C.weekInfo(S.draftWeek);
    var when = nyFmt(info.locksAt, { weekday: 'long' }) + ' / ' + nyFmt(info.locksAt, { hour: 'numeric', minute: '2-digit' }) + ' ET';
    body.appendChild(el('p', 'v2-next__when', when));
    body.appendChild(el('p', 'v2-next__sub', 'Set your next roster before the lock.'));
    var cd = el('p', 'v2-next__cd'); cd.id = 'countdown';
    body.appendChild(cd);
    var saved = F.store().teams[S.draftWeek];
    body.appendChild(link('v2-btn v2-btn--primary v2-btn--block', saved ? 'Edit next week\'s team' : 'Set next week\'s team', 'draft.html'));
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

  // ---- page ----
  function renderAll(){
    var v = view();
    renderHero(v); renderStrip(v); renderFive(v); renderNext(); renderNews(v); renderLeagues();
  }
  function fail(){
    var hero = clear($('hero'));
    hero.removeAttribute('aria-busy');
    hero.appendChild(el('span', 'v2-kicker', 'Your team'));
    var h = el('h1', 'v2-h1 v2-hero__name', 'Your team'); h.id = 'teamname'; hero.appendChild(h);
    hero.appendChild(el('p', 'v2-hero__note', 'The game data is not available right now. Try again later.'));
    var r = el('button', 'v2-btn v2-btn--secondary', 'Try again'); r.type = 'button';
    r.style.color = '#fff'; r.style.borderColor = '#fff';
    r.addEventListener('click', function(){ location.reload(); });
    hero.appendChild(r);
    clear($('fivebody')).appendChild(el('p', 'v2-msg', 'Your team will show here when the game data loads.'));
    clear($('nextbody')).appendChild(el('p', 'v2-msg', 'Lineups lock every Monday at 9:30 AM ET.'));
    clear($('newsbody')).appendChild(el('p', 'v2-msg', 'Not available right now.'));
    renderLeagues();
    say('The game data is not available right now.');
  }

  var tc = F.testClock();
  if (tc != null){ var b = $('testclock'); b.hidden = false; b.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }

  F.onChange(function(kind){
    if (!F.state.loaded) { if (kind === 'online') renderLeagues(); return; }
    if (kind === 'online'){ var h = $('teamname'); if (h) h.textContent = teamName(); renderLeagues(); }
  });

  BD.getJson('digest.json').then(function(d){ digest = d; digestState = 'ok'; }, function(){ digestState = 'error'; })
    .then(function(){ if (F.state.loaded) renderNews(view()); });

  renderLeagues();
  F.init().then(function(){ renderAll(); }, function(err){ if (window.console) console.warn(err); fail(); });
})();
