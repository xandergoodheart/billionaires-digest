/* Billionaires Digest: the launch gate. ES5, no globals except BDLaunch (read-only info).
 *
 * Load it as a plain (not deferred) script in the <head> of every page that stays closed until Season 1:
 *   <script src="assets/launch.js"></script>
 * Including the script is what marks a page as gated. It reads config/launch.json (the ONE switch):
 *   { "gate": true, "seasonStart": "2026-11-09", "seasonStartLabel": "Monday, Nov 9" }
 * While the file loads, the page's <main> is hidden (no flash of gated content). Then:
 *   gate true  -> the page's own content stays hidden and an "Opens Nov 9" card linking to the waitlist is shown
 *   gate false -> the page shows as normal
 *   file missing, broken or slow (> 3 s) -> fail OPEN: the page shows as normal.
 * The page's own scripts still run (their elements stay in the DOM, only hidden), so nothing throws.
 */
(function(w, d){
  var TIMEOUT_MS = 3000;
  var root = d.documentElement;
  var here = (d.currentScript && d.currentScript.src) || '';
  var CONFIG_URL = here ? here.replace(/assets\/launch\.js(\?.*)?$/, 'config/launch.json') : 'config/launch.json';
  var HOME_URL = here ? here.replace(/assets\/launch\.js(\?.*)?$/, '') : './';
  var NEWS_URL = HOME_URL + 'news.html';

  // Styles live here so gated pages need only the one script tag. Colours come from the v2 tokens, with fallbacks.
  var css =
    'html.bd-gate-pending main{visibility:hidden}' +
    'html.bd-gated main>:not(.bd-gate){display:none !important}' +
    'html.bd-gated main{visibility:visible}' +
    '.bd-gate{box-sizing:border-box;max-width:640px;margin:32px auto 48px;padding:24px;border-radius:10px;' +
      'background:var(--card,#fff);color:var(--text,#121417);box-shadow:var(--shadow,0 1px 2px rgba(16,18,20,.08),0 0 0 1px rgba(16,18,20,.04));' +
      'font-family:var(--font-body,Barlow,Arial,sans-serif)}' +
    '@media (max-width:767px){.bd-gate{margin:16px;padding:16px}}' +
    '.bd-gate__kick{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--brand-ink,#C1231E);margin:0 0 8px}' +
    '.bd-gate__h{font-family:var(--font-display,"Barlow Condensed","Arial Narrow",Arial,sans-serif);font-weight:800;text-transform:uppercase;' +
      'font-size:40px;line-height:1;margin:0 0 12px;color:var(--text,#121417)}' +
    '.bd-gate__p{margin:0 0 16px;color:var(--text-muted,#555C66);font-size:16px;line-height:1.45}' +
    '.bd-gate__row{display:flex;flex-wrap:wrap;gap:10px}' +
    '.bd-gate__btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 22px;border-radius:999px;' +
      'font-weight:700;font-size:15px;text-decoration:none;border:1px solid var(--brand,#D62D27);background:var(--brand,#D62D27);color:#fff}' +
    '.bd-gate__btn--ghost{background:transparent;color:var(--text,#121417);border-color:var(--line-2,#8A919B)}' +
    '.bd-gate__btn:focus-visible{outline:3px solid var(--focus,#2359C4);outline-offset:2px}';
  var style = d.createElement('style');
  style.setAttribute('data-bd-launch', '');
  style.appendChild(d.createTextNode(css));
  (d.head || root).appendChild(style);

  root.className += (root.className ? ' ' : '') + 'bd-gate-pending';

  var done = false;
  function removeClass(c){ root.className = (' ' + root.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, ''); }
  function open(){ if (done) return; done = true; removeClass('bd-gate-pending'); }

  function shortLabel(cfg){
    // "Monday, Nov 9" -> "Nov 9"; else from seasonStart "2026-11-09" -> "Nov 9"
    var l = String(cfg.seasonStartLabel || '');
    var m = /,\s*(.+)$/.exec(l);
    if (m) return m[1];
    var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(cfg.seasonStart || ''));
    var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (iso && +iso[2] >= 1 && +iso[2] <= 12) return MON[+iso[2] - 1] + ' ' + (+iso[3]);
    return l || 'soon';
  }
  function el(tag, cls, text){ var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function card(cfg){
    var short = shortLabel(cfg), long = String(cfg.seasonStartLabel || short);
    var sec = el('section', 'bd-gate');
    sec.setAttribute('aria-labelledby', 'bd-gate-h');
    sec.appendChild(el('span', 'bd-gate__kick', 'Billionaire Fantasy League · Season 1'));
    var h = el('h1', 'bd-gate__h', 'Opens ' + short);
    h.id = 'bd-gate-h';
    sec.appendChild(h);
    sec.appendChild(el('p', 'bd-gate__p', 'This part of Billionaires Digest opens with Season 1 on ' + long +
      '. Join the free waitlist to save your spot in line, pick your captain and reserve your league.'));
    var row = el('div', 'bd-gate__row');
    var a = el('a', 'bd-gate__btn', 'Join the waitlist'); a.href = HOME_URL;
    var b = el('a', 'bd-gate__btn bd-gate__btn--ghost', "Read today's Digest"); b.href = NEWS_URL;
    row.appendChild(a); row.appendChild(b);
    sec.appendChild(row);
    return sec;
  }

  function gate(cfg){
    if (done) return;
    function apply(){
      if (done) return;
      var main = d.querySelector('main');
      if (!main) { open(); return; }
      main.insertBefore(card(cfg), main.firstChild);
      root.className += ' bd-gated';
      done = true;
      removeClass('bd-gate-pending');
      try { d.title = 'Opens ' + shortLabel(cfg) + ' · Billionaires Digest'; } catch (e) {}
    }
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', apply); else apply();
  }

  w.BDLaunch = { gated: null };
  setTimeout(open, TIMEOUT_MS);   // fail open if the switch is slow
  function decide(cfg){
    if (cfg && cfg.gate === true) { w.BDLaunch.gated = true; gate(cfg); }
    else { w.BDLaunch.gated = false; open(); }
  }
  try {
    if (w.fetch) {
      // no-store: flipping the switch must take effect on the next page view, not after the HTTP cache expires
      w.fetch(CONFIG_URL, { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(decide, function(){ open(); });
    } else {
      var x = new XMLHttpRequest();
      x.open('GET', CONFIG_URL + '?v=' + Date.now(), true);
      x.onreadystatechange = function(){
        if (x.readyState !== 4) return;
        var cfg = null;
        if (x.status >= 200 && x.status < 300) { try { cfg = JSON.parse(x.responseText); } catch (e) { cfg = null; } }
        decide(cfg);
      };
      x.onerror = function(){ open(); };
      x.send();
    }
  } catch (e) { open(); }
})(window, document);
