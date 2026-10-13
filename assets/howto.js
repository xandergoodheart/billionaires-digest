/* Billionaires Digest: the "How it works" popup on the Play home (index.html only). ES5, no globals, no dependencies.
 *
 * Opens by itself once, ~1.2 s after load, for first-time visitors: skipped when localStorage has "bd-howto-seen"
 * or "bd-fantasy-v1" holds a team (saved weekly team or a working draft with picks). The hero's "How it works"
 * button (.hm-hero__btn--ghost, href="#how" as the no-JS fallback) opens it every time.
 * Content: a square looping video (assets/video/how-it-works.webm, then .mp4; captions are burned in), the three
 * steps copied from the #how section (one source of wording), "Draft your team, free" and "Close".
 * Missing or broken video files: the video stays hidden (it shows only once its metadata loads) and is removed;
 * only the steps show. prefers-reduced-motion: no autoplay,
 * the poster shows with a play button. Dialog: role="dialog", aria-modal, labelled by its heading; focus moves in and
 * is trapped; Esc, the backdrop and Close close it; focus returns to the opener; page scroll is locked while open.
 * Closing sets "bd-howto-seen".
 */
(function(w, d){
  var SEEN = 'bd-howto-seen', TEAM = 'bd-fantasy-v1', DELAY_MS = 1200;
  var POSTER = 'assets/video/how-it-works-poster.webp';
  var SOURCES = [['assets/video/how-it-works.webm', 'video/webm'], ['assets/video/how-it-works.mp4', 'video/mp4']];
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

  var trigger = d.querySelector('.hm-hero__btn--ghost');
  var root = null, panel = null, video = null, vbtn = null, opener = null, autoTimer = null;
  var scrollSave = null, videoBroken = false;

  function el(tag, cls, text){ var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function lsGet(k){ try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v){ try { w.localStorage.setItem(k, v); } catch (e) {} }
  function reduced(){ try { return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

  function hasTeam(){
    var raw = lsGet(TEAM), s;
    if (!raw) return false;
    try { s = JSON.parse(raw); } catch (e) { return false; }
    if (!s || typeof s !== 'object') return false;
    var t = s.teams;
    if (t && typeof t === 'object') {
      for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k) && t[k] && t[k].picks && t[k].picks.length) return true;
    }
    return !!(s.draft && s.draft.picks && s.draft.picks.length);
  }

  // ---------- video ----------
  function dropVideo(){
    if (!video) return;
    var box = video.parentNode;
    try { video.pause(); } catch (e) {}
    if (box && box.parentNode) box.parentNode.removeChild(box);
    video = null; vbtn = null;
  }
  function broken(){ videoBroken = true; dropVideo(); }
  function syncBtn(){
    if (!video || !vbtn) return;
    var paused = video.paused;
    vbtn.textContent = paused ? 'Play video' : 'Pause video';
    vbtn.className = 'hw__vbtn' + (paused ? ' hw__vbtn--play' : '');
  }
  function buildVideo(){
    // Hidden until the file's metadata loads, so a missing file never flashes an empty box.
    var box = el('div', 'hw__media');
    box.hidden = true;
    var v = d.createElement('video');
    v.className = 'hw__video';
    v.muted = true; v.setAttribute('muted', '');
    v.setAttribute('playsinline', ''); v.setAttribute('loop', '');
    v.setAttribute('preload', 'metadata');
    v.setAttribute('poster', POSTER);
    v.setAttribute('aria-label', 'How it works, short video with captions');
    if (!reduced()) { v.autoplay = true; v.setAttribute('autoplay', ''); }
    var last = null;
    for (var i = 0; i < SOURCES.length; i++) {
      var s = d.createElement('source');
      s.src = SOURCES[i][0]; s.type = SOURCES[i][1];
      v.appendChild(s); last = s;
    }
    // A missing or unplayable file fires "error" on the last <source>, not on the video.
    if (last) last.addEventListener('error', broken);
    v.addEventListener('error', broken);
    v.addEventListener('loadedmetadata', function(){ box.hidden = false; });
    v.addEventListener('play', syncBtn);
    v.addEventListener('pause', syncBtn);
    box.appendChild(v);
    var b = el('button', 'hw__vbtn', 'Play video');
    b.type = 'button';
    b.addEventListener('click', function(){
      if (!video) return;
      if (video.paused) { var p = video.play(); if (p && p.then) p.then(null, function(){}); }
      else video.pause();
    });
    box.appendChild(b);
    video = v; vbtn = b;
    syncBtn();
    return box;
  }

  // ---------- dialog ----------
  function build(){
    root = el('div', 'hw');
    root.hidden = true;
    panel = el('div', 'hw__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'hw-h');
    var h = el('h2', 'hw__h', 'How it works');
    h.id = 'hw-h'; h.tabIndex = -1;
    panel.appendChild(h);
    panel.appendChild(el('div', 'hw__slot'));
    var src = d.querySelector('#how .hm-steps__list');
    if (src) {
      var steps = src.cloneNode(true);
      steps.className += ' hw__steps';
      panel.appendChild(steps);
    }
    var acts = el('div', 'hw__acts');
    var go = el('a', 'v2-btn v2-btn--primary hw__btn', 'Draft your team, free');
    go.href = 'draft.html';
    go.addEventListener('click', markSeen);
    var close = el('button', 'v2-btn v2-btn--ghost hw__btn', 'Close');
    close.type = 'button';
    close.addEventListener('click', hide);
    acts.appendChild(go); acts.appendChild(close);
    panel.appendChild(acts);
    root.appendChild(panel);
    // mousedown on the backdrop would otherwise move focus to <body> before the click closes the dialog
    root.addEventListener('mousedown', function(e){ if (e.target === root) e.preventDefault(); });
    root.addEventListener('click', function(e){ if (e.target === root) hide(); });
    root.addEventListener('keydown', onKey);
    d.body.appendChild(root);
  }

  function focusables(){
    var list = panel.querySelectorAll(FOCUSABLE), out = [];
    for (var i = 0; i < list.length; i++) if (list[i].offsetWidth || list[i].offsetHeight || list[i].getClientRects().length) out.push(list[i]);
    return out;
  }
  function onKey(e){
    var k = e.key || '';
    if (k === 'Escape' || k === 'Esc' || e.keyCode === 27) { e.preventDefault(); hide(); return; }
    if (k !== 'Tab' && e.keyCode !== 9) return;
    var f = focusables();
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], a = d.activeElement;
    if (e.shiftKey && (a === first || !panel.contains(a) || a === panel.querySelector('#hw-h'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !panel.contains(a))) { e.preventDefault(); first.focus(); }
  }
  // Focus that escapes the dialog (e.g. a click on the page behind it on some browsers) is pulled back in.
  function onFocusIn(e){
    if (root && !root.hidden && !panel.contains(e.target)) { var h = panel.querySelector('#hw-h'); if (h) h.focus(); }
  }

  function lockScroll(on){
    var de = d.documentElement, b = d.body;
    if (on) {
      scrollSave = { de: de.style.overflow, b: b.style.overflow };
      de.style.overflow = 'hidden'; b.style.overflow = 'hidden';
    } else if (scrollSave) {
      de.style.overflow = scrollSave.de; b.style.overflow = scrollSave.b; scrollSave = null;
    }
  }

  function show(from){
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    if (!root) build();
    if (!root.hidden) return;
    opener = from || (d.activeElement && d.activeElement !== d.body ? d.activeElement : null);
    var slot = panel.querySelector('.hw__slot');
    if (slot && !video && !videoBroken) { while (slot.firstChild) slot.removeChild(slot.firstChild); slot.appendChild(buildVideo()); }
    root.hidden = false;
    lockScroll(true);
    d.addEventListener('focusin', onFocusIn, true);
    panel.scrollTop = 0;
    var h = panel.querySelector('#hw-h');
    if (h) h.focus();
  }
  function markSeen(){ lsSet(SEEN, '1'); }
  function hide(){
    if (!root || root.hidden) return;
    markSeen();
    d.removeEventListener('focusin', onFocusIn, true);
    dropVideo();   // stop playback and free the download; rebuilt on the next open
    root.hidden = true;
    lockScroll(false);
    var o = opener; opener = null;
    if (o && o.focus && d.body.contains(o)) { try { o.focus(); } catch (e) {} }
  }

  if (trigger) {
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', function(e){
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      show(trigger);
    });
  }

  if (!lsGet(SEEN) && !hasTeam()) {
    autoTimer = setTimeout(function(){
      autoTimer = null;
      var menu = d.getElementById('v2-menu');
      if (menu && !menu.hidden) return;   // the visitor is already in the menu; don't stack dialogs
      if (lsGet(SEEN)) return;
      show(null);
    }, DELAY_MS);
  }
})(window, document);
