/* Billionaires Digest v2: fantasy state shared by the v2 game pages (team.html, draft.html). ES5, no DOM.
   Exposes one global: BDFantasyStore. Needs assets/fantasy-core.js (BDFantasyCore); BD (assets/common.js) and
   BDGame / BDAccount (assets/game-client.js, assets/account.js) are optional.
   Ported from the v1 page (assets/fantasy.js), which stays unchanged: same storage key and shape ('bd-fantasy-v1'),
   same ?now= test clock, same week loading, roster rules, late entry and online sync, so a team saved in v1 shows
   up in v2 and the other way round. The pure parts (teamWeek, computeStatsFrom, ...) are tested with node --test
   (scripts/lib/v2-fantasy-store.test.mjs). Game only: play money, no prizes. */
(function(root){
  var C = root.BDFantasyCore;
  var KEY = 'bd-fantasy-v1';
  var SYNCKEY = 'bd-fantasy-sync-v1';
  var DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function arr(x){ return Array.isArray(x) ? x : []; }
  function has(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }

  // ---- clock (?now=ISO overrides it, for testing only) ----
  var nowOverride = null;
  (function(){
    var search = (root.location && root.location.search) || '';
    var m = /[?&]now=([^&]+)/.exec(search);
    if (!m) return;
    var t = Date.parse(decodeURIComponent(m[1]));
    if (isFinite(t)) nowOverride = { at: t, started: Date.now() };
  })();
  function now(){ return nowOverride ? nowOverride.at + (Date.now() - nowOverride.started) : Date.now(); }

  // ---- storage (same key and shape as v1; in-memory fallback when the browser keeps no site data) ----
  function ls(){ try { return root.localStorage || null; } catch (e) { return null; } }
  var memory = null;
  function blank(){ return { v: 1, teams: {}, draft: { picks: [], captain: null }, record: null }; }
  function load(){
    var s = null;
    try { var raw = ls().getItem(KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = memory; }
    if (!s || typeof s !== 'object') s = memory || blank();
    if (!s.teams || typeof s.teams !== 'object') s.teams = {};
    if (!s.draft || !(s.draft.picks instanceof Array)) s.draft = { picks: [], captain: null };
    return s;
  }
  var store = load();
  function persist(){
    memory = store;
    try { ls().setItem(KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }

  // ---- formatting (same words as v1) ----
  function signed(n){ return typeof n === 'number' ? (n > 0 ? '+' + n : String(n)) : '—'; }
  function dayLabel(d){ return DAYN[C.weekday(d)] + ' ' + MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }
  function shortDate(d){ return MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }
  function weekName(id){ return C.isPractice(id) ? 'the practice week' : 'the week of ' + shortDate(C.weekMonday(id)); }
  function weekTitle(id){ return C.isPractice(id) ? 'Practice week' : 'Week of ' + shortDate(C.weekMonday(id)); }

  // ---- pure scoring helpers ----
  function dayPeople(wk, d){ var o = {}, m = (wk.daily && wk.daily[d]) || {}; for (var k in m) o[k] = { points: m[k] }; return { people: o }; }
  // A team's week: { byDay, total, bySlug (team points, captain 1.5x), perDay, baseBySlug (points before the captain
  // multiplier), scored: [dates that counted] }. Days before a late entry's lateFrom do not count (null).
  function teamWeek(wk, team){
    var byDay = {}, total = 0, bySlug = {}, perDay = {}, base = {}, scored = [];
    team.picks.forEach(function(s){ bySlug[s] = 0; base[s] = 0; });
    arr(wk.days).forEach(function(d){
      if (team.lateFrom && d < team.lateFrom){ byDay[d] = null; perDay[d] = null; return; }
      var r = C.teamDay(team.picks, team.captain, dayPeople(wk, d));
      byDay[d] = r.total; total += r.total; perDay[d] = r.bySlug; scored.push(d);
      for (var s in r.bySlug) bySlug[s] += r.bySlug[s];
      team.picks.forEach(function(p){ var v = wk.daily && wk.daily[d] && wk.daily[d][p]; base[p] += typeof v === 'number' ? v : 0; });
    });
    return { byDay: byDay, total: total, bySlug: bySlug, perDay: perDay, baseBySlug: base, scored: scored };
  }
  // One player's raw points so far in a week (sum over its scored days); null when the player has no points there.
  function weekPoints(wk, slug){
    var t = 0, any = false;
    if (!wk) return null;
    arr(wk.days).forEach(function(d){ var v = wk.daily && wk.daily[d] && wk.daily[d][slug]; if (typeof v === 'number'){ t += v; any = true; } });
    return any ? t : null;
  }
  // v1 projection(): recent average points per day for a roster, captain counted 1.5x; null when no averages.
  function projectionFrom(stats, picks, captain){
    var t = 0, any = false;
    picks.forEach(function(s){ var a = stats[s] && stats[s].avg; if (a == null) return; any = true; t += s === captain ? a * C.CAPTAIN_MULT : a; });
    return any ? Math.round(t) : null;
  }
  function weekOverAt(wk, t){ return !!wk.final || C.nyDate(t) > wk.end; }
  // The team that scores in a week: the practice week uses the working draft (five picks and a captain).
  function matchTeamFrom(wk, teams, picks, captain){
    if (!wk) return null;
    if (wk.practice) return picks.length === C.PICKS && captain ? { picks: picks.slice(), captain: captain } : null;
    return (teams && teams[wk.week]) || null;
  }

  // Per-player form over the week files. src: { draftWk, sbWk, prevWk, days, index }.
  // Returns { stats: { slug: { avg, n, series, last, hot, hotWhy, news, buy } }, sparkDates }.
  function computeStatsFrom(src){
    var sbWk = src.sbWk, prevWk = src.prevWk, daysMap = src.days || {};
    function ptsOn(d, slug){
      var wks = [sbWk, prevWk];
      for (var i = 0; i < wks.length; i++){
        var w = wks[i];
        if (w && w.daily && w.daily[d] && typeof w.daily[d][slug] === 'number') return w.daily[d][slug];
      }
      return null;
    }
    var dates = {};
    [prevWk, sbWk].forEach(function(w){ if (w) arr(w.days).forEach(function(d){ dates[d] = 1; }); });
    var sparkDates = Object.keys(dates).sort().slice(-5);
    var lastDate = sparkDates[sparkDates.length - 1] || null;
    var wtd = sbWk && arr(sbWk.days).length ? arr(sbWk.days) : sparkDates;
    var news = (src.index && src.index.news) || {};
    var pool = arr(src.draftWk && src.draftWk.draftable);
    var lastRank = {};
    if (lastDate){
      pool.map(function(p){ return { s: p.slug, v: ptsOn(lastDate, p.slug) }; })
        .filter(function(x){ return typeof x.v === 'number' && x.v > 0; })
        .sort(function(a, b){ return b.v - a.v; })
        .slice(0, 10).forEach(function(x, i){ lastRank[x.s] = i + 1; });
    }
    var buyCut = lastDate ? C.addDays(lastDate, -14) : null;
    var st = {};
    pool.forEach(function(p){
      var series = sparkDates.map(function(d){ return ptsOn(d, p.slug); });
      var vals = wtd.map(function(d){ return ptsOn(d, p.slug); }).filter(function(v){ return typeof v === 'number'; });
      var avg = vals.length ? vals.reduce(function(a, b){ return a + b; }, 0) / vals.length : null;
      var tail = series.slice(-3), streak = tail.length === 3 && tail.every(function(v){ return typeof v === 'number' && v > 0; });
      var buy = null;
      Object.keys(daysMap).sort().forEach(function(d){
        var e = daysMap[d] && daysMap[d].people && daysMap[d].people[p.slug];
        if (e && e.bonuses && e.bonuses.insiderBuy > 0 && (!buyCut || d >= buyCut)) buy = d;
      });
      st[p.slug] = {
        avg: avg, n: vals.length, series: series, last: lastDate ? ptsOn(lastDate, p.slug) : null,
        hot: !!lastRank[p.slug] || streak, hotWhy: lastRank[p.slug] ? 'No. ' + lastRank[p.slug] + ' on ' + dayLabel(lastDate) : (streak ? 'Up three scored days running' : ''),
        news: news[p.slug] || 0, buy: buy
      };
    });
    return { stats: st, sparkDates: sparkDates };
  }

  // ---- state ----
  var S = { index: null, draftWk: null, draftWeek: null, salaryFallback: false, sbWk: null, prevWk: null, lastDay: null,
            days: {}, people: {}, stats: {}, sparkDates: [], picks: [], captain: null, loaded: false };

  // ---- data ----
  function getJson(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function optJson(u){ return getJson(u).then(null, function(){ return null; }); }
  var weekCache = {}, dayCache = {};
  function loadWeek(id){ if (!weekCache[id]) weekCache[id] = optJson('data/fantasy/weeks/' + id + '.json'); return weekCache[id]; }
  function loadDay(d){ if (!dayCache[d]) dayCache[d] = optJson('data/fantasy/days/' + d + '.json'); return dayCache[d]; }

  function person(slug){ return S.people[slug] || { slug: slug, name: slug, sector: 'Other' }; }
  function salaries(){ return (S.draftWk && S.draftWk.salaries) || {}; }
  function capUsed(){ var s = salaries(), t = 0; S.picks.forEach(function(p){ t += s[p] || 0; }); return t; }
  function computeStats(){ var r = computeStatsFrom(S); S.stats = r.stats; S.sparkDates = r.sparkDates; }
  function stat(slug){ return S.stats[slug] || { avg: null, n: 0, series: [], last: null, hot: false, news: 0, buy: null }; }

  // Resolves S once the index, the draft week, the scoring week (newest listed week <= the locked week), the week
  // before it, the latest day and the scored day files are in. Rejects when the index cannot be loaded.
  var initPromise = null;
  function init(){
    if (initPromise) return initPromise;
    var t = now();
    initPromise = getJson('data/fantasy/index.json').then(function(ix){
      S.index = ix;
      S.draftWeek = C.draftWeek(t);
      var weeks = arr(ix.weeks).map(function(w){ return w.week; });
      var lw = C.lockedWeek(t);
      var sbId = null;
      for (var i = weeks.length - 1; i >= 0; i--) if (weeks[i] <= lw) { sbId = weeks[i]; break; }
      var prevId = sbId && weeks.indexOf(sbId) > 0 ? weeks[weeks.indexOf(sbId) - 1] : null;
      var latestWeek = weeks.length ? weeks[weeks.length - 1] : null;
      function listed(id){ return weeks.indexOf(id) >= 0 ? loadWeek(id) : null; }
      return Promise.all([
        listed(S.draftWeek),
        sbId ? loadWeek(sbId) : null,
        ix.latestDay ? loadDay(ix.latestDay) : null,
        latestWeek ? loadWeek(latestWeek) : null,
        prevId ? loadWeek(prevId) : null
      ]).then(function(r){
        S.draftWk = r[0]; S.salaryFallback = false;
        if (!S.draftWk && r[3]){ S.draftWk = r[3]; S.salaryFallback = true; }
        S.sbWk = r[1]; S.lastDay = r[2]; S.prevWk = r[4];
        var dset = {};
        [S.prevWk, S.sbWk].forEach(function(w){ if (w) arr(w.days).forEach(function(d){ dset[d] = 1; }); });
        return Promise.all(Object.keys(dset).map(function(d){ return loadDay(d).then(function(x){ if (x) S.days[d] = x; }); }));
      }).then(function(){
        arr(S.draftWk && S.draftWk.draftable).forEach(function(p){ S.people[p.slug] = p; });
        arr(S.sbWk && S.sbWk.draftable).forEach(function(p){ S.people[p.slug] = S.people[p.slug] || p; });
        arr(S.prevWk && S.prevWk.draftable).forEach(function(p){ S.people[p.slug] = S.people[p.slug] || p; });
        computeStats();
        restoreRoster();
        S.loaded = true;
        startOnline();
        return S;
      });
    });
    initPromise.then(null, function(){ initPromise = null; });
    return initPromise;
  }
  // roster: saved team for the draft week, else the unsaved working draft (exactly as v1)
  function restoreRoster(){
    var saved = store.teams[S.draftWeek];
    var src = saved || store.draft || { picks: [] };
    var sal = salaries();
    S.picks = arr(src.picks).filter(function(s){ return sal[s] != null; }).slice(0, C.PICKS);
    S.captain = S.picks.indexOf(src.captain) >= 0 ? src.captain : (S.picks[0] || null);
  }

  // ---- change listeners (pages re-render on 'roster', 'saved', 'online', 'sync') ----
  var listeners = [];
  function onChange(fn){ listeners.push(fn); }
  function emit(kind, detail){ for (var i = 0; i < listeners.length; i++){ try { listeners[i](kind, detail); } catch (e) {} } }

  // ---- roster editing (v1 rules and messages) ----
  function saveDraft(){ store.draft = { picks: S.picks.slice(), captain: S.captain, week: S.draftWeek }; persist(); }
  function savedTeam(){ return store.teams[S.draftWeek] || null; }
  function dirty(){
    var t = savedTeam();
    if (!t) return S.picks.length > 0;
    return t.captain !== S.captain || t.picks.slice().sort().join() !== S.picks.slice().sort().join();
  }
  function capLine(){ var u = capUsed(); return 'Budget used ' + u + ' of ' + C.CAP + ', ' + (C.CAP - u) + ' left.'; }
  function blockReason(slug){
    if (S.picks.indexOf(slug) >= 0) return '';
    if (S.picks.length >= C.PICKS) return 'Lineup full';
    var over = capUsed() + (salaries()[slug] || 0) - C.CAP;
    return over > 0 ? 'Over by ' + over : '';
  }
  // Each returns { ok, text } (text is what v1 announced).
  function addPick(slug){
    if (blockReason(slug) || S.picks.indexOf(slug) >= 0) return { ok: false, text: blockReason(slug) || '' };
    S.picks.push(slug);
    if (!S.captain) S.captain = slug;
    saveDraft(); emit('roster');
    return { ok: true, text: 'Added ' + person(slug).name + '. ' + capLine() + (S.captain === slug ? ' Captain.' : '') };
  }
  function removePick(slug){
    var i = S.picks.indexOf(slug);
    if (i < 0) return { ok: false, text: '' };
    S.picks.splice(i, 1);
    if (S.captain === slug) S.captain = S.picks[0] || null;
    saveDraft(); emit('roster');
    return { ok: true, text: 'Removed ' + person(slug).name + '. ' + capLine() + (S.captain ? ' Captain: ' + person(S.captain).name + '.' : '') };
  }
  function setCaptain(slug){
    if (S.picks.indexOf(slug) < 0) return { ok: false, text: '' };
    S.captain = slug;
    saveDraft(); emit('roster');
    return { ok: true, text: person(slug).name + ' is captain and scores 1.5 times.' };
  }
  function clearPicks(){ S.picks = []; S.captain = null; saveDraft(); emit('roster'); return { ok: true, text: 'Picks cleared. ' + capLine() }; }

  // Save the working roster for the draft week. Late entry: when the running week has no team yet and a trading
  // day is left, the first save also enters it from the next trading day (same rule as v1).
  // Returns { ok, text, errors, persisted, late, sync (Promise of the online result, or null) }.
  function saveTeam(){
    var v = C.validateTeam(S.picks, S.captain, salaries());
    if (!v.ok) return { ok: false, text: v.errors.join('. ') + '.', errors: v.errors, persisted: false, late: null, sync: null };
    var t = now();
    var team = { picks: S.picks.slice(), captain: S.captain, savedAt: new Date(t).toISOString() };
    store.teams[S.draftWeek] = team;
    var text = 'Lineup saved for ' + weekName(S.draftWeek) + '.';
    var lw = C.lockedWeek(t), from = C.lateFrom(t), late = null;
    if (!C.isPractice(lw) && !store.teams[lw] && from && S.sbWk && S.sbWk.week === lw && S.picks.every(function(s){ return S.sbWk.salaries[s] != null; })){
      store.teams[lw] = { picks: S.picks.slice(), captain: S.captain, savedAt: team.savedAt, lateFrom: from };
      late = from;
      text += ' You are also in this week as a late entry, scoring from ' + dayLabel(from) + '.';
    }
    var ok = persist();
    if (!ok) text += ' Your browser is not keeping site data, so this team will be gone when you close the page. Copy your team code to keep it.';
    emit('saved', { week: S.draftWeek, late: late });
    var sync = onlinePlaying() ? syncTeam(S.draftWeek, team) : null;
    return { ok: true, text: text, errors: [], persisted: ok, late: late, sync: sync };
  }

  function projection(picks, captain){ return projectionFrom(S.stats, picks || S.picks, captain === undefined ? S.captain : captain); }
  function teamWeekState(wk, team){ return teamWeek(wk, team); }
  function matchTeam(wk){ return matchTeamFrom(wk, store.teams, S.picks, S.captain); }
  function weekOver(wk){ return weekOverAt(wk, now()); }

  // ---- online play (assets/game-client.js + assets/account.js). Offline-first: the local save always happens;
  // when the player is online with a nickname, each save is also sent with save_roster. ----
  var ON = { ready: false, acct: null, remote: {}, asked: {}, busy: false, started: false };
  function onlinePlaying(){ var a = ON.acct; return !!(ON.ready && a && a.enabled && a.signedIn && a.me); }
  function me(){ return onlinePlaying() ? ON.acct.me : null; }
  function teamSig(t){ return t && t.picks ? arr(t.picks).slice().sort().join(',') + '|' + t.captain : ''; }
  function syncMarks(){ try { return JSON.parse(ls().getItem(SYNCKEY) || '{}') || {}; } catch (e) { return {}; } }
  function markSynced(week, team){
    var m = syncMarks(); m[ON.acct.me.id + ':' + week] = teamSig(team);
    try { ls().setItem(SYNCKEY, JSON.stringify(m)); } catch (e) {}
  }
  function isSynced(week){
    var t = store.teams[week];
    if (!t || !onlinePlaying()) return false;
    if (ON.remote[week] != null) return ON.remote[week] === teamSig(t);
    return syncMarks()[ON.acct.me.id + ':' + week] === teamSig(t);
  }
  function fetchRemote(){
    var wk = S.draftWeek;
    if (!onlinePlaying() || !wk || ON.asked[wk] || !root.BDGame || !root.BDGame.myRoster) return;
    ON.asked[wk] = true;
    root.BDGame.myRoster(wk).then(function(r){ ON.remote[wk] = r ? teamSig(r) : ''; emit('sync'); }, function(){});
  }
  // Resolves { ok, text, bad } (text is empty when nothing needs saying). Never rejects.
  function syncTeam(week, team){
    if (!onlinePlaying() || ON.busy || !root.BDGame) return Promise.resolve({ ok: false, text: '', bad: false });
    ON.busy = true; emit('sync');
    var nick = ON.acct.me.nickname;
    return root.BDGame.syncRoster(week, team.picks.slice(), team.captain).then(function(r){
      ON.busy = false;
      var out = { ok: false, text: '', bad: false };
      if (r && r.ok){
        ON.remote[week] = teamSig(team); markSynced(week, team);
        out = { ok: true, text: 'Synced to the online leaderboard as ' + nick + '.', bad: false };
      } else if (r && !r.skipped){
        out = { ok: false, text: 'Saved in this browser, but not online: ' + r.reason, bad: true };
      }
      emit('sync', out);
      return out;
    }, function(){ ON.busy = false; emit('sync'); return { ok: false, text: '', bad: false }; });
  }
  function startOnline(){
    if (ON.started) return;
    ON.started = true;
    var BD = root.BD;
    ((BD && BD.game && BD.game.ready) || Promise.resolve(false)).then(function(ok){
      if (!ok) return;
      root.BD_GAME_ONLINE = true;
      ON.ready = true;
      emit('online');
      if (root.BDAccount) root.BDAccount.onChange(function(a){
        var who = a && a.me ? a.me.id : null, was = ON.acct && ON.acct.me ? ON.acct.me.id : null;
        if (who !== was){ ON.remote = {}; ON.asked = {}; }
        ON.acct = a;
        if (onlinePlaying()) fetchRemote();
        emit('online');
      });
    }, function(){});
  }

  root.BDFantasyStore = {
    KEY: KEY, SYNCKEY: SYNCKEY,
    state: S,
    now: now, testClock: function(){ return nowOverride ? nowOverride.at : null; },
    store: function(){ return store; }, load: load, persist: persist, blank: blank,
    init: init, onChange: onChange,
    person: person, salaries: salaries, capUsed: capUsed, stat: stat,
    savedTeam: savedTeam, dirty: dirty, capLine: capLine, blockReason: blockReason,
    addPick: addPick, removePick: removePick, setCaptain: setCaptain, clearPicks: clearPicks, saveDraft: saveDraft, saveTeam: saveTeam,
    teamWeek: teamWeekState, matchTeam: matchTeam, weekOver: weekOver, weekPoints: weekPoints, projection: projection,
    onlinePlaying: onlinePlaying, me: me, isSynced: isSynced, syncTeam: syncTeam, busy: function(){ return ON.busy; },
    // pure helpers (tested)
    pure: { teamWeek: teamWeek, weekPoints: weekPoints, projectionFrom: projectionFrom, dayPeople: dayPeople, computeStatsFrom: computeStatsFrom, matchTeamFrom: matchTeamFrom, weekOverAt: weekOverAt, teamSig: teamSig },
    fmt: { signed: signed, dayLabel: dayLabel, shortDate: shortDate, weekName: weekName, weekTitle: weekTitle, DAYN: DAYN, MONTHS: MONTHS }
  };
})(typeof window !== 'undefined' ? window : globalThis);
