-- Billionaires Digest: The Billionaire Brief for account holders (needs 0001, 0005 and 0008 first).
--
-- People with a free account (Google or email + password) can switch the Brief on or off: in the Create free account
-- dialog and on the Account page. The site only shows those controls while config/launch.json "briefSignup" is true.
--
-- One list, not two: an account's choice is stored on that person's waitlist row (0005), created when they first switch
-- it on. So there is still one unsubscribe link, one recipient list, and account deletion (0008) already removes it.
--
-- What is here
--   waitlist_brief_state(uuid)    internal: { status: off | on | waiting, email } for one user (not callable from the API)
--   set_my_brief(p_on boolean)    signed-in, non-guest users only. On: creates the caller's waitlist row if missing
--                                 (email = the account's email, a new referral code from new_invite_code() like
--                                 waitlist_join, source {"utm_source":"account"}), ticks brief_opt_in and clears
--                                 unsubscribed_at. Off: sets unsubscribed_at (the row stays). Never changes the email of
--                                 an existing row. Returns { status, email }.
--   my_account()                  same as 0008 plus "brief": { status, email }
--   waitlist_brief_recipients()   same output as 0005; a row now also counts as confirmed when the linked account has a
--                                 confirmed email that is the same address (so account holders need no second email).
--                                 Rows confirmed only that way have no place in line yet (position null).
--
-- Status: off = no row, not opted in, or unsubscribed. on = opted in, subscribed and confirmed (waitlist.confirmed_at,
-- or the account rule above). waiting = opted in and subscribed, not confirmed yet.
--
-- 0005 and 0008 are re-applied every day before this file and put their versions of my_account() and
-- waitlist_brief_recipients() back, so the Game sync workflow applies all migrations in ONE transaction, in file order:
-- this file always wins and nobody sees the in-between state. Each sensitive function has its EXECUTE revoked right
-- after it is created.
-- Safe to run more than once: CREATE OR REPLACE only, no table changes. Never deletes data.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0009_brief_accounts.sql

-- ---------------------------------------------------------------------------
-- Internal: the Brief status of one user
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_brief_state(p_user uuid) returns json
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  w public.waitlist%rowtype;
  au_email text;
  au_confirmed timestamptz;
begin
  select u.email, u.email_confirmed_at into au_email, au_confirmed from auth.users u where u.id = p_user;
  select * into w from public.waitlist where user_id = p_user;
  if not found then
    return json_build_object('status', 'off', 'email', au_email);
  end if;
  return json_build_object(
    'status', case
      when not w.brief_opt_in or w.unsubscribed_at is not null then 'off'
      when w.confirmed_at is not null
        or (au_confirmed is not null and au_email is not null and lower(au_email) = lower(w.email::text)) then 'on'
      else 'waiting' end,
    'email', w.email::text);
end $$;
revoke execute on function public.waitlist_brief_state(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Switch the Brief on or off for the signed-in account
-- ---------------------------------------------------------------------------
-- Errors (exact messages):
--   'Please sign in first.'                    no session
--   'Create a free account first.'             a guest (anonymous sign-in)
--   'Your account has no email address.'       an account without an email (switching on only)
--   'email_taken' / 'email_pending'            another signup already holds this mailbox, same rules as waitlist_join
create or replace function public.set_my_brief(p_on boolean) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  w public.waitlist%rowtype;
  other public.waitlist%rowtype;
  e text;
  en text;
  code text;
  tries int := 0;
  has_row boolean;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if public.auth_is_guest() then raise exception 'Create a free account first.'; end if;
  select * into w from public.waitlist where user_id = uid for update;
  has_row := found;

  if not coalesce(p_on, false) then
    if has_row then
      update public.waitlist set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = w.id;
    end if;
    return public.waitlist_brief_state(uid);
  end if;

  if has_row then
    -- an existing row (front-page signup or an earlier switch-on): keep its email, opt in, resubscribe
    update public.waitlist set brief_opt_in = true, unsubscribed_at = null where id = w.id;
    return public.waitlist_brief_state(uid);
  end if;

  select lower(btrim(coalesce(u.email, ''))) into e from auth.users u where u.id = uid;
  if e is null or length(e) < 3 or length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s.]+$' then
    raise exception 'Your account has no email address.';
  end if;
  en := public.waitlist_email_norm(e);
  -- same mailbox rules as waitlist_join: a confirmed signup elsewhere wins; an unconfirmed one is released after 24 hours
  select * into other from public.waitlist x where x.email_norm = en and x.user_id is distinct from uid for update;
  if found then
    if other.confirmed_at is not null then raise exception 'email_taken'; end if;
    if other.created_at > now() - interval '24 hours' then raise exception 'email_pending'; end if;
    delete from public.waitlist x where x.id = other.id;
  end if;

  loop
    tries := tries + 1;
    code := public.new_invite_code();
    begin
      insert into public.waitlist (user_id, email, email_norm, referral_code, source, brief_opt_in)
      values (uid, e, en, code, public.waitlist_clean_source('{"utm_source":"account"}'::jsonb), true);
      exit;
    exception when unique_violation then
      -- a row for this user or this mailbox appeared meanwhile
      if exists (select 1 from public.waitlist x where x.user_id = uid) then
        update public.waitlist set brief_opt_in = true, unsubscribed_at = null where user_id = uid;
        exit;
      end if;
      select * into other from public.waitlist x where x.email_norm = en and x.user_id is distinct from uid;
      if found then
        if other.confirmed_at is not null then raise exception 'email_taken'; end if;
        raise exception 'email_pending';
      end if;
      if tries >= 10 then raise exception 'Could not make a referral code. Please try again.'; end if;
    end;
  end loop;
  return public.waitlist_brief_state(uid);
end $$;
revoke execute on function public.set_my_brief(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- my_account(): 0008's summary plus the Brief status
-- ---------------------------------------------------------------------------
create or replace function public.my_account() returns json
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  next_at timestamptz;
  req timestamptz;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  select * into p from public.profiles where id = uid;
  if found then
    next_at := coalesce(p.nickname_changed_at, p.created_at) + interval '7 days';
    if next_at <= public.game_now() then next_at := null; end if;
  end if;
  select r.requested_at into req from public.account_deletion_requests r where r.user_id = uid;
  return json_build_object(
    'nickname', case when p.id is null then null else p.nickname::text end,
    'next_nickname_change_at', next_at,
    'deletion_requested_at', req,
    'is_anonymous', public.auth_is_guest(),
    'brief', public.waitlist_brief_state(uid)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Brief recipients (service role): 0005's rule, plus rows confirmed through the linked account's email
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_brief_recipients() returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', w.email::text, 'unsub_token', w.unsub_token,
           'position', p.line_position, 'referral_code', w.referral_code)
           order by p.line_position nulls last, w.created_at, w.id), '[]'::jsonb)
  from public.waitlist w
  left join public.waitlist_positions() p on p.waitlist_id = w.id
  left join auth.users u on u.id = w.user_id
  where w.brief_opt_in and w.unsubscribed_at is null
    and (w.confirmed_at is not null
         or (u.email_confirmed_at is not null and u.email is not null and lower(u.email) = lower(w.email::text)))
$$;
revoke execute on function public.waitlist_brief_recipients() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase grants EXECUTE on new functions to everyone by default, so reset it.
-- ---------------------------------------------------------------------------
revoke execute on function public.waitlist_brief_state(uuid), public.set_my_brief(boolean), public.my_account(),
  public.waitlist_brief_recipients()
  from public, anon, authenticated;
grant execute on function public.set_my_brief(boolean), public.my_account() to authenticated;
grant execute on function public.waitlist_brief_recipients() to service_role;
