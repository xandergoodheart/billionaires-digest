/* Billionaires Digest accounts: the pure rules behind assets/v2/auth.js (no DOM, no network). ES5.
   Exposes one global: BDAuthCore. Tested with node --test (scripts/lib/v2-auth-core.test.mjs).
   - flags(config): which sign-in methods config/supabase.json switches on ("authGoogle", "authPassword", both public
     booleans, off unless exactly true; everything off when "enabled" is false)
   - emailProblem / passwordProblem: the form checks, in plain words
   - friendly(error, context): Supabase Auth errors -> { kind, text } a visitor can act on
   - openWeeks(core, ms): the fantasy weeks a team can still be saved for (the running week while late entry is open,
     and the next week)
   - planCarry(...): what to do with this browser's teams after sign-up, linking or logging in
   - initials(name): one or two letters for the round avatar
   - The Billionaire Brief: briefOn(launch) (config/launch.json "briefSignup", off unless exactly true), the sign-up
     wording, briefStatusText(brief) for the Account page, and briefIntent(record, email, ms) for the opt-in kept in
     this browser while an email + password account waits for its confirmation link */
(function(root){
  var A = {};
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  A.PASSWORD_MIN = 8;
  A.PASSWORD_MAX = 72;   // Supabase Auth (bcrypt) ignores anything longer
  A.CONTACT = 'hello@billionairesdigest.com';

  A.flags = function(c){
    var on = !!(c && c.enabled !== false);
    var g = on && c.authGoogle === true, p = on && c.authPassword === true;
    return { google: g, password: p, any: g || p };
  };

  A.emailProblem = function(s){
    s = String(s == null ? '' : s).trim();
    if (!s) return 'Enter your email address.';
    if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'That email address does not look right. Check it and try again.';
    return '';
  };
  A.passwordProblem = function(s){
    s = String(s == null ? '' : s);
    if (!s) return 'Enter a password.';
    if (s.length < A.PASSWORD_MIN) return 'Use at least ' + A.PASSWORD_MIN + ' characters.';
    if (s.length > A.PASSWORD_MAX) return 'Use ' + A.PASSWORD_MAX + ' characters or fewer.';
    if (!/\S/.test(s)) return 'A password cannot be only spaces.';
    return '';
  };

  // context: 'signup' | 'login' | 'reset' | 'newpass' | 'google' | 'link' | 'logout' | 'delete'
  A.friendly = function(e, context){
    var code = String((e && (e.code || e.error_code)) || ''), status = e && e.status;
    var m = String((e && (e.message || e.error_description || e.msg)) || '');
    function out(kind, text){ return { kind: kind, text: text }; }
    if (/Failed to fetch|NetworkError|Load failed|timeout|AuthRetryableFetchError|Could not reach/i.test(m + ' ' + (e && e.name))) {
      return out('network', 'We could not reach the sign-in server. Check your connection and try again.');
    }
    if (code === 'captcha_failed' || /captcha|anti-spam/i.test(m)) return out('captcha', 'The anti-spam check did not finish. Please try again.');
    if (/rate.?limit|too many|over_request|over_email/i.test(code + ' ' + m) || status === 429) return out('rate', 'Too many tries in a short time. Please wait a minute and try again.');
    if (context === 'reset' && (status >= 500 || /sending|smtp|email.*(provider|send)|unexpected_failure/i.test(code + ' ' + m))) {
      return out('reset-unavailable', "Password reset by email isn't available yet. Use Continue with Google, or write to " + A.CONTACT + '.');
    }
    if (/user_already_exists|email_exists/.test(code) || /already (been )?registered|already exists/i.test(m) && !/identity/i.test(m)) {
      return out('exists', 'That email already has an account.');
    }
    if (code === 'identity_already_exists' || /identity is already linked|already linked to another user/i.test(m)) {
      return out('identity-taken', 'That Google account already has a Billionaires Digest account. Log in with Google to use it.');
    }
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(m)) {
      return out('wrong', 'That email and password do not match. Check them, or reset your password.');
    }
    if (code === 'same_password' || /should be different from the old/i.test(m)) return out('same', 'That is your current password. Choose a new one.');
    if (code === 'weak_password' || /password.*(weak|at least|short|characters|pwned|leaked)/i.test(m)) {
      return out('weak', 'That password is too easy to guess. Use at least ' + A.PASSWORD_MIN + ' characters and avoid common words.');
    }
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(m)) return out('unconfirmed', 'This email is not confirmed yet. Check your inbox for the confirmation link.');
    if (code === 'email_address_invalid' || /invalid.*email|email.*invalid|unable to validate email/i.test(m)) return out('email', 'That email address does not look right. Check it and try again.');
    if (/provider.*(not enabled|disabled)|signups? (are )?disabled|manual_linking_disabled|manual linking/i.test(code + ' ' + m)) {
      return out('disabled', 'This way of signing in is not switched on yet. Please try again later.');
    }
    if (/session|jwt|not authenticated|sign in/i.test(m) && (context === 'newpass' || context === 'delete')) {
      return out('session', 'Your sign-in has expired. Log in again, then try once more.');
    }
    return out('other', m && m.length < 160 && !/^\{/.test(m) ? m : 'Something went wrong. Please try again.');
  };

  A.initials = function(name){
    var s = String(name == null ? '' : name).replace(/@.*$/, '').replace(/[^A-Za-z0-9]+/g, ' ').trim();
    if (!s) return '?';
    var parts = s.split(' ');
    if (parts.length > 1) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    var camel = /^([A-Za-z])[a-z0-9]*([A-Z])/.exec(s);
    return camel ? (camel[1] + camel[2]).toUpperCase() : s.charAt(0).toUpperCase();
  };

  // Fantasy weeks still open for a save at ms: the running week while late entry is open (not the practice week),
  // then the next week (the draft week). core = BDFantasyCore.
  A.openWeeks = function(core, ms){
    var out = [], lw = core.lockedWeek(ms), dw = core.draftWeek(ms);
    if (!core.isPractice(lw) && core.lateFrom(ms)) out.push(lw);
    if (out.indexOf(dw) < 0 && !core.isPractice(dw)) out.push(dw);
    return out;
  };
  A.weekName = function(core, id){
    var d = core.weekMonday(id);
    var label = MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10));
    return core.isPreseason && core.isPreseason(id) ? 'the preseason week of ' + label : 'the week of ' + label;
  };

  function sig(t){ return t && t.picks && t.picks.length ? t.picks.slice().sort().join(',') + '|' + t.captain : ''; }
  A.teamSig = sig;

  // What to do with this browser's saved teams after an auth change.
  //   weeks:    open week ids (openWeeks)
  //   local:    this browser's saved teams { week: { picks, captain } }
  //   server:   the account's rosters for those weeks { week: { picks, captain } | null }
  //   sameUser: true after sign-up or linking (the guest's user id was kept), false after logging in to an account
  //   locked:   week ids where the server no longer takes edits (the running week; a late first entry is still allowed)
  // Returns [{ week, action, local, server }], action:
  //   'push'  save this browser's team to the account (no team there yet, or the same user with a newer team here)
  //   'same'  already the same team
  //   'keep'  a different account's team is already there: keep it (the browser's team is offered as a choice)
  //   'skip'  nothing to do (no team in this browser, or locked)
  A.planCarry = function(o){
    var out = [];
    (o.weeks || []).forEach(function(w){
      var l = o.local && o.local[w], s = o.server && o.server[w];
      var locked = (o.locked || []).indexOf(w) >= 0;
      if (!l || !sig(l)) { out.push({ week: w, action: 'skip', local: null, server: s || null }); return; }
      if (s && sig(s) === sig(l)) { out.push({ week: w, action: 'same', local: l, server: s }); return; }
      if (!s) { out.push({ week: w, action: 'push', local: l, server: null }); return; }
      if (o.sameUser) { out.push({ week: w, action: locked ? 'skip' : 'push', local: l, server: s }); return; }
      out.push({ week: w, action: 'keep', local: l, server: s });
    });
    return out;
  };

  // ---------- The Billionaire Brief ----------
  A.BRIEF_LABEL = 'Email me The Billionaire Brief: the biggest billionaire moves, free. Unsubscribe any time.';
  A.BRIEF_LIST_LINE = "You're on the list for The Billionaire Brief.";
  A.BRIEF_CONFIRM_LINE = "We'll also start sending The Billionaire Brief once you confirm.";
  A.BRIEF_INTENT_MS = 3 * 24 * 60 * 60 * 1000;   // a ticked box waits this long for the confirmation link
  A.briefOn = function(launch){ return !!(launch && launch.briefSignup === true); };
  // true when set_my_brief answered that the Brief is on (or on once the email is confirmed)
  A.briefListed = function(r){ return !!(r && (r.status === 'on' || r.status === 'waiting')); };
  // brief = my_account().brief: { status, email }
  A.briefStatusText = function(brief){
    var st = brief && brief.status;
    if (st === 'on') return brief.email ? 'Sending to ' + brief.email + '.' : 'Sending to your email.';
    if (st === 'waiting') return "On. We'll start sending once your email is confirmed.";
    return "You're not getting the Brief.";
  };
  // The opt-in kept in this browser for an email + password sign-up that still has to confirm its address:
  // record { email, at }. Applies only to the same address (any letter case), within BRIEF_INTENT_MS.
  A.briefIntent = function(rec, email, ms){
    if (!rec || typeof rec !== 'object' || typeof rec.email !== 'string' || !rec.email || typeof rec.at !== 'number') return false;
    if (!(ms >= rec.at) || ms - rec.at > A.BRIEF_INTENT_MS) return false;
    return String(email == null ? '' : email).trim().toLowerCase() === rec.email.trim().toLowerCase();
  };

  root.BDAuthCore = A;
})(typeof window !== 'undefined' ? window : globalThis);
