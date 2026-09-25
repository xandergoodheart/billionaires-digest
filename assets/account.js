/* Billionaires Digest multiplayer: the account bar. ES5, needs assets/common.js and assets/game-client.js.
 * Renders into #gameaccount (g-account, see assets/GAME-UI.md): "coming soon", "Play online" (guest sign-in),
 * the nickname picker, and once playing: "Online as <nickname> · <coins> coins" and the weekly top-up.
 * Exposes BDAccount: onChange(fn) -> fn(state) now and on every change; get(); refresh().
 * state = { enabled, signedIn, me }  (me = { id, nickname, coins, topup_available, ... } or null)
 */
(function(w){
  // If game-client.js failed to load, act as if multiplayer is off.
  if (!w.BDGame) w.BDGame = { ready: function(){ return Promise.resolve({ enabled: false, reason: 'unavailable' }); },
    config: function(){ return {}; }, onAuth: function(){}, lmsr: {} };
  if (w.BD && !w.BD.game) w.BD.game = { ready: Promise.resolve(false) };
  var el = BD.el;
  var box = document.getElementById('gameaccount');
  var state = { enabled: false, loading: true, signedIn: false, me: null };
  var listeners = [];
  var editing = false;
  var wantFocus = false;   // move focus to the nickname box only after the player asked for it
  var flash = '';          // one-off message shown after the next render (e.g. "Added 250 coins.")

  function emit(){ for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch(e){} } }
  function fmt(n){ return Number(n || 0).toLocaleString('en-US'); }
  function msgEl(){ var m = el('p', 'g-msg'); m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); return m; }
  function btn(text, cls){ var b = el('button', 'g-btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; return b; }
  function busy(b, on, text){ b.disabled = on; if (text) b.textContent = text; b.setAttribute('aria-busy', on ? 'true' : 'false'); }
  function bad(m, text){ m.textContent = text; m.className = 'g-msg g-msg--bad'; }

  function render(){
    if (!box) return;
    var act = document.activeElement, keep = act && box.contains(act) && act.id ? act.id : null;
    box.innerHTML = '';
    draw();
    if (keep && document.getElementById(keep)) document.getElementById(keep).focus();
  }
  function draw(){
    box.className = 'g-account';
    if (state.loading) { box.appendChild(el('p', 'g-msg', 'Loading the online game…')); return; }
    if (!state.enabled) {
      var t = el('div', 'g-account__text');
      t.appendChild(el('strong', null, 'Multiplayer is coming soon.'));
      var p = el('p', 'g-hint', 'Online leaderboards, leagues and The Book will open here. ');
      var a = el('a', null, 'The solo fantasy game works now'); a.href = 'fantasy.html';
      p.appendChild(a); p.appendChild(document.createTextNode('.'));
      t.appendChild(p);
      box.appendChild(t);
      return;
    }
    if (!state.signedIn) return renderSignedOut();
    if (!state.me || editing) return renderNickname();
    renderPlaying();
  }

  function renderSignedOut(){
    var row = el('div', 'g-account__row');
    var t = el('div', 'g-account__text');
    t.appendChild(el('strong', null, 'Play online'));
    t.appendChild(el('span', 'g-hint', 'Starts a guest account in this browser. No email or password. Play money only.'));
    var b = btn('Play online', 'g-btn--primary'); b.id = 'gx-play';
    var m = msgEl();
    b.addEventListener('click', function(){
      busy(b, true, 'Starting…'); m.textContent = ''; wantFocus = true;
      BDGame.signIn().then(function(){ return refresh(); }).catch(function(e){
        busy(b, false, 'Play online'); bad(m, e.message);
      });
    });
    row.appendChild(t); row.appendChild(b);
    box.appendChild(row); box.appendChild(m);
  }

  function renderNickname(){
    var f = el('form', 'g-account__form');
    f.setAttribute('novalidate', '');
    var id = 'gx-nick';
    var lab = el('label', 'g-label', state.me ? 'Change your nickname' : 'Pick a nickname'); lab.htmlFor = id;
    var inp = el('input', 'g-input'); inp.id = id; inp.name = 'nickname'; inp.type = 'text';
    inp.maxLength = 20; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('autocapitalize', 'off');
    inp.setAttribute('aria-describedby', id + '-hint');
    if (state.me) inp.value = state.me.nickname;
    var hint = el('p', 'g-hint', '3 to 20 letters, numbers, _ or -. It shows on leaderboards. '); hint.id = id + '-hint';
    var rules = el('a', null, 'Nickname rules'); rules.href = 'play-terms.html#nicknames'; hint.appendChild(rules);
    var go = el('button', 'g-btn g-btn--primary', 'Save nickname'); go.type = 'submit';
    var m = msgEl();
    var line = el('div', 'g-inline'); line.appendChild(inp); line.appendChild(go);
    if (state.me) {
      var cancel = btn('Cancel');
      cancel.addEventListener('click', function(){ editing = false; render(); });
      line.appendChild(cancel);
    }
    f.appendChild(lab); f.appendChild(line); f.appendChild(hint); f.appendChild(m);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var v = inp.value.trim(), problem = BDGame.validName(v);
      if (problem) { bad(m, problem); inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
      inp.removeAttribute('aria-invalid');
      busy(go, true, 'Saving…'); m.textContent = '';
      BDGame.setNickname(v).then(function(){ editing = false; return refresh(); }).catch(function(err){
        busy(go, false, 'Save nickname'); bad(m, err.message); inp.setAttribute('aria-invalid', 'true'); inp.focus();
      });
    });
    box.appendChild(f);
    if (wantFocus) { wantFocus = false; inp.focus(); }
  }

  function renderPlaying(){
    var me = state.me;
    var row = el('div', 'g-account__row');
    var t = el('div', 'g-account__text');
    var chip = el('span', 'g-chip g-chip--coins');
    chip.appendChild(document.createTextNode('Online as '));
    chip.appendChild(el('b', null, me.nickname));
    chip.appendChild(document.createTextNode(' · '));
    chip.appendChild(el('b', 'g-num', fmt(me.coins)));
    chip.appendChild(document.createTextNode(' coins'));
    chip.setAttribute('aria-label', 'Online as ' + me.nickname + ', ' + fmt(me.coins) + ' play-money coins');
    t.appendChild(chip);
    row.appendChild(t);
    var acts = el('div', 'g-account__acts');
    var m = msgEl();
    if (me.topup_available) {
      var tb = btn('Claim 250 weekly coins', 'g-btn--primary'); tb.id = 'gx-topup';
      tb.addEventListener('click', function(){
        busy(tb, true, 'Claiming…');
        BDGame.claimTopup().then(function(){ flash = 'Added 250 coins.'; return refresh(); })
          .catch(function(e){ busy(tb, false, 'Claim 250 weekly coins'); bad(m, e.message); });
      });
      acts.appendChild(tb);
    }
    var nb = el('button', 'g-link', 'Change nickname'); nb.type = 'button'; nb.id = 'gx-rename';
    nb.addEventListener('click', function(){ editing = true; wantFocus = true; render(); });
    acts.appendChild(nb);
    if (BDGame.config().linkEmail) {
      var eb = btn('Save my account with email');
      eb.disabled = true; eb.title = 'Coming soon';
      acts.appendChild(eb);
    }
    row.appendChild(acts);
    box.appendChild(row);
    box.appendChild(el('p', 'g-hint', 'Your guest account lives in this browser. Clearing site data signs you out for good. Coins are play money with no value.'));
    if (flash) { m.textContent = flash; flash = ''; }
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
    }).then(null, function(){ state.enabled = false; state.signedIn = false; state.me = null; })
      .then(function(){ state.loading = false; render(); emit(); return state; });
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
