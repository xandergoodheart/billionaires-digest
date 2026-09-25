/* markets.html: play-money yes/no markets. ES5, needs common.js, game-client.js, account.js.
   UI kit: assets/game-ui.css (g-card, g-drawer, g-stat, g-countdown, g-toast); page layout: assets/game.css (gp-). */
(function(){
  BD.initTheme();
  var $ = function(id){ return document.getElementById(id); };
  if (!window.BDAccount || !window.BDGame) {   // a game script failed to load: show the fallback, never throw
    var soon = $('gameaccount');
    if (soon) soon.textContent = 'Multiplayer is coming soon.';
    return;
  }
  var el = BD.el, L = BDGame.lmsr;
  var openBox = $('openmarkets');
  var doneBox = $('resolvedmarkets');
  var markets = [], resolved = [], positions = {}, acct = { enabled: false, loading: true };

  function pct(p){ var v = p * 100; return (v < 1 || v > 99 ? v.toFixed(1) : Math.round(v)) + '%'; }
  function num(n, d){ return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }); }
  function nyTime(iso){
    try {
      return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
    } catch(e) { return iso; }
  }
  function priceOf(m){ return L.price(+m.q_yes, +m.q_no, +m.b); }
  function isTradable(m){ return m.status === 'open' && new Date(m.closes_at).getTime() > Date.now(); }
  function playing(){ return !!(acct.enabled && acct.signedIn && acct.me); }
  function status(box, text){ box.innerHTML = ''; box.appendChild(el('p', 'g-msg', text)); }
  function held(m){ var p = positions[m.id]; return { yes: p ? +p.yes_shares : 0, no: p ? +p.no_shares : 0 }; }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }

  var live = $('marketnews');
  function announce(t){ if (live) { live.textContent = ''; setTimeout(function(){ live.textContent = t; }, 30); } }
  function toast(t, bad){
    var region = $('toasts'), n = el('div', 'g-toast' + (bad ? ' g-toast--bad' : ''), t);
    region.appendChild(n);
    while (region.children.length > 3) region.removeChild(region.firstChild);
    setTimeout(function(){ if (n.parentNode) n.parentNode.removeChild(n); }, 4200);
  }

  // ---------- header strip ----------
  function pill(kind, text, title){
    var box = $('statuspill'); box.innerHTML = '';
    var p = el('span', 'g-pill g-pill--' + kind); p.appendChild(el('span', 'g-pill__dot')); p.appendChild(document.createTextNode(text));
    if (title) p.title = title;
    box.appendChild(p);
  }
  function renderHead(){
    if (acct.loading) return;
    if (!acct.enabled) { pill('upcoming', 'Coming soon'); $('keystat').textContent = '—'; return; }
    var n = markets.filter(isTradable).length;
    if (n) pill('live', 'Trading open', 'Trading closes Friday at 4:00 PM New York time');
    else pill('final', markets.length ? 'Trading closed' : 'No open markets');
    $('keystat').textContent = String(n);
  }

  // ---------- countdown ----------
  function parts(ms){ var m = Math.max(0, Math.floor(ms / 60000)); return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 }; }
  function spanText(ms){ var p = parts(ms); return (p.d ? p.d + ' days ' : '') + (p.d || p.h ? p.h + ' hours ' : '') + p.m + ' minutes'; }
  function fillCountdown(node){
    var at = new Date(node.getAttribute('data-closes')).getTime(), left = at - Date.now();
    node.innerHTML = '';
    if (!(left > 0)) { node.appendChild(el('span', 'g-countdown__label', 'Trading closed')); node.removeAttribute('aria-label'); return; }
    node.appendChild(el('span', 'g-countdown__label', 'Closes in'));
    var tm = el('span', 'g-countdown__time'), p = parts(left);
    [[p.d, 'd'], [p.h, 'h'], [p.m, 'm']].forEach(function(x, i){ if (i === 0 && !x[0]) return; tm.appendChild(el('b', null, String(x[0]))); tm.appendChild(el('small', null, x[1])); });
    node.appendChild(tm);
    node.setAttribute('aria-label', 'Trading closes in ' + spanText(left) + ', ' + node.getAttribute('data-when'));
  }
  setInterval(function(){
    Array.prototype.forEach.call(document.querySelectorAll('.g-countdown[data-closes]'), fillCountdown);
  }, 60000);

  function load(){
    renderHead();
    if (acct.loading) return;
    $('resolvedh').hidden = !acct.enabled;
    if (!acct.enabled) { status(openBox, 'Markets open when multiplayer launches.'); doneBox.innerHTML = ''; return; }
    if (!markets.length) status(openBox, 'Loading markets…');
    var mine = playing() ? BDGame.myPositions() : Promise.resolve([]);
    Promise.all([BDGame.openMarkets(), BDGame.resolvedMarkets(30), mine]).then(function(r){
      markets = r[0] || []; resolved = r[1] || []; positions = {};
      (r[2] || []).forEach(function(p){ positions[p.market_id] = p; });
      renderHead(); renderOpen(); renderResolved();
      if (trade) refreshTrade();
    }).catch(function(e){ status(openBox, 'Could not load markets. ' + e.message); });
  }

  // ---------- open markets ----------
  function renderOpen(){
    var act = document.activeElement, keep = act && openBox.contains(act) ? act.getAttribute('data-key') : null;
    openBox.innerHTML = '';
    if (!markets.length) { status(openBox, 'No open markets right now. New ones open on Monday mornings.'); return; }
    var list = el('ul', 'gp-mlist');
    list.setAttribute('aria-labelledby', 'openh');
    markets.forEach(function(m){ list.appendChild(marketCard(m)); });
    openBox.appendChild(list);
    if (keep) { var n = openBox.querySelector('[data-key="' + keep + '"]'); if (n) n.focus(); }
  }

  function marketCard(m){
    var li = el('li');
    var card = el('article', 'g-card gp-mkt');
    card.setAttribute('aria-labelledby', 'mq-' + m.id);
    li.appendChild(card);
    var p = priceOf(m), tradable = isTradable(m);
    var h = el('h3', 'gp-mq', m.question); h.id = 'mq-' + m.id;
    card.appendChild(h);

    // price + probability bar
    var pr = el('div', 'gp-price');
    pr.appendChild(el('span', 'g-stat__num g-num', pct(p)));
    pr.appendChild(el('span', 'gp-price__lab', 'chance of YES'));
    card.appendChild(pr);
    var prob = el('div');
    var row = el('div', 'g-matchup__probrow');
    row.appendChild(el('span', null, 'YES ' + pct(p))); row.appendChild(el('span', null, 'NO ' + pct(1 - p)));
    prob.appendChild(row);
    var bar = el('div', 'g-matchup__bar');
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'Market price: ' + pct(p) + ' chance of YES');
    var a = el('span', 'a'), b = el('span', 'b');
    a.style.width = (p * 100).toFixed(1) + '%'; b.style.width = ((1 - p) * 100).toFixed(1) + '%';
    bar.appendChild(a); bar.appendChild(b); prob.appendChild(bar);
    card.appendChild(prob);

    // closes-in + open interest
    var meta = el('div', 'gp-mmeta');
    if (tradable) {
      var cd = el('div', 'g-countdown');
      cd.setAttribute('data-closes', m.closes_at); cd.setAttribute('data-when', nyTime(m.closes_at));
      fillCountdown(cd);
      meta.appendChild(cd);
    } else meta.appendChild(el('span', null, 'Trading closed · waiting for the result'));
    var shares = +m.q_yes + +m.q_no;
    var vol = el('span', 'g-num', shares > 0 ? num(shares, 0) + ' shares out' : 'No trades yet');
    vol.title = 'Shares held by players now: ' + num(+m.q_yes, 0) + ' YES, ' + num(+m.q_no, 0) + ' NO';
    meta.appendChild(vol);
    card.appendChild(meta);

    // my position
    var hs = held(m), pos = positions[m.id];
    if (hs.yes > 0.0001 || hs.no > 0.0001) {
      var worth = hs.yes * p + hs.no * (1 - p);
      var pp = el('p', 'gp-pos');
      pp.appendChild(el('strong', null, 'You hold ' + [hs.yes > 0.0001 ? num(hs.yes, 2) + ' YES' : '', hs.no > 0.0001 ? num(hs.no, 2) + ' NO' : ''].filter(Boolean).join(' and ') + ' shares. '));
      pp.appendChild(document.createTextNode('Worth about ' + num(worth, 0) + ' coins now · you put in ' + num(pos.cost_basis, 0) + '.'));
      card.appendChild(pp);
    }

    // actions
    if (tradable) {
      var acts = el('div', 'gp-macts');
      var why = null;
      if (!playing()) { why = el('p', 'gp-why', 'To trade, press Play online above and pick a nickname.'); why.id = 'why-' + m.id; }
      var by = btn('g-btn gp-btn-yes', 'Buy YES'), bn = btn('g-btn gp-btn-no', 'Buy NO');
      by.setAttribute('data-key', m.id + ':yes'); bn.setAttribute('data-key', m.id + ':no');
      by.setAttribute('aria-describedby', 'mq-' + m.id + (why ? ' why-' + m.id : '')); bn.setAttribute('aria-describedby', by.getAttribute('aria-describedby'));
      by.setAttribute('aria-haspopup', 'dialog'); bn.setAttribute('aria-haspopup', 'dialog');
      if (!playing()) { by.disabled = true; bn.disabled = true; }
      by.addEventListener('click', function(){ openTrade(m.id, 'buy', 'yes', by); });
      bn.addEventListener('click', function(){ openTrade(m.id, 'buy', 'no', bn); });
      acts.appendChild(by); acts.appendChild(bn);
      if (playing() && (hs.yes > 0.0001 || hs.no > 0.0001)) {
        var sb = btn('g-btn gp-sell', 'Sell shares'); sb.setAttribute('data-key', m.id + ':sell');
        sb.setAttribute('aria-haspopup', 'dialog'); sb.setAttribute('aria-describedby', 'mq-' + m.id);
        sb.addEventListener('click', function(){ openTrade(m.id, 'sell', hs.yes > 0.0001 ? 'yes' : 'no', sb); });
        acts.appendChild(sb);
      }
      card.appendChild(acts);
      if (why) card.appendChild(why);
    }
    return li;
  }

  // ---------- trade drawer (buy or sell) ----------
  var trade = null;   // { id, mode, side, opener }
  var drawer = $('drawer'), panel = $('drawerpanel'), form = $('tradeform'), foot = $('drawerfoot');
  function marketById(id){ return markets.filter(function(x){ return x.id === id; })[0] || null; }
  function focusables(){
    return Array.prototype.filter.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){ return n.getClientRects().length > 0; });
  }
  function openTrade(id, mode, side, opener){
    if (!playing()) return;
    trade = { id: id, mode: mode, side: side, opener: opener, value: null };
    drawer.hidden = false;
    document.documentElement.classList.add('g-lock');
    buildTrade();
    var first = form.querySelector('input[type="number"]') || panel;
    first.focus();
  }
  function closeTrade(){
    if (!trade) return;
    var opener = trade.opener, key = opener && opener.getAttribute('data-key');
    trade = null;
    drawer.hidden = true;
    document.documentElement.classList.remove('g-lock');
    form.innerHTML = ''; foot.innerHTML = '';
    if (opener && document.contains(opener)) opener.focus();
    else if (key) { var n = openBox.querySelector('[data-key="' + key + '"]'); if (n) n.focus(); }
  }
  drawer.addEventListener('click', function(e){ if (e.target.closest && e.target.closest('[data-close]')) closeTrade(); });
  document.addEventListener('keydown', function(e){
    if (!trade) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeTrade(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) { e.preventDefault(); panel.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // markets changed under an open drawer (after a trade elsewhere, a refresh): keep it if still valid
  function refreshTrade(){
    var m = marketById(trade.id);
    if (!m || !isTradable(m) || !playing()) { closeTrade(); return; }
    if (trade.mode === 'sell') { var hs = held(m); if (!(hs[trade.side] > 0.0001)) { closeTrade(); return; } }
    var inp = form.querySelector('input[type="number"]'), had = inp && document.activeElement === inp;
    if (inp) trade.value = inp.value;
    buildTrade();
    if (had) { var n = form.querySelector('input[type="number"]'); if (n) n.focus(); }
  }

  function sidePicker(m, sides){
    var fs = el('fieldset', 'gp-sides');
    fs.appendChild(el('legend', 'g-label', trade.mode === 'buy' ? 'Buy which side' : 'Sell which side'));
    var p = priceOf(m), hs = held(m);
    sides.forEach(function(s){
      var id = 'side-' + s;
      var lab = el('label', 'gp-side gp-side--' + s); lab.htmlFor = id;
      var r = el('input'); r.type = 'radio'; r.name = 'side'; r.value = s; r.id = id; r.checked = s === trade.side;
      r.addEventListener('change', function(){ if (r.checked) { trade.side = s; trade.value = null; buildTrade(); var n = $('side-' + s); if (n) n.focus(); } });
      lab.appendChild(r);
      lab.appendChild(document.createTextNode(s.toUpperCase()));
      lab.appendChild(el('small', null, trade.mode === 'buy' ? pct(s === 'yes' ? p : 1 - p) + ' a share' : num(hs[s], 2) + ' held'));
      fs.appendChild(lab);
    });
    return fs;
  }
  function stat(label, value, gold){
    var s = el('div', 'g-stat' + (gold ? ' g-stat--gold' : ''));
    s.appendChild(el('span', 'g-stat__label', label)); s.appendChild(el('span', 'g-stat__num g-num', value));
    return s;
  }

  function buildTrade(){
    var m = marketById(trade.id);
    if (!m) { closeTrade(); return; }
    form.innerHTML = ''; foot.innerHTML = '';
    var buying = trade.mode === 'buy';
    $('drawertitle').textContent = buying ? 'Buy ' + trade.side.toUpperCase() : 'Sell ' + trade.side.toUpperCase();
    form.appendChild(el('p', 'gp-dq', m.question));
    var hs = held(m);
    var sides = buying ? ['yes', 'no'] : ['yes', 'no'].filter(function(s){ return hs[s] > 0.0001; });
    form.appendChild(sidePicker(m, sides));

    var field = el('div', 'gp-field');
    var lab = el('label', 'g-label', buying ? 'Coins to spend (1 to ' + L.MAX_SPEND + ')' : 'Shares to sell'); lab.htmlFor = 'tradeamt';
    var inp = el('input', 'g-input g-num'); inp.id = 'tradeamt'; inp.type = 'number';
    if (buying) { inp.min = '1'; inp.max = String(L.MAX_SPEND); inp.step = '1'; inp.inputMode = 'numeric'; }
    else { inp.min = '0'; inp.step = 'any'; inp.inputMode = 'decimal'; }
    inp.value = trade.value != null ? trade.value : (buying ? '50' : String(Math.floor(hs[trade.side] * 100) / 100));
    inp.setAttribute('aria-describedby', 'tradehint');
    field.appendChild(lab); field.appendChild(inp);
    var quick = el('div', 'gp-quick');
    (buying ? [10, 50, 100, 250] : [0.25, 0.5, 1]).forEach(function(q){
      var t = buying ? String(q) : (q === 1 ? 'All' : (q * 100) + '%');
      var b = btn('g-btn', t);
      b.setAttribute('aria-label', buying ? 'Spend ' + q + ' coins' : (q === 1 ? 'Sell all' : 'Sell ' + (q * 100) + ' percent'));
      b.addEventListener('click', function(){ inp.value = buying ? String(q) : String(q === 1 ? hs[trade.side] : Math.floor(hs[trade.side] * q * 100) / 100); update(); inp.focus(); });
      quick.appendChild(b);
    });
    field.appendChild(quick);
    form.appendChild(field);
    var hint = el('p', 'g-msg'); hint.id = 'tradehint'; hint.setAttribute('aria-live', 'polite');
    form.appendChild(hint);
    var prev = el('div', 'g-stats gp-preview');
    form.appendChild(prev);
    var bal = acct.me ? +acct.me.coins : 0;
    form.appendChild(el('p', 'gp-dnote', 'Balance: ' + num(bal, 0) + ' coins. Play money only. The price updates as people trade; the server has the final say.'));
    var msg = el('p', 'g-msg'); msg.setAttribute('role', 'status');
    form.appendChild(msg);

    var go = el('button', 'g-btn g-btn--primary'); go.type = 'submit'; go.setAttribute('form', 'tradeform');
    var cancel = btn('g-btn', 'Cancel'); cancel.setAttribute('data-close', '');
    foot.appendChild(cancel); foot.appendChild(go);

    function amount(){ var v = Number(inp.value); return isFinite(v) ? v : 0; }
    function update(){
      trade.value = inp.value;
      prev.innerHTML = ''; hint.textContent = ''; hint.className = 'g-msg';
      go.disabled = false; inp.removeAttribute('aria-invalid');
      function stop(t){ hint.textContent = t; hint.className = 'g-msg g-msg--bad'; inp.setAttribute('aria-invalid', 'true'); go.disabled = true; }
      if (buying) {
        var c = Math.floor(amount());
        go.textContent = 'Buy ' + trade.side.toUpperCase() + (c > 0 ? ' for ' + num(c, 0) : '');
        if (c < 1) return stop('Enter at least 1 coin.');
        if (c > L.MAX_SPEND) return stop('The most you can spend in one trade is ' + L.MAX_SPEND + ' coins.');
        if (c > bal) return stop('You have ' + num(bal, 0) + ' coins.');
        var r = L.previewBuy(m, trade.side, c);
        if (r.tooFar) return stop('That would push the price past 99%. Try fewer coins.');
        prev.appendChild(stat('Shares', num(r.shares, 2)));
        prev.appendChild(stat('New YES price', pct(r.priceYes)));
        prev.appendChild(stat('Max payout', num(Math.floor(r.shares), 0), true));
        hint.textContent = 'About ' + num(r.avg, 2) + ' coins a share. If ' + trade.side.toUpperCase() + ' wins, each share pays 1 coin.';
      } else {
        var have = hs[trade.side], s = Math.min(amount(), have);
        go.textContent = 'Sell ' + (s > 0 ? num(s, 2) + ' ' : '') + trade.side.toUpperCase();
        if (!(s > 0)) return stop('Enter how many shares to sell.');
        if (amount() > have + 1e-6) return stop('You have ' + num(have, 2) + ' ' + trade.side.toUpperCase() + ' shares.');
        var q = L.previewSell(m, trade.side, s);
        if (q.coins < 1) return stop('That is worth less than 1 coin right now.');
        prev.appendChild(stat('Coins back', num(q.coins, 0), true));
        prev.appendChild(stat('New YES price', pct(q.priceYes)));
        prev.appendChild(stat('Shares left', num(Math.max(0, have - s), 2)));
      }
    }
    inp.addEventListener('input', update);
    form.onsubmit = function(e){
      e.preventDefault();
      if (go.disabled) return;
      go.disabled = true; msg.className = 'g-msg'; msg.textContent = buying ? 'Buying…' : 'Selling…';
      var side = trade.side, call = buying ? BDGame.buy(m.id, side, Math.floor(amount())) : BDGame.sell(m.id, side, Math.min(amount(), hs[side]));
      call.then(function(r){
        var t = buying ? 'Bought ' + num(r.shares, 2) + ' ' + side.toUpperCase() + ' shares for ' + num(r.cost, 0) + ' coins.'
                       : 'Sold ' + num(r.shares != null ? r.shares : amount(), 2) + ' ' + side.toUpperCase() + ' shares for ' + num(r.coins_back, 0) + ' coins.';
        closeTrade();
        toast(t); announce(t);
        return BDAccount.refresh();
      }).catch(function(err){ msg.className = 'g-msg g-msg--bad'; msg.textContent = err.message; go.disabled = false; toast(err.message, true); });
    };
    update();
  }

  // ---------- resolved ----------
  function renderResolved(){
    doneBox.innerHTML = '';
    if (!resolved.length) { status(doneBox, 'No resolved markets yet.'); return; }
    var list = el('ul', 'gp-mlist');
    list.setAttribute('aria-labelledby', 'resolvedh');
    resolved.forEach(function(m){
      var li = el('li');
      var card = el('article', 'g-card g-card--flat gp-mkt gp-done');
      var head = el('div', 'g-card__head');
      head.appendChild(el('h3', 'gp-mq', m.question));
      var isVoid = m.status === 'void';
      var tag = isVoid ? 'Void' : (m.outcome === 'yes' ? 'Resolved YES' : 'Resolved NO');
      head.appendChild(el('span', 'g-badge gp-out gp-out--' + (isVoid ? 'void' : m.outcome), tag));
      card.appendChild(head);
      if (m.resolution_note) card.appendChild(el('p', 'gp-res', m.resolution_note));
      var foot2 = el('div', 'gp-mfoot');
      if (m.resolved_at) foot2.appendChild(el('span', null, 'Settled ' + nyTime(m.resolved_at)));
      var src = BD.safeUrl(m.source_url);
      if (src) { var a = el('a', null, /sec\.gov/.test(src) ? 'SEC filing ↗' : 'Source ↗'); a.href = src; a.rel = 'noopener noreferrer'; a.target = '_blank'; foot2.appendChild(a); }
      var pos = positions[m.id];
      if (pos && pos.payout != null) foot2.appendChild(el('span', 'g-gold', (isVoid ? 'Refunded to you: ' : 'Paid to you: ') + num(pos.payout, 0) + ' coins'));
      if (foot2.childNodes.length) card.appendChild(foot2);
      li.appendChild(card);
      list.appendChild(li);
    });
    doneBox.appendChild(list);
  }

  BDAccount.onChange(function(s){ acct = s; load(); });
})();
