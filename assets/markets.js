/* markets.html: play-money yes/no markets. ES5, needs common.js, game-client.js, account.js. */
(function(){
  BD.initTheme();
  if (!window.BDAccount || !window.BDGame) {   // a game script failed to load: show the fallback, never throw
    var soon = document.getElementById('gameaccount');
    if (soon) soon.textContent = 'Multiplayer is coming soon.';
    return;
  }
  var el = BD.el, L = BDGame.lmsr;
  var openBox = document.getElementById('openmarkets');
  var doneBox = document.getElementById('resolvedmarkets');
  var markets = [], resolved = [], positions = {}, acct = { enabled: false };
  var openForms = {};  // market id -> which panel is open ('buy' | 'sell'), kept across re-renders

  function pct(p){ var v = p * 100; return (v < 1 || v > 99 ? v.toFixed(1) : Math.round(v)) + '%'; }
  function num(n, d){ return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }); }
  function nyTime(iso){
    try {
      return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
    } catch(e) { return iso; }
  }
  function priceOf(m){ return L.price(+m.q_yes, +m.q_no, +m.b); }
  function isTradable(m){ return m.status === 'open' && new Date(m.closes_at).getTime() > Date.now(); }
  function status(box, text){ box.innerHTML = ''; box.appendChild(el('p', 'gx-msg', text)); }

  function load(){
    if (!acct.enabled) { status(openBox, 'Markets open when multiplayer launches.'); doneBox.innerHTML = ''; return; }
    status(openBox, 'Loading markets…');
    var mine = acct.signedIn && acct.me ? BDGame.myPositions() : Promise.resolve([]);
    Promise.all([BDGame.openMarkets(), BDGame.resolvedMarkets(30), mine]).then(function(r){
      markets = r[0] || []; resolved = r[1] || []; positions = {};
      (r[2] || []).forEach(function(p){ positions[p.market_id] = p; });
      renderOpen(); renderResolved();
    }).catch(function(e){ status(openBox, 'Could not load markets. ' + e.message); });
  }

  // ---------- open markets ----------
  function renderOpen(){
    openBox.innerHTML = '';
    if (!markets.length) { status(openBox, 'No open markets right now. New ones open on Monday mornings.'); return; }
    if (!(acct.signedIn && acct.me)) {
      var n = el('p', 'gx-note', 'You can look around. To trade, press Play online above and pick a nickname.');
      openBox.appendChild(n);
    }
    var list = el('ul', 'gx-mlist');
    markets.forEach(function(m){ list.appendChild(marketCard(m)); });
    openBox.appendChild(list);
  }

  function marketCard(m){
    var li = el('li', 'gx-mkt');
    var p = priceOf(m), tradable = isTradable(m);
    var h = el('h3', 'gx-mq', m.question); h.id = 'mq-' + m.id;
    li.appendChild(h);
    var meta = el('div', 'gx-mmeta');
    var big = el('span', 'gx-mprice'); big.appendChild(el('b', null, pct(p))); big.appendChild(document.createTextNode(' chance of YES'));
    meta.appendChild(big);
    meta.appendChild(el('span', null, tradable ? 'Trading closes ' + nyTime(m.closes_at) : 'Trading closed · waiting for the result'));
    li.appendChild(meta);
    var bar = el('div', 'gx-pbar'); bar.setAttribute('aria-hidden', 'true');
    var fill = el('i'); fill.style.width = (p * 100).toFixed(1) + '%'; bar.appendChild(fill);
    li.appendChild(bar);

    var pos = positions[m.id];
    var ys = pos ? +pos.yes_shares : 0, ns = pos ? +pos.no_shares : 0;
    if (ys > 0.0001 || ns > 0.0001) {
      var worth = ys * p + ns * (1 - p);
      li.appendChild(el('p', 'gx-pos', 'You hold ' + [ys > 0.0001 ? num(ys, 2) + ' YES' : '', ns > 0.0001 ? num(ns, 2) + ' NO' : ''].filter(Boolean).join(' and ') +
        ' shares · worth about ' + num(worth, 0) + ' coins now · you put in ' + num(pos.cost_basis, 0)));
    }
    if (tradable && acct.signedIn && acct.me) {
      var acts = el('div', 'gx-acts');
      var bb = el('button', 'gx-btn gx-primary', 'Buy'); bb.type = 'button';
      bb.setAttribute('aria-expanded', openForms[m.id] === 'buy' ? 'true' : 'false');
      acts.appendChild(bb);
      var sb = null;
      if (ys > 0.0001 || ns > 0.0001) {
        sb = el('button', 'gx-btn', 'Sell'); sb.type = 'button';
        sb.setAttribute('aria-expanded', openForms[m.id] === 'sell' ? 'true' : 'false');
        acts.appendChild(sb);
      }
      li.appendChild(acts);
      var panel = el('div', 'gx-panel');
      li.appendChild(panel);
      var show = function(which, focus){
        openForms[m.id] = which;
        bb.setAttribute('aria-expanded', which === 'buy' ? 'true' : 'false');
        if (sb) sb.setAttribute('aria-expanded', which === 'sell' ? 'true' : 'false');
        panel.innerHTML = '';
        if (which === 'buy') panel.appendChild(buyForm(m, focus));
        else if (which === 'sell') panel.appendChild(sellForm(m, ys, ns, focus));
      };
      bb.addEventListener('click', function(){ show(openForms[m.id] === 'buy' ? null : 'buy', true); });
      if (sb) sb.addEventListener('click', function(){ show(openForms[m.id] === 'sell' ? null : 'sell', true); });
      if (openForms[m.id]) show(openForms[m.id], false);
    }
    return li;
  }

  function sidePicker(name, sides, current, onChange){
    var fs = el('fieldset', 'gx-sides');
    fs.appendChild(el('legend', null, 'Side'));
    sides.forEach(function(s){
      var id = name + '-' + s;
      var lab = el('label', 'gx-side'); lab.htmlFor = id;
      var r = el('input'); r.type = 'radio'; r.name = name; r.value = s; r.id = id; r.checked = s === current;
      r.addEventListener('change', function(){ if (r.checked) onChange(s); });
      lab.appendChild(r); lab.appendChild(document.createTextNode(' ' + s.toUpperCase()));
      fs.appendChild(lab);
    });
    return fs;
  }

  function buyForm(m, focus){
    var f = el('form', 'gx-form'); f.setAttribute('novalidate', '');
    var side = 'yes';
    var fid = 'buy-' + m.id;
    f.appendChild(sidePicker(fid + '-side', ['yes', 'no'], side, function(s){ side = s; update(); }));
    var lab = el('label', null, 'Coins to spend (1 to 500)'); lab.htmlFor = fid + '-coins';
    var inp = el('input', 'gx-input gx-num'); inp.id = fid + '-coins'; inp.type = 'number'; inp.min = '1'; inp.max = '500'; inp.step = '1'; inp.inputMode = 'numeric'; inp.value = '50';
    inp.setAttribute('aria-describedby', fid + '-prev');
    var prev = el('p', 'gx-preview'); prev.id = fid + '-prev'; prev.setAttribute('aria-live', 'polite');
    var go = el('button', 'gx-btn gx-primary'); go.type = 'submit';
    var msg = el('p', 'gx-msg'); msg.setAttribute('role', 'status');
    var line = el('div', 'gx-inline'); line.appendChild(inp); line.appendChild(go);
    f.appendChild(lab); f.appendChild(line); f.appendChild(prev); f.appendChild(msg);
    function coins(){ var v = Math.floor(Number(inp.value)); return isFinite(v) ? v : 0; }
    function update(){
      var c = coins(), bal = acct.me ? +acct.me.coins : 0;
      go.textContent = 'Buy ' + side.toUpperCase() + (c > 0 ? ' for ' + num(c, 0) + ' coins' : '');
      go.disabled = false;
      if (c < 1) { prev.textContent = 'Enter at least 1 coin.'; go.disabled = true; return; }
      if (c > 500) { prev.textContent = 'The most you can spend in one trade is 500 coins.'; go.disabled = true; return; }
      if (c > bal) { prev.textContent = 'You have ' + num(bal, 0) + ' coins.'; go.disabled = true; return; }
      var r = L.previewBuy(m, side, c);
      if (r.tooFar) { prev.textContent = 'That would push the price past 99%. Try fewer coins.'; go.disabled = true; return; }
      prev.textContent = 'You get about ' + num(r.shares, 2) + ' ' + side.toUpperCase() + ' shares (about ' + num(r.avg, 2) + ' coins each). ' +
        'If ' + side.toUpperCase() + ' wins they pay ' + num(Math.floor(r.shares), 0) + ' coins. New YES price: ' + pct(r.priceYes) + '.';
    }
    inp.addEventListener('input', update);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      if (go.disabled) return;
      go.disabled = true; msg.textContent = 'Buying…';
      BDGame.buy(m.id, side, coins()).then(function(r){
        openForms[m.id] = null;
        announce('Bought ' + num(r.shares, 2) + ' ' + side.toUpperCase() + ' shares for ' + num(r.cost, 0) + ' coins.');
        return BDAccount.refresh();
      }).catch(function(err){ msg.textContent = err.message; go.disabled = false; });
    });
    update();
    if (focus) setTimeout(function(){ inp.focus(); }, 0);
    return f;
  }

  function sellForm(m, ys, ns, focus){
    var f = el('form', 'gx-form'); f.setAttribute('novalidate', '');
    var sides = []; if (ys > 0.0001) sides.push('yes'); if (ns > 0.0001) sides.push('no');
    var side = sides[0];
    var fid = 'sell-' + m.id;
    function held(){ return side === 'yes' ? ys : ns; }
    f.appendChild(sidePicker(fid + '-side', sides, side, function(s){ side = s; inp.value = String(Math.floor(held() * 100) / 100); update(); }));
    var lab = el('label', null, 'Shares to sell'); lab.htmlFor = fid + '-n';
    var inp = el('input', 'gx-input gx-num'); inp.id = fid + '-n'; inp.type = 'number'; inp.min = '0'; inp.step = 'any'; inp.inputMode = 'decimal';
    inp.value = String(Math.floor(held() * 100) / 100);
    inp.setAttribute('aria-describedby', fid + '-prev');
    var all = el('button', 'gx-btn gx-quiet', 'All'); all.type = 'button';
    all.addEventListener('click', function(){ inp.value = String(held()); update(); inp.focus(); });
    var prev = el('p', 'gx-preview'); prev.id = fid + '-prev'; prev.setAttribute('aria-live', 'polite');
    var go = el('button', 'gx-btn gx-primary', 'Sell'); go.type = 'submit';
    var msg = el('p', 'gx-msg'); msg.setAttribute('role', 'status');
    var line = el('div', 'gx-inline'); line.appendChild(inp); line.appendChild(all); line.appendChild(go);
    f.appendChild(lab); f.appendChild(line); f.appendChild(prev); f.appendChild(msg);
    function shares(){ var v = Number(inp.value); if (!isFinite(v)) return 0; return Math.min(v, held()); }
    function update(){
      var s = shares();
      go.disabled = false;
      if (!(s > 0)) { prev.textContent = 'Enter how many shares to sell.'; go.disabled = true; return; }
      if (Number(inp.value) > held() + 1e-6) { prev.textContent = 'You have ' + num(held(), 2) + ' ' + side.toUpperCase() + ' shares.'; go.disabled = true; return; }
      var r = L.previewSell(m, side, s);
      if (r.coins < 1) { prev.textContent = 'That is worth less than 1 coin right now.'; go.disabled = true; return; }
      prev.textContent = 'You get about ' + num(r.coins, 0) + ' coins back. New YES price: ' + pct(r.priceYes) + '.';
      go.textContent = 'Sell ' + num(s, 2) + ' ' + side.toUpperCase();
    }
    inp.addEventListener('input', update);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      if (go.disabled) return;
      go.disabled = true; msg.textContent = 'Selling…';
      BDGame.sell(m.id, side, shares()).then(function(r){
        openForms[m.id] = null;
        announce('Sold ' + num(r.shares, 2) + ' ' + side.toUpperCase() + ' shares for ' + num(r.coins_back, 0) + ' coins.');
        return BDAccount.refresh();
      }).catch(function(err){ msg.textContent = err.message; go.disabled = false; });
    });
    update();
    if (focus) setTimeout(function(){ inp.focus(); }, 0);
    return f;
  }

  var live = document.getElementById('marketnews');
  function announce(t){ if (live) live.textContent = t; }

  // ---------- resolved ----------
  function renderResolved(){
    doneBox.innerHTML = '';
    if (!resolved.length) { status(doneBox, 'No resolved markets yet.'); return; }
    var list = el('ul', 'gx-mlist');
    resolved.forEach(function(m){
      var li = el('li', 'gx-mkt gx-done');
      var top = el('div', 'gx-mhead');
      top.appendChild(el('h3', 'gx-mq', m.question));
      var tag = m.status === 'void' ? 'Void' : (m.outcome === 'yes' ? 'Resolved YES' : 'Resolved NO');
      top.appendChild(el('span', 'gx-tag gx-tag-' + (m.status === 'void' ? 'void' : m.outcome), tag));
      li.appendChild(top);
      if (m.resolution_note) li.appendChild(el('p', 'gx-note', m.resolution_note));
      var foot = el('p', 'gx-mmeta');
      var src = BD.safeUrl(m.source_url);
      if (src) { var a = el('a', null, /sec\.gov/.test(src) ? 'SEC filing' : 'Source'); a.href = src; a.rel = 'noopener'; if (/sec\.gov/.test(src)) a.target = '_blank'; foot.appendChild(a); }
      var pos = positions[m.id];
      if (pos && pos.payout != null) foot.appendChild(el('span', null, (m.status === 'void' ? 'Refunded to you: ' : 'Paid to you: ') + num(pos.payout, 0) + ' coins'));
      if (foot.childNodes.length) li.appendChild(foot);
      list.appendChild(li);
    });
    doneBox.appendChild(list);
  }

  BDAccount.onChange(function(s){ acct = s; load(); });
})();
