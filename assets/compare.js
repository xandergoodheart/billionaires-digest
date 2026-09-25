/* compare.html: two people side by side. Link format: compare.html#a=elon-musk&b=jeff-bezos. ES5. */
(function(){
  BD.initTheme();
  var el = BD.el, arr = BD.arr, safeUrl = BD.safeUrl, plural = BD.plural, clip = BD.clip;
  var body = document.getElementById('body');
  var DEF_A = 'elon-musk', DEF_B = 'jeff-bezos';
  var GROUPS = [
    ['controls', 'Companies'], ['stakes', 'Stakes'], ['vehicles', 'Investment vehicles'], ['privateDeals', 'Private deals'],
    ['realEstate', 'Real estate'], ['trophies', 'Trophies'], ['policy', 'Legal & regulatory'], ['giving', 'Giving']
  ];
  var KIND = { controls: 'controls or runs it', stakes: 'holds a stake', privateDeals: 'named in a private deal' };
  var TOP = 8;

  function str(x){ return x == null ? '' : String(x).trim(); }
  function personHref(slug){ return 'people/' + encodeURIComponent(slug) + '/'; }
  function shortName(n){ return String(n || '').replace(/\s*&\s*family\s*$/i, ''); }
  function srcLink(u, label){
    var s = safeUrl(u);
    if (!s) return null;
    var a = el('a', 't4src', label || 'Source ↗'); a.href = s; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }

  var people = [], graph = null, est = null;
  var selA, selB, cols, sharedBox, token = 0;

  function readHash(){
    var h = String(location.hash || '').replace(/^#/, ''), out = {};
    h.split('&').forEach(function(kv){ var i = kv.indexOf('='); if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    var a = BD.indexBySlug(out.a) ? out.a : DEF_A, b = BD.indexBySlug(out.b) ? out.b : DEF_B;
    if (!BD.indexBySlug(a)) a = people[0] && people[0].slug;
    if (!BD.indexBySlug(b)) b = people[1] && people[1].slug;
    return { a: a, b: b };
  }
  function writeHash(a, b){
    var h = '#a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b);
    if (location.hash === h) return;
    try { if (window.history && window.history.replaceState){ window.history.replaceState(null, '', h); return; } } catch(e){}
    location.hash = h;
  }

  function findEdge(a, b){
    var es = arr(graph && graph.edges);
    for (var i = 0; i < es.length; i++){
      if (es[i].a === a && es[i].b === b) return { e: es[i], flip: false };
      if (es[i].a === b && es[i].b === a) return { e: es[i], flip: true };
    }
    return null;
  }
  // "controls:3" keys of the rows each side holds in common
  function sharedRefs(edge){
    var out = [{}, {}];
    if (!edge) return out;
    arr(edge.e.companies).forEach(function(c){
      for (var s = 0; s < 2; s++){
        var j = edge.flip ? 1 - s : s;
        var kind = c.kinds && c.kinds[j], ref = c.refs && c.refs[j];
        if (kind && typeof ref === 'number') out[s][kind + ':' + ref] = true;
      }
    });
    return out;
  }

  function holdingRow(kind, h, i, shared){
    var row = el('div', 'cmprow' + (shared[kind + ':' + i] ? ' shared' : ''));
    var m = el('div', 'm');
    m.appendChild(document.createTextNode(clip(h.name, 90)));
    if (shared[kind + ':' + i]){ m.appendChild(document.createTextNode(' ')); m.appendChild(el('span', 't4tag', 'Shared')); }
    var bits = [h.ticker, clip(str(h.stake), 70)].filter(function(x){ return str(x); });
    if (kind === 'controls' && !str(h.stake) && str(h.role)) bits.push(clip(str(h.role), 70));
    if (bits.length) m.appendChild(el('span', 'd', bits.join(' · ')));
    row.appendChild(m);
    var a = srcLink(h.source);
    if (a) row.appendChild(a);
    return row;
  }

  function renderCol(col, slug, prof, shared){
    col.innerHTML = '';
    var ip = BD.indexBySlug(slug) || {};
    var P = prof || {};
    var name = ip.name || P.name || slug;
    var head = el('div', 'cmphead');
    head.appendChild(BD.avatar({ name: name, sector: ip.sector || P.sector }, 64));
    var who = el('div');
    who.appendChild(el('div', 'cmprank', '#' + (ip.rank || P.rank || '?') + ' · ' + (ip.sector || P.sector || 'Other')));
    var h2 = el('h2', 'serif'), a = el('a', null, name); a.href = personHref(slug);
    h2.appendChild(a); who.appendChild(h2);
    if (ip.source) who.appendChild(el('div', 'cmprank', 'Wealth from ' + ip.source));
    head.appendChild(who);
    col.appendChild(head);

    var wbox = el('div', 'cmpworth');
    wbox.appendChild(el('div', 'label', 'Net worth'));
    wbox.appendChild(el('div', 'v serif', ip.worth || P.worth || '—'));
    var pix = BD.getPeople();
    var iso = BD.isoOf(pix && pix.asOf);
    wbox.appendChild(el('div', 's', String((pix && pix.source) || 'Forbes').replace(/\s+Billionaires$/i, '') + (iso ? ' · as of ' + BD.fmtDate(iso) : '')));
    var pe = est && est.people && Object.prototype.hasOwnProperty.call(est.people, slug) ? est.people[slug] : null;
    var minCov = est && typeof est.minCoverage === 'number' && isFinite(est.minCoverage) ? est.minCoverage : 0.25;
    var e = el('div', 'e');
    if (pe && typeof pe.estDailyChange === 'number' && isFinite(pe.estDailyChange) && typeof pe.coverage === 'number' && pe.coverage >= minCov){
      var v = pe.estDailyChange, dir = v > 0 ? 'up' : (v < 0 ? 'down' : 'flat');
      e.appendChild(document.createTextNode('Est. today: '));
      e.appendChild(el('span', BD.dirClass(dir), BD.arrow(dir) + (BD.fmtUsd(Math.abs(v)) || '$0')));
      e.appendChild(document.createTextNode(' from public stakes (covers ' + (pe.coverage >= 0.9 ? 'most' : '~' + Math.round(pe.coverage * 100) + '%') + ' of net worth)'));
    } else {
      e.appendChild(document.createTextNode('Est. today: not shown. Too little of their wealth is in US-listed stakes with known share counts.'));
      e.className = 'e';
      e.style.color = 'var(--muted)';
    }
    wbox.appendChild(e);
    col.appendChild(wbox);

    // counts
    var dl = el('dl', 'cmpstats');
    GROUPS.forEach(function(g){
      var d = el('div');
      d.appendChild(el('dt', null, g[1]));
      d.appendChild(el('dd', null, String(arr(P[g[0]]).length)));
      dl.appendChild(d);
    });
    var dStories = el('div'); dStories.appendChild(el('dt', null, 'Stories (recent editions)'));
    var ddS = el('dd', null, '…'); dStories.appendChild(ddS); dl.appendChild(dStories);
    var dFil = el('div'); dFil.appendChild(el('dt', null, 'SEC filings (last 90 days)'));
    var ddF = el('dd', null, '…'); dFil.appendChild(ddF); dl.appendChild(dFil);
    col.appendChild(dl);

    // holdings
    var sec = el('div', 'cmpsec');
    sec.appendChild(el('h3', null, 'Top holdings'));
    var rows = [];
    arr(P.controls).forEach(function(h, i){ if (h && h.name) rows.push(['controls', h, i]); });
    arr(P.stakes).forEach(function(h, i){ if (h && h.name) rows.push(['stakes', h, i]); });
    if (!prof) sec.appendChild(el('p', 't4msg', 'Profile not available.'));
    else if (!rows.length) sec.appendChild(el('p', 't4msg', 'No companies or stakes listed in the profile.'));
    rows.slice(0, TOP).forEach(function(r){ sec.appendChild(holdingRow(r[0], r[1], r[2], shared)); });
    if (rows.length > TOP){
      var more = el('details', 'fpmore');
      more.appendChild(el('summary', null, 'Show ' + (rows.length - TOP) + ' more'));
      rows.slice(TOP).forEach(function(r){ more.appendChild(holdingRow(r[0], r[1], r[2], shared)); });
      sec.appendChild(more);
    }
    col.appendChild(sec);
    return { stories: ddS, filings: ddF, filLabel: dFil.firstChild, name: name };
  }

  function renderShared(a, b, edge){
    sharedBox.innerHTML = '';
    var na = (BD.indexBySlug(a) || {}).name || a, nb = (BD.indexBySlug(b) || {}).name || b;
    sharedBox.appendChild(el('h2', 't4h2 serif', 'What they hold in common'));
    if (a === b){ sharedBox.appendChild(el('p', 't4msg', 'You picked the same person twice.')); return; }
    if (!edge){
      sharedBox.appendChild(el('p', 't4note', 'Their profiles list no company in common.' + (graph ? '' : ' (The shared-holdings file could not be loaded.)')));
      return;
    }
    sharedBox.appendChild(el('p', 't4note', plural(edge.e.weight, 'company', 'companies') + ' in common. Matching rows are marked "Shared" above.'));
    var ul = el('ul', 'nsco');
    arr(edge.e.companies).forEach(function(c){
      var ka = KIND[c.kinds && c.kinds[edge.flip ? 1 : 0]] || 'listed', kb = KIND[c.kinds && c.kinds[edge.flip ? 0 : 1]] || 'listed';
      var sa = c.sources && c.sources[edge.flip ? 1 : 0], sb = c.sources && c.sources[edge.flip ? 0 : 1];
      var li = el('li');
      li.appendChild(el('span', null, c.name));
      li.appendChild(el('span', 'how', shortName(na) + ': ' + ka + ' · ' + shortName(nb) + ': ' + kb));
      var srcs = el('span', 't4srcs');
      var l1 = srcLink(sa, 'Source · ' + shortName(na) + ' ↗'), l2 = srcLink(sb, 'Source · ' + shortName(nb) + ' ↗');
      if (l1) srcs.appendChild(l1);
      if (l2) srcs.appendChild(l2);
      li.appendChild(srcs);
      ul.appendChild(li);
    });
    var wrap = el('div', 'cmpshared'); wrap.appendChild(ul);
    sharedBox.appendChild(wrap);
    var nl = el('p', 't4note');
    var ln = el('a', null, 'See both on the network map'); ln.href = 'network.html#p=' + encodeURIComponent(a);
    nl.appendChild(ln);
    sharedBox.appendChild(nl);
  }

  function fillCounts(t, slot, slug, archive){
    // stories in recent editions
    if (archive){
      var n = 0;
      archive.list.forEach(function(x){ arr(x.ed && x.ed.stories).forEach(function(s){ if (BD.storyMatches(s, slot.name)) n++; }); });
      slot.stories.textContent = String(n);
      slot.stories.parentNode.firstChild.textContent = 'Stories (last ' + plural(archive.count, 'edition', 'editions') + ')';
    } else slot.stories.textContent = '—';
    BD.loadPersonFilings(slug).then(function(f){
      if (t !== token) return;
      slot.filings.textContent = String(arr(f && f.filings).length);
      if (f && f.windowDays) slot.filLabel.textContent = 'SEC filings (last ' + f.windowDays + ' days)';
    }, function(){ if (t === token) slot.filings.textContent = '—'; });
  }

  var archivePromise = null;
  function loadArchive(){
    if (!archivePromise){
      archivePromise = BD.loadArchiveDated(30).then(function(list){
        var ok = list.filter(function(x){ return x.ed; });
        return { list: ok, count: ok.length };
      }, function(){ return null; });
    }
    return archivePromise;
  }

  function show(){
    var a = selA.value, b = selB.value;
    writeHash(a, b);
    var t = ++token;
    cols[0].innerHTML = ''; cols[1].innerHTML = '';
    cols[0].appendChild(el('p', 't4msg', 'Loading…'));
    Promise.all([BD.loadProfile(a).catch(function(){ return null; }), BD.loadProfile(b).catch(function(){ return null; })]).then(function(ps){
      if (t !== token) return;
      var edge = findEdge(a, b);
      var sh = sharedRefs(edge);
      var s1 = renderCol(cols[0], a, ps[0], sh[0]);
      var s2 = renderCol(cols[1], b, ps[1], a === b ? sh[0] : sh[1]);
      renderShared(a, b, a === b ? null : edge);
      document.title = shortName(s1.name) + ' vs ' + shortName(s2.name) + ' · Billionaires Digest';
      loadArchive().then(function(ar){
        if (t !== token) return;
        fillCounts(t, s1, a, ar);
        fillCounts(t, s2, b, ar);
      });
    });
  }

  function picker(id, label){
    var f = el('div', 't4field');
    var l = el('label', null, label); l.htmlFor = id;
    var s = el('select', 't4select'); s.id = id;
    people.forEach(function(p){ var o = el('option', null, '#' + p.rank + ' ' + p.name); o.value = p.slug; s.appendChild(o); });
    f.appendChild(l); f.appendChild(s);
    return { f: f, s: s };
  }

  function build(){
    body.innerHTML = '';
    var pick = el('div', 'cmppick');
    var pa = picker('cmpa', 'First person'), pb = picker('cmpb', 'Second person');
    selA = pa.s; selB = pb.s;
    var swap = el('button', 't4btn', 'Swap'); swap.type = 'button';
    swap.setAttribute('aria-label', 'Swap the two people');
    pick.appendChild(pa.f); pick.appendChild(swap); pick.appendChild(pb.f);
    body.appendChild(pick);
    var grid = el('div', 'cmpgrid');
    cols = [el('section', 'cmpcol'), el('section', 'cmpcol')];
    cols[0].setAttribute('aria-label', 'First person'); cols[1].setAttribute('aria-label', 'Second person');
    grid.appendChild(cols[0]); grid.appendChild(cols[1]);
    body.appendChild(grid);
    sharedBox = el('section'); sharedBox.setAttribute('aria-live', 'polite');
    body.appendChild(sharedBox);
    body.appendChild(el('p', 't4note', 'Net worth is from the Forbes real-time list. Holdings, deals and counts come from each person\'s sourced profile; every row links to its source. "Est. today" appears only when enough of a person\'s wealth is in US-listed stakes with disclosed share counts.'));

    var h = readHash();
    selA.value = h.a; selB.value = h.b;
    selA.addEventListener('change', show);
    selB.addEventListener('change', show);
    swap.addEventListener('click', function(){ var x = selA.value; selA.value = selB.value; selB.value = x; show(); });
    window.addEventListener('hashchange', function(){
      var n = readHash();
      if (n.a === selA.value && n.b === selB.value) return;
      selA.value = n.a; selB.value = n.b; show();
    });
    show();
  }

  Promise.all([
    BD.loadPeople(),
    BD.getJson('data/network/graph.json').catch(function(){ return null; }),
    BD.loadNetworthEst()
  ]).then(function(res){
    people = arr(res[0] && res[0].people).slice().sort(function(x, y){ return (x.rank || 999) - (y.rank || 999); });
    graph = res[1]; est = res[2];
    var up = document.getElementById('updated'), iso = BD.isoOf(res[0] && res[0].asOf);
    if (up && iso) up.textContent = 'Net worth as of ' + BD.fmtDate(iso);
    if (people.length < 1){ body.innerHTML = ''; body.appendChild(el('p', 't4msg', 'No people to compare yet.')); return; }
    build();
  }).catch(function(){
    body.innerHTML = '';
    body.appendChild(el('p', 't4msg', 'The list of people could not be loaded. Please try again later.'));
  });
})();
