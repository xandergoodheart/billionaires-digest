/* Billionaires Digest v2: Draft room (draft.html). ES5, UI only.
   All roster state and rules come from BDFantasyStore (assets/v2/fantasy-store.js), which keeps v1's storage,
   working draft, save and late-entry behavior. Real data only. Game only: play money, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore;
  var el = BD.el, arr = BD.arr, fmt = F.fmt;
  var MINUS = '−';
  var WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
  var FKEY = 'bd-v2-draft-filters';
  var $ = function(id){ return document.getElementById(id); };
  var mqPhone = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };

  var UI = { q: '', sector: '', sort: 'pts', saveMsg: null, syncMsg: null, code: '', codeMsg: null };
  try { var saved = JSON.parse(sessionStorage.getItem(FKEY) || 'null'); if (saved){ UI.q = saved.q || ''; UI.sector = saved.sector || ''; UI.sort = saved.sort || 'pts'; } } catch (e) {}
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
  function surname(name){ var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').trim().split(/\s+/); return ws[ws.length - 1] || ''; }
  function nyFmt(ms, opts){
    try { opts.timeZone = 'America/New_York'; return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)); }
    catch (e) { return new Date(ms).toUTCString(); }
  }
  function lockWhen(){ var ms = C.weekInfo(F.state.draftWeek).locksAt; return nyFmt(ms, { weekday: 'long' }) + ' ' + nyFmt(ms, { hour: 'numeric', minute: '2-digit' }) + ' ET'; }
  function tickerList(p){
    var seen = {}, out = [];
    arr(p.holdings).forEach(function(h){ if (h && h.ticker && !seen[h.ticker]){ seen[h.ticker] = 1; out.push(h.ticker); } });
    return out;
  }
  function avatar(p){
    var a = el('span', 'v2-av', BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function pool(){ return arr(F.state.draftWk && F.state.draftWk.draftable); }
  function sal(slug){ var s = F.salaries()[slug]; return typeof s === 'number' ? s : null; }
  function weekPts(slug){ return F.weekPoints(F.state.sbWk, slug); }
  function spotsLeft(){ return C.PICKS - F.state.picks.length; }

  // ---- roster status (shared by stats bar, panel, phone bar) ----
  function status(){
    var S = F.state, used = F.capUsed(), n = S.picks.length, saved = F.savedTeam(), dirty = F.dirty();
    var over = used - C.CAP;
    var st = { n: n, used: used, left: C.CAP - used, over: over > 0 ? over : 0, saved: !!saved && !dirty, valid: false, next: '', save: '' };
    if (st.over) { st.next = 'Over the cap by ' + st.over; st.save = 'Over the cap by ' + st.over; }
    else if (n < C.PICKS) { var k = C.PICKS - n; st.next = 'Next: pick ' + k + ' more player' + (k === 1 ? '' : 's'); st.save = 'Pick ' + k + ' more to save'; }
    else if (!S.captain) { st.next = 'Next: choose a captain'; st.save = 'Choose a captain to save'; }
    else if (st.saved) { st.next = 'Saved for ' + fmt.weekTitle(S.draftWeek); st.save = 'Saved'; st.valid = true; }
    else { st.next = 'Ready to save'; st.save = 'Save team'; st.valid = true; }
    return st;
  }
  function changeLine(prefix){
    var k = spotsLeft(), left = C.CAP - F.capUsed();
    return prefix + ' ' + (k ? k + (k === 1 ? ' spot' : ' spots') + ' left, ' : 'Lineup full, ') + plainTxt(left) + ' cap left.';
  }

  // ---- head, notices, stats ----
  function renderHead(){
    var S = F.state, pill = $('weekpill');
    pill.textContent = C.isPractice(S.draftWeek) ? 'Practice / Week of ' + fmt.shortDate(C.weekMonday(S.draftWeek)) : fmt.weekTitle(S.draftWeek);
  }
  function renderNotices(){
    var S = F.state, box = clear($('notices')), t = F.now();
    if (S.salaryFallback) box.appendChild(el('p', 'v2-banner dr-notice', 'Cap costs for ' + fmt.weekName(S.draftWeek) + ' are not out yet, so these are this week\'s; they may change when the week opens.'));
    if (C.isPractice(S.draftWeek)) box.appendChild(el('p', 'dr-notice dr-notice--soft', 'Practice week: your picks are scored on the sample days so you can see how the game works. Practice does not count in your season.'));
    // lock / late-entry note (v1 wording)
    var lw = C.lockedWeek(t), li = C.weekInfo(lw);
    if (t >= li.locksAt && C.nyDate(t) <= li.end && !C.isPractice(lw)){
      var mine = F.store().teams[lw], from = C.lateFrom(t);
      var p = el('p', 'dr-notice dr-notice--soft');
      p.appendChild(el('strong', null, fmt.weekTitle(lw) + ' is locked and live. '));
      p.appendChild(document.createTextNode('You are building for ' + fmt.weekName(S.draftWeek) + '. ' +
        (mine ? 'Your lineup for ' + fmt.weekName(lw) + ' is in: follow it on My team.' :
          (from ? 'Late entry: your first save also enters this week, scoring from ' + fmt.dayLabel(from) + '.' : 'No trading days are left this week for a late entry.'))));
      box.appendChild(p);
    }
  }
  function renderStats(){
    var st = status();
    $('st-sel').textContent = st.n + ' / ' + C.PICKS;
    var cap = clear($('st-cap'));
    cap.appendChild(document.createTextNode(st.used + ' / ' + C.CAP));
    cap.className = 'dr-stat__v num' + (st.over ? ' v2-neg' : '');
    if (st.over) cap.appendChild(el('small', 'dr-stat__over', 'over by ' + st.over));
    var rem = $('st-rem');
    rem.textContent = plainTxt(st.left);
    rem.className = 'dr-stat__v num' + (st.left < 0 ? ' v2-neg' : '');
    $('st-lock').textContent = lockWhen();
    var nx = $('st-next');
    nx.textContent = st.next;
    nx.className = 'dr-next' + (st.saved ? ' dr-next--ok' : '');
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
  function matches(p, q){
    if (!q) return true;
    var hay = [p.name, p.sector].concat(arr(p.holdings).map(function(h){ return (h.ticker || '') + ' ' + (h.name || ''); })).join(' ');
    var H = BD.norm(hay), words = BD.norm(q).split(' ');
    for (var i = 0; i < words.length; i++) if (words[i] && H.indexOf(words[i]) < 0) return false;
    return true;
  }
  function visible(){
    var list = pool().filter(function(p){ return (!UI.sector || (p.sector || 'Other') === UI.sector) && matches(p, UI.q); });
    function byName(a, b){ return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); }
    function byRank(a, b){ return (a.rank || 999) - (b.rank || 999); }
    var cmp = {
      pts: function(a, b){ var x = weekPts(a.slug), y = weekPts(b.slug); if (x == null && y == null) return byRank(a, b); if (x == null) return 1; if (y == null) return -1; return y - x || byRank(a, b); },
      capdesc: function(a, b){ return (sal(b.slug) || 0) - (sal(a.slug) || 0) || byRank(a, b); },
      capasc: function(a, b){ return (sal(a.slug) || 0) - (sal(b.slug) || 0) || byRank(a, b); },
      rank: byRank,
      name: byName
    }[UI.sort] || byRank;
    return list.slice().sort(cmp);
  }

  // ---- pool table ----
  function renderPool(){
    var S = F.state, body = clear($('pool')), list = visible(), all = pool();
    var wkName = S.sbWk ? fmt.weekName(S.sbWk.week) : null;
    var ph = clear($('ptshead'));
    ph.appendChild(document.createTextNode('Week pts'));
    ph.title = wkName ? 'Points so far in ' + wkName : 'No scored week yet';
    ph.appendChild(sr(wkName ? ' (points so far in ' + wkName + ')' : ' (no scored week yet)'));
    if (!list.length){
      var tr0 = el('tr'), td0 = el('td'); td0.colSpan = 4;
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
      tx.appendChild(link('v2-player__name', p.name, 'people/' + encodeURIComponent(p.slug) + '/'));
      var tk = tickerList(p).slice(0, 2).join(' · ');
      tx.appendChild(el('span', 'v2-player__sub', (tk ? tk + ' / ' : '') + (p.sector || 'Other')));
      pl.appendChild(tx); tdP.appendChild(pl); tr.appendChild(tdP);
      var w = weekPts(p.slug);
      var tdW = el('td', 'n dr-c-pts' + (w == null ? '' : ' ' + numCls(w)), w == null ? '—' : signedTxt(w)); tdW.setAttribute('data-label', 'Week'); tr.appendChild(tdW);
      var s = sal(p.slug);
      var tdC = el('td', 'n dr-c-cap', s == null ? '—' : String(s)); tdC.setAttribute('data-label', 'Cap'); tr.appendChild(tdC);
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
    $('poolfoot').textContent = 'Showing ' + list.length + ' of ' + all.length + ' players · Cap costs: ' + (method || 'set by Forbes rank');
    $('poolcap').textContent = 'Players you can draft for ' + fmt.weekName(S.draftWeek) + ', ' + list.length + ' shown';
  }
  function renderNotDraftable(){
    var nd = arr(F.state.index && F.state.index.notDraftable), d = $('notdraftable');
    if (!nd.length){ d.hidden = true; return; }
    $('ndsum').textContent = nd.length + (nd.length === 1 ? ' person can\'t' : ' people can\'t') + ' be drafted this week';
    var ul = clear($('ndlist'));
    nd.forEach(function(p){
      var li = el('li');
      li.appendChild(link(null, p.name, 'people/' + encodeURIComponent(p.slug) + '/'));
      li.appendChild(el('span', 'v2-small', ' · ' + (p.reason || 'Not draftable')));
      ul.appendChild(li);
    });
    d.hidden = false;
  }

  // ---- starting-five panel (rendered into the side column and the phone sheet) ----
  function orderedPicks(){ return F.state.picks.slice(); }
  function helperLine(){
    var S = F.state, k = spotsLeft(), cap = S.captain ? surname(F.person(S.captain).name) : null;
    var a = k === 0 ? 'Your five is set.' : WORDS[k] + (k === 1 ? ' spot' : ' spots') + ' left.';
    var b = cap ? ' ' + cap + ' is your captain.' : (S.picks.length ? ' Choose a captain.' : ' Your first pick becomes captain.');
    return a + b;
  }
  function renderPanel(box, withId){
    var S = F.state, st = status();
    clear(box);
    var h = el('h2', 'v2-h2 dr-panel__h', 'Your starting five'); h.tabIndex = -1;
    if (withId) h.id = 'fiveh';
    box.appendChild(h);
    box.appendChild(el('p', 'dr-panel__help', helperLine()));
    var ol = el('ol', 'dr-slots');
    var picks = orderedPicks();
    for (var i = 0; i < C.PICKS; i++){
      var slug = picks[i], li = el('li', 'dr-slot' + (slug ? '' : ' is-empty'));
      li.appendChild(el('span', 'dr-slot__n', (i < 9 ? '0' : '') + (i + 1)));
      if (!slug){ li.appendChild(el('span', 'dr-slot__name', 'Choose a player')); ol.appendChild(li); continue; }
      var p = F.person(slug), isC = slug === S.captain;
      var nm = el('span', 'dr-slot__name', p.name);
      li.appendChild(nm);
      if (isC){ var c = el('span', 'v2-badge-c', 'C'); c.title = 'Captain: scores 1.5 times'; c.appendChild(sr(' (captain)')); li.appendChild(c); }
      li.appendChild(el('span', 'dr-slot__sal num', sal(slug) == null ? '—' : String(sal(slug))));
      var acts = el('span', 'dr-slot__acts');
      var cb = btn('dr-mini' + (isC ? ' is-on' : ''), isC ? 'Captain' : 'Make captain');
      cb.setAttribute('aria-pressed', isC ? 'true' : 'false');
      cb.setAttribute('aria-label', 'Make ' + p.name + ' captain');
      cb.setAttribute('data-captain', slug);
      acts.appendChild(cb);
      var rb = btn('dr-mini dr-mini--x', 'Remove');
      rb.setAttribute('aria-label', 'Remove ' + p.name);
      rb.setAttribute('data-remove', slug);
      acts.appendChild(rb);
      li.appendChild(acts);
      ol.appendChild(li);
    }
    box.appendChild(ol);
    box.appendChild(el('p', 'dr-panel__rule', 'Captain scores ' + C.CAPTAIN_MULT + 'x'));
    // cap meter
    var cap = el('div', 'v2-cap dr-cap' + (st.over ? ' v2-cap--over' : ''));
    var row = el('div', 'v2-cap__row');
    row.appendChild(el('span', 'v2-label', 'Cap used'));
    row.appendChild(el('span', 'v2-cap__num', st.used + ' / ' + C.CAP + (st.over ? ' · over by ' + st.over : '')));
    cap.appendChild(row);
    var bar = el('div', 'v2-cap__bar'); bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', st.used + ' of ' + C.CAP + ' cap used' + (st.over ? ', over by ' + st.over : ''));
    var fill = el('div', 'v2-cap__fill'); fill.style.width = Math.min(100, Math.round(st.used / C.CAP * 100)) + '%';
    bar.appendChild(fill); cap.appendChild(bar); box.appendChild(cap);
    var proj = S.picks.length ? F.projection() : null;
    if (proj != null) box.appendChild(el('p', 'dr-panel__proj', 'Recent average: ' + plainTxt(proj) + ' pts/day (captain counted ' + C.CAPTAIN_MULT + 'x)'));
    var sb = btn('v2-btn v2-btn--primary v2-btn--block dr-save', st.save);
    sb.setAttribute('data-save', '1');
    if (!st.valid || st.saved) sb.disabled = true;
    if (st.saved) sb.className += ' is-saved';
    box.appendChild(sb);
    box.appendChild(el('p', 'dr-panel__small', C.PICKS + ' picks + captain + within cap'));
    if (UI.saveMsg){
      var m = el('div', 'dr-msg' + (UI.saveMsg.bad ? ' is-bad' : ''));
      m.appendChild(el('p', null, UI.saveMsg.text));
      if (UI.saveMsg.ok) m.appendChild(link('dr-msg__link', 'See My team', 'team.html'));
      box.appendChild(m);
    }
    renderSync(box);
    renderCode(box, withId ? 'side' : 'sheet');
  }
  // team code (v1: copy / paste your saved teams between browsers; same code format and messages)
  function renderCode(box, key){
    var sec = el('div', 'dr-code');
    var h = el('h3', 'dr-code__h', 'Team code'); h.id = 'codeh-' + key;
    sec.appendChild(h);
    sec.setAttribute('role', 'group'); sec.setAttribute('aria-labelledby', h.id);
    sec.appendChild(el('p', 'dr-panel__small', 'Your lineups live only in this browser. Copy the code and paste it on another device to bring them along.'));
    var cb = btn('dr-mini dr-code__copy', 'Copy team code'); cb.setAttribute('data-code-copy', '1');
    sec.appendChild(cb);
    var f = el('form', 'dr-code__form'); f.setAttribute('data-code-form', '1'); f.setAttribute('novalidate', '');
    var lab = el('label', 'dr-code__lab', 'Paste a team code'); lab.htmlFor = 'codein-' + key;
    f.appendChild(lab);
    var row = el('div', 'dr-code__row');
    var inp = el('input', 'v2-input dr-code__in'); inp.id = 'codein-' + key; inp.type = 'text';
    inp.autocomplete = 'off'; inp.spellcheck = false; inp.placeholder = 'BFL1.…'; inp.value = UI.code;
    inp.setAttribute('data-code-in', '1'); inp.setAttribute('autocapitalize', 'off');
    row.appendChild(inp);
    var lb = el('button', 'dr-mini dr-code__load', 'Load'); lb.type = 'submit';
    row.appendChild(lb);
    f.appendChild(row);
    sec.appendChild(f);
    if (UI.codeMsg) sec.appendChild(el('p', 'dr-code__msg' + (UI.codeMsg.bad ? ' is-bad' : ''), UI.codeMsg.text));
    box.appendChild(sec);
  }
  function codeMsg(scope, text, bad, sel){
    UI.codeMsg = { text: text, bad: !!bad };
    renderSide();
    say(text);
    if (scope && sel) focusSel(scope, sel);
  }
  function copyText(text, okMsg, scope){
    function fallback(){
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (ok) codeMsg(scope, okMsg, false, '[data-code-copy]');
      else { UI.codeMsg = { text: 'Copy this: ' + text, bad: false }; renderSide(); say('Copy failed. The text is shown below the buttons.'); focusSel(scope, '[data-code-in]'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ codeMsg(scope, okMsg, false, '[data-code-copy]'); }, fallback);
    } else fallback();
  }
  function renderSync(box){
    if (!F.onlinePlaying() || !F.savedTeam()) return;
    var S = F.state, line = el('p', 'dr-sync');
    if (F.busy()) line.textContent = 'Syncing to the online leaderboard…';
    else if (F.dirty()) line.textContent = 'Save your team to sync it online.';
    else if (F.isSynced(S.draftWeek)) line.textContent = 'Online leaderboard has this team.';
    else {
      line.appendChild(document.createTextNode('Not synced online yet. '));
      var b = btn('v2-link', 'Sync now'); b.setAttribute('data-sync', '1');
      b.setAttribute('aria-label', 'Sync this saved team to the online leaderboard');
      line.appendChild(b);
    }
    if (UI.syncMsg && UI.syncMsg.text){ box.appendChild(el('p', 'dr-sync' + (UI.syncMsg.bad ? ' is-bad' : ''), UI.syncMsg.text)); }
    box.appendChild(line);
  }
  function renderBar(){
    var st = status(), bar = $('teambar');
    bar.hidden = !F.state.loaded;
    $('barsum').textContent = st.n + ' of ' + C.PICKS + ' picked / ' + (st.over ? 'over the cap by ' + st.over : plainTxt(st.left) + ' cap left');
    $('barbtn').textContent = st.n < C.PICKS ? 'Review' : 'Finish';
  }
  function renderSide(){
    renderPanel($('sidepanel'), true);
    if (sheetOpen()) renderPanel($('sheetpanel'), false);
    renderBar();
  }
  function renderAll(){ renderStats(); renderPool(); renderSide(); }

  // ---- phone sheet: focus trap, Escape, return focus ----
  var sheetOpener = null;
  function sheetOpen(){ return !$('sheet').hidden; }
  function sheetFocusables(){
    var root = $('sheet').querySelector('.dr-sheet__panel');
    return Array.prototype.filter.call(root.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  function openSheet(){
    sheetOpener = document.activeElement;
    $('sheet').hidden = false;
    renderPanel($('sheetpanel'), false);
    document.documentElement.classList.add('v2-lock');
    $('barbtn').setAttribute('aria-expanded', 'true');
    var f = sheetFocusables();
    ($('sheetclose') || f[0]).focus();
  }
  function closeSheet(noFocus){
    if (!sheetOpen()) return;
    $('sheet').hidden = true;
    clear($('sheetpanel'));
    document.documentElement.classList.remove('v2-lock');
    $('barbtn').setAttribute('aria-expanded', 'false');
    if (!noFocus){ var back = sheetOpener && document.contains(sheetOpener) && sheetOpener.getClientRects().length ? sheetOpener : $('barbtn'); back.focus(); }
  }
  document.addEventListener('keydown', function(e){
    if (!sheetOpen()) return;
    if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    var f = sheetFocusables(), panel = $('sheet').querySelector('.dr-sheet__panel');
    if (!f.length){ e.preventDefault(); panel.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
  function onMq(){ if (!mqPhone.matches) closeSheet(true); }
  if (mqPhone.addEventListener) mqPhone.addEventListener('change', onMq); else if (mqPhone.addListener) mqPhone.addListener(onMq);

  // ---- actions ----
  function focusSel(scope, sel){
    var n = scope.querySelector(sel);
    if (n && !n.disabled){ n.focus(); return true; }
    return false;
  }
  function panelScope(from){ return from && from.closest && from.closest('#sheetpanel') ? $('sheetpanel') : $('sidepanel'); }
  function afterPanelRemove(scope){
    if (!focusSel(scope, '[data-remove]')){ var h = scope.querySelector('.dr-panel__h'); if (h) h.focus(); }
  }
  function doSave(from){
    var r = F.saveTeam();
    UI.syncMsg = null;
    UI.saveMsg = { ok: r.ok, bad: !r.ok || !r.persisted, text: r.text };
    renderStats(); renderSide(); renderNotices();
    say(r.text);
    var scope = panelScope(from);
    if (!focusSel(scope, '.dr-msg__link')) focusSel(scope, '.dr-panel__h');
    if (r.sync) r.sync.then(function(res){ if (res && res.text){ UI.syncMsg = res; renderSide(); say(res.text); } });
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    if (t === $('sheet')){ closeSheet(); return; }
    var b = t.closest ? t.closest('button') : null;
    if (!b) return;
    if (b.id === 'barbtn'){ openSheet(); return; }
    if (b.id === 'sheetclose'){ closeSheet(); return; }
    if (b.disabled) return;
    var s, r;
    if ((s = b.getAttribute('data-pick'))){
      if (b.getAttribute('aria-disabled') === 'true'){ say('Cannot add ' + F.person(s).name + ': ' + b.getAttribute('data-why') + '.'); return; }
      if (F.state.picks.indexOf(s) >= 0){ r = F.removePick(s); if (r.ok) say(changeLine('Removed ' + F.person(s).name + '.')); }
      else { r = F.addPick(s); if (r.ok) say(changeLine('Added ' + F.person(s).name + '.') + (F.state.captain === s ? ' Captain.' : '')); }
      UI.saveMsg = null;
      focusSel($('pool'), '[data-pick="' + s + '"]');
      return;
    }
    if ((s = b.getAttribute('data-captain'))){
      var sc = panelScope(b);
      r = F.setCaptain(s); if (r.ok){ UI.saveMsg = null; say(r.text); }
      focusSel(sc, '[data-captain="' + s + '"]');
      return;
    }
    if ((s = b.getAttribute('data-remove'))){
      var sr2 = panelScope(b);
      r = F.removePick(s); if (r.ok){ UI.saveMsg = null; say(changeLine('Removed ' + F.person(s).name + '.')); }
      afterPanelRemove(sr2);
      return;
    }
    if (b.hasAttribute('data-save')){ doSave(b); return; }
    if (b.hasAttribute('data-code-copy')){
      var cs = panelScope(b), ex = F.exportTeams();
      if (!ex.ok){ codeMsg(cs, ex.text, true, '[data-code-copy]'); return; }
      UI.code = ex.code;
      copyText(ex.code, 'Team code copied. It is also in the box below.', cs);
      return;
    }
    if (b.hasAttribute('data-sync')){
      var team = F.savedTeam();
      if (team) F.syncTeam(F.state.draftWeek, team).then(function(res){ UI.syncMsg = res; renderSide(); if (res && res.text) say(res.text); });
      return;
    }
    if (b.hasAttribute('data-reset')){
      UI.q = ''; UI.sector = ''; keepFilters(); $('q').value = ''; $('sector').value = ''; renderPool(); $('q').focus();
    }
  });
  document.addEventListener('input', function(e){ if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-code-in')) UI.code = e.target.value; });
  document.addEventListener('submit', function(e){
    var f = e.target;
    if (!f || !f.hasAttribute || !f.hasAttribute('data-code-form')) return;
    e.preventDefault();
    var scope = panelScope(f), inp = f.querySelector('[data-code-in]');
    UI.code = inp ? inp.value : UI.code;
    var r = F.importTeams(UI.code);
    if (r.ok){ UI.saveMsg = null; UI.syncMsg = null; renderNotices(); }
    codeMsg(scope, r.text, !r.ok, r.ok ? '.dr-code__load' : '[data-code-in]');
  });
  var qt = null;
  $('q').addEventListener('input', function(){ var v = this.value; clearTimeout(qt); qt = setTimeout(function(){ UI.q = v; keepFilters(); renderPool(); }, 120); });
  $('sector').addEventListener('change', function(){ UI.sector = this.value; keepFilters(); renderPool(); });
  $('sort').addEventListener('change', function(){ UI.sort = this.value; keepFilters(); renderPool(); });

  F.onChange(function(kind){
    if (!F.state.loaded) return;
    if (kind === 'roster'){ renderAll(); return; }
    if (kind === 'online' || kind === 'sync') renderSide();
  });

  // ---- load ----
  function fail(){
    $('weekpill').textContent = 'Data unavailable';
    var body = clear($('pool')), tr = el('tr'), td = el('td'); td.colSpan = 4;
    td.appendChild(el('p', 'v2-msg v2-msg--bad', 'The player pool is not available right now. Try again later.'));
    var rb = btn('v2-btn v2-btn--ghost v2-btn--sm', 'Try again'); rb.addEventListener('click', function(){ location.reload(); });
    td.appendChild(rb); tr.appendChild(td); body.appendChild(tr);
    clear($('sidepanel')).appendChild(el('p', 'dr-panel__help', 'Your team will show here when the game data loads.'));
    say('The player pool is not available right now.');
  }
  if (F.testClock() != null){ var tcb = $('testclock'); tcb.hidden = false; tcb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }
  F.init().then(function(){
    if (!F.state.draftWk){ fail(); return; }
    renderHead(); renderNotices(); renderSectors(); renderNotDraftable(); renderAll();
    document.body.classList.add('dr-ready');
  }, function(err){ if (window.console) console.warn(err); fail(); });
})();
