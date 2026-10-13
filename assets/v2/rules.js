/* Rules page (play-terms.html): the sticky contents bar marks the section being read (aria-current), and keeps the
   current pill in view when the row scrolls sideways on phones. ES5, no globals. Opening a <details> that holds a
   linked anchor is handled site-wide in chrome.js. */
(function(){
  var links = document.querySelectorAll('.rl-toc__list a');
  if (!links.length) return;
  var row = document.querySelector('.rl-toc__list'), items = [], i, cur = null, ticking = false;
  for (i = 0; i < links.length; i++) {
    var id = (links[i].getAttribute('href') || '').slice(1), sec = id && document.getElementById(id);
    if (sec) items.push({ a: links[i], sec: sec });
  }
  function offset(){
    var h = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--v2-chrome-h'), 10) || 104;
    return h + 52 + 24;
  }
  function pick(){
    ticking = false;
    var y = offset(), best = null, j;
    for (j = 0; j < items.length; j++) { if (items[j].sec.getBoundingClientRect().top - y <= 1) best = items[j]; }
    if ((window.innerHeight + (window.pageYOffset || 0)) >= document.documentElement.scrollHeight - 2) best = items[items.length - 1];
    if (best === cur) return;
    if (cur) cur.a.removeAttribute('aria-current');
    cur = best;
    if (!cur) return;
    cur.a.setAttribute('aria-current', 'true');
    if (row && row.scrollWidth > row.clientWidth) {
      var a = cur.a, left = a.offsetLeft - (row.clientWidth - a.offsetWidth) / 2;
      row.scrollLeft = Math.max(0, left);
    }
  }
  function onScroll(){ if (!ticking) { ticking = true; (window.requestAnimationFrame || setTimeout)(pick); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  pick();
})();
