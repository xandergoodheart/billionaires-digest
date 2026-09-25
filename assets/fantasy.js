/* Billionaires Digest: Billionaire Fantasy League (fantasy.html). ES5.
   Reads data/fantasy/index.json, weeks/<W>.json and days/<date>.json. Rules live in assets/fantasy-core.js.
   The player's teams are kept in this browser only (localStorage, with an in-memory fallback). Game only. */
(function(){
  BD.initTheme();
  var C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr;
  var KEY = 'bd-fantasy-v1';
  var DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---- clock (?now=ISO overrides it, for testing only) ----
  var nowOverride = null;
  (function(){
    var m = /[?&]now=([^&]+)/.exec(location.search);
    if (!m) return;
    var t = Date.parse(decodeURIComponent(m[1]));
    if (isFinite(t)) nowOverride = { at: t, started: Date.now() };
  })();
  function now(){ return nowOverride ? nowOverride.at + (Date.now() - nowOverride.started) : Date.now(); }

  // ---- storage ----
  var memory = null;
  function blank(){ return { v: 1, teams: {}, draft: { picks: [], captain: null }, record: null }; }
  function load(){
    var s = null;
    try { var raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = memory; }
    if (!s || typeof s !== 'object') s = memory || blank();
    if (!s.teams || typeof s.teams !== 'object') s.teams = {};
    if (!s.draft || !(s.draft.picks instanceof Array)) s.draft = { picks: [], captain: null };
    return s;
  }
  function persist(){
    memory = store;
    try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }
  var store = load();

  // ---- data ----
  function getJson(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function optJson(u){ return getJson(u).then(null, function(){ return null; }); }
  var weekCache = {};
  function loadWeek(id){ if (!weekCache[id]) weekCache[id] = optJson('data/fantasy/weeks/' + id + '.json'); return weekCache[id]; }

  var S = { index: null, draftWk: null, draftWeek: null, salaryFallback: false, sbWk: null, lastDay: null, people: {}, picks: [], captain: null };

  // ---- formatting ----
  function signed(n){ return typeof n === 'number' ? (n > 0 ? '+' + n : String(n)) : '—'; }
  function cls(n){ return typeof n === 'number' ? (n > 0 ? 'up' : (n < 0 ? 'down' : 'flat')) : 'flat'; }
  function dayLabel(d){ return DAYN[C.weekday(d)] + ' ' + BD.MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }
  function shortDate(d){ return BD.MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }
  function weekName(id){ return C.isPractice(id) ? 'the practice week' : 'the week of ' + shortDate(C.weekMonday(id)); }
  function lockText(ms){
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) + ' ET';
    } catch (e) { return new Date(ms).toUTCString(); }
  }
  function span(ms){
    var m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + mm + 'm';
  }
  function say(t){ var n = document.getElementById('live'); n.textContent = ''; setTimeout(function(){ n.textContent = t; }, 30); }
  function msg(id, t, bad){ var n = document.getElementById(id); n.textContent = t || ''; n.className = 'fl-msg' + (bad ? ' bad' : ''); }
  function person(slug){ return S.people[slug] || { slug: slug, name: slug, sector: 'Other' }; }
  function personLink(slug, size){
    var p = person(slug);
    var a = el('a', 'fl-person');
    a.href = 'people/' + encodeURIComponent(slug) + '/';
    if (size) a.appendChild(BD.avatar({ name: p.name, sector: p.sector || 'Other' }, size, 10));
    a.appendChild(el('span', 'fl-pname', p.name));
    return a;
  }
  function salaries(){ return (S.draftWk && S.draftWk.salaries) || {}; }
  function capUsed(){ var s = salaries(), t = 0; S.picks.forEach(function(p){ t += s[p] || 0; }); return t; }

  // ---- roster editing ----
  function saveDraft(){ store.draft = { picks: S.picks.slice(), captain: S.captain, week: S.draftWeek }; persist(); }
  function savedTeam(){ return store.teams[S.draftWeek] || null; }
  function dirty(){
    var t = savedTeam();
    if (!t) return S.picks.length > 0;
    return t.captain !== S.captain || t.picks.slice().sort().join() !== S.picks.slice().sort().join();
  }
  function capLine(){ var u = capUsed(); return 'Cap used ' + u + ' of ' + C.CAP + ', ' + (C.CAP - u) + ' left.'; }
  function addPick(slug){
    if (S.picks.indexOf(slug) >= 0 || S.picks.length >= C.PICKS) return;
    if (capUsed() + (salaries()[slug] || 0) > C.CAP) return;
    S.picks.push(slug);
    if (!S.captain) S.captain = slug;
    saveDraft(); renderTeam(); renderPool(); renderScore();
    say('Added ' + person(slug).name + '. ' + capLine() + (S.captain === slug ? ' Captain.' : ''));
  }
  function removePick(slug){
    var i = S.picks.indexOf(slug);
    if (i < 0) return;
    S.picks.splice(i, 1);
    if (S.captain === slug) S.captain = S.picks[0] || null;
    saveDraft(); renderTeam(); renderPool(); renderScore();
    say('Removed ' + person(slug).name + '. ' + capLine() + (S.captain ? ' Captain: ' + person(S.captain).name + '.' : ''));
  }
  function setCaptain(slug){
    S.captain = slug;
    saveDraft(); renderTeam(); renderScore();
    say(person(slug).name + ' is captain and scores 1.5 times.');
  }

  // ---- hero / lock ----
  function renderLock(){
    var box = document.getElementById('lockbox');
    box.innerHTML = '';
    var t = now(), dw = C.draftWeek(t), info = C.weekInfo(dw);
    var big = el('div', 'fl-count-big');
    big.appendChild(el('span', 'label', 'Roster for ' + weekName(dw) + ' locks in'));
    big.appendChild(el('strong', 'display', span(info.locksAt - t)));
    box.appendChild(big);
    box.appendChild(el('p', 'fl-locksub', lockText(info.locksAt) + '. Saving any time before then sets that week\'s team.'));
    var lw = C.lockedWeek(t), li = C.weekInfo(lw);
    if (t >= li.locksAt && C.nyDate(t) <= li.end && !C.isPractice(lw)) {
      box.appendChild(el('p', 'fl-locksub', 'This week (' + shortDate(li.start) + '–' + shortDate(li.end) + ') locked ' + lockText(li.locksAt) + '. New saves count from next week' + (store.teams[lw] ? '.' : ', or as a late entry from the next trading day if you have no team this week.')));
    }
    if (S.draftWeek && dw !== S.draftWeek) { init(); }
  }

  // ---- my team ----
  function renderTeam(){
    var sal = salaries();
    var lead = document.getElementById('teamlead');
    var info = C.weekInfo(S.draftWeek);
    lead.textContent = 'Your roster for ' + weekName(S.draftWeek) + ' (' + shortDate(info.start) + '–' + shortDate(info.end) + '). It locks ' + lockText(info.locksAt) + '.' +
      (S.salaryFallback ? ' Salaries for that week are not out yet, so these are this week\'s; they may change when the week opens.' : '') +
      (savedTeam() ? (dirty() ? ' You have unsaved changes.' : ' Saved.') : ' Not saved yet.');

    var used = capUsed(), cap = document.getElementById('capbox');
    cap.innerHTML = '';
    var row = el('div', 'fl-caprow');
    row.appendChild(el('span', 'label', 'Cap used'));
    row.appendChild(el('strong', used > C.CAP ? 'down' : null, used + ' / ' + C.CAP));
    row.appendChild(el('span', 'fl-capleft' + (used > C.CAP ? ' down' : ''), used > C.CAP ? 'Over by ' + (used - C.CAP) : (C.CAP - used) + ' left'));
    cap.appendChild(row);
    var meter = el('div', 'fl-meter');
    meter.setAttribute('role', 'meter'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(C.CAP));
    meter.setAttribute('aria-valuenow', String(used)); meter.setAttribute('aria-label', 'Cap used');
    var fill = el('span', used > C.CAP ? 'over' : null); fill.style.width = Math.min(100, used / C.CAP * 100) + '%';
    meter.appendChild(fill); cap.appendChild(meter);
    // warn when the remaining picks can no longer fit
    var need = C.PICKS - S.picks.length;
    if (need > 0 && S.picks.length){
      var rest = [];
      for (var k in sal) if (S.picks.indexOf(k) < 0) rest.push(sal[k]);
      rest.sort(function(a, b){ return a - b; });
      var min = 0; for (var j = 0; j < need && j < rest.length; j++) min += rest[j];
      if (min > C.CAP - used) cap.appendChild(el('p', 'fl-msg bad', 'The cheapest ' + need + ' left cost ' + min + ', more than your ' + (C.CAP - used) + ' left. Swap someone out to finish your team.'));
    }

    var ol = document.getElementById('slots');
    ol.innerHTML = '';
    for (var i = 0; i < C.PICKS; i++){
      var slug = S.picks[i];
      var li = el('li', 'fl-slot' + (slug ? '' : ' empty'));
      if (!slug){
        li.appendChild(el('span', 'fl-slotn', String(i + 1)));
        var e = el('span', 'fl-slotempty');
        e.appendChild(document.createTextNode('Empty. '));
        var a = el('a', null, 'Pick from the draft room'); a.href = '#draft'; e.appendChild(a);
        li.appendChild(e);
        ol.appendChild(li);
        continue;
      }
      var p = person(slug);
      li.appendChild(el('span', 'fl-slotn', String(i + 1)));
      var main = el('div', 'fl-slotmain');
      main.appendChild(personLink(slug, 36));
      main.appendChild(el('span', 'fl-slotmeta', 'Salary ' + (sal[slug] != null ? sal[slug] : '—') + (S.captain === slug ? ' · Captain, scores 1.5×' : '')));
      li.appendChild(main);
      var acts = el('div', 'fl-slotacts');
      var cb = el('button', 'fl-btn fl-cap' + (S.captain === slug ? ' on' : ''), S.captain === slug ? 'Captain' : 'Make captain');
      cb.type = 'button';
      cb.setAttribute('aria-pressed', S.captain === slug ? 'true' : 'false');
      cb.setAttribute('aria-label', 'Captain: ' + p.name);
      cb.setAttribute('data-captain', slug);
      acts.appendChild(cb);
      var rb = el('button', 'fl-btn ghost', 'Remove');
      rb.type = 'button';
      rb.setAttribute('aria-label', 'Remove ' + p.name);
      rb.setAttribute('data-remove', slug);
      acts.appendChild(rb);
      li.appendChild(acts);
      ol.appendChild(li);
    }
    var v = C.validateTeam(S.picks, S.captain, sal);
    var sb = document.getElementById('savebtn');
    sb.disabled = !v.ok || !dirty();
    sb.textContent = savedTeam() && !dirty() ? 'Saved' : 'Save team';
    document.getElementById('clearbtn').disabled = !S.picks.length;
  }

  function saveTeam(){
    var v = C.validateTeam(S.picks, S.captain, salaries());
    if (!v.ok){ msg('teammsg', v.errors.join('. ') + '.', true); say(v.errors.join('. ')); return; }
    var t = now();
    var team = { picks: S.picks.slice(), captain: S.captain, savedAt: new Date(t).toISOString() };
    store.teams[S.draftWeek] = team;
    var text = 'Saved for ' + weekName(S.draftWeek) + '.';
    // late entry into the running week
    var lw = C.lockedWeek(t), from = C.lateFrom(t);
    if (!C.isPractice(lw) && !store.teams[lw] && from && S.sbWk && S.sbWk.week === lw && S.picks.every(function(s){ return S.sbWk.salaries[s] != null; })){
      store.teams[lw] = { picks: S.picks.slice(), captain: S.captain, savedAt: team.savedAt, lateFrom: from };
      text += ' You are also in this week as a late entry, scoring from ' + dayLabel(from) + '.';
    }
    var ok = persist();
    if (!ok) text += ' Your browser is not keeping site data, so this team will be gone when you close the page. Copy your team code to keep it.';
    msg('teammsg', text, !ok);
    say(text);
    renderTeam(); renderScore(); renderSeason();
  }

  // ---- scoreboard ----
  function dayPeople(wk, d){ var o = {}, m = (wk.daily && wk.daily[d]) || {}; for (var k in m) o[k] = { points: m[k] }; return { people: o }; }
  function teamWeek(wk, team){
    var byDay = {}, total = 0, bySlug = {};
    team.picks.forEach(function(s){ bySlug[s] = 0; });
    arr(wk.days).forEach(function(d){
      if (team.lateFrom && d < team.lateFrom){ byDay[d] = null; return; }
      var r = C.teamDay(team.picks, team.captain, dayPeople(wk, d));
      byDay[d] = r.total; total += r.total;
      for (var s in r.bySlug) bySlug[s] += r.bySlug[s];
    });
    return { byDay: byDay, total: total, bySlug: bySlug };
  }
  function cell(tr, v, tag){ var td = el(tag || 'td', typeof v === 'number' ? cls(v) : null, typeof v === 'number' ? signed(v) : (v == null ? '—' : v)); tr.appendChild(td); return td; }

  function renderScore(){
    var box = document.getElementById('scorebox');
    box.innerHTML = '';
    var wk = S.sbWk;
    var h = document.getElementById('scoreh');
    if (!wk){ h.textContent = 'This week'; box.appendChild(el('p', 'tempty', 'No scores yet. The first scores arrive after the first trading day.')); return; }
    var practice = !!wk.practice;
    h.textContent = practice ? 'Practice week' : 'This week';
    var team = null, note = '';
    if (practice){
      if (S.picks.length === C.PICKS && S.captain) team = { picks: S.picks.slice(), captain: S.captain };
      note = 'Practice: your current picks scored on the sample day' + (wk.days.length === 1 ? '' : 's') + ' below. Not counted in your season.';
    } else {
      team = store.teams[wk.week] || null;
      if (team) note = 'Your team is locked for this week' + (team.lateFrom ? ' (late entry, scoring from ' + dayLabel(team.lateFrom) + ')' : '') + '.';
      else note = 'You have no team in this week. Save one and it counts from next week' + (C.lateFrom(now()) ? ', or right away as a late entry' : '') + '.';
    }
    var head = el('p', 'tlead', shortDate(wk.start) + '–' + shortDate(wk.end) + (wk.final ? ' · final' : '') + '. ' + note);
    box.appendChild(head);
    if (practice && !team) box.appendChild(el('p', 'tnote', 'Pick five and a captain to see how they would have scored.'));

    var mine = team ? teamWeek(wk, team) : null;
    var t5 = wk.benchmarks && wk.benchmarks.top5;
    var t5w = t5 ? teamWeek(wk, t5) : null;
    var wrap = el('div', 'ttable-wrap');
    var tbl = el('table', 'ttable fl-table');
    var cap = el('caption', null, 'Points by trading day. S&P 500 is SPY return × 100 × 5.');
    tbl.appendChild(cap);
    var thead = el('thead'), hr = el('tr');
    ['Day', 'My team', 'S&P 500', 'Top 5 richest'].forEach(function(x){ var th = el('th', null, x); th.scope = 'col'; hr.appendChild(th); });
    thead.appendChild(hr); tbl.appendChild(thead);
    var tb = el('tbody');
    var days = practice ? arr(wk.days) : C.weekDays(wk.week);
    days.forEach(function(d){
      var tr = el('tr'), th = el('th', null, dayLabel(d)); th.scope = 'row'; tr.appendChild(th);
      var scored = arr(wk.days).indexOf(d) >= 0;
      if (!scored){ cell(tr, C.isWeekday(d) && d <= C.nyDate(now()) && wk.final ? 'no market' : '—'); cell(tr, '—'); cell(tr, '—'); tb.appendChild(tr); return; }
      cell(tr, mine ? (mine.byDay[d] == null ? 'before entry' : mine.byDay[d]) : '—');
      cell(tr, wk.spyDaily && typeof wk.spyDaily[d] === 'number' ? wk.spyDaily[d] : 'n/a');
      cell(tr, t5w ? t5w.byDay[d] : '—');
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    var tf = el('tfoot'), fr = el('tr'), fth = el('th', null, 'Total'); fth.scope = 'row'; fr.appendChild(fth);
    var any = arr(wk.days).length > 0;
    cell(fr, mine && any ? mine.total : '—');
    cell(fr, typeof wk.benchmarks.spy === 'number' ? wk.benchmarks.spy : (any ? 'n/a' : '—'));
    cell(fr, t5w && any ? t5w.total : '—');
    tf.appendChild(fr); tbl.appendChild(tf);
    wrap.appendChild(tbl); box.appendChild(wrap);
    if (wk.benchmarks.spy == null && wk.days.length) box.appendChild(el('p', 'tnote', 'No SPY quote was saved for these days, so the S&P 500 benchmark is not available.'));

    // verdict
    if (mine && wk.days.length){
      var bits = [];
      if (typeof wk.benchmarks.spy === 'number') bits.push((mine.total >= wk.benchmarks.spy ? 'ahead of' : 'behind') + ' the S&P 500 by ' + Math.abs(mine.total - wk.benchmarks.spy));
      if (t5w) bits.push((mine.total >= t5w.total ? 'ahead of' : 'behind') + ' the Top 5 richest by ' + Math.abs(mine.total - t5w.total));
      if (bits.length) box.appendChild(el('p', 'fl-verdict', 'You are ' + bits.join(' and ') + '.'));
    }
    // perfect team
    var pf = wk.benchmarks.perfect;
    var pp = el('p', 'tnote');
    if (pf){
      pp.textContent = 'Perfect team: ' + signed(pf.points) + ' points with ' + pf.picks.map(function(s){ return person(s).name + (s === pf.captain ? ' (captain)' : ''); }).join(', ') + ' (salary ' + pf.salary + ').';
    } else pp.textContent = 'Perfect team: worked out after the week ends.';
    box.appendChild(pp);
    if (t5) box.appendChild(el('p', 'tnote', 'Top 5 richest: ' + t5.picks.map(function(s){ return person(s).name + (s === t5.captain ? ' (captain)' : ''); }).join(', ') + '.'));

    // per pick
    if (mine){
      var ul = el('ul', 'fl-picks');
      team.picks.forEach(function(s){
        var li = el('li');
        li.appendChild(personLink(s, 28));
        if (s === team.captain) li.appendChild(el('span', 'fl-badge', 'C'));
        li.appendChild(el('strong', 'fl-pts ' + cls(mine.bySlug[s]), wk.days.length ? signed(mine.bySlug[s]) : '—'));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
  }

  // ---- draft room ----
  var filt = { q: '', sector: '', sort: 'rank', afford: false };
  function renderPool(){
    var list = document.getElementById('pool');
    list.innerHTML = '';
    var wk = S.draftWk;
    if (!wk){ list.appendChild(el('li', 'tempty', 'The draft room is not available right now.')); return; }
    var sal = wk.salaries, used = capUsed(), full = S.picks.length >= C.PICKS;
    var last = S.lastDay && S.lastDay.people || {};
    var weekTotals = (S.sbWk && S.sbWk.totals) || {};
    var news = (S.index && S.index.news) || {};
    var q = BD.norm(filt.q);
    var rows = arr(wk.draftable).filter(function(p){
      if (filt.sector && p.sector !== filt.sector) return false;
      if (q){
        var hay = BD.norm(p.name + ' ' + arr(p.holdings).map(function(h){ return h.ticker + ' ' + h.name; }).join(' '));
        if (hay.indexOf(q) < 0) return false;
      }
      if (filt.afford && S.picks.indexOf(p.slug) < 0 && (full || used + sal[p.slug] > C.CAP)) return false;
      return true;
    });
    function lastPts(p){ return last[p.slug] ? last[p.slug].points : -1e9; }
    function weekPts(p){ return typeof weekTotals[p.slug] === 'number' ? weekTotals[p.slug] : -1e9; }
    var sorters = {
      'rank': function(a, b){ return a.rank - b.rank; },
      'salary-desc': function(a, b){ return sal[b.slug] - sal[a.slug] || a.rank - b.rank; },
      'salary-asc': function(a, b){ return sal[a.slug] - sal[b.slug] || a.rank - b.rank; },
      'last-desc': function(a, b){ return lastPts(b) - lastPts(a) || a.rank - b.rank; },
      'week-desc': function(a, b){ return weekPts(b) - weekPts(a) || a.rank - b.rank; },
      'news-desc': function(a, b){ return (news[b.slug] || 0) - (news[a.slug] || 0) || a.rank - b.rank; },
      'name': function(a, b){ return a.name.localeCompare(b.name); }
    };
    rows.sort(sorters[filt.sort] || sorters.rank);
    document.getElementById('draftcount').textContent = rows.length + ' of ' + arr(wk.draftable).length + ' draftable' + (S.lastDay ? ' · last day scored ' + dayLabel(S.lastDay.date) + (S.lastDay.practice ? ' (practice)' : '') : '');
    if (!rows.length){ list.appendChild(el('li', 'tempty', 'Nobody matches these filters.')); return; }
    rows.forEach(function(p){
      var picked = S.picks.indexOf(p.slug) >= 0;
      var li = el('li', 'fl-row' + (picked ? ' picked' : ''));
      var who = el('div', 'fl-who');
      who.appendChild(personLink(p.slug, 40));
      who.appendChild(el('span', 'fl-meta', '#' + p.rank + ' · ' + p.sector + ' · ' + (p.method || '')));
      var hs = el('span', 'fl-holds');
      arr(p.holdings).slice(0, 3).forEach(function(h){
        var pct = h.weight * 100, txt = h.ticker + ' ' + (pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)) + '%';
        var b = el('span', 'fl-hold' + (h.tier === 'stakes' ? ' stake' : ''), txt);
        var tierTxt = h.tier === 'controls' ? 'controlled company' : (h.tier === 'stakes' ? 'other stake' : '');
        b.title = h.name + (tierTxt ? ', ' + tierTxt : '') + (h.adr ? ' (US ADR line, used for daily moves only)' : '');
        hs.appendChild(b);
      });
      if (arr(p.holdings).length > 3) hs.appendChild(el('span', 'fl-hold more', '+' + (p.holdings.length - 3) + ' more'));
      who.appendChild(hs);
      li.appendChild(who);
      var st = el('dl', 'fl-stats');
      function stat(k, v, c){ var d = el('div'); d.appendChild(el('dt', null, k)); d.appendChild(el('dd', c || null, v)); st.appendChild(d); }
      stat('Salary', String(sal[p.slug]), 'fl-sal');
      var lp = last[p.slug] ? last[p.slug].points : null;
      stat('Last day', lp == null ? '—' : signed(lp), cls(lp));
      var wp = typeof weekTotals[p.slug] === 'number' && S.sbWk && S.sbWk.days.length ? weekTotals[p.slug] : null;
      stat('Week', wp == null ? '—' : signed(wp), cls(wp));
      stat('News', String(news[p.slug] || 0));
      li.appendChild(st);
      var act = el('div', 'fl-act');
      var btn = el('button', 'fl-btn' + (picked ? ' on' : ''), picked ? 'Remove' : 'Add');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', picked ? 'true' : 'false');
      btn.setAttribute('aria-label', (picked ? 'Remove ' : 'Add ') + p.name + ', salary ' + sal[p.slug]);
      btn.setAttribute(picked ? 'data-remove' : 'data-add', p.slug);
      var reason = '';
      if (!picked){
        if (full) reason = 'Roster full';
        else if (used + sal[p.slug] > C.CAP) reason = 'Over cap by ' + (used + sal[p.slug] - C.CAP);
      }
      if (reason){
        btn.disabled = true;
        var rid = 'why-' + p.slug;
        btn.setAttribute('aria-describedby', rid);
        act.appendChild(btn);
        var r = el('span', 'fl-why', reason); r.id = rid; act.appendChild(r);
      } else act.appendChild(btn);
      li.appendChild(act);
      list.appendChild(li);
    });
  }

  // ---- season record ----
  function renderSeason(){
    var box = document.getElementById('seasonbox');
    var weeks = arr(S.index && S.index.weeks).filter(function(w){ return w.final && !w.practice && store.teams[w.week]; });
    if (!weeks.length){
      box.innerHTML = '';
      var first = S.index && S.index.firstRealWeek ? C.weekMonday(S.index.firstRealWeek) : null;
      box.appendChild(el('p', 'tempty', 'No finished weeks yet.' + (first ? ' The first real week starts ' + dayLabel(first) + '.' : '')));
      return;
    }
    Promise.all(weeks.map(function(w){ return loadWeek(w.week); })).then(function(files){
      var rec = { played: 0, winsSpy: 0, winsTop5: 0, winsPerfect: 0, best: null, streak: 0, rows: [] };
      files.forEach(function(wk, i){
        if (!wk) return;
        var team = store.teams[weeks[i].week];
        var mine = teamWeek(wk, team).total;
        var t5 = wk.benchmarks.top5 ? teamWeek(wk, wk.benchmarks.top5).total : null;
        var spy = wk.benchmarks.spy, pf = wk.benchmarks.perfect ? wk.benchmarks.perfect.points : null;
        rec.played++;
        var beatSpy = typeof spy === 'number' && mine > spy;
        if (beatSpy) rec.winsSpy++;
        if (typeof t5 === 'number' && mine > t5) rec.winsTop5++;
        if (typeof pf === 'number' && mine >= pf) rec.winsPerfect++;
        if (!rec.best || mine > rec.best.points) rec.best = { week: wk.week, points: mine };
        rec.rows.push({ week: wk.week, mine: mine, spy: spy, top5: t5, perfect: pf, beatSpy: beatSpy });
      });
      rec.rows.sort(function(a, b){ return a.week < b.week ? 1 : -1; });
      for (var i = 0; i < rec.rows.length && rec.rows[i].beatSpy; i++) rec.streak++;
      store.record = { played: rec.played, winsSpy: rec.winsSpy, winsTop5: rec.winsTop5, winsPerfect: rec.winsPerfect, best: rec.best, streak: rec.streak };
      persist();
      box.innerHTML = '';
      var g = el('div', 'tstat fl-rec');
      [['Weeks played', rec.played], ['Beat the S&P 500', rec.winsSpy + ' of ' + rec.played], ['Beat the Top 5 richest', rec.winsTop5 + ' of ' + rec.played],
       ['Matched the perfect team', rec.winsPerfect + ' of ' + rec.played], ['Best week', rec.best ? signed(rec.best.points) + ' (' + shortDate(C.weekMonday(rec.best.week)) + ')' : '—'],
       ['Current streak', rec.streak + (rec.streak === 1 ? ' week' : ' weeks') + ' beating the S&P']].forEach(function(x){
        var d = el('div'); d.appendChild(el('div', 'label', x[0])); d.appendChild(el('div', 'big serif', String(x[1]))); g.appendChild(d);
      });
      box.appendChild(g);
      var wrap = el('div', 'ttable-wrap'), t = el('table', 'ttable');
      t.appendChild(el('caption', null, 'Finished weeks'));
      var hr = el('tr'); ['Week', 'Me', 'S&P 500', 'Top 5', 'Perfect'].forEach(function(x){ var th = el('th', null, x); th.scope = 'col'; hr.appendChild(th); });
      var th0 = el('thead'); th0.appendChild(hr); t.appendChild(th0);
      var tb = el('tbody');
      rec.rows.forEach(function(r){
        var tr = el('tr'), th = el('th', null, shortDate(C.weekMonday(r.week))); th.scope = 'row'; tr.appendChild(th);
        cell(tr, r.mine); cell(tr, typeof r.spy === 'number' ? r.spy : 'n/a'); cell(tr, r.top5); cell(tr, r.perfect);
        tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
    });
  }

  // ---- export / import / share ----
  function copyText(text, okMsg){
    function fallback(){
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'fl-copy';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (ok){ msg('iomsg', okMsg); say(okMsg); }
      else { msg('iomsg', 'Copy this: ' + text); say('Copy failed. The text is shown below the buttons.'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ msg('iomsg', okMsg); say(okMsg); }, fallback);
    } else fallback();
  }
  function exportCode(){
    var n = 0; for (var k in store.teams) n++;
    if (!n){ msg('iomsg', 'Save a team first.', true); say('Save a team first.'); return; }
    var code = C.exportCode(store.teams);
    document.getElementById('importcode').value = code;
    copyText(code, 'Team code copied. It is also in the box below.');
  }
  function importCode(){
    var v = document.getElementById('importcode').value;
    var teams;
    try { teams = C.importCode(v); } catch (e) { msg('iomsg', 'That code did not work. Check that you pasted all of it.', true); say('That code did not work.'); return; }
    var n = 0;
    for (var w in teams){ store.teams[w] = teams[w]; store.teams[w].savedAt = new Date(now()).toISOString(); n++; }
    if (!n){ msg('iomsg', 'That code has no teams in it.', true); return; }
    persist();
    var t = store.teams[S.draftWeek];
    if (t){ S.picks = t.picks.slice(); S.captain = t.captain; saveDraft(); }
    var text = 'Imported ' + n + (n === 1 ? ' week.' : ' weeks.');
    msg('iomsg', text); say(text);
    renderTeam(); renderPool(); renderScore(); renderSeason();
  }
  function shareWeek(){
    var wk = S.sbWk;
    var team = wk && (wk.practice ? (S.picks.length === C.PICKS ? { picks: S.picks, captain: S.captain } : null) : store.teams[wk.week]);
    if (!wk || !team){ msg('iomsg', 'You have no team in this week to share yet.', true); say('No team to share yet.'); return; }
    var mine = teamWeek(wk, team).total;
    var t5 = wk.benchmarks.top5 ? teamWeek(wk, wk.benchmarks.top5).total : null;
    var parts = ['Billionaire Fantasy League, ' + (wk.practice ? 'practice week' : 'week of ' + shortDate(wk.start)) + ': ' + signed(mine) + ' points' + (wk.final ? '' : ' so far') + '.'];
    var vs = [];
    if (typeof wk.benchmarks.spy === 'number') vs.push('S&P 500 ' + signed(wk.benchmarks.spy));
    if (t5 != null) vs.push('Top 5 richest ' + signed(t5));
    if (wk.benchmarks.perfect) vs.push('perfect team ' + signed(wk.benchmarks.perfect.points));
    if (vs.length) parts.push('Versus ' + vs.join(', ') + '.');
    parts.push('My team: ' + team.picks.map(function(s){ return person(s).name + (s === team.captain ? ' (C)' : ''); }).join(', ') + '.');
    parts.push('A free game, not financial advice. https://billionairesdigest.com/fantasy.html');
    copyText(parts.join(' '), 'Your week summary is copied.');
  }

  // ---- not draftable ----
  function renderNoDraft(){
    var ul = document.getElementById('nodraft');
    ul.innerHTML = '';
    var list = arr(S.index && S.index.notDraftable).slice().sort(function(a, b){ return a.rank - b.rank; });
    document.getElementById('nodraftsummary').textContent = 'Show ' + list.length + ' people with no daily market price';
    list.forEach(function(p){
      S.people[p.slug] = S.people[p.slug] || p;
      var li = el('li');
      li.appendChild(personLink(p.slug, 0));
      li.appendChild(el('span', 'fl-meta', '#' + p.rank + ' · Not draftable: no daily market price (private wealth)'));
      ul.appendChild(li);
    });
  }

  // ---- wiring ----
  document.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    var s;
    if ((s = b.getAttribute('data-add'))) { addPick(s); refocus('data-remove', s); }
    else if ((s = b.getAttribute('data-remove'))) { var inPool = !!(b.closest && b.closest('#pool')); removePick(s); if (inPool) refocus('data-add', s); else focusSlot(); }
    else if ((s = b.getAttribute('data-captain'))) { setCaptain(s); refocus('data-captain', s); }
  });
  function refocus(attr, slug){
    var n = document.querySelector('#pool [' + attr + '="' + slug + '"], #slots [' + attr + '="' + slug + '"]');
    if (n && !n.disabled) n.focus();
  }
  function focusSlot(){ var n = document.querySelector('#slots button') || document.getElementById('savebtn'); if (n && !n.disabled) n.focus(); else document.getElementById('teamh').focus(); }
  document.getElementById('savebtn').addEventListener('click', saveTeam);
  document.getElementById('clearbtn').addEventListener('click', function(){ S.picks = []; S.captain = null; saveDraft(); renderTeam(); renderPool(); renderScore(); say('Picks cleared. ' + capLine()); });
  document.getElementById('exportbtn').addEventListener('click', exportCode);
  document.getElementById('importbtn').addEventListener('click', importCode);
  document.getElementById('sharebtn').addEventListener('click', shareWeek);
  document.getElementById('teamh').setAttribute('tabindex', '-1');
  var qt = null;
  document.getElementById('q').addEventListener('input', function(){ var v = this.value; clearTimeout(qt); qt = setTimeout(function(){ filt.q = v; renderPool(); }, 120); });
  document.getElementById('sector').addEventListener('change', function(){ filt.sector = this.value; renderPool(); });
  document.getElementById('sort').addEventListener('change', function(){ filt.sort = this.value; renderPool(); });
  document.getElementById('afford').addEventListener('change', function(){ filt.afford = this.checked; renderPool(); });

  function fail(){
    ['lockbox', 'scorebox', 'seasonbox'].forEach(function(id){ var n = document.getElementById(id); n.innerHTML = ''; n.appendChild(el('p', 'tempty', 'The game data is not available right now. Try again later.')); });
    var p = document.getElementById('pool'); p.innerHTML = ''; p.appendChild(el('li', 'tempty', 'The draft room is not available right now.'));
  }

  var ticking = false;
  function init(){
    var t = now();
    if (nowOverride){ var tc = document.getElementById('testclock'); tc.hidden = false; tc.textContent = 'Test clock (for testing only): ' + new Date(t).toISOString(); }
    getJson('data/fantasy/index.json').then(function(ix){
      S.index = ix;
      S.draftWeek = C.draftWeek(t);
      var weeks = arr(ix.weeks).map(function(w){ return w.week; });
      var lw = C.lockedWeek(t);
      var sbId = null;
      for (var i = weeks.length - 1; i >= 0; i--) if (weeks[i] <= lw) { sbId = weeks[i]; break; }
      var latestWeek = weeks.length ? weeks[weeks.length - 1] : null;
      function listed(id){ return weeks.indexOf(id) >= 0 ? loadWeek(id) : null; }
      return Promise.all([
        listed(S.draftWeek),
        sbId ? loadWeek(sbId) : null,
        ix.latestDay ? optJson('data/fantasy/days/' + ix.latestDay + '.json') : null,
        latestWeek ? loadWeek(latestWeek) : null
      ]).then(function(r){
        S.draftWk = r[0]; S.salaryFallback = false;
        if (!S.draftWk && r[3]){ S.draftWk = r[3]; S.salaryFallback = true; }
        S.sbWk = r[1]; S.lastDay = r[2];
        arr(S.draftWk && S.draftWk.draftable).forEach(function(p){ S.people[p.slug] = p; });
        arr(S.sbWk && S.sbWk.draftable).forEach(function(p){ S.people[p.slug] = S.people[p.slug] || p; });
        renderNoDraft();
        // roster: saved team for the draft week, else the unsaved working draft
        var saved = store.teams[S.draftWeek];
        var src = saved || store.draft || { picks: [] };
        var sal = salaries();
        S.picks = arr(src.picks).filter(function(s){ return sal[s] != null; }).slice(0, C.PICKS);
        S.captain = S.picks.indexOf(src.captain) >= 0 ? src.captain : (S.picks[0] || null);
        // sectors
        var sel = document.getElementById('sector'), seen = {};
        while (sel.options.length > 1) sel.remove(1);
        arr(S.draftWk && S.draftWk.draftable).forEach(function(p){ if (!seen[p.sector]) { seen[p.sector] = 1; } });
        Object.keys(seen).sort().forEach(function(s){ var o = el('option', null, s); o.value = s; sel.appendChild(o); });
        if (filt.sector && !seen[filt.sector]) filt.sector = '';
        sel.value = filt.sector;
        document.getElementById('updated').textContent = ix.latestDay ? 'Scores through ' + dayLabel(ix.latestDay) : '';
        renderLock(); renderTeam(); renderScore(); renderPool(); renderSeason();
        if (!ticking){ ticking = true; setInterval(renderLock, 15000); }
      });
    }).then(null, function(err){ if (window.console) console.warn(err); fail(); });
  }
  init();
})();
