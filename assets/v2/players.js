/* Billionaires Digest v2: Players (players.html), the draftable pool as a scouting list. ES5, UI only.
   Roster state and rules come from BDFantasyStore (assets/v2/fantasy-store.js): "+ Add" / "Selected" use the same
   store actions as the Draft room, so picks stay in sync. Sorting, search and sector rank: BDPlayersCore
   (assets/v2/players-core.js). Real data only. Game only: play money, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, P = window.BDPlayersCore;
  var el = BD.el, arr = BD.arr, fmt = F.fmt;
  var MINUS = '−';
  var FKEY = 'bd-v2-players-filters';
  var $ = function(id){ return document.getElementById(id); };

  var UI = { q: '', sector: '', sort: 'pts' };
  try { var saved = JSON.parse(sessionStorage.getItem(FKEY) || 'null'); if (saved){ UI.q = saved.q || ''; UI.sector = saved.sector || ''; UI.sort = saved.sort || 'pts'; } } catch (e) {}
  // a link from a player page (players.html?sector=...) or a shared search (?q=...) wins over the kept filters
  (function(){
    var s = location.search || '', m;
    if ((m = /[?&]sector=([^&]*)/.exec(s))){ try { UI.sector = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) {} UI.q = ''; }
    if ((m = /[?&]q=([^&]*)/.exec(s))){ try { UI.q = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) {} }
  })();
  function keepFilters(){ try { sessionStorage.setItem(FKEY, JSON.stringify({ q: UI.q, sector: UI.sector, sort: UI.sort })); } catch (e) {} }

  // ---- helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function sr(text){ return el('span', 'v2-sr', text); }
  function say(t){ var n = $('live'); n.textContent = ''; setTimeout(function(){ n.textContent = t; }, 30); }
  function playerHref(slug){ return 'player.html?p=' + encodeURIComponent(slug); }
  function avatar(p){
    var a = el('span', 'v2-av', BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function pool(){ return arr(F.state.draftWk && F.state.draftWk.draftable); }
  function sal(slug){ var s = F.salaries()[slug]; return typeof s === 'number' ? s : null; }
  function weekPts(slug){ return F.weekPoints(F.state.sbWk, slug); }
  function avgPts(slug){ var a = F.stat(slug).avg; return typeof a === 'number' ? Math.round(a) : null; }
  // "In your team": in the team saved for the draft week, or in the team scoring now
  function teamSlugs(){
    var S = F.state, out = {};
    var saved = F.savedTeam();
    if (saved) arr(saved.picks).forEach(function(s){ out[s] = 1; });
    var live = S.sbWk ? F.matchTeam(S.sbWk) : null;
    if (live) arr(live.picks).forEach(function(s){ out[s] = 1; });
    return out;
  }

  // ---- head, notices, your draft ----
  function renderHead(){
    var S = F.state;
    $('weekpill').textContent = C.isPractice(S.draftWeek) ? 'Practice / Week of ' + fmt.shortDate(C.weekMonday(S.draftWeek)) : fmt.weekTitle(S.draftWeek);
  }
  function renderNotices(){
    var S = F.state, box = clear($('notices'));
    if (S.salaryFallback) box.appendChild(el('p', 'v2-banner dr-notice', 'Cap costs for ' + fmt.weekName(S.draftWeek) + ' are not out yet, so these are this week\'s; they may change when the week opens.'));
    if (S.sbWk && S.sbWk.practice) box.appendChild(el('p', 'dr-notice dr-notice--soft', 'Week points are from the practice week, scored on sample days so you can see how the game works.'));
  }
  function renderMine(){
    var S = F.state, box = clear($('mine')), n = S.picks.length, used = F.capUsed(), left = C.CAP - used;
    box.hidden = false;
    var p = el('p', 'pl-mine__txt');
    p.appendChild(el('strong', null, 'Your draft for ' + fmt.weekTitle(S.draftWeek) + ': '));
    var saved = F.savedTeam() && !F.dirty();
    p.appendChild(document.createTextNode(n + ' of ' + C.PICKS + ' picked, ' + (left < 0 ? 'over the cap by ' + Math.abs(left) : plainTxt(left) + ' cap left') + '.' + (saved ? ' Saved.' : (n ? ' Not saved yet.' : ''))));
    box.appendChild(p);
    box.appendChild(link('v2-btn v2-btn--ghost pl-mine__go', n ? 'Review and save in the Draft room' : 'Open the Draft room', 'draft.html'));
  }

  // ---- filters ----
  function renderSectors(){
    var have = {}, sel = $('sector');
    pool().forEach(function(p){ have[p.sector || 'Other'] = 1; });
    var list = BD.SECTORS.filter(function(s){ return have[s]; });
    Object.keys(have).forEach(function(s){ if (list.indexOf(s) < 0) list.push(s); });
    while (sel.options.length > 1) sel.remove(1);
    list.forEach(function(s){ var o = el('option', null, s); o.value = s; sel.appendChild(o); });
    if (list.indexOf(UI.sector) < 0) UI.sector = '';
    sel.value = UI.sector;
    $('sort').value = UI.sort;
    if ($('sort').value !== UI.sort){ UI.sort = 'pts'; $('sort').value = 'pts'; }
    $('q').value = UI.q;
  }
  function visible(){
    var list = pool().filter(function(p){ return (!UI.sector || (p.sector || 'Other') === UI.sector) && P.matches(p, UI.q); });
    return P.sortPlayers(list, UI.sort, { pts: weekPts, avg: function(s){ return F.stat(s).avg; }, cap: sal });
  }

  // ---- pool table ----
  function renderPool(){
    var S = F.state, body = clear($('pool')), list = visible(), all = pool(), mine = teamSlugs();
    var wkName = S.sbWk ? fmt.weekName(S.sbWk.week) : null;
    var ph = clear($('ptshead'));
    ph.appendChild(document.createTextNode('Week pts'));
    ph.title = wkName ? 'Points so far in ' + wkName : 'No scored week yet';
    ph.appendChild(sr(wkName ? ' (points so far in ' + wkName + ')' : ' (no scored week yet)'));
    var ah = clear($('avghead'));
    ah.appendChild(document.createTextNode('Avg/day'));
    ah.title = 'Average points per scored day, recent days';
    ah.appendChild(sr(' (average points per scored day, recent days)'));
    if (!list.length){
      var tr0 = el('tr'), td0 = el('td'); td0.colSpan = 6;
      var e = el('div', 'v2-empty');
      e.appendChild(el('p', null, 'No players match ' + (UI.q ? '"' + UI.q + '"' : 'this filter') + (UI.sector ? ' in ' + UI.sector : '') + '.'));
      var rb = btn('v2-btn v2-btn--ghost v2-btn--sm', 'Clear search and filters'); rb.setAttribute('data-reset', '1');
      e.appendChild(rb);
      td0.appendChild(e); tr0.appendChild(td0); body.appendChild(tr0);
    }
    list.forEach(function(p){
      var picked = S.picks.indexOf(p.slug) >= 0;
      var tr = el('tr', picked ? 'is-picked' : null);
      var tdP = el('td', 'dr-c-player');
      var pl = el('div', 'v2-player');
      pl.appendChild(avatar(p));
      var tx = el('div', 'v2-player__txt');
      tx.appendChild(link('v2-player__name', p.name, playerHref(p.slug)));
      var tk = P.tickers(p).slice(0, 2).join(' · ');
      tx.appendChild(el('span', 'v2-player__sub', (tk ? tk + ' / ' : '') + (p.sector || 'Other')));
      if (mine[p.slug]) tx.appendChild(el('span', 'pl-mark', 'In your team'));
      pl.appendChild(tx); tdP.appendChild(pl); tr.appendChild(tdP);
      var w = weekPts(p.slug);
      var tdW = el('td', 'n dr-c-pts' + (w == null ? '' : ' ' + numCls(w)), w == null ? '—' : signedTxt(w)); tdW.setAttribute('data-label', 'Week'); tr.appendChild(tdW);
      var a = avgPts(p.slug);
      var tdA = el('td', 'n pl-c-avg' + (a == null ? '' : ' ' + numCls(a)), a == null ? '—' : signedTxt(a)); tdA.setAttribute('data-label', 'Avg/day'); tr.appendChild(tdA);
      var s = sal(p.slug);
      var tdC = el('td', 'n dr-c-cap', s == null ? '—' : String(s)); tdC.setAttribute('data-label', 'Cap'); tr.appendChild(tdC);
      var tdR = el('td', 'n pl-c-rank', typeof p.rank === 'number' ? 'No. ' + p.rank : '—'); tdR.setAttribute('data-label', 'Forbes'); tr.appendChild(tdR);
      var tdS = el('td', 'dr-c-status');
      var b;
      if (picked){
        b = btn('v2-btn v2-btn--selected dr-pick', 'Selected');
        b.setAttribute('aria-pressed', 'true');
        b.setAttribute('aria-label', p.name + ': selected. Press to remove.');
        b.appendChild(el('span', 'dr-pick__hint', 'Remove'));
      } else {
        var why = s == null ? 'Not draftable this week' : F.blockReason(p.slug);
        b = btn('v2-btn v2-btn--secondary dr-pick' + (why ? ' is-blocked' : ''), '+ Add');
        b.setAttribute('aria-pressed', 'false');
        if (why){ b.setAttribute('aria-disabled', 'true'); b.title = why; b.setAttribute('aria-label', 'Add ' + p.name + ': ' + why); b.setAttribute('data-why', why); }
        else b.setAttribute('aria-label', 'Add ' + p.name + (s != null ? ', cap ' + s : ''));
        if (why && /^Over/.test(why)) tdS.appendChild(el('small', 'dr-why', why));
      }
      b.setAttribute('data-pick', p.slug);
      tdS.insertBefore(b, tdS.firstChild);
      tr.appendChild(tdS);
      body.appendChild(tr);
    });
    var method = S.draftWk && S.draftWk.salaryMethod;
    $('poolfoot').textContent = 'Showing ' + list.length + ' of ' + all.length + ' players · Cap costs: ' + (method || 'set by Forbes rank') + ' · Forbes rank: Forbes Real-Time Billionaires';
    $('poolcap').textContent = 'Players you can draft for ' + fmt.weekName(S.draftWeek) + ', ' + list.length + ' shown';
  }
  function renderNotDraftable(){
    var nd = arr(F.state.index && F.state.index.notDraftable), d = $('notdraftable');
    if (!nd.length){ d.hidden = true; return; }
    $('ndsum').textContent = nd.length + (nd.length === 1 ? ' person can\'t' : ' people can\'t') + ' be drafted this week';
    var ul = clear($('ndlist'));
    nd.forEach(function(p){
      var li = el('li');
      var ip = BD.indexBySlug(p.slug);
      if (ip) li.appendChild(link(null, p.name, playerHref(p.slug)));
      else li.appendChild(el('span', null, p.name));
      li.appendChild(el('span', 'v2-small', ' · ' + (p.reason || 'Not draftable')));
      ul.appendChild(li);
    });
    d.hidden = false;
  }
  function renderAll(){ renderMine(); renderPool(); }

  // ---- actions (same store calls and words as the Draft room) ----
  function changeLine(prefix){
    var k = C.PICKS - F.state.picks.length, left = C.CAP - F.capUsed();
    return prefix + ' ' + (k ? k + (k === 1 ? ' spot' : ' spots') + ' left, ' : 'Lineup full, ') + plainTxt(left) + ' cap left.';
  }
  function focusPick(s){ var n = $('pool').querySelector('[data-pick="' + s + '"]'); if (n) n.focus(); }
  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    var s, r;
    if ((s = b.getAttribute('data-pick'))){
      if (b.getAttribute('aria-disabled') === 'true'){ say('Cannot add ' + F.person(s).name + ': ' + b.getAttribute('data-why') + '.'); return; }
      if (F.state.picks.indexOf(s) >= 0){ r = F.removePick(s); if (r.ok) say(changeLine('Removed ' + F.person(s).name + '.')); }
      else { r = F.addPick(s); if (r.ok) say(changeLine('Added ' + F.person(s).name + '.') + (F.state.captain === s ? ' Captain.' : '') + ' Save your team in the Draft room.'); }
      focusPick(s);
      return;
    }
    if (b.hasAttribute('data-reset')){
      UI.q = ''; UI.sector = ''; keepFilters(); $('q').value = ''; $('sector').value = ''; renderPool(); $('q').focus();
    }
  });
  var qt = null;
  $('q').addEventListener('input', function(){ var v = this.value; clearTimeout(qt); qt = setTimeout(function(){ UI.q = v; keepFilters(); renderPool(); }, 120); });
  $('sector').addEventListener('change', function(){ UI.sector = this.value; keepFilters(); renderPool(); });
  $('sort').addEventListener('change', function(){ UI.sort = this.value; keepFilters(); renderPool(); });

  F.onChange(function(kind){ if (F.state.loaded && (kind === 'roster' || kind === 'saved')) renderAll(); });

  // ---- load ----
  function fail(){
    $('weekpill').textContent = 'Data unavailable';
    var body = clear($('pool')), tr = el('tr'), td = el('td'); td.colSpan = 6;
    td.appendChild(el('p', 'v2-msg v2-msg--bad', 'The player pool is not available right now. Try again later.'));
    var rb = btn('v2-btn v2-btn--ghost v2-btn--sm', 'Try again'); rb.addEventListener('click', function(){ location.reload(); });
    td.appendChild(rb); tr.appendChild(td); body.appendChild(tr);
    say('The player pool is not available right now.');
  }
  if (F.testClock() != null){ var tcb = $('testclock'); tcb.hidden = false; tcb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }
  var people = BD.loadPeople().then(null, function(){ return null; });
  F.init().then(function(){
    if (!F.state.draftWk){ fail(); return; }
    renderHead(); renderNotices(); renderSectors(); renderAll();
    people.then(renderNotDraftable);
  }, function(err){ if (window.console) console.warn(err); fail(); });
})();
