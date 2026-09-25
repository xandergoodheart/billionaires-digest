/* copycat.html: hypothetical "copy every disclosed buy" tracker from data/copycat/latest.json. ES5. Needs assets/common.js (BD). */
(function(){
  BD.initTheme();
  var el = BD.el, arr = BD.arr, safeUrl = BD.safeUrl, fmtUsd = BD.fmtUsd, fmtShares = BD.fmtShares, fmtDate = BD.fmtDate, monDay = BD.monDay;
  var box = document.getElementById('cc');

  function fail(msg){ box.innerHTML = ''; box.appendChild(el('p', 'fnote', msg)); }
  function dir(x){ return x > 0 ? 'up' : (x < 0 ? 'down' : 'flat'); }
  function pctText(x){ return x == null ? '' : (x > 0 ? '+' : (x < 0 ? '−' : '')) + Math.abs(x).toFixed(1) + '%'; }
  function money(x){ return x == null ? '' : '$' + x.toFixed(2); }
  function stat(n, label){ var s = el('span'); s.appendChild(el('b', null, n)); s.appendChild(document.createTextNode(label)); return s; }
  function personLink(p){
    var a = el('a', 'who', p.person); a.href = 'people/' + encodeURIComponent(p.personSlug) + '/';
    return a;
  }

  function hero(d){
    var p = d.portfolio || {};
    var h = el('div', 'cchero');
    var left = el('div');
    left.appendChild(el('div', 'label', 'Copy every disclosed buy'));
    var big = el('div', 'ccbig ' + (p.avgReturnPct == null ? 'flat' : dir(p.avgReturnPct)), p.avgReturnPct == null ? 'n/a' : pctText(p.avgReturnPct));
    left.appendChild(big);
    var sub = 'Average return if you had put the same amount into each of ' + (p.priced || 0) + ' priced buys';
    if (d.coverage && d.coverage.from) sub += ' made between ' + fmtDate(d.coverage.from) + ' and ' + fmtDate(d.coverage.to);
    sub += ', valued at today\'s prices.';
    left.appendChild(el('p', 'ccsub', sub));
    h.appendChild(left);
    var st = el('div', 'ccstats');
    st.appendChild(stat(String(p.buys || 0), 'buys disclosed'));
    st.appendChild(stat(String(p.up || 0), 'up'));
    st.appendChild(stat(String(p.down || 0), 'down'));
    st.appendChild(stat(fmtUsd(p.invested || 0), 'they spent'));
    h.appendChild(st);
    return h;
  }

  function buysTable(d){
    var sec = el('section');
    sec.appendChild(el('h2', 'cch2 serif', 'Every buy'));
    var rows = arr(d.buys);
    if (!rows.length){ sec.appendChild(el('p', 'fnote', 'No open-market buys in our filings data yet.')); return sec; }
    var t = el('table', 'qtable');
    t.appendChild(el('caption', 'sr-only', 'Each open-market purchase, the price paid, today\'s price and the return'));
    var thead = el('thead'), hr = el('tr');
    [['Date', 'hide-sm'], ['Who', ''], ['Stock', ''], ['Paid', 'n'], ['Now', 'n hide-sm'], ['Return', 'n']].forEach(function(x){ var th = el('th', x[1] || null, x[0]); th.scope = 'col'; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function(r){
      var tr = el('tr');
      var dt = el('td', 'hide-sm', monDay(r.date));
      tr.appendChild(dt);
      var who = el('td', 'co');
      arr(r.people).forEach(function(p, i){ if (i) who.appendChild(document.createTextNode(', ')); who.appendChild(personLink(p)); });
      who.appendChild(el('span', 'sub hide-sm-inv', monDay(r.date)));
      tr.appendChild(who);
      var st = el('td', 'co');
      st.appendChild(document.createTextNode(r.ticker || r.issuer || ''));
      var subText = (r.ticker ? r.issuer : r.securityTitle) + ' · ' + fmtShares(r.shares) + ' sh · ' + fmtUsd(r.value);
      st.appendChild(el('span', 'sub', subText));
      var u = safeUrl(r.url);
      if (u){ var a = el('a', 'src', 'Form 4 ↗'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', 'Form 4 filing for ' + (r.ticker || r.issuer) + ' on SEC.gov'); st.appendChild(a); }
      tr.appendChild(st);
      tr.appendChild(el('td', 'n', money(r.pricePaid)));
      var now = el('td', 'n hide-sm', r.priceNow != null ? money(r.priceNow) : '—');
      tr.appendChild(now);
      var ret = el('td', 'n ' + (r.returnPct == null ? 'flat' : dir(r.returnPct)));
      if (r.returnPct == null){
        ret.textContent = 'n/a';
        ret.appendChild(el('span', 'sub', r.ticker ? 'no quote' : 'not listed'));
      } else {
        ret.textContent = (r.returnPct > 0 ? '▲ ' : (r.returnPct < 0 ? '▼ ' : '')) + pctText(r.returnPct);
        var ns = el('span', 'sub hide-sm-inv', 'now ' + money(r.priceNow));
        ret.appendChild(ns);
      }
      tr.appendChild(ret);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    sec.appendChild(t);
    return sec;
  }

  function peopleBox(d){
    var b = el('aside', 'box');
    b.appendChild(el('h3', 'serif', 'By person'));
    var list = arr(d.people);
    if (!list.length){ b.appendChild(el('p', 'fnote', 'No buys yet.')); return b; }
    list.forEach(function(p){
      var row = el('div', 'ccperson');
      var ip = BD.indexBySlug(p.personSlug);
      row.appendChild(BD.avatar({ name: p.person, sector: ip ? ip.sector : null }, 40));
      var who = el('div', 'who');
      who.appendChild(personLink(p));
      var sub = p.buys + (p.buys === 1 ? ' buy' : ' buys') + ' · ' + fmtUsd(p.invested);
      if (p.priced < p.buys) sub += ' · ' + (p.buys - p.priced) + ' not priced';
      who.appendChild(el('span', 'sub', sub));
      row.appendChild(who);
      row.appendChild(el('div', 'ret ' + (p.avgReturnPct == null ? 'flat' : dir(p.avgReturnPct)), p.avgReturnPct == null ? 'n/a' : pctText(p.avgReturnPct)));
      b.appendChild(row);
    });
    return b;
  }

  function render(d){
    box.innerHTML = '';
    if (d.method){ var m = document.getElementById('ccmethod'); if (m){ m.innerHTML = ''; m.appendChild(el('strong', null, 'Hypothetical')); m.appendChild(document.createTextNode(d.method.replace(/^Hypothetical\.\s*/, ''))); } }
    box.appendChild(hero(d));
    var g = el('div', 'ccgrid');
    g.appendChild(buysTable(d));
    g.appendChild(peopleBox(d));
    box.appendChild(g);
    var det = d.methodDetail ? d.methodDetail + ' ' : '';
    if (d.pricesAsOf) det += 'Prices as of ' + fmtDate(BD.isoOf(d.pricesAsOf)) + '.';
    box.appendChild(el('p', 'ccdetail', det));
  }

  var up = document.getElementById('updated');
  Promise.all([BD.getJson('data/copycat/latest.json'), BD.loadPeople().catch(function(){ return null; })]).then(function(res){
    var d = res[0] || {};
    if (d.generated && up) up.textContent = 'Updated ' + fmtDate(BD.isoOf(d.generated));
    render(d);
  }).catch(function(){ fail('The tracker could not be loaded. Please try again later.'); });
})();
