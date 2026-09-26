-- Billionaires Digest: "The Book" price markets, long-shot stake caps, season leaderboard (needs 0001 and 0002 first).
--
-- Play money only. Coins have no cash value: no purchases, no cash-out, no prizes.
--
-- What is here
--   book_events.type        also allows the price markets: blast, ladder, bracket, race, duel
--   place_bet()             same checks as 0002, plus long-shot caps: combined decimal odds >= 21.0 -> at most 50 coins,
--                           >= 6.0 -> at most 150 coins (otherwise 500)
--   settle_book_events()    settles only the events passed (price markets settle one by one as their closes come in;
--                           settle_book() in 0002 finalizes a whole week and voids anything without a result)
--   book_season_leaderboard()  net, stake and ROI over the whole season, players with 10+ settled bets
--
-- Safe to run more than once, like 0001/0002. The daily job applies every migration in order, so this file's
-- place_bet always replaces 0002's.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_book_wealth.sql

-- ---------------------------------------------------------------------------
-- Event types
-- ---------------------------------------------------------------------------
alter table public.book_events drop constraint if exists book_events_type_check;
alter table public.book_events add constraint book_events_type_check
  check (type in ('h2h', 'player_ou', 'futures_top', 'prop_insider', 'prop_sector', 'blast', 'ladder', 'bracket', 'race', 'duel'));

-- ---------------------------------------------------------------------------
-- place_bet: 0002's version plus long-shot stake caps
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- settle_book_events: settle only the events passed
-- ---------------------------------------------------------------------------
-- {week, events: [event_id], results: {selection_id: 'win'|'lose'|'void'}, notes: {event_id: text}}
-- Only events of that week that are still open or closed AND whose betting has closed (closes_at <= now) are touched;
-- anything else in the list is skipped. Their selections without a result get the given one (missing = void), the events
-- become settled (void when every selection is void), then every open bet with a leg in them whose legs all have results
-- is paid exactly like settle_book. Results already set are never changed, so a rerun is a no-op.
create or replace function public.settle_book_events(p jsonb) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  wk text := p ->> 'week';
  res jsonb := coalesce(p -> 'results', '{}'::jsonb);
  notes jsonb := coalesce(p -> 'notes', '{}'::jsonb);
  asked text[];
  todo text[];
  n_sel int; n_ev int; n_bets int := 0; paid bigint := 0;
  b record;
  lg record;
  lost boolean; wins int; prod numeric; amt int; st text;
begin
  if coalesce(wk, '') = '' then raise exception 'week is required'; end if;
  if jsonb_typeof(coalesce(p -> 'events', '[]'::jsonb)) <> 'array' then raise exception 'events must be a list of event ids'; end if;
  if exists (select 1 from jsonb_each_text(res) r where r.value not in ('win', 'lose', 'void')) then
    raise exception 'results must be win, lose or void';
  end if;
  select coalesce(array_agg(x), '{}') into asked from jsonb_array_elements_text(coalesce(p -> 'events', '[]'::jsonb)) x;
  perform 1 from public.book_events where id = any(asked) order by id for update;
  select coalesce(array_agg(e.id order by e.id), '{}') into todo from public.book_events e
  where e.id = any(asked) and e.week = wk and e.status in ('open', 'closed') and e.closes_at <= public.game_now();

  update public.book_selections s set result = coalesce(res ->> s.id, 'void'), updated_at = now()
  where s.event_id = any(todo) and s.result is null;
  get diagnostics n_sel = row_count;
  update public.book_events e set
    status = case when not exists (select 1 from public.book_selections s where s.event_id = e.id and s.result <> 'void') then 'void' else 'settled' end,
    result = jsonb_strip_nulls(jsonb_build_object('note', notes ->> e.id,
      'winners', (select jsonb_agg(s.id order by s.sort) from public.book_selections s where s.event_id = e.id and s.result = 'win'))),
    settled_at = now(), updated_at = now()
  where e.id = any(todo);
  get diagnostics n_ev = row_count;

  for b in
    select x.* from public.bets x
    where x.status = 'open'
      and exists (select 1 from public.bet_legs l join public.book_selections s on s.id = l.selection_id
                  where l.bet_id = x.id and s.event_id = any(todo))
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
  return json_build_object('week', wk, 'events', n_ev, 'selections', n_sel, 'bets', n_bets, 'paid', paid,
    'skipped', coalesce(array_length(asked, 1), 0) - n_ev, 'already', n_sel = 0 and n_ev = 0 and n_bets = 0);
end $$;

-- ---------------------------------------------------------------------------
-- Season leaderboard (public): settled bets (won, lost, void), coins staked, net (payouts minus stakes), ROI = net / staked.
-- Only players with 10 or more settled bets. Nickname only.
-- ---------------------------------------------------------------------------
create or replace function public.book_season_leaderboard(p_limit int default 100)
returns table (rank bigint, nickname text, bets bigint, staked bigint, net bigint, roi numeric, is_me boolean)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select rank() over (order by sum(coalesce(b.payout, 0) - b.stake) desc), p.nickname::text,
         count(*), sum(b.stake)::bigint, sum(coalesce(b.payout, 0) - b.stake)::bigint,
         round(sum(coalesce(b.payout, 0) - b.stake)::numeric / nullif(sum(b.stake), 0), 4),
         b.user_id = auth.uid()
  from public.bets b join public.profiles p on p.id = b.user_id
  where b.status in ('won', 'lost', 'void')
  group by b.user_id, p.nickname
  having count(*) >= 10
  order by sum(coalesce(b.payout, 0) - b.stake) desc, p.nickname
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- ---------------------------------------------------------------------------
-- Who may call what (Supabase grants EXECUTE on new functions to everyone by default, so reset it)
-- ---------------------------------------------------------------------------
revoke execute on function public.place_bet(text[], int, numeric[]), public.settle_book_events(jsonb),
  public.book_season_leaderboard(int)
  from public, anon, authenticated;
grant execute on function public.book_season_leaderboard(int) to anon, authenticated;
grant execute on function public.place_bet(text[], int, numeric[]) to authenticated;
grant execute on function public.settle_book_events(jsonb) to service_role;
