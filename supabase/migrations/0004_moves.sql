-- Billionaires Digest: "Next Moves" play-money markets on billionaires' next business moves (needs 0001 first).
--
-- Play money only. Coins have no cash value: no purchases, no cash-out, no prizes.
--
-- What is here
--   markets.kind              also allows insider_sell, sale_size and fund_move (insider_buy already existed)
--   set_market_start_odds()   admin only: start a new market at its "starting odds from history" instead of 50%,
--                             by setting q_yes/q_no; refused once anyone has traded or the market is not open
-- The markets themselves are created and resolved with the existing create_market() / resolve_market() from 0001,
-- by scripts/lib/supa/moves-sync.mjs, and only when GAME_MOVES_MARKETS=1 is set for the Game sync job.
--
-- Safe to run more than once, like 0001-0003. It never deletes player data.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_moves.sql

-- ---------------------------------------------------------------------------
-- Market kinds
-- ---------------------------------------------------------------------------
alter table public.markets drop constraint if exists markets_kind_check;
alter table public.markets add constraint markets_kind_check
  check (kind in ('h2h', 'insider_buy', 'sector_top', 'other', 'insider_sell', 'sale_size', 'fund_move'));

-- ---------------------------------------------------------------------------
-- Starting odds
-- ---------------------------------------------------------------------------
-- p_prob between 0.01 and 0.99. price_yes = 1 / (1 + e^((q_no - q_yes) / b)), so q_yes - q_no = b * ln(p / (1 - p)).
-- Only while the market is open and has no trades, so nobody's position is ever repriced.
create or replace function public.set_market_start_odds(p_slug text, p_prob numeric) returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  m public.markets%rowtype;
  d numeric;
begin
  if p_prob is null or p_prob < 0.01 or p_prob > 0.99 then raise exception 'starting odds must be between 0.01 and 0.99'; end if;
  select * into m from public.markets where slug = p_slug for update;
  if not found then raise exception 'unknown market %', p_slug; end if;
  if m.status <> 'open' then
    return json_build_object('slug', p_slug, 'set', false, 'reason', 'not open');
  end if;
  if exists (select 1 from public.trades t where t.market_id = m.id) then
    return json_build_object('slug', p_slug, 'set', false, 'reason', 'already traded');
  end if;
  d := m.b * ln(p_prob / (1 - p_prob));
  update public.markets set q_yes = greatest(d, 0), q_no = greatest(-d, 0) where id = m.id;
  return json_build_object('slug', p_slug, 'set', true, 'price_yes', public.lmsr_price_yes(greatest(d, 0), greatest(-d, 0), m.b));
end $$;

-- Who may call what (Supabase grants EXECUTE on new functions to everyone by default, so reset it)
revoke execute on function public.set_market_start_odds(text, numeric) from public, anon, authenticated;
grant execute on function public.set_market_start_odds(text, numeric) to service_role;
