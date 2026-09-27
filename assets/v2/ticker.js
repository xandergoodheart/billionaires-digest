/* Billionaires Digest v3: scores ticker (the dark strip at the very top of every page). ES5, IIFE, no globals.
   Markup: an empty <div class="v2-ticker" data-ticker hidden> from scripts/lib/nav.mjs renderTopbarV2; this script is
   loaded (deferred) by renderFooterV2, so top-level and generated pages both get it.
   Real data only:
     matchups <- The Book's latest week (data/book/index.json -> data/book/<week>.json), events of type "h2h"
     points   <- the fantasy week file (data/fantasy/weeks/<week>.json): each person's week total so far
     groups   <- both people in the same sector: that sector ("AI & TECH", "FINANCE" …); otherwise "Head to head"
   Status per cell: before the lock "Mon 9:30 AM ET" with the moneyline odds; scored days "Live · Wed" with points
   (leader bold); week final "Final" with points (winner bold). Nothing loads -> the strip stays hidden.
   The user scrolls the row sideways; it never moves by itself. Links go to The Book. Play money, no prizes. */
(function(){
  var box = document.querySelector('[data-ticker]');
  if (!box || !window.fetch || !window.Promise) return;

  // site root from this script's own src (works for relative and absolute page links)
  var me = document.currentScript || (function(){ var s = document.querySelectorAll('script[src*="assets/v2/ticker.js"]'); return s[s.length - 1]; })();
  var root = me && me.src ? me.src.replace(/assets\/v2\/ticker\.js(?:[?#].*)?$/, '') : '/';
  var MINUS = '−';
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function get(path){
    return fetch(root + path, { cache: 'no-cache' }).then(function(r){ if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); });
  }
  function el(tag, cls, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function surname(name){
    var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').trim().split(/\s+/);
    return ws[ws.length - 1] || '';
  }
  function nameOf(model, slug){
    var m = model && model[slug];
    if (m && m.name) return m.name;
    return String(slug || '').replace(/-family$/, '').split('-').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }
  function nyFmt(ms, opts){
    try { opts.timeZone = 'America/New_York'; return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)); }
    catch (e) { return ''; }
  }
  function lockText(ms){
    var d = nyFmt(ms, { weekday: 'short' }), t = nyFmt(ms, { hour: 'numeric', minute: '2-digit' });
    return d && t ? d + ' ' + t + ' ET' : 'Opens soon';
  }
  function dayName(iso){
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    return DAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  }
  function odds(n){ n = Number(n); if (!isFinite(n)) return ''; return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : 'EVEN'); }
  function pts(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function sectorLabel(s){ return String(s || '').toUpperCase(); }

  function build(book, wk){
    var model = book.model || {};
    var h2h = (book.events || []).filter(function(e){ return e && e.type === 'h2h' && e.params && e.params.a && e.params.b; });
    if (!h2h.length) return false;
    var lockAt = Date.parse(book.locksAt);
    var now = Date.now();
    var days = wk && wk.days && wk.days.length ? wk.days : [];
    var state = wk && wk.final ? 'final' : (days.length ? 'live' : (isFinite(lockAt) && now < lockAt ? 'pre' : 'open'));
    var totals = (wk && wk.totals) || {};
    var status = state === 'final' ? 'Final' : state === 'live' ? 'Live · ' + dayName(days[days.length - 1]) :
      state === 'pre' ? lockText(lockAt) : 'Live · first scores after the close';

    // groups in first-seen order
    var groups = [], byKey = {};
    h2h.forEach(function(e){
      var sa = model[e.params.a] && model[e.params.a].sector, sb = model[e.params.b] && model[e.params.b].sector;
      var key = sa && sa === sb ? sectorLabel(sa) : 'HEAD TO HEAD';
      if (!byKey[key]){ byKey[key] = { label: key, items: [] }; groups.push(byKey[key]); }
      byKey[key].items.push(e);
    });

    var inner = el('div', 'v2-ticker__in');
    var lead = el('a', 'v2-ticker__lead');
    lead.href = root + 'book.html';
    lead.appendChild(el('span', null, 'This week'));
    lead.appendChild(el('strong', null, 'Matchups'));
    inner.appendChild(lead);

    var row = el('ul', 'v2-ticker__row');
    row.setAttribute('aria-label', "This week's head-to-head matchups");
    groups.forEach(function(g){
      var lg = el('li');
      lg.setAttribute('aria-hidden', 'true');
      lg.appendChild(el('span', 'v2-ticker__lg', g.label));
      row.appendChild(lg);
      g.items.forEach(function(e){
        var li = el('li');
        var a = el('a', 'v2-ticker__g');
        a.href = root + 'book.html';
        var sides = [e.params.a, e.params.b].map(function(slug){
          var ml = (e.selections || []).filter(function(s){ return s.market === 'ml' && s.person === slug; })[0];
          return { slug: slug, name: nameOf(model, slug), pts: typeof totals[slug] === 'number' ? totals[slug] : null, odds: ml ? ml.americanOdds : null };
        });
        var scored = state === 'final' || state === 'live';
        var win = null;
        if (scored && sides[0].pts != null && sides[1].pts != null && sides[0].pts !== sides[1].pts) win = sides[0].pts > sides[1].pts ? 0 : 1;
        a.appendChild(el('span', 'v2-ticker__st' + (state === 'live' ? ' is-live' : ''), status));
        var label = [];
        sides.forEach(function(s, i){
          var t = el('span', 'v2-ticker__t' + (win == null ? '' : (win === i ? ' is-win' : ' is-lose')));
          t.appendChild(el('span', 'v2-ticker__n', surname(s.name)));
          var v = scored ? (s.pts == null ? '—' : pts(s.pts)) : (s.odds == null ? '' : odds(s.odds));
          t.appendChild(el('span', 'v2-ticker__p', v));
          a.appendChild(t);
          label.push(s.name + (scored ? (s.pts == null ? ', no points yet' : ' ' + pts(s.pts) + ' points') : (s.odds == null ? '' : ', odds ' + odds(s.odds))));
        });
        a.setAttribute('aria-label', label.join(' versus ') + '. ' + (state === 'final' ? 'Final' + (win != null ? ', ' + sides[win].name + ' won' : '') :
          state === 'live' ? 'Live, scored through ' + dayName(days[days.length - 1]) : 'Starts ' + status) + '. Play money.');
        li.appendChild(a);
        row.appendChild(li);
      });
    });
    inner.appendChild(row);
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(inner);
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Scores ticker');
    box.hidden = false;
    return true;
  }

  get('data/book/index.json').then(function(idx){
    var week = idx && idx.latest;
    if (!week || !/^\d{4}-W\d{2}$/.test(week)) throw new Error('no week');
    return Promise.all([
      get('data/book/' + week + '.json'),
      get('data/fantasy/weeks/' + week + '.json').then(null, function(){ return null; })
    ]);
  }).then(function(r){ build(r[0], r[1]); }, function(){ /* no data: the strip stays hidden */ });
})();
