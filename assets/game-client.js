/* Billionaires Digest multiplayer: a small wrapper around Supabase. ES5, exposes one global: BDGame.
 *
 * Reads the public URL + publishable key from config/supabase.json and loads supabase-js from jsDelivr
 * only when that config is filled in. If anything is missing or the backend is not reachable (for example
 * before the database migration has run), BDGame.ready() resolves { enabled: false } and every page shows
 * "Multiplayer is coming soon". Nothing here ever throws into the page; the solo game keeps working.
 *
 * Fantasy hook: BDGame.syncRoster(week, picks, captain) saves a roster online when the player is signed in
 * with a nickname, and otherwise resolves { ok: false, skipped: true } without doing anything.
 * BD.game.ready (when assets/common.js is loaded first) is a Promise<boolean>: true only when the config is enabled
 * and the backend answered the public current_week() probe.
 */
(function(w){
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.min.js';
  var READY_TIMEOUT_MS = 8000;
  var G = {};
  var client = null, cfg = null, readyPromise = null;

  // config/supabase.json sits next to assets/, so find it from this script's own URL
  var here = (document.currentScript && document.currentScript.src) || '';
  var CONFIG_URL = here ? here.replace(/assets\/game-client\.js(\?.*)?$/, 'config/supabase.json') : 'config/supabase.json';

  function withTimeout(p, ms){
    return new Promise(function(res, rej){
      var t = setTimeout(function(){ rej(new Error('timeout')); }, ms);
      p.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
    });
  }
  function loadScript(src){
    return new Promise(function(res, rej){
      if (w.supabase && w.supabase.createClient) return res();
      var s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('could not load supabase-js')); };
      document.head.appendChild(s);
    });
  }
  function keyOf(c){ return c && (c.publishableKey || c.anonKey) || ''; }
  function usable(c){
    if (!c || c.enabled === false) return false;
    var u = String(c.url || ''), k = String(keyOf(c));
    if (!/^https:\/\/[^\s\/]+\/?$/.test(u)) return false;
    if (k.length < 20 || /your|placeholder|xxxx/i.test(u + k)) return false;
    return true;
  }
  // Turn a Supabase error into a plain Error with the message our SQL raised.
  function fail(err){
    var m = (err && (err.message || err.error_description || err.msg)) || 'Something went wrong. Please try again.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = 'Could not reach the game server. Check your connection and try again.';
    if (/JWT|not authenticated|permission denied/i.test(m)) m = 'Please sign in to play online.';
    var e = new Error(m); e.code = err && err.code; return e;
  }
  function unwrap(r){ if (r.error) throw fail(r.error); return r.data; }

  // Resolves { enabled, reason }. Cached.
  G.ready = function(){
    if (readyPromise) return readyPromise;
    readyPromise = fetch(CONFIG_URL, { cache: 'no-store' })
      .then(function(r){ if (!r.ok) throw new Error('no config'); return r.json(); })
      .then(function(c){
        cfg = c;
        if (!usable(c)) return { enabled: false, reason: 'not configured' };
        return withTimeout(loadScript(SUPABASE_JS), READY_TIMEOUT_MS).then(function(){
          client = w.supabase.createClient(String(c.url).replace(/\/+$/, ''), keyOf(c), {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'bd-game-auth' }
          });
          // Probe: a public read-only function. Fails when the tables/functions are not there yet.
          return withTimeout(client.rpc('current_week'), READY_TIMEOUT_MS).then(function(r){
            if (r.error) { client = null; return { enabled: false, reason: 'backend not ready' }; }
            return { enabled: true, reason: '' };
          });
        });
      })
      .catch(function(){ client = null; return { enabled: false, reason: 'unavailable' }; });
    return readyPromise;
  };
  G.config = function(){ return cfg || {}; };
  G.enabled = function(){ return !!client; };
  function need(){ if (!client) return Promise.reject(new Error('Multiplayer is coming soon.')); return null; }

  // ---- auth ----
  G.session = function(){
    return G.ready().then(function(){
      if (!client) return null;
      return client.auth.getSession().then(function(r){ return (r.data && r.data.session) || null; }, function(){ return null; });
    });
  };
  G.signIn = function(){
    return G.ready().then(function(){
      var n = need(); if (n) return n;
      return client.auth.signInAnonymously().then(function(r){ if (r.error) throw fail(r.error); return r.data && r.data.session; });
    });
  };
  G.signOut = function(){ return client ? client.auth.signOut() : Promise.resolve(); };
  G.onAuth = function(fn){
    if (!client) return;
    client.auth.onAuthStateChange(function(ev, session){ try { fn(ev, session); } catch(e){} });
  };

  function rpc(name, args){
    return G.ready().then(function(){
      var n = need(); if (n) return n;
      return client.rpc(name, args || {}).then(unwrap);
    });
  }
  function table(name, build){
    return G.ready().then(function(){
      var n = need(); if (n) return n;
      return build(client.from(name)).then(unwrap);
    });
  }

  // ---- profile and coins ----
  G.me = function(){ return rpc('me'); };                       // null until a nickname is picked
  G.setNickname = function(nick){ return rpc('set_nickname', { p_nickname: nick }); };
  G.claimTopup = function(){ return rpc('claim_topup'); };
  G.validName = function(s){
    s = String(s == null ? '' : s).trim();
    if (s.length < 3 || s.length > 20) return 'Use 3 to 20 characters.';
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return 'Use only letters, numbers, _ and -.';
    return '';
  };

  // ---- fantasy ----
  G.saveRoster = function(week, picks, captain){ return rpc('save_roster', { p_week: week, p_picks: picks, p_captain: captain }); };
  // Never rejects. Only saves when the player already plays online with a nickname.
  G.syncRoster = function(week, picks, captain){
    return G.ready().then(function(st){
      if (!st.enabled) return { ok: false, skipped: true, reason: 'Multiplayer is coming soon.' };
      return G.session().then(function(s){
        if (!s) return { ok: false, skipped: true, reason: 'Not playing online.' };
        return G.me().then(function(me){
          if (!me) return { ok: false, skipped: true, reason: 'Pick a nickname to play online.' };
          return G.saveRoster(week, picks, captain).then(function(){ return { ok: true }; });
        });
      });
    }).catch(function(e){ return { ok: false, skipped: false, reason: (e && e.message) || 'Could not save online.' }; });
  };
  // The signed-in player's own saved roster for a week ({ week, picks, captain }), or null.
  G.myRoster = function(week){
    return G.session().then(function(s){
      if (!s || !s.user) return null;
      return table('rosters', function(t){ return t.select('week,picks,captain').eq('user_id', s.user.id).eq('week', week).limit(1); })
        .then(function(rows){ return (rows && rows[0]) || null; });
    });
  };
  G.currentWeek = function(){ return rpc('current_week'); };
  G.leaderboard = function(kind, opts){
    opts = opts || {};
    if (kind === 'season') return rpc('leaderboard_season', { p_limit: opts.limit || 100 });
    if (kind === 'coins') return rpc('coin_leaderboard', { p_limit: opts.limit || 100 });
    return rpc('leaderboard_week', { p_week: opts.week || null, p_limit: opts.limit || 100 });
  };
  G.getLeaderboards = function(){
    return Promise.all([G.leaderboard('week'), G.leaderboard('season'), G.leaderboard('coins')])
      .then(function(r){ return { week: r[0], season: r[1], coins: r[2] }; });
  };

  // ---- leagues ----
  G.myLeagues = function(){ return rpc('my_leagues'); };
  G.createLeague = function(name){ return rpc('create_league', { p_name: name }); };
  G.joinLeague = function(code){ return rpc('join_league', { p_code: code }); };
  G.leaveLeague = function(id){ return rpc('leave_league', { p_league: id }); };
  G.leagueStandings = function(id, week){ return rpc('league_standings', { p_league: id, p_week: week || null }); };

  // ---- markets ----
  var MARKET_COLS = 'id,slug,question,kind,params,opens_at,closes_at,resolves_by,b,q_yes,q_no,status,outcome,resolution_note,source_url,resolved_at';
  G.openMarkets = function(){
    return table('markets', function(t){ return t.select(MARKET_COLS).in('status', ['open', 'closed']).order('closes_at', { ascending: true }).order('slug'); });
  };
  G.resolvedMarkets = function(limit){
    return table('markets', function(t){ return t.select(MARKET_COLS).in('status', ['resolved', 'void']).order('resolved_at', { ascending: false }).limit(limit || 30); });
  };
  G.myPositions = function(){
    return table('positions', function(t){ return t.select('market_id,yes_shares,no_shares,cost_basis,payout'); });
  };
  G.buy = function(marketId, side, coins){ return rpc('buy', { p_market: marketId, p_side: side, p_coins: coins }); };
  G.sell = function(marketId, side, shares){ return rpc('sell', { p_market: marketId, p_side: side, p_shares: shares }); };

  // ---- The Book (play-money odds; see supabase/migrations/0002_book.sql) ----
  var EVENT_COLS = 'id,week,type,title,params,settles_from,sort,closes_at,status,result';
  var SEL_COLS = 'id,event_id,label,line,american_odds,decimal_odds,fair_prob,meta,sort,result';
  // A week's events with their selections: [{ ...event, selections: [...] }], in book order.
  G.bookWeek = function(week){
    return table('book_events', function(t){ return t.select(EVENT_COLS + ',book_selections(' + SEL_COLS + ')').eq('week', week).order('sort'); })
      .then(function(rows){
        return (rows || []).map(function(e){
          var s = (e.book_selections || []).slice().sort(function(a, b){ return a.sort - b.sort; });
          delete e.book_selections; e.selections = s; return e;
        });
      });
  };
  // Current odds of some selections: [{ id, decimal_odds, american_odds, ... }]
  G.bookSelections = function(ids){
    return table('book_selections', function(t){ return t.select(SEL_COLS).in('id', ids); });
  };
  G.placeBet = function(ids, stake, decimals){ return rpc('place_bet', { p_selection_ids: ids, p_stake: stake, p_expected_decimal: decimals }); };
  G.myBets = function(limit){ return rpc('my_bets', { p_limit: limit || 100 }); };
  G.bookLeaderboard = function(week, limit){ return rpc('book_leaderboard', { p_week: week || null, p_limit: limit || 100 }); };
  // Season table (0003_book_wealth.sql): rank, nickname, bets, staked, net, roi, is_me; players with 10+ settled bets.
  G.bookSeasonLeaderboard = function(limit){ return rpc('book_season_leaderboard', { p_limit: limit || 100 }); };

  // LMSR math, the same formulas as the database (for previews; the server has the final say).
  var L = {};
  L.MAX_PRICE = 0.99; L.MAX_SPEND = 500;
  L.price = function(qy, qn, b){ return 1 / (1 + Math.exp((qn - qy) / b)); };
  L.cost = function(qy, qn, b){ var m = Math.max(qy, qn); return m + b * Math.log(Math.exp((qy - m) / b) + Math.exp((qn - m) / b)); };
  L.sharesFor = function(qSide, qOther, b, c){ return b * Math.log(Math.exp(c / b) + Math.exp((qOther - qSide) / b) * (Math.exp(c / b) - 1)); };
  // preview a buy: { shares, avg, priceYes, tooFar }
  L.previewBuy = function(m, side, coins){
    var b = +m.b, qy = +m.q_yes, qn = +m.q_no;
    var s = Math.floor(L.sharesFor(side === 'yes' ? qy : qn, side === 'yes' ? qn : qy, b, coins) * 1e6) / 1e6;
    var py = side === 'yes' ? L.price(qy + s, qn, b) : L.price(qy, qn + s, b);
    return { shares: s, avg: s > 0 ? coins / s : 0, priceYes: py, tooFar: side === 'yes' ? py > L.MAX_PRICE : py < 1 - L.MAX_PRICE };
  };
  // preview a sale: { coins, priceYes }
  L.previewSell = function(m, side, shares){
    var b = +m.b, qy = +m.q_yes, qn = +m.q_no;
    var ny = side === 'yes' ? qy - shares : qy, nn = side === 'no' ? qn - shares : qn;
    return { coins: Math.floor(L.cost(qy, qn, b) - L.cost(ny, nn, b)), priceYes: L.price(ny, nn, b) };
  };
  G.lmsr = L;

  w.BDGame = G;
  if (w.BD) w.BD.game = { ready: G.ready().then(function(st){ return !!(st && st.enabled); }, function(){ return false; }) };
})(window);
