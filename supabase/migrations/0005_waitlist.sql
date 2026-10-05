-- Billionaires Digest: Season 1 waitlist (needs 0001 first: citext, new_invite_code(), name_blocklist, name_squash()).
--
-- Free to play. No payments, prizes or betting here: this is an email list with a place in line.
--
-- What is here
--   waitlist                  one row per signup (email, referral code, captain pick, confirmed / unsubscribed)
--   waitlist_leagues          one reserved league per confirmed signup, joined by invite code
--   waitlist_league_members   who is in which reserved league (max 50 per league)
--   events                    our own simple tracking (no third-party trackers)
--
-- Nobody reads or writes these tables directly from the browser: RLS is on, anon/authenticated have no table
-- privileges, and everything goes through the functions below (SECURITY DEFINER, fixed search_path).
--
-- Place in line: rank among confirmed signups by (signup order - REF_BOOST x confirmed referrals); on a tie, more confirmed
-- referrals first, then earlier signup (so one confirmed friend moves you up exactly REF_BOOST spots).
-- REF_BOOST lives in ONE function, waitlist_ref_boost(), so the owner can change it in one place.
--
-- Safe to run more than once, like 0001-0004. It never deletes signup data.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0005_waitlist.sql

create schema if not exists extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Settings and small helpers
-- ---------------------------------------------------------------------------
-- Each confirmed friend moves you up this many spots.
create or replace function public.waitlist_ref_boost() returns int
language sql immutable as $$ select 10 $$;

-- Signup source (utm tags etc.): keep only known keys, string values, at most 100 characters each.
create or replace function public.waitlist_clean_source(p jsonb) returns jsonb
language sql immutable set search_path = public, extensions, pg_temp as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else (
    select nullif(coalesce(jsonb_object_agg(k, left(v, 100)), '{}'::jsonb), '{}'::jsonb)
    from (
      select e.key as k, e.value #>> '{}' as v
      from jsonb_each(p) e
      where e.key in ('utm_source', 'utm_medium', 'utm_campaign', 'ref', 'page')
        and jsonb_typeof(e.value) in ('string', 'number')
    ) x
  ) end
$$;

-- Same shape test, used by the table check.
create or replace function public.waitlist_source_ok(p jsonb) returns boolean
language sql immutable set search_path = public, extensions, pg_temp as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and (select count(*) from jsonb_object_keys(p)) <= 5
    and not exists (select 1 from jsonb_each(p) e where jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 100)
  )
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email extensions.citext not null unique check (length(email) between 3 and 254),
  referral_code text not null unique check (referral_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  referred_by uuid references public.waitlist(id) on delete set null,
  captain_pick text check (captain_pick is null or captain_pick ~ '^[a-z0-9-]{2,80}$'),
  source jsonb check (public.waitlist_source_ok(source)),
  pending_league_code text check (pending_league_code is null or pending_league_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  unsub_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists waitlist_referred_by_idx on public.waitlist(referred_by);
create index if not exists waitlist_confirmed_idx on public.waitlist(confirmed_at) where confirmed_at is not null;

create table if not exists public.waitlist_leagues (
  id uuid primary key default gen_random_uuid(),
  name extensions.citext not null unique
    check (length(name) between 3 and 30 and name::text ~ '^[A-Za-z0-9 _''-]+$'),
  owner_id uuid not null unique references public.waitlist(id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.waitlist_league_members (
  league_id uuid not null references public.waitlist_leagues(id) on delete cascade,
  waitlist_id uuid not null references public.waitlist(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (league_id, waitlist_id)
);
create index if not exists waitlist_league_members_member_idx on public.waitlist_league_members(waitlist_id);

create table if not exists public.events (
  id bigserial primary key,
  user_id uuid,
  name text not null check (name in ('waitlist_signup', 'referral_signup', 'captain_picked', 'league_reserved',
    'league_joined', 'invite_copied', 'share_clicked', 'brief_sent', 'brief_clicked')),
  props jsonb not null default '{}'::jsonb check (octet_length(props::text) <= 2048),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists events_name_time_idx on public.events(name, created_at);
create index if not exists events_user_name_time_idx on public.events(user_id, name, created_at);

-- ---------------------------------------------------------------------------
-- Row level security: on, with deny-all policies for the API roles. Access is through the functions only.
-- ---------------------------------------------------------------------------
alter table public.waitlist enable row level security;
alter table public.waitlist_leagues enable row level security;
alter table public.waitlist_league_members enable row level security;
alter table public.events enable row level security;

drop policy if exists waitlist_no_direct on public.waitlist;
create policy waitlist_no_direct on public.waitlist for all to anon, authenticated using (false) with check (false);
drop policy if exists waitlist_leagues_no_direct on public.waitlist_leagues;
create policy waitlist_leagues_no_direct on public.waitlist_leagues for all to anon, authenticated using (false) with check (false);
drop policy if exists waitlist_members_no_direct on public.waitlist_league_members;
create policy waitlist_members_no_direct on public.waitlist_league_members for all to anon, authenticated using (false) with check (false);
drop policy if exists events_no_direct on public.events;
create policy events_no_direct on public.events for all to anon, authenticated using (false) with check (false);

-- Explicit privileges, whether or not the project auto-exposes new tables.
revoke all on public.waitlist, public.waitlist_leagues, public.waitlist_league_members, public.events
  from public, anon, authenticated;
revoke all on sequence public.events_id_seq from public, anon, authenticated;
-- the Brief sender and metrics script (service role) only read; they write through the admin functions
grant select on public.waitlist, public.waitlist_leagues, public.waitlist_league_members, public.events to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the API)
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_log(p_user uuid, p_name text, p_props jsonb) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.events (user_id, name, props)
  values (p_user, p_name, case when p_props is null or jsonb_typeof(p_props) <> 'object' or octet_length(p_props::text) > 2048
                               then '{}'::jsonb else p_props end)
$$;

-- Place in line for every confirmed signup.
create or replace function public.waitlist_positions()
returns table (waitlist_id uuid, line_position bigint, referrals_confirmed bigint)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with c as (
    select w.id, w.created_at,
           row_number() over (order by w.created_at, w.id) as created_seq,
           (select count(*) from public.waitlist r where r.referred_by = w.id and r.confirmed_at is not null) as refs
    from public.waitlist w
    where w.confirmed_at is not null
  )
  select c.id,
         row_number() over (order by c.created_seq - public.waitlist_ref_boost() * c.refs, c.refs desc, c.created_at, c.id),
         c.refs
  from c
$$;

create or replace function public.waitlist_norm_code(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')) $$;

-- Join a league as a waitlist member. Returns 'joined', 'already', 'full' or 'unknown'.
create or replace function public.waitlist_do_join(p_member uuid, p_user uuid, p_code text) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  l public.waitlist_leagues%rowtype;
begin
  select * into l from public.waitlist_leagues where invite_code = public.waitlist_norm_code(p_code) for update;
  if not found then return 'unknown'; end if;
  if exists (select 1 from public.waitlist_league_members m where m.league_id = l.id and m.waitlist_id = p_member) then
    return 'already';
  end if;
  if (select count(*) from public.waitlist_league_members m where m.league_id = l.id) >= 50 then
    return 'full';
  end if;
  insert into public.waitlist_league_members (league_id, waitlist_id) values (l.id, p_member);
  perform public.waitlist_log(p_user, 'league_joined', jsonb_build_object('league', l.name::text));
  return 'joined';
end $$;

-- ---------------------------------------------------------------------------
-- Player functions
-- ---------------------------------------------------------------------------
-- {email, referral_code, confirmed, position, total, referrals_confirmed, captain_pick,
--  league:{name, invite_code, members}|null, joined_leagues:[names]}; null when the caller has not joined.
create or replace function public.waitlist_me() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  w public.waitlist%rowtype;
  pos bigint;
  refs bigint;
  lg jsonb;
begin
  if uid is null then return null; end if;
  select * into w from public.waitlist where user_id = uid;
  if not found then return null; end if;
  select p.line_position into pos from public.waitlist_positions() p where p.waitlist_id = w.id;
  select count(*) into refs from public.waitlist r where r.referred_by = w.id and r.confirmed_at is not null;
  select jsonb_build_object('name', l.name::text, 'invite_code', l.invite_code,
           'members', (select count(*) from public.waitlist_league_members m where m.league_id = l.id))
    into lg from public.waitlist_leagues l where l.owner_id = w.id;
  return jsonb_build_object(
    'email', w.email::text,
    'referral_code', w.referral_code,
    'confirmed', w.confirmed_at is not null,
    'position', pos,
    'total', (select count(*) from public.waitlist x where x.confirmed_at is not null),
    'referrals_confirmed', refs,
    'captain_pick', w.captain_pick,
    'league', lg,
    'joined_leagues', coalesce((
      select jsonb_agg(l.name::text order by m.joined_at)
      from public.waitlist_league_members m join public.waitlist_leagues l on l.id = m.league_id
      where m.waitlist_id = w.id and l.owner_id <> w.id), '[]'::jsonb)
  );
end $$;

-- Sign up (or update a pending signup). Needs a session; an anonymous one is fine.
-- Errors: 'email_taken' when another user has CONFIRMED this email (the page then offers a sign-in link).
create or replace function public.waitlist_join(p_email text, p_ref text, p_league text, p_source jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  e text := lower(btrim(coalesce(p_email, '')));
  w public.waitlist%rowtype;
  ref_id uuid;
  lcode text;
  code text;
  tries int := 0;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if length(e) < 3 or length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s.]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  -- The email is taken only by ANOTHER user's CONFIRMED signup. Another user's unconfirmed signup with this email is
  -- released (deleted, nothing logged), so nobody can squat an address they cannot confirm.
  if exists (select 1 from public.waitlist x where x.email = e::extensions.citext and x.user_id is distinct from uid
             and x.confirmed_at is not null) then
    raise exception 'email_taken';
  end if;
  delete from public.waitlist x where x.email = e::extensions.citext and x.user_id is distinct from uid and x.confirmed_at is null;
  -- invite code of a reserved league, remembered until the email is confirmed (unknown codes are ignored)
  select l.invite_code into lcode from public.waitlist_leagues l where l.invite_code = public.waitlist_norm_code(p_league);

  select * into w from public.waitlist where user_id = uid for update;
  if found then
    if w.confirmed_at is null then
      update public.waitlist set email = e, pending_league_code = coalesce(lcode, pending_league_code)
      where id = w.id;
    elsif lcode is not null then
      perform public.waitlist_do_join(w.id, uid, lcode);
    end if;
    return jsonb_build_object('referral_code', w.referral_code, 'confirmed', w.confirmed_at is not null);
  end if;

  -- referrer: a known code that is not the caller's own (the caller has no row yet, so it cannot be)
  select x.id into ref_id from public.waitlist x where x.referral_code = public.waitlist_norm_code(p_ref);

  loop
    tries := tries + 1;
    code := public.new_invite_code();
    begin
      insert into public.waitlist (user_id, email, referral_code, referred_by, source, pending_league_code)
      values (uid, e, code, ref_id, public.waitlist_clean_source(p_source), lcode)
      returning * into w;
      exit;
    exception when unique_violation then
      -- same rule as above if another signup took this email meanwhile
      if exists (select 1 from public.waitlist x where x.email = e::extensions.citext and x.confirmed_at is not null) then
        raise exception 'email_taken';
      end if;
      delete from public.waitlist x where x.email = e::extensions.citext and x.user_id is distinct from uid and x.confirmed_at is null;
      if tries >= 10 then raise exception 'Could not make a referral code. Please try again.'; end if;
    end;
  end loop;
  perform public.waitlist_log(uid, 'waitlist_signup', coalesce(public.waitlist_clean_source(p_source), '{}'::jsonb));
  if ref_id is not null then
    perform public.waitlist_log(uid, 'referral_signup', jsonb_build_object('referrer', ref_id));
  end if;
  return jsonb_build_object('referral_code', w.referral_code, 'confirmed', false);
end $$;

-- Mark the caller's signup confirmed once Supabase Auth has confirmed the same email address.
create or replace function public.waitlist_confirm() returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  w public.waitlist%rowtype;
  au_email text;
  au_confirmed timestamptz;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  select * into w from public.waitlist where user_id = uid for update;
  if not found then raise exception 'Join the waitlist first.'; end if;
  select u.email, u.email_confirmed_at into au_email, au_confirmed from auth.users u where u.id = uid;
  if au_email is null or au_confirmed is null or lower(au_email) <> lower(w.email::text) then
    raise exception 'not_confirmed';
  end if;
  if w.confirmed_at is null then
    update public.waitlist set confirmed_at = now() where id = w.id;
  end if;
  if w.pending_league_code is not null then
    perform public.waitlist_do_join(w.id, uid, w.pending_league_code);
    update public.waitlist set pending_league_code = null where id = w.id;
  end if;
  return public.waitlist_me();
end $$;

-- confirmed signup row of the caller, locked; raises otherwise
create or replace function public.waitlist_require_confirmed(p_user uuid) returns public.waitlist
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  w public.waitlist%rowtype;
begin
  if p_user is null then raise exception 'Please sign in first.'; end if;
  select * into w from public.waitlist where user_id = p_user for update;
  if not found or w.confirmed_at is null then raise exception 'Confirm your email first.'; end if;
  return w;
end $$;

create or replace function public.waitlist_pick_captain(p_slug text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  w public.waitlist%rowtype;
  s text := lower(btrim(coalesce(p_slug, '')));
begin
  w := public.waitlist_require_confirmed(uid);
  if s !~ '^[a-z0-9-]{2,80}$' then raise exception 'Unknown captain.'; end if;
  update public.waitlist set captain_pick = s where id = w.id;
  if w.captain_pick is null then
    perform public.waitlist_log(uid, 'captain_picked', jsonb_build_object('slug', s));
  end if;
  return jsonb_build_object('captain_pick', s);
end $$;

create or replace function public.waitlist_reserve_league(p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  w public.waitlist%rowtype;
  n text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  squashed text;
  parts text[];
  l public.waitlist_leagues%rowtype;
  code text;
  tries int := 0;
begin
  w := public.waitlist_require_confirmed(uid);
  select * into l from public.waitlist_leagues where owner_id = w.id;
  if found then
    if l.name = n::extensions.citext then return jsonb_build_object('name', l.name::text, 'invite_code', l.invite_code); end if;
    raise exception 'You already reserved a league.';
  end if;
  if length(n) < 3 or length(n) > 30 then raise exception 'League name: use 3 to 30 characters.'; end if;
  if n !~ '^[A-Za-z0-9 _''-]+$' then raise exception 'League name: use only letters, numbers, spaces, _ - and ''.'; end if;
  -- same blocklist as nicknames and game leagues (0001)
  squashed := public.name_squash(regexp_replace(n, '[ '']', '', 'g'));
  parts := array(select public.name_squash(p) from unnest(regexp_split_to_array(n, '[ _''-]+')) p where p <> '');
  if exists (
    select 1 from public.name_blocklist b
    where (not b.whole_word and position(b.term in squashed) > 0)
       or (b.whole_word and (b.term = any(parts) or b.term = squashed))
  ) then
    raise exception 'That name is not allowed. Please pick another.';
  end if;
  if exists (select 1 from public.waitlist_leagues x where x.name = n::extensions.citext) then
    raise exception 'That league name is taken.';
  end if;
  loop
    tries := tries + 1;
    code := public.new_invite_code();
    begin
      insert into public.waitlist_leagues (name, owner_id, invite_code) values (n, w.id, code) returning * into l;
      exit;
    exception when unique_violation then
      if exists (select 1 from public.waitlist_leagues x where x.name = n::extensions.citext) then raise exception 'That league name is taken.'; end if;
      if exists (select 1 from public.waitlist_leagues x where x.owner_id = w.id) then raise exception 'You already reserved a league.'; end if;
      if tries >= 10 then raise exception 'Could not make an invite code. Please try again.'; end if;
    end;
  end loop;
  insert into public.waitlist_league_members (league_id, waitlist_id) values (l.id, w.id);
  perform public.waitlist_log(uid, 'league_reserved', jsonb_build_object('league', l.name::text));
  return jsonb_build_object('name', l.name::text, 'invite_code', l.invite_code);
end $$;

create or replace function public.waitlist_join_league(p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  w public.waitlist%rowtype;
  r text;
  nm text;
begin
  w := public.waitlist_require_confirmed(uid);
  r := public.waitlist_do_join(w.id, uid, p_code);
  if r = 'unknown' then raise exception 'No league has that code. Check it and try again.'; end if;
  if r = 'full' then raise exception 'That league is full (50 players).'; end if;
  select l.name::text into nm from public.waitlist_leagues l where l.invite_code = public.waitlist_norm_code(p_code);
  return jsonb_build_object('name', nm, 'already', r = 'already');
end $$;

-- ---------------------------------------------------------------------------
-- Public functions (no sign-in needed)
-- ---------------------------------------------------------------------------
-- {name, members} for an invite code, or null. Never emails or owner identity.
create or replace function public.waitlist_league_info(p_code text) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object('name', l.name::text,
           'members', (select count(*) from public.waitlist_league_members m where m.league_id = l.id))
  from public.waitlist_leagues l where l.invite_code = public.waitlist_norm_code(p_code)
$$;

-- {total_confirmed, captains:[{slug, count, pct}] top 10 | null until at least 20 picks}
create or replace function public.waitlist_stats() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  picks bigint;
begin
  select count(*) into picks from public.waitlist where confirmed_at is not null and captain_pick is not null;
  return jsonb_build_object(
    'total_confirmed', (select count(*) from public.waitlist where confirmed_at is not null),
    'captains', case when picks < 20 then null else (
      select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'count', n, 'pct', round(100.0 * n / picks, 1)) order by n desc, slug), '[]'::jsonb)
      from (
        select captain_pick as slug, count(*) as n from public.waitlist
        where confirmed_at is not null and captain_pick is not null
        group by captain_pick order by count(*) desc, captain_pick limit 10
      ) t) end
  );
end $$;

-- true when the token matches (already unsubscribed counts as success)
create or replace function public.waitlist_unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_token is null then return false; end if;
  update public.waitlist set unsubscribed_at = coalesce(unsubscribed_at, now()) where unsub_token = p_token;
  return found;
end $$;

-- Browser events: only invite_copied and share_clicked. Repeats of the same event by the same user within
-- 10 seconds are ignored (visitors without a session share one 10-second limit per event). Returns true when logged.
create or replace function public.log_event(p_name text, p_props jsonb) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
begin
  if p_name is null or p_name not in ('invite_copied', 'share_clicked') then raise exception 'Unknown event.'; end if;
  if exists (
    select 1 from public.events ev
    where ev.name = p_name and ev.user_id is not distinct from uid and ev.created_at > now() - interval '10 seconds'
  ) then
    return false;
  end if;
  perform public.waitlist_log(uid, p_name, p_props);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Service role only
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_admin_metrics(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 366);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  n_confirmed bigint;
begin
  select count(*) into n_confirmed from public.waitlist where confirmed_at is not null;
  return jsonb_build_object(
    'days', d,
    'since', since,
    'events_per_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'name', name, 'count', n) order by day, name)
      from (select (created_at at time zone 'America/New_York')::date as day, name, count(*) as n
            from public.events where created_at >= since group by 1, 2) t), '[]'::jsonb),
    'signups', (select count(*) from public.waitlist),
    'confirmed', n_confirmed,
    'captain_pct', case when n_confirmed = 0 then null else round(100.0 *
      (select count(*) from public.waitlist where confirmed_at is not null and captain_pick is not null) / n_confirmed, 1) end,
    'leagues_reserved', (select count(*) from public.waitlist_leagues),
    'league_members', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name::text, 'members',
               (select count(*) from public.waitlist_league_members m where m.league_id = l.id)) order by l.created_at)
      from public.waitlist_leagues l), '[]'::jsonb),
    'referral_share_pct', case when n_confirmed = 0 then null else round(100.0 * (
      select count(*) from public.waitlist w where w.confirmed_at is not null
        and exists (select 1 from public.waitlist r where r.referred_by = w.id and r.confirmed_at is not null)) / n_confirmed, 1) end,
    'unsubscribes', (select count(*) from public.waitlist where unsubscribed_at is not null)
  );
end $$;

-- Brief recipients: confirmed and not unsubscribed, with their place in line.
create or replace function public.waitlist_brief_recipients() returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', w.email::text, 'unsub_token', w.unsub_token,
           'position', p.line_position, 'referral_code', w.referral_code) order by p.line_position), '[]'::jsonb)
  from public.waitlist w join public.waitlist_positions() p on p.waitlist_id = w.id
  where w.confirmed_at is not null and w.unsubscribed_at is null
$$;

-- Server-side events (the Brief sender): only brief_sent / brief_clicked.
create or replace function public.waitlist_admin_log(p_name text, p_props jsonb) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_name is null or p_name not in ('brief_sent', 'brief_clicked') then raise exception 'Unknown event.'; end if;
  perform public.waitlist_log(null, p_name, p_props);
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase grants EXECUTE on new functions to everyone by default, so reset it.
-- ---------------------------------------------------------------------------
revoke execute on function public.waitlist_ref_boost(), public.waitlist_clean_source(jsonb), public.waitlist_source_ok(jsonb),
  public.waitlist_log(uuid, text, jsonb), public.waitlist_positions(), public.waitlist_norm_code(text),
  public.waitlist_do_join(uuid, uuid, text), public.waitlist_me(), public.waitlist_join(text, text, text, jsonb),
  public.waitlist_confirm(), public.waitlist_require_confirmed(uuid), public.waitlist_pick_captain(text),
  public.waitlist_reserve_league(text), public.waitlist_join_league(text), public.waitlist_league_info(text),
  public.waitlist_stats(), public.waitlist_unsubscribe(uuid), public.log_event(text, jsonb),
  public.waitlist_admin_metrics(int), public.waitlist_brief_recipients(), public.waitlist_admin_log(text, jsonb)
  from public, anon, authenticated;

-- browser (visitors with or without a session)
grant execute on function public.waitlist_me(), public.waitlist_join(text, text, text, jsonb), public.waitlist_confirm(),
  public.waitlist_pick_captain(text), public.waitlist_reserve_league(text), public.waitlist_join_league(text),
  public.waitlist_league_info(text), public.waitlist_stats(), public.waitlist_unsubscribe(uuid), public.log_event(text, jsonb)
  to anon, authenticated;
-- service role (Brief sender, metrics script)
grant execute on function public.waitlist_admin_metrics(int), public.waitlist_brief_recipients(),
  public.waitlist_admin_log(text, jsonb)
  to service_role;
