/* Billionaires Digest: flows.html. ES5. Reads data/insights/flows.json and leaderboards.json. */
(function(){
  BD.initTheme();
  var el = BD.el, arr = BD.arr, safeUrl = BD.safeUrl, MONTHS = BD.MONTHS;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function usd(n){ return typeof n === 'number' && isFinite(n) ? (n === 0 ? '$0' : BD.fmtUsd(n)) : '—'; }
  function signedUsd(n){ return typeof n === 'number' && n > 0 ? '+' + BD.fmtUsd(n) : usd(n); }
  function dayLabel(iso){ return iso ? MONTHS[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) : ''; }
  function clear(id){ var n = document.getElementById(id); n.innerHTML = ''; return n; }

  function extLink(href, text){
    var u = safeUrl(href);
    if (!u) return null;
    var a = el('a', null, text + ' ↗');
    a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }
  function personLink(p){
    var ip = BD.indexBySlug(p.slug);
    var name = (ip && ip.name) || p.name || p.slug;
    var a = el('a', 'tperson');
    a.href = 'people/' + encodeURIComponent(p.slug) + '/';
    a.appendChild(BD.avatar({ name: name, sector: (ip && ip.sector) || p.sector || 'Other' }, 32, 10));
    a.appendChild(el('span', 'tpname', name));
    return a;
  }

  // ---- headline ----
  function renderStat(f){
    var box = clear('stat');
    if (!f || !f.last7){ box.appendChild(el('p', 'tempty', 'Insider-flow data is not available right now.')); return; }
    var l = f.last7;
    var g = el('div', 'tstat');
    var net = el('div');
    net.appendChild(el('div', 'label', l.net < 0 ? 'Net selling' : (l.net > 0 ? 'Net buying' : 'Net')));
    net.appendChild(el('div', 'big serif ' + (l.net < 0 ? 'down' : (l.net > 0 ? 'up' : 'flat')), usd(Math.abs(l.net))));
    net.appendChild(el('div', 'sub', dayLabel(l.from) + ' – ' + dayLabel(l.to) + ' · estimated; partial'));
    var b = el('div');
    b.appendChild(el('div', 'label', 'Open-market buys'));
    b.appendChild(el('div', 'big serif up', usd(l.buy)));
    b.appendChild(el('div', 'sub', BD.plural(l.buyCount, 'report line', 'report lines')));
    var s = el('div');
    s.appendChild(el('div', 'label', 'Open-market sales'));
    s.appendChild(el('div', 'big serif down', usd(l.sell)));
    s.appendChild(el('div', 'sub', BD.plural(l.sellCount, 'report line', 'report lines')));
    g.appendChild(net); g.appendChild(b); g.appendChild(s);
    box.appendChild(g);
    if (l.otherCount) box.appendChild(el('p', 'tnote', 'Also ' + BD.plural(l.otherCount, 'other line', 'other lines') + ' (grants, gifts, option exercises, tax withholding) not counted as buying or selling.'));
  }

  // ---- weekly chart ----
  var weeks = [];
  function niceMax(v){
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++){ if (steps[i] * p >= v) return steps[i] * p; }
    return 10 * p;
  }
  function svgEl(tag, attrs, text){
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs){ if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); }
    if (text != null) n.textContent = text;
    return n;
  }
  function drawChart(){
    var host = document.getElementById('chartsvg');
    if (!host || !weeks.length) return;
    host.innerHTML = '';
    var W = Math.max(300, Math.round(host.clientWidth || 700));
    var H = W < 520 ? 220 : 260;
    var padL = 52, padR = 6, padT = 10, padB = 28;
    var max = 0;
    weeks.forEach(function(w){ max = Math.max(max, w.buy || 0, w.sell || 0); });
    max = niceMax(max);
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-labelledby': 'charttitle chartdesc' });
    svg.appendChild(svgEl('title', { id: 'charttitle' }, 'Open-market buys and sales by week, last ' + weeks.length + ' weeks'));
    var peakBuy = weeks.reduce(function(a, w){ return (w.buy || 0) > (a.buy || 0) ? w : a; }, weeks[0]);
    var peakSell = weeks.reduce(function(a, w){ return (w.sell || 0) > (a.sell || 0) ? w : a; }, weeks[0]);
    svg.appendChild(svgEl('desc', { id: 'chartdesc' }, 'Paired bars per week: buys and sales in US dollars, estimated. Largest buying week starting ' + dayLabel(peakBuy.start) + ': ' + usd(peakBuy.buy) + '. Largest selling week starting ' + dayLabel(peakSell.start) + ': ' + usd(peakSell.sell) + '. The same numbers are in the table below.'));
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var ticks = 4;
    for (var t = 0; t <= ticks; t++){
      var v = max * t / ticks;
      var y = padT + plotH - plotH * t / ticks;
      svg.appendChild(svgEl('line', { 'class': t === 0 ? 'axis' : 'grid', x1: padL, x2: W - padR, y1: y, y2: y }));
      svg.appendChild(svgEl('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }, usd(v)));
    }
    var slot = plotW / weeks.length;
    var bw = Math.max(3, Math.min(18, slot * 0.34));
    var every = slot < 34 ? 3 : (slot < 56 ? 2 : 1);
    weeks.forEach(function(w, i){
      var cx = padL + slot * i + slot / 2;
      var hb = plotH * (w.buy || 0) / max, hs = plotH * (w.sell || 0) / max;
      var r1 = svgEl('rect', { 'class': 'bbuy', x: cx - bw - 1, y: padT + plotH - hb, width: bw, height: Math.max(0, hb) });
      r1.appendChild(svgEl('title', {}, 'Week of ' + dayLabel(w.start) + ': buys ' + usd(w.buy)));
      var r2 = svgEl('rect', { 'class': 'bsell', x: cx + 1, y: padT + plotH - hs, width: bw, height: Math.max(0, hs) });
      r2.appendChild(svgEl('title', {}, 'Week of ' + dayLabel(w.start) + ': sales ' + usd(w.sell)));
      svg.appendChild(r1); svg.appendChild(r2);
      if ((weeks.length - 1 - i) % every === 0) svg.appendChild(svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, dayLabel(w.start)));
    });
    host.appendChild(svg);
  }
  function renderChart(f){
    var box = clear('chart');
    weeks = arr(f && f.weeks);
    if (!weeks.length){ box.appendChild(el('p', 'tempty', 'No weekly data yet.')); return; }
    var wrap = el('div', 'tchart');
    var host = el('div'); host.id = 'chartsvg';
    wrap.appendChild(host);
    var lg = el('div', 'tlegend');
    var a = el('span'); a.appendChild(el('i', 'lbuy')); a.appendChild(document.createTextNode('Open-market buys')); lg.appendChild(a);
    var b = el('span'); b.appendChild(el('i', 'lsell')); b.appendChild(document.createTextNode('Open-market sales')); lg.appendChild(b);
    lg.appendChild(el('span', null, 'Weeks start on Monday'));
    wrap.appendChild(lg);
    box.appendChild(wrap);

    var det = el('details', 'tdetails');
    det.appendChild(el('summary', null, 'Show the numbers as a table'));
    var tw = el('div', 'ttable-wrap');
    var tb = el('table', 'ttable');
    tb.appendChild(el('caption', null, 'Estimated dollar value of Form 4 open-market trades per week'));
    var th = el('thead'), hr = el('tr');
    ['Week of', 'Buys', 'Sales', 'Net', 'Other lines'].forEach(function(h){ var c = el('th', null, h); c.scope = 'col'; hr.appendChild(c); });
    th.appendChild(hr); tb.appendChild(th);
    var body = el('tbody');
    weeks.forEach(function(w){
      var tr = el('tr');
      var c0 = el('th', null, dayLabel(w.start) + ', ' + w.start.slice(0, 4)); c0.scope = 'row'; tr.appendChild(c0);
      tr.appendChild(el('td', null, usd(w.buy)));
      tr.appendChild(el('td', null, usd(w.sell)));
      tr.appendChild(el('td', w.net > 0 ? 'up' : (w.net < 0 ? 'down' : ''), signedUsd(w.net)));
      tr.appendChild(el('td', null, String(w.otherCount || 0)));
      body.appendChild(tr);
    });
    tb.appendChild(body); tw.appendChild(tb); det.appendChild(tw); box.appendChild(det);
    drawChart();
    var t = null, lastW = host.clientWidth;
    window.addEventListener('resize', function(){
      clearTimeout(t);
      t = setTimeout(function(){ if (host.clientWidth !== lastW){ lastW = host.clientWidth; drawChart(); } }, 150);
    });
  }

  // ---- sector table ----
  function renderSectors(f){
    var box = clear('sectortable');
    var rows = arr(f && f.sectors);
    if (!rows.length){ box.appendChild(el('p', 'tempty', 'No sector data yet.')); return; }
    var tw = el('div', 'ttable-wrap');
    var tb = el('table', 'ttable');
    tb.appendChild(el('caption', null, 'Sector is the person\'s main sector in the Forbes list, not the company\'s. Estimated; partial.'));
    var th = el('thead'), hr = el('tr');
    ['Sector', 'Buys', 'Sales', 'Net', 'Other lines'].forEach(function(h){ var c = el('th', null, h); c.scope = 'col'; hr.appendChild(c); });
    th.appendChild(hr); tb.appendChild(th);
    var body = el('tbody');
    rows.forEach(function(r){
      var tr = el('tr');
      var c0 = el('th'); c0.scope = 'row';
      var a = el('a', null, r.sector); a.href = BD.sectorHref(r.sector); c0.appendChild(a);
      tr.appendChild(c0);
      tr.appendChild(el('td', null, usd(r.buy)));
      tr.appendChild(el('td', null, usd(r.sell)));
      tr.appendChild(el('td', r.net > 0 ? 'up' : (r.net < 0 ? 'down' : ''), signedUsd(r.net)));
      tr.appendChild(el('td', null, String(r.otherCount || 0)));
      body.appendChild(tr);
    });
    tb.appendChild(body); tw.appendChild(tb); box.appendChild(tw);
  }

  // ---- ranked lists ----
  // rows: [{ person, value (string), cls, links: [{href, text}], detail }]
  function board(title, rows, opts){
    var o = opts || {};
    var sec = el('div', 'tboard');
    var h = el('h3', 'serif', title);
    if (o.est) h.appendChild(el('span', 'estflag', 'Estimated; partial'));
    sec.appendChild(h);
    if (o.note) sec.appendChild(el('p', 'tnote', o.note));
    if (!rows.length){ sec.appendChild(el('p', 'tempty', o.empty || 'Nobody on this list yet.')); return sec; }
    var ol = el('ol', 'trank');
    rows.forEach(function(r){
      var li = el('li');
      var m = el('div', 'rmain');
      m.appendChild(personLink(r.person));
      if (r.detail) m.appendChild(el('div', 'tnote', r.detail)).style.marginTop = '2px';
      var srcs = el('div', 'rsrc');
      arr(r.links).forEach(function(l){ var a = extLink(l.href, l.text); if (a) srcs.appendChild(a); });
      if (srcs.childNodes.length) m.appendChild(srcs);
      li.appendChild(m);
      li.appendChild(el('div', 'rval ' + (r.cls || ''), r.value));
      ol.appendChild(li);
    });
    sec.appendChild(ol);
    return sec;
  }
  function filingLinks(list){
    return arr(list).slice(0, 3).map(function(x){
      return { href: x.url, text: (x.form ? 'Form ' + x.form : 'Filing') + (x.ticker ? ' ' + x.ticker : '') + ' · ' + dayLabel(x.date || x.filed) };
    });
  }

  function renderTops(f){
    var box = clear('toplists');
    if (!f){ box.appendChild(el('p', 'tempty', 'Insider-flow data is not available right now.')); return; }
    box.appendChild(board('Top sellers', arr(f.topSellers30d).map(function(r){
      return { person: r, value: usd(r.value), cls: 'down', detail: BD.plural(r.count, 'sale line', 'sale lines'), links: filingLinks(r.filings) };
    }), { est: true, empty: 'No open-market sales reported in the last 30 days.' }));
    box.appendChild(board('Top buyers', arr(f.topBuyers30d).map(function(r){
      return { person: r, value: usd(r.value), cls: 'up', detail: BD.plural(r.count, 'buy line', 'buy lines'), links: filingLinks(r.filings) };
    }), { est: true, empty: 'No open-market buys reported in the last 30 days.' }));
  }

  function renderBoards(lb){
    var box = clear('boardlists');
    if (!lb){ box.appendChild(el('p', 'tempty', 'Leaderboards are not available right now.')); return; }
    var n = lb.notes || {};
    var minCov = typeof lb.minCoverage === 'number' ? Math.round(lb.minCoverage * 100) + '%' : 'a set share';
    var moverNote = 'Change in value of disclosed US-listed holdings on the last trading day. Only people whose covered holdings are at least ' + minCov + ' of their net worth.';
    function moverRows(list){
      return arr(list).map(function(r){
        return {
          person: r,
          value: signedUsd(r.estDailyChange),
          cls: r.estDailyChange > 0 ? 'up' : 'down',
          detail: 'Covers about ' + Math.round((r.coverage || 0) * 100) + '% of net worth',
          links: arr(r.holdings).slice(0, 3).map(function(h){ return { href: h.source, text: h.ticker + ' stake' }; })
        };
      });
    }
    box.appendChild(board('Biggest estimated gainers today', moverRows(lb.gainers), { est: true, note: moverNote, empty: 'No estimated gains to show.' }));
    box.appendChild(board('Biggest estimated losers today', moverRows(lb.losers), { est: true, note: moverNote, empty: 'No estimated losses to show.' }));
    box.appendChild(board('Most active insiders, 30 days', arr(lb.mostActive).map(function(r){
      return { person: r, value: BD.plural(r.transactions, 'trade', 'trades'), detail: 'On ' + BD.plural(r.filingsCount, 'Form 4', 'Form 4s'), links: filingLinks(r.filings) };
    }), { note: 'Count of transactions reported on Form 4 filings filed in the last 30 days (all kinds, including grants and gifts).', empty: n.mostActive || 'No Form 4 activity in the last 30 days.' }));
    box.appendChild(board('Most deals, 12 months', arr(lb.mostDeals).map(function(r){
      return {
        person: r,
        value: BD.plural(r.count, 'deal', 'deals'),
        detail: arr(r.deals)[0] ? 'Latest: ' + BD.clip(r.deals[0].what, 110) : '',
        links: arr(r.deals).slice(0, 3).map(function(d){ return { href: d.source, text: 'Source · ' + BD.monYear(d.date) }; })
      };
    }), { note: n.mostDeals, empty: 'No dated deals in the last 12 months.' }));
    box.appendChild(board('Most moves in our editions', arr(lb.mostMoves).map(function(r){
      return {
        person: r,
        value: BD.plural(r.count, 'story', 'stories'),
        detail: arr(r.stories)[0] ? 'Latest: ' + BD.clip(r.stories[0].headline, 110) : '',
        links: arr(r.stories).slice(0, 3).map(function(s){ return { href: s.url, text: (s.source || 'Source') + ' · ' + dayLabel(s.edition) }; })
      };
    }), { note: n.mostMoves, empty: 'No archived editions yet.' }));
  }

  function fail(){ return null; }
  Promise.all([
    BD.loadPeople().catch(fail),
    BD.getJson('data/insights/flows.json').catch(fail),
    BD.getJson('data/insights/leaderboards.json').catch(fail)
  ]).then(function(r){
    var f = r[1], lb = r[2];
    renderStat(f);
    renderChart(f);
    renderSectors(f);
    renderTops(f);
    renderBoards(lb);
    if (f && f.note) document.getElementById('flownote').textContent = f.note;
    if (f && f.generated) document.getElementById('updated').textContent = 'Updated ' + BD.fmtDate(f.generated);
  });
})();
