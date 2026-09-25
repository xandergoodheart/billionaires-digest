/* Billionaires Digest v2: Scores (scores.html). ES5, UI only.
   Your week head to head (vs the S&P 500, the Top 5 richest or the perfect team), day by day, last week and the
   season record. Ported from the v1 matchup and season views (assets/fantasy.js renderMatch / renderSeason, which
   stay unchanged): same scoring (BDFantasyStore.teamWeek, captain 1.5x per day), same opponent availability rules
   and wording. The online leaderboard on this page (#boards) is drawn by assets/leagues.js, unchanged.
   Real data only. Game only: play money, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr, fmt = F.fmt;
  var MINUS = '−';
  var $ = function(id){ return document.getElementById(id); };
  var UI = { opp: null };

  // ---- helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function numTxt(n){ return typeof n === 'number' ? signedTxt(n) : '—'; }
  function numCls(n){ return typeof n !== 'number' ? 'v2-zero' : (n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero')); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function sr(text){ return el('span', 'v2-sr', text); }
  function say(t){ var n = $('live'); n.textContent = ''; setTimeout(function(){ n.textContent = t; }, 30); }
  function personHref(slug){ return 'people/' + encodeURIComponent(slug) + '/'; }
  function avatar(p){
    var a = el('span', 'v2-av v2-av--sm', BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function orderedPicks(team){
    var p = team.picks.slice();
    if (team.captain && p.indexOf(team.captain) > 0){ p.splice(p.indexOf(team.captain), 1); p.unshift(team.captain); }
    return p;
  }
  function teamName(){ var me = F.me(); return me && me.nickname ? me.nickname : 'Your team'; }
  function range(wk){ return fmt.shortDate(wk.start) + '–' + fmt.shortDate(wk.end); }
  function weekday(d){ return fmt.DAYN[C.weekday(d)]; }
  function emptyState(box, title, text, dark){
    var e = el('div', dark ? 'sc-empty' : 'v2-empty');
    e.appendChild(el('h3', 'v2-h2', title));
    e.appendChild(el('p', null, text));
    e.appendChild(link('v2-btn v2-btn--primary', 'Build your lineup', 'draft.html'));
    box.appendChild(e);
  }

  // ---- the matchup (v1 renderMatch) ----
  function opponents(wk){
    var bm = wk.benchmarks || {};
    return [
      { id: 'spy', label: 'S&P 500', ok: typeof bm.spy === 'number' || arr(wk.days).length === 0, why: 'No SPY quotes saved for these days', short: 'n/a' },
      { id: 'top5', label: 'Top 5 richest', ok: !!bm.top5, why: 'Not available', short: 'n/a' },
      { id: 'perfect', label: 'Perfect team', ok: !!bm.perfect, why: 'Worked out after Friday', short: 'after Friday' }
    ];
  }
  // Everything the board and the day-by-day table need, or { wk, team: null } when you have no team this week.
  function matchup(){
    var wk = F.state.sbWk;
    if (!wk) return null;
    var team = F.matchTeam(wk);
    if (!team) return { wk: wk, team: null };
    var bm = wk.benchmarks || {};
    var opps = opponents(wk);
    if (!UI.opp || !opps.filter(function(o){ return o.id === UI.opp && o.ok; }).length){
      var firstOk = opps.filter(function(o){ return o.ok; })[0];
      UI.opp = firstOk ? firstOk.id : 'spy';
    }
    var mine = F.teamWeek(wk, team);
    var opp = null, oppTeam = null;
    if (UI.opp === 'spy') opp = { total: typeof bm.spy === 'number' ? bm.spy : null, byDay: wk.spyDaily || {} };
    else { oppTeam = UI.opp === 'top5' ? bm.top5 : bm.perfect; opp = oppTeam ? F.teamWeek(wk, oppTeam) : null; }
    var any = arr(wk.days).length > 0;
    return {
      wk: wk, team: team, bm: bm, opps: opps, mine: mine, opp: opp, oppTeam: oppTeam, any: any, over: F.weekOver(wk),
      oppName: opps.filter(function(o){ return o.id === UI.opp; })[0].label,
      a: any ? mine.total : null, b: opp && any ? opp.total : null
    };
  }

  function renderHead(m){
    var S = F.state, pill = $('weekpill');
    if (!m){ pill.textContent = 'No scores yet'; return; }
    pill.textContent = fmt.weekTitle(m.wk.week);
  }
  function boardTop(box, wk){
    var top = el('div', 'sc-board__top');
    var t = el('div', 'sc-board__title');
    t.appendChild(el('span', 'v2-kicker', fmt.weekTitle(wk.week)));
    var over = F.weekOver(wk);
    t.appendChild(el('p', 'sc-board__sub', range(wk) + (over ? ' · final' : '') + (wk.practice ? ' · practice, not counted in your season' : '')));
    top.appendChild(t);
    box.appendChild(top);
    return top;
  }
  function renderBoard(m){
    var box = clear($('board'));
    box.removeAttribute('aria-busy');
    var h = el('h2', 'v2-sr', 'Your matchup'); h.id = 'boardh'; box.appendChild(h);
    if (!m){
      box.appendChild(el('span', 'v2-kicker', 'Scores'));
      emptyState(box, 'No scores yet', 'The first scores arrive after the first trading day of the week.', true);
      return;
    }
    var top = boardTop(box, m.wk);
    if (!m.team){
      if (m.wk.practice) emptyState(box, 'Pick five to see your matchup', 'Choose five billionaires and a captain in the Draft room. Your practice lineup is scored on the sample days so you can see how the head-to-head works.', true);
      else emptyState(box, 'You are not in this week', 'Save a lineup and it counts from next week' + (C.lateFrom(F.now()) ? ', or right away as a late entry from the next trading day.' : '.'), true);
      return;
    }
    // opponent switch
    var og = el('div', 'sc-seg'); og.setAttribute('role', 'group'); og.setAttribute('aria-labelledby', 'versusl');
    var vl = el('span', 'v2-label sc-seg__label', 'Versus'); vl.id = 'versusl'; og.appendChild(vl);
    var row = el('div', 'sc-seg__btns');
    m.opps.forEach(function(o){
      var on = UI.opp === o.id;
      var b = btn('sc-seg__b' + (on ? ' is-on' : ''), o.label);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('data-opp', o.id);
      if (!o.ok){
        b.disabled = true; b.title = o.why;
        b.appendChild(el('small', 'sc-seg__why', o.short));
        b.appendChild(sr(' (' + o.why + ')'));
      }
      row.appendChild(b);
    });
    og.appendChild(row);
    top.appendChild(og);

    // scoreboard: both totals, the leader / result in words
    var both = typeof m.a === 'number' && typeof m.b === 'number';
    var ra = '', rb = '';
    if (both){
      if (m.over){ ra = m.a > m.b ? 'Won' : (m.a < m.b ? 'Lost' : 'Tied'); rb = m.a < m.b ? 'Won' : (m.a > m.b ? 'Lost' : 'Tied'); }
      else if (m.a > m.b) ra = 'Leading';
      else if (m.b > m.a) rb = 'Leading';
      else { ra = 'Tied'; rb = 'Tied'; }
    }
    var match = el('div', 'sc-match');
    function side(name, score, res, cls){
      var s = el('div', 'sc-side ' + cls + (res === 'Won' || res === 'Leading' ? ' is-lead' : ''));
      s.appendChild(el('span', 'sc-side__name', name));
      s.appendChild(el('span', 'v2-hero-num sc-side__score', numTxt(score)));
      s.appendChild(el('span', 'sc-side__res', res || ' '));
      if (!res) s.lastChild.setAttribute('aria-hidden', 'true');
      return s;
    }
    match.appendChild(side(teamName() + (m.team.lateFrom ? ' · late entry' : ''), m.a, ra, 'sc-side--a'));
    match.appendChild(el('span', 'sc-vs', 'vs'));
    match.appendChild(side(m.oppName, m.b, rb, 'sc-side--b'));
    box.appendChild(match);

    // win chance (estimate, v1 formula) or final margin
    var pr = el('div', 'sc-prob');
    if (both){
      var a = m.a, b2 = m.b, pA;
      var today = C.nyDate(F.now());
      var left = C.weekDays(m.wk.week).filter(function(d){ return arr(m.wk.days).indexOf(d) < 0 && d >= today; }).length;
      if (m.over || !left) pA = a > b2 ? 1 : (a < b2 ? 0 : 0.5);
      else {
        var lead = a - b2, spread = 220 * Math.sqrt(left);   // typical swing over the days left
        pA = 1 / (1 + Math.exp(-1.6 * lead / spread));
      }
      var pct = Math.round(pA * 100);
      if (!m.over && left) pct = Math.min(99, Math.max(1, pct));
      var prow = el('div', 'sc-prob__row');
      if (m.over || !left){
        prow.appendChild(el('span', null, 'Final · ' + (a > b2 ? 'won by ' + (a - b2) : (a < b2 ? 'lost by ' + (b2 - a) : 'tie'))));
        prow.appendChild(el('span', null, m.oppName));
      } else {
        prow.appendChild(el('span', null, 'Win chance · ' + teamName() + ' ' + pct + '%'));
        prow.appendChild(el('span', null, m.oppName + ' ' + (100 - pct) + '%'));
      }
      pr.appendChild(prow);
      var bar = el('div', 'sc-prob__bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', (m.over ? 'Final result: ' : 'Estimated win chance: ') + teamName() + ' ' + pct + ' percent, ' + m.oppName + ' ' + (100 - pct) + ' percent');
      var sa = el('span', 'sc-prob__a'); sa.style.width = pct + '%';
      var sb = el('span', 'sc-prob__b'); sb.style.width = (100 - pct) + '%';
      bar.appendChild(sa); bar.appendChild(sb); pr.appendChild(bar);
      pr.appendChild(el('p', 'sc-prob__note', m.over ? 'Week is over.' : 'Estimate: the current lead weighed against the ' + left + ' trading day' + (left === 1 ? '' : 's') + ' left. Not a forecast.'));
    } else {
      pr.appendChild(el('p', 'sc-prob__note', !m.any ? 'No trading day has been scored yet.' : 'No score for ' + m.oppName + ' this week.'));
    }
    box.appendChild(pr);
  }

  // ---- day by day ----
  function colState(wk, d, over, today){
    if (arr(wk.days).indexOf(d) >= 0) return 'scored';
    if (d < today) return over ? 'nomarket' : 'nodata';
    return 'upcoming';
  }
  function renderDays(m){
    var card = $('days'), body = clear($('daysbody')), meta = $('daysmeta');
    if (!m || !m.team){ card.hidden = true; return; }
    card.hidden = false;
    meta.textContent = 'Team points';
    var wk = m.wk, days = C.weekDays(wk.week), today = C.nyDate(F.now());
    var states = days.map(function(d){ return colState(wk, d, m.over, today); });

    var wrap = el('div', 'sc-scroll');
    wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-labelledby', 'daysh'); wrap.tabIndex = 0;
    var t = el('table', 'v2-table sc-days');
    t.appendChild(el('caption', 'v2-sr', 'Points per trading day for ' + fmt.weekName(wk.week) + ': your players, your team total and ' + m.oppName + '. The captain\'s points count 1.5 times.'));
    var thead = el('thead'), hr = el('tr');
    var th0 = el('th', 'sc-days__who', 'Player'); th0.scope = 'col'; hr.appendChild(th0);
    days.forEach(function(d, i){
      var th = el('th', 'n sc-days__d'); th.scope = 'col';
      th.appendChild(el('span', 'sc-days__dn', weekday(d)));
      th.appendChild(el('span', 'sc-days__dd', fmt.shortDate(d)));
      if (states[i] === 'nomarket') th.appendChild(el('span', 'sc-days__st', 'No market'));
      else if (states[i] !== 'scored') th.appendChild(sr(' (not scored yet)'));
      hr.appendChild(th);
    });
    var thT = el('th', 'n sc-days__tot', 'Total'); thT.scope = 'col'; hr.appendChild(thT);
    thead.appendChild(hr); t.appendChild(thead);

    var anyLate = false;
    function cell(v, state, late){
      if (state !== 'scored') return el('td', 'n sc-na', '—');
      if (late){ anyLate = true; var td = el('td', 'n sc-na sc-late', '—'); td.appendChild(sr(' (before your late entry)')); return td; }
      return el('td', 'n ' + numCls(v), numTxt(v));
    }
    function whoCell(slug, captain, withLink){
      var p = F.person(slug), th = el('th', 'sc-days__who'); th.scope = 'row';
      var pl = el('div', 'v2-player sc-who');
      pl.appendChild(avatar(p));
      var tx = el('div', 'v2-player__txt');
      if (withLink) tx.appendChild(link('v2-player__name', p.name, personHref(slug)));
      else tx.appendChild(el('span', 'v2-player__name', p.name));
      if (slug === captain) tx.appendChild(el('span', 'v2-player__sub', 'Captain · ' + C.CAPTAIN_MULT + 'x'));
      pl.appendChild(tx);
      if (slug === captain){ var c = el('span', 'v2-badge-c', 'C'); c.title = 'Captain: scores 1.5 times'; c.setAttribute('aria-hidden', 'true'); pl.appendChild(c); }
      th.appendChild(pl);
      return th;
    }
    function teamRows(tb, tm, res){
      orderedPicks(tm).forEach(function(slug){
        var tr = el('tr', slug === tm.captain ? 'is-captain' : null);
        tr.appendChild(whoCell(slug, tm.captain, true));
        days.forEach(function(d, i){
          var late = res.perDay[d] === null && states[i] === 'scored';
          var v = res.perDay[d] ? res.perDay[d][slug] : null;
          tr.appendChild(cell(v, states[i], late));
        });
        var tot = m.any ? res.bySlug[slug] : null;
        tr.appendChild(el('td', 'n v2-strong ' + numCls(tot), numTxt(tot)));
        tb.appendChild(tr);
      });
    }
    function totalRow(tb, label, byDay, total, isTeam, cls){
      var tr = el('tr', 'sc-total' + (cls ? ' ' + cls : ''));
      var th = el('th', 'sc-days__who', label); th.scope = 'row'; tr.appendChild(th);
      days.forEach(function(d, i){
        var late = isTeam && byDay[d] === null && states[i] === 'scored';
        var v = byDay && typeof byDay[d] === 'number' ? byDay[d] : null;
        tr.appendChild(late ? cell(null, states[i], true) : (states[i] === 'scored' ? el('td', 'n ' + numCls(v), numTxt(v)) : cell(null, states[i])));
      });
      var tv = m.any && typeof total === 'number' ? total : null;
      tr.appendChild(el('td', 'n v2-strong ' + numCls(tv), numTxt(tv)));
      tb.appendChild(tr);
    }
    function groupRow(tb, text){
      var tr = el('tr', 'sc-group'), th = el('th'); th.scope = 'colgroup'; th.colSpan = days.length + 2;
      th.appendChild(el('span', 'sc-group__t', text));
      tr.appendChild(th); tb.appendChild(tr);
    }

    var tb1 = el('tbody');
    groupRow(tb1, teamName() + (m.team.lateFrom ? ' · late entry' : ''));
    teamRows(tb1, m.team, m.mine);
    totalRow(tb1, teamName() + ' total', m.mine.byDay, m.mine.total, true, 'sc-total--mine');
    t.appendChild(tb1);

    var tb2 = el('tbody', 'sc-opp');
    groupRow(tb2, 'Versus · ' + m.oppName);
    if (UI.opp === 'spy'){
      var tr = el('tr', 'sc-total');
      var th = el('th', 'sc-days__who'); th.scope = 'row';
      th.appendChild(el('span', 'sc-spy', 'S&P 500'));
      th.appendChild(el('span', 'v2-player__sub', 'SPY × 5'));
      tr.appendChild(th);
      days.forEach(function(d, i){
        var v = m.opp && typeof m.opp.byDay[d] === 'number' ? m.opp.byDay[d] : null;
        tr.appendChild(states[i] === 'scored' ? el('td', 'n ' + numCls(v), numTxt(v)) : cell(null, states[i]));
      });
      var sv = m.any && m.opp && typeof m.opp.total === 'number' ? m.opp.total : null;
      tr.appendChild(el('td', 'n v2-strong ' + numCls(sv), numTxt(sv)));
      tb2.appendChild(tr);
    } else if (m.oppTeam && m.opp){
      teamRows(tb2, m.oppTeam, m.opp);
      totalRow(tb2, m.oppName + ' total', m.opp.byDay, m.opp.total, false);
    } else {
      var trn = el('tr'), tdn = el('td', 'sc-na', 'No score for ' + m.oppName + ' this week.'); tdn.colSpan = days.length + 2;
      trn.appendChild(tdn); tb2.appendChild(trn);
    }
    t.appendChild(tb2);
    wrap.appendChild(t);
    body.appendChild(wrap);

    // notes (v1 wording)
    var notes = el('div', 'sc-notes');
    notes.appendChild(el('p', null, 'Team points: the captain\'s points count ' + C.CAPTAIN_MULT + ' times, rounded each day.'));
    if (anyLate || m.team.lateFrom) notes.appendChild(el('p', null, '— before your late entry: you score from ' + fmt.dayLabel(m.team.lateFrom) + '.'));
    if (states.indexOf('upcoming') >= 0 || states.indexOf('nodata') >= 0) notes.appendChild(el('p', null, '— on a day that is not scored yet: scores arrive after the close.'));
    if (states.indexOf('nomarket') >= 0) notes.appendChild(el('p', null, 'No market that day.'));
    if (!m.bm.perfect) notes.appendChild(el('p', null, 'Perfect team: the best possible lineup under the cap, worked out after the week ends.'));
    if (UI.opp === 'spy' && typeof m.bm.spy !== 'number' && m.any) notes.appendChild(el('p', null, 'No SPY quote was saved for these days, so the S&P 500 benchmark is not available.'));
    body.appendChild(notes);
  }

  // ---- last week ----
  function renderPrev(){
    var S = F.state, wk = S.prevWk, side = $('scside'), main = $('scmain');
    if (!wk){ side.hidden = true; main.className = 'span-12 v2-stack'; return; }
    side.hidden = false; main.className = 'span-8 v2-stack';
    var body = clear($('prevbody'));
    $('prevmeta').textContent = F.weekOver(wk) ? 'Final' : '';
    body.appendChild(el('span', 'v2-kicker', fmt.weekTitle(wk.week)));
    body.appendChild(el('p', 'sc-prev__range', range(wk) + (wk.practice ? ' · practice, not counted in your season' : '')));
    var team = wk.practice ? null : F.store().teams[wk.week];
    if (!team || !team.picks){
      body.appendChild(el('p', 'v2-msg', wk.practice ? 'Practice weeks are not counted in your season.' : 'You did not have a team in ' + fmt.weekName(wk.week) + '.'));
      return;
    }
    var bm = wk.benchmarks || {};
    var mine = F.teamWeek(wk, team).total;
    var big = el('div', 'sc-prev__mine');
    big.appendChild(el('span', 'v2-label', teamName()));
    big.appendChild(el('span', 'sc-prev__num ' + numCls(mine), signedTxt(mine)));
    body.appendChild(big);
    if (team.lateFrom) body.appendChild(el('p', 'v2-msg', 'Late entry: scored from ' + fmt.dayLabel(team.lateFrom) + '.'));
    var ul = el('ul', 'sc-prev__list');
    function line(label, v, perfect){
      var li = el('li');
      li.appendChild(el('span', 'sc-prev__k', label));
      if (typeof v !== 'number'){ li.appendChild(el('span', 'sc-prev__v v2-zero', 'n/a')); ul.appendChild(li); return; }
      var word = perfect ? (mine >= v ? 'Matched' : 'Missed') : (mine > v ? 'Won' : (mine < v ? 'Lost' : 'Tied'));
      var good = word === 'Won' || word === 'Matched';
      var r = el('span', 'sc-prev__v');
      r.appendChild(el('span', 'sc-res' + (good ? ' is-win' : ''), word));
      r.appendChild(el('span', 'num ' + numCls(v), ' ' + signedTxt(v)));
      li.appendChild(r);
      ul.appendChild(li);
    }
    line('vs S&P 500', bm.spy);
    line('vs Top 5 richest', bm.top5 ? F.teamWeek(wk, bm.top5).total : null);
    line('vs Perfect team', bm.perfect ? bm.perfect.points : null, true);
    body.appendChild(ul);
  }

  // ---- season record (v1 renderSeason) ----
  var seasonSeq = 0;
  function renderSeason(){
    var S = F.state, store = F.store(), body = clear($('seasonbody'));
    var weeks = arr(S.index && S.index.weeks).filter(function(w){ return w.final && !w.practice && store.teams[w.week]; });
    var seq = ++seasonSeq;
    if (!weeks.length){
      var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
      emptyState(body, 'No finished weeks yet', (first ? 'The first real week starts ' + fmt.dayLabel(first) + '. ' : '') + 'Save a lineup before the lock, and your record against the S&P 500, the Top 5 richest and the perfect team builds here week by week.');
      return;
    }
    body.appendChild(el('p', 'v2-loading', 'Loading your season…'));
    Promise.all(weeks.map(function(w){ return F.loadWeek(w.week); })).then(function(files){
      if (seq !== seasonSeq) return;
      var rec = F.pure.seasonRecord(files.map(function(wk, i){ return { wk: wk, team: store.teams[weeks[i].week] }; }));
      store.record = { played: rec.played, winsSpy: rec.winsSpy, winsTop5: rec.winsTop5, winsPerfect: rec.winsPerfect, best: rec.best, streak: rec.streak };
      F.persist();
      clear(body);
      var g = el('div', 'sc-rec');
      [['Weeks played', String(rec.played), false],
       ['vs S&P 500', rec.winsSpy + '–' + (rec.played - rec.winsSpy), rec.winsSpy * 2 > rec.played],
       ['vs Top 5 richest', rec.winsTop5 + '–' + (rec.played - rec.winsTop5), rec.winsTop5 * 2 > rec.played],
       ['Matched perfect', rec.winsPerfect + ' of ' + rec.played, false],
       ['Best week', rec.best ? signedTxt(rec.best.points) : '—', false, rec.best ? fmt.shortDate(C.weekMonday(rec.best.week)) : ''],
       ['Streak', rec.streak ? 'W' + rec.streak : '—', rec.streak > 0, 'weeks beating the S&P 500']].forEach(function(x){
        var d = el('div', 'v2-stat sc-rec__stat' + (x[2] ? ' is-win' : ''));
        d.appendChild(el('span', 'v2-stat__label', x[0]));
        d.appendChild(el('span', 'v2-stat__value', x[1]));
        if (x[3]) d.appendChild(el('span', 'sc-rec__sub', x[3]));
        g.appendChild(d);
      });
      body.appendChild(g);
      var hh = el('h3', 'v2-h3 sc-hist__h', 'Weekly history'); hh.id = 'histh';
      body.appendChild(hh);
      var wrap = el('div', 'sc-scroll');
      wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-labelledby', 'histh'); wrap.tabIndex = 0;
      var t = el('table', 'v2-table sc-hist');
      t.appendChild(el('caption', 'sc-hist__cap', 'Finished weeks, newest first. W = you beat that benchmark.'));
      var hr = el('tr');
      [['Week', ''], ['My points', 'n'], ['S&P 500', 'n'], ['Top 5', 'n'], ['Perfect', 'n']].forEach(function(x){ var th = el('th', x[1] || null, x[0]); th.scope = 'col'; hr.appendChild(th); });
      var th0 = el('thead'); th0.appendChild(hr); t.appendChild(th0);
      var tb = el('tbody');
      function res(mine, v, winIfGe){
        var td = el('td', 'n');
        if (typeof v !== 'number'){ td.appendChild(el('span', 'v2-zero', 'n/a')); return td; }
        var w = winIfGe ? mine >= v : mine > v;
        td.appendChild(el('span', 'sc-res' + (w ? ' is-win' : ''), w ? 'W' : 'L'));
        td.appendChild(el('span', numCls(v), ' ' + signedTxt(v)));
        return td;
      }
      rec.rows.forEach(function(r){
        var tr = el('tr'), th = el('th', 'sc-days__who', 'Week of ' + fmt.shortDate(C.weekMonday(r.week)) + (rec.best && rec.best.week === r.week ? ' · best' : '')); th.scope = 'row';
        tr.appendChild(th);
        tr.appendChild(el('td', 'n v2-strong ' + numCls(r.mine), signedTxt(r.mine)));
        tr.appendChild(res(r.mine, r.spy)); tr.appendChild(res(r.mine, r.top5)); tr.appendChild(res(r.mine, r.perfect, true));
        tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t); body.appendChild(wrap);
    }, function(){
      if (seq !== seasonSeq) return;
      clear(body).appendChild(el('p', 'v2-msg', 'Your season record is not available right now.'));
    });
  }

  // ---- page ----
  function renderMatchPart(){ var m = matchup(); renderHead(m); renderBoard(m); renderDays(m); }
  function renderAll(){ renderMatchPart(); renderPrev(); renderSeason(); }
  function fail(){
    $('weekpill').textContent = 'Data unavailable';
    var box = clear($('board'));
    box.removeAttribute('aria-busy');
    var h = el('h2', 'v2-sr', 'Your matchup'); h.id = 'boardh'; box.appendChild(h);
    box.appendChild(el('span', 'v2-kicker', 'Scores'));
    box.appendChild(el('p', 'sc-board__sub', 'The game data is not available right now. Try again later.'));
    var r = btn('v2-btn v2-btn--ghost sc-retry', 'Try again');
    r.addEventListener('click', function(){ location.reload(); });
    box.appendChild(r);
    $('days').hidden = true;
    $('scside').hidden = true; $('scmain').className = 'span-12 v2-stack';
    clear($('seasonbody')).appendChild(el('p', 'v2-msg', 'Your season record will show here when the game data loads.'));
    say('The game data is not available right now.');
  }
  // After the page is drawn, bring #season / #leaderboard back into view (the layout above them changed).
  function toHash(){
    var id = String(location.hash || '').replace(/^#/, '');
    if (/^tab=/.test(id)) id = 'leaderboard';   // leaderboard tabs (assets/leagues.js keeps #tab=week|season|coins)
    if (id !== 'season' && id !== 'leaderboard') return;
    var n = $(id);
    if (n && n.scrollIntoView) n.scrollIntoView();
  }

  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('button[data-opp]') : null;
    if (!b || b.disabled) return;
    var id = b.getAttribute('data-opp');
    if (id === UI.opp) return;
    UI.opp = id;
    renderMatchPart();
    var n = $('board').querySelector('[data-opp="' + id + '"]');
    if (n) n.focus();
    var m = matchup();
    if (m && m.team) say('Versus ' + m.oppName + ': ' + teamName() + ' ' + numTxt(m.a) + ', ' + m.oppName + ' ' + numTxt(m.b) + '.');
  });

  if (F.testClock() != null){ var tcb = $('testclock'); tcb.hidden = false; tcb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }

  F.onChange(function(kind){
    if (!F.state.loaded) return;
    if (kind === 'online'){ renderMatchPart(); renderPrev(); }
  });

  F.init().then(function(){ renderAll(); toHash(); }, function(err){ if (window.console) console.warn(err); fail(); });
})();
