/* Billionaires Digest v2: Billionaire Life. ES5 IIFE, no globals. Needs assets/common.js (BD) and assets/v2/portraits.js.
   Two pages share this file:
   - life.html       (#lf-hub present): roster grid from data/life/index.json, your best scores, overall stats.
   - life-play.html  (#lf-game present): ?p=<slug> loads data/life/<slug>.json and runs the game: shuffled options,
     flip reveal, match meter, streak, sources, end screen with rank badge, best score, share and "Next billionaire".
   Scores live only in this browser (localStorage key bd-life-v1, every access in try/catch). Nothing is sent anywhere.
   Animations run once per reveal and are skipped with prefers-reduced-motion. Game for fun: no money, no prizes. */
(function(){
  'use strict';
  var el = BD.el;
  var $ = function(id){ return document.getElementById(id); };
  var KEY = 'bd-life-v1';
  var ICONS = 'assets/v2/life-icons.svg';
  var SVGNS = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';
  var CAT_LABEL = { founding: 'Founding', product: 'Product', deal: 'Deal', money: 'Money', giving: 'Giving', politics: 'Politics', lifestyle: 'Lifestyle' };
  var TIER_NAME = ['Gold', 'Silver', 'Bronze'];
  var liveT;

  // ---------- small helpers ----------
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function reduced(){ return BD.reducedMotion(); }
  function say(t){ var n = $('live'); if (!n) return; n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 60); }
  function safeUrl(u){ return typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null; }
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 && u.charAt(0) !== '/' ? u : null; }
  function validSlug(s){ return typeof s === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 60; }
  function shuffle(a){ a = a.slice(); for (var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function num(x){ return typeof x === 'number' && isFinite(x) && x >= 0 ? Math.floor(x) : 0; }
  function focusTop(n, anchor){ try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } var r = (anchor || n).getBoundingClientRect(); if (r.top < 0 || r.top > window.innerHeight * 0.4) window.scrollTo(0, Math.max(0, window.pageYOffset + r.top - 12)); }
  function queryParam(name){
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search || '');
    if (!m) return null;
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return null; }
  }
  // "Jensen Huang" -> "Huang" (person.short wins when present)
  function shortName(p){
    if (p.short) return p.short;
    var ws = String(p.name || '').replace(/\s*&\s*family\s*$/i, '').replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(/\s+/).filter(Boolean);
    return ws.length ? ws[ws.length - 1] : String(p.name || '');
  }
  function portrait(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? safePath(p.img) : null;
  }
  function yearSpan(y){ if (!y || !y.from) return ''; return y.from === y.to ? String(y.from) : y.from + '–' + y.to; }

  // ---------- icons + badges (inline SVG) ----------
  function icon(name, cls){
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'lf-ico' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', ICONS + '#lf-i-' + name);
    u.setAttributeNS(XLINK, 'xlink:href', ICONS + '#lf-i-' + name);
    s.appendChild(u);
    return s;
  }
  function svgEl(tag, attrs){ var n = document.createElementNS(SVGNS, tag); for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]); return n; }
  // Rank badge: tier 0 gold (3 stars), 1 silver (2), 2 bronze (1). Decorative; the text next to it says the rank.
  function badge(tier, cls){
    tier = Math.max(0, Math.min(2, tier | 0));
    var s = svgEl('svg', { viewBox: '0 0 48 56', 'class': 'lf-badge lf-badge--t' + tier + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('path', { d: 'M14 2h8l4 16h-8zM34 2h-8l-4 16h8z', 'class': 'lf-badge__ribbon' }));
    s.appendChild(svgEl('circle', { cx: 24, cy: 34, r: 19, 'class': 'lf-badge__rim' }));
    s.appendChild(svgEl('circle', { cx: 24, cy: 34, r: 14.5, 'class': 'lf-badge__face' }));
    var stars = 3 - tier, xs = stars === 3 ? [15, 24, 33] : (stars === 2 ? [19.5, 28.5] : [24]);
    for (var i = 0; i < xs.length; i++){
      var x = xs[i], y = 34;
      s.appendChild(svgEl('path', { 'class': 'lf-badge__star', d: 'M' + x + ' ' + (y - 5) + 'l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5z' }));
    }
    return s;
  }
  function tierForRatio(score, of){ if (!of) return 2; var r = score / of; return r >= 1 ? 0 : (r >= 0.6 ? 1 : 2); }

  // ---------- local store: { v:1, people: { slug: { best, of, plays, matches, last } } } ----------
  function loadStore(){
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 1 || !s.people || typeof s.people !== 'object') s = { v: 1, people: {} };
    return s;
  }
  function saveStore(s){ try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
  function statFor(store, slug){
    var p = Object.prototype.hasOwnProperty.call(store.people, slug) ? store.people[slug] : null;
    if (!p || typeof p !== 'object') return null;
    var plays = num(p.plays); if (!plays) return null;
    var of = num(p.of);
    return { best: Math.min(num(p.best), of || Infinity), of: of, plays: plays, matches: num(p.matches) };
  }
  function recordGame(slug, score, of){
    var s = loadStore(), prev = statFor(s, slug);
    var isBest = !prev || score > prev.best || of !== prev.of;
    var rec = { best: isBest ? score : prev.best, of: isBest ? of : prev.of, plays: (prev ? prev.plays : 0) + 1, matches: (prev ? prev.matches : 0) + score, last: new Date().toISOString().slice(0, 10) };
    s.people[slug] = rec;
    var saved = saveStore(s);
    return { prev: prev, rec: rec, newBest: !!prev && score > prev.best && of === prev.of, first: !prev, saved: saved };
  }

  // ---------- plate: approved portrait, else initials on the sector plate ----------
  function plate(entry, cls){
    var av = el('span', 'v2-av lf-plate' + (cls ? ' ' + cls : ''));
    av.setAttribute('aria-hidden', 'true');
    av.setAttribute('data-sector', BD.sectorSlug(entry.sector || 'Other'));
    av.appendChild(el('span', 'lf-plate__ini', entry.initials || BD.initials(entry.name)));
    var img = portrait(entry.slug);
    if (img){ var im = el('img'); im.src = img; im.alt = ''; im.width = 256; im.height = 256; im.setAttribute('loading', 'lazy'); im.setAttribute('decoding', 'async'); av.appendChild(im); av.classList.add('has-img'); }
    return av;
  }

  function srcList(ul, sources){
    clear(ul);
    (sources || []).forEach(function(s){
      var u = safeUrl(s && s.url); if (!u) return;
      var li = el('li');
      var a = el('a', 'lf-link', s.title || s.publisher || u); a.href = u; a.rel = 'noopener'; a.target = '_blank';
      a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)'));
      li.appendChild(a);
      var meta = [s.publisher, s.date].filter(Boolean).join(', ');
      if (meta) li.appendChild(el('span', 'lf-src__meta', ' · ' + meta));
      ul.appendChild(li);
    });
  }

  function loadRoster(){
    return BD.getJson('data/life/index.json').then(function(j){
      return j && Array.isArray(j.people) ? j.people.filter(function(p){ return p && validSlug(p.slug) && p.name; }) : [];
    });
  }

  // =====================================================================================================
  // HUB (life.html)
  // =====================================================================================================
  function initHub(){
    var grid = $('lf-roster'), status = $('lf-status');
    loadRoster().then(function(roster){
      var store = loadStore();
      clear(grid);
      if (!roster.length){ status.textContent = 'The first billionaires are still being researched. Check back soon.'; status.hidden = false; renderStats([], store); return; }
      status.hidden = true;
      roster.forEach(function(p){ grid.appendChild(hubCard(p, statFor(store, p.slug))); });
      $('lf-count').textContent = roster.length === 1 ? '1 billionaire so far, more on the way.' : roster.length + ' billionaires so far, more on the way.';
      renderStats(roster, store);
    }).then(null, function(){
      status.textContent = 'Could not load the roster. Please reload the page.';
      status.hidden = false;
    });
  }

  function hubCard(p, st){
    var li = el('li', 'lf-hcard');
    var art = el('div', 'lf-hcard__art');
    art.appendChild(plate(p, 'lf-hcard__av'));
    li.appendChild(art);
    var body = el('div', 'lf-hcard__body');
    var h = el('h3', 'lf-hcard__name', p.name);
    h.id = 'lf-h-' + p.slug;
    body.appendChild(h);
    if (p.role) body.appendChild(el('p', 'lf-hcard__role', p.role));
    var meta = [];
    if (p.decisions) meta.push(BD.plural(p.decisions, 'decision', 'decisions'));
    if (p.years) meta.push(yearSpan(p.years));
    if (meta.length) body.appendChild(el('p', 'lf-hcard__meta', meta.join(' · ')));
    var best = el('p', 'lf-hcard__best');
    if (st){
      best.appendChild(badge(tierForRatio(st.best, st.of), 'lf-badge--sm'));
      best.appendChild(el('span', null, 'Your best: ' + st.best + '/' + st.of));
      best.classList.add('is-played');
    } else best.appendChild(el('span', null, 'Not played yet'));
    body.appendChild(best);
    var a = el('a', 'lf-btn lf-btn--gold lf-hcard__play', st ? 'Play again' : 'Play');
    a.href = 'life-play.html?p=' + encodeURIComponent(p.slug);
    a.setAttribute('aria-label', (st ? 'Play again as ' : 'Play as ') + p.name);
    body.appendChild(a);
    li.appendChild(body);
    return li;
  }

  function renderStats(roster, store){
    var people = 0, matches = 0, games = 0;
    roster.forEach(function(p){ var st = statFor(store, p.slug); if (st){ people++; matches += st.matches; games += st.plays; } });
    $('lf-st-people').textContent = people + ' of ' + roster.length;
    $('lf-st-matches').textContent = String(matches);
    $('lf-st-games').textContent = String(games);
  }

  // =====================================================================================================
  // GAME (life-play.html?p=<slug>)
  // =====================================================================================================
  var data = null, entry = null, roster = [], order = [], turn = 0, score = 0, streak = 0, bestStreak = 0, picks = [], busy = false, who = '';

  function show(id){ ['lf-loading', 'lf-notfound', 'intro', 'turn', 'end'].forEach(function(s){ var n = $(s); if (n) n.hidden = s !== id; }); }

  function notFound(msg){
    if (msg) $('lf-nf-msg').textContent = msg;
    document.title = 'Billionaire not found · Billionaire Life · Billionaires Digest';
    show('lf-notfound');
  }

  // keep only well-formed decisions (the build validates; this guards the browser against a bad file)
  function cleanDecisions(ds){
    return (Array.isArray(ds) ? ds : []).filter(function(d){
      if (!d || !d.title || !d.situation || !d.actual || !d.outcome || !Array.isArray(d.options) || d.options.length !== 3) return false;
      var real = 0;
      for (var i = 0; i < d.options.length; i++){ if (!d.options[i] || !d.options[i].label) return false; if (d.options[i].real === true) real++; }
      return real === 1;
    });
  }
  function realOpt(d){ for (var i = 0; i < d.options.length; i++) if (d.options[i].real === true) return d.options[i]; return null; }

  function ranks(){
    var n = data.decisions.length, r = Array.isArray(data.ranks) ? data.ranks.filter(function(x){ return x && typeof x.min === 'number' && x.title; }) : [];
    if (!r.length) r = [{ min: n, title: 'Perfect read' }, { min: Math.ceil(n * 0.6), title: 'Sharp instincts' }, { min: 0, title: 'Your own path' }];
    return r.slice().sort(function(a, b){ return b.min - a.min; });
  }
  function rankFor(s){
    var r = ranks();
    for (var i = 0; i < r.length; i++) if (s >= r[i].min) return { title: r[i].title, tier: r.length <= 3 ? Math.min(i, 2) : Math.min(2, Math.floor(i * 3 / r.length)) };
    return { title: '', tier: 2 };
  }

  function initGame(){
    var slug = queryParam('p');
    if (!validSlug(slug)){ notFound(slug ? null : 'Pick a billionaire from the list to start playing.'); return; }
    loadRoster().then(function(list){
      roster = list;
      for (var i = 0; i < list.length; i++) if (list[i].slug === slug) entry = list[i];
      if (!entry){ notFound(); return null; }
      return BD.getJson('data/life/' + slug + '.json').then(function(j){
        if (!j || !j.person || j.person.slug !== slug){ notFound(); return; }
        j.decisions = cleanDecisions(j.decisions);
        if (!j.decisions.length){ notFound('This game is not ready yet. Please try another billionaire.'); return; }
        data = j;
        setupIntro();
      });
    }).then(null, function(){
      notFound('Could not load the game data. Please reload the page, or pick another billionaire.');
    });
  }

  function setupIntro(){
    var p = data.person, n = data.decisions.length;
    who = shortName(p);
    document.title = 'Play as ' + p.name + ' · Billionaire Life · Billionaires Digest';
    $('introh').textContent = 'Play as ' + p.name;
    var pic = clear($('lf-pic'));
    var img = portrait(p.slug);
    if (img){ var im = el('img', 'lf-char__img'); im.src = img; im.alt = ''; im.width = 256; im.height = 256; pic.appendChild(im); $('lf-soon').hidden = true; }
    else pic.appendChild(el('span', 'lf-char__init', p.initials || entry.initials || BD.initials(p.name)));
    $('role').textContent = p.role;
    var bio = clear($('bio'));
    bio.appendChild(document.createTextNode(p.bio + ' '));
    var u = p.bioSource && safeUrl(p.bioSource.url);
    if (u){ var a = el('a', 'lf-link', 'Source: ' + (p.bioSource.publisher || p.bioSource.title)); a.href = u; a.rel = 'noopener'; a.target = '_blank'; a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)')); bio.appendChild(a); }
    $('lf-how').textContent = (n === 1 ? 'One turn. It is' : n + ' turns. Each one is') + ' a real choice ' + who + ' faced. Pick what you would do, then see what ' + who + ' actually did and how it turned out.';
    $('lf-actualh').textContent = 'What ' + who + ' actually did';
    var st = statFor(loadStore(), p.slug), best = $('lf-introbest');
    if (st){ best.textContent = 'Your best so far: ' + st.best + '/' + st.of + ' · played ' + BD.plural(st.plays, 'time', 'times'); best.hidden = false; }
    if (data.checked) { $('lf-checked').textContent = 'Facts checked ' + BD.fmtDate(data.checked) + '.'; }
    $('start').disabled = false;
    show('intro');
  }

  function meter(){
    var m = clear($('meter')), n = data.decisions.length;
    for (var i = 0; i < n; i++){
      var c = 'lf-pip';
      if (i < picks.length) c += picks[i].match ? ' is-win' : ' is-miss';
      else if (i === turn) c += ' is-now';
      m.appendChild(el('span', c));
    }
    m.setAttribute('aria-label', 'Match meter: ' + score + ' of ' + picks.length + ' so far');
    $('scoretxt').textContent = score + (score === 1 ? ' match' : ' matches');
    var sk = $('lf-streak');
    if (streak >= 2){ clear(sk); sk.appendChild(icon('streak')); sk.appendChild(el('span', null, 'Streak ' + streak)); sk.hidden = false; }
    else sk.hidden = true;
  }

  function catChip(d){
    if (!d.category || !CAT_LABEL[d.category]) return null;
    var c = el('span', 'lf-cat lf-cat--' + d.category);
    c.appendChild(icon(d.category));
    c.appendChild(el('span', 'lf-cat__t', CAT_LABEL[d.category]));
    return c;
  }

  function renderTurn(){
    var d = data.decisions[turn];
    busy = false;
    $('turnno').textContent = 'Decision ' + (turn + 1) + ' of ' + data.decisions.length;
    var tag = clear($('lf-tag'));
    tag.appendChild(el('span', 'lf-card__year', String(d.year)));
    var chip = catChip(d); if (chip) tag.appendChild(chip);
    $('turnh').textContent = d.title;
    $('sit').textContent = d.situation;
    var box = clear($('opts'));
    order = shuffle(d.options);
    order.forEach(function(o, i){
      var b = el('button', 'lf-opt');
      b.type = 'button';
      b.appendChild(el('span', 'lf-opt__k', String.fromCharCode(65 + i)));
      b.appendChild(el('span', 'lf-opt__t', o.label));
      b.addEventListener('click', function(){ choose(o, b); });
      box.appendChild(b);
    });
    $('front').hidden = false; $('back').hidden = true;
    $('flip').className = 'lf-flip';
    meter();
    show('turn');
    focusTop($('turnh'), $('turn'));
  }

  function choose(o, btn){
    if (busy) return; busy = true;
    var d = data.decisions[turn], real = realOpt(d), match = o.real === true;
    picks.push({ d: d, pick: o, real: real, match: match });
    if (match){ score++; streak++; if (streak > bestStreak) bestStreak = streak; } else streak = 0;
    Array.prototype.forEach.call($('opts').querySelectorAll('button'), function(b){ b.disabled = true; });
    btn.classList.add('is-picked');

    var v = clear($('verdict'));
    v.className = 'lf-verdict ' + (match ? 'is-win' : 'is-miss');
    v.appendChild(icon(match ? 'match' : 'miss', 'lf-verdict__ico'));
    v.appendChild(el('span', 'lf-verdict__word', match ? 'Match!' : who + ' chose differently'));
    $('yourpick').textContent = match ? 'You picked the same move: ' + o.label + '.' : 'You picked: ' + o.label + '. ' + who + ' went with: ' + real.label + '.';
    $('actual').textContent = d.actual;
    $('outcome').textContent = d.outcome;
    srcList($('src'), d.sources);
    $('next').textContent = turn + 1 < data.decisions.length ? 'Next decision' : 'See your result';

    function reveal(){
      $('front').hidden = true; $('back').hidden = false;
      meter();
      say((match ? 'Match! ' : who + ' chose differently. ') + who + ' actually: ' + d.actual + ' Score: ' + score + ' of ' + picks.length + '.' + (streak >= 2 ? ' Streak of ' + streak + '.' : ''));
      focusTop($('verdict'), $('turn'));
    }
    if (reduced()){ reveal(); return; }
    var f = $('flip');
    f.classList.add('is-flipping');
    setTimeout(function(){ reveal(); f.classList.remove('is-flipping'); f.classList.add('is-landing', match ? 'is-winfx' : 'is-missfx'); }, 360);
    setTimeout(function(){ f.classList.remove('is-landing'); }, 800);
  }

  function nextPerson(){
    if (roster.length < 2) return null;
    var store = loadStore(), at = 0, i;
    for (i = 0; i < roster.length; i++) if (roster[i].slug === entry.slug) at = i;
    for (i = 1; i < roster.length; i++){ var c = roster[(at + i) % roster.length]; if (!statFor(store, c.slug)) return c; }
    return roster[(at + 1) % roster.length];
  }

  function renderEnd(){
    var n = data.decisions.length, p = data.person, rk = rankFor(score);
    var res = recordGame(p.slug, score, n);
    $('endh').textContent = 'Your instincts: ' + score + '/' + n + ' match with ' + p.name;
    var rank = clear($('rank'));
    rank.appendChild(badge(rk.tier));
    var rt = el('span', 'lf-rank__t');
    rt.appendChild(el('span', 'v2-sr', TIER_NAME[rk.tier] + ' badge. '));
    rt.appendChild(document.createTextNode('Rank: ' + rk.title));
    rank.appendChild(rt);
    var bl = clear($('lf-bestline'));
    if (res.newBest){ bl.appendChild(icon('trophy')); bl.appendChild(el('span', null, 'New personal best! (was ' + res.prev.best + '/' + res.prev.of + ')')); bl.className = 'lf-bestline is-new'; }
    else if (res.first){ bl.appendChild(icon('trophy')); bl.appendChild(el('span', null, 'First game saved as your best: ' + score + '/' + n)); bl.className = 'lf-bestline'; }
    else { bl.appendChild(icon('trophy')); bl.appendChild(el('span', null, 'Your best: ' + res.rec.best + '/' + res.rec.of + ' · played ' + BD.plural(res.rec.plays, 'time', 'times'))); bl.className = 'lf-bestline'; }
    if (!res.saved) bl.appendChild(el('span', 'lf-bestline__warn', ' (this browser is not saving scores)'));
    $('lf-beststreak').textContent = bestStreak >= 2 ? 'Longest streak: ' + bestStreak + ' in a row' : '';
    $('lf-beststreak').hidden = bestStreak < 2;
    $('lf-sharemsg').textContent = '';
    $('lf-sharebox').hidden = true;

    var nx = nextPerson(), box = clear($('lf-next'));
    if (nx){
      box.appendChild(el('p', 'lf-next__k', 'Next billionaire'));
      var a = el('a', 'lf-next__card');
      a.href = 'life-play.html?p=' + encodeURIComponent(nx.slug);
      a.appendChild(plate(nx, 'lf-next__av'));
      var t = el('span', 'lf-next__txt');
      t.appendChild(el('span', 'lf-next__name', 'Play as ' + nx.name));
      if (nx.role) t.appendChild(el('span', 'lf-next__role', nx.role));
      a.appendChild(t);
      box.appendChild(a);
    } else {
      box.appendChild(el('p', 'lf-next__k', 'More billionaires are on the way.'));
    }

    var ol = clear($('recap'));
    picks.forEach(function(pk){
      var li = el('li', 'lf-recap__item ' + (pk.match ? 'is-win' : 'is-miss'));
      var h = el('p', 'lf-recap__head');
      h.appendChild(el('span', 'lf-recap__year', String(pk.d.year)));
      h.appendChild(el('span', 'lf-recap__title', pk.d.title));
      var chip = catChip(pk.d); if (chip) h.appendChild(chip);
      h.appendChild(el('span', 'lf-recap__tag', pk.match ? 'Match' : 'Different'));
      li.appendChild(h);
      li.appendChild(el('p', 'lf-recap__line', 'You: ' + pk.pick.label));
      li.appendChild(el('p', 'lf-recap__line', who + ': ' + pk.d.actual));
      li.appendChild(el('p', 'lf-recap__line lf-recap__out', pk.d.outcome));
      var ul = el('ul', 'lf-src'); srcList(ul, pk.d.sources); li.appendChild(ul);
      ol.appendChild(li);
    });
    show('end');
    focusTop($('endh'), $('end'));
    say('Game over. Your instincts: ' + score + ' of ' + n + ' match. Rank: ' + rk.title + '.' + (res.newBest ? ' New personal best.' : ''));
  }

  function shareText(){ return 'I matched ' + score + '/' + data.decisions.length + ' of ' + data.person.name + "'s real decisions on Billionaire Life"; }
  function shareUrl(){ return location.protocol + '//' + location.host + location.pathname + '?p=' + encodeURIComponent(data.person.slug); }
  function showCopyBox(txt){
    var box = $('lf-sharebox'), ta = $('lf-sharetxt');
    ta.value = txt; box.hidden = false;
    try { ta.focus(); ta.select(); } catch (e) {}
    $('lf-sharemsg').textContent = 'Copy the text below to share it.';
  }
  function share(){
    var text = shareText(), url = shareUrl(), msg = $('lf-sharemsg');
    if (navigator.share){
      navigator.share({ title: 'Billionaire Life', text: text, url: url }).then(function(){ msg.textContent = 'Shared.'; }, function(e){ if (!e || e.name !== 'AbortError') showCopyBox(text + ' ' + url); });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext){
      navigator.clipboard.writeText(text + ' ' + url).then(function(){ msg.textContent = 'Copied. Paste it anywhere to share.'; say('Copied to clipboard.'); }, function(){ showCopyBox(text + ' ' + url); });
      return;
    }
    showCopyBox(text + ' ' + url);
  }

  function start(){ turn = 0; score = 0; streak = 0; bestStreak = 0; picks = []; renderTurn(); }

  function bindGame(){
    $('next').addEventListener('click', function(){ turn++; if (turn < data.decisions.length) renderTurn(); else renderEnd(); });
    $('start').addEventListener('click', start);
    $('again').addEventListener('click', start);
    $('lf-share').addEventListener('click', share);
  }

  if ($('lf-hub')) initHub();
  if ($('lf-game')){ bindGame(); initGame(); }
})();
