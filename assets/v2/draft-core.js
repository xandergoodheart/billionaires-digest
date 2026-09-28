/* Billionaires Digest v3: pure helpers for the Draft room (draft.html). ES5, no DOM.
   Exposes one global: BDDraftCore. Works only on numbers already in the fantasy week files (recent average points
   per day, week points, cap costs); never adds numbers of its own. Tested with node --test
   (scripts/lib/v2-draft-core.test.mjs). Game only: play money, no prizes. */
(function(root){
  var EPS = 1e-9;
  function arr(x){ return Array.isArray(x) ? x : []; }
  function num(x){ return typeof x === 'number' && isFinite(x); }

  // Value = points per cap point. basis: the recent average points per day when there is one, else the week points
  // so far. Returns { value, basis: 'avg' | 'week' } or null (no points yet, or no usable cap cost).
  function valueScore(avg, weekPts, cap){
    if (!num(cap) || cap <= 0) return null;
    if (num(avg)) return { value: avg / cap, basis: 'avg' };
    if (num(weekPts)) return { value: weekPts / cap, basis: 'week' };
    return null;
  }

  // Slugs of the top n players by value among list ([{ slug, value }], value a number or null), best first.
  // Only positive values count (a player losing points is never "best value"). Ties keep list order.
  function topValue(list, n){
    var k = n == null ? 5 : n;
    var xs = [];
    arr(list).forEach(function(x, i){ if (x && num(x.value) && x.value > 0) xs.push({ slug: x.slug, value: x.value, i: i }); });
    xs.sort(function(a, b){ return (b.value - a.value) || (a.i - b.i); });
    return xs.slice(0, k).map(function(x){ return x.slug; });
  }

  // Recent form: zip dates and values and keep the last n (default 5), oldest first.
  // [{ date, points }] with points null when that day has no entry for the player.
  function formSeries(dates, values, n){
    var k = n == null ? 5 : n, out = [];
    var ds = arr(dates), vs = arr(values);
    for (var i = 0; i < ds.length; i++) out.push({ date: ds[i], points: num(vs[i]) ? vs[i] : null });
    return out.slice(-k);
  }

  // Auto-fill: keep the current picks and fill the remaining slots with the combination of players that has the
  // highest total recent average points per day while the whole team stays within the cap. Exact (small knapsack
  // over "exactly k players, cap used <= cap left"). Ties: lower total cap, then earlier in the pool order.
  // opts: { pool: [{ slug, cap, avg }], picks: [slug], captain: slug|null, cap: 100, slots: 5 }
  // Players without a usable cap cost are skipped; a missing average counts as 0.
  // Returns { ok, reason, add: [slug] (pool order), team: [slug], captain, capUsed, capLeft, avgTotal }.
  // reason when not ok: 'full' | 'over' | 'nodata' | 'nofit'.
  function autoFill(opts){
    var o = opts || {};
    var CAP = num(o.cap) ? o.cap : 100, SLOTS = num(o.slots) ? o.slots : 5;
    var picks = arr(o.picks).slice();
    var capOf = {}, avgOf = {}, order = {};
    arr(o.pool).forEach(function(p, i){
      if (!p || !p.slug) return;
      capOf[p.slug] = num(p.cap) ? p.cap : null;
      avgOf[p.slug] = num(p.avg) ? p.avg : null;
      order[p.slug] = i;
    });
    var used = 0;
    picks.forEach(function(s){ used += num(capOf[s]) ? capOf[s] : 0; });
    var left = CAP - used, k = SLOTS - picks.length;
    function result(ok, reason, add){
      var team = picks.concat(add || []);
      var capUsed = 0, total = 0;
      team.forEach(function(s){ capUsed += num(capOf[s]) ? capOf[s] : 0; total += num(avgOf[s]) ? avgOf[s] : 0; });
      return { ok: ok, reason: reason, add: add || [], team: team, captain: bestCaptain(team, avgOf, o.captain), capUsed: capUsed, capLeft: CAP - capUsed, avgTotal: total };
    }
    if (k <= 0) return result(false, 'full', []);
    if (left < 0) return result(false, 'over', []);
    var cand = [], anyAvg = false;
    arr(o.pool).forEach(function(p){
      if (!p || !p.slug || picks.indexOf(p.slug) >= 0) return;
      var c = capOf[p.slug];
      if (num(c) && num(avgOf[p.slug])) anyAvg = true;
      if (!num(c) || c < 0 || c > left) return;
      cand.push({ slug: p.slug, cap: Math.round(c), score: num(avgOf[p.slug]) ? avgOf[p.slug] : 0, has: num(avgOf[p.slug]) });
    });
    if (!anyAvg) return result(false, 'nodata', []);
    if (cand.length < k) return result(false, 'nofit', []);
    var W = Math.floor(left);
    // best[i][j][w]: best score using items from i.. onwards, choosing exactly j of them with total cap exactly w
    // (null = impossible). Filled from the back so the reconstruction walks the pool in order and prefers
    // earlier players on exact ties.
    var n = cand.length, best = [];
    for (var i = n; i >= 0; i--){
      best[i] = [];
      for (var j = 0; j <= k; j++){
        best[i][j] = [];
        for (var w = 0; w <= W; w++){
          var v = null;
          if (i === n) v = (j === 0 && w === 0) ? 0 : null;
          else {
            var skip = best[i + 1][j][w];
            var take = null, it = cand[i];
            if (j > 0 && w >= it.cap && best[i + 1][j - 1][w - it.cap] !== null) take = best[i + 1][j - 1][w - it.cap] + it.score;
            if (take !== null && (skip === null || take > skip + EPS)) v = take;
            else if (take !== null && skip !== null && Math.abs(take - skip) <= EPS) v = take; // tie: take the earlier player
            else v = skip;
          }
          best[i][j][w] = v;
        }
      }
    }
    // pick the total cap w with the best score; on a tie the lower cap wins
    var bw = -1, bv = null;
    for (var w2 = 0; w2 <= W; w2++){
      var x = best[0][k][w2];
      if (x === null) continue;
      if (bv === null || x > bv + EPS){ bv = x; bw = w2; }
    }
    if (bw < 0) return result(false, 'nofit', []);
    var add = [], jj = k, ww = bw;
    for (var ii = 0; ii < n && jj > 0; ii++){
      var itm = cand[ii], target = best[ii][jj][ww];
      if (ww >= itm.cap){
        var t2 = best[ii + 1][jj - 1][ww - itm.cap];
        if (t2 !== null && Math.abs(t2 + itm.score - target) <= EPS){ add.push(itm.slug); jj--; ww -= itm.cap; continue; }
      }
    }
    return result(true, '', add);
  }

  // Captain = the highest recent average in the team; on a tie the current captain stays if tied, else the first.
  // Players without an average rank last; with no averages at all the current captain (or the first pick) stays.
  function bestCaptain(team, avgOf, current){
    var t = arr(team);
    if (!t.length) return null;
    var top = null;
    t.forEach(function(s){ var a = avgOf[s]; if (num(a) && (top === null || a > top + EPS)) top = a; });
    if (top === null) return t.indexOf(current) >= 0 ? current : t[0];
    if (t.indexOf(current) >= 0 && num(avgOf[current]) && Math.abs(avgOf[current] - top) <= EPS) return current;
    for (var i = 0; i < t.length; i++) if (num(avgOf[t[i]]) && Math.abs(avgOf[t[i]] - top) <= EPS) return t[i];
    return t[0];
  }

  // Cap meter state: level 'ok' | 'warn' (more than 90 used) | 'over' (more than the cap).
  function capLevel(used, cap){
    var c = num(cap) ? cap : 100;
    if (used > c) return 'over';
    if (used > c * 0.9) return 'warn';
    return 'ok';
  }

  // Queue (watchlist): clean a stored list against the slugs that exist; no duplicates, order kept.
  function cleanQueue(list, known){
    var seen = {}, out = [];
    arr(list).forEach(function(s){
      if (typeof s !== 'string' || seen[s]) return;
      if (known && !known[s]) return;
      seen[s] = 1; out.push(s);
    });
    return out;
  }
  function toggleQueue(list, slug){
    var q = arr(list).slice(), i = q.indexOf(slug);
    if (i >= 0) q.splice(i, 1); else q.push(slug);
    return q;
  }

  root.BDDraftCore = {
    valueScore: valueScore, topValue: topValue, formSeries: formSeries, autoFill: autoFill, bestCaptain: bestCaptain,
    capLevel: capLevel, cleanQueue: cleanQueue, toggleQueue: toggleQueue
  };
})(typeof window !== 'undefined' ? window : globalThis);
