/* Billionaires Digest v2: sticky top bar (scroll shadow, height variable), sub-tab pills, and the phone MENU sheet (markup from scripts/lib/nav.mjs renderTopbarV2). ES5, no globals.
   Opens from the MENU button, traps focus inside, closes on Escape / Close / backdrop click / link click,
   and returns focus to the MENU button. */
// Cloudflare preview (*.pages.dev): label the page as a prototype.
(function(){ if (!/\.pages\.dev$/.test(location.hostname)) return; var b = document.createElement('div'); b.className = 'v2-proto'; b.innerHTML = 'Prototype: Billionaires Digest v2 preview, not the live site. <a href="https://billionairesdigest.com">Go to the live site</a>'; document.body.insertBefore(b, document.body.firstChild); })();
// Sticky top bar: a soft shadow once the page has scrolled (.is-scrolled; passive listener, the class only swaps a
// box-shadow, and reduced motion drops its transition in ui.css), and --v2-chrome-h on <html> = the header's height,
// used by scroll-padding and sticky panels so they sit below the bar.
(function(){
  var top = document.querySelector('.v2-top');
  if (!top) return;
  var root = document.documentElement, on = null, h = -1;
  function scrolled(){ var s = (window.pageYOffset || root.scrollTop || 0) > 4; if (s !== on) { on = s; if (s) top.classList.add('is-scrolled'); else top.classList.remove('is-scrolled'); } }
  function measure(){ var n = top.offsetHeight; if (n && n !== h) { h = n; root.style.setProperty('--v2-chrome-h', n + 'px'); } }
  scrolled(); measure();
  window.addEventListener('scroll', scrolled, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
})();
// Sub-tab pills: when the row scrolls sideways (phones), bring the current page's pill into view.
(function(){ var a = document.querySelector('.v2-subtabs [aria-current="page"]'), row = a && a.closest('.v2-subtabs__list'); if (row && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, a.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft - (row.clientWidth - a.offsetWidth) / 2); })();
(function(){
  var btn = document.querySelector('.v2-menubtn');
  var menu = document.getElementById('v2-menu');
  if (!btn || !menu) return;
  var panel = menu.querySelector('.v2-menu__panel') || menu;
  var lastFocus = null;

  function focusables(){
    return Array.prototype.filter.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){
      return n.getClientRects().length > 0;
    });
  }
  function isOpen(){ return !menu.hasAttribute('hidden'); }
  function open(){
    lastFocus = document.activeElement;
    menu.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('v2-lock');
    var cur = panel.querySelector('ul ul a[aria-current]') || panel.querySelector('a[aria-current]');
    var f = focusables();
    (cur || f[0] || panel).focus();
  }
  function close(noFocus){
    if (!isOpen()) return;
    menu.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('v2-lock');
    if (!noFocus){
      var back = lastFocus && document.contains(lastFocus) && lastFocus.getClientRects().length ? lastFocus : btn;
      back.focus();
    }
  }

  btn.addEventListener('click', function(){ if (isOpen()) close(); else open(); });
  menu.addEventListener('click', function(e){
    var t = e.target;
    if (t === menu) { close(); return; }
    if (t.closest && t.closest('[data-menu-close]')) { close(); return; }
    if (t.closest && t.closest('a[href]')) close(true);
  });
  document.addEventListener('keydown', function(e){
    if (!isOpen()) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) { e.preventDefault(); panel.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // leaving the phone layout closes the sheet
  if (window.matchMedia) {
    var mq = window.matchMedia('(max-width: 767px)');
    var onMq = function(){ if (!mq.matches) close(true); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }
})();
// Preseason / Season 1 copy: elements marked data-preseason show until Season 1 starts (BDFantasyCore.SEASON_START_WEEK,
// Mon Nov 9 in New York); elements marked data-inseason (hidden in the HTML) show from then on. Needs
// assets/fantasy-core.js on the page; uses the ?now= test clock (BDFantasyStore.now, or the same parameter here).
(function(){
  function run(){
    var C = window.BDFantasyCore;
    if (!C || !C.seasonStarted) return;
    var t = Date.now(), F = window.BDFantasyStore;
    if (F && F.now) t = F.now();
    else { var m = /[?&]now=([^&]+)/.exec(location.search || ''), x = m ? Date.parse(decodeURIComponent(m[1])) : NaN; if (isFinite(x)) t = x; }
    var on = C.seasonStarted(t);
    var pre = document.querySelectorAll('[data-preseason]'), ins = document.querySelectorAll('[data-inseason]'), i;
    for (i = 0; i < pre.length; i++) pre[i].hidden = on;
    for (i = 0; i < ins.length; i++) ins[i].hidden = !on;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
// Anchor links into folded content: when the URL's #target sits inside a closed <details>, open it so the jump lands
// on visible text (on load and on later hash changes).
(function(){
  function openTarget(){
    var id = (location.hash || '').slice(1), el = null;
    if (!id) return;
    try { el = document.getElementById(decodeURIComponent(id)); } catch (e) { el = document.getElementById(id); }
    if (!el) return;
    var n = el, opened = false;
    while (n && n !== document.body) { if (n.tagName === 'DETAILS' && !n.open) { n.open = true; opened = true; } n = n.parentNode; }
    if (opened && el.scrollIntoView) el.scrollIntoView();
  }
  // Run now too (this script loads at the end of <body>), before page scripts such as book.js rewrite the hash.
  openTarget();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openTarget);
  window.addEventListener('hashchange', openTarget);
})();
// Accounts: shows the top-bar account controls (markup from scripts/lib/nav.mjs accountTop/accountMenu, all hidden) only
// when config/supabase.json turns on "authGoogle" or "authPassword", and loads the sign-up / log-in dialog
// (assets/v2/auth.js + auth-core.js + auth.css, and assets/game-client.js / fantasy-core.js when the page has none) on
// first use. State comes from the stored Supabase session (localStorage 'bd-game-auth'; no network call here):
// no session or a guest (anonymous) session -> [data-auth-guest]; a real account (email or Google) -> [data-auth-user].
// Exposes window.BDAuthBoot: { flags(): Promise<{google,password,any}>, state(), load(): Promise<BDAuth>, open(mode, opener),
// refresh(), nudge(container) }.
(function(w, d){
  var here = (d.currentScript && d.currentScript.src) || '';
  var BASE = here ? here.replace(/assets\/v2\/chrome\.js(\?.*)?$/, '') : '';
  var KEY = 'bd-game-auth', NICK = 'bd-acct-nick', NUDGE_OFF = 'bd-acct-nudge-off', PENDING = 'bd-auth-pending';
  var flagsP = null, loadP = null, st = { flags: { google: false, password: false, any: false }, user: null, real: false };
  function lsGet(k){ try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v){ try { w.localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k){ try { return w.sessionStorage.getItem(k); } catch (e) { return null; } }
  function all(sel){ return Array.prototype.slice.call(d.querySelectorAll(sel)); }
  function storedUser(){
    try { var s = JSON.parse(lsGet(KEY) || 'null'); return (s && (s.user || (s.currentSession && s.currentSession.user))) || null; } catch (e) { return null; }
  }
  function flags(){
    if (!flagsP) flagsP = fetch(BASE + 'config/supabase.json')
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(c){
        var on = !!(c && c.enabled !== false), g = on && c.authGoogle === true, p = on && c.authPassword === true;
        return { google: g, password: p, any: g || p };
      }, function(){ return { google: false, password: false, any: false }; });
    return flagsP;
  }
  function initials(s){
    s = String(s || '').replace(/@.*$/, '').replace(/[^A-Za-z0-9]+/g, ' ').trim();
    if (!s) return '?';
    var p = s.split(' '), c = /^([A-Za-z])[a-z0-9]*([A-Z])/.exec(s);
    return (p.length > 1 ? p[0].charAt(0) + p[1].charAt(0) : (c ? c[1] + c[2] : s.charAt(0))).toUpperCase();
  }
  function nickFor(u){ try { var n = JSON.parse(lsGet(NICK) || 'null'); return n && u && n.id === u.id ? n.nick : ''; } catch (e) { return ''; } }
  function apply(){
    var u = storedUser();
    st.user = u;
    st.real = !!(u && u.is_anonymous !== true && u.email);
    var on = st.flags.any;
    all('[data-auth-guest]').forEach(function(n){ n.hidden = !(on && !st.real); });
    all('[data-auth-user]').forEach(function(n){ n.hidden = !(on && st.real); });
    if (!(on && st.real)) { closeMenu(true); return; }
    var nick = nickFor(u), email = u.email || '';
    all('[data-auth-initials]').forEach(function(n){ n.textContent = initials(nick || email); });
    all('[data-auth-nick]').forEach(function(n){ n.textContent = nick; });
    all('[data-auth-email]').forEach(function(n){ n.textContent = email; });
    all('.v2-acct__btn .v2-sr').forEach(function(n){ n.textContent = 'Your account' + (nick ? ': ' + nick : ''); });
  }
  function loadScript(src){
    return new Promise(function(res, rej){
      var s = d.createElement('script');
      s.src = BASE + src; s.async = false;
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('Could not load ' + src + '. Check your connection and try again.')); };
      d.body.appendChild(s);
    });
  }
  function load(){
    if (loadP) return loadP;
    if (!d.querySelector('link[href$="assets/v2/auth.css"]')) {
      var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = BASE + 'assets/v2/auth.css'; d.head.appendChild(l);
    }
    var need = [];
    if (!w.BDGame) need.push('assets/game-client.js');
    if (!w.BDFantasyCore) need.push('assets/fantasy-core.js');
    if (!w.BDAuthCore) need.push('assets/v2/auth-core.js');
    if (!w.BDAuth) need.push('assets/v2/auth.js');
    loadP = need.reduce(function(p, src){ return p.then(function(){ return loadScript(src); }); }, Promise.resolve())
      .then(function(){ if (!w.BDAuth) throw new Error('Accounts could not start.'); return w.BDAuth; });
    loadP.then(null, function(){ loadP = null; });
    return loadP;
  }
  // close the phone MENU sheet first, so the dialog is not stacked on it; focus then returns to the MENU button
  function leaveMenu(from){
    var sheet = d.getElementById('v2-menu');
    if (!sheet || sheet.hidden || !(from && sheet.contains(from))) return from;
    var c = sheet.querySelector('[data-menu-close]'); if (c) c.click();
    return d.querySelector('.v2-menubtn') || from;
  }
  function open(mode, opener){
    return load().then(function(A){ return A.open({ mode: mode || 'signup', opener: opener || d.activeElement }); }, function(e){
      if (w.alert) w.alert(e.message);
    });
  }
  function logout(){ return load().then(function(A){ return A.logout(); }); }

  // the round avatar's small menu (a disclosure: button + list of links)
  var acctBtn = null, acctMenu = null;
  function closeMenu(noFocus){
    if (!acctMenu || acctMenu.hidden) return;
    acctMenu.hidden = true; acctBtn.setAttribute('aria-expanded', 'false');
    if (!noFocus) acctBtn.focus();
  }
  function setupMenu(){
    acctBtn = d.querySelector('.v2-acct__btn'); acctMenu = d.getElementById('v2-acct-menu');
    if (!acctBtn || !acctMenu) return;
    acctBtn.addEventListener('click', function(){
      if (acctMenu.hidden) { acctMenu.hidden = false; acctBtn.setAttribute('aria-expanded', 'true'); var f = acctMenu.querySelector('a,button'); if (f) f.focus(); }
      else closeMenu();
    });
    acctMenu.addEventListener('keydown', function(e){ if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeMenu(); } });
    acctBtn.addEventListener('keydown', function(e){ if ((e.key === 'Escape' || e.key === 'Esc') && !acctMenu.hidden) { e.preventDefault(); closeMenu(); } });
    d.addEventListener('click', function(e){ if (!acctMenu.hidden && !acctMenu.parentNode.contains(e.target)) closeMenu(true); });
    acctMenu.parentNode.addEventListener('focusout', function(e){
      var to = e.relatedTarget;
      if (to && !acctMenu.parentNode.contains(to)) closeMenu(true);
    });
  }

  // "Save your team everywhere: create a free account" (front-page roster card, Draft room after the first save).
  // Shown only with an auth flag on, without a real account, and until dismissed (remembered in localStorage).
  function nudge(container){
    if (!container || lsGet(NUDGE_OFF) === '1') return null;
    var old = container.querySelector('.v2-nudge'); if (old) old.parentNode.removeChild(old);
    var p = d.createElement('p'); p.className = 'v2-nudge'; p.hidden = true;
    var t = d.createElement('span'); t.className = 'v2-nudge__t';
    t.appendChild(d.createTextNode('Save your team everywhere: '));
    var b = d.createElement('button'); b.type = 'button'; b.className = 'v2-nudge__go'; b.setAttribute('data-auth-open', 'signup');
    b.textContent = 'create a free account'; t.appendChild(b); p.appendChild(t);
    var x = d.createElement('button'); x.type = 'button'; x.className = 'v2-nudge__x'; x.setAttribute('aria-label', 'Dismiss: save your team everywhere');
    x.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
    x.addEventListener('click', function(){
      lsSet(NUDGE_OFF, '1');
      var scope = (container.closest && container.closest('section')) || container, h = scope.querySelector('h2,h3') || container;
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      p.parentNode && p.parentNode.removeChild(p);
      h.focus();
    });
    p.appendChild(x);
    container.appendChild(p);
    flags().then(function(f){ p.hidden = !(f.any && !st.real && lsGet(NUDGE_OFF) !== '1'); });
    return p;
  }

  w.BDAuthBoot = {
    flags: flags, load: load, open: open, nudge: nudge,
    state: function(){ return { flags: st.flags, user: st.user, real: st.real }; },
    refresh: function(){ apply(); all('.v2-nudge').forEach(function(n){ if (st.real) n.hidden = true; }); }
  };

  setupMenu();
  d.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null;
    var o = t && t.closest('[data-auth-open]');
    if (o) { e.preventDefault(); closeMenu(true); open(o.getAttribute('data-auth-open'), leaveMenu(o)); return; }
    var lo = t && t.closest('[data-auth-logout]');
    if (lo) { e.preventDefault(); leaveMenu(lo); lo.disabled = true; logout().then(null, function(){ lo.disabled = false; }); }
  });
  w.addEventListener('storage', function(e){ if (e.key === KEY || e.key === NICK) apply(); });
  w.addEventListener('bd-auth-change', function(){ w.BDAuthBoot.refresh(); });
  flags().then(function(f){
    st.flags = f;
    apply();
    if (!f.any) return;
    // back from Google (or a link in an email): finish the sign-in, nickname step and team carry-over
    var url = String(w.location.hash || '') + String(w.location.search || '');
    if (/access_token=|error_description=|[#&?]error=/.test(url) || ssGet(PENDING)) load().then(function(A){ A.resume(); }, function(){});
  });
})(window, document);
