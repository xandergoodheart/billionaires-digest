# Switching on The Billionaire Brief

A step-by-step checklist for the owner. It turns on email sign-up for The Billionaire Brief and sends the first issue.
Never paste a secret value into chat, files or issues. This page names settings; it never contains their values.

**Time:** about 1 to 1.5 hours of clicking, spread over a day (DNS changes can take a few hours to be checked).
**Cost:** $0 on Resend's free plan to start. See "Costs" at the end.

## What is already built (and still off)

- **The email:** "The Portrait Gallery" design. A painted-portrait cover story, a "Face of the day", **The Daily Swing**
  (the biggest estimated one-day gainers and losers in public stakes), a gallery of the other stories, quick hits and
  the game card. Every fact comes from that day's edition with its source link; opinion is labelled.
- **Portrait pictures for email:** small JPG copies in `assets/portraits/email/`. Mail apps fetch them from the live
  site, so they only appear in real emails after the Brief pull request is merged.
- **Sign-up choices:** a "send me the Brief" box in the Create free account dialog (unticked), an on/off switch on the
  Account page, and the Brief box in the front-page "Save your team" form.
- **The database update:** `supabase/migrations/0009_brief_accounts.sql`. The daily 6:45 AM Game sync applies it
  automatically after the pull request is merged. It adds the account opt-in and changes nothing a visitor can see
  while `briefSignup` is false.
- **The sender:** the "Billionaire Brief" workflow on GitHub. Manual only: it never sends on a schedule.

## The two public switches

Both live in `config/launch.json` and are `false` today. Claude changes them for you when you ask (step 6).

| Switch | What it shows when `true` | Turn on when |
|---|---|---|
| `emailSignup` | The front-page "Save your team" email box | Resend email works through Supabase (steps 1 and 2) |
| `briefSignup` | The Brief checkbox in Create free account, the Brief section on the Account page, and the Brief box in "Save your team" | "Confirm email" is ON in Supabase (step 3) and the GitHub secrets are added (step 4) |

**Do the steps in this order.** Turning a switch on early means sign-ups whose confirmation emails never arrive.

## Step 1. Resend account and domain

Resend is the service that delivers the emails.

1. Make a free account at resend.com with the business address.
2. Resend → **Domains** → **Add domain** → `billionairesdigest.com`.
3. Resend lists a few DNS records (names and values). Add each one exactly as shown at your domain host (Porkbun):
   Porkbun → Domain Management → `billionairesdigest.com` → **DNS**. Copy and paste; do not retype.
4. Back in Resend, press **Verify**. It can take from minutes to a few hours. Wait until the domain says **Verified**.

## Step 2. Supabase sends its emails through Resend (SMTP)

This makes sign-up confirmation emails and password-reset emails actually arrive.

1. Resend → **API Keys** → **Create API key**. Name it "Supabase SMTP". Choose **Sending access** for
   `billionairesdigest.com` if offered. Copy it once into your password manager.
2. Resend → **Settings** → **SMTP**. It shows the host, port and username.
3. Supabase dashboard → your project → Authentication → **SMTP** (in some versions: Authentication → Emails → SMTP
   Settings) → enable **Custom SMTP**:
   - Host `smtp.resend.com`, port `465`, username `resend` (from Resend's Supabase guide, checked 2026-10-15;
     if Resend's SMTP page shows different values, use those).
   - Password: the Resend API key from step 2.1.
   - Sender email: an address at `billionairesdigest.com` (for example `hello@billionairesdigest.com`).
   - Sender name: Billionaires Digest.
   - Save.
4. Test: in a private window, use "Forgot password?" on a test account, or create a test account with email +
   password. The email should arrive within a minute. Check the spam folder too.

## Step 3. Turn "Confirm email" ON (required before `briefSignup`)

Supabase → Authentication → Sign In / Providers → **Email** → turn **"Confirm email" ON** → Save.

Why: without it, addresses typed in for email + password accounts are never checked, so the Brief could be sent to an
address that the person does not own.

What changes: new email + password accounts get a "Confirm your email" message and must click the link before they
can log in. Google accounts are not affected. (This replaces the "Confirm email OFF" advice in `OWNER-SETUP.md`
section 3c.)

## Step 4. GitHub secrets for the sender

GitHub → the repository → Settings → **Secrets and variables** → **Actions** → **New repository secret**. Add two:

- `RESEND_API_KEY`: a **second** Resend API key made just for the Brief (name it "Brief sender", sending access).
  Using a separate key means you can cancel one without breaking the other.
- `BRIEF_FROM`: the "from" line, for example `Billionaires Digest <brief@billionairesdigest.com>`. The address must
  be at the verified domain.

`SUPABASE_URL` (variable) and `SUPABASE_SERVICE_KEY` (secret) are already there from the game setup. Nothing else to
add.

## Step 5. Merge the Brief pull request

1. Review and merge the pull request Claude opened for the Brief. Visitors see no change: both switches are still off.
2. The next morning's 6:45 AM Game sync applies `0009_brief_accounts.sql`. To do it sooner: GitHub → **Actions** →
   **Game sync** → **Run workflow**.
3. Check that the Game sync run finished with a green tick.

## Step 6. Ask Claude to turn on the switches

Say: **"turn on emailSignup and briefSignup"**. Claude changes only those two lines in `config/launch.json` on a
branch and opens a pull request. You merge it. The site updates a few minutes later.

You can turn on `emailSignup` alone first if you want to try the front-page box before the Brief options appear.

## Step 7. Test in a private window

Use an address you can read, not your main one if you can avoid it.

1. **Front page:** fill in "Save your team", tick the Brief box, submit, and click the confirmation email.
2. **Create free account:** open the dialog, tick "Email me The Billionaire Brief", create an account (Google, or email
   + password and then click the confirmation email). The "account is ready" notice should say you are on the list.
3. **Account page:** open Account. "The Billionaire Brief" section should say "Sending to …" (or "We'll start sending
   once your email is confirmed" until the confirmation link is clicked). Turn the switch off, reload, check it stays
   off; turn it on again.

## Step 8. The first send

Do this only after steps 5 and 6 are live, so mail apps can load the portrait pictures from the site.

1. GitHub → **Actions** → **Billionaire Brief** → **Run workflow** → mode **dry-run** → Run. Nothing is sent.
2. Open the finished run and read the log line that starts **"Recipients"**. That is how many people would get it.
   Make sure the number makes sense.
3. At the bottom of the run page, download the **brief-preview** file (a zip). Open `brief-preview.html` in a browser
   and read it top to bottom; `brief-preview.txt` is the plain-text version. If portraits do not show in the downloaded
   preview, that is expected: real emails load them from the live site.
4. When happy: **Run workflow** again → mode **send** → `confirm_date` = **today's date in New York**, written
   `YYYY-MM-DD` → Run. Any other date and it refuses to send.
5. Open the run. The last line should read **"Done: N sent, 0 failed."**
6. Resend → **Emails**: the messages should show as delivered.
7. Open your copy of the email. Click **Unsubscribe**, press "Unsubscribe me", and (if that address has an account)
   check that the Account page switch now shows off. Turn it back on from the Account page if you want to keep getting it.

**Daily limit:** Resend's free plan allows 100 emails a day, and that includes sign-up confirmation and password-reset
emails. If the "Recipients" number gets near 100, move to the Pro plan before sending.

The Daily Swing section is left out automatically if the price data is missing or more than 4 days old. That is
normal on a Monday after a long weekend or when the morning data job has failed.

## Turning it off

- **Stop new sign-ups:** ask Claude to set `briefSignup` (and/or `emailSignup`) back to `false`. Nobody loses their
  place on the list.
- **Stop sending:** just do not run the send. There is no schedule.
- **Emergency:** delete the `RESEND_API_KEY` secret in GitHub, or cancel the key in Resend. Sends then fail safely.

## Costs

| Item | Cost | Notes |
|---|---|---|
| Resend free plan | $0 | Up to 100 emails a day and 3,000 a month. Confirmation emails count too. |
| Resend Pro | $20 a month | 50,000 emails a month, no daily cap. Only needed when the list grows. |
| Supabase | No change | Uses the existing project. |
| GitHub | No change | The workflow runs on the existing plan. |

Resend prices checked on resend.com/pricing on 2026-10-15. Check again before upgrading.

## If something goes wrong

- **No confirmation email:** check spam; check Resend → Emails for a bounce; check the Supabase SMTP settings were
  saved. If a few arrive and then stop, look at Supabase → Authentication → Rate Limits.
- **Send says "needs env":** a secret from step 4 is missing or misspelled.
- **Send says "needs --confirm-date":** the date was not today's date in New York.
- **"Not sending: fewer than 3 usable stories":** today's edition did not have enough stories with source links. Try
  again after the next edition.
