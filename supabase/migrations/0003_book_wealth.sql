-- Billionaires Digest: "The Book" price markets, long-shot stake caps, season leaderboard (needs 0001 and 0002 first).
--
-- Play money only. Coins have no cash value: no purchases, no cash-out, no prizes.
--
-- What is here
--   book_events.type        also allows the price markets: blast, ladder, bracket, race, duel
--   settle_book_events()    settles only the events passed (price markets settle one by one as their prices come in;
--                           settle_book() in 0002 finalizes a whole week and voids anything without a result)
--   book_season_leaderboard()  net, stake and ROI over the whole season, players with 10+ settled bets
-- The long-shot stake caps live in place_bet() in 0002 (its only definition, so re-applying the migrations never
-- leaves an uncapped version in place, even for a moment).
--
-- Safe to run more than once, like 0001/0002.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_book_wealth.sql

-- ---------------------------------------------------------------------------
-- Event types
-- ---------------------------------------------------------------------------
alter table public.book_events drop constraint if exists book_events_type_check;
alter table public.book_events add constraint book_events_type_check
  check (type in ('h2h', 'player_ou', 'futures_top', 'prop_insider', 'prop_sector', 'blast', 'ladder', 'bracket', 'race', 'duel'));

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
revoke execute on function public.settle_book_events(jsonb), public.book_season_leaderboard(int)
  from public, anon, authenticated;
grant execute on function public.book_season_leaderboard(int) to anon, authenticated;
grant execute on function public.settle_book_events(jsonb) to service_role;
