-- Billionaires Digest: multiplayer game backend (Supabase: Postgres + Auth + RLS).
--
-- Play money only. Coins have no cash value and cannot be bought, sold, cashed out or transferred.
--
-- What is here
--   profiles            one row per signed-in player (anonymous sign-in), unique nickname, coin balance
--   fantasy_weeks       weeks of the fantasy league, uploaded from data/fantasy/weeks/*.json
--   person_points       fantasy points per person per trading day, from data/fantasy/days/*.json
--   rosters             each player's 5 picks + captain for a week (checked by a trigger; no edits after locks_at, late first entries allowed)
--   team_scores         weekly team points, written by settle_week()
--   leagues             private leagues joined by invite code
--   markets / positions / trades   play-money yes/no markets priced by LMSR
--
-- Safe to run more than once: tables use IF NOT EXISTS, functions use CREATE OR REPLACE,
-- policies are dropped and re-created. It never deletes player data.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_game.sql

create schema if not exists extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Clock. Every rule that depends on the time reads game_now(), so tests can move the clock.
-- In production it is plain now().
-- ---------------------------------------------------------------------------
create or replace function public.game_now() returns timestamptz
language sql stable as $$ select now() $$;

-- ISO week in New York time, e.g. '2026-W40'. Used for the weekly coin top-up.
create or replace function public.ny_iso_week(ts timestamptz) returns text
language sql immutable as $$ select to_char((ts at time zone 'America/New_York'), 'IYYY-"W"IW') $$;

-- ---------------------------------------------------------------------------
-- Names: nicknames and league names share one rule.
-- 3-20 characters, letters, digits, _ and - only, not on the blocklist.
-- ---------------------------------------------------------------------------
create table if not exists public.name_blocklist (
  term text primary key check (term = lower(term) and length(term) >= 2),
  whole_word boolean not null default false   -- true: only blocks a whole part of the name (split on _ and -)
);
alter table public.name_blocklist enable row level security;   -- no policies: not readable by players

insert into public.name_blocklist (term, whole_word) values
  -- impersonation / staff-like names
  ('admin', false), ('moderator', false), ('billionairesdigest', false), ('official', false), ('support', true), ('staff', true), ('mod', true), ('system', true),
  -- slurs and profanity (checked after leetspeak and separators are removed)
  ('nigger', false), ('nigga', false), ('faggot', false), ('fagot', false), ('retard', false), ('tranny', false), ('kike', false), ('spic', true),
  ('chink', false), ('gook', true), ('wetback', false), ('coon', true), ('dyke', true), ('fag', true), ('cunt', false), ('fuck', false),
  ('shit', false), ('bitch', false), ('whore', false), ('slut', false), ('cock', true), ('dick', true), ('pussy', false), ('rape', true),
  ('rapist', false), ('nazi', false), ('hitler', false), ('kkk', false), ('porn', false), ('penis', false), ('vagina', false), ('asshole', false),
  ('ass', true), ('twat', false), ('wank', false), ('jizz', false), ('cum', true), ('motherfucker', false), ('bastard', false), ('isis', true)
on conflict (term) do nothing;

-- Lower-case, undo common look-alike characters, drop separators.
create or replace function public.name_squash(n text) returns text
language sql immutable as $$
  select translate(lower(coalesce(n, '')), '013457@$_-', 'oieastas')
$$;

-- Returns null when the name is fine, or a plain-language reason when it is not.
create or replace function public.name_problem(n text) returns text
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  squashed text := public.name_squash(n);
  parts text[];
begin
  if n is null or length(n) < 3 or length(n) > 20 then
    return 'Use 3 to 20 characters.';
  end if;
  if n !~ '^[A-Za-z0-9_-]+$' then
    return 'Use only letters, numbers, _ and -.';
  end if;
  parts := array(select public.name_squash(p) from unnest(regexp_split_to_array(n, '[_-]+')) p where p <> '');
  if exists (
    select 1 from public.name_blocklist b
    where (not b.whole_word and position(b.term in squashed) > 0)
       or (b.whole_word and (b.term = any(parts) or b.term = squashed))
  ) then
    return 'That name is not allowed. Please pick another.';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname extensions.citext not null unique,
  created_at timestamptz not null default now(),
  coins bigint not null default 1000 check (coins >= 0),
  last_topup_week text
);

create table if not exists public.fantasy_weeks (
  week text primary key,
  start date not null,
  "end" date not null,
  locks_at timestamptz not null,
  salaries jsonb not null default '{}'::jsonb,
  draftable text[] not null default '{}',
  final boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.person_points (
  date date not null,
  slug text not null,
  points int not null,
  return_pct numeric,
  primary key (date, slug)
);

create table if not exists public.rosters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week text not null references public.fantasy_weeks(week) on delete cascade,
  picks text[] not null,
  captain text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);

create table if not exists public.team_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week text not null references public.fantasy_weeks(week) on delete cascade,
  points numeric(12,1) not null default 0,
  days int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_id, week)
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name extensions.citext not null,
  invite_code text not null unique check (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  owner uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index if not exists league_members_user_idx on public.league_members(user_id);

create table if not exists public.markets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  question text not null,
  kind text not null check (kind in ('h2h', 'insider_buy', 'sector_top', 'other')),
  params jsonb not null default '{}'::jsonb,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  resolves_by timestamptz,
  b numeric not null default 100 check (b > 0),
  q_yes numeric not null default 0,
  q_no numeric not null default 0,
  status text not null default 'open' check (status in ('open', 'closed', 'resolved', 'void')),
  outcome text check (outcome in ('yes', 'no')),
  resolution_note text,
  source_url text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists markets_status_idx on public.markets(status, closes_at);

create table if not exists public.positions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  yes_shares numeric(20,6) not null default 0 check (yes_shares >= 0),
  no_shares numeric(20,6) not null default 0 check (no_shares >= 0),
  cost_basis bigint not null default 0,      -- coins paid in minus coins taken out by selling
  payout bigint,                             -- coins paid when the market resolved (or refunded when void)
  primary key (user_id, market_id)
);
create index if not exists positions_market_idx on public.positions(market_id);

create table if not exists public.trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  action text not null check (action in ('buy', 'sell')),
  side text not null check (side in ('yes', 'no')),
  shares numeric(20,6) not null,
  cost bigint not null,                      -- coins: paid for a buy, received for a sell
  price_yes_after numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists trades_user_idx on public.trades(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security. Players never write tables directly except rosters (through RLS + trigger).
-- Everything else goes through the functions below.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.fantasy_weeks enable row level security;
alter table public.person_points enable row level security;
alter table public.rosters enable row level security;
alter table public.team_scores enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.markets enable row level security;
alter table public.positions enable row level security;
alter table public.trades enable row level security;

-- Explicit privileges. Works whether or not the project auto-exposes new tables:
-- first take everything away, then grant exactly what each role needs. RLS still decides which rows.
grant usage on schema public to anon, authenticated, service_role;
revoke all on public.name_blocklist, public.profiles, public.fantasy_weeks, public.person_points, public.rosters,
  public.team_scores, public.leagues, public.league_members, public.markets, public.positions, public.trades
  from public, anon, authenticated;
-- reads (RLS policies below limit rosters, leagues, members, positions and trades)
grant select on public.profiles, public.fantasy_weeks, public.person_points, public.rosters, public.team_scores,
  public.markets to anon, authenticated;
grant select on public.leagues, public.league_members, public.positions, public.trades to authenticated;
-- the only direct write: a player's own roster (RLS owner check + check_roster trigger)
grant insert (user_id, week, picks, captain), update (picks, captain) on public.rosters to authenticated;
-- the sync job (service role) reads tables over the REST API; it writes only through the admin functions
grant select on public.profiles, public.fantasy_weeks, public.person_points, public.rosters, public.team_scores,
  public.leagues, public.league_members, public.markets, public.positions, public.trades to service_role;

-- membership check that does not trip RLS recursion
create or replace function public.is_league_member(p_league uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = p_user)
$$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to anon, authenticated using (true);

drop policy if exists weeks_read on public.fantasy_weeks;
create policy weeks_read on public.fantasy_weeks for select to anon, authenticated using (true);

drop policy if exists points_read on public.person_points;
create policy points_read on public.person_points for select to anon, authenticated using (true);

drop policy if exists rosters_read on public.rosters;
create policy rosters_read on public.rosters for select to anon, authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.fantasy_weeks w where w.week = rosters.week and public.game_now() >= w.locks_at)
);
drop policy if exists rosters_insert on public.rosters;
create policy rosters_insert on public.rosters for insert to authenticated with check (user_id = auth.uid());
drop policy if exists rosters_update on public.rosters;
create policy rosters_update on public.rosters for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists scores_read on public.team_scores;
create policy scores_read on public.team_scores for select to anon, authenticated using (true);

drop policy if exists leagues_read on public.leagues;
create policy leagues_read on public.leagues for select to authenticated using (public.is_league_member(id, auth.uid()));

drop policy if exists members_read on public.league_members;
create policy members_read on public.league_members for select to authenticated using (public.is_league_member(league_id, auth.uid()));

drop policy if exists markets_read on public.markets;
create policy markets_read on public.markets for select to anon, authenticated using (true);

drop policy if exists positions_read on public.positions;
create policy positions_read on public.positions for select to authenticated using (user_id = auth.uid());

drop policy if exists trades_read on public.trades;
create policy trades_read on public.trades for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Roster check: runs on every insert/update, for every role.
-- ---------------------------------------------------------------------------
create or replace function public.check_roster() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  w public.fantasy_weeks%rowtype;
  total numeric := 0;
  s text;
  sal numeric;
begin
  select * into w from public.fantasy_weeks where week = new.week;
  if not found then
    raise exception 'That week is not open for picks.';
  end if;
  -- After the lock: no edits, but a player with no roster yet may join late (it scores from the next trading day).
  if public.game_now() >= w.locks_at then
    if tg_op = 'UPDATE' then
      raise exception 'Picks for this week are locked. You can pick again for next week.';
    end if;
    if (public.game_now() at time zone 'America/New_York')::date > w."end" then
      raise exception 'This week is over. You can pick for next week.';
    end if;
    if exists (select 1 from public.rosters r where r.user_id = new.user_id and r.week = new.week) then
      raise exception 'Picks for this week are locked. You can pick again for next week.';
    end if;
  end if;
  if new.picks is null or coalesce(array_length(new.picks, 1), 0) <> 5 or array_position(new.picks, null) is not null then
    raise exception 'Pick exactly 5 people.';
  end if;
  if (select count(distinct x) from unnest(new.picks) x) <> 5 then
    raise exception 'Pick 5 different people.';
  end if;
  foreach s in array new.picks loop
    if not (s = any(w.draftable)) then
      raise exception '% cannot be picked this week.', s;
    end if;
    sal := (w.salaries ->> s)::numeric;
    if sal is null then
      raise exception '% has no salary this week.', s;
    end if;
    total := total + sal;
  end loop;
  if new.captain is null or not (new.captain = any(new.picks)) then
    raise exception 'Your captain must be one of your 5 picks.';
  end if;
  if total > 100 then
    raise exception 'Your picks cost % points. The cap is 100.', total;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.user_id := old.user_id;
    new.week := old.week;
  else
    new.created_at := public.game_now();
  end if;
  new.updated_at := public.game_now();
  return new;
end $$;

drop trigger if exists rosters_check on public.rosters;
create trigger rosters_check before insert or update on public.rosters
  for each row execute function public.check_roster();

-- ---------------------------------------------------------------------------
-- Player functions (called by signed-in players; anonymous sign-ins use the authenticated role)
-- ---------------------------------------------------------------------------

-- Pick or change a nickname. Creates the profile the first time (1000 coins).
create or replace function public.set_nickname(p_nickname text) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  problem text;
  n text := btrim(p_nickname);
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  problem := public.name_problem(n);
  if problem is not null then raise exception '%', problem; end if;
  if exists (select 1 from public.profiles where nickname = n::extensions.citext and id <> uid) then
    raise exception 'That nickname is taken.';
  end if;
  insert into public.profiles (id, nickname, created_at) values (uid, n, public.game_now())
    on conflict (id) do update set nickname = excluded.nickname;
  return json_build_object('nickname', n);
exception when unique_violation then
  raise exception 'That nickname is taken.';
end $$;

-- The signed-in player's own summary.
create or replace function public.me() returns json
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select json_build_object(
    'id', p.id,
    'nickname', p.nickname::text,
    'coins', p.coins,
    'topup_week', public.ny_iso_week(public.game_now()),
    'topup_available', (p.last_topup_week is distinct from public.ny_iso_week(public.game_now()) and p.coins < 5000)
  )
  from public.profiles p where p.id = auth.uid()
$$;

-- +250 coins once per week (New York time), only while the balance is under 5,000.
create or replace function public.claim_topup() returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  wk text := public.ny_iso_week(public.game_now());
  p public.profiles%rowtype;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Pick a nickname first.'; end if;
  if p.last_topup_week = wk then raise exception 'You already claimed this week''s coins.'; end if;
  if p.coins >= 5000 then raise exception 'The weekly top-up is only for balances under 5,000 coins.'; end if;
  update public.profiles set coins = coins + 250, last_topup_week = wk where id = uid returning * into p;
  return json_build_object('coins', p.coins, 'week', wk);
end $$;

-- Save picks. SECURITY INVOKER on purpose: RLS and the roster trigger both apply.
create or replace function public.save_roster(p_week text, p_picks text[], p_captain text) returns json
language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'Pick a nickname first.'; end if;
  insert into public.rosters (user_id, week, picks, captain) values (uid, p_week, p_picks, p_captain)
    on conflict (user_id, week) do update set picks = excluded.picks, captain = excluded.captain;
  return json_build_object('week', p_week, 'saved', true);
end $$;

-- ---- leagues ----
create or replace function public.new_invite_code() returns text
language plpgsql volatile set search_path = public, extensions, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- no 0 O 1 I L
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  code text := '';
  i int;
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i * 2) * 256 + get_byte(bytes, i * 2 + 1)) % 31 + 1, 1);
  end loop;
  return code;
end $$;

create or replace function public.create_league(p_name text) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  n text := btrim(p_name);
  problem text;
  code text;
  lid uuid;
  tries int := 0;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  perform 1 from public.profiles where id = uid for update;
  if not found then raise exception 'Pick a nickname first.'; end if;
  problem := public.name_problem(n);
  if problem is not null then raise exception 'League name: %', problem; end if;
  if (select count(*) from public.league_members where user_id = uid) >= 10 then
    raise exception 'You can be in up to 10 leagues.';
  end if;
  loop
    tries := tries + 1;
    code := public.new_invite_code();
    begin
      insert into public.leagues (name, invite_code, owner, created_at) values (n, code, uid, public.game_now()) returning id into lid;
      exit;
    exception when unique_violation then
      if tries >= 10 then raise exception 'Could not make an invite code. Please try again.'; end if;
    end;
  end loop;
  insert into public.league_members (league_id, user_id, joined_at) values (lid, uid, public.game_now());
  return json_build_object('id', lid, 'name', n, 'invite_code', code);
end $$;

create or replace function public.join_league(p_code text) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  l public.leagues%rowtype;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  perform 1 from public.profiles where id = uid for update;
  if not found then raise exception 'Pick a nickname first.'; end if;
  select * into l from public.leagues where invite_code = c for update;
  if not found then raise exception 'No league has that code. Check it and try again.'; end if;
  if exists (select 1 from public.league_members where league_id = l.id and user_id = uid) then
    return json_build_object('id', l.id, 'name', l.name::text, 'already', true);
  end if;
  if (select count(*) from public.league_members where user_id = uid) >= 10 then
    raise exception 'You can be in up to 10 leagues.';
  end if;
  if (select count(*) from public.league_members where league_id = l.id) >= 50 then
    raise exception 'That league is full (50 players).';
  end if;
  insert into public.league_members (league_id, user_id, joined_at) values (l.id, uid, public.game_now());
  return json_build_object('id', l.id, 'name', l.name::text, 'already', false);
end $$;

-- Leaving: if the owner leaves, the longest-standing member becomes owner; an empty league is removed.
create or replace function public.leave_league(p_league uuid) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  l public.leagues%rowtype;
  heir uuid;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  select * into l from public.leagues where id = p_league for update;
  if not found then raise exception 'That league does not exist.'; end if;
  delete from public.league_members where league_id = p_league and user_id = uid;
  if not found then raise exception 'You are not in that league.'; end if;
  if l.owner = uid then
    select user_id into heir from public.league_members where league_id = p_league order by joined_at, user_id limit 1;
    if heir is null then
      delete from public.leagues where id = p_league;
    else
      update public.leagues set owner = heir where id = p_league;
    end if;
  end if;
  return json_build_object('left', true);
end $$;

create or replace function public.my_leagues() returns table (id uuid, name text, invite_code text, members bigint, is_owner boolean, joined_at timestamptz)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select l.id, l.name::text, l.invite_code,
         (select count(*) from public.league_members x where x.league_id = l.id),
         l.owner = auth.uid(), m.joined_at
  from public.league_members m join public.leagues l on l.id = m.league_id
  where m.user_id = auth.uid()
  order by m.joined_at
$$;

-- ---- leaderboards (public, nickname + points only) ----
-- The week shown when none is asked for: the latest week that has locked.
create or replace function public.current_week() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(
    (select week from public.fantasy_weeks where locks_at <= public.game_now() order by locks_at desc limit 1),
    (select week from public.fantasy_weeks order by locks_at limit 1)
  )
$$;

create or replace function public.leaderboard_week(p_week text default null, p_limit int default 100)
returns table (week text, rank bigint, nickname text, points numeric, is_me boolean)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with w as (select coalesce(p_week, public.current_week()) as wk)
  select s.week, rank() over (order by s.points desc), p.nickname::text, s.points, s.user_id = auth.uid()
  from public.team_scores s join public.profiles p on p.id = s.user_id, w
  where s.week = w.wk
  order by s.points desc, p.nickname
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

create or replace function public.leaderboard_season(p_limit int default 100)
returns table (rank bigint, nickname text, points numeric, weeks bigint, is_me boolean)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select rank() over (order by sum(s.points) desc), p.nickname::text, sum(s.points), count(*), s.user_id = auth.uid()
  from public.team_scores s join public.profiles p on p.id = s.user_id
  group by s.user_id, p.nickname
  order by sum(s.points) desc, p.nickname
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- LMSR helpers (numeric, so prices never round to exactly 0 or 1)
create or replace function public.lmsr_cost(q_yes numeric, q_no numeric, b numeric) returns numeric
language sql immutable as $$
  select greatest(q_yes, q_no) + b * ln(exp((q_yes - greatest(q_yes, q_no)) / b) + exp((q_no - greatest(q_yes, q_no)) / b))
$$;

create or replace function public.lmsr_price_yes(q_yes numeric, q_no numeric, b numeric) returns numeric
language sql immutable as $$
  select case when q_yes >= q_no then 1 - 1 / (1 + exp((q_yes - q_no) / b))
              else 1 / (1 + exp((q_no - q_yes) / b)) end
$$;

-- Shares received for spending c coins on one side: s = b * ln(e^(c/b) + e^((q_other - q_side)/b) * (e^(c/b) - 1))
create or replace function public.lmsr_shares_for(q_side numeric, q_other numeric, b numeric, c numeric) returns numeric
language sql immutable as $$
  select b * ln(exp(c / b) + exp((q_other - q_side) / b) * (exp(c / b) - 1))
$$;

create or replace function public.coin_leaderboard(p_limit int default 100)
returns table (rank bigint, nickname text, coins bigint, open_value numeric, total numeric, is_me boolean)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with v as (
    select pos.user_id,
           sum(pos.yes_shares * public.lmsr_price_yes(m.q_yes, m.q_no, m.b)
             + pos.no_shares * (1 - public.lmsr_price_yes(m.q_yes, m.q_no, m.b))) as val
    from public.positions pos join public.markets m on m.id = pos.market_id
    where m.status in ('open', 'closed')
    group by pos.user_id
  )
  select rank() over (order by p.coins + coalesce(v.val, 0) desc), p.nickname::text, p.coins,
         round(coalesce(v.val, 0), 1), round(p.coins + coalesce(v.val, 0), 1), p.id = auth.uid()
  from public.profiles p left join v on v.user_id = p.id
  order by p.coins + coalesce(v.val, 0) desc, p.nickname
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
    left join (select user_id, sum(points) as points from public.team_scores group by user_id) ss on ss.user_id = m.user_id
    where m.league_id = p_league
    order by 2, p.nickname;
end $$;

-- ---- markets ----
-- Buy: spend a whole number of coins (1 to 500, never more than the balance) on YES or NO.
-- A buy that would push that side's price above 99% is refused.
create or replace function public.buy(p_market uuid, p_side text, p_coins int) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  m public.markets%rowtype;
  s numeric;
  new_yes numeric;
  new_no numeric;
  price numeric;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if p_side not in ('yes', 'no') then raise exception 'Pick YES or NO.'; end if;
  select * into p from public.profiles where id = uid for update;          -- lock order: profile, then market
  if not found then raise exception 'Pick a nickname first.'; end if;
  select * into m from public.markets where id = p_market for update;
  if not found then raise exception 'That market does not exist.'; end if;
  if m.status <> 'open' or public.game_now() < m.opens_at or public.game_now() >= m.closes_at then
    raise exception 'This market is closed for trading.';
  end if;
  if p_coins is null or p_coins < 1 then raise exception 'Spend at least 1 coin.'; end if;
  if p_coins > 500 then raise exception 'You can spend up to 500 coins per trade.'; end if;
  if p_coins > p.coins then raise exception 'You only have % coins.', p.coins; end if;

  if p_side = 'yes' then
    s := trunc(public.lmsr_shares_for(m.q_yes, m.q_no, m.b, p_coins), 6);
    new_yes := m.q_yes + s; new_no := m.q_no;
  else
    s := trunc(public.lmsr_shares_for(m.q_no, m.q_yes, m.b, p_coins), 6);
    new_yes := m.q_yes; new_no := m.q_no + s;
  end if;
  if s <= 0 then raise exception 'That trade is too small.'; end if;
  price := public.lmsr_price_yes(new_yes, new_no, m.b);
  if (p_side = 'yes' and price > 0.99) or (p_side = 'no' and price < 0.01) then
    raise exception 'That would push the price past 99%%. Try fewer coins.';
  end if;

  update public.markets set q_yes = new_yes, q_no = new_no where id = m.id;
  update public.profiles set coins = coins - p_coins where id = uid;
  insert into public.positions (user_id, market_id, yes_shares, no_shares, cost_basis)
    values (uid, m.id, case when p_side = 'yes' then s else 0 end, case when p_side = 'no' then s else 0 end, p_coins)
    on conflict (user_id, market_id) do update set
      yes_shares = positions.yes_shares + excluded.yes_shares,
      no_shares = positions.no_shares + excluded.no_shares,
      cost_basis = positions.cost_basis + excluded.cost_basis;
  insert into public.trades (user_id, market_id, action, side, shares, cost, price_yes_after, created_at)
    values (uid, m.id, 'buy', p_side, s, p_coins, price, public.game_now());
  return json_build_object('shares', s, 'cost', p_coins, 'price_yes', price, 'coins', p.coins - p_coins);
end $$;

-- Sell: give shares back to the market for coins (rounded down to a whole coin).
create or replace function public.sell(p_market uuid, p_side text, p_shares numeric) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  m public.markets%rowtype;
  pos public.positions%rowtype;
  held numeric;
  s numeric := p_shares;
  new_yes numeric;
  new_no numeric;
  back bigint;
  price numeric;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if p_side not in ('yes', 'no') then raise exception 'Pick YES or NO.'; end if;
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Pick a nickname first.'; end if;
  select * into m from public.markets where id = p_market for update;
  if not found then raise exception 'That market does not exist.'; end if;
  if m.status <> 'open' or public.game_now() >= m.closes_at then
    raise exception 'This market is closed for trading.';
  end if;
  select * into pos from public.positions where user_id = uid and market_id = m.id for update;
  held := case when not found then 0 when p_side = 'yes' then pos.yes_shares else pos.no_shares end;
  if s is null or s <= 0 then raise exception 'Sell more than 0 shares.'; end if;
  if s > held then
    if s - held <= 0.000001 then s := held; else raise exception 'You only have % % shares.', round(held, 2), upper(p_side); end if;
  end if;
  if p_side = 'yes' then new_yes := m.q_yes - s; new_no := m.q_no; else new_yes := m.q_yes; new_no := m.q_no - s; end if;
  back := floor(public.lmsr_cost(m.q_yes, m.q_no, m.b) - public.lmsr_cost(new_yes, new_no, m.b));
  if back < 1 then raise exception 'Those shares are worth less than 1 coin right now.'; end if;
  price := public.lmsr_price_yes(new_yes, new_no, m.b);

  update public.markets set q_yes = new_yes, q_no = new_no where id = m.id;
  update public.profiles set coins = coins + back where id = uid;
  update public.positions set
      yes_shares = yes_shares - case when p_side = 'yes' then s else 0 end,
      no_shares = no_shares - case when p_side = 'no' then s else 0 end,
      cost_basis = cost_basis - back
    where user_id = uid and market_id = m.id;
  insert into public.trades (user_id, market_id, action, side, shares, cost, price_yes_after, created_at)
    values (uid, m.id, 'sell', p_side, s, back, price, public.game_now());
  return json_build_object('shares', s, 'coins_back', back, 'price_yes', price, 'coins', p.coins + back);
end $$;

-- ---------------------------------------------------------------------------
-- Admin functions: service role only (the GitHub Action). Not callable by players.
-- ---------------------------------------------------------------------------

-- {week, start, end, locksAt, salaries, draftable}
create or replace function public.upsert_week(p jsonb) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if coalesce(p ->> 'week', '') = '' then raise exception 'week is required'; end if;
  insert into public.fantasy_weeks (week, start, "end", locks_at, salaries, draftable, updated_at)
  values (
    p ->> 'week', (p ->> 'start')::date, (p ->> 'end')::date,
    coalesce(p ->> 'locksAt', p ->> 'locks_at')::timestamptz,
    coalesce(p -> 'salaries', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(p -> 'draftable')), '{}'),
    now()
  )
  on conflict (week) do update set
    start = excluded.start, "end" = excluded."end", locks_at = excluded.locks_at,
    salaries = excluded.salaries, draftable = excluded.draftable, updated_at = now();
  return p ->> 'week';
end $$;

-- One day {date, people:[{slug, points, returnPct}]} or an array of days. Returns rows written.
create or replace function public.upsert_points(p jsonb) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  n int;
begin
  with days as (
    select d from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else jsonb_build_array(p) end) d
  ), rows as (
    select (d ->> 'date')::date as date, x ->> 'slug' as slug,
           round((x ->> 'points')::numeric)::int as points,
           nullif(coalesce(x ->> 'returnPct', x ->> 'return_pct'), '')::numeric as return_pct
    from days, jsonb_array_elements(coalesce(d -> 'people', '[]'::jsonb)) x
    where coalesce(x ->> 'slug', '') <> '' and x ->> 'points' is not null
  )
  insert into public.person_points (date, slug, points, return_pct)
  select date, slug, points, return_pct from rows
  on conflict (date, slug) do update set points = excluded.points, return_pct = excluded.return_pct;
  get diagnostics n = row_count;
  return n;
end $$;

-- Team points for a week: sum of the picks' daily points, captain x1.5.
-- A roster made after the lock only counts from the next trading day after it was made (NY date).
-- p_final marks the week finished; running it again is safe.
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
         coalesce(sum(pp.points * case when pp.slug = r.captain then 1.5 else 1 end), 0),
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

-- {slug, question, kind, params, opens_at, closes_at, resolves_by, b}. Existing slugs are left alone.
create or replace function public.create_market(p jsonb) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  mid uuid;
begin
  insert into public.markets (slug, question, kind, params, opens_at, closes_at, resolves_by, b)
  values (
    p ->> 'slug', p ->> 'question', p ->> 'kind', coalesce(p -> 'params', '{}'::jsonb),
    coalesce((p ->> 'opens_at')::timestamptz, now()), (p ->> 'closes_at')::timestamptz,
    (p ->> 'resolves_by')::timestamptz, coalesce((p ->> 'b')::numeric, 100)
  )
  on conflict (slug) do nothing
  returning id into mid;
  if mid is null then
    select id into mid from public.markets where slug = p ->> 'slug';
    return json_build_object('id', mid, 'created', false);
  end if;
  return json_build_object('id', mid, 'created', true);
end $$;

create or replace function public.close_due_markets() returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  update public.markets set status = 'closed' where status = 'open' and closes_at <= public.game_now();
  get diagnostics n = row_count;
  return n;
end $$;

-- outcome: 'yes' | 'no' pays 1 coin per winning share (rounded down); 'void' refunds what each player put in.
create or replace function public.resolve_market(p_slug text, p_outcome text, p_note text, p_source_url text) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  m public.markets%rowtype;
  paid bigint := 0;
  pos record;
  amt bigint;
begin
  if p_outcome not in ('yes', 'no', 'void') then raise exception 'outcome must be yes, no or void'; end if;
  select * into m from public.markets where slug = p_slug for update;
  if not found then raise exception 'unknown market %', p_slug; end if;
  if m.status in ('resolved', 'void') then
    return json_build_object('slug', p_slug, 'already', true, 'status', m.status);
  end if;
  for pos in
    select * from public.positions where market_id = m.id order by user_id for update
  loop
    if p_outcome = 'void' then
      amt := greatest(pos.cost_basis, 0);
    elsif p_outcome = 'yes' then
      amt := floor(pos.yes_shares);
    else
      amt := floor(pos.no_shares);
    end if;
    update public.positions set payout = amt where user_id = pos.user_id and market_id = m.id;
    if amt > 0 then
      update public.profiles set coins = coins + amt where id = pos.user_id;
      paid := paid + amt;
    end if;
  end loop;
  update public.markets set
    status = case when p_outcome = 'void' then 'void' else 'resolved' end,
    outcome = case when p_outcome = 'void' then null else p_outcome end,
    resolution_note = p_note, source_url = p_source_url, resolved_at = now()
  where id = m.id;
  return json_build_object('slug', p_slug, 'already', false, 'status', case when p_outcome = 'void' then 'void' else 'resolved' end, 'paid', paid);
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase grants EXECUTE on new functions to everyone by default, so reset it.
-- ---------------------------------------------------------------------------
-- (Listed one by one so other functions in this project are left alone.)
revoke execute on function public.game_now(), public.ny_iso_week(timestamptz), public.name_squash(text), public.name_problem(text),
  public.is_league_member(uuid, uuid), public.check_roster(), public.set_nickname(text), public.me(), public.claim_topup(),
  public.save_roster(text, text[], text), public.new_invite_code(), public.create_league(text), public.join_league(text),
  public.leave_league(uuid), public.my_leagues(), public.current_week(), public.leaderboard_week(text, int),
  public.leaderboard_season(int), public.lmsr_cost(numeric, numeric, numeric), public.lmsr_price_yes(numeric, numeric, numeric),
  public.lmsr_shares_for(numeric, numeric, numeric, numeric), public.coin_leaderboard(int), public.league_standings(uuid, text),
  public.buy(uuid, text, int), public.sell(uuid, text, numeric), public.upsert_week(jsonb), public.upsert_points(jsonb),
  public.settle_week(text, boolean), public.create_market(jsonb), public.close_due_markets(),
  public.resolve_market(text, text, text, text)
  from public, anon, authenticated;

-- read-only, public
grant execute on function public.game_now(), public.ny_iso_week(timestamptz), public.current_week(),
  public.leaderboard_week(text, int), public.leaderboard_season(int), public.coin_leaderboard(int),
  public.lmsr_cost(numeric, numeric, numeric), public.lmsr_price_yes(numeric, numeric, numeric),
  public.lmsr_shares_for(numeric, numeric, numeric, numeric)
  to anon, authenticated;
-- used inside RLS policies
grant execute on function public.is_league_member(uuid, uuid) to authenticated;
-- signed-in players
grant execute on function public.set_nickname(text), public.me(), public.claim_topup(),
  public.save_roster(text, text[], text), public.create_league(text), public.join_league(text),
  public.leave_league(uuid), public.my_leagues(), public.league_standings(uuid, text),
  public.buy(uuid, text, int), public.sell(uuid, text, numeric)
  to authenticated;
-- admin (service role)
grant execute on function public.upsert_week(jsonb), public.upsert_points(jsonb), public.settle_week(text, boolean),
  public.create_market(jsonb), public.close_due_markets(), public.resolve_market(text, text, text, text)
  to service_role;
