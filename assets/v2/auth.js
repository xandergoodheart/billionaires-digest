/* Billionaires Digest accounts: the "Create free account / Log in" dialog and everything that happens after a sign-in.
   ES5. Needs assets/game-client.js (BDGame), assets/v2/auth-core.js (BDAuthCore) and, for carrying teams over,
   assets/fantasy-core.js (BDFantasyCore). assets/v2/chrome.js loads all of these (and auth.css) on first use.
   Exposes one global: BDAuth.

   Sign-in methods follow config/supabase.json: "authGoogle" (Continue with Google) and "authPassword" (email + password).
   - Continue with Google: a guest (anonymous session) is LINKED to Google with linkIdentity, so the user id, and with it
     the guest's synced teams and leagues, stays the same. Without a guest session: signInWithOAuth.
   - Create account with email + password: a guest gets the email and password added to the same user (updateUser);
     otherwise signUp. Log in: signInWithPassword. Forgot password: resetPasswordForEmail -> account.html?reset=1.
   - Every call that takes a captchaToken runs Cloudflare Turnstile first when a site key is configured (BDGame.withCaptcha).
   - After a new account: a nickname step (set_nickname), skipped when the user already has one.
   - Teams: after sign-up or linking (same user) this browser's teams for the open weeks are saved to the account.
     After logging in to a different account: weeks where the account has no team get this browser's team; where both
     exist, the account's team is kept and the visitor can choose "Use this browser's team instead".
   Google redirects leave the page, so the pending step is kept in sessionStorage ('bd-auth-pending') and finished by
   BDAuth.resume() when the visitor comes back (chrome.js calls it). Game only: play money, no prizes.
   The Billionaire Brief (only while config/launch.json "briefSignup" is exactly true): an unticked checkbox at the top of
   "Create free account". Ticked, the account is opted in after sign-up (BDGame.setMyBrief(true)): straight away, after
   the Google trip (the choice rides along in 'bd-auth-pending'; a cancelled trip drops it), or, when an email + password
   account must confirm its address first, after the confirmation link brings the visitor back (kept in localStorage
   'bd-auth-brief' = { email, at } for this browser). A failed opt-in never stops the sign-up. */
(function(w, d){
  var A = w.BDAuthCore, G = w.BDGame;
  if (!A || !G) return;
  var PENDING = 'bd-auth-pending', NICK = 'bd-acct-nick', FKEY = 'bd-fantasy-v1', BRIEF = 'bd-auth-brief';
  var here = (d.currentScript && d.currentScript.src) || '';
  var BASE = here ? here.replace(/assets\/v2\/auth\.js(\?.*)?$/, '') : '';
  var ui = null;          // the open dialog: { root, panel, opener, mode, email }
  var resumed = false;
  var noticeEl = null;
  var briefFlag = null;   // config/launch.json "briefSignup" === true; null until read

  // ---------- small helpers ----------
  function el(tag, cls, text){ var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function button(cls, text, type){ var b = el('button', cls, text); b.type = type || 'button'; return b; }
  function ssGet(k){ try { return w.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v){ try { if (v == null) w.sessionStorage.removeItem(k); else w.sessionStorage.setItem(k, v); } catch (e) {} }
  function lsGet(k){ try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v){ try { if (v == null) w.localStorage.removeItem(k); else w.localStorage.setItem(k, v); } catch (e) {} }
  function flags(){ return A.flags(G.config()); }
  function emitChange(){
    var ev;
    try { ev = new CustomEvent('bd-auth-change'); } catch (e) { ev = d.createEvent('Event'); ev.initEvent('bd-auth-change', false, false); }
    w.dispatchEvent(ev);
    return w.BDAccount && w.BDAccount.refresh ? w.BDAccount.refresh().then(null, function(){}) : Promise.resolve();
  }
  function cacheNick(user, nick){ if (user && nick) lsSet(NICK, JSON.stringify({ id: user.id, nick: nick })); }
  // The page's address without any sign-in leftovers (used as the redirect target for Google)
  function cleanUrl(){
    var l = w.location, q = String(l.search || '').replace(/^\?/, '').split('&').filter(function(kv){
      return kv && !/^(error|error_code|error_description|code|type|access_token|refresh_token)=/.test(kv);
    }).join('&');
    return l.origin + l.pathname + (q ? '?' + q : '');
  }
  function tidyUrl(){
    try { if (w.history && w.history.replaceState) w.history.replaceState(null, '', cleanUrl().slice(w.location.origin.length)); } catch (e) {}
  }
  function getPending(){ try { return JSON.parse(ssGet(PENDING) || 'null'); } catch (e) { return null; } }
  function setPending(p){ ssSet(PENDING, p ? JSON.stringify(p) : null); }

  // ---------- The Billionaire Brief ----------
  // Reads the switch once (cached by BDGame.launch). Never waits more than 1.5 s: unknown counts as off.
  function briefKnown(){
    if (briefFlag !== null) return Promise.resolve(briefFlag);
    var read = (G.launch ? G.launch() : Promise.resolve({})).then(function(c){ briefFlag = A.briefOn(c); return briefFlag; },
      function(){ briefFlag = false; return false; });
    var late = new Promise(function(res){ setTimeout(function(){ res(false); }, 1500); });
    return Promise.race([read, late]);
  }
  function briefRecord(){ try { return JSON.parse(lsGet(BRIEF) || 'null'); } catch (e) { return null; } }
  // After a real sign-in: opt in when the box was ticked for this sign-in (info.brief) or for this email address while it
  // waited for its confirmation link. Resolves true when set_my_brief answered on / waiting; never rejects.
  function applyBrief(info, user){
    var want = !!(info && info.brief === true), rec = briefRecord(), t = Date.now();
    if (rec) {
      if (A.briefIntent(rec, user && user.email, t)) { want = true; lsSet(BRIEF, null); }
      else if (!A.briefIntent(rec, rec.email, t)) lsSet(BRIEF, null);   // too old or unreadable
    }
    if (!want || !G.setMyBrief) return Promise.resolve(false);
    return G.setMyBrief(true).then(function(r){ return A.briefListed(r); }, function(){ return false; });
  }
  // first lines of the notice after a sign-in
  function headLines(head, info){
    var lines = [head];
    if (info && info.briefListed) lines.push(A.BRIEF_LIST_LINE);
    return lines;
  }
  function optIn(){
    var id = 'au-f' + (++uid);
    var lab = el('label', 'au-optin'); lab.htmlFor = id;
    var cb = el('input', 'au-optin__box'); cb.type = 'checkbox'; cb.id = id; cb.name = 'brief'; cb.value = '1';
    cb.checked = ui.brief === true;
    cb.addEventListener('change', function(){ ui.brief = cb.checked; });
    lab.appendChild(cb);
    lab.appendChild(el('span', 'au-optin__text', A.BRIEF_LABEL));
    return lab;
  }

  function ready(){
    return G.ready().then(function(st){
      var auth = G.authClient();
      if (!st.enabled || !auth) throw new Error('Accounts are not available right now. Please try again later.');
      return auth;
    });
  }
  function session(){
    return ready().then(function(auth){ return auth.getSession().then(function(r){ return (r.data && r.data.session) || null; }); });
  }
  function check(r){ if (r && r.error) throw r.error; return r && r.data; }

  // ---------- teams: carry this browser's teams over to the account ----------
  function nowMs(){ var F = w.BDFantasyStore; return F && F.now ? F.now() : Date.now(); }
  function localTeams(){
    var F = w.BDFantasyStore;
    if (F && F.store) return F.store().teams || {};
    try { var s = JSON.parse(lsGet(FKEY) || 'null'); return (s && s.teams) || {}; } catch (e) { return {}; }
  }
  function adopt(week, team){
    var F = w.BDFantasyStore;
    if (F && F.adoptTeam) return F.adoptTeam(week, team);
    try {
      var s = JSON.parse(lsGet(FKEY) || 'null') || { v: 1, teams: {}, draft: { picks: [], captain: null }, record: null };
      if (!s.teams) s.teams = {};
      var was = s.teams[week];
      s.teams[week] = { picks: team.picks.slice(), captain: team.captain, savedAt: new Date(nowMs()).toISOString() };
      if (was && was.lateFrom) s.teams[week].lateFrom = was.lateFrom;
      lsSet(FKEY, JSON.stringify(s));
      return true;
    } catch (e) { return false; }
  }
  // Save one team to the account: through the fantasy store's sync when this page has it and plays online,
  // otherwise the same save_roster call directly. Resolves { ok, text }.
  function push(week, team){
    var F = w.BDFantasyStore;
    if (F && F.onlinePlaying && F.onlinePlaying() && F.syncTeam) {
      return F.syncTeam(week, team).then(function(r){ return { ok: !!(r && r.ok), text: r && r.bad ? r.text : '' }; });
    }
    return G.saveRoster(week, team.picks.slice(), team.captain).then(function(){ return { ok: true, text: '' }; },
      function(e){ return { ok: false, text: (e && e.message) || '' }; });
  }
  // info.sameUser: the guest's user id was kept (sign-up / linking). Resolves { saved: [week], kept: [{ week, local, server }], failed: [text] }
  function carry(info){
    var C = w.BDFantasyCore, out = { saved: [], kept: [], failed: [] };
    if (!C) return Promise.resolve(out);
    var t = nowMs(), local = localTeams();
    var weeks = A.openWeeks(C, t).filter(function(wk){ return local[wk] && local[wk].picks && local[wk].picks.length; });
    if (!weeks.length) return Promise.resolve(out);
    return Promise.all(weeks.map(function(wk){
      return G.myRoster(wk).then(function(r){ return [wk, r || null]; }, function(){ return [wk, undefined]; });
    })).then(function(rows){
      var server = {}, known = [];
      rows.forEach(function(r){ if (r[1] !== undefined) { server[r[0]] = r[1]; known.push(r[0]); } });
      var plan = A.planCarry({ weeks: known, local: local, server: server, sameUser: !!info.sameUser, locked: [C.lockedWeek(t)] });
      return plan.reduce(function(p, step){
        return p.then(function(){
          if (step.action === 'push') return push(step.week, step.local).then(function(r){
            if (r.ok) out.saved.push(step.week); else if (r.text) out.failed.push(r.text);
          });
          if (step.action === 'same') out.saved.push(step.week);
          if (step.action === 'keep') { adopt(step.week, step.server); out.kept.push(step); }
        });
      }, Promise.resolve());
    }).then(function(){ return out; }, function(){ return out; });
  }

  // ---------- the notice after a sign-in (bottom of the screen; polite live region) ----------
  function notice(lines, actions){
    if (noticeEl && noticeEl.parentNode) noticeEl.parentNode.removeChild(noticeEl);
    var box = el('div', 'au-notice'); box.setAttribute('role', 'status');
    var body = el('div', 'au-notice__body');
    lines.forEach(function(l){ body.appendChild(el('p', null, l)); });
    box.appendChild(body);
    var row = el('div', 'au-notice__acts');
    (actions || []).forEach(function(a){ row.appendChild(a); });
    var x = button('au-notice__close', 'Close');
    x.addEventListener('click', function(){ if (box.parentNode) box.parentNode.removeChild(box); });
    row.appendChild(x);
    box.appendChild(row);
    d.body.appendChild(box);
    noticeEl = box;
    return box;
  }
  function weekName(id){ var C = w.BDFantasyCore; return C ? A.weekName(C, id) : 'that week'; }
  function report(head, res, info){
    var lines = headLines(head, info);
    if (res.saved.length) lines.push('Your team for ' + res.saved.map(weekName).join(' and ') + ' is saved to your account.');
    res.failed.forEach(function(t){ lines.push('Saved in this browser, but not to your account: ' + t); });
    var acts = [];
    res.kept.forEach(function(k){
      lines.push('This browser had a different team for ' + weekName(k.week) + ". Kept your account's team.");
      var b = button('v2-btn v2-btn--sm v2-btn--ghost', "Use this browser's team instead");
      if (res.kept.length > 1) b.setAttribute('aria-label', "Use this browser's team instead for " + weekName(k.week));
      b.addEventListener('click', function(){
        b.disabled = true; b.textContent = 'Saving…';
        G.saveRoster(k.week, k.local.picks.slice(), k.local.captain).then(function(){
          adopt(k.week, k.local);
          var p = el('p', null, "Done. Your account now uses this browser's team for " + weekName(k.week) + '.');
          b.parentNode.replaceChild(p, b);
          emitChange();
        }, function(e){
          b.disabled = false; b.textContent = "Use this browser's team instead";
          var p = el('p', 'au-notice__bad', 'Could not switch: ' + ((e && e.message) || 'please try again.'));
          b.parentNode.insertBefore(p, b);
        });
      });
      acts.push(b);
    });
    notice(lines, acts);
  }

  // ---------- after any successful sign-in ----------
  // info: { sameUser, head, brief } (head: the first line of the notice; brief: the Brief box was ticked for this sign-in)
  function afterAuth(info){
    return emitChange().then(function(){ return session(); }).then(function(s){
      var user = s && s.user;
      if (!user || user.is_anonymous) { close(); return; }
      return applyBrief(info, user).then(function(listed){
        info.briefListed = listed;
        return G.me().then(function(me){ return me; }, function(){ return null; });
      }).then(function(me){
        if (me && me.nickname) {
          cacheNick(user, me.nickname);
          emitChange();
          close();
          return carry(info).then(function(res){ emitChange(); report(info.head, res, info); });
        }
        return showNickname(info, user);
      });
    });
  }

  // ---------- dialog ----------
  var titles = {
    signup: ['Create your free account', 'Keep your team on every device. Free, and play money only.'],
    login: ['Log in', 'Welcome back. Your team and leagues are waiting.'],
    forgot: ['Reset your password', "Enter your account's email and we'll send a link to set a new password."],
    sent: ['Check your email', ''],
    confirm: ['Confirm your email', ''],
    nickname: ['Pick a nickname', 'It shows on leaderboards and in leagues instead of your email.']
  };
  function focusables(){
    if (!ui) return [];
    return Array.prototype.filter.call(ui.panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'), function(n){
      return n.getClientRects().length > 0;
    });
  }
  function onKey(e){
    if (!ui) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) { e.preventDefault(); ui.panel.focus(); return; }
    var first = f[0], last = f[f.length - 1], a = d.activeElement;
    if (!ui.panel.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a === first || a === ui.panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  function onFocusIn(e){ if (ui && !ui.root.contains(e.target)) { var f = focusables(); (f[0] || ui.panel).focus(); } }
  function close(){
    if (!ui) return;
    var o = ui.opener;
    d.removeEventListener('keydown', onKey, true);
    d.removeEventListener('focusin', onFocusIn);
    if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    d.documentElement.classList.remove('au-lock');
    ui = null;
    if (o && d.contains(o) && o.getClientRects().length && o.focus) o.focus();
  }
  function open(opts){
    opts = opts || {};
    var f = flags();
    if (!f.any && opts.mode !== 'nickname') return Promise.resolve(false);
    return briefKnown().then(function(){ return openNow(opts); });
  }
  function openNow(opts){
    if (!ui) {
      var root = el('div', 'au'); root.setAttribute('data-au', '');
      var panel = el('div', 'au__panel');
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'au-title'); panel.setAttribute('aria-describedby', 'au-desc');
      panel.tabIndex = -1;
      root.appendChild(panel);
      root.addEventListener('mousedown', function(e){ if (e.target === root) close(); });
      d.body.appendChild(root);
      d.documentElement.classList.add('au-lock');
      d.addEventListener('keydown', onKey, true);
      d.addEventListener('focusin', onFocusIn);
      ui = { root: root, panel: panel, opener: opts.opener || d.activeElement, mode: '', email: '', brief: false };
    }
    render(opts.mode || 'signup', opts);
    return true;
  }
  function head(mode, extra){
    var t = titles[mode] || titles.signup;
    var h = el('div', 'au__head');
    var title = el('h2', 'au__title', (extra && extra.title) || t[0]); title.id = 'au-title';
    h.appendChild(title);
    var x = button('au__close', '');
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
    x.addEventListener('click', close);
    h.appendChild(x);
    var dsc = el('p', 'au__desc', (extra && extra.desc) || t[1]); dsc.id = 'au-desc';
    return [h, dsc];
  }
  var uid = 0;
  function field(label, type, opts){
    opts = opts || {};
    var id = 'au-f' + (++uid);
    var wrap = el('div', 'au-field');
    var lab = el('label', 'au-field__label', label); lab.htmlFor = id;
    var row = el('div', 'au-field__row');
    var inp = el('input', 'au-input'); inp.id = id; inp.type = type; inp.name = opts.name || type;
    if (opts.autocomplete) inp.autocomplete = opts.autocomplete;
    if (opts.value) inp.value = opts.value;
    inp.spellcheck = false; inp.setAttribute('autocapitalize', 'off');
    if (type === 'email') inp.setAttribute('inputmode', 'email');
    if (opts.maxLength) inp.maxLength = opts.maxLength;
    row.appendChild(inp);
    var desc = [];
    if (opts.hint) { var hint = el('p', 'au-field__hint', opts.hint); hint.id = id + '-hint'; desc.push(hint.id); }
    var err = el('p', 'au-field__err'); err.id = id + '-err'; err.hidden = true; desc.push(err.id);
    inp.setAttribute('aria-describedby', desc.join(' '));
    if (type === 'password') {
      var eye = button('au-eye', 'Show');
      eye.setAttribute('aria-pressed', 'false'); eye.setAttribute('aria-controls', id);
      eye.setAttribute('aria-label', 'Show password');
      eye.addEventListener('click', function(){
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        eye.textContent = show ? 'Hide' : 'Show';
        eye.setAttribute('aria-pressed', show ? 'true' : 'false');
      });
      row.appendChild(eye);
    }
    wrap.appendChild(lab); wrap.appendChild(row);
    if (opts.hint) wrap.appendChild(hint);
    wrap.appendChild(err);
    return { wrap: wrap, input: inp, setError: function(t){
      err.textContent = t || ''; err.hidden = !t;
      if (t) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
    } };
  }
  function msgBox(){ var m = el('div', 'au-msg'); m.setAttribute('aria-live', 'assertive'); m.hidden = true; return m; }
  function say(m, text, kind, extra){
    while (m.firstChild) m.removeChild(m.firstChild);
    if (!text) { m.hidden = true; return; }
    m.className = 'au-msg' + (kind === 'ok' ? ' au-msg--ok' : ' au-msg--bad');
    m.appendChild(el('p', null, text));
    if (extra) m.appendChild(extra);
    m.hidden = false;
  }
  function busy(b, on, text){ b.disabled = on; b.setAttribute('aria-busy', on ? 'true' : 'false'); if (text) b.textContent = text; }
  function linkBtn(text, fn){ var b = button('au-link', text); b.addEventListener('click', fn); return b; }
  function finePrint(){
    var p = el('p', 'au__fine');
    p.appendChild(d.createTextNode('Free to play. Play money only, no purchases or prizes. See the '));
    var t = el('a', null, 'Terms'); t.href = BASE + 'terms.html'; p.appendChild(t);
    p.appendChild(d.createTextNode(' and '));
    var pr = el('a', null, 'Privacy Policy'); pr.href = BASE + 'privacy.html'; p.appendChild(pr);
    p.appendChild(d.createTextNode('.'));
    return p;
  }

  function render(mode, opts){
    opts = opts || {};
    var panel = ui.panel, f = flags();
    ui.mode = mode;
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.className = 'au__panel au__panel--' + mode;
    panel.setAttribute('aria-describedby', 'au-desc');
    if (mode === 'nickname') return renderNickname(opts);
    if (mode === 'sent' || mode === 'confirm') return renderSent(mode, opts);
    head(mode).forEach(function(n){ panel.appendChild(n); });
    // The Billionaire Brief: create-account only, above Continue with Google, unticked unless the visitor ticks it
    if (mode === 'signup' && briefFlag === true) panel.appendChild(optIn());
    var m = msgBox();
    if (mode !== 'forgot' && f.google) {
      var gb = button('au-google', 'Continue with Google');
      gb.addEventListener('click', function(){
        busy(gb, true, 'Opening Google…'); say(m, '');
        google(false, mode === 'signup' && briefFlag === true && ui.brief === true).then(null, function(e){
          busy(gb, false, 'Continue with Google');
          say(m, A.friendly(e, 'google').text);
        });
      });
      panel.appendChild(gb);
      if (f.password) panel.appendChild(el('p', 'au-or', 'or'));
    }
    panel.appendChild(m);
    if (opts.message) say(m, opts.message, opts.messageKind, opts.messageExtra);
    if (f.password) panel.appendChild(mode === 'forgot' ? forgotForm(m, opts) : passwordForm(mode, m, opts));
    var sw = el('p', 'au__switch');
    if (mode === 'signup') {
      sw.appendChild(d.createTextNode('Already have an account? '));
      sw.appendChild(linkBtn('Log in', function(){ render('login', { email: ui.email, focus: true }); }));
    } else if (mode === 'login') {
      sw.appendChild(d.createTextNode('New here? '));
      sw.appendChild(linkBtn('Create a free account', function(){ render('signup', { email: ui.email, focus: true }); }));
    } else {
      sw.appendChild(linkBtn('Back to log in', function(){ render('login', { email: ui.email, focus: true }); }));
    }
    panel.appendChild(sw);
    if (mode === 'signup') panel.appendChild(finePrint());
    focusFirst(opts);
  }
  function focusFirst(opts){
    // first focus as before the Brief box existed: the empty email field, else the first button (never the opt-in box)
    var f = focusables().filter(function(n){ return !n.classList.contains('au__close') && !n.classList.contains('au-optin__box'); });
    var inp = ui.panel.querySelector('input:not([type="checkbox"])');
    var target = (opts && opts.focusEl) || (inp && !inp.value ? inp : null) || f[0] || ui.panel;
    target.focus();
  }

  function passwordForm(mode, m, opts){
    var form = el('form', 'au-form'); form.noValidate = true;
    var em = field('Email', 'email', { autocomplete: 'email', value: opts.email || ui.email || '', name: 'email' });
    var pw = field('Password', 'password', { autocomplete: mode === 'signup' ? 'new-password' : 'current-password', name: 'password',
      hint: mode === 'signup' ? 'At least ' + A.PASSWORD_MIN + ' characters.' : '' });
    form.appendChild(em.wrap); form.appendChild(pw.wrap);
    if (mode === 'login') {
      var fp = el('p', 'au-forgot');
      fp.appendChild(linkBtn('Forgot password?', function(){ render('forgot', { email: em.input.value.trim(), focus: true }); }));
      form.appendChild(fp);
    }
    var cap = el('div', 'au-captcha');
    form.appendChild(cap);
    var label = mode === 'signup' ? 'Create free account' : 'Log in';
    var go = button('v2-btn v2-btn--primary v2-btn--block au-submit', label, 'submit');
    form.appendChild(go);
    em.input.addEventListener('input', function(){ ui.email = em.input.value.trim(); if (em.input.getAttribute('aria-invalid')) em.setError(''); });
    pw.input.addEventListener('input', function(){ if (pw.input.getAttribute('aria-invalid')) pw.setError(''); });
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var email = em.input.value.trim(), pass = pw.input.value;
      var pe = A.emailProblem(email), pp = mode === 'signup' ? A.passwordProblem(pass) : (pass ? '' : 'Enter your password.');
      em.setError(pe); pw.setError(pp);
      say(m, '');
      if (pe || pp) { (pe ? em.input : pw.input).focus(); return; }
      ui.email = email;
      var wantBrief = mode === 'signup' && briefFlag === true && ui.brief === true;
      busy(go, true, mode === 'signup' ? 'Creating your account…' : 'Logging in…');
      var run = mode === 'signup' ? signUpEmail(email, pass, cap) : logInEmail(email, pass, cap);
      run.then(function(r){
        if (r && r.confirm) {
          // opt in once the confirmation link brings them back (this browser only)
          if (wantBrief) lsSet(BRIEF, JSON.stringify({ email: email, at: Date.now() }));
          render('confirm', { email: email, brief: wantBrief });
          return;
        }
        return afterAuth({ sameUser: !!(r && r.sameUser), head: mode === 'signup' ? 'Your free account is ready.' : "You're logged in.", brief: wantBrief });
      }).then(null, function(err){
        if (!ui) return;
        busy(go, false, label);
        var fr = A.friendly(err, mode);
        var extra = null;
        if (fr.kind === 'exists') extra = linkBtn('Log in instead', function(){ render('login', { email: email, message: 'Log in with your password for ' + email + '.', messageKind: 'ok' }); });
        if (fr.kind === 'wrong' && f2().password) extra = linkBtn('Reset your password', function(){ render('forgot', { email: email, focus: true }); });
        if (fr.kind === 'weak') pw.setError(fr.text);
        if (fr.kind === 'email') em.setError(fr.text);
        say(m, fr.text, 'bad', extra);
        if (fr.kind === 'weak') pw.input.focus(); else if (fr.kind === 'email') em.input.focus();
        else { var x = m.querySelector('button'); (x || go).focus(); }
      });
    });
    return form;
  }
  function f2(){ return flags(); }

  function forgotForm(m, opts){
    var form = el('form', 'au-form'); form.noValidate = true;
    var em = field('Email', 'email', { autocomplete: 'email', value: opts.email || ui.email || '', name: 'email' });
    form.appendChild(em.wrap);
    var cap = el('div', 'au-captcha'); form.appendChild(cap);
    var go = button('v2-btn v2-btn--primary v2-btn--block au-submit', 'Send reset link', 'submit');
    form.appendChild(go);
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var email = em.input.value.trim(), pe = A.emailProblem(email);
      em.setError(pe); say(m, '');
      if (pe) { em.input.focus(); return; }
      ui.email = email;
      busy(go, true, 'Sending…');
      sendReset(email, cap).then(function(){ render('sent', { email: email }); }, function(err){
        if (!ui) return;
        busy(go, false, 'Send reset link');
        say(m, A.friendly(err, 'reset').text, 'bad');
        go.focus();
      });
    });
    if (opts.focus) setTimeout(function(){ if (ui) em.input.focus(); }, 0);
    return form;
  }

  function renderSent(mode, opts){
    var panel = ui.panel;
    var desc = mode === 'sent'
      ? 'If ' + opts.email + ' has an account, a link to set a new password is on its way. It can take a few minutes; check your spam folder too.'
      : 'We sent a confirmation link to ' + opts.email + '. Open it on this device to finish creating your account.';
    head(mode, { desc: desc }).forEach(function(n){ panel.appendChild(n); });
    if (mode === 'confirm' && opts.brief) {
      var bl = el('p', 'au__desc au__desc--brief', A.BRIEF_CONFIRM_LINE); bl.id = 'au-desc-brief';
      panel.appendChild(bl);
      panel.setAttribute('aria-describedby', 'au-desc au-desc-brief');
    }
    var row = el('div', 'au-actions');
    var ok = button('v2-btn v2-btn--primary', 'Done'); ok.addEventListener('click', close);
    row.appendChild(ok);
    if (mode === 'sent') row.appendChild(linkBtn('Back to log in', function(){ render('login', { email: opts.email }); }));
    panel.appendChild(row);
    ok.focus();
  }

  function renderNickname(opts){
    var panel = ui.panel, info = opts.info || {}, user = opts.user;
    head('nickname', { title: opts.title || 'Pick a nickname' }).forEach(function(n){ panel.appendChild(n); });
    var m = msgBox(); panel.appendChild(m);
    var form = el('form', 'au-form'); form.noValidate = true;
    var nf = field('Nickname', 'text', { autocomplete: 'off', name: 'nickname', maxLength: 20,
      hint: '3 to 20 letters, numbers, _ or -. You can change it once every 7 days.' });
    form.appendChild(nf.wrap);
    var go = button('v2-btn v2-btn--primary v2-btn--block au-submit', 'Save nickname', 'submit');
    form.appendChild(go);
    var later = linkBtn('Not now', function(){
      close();
      notice(headLines(info.head || 'Your free account is ready.', info).concat(['Pick a nickname on your Account page to save your team online and join leagues.']), [
        (function(){ var a = el('a', 'v2-btn v2-btn--sm v2-btn--ghost', 'Go to Account'); a.href = BASE + 'account.html'; return a; })()
      ]);
    });
    var lp = el('p', 'au__switch'); lp.appendChild(later);
    panel.appendChild(form); panel.appendChild(lp);
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var v = nf.input.value.trim(), problem = G.validName(v);
      nf.setError(problem); say(m, '');
      if (problem) { nf.input.focus(); return; }
      busy(go, true, 'Saving…');
      G.setNickname(v).then(function(){
        cacheNick(user, v);
        close();
        return emitChange().then(function(){ return carry(info); }).then(function(res){ emitChange(); report(info.head || 'Your free account is ready.', res, info); });
      }, function(err){
        busy(go, false, 'Save nickname');
        nf.setError(err.message || 'Could not save that nickname.');
        nf.input.focus();
      });
    });
    nf.input.focus();
  }
  function showNickname(info, user){
    return open({ mode: 'nickname', info: info, user: user, opener: ui ? ui.opener : null });
  }

  // ---------- auth calls ----------
  function captchaParent(box){ return box && d.contains(box) ? box : null; }
  function signUpEmail(email, pass, box){
    return ready().then(function(auth){
      return session().then(function(s){
        if (s && s.user && s.user.is_anonymous) {
          // keep the guest's user id: add the email, then the password (Supabase "Confirm email" off applies both now)
          return auth.updateUser({ email: email }).then(check).then(function(data){
            var u = data && data.user;
            if (u && !u.email) return { confirm: true };
            return auth.updateUser({ password: pass }).then(check).then(function(){ return { sameUser: true }; });
          });
        }
        return G.withCaptcha(captchaParent(box), function(tok){
          var o = { emailRedirectTo: cleanUrl() };
          if (tok) o.captchaToken = tok;
          return auth.signUp({ email: email, password: pass, options: o });
        }).then(check).then(function(data){
          if (!data || !data.session) return { confirm: true };
          return { sameUser: false };
        });
      });
    });
  }
  function logInEmail(email, pass, box){
    return ready().then(function(auth){
      return G.withCaptcha(captchaParent(box), function(tok){
        var o = {}; if (tok) o.captchaToken = tok;
        return auth.signInWithPassword({ email: email, password: pass, options: o });
      }).then(check).then(function(){ return { sameUser: false }; });
    });
  }
  // brief: the Brief box was ticked; it rides along in the pending record and is applied on return
  function google(forceSignIn, brief){
    return ready().then(function(auth){
      return session().then(function(s){
        var to = cleanUrl();
        if (!forceSignIn && s && s.user && s.user.is_anonymous) {
          setPending({ kind: 'link', prev: s.user.id, at: Date.now(), brief: brief === true || undefined });
          return auth.linkIdentity({ provider: 'google', options: { redirectTo: to } });
        }
        setPending({ kind: 'google', prev: s && s.user ? s.user.id : null, at: Date.now(), brief: brief === true || undefined });
        return auth.signInWithOAuth({ provider: 'google', options: { redirectTo: to } });
      }).then(function(r){
        if (r && r.error) { setPending(null); throw r.error; }
        // the browser is now on its way to Google
      });
    });
  }
  function sendReset(email, box){
    return ready().then(function(auth){
      return G.withCaptcha(captchaParent(box), function(tok){
        var o = { redirectTo: (BASE || (w.location.origin + '/')) + 'account.html?reset=1' };
        if (tok) o.captchaToken = tok;
        return auth.resetPasswordForEmail(email, o);
      }).then(check);
    });
  }
  function setNewPassword(pass){
    return ready().then(function(auth){ return auth.updateUser({ password: pass }).then(check); });
  }
  function logout(){
    return ready().then(function(){ return G.signOut(); }).then(function(){
      lsSet(NICK, null);
      emitChange();
      w.location.reload();
    });
  }

  // Back from Google (or an email link): finish what the visitor started. Safe to call more than once.
  function resume(){
    if (resumed) return Promise.resolve();
    resumed = true;
    var p = getPending();
    setPending(null);
    return ready().then(function(){
      var ua = G.urlAuth ? G.urlAuth() : {};
      if (ua.type === 'recovery') return;   // account.html?reset=1 handles password reset links
      if (ua.error || ua.desc) {
        tidyUrl();
        var fr = A.friendly({ code: ua.code, message: ua.desc || ua.error }, p && p.kind === 'link' ? 'link' : 'google');
        if (/access_denied/.test(ua.error) && !ua.desc) fr = { kind: 'cancel', text: 'Google sign-in was cancelled. Nothing changed.' };
        var extra = null;
        if (fr.kind === 'identity-taken') {
          extra = button('au-link', 'Log in with Google');
          // they ticked the box before this Google account turned out to have an account already: keep that choice
          extra.addEventListener('click', function(){ google(true, !!(p && p.brief === true)).then(null, function(e){ alertIn(A.friendly(e, 'google').text); }); });
        }
        return open({ mode: fr.kind === 'identity-taken' ? 'login' : 'signup', message: fr.text, messageKind: fr.kind === 'cancel' ? 'ok' : 'bad', messageExtra: extra, opener: d.activeElement });
      }
      if (!ua.token && !p) return;
      return session().then(function(s){
        var u = s && s.user;
        if (!u || u.is_anonymous) return;
        var created = u.created_at && (Date.now() - Date.parse(u.created_at)) < 15 * 60 * 1000;
        var same = !!(p && p.prev && p.prev === u.id);
        var headLine = p && p.kind === 'link' && same ? 'Google is linked. Your free account is ready.' : (created ? 'Your free account is ready.' : "You're logged in.");
        return afterAuth({ sameUser: same, head: headLine, brief: !!(p && p.brief === true) });
      });
    }).then(null, function(){});
  }
  function alertIn(text){ if (ui) { var m = ui.panel.querySelector('.au-msg'); if (m) say(m, text, 'bad'); } }

  w.BDAuth = {
    open: open, close: close, logout: logout, resume: resume, google: google,
    sendReset: sendReset, setNewPassword: setNewPassword, afterAuth: afterAuth, carry: carry, notice: notice,
    session: session, ready: ready, flags: flags, cacheNick: cacheNick, emitChange: emitChange, tidyUrl: tidyUrl
  };
})(window, document);
