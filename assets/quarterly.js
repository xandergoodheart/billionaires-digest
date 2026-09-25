/* quarterly.html: 13F filer cards from data/13f/. ES5. Needs assets/common.js (BD). */
(function(){
  BD.initTheme();
  var el = BD.el, arr = BD.arr, safeUrl = BD.safeUrl, fmtUsd = BD.fmtUsd, fmtShares = BD.fmtShares, fmtDate = BD.fmtDate;
  var box = document.getElementById('filers');
  var SHOW = 5;

  function fail(msg){ box.innerHTML = ''; box.appendChild(el('p', 'fnote', msg)); }

  function extLink(cls, text, url){
    var u = safeUrl(url);
    if (!u) return null;
    var a = el('a', cls, text); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }

  function secLabel(h){
    var bits = [];
    if (h.title) bits.push(h.title);
    if (h.putCall) bits.push(h.putCall.toLowerCase() + ' options');
    if (h.shareType === 'PRN') bits.push('principal amount');
    return bits.join(' · ');
  }
  function unit(h){ return h.shareType === 'PRN' ? '' : ' sh'; }
  function signed(n, fmt){ return (n > 0 ? '+' : (n < 0 ? '−' : '')) + fmt(Math.abs(n)); }

  function stat(n, label){ var s = el('span'); s.appendChild(el('b', null, n)); s.appendChild(document.createTextNode(label)); return s; }

  function topTable(f){
    var sec = el('div', 'fsec');
    sec.appendChild(el('h3', null, 'Top holdings'));
    var rows = arr(f.top);
    if (!rows.length){ sec.appendChild(el('p', 'chnone', 'No share holdings listed.')); return sec; }
    var t = el('table', 'qtable');
    var cap = el('caption', 'sr-only', 'Largest positions at ' + fmtDate(f.period) + ', by reported value');
    t.appendChild(cap);
    var thead = el('thead'), hr = el('tr');
    [['Company', ''], ['Shares', 'n hide-sm'], ['Value', 'n'], ['Share of fund', 'n']].forEach(function(x){ var th = el('th', x[1] || null, x[0]); th.scope = 'col'; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function(h){
      var tr = el('tr');
      var c = el('td', 'co'); c.appendChild(document.createTextNode(h.name || h.cusip)); if (secLabel(h)) c.appendChild(el('span', 'sub', secLabel(h)));
      tr.appendChild(c);
      tr.appendChild(el('td', 'n hide-sm', fmtShares(h.shares)));
      tr.appendChild(el('td', 'n', fmtUsd(h.value)));
      var p = el('td', 'n', h.pct != null ? h.pct.toFixed(1) + '%' : '');
      if (h.pct != null){ var bar = el('span', 'pctbar'); var i = el('i'); i.style.width = Math.min(100, Math.max(1, h.pct)) + '%'; bar.appendChild(i); p.appendChild(bar); }
      tr.appendChild(p);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    sec.appendChild(t);
    return sec;
  }

  function changeRow(kind, h){
    var r = el('div', 'chrow');
    var c = el('div', 'co'); c.appendChild(document.createTextNode(h.name || h.cusip)); if (secLabel(h)) c.appendChild(el('span', 'sub', secLabel(h)));
    r.appendChild(c);
    var n = el('div', 'nums');
    if (kind === 'new'){
      n.appendChild(el('span', 'up', '+' + fmtShares(h.shares) + unit(h)));
      n.appendChild(el('span', 'sub', fmtUsd(h.value)));
    } else if (kind === 'exited'){
      n.appendChild(el('span', 'down', 'Sold all ' + fmtShares(h.prevShares) + unit(h)));
      n.appendChild(el('span', 'sub', 'was ' + fmtUsd(h.prevValue)));
    } else {
      var pct = h.sharesChangePct != null ? ' (' + (h.sharesChangePct > 0 ? '+' : '') + h.sharesChangePct + '%)' : '';
      n.appendChild(el('span', kind === 'increased' ? 'up' : 'down', signed(h.sharesChange, fmtShares) + unit(h) + pct));
      n.appendChild(el('span', 'sub', 'now ' + fmtUsd(h.value)));
    }
    r.appendChild(n);
    return r;
  }

  function changeList(f, kind, title, cls, count){
    var d = el('div', 'fsec chg');
    var list = arr(f.changes && f.changes[kind]);
    var h = el('h3', cls, title + ' ');
    h.appendChild(el('span', 'cnt', '· ' + (count == null ? list.length : count)));
    d.appendChild(h);
    if (!list.length){ d.appendChild(el('p', 'chnone', 'None')); return d; }
    var rowsBox = el('div');
    d.appendChild(rowsBox);
    function draw(n){
      rowsBox.innerHTML = '';
      list.slice(0, n).forEach(function(x){ rowsBox.appendChild(changeRow(kind, x)); });
    }
    draw(SHOW);
    if (list.length > SHOW){
      var b = el('button', 'morebtn', 'Show ' + (list.length - SHOW) + ' more');
      b.type = 'button';
      b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', function(){
        var open = b.getAttribute('aria-expanded') === 'true';
        draw(open ? SHOW : list.length);
        b.setAttribute('aria-expanded', open ? 'false' : 'true');
        b.textContent = open ? 'Show ' + (list.length - SHOW) + ' more' : 'Show fewer';
      });
      d.appendChild(b);
    }
    if (count != null && count > list.length) d.appendChild(el('p', 'chnone', 'Largest ' + list.length + ' of ' + count + ' shown.'));
    return d;
  }

  function card(f, sum){
    var s = el('section', 'fcard');
    s.id = f.slug;
    var head = el('div', 'fhead');
    var who = el('div', 'fwho');
    var ip = BD.indexBySlug(f.personSlug);
    head.appendChild(BD.avatar({ name: f.person, sector: ip ? ip.sector : null }, 64));
    var pl = el('div', 'fperson');
    arr(f.people).forEach(function(p, i){
      if (i) pl.appendChild(document.createTextNode(' · '));
      var a = el('a', null, p.person); a.href = 'people/' + encodeURIComponent(p.personSlug) + '/';
      pl.appendChild(a);
    });
    who.appendChild(pl);
    who.appendChild(el('h2', 'fname serif', f.filer));
    var meta = 'Quarter ended ' + fmtDate(f.period) + ' · filed ' + fmtDate(f.filed);
    if (f.prevPeriod) meta += ' · compared with ' + fmtDate(f.prevPeriod);
    who.appendChild(el('div', 'fmeta', meta));
    head.appendChild(who);
    var link = extLink('flink', 'Filing on SEC.gov ↗', f.url);
    if (link) head.appendChild(link);
    s.appendChild(head);

    if (f.confidential){
      s.appendChild(el('p', 'fconf', 'Holdings confidential: this filing lists no positions.'));
      return s;
    }

    var st = el('div', 'fstats');
    st.appendChild(stat(fmtUsd(f.totalValue), 'reported value'));
    st.appendChild(stat(String(f.positions), f.positions === 1 ? 'position' : 'positions'));
    if (f.changes){
      st.appendChild(stat(String(sum.new), 'new'));
      st.appendChild(stat(String(sum.exited), 'sold out'));
      st.appendChild(stat(String(sum.increased), 'added to'));
      st.appendChild(stat(String(sum.decreased), 'cut'));
    }
    s.appendChild(st);
    if (f.note) s.appendChild(el('p', 'fnote', f.note.charAt(0).toUpperCase() + f.note.slice(1) + '.'));
    if (f.positions >= 1000) s.appendChild(el('p', 'fnote', 'A very large firm: this is its whole US book, much of it managed for clients or hedged. The lists show the largest moves.'));

    var g = el('div', 'fgrid');
    g.appendChild(topTable(f));
    var moves = (sum.new || 0) + (sum.exited || 0) + (sum.increased || 0) + (sum.decreased || 0);
    if (f.changes && !moves){
      var nc = el('div', 'fsec');
      nc.appendChild(el('h3', null, 'Changes'));
      nc.appendChild(el('p', 'chnone', 'Same holdings and share counts as the quarter before.'));
      g.appendChild(nc);
    } else if (f.changes){
      var cg = el('div', 'chgrid');
      cg.appendChild(changeList(f, 'new', 'New positions', 'new', sum.new));
      cg.appendChild(changeList(f, 'exited', 'Sold out', 'exited', sum.exited));
      cg.appendChild(changeList(f, 'increased', 'Added to', 'inc', sum.increased));
      cg.appendChild(changeList(f, 'decreased', 'Cut', 'dec', sum.decreased));
      g.appendChild(cg);
    }
    s.appendChild(g);
    return s;
  }

  function render(ix, details){
    box.innerHTML = '';
    // richest person first (people index rank), then larger funds first
    var filers = arr(ix.filers).map(function(f, i){ return { f: f, d: details[i] }; });
    filers.sort(function(a, b){
      var ra = BD.indexBySlug(a.f.personSlug), rb = BD.indexBySlug(b.f.personSlug);
      var ka = ra && ra.rank ? ra.rank : 999, kb = rb && rb.rank ? rb.rank : 999;
      return ka - kb || (b.f.totalValue || 0) - (a.f.totalValue || 0);
    });
    details = filers.map(function(x){ return x.d; });
    filers = filers.map(function(x){ return x.f; });
    if (!filers.length){ fail('No fund filings yet. They arrive after each quarter ends.'); return; }
    var jump = el('nav', 'qjump');
    jump.setAttribute('aria-label', 'Funds on this page');
    filers.forEach(function(f){ var a = el('a', null, f.filer); a.href = '#' + f.slug; jump.appendChild(a); });
    box.appendChild(jump);
    filers.forEach(function(f, i){
      var d = details[i];
      if (!d){
        var s = el('section', 'fcard'); s.id = f.slug;
        s.appendChild(el('h2', 'fname serif', f.filer));
        s.appendChild(el('p', 'fnote', 'Details could not be loaded.'));
        box.appendChild(s);
        return;
      }
      box.appendChild(card(d, f));
    });
    if (location.hash){
      var t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t) t.scrollIntoView();
    }
  }

  var up = document.getElementById('updated');
  Promise.all([BD.getJson('data/13f/index.json'), BD.loadPeople().catch(function(){ return null; })]).then(function(res){
    var ix = res[0] || {};
    if (ix.generated && up) up.textContent = 'Checked ' + fmtDate(BD.isoOf(ix.generated));
    var filers = arr(ix.filers);
    return BD.pool(filers, 4, function(f){ return BD.getJson('data/13f/' + encodeURIComponent(f.slug) + '.json'); })
      .then(function(details){ render(ix, details); });
  }).catch(function(){ fail('Fund filings could not be loaded. Please try again later.'); });
})();
