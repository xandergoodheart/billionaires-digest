/* leaderboard.html (#boards) and leagues.html (#leagues). ES5, needs common.js, game-client.js, account.js.
   UI kit: assets/game-ui.css (g-tabs, g-table, g-card, g-matchup, g-toast); page layout: assets/game.css (gp-). */
(function(){
  BD.initTheme();
  var $ = function(id){ return document.getElementById(id); };
  if (!window.BDAccount || !window.BDGame) {   // a game script failed to load: show the fallback, never throw
    var soon = $('gameaccount');
    if (soon) soon.textContent = 'Multiplayer is coming soon.';
    return;
  }
  var w = window, el = BD.el;
  var acct = { enabled: false, loading: true };
  function num(n, d){ return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }); }
  function pts(v){ var n = Number(v) || 0; return (n > 0 ? '+' : '') + num(n); }
  function status(box, text){ box.innerHTML = ''; box.appendChild(el('p', 'g-msg', text)); }
  function playing(){ return !!(acct.enabled && acct.signedIn && acct.me); }
  function btn(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }
  function pill(kind, text){
    var box = $('statuspill'); if (!box) return;
    box.innerHTML = '';
    var p = el('span', 'g-pill g-pill--' + kind); p.appendChild(el('span', 'g-pill__dot')); p.appendChild(document.createTextNode(text));
    box.appendChild(p);
  }
  function keystat(v){ var k = $('keystat'); if (k) k.textContent = v; }
  function toast(t, bad){
    var region = $('toasts'); if (!region) return;
    var n = el('div', 'g-toast' + (bad ? ' g-toast--bad' : ''), t);
    region.appendChild(n);
    while (region.children.length > 3) region.removeChild(region.firstChild);
    setTimeout(function(){ if (n.parentNode) n.parentNode.removeChild(n); }, 4200);
  }
  function youTag(){ return el('span', 'gp-you', 'You'); }

  // A ranked table that turns into row cards on phones. cols: [{ label, key, fmt, cls }]; col 0 is the rank.
  function table(rows, cols, caption){
    var t = el('table', 'g-table g-table--cards gp-board');
    if (caption) t.appendChild(el('caption', 'g-sr', caption));
    var thead = el('thead'), tr = el('tr');
    cols.forEach(function(c){ var th = el('th', null, c.label); th.scope = 'col'; tr.appendChild(th); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function(r){
      var row = el('tr', r.is_me ? 'is-me' : null);
      cols.forEach(function(c, i){
        var v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
        var cell = el(i === 1 ? 'th' : 'td', (i === 0 ? 'gp-rank g-num' : 'g-num') + (c.cls ? ' ' + c.cls(r) : ''));
        if (i === 1) {
          cell.scope = 'row';
          cell.appendChild(document.createTextNode(v == null ? '' : String(v)));
          if (r.is_me) cell.appendChild(youTag());
          if (r.is_owner) cell.appendChild(el('span', 'g-badge', 'Owner'));
        } else {
          cell.textContent = v == null ? '' : String(v);
          cell.setAttribute('data-label', c.label);
        }
        row.appendChild(cell);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    return t;
  }

  // ---------- leaderboard.html ----------
  var boards = $('boards');
  var TABS = [
    { key: 'week', label: 'This week' },
    { key: 'season', label: 'Season' },
    { key: 'coins', label: 'Coins' }
  ];
  var tabBtns = [], currentTab = 'week';
  function setupTabs(){
    var list = $('boardtabs');
    if (!list) return;
    try { var h = /tab=(\w+)/.exec(location.hash); if (h && TABS.some(function(t){ return t.key === h[1]; })) currentTab = h[1]; } catch(e){}
    TABS.forEach(function(t, i){
      var b = btn('g-tab', t.label);
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
    if (focus) $('tab-' + key).focus();
    try { history.replaceState(null, '', '#tab=' + key); } catch(e){}
    loadBoard();
  }
  function podium(rows, valueOf, valueLabel){
    var ol = el('ol', 'gp-podium');
    ol.setAttribute('aria-label', 'Top ' + Math.min(3, rows.length));
    rows.slice(0, 3).forEach(function(r){
      var li = el('li');
      var c = el('div', 'g-card gp-pod gp-pod--' + r.rank + (r.is_me ? ' is-me' : ''));
      c.appendChild(el('span', 'gp-pod__rank', String(r.rank)));
      var name = el('span', 'gp-pod__name', r.nickname);
      if (r.is_me) name.appendChild(youTag());
      c.appendChild(name);
      var s = el('span', 'g-stat__num g-num', valueOf(r));
      s.setAttribute('aria-label', valueLabel + ' ' + valueOf(r));
      c.appendChild(s);
      li.appendChild(c); ol.appendChild(li);
    });
    return ol;
  }
  function myRank(rows){ var me = rows.filter(function(r){ return r.is_me; })[0]; return me ? '#' + me.rank : '—'; }
  function loadBoard(){
    if (acct.loading) return;
    if (!acct.enabled) { pill('upcoming', 'Coming soon'); keystat('—'); status(boards, 'Leaderboards open when multiplayer launches.'); return; }
    status(boards, 'Loading…');
    var tab = currentTab;
    BDGame.leaderboard(tab).then(function(rows){
      if (tab !== currentTab) return;
      rows = rows || [];
      boards.innerHTML = '';
      keystat(playing() ? myRank(rows) : (rows.length ? String(rows.length) : '—'));
      var kl = $('keystatlabel'); if (kl) kl.textContent = playing() ? 'Your rank' : 'Players ranked';
      var cols, valueOf, note, empty, caption;
      if (tab === 'week') {
        var wk = rows.length ? rows[0].week : null;
        pill(wk ? 'live' : 'upcoming', wk ? 'Week ' + wk : 'This week');
        note = wk ? 'Fantasy week ' + wk + '. Points update once a day after the market data comes in.' : '';
        empty = 'No scores yet this week. Scores appear after the first trading day once picks lock.';
        valueOf = function(r){ return pts(r.points); };
        cols = [{ label: '#', key: 'rank' }, { label: 'Player', key: 'nickname' }, { label: 'Points', key: 'points', fmt: pts, cls: function(r){ return r.points > 0 ? 'g-up' : (r.points < 0 ? 'g-down' : ''); } }];
        caption = 'This week\'s fantasy standings';
      } else if (tab === 'season') {
        pill('live', 'Season');
        note = 'All fantasy weeks added up.';
        empty = 'No finished weeks yet.';
        valueOf = function(r){ return pts(r.points); };
        cols = [{ label: '#', key: 'rank' }, { label: 'Player', key: 'nickname' }, { label: 'Points', key: 'points', fmt: pts }, { label: 'Weeks', key: 'weeks' }];
        caption = 'Season fantasy standings';
      } else {
        pill('final', 'Play money');
        note = 'Coins in hand plus what open market positions are worth at today\'s prices. Play money only.';
        empty = 'No players yet.';
        valueOf = function(r){ return num(r.total, 0); };
        cols = [{ label: '#', key: 'rank' }, { label: 'Player', key: 'nickname' },
          { label: 'Coins', key: 'coins', fmt: function(v){ return num(v, 0); } },
          { label: 'In markets', key: 'open_value', fmt: function(v){ return num(v, 0); } },
          { label: 'Total', key: 'total', fmt: function(v){ return num(v, 0); } }];
        caption = 'Coin standings';
      }
      if (!rows.length) { boards.appendChild(el('div', 'g-empty')).appendChild(el('p', null, empty)); return; }
      boards.appendChild(podium(rows, valueOf, tab === 'coins' ? 'Total coins' : 'Points'));
      var rest = rows.slice(3);
      if (rest.length) boards.appendChild(table(rest, cols, caption + ', from 4th place'));
      if (note) boards.appendChild(el('p', 'gp-note', note));
    }).catch(function(e){ status(boards, 'Could not load the leaderboard. ' + e.message); });
  }

  // ---------- leagues.html ----------
  var lbox = $('leagues');
  var standBox = $('standings');
  var myLeagues = [], shownLeague = null;

  function nameForm(opts){
    var f = el('form', 'gp-form'); f.setAttribute('novalidate', '');
    var lab = el('label', 'g-label', opts.label); lab.htmlFor = opts.id;
    var inp = el('input', 'g-input'); inp.id = opts.id; inp.type = 'text'; inp.maxLength = opts.max; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('autocapitalize', opts.upper ? 'characters' : 'off');
    inp.setAttribute('aria-describedby', opts.id + '-hint');
    var go = el('button', 'g-btn g-btn--primary', opts.button); go.type = 'submit';
    var hint = el('p', 'g-hint', opts.hint); hint.id = opts.id + '-hint';
    var msg = el('p', 'g-msg'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    var line = el('div', 'g-inline'); line.appendChild(inp); line.appendChild(go);
    f.appendChild(lab); f.appendChild(line); f.appendChild(hint); f.appendChild(msg);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var v = inp.value.trim(), bad = opts.check(v);
      if (bad) { msg.textContent = bad; msg.className = 'g-msg g-msg--bad'; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
      inp.removeAttribute('aria-invalid');
      go.disabled = true; msg.className = 'g-msg'; msg.textContent = opts.busy;
      opts.submit(v).then(function(text){ go.disabled = false; inp.value = ''; msg.textContent = text; toast(text); return loadLeagues(); })
        .catch(function(err){ go.disabled = false; msg.className = 'g-msg g-msg--bad'; msg.textContent = err.message; toast(err.message, true); inp.focus(); });
    });
    return f;
  }

  function renderLeagueForms(){
    var wrap = $('leagueforms');
    wrap.innerHTML = '';
    if (!acct.enabled) return;
    if (!playing()) { wrap.appendChild(el('p', 'gp-note', 'To create or join a league, press Play online above and pick a nickname.')); return; }
    var grid = el('div', 'gp-two');
    var c1 = el('section', 'g-card'); c1.setAttribute('aria-labelledby', 'lg-new-h');
    var h1 = el('div', 'g-card__head'); var t1 = el('h2', 'g-card__title', 'Start a league'); t1.id = 'lg-new-h'; h1.appendChild(t1); h1.appendChild(el('span', 'g-card__kicker', 'Up to 50 players')); c1.appendChild(h1);
    c1.appendChild(nameForm({ id: 'lg-name', label: 'League name', max: 20, button: 'Create', busy: 'Creating…',
      hint: '3 to 20 letters, numbers, _ or -. You get a code to share with friends.',
      check: BDGame.validName,
      submit: function(v){ return BDGame.createLeague(v).then(function(r){ shownLeague = r.id; return 'Created ' + r.name + '. Share the code ' + r.invite_code + '.'; }); } }));
    var c2 = el('section', 'g-card'); c2.setAttribute('aria-labelledby', 'lg-join-h');
    var h2 = el('div', 'g-card__head'); var t2 = el('h2', 'g-card__title', 'Join with a code'); t2.id = 'lg-join-h'; h2.appendChild(t2); h2.appendChild(el('span', 'g-card__kicker', 'Up to 10 leagues')); c2.appendChild(h2);
    c2.appendChild(nameForm({ id: 'lg-code', label: 'Invite code', max: 12, upper: true, button: 'Join', busy: 'Joining…',
      hint: '8 letters and numbers from the person who started the league.',
      check: function(v){ return /^[A-Za-z0-9-\s]{8,12}$/.test(v) ? '' : 'Codes are 8 letters and numbers.'; },
      submit: function(v){ return BDGame.joinLeague(v).then(function(r){ shownLeague = r.id; return r.already ? 'You are already in ' + r.name + '.' : 'You joined ' + r.name + '.'; }); } }));
    grid.appendChild(c1); grid.appendChild(c2);
    wrap.appendChild(grid);
  }

  function leaguesHead(){
    if (acct.loading) return;
    if (!acct.enabled) { pill('upcoming', 'Coming soon'); keystat('—'); return; }
    pill(playing() ? 'live' : 'upcoming', playing() ? 'Private leagues' : 'Sign in to play');
    keystat(playing() ? String(myLeagues.length) : '—');
  }

  function loadLeagues(){
    if (acct.loading) return Promise.resolve();
    if (!acct.enabled) { status(lbox, 'Leagues open when multiplayer launches.'); standBox.innerHTML = ''; leaguesHead(); return Promise.resolve(); }
    if (!playing()) { lbox.innerHTML = ''; standBox.innerHTML = ''; leaguesHead(); return Promise.resolve(); }
    return BDGame.myLeagues().then(function(rows){
      myLeagues = rows || [];
      if (shownLeague && !myLeagues.some(function(l){ return l.id === shownLeague; })) shownLeague = null;
      if (!shownLeague && myLeagues.length) shownLeague = myLeagues[0].id;
      leaguesHead();
      renderMyLeagues();
      loadStandings();
    }).catch(function(e){ status(lbox, 'Could not load your leagues. ' + e.message); });
  }

  function copyCode(code, b){
    var done = function(){ b.textContent = 'Copied'; toast('Invite code ' + code + ' copied.'); setTimeout(function(){ b.textContent = 'Copy code'; }, 1500); };
    var fallback = function(){ b.textContent = code; toast('Copy this code: ' + code); };
    try { navigator.clipboard.writeText(code).then(done, fallback); } catch(e) { fallback(); }
  }

  function renderMyLeagues(){
    var act = document.activeElement, keep = act && lbox.contains(act) ? act.getAttribute('data-key') : null;
    lbox.innerHTML = '';
    var h = el('h2', 'gp-h2', 'My leagues'); h.id = 'myleaguesh';
    lbox.appendChild(h);
    if (!myLeagues.length) {
      var e = el('div', 'g-empty');
      e.appendChild(el('p', null, 'You are not in a league yet. Start one above or join with a friend\'s code. You can be in up to 10, with up to 50 players each.'));
      lbox.appendChild(e);
      return;
    }
    var ul = el('ul', 'gp-leagues'); ul.setAttribute('aria-labelledby', 'myleaguesh');
    myLeagues.forEach(function(l){
      var on = l.id === shownLeague;
      var li = el('li', 'g-card gp-league' + (on ? ' is-on' : ''));
      var main = el('div', 'gp-league__main');
      var view = btn('g-link gp-league__name', l.name);
      view.setAttribute('data-key', 'view:' + l.id);
      view.setAttribute('aria-pressed', on ? 'true' : 'false');
      view.setAttribute('aria-controls', 'standings');
      view.addEventListener('click', function(){ shownLeague = l.id; renderMyLeagues(); loadStandings(); });
      main.appendChild(view);
      main.appendChild(el('span', 'g-hint', l.members + (l.members === 1 ? ' player' : ' players') + (l.is_owner ? ' · you started it' : '')));
      li.appendChild(main);
      var acts = el('div', 'gp-league__acts');
      var code = el('span', 'gp-code', l.invite_code); code.setAttribute('aria-label', 'Invite code ' + l.invite_code.split('').join(' '));
      acts.appendChild(code);
      var copy = btn('g-btn', 'Copy code'); copy.setAttribute('data-key', 'copy:' + l.id);
      copy.setAttribute('aria-label', 'Copy invite code for ' + l.name);
      copy.addEventListener('click', function(){ copyCode(l.invite_code, copy); });
      acts.appendChild(copy);
      var leave = btn('g-link', 'Leave'); leave.setAttribute('data-key', 'leave:' + l.id);
      leave.setAttribute('aria-label', 'Leave ' + l.name);
      leave.addEventListener('click', function(){
        if (!w.confirm('Leave ' + l.name + '? You can join again with the code.')) return;
        leave.disabled = true;
        BDGame.leaveLeague(l.id).then(function(){ toast('You left ' + l.name + '.'); return loadLeagues(); })
          .catch(function(e){ leave.disabled = false; toast(e.message, true); });
      });
      acts.appendChild(leave);
      li.appendChild(acts);
      ul.appendChild(li);
    });
    lbox.appendChild(ul);
    if (keep) { var n = lbox.querySelector('[data-key="' + keep + '"]'); if (n) n.focus(); }
  }

  function standHead(l, rows){
    var me = rows.filter(function(r){ return r.is_me; })[0], lead = rows[0];
    var box = el('div', 'g-matchup g-terminal gp-standhead');
    var teams = el('div', 'g-matchup__teams');
    var a = el('div', 'g-matchup__side g-matchup__side--a' + (me && me.rank === 1 ? ' is-winning' : ''));
    a.appendChild(el('span', 'g-matchup__name', 'You · ' + (me ? 'rank ' + me.rank + ' of ' + rows.length : 'not ranked yet')));
    a.appendChild(el('span', 'g-matchup__score g-num', me ? pts(me.week_points) : '—'));
    var b = el('div', 'g-matchup__side g-matchup__side--b' + (lead && !(me && me.rank === 1) ? ' is-winning' : ''));
    b.appendChild(el('span', 'g-matchup__name', 'Leader · ' + (lead ? lead.nickname : '—')));
    b.appendChild(el('span', 'g-matchup__score g-num', lead ? pts(lead.week_points) : '—'));
    teams.appendChild(a); teams.appendChild(el('span', 'g-matchup__vs', 'vs')); teams.appendChild(b);
    box.appendChild(teams);
    var p = el('div', 'g-matchup__prob');
    p.appendChild(el('p', 'g-matchup__note', (l ? l.name : 'League') + ' · this week\'s points' + (rows.length && rows[0].week ? ' · week ' + rows[0].week : '')));
    box.appendChild(p);
    return box;
  }

  function loadStandings(){
    if (!shownLeague) { standBox.innerHTML = ''; return; }
    var l = myLeagues.filter(function(x){ return x.id === shownLeague; })[0];
    status(standBox, 'Loading standings…');
    BDGame.leagueStandings(shownLeague).then(function(rows){
      standBox.innerHTML = '';
      var h = el('h2', 'gp-h2', (l ? l.name : 'League') + ' standings'); h.id = 'standh';
      standBox.appendChild(h);
      standBox.setAttribute('aria-labelledby', 'standh');
      rows = rows || [];
      if (!rows.length) { var e = el('div', 'g-empty'); e.appendChild(el('p', null, 'Scores appear once the first week locks.')); standBox.appendChild(e); return; }
      standBox.appendChild(standHead(l, rows));
      standBox.appendChild(table(rows, [
        { label: '#', key: 'rank' },
        { label: 'Player', key: 'nickname' },
        { label: 'This week', key: 'week_points', fmt: pts },
        { label: 'Season', key: 'season_points', fmt: pts }
      ], (l ? l.name : 'League') + ' standings'));
      var wk = rows[0].week;
      standBox.appendChild(el('p', 'gp-note', wk ? 'Fantasy week ' + wk + ' and the season so far. Ties share a rank.' : 'Scores appear once the first week locks.'));
    }).catch(function(e){ status(standBox, 'Could not load standings. ' + e.message); });
  }

  if (boards) setupTabs();
  BDAccount.onChange(function(s){
    acct = s;
    if (boards) loadBoard();
    if (lbox) { renderLeagueForms(); loadLeagues(); }
  });
})();
