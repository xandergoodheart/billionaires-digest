/* network.html: who holds the same companies. Renders data/network/graph.json (positions are computed
   offline by scripts/build-network.mjs, so nothing animates here). ES5. */
(function(){
  BD.initTheme();
  var el = BD.el, arr = BD.arr, safeUrl = BD.safeUrl, plural = BD.plural;
  var SVGNS = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';
  var body = document.getElementById('body');
  var KIND = { controls: 'controls or runs it', stakes: 'holds a stake', privateDeals: 'named in a private deal' };

  function sv(tag, attrs){
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs){ if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]); }
    return n;
  }
  function personHref(slug){ return 'people/' + encodeURIComponent(slug) + '/'; }
  function shortName(n){ return String(n || '').replace(/\s*&\s*family\s*$/i, ''); }

  var G = null, nodeBy = {}, adj = {}, nodeEls = {}, edgeEls = [];
  var selected = null, hot = null;
  var panel, live, svgEl;

  function srcLinks(c, na, nb){
    var box = el('span', 't4srcs');
    [[c.sources && c.sources[0], na], [c.sources && c.sources[1], nb]].forEach(function(x){
      var u = safeUrl(x[0]);
      if (!u) return;
      var a = el('a', 't4src', 'Source · ' + shortName(x[1].name) + ' ↗');
      a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
      box.appendChild(a);
    });
    return box;
  }
  // companies of an edge, told from the point of view of `me` (a node)
  function companyList(e, me){
    var flip = me && e.b === me.slug;
    var na = nodeBy[e.a], nb = nodeBy[e.b];
    var ul = el('ul', 'nsco');
    arr(e.companies).forEach(function(c){
      var li = el('li');
      li.appendChild(el('span', null, c.name));
      var ka = KIND[c.kinds && c.kinds[0]] || 'listed', kb = KIND[c.kinds && c.kinds[1]] || 'listed';
      var how = flip ? shortName(nb.name) + ': ' + kb + ' · ' + shortName(na.name) + ': ' + ka
                     : shortName(na.name) + ': ' + ka + ' · ' + shortName(nb.name) + ': ' + kb;
      li.appendChild(el('span', 'how', how));
      li.appendChild(srcLinks(c, na, nb));
      ul.appendChild(li);
    });
    return ul;
  }

  function renderPanel(){
    var slug = hot || selected;
    panel.innerHTML = '';
    if (!slug){
      panel.appendChild(el('h2', 'serif', 'Pick a person'));
      panel.appendChild(el('p', 'nsub', 'Hover, tap or tab to a circle. Press Enter to keep it selected, Escape to clear.'));
      var top = G.edges.slice(0, 5);
      if (top.length){
        panel.appendChild(el('div', 'label', 'Most in common')).style.marginTop = '14px';
        top.forEach(function(e){
          var row = el('div', 'nsnb'), h = el('div', 'nsnbh');
          var b = el('button', 'nslink', shortName(nodeBy[e.a].name) + ' and ' + shortName(nodeBy[e.b].name));
          b.type = 'button';
          b.addEventListener('click', function(){ select(e.a, true); });
          h.appendChild(b);
          h.appendChild(el('span', 'nscount', plural(e.weight, 'company', 'companies')));
          row.appendChild(h);
          panel.appendChild(row);
        });
      }
      return;
    }
    var n = nodeBy[slug];
    var head = el('div', 'nshead');
    head.appendChild(BD.avatar({ name: n.name, sector: n.sector }, 56));
    var who = el('div');
    var h2 = el('h2', 'serif');
    var a = el('a', null, n.name); a.href = personHref(n.slug); a.style.color = 'inherit';
    h2.appendChild(a);
    who.appendChild(h2);
    who.appendChild(el('div', 'nsub', '#' + n.rank + ' · ' + (n.worthText || '') + ' · ' + n.sector));
    head.appendChild(who);
    panel.appendChild(head);
    var list = (adj[slug] || []).slice().sort(function(x, y){
      return y.weight - x.weight || nodeBy[x.other].rank - nodeBy[y.other].rank;
    });
    panel.appendChild(el('p', 'nsub', 'Holds the same companies as ' + plural(list.length, 'person', 'people') + '.'));
    list.forEach(function(x){
      var row = el('div', 'nsnb'), h = el('div', 'nsnbh');
      var b = el('button', 'nslink', nodeBy[x.other].name);
      b.type = 'button';
      b.setAttribute('aria-label', 'Show ' + nodeBy[x.other].name + ' in the network');
      b.addEventListener('click', function(){ select(x.other, true); });
      h.appendChild(b);
      h.appendChild(el('span', 'nscount', plural(x.weight, 'shared', 'shared')));
      row.appendChild(h);
      row.appendChild(companyList(x.edge, n));
      panel.appendChild(row);
    });
  }

  function paint(){
    var act = hot || selected;
    var nb = {};
    if (act) (adj[act] || []).forEach(function(x){ nb[x.other] = true; });
    G.nodes.forEach(function(n){
      var g = nodeEls[n.slug];
      var cls = 'nnode';
      if (n.slug === selected) cls += ' sel';
      if (n.slug === hot) cls += ' hot';
      if (act && nb[n.slug]) cls += ' nb';
      if (act && n.slug !== act && !nb[n.slug]) cls += ' off';
      g.setAttribute('class', cls);
      g.setAttribute('aria-pressed', n.slug === selected ? 'true' : 'false');
    });
    edgeEls.forEach(function(x){
      var cls = 'nedge';
      if (act) cls += (x.e.a === act || x.e.b === act) ? ' on' : ' off';
      x.line.setAttribute('class', cls);
    });
    renderPanel();
  }
  function setHot(slug){ if (hot === slug) return; hot = slug; paint(); }
  function select(slug, focus){
    selected = slug && nodeBy[slug] ? slug : null;
    hot = null;
    try {
      if (window.history && window.history.replaceState) window.history.replaceState(null, '', selected ? '#p=' + encodeURIComponent(selected) : location.pathname + location.search);
    } catch(e){}
    paint();
    live.textContent = selected ? nodeBy[selected].name + ' selected. ' + plural((adj[selected] || []).length, 'connection', 'connections') + ' shown in the panel.' : 'Selection cleared.';
    if (focus && selected && nodeEls[selected]){
      try { nodeEls[selected].focus({ preventScroll: true }); } catch(e){ nodeEls[selected].focus(); }
      var box = svgEl.parentNode, n = nodeBy[selected];
      // bring the node into view inside the scrollable map (narrow screens)
      var scale = svgEl.getBoundingClientRect().width / G.viewBox[2];
      if (box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, n.x * scale - box.clientWidth / 2);
    }
  }

  function build(){
    var vb = arr(G.viewBox).length === 4 ? G.viewBox : [0, 0, 1000, 720];
    G.viewBox = vb;
    G.nodes.forEach(function(n){ nodeBy[n.slug] = n; adj[n.slug] = []; });
    G.edges = arr(G.edges).filter(function(e){ return nodeBy[e.a] && nodeBy[e.b]; });
    G.edges.forEach(function(e){
      adj[e.a].push({ other: e.b, weight: e.weight, edge: e });
      adj[e.b].push({ other: e.a, weight: e.weight, edge: e });
    });

    body.innerHTML = '';
    // search
    var intro = el('div', 't4intro');
    var f = el('div', 't4field');
    var lab = el('label', null, 'Find a person'); lab.htmlFor = 'netq';
    var inp = el('input', 't4input'); inp.id = 'netq'; inp.type = 'search'; inp.setAttribute('list', 'netnames'); inp.autocomplete = 'off';
    inp.placeholder = 'Type a name';
    var dl = el('datalist'); dl.id = 'netnames';
    G.nodes.forEach(function(n){ var o = el('option'); o.value = n.name; dl.appendChild(o); });
    f.appendChild(lab); f.appendChild(inp); f.appendChild(dl);
    intro.appendChild(f);
    var clear = el('button', 't4btn', 'Clear selection'); clear.type = 'button';
    clear.addEventListener('click', function(){ select(null); });
    intro.appendChild(clear);
    body.appendChild(intro);
    var msg = el('p', 't4msg'); msg.setAttribute('aria-live', 'polite');
    body.appendChild(msg);
    function find(){
      var q = BD.norm(inp.value);
      if (!q){ msg.textContent = ''; return; }
      var hit = null;
      for (var i = 0; i < G.nodes.length && !hit; i++){ if (BD.norm(G.nodes[i].name) === q) hit = G.nodes[i]; }
      for (var j = 0; j < G.nodes.length && !hit; j++){ if (BD.norm(G.nodes[j].name).indexOf(q) >= 0) hit = G.nodes[j]; }
      if (hit){ msg.textContent = ''; select(hit.slug, true); }
      else {
        var ip = BD.getPeople() ? (BD.indexByName(inp.value) || null) : null;
        msg.textContent = ip ? ip.name + ' has no holdings in common with others in their profile, so they are not on the map.' : 'No match on the map. Only people who share a holding with someone else appear here.';
      }
    }
    inp.addEventListener('change', find);
    inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); find(); } });

    var grid = el('div', 'netgrid');
    var left = el('div');
    var box = el('div', 'netbox');
    svgEl = sv('svg', { viewBox: vb.join(' '), role: 'group', 'aria-label': 'Network of ' + G.nodes.length + ' people linked by shared holdings. Tab through people in rank order.' });
    var defs = sv('defs', {});
    var seen = {};
    G.nodes.forEach(function(n){
      var key = BD.sectorSlug(n.sector);
      if (seen[key]) return;
      seen[key] = true;
      var p = sv('pattern', { id: 'pl-' + key, patternContentUnits: 'objectBoundingBox', width: 1, height: 1 });
      var im = sv('image', { width: 1, height: 1, preserveAspectRatio: 'xMidYMid slice' });
      im.setAttribute('href', BD.sectorArt(n.sector));
      im.setAttributeNS(XLINK, 'xlink:href', BD.sectorArt(n.sector));
      p.appendChild(sv('rect', { width: 1, height: 1, fill: '#0F100D' }));
      p.appendChild(im);
      defs.appendChild(p);
    });
    svgEl.appendChild(defs);
    var ge = sv('g', { 'aria-hidden': 'true' });
    G.edges.slice().reverse().forEach(function(e){
      var a = nodeBy[e.a], b = nodeBy[e.b];
      var line = sv('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'stroke-width': Math.min(9, 1 + (e.weight - 1) * 0.9), 'class': 'nedge' });
      ge.appendChild(line);
      edgeEls.push({ e: e, line: line });
    });
    svgEl.appendChild(ge);
    var gn = sv('g', {});
    // DOM (and tab) order follows rank; draw big circles first so small ones stay clickable on top
    var order = G.nodes.slice().sort(function(x, y){ return (x.rank || 999) - (y.rank || 999); });
    order.forEach(function(n){
      var r = +n.r || 8;
      var g = sv('g', { 'class': 'nnode', transform: 'translate(' + n.x + ' ' + n.y + ')', tabindex: '0', role: 'button', 'aria-pressed': 'false' });
      g.setAttribute('aria-label', n.name + ', number ' + n.rank + ', ' + (n.worthText || '') + '. Shares companies with ' + plural(adj[n.slug].length, 'person', 'people') + '.');
      var t = sv('title', {}); t.textContent = n.name + ' · ' + plural(adj[n.slug].length, 'link', 'links');
      g.appendChild(t);
      g.appendChild(sv('circle', { 'class': 'nring', r: r + 3.5 }));
      g.appendChild(sv('circle', { 'class': 'nplate', r: r, fill: 'url(#pl-' + BD.sectorSlug(n.sector) + ')' }));
      var ini = sv('text', { 'class': 'nini', 'font-size': Math.max(8, Math.round(r * 0.72)) });
      ini.textContent = BD.initials(n.name);
      g.appendChild(ini);
      var nm = sv('text', { 'class': 'nname', y: r + 14 });
      nm.textContent = shortName(n.name);
      g.appendChild(nm);
      g.addEventListener('mouseenter', function(){ setHot(n.slug); });
      g.addEventListener('mouseleave', function(){ setHot(null); });
      g.addEventListener('focus', function(){ setHot(n.slug); });
      g.addEventListener('blur', function(){ setHot(null); });
      g.addEventListener('click', function(){ select(selected === n.slug ? null : n.slug); });
      g.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(n.slug); }
        else if (e.key === 'Escape'){ select(null); }
      });
      nodeEls[n.slug] = g;
      gn.appendChild(g);
    });
    svgEl.appendChild(gn);
    box.appendChild(svgEl);
    left.appendChild(box);
    var leg = el('div', 'netlegend');
    leg.appendChild(el('span', null, 'Circle size: net worth'));
    leg.appendChild(el('span', null, 'Line thickness: companies in common'));
    leg.appendChild(el('span', null, 'Circle art: sector'));
    leg.appendChild(el('span', null, plural(G.nodes.length, 'person', 'people') + ' · ' + plural(G.edges.length, 'link', 'links')));
    left.appendChild(leg);
    if (G.rule) left.appendChild(el('p', 't4note', 'How links are made: ' + G.rule + ' A company is shown as "named in a private deal" when only the deal text mentions it; a deal can be a purchase, a funding round or an agreement.'));
    grid.appendChild(left);
    panel = el('aside', 'netside'); panel.setAttribute('aria-label', 'Selected person');
    grid.appendChild(panel);
    body.appendChild(grid);
    live = el('div', 't4sr'); live.setAttribute('aria-live', 'polite');
    body.appendChild(live);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && selected && document.activeElement === document.body) select(null); });

    // accessible list view
    var det = el('details', 'netlist');
    det.appendChild(el('summary', null, 'View as list (' + plural(G.edges.length, 'pair', 'pairs') + ', most in common first)'));
    var built = false;
    det.addEventListener('toggle', function(){
      if (!det.open || built) return;
      built = true;
      var ol = el('ol', 'pairs');
      G.edges.forEach(function(e){
        var li = el('li'), ph = el('div', 'ph');
        var a1 = el('a', null, nodeBy[e.a].name); a1.href = personHref(e.a);
        var a2 = el('a', null, nodeBy[e.b].name); a2.href = personHref(e.b);
        var b = el('b'); b.appendChild(a1); b.appendChild(document.createTextNode(' and ')); b.appendChild(a2);
        ph.appendChild(b);
        ph.appendChild(el('span', 'nscount', plural(e.weight, 'company', 'companies') + ' in common'));
        li.appendChild(ph);
        li.appendChild(companyList(e, null));
        ol.appendChild(li);
      });
      det.appendChild(ol);
    });
    body.appendChild(det);

    var m = /[#&]p=([^&]+)/.exec(location.hash || '');
    var start = m ? decodeURIComponent(m[1]) : null;
    if (start && nodeBy[start]) select(start); else paint();
  }

  Promise.all([BD.getJson('data/network/graph.json'), BD.loadPeople().catch(function(){ return null; })]).then(function(res){
    G = res[0] || {};
    G.nodes = arr(G.nodes).filter(function(n){ return n && n.slug && isFinite(n.x) && isFinite(n.y); });
    if (!G.nodes.length){ body.innerHTML = ''; body.appendChild(el('p', 't4msg', 'No shared holdings to show yet.')); return; }
    var up = document.getElementById('updated');
    var iso = BD.isoOf(G.asOf);
    if (up && iso) up.textContent = 'Profiles as of ' + BD.fmtDate(iso);
    build();
  }).catch(function(){
    body.innerHTML = '';
    body.appendChild(el('p', 't4msg', 'The network could not be loaded. Please try again later.'));
  });
})();
