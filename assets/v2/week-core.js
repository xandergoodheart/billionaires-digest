/* Billionaires Digest v3: pure helpers for one fantasy week (My team day-by-day chart, "Play the week" replay,
   benchmark; Fantasy home "Players to watch"). ES5, no DOM. Exposes one global: BDWeekCore.
   Works only on the week files and teamWeek() results as they are; never adds numbers of its own.
   Tested with node --test (scripts/lib/v2-week-core.test.mjs). Game only: play money, no prizes. */
(function(root){
  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function arr(x){ return Array.isArray(x) ? x : []; }
  function num(x){ return typeof x === 'number' && isFinite(x); }
  function isDate(d){ return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function utc(d){ return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); }
  function iso(ms){ return new Date(ms).toISOString().slice(0, 10); }
  function addDays(d, n){ return iso(utc(d) + n * 86400000); }
  function weekday(d){ return new Date(utc(d)).getUTCDay(); }
  function mondayOf(d){ var w = weekday(d); return addDays(d, w === 0 ? -6 : 1 - w); }

  // Five slots, Monday to Friday, for a week. byDay: { date: team points that day, or null (late entry) }, as
  // BDFantasyStore.teamWeek returns. Each slot: { date, dow ('MON'), dayName ('Monday'), state, points, running }.
  //   state 'scored': the day counted (points = that day, running = total so far);
  //   state 'late':   a scored market day before a late entry joined (no points);
  //   state 'open':   no scores for that day (not played yet, or no trading) -> an empty slot.
  function weekSlots(wk, byDay){
    var days = arr(wk && wk.days).filter(isDate).slice().sort();
    var start = wk && isDate(wk.start) ? wk.start : (days[0] || null);
    if (!start) return [];
    var mon = mondayOf(start), map = byDay || {}, run = 0, out = [];
    for (var i = 0; i < 5; i++){
      var d = addDays(mon, i), slot = { date: d, dow: DOW[i + 1], dayName: DOW_LONG[i + 1], state: 'open', points: null, running: null };
      if (days.indexOf(d) >= 0){
        var p = map[d];
        if (num(p)){ run += p; slot.state = 'scored'; slot.points = p; slot.running = run; }
        else slot.state = 'late';
      }
      out.push(slot);
    }
    return out;
  }
  function scored(slots){ return arr(slots).filter(function(s){ return s && s.state === 'scored'; }); }

  // Bar geometry for running totals around a zero line. Returns { max, pos, neg, bars: [{ date, state, running,
  // up (bool), pct (0-100 of its own half) }] }. pos/neg: the share (0-1) of the chart above / below zero, so a
  // chart with only positive totals uses the full height above the line.
  function barScale(slots){
    var sc = scored(slots), maxPos = 0, maxNeg = 0;
    sc.forEach(function(s){ if (s.running > maxPos) maxPos = s.running; if (s.running < maxNeg) maxNeg = s.running; });
    maxNeg = -maxNeg;
    var span = maxPos + maxNeg;
    var pos = span ? maxPos / span : 1, neg = span ? maxNeg / span : 0;
    var bars = arr(slots).map(function(s){
      var b = { date: s.date, state: s.state, running: s.running, up: true, pct: 0 };
      if (s.state === 'scored'){
        b.up = s.running >= 0;
        var half = b.up ? maxPos : maxNeg;
        b.pct = half ? Math.round(Math.abs(s.running) / half * 1000) / 10 : 0;
      }
      return b;
    });
    return { max: Math.max(maxPos, maxNeg), pos: pos, neg: neg, bars: bars };
  }

  // Replay: step 0 = before the first scored day; step k (1..n) = after the k-th scored day.
  // Returns { step, n, day (slot or null), points, running, done, first (slot or null) }.
  function replayAt(slots, step){
    var sc = scored(slots), n = sc.length;
    var k = Math.max(0, Math.min(n, Math.floor(Number(step) || 0)));
    var day = k ? sc[k - 1] : null;
    return { step: k, n: n, day: day, points: day ? day.points : null, running: day ? day.running : 0, done: k >= n, first: sc[0] || null };
  }
  function nextStep(step, n){ return Math.min(n, Math.max(0, Math.floor(Number(step) || 0)) + 1); }

  // The best player of one team on one day: perDaySlugs = { slug: team points } (teamWeek().perDay[date]).
  // Ties go to the earlier slug in `order`. Returns { slug, points } or null.
  function topOfDay(perDaySlugs, order){
    var best = null, m = perDaySlugs || {};
    arr(order).forEach(function(s){ var v = m[s]; if (num(v) && (!best || v > best.points)) best = { slug: s, points: v }; });
    return best;
  }

  // Team vs the S&P 500 benchmark for a week: { mine, spy, diff, lead ('ahead' | 'behind' | 'level') } or null
  // when either number is missing.
  function versus(mine, spy){
    if (!num(mine) || !num(spy)) return null;
    var diff = mine - spy;
    return { mine: mine, spy: spy, diff: diff, lead: diff > 0 ? 'ahead' : (diff < 0 ? 'behind' : 'level') };
  }

  // Where "Players to watch" takes its points: the scoring week when it has scored days, otherwise the last scored
  // day of the newest week that has one. Returns { kind: 'week' | 'day', wk, date (last day counted) } or null.
  function watchSource(sbWk, prevWk){
    var d = arr(sbWk && sbWk.days).filter(isDate).sort();
    if (d.length) return { kind: 'week', wk: sbWk, date: d[d.length - 1] };
    var p = arr(prevWk && prevWk.days).filter(isDate).sort();
    if (p.length) return { kind: 'day', wk: prevWk, date: p[p.length - 1] };
    return null;
  }
  function sourcePoints(src, slug){
    if (!src || !src.wk) return null;
    var daily = src.wk.daily || {};
    if (src.kind === 'day'){ var v = daily[src.date] && daily[src.date][slug]; return num(v) ? v : null; }
    var t = 0, any = false;
    arr(src.wk.days).forEach(function(d){ var x = daily[d] && daily[d][slug]; if (num(x)){ t += x; any = true; } });
    return any ? t : null;
  }
  // Top n of the source week's pool by those points (highest first; ties by name). Players without points are left
  // out. Returns [{ p (pool entry), points }].
  function topPlayers(src, n){
    if (!src || !src.wk) return [];
    return arr(src.wk.draftable).filter(function(p){ return p && p.slug; })
      .map(function(p){ return { p: p, points: sourcePoints(src, p.slug) }; })
      .filter(function(x){ return num(x.points); })
      .sort(function(a, b){ return b.points - a.points || String(a.p.name).localeCompare(String(b.p.name)); })
      .slice(0, n == null ? 5 : n);
  }

  root.BDWeekCore = {
    weekSlots: weekSlots, scored: scored, barScale: barScale, replayAt: replayAt, nextStep: nextStep,
    topOfDay: topOfDay, versus: versus, watchSource: watchSource, sourcePoints: sourcePoints, topPlayers: topPlayers,
    mondayOf: mondayOf, addDays: addDays
  };
})(typeof window !== 'undefined' ? window : globalThis);
