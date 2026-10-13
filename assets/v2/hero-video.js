/* Billionaires Digest: the "How it works" video in the front-page hero (index.html). ES5, no globals.
 *
 * Loaded right after the hero markup (not at the end of <body>) so its listeners are attached before the
 * video's load/error events can fire, and so reduced-motion visitors never see the autoplay start.
 * - Plays muted and loops (attributes in the markup). prefers-reduced-motion: no autoplay; the poster shows
 *   with a large "Play video" button in the middle.
 * - A round icon-only Pause/Play button (.hm-vbtn) sits in the bottom-right corner of the video, clear of the
 *   progress dashes at the top. Before the first play it becomes the large centred "Play video" button
 *   (.hw__vbtn--play styles).
 * - The hero's "How it works" link scrolls to the #how steps (smooth; instant with reduced motion) and moves
 *   focus there. This part runs even without the video.
 * - If neither file loads, the video box is hidden and the hero goes back to its one-column layout.
 * - Pauses when scrolled out of view and resumes when back, unless the visitor paused it
 *   (IntersectionObserver; skipped where unsupported).
 */
(function(w, d){
  function reduced(){ try { return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

  // "How it works" -> the steps section below the hero.
  var howLink = d.querySelector('.hm-hero__btn--ghost[href="#how"]');
  if (howLink) howLink.addEventListener('click', function(ev){
    var target = d.getElementById('how');
    if (!target) return;
    if (ev.preventDefault) ev.preventDefault();
    try { target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }
    catch (e) { target.scrollIntoView(true); }
    try { target.focus({ preventScroll: true }); } catch (e2) {}
    try { if (w.history && w.history.replaceState) w.history.replaceState(null, '', '#how'); } catch (e3) {}
  });

  var hero = d.querySelector('.hm-hero--video');
  var box = hero && hero.querySelector('.hm-hero__media');
  var v = box && box.querySelector('video');
  if (!v) return;
  var btn = box.querySelector('.hm-vbtn');
  var started = false, userPaused = false, scrollPaused = false, dead = false;

  function play(){ try { var p = v.play(); if (p && p.then) p.then(null, function(){}); } catch (e) {} }
  function pause(){ try { v.pause(); } catch (e) {} }

  if (reduced()) { v.autoplay = false; v.removeAttribute('autoplay'); pause(); }

  function fail(){
    if (dead) return;
    dead = true;
    pause();
    box.hidden = true;
    hero.className = hero.className.replace(/\s*\bhm-hero--video\b/, '');
  }
  function sync(){
    if (!btn || dead) return;
    var paused = v.paused;
    btn.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    // Before the first play (reduced motion, or autoplay blocked) the button is the big centred one with text.
    btn.className = paused && !started ? 'hw__vbtn hw__vbtn--play' : 'hm-vbtn' + (paused ? ' is-paused' : '');
  }

  // A missing or unplayable file fires "error" on the last <source>, not on the video.
  var srcs = v.getElementsByTagName('source');
  if (srcs.length) srcs[srcs.length - 1].addEventListener('error', fail);
  v.addEventListener('error', fail);
  v.addEventListener('play', function(){ started = true; sync(); });
  v.addEventListener('pause', sync);

  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function(){
      if (v.paused) { userPaused = false; scrollPaused = false; play(); }
      else { userPaused = true; pause(); }
    });
    sync();
  }

  if ('IntersectionObserver' in w) {
    var io = new w.IntersectionObserver(function(entries){
      var e = entries[entries.length - 1];
      if (dead) return;
      if (!e.isIntersecting) {
        if (!v.paused) { scrollPaused = true; pause(); }
      } else if (scrollPaused && !userPaused) {
        scrollPaused = false; play();
      }
    }, { threshold: 0.2 });
    io.observe(box);
  }
})(window, document);
