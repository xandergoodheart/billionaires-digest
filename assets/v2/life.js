/* Billionaires Digest v2: Billionaire Life. ES5 IIFE, no globals. Needs assets/common.js (BD) and assets/v2/portraits.js.
   Three pages share this file:
   - life.html       (#lf-hub present): roster grid from data/life/index.json, your best scores, overall stats.
   - life-play.html  (#lf-game present): ?p=<slug> loads data/life/<slug>.json and runs the game: shuffled options,
     flip reveal, match meter, streak, sources, end screen with rank badge, best score, share and "Next billionaire".
   - academy.html    (#lf-academy present): Billionaires Digest Academy: schools from data/life/index.json (school blocks the
     build validated) and the searchable glossary from data/life/glossary.json.
   Academy layer in the game: a "The lesson" panel after each reveal (when the decision has a valid lesson), and at the end the
   person's school, the principles you met and a 3-question quiz built only from that person's lesson/principle text.
   2 of 3 right earns a diploma (diplomas[slug]) and soft-unlocks their Next Moves (unlocked[slug] = YYYY-MM-DD).
   Scores live only in this browser (localStorage key bd-life-v1, every access in try/catch). Nothing is sent anywhere.
   Animations run once per reveal and are skipped with prefers-reduced-motion. Game for fun: no money, no prizes. */
(function(){
  'use strict';
  var el = BD.el;
  var $ = function(id){ return document.getElementById(id); };
  var KEY = 'bd-life-v1';
  // Display name of the education section. Rename it here (one line); every page fills [data-academy-name] from it.
  var ACADEMY_NAME = 'Billionaires Digest Academy';
  var own = function(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); };
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
  // approved portrait, else the casino mystery player (window.BDPortraitFallback)
  function portraitSrc(slug){ return portrait(slug) || safePath(window.BDPortraitFallback); }
  // realistic scene per decision (assets/life/realistic/<slug>-<n>.webp) and school crests, only for these people
  var SCENES = { 'bill-gates': 5, 'elon-musk': 5, 'jeff-bezos': 5, 'jensen-huang': 5, 'larry-ellison': 5, 'mark-zuckerberg': 5, 'michael-dell': 5, 'warren-buffett': 5 };
  function crest(slug, cls){
    if (!own(SCENES, slug)) return null;
    var w = el('span', 'lf-crest' + (cls ? ' ' + cls : ''));
    w.setAttribute('aria-hidden', 'true');
    var im = el('img'); im.src = 'assets/academy/realistic/crest-' + slug + '.webp'; im.alt = ''; im.width = 64; im.height = 64;
    im.setAttribute('loading', 'lazy'); im.setAttribute('decoding', 'async');
    w.appendChild(im);
    return w;
  }
  function nonEmpty(x){ return typeof x === 'string' && x.replace(/\s+/g, '') !== ''; }
  function today(){ return new Date().toISOString().slice(0, 10); }
  function applyAcademyName(){ Array.prototype.forEach.call(document.querySelectorAll('[data-academy-name]'), function(n){ n.textContent = ACADEMY_NAME; }); }
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

  // ---------- local store: { v:1, people: { slug: { best, of, plays, matches, last } },
  //              diplomas: { slug: { date, score, of } }, unlocked: { slug: 'YYYY-MM-DD' } } ----------
  function isMap(x){ return !!x && typeof x === 'object' && !Array.isArray(x); }
  function loadStore(){
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 1 || !isMap(s.people)) s = { v: 1, people: {} };
    if (!isMap(s.diplomas)) s.diplomas = {};
    if (!isMap(s.unlocked)) s.unlocked = {};
    return s;
  }
  function diplomaFor(store, slug){
    var d = own(store.diplomas, slug) ? store.diplomas[slug] : null;
    return d && typeof d === 'object' && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? { date: d.date, score: num(d.score), of: num(d.of) } : null;
  }
  // a diploma is never taken away by a later, weaker quiz
  function awardDiploma(slug, score, of){
    var s = loadStore(), d = today();
    if (!diplomaFor(s, slug)) s.diplomas[slug] = { date: d, score: score, of: of };
    if (!own(s.unlocked, slug) || typeof s.unlocked[slug] !== 'string') s.unlocked[slug] = d;
    return saveStore(s);
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

  // ---------- plate: approved portrait, else the casino mystery player, else initials on the sector plate ----------
  function plate(entry, cls){
    var av = el('span', 'v2-av lf-plate' + (cls ? ' ' + cls : ''));
    av.setAttribute('aria-hidden', 'true');
    av.setAttribute('data-sector', BD.sectorSlug(entry.sector || 'Other'));
    av.appendChild(el('span', 'lf-plate__ini', entry.initials || BD.initials(entry.name)));
    var img = portraitSrc(entry.slug);
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
    applyAcademyName();
    loadRoster().then(function(roster){
      var store = loadStore();
      clear(grid);
      if (!roster.length){ status.textContent = 'The first billionaires are still being researched. Check back soon.'; status.hidden = false; renderStats([], store); return; }
      status.hidden = true;
      roster.forEach(function(p){ grid.appendChild(hubCard(p, statFor(store, p.slug), diplomaFor(store, p.slug))); });
      $('lf-count').textContent = roster.length === 1 ? '1 billionaire so far, more on the way.' : roster.length + ' billionaires so far, more on the way.';
      renderStats(roster, store);
    }).then(null, function(){
      status.textContent = 'Could not load the roster. Please reload the page.';
      status.hidden = false;
    });
  }

  function hubCard(p, st, dip){
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
    var sc = schoolOf(p);
    if (sc){
      var sp = el('p', 'lf-hcard__school');
      sp.appendChild(el('span', 'lf-hcard__schoolk', 'School'));
      sp.appendChild(el('span', 'lf-hcard__schooln', sc.name));
      body.appendChild(sp);
      body.appendChild(el('p', 'lf-hcard__tagline', sc.tagline));
    }
    if (dip) body.appendChild(diplomaChip(dip));
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
  var school = null, gloss = {};   // Academy: validated school (from the index) + this person's glossary by id

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
        school = schoolOf(entry);
        gloss = glossaryById(j.glossary);
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
    var img = portraitSrc(p.slug);
    if (img){ var im = el('img', 'lf-char__img'); im.src = img; im.alt = ''; im.width = 256; im.height = 256; pic.appendChild(im); if (portrait(p.slug)) $('lf-soon').hidden = true; }
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
    var front = $('front'), oldScene = front.querySelector('.lf-scene');
    if (oldScene) front.removeChild(oldScene);
    var slug = data.person.slug;
    if (own(SCENES, slug) && turn < SCENES[slug]){
      var fig = el('figure', 'lf-scene');
      var sim = el('img'); sim.src = 'assets/life/realistic/' + slug + '-' + (turn + 1) + '.webp'; sim.alt = '';
      sim.setAttribute('loading', 'lazy'); sim.setAttribute('decoding', 'async');
      fig.appendChild(sim);
      front.insertBefore(fig, front.firstChild);
    }
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
    renderLesson(d);
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
    renderSchoolEnd();
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

  function start(){ closePop(false); turn = 0; score = 0; streak = 0; bestStreak = 0; picks = []; renderTurn(); }

  function bindGame(){
    $('next').addEventListener('click', function(){ turn++; if (turn < data.decisions.length) renderTurn(); else renderEnd(); });
    $('start').addEventListener('click', start);
    $('again').addEventListener('click', start);
    $('lf-share').addEventListener('click', share);
  }

  // =====================================================================================================
  // ACADEMY helpers (shared by hub, game and academy.html). All lesson text comes from the data files.
  // =====================================================================================================
  // School block from an index row (scripts/build-life.mjs only writes it when it passed validation). Light re-check here.
  function schoolOf(row){
    var s = row && row.school;
    if (!s || !nonEmpty(s.name) || !nonEmpty(s.tagline) || !Array.isArray(s.principles)) return null;
    var ps = s.principles.filter(function(p){ return p && nonEmpty(p.id) && nonEmpty(p.name) && nonEmpty(p.summary); });
    if (ps.length < 3) return null;
    var by = {};
    ps.forEach(function(p){ by[p.id] = p; });
    return { name: s.name, tagline: s.tagline, principles: ps, byId: by };
  }
  function glossaryById(list){
    var by = {};
    (Array.isArray(list) ? list : []).forEach(function(g){
      if (g && nonEmpty(g.id) && !own(by, g.id) && nonEmpty(g.term) && nonEmpty(g.definition) && g.source && safeUrl(g.source.url)) by[g.id] = g;
    });
    return by;
  }
  // Same rules as the build: a lesson needs a known principle, a takeaway, a watch-out, and only known terms (0-3).
  function lessonFor(d){
    var l = d && d.lesson;
    if (!school || !l || !own(school.byId, l.principle) || !nonEmpty(l.takeaway) || !nonEmpty(l.watchOut)) return null;
    var terms = l.terms == null ? [] : l.terms;
    if (!Array.isArray(terms) || terms.length > 3) return null;
    for (var i = 0; i < terms.length; i++) if (!own(gloss, terms[i])) return null;
    var srcs = Array.isArray(l.sources) ? l.sources.filter(function(x){ return x && safeUrl(x.url) && (nonEmpty(x.title) || nonEmpty(x.publisher)); }) : [];
    return { principle: school.byId[l.principle], takeaway: l.takeaway, watchOut: l.watchOut, terms: terms, sources: srcs };
  }
  // diploma seal (decorative; text next to it says what it is)
  function seal(cls){
    var s = svgEl('svg', { viewBox: '0 0 40 40', 'class': 'lf-seal' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('path', { 'class': 'lf-seal__rib', d: 'M12 24l-4 14 6-3 4 5 3-13zM28 24l4 14-6-3-4 5-3-13z' }));
    s.appendChild(svgEl('circle', { 'class': 'lf-seal__rim', cx: 20, cy: 17, r: 14 }));
    s.appendChild(svgEl('circle', { 'class': 'lf-seal__face', cx: 20, cy: 17, r: 10 }));
    s.appendChild(svgEl('path', { 'class': 'lf-seal__tick', d: 'M15 17.5l3.5 3.5 7-7.5' }));
    return s;
  }
  function diplomaChip(dip){
    var c = el('p', 'lf-dipchip');
    c.appendChild(seal('lf-seal--sm'));
    c.appendChild(el('span', null, 'Diploma earned' + (dip && dip.date ? ' · ' + BD.fmtDate(dip.date) : '')));
    return c;
  }
  // "Unlocked: Call X's next moves" (with diploma) or "Earn the diploma to unlock X's next moves" (soft: link still works).
  function unlockLine(box, slug, surname, dip){
    clear(box);
    box.className = 'lf-unlock' + (dip ? ' is-open' : '');
    var href = 'moves.html?p=' + encodeURIComponent(slug);
    if (dip){
      box.appendChild(icon('trophy'));
      var a = el('a', 'lf-link lf-unlock__a', 'Unlocked: Call ' + surname + '’s next moves');
      a.href = href;
      box.appendChild(a);
    } else {
      box.appendChild(el('span', 'lf-unlock__t', 'Earn the diploma to unlock ' + surname + '’s next moves.'));
      var b = el('a', 'lf-link lf-unlock__peek', 'Peek at the moves anyway');
      b.href = href;
      b.setAttribute('aria-label', 'Peek at ' + surname + '’s next moves anyway');
      box.appendChild(b);
    }
    return box;
  }

  // ---------- term chips + definition popover (one open at a time; Escape or outside click closes) ----------
  var pop = null, popChip = null, popSeq = 0, popBound = false;
  function closePop(back){
    if (!pop) return;
    pop.hidden = true;
    if (popChip){ popChip.setAttribute('aria-expanded', 'false'); if (back) try { popChip.focus(); } catch (e) {} }
    pop = null; popChip = null;
  }
  function bindPop(){
    if (popBound) return; popBound = true;
    document.addEventListener('keydown', function(e){ if ((e.key === 'Escape' || e.key === 'Esc') && pop){ closePop(true); } });
    document.addEventListener('click', function(e){ if (pop && !pop.contains(e.target) && popChip && !popChip.contains(e.target)) closePop(false); });
  }
  function termChips(box, ids){
    clear(box);
    if (!ids.length){ box.hidden = true; return; }
    bindPop();
    box.hidden = false;
    box.appendChild(el('p', 'lf-terms__k', 'Key terms'));
    var row = el('div', 'lf-terms__row');
    box.appendChild(row);
    ids.forEach(function(id){
      var g = gloss[id], pid = 'lf-pop-' + (++popSeq);
      var chip = el('button', 'lf-term', g.term);
      chip.type = 'button';
      chip.setAttribute('aria-expanded', 'false');
      chip.setAttribute('aria-controls', pid);
      var p = el('div', 'lf-pop');
      p.id = pid; p.hidden = true;
      p.setAttribute('role', 'region');
      p.setAttribute('aria-label', 'Definition: ' + g.term);
      p.appendChild(el('p', 'lf-pop__term', g.term));
      p.appendChild(el('p', 'lf-pop__def', g.definition));
      var u = safeUrl(g.source.url);
      var sp = el('p', 'lf-pop__src');
      var a = el('a', 'lf-link', 'Source: ' + (g.source.publisher || g.source.title)); a.href = u; a.rel = 'noopener'; a.target = '_blank';
      a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)'));
      sp.appendChild(a);
      p.appendChild(sp);
      var x = el('button', 'lf-pop__close', 'Close');
      x.type = 'button';
      x.setAttribute('aria-label', 'Close definition of ' + g.term);
      x.addEventListener('click', function(){ closePop(true); });
      p.appendChild(x);
      chip.addEventListener('click', function(){
        if (pop === p){ closePop(false); return; }
        closePop(false);
        p.hidden = false; chip.setAttribute('aria-expanded', 'true');
        pop = p; popChip = chip;
      });
      row.appendChild(chip);
      box.appendChild(p);
    });
  }

  // ---------- "The lesson" panel on the card back ----------
  function renderLesson(d){
    var box = $('lf-lesson'); if (!box) return;
    closePop(false);
    var l = lessonFor(d);
    if (!l){ box.hidden = true; return; }
    var pr = clear($('lf-lesson-pr'));
    pr.appendChild(el('span', 'lf-lesson__prk', 'Principle'));
    pr.appendChild(el('span', 'lf-lesson__prn', l.principle.name));
    pr.appendChild(el('span', 'lf-lesson__sch', 'School of ' + data.person.name + ': ' + school.name));
    $('lf-lesson-take').textContent = l.takeaway;
    var w = clear($('lf-lesson-watch'));
    w.appendChild(el('strong', 'lf-lesson__wk', 'Watch out: '));
    w.appendChild(document.createTextNode(l.watchOut));
    var sb = $('lf-lesson-srcs');
    if (sb){ srcList($('lf-lesson-src'), l.sources); sb.hidden = !l.sources.length; }
    termChips($('lf-lesson-terms'), l.terms);
    box.hidden = false;
  }

  // ---------- end screen: school, principles met, quiz, diploma ----------
  var quiz = [], qAt = 0, qScore = 0;

  function lessonsPlayed(){
    var out = [];
    data.decisions.forEach(function(d){ var l = lessonFor(d); if (l) out.push({ d: d, l: l }); });
    return out;
  }
  function pickOthers(pool, not, n){
    var seen = {}, out = [];
    seen[not] = true;
    shuffle(pool).forEach(function(x){ if (out.length < n && nonEmpty(x) && !seen[x]){ seen[x] = true; out.push(x); } });
    return out.length === n ? out : null;
  }
  // Questions only reuse text from this person's lessons, principles and decision titles. No new facts.
  function buildQuiz(){
    var L = lessonsPlayed();
    if (!school || !L.length) return [];
    var pNames = school.principles.map(function(p){ return p.name; });
    var cands = { a: [], b: [], c: [], d: [] };
    L.forEach(function(x, i){
      var others = L.filter(function(y, j){ return j !== i; });
      var o = pickOthers(pNames, x.l.principle.name, 2);
      if (o) cands.a.push({ key: x.d.id, q: 'Which principle explains this move: “' + x.d.title + '”', right: x.l.principle.name, opts: o });
      o = pickOthers(others.map(function(y){ return y.l.watchOut; }), x.l.watchOut, 2);
      if (o) cands.b.push({ key: x.d.id, q: 'What was the watch-out for this move: “' + x.d.title + '”', right: x.l.watchOut, opts: o });
      o = pickOthers(others.filter(function(y){ return y.l.principle.id !== x.l.principle.id; }).map(function(y){ return y.d.title; }), x.d.title, 2);
      if (o) cands.c.push({ key: x.d.id, q: 'Which move is an example of “' + x.l.principle.name + '”?', right: x.d.title, opts: o });
      o = pickOthers(others.map(function(y){ return y.l.takeaway; }), x.l.takeaway, 2);
      if (o) cands.d.push({ key: x.d.id, q: 'What does this move teach: “' + x.d.title + '”', right: x.l.takeaway, opts: o });
    });
    var types = shuffle(['a', 'b', 'c', 'd']), out = [], used = {}, pass, t, k, list;
    for (k in cands) if (own(cands, k)) cands[k] = shuffle(cands[k]);
    // first pass: different type and different decision each time; second pass: any unused question
    for (pass = 0; pass < 2 && out.length < 3; pass++){
      for (t = 0; t < types.length && out.length < 3; t++){
        list = cands[types[t]];
        for (var i = 0; i < list.length; i++){
          var c = list[i], id = types[t] + ':' + c.key;
          if (used[id] || (pass === 0 && used['dec:' + c.key])) continue;
          used[id] = true; used['dec:' + c.key] = true;
          out.push({ q: c.q, right: c.right, opts: shuffle([c.right].concat(c.opts)) });
          if (pass === 0) break;
          if (out.length >= 3) break;
        }
      }
    }
    return out.length >= 3 ? out.slice(0, 3) : [];
  }

  function renderSchoolEnd(){
    var box = $('lf-school'); if (!box) return;
    closePop(false);
    if (!school){ box.hidden = true; return; }
    box.hidden = false;
    var oldCrest = box.querySelector('.lf-school__crest');
    if (oldCrest) box.removeChild(oldCrest);
    var cr = crest(data.person.slug, 'lf-school__crest');
    if (cr) box.insertBefore(cr, box.firstChild);
    $('lf-schoolh').textContent = 'School of ' + data.person.name + ': ' + school.name;
    $('lf-school-tag').textContent = school.tagline;
    var met = {}, L = lessonsPlayed();
    L.forEach(function(x){ met[x.l.principle.id] = true; });
    var list = school.principles.filter(function(p){ return met[p.id]; });
    $('lf-school-prh').textContent = list.length ? 'Principles you met' : 'The principles';
    if (!list.length) list = school.principles;
    var ul = clear($('lf-school-pr'));
    list.forEach(function(p){ ul.appendChild(principleItem(p)); });
    startQuiz();
  }

  function principleItem(p){
    var li = el('li', 'lf-princ__item');
    li.appendChild(el('p', 'lf-princ__name', p.name));
    li.appendChild(el('p', 'lf-princ__sum', p.summary));
    var ul = el('ul', 'lf-src lf-princ__src'); srcList(ul, p.sources);
    if (ul.firstChild) li.appendChild(ul);
    return li;
  }

  function startQuiz(){
    quiz = buildQuiz(); qAt = 0; qScore = 0;
    var box = clear($('lf-quiz')), p = data.person, dip = diplomaFor(loadStore(), p.slug);
    unlockLine($('lf-unlock'), p.slug, who, dip);
    renderDiploma(dip);
    if (!quiz.length){
      box.appendChild(el('p', 'lf-quiz__none', 'The quiz opens once this school has at least three lessons.'));
      return;
    }
    box.appendChild(el('h3', 'lf-h3 lf-quiz__h', 'Quiz: 3 questions'));
    box.appendChild(el('p', 'lf-quiz__how', 'Get 2 of 3 right to earn the diploma' + (dip ? ' again (you already have it).' : '.') + ' Every answer comes from the lessons above.'));
    var stage = el('div', 'lf-quiz__stage'); stage.id = 'lf-qstage';
    box.appendChild(stage);
    renderQuestion();
  }

  function renderQuestion(){
    var q = quiz[qAt], stage = clear($('lf-qstage'));
    stage.appendChild(el('p', 'lf-quiz__no', 'Question ' + (qAt + 1) + ' of ' + quiz.length));
    var h = el('p', 'lf-quiz__q', q.q); h.id = 'lf-qq-' + qAt; h.tabIndex = -1;
    stage.appendChild(h);
    var grp = el('div', 'lf-quiz__opts');
    grp.setAttribute('role', 'group'); grp.setAttribute('aria-labelledby', h.id);
    q.opts.forEach(function(o, i){
      var b = el('button', 'lf-opt lf-quiz__opt');
      b.type = 'button';
      b.appendChild(el('span', 'lf-opt__k', String.fromCharCode(65 + i)));
      b.appendChild(el('span', 'lf-opt__t', o));
      b.addEventListener('click', function(){ answer(o, b); });
      grp.appendChild(b);
    });
    stage.appendChild(grp);
    var fb = el('p', 'lf-quiz__fb'); fb.id = 'lf-qfb'; fb.tabIndex = -1; fb.hidden = true;
    stage.appendChild(fb);
    if (qAt > 0) focusTop(h);
  }

  function answer(o, btn){
    var q = quiz[qAt], ok = o === q.right, stage = $('lf-qstage');
    if (ok) qScore++;
    Array.prototype.forEach.call(stage.querySelectorAll('.lf-quiz__opt'), function(b){
      b.disabled = true;
      if (b.querySelector('.lf-opt__t').textContent === q.right) b.classList.add('is-right');
    });
    if (!ok) btn.classList.add('is-wrong');
    btn.classList.add('is-picked');
    var fb = $('lf-qfb');
    clear(fb);
    fb.className = 'lf-quiz__fb ' + (ok ? 'is-win' : 'is-miss');
    fb.appendChild(el('strong', null, ok ? 'Right. ' : 'Not quite. '));
    if (!ok) fb.appendChild(document.createTextNode('The answer: ' + q.right));
    fb.hidden = false;
    var nb = el('button', 'lf-btn lf-btn--gold lf-quiz__next', qAt + 1 < quiz.length ? 'Next question' : 'See quiz result');
    nb.type = 'button';
    nb.addEventListener('click', function(){ qAt++; if (qAt < quiz.length) renderQuestion(); else quizResult(); });
    stage.appendChild(nb);
    say((ok ? 'Right.' : 'Not quite. The answer: ' + q.right) + ' ' + qScore + ' of ' + (qAt + 1) + ' so far.');
    try { nb.focus({ preventScroll: true }); } catch (e) { nb.focus(); }
  }

  function quizResult(){
    var p = data.person, n = quiz.length, passed = qScore >= 2, stage = clear($('lf-qstage'));
    var had = diplomaFor(loadStore(), p.slug), saved = true;
    if (passed) saved = awardDiploma(p.slug, qScore, n);
    var dip = diplomaFor(loadStore(), p.slug) || (passed ? { date: today(), score: qScore, of: n } : null);
    var h = el('p', 'lf-quiz__res ' + (passed ? 'is-win' : 'is-miss'), 'Quiz: ' + qScore + '/' + n + (passed ? (had ? ' · passed again' : ' · diploma earned!') : ' · not yet'));
    h.tabIndex = -1;
    stage.appendChild(h);
    if (passed && !saved) stage.appendChild(el('p', 'lf-bestline__warn', 'This browser is not saving, so the diploma will not be kept.'));
    if (!passed) stage.appendChild(el('p', 'lf-quiz__how', 'You need 2 of 3. Read the principles above and try a new set of questions.'));
    var again = el('button', 'lf-btn lf-btn--ghost', passed ? 'Take the quiz again' : 'Try the quiz again');
    again.type = 'button';
    again.addEventListener('click', function(){ startQuiz(); var q = $('lf-qq-0'); if (q) focusTop(q); });
    stage.appendChild(again);
    renderDiploma(dip);
    unlockLine($('lf-unlock'), p.slug, who, dip);
    focusTop(h);
    say('Quiz result: ' + qScore + ' of ' + n + '. ' + (passed ? 'Diploma earned. ' + who + '’s next moves are unlocked.' : 'Not yet. You need 2 of 3.'));
  }

  function renderDiploma(dip){
    var box = $('lf-diploma'); if (!box) return;
    clear(box);
    if (!dip){ box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(seal('lf-seal--lg'));
    var t = el('div', 'lf-diploma__txt');
    t.appendChild(el('p', 'lf-diploma__k', 'Diploma'));
    t.appendChild(el('p', 'lf-diploma__name', 'School of ' + data.person.name + ': ' + school.name));
    t.appendChild(el('p', 'lf-diploma__meta', ACADEMY_NAME + ' · earned ' + BD.fmtDate(dip.date) + (dip.of ? ' · quiz ' + dip.score + '/' + dip.of : '')));
    box.appendChild(t);
  }

  // =====================================================================================================
  // ACADEMY PAGE (academy.html)
  // =====================================================================================================
  var glossTerms = [];

  function initAcademy(){
    applyAcademyName();
    document.title = ACADEMY_NAME + ' · Billionaire Life · Billionaires Digest';
    var grid = $('ac-schools'), status = $('ac-status');
    loadRoster().then(function(list){
      var store = loadStore(), withSchool = [], without = [];
      list.forEach(function(p){ (schoolOf(p) ? withSchool : without).push(p); });
      clear(grid);
      if (!withSchool.length){
        status.textContent = 'The first schools are being written. Check back soon, or play the games in the meantime.';
        status.hidden = false;
      } else {
        status.hidden = true;
        withSchool.forEach(function(p){ grid.appendChild(schoolCard(p, diplomaFor(store, p.slug))); });
      }
      var soon = $('ac-soon');
      if (without.length){
        clear(soon);
        soon.appendChild(document.createTextNode('Schools coming soon: '));
        without.forEach(function(p, i){
          var a = el('a', 'lf-link', p.name); a.href = 'life-play.html?p=' + encodeURIComponent(p.slug);
          a.setAttribute('aria-label', 'Play as ' + p.name + ' (school coming soon)');
          soon.appendChild(a);
          if (i < without.length - 1) soon.appendChild(document.createTextNode(', '));
        });
        soon.appendChild(document.createTextNode('. Their games are already playable.'));
        soon.hidden = false;
      }
      var dips = withSchool.filter(function(p){ return diplomaFor(store, p.slug); }).length;
      $('ac-count').textContent = withSchool.length ? (withSchool.length === 1 ? '1 school open' : withSchool.length + ' schools open') + ' · your diplomas: ' + dips + ' of ' + withSchool.length : '';
    }).then(null, function(){
      status.textContent = 'Could not load the schools. Please reload the page.';
      status.hidden = false;
    });
    initGlossary();
  }

  function schoolCard(p, dip){
    var sc = schoolOf(p), who2 = shortName(p);
    var li = el('li', 'ac-card' + (dip ? ' has-dip' : ''));
    var head = el('div', 'ac-card__head');
    head.appendChild(plate(p, 'ac-card__av'));
    var ht = el('div', 'ac-card__ht');
    var h = el('h3', 'ac-card__school', sc.name); h.id = 'ac-h-' + p.slug;
    ht.appendChild(h);
    ht.appendChild(el('p', 'ac-card__who', 'School of ' + p.name));
    head.appendChild(ht);
    var cr = crest(p.slug, 'ac-card__crest');
    if (cr) head.appendChild(cr);
    li.appendChild(head);
    li.appendChild(el('p', 'ac-card__tag', sc.tagline));
    var ul = el('ul', 'lf-princ ac-card__pr');
    sc.principles.forEach(function(pr){ ul.appendChild(principleItem(pr)); });
    li.appendChild(ul);
    li.appendChild(dip ? diplomaChip(dip) : el('p', 'ac-card__nodip', 'No diploma yet'));
    li.appendChild(unlockLine(el('p'), p.slug, who2, dip));
    var a = el('a', 'lf-btn lf-btn--gold ac-card__play', 'Play & learn');
    a.href = 'life-play.html?p=' + encodeURIComponent(p.slug);
    a.setAttribute('aria-label', 'Play and learn: ' + p.name + ', ' + sc.name);
    li.appendChild(a);
    return li;
  }

  function initGlossary(){
    var q = $('ac-q'), list = $('ac-gloss'), st = $('ac-gstatus');
    BD.getJson('data/life/glossary.json').then(function(j){
      glossTerms = j && Array.isArray(j.terms) ? j.terms.filter(function(t){ return t && nonEmpty(t.id) && nonEmpty(t.term) && nonEmpty(t.definition) && t.source && safeUrl(t.source.url); }) : [];
      if (!glossTerms.length){ st.textContent = 'Glossary terms arrive with the first schools.'; q.disabled = true; return; }
      q.disabled = false;
      renderGlossary('');
      q.addEventListener('input', function(){ renderGlossary(q.value); });
    }).then(null, function(){
      st.textContent = 'Glossary terms arrive with the first schools.';
      q.disabled = true;
      clear(list);
    });
  }

  function renderGlossary(query){
    var list = clear($('ac-gloss')), st = $('ac-gstatus'), qn = BD.norm(query || '');
    var hits = glossTerms.filter(function(t){ return !qn || BD.norm(t.term + ' ' + t.definition).indexOf(qn) >= 0; });
    hits.forEach(function(t){
      var li = el('li', 'ac-term');
      li.appendChild(el('h3', 'ac-term__t', t.term));
      li.appendChild(el('p', 'ac-term__d', t.definition));
      var src = el('p', 'ac-term__src');
      var a = el('a', 'lf-link', 'Source: ' + (t.source.publisher || t.source.title)); a.href = safeUrl(t.source.url); a.rel = 'noopener'; a.target = '_blank';
      a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)'));
      src.appendChild(a);
      li.appendChild(src);
      var used = Array.isArray(t.usedBy) ? t.usedBy.filter(function(x){ return x && validSlug(x.slug) && x.name; }) : [];
      var def = Array.isArray(t.definedBy) ? t.definedBy.filter(function(x){ return x && validSlug(x.slug) && x.name; }) : [];
      var who3 = used.length ? used : def;
      if (who3.length){
        var u = el('p', 'ac-term__used');
        u.appendChild(document.createTextNode(used.length ? 'In the lessons of: ' : 'From the glossary of: '));
        who3.forEach(function(x, i){
          var l = el('a', 'lf-link', x.name); l.href = 'life-play.html?p=' + encodeURIComponent(x.slug);
          u.appendChild(l);
          if (i < who3.length - 1) u.appendChild(document.createTextNode(', '));
        });
        li.appendChild(u);
      }
      list.appendChild(li);
    });
    var msg = hits.length === glossTerms.length ? BD.plural(glossTerms.length, 'term', 'terms') : (hits.length ? hits.length + ' of ' + glossTerms.length + ' terms match' : 'No terms match “' + query + '”.');
    st.textContent = msg;
  }

  if ($('lf-hub')) initHub();
  if ($('lf-academy')) initAcademy();
  if ($('lf-game')){ applyAcademyName(); bindGame(); initGame(); }
})();
