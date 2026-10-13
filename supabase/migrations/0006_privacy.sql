-- Billionaires Digest: privacy and nickname fixes on top of 0001 (needs 0001 first).
--
-- 1. profiles: visitors and players can no longer read other players' rows (user id <-> nickname <-> coins).
--    A signed-in player reads only their own row; everyone else's appears only through the leaderboard functions
--    (leaderboard_week, leaderboard_season, coin_leaderboard, league_standings, book_leaderboard), which show
--    nickname and points/coins but never user ids. Nothing in the site or the sync job reads the table directly
--    (the sync job uses the service role, which keeps its own select grant from 0001).
-- 2. Nicknames: the first pick is free; after that a player may change it at most once every 7 days.
-- 3. settle_week: the captain's 1.5x is rounded per day (halves away from zero, like the site's roundPts), so the
--    server's weekly totals match what players see.
--
-- 0001 is re-applied every day before this file and re-opens what this file closes, so the Game sync workflow applies
-- all migrations in ONE transaction: nobody ever sees the in-between state.
-- Safe to run more than once. Never deletes data.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0006_privacy.sql

-- ---------------------------------------------------------------------------
-- 1. profiles: own row only
-- ---------------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
revoke select on public.profiles from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Nickname changes: at most once every 7 days after the first pick
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists nickname_changed_at timestamptz;

-- Pick or change a nickname. Creates the profile the first time (1000 coins). Saving the same nickname again is a no-op.
-- A change is refused until 7 days after the last change (or after the profile was created, for the first change).
create or replace function public.set_nickname(p_nickname text) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  problem text;
  n text := btrim(p_nickname);
  p public.profiles%rowtype;
  has_profile boolean;
  next_at timestamptz;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  problem := public.name_problem(n);
  if problem is not null then raise exception '%', problem; end if;
  select * into p from public.profiles where id = uid for update;
  has_profile := found;
  if has_profile then
    if p.nickname::text = n then return json_build_object('nickname', n); end if;
    next_at := coalesce(p.nickname_changed_at, p.created_at) + interval '7 days';
    if public.game_now() < next_at then
      raise exception 'You can change your nickname once every 7 days. Next change: %.',
        to_char(next_at at time zone 'America/New_York', 'FMMonth FMDD');
    end if;
  end if;
  if exists (select 1 from public.profiles where nickname = n::extensions.citext and id <> uid) then
    raise exception 'That nickname is taken.';
  end if;
  if has_profile then
    update public.profiles set nickname = n, nickname_changed_at = public.game_now() where id = uid;
  else
    insert into public.profiles (id, nickname, created_at) values (uid, n, public.game_now()) on conflict (id) do nothing;
  end if;
  return json_build_object('nickname', n);
exception when unique_violation then
  raise exception 'That nickname is taken.';
end $$;

-- create or replace keeps 0001's grants; restated here so this file stands on its own.
revoke execute on function public.set_nickname(text) from public, anon, authenticated;
grant execute on function public.set_nickname(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. settle_week: captain points rounded per day (same signature and grants as 0001)
-- ---------------------------------------------------------------------------
create or replace function public.settle_week(p_week text, p_final boolean default false) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  w public.fantasy_weeks%rowtype;
  n int;
begin
  select * into w from public.fantasy_weeks where week = p_week for update;
  if not found then raise exception 'unknown week %', p_week; end if;
  delete from public.team_scores where week = p_week;
  insert into public.team_scores (user_id, week, points, days, computed_at)
  select r.user_id, r.week,
         coalesce(sum(case when pp.slug = r.captain then round(pp.points * 1.5) else pp.points end), 0),
         count(distinct pp.date),
         now()
  from public.rosters r
  left join public.person_points pp
    on pp.slug = any(r.picks)
   and pp.date between w.start and w."end"
   and (r.created_at < w.locks_at or pp.date > (r.created_at at time zone 'America/New_York')::date)
  where r.week = p_week
  group by r.user_id, r.week;
  get diagnostics n = row_count;
  if p_final then update public.fantasy_weeks set final = true where week = p_week; end if;
  return n;
end $$;

revoke execute on function public.settle_week(text, boolean) from public, anon, authenticated;
grant execute on function public.settle_week(text, boolean) to service_role;
