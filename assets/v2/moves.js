/* Billionaires Digest v2: Next Moves (moves.html). ES5, IIFE, uses the BD helpers from assets/common.js.
   Lists the markets from data/moves/markets.json and the results from data/moves/resolved.json.
   PREVIEW TRADING: the live database does not have these markets yet, so trades use practice coins kept in this
   browser only (localStorage bd-moves-v1, 1,000 coins to start), priced with the same LMSR formulas as the online game. */
(function(w){
  'use strict';
  var BD = w.BD || {};
  var doc = w.document;
  var KEY = 'bd-moves-v1';
  var START = 1000, MAX_SPEND = 500, MAX_PRICE = 0.99;
  var AMOUNTS = [10, 25, 50, 100, 250];
  var KIND_LABEL = { insider_sell: 'Stock sale', insider_buy: 'Stock buy', sale_size: 'Sale size', fund_move: 'Fund holding' };
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function $(id){ return doc.getElementById(id); }
  function el(tag, cls, text){ var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); }
  function reduced(){ return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function safeUrl(u){ return (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : null; }
  function fmtInt(n){ return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtDay(iso){
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? (MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1]) : '';
  }
  function fmtWhen(iso){ // local date + time of a close
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' + (d.getHours() % 12 || 12) + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + (d.getHours() < 12 ? ' AM' : ' PM');
  }
  function getJson(u){
    if (BD.getJson) return BD.getJson(u);
    return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // ---- LMSR, the same formulas as the database and assets/game-client.js ----
  var L = {
    price: function(qy, qn, b){ return 1 / (1 + Math.exp((qn - qy) / b)); },
    sharesFor: function(qSide, qOther, b, c){ return b * Math.log(Math.exp(c / b) + Math.exp((qOther - qSide) / b) * (Math.exp(c / b) - 1)); },
    start: function(p, b){ var d = b * Math.log(p / (1 - p)); return { qy: d > 0 ? d : 0, qn: d < 0 ? -d : 0 }; }
  };

  // ---- practice wallet (this browser only) ----
  function fresh(){ return { v: 1, coins: START, mk: {}, pos: {} }; }
  function load(){
    try {
      var s = JSON.parse(w.localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1 && typeof s.coins === 'number' && s.mk && s.pos) return s;
    } catch (e) {}
    return fresh();
  }
  function save(){ try { w.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var state = load();

  function mstate(m){
    var s = state.mk[m.slug];
    if (!s) { var q = L.start(clampP(m.startProb), +m.b || 100); s = { qy: q.qy, qn: q.qn }; }
    return s;
  }
  function clampP(p){ p = Number(p); if (!(p > 0 && p < 1)) p = 0.5; return Math.min(0.99, Math.max(0.01, p)); }
  function priceYes(m){ var s = mstate(m); return L.price(s.qy, s.qn, +m.b || 100); }

  function buy(m, side, coins){
    var b = +m.b || 100, s = mstate(m);
    if (!(coins >= 1)) return { err: 'Spend at least 1 coin.' };
    if (coins > MAX_SPEND) return { err: 'You can spend up to 500 coins per trade.' };
    if (coins > state.coins) return { err: 'You only have ' + fmtInt(state.coins) + ' practice coins.' };
    var sh = Math.floor(L.sharesFor(side === 'yes' ? s.qy : s.qn, side === 'yes' ? s.qn : s.qy, b, coins) * 1e6) / 1e6;
    if (!(sh > 0)) return { err: 'That trade is too small.' };
    var ny = side === 'yes' ? s.qy + sh : s.qy, nn = side === 'no' ? s.qn + sh : s.qn;
    var py = L.price(ny, nn, b);
    if ((side === 'yes' && py > MAX_PRICE) || (side === 'no' && py < 1 - MAX_PRICE)) return { err: 'That would push the price past 99%. Try fewer coins.' };
    state.mk[m.slug] = { qy: ny, qn: nn };
    var p = state.pos[m.slug] || (state.pos[m.slug] = { yes: 0, no: 0, spent: 0 });
    p[side] += sh; p.spent += coins;
    state.coins -= coins;
    save();
    return { shares: sh, priceYes: py };
  }

  // settle practice picks on markets that have a real result (never on the backtest)
  function settle(resolved){
    var paid = 0, n = 0;
    resolved.forEach(function(r){
      var p = state.pos[r.slug];
      if (!p || p.settled) return;
      var amt = r.outcome === 'yes' ? Math.floor(p.yes) : r.outcome === 'no' ? Math.floor(p.no) : r.outcome === 'void' ? p.spent : 0;
      p.settled = r.outcome; p.payout = amt; state.coins += amt; paid += amt; n++;
    });
    if (n) { save(); toast(n + (n === 1 ? ' pick' : ' picks') + ' settled: ' + fmtInt(paid) + ' practice coins paid.'); }
  }

  // ---- odometer: each digit is a strip 0-9 0-9 that rolls to its value; the real value is text for screen readers ----
  function odometer(box, txt, srText){
    clear(box);
    box.appendChild(el('span', 'v2-sr', srText || txt));
    var vis = el('span', 'mv-odo__digits num');
    vis.setAttribute('aria-hidden', 'true');
    var strips = [];
    for (var i = 0; i < txt.length; i++){
      var ch = txt.charAt(i);
      if (/[0-9]/.test(ch)){
        var col = el('span', 'mv-odo__col'), strip = el('span', 'mv-odo__strip');
        for (var k = 0; k < 20; k++) strip.appendChild(el('span', 'mv-odo__d', String(k % 10)));
        col.appendChild(strip); vis.appendChild(col);
        strips.push({ s: strip, to: 10 + (+ch) });
      } else vis.appendChild(el('span', 'mv-odo__ch', ch));
    }
    box.appendChild(vis);
    if (reduced()){ strips.forEach(function(x){ x.s.style.transform = 'translateY(' + (-x.to) + 'em)'; }); return; }
    void vis.offsetWidth;
    strips.forEach(function(x, j){
      x.s.style.transition = 'transform ' + (700 + j * 200) + 'ms cubic-bezier(.2,.75,.25,1.02) ' + (j * 60) + 'ms';
      x.s.style.transform = 'translateY(' + (-x.to) + 'em)';
    });
  }
  function pctTxt(p){ var n = Math.round(p * 100); if (n < 1) n = 1; if (n > 99) n = 99; return String(n); }

  // ---- countdowns ----
  var timers = [];
  function countdownText(iso){
    var ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return 'Trading closed';
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d >= 1) return 'Closes in ' + d + 'd ' + h + 'h ' + m + 'm';
    return 'Closes in ' + h + 'h ' + (m < 10 ? '0' : '') + m + 'm ' + (sec < 10 ? '0' : '') + sec + 's';
  }
  function tick(){ timers.forEach(function(t){ t.n.textContent = countdownText(t.iso); }); }

  // ---- toasts ----
  function toast(msg){
    var box = $('toasts'); if (!box) return;
    var t = el('p', 'mv-toast', msg);
    box.appendChild(t);
    setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
  }

  // ---- rendering ----
  var DATA = { markets: [], resolved: [], backtest: [] };
  var filter = { person: '', type: '' };

  function balance(animate){
    var box = $('balance');
    var txt = fmtInt(state.coins);
    if (animate === false){ clear(box); box.appendChild(el('span', 'v2-sr', txt + ' practice coins')); var v = el('span', 'mv-odo__digits mv-odo__plain num', txt); v.setAttribute('aria-hidden', 'true'); box.appendChild(v); }
    else odometer(box, txt, txt + ' practice coins');
    var n = 0; for (var k in state.pos) if (state.pos.hasOwnProperty(k) && !state.pos[k].settled) n++;
    $('posstat').textContent = String(n);
  }

  function personLink(p){
    var a = el('a', 'mv-plink', 'Player page');
    a.href = 'player.html?p=' + encodeURIComponent(p.slug);
    a.setAttribute('aria-label', p.name + ': player page');
    return a;
  }

  function sourceLink(url, text){
    var u = safeUrl(url); if (!u) return null;
    var a = el('a', 'mv-src', text); a.href = u; a.rel = 'noopener'; a.target = '_blank';
    a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)'));
    return a;
  }

  function card(m){
    var open = m.status !== 'closed' && new Date(m.closes_at).getTime() > Date.now();
    var c = el('article', 'mv-card' + (open ? '' : ' is-closed'));
    c.setAttribute('aria-labelledby', 'q-' + m.slug);
    var top = el('div', 'mv-card__top');
    top.appendChild(el('span', 'mv-tag mv-tag--' + m.kind, KIND_LABEL[m.kind] || 'Market'));
    var cd = el('span', 'mv-cd num', countdownText(m.closes_at));
    if (open) timers.push({ n: cd, iso: m.closes_at });
    top.appendChild(cd);
    c.appendChild(top);
    var q = el('h3', 'mv-q', m.question); q.id = 'q-' + m.slug;
    c.appendChild(q);

    var row = el('div', 'mv-oddsrow');
    var py = priceYes(m);
    var meter = el('div', 'mv-meter');
    meter.appendChild(el('span', 'mv-meter__k', 'YES now'));
    var odo = el('div', 'mv-odo mv-odo--odds');
    meter.appendChild(odo);
    row.appendChild(meter);
    var side = el('div', 'mv-meter mv-meter--no');
    side.appendChild(el('span', 'mv-meter__k', 'NO now'));
    var no = el('p', 'mv-no num', pctTxt(1 - py) + '%');
    side.appendChild(no);
    row.appendChild(side);
    c.appendChild(row);
    odometer(odo, pctTxt(py) + '%', 'Chance of YES now: ' + pctTxt(py) + '%');

    var base = el('div', 'mv-base');
    base.appendChild(el('p', 'mv-base__k', 'Starting odds from history: ' + Math.round(clampP(m.startProb) * 100) + '% YES' + (m.baseRate && m.baseRate.thin ? ' (history too thin)' : '')));
    if (m.baseRate && m.baseRate.text) base.appendChild(el('p', 'mv-base__t', m.baseRate.text));
    c.appendChild(base);

    var det = el('details', 'mv-rule');
    det.appendChild(el('summary', null, 'How it resolves'));
    det.appendChild(el('p', null, m.rule || ''));
    var src = el('p', 'mv-rule__src');
    src.appendChild(doc.createTextNode('Source of truth: '));
    var sl = sourceLink(m.source && m.source.url, (m.source && m.source.label) || 'SEC EDGAR');
    if (sl) src.appendChild(sl); else src.appendChild(doc.createTextNode((m.source && m.source.label) || 'SEC EDGAR'));
    det.appendChild(src);
    if (m.source && m.source.baseFiling){
      var bf = el('p', 'mv-rule__src');
      bf.appendChild(doc.createTextNode('Starting count from: '));
      bf.appendChild(sourceLink(m.source.baseFiling, 'the ' + fmtDay(m.params && m.params.basePeriod) + ' 13F filing'));
      det.appendChild(bf);
    }
    det.appendChild(el('p', 'mv-rule__src', 'Trading closes ' + fmtWhen(m.closes_at) + ' (your time).'));
    c.appendChild(det);

    var posLine = el('p', 'mv-pos');
    function showPos(){
      var p = state.pos[m.slug];
      posLine.textContent = p ? ('Your practice picks: ' + (p.yes ? fmtInt(Math.floor(p.yes)) + ' YES' : '') + (p.yes && p.no ? ' · ' : '') + (p.no ? fmtInt(Math.floor(p.no)) + ' NO' : '') + ' shares, ' + fmtInt(p.spent) + ' coins in' + (p.settled ? ', settled ' + p.settled.toUpperCase() + ' (paid ' + fmtInt(p.payout) + ')' : '')) : '';
      posLine.hidden = !p;
    }
    showPos();
    c.appendChild(posLine);

    if (open){
      var trade = el('div', 'mv-trade');
      var f = el('div', 'mv-amt');
      var lid = 'amt-' + m.slug;
      var lab = el('label', null, 'Coins'); lab.setAttribute('for', lid);
      var sel = el('select'); sel.id = lid;
      AMOUNTS.forEach(function(a){ var o = el('option', null, String(a)); o.value = String(a); if (a === 50) o.selected = true; sel.appendChild(o); });
      f.appendChild(lab); f.appendChild(sel);
      trade.appendChild(f);
      var yes = el('button', 'mv-btn mv-btn--yes', 'YES'); yes.type = 'button';
      var nob = el('button', 'mv-btn mv-btn--no', 'NO'); nob.type = 'button';
      yes.setAttribute('aria-describedby', 'q-' + m.slug); nob.setAttribute('aria-describedby', 'q-' + m.slug);
      var hint = el('p', 'mv-hint');
      function preview(){
        var coins = +sel.value, b = +m.b || 100, s = mstate(m);
        var sy = L.sharesFor(s.qy, s.qn, b, coins), sn = L.sharesFor(s.qn, s.qy, b, coins);
        hint.textContent = coins + ' coins buys about ' + fmtInt(Math.floor(sy)) + ' YES or ' + fmtInt(Math.floor(sn)) + ' NO shares (1 coin each if right).';
      }
      var busy = false;
      function go(sideName){
        if (busy) return;                       // one trade per tap: ignore a quick second tap
        busy = true; setTimeout(function(){ busy = false; }, 400);
        var r = buy(m, sideName, +sel.value);
        if (r.err){ toast(r.err); return; }
        var p2 = r.priceYes;
        odometer(odo, pctTxt(p2) + '%', 'Chance of YES now: ' + pctTxt(p2) + '%');
        no.textContent = pctTxt(1 - p2) + '%';
        showPos(); preview(); balance();
        toast('Practice pick: ' + fmtInt(Math.floor(r.shares)) + ' ' + sideName.toUpperCase() + ' shares for ' + sel.value + ' coins. YES is now ' + pctTxt(p2) + '%.');
      }
      yes.addEventListener('click', function(){ go('yes'); });
      nob.addEventListener('click', function(){ go('no'); });
      sel.addEventListener('change', preview);
      trade.appendChild(yes); trade.appendChild(nob);
      c.appendChild(trade);
      preview();
      c.appendChild(hint);
    }
    return c;
  }

  function resultCard(r){
    var c = el('article', 'mv-card mv-card--res');
    var top = el('div', 'mv-card__top');
    top.appendChild(el('span', 'mv-tag mv-tag--' + r.kind, KIND_LABEL[r.kind] || 'Market'));
    var lamp = el('span', 'mv-lamp is-' + (r.outcome === 'yes' ? 'yes' : r.outcome === 'no' ? 'no' : 'void'), r.outcome === 'void' ? 'Void' : r.outcome.toUpperCase());
    top.appendChild(lamp);
    c.appendChild(top);
    c.appendChild(el('h3', 'mv-q', r.question));
    var who = el('p', 'mv-who');
    who.appendChild(doc.createTextNode(r.person ? r.person.name + ' · ' : ''));
    if (r.person) who.appendChild(personLink(r.person));
    c.appendChild(who);
    c.appendChild(el('p', 'mv-note', r.note || ''));
    var s = sourceLink(r.source_url, /browse-edgar/.test(r.source_url || '') ? 'Check the filings list on SEC EDGAR' : 'See the filing on SEC EDGAR');
    if (s){ var p = el('p', 'mv-rule__src'); p.appendChild(s); c.appendChild(p); }
    return c;
  }

  function visible(m){
    return (!filter.person || (m.person && m.person.slug === filter.person)) && (!filter.type || m.kind === filter.type);
  }

  function render(){
    timers = [];
    var box = $('markets'); clear(box);
    var open = DATA.markets.filter(function(m){ return m.status !== 'closed' && new Date(m.closes_at).getTime() > Date.now(); });
    var waiting = DATA.markets.filter(function(m){ return open.indexOf(m) < 0; });
    $('openstat').textContent = String(open.length);
    var shown = open.filter(visible);
    var status = $('status');
    if (!DATA.markets.length) status.textContent = 'No Next Moves markets are open right now. New ones open as fresh SEC filings come in.';
    else if (!shown.length) status.textContent = open.length ? 'No open markets match this filter.' : 'No markets are open right now; the latest ones are waiting for filings below.';
    else status.textContent = shown.length + (shown.length === 1 ? ' open market' : ' open markets') + (filter.person || filter.type ? ' match this filter.' : '.');
    // group by person, then type (the file is already sorted that way)
    var groups = [], by = {};
    shown.forEach(function(m){
      var k = m.person.slug;
      if (!by[k]) { by[k] = { person: m.person, list: [] }; groups.push(by[k]); }
      by[k].list.push(m);
    });
    groups.forEach(function(g){
      var sec = el('section', 'mv-person');
      var hid = 'p-' + g.person.slug;
      sec.setAttribute('aria-labelledby', hid);
      var head = el('div', 'mv-person__head');
      var h = el('h2', 'mv-h2', g.person.name); h.id = hid;
      head.appendChild(h);
      head.appendChild(personLink(g.person));
      sec.appendChild(head);
      var grid = el('div', 'mv-grid');
      g.list.forEach(function(m){ grid.appendChild(card(m)); });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    var wl = $('waitinglist'); clear(wl);
    var ws = waiting.filter(visible);
    ws.forEach(function(m){ wl.appendChild(card(m)); });
    $('waiting').hidden = !ws.length;

    var rl = $('resolvedlist');
    var rs = DATA.resolved.filter(visible);
    if (rs.length){ clear(rl); var g2 = el('div', 'mv-grid'); rs.forEach(function(r){ g2.appendChild(resultCard(r)); }); rl.appendChild(g2); }
    var bl = $('backtestlist'); clear(bl);
    var bs = DATA.backtest.filter(visible);
    bs.forEach(function(r){ bl.appendChild(resultCard(r)); });
    $('bt-h').hidden = $('btnote').hidden = !DATA.backtest.length;
    tick();
  }

  function fillPeople(){
    var sel = $('personsel'), seen = {}, list = [];
    DATA.markets.concat(DATA.resolved, DATA.backtest).forEach(function(m){
      if (m.person && !seen[m.person.slug]) { seen[m.person.slug] = 1; list.push(m.person); }
    });
    list.sort(function(a, b){ return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    list.forEach(function(p){ var o = el('option', null, p.name); o.value = p.slug; sel.appendChild(o); });
    var want = /[?&]p=([^&]+)/.exec(w.location.search);
    if (want && seen[decodeURIComponent(want[1])]) { filter.person = decodeURIComponent(want[1]); sel.value = filter.person; }
    sel.addEventListener('change', function(){ filter.person = sel.value; render(); });
  }

  function wire(){
    Array.prototype.forEach.call(doc.querySelectorAll('#typechips .mv-chip'), function(b){
      b.addEventListener('click', function(){
        filter.type = b.getAttribute('data-type') || '';
        Array.prototype.forEach.call(doc.querySelectorAll('#typechips .mv-chip'), function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        render();
      });
    });
    $('resetbtn').addEventListener('click', function(){
      if (!w.confirm('Start over with 1,000 practice coins? Your practice picks in this browser will be cleared.')) return;
      state = fresh(); save(); balance(); render(); toast('Practice coins reset to 1,000.');
    });
    Array.prototype.forEach.call(doc.querySelectorAll('.mv-bulbs'), function(row){
      for (var i = 0; i < 24; i++) row.appendChild(el('span', 'mv-bulb'));
    });
  }

  function init(){
    wire();
    balance(false);
    Promise.all([
      getJson('data/moves/markets.json').catch(function(){ return null; }),
      getJson('data/moves/resolved.json').catch(function(){ return null; })
    ]).then(function(res){
      var mk = res[0], rs = res[1];
      DATA.markets = (mk && mk.markets instanceof Array) ? mk.markets : [];
      DATA.resolved = (rs && rs.resolved instanceof Array) ? rs.resolved.filter(function(r){ return r && !r.backtest; }) : [];
      DATA.backtest = (rs && rs.backtest instanceof Array) ? rs.backtest : [];
      if (!mk) $('status').textContent = 'Could not load the markets. Please try again later.';
      settle(DATA.resolved);
      fillPeople();
      render();
      if (!mk) $('status').textContent = 'Could not load the markets. Please try again later.';
      balance();
      setInterval(tick, 1000);
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
