-- Billionaires Digest: Season 1 reset for the fantasy leaderboards (needs 0001 first).
--
-- The site promises: preseason weeks don't count; everyone's scores, records and streaks reset when Season 1 starts on
-- Monday, Nov 9, 2026 (ISO week 2026-W46, New York time). config/launch.json "seasonStart" and
-- assets/fantasy-core.js SEASON_START_WEEK say the same; season_start_week() below is the database copy.
--
--   season_start_week()     '2026-W46', the first week of Season 1 (immutable)
--   week_counts_now(week)   true when a week counts in the running totals right now (game_now()):
--                             before Season 1 starts: the preseason weeks (< 2026-W46), so the board shows the preseason
--                             from Season 1 on:        only Season 1 weeks (>= 2026-W46), so everyone starts at zero
--   leaderboard_season()    sums only weeks where week_counts_now() (same signature, columns and grants as 0001)
--   league_standings()      season_points sums only those weeks too (same signature, columns and grants as 0001);
--                           week_points (one week) is unchanged
--
-- Nothing is deleted: team_scores keeps every preseason week, and leaderboard_week('2026-W44') still shows one.
-- The Book (book_* functions) is not touched.
--
-- 0001 is re-applied every day before this file and puts the all-weeks versions back, so the Game sync workflow
-- applies all migrations in ONE transaction, in file order: this file always wins and nobody sees the in-between state.
-- Safe to run more than once.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0007_season1.sql

create or replace function public.season_start_week() returns text
language sql immutable as $$ select '2026-W46'::text $$;

-- ISO week ids compare correctly as text ('2026-W45' < '2026-W46' < '2027-W01').
create or replace function public.week_counts_now(p_week text) returns boolean
language sql stable set search_path = public, extensions, pg_temp as $$
  select case when public.ny_iso_week(public.game_now()) >= public.season_start_week()
              then p_week >= public.season_start_week()
              else p_week < public.season_start_week() end
$$;

create or replace function public.leaderboard_season(p_limit int default 100)
returns table (rank bigint, nickname text, points numeric, weeks bigint, is_me boolean)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select rank() over (order by sum(s.points) desc), p.nickname::text, sum(s.points), count(*), s.user_id = auth.uid()
  from public.team_scores s join public.profiles p on p.id = s.user_id
  where public.week_counts_now(s.week)
  group by s.user_id, p.nickname
  order by sum(s.points) desc, p.nickname
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- Members only.
create or replace function public.league_standings(p_league uuid, p_week text default null)
returns table (week text, rank bigint, nickname text, week_points numeric, season_points numeric, is_me boolean, is_owner boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  wk text := coalesce(p_week, public.current_week());
begin
  if auth.uid() is null or not public.is_league_member(p_league, auth.uid()) then
    raise exception 'Only members can see this league.';
  end if;
  return query
    select wk, rank() over (order by coalesce(ws.points, 0) desc, coalesce(ss.points, 0) desc),
           p.nickname::text, coalesce(ws.points, 0), coalesce(ss.points, 0), m.user_id = auth.uid(), l.owner = m.user_id
    from public.league_members m
    join public.profiles p on p.id = m.user_id
    join public.leagues l on l.id = m.league_id
    left join public.team_scores ws on ws.user_id = m.user_id and ws.week = wk
    left join (select ts.user_id, sum(ts.points) as points from public.team_scores ts
               where public.week_counts_now(ts.week) group by ts.user_id) ss on ss.user_id = m.user_id
    where m.league_id = p_league
    order by 2, p.nickname;
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase grants EXECUTE on new functions to everyone by default, so reset it.
-- create or replace keeps 0001's grants on the two leaderboards; restated here so this file stands on its own.
-- ---------------------------------------------------------------------------
revoke execute on function public.season_start_week(), public.week_counts_now(text),
  public.leaderboard_season(int), public.league_standings(uuid, text)
  from public, anon, authenticated;
-- read-only, public (the helpers reveal nothing but the season date)
grant execute on function public.season_start_week(), public.week_counts_now(text), public.leaderboard_season(int)
  to anon, authenticated;
-- signed-in players (members only, checked inside)
grant execute on function public.league_standings(uuid, text) to authenticated;
