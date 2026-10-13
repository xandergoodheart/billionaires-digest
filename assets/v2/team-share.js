/* Billionaires Digest: "Share your team" (home page side column, under the "Your team" roster card). ES5, IIFE, no external libraries.
   The share image is drawn in the browser with <canvas> (nothing is uploaded): the BD mark, "My Billionaire Fantasy team",
   the week, the five picks as INITIALS circles + names (no portraits: real people's likenesses never go into shared
   images), a "C" captain badge, this week's team points (or "Drafted, scoring starts <day>"), and the footer.
   Two sizes: 1080x1350 (portrait, Instagram) and 1200x630 (wide, X and link previews).
   BDTeamShare.build(info) -> { card: <section> } (a compact side card for the home page's side column)
     info = { week: 'Week of Oct 12', total: number|null, startDay: 'Mon Oct 19'|null,
              picks: [{ name, captain: bool, pts: number|null }] }
   Play money only. */
(function(){
  var URL_SHARE = 'https://billionairesdigest.com/?utm_source=share&utm_medium=social&utm_campaign=team';
  var MINUS = '−';
  var SIZES = { portrait: { w: 1080, h: 1350, file: 'billionaires-digest-team.png' }, wide: { w: 1200, h: 630, file: 'billionaires-digest-team-wide.png' } };
  var COL = { bg: '#0B0B0C', card: '#17191C', line: '#2A2D31', red: '#D62D27', white: '#FFFFFF', muted: '#B9BFC7', pos: '#3CC985', neg: '#FF6B64', chip: '#2A2D31' };
  var DISP = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif', BODY = 'Barlow, "Helvetica Neue", Arial, sans-serif';
  var uid = 0;

  function el(tag, cls, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function initials(name){ return window.BD && BD.initials ? BD.initials(name) : String(name || '?').charAt(0).toUpperCase(); }
  function signed(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function signedAscii(n){ return n > 0 ? '+' + n : (n < 0 ? '\u2212' + Math.abs(n) : String(n)); }
  function hasPts(info){ return typeof info.total === 'number' && isFinite(info.total); }

  function shareText(info){
    return hasPts(info)
      ? 'My Billionaire Fantasy team is ' + signedAscii(info.total) + ' this week. Think you can beat it?'
      : 'I just drafted my Billionaire Fantasy team. Think you can beat it?';
  }
  function intents(info){
    var t = encodeURIComponent(shareText(info)), u = encodeURIComponent(URL_SHARE), tu = encodeURIComponent(shareText(info) + ' ' + URL_SHARE);
    return [
      { id: 'x', label: 'Post on X', href: 'https://x.com/intent/post?text=' + t + '&url=' + u },
      { id: 'threads', label: 'Threads', href: 'https://www.threads.net/intent/post?text=' + tu },
      { id: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + u },
      { id: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/?text=' + tu },
      { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/sharing/share-offsite/?url=' + u }
    ];
  }
  // best effort, never blocks: share_clicked via BDGame.logEvent (only sends when a session already exists)
  function log(via){
    try { if (window.BDGame && BDGame.logEvent) BDGame.logEvent('share_clicked', { kind: 'team', via: via }).then(null, function(){}); } catch (e) {}
  }

  // ---- drawing ----
  function font(w, px, fam){ return w + ' ' + px + 'px ' + fam; }
  function fit(ctx, text, maxW){
    text = String(text || '');
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text.replace(/\s+$/, '') + '…';
  }
  // largest size (down to min) at which text fits on one line
  function fitSize(ctx, text, w, fam, start, min, maxW){
    for (var px = start; px > min; px -= 2){ ctx.font = font(w, px, fam); if (ctx.measureText(text).width <= maxW) return px; }
    ctx.font = font(w, min, fam); return min;
  }
  function wrap(ctx, text, maxW){
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function(wd){
      var t = cur ? cur + ' ' + wd : wd;
      if (cur && ctx.measureText(t).width > maxW){ lines.push(cur); cur = wd; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function rrect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function mark(ctx, x, y, s, nameSize){
    ctx.fillStyle = COL.red; rrect(ctx, x, y, s, s, Math.round(s * 0.1)); ctx.fill();
    ctx.fillStyle = COL.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(800, Math.round(s * 0.58), DISP); ctx.fillText('BD', x + s / 2, y + s / 2 + 2);
    ctx.textAlign = 'left';
    ctx.font = font(700, nameSize, BODY); ctx.fillText('Billionaires Digest', x + s + Math.round(s * 0.28), y + s / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
  // one pick row: card, initials circle (red for the captain), name, C badge, points on the right
  function row(ctx, p, x, y, w, h, o){
    ctx.fillStyle = COL.card; rrect(ctx, x, y, w, h, o.r); ctx.fill();
    var cr = o.circle, cx = x + o.pad + cr, cy = y + h / 2;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fillStyle = p.captain ? COL.red : COL.chip; ctx.fill();
    ctx.fillStyle = COL.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(800, Math.round(cr * 0.9), DISP); ctx.fillText(initials(p.name), cx, cy + 2);
    var right = x + w - o.pad, ptsW = 0;
    if (typeof p.pts === 'number'){
      ctx.font = font(800, o.pts, DISP); ctx.textAlign = 'right';
      ctx.fillStyle = p.pts > 0 ? COL.pos : (p.pts < 0 ? COL.neg : COL.muted);
      var pt = signed(p.pts); ctx.fillText(pt, right, cy + 2); ptsW = ctx.measureText(pt).width + o.pad;
    }
    var nx = cx + cr + o.pad, badge = p.captain ? o.badge + 12 : 0;
    ctx.textAlign = 'left'; ctx.fillStyle = COL.white; ctx.font = font(700, o.name, BODY);
    var nm = fit(ctx, p.name, right - ptsW - nx - badge);
    ctx.fillText(nm, nx, cy + 1);
    if (p.captain){
      var bx = nx + ctx.measureText(nm).width + 12, by = cy - o.badge / 2;
      ctx.fillStyle = COL.red; rrect(ctx, bx, by, o.badge, o.badge, 6); ctx.fill();
      ctx.fillStyle = COL.white; ctx.textAlign = 'center'; ctx.font = font(700, Math.round(o.badge * 0.62), BODY);
      ctx.fillText('C', bx + o.badge / 2, cy + 1);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  function footer(ctx, x, y, w, size){
    ctx.fillStyle = COL.line; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = COL.muted; ctx.font = font(600, size, BODY);
    ctx.fillText(fit(ctx, 'billionairesdigest.com · Free · Play money only', w), x, y + size + 22);
  }
  function drawPortrait(ctx, info){
    var W = 1080, H = 1350, P = 72, CW = W - 2 * P, y;
    ctx.fillStyle = COL.red; ctx.fillRect(0, 0, W, 12);
    mark(ctx, P, 70, 84, 40);
    var tpx = fitSize(ctx, 'My Billionaire Fantasy team', 800, DISP, 96, 60, CW);
    ctx.fillStyle = COL.white; ctx.fillText('My Billionaire Fantasy team', P, 228 + tpx * 0.8);
    ctx.font = font(600, 36, BODY); ctx.fillStyle = COL.muted; ctx.fillText(fit(ctx, info.week || '', CW), P, 380);
    y = 420;
    info.picks.slice(0, 5).forEach(function(p){ row(ctx, p, P, y, CW, 104, { r: 16, pad: 24, circle: 38, name: 40, badge: 40, pts: 52 }); y += 118; });
    y += 50;
    if (hasPts(info)){
      ctx.fillStyle = COL.muted; ctx.font = font(600, 34, BODY); ctx.fillText('This week', P, y);
      ctx.font = font(800, 150, DISP); ctx.fillStyle = info.total > 0 ? COL.pos : (info.total < 0 ? COL.neg : COL.white);
      var tt = signed(info.total); ctx.fillText(tt, P, y + 140);
      var tw = ctx.measureText(tt).width;
      ctx.fillStyle = COL.white; ctx.font = font(700, 40, BODY); ctx.fillText('points', P + tw + 20, y + 136);
    } else {
      ctx.fillStyle = COL.white;
      fitSize(ctx, 'Drafted, scoring starts ' + (info.startDay || 'soon'), 800, DISP, 72, 44, CW);
      ctx.fillText('Drafted, scoring starts ' + (info.startDay || 'soon'), P, y + 50);
      ctx.fillStyle = COL.muted; ctx.font = font(600, 36, BODY); ctx.fillText('Think you can beat it?', P, y + 112);
    }
    footer(ctx, P, H - 110, CW, 30);
  }
  function drawWide(ctx, info){
    var W = 1200, H = 630, P = 56, LW = 470, RX = 560, RW = W - RX - P;
    ctx.fillStyle = COL.red; ctx.fillRect(0, 0, W, 10);
    mark(ctx, P, 50, 64, 30);
    ctx.fillStyle = COL.white; ctx.font = font(800, 70, DISP);
    var lines = wrap(ctx, 'My Billionaire Fantasy team', LW), ty = 200;
    lines.slice(0, 2).forEach(function(l){ ctx.fillText(fit(ctx, l, LW), P, ty); ty += 66; });
    ctx.font = font(600, 26, BODY); ctx.fillStyle = COL.muted; ctx.fillText(fit(ctx, info.week || '', LW), P, ty + 4);
    var by = ty + 60;
    if (hasPts(info)){
      ctx.font = font(800, 110, DISP); ctx.fillStyle = info.total > 0 ? COL.pos : (info.total < 0 ? COL.neg : COL.white);
      var tt = signed(info.total); ctx.fillText(tt, P, by + 80);
      var tw = ctx.measureText(tt).width;
      ctx.fillStyle = COL.white; ctx.font = font(700, 28, BODY); ctx.fillText('points this week', P + tw + 16, by + 76);
    } else {
      ctx.fillStyle = COL.white; ctx.font = font(800, 44, DISP);
      wrap(ctx, 'Drafted, scoring starts ' + (info.startDay || 'soon'), LW).slice(0, 2).forEach(function(l, i){ ctx.fillText(l, P, by + 30 + i * 46); });
    }
    footer(ctx, P, H - 82, LW, 22);
    var y = 50, rh = 94, gap = 12;
    info.picks.slice(0, 5).forEach(function(p){ row(ctx, p, RX, y, RW, rh, { r: 14, pad: 18, circle: 30, name: 30, badge: 32, pts: 40 }); y += rh + gap; });
  }
  function draw(info, kind){
    var s = SIZES[kind], c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, s.w, s.h);
    if (kind === 'wide') drawWide(ctx, info); else drawPortrait(ctx, info);
    return c;
  }
  // site fonts first (Barlow Condensed 800, Barlow 600/700), then draw both sizes as PNG blobs
  function fontsReady(){
    var fs = document.fonts;
    if (!fs || !fs.load) return Promise.resolve();
    var loads = ['800 40px "Barlow Condensed"', '600 40px Barlow', '700 40px Barlow'].map(function(f){ return fs.load(f).then(null, function(){}); });
    return Promise.all(loads).then(function(){ return fs.ready; }).then(null, function(){});
  }
  function toBlob(c){
    return new Promise(function(res){
      if (c.toBlob) c.toBlob(function(b){ res(b); }, 'image/png');
      else res(null);
    });
  }
  function render(info){
    return fontsReady().then(function(){
      var out = {};
      return Promise.all(['portrait', 'wide'].map(function(k){
        var c = draw(info, k);
        return toBlob(c).then(function(b){ out[k] = { canvas: c, blob: b, url: b ? URL.createObjectURL(b) : c.toDataURL('image/png') }; });
      })).then(function(){ return out; });
    });
  }

  function copyText(t){
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) return navigator.clipboard.writeText(t);
    return new Promise(function(res, rej){
      var ta = el('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (ok) res(); else rej(new Error('copy failed'));
    });
  }

  // compact inline icons (simple glyphs drawn here, 24x24, currentColor)
  var ICONS = {
    x: '<path d="M5 4l14 16M19 4L5 20" stroke-width="2.4" stroke-linecap="round"/>',
    threads: '<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.6a2.6 2.6 0 005.2 0V12a8.8 8.8 0 10-3.4 6.9" stroke-linecap="round"/>',
    facebook: '<path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4A21 21 0 0015.4 4c-2.3 0-3.9 1.4-3.9 4v2.5H9v3h2.5V21z" fill="currentColor" stroke="none"/>',
    whatsapp: '<path d="M4 20l1.3-4A8.2 8.2 0 1112 20.2a8.3 8.3 0 01-4-1z" stroke-linejoin="round"/><path d="M9.2 8.6c.2 2.9 2.4 5.6 5.8 6.4l1.2-1.4-1.8-.9-.8.8c-1-.5-2-1.5-2.5-2.5l.8-.8-.9-1.8z" fill="currentColor" stroke="none"/>',
    linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13c0-1.7 1-2.6 2.3-2.6s2.2.8 2.2 2.6V16" stroke-linecap="round"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" stroke-linecap="round" stroke-linejoin="round"/>',
    copy: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" stroke-linecap="round"/>'
  };
  function icon(name){
    var w = el('span', 'hm-sh__ico');
    w.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
    return w;
  }
  function roundBtn(tag, name, label){
    var b = el(tag, 'hm-sh__round hm-sh__round--' + name);
    if (tag === 'button') b.type = 'button';
    b.setAttribute('aria-label', label); b.title = label;
    b.appendChild(icon(name));
    return b;
  }

  // the side card: title, thumbnail + one-line summary, Share…, round icon buttons, More options (size), Instagram hint
  function build(info){
    var id = 'hm-share-' + (++uid), imgs = null, busy = null, kind = 'portrait';
    var card = el('section', 'v2-card hm-sh'); card.setAttribute('aria-labelledby', id + '-h');
    var h = el('h2', 'hm-rail__h', 'Share your team'); h.id = id + '-h';
    card.appendChild(h);

    var top = el('div', 'hm-sh__top');
    var img = el('img', 'hm-sh__thumb'); img.alt = ''; img.width = 120; img.height = 150;
    top.appendChild(img);
    var sum = el('div', 'hm-sh__sum');
    sum.appendChild(el('p', 'hm-sh__line', hasPts(info) ? 'This week: ' + signed(info.total) : 'Drafted, scoring starts ' + (info.startDay || 'soon')));
    if (info.week) sum.appendChild(el('p', 'hm-sh__week', info.week));
    var msg = el('p', 'hm-sh__msg', ''); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    function say(t){ msg.textContent = ''; setTimeout(function(){ msg.textContent = t; }, 30); }

    // Share… (native share sheet): the image when the browser can share files, otherwise the link; hidden if neither
    if (navigator.share){
      var nat = el('button', 'v2-btn v2-btn--primary v2-btn--sm hm-sh__native', 'Share…'); nat.type = 'button';
      nat.addEventListener('click', function(){
        log('native');
        var text = shareText(info), cur = imgs && imgs[kind], data = null;
        if (cur && cur.blob && typeof File === 'function'){
          try {
            var f = new File([cur.blob], SIZES[kind].file, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [f] })) data = { files: [f], title: 'Billionaires Digest', text: text + ' ' + URL_SHARE };
          } catch (e) {}
        }
        if (!data) data = { title: 'Billionaires Digest', text: text, url: URL_SHARE };
        navigator.share(data).then(function(){}, function(err){
          if (err && err.name === 'AbortError') return;
          say('Sharing did not work here. Use a button below or copy the link.');
        });
      });
      sum.appendChild(nat);
    }
    top.appendChild(sum);
    card.appendChild(top);

    var row = el('div', 'hm-sh__row');
    intents(info).forEach(function(x){
      var a = roundBtn('a', x.id, (x.id === 'x' ? 'Post on X' : 'Share on ' + x.label) + ' (opens in a new tab)');
      a.title = x.id === 'x' ? 'Post on X' : x.label;
      a.href = x.href; a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', function(){ log(x.id); });
      row.appendChild(a);
    });
    var dl = roundBtn('button', 'download', 'Download image');
    dl.addEventListener('click', function(){
      log('download');
      ready().then(function(){
        var cur = imgs && imgs[kind];
        if (!cur){ say('The image could not be made in this browser.'); return; }
        var a = el('a'); a.href = cur.url; a.download = SIZES[kind].file;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        say(kind === 'wide' ? 'Wide image downloaded.' : 'Image downloaded.');
      });
    });
    row.appendChild(dl);
    var cp = roundBtn('button', 'copy', 'Copy link');
    cp.addEventListener('click', function(){
      log('copy');
      copyText(URL_SHARE).then(function(){ say('Link copied.'); }, function(){ say('Could not copy. The link is ' + URL_SHARE); });
    });
    row.appendChild(cp);
    card.appendChild(row);

    var det = el('details', 'hm-sh__more');
    det.appendChild(el('summary', null, 'More options'));
    var seg = el('div', 'hm-sh__seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Image size');
    [['portrait', 'Portrait'], ['wide', 'Wide']].forEach(function(o, i){
      var lab = el('label', 'hm-sh__segopt'), r = el('input');
      r.type = 'radio'; r.name = id + '-size'; r.value = o[0]; r.checked = i === 0;
      r.addEventListener('change', function(){ if (r.checked) kind = o[0]; });
      lab.appendChild(r); lab.appendChild(el('span', null, o[1]));
      seg.appendChild(lab);
    });
    det.appendChild(seg);
    det.appendChild(el('p', 'hm-sh__fine', 'Portrait 1080 × 1350 for Instagram; wide 1200 × 630 for X and links. Used by Share… and Download.'));
    card.appendChild(det);

    card.appendChild(el('p', 'hm-sh__note', 'Instagram: tap Share… on your phone, or download the image and post it.'));
    card.appendChild(msg);

    function ready(){
      if (!busy) busy = render(info).then(function(o){
        imgs = o;
        img.src = o.portrait.url;
        img.alt = 'Preview of your share image: My Billionaire Fantasy team, ' + (info.week || '') + ', ' +
          info.picks.map(function(p){ return p.name + (p.captain ? ' (captain)' : ''); }).join(', ') + '.';
      }, function(){ img.hidden = true; });
      return busy;
    }
    ready();
    return { card: card, render: function(){ return ready().then(function(){ return imgs; }); } };
  }

  window.BDTeamShare = { build: build, shareText: shareText, intents: intents, URL: URL_SHARE, draw: draw };
})();
