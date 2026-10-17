/* Billionaires Digest v2: pure helpers for the Players pages (players.html, player.html) and the Draft room table. ES5,
   no DOM except paintSortHeads (browser only).
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

  // Player type filter: kind '' (all), 'billionaire' or 'ceo'. A pool entry is a CEO when its type is "ceo".
  var KINDS = ['', 'billionaire', 'ceo'];
  function kindOf(p){ return p && p.type === 'ceo' ? 'ceo' : 'billionaire'; }
  function typeMatches(p, kind){ return !kind || KINDS.indexOf(kind) < 0 || kindOf(p) === kind; }
  function cleanKind(kind){ return KINDS.indexOf(kind) >= 0 ? kind : ''; }

  // Search: every word must appear in the name, sector, a ticker or a holding's company name.
  function matches(p, q){
    var words = norm(fold(q)).split(' ').filter(Boolean);
    if (!words.length) return true;
    var hay = norm(fold([p && p.name, p && p.sector].concat(arr(p && p.holdings).map(function(h){ return (h && h.ticker || '') + ' ' + (h && h.name || ''); })).join(' ')));
    for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    return true;
  }

  // ---- sorting (shared by the Draft room and Players tables: clickable column headers + the compact select) ----
  // A sort is a column key and a direction. Keys: pts (week points), avg (avg/day), cap (cap cost),
  // rank (Public Stake Value; "high" = the biggest stake = rank 1), value (points per cap), name.
  // First click on a column: high to low ('desc'), except name: A to Z ('asc'). A second click flips it.
  // Sort ids (the select values and what sessionStorage keeps): 'pts', 'pts-asc', 'avg', 'avg-asc', 'capdesc',
  // 'capasc', 'rank', 'rank-asc', 'value', 'value-asc', 'name', 'name-desc'. Older saved ids stay valid.
  var SORT_KEYS = ['pts', 'avg', 'cap', 'rank', 'value', 'name'];
  function firstDir(key){ return key === 'name' ? 'asc' : 'desc'; }
  function parseSort(id){
    var s = String(id == null ? '' : id);
    if (s === 'capdesc') return { key: 'cap', dir: 'desc' };
    if (s === 'capasc') return { key: 'cap', dir: 'asc' };
    var m = /^([a-z]+)(?:-(asc|desc))?$/.exec(s);
    if (!m || SORT_KEYS.indexOf(m[1]) < 0 || m[1] === 'cap') return { key: 'pts', dir: 'desc' };
    return { key: m[1], dir: m[2] || firstDir(m[1]) };
  }
  function sortId(key, dir){
    if (SORT_KEYS.indexOf(key) < 0) return 'pts';
    var d = dir === 'asc' || dir === 'desc' ? dir : firstDir(key);
    if (key === 'cap') return d === 'asc' ? 'capasc' : 'capdesc';
    return d === firstDir(key) ? key : key + '-' + d;
  }
  // The sort after clicking a column header: same column flips the direction, another column starts at its first one.
  function nextSort(current, key){
    var c = parseSort(current);
    if (c.key === key) return sortId(key, c.dir === 'asc' ? 'desc' : 'asc');
    return sortId(key, firstDir(key));
  }
  // What a column header shows: { active, dir, ariaSort ('ascending' | 'descending' | 'none'), arrow ('down' | 'up' |
  // 'both'), label (words for the next click) }. For name, A to Z is 'ascending'; for rank, the biggest stake first is
  // 'descending' (by stake, not by rank number).
  function headerState(current, key){
    var c = parseSort(current), on = c.key === key, next = parseSort(nextSort(current, key));
    var words = key === 'name' ? { asc: 'A to Z', desc: 'Z to A' } : { asc: 'low to high', desc: 'high to low' };
    return {
      active: on, dir: on ? c.dir : null,
      ariaSort: on ? (c.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      arrow: on ? (c.dir === 'asc' ? 'up' : 'down') : 'both',
      label: 'Sort ' + words[next.dir]
    };
  }
  // Browser only (the one DOM helper here, shared by draft.js and players.js): paint every <button data-sort="key">
  // inside scope as a sortable column header for the current sort id: label + ▼ / ▲ arrow (↕ hint when not active),
  // aria-sort on its <th>, and a title / screen-reader hint naming what the next click does.
  // extra: { key: { title, sr } } for column notes (e.g. which week the points are from).
  var SVGNS = 'http://www.w3.org/2000/svg';
  function paintSortHeads(scope, current, extra){
    if (!scope || typeof document === 'undefined') return;
    var bs = scope.querySelectorAll('button[data-sort]');
    for (var i = 0; i < bs.length; i++){
      var b = bs[i], key = b.getAttribute('data-sort'), st = headerState(current, key), x = (extra && extra[key]) || {};
      if (!b.hasAttribute('data-label')) b.setAttribute('data-label', b.textContent.replace(/\s+/g, ' ').trim());
      while (b.firstChild) b.removeChild(b.firstChild);
      var t = document.createElement('span'); t.className = 'v2-sorth__t'; t.textContent = b.getAttribute('data-label');
      b.appendChild(t);
      var s = document.createElement('span'); s.className = 'v2-sr';
      s.textContent = (x.sr || '') + ', ' + st.label.toLowerCase();
      b.appendChild(s);
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 10 14'); svg.setAttribute('width', '10'); svg.setAttribute('height', '14');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.setAttribute('class', 'v2-sorth__i is-' + st.arrow);
      var up = document.createElementNS(SVGNS, 'path'); up.setAttribute('d', 'M5 1.5L9 6H1z'); up.setAttribute('class', 'v2-sorth__up');
      var dn = document.createElementNS(SVGNS, 'path'); dn.setAttribute('d', 'M5 12.5L1 8h8z'); dn.setAttribute('class', 'v2-sorth__dn');
      svg.appendChild(up); svg.appendChild(dn);
      b.appendChild(svg);
      b.className = 'v2-sorth' + (st.active ? ' is-active' : '');
      b.title = (x.title ? x.title + '. ' : '') + st.label;
      var th = b.parentNode;
      if (th && th.tagName === 'TH'){ if (st.active) th.setAttribute('aria-sort', st.ariaSort); else th.removeAttribute('aria-sort'); }
    }
  }
  function nameKey(p){ return norm(fold(p && p.name)); }
  // Sort a copy of the pool by a sort id (above). get: { pts, avg, cap, rank, value } each (slug) -> number or null.
  // Missing values always sort last, in both directions. Ties: name A to Z, then rank, then slug, so the order is
  // stable. rank: get.rank (Public Stake Value rank) when given, else the entry's own rank.
  function sortPlayers(list, id, get){
    var g = get || {}, s = parseSort(id), sign = s.dir === 'asc' ? 1 : -1;
    var rk = g.rank ? function(p){ var r = g.rank(p.slug); return num(r) ? r : null; } : function(p){ return num(p.rank) ? p.rank : null; };
    function byRank(a, b){
      var x = rk(a), y = rk(b);
      if (x == null || y == null) return x == null && y == null ? 0 : (x == null ? 1 : -1);
      return x - y;
    }
    function bySlug(a, b){ var x = String(a.slug || ''), y = String(b.slug || ''); return x < y ? -1 : (x > y ? 1 : 0); }
    function byName(a, b){ var x = nameKey(a), y = nameKey(b); if (!x || !y) return !x && !y ? 0 : (!x ? 1 : -1); return x < y ? -1 : (x > y ? 1 : 0); }
    function tie(a, b){ return byName(a, b) || byRank(a, b) || bySlug(a, b); }
    var val;
    if (s.key === 'name') val = null;
    else if (s.key === 'rank') val = function(p){ var r = rk(p); return r == null ? null : -r; };  // biggest stake = rank 1 = "high"
    else { var fn = g[s.key]; val = function(p){ var v = fn ? fn(p.slug) : null; return num(v) ? v : null; }; }
    function cmp(a, b){
      if (!val){
        var x0 = nameKey(a), y0 = nameKey(b);
        if (!x0 || !y0) return !x0 && !y0 ? (byRank(a, b) || bySlug(a, b)) : (!x0 ? 1 : -1);
        return (x0 < y0 ? -sign : (x0 > y0 ? sign : 0)) || byRank(a, b) || bySlug(a, b);
      }
      var x = val(a), y = val(b);
      if (x == null || y == null) return x == null && y == null ? tie(a, b) : (x == null ? 1 : -1);
      return ((x - y) * sign) || tie(a, b);
    }
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
    parseSort: parseSort, sortId: sortId, nextSort: nextSort, headerState: headerState, paintSortHeads: paintSortHeads,
    kindOf: kindOf, typeMatches: typeMatches, cleanKind: cleanKind,
    dailySeries: dailySeries, gameLog: gameLog, pct: pct, weightPct: weightPct
  };
})(typeof window !== 'undefined' ? window : globalThis);
