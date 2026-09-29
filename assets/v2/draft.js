/* Billionaires Digest v3: Draft room (draft.html). ES5, UI only.
   All roster state and rules come from BDFantasyStore (assets/v2/fantasy-store.js), which keeps v1's storage,
   working draft, save and late-entry behavior. Pure helpers (value score, auto-fill, recent form, queue) live in
   BDDraftCore (assets/v2/draft-core.js, tested in node). ESPN-style extras: sector tabs, the player dossier pop-up
   (assets/v2/dossier.js, with this page's Add / Remove / Make captain / Queue actions),
   best value, a queue (watchlist, this browser only), cap meter, auto-fill and a recent-form sparkline.
   Real data only: numbers come from the fantasy week files, data/people/index.json and digest.json.
   Game only: play money, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, P = window.BDPlayersCore, DC = window.BDDraftCore;
  var el = BD.el, arr = BD.arr, fmt = F.fmt;
  var MINUS = '−';
  var WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
  var FKEY = 'bd-v2-draft-filters';
  var QKEY = 'bd-draft-queue-v1';
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function(id){ return document.getElementById(id); };
  var mqPhone = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };

  var UI = { q: '', sector: '', sort: 'pts', saveMsg: null, syncMsg: null, code: '', codeMsg: null, sheetTab: 'team' };
  try { var saved = JSON.parse(sessionStorage.getItem(FKEY) || 'null'); if (saved){ UI.q = saved.q || ''; UI.sector = saved.sector || ''; UI.sort = saved.sort || 'pts'; } } catch (e) {}
  function keepFilters(){ try { sessionStorage.setItem(FKEY, JSON.stringify({ q: UI.q, sector: UI.sector, sort: UI.sort })); } catch (e) {} }

  // ---- helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function txt(s){ return document.createTextNode(s); }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function sr(text){ return el('span', 'v2-sr', text); }
  function svgEl(tag, attrs, text){ var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; }
  function say(t){ var n = $('live'); n.textContent = ''; setTimeout(function(){ n.textContent = t; }, 30); }
  function surname(name){ var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').trim().split(/\s+/); return ws[ws.length - 1] || ''; }
  function visibleEl(n){ return !!n && document.contains(n) && n.getClientRects().length > 0; }
  function nyFmt(ms, opts){
    try { opts.timeZone = 'America/New_York'; return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)); }
    catch (e) { return new Date(ms).toUTCString(); }
  }
  function lockWhen(){ var ms = C.weekInfo(F.state.draftWeek).locksAt; return nyFmt(ms, { weekday: 'long' }) + ' ' + nyFmt(ms, { hour: 'numeric', minute: '2-digit' }) + ' ET'; }
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? u : null; }
  function portraitSrc(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? safePath(p.img) : safePath(window.BDPortraitFallback);
  }
  function avatar(p, cls){
    var pic = portraitSrc(p.slug);
    var a = el('span', 'v2-av' + (cls ? ' ' + cls : '') + (pic ? ' v2-av--pic' : ''), pic ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic){ var im = el('img'); im.src = pic; im.alt = ''; a.appendChild(im); }
    return a;
  }
  function pool(){ return arr(F.state.draftWk && F.state.draftWk.draftable); }
  function sal(slug){ var s = F.salaries()[slug]; return typeof s === 'number' ? s : null; }
  function weekPts(slug){ return F.weekPoints(F.state.sbWk, slug); }
  function avgOf(slug){ var a = F.stat(slug).avg; return typeof a === 'number' && isFinite(a) ? a : null; }
  function avgR(slug){ var a = avgOf(slug); return a == null ? null : Math.round(a); }
  function valOf(slug){ return DC.valueScore(avgOf(slug), weekPts(slug), sal(slug)); }
  function valNum(slug){ var v = valOf(slug); return v ? v.value : null; }
  function formOf(slug){ return DC.formSeries(F.state.sparkDates, F.stat(slug).series, 5); }
  function spotsLeft(){ return C.PICKS - F.state.picks.length; }
  function inPool(slug){ return pool().some(function(p){ return p.slug === slug; }); }
  function dayShort(d){ return fmt.DAYN[C.weekday(d)] + ' ' + (+d.slice(8, 10)); }
  function valTxt(v){ return (v.value < 0 ? MINUS : '') + Math.abs(v.value).toFixed(2); }
  var VALUE_RULE = 'Value = recent average points per day ÷ cap cost (week points ÷ cap cost when there is no recent average).';

  // ---- queue (watchlist): localStorage, this browser only ----
  var queue = [];
  function loadQueue(){
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { raw = []; }
    var known = {}; pool().forEach(function(p){ known[p.slug] = 1; });
    queue = DC.cleanQueue(raw, known);
  }
  function keepQueue(){ try { localStorage.setItem(QKEY, JSON.stringify(queue)); } catch (e) {} }
  function queued(slug){ return queue.indexOf(slug) >= 0; }
  function toggleQueue(slug){
    queue = DC.toggleQueue(queue, slug);
    keepQueue();
    return queued(slug);
  }
  var STAR = 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z';
  function starBtn(p, cls, withText){
    var on = queued(p.slug);
    var b = btn('dr-star' + (on ? ' is-on' : '') + (cls ? ' ' + cls : ''), null);
    var svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', 'class': 'dr-star__i' });
    svg.appendChild(svgEl('path', { d: STAR }));
    b.appendChild(svg);
    if (withText) b.appendChild(el('span', 'dr-star__t', on ? 'In your queue' : 'Add to queue'));
    if (!withText){ b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', 'Queue ' + p.name); }
    b.title = on ? 'In your queue (press to remove)' : 'Add to your queue';
    b.setAttribute('data-star', p.slug);
    return b;
  }

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
      p.appendChild(txt('You are building for ' + fmt.weekName(S.draftWeek) + '. ' +
        (mine ? 'Your lineup for ' + fmt.weekName(lw) + ' is in: follow it on My team.' :
          (from ? 'Late entry: your first save also enters this week, scoring from ' + fmt.dayLabel(from) + '.' : 'No trading days are left this week for a late entry.'))));
      box.appendChild(p);
    }
  }
  function renderStats(){
    var st = status();
    $('st-sel').textContent = st.n + ' / ' + C.PICKS;
    var cap = clear($('st-cap'));
    cap.appendChild(txt(st.used + ' / ' + C.CAP));
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

  // ---- sector tabs (ARIA tablist: arrow keys, Home / End; automatic activation) ----
  var sectorList = [];
  function tabId(s){ return 'sectab-' + (s ? BD.sectorSlug(s) : 'all'); }
  function renderSectors(){
    var have = {}, count = {}, box = clear($('sectabs'));
    pool().forEach(function(p){ var s = p.sector || 'Other'; have[s] = 1; count[s] = (count[s] || 0) + 1; });
    var list = BD.SECTORS.filter(function(s){ return have[s]; });
    Object.keys(have).forEach(function(s){ if (list.indexOf(s) < 0) list.push(s); });
    sectorList = [''].concat(list);
    if (list.indexOf(UI.sector) < 0) UI.sector = '';
    sectorList.forEach(function(s){
      var b = btn('dr-tab', s || 'All');
      b.id = tabId(s);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'poolpanel');
      b.setAttribute('data-sector', s);
      b.appendChild(el('span', 'dr-tab__n num', String(s ? count[s] : pool().length)));
      b.lastChild.setAttribute('aria-hidden', 'true');
      var cnt = s ? count[s] : pool().length;
      b.appendChild(sr(' (' + cnt + (cnt === 1 ? ' player)' : ' players)')));
      box.appendChild(b);
    });
    syncTabs(false);
    $('sort').value = UI.sort;
    if ($('sort').value !== UI.sort){ UI.sort = 'pts'; $('sort').value = 'pts'; }
    $('q').value = UI.q;
  }
  function syncTabs(focus){
    sectorList.forEach(function(s){
      var b = $(tabId(s)), on = s === UI.sector;
      if (!b) return;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
      if (on && b.scrollIntoView && b.parentNode.scrollWidth > b.parentNode.clientWidth){
        var par = b.parentNode, l = b.offsetLeft - par.offsetLeft, r = l + b.offsetWidth;
        if (l < par.scrollLeft) par.scrollLeft = l - 8;
        else if (r > par.scrollLeft + par.clientWidth) par.scrollLeft = r - par.clientWidth + 8;
      }
    });
    $('poolpanel').setAttribute('aria-labelledby', tabId(UI.sector));
  }
  function setSector(s, focus){
    UI.sector = s; keepFilters(); syncTabs(focus); renderPool();
  }
  $('sectabs').addEventListener('keydown', function(e){
    var i = sectorList.indexOf(UI.sector), j = null, n = sectorList.length;
    if (e.key === 'ArrowRight' || e.key === 'Right') j = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'Left') j = (i - 1 + n) % n;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j == null) return;
    e.preventDefault();
    setSector(sectorList[j], true);
  });

  // ---- filters + sort ----
  function visible(){
    var list = pool().filter(function(p){ return (!UI.sector || (p.sector || 'Other') === UI.sector) && P.matches(p, UI.q); });
    if (UI.sort === 'value') return P.sortPlayers(list, 'avg', { avg: valNum });
    return P.sortPlayers(list, UI.sort, { pts: weekPts, avg: avgOf, cap: sal });
  }

  // ---- recent form sparkline (same numbers as the player card chart) ----
  var sparkMax = 1;
  function computeSparkMax(){
    var m = 0;
    pool().forEach(function(p){ formOf(p.slug).forEach(function(x){ if (x.points != null && Math.abs(x.points) > m) m = Math.abs(x.points); }); });
    sparkMax = m || 1;
  }
  function formWords(series){
    return series.map(function(x){ return dayShort(x.date) + ' ' + (x.points == null ? 'no score' : signedTxt(x.points)); }).join(', ');
  }
  function spark(p){
    var series = formOf(p.slug);
    if (!series.length || !series.some(function(x){ return x.points != null; })){
      var e = el('span', 'dr-spark__none', '—');
      e.setAttribute('aria-hidden', 'true');
      var w0 = el('span', 'dr-spark'); w0.appendChild(e); w0.appendChild(sr('No scored days yet'));
      return w0;
    }
    var W = 62, H = 28, mid = H / 2, half = 12, slot = W / 5, bw = 8;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'class': 'dr-spark__svg', role: 'img', 'aria-label': 'Recent form: ' + formWords(series) + '.' });
    svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: mid, y2: mid, 'class': 'dr-spark__zero' }));
    var off = 5 - series.length;
    series.forEach(function(x, i){
      var cx = slot * (i + off) + slot / 2;
      if (x.points == null){ svg.appendChild(svgEl('rect', { x: cx - bw / 2, y: mid - 1, width: bw, height: 2, 'class': 'dr-spark__nil' })); return; }
      var h = Math.max(2, Math.abs(x.points) / sparkMax * half);
      svg.appendChild(svgEl('rect', { x: cx - bw / 2, y: x.points >= 0 ? mid - h : mid, width: bw, height: h, 'class': x.points > 0 ? 'dr-spark__pos' : (x.points < 0 ? 'dr-spark__neg' : 'dr-spark__nil') }));
    });
    var w = el('span', 'dr-spark'); w.appendChild(svg);
    return w;
  }

  // ---- pool table ----
  var COLS = 7;
  function renderPool(){
    var S = F.state, body = clear($('pool')), list = visible(), all = pool();
    var wkName = S.sbWk ? fmt.weekName(S.sbWk.week) : null;
    var ph = clear($('ptshead'));
    ph.appendChild(txt('Week pts'));
    ph.title = wkName ? 'Points so far in ' + wkName : 'No scored week yet';
    ph.appendChild(sr(wkName ? ' (points so far in ' + wkName + ')' : ' (no scored week yet)'));
    var ah = clear($('avghead'));
    ah.appendChild(txt('Avg'));
    ah.title = 'Recent average points per scored day';
    ah.appendChild(sr(' (recent average points per scored day)'));
    var fh = clear($('formhead'));
    fh.appendChild(txt('Form'));
    fh.title = 'Points on each of the last ' + S.sparkDates.length + ' scored days';
    fh.appendChild(sr(' (points on the last ' + S.sparkDates.length + ' scored days)'));
    computeSparkMax();
    var anyValue = all.some(function(p){ var v = valOf(p.slug); return v && v.value > 0; });
    var top = anyValue ? DC.topValue(list.map(function(p){ return { slug: p.slug, value: valNum(p.slug) }; }), 5) : [];
    if (!list.length){
      var tr0 = el('tr'), td0 = el('td'); td0.colSpan = COLS;
      var e = el('div', 'v2-empty');
      e.appendChild(el('p', null, 'No players match ' + (UI.q ? '"' + UI.q + '"' : 'this filter') + (UI.sector ? ' in ' + UI.sector : '') + '.'));
      var rb = btn('v2-btn v2-btn--ghost v2-btn--sm', 'Clear search and filters'); rb.setAttribute('data-reset', '1');
      e.appendChild(rb);
      td0.appendChild(e); tr0.appendChild(td0); body.appendChild(tr0);
    }
    list.forEach(function(p){
      var picked = S.picks.indexOf(p.slug) >= 0;
      var tr = el('tr', picked ? 'is-picked' : null);
      var tdQ = el('td', 'dr-c-q');
      tdQ.appendChild(starBtn(p));
      tr.appendChild(tdQ);
      var tdP = el('td', 'dr-c-player');
      var pl = el('div', 'v2-player');
      pl.appendChild(avatar(p));
      var tx = el('div', 'v2-player__txt');
      var nb = btn('v2-player__name dr-name', p.name);
      nb.setAttribute('data-card', p.slug);
      nb.setAttribute('aria-haspopup', 'dialog');
      nb.appendChild(sr(': open player dossier'));
      tx.appendChild(nb);
      var tk = P.tickers(p).slice(0, 2).join(' · ');
      var sub = el('span', 'v2-player__sub', (tk ? tk + ' / ' : '') + (p.sector || 'Other'));
      tx.appendChild(sub);
      var nk = window.BDDossier ? window.BDDossier.nickname(p.slug) : null;
      if (nk) tx.appendChild(el('span', 'v2-nick', nk));
      var ti = top.indexOf(p.slug);
      if (ti >= 0){
        var v = valOf(p.slug);
        var bdg = el('span', 'dr-valbadge', 'Value');
        bdg.title = 'No. ' + (ti + 1) + ' value in this view: ' + valTxt(v) + ' points per cap point. ' + VALUE_RULE;
        bdg.appendChild(sr(' (number ' + (ti + 1) + ' value in this view, ' + valTxt(v) + ' points per cap point)'));
        tx.appendChild(bdg);
      }
      // phone only: the week / avg / cap numbers as one line under the name (the table cells are hidden there)
      var w0 = weekPts(p.slug), a0 = avgR(p.slug), s0 = sal(p.slug), pm = el('span', 'dr-pmeta');
      [['Week', w0 == null ? '—' : signedTxt(w0), w0 == null ? '' : numCls(w0)], ['Avg', a0 == null ? '—' : signedTxt(a0), a0 == null ? '' : numCls(a0)], ['Cap', s0 == null ? '—' : String(s0), '']].forEach(function(m){
        var it = el('span', 'dr-pmeta__i');
        it.appendChild(txt(m[0] + ' '));
        it.appendChild(el('b', m[2] || null, m[1]));
        pm.appendChild(it);
      });
      tx.appendChild(pm);
      pl.appendChild(tx); tdP.appendChild(pl); tr.appendChild(tdP);
      var tdF = el('td', 'dr-c-form'); tdF.appendChild(spark(p)); tr.appendChild(tdF);
      var w = weekPts(p.slug);
      var tdW = el('td', 'n dr-c-pts' + (w == null ? '' : ' ' + numCls(w)), w == null ? '—' : signedTxt(w)); tdW.setAttribute('data-label', 'Week'); tr.appendChild(tdW);
      var a = avgR(p.slug);
      var tdA = el('td', 'n dr-c-avg' + (a == null ? '' : ' ' + numCls(a)), a == null ? '—' : signedTxt(a)); tdA.setAttribute('data-label', 'Avg'); tr.appendChild(tdA);
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
    $('poolfoot').textContent = 'Showing ' + list.length + ' of ' + all.length + ' players · Cap costs: ' + (method || 'set by Forbes rank') +
      ' · Avg = recent average points per scored day · Form = the last ' + (S.sparkDates.length || 0) + ' scored days';
    $('valuefoot').textContent = anyValue
      ? VALUE_RULE + ' The top 5 in the current view get a Value badge. Based on recent days only; not a forecast.'
      : 'No scored days yet, so there are no Value badges and "Best value" sorts by Forbes rank. ' + VALUE_RULE;
    $('poolcap').textContent = 'Players you can draft for ' + fmt.weekName(S.draftWeek) + (UI.sector ? ', ' + UI.sector : '') + ', ' + list.length + ' shown';
  }
  function renderNotDraftable(){
    var nd = arr(F.state.index && F.state.index.notDraftable), d = $('notdraftable');
    if (!nd.length){ d.hidden = true; return; }
    $('ndsum').textContent = nd.length + (nd.length === 1 ? ' person can\'t' : ' people can\'t') + ' be drafted this week';
    var ul = clear($('ndlist'));
    nd.forEach(function(p){
      var li = el('li');
      li.appendChild(link(null, p.name, 'player.html?p=' + encodeURIComponent(p.slug)));
      li.appendChild(el('span', 'v2-small', ' · ' + (p.reason || 'Not draftable')));
      ul.appendChild(li);
    });
    d.hidden = false;
  }

  // ---- queue panel (desktop: above the starting five; phone: a tab in the team sheet) ----
  function queueAddBtn(p){
    var S = F.state, s = sal(p.slug);
    if (S.picks.indexOf(p.slug) >= 0){ var on = el('span', 'dr-q__on', 'On your team'); return on; }
    var why = s == null ? 'Not draftable this week' : F.blockReason(p.slug);
    var b = btn('dr-qadd' + (why ? ' is-blocked' : ''), '+ Add');
    b.setAttribute('data-qpick', p.slug);
    if (why){ b.setAttribute('aria-disabled', 'true'); b.setAttribute('data-why', why); b.title = why; b.setAttribute('aria-label', 'Add ' + p.name + ': ' + why); }
    else b.setAttribute('aria-label', 'Add ' + p.name + ' from your queue, cap ' + s);
    return b;
  }
  function renderQueue(box, key){
    if (!box) return;
    clear(box);
    var head = el('div', 'dr-q__head');
    var h = el('h2', 'dr-q__h', 'Queue'); h.id = 'queueh-' + key; h.tabIndex = -1;
    head.appendChild(h);
    head.appendChild(el('span', 'dr-q__n num', queue.length ? queue.length + (queue.length === 1 ? ' player' : ' players') : ''));
    box.appendChild(head);
    if (!queue.length){
      box.appendChild(el('p', 'dr-q__empty', 'Star players in the pool to line them up here. Your queue is kept in this browser only.'));
      return;
    }
    var ol = el('ol', 'dr-q__list');
    queue.forEach(function(slug){
      var p = F.person(slug), li = el('li', 'dr-q__item');
      var nb = btn('dr-q__name', p.name);
      nb.setAttribute('data-card', slug); nb.setAttribute('aria-haspopup', 'dialog');
      nb.appendChild(sr(': open player dossier'));
      li.appendChild(nb);
      var s = sal(slug), a = avgR(slug);
      li.appendChild(el('span', 'dr-q__meta', 'Cap ' + (s == null ? '—' : s) + ' · Avg ' + (a == null ? '—' : signedTxt(a))));
      var acts = el('span', 'dr-q__acts');
      acts.appendChild(queueAddBtn(p));
      var x = btn('dr-q__x', '×');
      x.setAttribute('aria-label', 'Remove ' + p.name + ' from your queue');
      x.setAttribute('data-unqueue', slug);
      acts.appendChild(x);
      li.appendChild(acts);
      ol.appendChild(li);
    });
    box.appendChild(ol);
    box.appendChild(el('p', 'dr-q__foot', 'Kept in this browser only.'));
  }
  function renderQueues(){
    renderQueue($('queuebox'), 'side');
    if (sheetOpen()) renderQueue($('sheetqueue'), 'sheet');
    $('stabq').textContent = queue.length ? '(' + queue.length + ')' : '';
  }

  // ---- starting-five panel (rendered into the side column and the phone sheet) ----
  function helperLine(){
    var S = F.state, k = spotsLeft(), cap = S.captain ? surname(F.person(S.captain).name) : null;
    var a = k === 0 ? 'Your five is set.' : WORDS[k] + (k === 1 ? ' spot' : ' spots') + ' left.';
    var b = cap ? ' ' + cap + ' is your captain.' : (S.picks.length ? ' Choose a captain.' : ' Your first pick becomes captain.');
    return a + b;
  }
  function capWords(st){
    var lvl = DC.capLevel(st.used, C.CAP);
    if (lvl === 'over') return { lvl: lvl, lead: 'Over the cap by ' + st.over + '.', text: 'Remove or swap a player to save.' };
    if (lvl === 'warn') return { lvl: lvl, lead: 'Almost at the cap.', text: 'Remaining: ' + st.left + '.' };
    return { lvl: lvl, lead: '', text: 'Remaining: ' + st.left + '.' };
  }
  function renderPanel(box, withId){
    var S = F.state, st = status();
    clear(box);
    var h = el('h2', 'v2-h2 dr-panel__h', 'Your starting five'); h.tabIndex = -1;
    if (withId) h.id = 'fiveh';
    box.appendChild(h);
    box.appendChild(el('p', 'dr-panel__help', helperLine()));
    var ol = el('ol', 'dr-slots');
    var picks = S.picks.slice();
    for (var i = 0; i < C.PICKS; i++){
      var slug = picks[i], li = el('li', 'dr-slot' + (slug ? '' : ' is-empty'));
      li.appendChild(el('span', 'dr-slot__n', (i < 9 ? '0' : '') + (i + 1)));
      if (!slug){ li.appendChild(el('span', 'dr-slot__name', 'Empty slot')); ol.appendChild(li); continue; }
      var p = F.person(slug), isC = slug === S.captain;
      var nm = btn('dr-slot__name dr-slot__btn', p.name);
      nm.setAttribute('data-card', slug); nm.setAttribute('aria-haspopup', 'dialog');
      nm.appendChild(sr(': open player dossier'));
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
    box.appendChild(el('p', 'dr-panel__rule', 'C = captain, scores ' + C.CAPTAIN_MULT + 'x'));
    // cap meter: fills as players are added; warning above 90, error when over (in words too)
    var cw = capWords(st);
    var cap = el('div', 'v2-cap dr-cap dr-cap--' + cw.lvl + (st.over ? ' v2-cap--over' : ''));
    var row = el('div', 'v2-cap__row');
    row.appendChild(el('span', 'v2-label', 'Cap used'));
    row.appendChild(el('span', 'v2-cap__num', st.used + ' / ' + C.CAP));
    cap.appendChild(row);
    var bar = el('div', 'v2-cap__bar'); bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', st.used + ' of ' + C.CAP + ' cap used. ' + (cw.lead ? cw.lead + ' ' : '') + cw.text);
    var fill = el('div', 'v2-cap__fill'); fill.style.width = Math.min(100, Math.round(st.used / C.CAP * 100)) + '%';
    bar.appendChild(fill); cap.appendChild(bar);
    var cwp = el('p', 'dr-cap__words');
    if (cw.lead) cwp.appendChild(el('strong', null, cw.lead + ' '));
    cwp.appendChild(txt(cw.text));
    cap.appendChild(cwp);
    box.appendChild(cap);
    var proj = S.picks.length ? F.projection() : null;
    if (proj != null){
      var pr = el('p', 'dr-panel__proj');
      pr.appendChild(el('strong', null, 'Recent average: ' + signedTxt(proj) + ' points per day'));
      pr.appendChild(txt(' for these picks, captain counted ' + C.CAPTAIN_MULT + 'x. From recent scored days; not a forecast.'));
      box.appendChild(pr);
    } else if (S.picks.length) box.appendChild(el('p', 'dr-panel__proj', 'Recent average: no scored days yet for these picks.'));
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
      line.appendChild(txt('Not synced online yet. '));
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
    renderQueues();
    renderBar();
  }
  function renderAll(){ renderStats(); renderPool(); renderSide(); if (cardOpen()) window.BDDossier.refresh(); }

  // ---- player card: the shared player dossier (assets/v2/dossier.js) with the Draft room's actions ----
  function cardOpen(){ return !!(window.BDDossier && window.BDDossier.isOpen()); }
  function scopeOf(n){
    var ids = ['pool', 'queuebox', 'sidepanel', 'sheetpanel', 'sheetqueue'];
    for (var i = 0; i < ids.length; i++){ var r = $(ids[i]); if (r && r.contains(n)) return ids[i]; }
    return null;
  }
  function cardActions(slug){
    var S = F.state, p = F.person(slug), picked = S.picks.indexOf(slug) >= 0, isC = S.captain === slug, s = sal(slug), list = [];
    if (picked) list.push({ key: 'pick', label: 'Remove from team', variant: 'selected', ariaLabel: 'Remove ' + p.name + ' from your team', onClick: cardPick });
    else {
      var why = s == null ? 'Not draftable this week' : F.blockReason(slug);
      list.push({ key: 'pick', label: '+ Add to team', variant: 'primary', why: why, note: why === 'Lineup full' ? 'Your five is full. Remove someone first.' : (why ? why + '.' : ''),
        ariaLabel: why ? 'Add ' + p.name + ': ' + why : 'Add ' + p.name + ' to your team, cap ' + s, onClick: cardPick });
    }
    var capWhy = picked ? '' : 'Add ' + surname(p.name) + ' to your team first';
    list.push({ key: 'cap', label: isC ? 'Captain' : 'Make captain', variant: 'secondary', pressed: isC, why: capWhy, note: capWhy ? capWhy + '.' : '', ariaLabel: 'Make ' + p.name + ' captain', onClick: cardCap });
    var q = queued(slug);
    list.push({ key: 'queue', label: q ? 'In your queue' : 'Add to queue', variant: 'ghost', pressed: q, ariaLabel: 'Queue ' + p.name, onClick: cardQueue });
    return list;
  }
  function cardPick(slug, b){ togglePick(slug, b); }
  function cardCap(slug, b){
    if (b.getAttribute('aria-disabled') === 'true'){ say(b.getAttribute('data-why') + '.'); return; }
    var r = F.setCaptain(slug); if (r.ok){ UI.saveMsg = null; say(r.text); }
  }
  function cardQueue(slug){ starToggle(slug); }
  function openCard(slug, from){
    var opener = from || document.activeElement, scope = scopeOf(opener);
    if (!window.BDDossier){ location.href = 'player.html?p=' + encodeURIComponent(slug); return; }
    window.BDDossier.open(slug, {
      opener: opener, showTeam: true, actions: cardActions,
      restoreFocus: function(){
        var sel = '[data-card="' + slug + '"]';
        if (scope && $(scope)){ var n = $(scope).querySelector(sel); if (visibleEl(n)) return n; }
        if (visibleEl(opener)) return opener;
        var any = document.querySelector('#pool ' + sel);
        return visibleEl(any) ? any : $('q');
      }
    });
  }

  // ---- phone sheet: tabs, focus trap, Escape, return focus ----
  var sheetOpener = null;
  function sheetOpen(){ return !$('sheet').hidden; }
  function sheetFocusables(){
    var root = $('sheet').querySelector('.dr-sheet__panel');
    return Array.prototype.filter.call(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  function showSheetTab(key, focus){
    UI.sheetTab = key;
    ['team', 'queue'].forEach(function(k){
      var t = $('stab-' + k), on = k === key;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $('spanel-' + k).hidden = !on;
    });
    if (key === 'queue') renderQueue($('sheetqueue'), 'sheet');
    if (focus) $('stab-' + key).focus();
  }
  function openSheet(tab){
    sheetOpener = document.activeElement;
    $('sheet').hidden = false;
    renderPanel($('sheetpanel'), false);
    renderQueue($('sheetqueue'), 'sheet');
    showSheetTab(tab || 'team', false);
    document.documentElement.classList.add('v2-lock');
    $('barbtn').setAttribute('aria-expanded', 'true');
    ($('sheetclose') || sheetFocusables()[0]).focus();
  }
  function closeSheet(noFocus){
    if (!sheetOpen()) return;
    $('sheet').hidden = true;
    clear($('sheetpanel')); clear($('sheetqueue'));
    document.documentElement.classList.remove('v2-lock');
    $('barbtn').setAttribute('aria-expanded', 'false');
    if (!noFocus){ var back = visibleEl(sheetOpener) ? sheetOpener : $('barbtn'); back.focus(); }
  }
  document.addEventListener('keydown', function(e){
    if (!sheetOpen() || cardOpen() || e.defaultPrevented) return;
    if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); closeSheet(); return; }
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-stab') && /^(Arrow)?(Left|Right)$|^Home$|^End$/.test(e.key)){
      e.preventDefault();
      showSheetTab(e.key === 'Home' ? 'team' : (e.key === 'End' ? 'queue' : (UI.sheetTab === 'team' ? 'queue' : 'team')), true);
      return;
    }
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

  // ---- draft tools: auto-fill, clear ----
  function toolMsg(text){ var m = $('toolmsg'); m.textContent = text; m.hidden = !text; }
  function doAutoFill(){
    var S = F.state;
    hideClearConfirm(true);
    var r = DC.autoFill({
      pool: pool().filter(function(p){ return sal(p.slug) != null; }).map(function(p){ return { slug: p.slug, cap: sal(p.slug), avg: avgOf(p.slug) }; }),
      picks: S.picks.slice(), captain: S.captain, cap: C.CAP, slots: C.PICKS
    });
    var msg;
    if (!r.ok){
      msg = {
        full: 'Your five is already full. Remove a player to auto-fill a spot.',
        over: 'Your picks are over the cap by ' + (F.capUsed() - C.CAP) + '. Remove a player first.',
        nodata: 'Auto-fill needs recent scored days, and there are none yet.',
        nofit: 'No set of players fits your open spots under the ' + plainTxt(C.CAP - F.capUsed()) + ' cap left. Remove a pricier player first.'
      }[r.reason] || 'Auto-fill could not build a team.';
      toolMsg(msg); say(msg);
      return;
    }
    r.add.forEach(function(s){ F.addPick(s); });
    if (r.captain && F.state.picks.indexOf(r.captain) >= 0 && F.state.captain !== r.captain) F.setCaptain(r.captain);
    var added = r.add.filter(function(s){ return F.state.picks.indexOf(s) >= 0; });
    if (added.length !== r.add.length){ msg = 'Auto-fill could not add every player. Try again.'; toolMsg(msg); say(msg); return; }
    var proj = F.projection();
    msg = 'Auto-filled ' + added.length + (added.length === 1 ? ' player: ' : ' players: ') + added.map(function(s){ return F.person(s).name; }).join(', ') + '. ' +
      'Captain: ' + F.person(F.state.captain).name + '. Cap used ' + F.capUsed() + ' of ' + C.CAP + '. ' +
      (proj != null ? 'Recent average ' + signedTxt(proj) + ' points per day. ' : '') + 'Not saved yet: press Save team to lock it in.';
    toolMsg(msg); say(msg);
  }
  function showClearConfirm(){
    var t = F.savedTeam();
    $('clearconfirm-t').textContent = 'Clear all ' + F.state.picks.length + ' picks from your draft? Your saved team for ' + fmt.weekName(F.state.draftWeek) + ' stays saved until you press Save team again.';
    $('clearconfirm').hidden = false;
    $('clearyes').focus();
    return t;
  }
  function hideClearConfirm(silent){
    if ($('clearconfirm').hidden) return;
    $('clearconfirm').hidden = true;
    if (!silent) $('clearbtn').focus();
  }
  function doClear(){
    var r = F.clearPicks();
    UI.saveMsg = null;
    hideClearConfirm(true);
    toolMsg(r.text); say(r.text);
    $('clearbtn').focus();
  }
  $('clearconfirm').addEventListener('keydown', function(e){ if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); hideClearConfirm(); } });

  // ---- actions ----
  function focusSel(scope, sel){
    var n = scope && scope.querySelector(sel);
    if (n && !n.disabled && visibleEl(n)){ n.focus(); return true; }
    return false;
  }
  function panelScope(from){ return from && from.closest && from.closest('#sheetpanel') ? $('sheetpanel') : $('sidepanel'); }
  function queueScope(from){ return from && from.closest && from.closest('#sheetqueue') ? $('sheetqueue') : $('queuebox'); }
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
  function togglePick(s, b){
    var r;
    if (b.getAttribute('aria-disabled') === 'true'){ say('Cannot add ' + F.person(s).name + ': ' + b.getAttribute('data-why') + '.'); return false; }
    if (F.state.picks.indexOf(s) >= 0){ r = F.removePick(s); if (r.ok) say(changeLine('Removed ' + F.person(s).name + '.')); }
    else { r = F.addPick(s); if (r.ok) say(changeLine('Added ' + F.person(s).name + '.') + (F.state.captain === s ? ' Captain.' : '')); }
    UI.saveMsg = null;
    return true;
  }
  function starToggle(s){
    var on = toggleQueue(s);
    renderPool(); renderQueues();
    if (cardOpen()) window.BDDossier.refresh();
    say(on ? F.person(s).name + ' added to your queue. ' + queue.length + ' queued.' : F.person(s).name + ' removed from your queue. ' + queue.length + ' queued.');
    return on;
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    if (t === $('sheet')){ closeSheet(); return; }
    var b = t.closest ? t.closest('button') : null;
    if (!b) return;
    if (b.id === 'barbtn'){ openSheet(); return; }
    if (b.id === 'sheetclose'){ closeSheet(); return; }
    if (b.id === 'autofill'){ doAutoFill(); return; }
    if (b.id === 'clearbtn'){
      if (!F.state.picks.length){ toolMsg('No picks to clear.'); say('No picks to clear.'); return; }
      if (F.savedTeam()) showClearConfirm(); else doClear();
      return;
    }
    if (b.id === 'clearyes'){ doClear(); return; }
    if (b.id === 'clearno'){ hideClearConfirm(); return; }
    if (b.disabled) return;
    var s, r;
    if ((s = b.getAttribute('data-stab'))){ showSheetTab(s, false); return; }
    if ((s = b.getAttribute('data-sector')) !== null && b.getAttribute('role') === 'tab'){ setSector(s, false); return; }
    if ((s = b.getAttribute('data-card'))){ openCard(s, b); return; }
    if ((s = b.getAttribute('data-star'))){
      starToggle(s);
      focusSel($('pool'), '[data-star="' + s + '"]');
      return;
    }
    if ((s = b.getAttribute('data-unqueue'))){
      var qs = queueScope(b), idx = queue.indexOf(s);
      starToggle(s);
      var items = qs.querySelectorAll('[data-unqueue]');
      if (items.length) items[Math.min(idx, items.length - 1)].focus(); else { var qh = qs.querySelector('.dr-q__h'); if (qh) qh.focus(); }
      return;
    }
    if ((s = b.getAttribute('data-qpick'))){
      var qsc = queueScope(b);
      if (togglePick(s, b)) { if (!focusSel(qsc, '[data-qpick]')) { var qh2 = qsc.querySelector('.dr-q__h'); if (qh2) qh2.focus(); } }
      return;
    }
    if ((s = b.getAttribute('data-pick'))){
      togglePick(s, b);
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
      UI.q = ''; $('q').value = ''; setSector('', false); $('q').focus();
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
  $('sort').addEventListener('change', function(){ UI.sort = this.value; keepFilters(); renderPool(); });

  F.onChange(function(kind){
    if (!F.state.loaded) return;
    if (kind === 'roster'){ UI.saveMsg = null; renderAll(); return; }
    if (kind === 'online' || kind === 'sync') renderSide();
  });

  // ---- load ----
  function fail(){
    $('weekpill').textContent = 'Data unavailable';
    var body = clear($('pool')), tr = el('tr'), td = el('td'); td.colSpan = COLS;
    td.appendChild(el('p', 'v2-msg v2-msg--bad', 'The player pool is not available right now. Try again later.'));
    var rb = btn('v2-btn v2-btn--ghost v2-btn--sm', 'Try again'); rb.addEventListener('click', function(){ location.reload(); });
    td.appendChild(rb); tr.appendChild(td); body.appendChild(tr);
    clear($('sidepanel')).appendChild(el('p', 'dr-panel__help', 'Your team will show here when the game data loads.'));
    say('The player pool is not available right now.');
  }
  if (F.testClock() != null){ var tcb = $('testclock'); tcb.hidden = false; tcb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }
  // nicknames under the names in the pool (a playful label we write; the list works without it)
  if (window.BDDossier) window.BDDossier.loadNicknames().then(function(x){ if (x && F.state.loaded && F.state.draftWk) renderPool(); });
  F.init().then(function(){
    if (!F.state.draftWk){ fail(); return; }
    loadQueue();
    renderHead(); renderNotices(); renderSectors(); renderNotDraftable(); renderAll();
    $('tools').hidden = false;
    document.body.classList.add('dr-ready');
  }, function(err){ if (window.console) console.warn(err); fail(); });
})();
