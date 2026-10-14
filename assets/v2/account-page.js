/* Billionaires Digest: the account page (account.html). ES5. Needs assets/game-client.js (BDGame), assets/v2/auth-core.js
   (BDAuthCore) and assets/v2/auth.js (BDAuth). Renders into #acct:
   - accounts switched off (config/supabase.json authGoogle / authPassword both false): a short "not open yet" note
   - ?reset=1 (from the password-reset email): a set-new-password form (updateUser({ password }))
   - no account (nobody signed in, or a guest): Create free account / Log in
   - a real account: email and sign-in method, nickname (with the 7-day rule), Log out, Delete my account
     (request_account_deletion; the daily Game sync job deletes everything within 24 hours). */
(function(w, d){
  var box = d.getElementById('acct');
  if (!box) return;
  var A = w.BDAuthCore, G = w.BDGame, AU = w.BDAuth;
  var TZ = 'America/New_York';

  function el(tag, cls, text){ var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function button(cls, text, type){ var b = el('button', cls, text); b.type = type || 'button'; return b; }
  function clear(){ while (box.firstChild) box.removeChild(box.firstChild); }
  function busy(b, on, text){ b.disabled = on; b.setAttribute('aria-busy', on ? 'true' : 'false'); if (text) b.textContent = text; }
  function day(iso){
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    try { return new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: TZ }); } catch (e) { return new Date(t).toDateString(); }
  }
  function focusHead(n){ if (!n) return; n.setAttribute('tabindex', '-1'); n.focus(); }
  function card(title, lines, acts){
    var c = el('section', 'ac-card');
    var h = el('h2', 'v2-h2', title); c.appendChild(h);
    lines.forEach(function(l){ c.appendChild(typeof l === 'string' ? el('p', null, l) : l); });
    if (acts && acts.length) { var r = el('div', 'v2-btnrow'); acts.forEach(function(a){ r.appendChild(a); }); c.appendChild(r); }
    return c;
  }
  function openBtn(text, mode, cls){ var b = button('v2-btn ' + (cls || 'v2-btn--primary'), text); b.setAttribute('data-auth-open', mode); return b; }
  function linkBtn(text, href, cls){ var a = el('a', 'v2-btn ' + (cls || 'v2-btn--ghost'), text); a.href = href; return a; }
  function isReset(){ return /[?&]reset=1(&|$)/.test(w.location.search || ''); }
  function dropReset(){
    try {
      var q = String(w.location.search || '').replace(/^\?/, '').split('&').filter(function(kv){ return kv && kv !== 'reset=1'; }).join('&');
      w.history.replaceState(null, '', w.location.pathname + (q ? '?' + q : ''));
    } catch (e) {}
  }

  if (!A || !G || !AU) { clear(); box.appendChild(card('Accounts are not available', ['This page could not load. Check your connection and reload.'])); return; }

  function start(){
    return G.ready().then(function(st){
      var f = A.flags(G.config());
      if (!f.any) return renderOff();
      if (!st.enabled) return renderUnavailable();
      if (isReset()) return renderReset();
      return renderAccount();
    }, renderUnavailable);
  }

  function renderOff(){
    clear();
    box.appendChild(card('Accounts are not open yet', [
      'Soon you will be able to create a free account and keep your team on every device.',
      'Until then, your team is saved in this browser. To move it to another device, copy your team code in the Draft room.'
    ], [linkBtn('Go to my team', 'team.html', 'v2-btn--primary'), linkBtn('Draft room', 'draft.html')]));
  }
  function renderUnavailable(){
    clear();
    box.appendChild(card('Accounts are not available right now', ['We could not reach the sign-in server. Please try again later. Your team is still saved in this browser.'],
      [linkBtn('Go to my team', 'team.html', 'v2-btn--primary')]));
  }

  // ---------- password reset (from the email link) ----------
  function renderReset(){
    var ua = G.urlAuth ? G.urlAuth() : {};
    return AU.session().then(function(s){
      clear();
      if (ua.error || ua.desc || !s || !s.user || s.user.is_anonymous) {
        AU.tidyUrl();
        var c = card('This reset link has expired', ['Reset links work once and only for a short time. Ask for a new one and use the newest email.'],
          [openBtn('Send a new link', 'login'), linkBtn('Go to my team', 'team.html')]);
        box.appendChild(c);
        return;
      }
      var sec = el('section', 'ac-card');
      var h = el('h2', 'v2-h2', 'Set a new password'); sec.appendChild(h);
      sec.appendChild(el('p', null, 'For ' + (s.user.email || 'your account') + '. Use at least ' + A.PASSWORD_MIN + ' characters.'));
      var form = el('form', 'ac-form'); form.noValidate = true;
      var id = 'ac-newpass';
      var wrap = el('div', 'au-field');
      var lab = el('label', 'au-field__label', 'New password'); lab.htmlFor = id;
      var row = el('div', 'au-field__row');
      var inp = el('input', 'au-input'); inp.id = id; inp.type = 'password'; inp.name = 'password'; inp.autocomplete = 'new-password';
      inp.setAttribute('aria-describedby', id + '-err');
      var eye = button('au-eye', 'Show'); eye.setAttribute('aria-pressed', 'false'); eye.setAttribute('aria-controls', id); eye.setAttribute('aria-label', 'Show password');
      eye.addEventListener('click', function(){ var sh = inp.type === 'password'; inp.type = sh ? 'text' : 'password'; eye.textContent = sh ? 'Hide' : 'Show'; eye.setAttribute('aria-pressed', sh ? 'true' : 'false'); });
      row.appendChild(inp); row.appendChild(eye);
      var err = el('p', 'au-field__err'); err.id = id + '-err'; err.hidden = true; err.setAttribute('aria-live', 'assertive');
      wrap.appendChild(lab); wrap.appendChild(row); wrap.appendChild(err);
      form.appendChild(wrap);
      var go = button('v2-btn v2-btn--primary', 'Save new password', 'submit');
      var r = el('div', 'ac-row'); r.appendChild(go); form.appendChild(r);
      sec.appendChild(form);
      box.appendChild(sec);
      function setErr(t){ err.textContent = t || ''; err.hidden = !t; if (t) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
      form.addEventListener('submit', function(e){
        e.preventDefault();
        var p = A.passwordProblem(inp.value);
        setErr(p);
        if (p) { inp.focus(); return; }
        busy(go, true, 'Saving…');
        AU.setNewPassword(inp.value).then(function(){
          dropReset();
          AU.emitChange();
          return renderAccount('Your new password is saved. You are logged in.');
        }, function(e2){
          busy(go, false, 'Save new password');
          setErr(A.friendly(e2, 'newpass').text);
          inp.focus();
        });
      });
      inp.focus();
    });
  }

  // ---------- the account itself ----------
  function providerName(u){
    var ps = (u.app_metadata && u.app_metadata.providers) || (u.identities || []).map(function(i){ return i.provider; });
    var names = [];
    if (ps.indexOf('google') >= 0) names.push('Google');
    if (ps.indexOf('email') >= 0) names.push('Email and password');
    return names.join(' · ') || 'Email';
  }
  function renderAccount(flash){
    return AU.session().then(function(s){
      var u = s && s.user;
      if (!u || u.is_anonymous || !u.email) return renderGuest(!!u);
      return G.myAccount().then(function(acc){ return acc; }, function(){ return {}; }).then(function(acc){
        acc = acc || {};
        if (acc.nickname) AU.cacheNick(u, acc.nickname);
        clear();
        if (flash) { var f = el('p', 'ac-ok', flash); f.setAttribute('role', 'status'); box.appendChild(f); }
        var id = el('div', 'ac-id');
        var av = el('span', 'ac-id__av', A.initials(acc.nickname || u.email)); av.setAttribute('aria-hidden', 'true');
        id.appendChild(av);
        var who = el('div');
        who.appendChild(el('span', 'ac-id__name', acc.nickname || 'No nickname yet'));
        who.appendChild(el('span', 'ac-id__mail', u.email));
        id.appendChild(who);
        box.appendChild(id);

        // sign-in
        var s1 = el('section', 'ac-sec'); s1.setAttribute('aria-labelledby', 'ac-h-signin');
        var h1 = el('h2', null, 'Sign-in'); h1.id = 'ac-h-signin'; s1.appendChild(h1);
        var dl = el('dl', 'ac-dl');
        dl.appendChild(el('dt', null, 'Email')); dl.appendChild(el('dd', null, u.email));
        dl.appendChild(el('dt', null, 'Signed in with')); dl.appendChild(el('dd', null, providerName(u)));
        s1.appendChild(dl);
        box.appendChild(s1);

        box.appendChild(nicknameSection(acc, u));

        // log out
        var s3 = el('section', 'ac-sec'); s3.setAttribute('aria-labelledby', 'ac-h-out');
        var h3 = el('h2', null, 'Log out'); h3.id = 'ac-h-out'; s3.appendChild(h3);
        s3.appendChild(el('p', null, 'Logs out on this device only. Your team stays saved to your account.'));
        var lo = button('v2-btn v2-btn--ghost', 'Log out');
        lo.addEventListener('click', function(){ busy(lo, true, 'Logging out…'); AU.logout().then(null, function(){ busy(lo, false, 'Log out'); }); });
        s3.appendChild(lo);
        box.appendChild(s3);

        box.appendChild(deleteSection(acc));
        AU.emitChange();
      });
    });
  }

  function renderGuest(isGuest){
    clear();
    var f = A.flags(G.config());
    var acts = [openBtn('Create free account', 'signup'), openBtn('Log in', 'login', 'v2-btn--ghost')];
    box.appendChild(card(isGuest ? 'You are playing as a guest' : 'You are not logged in', [
      isGuest ? 'Your team and nickname live in this browser. Create a free account to keep them on every device; your team comes with you.'
              : 'Create a free account to keep your team on every device, or log in to the account you already have.',
      f.google && !f.password ? 'Uses Continue with Google.' : ''
    ].filter(Boolean), acts));
  }

  function nicknameSection(acc, u){
    var sec = el('section', 'ac-sec'); sec.setAttribute('aria-labelledby', 'ac-h-nick');
    var h = el('h2', null, 'Nickname'); h.id = 'ac-h-nick'; sec.appendChild(h);
    var has = !!acc.nickname;
    sec.appendChild(el('p', null, has ? 'Shows on leaderboards and in leagues. You can change it once every 7 days.'
      : 'Pick a nickname to save your team online and join leagues. It shows instead of your email.'));
    var wait = has && acc.next_nickname_change_at ? day(acc.next_nickname_change_at) : '';
    var form = el('form', 'ac-form'); form.noValidate = true;
    var id = 'ac-nick';
    var wrap = el('div', 'au-field');
    var lab = el('label', 'au-field__label', has ? 'New nickname' : 'Nickname'); lab.htmlFor = id;
    var inp = el('input', 'au-input'); inp.id = id; inp.type = 'text'; inp.name = 'nickname'; inp.maxLength = 20;
    inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('autocapitalize', 'off');
    if (has) inp.value = acc.nickname;
    var hint = el('p', 'au-field__hint', '3 to 20 letters, numbers, _ or -.'); hint.id = id + '-hint';
    var err = el('p', 'au-field__err'); err.id = id + '-err'; err.hidden = true;
    inp.setAttribute('aria-describedby', hint.id + ' ' + err.id);
    wrap.appendChild(lab); wrap.appendChild(inp); wrap.appendChild(hint); wrap.appendChild(err);
    form.appendChild(wrap);
    var go = button('v2-btn v2-btn--primary', has ? 'Save nickname' : 'Pick nickname', 'submit');
    var row = el('div', 'ac-row'); row.appendChild(go);
    form.appendChild(row);
    var ok = el('p', 'ac-ok'); ok.setAttribute('role', 'status'); ok.hidden = true;
    form.appendChild(ok);
    if (wait) {
      var note = el('p', 'ac-note', 'Your nickname is ' + acc.nickname + '. You can change it again on ' + wait + '.');
      sec.appendChild(note);
      return sec;
    }
    if (has) {
      form.hidden = true;
      var cur = el('p', 'ac-note'); cur.appendChild(d.createTextNode('Your nickname is ')); cur.appendChild(el('strong', null, acc.nickname)); cur.appendChild(d.createTextNode('.'));
      var change = button('v2-btn v2-btn--ghost v2-btn--sm', 'Change nickname');
      change.setAttribute('aria-expanded', 'false'); change.setAttribute('aria-controls', 'ac-nickform');
      form.id = 'ac-nickform';
      change.addEventListener('click', function(){ form.hidden = false; change.hidden = true; change.setAttribute('aria-expanded', 'true'); inp.focus(); inp.select(); });
      sec.appendChild(cur); sec.appendChild(change);
    }
    sec.appendChild(form);
    function setErr(t){ err.textContent = t || ''; err.hidden = !t; if (t) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var v = inp.value.trim(), p = G.validName(v);
      setErr(p); ok.hidden = true;
      if (p) { inp.focus(); return; }
      if (has && v === acc.nickname) { setErr('That is already your nickname.'); inp.focus(); return; }
      busy(go, true, 'Saving…');
      G.setNickname(v).then(function(){
        AU.cacheNick(u, v);
        return renderAccount(has ? 'Nickname changed to ' + v + '.' : 'Nickname saved: ' + v + '.');
      }, function(e2){
        busy(go, false, has ? 'Save nickname' : 'Pick nickname');
        setErr((e2 && e2.message) || 'Could not save that nickname.');
        inp.focus();
      });
    });
    return sec;
  }

  function deleteSection(acc){
    var sec = el('section', 'ac-sec ac-danger'); sec.setAttribute('aria-labelledby', 'ac-h-del');
    var h = el('h2', null, 'Delete my account'); h.id = 'ac-h-del'; sec.appendChild(h);
    if (acc.deletion_requested_at) {
      var pend = el('p', 'ac-pending', 'Deletion requested on ' + day(acc.deletion_requested_at) + '. Your account and data will be deleted within 24 hours.');
      sec.appendChild(pend);
      return sec;
    }
    sec.appendChild(el('p', null, 'This deletes your account, email, nickname, saved teams, scores, league memberships and play-money history. Leagues you own pass to another member. Your account and data will be deleted within 24 hours. This cannot be undone.'));
    var del = button('v2-btn v2-btn--secondary', 'Delete my account');
    del.setAttribute('aria-expanded', 'false'); del.setAttribute('aria-controls', 'ac-delconfirm');
    var conf = el('div', 'ac-confirm'); conf.id = 'ac-delconfirm'; conf.hidden = true;
    var q = el('p', null, 'Delete your account and all its data? This cannot be undone.'); q.id = 'ac-delq';
    conf.setAttribute('role', 'group'); conf.setAttribute('aria-labelledby', q.id);
    conf.appendChild(q);
    var yes = button('v2-btn v2-btn--primary', 'Yes, delete my account');
    var no = button('v2-btn v2-btn--ghost', 'Cancel');
    var r = el('div', 'ac-row'); r.appendChild(yes); r.appendChild(no); conf.appendChild(r);
    var msg = el('p', 'ac-bad'); msg.hidden = true; msg.setAttribute('role', 'alert'); conf.appendChild(msg);
    del.addEventListener('click', function(){ conf.hidden = false; del.hidden = true; del.setAttribute('aria-expanded', 'true'); no.focus(); });
    no.addEventListener('click', function(){ conf.hidden = true; del.hidden = false; del.setAttribute('aria-expanded', 'false'); del.focus(); });
    conf.addEventListener('keydown', function(e){ if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); no.click(); } });
    yes.addEventListener('click', function(){
      busy(yes, true, 'Deleting…'); no.disabled = true; msg.hidden = true;
      G.requestAccountDeletion().then(function(res){
        var p = el('p', 'ac-pending', 'Deletion requested on ' + day(res && res.requested_at) + '. Your account and data will be deleted within 24 hours.');
        p.setAttribute('role', 'status');
        while (sec.childNodes.length > 1) sec.removeChild(sec.lastChild);
        sec.appendChild(p);
        focusHead(h);
      }, function(e){
        busy(yes, false, 'Yes, delete my account'); no.disabled = false;
        msg.textContent = A.friendly(e, 'delete').text; msg.hidden = false;
        yes.focus();
      });
    });
    sec.appendChild(del); sec.appendChild(conf);
    return sec;
  }

  w.addEventListener('bd-auth-change', function(){
    // signed in or out from the dialog on this page: show the new state (not while setting a new password)
    if (isReset()) return;
    var s = w.BDAuthBoot && w.BDAuthBoot.state();
    var shown = box.querySelector('.ac-id') ? 'user' : 'other';
    if (s && (s.real ? 'user' : 'other') !== shown && A.flags(G.config()).any) renderAccount();
  });
  start();
})(window, document);
