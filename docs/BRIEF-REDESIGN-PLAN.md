# Plan: The Billionaire Brief, redesigned, with opt-in at sign-up and on the Account page

Status: **plan for owner review (2026-10-16). Nothing is built or live.** Mock-ups are shown separately; they are not
part of the site. When the owner approves, the build happens on a branch from `origin/main` through a pull request,
behind a switch that stays **off** until the owner turns it on.

## What the owner asked for

1. A better-looking Brief email.
2. A "send me the Brief" choice when someone creates a free account (Google or email + password), unticked unless
   they tick it.
3. An on/off switch for the Brief on the Account page.
4. Nothing goes live.

## Where things stand today (checked 2026-10-15/16)

- The Brief is built and off: `scripts/send-brief.mjs` + `scripts/lib/brief.mjs`, sent by hand from the
  "Billionaire Brief" GitHub workflow. Its dry run works and the preview has no layout bugs at phone width.
- The only way to opt in is the unticked box inside the front-page "Save your team" form, which is hidden while
  `config/launch.json` has `"emailSignup": false`.
- The Create free account dialog (`assets/v2/auth.js`) and the Account page (`assets/v2/account-page.js`) have no
  Brief option. People who make an account are never on the list.
- The list lives in the `waitlist` table (`supabase/migrations/0005_waitlist.sql`): `brief_opt_in`, `confirmed_at`,
  `unsubscribed_at`, `unsub_token`. `waitlist_brief_recipients()` = confirmed, opted in, not unsubscribed. Account
  deletion already deletes waitlist rows (`0008_accounts.sql`).
- Privacy policy already names "our email delivery provider" for confirmation emails and the Brief. No change needed.

## Part A. The email, redesigned

Goal: it should look like Billionaires Digest (the ESPN-style site), read well on a phone, and survive the big mail
apps (Apple Mail / iOS Mail, Gmail app and web, Outlook).

**Look** (mock-up A):
- Black masthead bar with the red "BD" badge, "THE BILLIONAIRE BRIEF" in the site's condensed capitals, and the
  edition date. Same colours as the site: black `#0B0B0C`, red `#D62D27`, canvas `#EDEEF0`, white cards.
- "Your spot" card (only before Season 1 starts, 9 Nov): place in line and the personal invite link. After the season
  starts this card is replaced by a "Play this week" button to the site. (Today the line says "#N in line" forever.)
- Top story: a red kicker ("TOP STORY"), a big condensed headline and the short summary already in the edition.
- Up to 5 more stories, each as its own block: a small kicker built from fields already in the edition (story type
  and person, for example "EARNINGS · JAMIE DIMON"), headline, the factual "move" text, and "Source: …" link.
- One red button: "Read today's full edition".
- Footer: "For information only · not financial advice", why they get it, Unsubscribe and Manage email settings
  (Account page) links, contact address.
- Initials circles instead of pictures (the site's painted portraits are .webp, which Outlook does not show). No
  photos, no logos, as the house rules require.

**Content rules (unchanged from today):** only text already in that day's edition; only stories with a source link;
sentences quoting a raw share price are dropped; opinion fields ("AI read", "why", "bear") stay out of the email.

**Mail-app details:**
- The site's fonts (Barlow, Barlow Condensed) load in Apple Mail and iOS Mail. Gmail and Outlook fall back to Arial
  Narrow / Arial, which is designed for in the mock-up.
- Dark mode: declares light and dark support and includes dark colours for Apple Mail. Gmail's app recolours emails
  on its own; the dark masthead and plain backgrounds keep that readable. Outlook desktop shows the light version.
- Layout is one column, max 600 px, tables and inline styles (the only layout every mail app agrees on).
- The plain-text version keeps the same order.

## Part B. "Send me the Brief" when creating a free account

**Where** (mock-up B shows it below the password field): in the Create free account dialog, one unticked checkbox.
**Recommended final position: just under the dialog's title, above "Continue with Google"**, so people who sign up
with Google see it before they click. Mock-up B shows the lower position; see decision 4.

> ☐ Email me The Billionaire Brief: the biggest billionaire moves, free. Unsubscribe any time.

- Shown only in "Create free account" mode, not in "Log in" (existing accounts use the Account page).
- It applies to both ways of signing up. Because Continue with Google leaves the page and comes back, the choice is
  kept in the browser for that trip and applied on return.
- After sign-up with the box ticked, the "Your free account is ready" notice adds one line: "You're on the list for
  The Billionaire Brief." That notice is built in two places in `auth.js` (after sign-in, and after the nickname
  step's "Not now"), so the line goes in both.
- When an email + password account still has to confirm its address, the notice never shows: the dialog shows its
  "Confirm your email" screen instead. The line "We'll also start sending The Billionaire Brief once you confirm."
  goes on that screen.
- Choice made in signup mode, then "Continue with Google" turns out to be an existing Google account: the person
  ticked the box, so that account is opted in. If the Google trip is cancelled the choice is dropped and the box is
  unticked again when the dialog reopens (it never ticks itself).
- With only Google sign-in switched on (no password form), the checkbox still shows, above the Google button.

## Part C. On/off switch on the Account page

**Where** (mock-up C): a new section "The Billionaire Brief" between Nickname and Log out.

- A real on/off switch (keyboard and screen-reader friendly), plus one line of status:
  - **Off:** "You're not getting the Brief."
  - **On:** "Sending to name@example.com."
  - **Waiting:** "On. We'll start sending once your email is confirmed."
- Turning it off works at once and is the same as the Unsubscribe link in any Brief. Turning it back on is allowed
  from the Account page because the person is signed in to that address.
- Guests (no account) see nothing here; the Account page already sends them to Create free account.
- The section stays hidden until the database update (0009) is in place, as well as while the switch is off.
- Flipping the switch updates the section in place, so keyboard focus stays on the switch.

## Part D. The database change (new file `supabase/migrations/0009_brief_accounts.sql`)

One list, not two: an account's choice is stored on that person's `waitlist` row (created if they do not have one).
That keeps one unsubscribe link, one recipient list, and account deletion already removes it.

- `set_my_brief(p_on boolean)`: signed-in, non-guest users only. On: create the row if missing (account email,
  new referral code, source "account"), set opted in, clear unsubscribed. Off: set unsubscribed.
- `my_account()` gains `brief: { status: off | on | waiting, email }`.
- `waitlist_brief_recipients()` also counts a row as confirmed when the linked account's email is confirmed and is the
  same address (so account holders do not need a second confirmation email).
- Side effect to accept: an account holder who opts in also gets a place in the Season 1 line, like any front-page
  signup. Harmless; the line card disappears from the email after 9 Nov.
- Safe to run twice, like 0005-0008; applied by the daily Game sync as usual.

## Part E. The switch

A new public switch in `config/launch.json`: `"briefSignup": false`. While false: no checkbox in the dialog, no
section on the Account page, no Brief box in Save your team, and nothing new is called in the database. Merging the
build changes nothing a visitor can see. The owner turns it on after the switch-on checklist.

## Decisions for the owner

1. **Email confirmation for email + password accounts.** Today Supabase's "Confirm email" is OFF
   (`docs/OWNER-SETUP.md` 3c). With it off, Supabase marks every new address as confirmed without checking, so
   anyone could put someone else's address on the Brief. **Required before the switch goes on:** turn "Confirm
   email" ON (the dialog already has the "check your email" screen). Google sign-ups are already checked by Google.
   Alternative: the Brief sends its own "confirm you want this" email first (more to build).
2. **How often the Brief goes out.** The sender has no schedule. **Recommended:** start by hand a few mornings a
   week, keep sign-up wording free of a promise ("free", not "daily"), decide the schedule after the first sends.
3. **Approve the look in mock-up A**, or ask for changes before building.
4. **Checkbox position in the dialog.** **Recommended:** above "Continue with Google" (see Part B). Alternative: as
   in mock-up B, below the password field.

## Out of scope (possible later)

- Painted portraits in the email (needs .png copies). Top-10 fortunes strip. "Coming up" calendar items (they have no
  source links in the edition, so they would break the "every fact links its source" rule as they stand).
- Click tracking beyond the existing utm tags.

## Build steps (after approval)

1. Branch from `origin/main`; claim in `docs/STATUS.md`.
2. `scripts/lib/brief.mjs`: new template (Part A); tests updated (unsubscribe link, no raw prices, escaping,
   colour-scheme tags, spot card hidden after season start).
3. `supabase/migrations/0009_brief_accounts.sql` + SQL tests (guest refused; on creates row; waiting vs on;
   off = unsubscribed; recipients include confirmed account opt-ins only).
4. `assets/v2/auth.js` + `auth.css`: checkbox, the Google round-trip (the choice rides along in the sign-in record
   the dialog already keeps for that trip), both notices and the confirm screen (Part B).
   `assets/game-client.js`: one small wrapper for the new `set_my_brief` call.
5. `assets/v2/account-page.js` + its CSS: the switch (Part C).
6. `config/launch.json`: `briefSignup: false`; `assets/waitlist.js` respects it.
7. `docs/BRIEF-SWITCH-ON.md`: owner checklist (Resend account and domain, Supabase SMTP + "Confirm email", GitHub
   secrets `RESEND_API_KEY` and `BRIEF_FROM` by name, flipping the switches, first dry run and send).
8. Tests: `node --test scripts/lib/*.test.mjs scripts/lib/**/*.test.mjs`. Local preview at 390 px, both themes,
   keyboard focus, reduced motion. Pull request; owner merges.

## Cost

- Resend free plan: $0 for up to 100 emails a day and 3,000 a month (confirmation emails count too). Pro: $20 a month
  for 50,000 a month with no daily cap. Checked on resend.com/pricing on 2026-10-15.
- Supabase and GitHub: no change.
