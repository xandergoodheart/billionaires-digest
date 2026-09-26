/* Billionaires Digest v2: "Lucky five", a slot-machine extra inside the Draft room (draft.html). ES5, no globals.
   Ported from the approved mockup (mockups/slot-machine.*). Five reels = five roster slots. A spin picks a random
   VALID team (five distinct draftable players, total cap cost <= 100 on the real draft-week salaries; captain = the
   highest cap cost). Hold keeps a reel. "Use this team" puts the five into the working draft through the Draft
   room's own BDFantasyStore (already initialised by draft.js; no separate data loading) and never saves by itself.
   Reels show the initials sector plate, or an approved illustrated portrait from window.BDPortraits (empty for now).
   The close-up's cartoon face is one made-up tycoon, never a real person. Play money only, no prizes. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, BD = window.BD;
  if (!F || !C || !BD || !document.querySelector('[data-lucky-open]')) return;
  var MINUS = '−';
  var N = 5;
  var el = BD.el;
  var $ = function(id){ return document.getElementById(id); };
  var mqPhone = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };
  function reduced(){ return BD.reducedMotion(); }

  // One generic, original cartoon tycoon (top hat, round head, moustache). Eyes sit at y=62 of 120. Close-up only.
  var FACE = '<svg class="lk-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<rect x="36" y="4" width="48" height="30" rx="3" fill="#13171C"/>' +
    '<rect x="36" y="24" width="48" height="7" fill="#D62D27"/>' +
    '<rect x="24" y="31" width="72" height="7" rx="3.5" fill="#13171C"/>' +
    '<circle cx="25" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<circle cx="95" cy="68" r="8" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<ellipse cx="60" cy="70" rx="35" ry="33" fill="#F1CB98" stroke="#13171C" stroke-width="3"/>' +
    '<path d="M36 50 q9 -6 18 -1 M66 49 q9 -5 18 1" stroke="#13171C" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="46" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<circle cx="74" cy="62" r="10" fill="#FFFFFF" stroke="#13171C" stroke-width="2.5"/>' +
    '<g class="lk-pupil"><circle cx="47" cy="63" r="4.5" fill="#13171C"/><circle cx="75" cy="63" r="4.5" fill="#13171C"/>' +
    '<circle cx="48.5" cy="61.5" r="1.4" fill="#FFFFFF"/><circle cx="76.5" cy="61.5" r="1.4" fill="#FFFFFF"/></g>' +
    '<g class="lk-dollar" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="800" font-size="19" text-anchor="middle" fill="#08764A">' +
    '<text x="46" y="69">$</text><text x="74" y="69">$</text></g>' +
    '<circle cx="36" cy="80" r="5" fill="#E8918A" opacity=".45"/><circle cx="84" cy="80" r="5" fill="#E8918A" opacity=".45"/>' +
    '<path d="M60 70 q-3 6 0 9" stroke="#13171C" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M42 86 q9 -8 18 -1 q9 -7 18 1" stroke="#13171C" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M50 93 q10 7 20 0" stroke="#13171C" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  var st = { pool: [], sal: {}, sbWk: null, team: null, captain: null, held: [false, false, false, false, false],
             spinning: false, ready: false, reels: [], gen: 0 };

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function numCls(n){ return n > 0 ? 'is-pos' : (n < 0 ? 'is-neg' : 'is-zero'); }
  function person(slug){ return F.person(slug); }
  function pts(slug){ return F.weekPoints(st.sbWk, slug); }
  function rand(n){ return Math.floor(Math.random() * n); }
  function visibleEl(n){ return !!n && document.contains(n) && n.getClientRects().length > 0; }
  // the Draft room's live region (draft.js uses the same one)
  var liveT = null;
  function say(t){ var n = $('live'); if (!n) return; n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 40); }
  // portraits: only plain site-relative paths from window.BDPortraits (empty until the style is approved)
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? u : null; }
  function portrait(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? { img: safePath(p.img), dollar: safePath(p.dollar) } : { img: null, dollar: null };
  }

  // ---- dialog markup (built once) ----
  var dlg, panel, cu, reelsBox, spinBtn, lever, useBtn, confirmBox, yesBtn, noBtn, capV, ptsV, note, weekSub, heldNote;
  function build(){
    dlg = el('div', 'lk-dlg');
    dlg.id = 'lucky';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'lk-title');
    dlg.setAttribute('aria-describedby', 'lk-dek');
    dlg.hidden = true;
    panel = el('div', 'lk-panel');
    panel.tabIndex = -1;

    var head = el('div', 'lk-head');
    var kick = el('p', 'lk-head__kick', 'Lucky five');
    head.appendChild(kick);
    var close = btn('lk-head__close', 'Close');
    close.setAttribute('data-lk-close', '1');
    close.setAttribute('aria-label', 'Close Lucky five');
    head.appendChild(close);
    panel.appendChild(head);
    panel.appendChild(el('p', 'lk-dek', 'Spin for a random team of five that fits under the ' + C.CAP + ' cap. Hold the ones you like and spin the rest.')).id = 'lk-dek';

    var cab = el('section', 'lk-cab');
    cab.setAttribute('aria-labelledby', 'lk-title');
    var frame = el('div', 'lk-cab__frame');
    var mq = el('div', 'lk-marquee');
    mq.appendChild(bulbs());
    var h = el('h2', 'lk-marquee__title', 'Billionaire Slots'); h.id = 'lk-title';
    mq.appendChild(h);
    weekSub = el('p', 'lk-marquee__sub', '');
    mq.appendChild(weekSub);
    mq.appendChild(bulbs());
    frame.appendChild(mq);

    var body = el('div', 'lk-body');
    reelsBox = el('div', 'lk-reels');
    reelsBox.setAttribute('role', 'group');
    reelsBox.setAttribute('aria-label', 'Your five roster slots');
    body.appendChild(reelsBox);
    var pay = el('div', 'lk-payout');
    var l1 = el('div', 'lk-led');
    l1.appendChild(el('span', 'lk-led__k', 'Cap used'));
    capV = el('span', 'lk-led__v num');
    l1.appendChild(capV);
    pay.appendChild(l1);
    var l2 = el('div', 'lk-led lk-led--wide');
    l2.appendChild(el('span', 'lk-led__k', 'Team points so far this week'));
    ptsV = el('span', 'lk-led__v num');
    l2.appendChild(ptsV);
    pay.appendChild(l2);
    note = el('p', 'lk-payout__note', '');
    pay.appendChild(note);
    body.appendChild(pay);
    frame.appendChild(body);

    var ctr = el('div', 'lk-controls');
    spinBtn = btn('lk-spin', 'Spin');
    spinBtn.setAttribute('data-lk-spin', '1');
    ctr.appendChild(spinBtn);
    useBtn = btn('v2-btn lk-use', 'Use this team');
    useBtn.setAttribute('data-lk-use', '1');
    ctr.appendChild(useBtn);
    frame.appendChild(ctr);
    heldNote = el('p', 'lk-heldnote', '');
    heldNote.hidden = true;
    frame.appendChild(heldNote);

    confirmBox = el('div', 'lk-confirm');
    confirmBox.setAttribute('role', 'group');
    confirmBox.setAttribute('aria-labelledby', 'lk-confirm-q');
    confirmBox.hidden = true;
    var q = el('p', 'lk-confirm__q', 'Replace your current picks?'); q.id = 'lk-confirm-q';
    confirmBox.appendChild(q);
    var qd = el('p', 'lk-confirm__d', ''); qd.id = 'lk-confirm-d';
    confirmBox.appendChild(qd);
    var qr = el('div', 'lk-confirm__row');
    yesBtn = btn('v2-btn v2-btn--primary lk-confirm__yes', 'Yes, replace');
    yesBtn.setAttribute('data-lk-yes', '1');
    yesBtn.setAttribute('aria-describedby', 'lk-confirm-q lk-confirm-d');
    noBtn = btn('v2-btn lk-confirm__no', 'Cancel');
    noBtn.setAttribute('data-lk-no', '1');
    qr.appendChild(yesBtn); qr.appendChild(noBtn);
    confirmBox.appendChild(qr);
    frame.appendChild(confirmBox);
    frame.appendChild(el('p', 'lk-play', 'Play money · no prizes · not financial advice'));
    cab.appendChild(frame);

    // lever: desktop only, same action as Spin (kept out of the tab order; Spin is the keyboard control)
    lever = btn('lk-lever', '');
    lever.setAttribute('data-lk-spin', '1');
    lever.setAttribute('aria-hidden', 'true');
    lever.tabIndex = -1;
    lever.appendChild(el('span', 'lk-lever__arm')).appendChild(el('span', 'lk-lever__ball'));
    lever.appendChild(el('span', 'lk-lever__base'));
    cab.appendChild(lever);
    panel.appendChild(cab);
    panel.appendChild(el('p', 'lk-foot', 'Names, cap costs and points are the real game data. Captain is the highest cap cost on the team and counts ' + C.CAPTAIN_MULT + ' times. Using a team only fills your picks: press Save team in the Draft room to lock it in.'));
    dlg.appendChild(panel);

    // close-up (a small dialog on top of the Lucky five dialog)
    cu = el('div', 'lk-cu');
    cu.setAttribute('role', 'dialog');
    cu.setAttribute('aria-modal', 'true');
    cu.setAttribute('aria-labelledby', 'lk-cu-name');
    cu.hidden = true;
    var cp = el('div', 'lk-cu__panel');
    var zoom = el('div', 'lk-zoom'); zoom.id = 'lk-cu-zoom'; zoom.setAttribute('aria-hidden', 'true');
    var face = el('div', 'lk-zoom__face'); face.id = 'lk-cu-face';
    zoom.appendChild(face);
    for (var i = 1; i <= 4; i++) zoom.appendChild(el('span', 'lk-spark lk-spark--' + i));
    cp.appendChild(zoom);
    var ck = el('p', 'lk-cu__kick', ''); ck.id = 'lk-cu-kick';
    cp.appendChild(ck);
    var cn = el('h3', 'v2-display lk-cu__name', ''); cn.id = 'lk-cu-name';
    cp.appendChild(cn);
    var dl = el('dl', 'lk-cu__stats');
    [['Cap', 'lk-cu-cap'], ['Points so far this week', 'lk-cu-pts'], ['Sector', 'lk-cu-sector']].forEach(function(x){
      var d = el('div'), dt = el('dt', null, x[0]), dd = el('dd', x[1] === 'lk-cu-sector' ? 'lk-cu__sector' : 'num');
      if (x[1] === 'lk-cu-pts') dt.id = 'lk-cu-ptsk';
      dd.id = x[1];
      d.appendChild(dt); d.appendChild(dd); dl.appendChild(d);
    });
    cp.appendChild(dl);
    cp.appendChild(el('p', 'lk-cu__note', 'Play money · no prizes · not financial advice'));
    var cc = btn('v2-btn v2-btn--primary lk-cu__close', 'Close');
    cc.id = 'lk-cu-close';
    cp.appendChild(cc);
    cu.appendChild(cp);
    dlg.appendChild(cu);

    document.body.appendChild(dlg);
    buildReels();
  }
  function bulbs(){
    var row = el('div', 'lk-bulbs');
    row.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 22; i++) row.appendChild(el('span', 'lk-bulb'));
    return row;
  }
  var chaseT = null;
  function chase(ms){
    if (reduced()) return;
    var cab = dlg.querySelector('.lk-cab');
    cab.classList.remove('is-chasing');
    void cab.offsetWidth;
    cab.classList.add('is-chasing');
    clearTimeout(chaseT);
    chaseT = setTimeout(function(){ cab.classList.remove('is-chasing'); }, ms);
  }

  // ---- reels ----
  function plate(slug){
    var p = person(slug), pic = portrait(slug).img;
    var a = el('span', 'v2-av lk-av', pic ? null : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    if (pic){ var im = el('img'); im.src = pic; im.alt = ''; im.setAttribute('decoding', 'async'); a.appendChild(im); }
    return a;
  }
  function cardFor(slug, opts){
    opts = opts || {};
    var card = el('div', 'lk-card');
    if (!slug){
      card.classList.add('lk-card--empty');
      card.appendChild(el('span', 'lk-card__q', '?'));
      card.appendChild(el('span', 'lk-card__name', 'Slot ' + (opts.index + 1)));
      card.appendChild(el('span', 'lk-card__sector', 'Spin to play'));
      return card;
    }
    var p = person(slug), face;
    if (opts.live){
      face = btn('lk-face');
      face.setAttribute('aria-label', 'Close-up of ' + p.name);
      face.setAttribute('aria-haspopup', 'dialog');
      face.setAttribute('data-slug', slug);
    } else {
      face = el('span', 'lk-face');
      face.setAttribute('aria-hidden', 'true');
    }
    var pl = plate(slug);
    pl.setAttribute('aria-hidden', 'true');
    face.appendChild(pl);
    card.appendChild(face);
    var nm = el('span', 'lk-card__name', p.name);
    nm.title = p.name;
    card.appendChild(nm);
    card.appendChild(el('span', 'lk-card__sector', p.sector || 'Other'));
    card.appendChild(el('span', 'lk-card__cap num', 'Cap ' + st.sal[slug]));
    if (opts.captain){
      var c = el('span', 'lk-card__c', 'C');
      c.title = 'Captain: counts ' + C.CAPTAIN_MULT + ' times';
      c.setAttribute('aria-hidden', 'true');
      card.appendChild(c);
      card.appendChild(el('span', 'v2-sr', ' (captain)'));
    }
    return card;
  }
  function buildReels(){
    clear(reelsBox);
    st.reels = [];
    for (var i = 0; i < N; i++){
      var reel = el('div', 'lk-reel');
      var win = el('div', 'lk-window');
      var strip = el('div', 'lk-strip');
      win.appendChild(strip);
      reel.appendChild(win);
      var chip = el('p', 'lk-chip num', '');
      reel.appendChild(chip);
      var hold = btn('lk-hold', 'Hold');
      hold.setAttribute('data-i', String(i));
      reel.appendChild(hold);
      reelsBox.appendChild(reel);
      st.reels.push({ win: win, strip: strip, chip: chip, hold: hold });
    }
  }
  function resetMachine(){
    st.gen++;
    st.team = null; st.captain = null; st.held = [false, false, false, false, false]; st.spinning = false;
    st.reels.forEach(function(r, i){
      clear(r.strip);
      r.strip.style.transition = 'none';
      r.strip.style.transform = 'translateY(0)';
      r.strip.appendChild(cardFor(null, { index: i }));
      clear(r.chip);
      r.win.className = 'lk-window';
      r.hold.textContent = 'Hold';
      r.hold.setAttribute('aria-pressed', 'false');
      r.hold.setAttribute('aria-label', 'Hold slot ' + (i + 1));
    });
    clear(capV).appendChild(document.createTextNode('— '));
    capV.appendChild(el('small', null, '/ ' + C.CAP));
    clear(ptsV).appendChild(document.createTextNode('—'));
    note.textContent = 'Press Spin for a lucky five.';
    spinBtn.textContent = 'Spin';
    heldNote.hidden = true;
    hideConfirm(true);
    setBusy(false);
  }

  // ---- team picking (always valid: 5 distinct draftable players, cap <= 100); same algorithm as the mockup ----
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
    spinBtn.disabled = b || !st.ready;
    lever.disabled = b || !st.ready;
    useBtn.disabled = b || !st.team;
    st.reels.forEach(function(r){ r.hold.disabled = b || !st.team; });
    reelsBox.setAttribute('aria-busy', b ? 'true' : 'false');
  }
  function pullLever(){
    if (reduced()) return;
    lever.classList.add('is-pulled');
    setTimeout(function(){ lever.classList.remove('is-pulled'); }, 450);
  }
  function spin(){
    if (!st.ready || st.spinning) return;
    hideConfirm(true);
    var keep = [];
    for (var i = 0; i < N; i++) keep.push(st.team && st.held[i] ? st.team[i] : null);
    var moving = [];
    keep.forEach(function(s, i){ if (!s) moving.push(i); });
    if (!moving.length){
      heldNote.textContent = 'All five are held. Release a hold to spin.';
      heldNote.hidden = false;
      say(heldNote.textContent);
      return;
    }
    heldNote.hidden = true;
    var next = pickTeam(keep), gen = st.gen;
    setBusy(true);
    pullLever();
    note.textContent = 'Spinning…';
    st.reels.forEach(function(r, i){ if (!keep[i]) clear(r.chip); });
    if (reduced()){ land(next); return; }
    var left = moving.length;
    moving.forEach(function(i, order){
      animateReel(i, next[i], order, function(){ if (gen === st.gen && --left === 0) land(next); });
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
    spinBtn.textContent = 'Spin again';
    // Spin was disabled while the reels turned, which drops keyboard focus: put it back on Spin
    var ae = document.activeElement;
    if (isOpen() && !cuOpen() && (!ae || ae === document.body || !panel.contains(ae) || ae === lever)) spinBtn.focus();
    renderPayout();
    chase(2600);
    announce();
  }

  // ---- result (real numbers, "points so far this week": same math as the Draft room / store.teamWeek) ----
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
    clear(capV).appendChild(document.createTextNode(String(used) + ' '));
    capV.appendChild(el('small', null, '/ ' + C.CAP));
    st.team.forEach(function(s, i){
      var r = st.reels[i], p = pts(s);
      clear(r.chip);
      if (p == null){ r.chip.appendChild(el('span', 'is-zero', '— pts')); }
      else {
        r.chip.appendChild(el('span', numCls(p), signedTxt(p)));
        r.chip.appendChild(document.createTextNode(' pts'));
      }
      if (s === st.captain) r.chip.appendChild(el('span', 'lk-chip__x', '×' + C.CAPTAIN_MULT));
    });
    var tot = teamTotal();
    clear(ptsV);
    if (tot == null) ptsV.appendChild(el('span', 'is-zero lk-led__none', 'No days scored yet'));
    else ptsV.appendChild(el('span', numCls(tot), signedTxt(tot)));
    var wl = weekLabel();
    note.textContent = wl + (wl ? '. ' : '') + 'Captain ' + person(st.captain).name + ' counts ' + C.CAPTAIN_MULT + ' times. ' + (C.CAP - used) + ' cap left.';
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
    if (!st.held[i]) heldNote.hidden = true;
  }

  // ---- use this team (working draft only; never saves) ----
  function showConfirm(){
    var n = F.state.picks.length, saved = F.savedTeam();
    $('lk-confirm-d').textContent = 'Your draft has ' + n + (n === 1 ? ' pick' : ' picks') + ' now. ' +
      (saved ? 'Your saved team stays saved until you press Save team.' : 'Nothing is saved until you press Save team.');
    confirmBox.hidden = false;
    yesBtn.focus();
  }
  function hideConfirm(silent){
    if (!confirmBox || confirmBox.hidden) return;
    confirmBox.hidden = true;
    if (!silent && !useBtn.disabled) useBtn.focus();
  }
  function useTeam(){
    if (!st.team || st.spinning) return;
    if (F.state.picks.length && confirmBox.hidden){ showConfirm(); return; }
    applyTeam();
  }
  function applyTeam(){
    var team = st.team.slice(), cap = st.captain;
    F.clearPicks();
    team.forEach(function(s){ F.addPick(s); });
    F.setCaptain(cap);
    if (F.state.picks.length !== N || F.state.captain !== cap){
      hideConfirm(true);
      note.textContent = 'Could not add all five. Try another spin.';
      say(note.textContent);
      spinBtn.focus();
      return;
    }
    closeLucky(true);
    var msg = 'Lucky five added: ' + team.map(function(s){ return person(s).name; }).join(', ') + '. Captain ' + person(cap).name + '. Save team to lock it in.';
    focusSave();
    say(msg);
  }
  // Focus the Draft room's Save button: side panel on desktop; on phones it lives in the team sheet, so open it.
  function focusSave(){
    var b = document.querySelector('#sidepanel [data-save]');
    if (visibleEl(b) && !b.disabled){ b.focus(); return; }
    var bar = $('barbtn');
    if (mqPhone.matches && visibleEl(bar)){
      bar.focus();
      bar.click();
      var sb = document.querySelector('#sheetpanel [data-save]');
      if (visibleEl(sb) && !sb.disabled){ sb.focus(); return; }
      return;
    }
    if (visibleEl(opener)) opener.focus();
  }

  // ---- Lucky five dialog: open / close, focus trap, Escape, focus return ----
  var opener = null;
  function isOpen(){ return !!dlg && !dlg.hidden; }
  function cuOpen(){ return !!cu && !cu.hidden; }
  function openLucky(from){
    if (!st.ready) return;
    if (!dlg) build();
    // opened from the phone team sheet: close that sheet first (it has its own focus trap) and come back to its button
    if (from && from.hasAttribute('data-lucky-sheet')){
      var sc = $('sheetclose');
      if (sc && !$('sheet').hidden) sc.click();
      from = $('barbtn');
    }
    opener = from || document.activeElement;
    var S = F.state;
    weekSub.textContent = st.pool.length + ' players · cap ' + C.CAP + ' · building for ' + F.fmt.weekName(S.draftWeek) + (S.salaryFallback ? ' (this week\'s cap costs)' : '');
    resetMachine();
    dlg.hidden = false;
    document.documentElement.classList.add('v2-lock');
    Array.prototype.forEach.call(document.querySelectorAll('[data-lucky-open]'), function(b){ b.setAttribute('aria-expanded', 'true'); });
    panel.scrollTop = 0;
    spinBtn.focus();
    chase(3500);
  }
  function closeLucky(noFocus){
    if (!isOpen()) return;
    closeCloseup(true);
    st.gen++; // ignore reels still spinning
    st.spinning = false;
    dlg.hidden = true;
    document.documentElement.classList.remove('v2-lock');
    Array.prototype.forEach.call(document.querySelectorAll('[data-lucky-open]'), function(b){ b.setAttribute('aria-expanded', 'false'); });
    if (!noFocus){
      var back = visibleEl(opener) ? opener : (document.querySelector('.lk-entry:not([hidden]) [data-lucky-open]') || $('main'));
      if (!visibleEl(back)){ var alt = document.querySelector('.dr-head [data-lucky-open]'); back = visibleEl(alt) ? alt : $('barbtn'); }
      if (back) back.focus();
    }
  }
  function focusables(root){
    return Array.prototype.filter.call(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){
      return n.getClientRects().length > 0 && !(cu && !cuOpen() && cu.contains(n));
    });
  }
  function trap(e, root, fallback){
    var f = focusables(root);
    if (!f.length){ e.preventDefault(); fallback.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!root.contains(document.activeElement) || document.activeElement === fallback){ e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', function(e){
    if (!isOpen()) return;
    var esc = e.key === 'Escape' || e.key === 'Esc';
    if (cuOpen()){
      if (esc){ e.preventDefault(); closeCloseup(); return; }
      if (e.key === 'Tab') trap(e, cu.querySelector('.lk-cu__panel'), $('lk-cu-close'));
      return;
    }
    if (esc){
      e.preventDefault();
      if (!confirmBox.hidden) hideConfirm(); else closeLucky();
      return;
    }
    if (e.key === 'Tab') trap(e, panel, panel);
  });

  // ---- close-up ----
  var cuFrom = null, cuT = [];
  function openCloseup(slug, from){
    var p = person(slug), wp = pts(slug), zoom = $('lk-cu-zoom'), face = clear($('lk-cu-face')), pic = portrait(slug);
    cuFrom = from || document.activeElement;
    var src = pic.dollar || pic.img, cartoon = !src;
    if (cartoon) face.innerHTML = FACE;
    else { var im = el('img', 'lk-zoom__img'); im.src = src; im.alt = ''; face.appendChild(im); }
    $('lk-cu-kick').textContent = cartoon ? 'Close-up · Portrait coming soon' : 'Close-up';
    $('lk-cu-name').textContent = p.name + (slug === st.captain ? ' · Captain' : '');
    $('lk-cu-cap').textContent = String(st.sal[slug]);
    var ptd = clear($('lk-cu-pts'));
    if (wp == null) ptd.appendChild(el('span', 'is-zero', 'No points yet'));
    else ptd.appendChild(el('span', numCls(wp), signedTxt(wp)));
    $('lk-cu-ptsk').textContent = 'Points so far this week' + (st.sbWk && st.sbWk.practice ? ' (practice)' : '');
    $('lk-cu-sector').textContent = p.sector || 'Other';
    cuT.forEach(clearTimeout); cuT = [];
    zoom.className = 'lk-zoom' + (cartoon ? ' is-cartoon' : ' is-portrait');
    cu.hidden = false;
    $('lk-cu-close').focus();
    if (reduced()){ zoom.className += ' is-zoomed is-rich is-static'; return; }
    void zoom.offsetWidth;
    cuT.push(setTimeout(function(){ zoom.classList.add('is-zoomed'); }, 30));
    cuT.push(setTimeout(function(){ zoom.classList.add('is-rich', 'is-sparkle'); }, 720));
    cuT.push(setTimeout(function(){ zoom.classList.remove('is-sparkle'); }, 2200));
  }
  function closeCloseup(noFocus){
    if (!cuOpen()) return;
    cuT.forEach(clearTimeout); cuT = [];
    cu.hidden = true;
    clear($('lk-cu-face'));
    if (!noFocus){ var back = visibleEl(cuFrom) ? cuFrom : spinBtn; back.focus(); }
  }

  // ---- wiring ----
  document.addEventListener('click', function(e){
    var t = e.target;
    var open = t.closest && t.closest('[data-lucky-open]');
    if (open){ e.preventDefault(); openLucky(open); return; }
    if (!isOpen()) return;
    if (t === cu){ closeCloseup(); return; }
    if (t === dlg){ closeLucky(); return; }
    var b = t.closest ? t.closest('button') : null;
    if (!b || !dlg.contains(b) || b.disabled) return;
    if (b.id === 'lk-cu-close'){ closeCloseup(); return; }
    if (b.hasAttribute('data-lk-close')){ closeLucky(); return; }
    if (b.hasAttribute('data-lk-spin')){ spin(); return; }
    if (b.hasAttribute('data-lk-use')){ useTeam(); return; }
    if (b.hasAttribute('data-lk-yes')){ applyTeam(); return; }
    if (b.hasAttribute('data-lk-no')){ hideConfirm(); return; }
    if (b.classList.contains('lk-hold')){ toggleHold(+b.getAttribute('data-i')); return; }
    if (b.classList.contains('lk-face') && !st.spinning){ openCloseup(b.getAttribute('data-slug'), b); }
  });

  // ---- ready: wait for the Draft room's store (draft.js started init; init() returns that same promise) ----
  function ready(){
    var S = F.state;
    if (st.ready || !S.loaded || !S.draftWk) return;
    st.sal = F.salaries();
    st.sbWk = S.sbWk;
    st.pool = (S.draftWk.draftable || []).map(function(p){ return p.slug; }).filter(function(s){ return typeof st.sal[s] === 'number'; });
    if (st.pool.length < N) return;
    st.ready = true;
    if (!dlg) build();
    Array.prototype.forEach.call(document.querySelectorAll('.lk-entry'), function(n){ n.hidden = false; });
  }
  F.onChange(function(){ ready(); });
  F.init().then(ready, function(){});
})();
