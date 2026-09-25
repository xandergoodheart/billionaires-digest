/* Billionaires Digest v2: pure helpers for the Players pages (players.html, player.html). ES5, no DOM.
   Exposes one global: BDPlayersCore. Works on the fantasy week and day files as they are; never adds numbers of
   its own. Tested with node --test (scripts/lib/v2-players-core.test.mjs). Game only: play money, no prizes. */
(function(root){
  function arr(x){ return Array.isArray(x) ? x : []; }
  function num(x){ return typeof x === 'number' && isFinite(x); }
  function norm(s){
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9.&]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function fold(s){ try { return String(s == null ? '' : s).normalize('NFD'); } catch (e) { return String(s == null ? '' : s); } }

  // Unique tickers of a pool entry, in the order of its holdings.
  function tickers(p){
    var seen = {}, out = [];
    arr(p && p.holdings).forEach(function(h){ if (h && h.ticker && !seen[h.ticker]){ seen[h.ticker] = 1; out.push(h.ticker); } });
    return out;
  }

  // Search: every word must appear in the name, sector, a ticker or a holding's company name.
  function matches(p, q){
    var words = norm(fold(q)).split(' ').filter(Boolean);
    if (!words.length) return true;
    var hay = norm(fold([p && p.name, p && p.sector].concat(arr(p && p.holdings).map(function(h){ return (h && h.ticker || '') + ' ' + (h && h.name || ''); })).join(' ')));
    for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    return true;
  }

  // Sort a copy of the pool. key: pts | avg | capdesc | capasc | rank | name.
  // get: { pts(slug), avg(slug), cap(slug) } each returning a number or null. Missing values sort last;
  // ties fall back to Forbes rank.
  function sortPlayers(list, key, get){
    function byRank(a, b){ return (num(a.rank) ? a.rank : 999) - (num(b.rank) ? b.rank : 999); }
    function byName(a, b){ var x = String(a.name || ''), y = String(b.name || ''); return x < y ? -1 : (x > y ? 1 : byRank(a, b)); }
    function desc(fn){
      return function(a, b){
        var x = fn(a.slug), y = fn(b.slug);
        if (!num(x) && !num(y)) return byRank(a, b);
        if (!num(x)) return 1;
        if (!num(y)) return -1;
        return (y - x) || byRank(a, b);
      };
    }
    function asc(fn){
      return function(a, b){
        var x = fn(a.slug), y = fn(b.slug);
        if (!num(x) && !num(y)) return byRank(a, b);
        if (!num(x)) return 1;
        if (!num(y)) return -1;
        return (x - y) || byRank(a, b);
      };
    }
    var g = get || {};
    var none = function(){ return null; };
    var cmp = {
      pts: desc(g.pts || none),
      avg: desc(g.avg || none),
      capdesc: desc(g.cap || none),
      capasc: asc(g.cap || none),
      rank: byRank,
      name: byName
    }[key] || byRank;
    return arr(list).slice().sort(cmp);
  }

  // Rank of one player by points among the pool entries in the same sector: { rank, of, sector } or null when the
  // player is not in the pool or has no points. Ties share a rank (1, 2, 2, 4). 'of' counts every pool entry in that
  // sector, scored or not.
  function sectorRank(pool, slug, ptsOf){
    var me = null;
    arr(pool).forEach(function(p){ if (p && p.slug === slug) me = p; });
    if (!me) return null;
    var sector = me.sector || 'Other';
    var mine = ptsOf(slug);
    if (!num(mine)) return null;
    var of = 0, above = 0;
    arr(pool).forEach(function(p){
      if (!p || (p.sector || 'Other') !== sector) return;
      of++;
      var v = ptsOf(p.slug);
      if (p.slug !== slug && num(v) && v > mine) above++;
    });
    return { rank: above + 1, of: of, sector: sector };
  }

  // A player's points per scored day over the given week files (oldest first, no duplicate dates):
  // [{ date, points }] with points null when that day has no entry for the player.
  function dailySeries(weeks, slug){
    var seen = {}, out = [];
    arr(weeks).forEach(function(w){
      if (!w) return;
      arr(w.days).forEach(function(d){
        var v = w.daily && w.daily[d] ? w.daily[d][slug] : undefined;
        if (seen[d] === undefined){ seen[d] = out.length; out.push({ date: d, points: num(v) ? v : null }); }
        else if (out[seen[d]].points === null && num(v)) out[seen[d]].points = v;
      });
    });
    out.sort(function(a, b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    return out;
  }

  // Game log rows from the day files (days: { date: dayFile }), newest first. Only days with an entry for the player.
  // Row: { date, holdings: [{ ticker, weight, changePct }] (by weight, largest first), returnPct, pricePoints,
  //        insiderBuy, stories, points }.
  function gameLog(days, dates, slug){
    var rows = [];
    arr(dates).forEach(function(d){
      var f = days && days[d], e = f && f.people && f.people[slug];
      if (!e) return;
      var b = e.bonuses || {};
      var hs = arr(e.holdings).filter(function(h){ return h && h.ticker; }).map(function(h){
        return { ticker: h.ticker, weight: num(h.weight) ? h.weight : null, changePct: num(h.changePct) ? h.changePct : null };
      });
      hs.sort(function(a, b2){ return (b2.weight || 0) - (a.weight || 0); });
      rows.push({
        date: d, holdings: hs,
        returnPct: num(e.returnPct) ? e.returnPct : null,
        pricePoints: num(e.pricePoints) ? e.pricePoints : null,
        insiderBuy: num(b.insiderBuy) ? b.insiderBuy : 0,
        stories: num(b.stories) ? b.stories : 0,
        points: num(e.points) ? e.points : null
      });
    });
    rows.sort(function(a, b){ return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return rows;
  }

  // "+1.23%" / "−0.41%" / "0.00%" (true minus sign), or '—'.
  function pct(x, digits){
    if (!num(x)) return '—';
    var d = digits == null ? 2 : digits, a = Math.abs(x).toFixed(d);
    if (+a === 0) return (0).toFixed(d) + '%';
    return (x > 0 ? '+' : '−') + a + '%';
  }
  // weight 0.2177 -> "21.8%", 1 -> "100%"
  function weightPct(w){
    if (!num(w)) return '—';
    var v = Math.round(w * 1000) / 10;
    return (v % 1 === 0 ? String(v) : v.toFixed(1)) + '%';
  }

  root.BDPlayersCore = {
    tickers: tickers, matches: matches, sortPlayers: sortPlayers, sectorRank: sectorRank,
    dailySeries: dailySeries, gameLog: gameLog, pct: pct, weightPct: weightPct
  };
})(typeof window !== 'undefined' ? window : globalThis);
