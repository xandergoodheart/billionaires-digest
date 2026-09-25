/* Billionaires Digest v2: phone MENU sheet (markup from scripts/lib/nav.mjs renderTopbarV2). ES5, no globals.
   Opens from the MENU button, traps focus inside, closes on Escape / Close / backdrop click / link click,
   and returns focus to the MENU button. */
// Phone: scroll the sub-tab row so the current page's tab is visible.
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
