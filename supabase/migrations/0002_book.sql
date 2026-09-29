-- Billionaires Digest: "The Book", a play-money sportsbook on the fantasy week (needs 0001_game.sql first).
--
-- Play money only. Coins have no cash value: no purchases, no cash-out, no prizes.
--
-- What is here
--   book_events      one row per event (matchup, player points ladder, top scorer, insider-buy prop, top sector)
--   book_selections  the prices (American + decimal odds); odds of a selection freeze once someone has bet on it
--   bets / bet_legs  a player's bets: a single (1 leg) or a parlay (2-4 legs from different events)
--   place_bet()      the only way to bet; settle_book() pays out; upsert_book() / close_due_book() run from the sync job
--
-- Safe to run more than once, like 0001: IF NOT EXISTS, CREATE OR REPLACE, policies dropped and re-created.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_book.sql

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.book_events (
  id text primary key,
  week text not null,
  type text not null check (type in ('h2h', 'player_ou', 'futures_top', 'prop_insider', 'prop_sector')),
  title text not null,
  params jsonb not null default '{}'::jsonb,
  settles_from text,
  sort int not null default 0,
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed', 'settled', 'void')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists book_events_week_idx on public.book_events(week, sort);
create index if not exists book_events_status_idx on public.book_events(status, closes_at);

create table if not exists public.book_selections (
  id text primary key,
  event_id text not null references public.book_events(id) on delete cascade,
  label text not null,
  line numeric,
  american_odds int not null check (american_odds <= -100 or american_odds >= 100),
  decimal_odds numeric(10,4) not null check (decimal_odds > 1),
  fair_prob numeric,
  meta jsonb not null default '{}'::jsonb,           -- { market, person, sector }
  sort int not null default 0,
  result text check (result in ('win', 'lose', 'void')),
  updated_at timestamptz not null default now()
);
create index if not exists book_selections_event_idx on public.book_selections(event_id, sort);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week text not null,
  created_at timestamptz not null default now(),
  stake int not null check (stake between 1 and 500),
  potential_payout int not null check (potential_payout >= 0),
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'void', 'cashed')),
  is_parlay boolean not null default false,
  payout int,                                         -- coins paid back when settled (0 when lost, the stake when void)
  settled_at timestamptz
);
create index if not exists bets_user_idx on public.bets(user_id, created_at desc);
create index if not exists bets_open_idx on public.bets(status) where status = 'open';

create table if not exists public.bet_legs (
  bet_id uuid not null references public.bets(id) on delete cascade,
  selection_id text not null references public.book_selections(id),
  decimal_odds_at_bet numeric(10,4) not null,
  american_odds_at_bet int not null,
  primary key (bet_id, selection_id)
);
create index if not exists bet_legs_selection_idx on public.bet_legs(selection_id);

-- ---------------------------------------------------------------------------
-- Row level security and explicit privileges (same approach as 0001)
-- ---------------------------------------------------------------------------
alter table public.book_events enable row level security;
alter table public.book_selections enable row level security;
alter table public.bets enable row level security;
alter table public.bet_legs enable row level security;

revoke all on public.book_events, public.book_selections, public.bets, public.bet_legs from public, anon, authenticated;
grant select on public.book_events, public.book_selections to anon, authenticated;
grant select on public.bets, public.bet_legs to authenticated;
grant select on public.book_events, public.book_selections, public.bets, public.bet_legs to service_role;

drop policy if exists book_events_read on public.book_events;
create policy book_events_read on public.book_events for select to anon, authenticated using (true);
drop policy if exists book_selections_read on public.book_selections;
create policy book_selections_read on public.book_selections for select to anon, authenticated using (true);
drop policy if exists bets_read on public.bets;
create policy bets_read on public.bets for select to authenticated using (user_id = auth.uid());
drop policy if exists bet_legs_read on public.bet_legs;
create policy bet_legs_read on public.bet_legs for select to authenticated
  using (exists (select 1 from public.bets b where b.id = bet_legs.bet_id and b.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Player functions
-- ---------------------------------------------------------------------------

-- Place a single (1 selection) or a parlay (2-4 selections from different events).
-- p_expected_decimal: the decimal odds the player saw, one per selection, in the same order. If any differs from the
-- current price the bet is refused ('Odds changed — review your slip') so nobody bets at a price they did not see.
-- Stakes: 1-500 coins; long shots are capped: combined decimal odds >= 21.0 -> at most 50 coins, >= 6.0 -> at most 150.
-- (The only definition of place_bet: the daily job re-applies every migration, so a copy elsewhere would briefly win.)
create or replace function public.place_bet(p_selection_ids text[], p_stake int, p_expected_decimal numeric[]) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  n int := coalesce(array_length(p_selection_ids, 1), 0);
  found_n int;
  events_n int;
  r record;
  prod numeric := 1;
  pay int;
  wk text;
  today_n int;
  bid uuid;
  i int;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  select * into p from public.profiles where id = uid for update;          -- lock order: profile, then selections
  if not found then raise exception 'Pick a nickname first.'; end if;
  if n < 1 or n > 4 then raise exception 'A bet has 1 to 4 picks.'; end if;
  if array_position(p_selection_ids, null) is not null then raise exception 'That pick is no longer available.'; end if;
  if (select count(distinct x) from unnest(p_selection_ids) x) <> n then raise exception 'Pick each selection only once.'; end if;
  if coalesce(array_length(p_expected_decimal, 1), 0) <> n then raise exception 'Odds changed — review your slip'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'Stake at least 1 coin.'; end if;
  if p_stake > 500 then raise exception 'You can stake up to 500 coins per bet.'; end if;
  if p_stake > p.coins then raise exception 'You only have % coins.', p.coins; end if;

  select count(*), count(distinct s.event_id) into found_n, events_n
  from public.book_selections s where s.id = any(p_selection_ids);
  if found_n <> n then raise exception 'That pick is no longer available.'; end if;
  if events_n <> n then raise exception 'Parlay picks must come from different events.'; end if;

  for i in 1..n loop
    select s.id, s.decimal_odds, s.american_odds, s.result, e.status, e.closes_at, e.week into r
    from public.book_selections s join public.book_events e on e.id = s.event_id
    where s.id = p_selection_ids[i]
    for share of e;
    if r.status <> 'open' or public.game_now() >= r.closes_at or r.result is not null then
      raise exception 'Betting on this event is closed.';
    end if;
    if p_expected_decimal[i] is null or r.decimal_odds <> p_expected_decimal[i] then
      raise exception 'Odds changed — review your slip';
    end if;
    prod := prod * r.decimal_odds;
    wk := greatest(coalesce(wk, r.week), r.week);
  end loop;

  -- long shots: the longer the combined odds, the smaller the most you can stake
  if prod >= 21.0 and p_stake > 50 then raise exception 'Long shots are capped at 50 coins.'; end if;
  if prod >= 6.0 and p_stake > 150 then raise exception 'Long shots are capped at 150 coins.'; end if;

  select count(*) into today_n from public.bets b
  where b.user_id = uid
    and (b.created_at at time zone 'America/New_York')::date = (public.game_now() at time zone 'America/New_York')::date;
  if today_n >= 50 then raise exception 'You can place up to 50 bets a day. Try again tomorrow.'; end if;

  pay := least(floor(p_stake * prod), 10000)::int;
  insert into public.bets (user_id, week, created_at, stake, potential_payout, status, is_parlay)
    values (uid, wk, public.game_now(), p_stake, pay, 'open', n > 1) returning id into bid;
  insert into public.bet_legs (bet_id, selection_id, decimal_odds_at_bet, american_odds_at_bet)
    select bid, s.id, s.decimal_odds, s.american_odds from public.book_selections s where s.id = any(p_selection_ids);
  update public.profiles set coins = coins - p_stake where id = uid;
  return json_build_object('id', bid, 'stake', p_stake, 'potential_payout', pay, 'legs', n, 'coins', p.coins - p_stake);
end $$;

-- The signed-in player's bets, newest first, with legs.
create or replace function public.my_bets(p_limit int default 100) returns json
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(json_agg(x order by x.created_at desc, x.id), '[]'::json) from (
    select b.id, b.week, b.created_at, b.stake, b.potential_payout, b.payout, b.status, b.is_parlay, b.settled_at,
      (select json_agg(json_build_object(
         'selection_id', l.selection_id, 'label', s.label, 'line', s.line, 'event_id', e.id, 'event_title', e.title,
         'event_type', e.type, 'event_status', e.status, 'decimal_odds', l.decimal_odds_at_bet,
         'american_odds', l.american_odds_at_bet, 'result', s.result) order by e.sort, s.sort)
       from public.bet_legs l join public.book_selections s on s.id = l.selection_id join public.book_events e on e.id = s.event_id
       where l.bet_id = b.id) as legs
    from public.bets b
    where b.user_id = auth.uid()
    order by b.created_at desc, b.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) x
$$;

-- Public: net coins won from settled bets (payout minus stake), nickname only. p_week null = the whole season.
create or replace function public.book_leaderboard(p_week text default null, p_limit int default 100)
returns table (rank bigint, nickname text, net bigint, bets bigint, is_me boolean)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select rank() over (order by sum(coalesce(b.payout, 0) - b.stake) desc), p.nickname::text,
         sum(coalesce(b.payout, 0) - b.stake)::bigint, count(*), b.user_id = auth.uid()
  from public.bets b join public.profiles p on p.id = b.user_id
  where b.status in ('won', 'lost', 'void') and (p_week is null or b.week = p_week)
  group by b.user_id, p.nickname
  order by sum(coalesce(b.payout, 0) - b.stake) desc, p.nickname
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- ---------------------------------------------------------------------------
-- Admin functions: service role only (the sync job)
-- ---------------------------------------------------------------------------

-- {week, locksAt, events:[{id, type, title, params, settlesFrom, sort, closesAt?,
--    selections:[{id, label, line, americanOdds, decimalOdds, fairProb, market, person, sector, sort}]}]}
-- Creates or refreshes a week's events while they are open. A selection's odds freeze once it has a bet.
-- Open events of the week that are no longer in the file are removed when nobody has bet on them.
create or replace function public.upsert_book(p jsonb) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  wk text := p ->> 'week';
  locks timestamptz := coalesce(p ->> 'locksAt', p ->> 'locks_at')::timestamptz;
  ev jsonb;
  s jsonb;
  cur public.book_events%rowtype;
  n_ev int := 0; n_sel int := 0; n_frozen int := 0; n_skip int := 0; n_gone int := 0;
  ev_ids text[] := '{}';
  sel_ids text[];
  bet_on boolean;
begin
  if coalesce(wk, '') = '' then raise exception 'week is required'; end if;
  if locks is null then raise exception 'locksAt is required'; end if;
  for ev in select * from jsonb_array_elements(coalesce(p -> 'events', '[]'::jsonb)) loop
    ev_ids := ev_ids || (ev ->> 'id');
    select * into cur from public.book_events where id = ev ->> 'id' for update;
    if found and (cur.status <> 'open' or cur.closes_at <= public.game_now()) then n_skip := n_skip + 1; continue; end if;
    if found and cur.week <> wk then raise exception 'event % belongs to week %', cur.id, cur.week; end if;
    insert into public.book_events (id, week, type, title, params, settles_from, sort, closes_at, status, created_at, updated_at)
    values (ev ->> 'id', wk, ev ->> 'type', ev ->> 'title', coalesce(ev -> 'params', '{}'::jsonb), ev ->> 'settlesFrom',
            coalesce((ev ->> 'sort')::int, 0), coalesce((ev ->> 'closesAt')::timestamptz, locks), 'open', now(), now())
    on conflict (id) do update set type = excluded.type, title = excluded.title, params = excluded.params,
      settles_from = excluded.settles_from, sort = excluded.sort, closes_at = excluded.closes_at, updated_at = now();
    n_ev := n_ev + 1;
    sel_ids := '{}';
    for s in select * from jsonb_array_elements(coalesce(ev -> 'selections', '[]'::jsonb)) loop
      sel_ids := sel_ids || (s ->> 'id');
      bet_on := exists (select 1 from public.bet_legs l where l.selection_id = s ->> 'id');
      if exists (select 1 from public.book_selections x where x.id = s ->> 'id' and x.event_id <> ev ->> 'id') then
        raise exception 'selection % belongs to another event', s ->> 'id';
      end if;
      insert into public.book_selections (id, event_id, label, line, american_odds, decimal_odds, fair_prob, meta, sort, updated_at)
      values (s ->> 'id', ev ->> 'id', s ->> 'label', nullif(s ->> 'line', '')::numeric,
              (s ->> 'americanOdds')::int, (s ->> 'decimalOdds')::numeric, nullif(s ->> 'fairProb', '')::numeric,
              jsonb_strip_nulls(jsonb_build_object('market', s ->> 'market', 'person', s ->> 'person', 'sector', s ->> 'sector')),
              coalesce((s ->> 'sort')::int, 0), now())
      on conflict (id) do update set
        label = excluded.label, line = excluded.line, meta = excluded.meta, sort = excluded.sort,
        american_odds = case when bet_on then book_selections.american_odds else excluded.american_odds end,
        decimal_odds = case when bet_on then book_selections.decimal_odds else excluded.decimal_odds end,
        fair_prob = case when bet_on then book_selections.fair_prob else excluded.fair_prob end,
        updated_at = now();
      n_sel := n_sel + 1;
      if bet_on then n_frozen := n_frozen + 1; end if;
    end loop;
    -- selections dropped from this event: removed unless someone bet on them
    delete from public.book_selections x where x.event_id = ev ->> 'id' and not (x.id = any(sel_ids))
      and not exists (select 1 from public.bet_legs l where l.selection_id = x.id);
  end loop;
  -- open events of this week that are gone from the file: removed when nobody bet on them
  with gone as (
    delete from public.book_events e
    where e.week = wk and e.status = 'open' and not (e.id = any(ev_ids))
      and not exists (select 1 from public.book_selections x join public.bet_legs l on l.selection_id = x.id where x.event_id = e.id)
    returning 1
  ) select count(*) into n_gone from gone;
  return json_build_object('week', wk, 'events', n_ev, 'selections', n_sel, 'frozen', n_frozen, 'skipped', n_skip, 'removed', n_gone);
end $$;

create or replace function public.close_due_book() returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  update public.book_events set status = 'closed', updated_at = now() where status = 'open' and closes_at <= public.game_now();
  get diagnostics n = row_count;
  return n;
end $$;

-- {week, results: {selection_id: 'win'|'lose'|'void'}, notes: {event_id: text}}
-- Finalizes the week: every selection of the week without a result gets the given one (missing = void), events become
-- settled (void when every selection is void), then every open bet whose legs all have results is paid:
--   any losing leg -> lost; all legs void -> void (stake back); otherwise won: stake x decimal odds of the winning legs
--   (void legs drop out), rounded down, capped at 10,000. Results already set are never changed, so a rerun is a no-op.
create or replace function public.settle_book(p jsonb) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  wk text := p ->> 'week';
  res jsonb := coalesce(p -> 'results', '{}'::jsonb);
  notes jsonb := coalesce(p -> 'notes', '{}'::jsonb);
  n_sel int; n_ev int; n_bets int := 0; paid bigint := 0;
  b record;
  lg record;
  lost boolean; wins int; prod numeric; amt int; st text;
begin
  if coalesce(wk, '') = '' then raise exception 'week is required'; end if;
  if exists (select 1 from jsonb_each_text(res) r where r.value not in ('win', 'lose', 'void')) then
    raise exception 'results must be win, lose or void';
  end if;
  perform 1 from public.book_events where week = wk order by id for update;
  update public.book_selections s set result = coalesce(res ->> s.id, 'void'), updated_at = now()
  from public.book_events e
  where e.id = s.event_id and e.week = wk and s.result is null;
  get diagnostics n_sel = row_count;
  update public.book_events e set
    status = case when not exists (select 1 from public.book_selections s where s.event_id = e.id and s.result <> 'void') then 'void' else 'settled' end,
    result = jsonb_strip_nulls(jsonb_build_object('note', notes ->> e.id,
      'winners', (select jsonb_agg(s.id order by s.sort) from public.book_selections s where s.event_id = e.id and s.result = 'win'))),
    settled_at = now(), updated_at = now()
  where e.week = wk and e.status in ('open', 'closed');
  get diagnostics n_ev = row_count;

  for b in
    select x.* from public.bets x
    where x.status = 'open'
      and exists (select 1 from public.bet_legs l join public.book_selections s on s.id = l.selection_id join public.book_events e on e.id = s.event_id
                  where l.bet_id = x.id and e.week = wk)
      and not exists (select 1 from public.bet_legs l join public.book_selections s on s.id = l.selection_id
                      where l.bet_id = x.id and s.result is null)
    order by x.created_at, x.id
    for update of x
  loop
    select bool_or(s.result = 'lose'), count(*) filter (where s.result = 'win')
      into lost, wins
    from public.bet_legs l join public.book_selections s on s.id = l.selection_id where l.bet_id = b.id;
    prod := 1;                                          -- exact numeric product of the winning legs' odds
    for lg in select l.decimal_odds_at_bet as d from public.bet_legs l join public.book_selections s on s.id = l.selection_id
              where l.bet_id = b.id and s.result = 'win' loop
      prod := prod * lg.d;
    end loop;
    if lost then st := 'lost'; amt := 0;
    elsif wins = 0 then st := 'void'; amt := b.stake;
    else st := 'won'; amt := least(floor(b.stake * prod), 10000)::int;
    end if;
    update public.bets set status = st, payout = amt, settled_at = public.game_now() where id = b.id;
    if amt > 0 then update public.profiles set coins = coins + amt where id = b.user_id; end if;
    n_bets := n_bets + 1; paid := paid + amt;
  end loop;
  return json_build_object('week', wk, 'selections', n_sel, 'events', n_ev, 'bets', n_bets, 'paid', paid, 'already', n_sel = 0 and n_ev = 0 and n_bets = 0);
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what (Supabase grants EXECUTE on new functions to everyone by default, so reset it)
-- ---------------------------------------------------------------------------
revoke execute on function public.place_bet(text[], int, numeric[]), public.my_bets(int), public.book_leaderboard(text, int),
  public.upsert_book(jsonb), public.close_due_book(), public.settle_book(jsonb)
  from public, anon, authenticated;
grant execute on function public.book_leaderboard(text, int) to anon, authenticated;
grant execute on function public.place_bet(text[], int, numeric[]), public.my_bets(int) to authenticated;
grant execute on function public.upsert_book(jsonb), public.close_due_book(), public.settle_book(jsonb) to service_role;
