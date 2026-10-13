/* Billionaires Digest: the "How it works" video in the front-page hero (index.html). ES5, no globals.
 *
 * Loaded right after the hero markup (not at the end of <body>) so its listeners are attached before the
 * video's load/error events can fire, and so reduced-motion visitors never see the autoplay start.
 * - Plays muted and loops (attributes in the markup). prefers-reduced-motion: no autoplay; the poster shows
 *   with a large "Play video" button in the middle.
 * - A small Pause/Play toggle sits in the top-right corner (captions are burned in at the bottom).
 *   Same .hw__vbtn styles as the popup (assets/howto.js).
 * - If neither file loads, the video box is hidden and the hero goes back to its one-column layout.
 * - Pauses when scrolled out of view and resumes when back, unless the visitor paused it
 *   (IntersectionObserver; skipped where unsupported).
 */
(function(w, d){
  var hero = d.querySelector('.hm-hero--video');
  var box = hero && hero.querySelector('.hm-hero__media');
  var v = box && box.querySelector('video');
  if (!v) return;
  var btn = box.querySelector('.hw__vbtn');
  var started = false, userPaused = false, scrollPaused = false, dead = false;

  function reduced(){ try { return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
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
    btn.textContent = paused ? 'Play video' : 'Pause video';
    // Before the first play (reduced motion, or autoplay blocked) the button is the big centred one.
    btn.className = 'hw__vbtn' + (paused && !started ? ' hw__vbtn--play' : '');
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
