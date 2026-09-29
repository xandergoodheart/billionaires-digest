/* Billionaires Digest v2 MOCKUP: "Billionaire Slots" (mockups/slot-machine.html). ES5, no globals.
   The Draft room as a slot machine: five reels = five roster slots. A spin picks a random VALID team (five distinct
   draftable players, total cap cost <= 100, real week salaries; captain = highest cap cost). Hold keeps a reel.
   "Take this team" writes the picks into the working draft through BDFantasyStore, exactly as the Draft room does.
   The face is one made-up cartoon (portrait placeholder), never a real person. Play money only, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, BD = window.BD;
  if (!F || !C || !BD) return;
  var DATA = '../data/fantasy/';
  var MINUS = '−';
  var N = 5;
  var $ = function(id){ return document.getElementById(id); };
  var el = BD.el;
  function reduced(){ return BD.reducedMotion(); }

  // One generic, original cartoon tycoon (top hat, round head, moustache). Eyes sit at y=62 of 120.
  var FACE = '<svg class="sm-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#D62D27"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="sm-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="sm-dollar" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="800" font-size="19" text-anchor="middle" fill="#08764A">' +
    '<text x="46" y="69">$</text><text x="74" y="69">$</text></g>' +
    '<circle cx="36" cy="80" r="5" fill="#E8918A" opacity=".45"/><circle cx="84" cy="80" r="5" fill="#E8918A" opacity=".45"/>' +
    '<path d="M60 70 q-3 6 0 9" stroke="#13171C" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M42 86 q9 -8 18 -1 q9 -7 18 1" stroke="#13171C" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M50 93 q10 7 20 0" stroke="#13171C" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  var st = { pool: [], sal: {}, sbWk: null, team: null, captain: null, held: [false, false, false, false, false], spinning: false, ready: false, reels: [] };

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function numCls(n){ return n > 0 ? 'is-pos' : (n < 0 ? 'is-neg' : 'is-zero'); }
  function person(slug){ return F.person(slug); }
  function pts(slug){ return F.weekPoints(st.sbWk, slug); }
  var liveT = null;
  function say(t){ var n = $('live'); n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 40); }
  function getJson(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function optJson(u){ return getJson(u).then(null, function(){ return null; }); }
  function rand(n){ return Math.floor(Math.random() * n); }

  // ---- bulbs: static; a gentle chase that stops by itself (never with reduced motion) ----
  function buildBulbs(){
    Array.prototype.forEach.call(document.querySelectorAll('.sm-bulbs'), function(row){
      for (var i = 0; i < 22; i++) row.appendChild(el('span', 'sm-bulb'));
    });
  }
  var chaseT = null;
  function chase(ms){
    if (reduced()) return;
    var cab = document.querySelector('.sm-cab');
    cab.classList.remove('is-chasing');
    void cab.offsetWidth;
    cab.classList.add('is-chasing');
    clearTimeout(chaseT);
    chaseT = setTimeout(function(){ cab.classList.remove('is-chasing'); }, ms);
  }

  // ---- reels ----
  function faceHtml(){ return FACE; }
  function cardFor(slug, opts){
    opts = opts || {};
    var card = el('div', 'sm-card');
    if (!slug){
      card.classList.add('sm-card--empty');
      card.appendChild(el('span', 'sm-card__q', '?'));
      card.appendChild(el('span', 'sm-card__name', 'Slot ' + (opts.index + 1)));
      card.appendChild(el('span', 'sm-card__sector', 'Pull to play'));
      return card;
    }
    var p = person(slug), face;
    if (opts.live){
      face = el('button', 'sm-face');
      face.type = 'button';
      face.setAttribute('aria-label', 'Close-up of ' + p.name);
      face.setAttribute('aria-haspopup', 'dialog');
      face.setAttribute('data-slug', slug);
    } else {
      face = el('span', 'sm-face');
    }
    face.innerHTML = faceHtml();
    card.appendChild(face);
    var nm = el('span', 'sm-card__name', p.name);
    nm.title = p.name;
    card.appendChild(nm);
    card.appendChild(el('span', 'sm-card__sector', p.sector || 'Other'));
    card.appendChild(el('span', 'sm-card__cap num', 'Cap ' + st.sal[slug]));
    if (opts.captain){
      var c = el('span', 'sm-card__c', 'C');
      c.title = 'Captain: counts 1.5 times';
      card.appendChild(c);
      card.appendChild(el('span', 'v2-sr', ' (captain)'));
    }
    return card;
  }
  function buildReels(){
    var box = clear($('reels'));
    for (var i = 0; i < N; i++){
      var reel = el('div', 'sm-reel');
      var win = el('div', 'sm-window');
      var strip = el('div', 'sm-strip');
      strip.appendChild(cardFor(null, { index: i }));
      win.appendChild(strip);
      reel.appendChild(win);
      var chip = el('p', 'sm-chip num', '');
      reel.appendChild(chip);
      var hold = el('button', 'sm-hold', 'Hold');
      hold.type = 'button';
      hold.disabled = true;
      hold.setAttribute('aria-pressed', 'false');
      hold.setAttribute('aria-label', 'Hold slot ' + (i + 1));
      hold.setAttribute('data-i', String(i));
      reel.appendChild(hold);
      box.appendChild(reel);
      st.reels.push({ win: win, strip: strip, chip: chip, hold: hold });
    }
  }

  // ---- team picking (always valid: 5 distinct draftable players, cap <= 100) ----
  function capOf(list){ var t = 0; list.forEach(function(s){ if (s) t += st.sal[s] || 0; }); return t; }
  function pickTeam(keep){
    var fixed = keep.filter(function(s){ return !!s; });
    var budget = C.CAP - capOf(fixed);
    var free = st.pool.filter(function(s){ return fixed.indexOf(s) < 0; });
    var need = N - fixed.length, chosen = null;
    for (var tries = 0; tries < 400 && !chosen; tries++){
      var bag = free.slice(), got = [];
      for (var k = 0; k < need; k++) got.push(bag.splice(rand(bag.length), 1)[0]);
      if (capOf(got) <= budget) chosen = got;
    }
    if (!chosen) chosen = free.slice().sort(function(a, b){ return st.sal[a] - st.sal[b]; }).slice(0, need); // cheapest: always fits
    var out = [], j = 0;
    for (var i = 0; i < N; i++) out.push(keep[i] || chosen[j++]);
    return out;
  }
  function captainOf(team){
    var best = team[0];
    team.forEach(function(s){ if (st.sal[s] > st.sal[best]) best = s; });
    return best;
  }

  // ---- spin ----
  function setBusy(b){
    st.spinning = b;
    $('spin').disabled = b || !st.ready;
    $('lever').disabled = b || !st.ready;
    $('take').disabled = b || !st.team;
    st.reels.forEach(function(r){ r.hold.disabled = b || !st.team; });
    $('reels').setAttribute('aria-busy', b ? 'true' : 'false');
  }
  function pullLever(){
    if (reduced()) return;
    var lv = $('lever');
    lv.classList.add('is-pulled');
    setTimeout(function(){ lv.classList.remove('is-pulled'); }, 450);
  }
  function spin(){
    if (!st.ready || st.spinning) return;
    var keep = [];
    for (var i = 0; i < N; i++) keep.push(st.team && st.held[i] ? st.team[i] : null);
    var moving = [];
    keep.forEach(function(s, i){ if (!s) moving.push(i); });
    if (!moving.length){ say('All five are held. Release a hold to spin.'); $('payoutnote').textContent = 'All five are held. Release a hold to spin.'; return; }
    var next = pickTeam(keep);
    setBusy(true);
    pullLever();
    $('payoutnote').textContent = 'Spinning…';
    st.reels.forEach(function(r, i){ if (!keep[i]) r.chip.textContent = ''; });
    if (reduced()){ land(next); return; }
    var left = moving.length;
    moving.forEach(function(i, order){
      animateReel(i, next[i], order, function(){ if (--left === 0) land(next); });
    });
  }
  function animateReel(i, target, order, done){
    var r = st.reels[i], strip = r.strip, win = r.win;
    var h = win.clientHeight;
    var fill = 9 + order * 3;
    var cur = st.team ? st.team[i] : null;
    clear(strip);
    strip.appendChild(cardFor(cur, { index: i }));
    for (var k = 0; k < fill; k++) strip.appendChild(cardFor(st.pool[rand(st.pool.length)]));
    strip.appendChild(cardFor(target));
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    void strip.offsetHeight;
    var dur = 1150 + order * 320; // five moving reels: 1.15s … 2.43s
    strip.style.transition = 'transform ' + dur + 'ms cubic-bezier(.18,.72,.26,1.04)';
    strip.style.transform = 'translateY(' + (-(fill + 1) * h) + 'px)';
    win.classList.add('is-spinning');
    var blurOff = setTimeout(function(){ win.classList.remove('is-spinning'); }, Math.max(0, dur - 350));
    var fin = false;
    function end(e){
      if (e && e.target !== strip) return;
      if (fin) return;
      fin = true;
      clearTimeout(blurOff);
      strip.removeEventListener('transitionend', end);
      win.classList.remove('is-spinning');
      win.classList.add('is-landed');
      setTimeout(function(){ win.classList.remove('is-landed'); }, 400);
      done();
    }
    strip.addEventListener('transitionend', end);
    setTimeout(end, dur + 250);
  }
  function land(team){
    st.team = team;
    st.captain = captainOf(team);
    team.forEach(function(s, i){
      var r = st.reels[i];
      clear(r.strip);
      r.strip.style.transition = 'none';
      r.strip.style.transform = 'translateY(0)';
      r.strip.appendChild(cardFor(s, { live: true, captain: s === st.captain }));
      r.hold.setAttribute('aria-label', 'Hold ' + person(s).name + ' (slot ' + (i + 1) + ')');
    });
    setBusy(false);
    $('spin').textContent = 'Spin again';
    renderPayout();
    $('takenote').hidden = !$('takenote').textContent;
    chase(2600);
    announce();
  }

  // ---- result (real numbers, "points so far this week") ----
  function weekLabel(){
    var wk = st.sbWk;
    if (!wk) return '';
    var n = (wk.days || []).length;
    return (wk.practice ? 'Practice week' : F.fmt.weekTitle(wk.week)) + ' · ' + n + ' scored day' + (n === 1 ? '' : 's');
  }
  function teamTotal(){
    if (!st.sbWk || !(st.sbWk.days || []).length) return null;
    return F.teamWeek(st.sbWk, { picks: st.team, captain: st.captain }).total;
  }
  function renderPayout(){
    var used = capOf(st.team);
    var cap = clear($('capused'));
    cap.appendChild(document.createTextNode(String(used) + ' '));
    cap.appendChild(el('small', null, '/ ' + C.CAP));
    st.team.forEach(function(s, i){
      var r = st.reels[i], p = pts(s);
      clear(r.chip);
      if (p == null){ r.chip.appendChild(el('span', 'is-zero', '— pts')); }
      else {
        r.chip.appendChild(el('span', numCls(p), signedTxt(p)));
        r.chip.appendChild(document.createTextNode(' pts'));
      }
      if (s === st.captain) r.chip.appendChild(el('span', 'sm-chip__x', '×1.5'));
    });
    var tot = teamTotal(), tv = clear($('teampts'));
    if (tot == null) tv.appendChild(el('span', 'is-zero', 'No days scored yet'));
    else tv.appendChild(el('span', numCls(tot), signedTxt(tot)));
    $('payoutnote').textContent = weekLabel() + (weekLabel() ? '. ' : '') + 'Captain ' + person(st.captain).name + ' counts 1.5 times. ' + (C.CAP - used) + ' cap left.';
  }
  function announce(){
    var names = st.team.map(function(s){
      var p = pts(s);
      return person(s).name + ', cap ' + st.sal[s] + (s === st.captain ? ', captain' : '') + (p == null ? '' : ', ' + signedTxt(p) + ' points');
    });
    var tot = teamTotal();
    say('Landed: ' + names.join('; ') + '. Cap used ' + capOf(st.team) + ' of ' + C.CAP + '.' +
        (tot == null ? '' : ' Team points so far this week: ' + signedTxt(tot) + '.'));
  }

  // ---- hold ----
  function toggleHold(i){
    if (!st.team || st.spinning) return;
    st.held[i] = !st.held[i];
    var r = st.reels[i];
    r.hold.setAttribute('aria-pressed', st.held[i] ? 'true' : 'false');
    r.hold.textContent = st.held[i] ? 'Held' : 'Hold';
    r.win.classList.toggle('is-held', st.held[i]);
  }

  // ---- take this team to the Draft room (same store calls as the Draft room) ----
  function takeTeam(){
    if (!st.team || st.spinning) return;
    F.clearPicks();
    st.team.forEach(function(s){ F.addPick(s); });
    F.setCaptain(st.captain);
    if (F.state.picks.length !== N){ say('Could not add all five. Try another spin.'); return; }
    window.location.href = '../draft.html';
  }

  // ---- close-up dialog ----
  var dlg = $('closeup'), lastFocus = null, cuT = [];
  function dlgFocusables(){
    return Array.prototype.filter.call(dlg.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  function openCloseup(slug, from){
    var p = person(slug), wp = pts(slug), zoom = $('cu-zoom');
    lastFocus = from || document.activeElement;
    $('cu-face').innerHTML = faceHtml();
    $('cu-name').textContent = p.name + (slug === st.captain ? ' · Captain' : '');
    $('cu-cap').textContent = String(st.sal[slug]);
    var ptd = clear($('cu-pts'));
    if (wp == null) ptd.appendChild(el('span', 'is-zero', 'No points yet'));
    else ptd.appendChild(el('span', numCls(wp), signedTxt(wp)));
    $('cu-ptsk').textContent = 'Points so far this week' + (st.sbWk && st.sbWk.practice ? ' (practice)' : '');
    $('cu-sector').textContent = p.sector || 'Other';
    cuT.forEach(clearTimeout); cuT = [];
    zoom.className = 'sm-zoom';
    dlg.removeAttribute('hidden');
    document.documentElement.classList.add('v2-lock');
    $('cu-close').focus();
    if (reduced()){ zoom.className = 'sm-zoom is-zoomed is-rich is-static'; return; }
    void zoom.offsetWidth;
    cuT.push(setTimeout(function(){ zoom.classList.add('is-zoomed'); }, 30));
    cuT.push(setTimeout(function(){ zoom.classList.add('is-rich', 'is-sparkle'); }, 720));
    cuT.push(setTimeout(function(){ zoom.classList.remove('is-sparkle'); }, 2200));
  }
  function closeCloseup(){
    if (dlg.hasAttribute('hidden')) return;
    cuT.forEach(clearTimeout); cuT = [];
    dlg.setAttribute('hidden', '');
    document.documentElement.classList.remove('v2-lock');
    var back = lastFocus && document.contains(lastFocus) && lastFocus.getClientRects().length ? lastFocus : $('spin');
    back.focus();
  }
  dlg.addEventListener('click', function(e){ if (e.target === dlg) closeCloseup(); });
  $('cu-close').addEventListener('click', closeCloseup);
  document.addEventListener('keydown', function(e){
    if (dlg.hasAttribute('hidden')) return;
    if (e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); closeCloseup(); return; }
    if (e.key !== 'Tab') return;
    var f = dlgFocusables();
    if (!f.length){ e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  // ---- wiring ----
  buildBulbs();
  buildReels();
  $('spin').addEventListener('click', spin);
  $('lever').addEventListener('click', spin);
  $('take').addEventListener('click', takeTeam);
  $('reels').addEventListener('click', function(e){
    var t = e.target;
    var h = t.closest && t.closest('.sm-hold');
    if (h){ toggleHold(+h.getAttribute('data-i')); return; }
    var f = t.closest && t.closest('button.sm-face');
    if (f && !st.spinning) openCloseup(f.getAttribute('data-slug'), f);
  });
  chase(3500);

  // ---- data: same week choice as BDFantasyStore.init (draft week salaries, scoring week points) ----
  getJson(DATA + 'index.json').then(function(ix){
    var t = F.now(), dw = C.draftWeek(t), lw = C.lockedWeek(t);
    var weeks = (ix.weeks || []).map(function(w){ return w.week; });
    var sbId = null;
    for (var i = weeks.length - 1; i >= 0; i--) if (weeks[i] <= lw){ sbId = weeks[i]; break; }
    var latest = weeks.length ? weeks[weeks.length - 1] : null;
    return Promise.all([
      weeks.indexOf(dw) >= 0 ? optJson(DATA + 'weeks/' + dw + '.json') : null,
      sbId ? optJson(DATA + 'weeks/' + sbId + '.json') : null,
      latest ? optJson(DATA + 'weeks/' + latest + '.json') : null
    ]).then(function(r){
      var S = F.state;
      S.draftWeek = dw;
      S.draftWk = r[0]; S.salaryFallback = false;
      if (!S.draftWk && r[2]){ S.draftWk = r[2]; S.salaryFallback = true; }
      S.sbWk = r[1];
      if (!S.draftWk) throw new Error('no week');
      (S.draftWk.draftable || []).forEach(function(p){ S.people[p.slug] = p; });
      (S.sbWk && S.sbWk.draftable || []).forEach(function(p){ S.people[p.slug] = S.people[p.slug] || p; });
      st.sal = S.draftWk.salaries || {};
      st.sbWk = S.sbWk;
      st.pool = (S.draftWk.draftable || []).map(function(p){ return p.slug; }).filter(function(s){ return typeof st.sal[s] === 'number'; });
      if (st.pool.length < N) throw new Error('pool');
      st.ready = true;
      $('sm-week').textContent = st.pool.length + ' players · cap 100 · building for ' + F.fmt.weekName(dw) + (S.salaryFallback ? ' (this week\'s cap costs)' : '');
      if (F.store().teams[dw]){
        var n = $('takenote');
        n.textContent = 'You already saved a team for ' + F.fmt.weekName(dw) + '. The Draft room opens your saved team first, not this one.';
      }
      setBusy(false);
    });
  }).then(null, function(){
    $('sm-week').textContent = 'Could not load the players. Try again later.';
    $('payoutnote').textContent = 'The player data did not load.';
  });

})();
