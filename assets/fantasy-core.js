/* Billionaire Fantasy League: pure rules shared by the page (assets/fantasy.js) and the
   build script (scripts/lib/fantasy.mjs loads this file with node:vm). ES5, no DOM.
   Exposes one global: BDFantasyCore. */
(function(root){
  var C = {};
  C.CAP = 100;
  C.PICKS = 5;
  C.CAPTAIN_MULT = 1.5;
  C.FIRST_REAL_WEEK = '2026-W40';
  C.TZ = 'America/New_York';

  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d){ return y + '-' + pad(m) + '-' + pad(d); }
  function parseYmd(s){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  C.pad = pad;

  // ---- New York wall clock ----
  var fmt = null;
  function nyFmt(){
    if (!fmt) fmt = new Intl.DateTimeFormat('en-US', { timeZone: C.TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return fmt;
  }
  // { y, m, d, h, mi, s } of a UTC timestamp (ms) in New York
  C.nyParts = function(ms){
    var parts = nyFmt().formatToParts(new Date(ms)), o = {};
    for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
    var h = +o.hour; if (h === 24) h = 0;
    return { y: +o.year, m: +o.month, d: +o.day, h: h, mi: +o.minute, s: +o.second };
  };
  C.nyDate = function(ms){ var p = C.nyParts(ms); return ymd(p.y, p.m, p.d); };
  // New York offset from UTC in minutes at a UTC instant (EDT = -240, EST = -300)
  C.nyOffset = function(ms){
    var p = C.nyParts(ms);
    var asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  };
  // UTC ms of a New York wall-clock time on date s (YYYY-MM-DD)
  C.nyToUtc = function(s, h, mi){
    var d = parseYmd(s);
    var guess = Date.UTC(d.y, d.m - 1, d.d, h || 0, mi || 0);
    var t = guess - C.nyOffset(guess) * 60000;
    var t2 = guess - C.nyOffset(t) * 60000;
    return t2;
  };

  // ---- calendar dates ----
  C.addDays = function(s, n){
    var d = parseYmd(s);
    var t = new Date(Date.UTC(d.y, d.m - 1, d.d + n));
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };
  // 0 = Sunday … 6 = Saturday
  C.weekday = function(s){ var d = parseYmd(s); return new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay(); };
  C.isWeekday = function(s){ var w = C.weekday(s); return w >= 1 && w <= 5; };
  C.nextWeekday = function(s){ var t = C.addDays(s, 1); while (!C.isWeekday(t)) t = C.addDays(t, 1); return t; };

  // ISO-8601 week id of a date: "2026-W40"
  C.isoWeek = function(s){
    var d = parseYmd(s);
    var t = new Date(Date.UTC(d.y, d.m - 1, d.d));
    var dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow); // Thursday of this week
    var y = t.getUTCFullYear();
    var jan1 = Date.UTC(y, 0, 1);
    var wk = Math.ceil(((t.getTime() - jan1) / 86400000 + 1) / 7);
    return y + '-W' + pad(wk);
  };
  // Monday (YYYY-MM-DD) of an ISO week id
  C.weekMonday = function(id){
    var m = /^(\d{4})-W(\d{2})$/.exec(String(id || ''));
    if (!m) return null;
    var y = +m[1], w = +m[2];
    var jan4 = new Date(Date.UTC(y, 0, 4));
    var dow = jan4.getUTCDay() || 7;
    var mon = new Date(Date.UTC(y, 0, 4 - dow + 1 + (w - 1) * 7));
    return ymd(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate());
  };
  C.weekAdd = function(id, n){ return C.isoWeek(C.addDays(C.weekMonday(id), 7 * n)); };
  C.isPractice = function(id){ return String(id) < C.FIRST_REAL_WEEK; };
  // { week, start (Mon), end (Fri), locksAt (UTC ms of Monday 09:30 New York) }
  C.weekInfo = function(id){
    var mon = C.weekMonday(id);
    return { week: id, start: mon, end: C.addDays(mon, 4), locksAt: C.nyToUtc(mon, 9, 30) };
  };
  C.weekDays = function(id){ var mon = C.weekMonday(id), out = []; for (var i = 0; i < 5; i++) out.push(C.addDays(mon, i)); return out; };

  // The week a roster saved at `ms` is for: the first week whose lock is still ahead.
  C.draftWeek = function(ms){
    var w = C.isoWeek(C.nyDate(ms));
    return ms < C.weekInfo(w).locksAt ? w : C.weekAdd(w, 1);
  };
  // The newest week that has locked by `ms` (scoring now, or just finished at the weekend).
  C.lockedWeek = function(ms){ return C.weekAdd(C.draftWeek(ms), -1); };
  // Late entry: a roster saved mid-week scores from the next trading day (weekday) after the save.
  // Returns that date, or null when no trading day of the locked week remains.
  C.lateFrom = function(ms){
    var wk = C.lockedWeek(ms), info = C.weekInfo(wk);
    var from = C.nextWeekday(C.nyDate(ms));
    return from <= info.end ? from : null;
  };

  // ---- teams ----
  // picks: [slug], captain: slug, salaries: { slug: salary }. Returns { ok, used, errors: [text] }.
  C.validateTeam = function(picks, captain, salaries, cap){
    var errs = [], used = 0, seen = {};
    cap = cap == null ? C.CAP : cap;
    picks = picks || [];
    for (var i = 0; i < picks.length; i++){
      var s = picks[i];
      if (seen[s]) errs.push('Picked twice: ' + s);
      seen[s] = true;
      if (!salaries || typeof salaries[s] !== 'number') errs.push('Not draftable this week: ' + s);
      else used += salaries[s];
    }
    if (picks.length !== C.PICKS) errs.push('Pick exactly ' + C.PICKS + ' (you have ' + picks.length + ')');
    if (used > cap) errs.push('Over the cap by ' + (used - cap));
    if (!captain || !seen[captain]) errs.push('Choose a captain from your picks');
    return { ok: !errs.length, used: used, errors: errs };
  };
  C.captainPoints = function(p){ return Math.round(p * C.CAPTAIN_MULT); };
  // day: a days file ({ people: { slug: { points } } }); returns { total, bySlug }
  C.teamDay = function(picks, captain, day){
    var total = 0, by = {};
    for (var i = 0; i < picks.length; i++){
      var e = day && day.people && day.people[picks[i]];
      var p = e && typeof e.points === 'number' ? e.points : 0;
      if (picks[i] === captain) p = C.captainPoints(p);
      by[picks[i]] = p; total += p;
    }
    return { total: total, bySlug: by };
  };
  C.spyPoints = function(changePct){ return typeof changePct === 'number' && isFinite(changePct) ? Math.round(changePct * 100) * C.PICKS : null; };

  // Best team of exactly `size` under `cap` with the best captain (exact, dynamic programming).
  // totals: { slug: points }, salaries: { slug: integer salary }. Returns { picks, captain, points, salary } or null.
  C.perfectTeam = function(totals, salaries, cap, size){
    cap = cap == null ? C.CAP : cap; size = size || C.PICKS;
    var slugs = [];
    for (var k in salaries) if (Object.prototype.hasOwnProperty.call(salaries, k) && typeof salaries[k] === 'number') slugs.push(k);
    slugs.sort();
    var NEG = -Infinity;
    // dp[c][n][cost] = { v, prev } with c = captain used (0/1), n = picks so far
    function mk(){ var a = []; for (var c = 0; c < 2; c++){ a[c] = []; for (var n = 0; n <= size; n++){ a[c][n] = []; for (var x = 0; x <= cap; x++) a[c][n][x] = null; } } return a; }
    var dp = mk();
    dp[0][0][0] = { v: 0, items: [] };
    for (var i = 0; i < slugs.length; i++){
      var s = slugs[i], sal = Math.round(salaries[s]), pts = typeof totals[s] === 'number' ? totals[s] : 0;
      if (sal > cap || sal < 0) continue;
      for (var c = 1; c >= 0; c--){
        for (var n = size - 1; n >= 0; n--){
          for (var x = cap - sal; x >= 0; x--){
            var cur = dp[c][n][x];
            if (!cur) continue;
            // as a normal pick
            var a = dp[c][n + 1][x + sal], va = cur.v + pts;
            if (!a || va > a.v) dp[c][n + 1][x + sal] = { v: va, items: cur.items.concat([[s, 0]]) };
            // as captain
            if (c === 0){
              var b = dp[1][n + 1][x + sal], vb = cur.v + C.captainPoints(pts);
              if (!b || vb > b.v) dp[1][n + 1][x + sal] = { v: vb, items: cur.items.concat([[s, 1]]) };
            }
          }
        }
      }
    }
    var best = null, bestCost = 0;
    for (var y = 0; y <= cap; y++){ var e = dp[1][size][y]; if (e && (!best || e.v > best.v)) { best = e; bestCost = y; } }
    if (!best) return null;
    var picks = [], captain = null;
    for (var j = 0; j < best.items.length; j++){ picks.push(best.items[j][0]); if (best.items[j][1]) captain = best.items[j][0]; }
    return { picks: picks, captain: captain, points: best.v, salary: bestCost };
  };

  // ---- export / import code ----
  function b64enc(str){
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
    return Buffer.from(str, 'utf8').toString('base64');
  }
  function b64dec(b){
    if (typeof atob === 'function') return decodeURIComponent(escape(atob(b)));
    return Buffer.from(b, 'base64').toString('utf8');
  }
  // teams: { weekId: { picks, captain, lateFrom? } } -> short code
  C.exportCode = function(teams){
    var t = {};
    for (var w in teams){
      if (!Object.prototype.hasOwnProperty.call(teams, w)) continue;
      var e = teams[w]; if (!e || !e.picks) continue;
      var row = e.picks.slice(); row.push(e.picks.indexOf(e.captain));
      if (e.lateFrom) row.push(e.lateFrom);
      t[w] = row;
    }
    return 'BFL1.' + b64enc(JSON.stringify(t)).replace(/=+$/, '');
  };
  C.importCode = function(code){
    var s = String(code || '').replace(/\s+/g, '');
    if (s.indexOf('BFL1.') !== 0) throw new Error('That is not a team code.');
    var b = s.slice(5); while (b.length % 4) b += '=';
    var t = JSON.parse(b64dec(b)), out = {};
    for (var w in t){
      if (!/^\d{4}-W\d{2}$/.test(w) || !(t[w] instanceof Array)) continue;
      var r = t[w], picks = r.slice(0, C.PICKS);
      var ok = picks.length === C.PICKS;
      for (var i = 0; i < picks.length; i++) if (typeof picks[i] !== 'string' || !/^[a-z0-9-]{1,80}$/.test(picks[i])) ok = false;
      var ci = r[C.PICKS];
      if (!ok || typeof ci !== 'number' || ci < 0 || ci >= C.PICKS) continue;
      var e = { picks: picks, captain: picks[ci] };
      if (typeof r[C.PICKS + 1] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r[C.PICKS + 1])) e.lateFrom = r[C.PICKS + 1];
      out[w] = e;
    }
    return out;
  };

  root.BDFantasyCore = C;
})(typeof window !== 'undefined' ? window : globalThis);
