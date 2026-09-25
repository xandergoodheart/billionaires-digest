/* Billionaires Digest: calendar.html. ES5. Reads data/insights/calendar.json and planned-sales.json. */
(function(){
  BD.initTheme();
  var el = BD.el, arr = BD.arr, safeUrl = BD.safeUrl, MONTHS = BD.MONTHS;

  var TYPES = [
    { key: 'all', label: 'All' },
    { key: 'sales', label: 'Planned sales' },
    { key: 'events', label: 'Earnings & events' },
    { key: 'deals', label: 'Deals & votes' }
  ];
  var TYPE_LABEL = { sales: 'Planned sale', events: 'Event', deals: 'Deal or vote' };
  var active = 'all';
  var cal = null;

  // webcal:// link for the current host (falls back to the site domain in the HTML)
  (function(){
    var a = document.getElementById('webcallink');
    if (!a || !/^https?:$/.test(location.protocol) || !location.host) return;
    var path = location.pathname.replace(/[^\/]*$/, '') + 'calendar.ics';
    a.href = 'webcal://' + location.host + path;
  })();

  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function isoLocal(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(iso, n){
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return isoLocal(d);
  }
  function mondayOf(iso){
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var dow = (d.getDay() + 6) % 7;
    return addDays(iso, -dow);
  }
  function dayLabel(iso){ return MONTHS[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)); }
  function monthLabel(iso){ return MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4); }

  function sourceLink(href, label){
    var u = safeUrl(href);
    if (!u) return null;
    var a = el('a', 'tsrc', (label || 'Source') + ' ↗');
    a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }

  function personLink(p){
    var ip = BD.indexBySlug(p.slug);
    var name = (ip && ip.name) || p.name || p.slug;
    var sector = (ip && ip.sector) || p.sector || 'Other';
    var node;
    if (p.slug){
      node = el('a', 'tperson');
      node.href = 'people/' + encodeURIComponent(p.slug) + '/';
    } else node = el('span', 'tperson');
    node.appendChild(BD.avatar({ name: name, sector: sector }, 32, 10));
    node.appendChild(el('span', 'tpname', name));
    return node;
  }

  function dateCell(e){
    var d = el('div', 'tdate');
    if (e.precision === 'month'){
      d.appendChild(el('span', 'approx', '≈ '));
      d.appendChild(document.createTextNode(monthLabel(e.date)));
    } else {
      if (e.approx) d.appendChild(el('span', 'approx', '≈ '));
      d.appendChild(document.createTextNode(dayLabel(e.date)));
    }
    if (e.approx) d.setAttribute('title', 'Approximate date');
    return d;
  }

  // ---- planned sales ----
  function renderPlanned(ps){
    var box = document.getElementById('plannedlist');
    var note = document.getElementById('plannednote');
    box.innerHTML = '';
    var sales = arr(ps && ps.sales);
    if (!ps){ box.appendChild(el('p', 'tempty', 'Planned-sale data is not available right now.')); return; }
    if (!sales.length){
      box.appendChild(el('p', 'tempty', 'No planned insider sales from the people we track with a sale date in the past week or ahead.'));
    } else {
      var ul = el('ul', 'trows');
      sales.forEach(function(s){
        var li = el('li', 'trow');
        var d = el('div', 'tdate');
        d.appendChild(el('span', 'approx', '≈ '));
        d.appendChild(document.createTextNode(dayLabel(s.date)));
        d.setAttribute('title', 'Approximate sale date from the Form 144');
        li.appendChild(d);
        var m = el('div', 'tmain');
        var names = arr(s.people).map(function(p){ var ip = BD.indexBySlug(p.slug); return (ip && ip.name) || p.name; }).join(' and ');
        var t = names + ' plans to sell ';
        t += typeof s.shares === 'number' ? BD.fmtShares(s.shares) + ' shares' : 'shares';
        if (s.issuer) t += ' of ' + s.issuer + (s.ticker ? ' (' + s.ticker + ')' : '');
        if (typeof s.value === 'number') t += ', worth about ' + BD.fmtUsd(s.value) + ' when filed';
        m.appendChild(el('p', 'ttitle', t));
        var meta = el('div', 'tmeta');
        arr(s.people).forEach(function(p){ meta.appendChild(personLink(p)); });
        meta.appendChild(el('span', 'ttype', 'Form 144'));
        if (s.securitiesClassTitle) meta.appendChild(el('span', null, s.securitiesClassTitle));
        if (arr(s.relationships).length) meta.appendChild(el('span', null, 'Role: ' + s.relationships.join(', ')));
        if (s.plan10b51AdoptedOn) meta.appendChild(el('span', null, 'Pre-set trading plan adopted ' + BD.fmtDate(s.plan10b51AdoptedOn)));
        if (s.filed) meta.appendChild(el('span', null, 'Filed ' + BD.fmtDate(s.filed)));
        var src = sourceLink(s.url, 'Form 144');
        if (src) meta.appendChild(src);
        m.appendChild(meta);
        li.appendChild(m);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    if (ps.note) note.textContent = ps.note + (sales.some(function(s){ return s.tickerSource; }) ? ' Tickers come from Form 4 filings for the same company; Form 144 itself does not list one.' : '');
  }

  // ---- events ----
  function groupOf(e, today){
    var thisMon = mondayOf(today);
    var nextMon = addDays(thisMon, 7);
    var afterNext = addDays(thisMon, 14);
    if (e.precision === 'month'){
      return (e.end && e.end < today) ? 'recent' : 'later';
    }
    if (e.date < today) return 'recent';
    if (e.date < nextMon) return 'this';
    if (e.date < afterNext) return 'next';
    return 'later';
  }

  function renderChips(){
    var box = document.getElementById('chips');
    box.innerHTML = '';
    var counts = { all: 0 };
    arr(cal && cal.events).forEach(function(e){ counts.all++; counts[e.type] = (counts[e.type] || 0) + 1; });
    TYPES.forEach(function(t){
      var b = el('button', 'chip', t.label + ' · ' + (counts[t.key] || 0));
      b.type = 'button';
      b.setAttribute('aria-pressed', active === t.key ? 'true' : 'false');
      b.addEventListener('click', function(){
        active = t.key;
        renderChips();
        renderEvents();
        var again = document.querySelector('#chips .chip[aria-pressed="true"]');
        if (again) again.focus();
      });
      box.appendChild(b);
    });
  }

  function renderEvents(){
    var box = document.getElementById('eventlist');
    box.innerHTML = '';
    if (!cal){ box.appendChild(el('p', 'tempty', 'The calendar is not available right now.')); return; }
    var today = isoLocal(new Date());
    var list = arr(cal.events).filter(function(e){ return active === 'all' || e.type === active; });
    var groups = { 'this': [], next: [], later: [], recent: [] };
    list.forEach(function(e){ groups[groupOf(e, today)].push(e); });
    groups.recent.reverse();
    var order = [['this', 'This week'], ['next', 'Next week'], ['later', 'Later'], ['recent', 'Recent']];
    var any = false;
    order.forEach(function(g){
      var items = groups[g[0]];
      if (!items.length) return;
      any = true;
      var h = el('h3', 'tgroup', g[1]);
      h.appendChild(el('span', 'cnt', String(items.length)));
      box.appendChild(h);
      var ul = el('ul', 'trows');
      items.forEach(function(e){
        var li = el('li', 'trow');
        li.appendChild(dateCell(e));
        var m = el('div', 'tmain');
        m.appendChild(el('p', 'ttitle', e.title));
        var meta = el('div', 'tmeta');
        arr(e.people).forEach(function(p){ meta.appendChild(personLink(p)); });
        meta.appendChild(el('span', 'ttype', TYPE_LABEL[e.type] || 'Event'));
        if (e.approx && e.when && e.when !== e.date) meta.appendChild(el('span', null, 'Date given as: ' + e.when));
        if (e.note) meta.appendChild(el('span', null, e.note));
        var src = sourceLink(e.source, e.sourceLabel);
        if (src) meta.appendChild(src);
        m.appendChild(meta);
        li.appendChild(m);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    });
    if (!any) box.appendChild(el('p', 'tempty', 'Nothing of this type in the window.'));
  }

  function fail(){ return null; }
  Promise.all([
    BD.loadPeople().catch(fail),
    BD.getJson('data/insights/calendar.json').catch(fail),
    BD.getJson('data/insights/planned-sales.json').catch(fail)
  ]).then(function(r){
    cal = r[1];
    renderPlanned(r[2]);
    renderChips();
    renderEvents();
    var note = document.getElementById('eventnote');
    if (cal && cal.note) note.textContent = cal.note;
    var up = document.getElementById('updated');
    if (cal && cal.generated) up.textContent = 'Updated ' + BD.fmtDate(cal.generated);
  });
})();
