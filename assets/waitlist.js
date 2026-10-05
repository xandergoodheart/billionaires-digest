/* Billionaires Digest: the waitlist landing (index.html). ES5, needs assets/common.js (BD) and assets/v2/portraits.js.
 * Exposes no globals.
 *
 * Backend contract: supabase/migrations/0005_waitlist.sql (docs/WAITLIST-PLAN.md section 1). Browser only calls RPCs.
 * Flow: enter email -> anonymous session -> waitlist_join -> auth.updateUser({ email }) sends the confirmation email
 *   -> the link returns to /?confirmed=1 with the session in the URL (detectSessionInUrl: true on THIS client only)
 *   -> waitlist_confirm -> place in line, referral link, captain pick, league reservation.
 * email_taken: offer a sign-in link (signInWithOtp, shouldCreateUser: false).
 * ?ref=CODE, ?join=CODE and utm_* are kept in sessionStorage until the visitor joins.
 * If config/supabase.json is disabled or the backend (waitlist RPCs) is unreachable: "Signups open shortly", no crash.
 */
(function(w, d){
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.min.js';
  var TIMEOUT_MS = 8000;
  var RESEND_COOLDOWN_S = 60;
  var SITE = 'https://billionairesdigest.com';
  var SS_SRC = 'bd-wl-src', SS_EMAIL = 'bd-wl-email', SS_SENT = 'bd-wl-sent', SS_MODE = 'bd-wl-mode';
  var CODE_RE = /^[A-Za-z0-9]{4,16}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var LEAGUE_RE = /^[A-Za-z0-9 _'\-]{3,30}$/;

  var BD = w.BD || {};
  var app = d.getElementById('wl-app');
  if (!app) return;
  var live = d.getElementById('wl-live');
  var client = null;
  var me = null;            // waitlist_me() result
  var inviteInfo = null;    // waitlist_league_info() result for ?join=
  var timer = null;

  // ---------- small helpers ----------
  function el(tag, cls, text){ var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n){ while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function announce(t){ if (live) { live.textContent = ''; setTimeout(function(){ live.textContent = t; }, 30); } }
  function ssGet(k){ try { return w.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v){ try { if (v == null) w.sessionStorage.removeItem(k); else w.sessionStorage.setItem(k, v); } catch (e) {} }
  function fmt(n){ n = Number(n); return isFinite(n) ? n.toLocaleString('en-US') : ''; }
  function withTimeout(p, ms){
    return new Promise(function(res, rej){
      var t = setTimeout(function(){ rej(new Error('timeout')); }, ms);
      p.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
    });
  }
  function errText(e){
    var m = (e && (e.message || e.error_description || e.msg)) || '';
    if (/Failed to fetch|NetworkError|Load failed|timeout/i.test(m)) return 'Could not reach the server. Check your connection and try again.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Please wait a minute and try again.';
    if (/invalid.*email|email.*invalid/i.test(m)) return 'That email address does not look right.';
    if (/not_confirmed/.test(m)) return "Your email isn't confirmed yet. Click the link in the email we sent you.";
    return m && m.length < 160 ? m : 'Something went wrong. Please try again.';
  }
  function btn(text, cls){ var b = el('button', 'v2-btn ' + (cls || 'v2-btn--primary'), text); b.type = 'button'; return b; }
  function busy(b, on, text){ b.disabled = on; b.setAttribute('aria-busy', on ? 'true' : 'false'); if (text) b.textContent = text; }
  function msg(){ var m = el('p', 'wl-msg'); m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); return m; }
  function bad(m, t){ m.textContent = t; m.className = 'wl-msg wl-msg--bad'; }
  function ok(m, t){ m.textContent = t; m.className = 'wl-msg wl-msg--ok'; }
  function redirectUrl(){ return w.location.origin + w.location.pathname.replace(/index\.html$/, '') + '?confirmed=1'; }

  // ---------- referral / invite / utm: kept until the visitor joins ----------
  function readSource(){
    var src = {};
    try { src = JSON.parse(ssGet(SS_SRC) || '{}') || {}; } catch (e) { src = {}; }
    var q = {};
    String(w.location.search || '').replace(/^\?/, '').split('&').forEach(function(kv){
      if (!kv) return;
      var i = kv.indexOf('='), k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, ' '));
      var v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      q[k] = v;
    });
    if (q.ref && CODE_RE.test(q.ref)) src.ref = q.ref;
    if (q.join && CODE_RE.test(q.join)) src.join = q.join;
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function(k){
      if (q[k]) src[k] = String(q[k]).slice(0, 100);
    });
    if (!src.referrer && d.referrer) {
      var m = /^https?:\/\/([^\/?#]+)/i.exec(d.referrer);
      if (m && m[1] !== w.location.host) src.referrer = m[1].slice(0, 100);
    }
    ssSet(SS_SRC, JSON.stringify(src));
    return { src: src, confirmed: q.confirmed === '1', hadParams: !!(q.ref || q.join || q.confirmed || q.utm_source || q.utm_medium || q.utm_campaign) };
  }
  var START = readSource();
  // an expired or already-used email link comes back with #error_description=... in the URL
  var LINK_ERROR = (function(){
    var m = /[#&]error_description=([^&]*)/.exec(String(w.location.hash || ''));
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).slice(0, 160); } catch (e) { return 'That email link did not work.'; }
  })();
  function sourceJson(){
    var s = START.src, out = {};
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function(k){ if (s[k]) out[k] = String(s[k]).slice(0, 100); });
    if (s.referrer) out.ref = String(s.referrer).slice(0, 100);   // referring site (host only)
    out.page = 'landing';
    return out;   // the keys waitlist_clean_source keeps: utm_source/medium/campaign, ref, page; values <= 100 chars
  }
  function cleanUrl(){
    if (!START.hadParams || !w.history || !w.history.replaceState) return;
    try { w.history.replaceState(null, '', w.location.pathname + w.location.hash); } catch (e) {}
  }

  // ---------- Supabase client (own instance: detectSessionInUrl true, same storageKey as the game) ----------
  var here = (d.currentScript && d.currentScript.src) || '';
  var CONFIG_URL = here ? here.replace(/assets\/waitlist\.js(\?.*)?$/, 'config/supabase.json') : 'config/supabase.json';
  function loadScript(src){
    return new Promise(function(res, rej){
      if (w.supabase && w.supabase.createClient) return res();
      var s = d.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('could not load supabase-js')); };
      d.head.appendChild(s);
    });
  }
  function keyOf(c){ return c && (c.publishableKey || c.anonKey) || ''; }
  function usable(c){
    if (!c || c.enabled === false) return false;
    var u = String(c.url || ''), k = String(keyOf(c));
    if (!/^https:\/\/[^\s\/]+\/?$/.test(u)) return false;
    return !(k.length < 20 || /your|placeholder|xxxx/i.test(u + k));
  }
  function ready(){
    return fetch(CONFIG_URL, { cache: 'no-store' })
      .then(function(r){ if (!r.ok) throw new Error('no config'); return r.json(); })
      .then(function(c){
        if (!usable(c)) return false;
        return withTimeout(loadScript(SUPABASE_JS), TIMEOUT_MS).then(function(){
          client = w.supabase.createClient(String(c.url).replace(/\/+$/, ''), keyOf(c), {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'bd-game-auth' }
          });
          // probe: a public waitlist RPC; fails until the waitlist migration is live
          return withTimeout(client.rpc('waitlist_stats'), TIMEOUT_MS).then(function(r){
            if (r.error) { client = null; return false; }
            showStats(r.data);
            return true;
          });
        });
      })
      .catch(function(){ client = null; return false; });
  }
  function rpc(name, args){
    if (!client) return Promise.reject(new Error('Signups open shortly.'));
    return client.rpc(name, args || {}).then(function(r){ if (r.error) throw r.error; return r.data; });
  }
  function getSession(){
    return client.auth.getSession().then(function(r){ return (r.data && r.data.session) || null; }, function(){ return null; });
  }
  function ensureSession(){
    return getSession().then(function(s){
      if (s) return s;
      return client.auth.signInAnonymously().then(function(r){ if (r.error) throw r.error; return r.data && r.data.session; });
    });
  }
  function logEvent(name, props){
    if (!client) return;
    try { client.rpc('log_event', { p_name: name, p_props: props || {} }).then(function(){}, function(){}); } catch (e) {}
  }

  // ---------- people (captain grid, stats names) ----------
  var peoplePromise = null;
  function people(){
    if (!peoplePromise) {
      peoplePromise = (BD.loadPeople ? BD.loadPeople() : Promise.reject(new Error('no BD')))
        .then(function(ix){ return (ix && ix.people || []).slice().sort(function(a, b){ return (a.rank || 999) - (b.rank || 999); }); })
        .catch(function(){ peoplePromise = null; return []; });
    }
    return peoplePromise;
  }
  function nameOf(list, slug){ for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i].name; return null; }
  function face(p, size){
    var src = typeof w.BDPortraitFor === 'function' ? w.BDPortraitFor(p.slug || p.name) : null;
    var wrap = el('span', 'wl-face');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.width = wrap.style.height = size + 'px';
    if (typeof src === 'string' && /^[A-Za-z0-9_\-.\/]+$/.test(src) && src.indexOf('..') < 0 && src.slice(0, 2) !== '//') {
      var img = el('img');
      img.setAttribute('src', src); img.setAttribute('alt', ''); img.setAttribute('loading', 'lazy');
      img.width = size; img.height = size;
      wrap.appendChild(img);
    } else {
      wrap.appendChild(el('span', 'wl-face__ini', BD.initials ? BD.initials(p.name) : '•'));
    }
    return wrap;
  }

  // ---------- public stats line (only when the backend returns a captain breakdown) ----------
  function showStats(st){
    var box = d.getElementById('wl-stats');
    if (!box || !st || !st.captains || !st.captains.length) return;
    people().then(function(list){
      var parts = [];
      for (var i = 0; i < st.captains.length && parts.length < 3; i++) {
        var c = st.captains[i], n = c && nameOf(list, c.slug);
        if (n && isFinite(Number(c.pct))) parts.push(n + ' ' + Math.round(Number(c.pct)) + '%');
      }
      if (!parts.length) return;
      box.textContent = 'Most-picked captains so far: ' + parts.join(' · ');
      box.hidden = false;
    });
  }

  // ---------- invite banner (?join=CODE) ----------
  function loadInvite(){
    var code = START.src.join;
    if (!code || !client) return Promise.resolve(null);
    return rpc('waitlist_league_info', { p_code: code }).then(function(info){
      if (!info || !info.name) { inviteInfo = null; return null; }
      inviteInfo = { name: String(info.name), members: Number(info.members) || 0, code: code };
      var box = d.getElementById('wl-invite');
      if (box) {
        clear(box);
        box.appendChild(d.createTextNode("You're invited to "));
        box.appendChild(el('strong', null, inviteInfo.name));
        box.appendChild(d.createTextNode(' · ' + (BD.plural ? BD.plural(inviteInfo.members, 'member', 'members') : inviteInfo.members + ' members')));
        box.hidden = false;
      }
      return inviteInfo;
    }, function(){ return null; });
  }

  // ---------- states ----------
  function setApp(nodes){
    if (timer) { clearInterval(timer); timer = null; }
    clear(app);
    app.setAttribute('aria-busy', 'false');
    for (var i = 0; i < nodes.length; i++) if (nodes[i]) app.appendChild(nodes[i]);
  }

  function renderClosed(){
    var h = el('h2', 'wl-card__h', 'Signups open shortly');
    var p = el('p', 'wl-note', 'The waitlist is almost ready. Check back soon. Meanwhile, ');
    var a = el('a', null, "read today's Digest"); a.href = 'news.html';
    p.appendChild(a); p.appendChild(d.createTextNode('.'));
    setApp([h, p]);
  }

  function renderForm(prefill, note){
    var f = el('form', 'wl-form');
    f.setAttribute('novalidate', '');
    var lab = el('label', 'wl-label', 'Your email'); lab.htmlFor = 'wl-email';
    var row = el('div', 'wl-form__row');
    var inp = el('input', 'v2-input wl-input');
    inp.id = 'wl-email'; inp.type = 'email'; inp.name = 'email'; inp.autocomplete = 'email'; inp.required = true;
    inp.maxLength = 254; inp.spellcheck = false; inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('inputmode', 'email');
    inp.setAttribute('aria-describedby', 'wl-email-hint');
    if (prefill) inp.value = prefill;
    var go = el('button', 'v2-btn v2-btn--primary v2-btn--big wl-go', 'Join the waitlist'); go.type = 'submit';
    row.appendChild(inp); row.appendChild(go);
    var hint = el('p', 'wl-hint', "Free. We'll email you a link to confirm. Unsubscribe any time. ");
    hint.id = 'wl-email-hint';
    var pa = el('a', null, 'Privacy'); pa.href = 'privacy.html'; hint.appendChild(pa);
    var m = msg();
    if (note) ok(m, note);
    f.appendChild(lab); f.appendChild(row); f.appendChild(hint); f.appendChild(m);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var email = String(inp.value || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 254) {
        inp.setAttribute('aria-invalid', 'true');
        bad(m, 'Please enter a valid email address.');
        inp.focus();
        return;
      }
      inp.removeAttribute('aria-invalid');
      busy(go, true, 'Joining…'); m.textContent = ''; m.className = 'wl-msg';
      join(email).then(function(){
        ssSet(SS_EMAIL, email); ssSet(SS_MODE, 'confirm'); ssSet(SS_SENT, String(Date.now()));
        renderInbox(email, 'confirm');
        announce('Check your inbox to confirm ' + email + '.');
      }, function(err){
        busy(go, false, 'Join the waitlist');
        if (/email_taken|already (been )?registered|already exists|email_exists/i.test((err && (err.message || err.code)) || '')) {
          renderTaken(email);
          return;
        }
        bad(m, errText(err));
      });
    });
    setApp([el('h2', 'wl-card__h', 'Get your spot in line'), f]);
  }

  function join(email){
    var src = START.src;
    return ensureSession().then(function(){
      return rpc('waitlist_join', {
        p_email: email,
        p_ref: src.ref || null,
        p_league: src.join || null,
        p_source: sourceJson()
      });
    }).then(function(){
      return client.auth.updateUser({ email: email }, { emailRedirectTo: redirectUrl() }).then(function(r){
        if (r.error) throw r.error;
      });
    });
  }

  function renderTaken(email){
    var h = el('h2', 'wl-card__h', "That email is already on the list");
    var p = el('p', 'wl-note', "If it's yours, we'll email you a sign-in link so you can see your place in line.");
    var b = btn('Email me a sign-in link');
    var back = btn('Use a different email', 'v2-btn--ghost');
    var m = msg();
    b.addEventListener('click', function(){
      busy(b, true, 'Sending…');
      sendSignInLink(email).then(function(){
        ssSet(SS_EMAIL, email); ssSet(SS_MODE, 'signin'); ssSet(SS_SENT, String(Date.now()));
        renderInbox(email, 'signin');
        announce('Check your inbox for a sign-in link.');
      }, function(err){ busy(b, false, 'Email me a sign-in link'); bad(m, errText(err)); });
    });
    back.addEventListener('click', function(){ renderForm(''); var i = d.getElementById('wl-email'); if (i) i.focus(); });
    var row = el('div', 'v2-btnrow'); row.appendChild(b); row.appendChild(back);
    setApp([h, p, row, m]);
    b.focus();
  }
  function sendSignInLink(email){
    return client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: false } })
      .then(function(r){ if (r.error) throw r.error; });
  }
  function resend(email, mode){
    if (mode === 'signin') return sendSignInLink(email);
    var p = client.auth.resend
      ? client.auth.resend({ type: 'email_change', email: email, options: { emailRedirectTo: redirectUrl() } })
      : client.auth.updateUser({ email: email }, { emailRedirectTo: redirectUrl() });
    return p.then(function(r){ if (r && r.error) throw r.error; });
  }

  function renderInbox(email, mode){
    var h = el('h2', 'wl-card__h', mode === 'signin' ? 'Check your inbox for a sign-in link' : 'Check your inbox to confirm');
    var p = el('p', 'wl-note');
    p.appendChild(d.createTextNode('We sent a link to '));
    p.appendChild(el('strong', null, email));
    p.appendChild(d.createTextNode(mode === 'signin'
      ? '. Open it on this device to see your place in line.'
      : '. Click it to confirm and get your place in line. Check spam if it is not there in a minute.'));
    var b = btn('Resend the email', 'v2-btn--ghost');
    var other = btn('Use a different email', 'v2-btn--ghost');
    var m = msg();
    function tick(){
      var sent = Number(ssGet(SS_SENT)) || 0;
      var left = Math.ceil(RESEND_COOLDOWN_S - (Date.now() - sent) / 1000);
      if (left > 0) { b.disabled = true; b.textContent = 'Resend in ' + left + ' s'; }
      else { b.disabled = false; b.textContent = 'Resend the email'; if (timer) { clearInterval(timer); timer = null; } }
    }
    b.addEventListener('click', function(){
      busy(b, true, 'Sending…');
      resend(email, mode).then(function(){
        ssSet(SS_SENT, String(Date.now()));
        ok(m, 'Sent again. It can take a minute to arrive.');
        tick(); if (!timer) timer = setInterval(tick, 1000);
      }, function(err){ busy(b, false, 'Resend the email'); bad(m, errText(err)); });
    });
    other.addEventListener('click', function(){
      ssSet(SS_EMAIL, null); ssSet(SS_SENT, null); ssSet(SS_MODE, null);
      renderForm('');
      var i = d.getElementById('wl-email'); if (i) i.focus();
    });
    var row = el('div', 'v2-btnrow'); row.appendChild(b); row.appendChild(other);
    setApp([h, p, row, m]);
    tick();
    if (b.disabled) timer = setInterval(tick, 1000);
  }

  // copy + share row for a link
  function linkRow(id, label, url, kind){
    var wrap = el('div', 'wl-link');
    var lab = el('label', 'wl-label', label); lab.htmlFor = id;
    var row = el('div', 'wl-link__row');
    var inp = el('input', 'v2-input wl-link__input'); inp.id = id; inp.type = 'text'; inp.readOnly = true; inp.value = url;
    inp.addEventListener('focus', function(){ try { inp.select(); } catch (e) {} });
    var copy = btn('Copy', 'v2-btn--primary');
    var m = msg();
    copy.addEventListener('click', function(){
      copyText(url, inp).then(function(){
        ok(m, 'Link copied.');
        logEvent('invite_copied', { kind: kind });
      }, function(){ bad(m, 'Could not copy. Press and hold the link to copy it.'); inp.focus(); });
    });
    row.appendChild(inp); row.appendChild(copy);
    if (navigator.share) {
      var share = btn('Share', 'v2-btn--ghost');
      share.addEventListener('click', function(){
        logEvent('share_clicked', { kind: kind });
        navigator.share({ title: 'Billionaires Digest', text: 'Fantasy football, but the players are billionaires. Join me:', url: url })
          .then(function(){}, function(err){
            if (err && err.name === 'AbortError') return;
            copyText(url, inp).then(function(){ ok(m, 'Link copied.'); }, function(){});
          });
      });
      row.appendChild(share);
    }
    wrap.appendChild(lab); wrap.appendChild(row); wrap.appendChild(m);
    return wrap;
  }
  function copyText(text, inp){
    if (navigator.clipboard && navigator.clipboard.writeText && w.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function(res, rej){
      try { inp.focus(); inp.select(); inp.setSelectionRange(0, text.length); if (d.execCommand('copy')) res(); else rej(new Error('copy')); }
      catch (e) { rej(e); }
    });
  }

  function renderConfirmed(){
    var nodes = [];
    var h = el('h2', 'wl-card__h', "You're on the list");
    nodes.push(h);
    var pos = el('p', 'wl-pos');
    if (me && isFinite(Number(me.position)) && isFinite(Number(me.total))) {
      pos.appendChild(d.createTextNode('Your place in line: '));
      pos.appendChild(el('strong', 'wl-pos__n', '#' + fmt(me.position)));
      pos.appendChild(d.createTextNode(' of ' + fmt(me.total)));
    } else pos.textContent = 'Your place in line is being worked out.';
    nodes.push(pos);
    nodes.push(linkRow('wl-ref', 'Your referral link', SITE + '/?ref=' + encodeURIComponent(me.referral_code || ''), 'referral'));
    var boost = el('p', 'wl-note', 'Each friend who confirms moves you up 10 spots.');
    var rc = Number(me.referrals_confirmed) || 0;
    if (rc > 0) boost.appendChild(d.createTextNode(' ' + (rc === 1 ? '1 friend has' : fmt(rc) + ' friends have') + ' confirmed so far.'));
    nodes.push(boost);

    // invite from ?join= for a confirmed visitor who is not in that league yet
    var joined = (me.joined_leagues || []).map(String);
    if (inviteInfo && joined.indexOf(inviteInfo.name) < 0 && !(me.league && me.league.name === inviteInfo.name)) {
      var inv = el('div', 'wl-sub');
      inv.appendChild(el('p', 'wl-note', 'Join ' + inviteInfo.name + ' now so you start Season 1 together.'));
      var jb = btn('Join ' + inviteInfo.name);
      var jm = msg();
      jb.addEventListener('click', function(){
        busy(jb, true, 'Joining…');
        rpc('waitlist_join_league', { p_code: inviteInfo.code }).then(function(){
          announce("You're in " + inviteInfo.name + '.');
          return refreshMe();
        }).then(function(){ renderConfirmed(); }, function(err){ busy(jb, false, 'Join ' + inviteInfo.name); bad(jm, errText(err)); });
      });
      inv.appendChild(jb); inv.appendChild(jm);
      nodes.push(inv);
    }
    if (joined.length) nodes.push(el('p', 'wl-note', 'Your leagues: ' + joined.join(', ')));

    nodes.push(captainSection());
    nodes.push(leagueSection());
    setApp(nodes);
  }

  function captainSection(){
    var sec = el('section', 'wl-sub wl-cap');
    sec.setAttribute('aria-labelledby', 'wl-caph');
    var h = el('h3', 'wl-sub__h', 'Pick your captain'); h.id = 'wl-caph';
    sec.appendChild(h);
    var cur = el('p', 'wl-note');
    sec.appendChild(cur);
    var grid = el('ul', 'wl-cap__grid');
    grid.setAttribute('aria-label', 'Captain choices');
    sec.appendChild(grid);
    var m = msg();
    sec.appendChild(m);
    var hint = el('p', 'wl-hint', 'Tap one. You can change it later.');
    sec.appendChild(hint);
    people().then(function(list){
      var top = list.slice(0, 20);
      var picked = me && me.captain_pick;
      cur.textContent = picked ? 'Your captain: ' + (nameOf(list, picked) || picked) + '.' : 'Who would you build your Season 1 team around? Pick one.';
      if (!top.length) { grid.appendChild(el('li', 'wl-msg', 'The player list could not load right now.')); return; }
      top.forEach(function(p){
        var li = el('li');
        var b = el('button', 'wl-cap__b'); b.type = 'button';
        b.setAttribute('aria-pressed', p.slug === picked ? 'true' : 'false');
        b.appendChild(face(p, 56));
        b.appendChild(el('span', 'wl-cap__name', p.name.replace(/\s*&\s*family\s*$/i, '')));
        b.addEventListener('click', function(){
          var all = grid.querySelectorAll('button');
          for (var i = 0; i < all.length; i++) all[i].disabled = true;
          rpc('waitlist_pick_captain', { p_slug: p.slug }).then(function(){
            me.captain_pick = p.slug;
            for (var j = 0; j < all.length; j++) { all[j].disabled = false; all[j].setAttribute('aria-pressed', all[j] === b ? 'true' : 'false'); }
            cur.textContent = 'Your captain: ' + p.name + '.';
            ok(m, 'Captain saved: ' + p.name + '.');
          }, function(err){
            for (var j = 0; j < all.length; j++) all[j].disabled = false;
            bad(m, errText(err));
          });
        });
        li.appendChild(b);
        grid.appendChild(li);
      });
    });
    return sec;
  }

  function leagueSection(){
    var sec = el('section', 'wl-sub wl-league');
    sec.setAttribute('aria-labelledby', 'wl-lgh');
    var h = el('h3', 'wl-sub__h', 'Reserve your league'); h.id = 'wl-lgh';
    sec.appendChild(h);
    if (me.league && me.league.invite_code) {
      var p = el('p', 'wl-note');
      p.appendChild(el('strong', null, String(me.league.name)));
      var n = Number(me.league.members);
      if (isFinite(n)) p.appendChild(d.createTextNode(' · ' + (BD.plural ? BD.plural(n, 'member', 'members') : n + ' members')));
      sec.appendChild(p);
      sec.appendChild(linkRow('wl-inv', 'League invite link', SITE + '/?join=' + encodeURIComponent(me.league.invite_code), 'league'));
      sec.appendChild(el('p', 'wl-hint', 'Friends who join the waitlist from this link start Season 1 in your league. Up to 50 members.'));
      return sec;
    }
    var f = el('form', 'wl-form');
    f.setAttribute('novalidate', '');
    var lab = el('label', 'wl-label', 'League name'); lab.htmlFor = 'wl-lname';
    var row = el('div', 'wl-form__row');
    var inp = el('input', 'v2-input wl-input'); inp.id = 'wl-lname'; inp.type = 'text'; inp.maxLength = 30; inp.autocomplete = 'off';
    inp.setAttribute('aria-describedby', 'wl-lname-hint');
    var go = el('button', 'v2-btn v2-btn--primary', 'Reserve'); go.type = 'submit';
    row.appendChild(inp); row.appendChild(go);
    var hint = el('p', 'wl-hint', '3 to 30 letters, numbers, spaces, - _ or \'. One league per person.'); hint.id = 'wl-lname-hint';
    var m = msg();
    f.appendChild(lab); f.appendChild(row); f.appendChild(hint); f.appendChild(m);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var name = String(inp.value || '').replace(/\s+/g, ' ').trim();
      if (!LEAGUE_RE.test(name)) { inp.setAttribute('aria-invalid', 'true'); bad(m, 'Use 3 to 30 letters, numbers, spaces, - _ or \'.'); inp.focus(); return; }
      inp.removeAttribute('aria-invalid');
      busy(go, true, 'Reserving…');
      rpc('waitlist_reserve_league', { p_name: name }).then(function(r){
        me.league = { name: (r && r.name) || name, invite_code: r && r.invite_code, members: 1 };
        announce('League reserved: ' + me.league.name + '.');
        return refreshMe().then(null, function(){});
      }).then(function(){
        renderConfirmed();
        var i = d.getElementById('wl-inv'); if (i) i.focus();
      }, function(err){
        busy(go, false, 'Reserve');
        var t = (err && err.message) || '';
        bad(m, /duplicate|unique|taken|exists/i.test(t) ? 'That league name is taken. Try another.' : errText(err));
      });
    });
    sec.appendChild(f);
    return sec;
  }

  function refreshMe(){
    return rpc('waitlist_me').then(function(r){ if (r && typeof r === 'object') me = r; return me; });
  }

  // ---------- start ----------
  function start(){
    ready().then(function(on){
      if (!on) { renderClosed(); cleanUrl(); return; }
      return getSession().then(function(session){
        cleanUrl();
        return loadInvite().then(function(){ return session; });
      }).then(function(session){
        if (!session) return showFresh();
        return rpc('waitlist_me').then(function(r){
          me = r && typeof r === 'object' && r.email ? r : null;
          var u = session.user || {};
          var emailOk = !!(u.email && u.email_confirmed_at);
          if (me && me.confirmed) { clearPending(); renderConfirmed(); return; }
          if (emailOk && (me || START.confirmed)) {
            return rpc('waitlist_confirm').then(function(r2){
              me = r2 && typeof r2 === 'object' ? r2 : me;
              if (me && me.confirmed) { clearPending(); announce("Confirmed. You're on the list."); renderConfirmed(); }
              else showFresh();
            }, function(err){ showFresh(); var m = app.querySelector('.wl-msg'); if (m) bad(m, errText(err)); });
          }
          if (me && !me.confirmed) { renderInbox(me.email, ssGet(SS_MODE) === 'signin' ? 'signin' : 'confirm'); return; }
          return showFresh();
        }, function(){ showFresh(); });
      });
    }).then(null, function(){ renderClosed(); });
  }
  function clearPending(){ ssSet(SS_SENT, null); ssSet(SS_MODE, null); ssSet(SS_SRC, null); }
  function showFresh(){
    var email = ssGet(SS_EMAIL), mode = ssGet(SS_MODE);
    if (email && mode) { renderInbox(email, mode === 'signin' ? 'signin' : 'confirm'); return; }
    renderForm('', inviteInfo ? 'Join the waitlist to join ' + inviteInfo.name + ' when you confirm.' : '');
    if (LINK_ERROR) {
      var m = app.querySelector('.wl-msg');
      if (m) bad(m, 'That email link did not work (' + LINK_ERROR + '). Enter your email to get a new one.');
    }
  }

  // ---------- today's top stories (digest.json) ----------
  function renderNews(){
    var list = d.getElementById('wl-news'), date = d.getElementById('wl-newsdate');
    if (!list) return;
    var get = BD.getJson || function(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); };
    get('digest.json').then(function(dg){
      clear(list);
      var st = (dg && Array.isArray(dg.stories) ? dg.stories : []).filter(function(s){ return s && s.headline; }).slice(0, 5);
      if (date && dg && dg.date) date.textContent = String(dg.date);
      if (!st.length) { list.appendChild(el('li', 'wl-msg', 'No stories yet today.')); return; }
      st.forEach(function(s){
        var li = el('li', 'wl-story');
        var a = el('a', 'wl-story__h', String(s.headline)); a.href = 'news.html';
        li.appendChild(a);
        var meta = [s.who, s.source].filter(Boolean).map(String).join(' · ');
        if (meta) li.appendChild(el('span', 'wl-story__meta', meta));
        list.appendChild(li);
      });
    }, function(){
      clear(list);
      var li = el('li', 'wl-msg', "Today's stories could not load here. ");
      var a = el('a', null, 'Open the news page'); a.href = 'news.html';
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  // season label from config/launch.json (the page already says "Monday, Nov 9" without it)
  function seasonLabel(){
    var u = here ? here.replace(/assets\/waitlist\.js(\?.*)?$/, 'config/launch.json') : 'config/launch.json';
    fetch(u, { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(c){
      if (!c || typeof c.seasonStartLabel !== 'string' || !c.seasonStartLabel) return;
      var ns = d.querySelectorAll('[data-wl-season]');
      for (var i = 0; i < ns.length; i++) ns[i].textContent = c.seasonStartLabel;
    }, function(){});
  }

  renderNews();
  seasonLabel();
  start();
})(window, document);
