-- Billionaires Digest: real user accounts (needs 0001, 0005 and 0006 first).
--
-- Accounts are Supabase Auth users with an email (Google sign-in or email + password). Guests keep playing as
-- anonymous users; when a guest creates an account, Supabase links the email or Google identity to the SAME user id,
-- so their profile, rosters and leagues carry over. Nothing in this file changes how guests play. Guests can ask for
-- deletion too (the app's Delete account button); their data is removed the same way as an account's.
--
-- What is here
--   account_deletion_requests     one row per account that asked to be deleted (user_id, requested_at). RLS on; no
--                                 direct access from the browser.
--   my_account()                  the signed-in user's account summary for account.html: nickname, when the next
--                                 nickname change is allowed (the 7-day rule from 0006), whether a deletion is pending
--   request_account_deletion()    any signed-in user, guests (anonymous users) included, so the app can offer in-app
--                                 deletion. Idempotent: asking twice keeps the first time.
--   pending_account_deletions()   service role: the requests to process (user ids, oldest first)
--   delete_account_data(uuid)     service role: deletes the user's rosters, team scores, league memberships, owned
--                                 leagues (handed to the longest-standing other member first; deleted only when empty),
--                                 bets, positions, trades, waitlist rows, events and profile. Returns counts only.
--                                 Safe to run again. The auth user itself is deleted by scripts/process-deletions.mjs
--                                 through the Supabase admin API, which also removes the request row (on delete cascade).
--
-- Safe to run more than once: IF NOT EXISTS, CREATE OR REPLACE, policies dropped and re-created. Never deletes data by
-- itself; only delete_account_data() does, and only the service role can call it.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0008_accounts.sql

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
drop policy if exists account_deletion_requests_no_direct on public.account_deletion_requests;
create policy account_deletion_requests_no_direct on public.account_deletion_requests
  for all to anon, authenticated using (false) with check (false);
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to service_role;

-- true when the signed-in user is a guest (anonymous sign-in) or not signed in at all
create or replace function public.auth_is_guest() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce((select u.is_anonymous from auth.users u where u.id = auth.uid()), true)
$$;
revoke execute on function public.auth_is_guest() from public, anon, authenticated;

-- The signed-in user's account summary (null fields until a nickname is picked).
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
    'is_anonymous', public.auth_is_guest()
  );
end $$;

-- Ask for the account and its data to be deleted (done by the daily Game sync job, within 24 hours).
create or replace function public.request_account_deletion() returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  req timestamptz;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  insert into public.account_deletion_requests (user_id, requested_at) values (uid, public.game_now())
    on conflict (user_id) do nothing;
  select r.requested_at into req from public.account_deletion_requests r where r.user_id = uid;
  return json_build_object('requested_at', req);
end $$;

-- Service role: requests waiting to be processed.
create or replace function public.pending_account_deletions() returns table (user_id uuid, requested_at timestamptz)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select r.user_id, r.requested_at from public.account_deletion_requests r order by r.requested_at, r.user_id
$$;

-- Service role: delete everything we keep about one user except the auth user itself. Returns counts only.
create or replace function public.delete_account_data(p_user uuid) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  n_rosters int := 0; n_scores int := 0; n_members int := 0; n_moved int := 0; n_leagues int := 0;
  n_bets int := 0; n_positions int := 0; n_trades int := 0; n_waitlist int := 0; n_events int := 0; n_profiles int := 0;
  l record;
  heir uuid;
begin
  if p_user is null then raise exception 'user id required'; end if;
  -- Leagues this user owns: hand each to the longest-standing other member, or delete it when nobody else is in it.
  for l in select id from public.leagues where owner = p_user loop
    select m.user_id into heir from public.league_members m
      where m.league_id = l.id and m.user_id <> p_user order by m.joined_at, m.user_id limit 1;
    if heir is null then
      delete from public.leagues where id = l.id;
      n_leagues := n_leagues + 1;
    else
      update public.leagues set owner = heir where id = l.id;
      n_moved := n_moved + 1;
    end if;
  end loop;
  delete from public.league_members where user_id = p_user; get diagnostics n_members = row_count;
  delete from public.rosters where user_id = p_user; get diagnostics n_rosters = row_count;
  delete from public.team_scores where user_id = p_user; get diagnostics n_scores = row_count;
  delete from public.bets where user_id = p_user; get diagnostics n_bets = row_count;
  delete from public.positions where user_id = p_user; get diagnostics n_positions = row_count;
  delete from public.trades where user_id = p_user; get diagnostics n_trades = row_count;
  delete from public.waitlist where user_id = p_user; get diagnostics n_waitlist = row_count;
  delete from public.events where user_id = p_user; get diagnostics n_events = row_count;
  delete from public.profiles where id = p_user; get diagnostics n_profiles = row_count;
  return json_build_object('rosters', n_rosters, 'team_scores', n_scores, 'league_memberships', n_members,
    'leagues_handed_over', n_moved, 'leagues_deleted', n_leagues, 'bets', n_bets, 'positions', n_positions,
    'trades', n_trades, 'waitlist', n_waitlist, 'events', n_events, 'profiles', n_profiles);
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase grants EXECUTE on new functions to everyone by default, so reset it.
-- ---------------------------------------------------------------------------
revoke execute on function public.my_account(), public.request_account_deletion(), public.pending_account_deletions(),
  public.delete_account_data(uuid)
  from public, anon, authenticated;
grant execute on function public.my_account(), public.request_account_deletion() to authenticated;
grant execute on function public.pending_account_deletions(), public.delete_account_data(uuid) to service_role;
grant execute on function public.auth_is_guest() to service_role;
