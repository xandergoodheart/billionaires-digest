/* Billionaires Digest multiplayer: the account bar. ES5, needs assets/common.js and assets/game-client.js.
 * Renders into #gameaccount: "coming soon", or "Play online" (guest sign-in), the nickname picker,
 * and once playing: nickname, coin balance and the weekly top-up.
 * Exposes BDAccount: onChange(fn) -> fn(state) now and on every change; get(); refresh().
 * state = { enabled, signedIn, me }  (me = { nickname, coins, topup_available, ... } or null)
 */
(function(w){
  // If game-client.js failed to load, act as if multiplayer is off.
  if (!w.BDGame) w.BDGame = { ready: function(){ return Promise.resolve({ enabled: false, reason: 'unavailable' }); },
    config: function(){ return {}; }, onAuth: function(){}, lmsr: {} };
  var el = BD.el;
  var box = document.getElementById('gameaccount');
  var state = { enabled: false, loading: true, signedIn: false, me: null };
  var listeners = [];
  var editing = false;
  var wantFocus = false;   // move focus to the nickname box only after the player asked for it

  function emit(){ for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch(e){} } }
  function fmt(n){ return Number(n || 0).toLocaleString('en-US'); }
  function msgEl(){ var m = el('p', 'gx-msg'); m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); return m; }
  function btn(text, cls){ var b = el('button', 'gx-btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; return b; }
  function busy(b, on, text){ b.disabled = on; if (text) b.textContent = text; b.setAttribute('aria-busy', on ? 'true' : 'false'); }

  function render(){
    if (!box) return;
    var act = document.activeElement, keep = act && box.contains(act) && act.id ? act.id : null;
    box.innerHTML = '';
    draw();
    if (keep && document.getElementById(keep)) document.getElementById(keep).focus();
  }
  function draw(){
    box.className = 'gx-account';
    if (state.loading) { box.appendChild(el('p', 'gx-msg', 'Loading the online game…')); return; }
    if (!state.enabled) {
      var cs = el('div', 'gx-soon');
      cs.appendChild(el('strong', null, 'Multiplayer is coming soon.'));
      var p = el('p', null, 'Online leaderboards, leagues and markets will open here. ');
      var a = el('a', null, 'The solo fantasy game works now'); a.href = 'fantasy.html';
      p.appendChild(a); p.appendChild(document.createTextNode('.'));
      cs.appendChild(p);
      box.appendChild(cs);
      return;
    }
    if (!state.signedIn) return renderSignedOut();
    if (!state.me || editing) return renderNickname();
    renderPlaying();
  }

  function renderSignedOut(){
    var row = el('div', 'gx-acrow');
    var t = el('div', 'gx-actext');
    t.appendChild(el('strong', null, 'Play online'));
    t.appendChild(el('span', 'gx-sub', 'Starts a guest account in this browser. No email or password. Play money only.'));
    var b = btn('Play online', 'gx-primary');
    var m = msgEl();
    b.addEventListener('click', function(){
      busy(b, true, 'Starting…'); m.textContent = ''; wantFocus = true;
      BDGame.signIn().then(function(){ return refresh(); }).catch(function(e){
        busy(b, false, 'Play online'); m.textContent = e.message;
      });
    });
    row.appendChild(t); row.appendChild(b);
    box.appendChild(row); box.appendChild(m);
  }

  function renderNickname(){
    var f = el('form', 'gx-form gx-nickform');
    f.setAttribute('novalidate', '');
    var id = 'gx-nick';
    var lab = el('label', null, state.me ? 'Change your nickname' : 'Pick a nickname'); lab.htmlFor = id;
    var inp = el('input', 'gx-input'); inp.id = id; inp.name = 'nickname'; inp.type = 'text';
    inp.maxLength = 20; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('autocapitalize', 'off');
    inp.setAttribute('aria-describedby', id + '-hint');
    if (state.me) inp.value = state.me.nickname;
    var hint = el('p', 'gx-hint', '3 to 20 letters, numbers, _ or -. It shows on leaderboards. '); hint.id = id + '-hint';
    var rules = el('a', null, 'Nickname rules'); rules.href = 'play-terms.html#nicknames'; hint.appendChild(rules);
    var go = el('button', 'gx-btn gx-primary', 'Save nickname'); go.type = 'submit';
    var m = msgEl();
    var line = el('div', 'gx-inline'); line.appendChild(inp); line.appendChild(go);
    if (state.me) {
      var cancel = btn('Cancel');
      cancel.addEventListener('click', function(){ editing = false; render(); });
      line.appendChild(cancel);
    }
    f.appendChild(lab); f.appendChild(line); f.appendChild(hint); f.appendChild(m);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var v = inp.value.trim(), bad = BDGame.validName(v);
      if (bad) { m.textContent = bad; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
      inp.removeAttribute('aria-invalid');
      busy(go, true, 'Saving…'); m.textContent = '';
      BDGame.setNickname(v).then(function(){ editing = false; return refresh(); }).catch(function(err){
        busy(go, false, 'Save nickname'); m.textContent = err.message; inp.setAttribute('aria-invalid', 'true'); inp.focus();
      });
    });
    box.appendChild(f);
    if (wantFocus) { wantFocus = false; inp.focus(); }
  }

  function renderPlaying(){
    var me = state.me;
    var row = el('div', 'gx-acrow');
    var t = el('div', 'gx-actext');
    var who = el('span', null, 'Playing as ');
    who.appendChild(el('strong', null, me.nickname));
    t.appendChild(who);
    var chip = el('span', 'gx-coins', fmt(me.coins) + ' coins');
    chip.setAttribute('aria-label', fmt(me.coins) + ' play-money coins');
    t.appendChild(chip);
    row.appendChild(t);
    var acts = el('div', 'gx-acts');
    var m = msgEl();
    if (me.topup_available) {
      var tb = btn('Claim 250 weekly coins', 'gx-primary');
      tb.addEventListener('click', function(){
        busy(tb, true, 'Claiming…');
        BDGame.claimTopup().then(function(){ return refresh(); }).then(function(){
          var mm = box.querySelector('.gx-msg'); if (mm) mm.textContent = 'Added 250 coins.';
        }).catch(function(e){ busy(tb, false, 'Claim 250 weekly coins'); m.textContent = e.message; });
      });
      acts.appendChild(tb);
    }
    var nb = btn('Change nickname', 'gx-quiet');
    nb.addEventListener('click', function(){ editing = true; wantFocus = true; render(); });
    acts.appendChild(nb);
    if (BDGame.config().linkEmail) {
      var eb = btn('Save my account with email', 'gx-quiet');
      eb.disabled = true; eb.title = 'Coming soon';
      acts.appendChild(eb);
    }
    row.appendChild(acts);
    box.appendChild(row);
    box.appendChild(el('p', 'gx-hint', 'Your guest account lives in this browser. Clearing site data signs you out for good. Coins are play money with no value.'));
    box.appendChild(m);
  }

  function refresh(){
    return BDGame.ready().then(function(st){
      state.enabled = st.enabled;
      if (!st.enabled) { state.loading = false; state.signedIn = false; state.me = null; return; }
      return BDGame.session().then(function(s){
        state.signedIn = !!s;
        if (!s) { state.me = null; return; }
        return BDGame.me().then(function(me){ state.me = me || null; }, function(){ state.me = null; });
      });
    }).then(function(){ state.loading = false; render(); emit(); return state; });
  }

  w.BDAccount = {
    onChange: function(fn){ listeners.push(fn); if (!state.loading) { try { fn(state); } catch(e){} } },
    get: function(){ return state; },
    refresh: refresh
  };

  render();
  refresh().then(function(){
    // only when the auth state really changed (e.g. another tab), not right after our own sign-in
    BDGame.onAuth(function(ev){
      if ((ev === 'SIGNED_OUT' && state.signedIn) || (ev === 'SIGNED_IN' && !state.signedIn)) refresh();
    });
  });
})(window);
