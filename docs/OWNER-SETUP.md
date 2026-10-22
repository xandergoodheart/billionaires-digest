# Owner setup: things only you can do

Short checklists for settings that need your accounts. Never paste secret values into chat, files or issues.

## 1. Anti-spam check on sign-ups (Cloudflare Turnstile)

This stops bots from making guest accounts and waitlist signups. It is free. The site already has the code for it; the
check stays off until step 3.

**Order matters:** do the steps in this order. If you switch it on in Supabase (step 4) before the site sends the
check (step 3 is live), every sign-in fails.

1. **Make the widget.** In the Cloudflare dashboard → Turnstile → Add widget.
   - Name: Billionaires Digest
   - Hostnames: `billionairesdigest.com` and `www.billionairesdigest.com` (add any preview domains you use, too)
   - Widget mode: **Managed**
   - Cloudflare then shows a **Site key** (public) and a **Secret key** (private).
2. **Send the site key to Claude.** The site key is public: it goes into `config/supabase.json` as
   `"turnstileSiteKey": "<site key>"`. Do **not** send the secret key.
3. **Wait until that change is live** on billionairesdigest.com. Then check that the Play online button and the
   "Save your team" box still work in a private window.
4. **Turn it on in Supabase.** Supabase dashboard → your project → Authentication → Attack Protection (called "Bot
   and abuse protection" in some versions) → enable **Captcha protection** → provider **Cloudflare Turnstile** →
   paste the **Secret key** → Save.
5. Try it again in a private window: Play online, Save your team, and "Email me a sign-in link".

**To switch it off:** turn off Captcha protection in Supabase first, then ask Claude to remove `turnstileSiteKey`.

**Note:** the iPhone app (not yet in the App Store) signs players in as guests through Supabase and does not run
this check, so new guest sign-ins in the app fail while Captcha protection is on. Fix the app before turning this on,
or accept that while it is not public.

## 2. Nightly database backup

See [BACKUPS.md](BACKUPS.md). In short: add a GitHub secret `BACKUP_PASSPHRASE` (a long random passphrase) and keep a
copy in your password manager.

## 3. Real accounts (Continue with Google, email + password)

Guests keep playing without signing up. Accounts let people keep their team on every device. Both sign-in methods are
**off** until you switch them on, and each can be switched on by itself. While both are off the site shows no account
buttons; `account.html` only says accounts are not open yet. Cost: $0. Supabase's free plan covers a site of
about 1,000 players, and Google sign-in is free.

The switches are two public lines in `config/supabase.json`: `"authGoogle": false` and `"authPassword": false`.

**Order matters:** do the Supabase and Google steps first, check them, and only then ask Claude to flip a switch.

### 3a. URLs (needed for both methods)

Supabase dashboard → your project → Authentication → **URL Configuration**:
- **Site URL:** `https://billionairesdigest.com`
- **Redirect URLs:** add `https://billionairesdigest.com/**` and `https://www.billionairesdigest.com/**` (add a preview
  domain too if you test there). Google sign-in returns people to the page they started on, and the password-reset
  email opens `account.html?reset=1`, so both need to be on this list.

### 3b. Continue with Google

1. **Find the Supabase callback URL.** Supabase → Authentication → Sign In / Providers → **Google**. It shows a
   "Callback URL (for OAuth)" like `https://<project>.supabase.co/auth/v1/callback`. Copy it.
2. **Make the Google OAuth client.** Google Cloud Console (console.cloud.google.com) → pick or create a project
   (e.g. "Billionaires Digest").
   - APIs & Services → **OAuth consent screen** (also called "Google Auth Platform → Branding"): User type
     **External**; App name "Billionaires Digest"; support email `hello@billionairesdigest.com`; Authorized domain
     `billionairesdigest.com`; add links to `https://billionairesdigest.com/privacy.html` and
     `https://billionairesdigest.com/terms.html`. Scopes: only the default `openid`, `email`, `profile`. Then
     **Publish app** (otherwise only test users can sign in). No verification is needed for these basic scopes.
   - APIs & Services → **Credentials** → Create credentials → **OAuth client ID** → Application type **Web
     application**; name "Billionaires Digest (Supabase)".
     - Authorized JavaScript origins: `https://billionairesdigest.com` and `https://www.billionairesdigest.com`
     - Authorized redirect URIs: the Supabase callback URL from step 1
   - Google shows a **Client ID** and a **Client secret**.
3. **Turn Google on in Supabase.** Back in Supabase → Sign In / Providers → Google → **Enable**, paste the Client ID
   and Client secret → Save. Never paste the secret anywhere else (not in chat, files or issues).
4. **Allow linking.** Supabase → Authentication → Sign In / Providers (or Settings) → turn **on "Allow manual
   linking"**. This lets a guest connect Google to the guest account they already play with, so their team stays.
   Leave **"Allow anonymous sign-ins" on** (guests still need it).

### 3c. Email + password

1. Supabase → Authentication → Sign In / Providers → **Email**: Enable. Turn **"Confirm email" OFF** (sign-up works
   at once; no confirmation email has to be delivered). Minimum password length: 8 (the site asks for 8 too).
   Turn "Confirm email" **ON** before switching on The Billionaire Brief (see [BRIEF-SWITCH-ON.md](BRIEF-SWITCH-ON.md)).
2. **Password reset emails** need working email sending (Authentication → SMTP, e.g. Resend). Until that is set up,
   "Forgot password?" tells people: "Password reset by email isn't available yet. Use Continue with Google, or write
   to hello@billionairesdigest.com." Supabase's built-in email sender only allows a few emails per hour, so set up
   SMTP before relying on resets.

### 3d. Anti-spam

If Captcha protection is on (section 1), it covers sign-up, log-in and password reset as well: the site already sends
the check with those calls. Nothing extra to do.

### 3e. Switch it on

1. Ask Claude: "turn on authGoogle" and/or "turn on authPassword". Claude changes only those lines in
   `config/supabase.json`, and the database update for accounts (`supabase/migrations/0008_accounts.sql`) is applied by
   the daily Game sync (or run the "Game sync" workflow by hand once).
2. When it is live, test in a private window: Create free account with Google; play a team first as a guest and check
   it is still there after linking; log out and log back in; set a nickname; open Account → Delete my account on a test
   account and check it is gone the next day (Game sync log line "Account deletions: …").

**To switch off:** ask Claude to set the flag back to `false`. Existing accounts keep working the next time the flags
are on; nobody loses data. You can also disable the provider in Supabase.

### 3f. Account deletion

"Delete my account" on `account.html` records a request. The daily Game sync job (`scripts/process-deletions.mjs`)
deletes the person's teams, scores, league memberships, waitlist rows, events, profile and finally the sign-in record,
within 24 hours, and logs only counts. Leagues they own pass to the longest-standing other member. It uses the existing
`SUPABASE_SERVICE_KEY` secret; nothing new to set up.

## 4. The Billionaire Brief (email newsletter)

The Brief is built and switched off. Turning it on takes two public switches in `config/launch.json`: `emailSignup`
(the front-page "Save your team" box) and `briefSignup` (the Brief choices in Create free account, on the Account page
and in "Save your team"). Follow [BRIEF-SWITCH-ON.md](BRIEF-SWITCH-ON.md) step by step: Resend, Supabase SMTP,
"Confirm email" ON, GitHub secrets, then the switches and the first send.
