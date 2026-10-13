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
