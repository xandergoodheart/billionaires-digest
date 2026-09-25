/* leaderboard.html (#boards) and leagues.html (#leagues). ES5, needs common.js, game-client.js, account.js. */
(function(){
  BD.initTheme();
  if (!window.BDAccount || !window.BDGame) {   // a game script failed to load: show the fallback, never throw
    var soon = document.getElementById('gameaccount');
    if (soon) soon.textContent = 'Multiplayer is coming soon.';
    return;
  }
  var w = window, el = BD.el;
  var acct = { enabled: false };
  function num(n, d){ return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }); }
  function status(box, text){ box.innerHTML = ''; box.appendChild(el('p', 'gx-msg', text)); }

  // A ranked table. cols: [{ label, key, fmt, num }]
  function table(rows, cols, caption){
    var t = el('table', 'gx-table');
    if (caption) { var c = el('caption', 'gx-sr', caption); t.appendChild(c); }
    var thead = el('thead'), tr = el('tr');
    cols.forEach(function(c){ var th = el('th', c.num ? 'n' : null, c.label); th.scope = 'col'; tr.appendChild(th); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function(r){
      var row = el('tr', r.is_me ? 'me' : null);
      cols.forEach(function(c, i){
        var v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
        var cell = el(i === 1 ? 'th' : 'td', c.num ? 'n' : null, v == null ? '' : String(v));
        if (i === 1) cell.scope = 'row';
        row.appendChild(cell);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    var wrap = el('div', 'gx-tablewrap'); wrap.appendChild(t);
    return wrap;
  }
  var nick = function(v, r){ return v + (r.is_me ? ' (you)' : ''); };

  // ---------- leaderboard.html ----------
  var boards = document.getElementById('boards');
  var TABS = [
    { key: 'week', label: 'This week' },
    { key: 'season', label: 'Season' },
    { key: 'coins', label: 'Coins' }
  ];
  var tabBtns = [], currentTab = 'week';
  function setupTabs(){
    var list = document.getElementById('boardtabs');
    if (!list) return;
    try { var h = /tab=(\w+)/.exec(location.hash); if (h && TABS.some(function(t){ return t.key === h[1]; })) currentTab = h[1]; } catch(e){}
    TABS.forEach(function(t, i){
      var b = el('button', 'tab', t.label); b.type = 'button';
      b.id = 'tab-' + t.key; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'boards');
      b.addEventListener('click', function(){ select(t.key, false); });
      b.addEventListener('keydown', function(e){
        var k = e.key, j = -1;
        if (k === 'ArrowRight') j = (i + 1) % TABS.length; else if (k === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
        else if (k === 'Home') j = 0; else if (k === 'End') j = TABS.length - 1;
        if (j >= 0) { e.preventDefault(); select(TABS[j].key, true); }
      });
      tabBtns.push(b); list.appendChild(b);
    });
    paintTabs();
  }
  function paintTabs(){
    tabBtns.forEach(function(b, i){
      var on = TABS[i].key === currentTab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    boards.setAttribute('aria-labelledby', 'tab-' + currentTab);
  }
  function select(key, focus){
    currentTab = key; paintTabs();
    if (focus) document.getElementById('tab-' + key).focus();
    try { history.replaceState(null, '', '#tab=' + key); } catch(e){}
    loadBoard();
  }
  function loadBoard(){
    if (!acct.enabled) { status(boards, 'Leaderboards open when multiplayer launches.'); return; }
    status(boards, 'Loading…');
    var tab = currentTab;
    BDGame.leaderboard(tab).then(function(rows){
      if (tab !== currentTab) return;
      rows = rows || [];
      boards.innerHTML = '';
      if (tab === 'week') {
        var wk = rows.length ? rows[0].week : null;
        boards.appendChild(el('p', 'gx-note', wk ? 'Fantasy week ' + wk + '. Points update once a day after the market data comes in.' : 'No scores yet this week. Scores appear after the first trading day once picks lock.'));
        if (rows.length) boards.appendChild(table(rows, [
          { label: '#', key: 'rank', num: true }, { label: 'Player', key: 'nickname', fmt: nick }, { label: 'Points', key: 'points', num: true, fmt: function(v){ return num(v); } }
        ], 'This week\'s fantasy standings'));
      } else if (tab === 'season') {
        boards.appendChild(el('p', 'gx-note', 'All fantasy weeks added up.'));
        if (rows.length) boards.appendChild(table(rows, [
          { label: '#', key: 'rank', num: true }, { label: 'Player', key: 'nickname', fmt: nick },
          { label: 'Points', key: 'points', num: true, fmt: function(v){ return num(v); } }, { label: 'Weeks', key: 'weeks', num: true }
        ], 'Season fantasy standings'));
        else boards.appendChild(el('p', 'gx-msg', 'No finished weeks yet.'));
      } else {
        boards.appendChild(el('p', 'gx-note', 'Coins in hand plus what open market positions are worth at today\'s prices. Play money only.'));
        if (rows.length) boards.appendChild(table(rows, [
          { label: '#', key: 'rank', num: true }, { label: 'Player', key: 'nickname', fmt: nick },
          { label: 'Coins', key: 'coins', num: true, fmt: function(v){ return num(v, 0); } },
          { label: 'In markets', key: 'open_value', num: true, fmt: function(v){ return num(v, 0); } },
          { label: 'Total', key: 'total', num: true, fmt: function(v){ return num(v, 0); } }
        ], 'Coin standings'));
        else boards.appendChild(el('p', 'gx-msg', 'No players yet.'));
      }
    }).catch(function(e){ status(boards, 'Could not load the leaderboard. ' + e.message); });
  }

  // ---------- leagues.html ----------
  var lbox = document.getElementById('leagues');
  var standBox = document.getElementById('standings');
  var myLeagues = [], shownLeague = null;

  function nameForm(opts){
    var f = el('form', 'gx-form'); f.setAttribute('novalidate', '');
    var lab = el('label', null, opts.label); lab.htmlFor = opts.id;
    var inp = el('input', 'gx-input'); inp.id = opts.id; inp.type = 'text'; inp.maxLength = opts.max; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('autocapitalize', opts.upper ? 'characters' : 'off');
    inp.setAttribute('aria-describedby', opts.id + '-hint');
    var go = el('button', 'gx-btn gx-primary', opts.button); go.type = 'submit';
    var hint = el('p', 'gx-hint', opts.hint); hint.id = opts.id + '-hint';
    var msg = el('p', 'gx-msg'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    var line = el('div', 'gx-inline'); line.appendChild(inp); line.appendChild(go);
    f.appendChild(lab); f.appendChild(line); f.appendChild(hint); f.appendChild(msg);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var v = inp.value.trim(), bad = opts.check(v);
      if (bad) { msg.textContent = bad; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
      inp.removeAttribute('aria-invalid');
      go.disabled = true; msg.textContent = opts.busy;
      opts.submit(v).then(function(text){ go.disabled = false; inp.value = ''; msg.textContent = text; return loadLeagues(); })
        .catch(function(err){ go.disabled = false; msg.textContent = err.message; inp.focus(); });
    });
    return f;
  }

  function renderLeagueForms(){
    var wrap = document.getElementById('leagueforms');
    wrap.innerHTML = '';
    if (!acct.enabled) { return; }
    if (!(acct.signedIn && acct.me)) { wrap.appendChild(el('p', 'gx-note', 'To create or join a league, press Play online above and pick a nickname.')); return; }
    var grid = el('div', 'gx-two');
    var c1 = el('section', 'gx-card'); c1.appendChild(el('h2', 'gx-h3', 'Start a league'));
    c1.appendChild(nameForm({ id: 'lg-name', label: 'League name', max: 20, button: 'Create', busy: 'Creating…',
      hint: '3 to 20 letters, numbers, _ or -. You get a code to share with friends.',
      check: BDGame.validName,
      submit: function(v){ return BDGame.createLeague(v).then(function(r){ shownLeague = r.id; return 'Created ' + r.name + '. Share the code ' + r.invite_code + '.'; }); } }));
    var c2 = el('section', 'gx-card'); c2.appendChild(el('h2', 'gx-h3', 'Join with a code'));
    c2.appendChild(nameForm({ id: 'lg-code', label: 'Invite code', max: 12, upper: true, button: 'Join', busy: 'Joining…',
      hint: '8 letters and numbers from the person who started the league.',
      check: function(v){ return /^[A-Za-z0-9-\s]{8,12}$/.test(v) ? '' : 'Codes are 8 letters and numbers.'; },
      submit: function(v){ return BDGame.joinLeague(v).then(function(r){ shownLeague = r.id; return r.already ? 'You are already in ' + r.name + '.' : 'You joined ' + r.name + '.'; }); } }));
    grid.appendChild(c1); grid.appendChild(c2);
    wrap.appendChild(grid);
  }

  function loadLeagues(){
    if (!acct.enabled) { status(lbox, 'Leagues open when multiplayer launches.'); standBox.innerHTML = ''; return Promise.resolve(); }
    if (!(acct.signedIn && acct.me)) { lbox.innerHTML = ''; standBox.innerHTML = ''; return Promise.resolve(); }
    return BDGame.myLeagues().then(function(rows){
      myLeagues = rows || [];
      renderMyLeagues();
      if (shownLeague && !myLeagues.some(function(l){ return l.id === shownLeague; })) shownLeague = null;
      if (!shownLeague && myLeagues.length) shownLeague = myLeagues[0].id;
      loadStandings();
    }).catch(function(e){ status(lbox, 'Could not load your leagues. ' + e.message); });
  }

  function renderMyLeagues(){
    lbox.innerHTML = '';
    lbox.appendChild(el('h2', 'gx-h2', 'My leagues'));
    if (!myLeagues.length) { lbox.appendChild(el('p', 'gx-msg', 'You are not in a league yet. You can be in up to 10, with up to 50 players each.')); return; }
    var ul = el('ul', 'gx-leagues');
    myLeagues.forEach(function(l){
      var li = el('li', 'gx-league' + (l.id === shownLeague ? ' on' : ''));
      var main = el('div', 'gx-lmain');
      var view = el('button', 'gx-link', l.name); view.type = 'button';
      view.setAttribute('aria-pressed', l.id === shownLeague ? 'true' : 'false');
      view.addEventListener('click', function(){ shownLeague = l.id; renderMyLeagues(); loadStandings(); });
      main.appendChild(view);
      main.appendChild(el('span', 'gx-sub', l.members + (l.members === 1 ? ' player' : ' players') + (l.is_owner ? ' · you started it' : '')));
      li.appendChild(main);
      var acts = el('div', 'gx-acts');
      var code = el('span', 'gx-code', l.invite_code); code.setAttribute('aria-label', 'Invite code ' + l.invite_code.split('').join(' '));
      acts.appendChild(code);
      var copy = el('button', 'gx-btn gx-quiet', 'Copy code'); copy.type = 'button';
      copy.addEventListener('click', function(){
        var done = function(){ copy.textContent = 'Copied'; setTimeout(function(){ copy.textContent = 'Copy code'; }, 1500); };
        try { navigator.clipboard.writeText(l.invite_code).then(done, function(){ copy.textContent = l.invite_code; }); } catch(e) { copy.textContent = l.invite_code; }
      });
      acts.appendChild(copy);
      var leave = el('button', 'gx-btn gx-quiet', 'Leave'); leave.type = 'button';
      leave.setAttribute('aria-label', 'Leave ' + l.name);
      leave.addEventListener('click', function(){
        if (!w.confirm('Leave ' + l.name + '? You can join again with the code.')) return;
        leave.disabled = true;
        BDGame.leaveLeague(l.id).then(loadLeagues).catch(function(e){ leave.disabled = false; w.alert(e.message); });
      });
      acts.appendChild(leave);
      li.appendChild(acts);
      ul.appendChild(li);
    });
    lbox.appendChild(ul);
  }
  function loadStandings(){
    if (!shownLeague) { standBox.innerHTML = ''; return; }
    var l = myLeagues.filter(function(x){ return x.id === shownLeague; })[0];
    status(standBox, 'Loading standings…');
    BDGame.leagueStandings(shownLeague).then(function(rows){
      standBox.innerHTML = '';
      standBox.appendChild(el('h2', 'gx-h2', (l ? l.name : 'League') + ' standings'));
      rows = rows || [];
      var wk = rows.length ? rows[0].week : null;
      standBox.appendChild(el('p', 'gx-note', wk ? 'Fantasy week ' + wk + ' and the season so far.' : 'Scores appear once the first week locks.'));
      standBox.appendChild(table(rows, [
        { label: '#', key: 'rank', num: true },
        { label: 'Player', key: 'nickname', fmt: function(v, r){ return v + (r.is_me ? ' (you)' : '') + (r.is_owner ? ' · owner' : ''); } },
        { label: 'This week', key: 'week_points', num: true, fmt: function(v){ return num(v); } },
        { label: 'Season', key: 'season_points', num: true, fmt: function(v){ return num(v); } }
      ], (l ? l.name : 'League') + ' standings'));
    }).catch(function(e){ status(standBox, 'Could not load standings. ' + e.message); });
  }

  if (boards) setupTabs();
  BDAccount.onChange(function(s){
    acct = s;
    if (boards) loadBoard();
    if (lbox) { renderLeagueForms(); loadLeagues(); }
  });
})();
