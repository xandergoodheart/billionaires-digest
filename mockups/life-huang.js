/* Billionaires Digest v2 PROTOTYPE: Billionaire Life, "Play as Jensen Huang" (mockups/life-huang.html).
   ES5 IIFE. Loads life-huang.json, runs 5 turns: choose, flip reveal, what he actually did + sources, match meter, end recap.
   Game for fun only; no money. Animations run once per reveal and are skipped with prefers-reduced-motion. */
(function(){
  'use strict';
  var el = BD.el;
  var $ = function(id){ return document.getElementById(id); };
  var data = null, order = [], turn = 0, score = 0, picks = [], busy = false, liveT;

  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function reduced(){ return BD.reducedMotion(); }
  function say(t){ var n = $('live'); n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 60); }
  function safeUrl(u){ return typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null; }
  function shuffle(a){ a = a.slice(); for (var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function realOpt(d){ for (var i = 0; i < d.options.length; i++) if (d.options[i].real) return d.options[i]; return null; }
  function show(id){ ['intro', 'turn', 'end'].forEach(function(s){ $(s).hidden = s !== id; }); }
  function focusTop(n, anchor){ try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } var r = (anchor || n).getBoundingClientRect(); if (r.top < 0 || r.top > window.innerHeight * 0.4) window.scrollTo(0, Math.max(0, window.pageYOffset + r.top - 12)); }

  function srcList(ul, sources){
    clear(ul);
    (sources || []).forEach(function(s){
      var u = safeUrl(s.url); if (!u) return;
      var li = el('li');
      var a = el('a', 'lf-link', s.title); a.href = u; a.rel = 'noopener'; a.target = '_blank';
      a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)'));
      li.appendChild(a);
      var meta = [s.publisher, s.date].filter(Boolean).join(', ');
      if (meta) li.appendChild(el('span', 'lf-src__meta', ' · ' + meta));
      ul.appendChild(li);
    });
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
  }

  function renderTurn(){
    var d = data.decisions[turn];
    busy = false;
    $('turnno').textContent = 'Decision ' + (turn + 1) + ' of ' + data.decisions.length;
    $('year').textContent = d.year;
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
    var d = data.decisions[turn], real = realOpt(d), match = !!o.real;
    picks.push({ d: d, pick: o, real: real, match: match });
    if (match) score++;
    Array.prototype.forEach.call($('opts').querySelectorAll('button'), function(b){ b.disabled = true; });
    btn.classList.add('is-picked');

    var v = clear($('verdict'));
    v.className = 'lf-verdict ' + (match ? 'is-win' : 'is-miss');
    v.appendChild(el('span', 'lf-verdict__word', match ? 'Match!' : 'He chose differently'));
    $('yourpick').textContent = match ? 'You picked the same move: ' + o.label + '.' : 'You picked: ' + o.label + '. He went with: ' + real.label + '.';
    $('actual').textContent = d.actual;
    $('outcome').textContent = d.outcome;
    srcList($('src'), d.sources);
    $('next').textContent = turn + 1 < data.decisions.length ? 'Next decision' : 'See your result';

    function reveal(){
      $('front').hidden = true; $('back').hidden = false;
      meter();
      say((match ? 'Match! ' : 'He chose differently. ') + 'He actually: ' + d.actual + ' Score: ' + score + ' of ' + picks.length + '.');
      focusTop($('verdict'), $('turn'));
    }
    if (reduced()){ reveal(); return; }
    var f = $('flip');
    f.classList.add('is-flipping');
    setTimeout(function(){ reveal(); f.classList.remove('is-flipping'); f.classList.add('is-landing', match ? 'is-winfx' : 'is-missfx'); }, 360);
    setTimeout(function(){ f.classList.remove('is-landing'); }, 800);
  }

  function rankFor(s){
    var r = data.ranks || [];
    for (var i = 0; i < r.length; i++) if (s >= r[i].min) return r[i].title;
    return '';
  }

  function renderEnd(){
    var n = data.decisions.length;
    $('endh').textContent = 'Your instincts: ' + score + '/' + n + ' match with ' + data.person.name;
    $('rank').textContent = 'Rank: ' + rankFor(score);
    var ol = clear($('recap'));
    picks.forEach(function(p){
      var li = el('li', 'lf-recap__item ' + (p.match ? 'is-win' : 'is-miss'));
      var h = el('p', 'lf-recap__head');
      h.appendChild(el('span', 'lf-recap__year', p.d.year));
      h.appendChild(el('span', 'lf-recap__title', p.d.title));
      h.appendChild(el('span', 'lf-recap__tag', p.match ? 'Match' : 'Different'));
      li.appendChild(h);
      li.appendChild(el('p', 'lf-recap__line', 'You: ' + p.pick.label));
      li.appendChild(el('p', 'lf-recap__line', 'He: ' + p.d.actual));
      li.appendChild(el('p', 'lf-recap__line lf-recap__out', p.d.outcome));
      var ul = el('ul', 'lf-src'); srcList(ul, p.d.sources); li.appendChild(ul);
      ol.appendChild(li);
    });
    show('end');
    focusTop($('endh'), $('end'));
    say('Game over. Your instincts: ' + score + ' of ' + n + ' match. Rank: ' + rankFor(score) + '.');
  }

  function start(){ turn = 0; score = 0; picks = []; renderTurn(); }

  $('next').addEventListener('click', function(){
    turn++;
    if (turn < data.decisions.length) renderTurn(); else renderEnd();
  });
  $('start').addEventListener('click', start);
  $('again').addEventListener('click', start);

  fetch('life-huang.json', { cache: 'no-store' }).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  }).then(function(j){
    data = j;
    var p = j.person, bio = clear($('bio'));
    $('initials').textContent = p.initials || BD.initials(p.name);
    $('role').textContent = p.role;
    bio.appendChild(document.createTextNode(p.bio + ' '));
    var u = p.bioSource && safeUrl(p.bioSource.url);
    if (u){ var a = el('a', 'lf-link', 'Source: ' + p.bioSource.publisher); a.href = u; a.rel = 'noopener'; a.target = '_blank'; a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)')); bio.appendChild(a); }
    $('start').disabled = false;
  }).then(null, function(){
    $('bio').textContent = 'Could not load the game data. Please reload the page.';
  });
})();
