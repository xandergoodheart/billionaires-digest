/* property.html: reported real-estate deals grouped by region and area (data/property/areas.json).
   Area level only: the data file carries no addresses. ES5. */
(function(){
  BD.initTheme();
  var el = BD.el, arr = BD.arr, safeUrl = BD.safeUrl, plural = BD.plural, clip = BD.clip;
  var body = document.getElementById('body');

  function str(x){ return x == null ? '' : String(x).trim(); }
  function personHref(slug){ return 'people/' + encodeURIComponent(slug) + '/'; }
  function price(p){
    if (typeof p === 'number' && isFinite(p)){
      if (p >= 1e9) return '$' + (Math.round(p / 1e8) / 10) + 'B';
      if (p >= 1e6) return '$' + (Math.round(p / 1e5) / 10) + 'M';
      return '$' + Math.round(p).toLocaleString('en-US');
    }
    return clip(str(p), 48);
  }
  function when(x){
    var s = str(x);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return BD.fmtDate(s);
    if (/^\d{4}-\d{2}$/.test(s)) return BD.monYear(s);
    return clip(s, 48);
  }
  function regionKey(a){ return a.state ? a.state + ', United States' : a.country; }
  function regionId(label){ return 'r-' + BD.slug(label); }

  function entryRow(e, area){
    var li = el('li');
    var l1 = el('div', 'pe1');
    if (e.slug){ var a = el('a', 'who', e.person || e.slug); a.href = personHref(e.slug); l1.appendChild(a); }
    else l1.appendChild(el('span', 'who', e.person || ''));
    var pr = e.price != null && e.price !== '' ? price(e.price) : '';
    if (pr) l1.appendChild(el('span', 'serif', pr));
    li.appendChild(l1);
    if (str(e.type)) li.appendChild(el('div', 'pe2', clip(e.type, 220)));
    var l3 = el('div', 'pe3');
    if (str(e.place) && BD.norm(e.place) !== BD.norm(area)) l3.appendChild(el('span', null, 'Where: ' + clip(e.place, 120)));
    if (str(e.date)) l3.appendChild(el('span', null, 'When: ' + when(e.date)));
    var u = safeUrl(e.source);
    if (u){ var s = el('a', 't4src', 'Source ↗'); s.href = u; s.target = '_blank'; s.rel = 'noopener noreferrer'; l3.appendChild(s); }
    li.appendChild(l3);
    return li;
  }

  function areaBlock(a, max){
    var d = el('details', 'proparea');
    var sm = el('summary');
    sm.appendChild(el('span', 'an', a.area));
    sm.appendChild(el('span', 'ac', plural(a.count, 'deal', 'deals') + ' · ' + plural(a.people || 0, 'person', 'people')));
    var bar = el('span', 't4bar'); bar.setAttribute('aria-hidden', 'true');
    var i = el('i'); i.style.width = Math.max(4, Math.round(100 * a.count / max)) + '%';
    bar.appendChild(i); sm.appendChild(bar);
    d.appendChild(sm);
    var built = false;
    d.addEventListener('toggle', function(){
      if (!d.open || built) return;
      built = true;
      var ul = el('ul', 'propents');
      arr(a.entries).forEach(function(e){ ul.appendChild(entryRow(e, a.area)); });
      d.appendChild(ul);
    });
    return d;
  }

  function render(P){
    body.innerHTML = '';
    body.appendChild(el('p', 'privnote', P.privacy || 'We list reported deals at city or neighborhood level only. No addresses.'));
    var areas = arr(P.areas).filter(function(a){ return a && a.area && arr(a.entries).length; });
    if (!areas.length){ body.appendChild(el('p', 't4msg', 'No property deals reported yet.')); return; }
    var countries = arr(P.countries).filter(function(c){ return c.country !== 'Several places'; });
    var sum = el('div', 'propsum');
    [[P.total || 0, 'reported deals'], [areas.length, 'areas'], [countries.length, 'countries']].forEach(function(x){
      var s = el('span'); s.appendChild(el('b', null, String(x[0]))); s.appendChild(document.createTextNode(x[1])); sum.appendChild(s);
    });
    body.appendChild(sum);

    // jump links
    var regions = arr(P.regions);
    var nav = el('nav', 'chips'); nav.setAttribute('aria-label', 'Jump to a region with two or more deals');
    regions.forEach(function(r){
      if (r.count < 2) return;
      var a = el('a', 'chip', r.region + ' · ' + r.count);
      a.href = '#' + regionId(r.region);
      a.style.textDecoration = 'none';
      a.style.display = 'inline-flex'; a.style.alignItems = 'center';
      nav.appendChild(a);
    });
    body.appendChild(nav);

    var max = 1;
    areas.forEach(function(a){ if (a.count > max) max = a.count; });
    regions.forEach(function(r){
      var list = areas.filter(function(a){ return regionKey(a) === r.region; })
        .sort(function(x, y){ return y.count - x.count || x.area.localeCompare(y.area); });
      if (!list.length) return;
      var sec = el('section', 'propreg'); sec.id = regionId(r.region);
      var h = el('h2', 'serif', r.region);
      h.appendChild(el('span', null, plural(r.count, 'deal', 'deals') + ' · ' + plural(list.length, 'area', 'areas')));
      sec.appendChild(h);
      if (r.region === 'Several places') sec.appendChild(el('p', 't4note', 'Holdings reported across several places, or without one city or region.'));
      list.forEach(function(a){ sec.appendChild(areaBlock(a, max)); });
      body.appendChild(sec);
    });
    body.appendChild(el('p', 't4note', (P.source || '') + ' Prices are as reported (purchase, sale, asking or valuation, as the entry says). Some entries are sales, not purchases.'));
  }

  BD.getJson('data/property/areas.json').then(function(P){
    var up = document.getElementById('updated'), iso = BD.isoOf(P && P.asOf);
    if (up && iso) up.textContent = 'City and region level only · profiles as of ' + BD.fmtDate(iso);
    render(P || {});
  }).catch(function(){
    body.innerHTML = '';
    body.appendChild(el('p', 't4msg', 'Property data could not be loaded. Please try again later.'));
  });
})();
