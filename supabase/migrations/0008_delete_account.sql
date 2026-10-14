-- Billionaires Digest: a player deletes their own account and all their data (needs 0001, 0002 and 0005 first).
--
-- privacy.html promises "We delete your account and email on request". This lets a signed-in player (guest/anonymous or
-- email) do it themselves from the account panel (assets/account.js -> BDGame.deleteAccount()).
--
--   delete_my_account()   signed-in callers only; deletes the caller's Supabase Auth user and everything that hangs off it.
--                         Returns {"deleted": true}. Safe to call again (nothing left to delete: still returns true).
--
-- Where each piece of player data goes:
--   auth.users                      deleted here (the email Supabase Auth holds goes with it)
--   profiles                        cascade from auth.users (0001)
--     rosters, team_scores          cascade from profiles (0001)
--     league_members                cascade from profiles (0001)
--     leagues the player owns       handed over first (below); a league with nobody else in it cascades away
--     positions, trades             cascade from profiles (0001)
--     bets -> bet_legs              cascade from profiles -> bets (0002)
--   waitlist (email, codes, ...)    cascade from auth.users via waitlist.user_id (0005)
--     waitlist_league_members       cascade from waitlist (0005)
--     waitlist_leagues they own     handed over first (below); a league with nobody else (who can take it) cascades away
--     other people's referred_by    set to null by the foreign key (0005); their own signups are kept
--   events                          no foreign key (0005), so deleted here: the player's own events, plus the
--                                   referral_signup events other people logged that point at this player as referrer
-- Tables with no player data: name_blocklist, fantasy_weeks, person_points, markets, book_events, book_selections.
--
-- League handover (same rule as leave_league in 0001): the remaining member who joined first (tie: lowest id) becomes owner.
-- Reserved waitlist leagues allow one league per owner (waitlist_leagues.owner_id is unique), so a member who already owns
-- a reserved league is skipped; when nobody else can take it, the league is deleted.
--
-- 0001 is re-applied every day before this file; it does not define or grant this function, so nothing there undoes it.
-- File order (0008 after 0001-0007, all in ONE transaction in the Game sync workflow) keeps this file last anyway.
-- Safe to run more than once. Running the file never deletes data; only a player calling the function does.
--
-- Apply:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0008_delete_account.sql

create or replace function public.delete_my_account() returns json
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  l record;
  heir uuid;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;

  -- 1. Game leagues the player owns: hand each one to the member who joined first, so other players keep their league.
  for l in select x.id from public.leagues x where x.owner = uid order by x.id for update loop
    select m.user_id into heir from public.league_members m
    where m.league_id = l.id and m.user_id <> uid
    order by m.joined_at, m.user_id limit 1;
    if heir is not null then
      update public.leagues set owner = heir where id = l.id;
    end if;   -- nobody else in it: it goes with the profile (cascade)
  end loop;

  -- 2. Reserved waitlist league: same rule, skipping members who already own one (one reserved league per owner).
  select w.id into wid from public.waitlist w where w.user_id = uid;
  if wid is not null then
    for l in select x.id from public.waitlist_leagues x where x.owner_id = wid order by x.id for update loop
      select m.waitlist_id into heir from public.waitlist_league_members m
      where m.league_id = l.id and m.waitlist_id <> wid
        and not exists (select 1 from public.waitlist_leagues o where o.owner_id = m.waitlist_id)
      order by m.joined_at, m.waitlist_id limit 1;
      if heir is not null then
        update public.waitlist_leagues set owner_id = heir where id = l.id;
      end if;   -- nobody can take it: it goes with the waitlist row (cascade)
    end loop;

    -- referral_signup events logged by the people this player referred point at this player's waitlist id
    delete from public.events e where e.name = 'referral_signup' and e.props->>'referrer' = wid::text;
  end if;

  -- 3. The player's own events (no foreign key, so not cascaded).
  delete from public.events e where e.user_id = uid;

  -- 4. The Supabase Auth user. Cascades: profiles -> rosters, team_scores, league_members, leagues left without members,
  --    positions, trades, bets -> bet_legs; waitlist -> waitlist_league_members, reserved league left without an heir.
  delete from auth.users u where u.id = uid;

  return json_build_object('deleted', true);
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase grants EXECUTE on new functions to everyone by default, so reset it.
-- ---------------------------------------------------------------------------
revoke execute on function public.delete_my_account() from public, anon, authenticated;
-- signed-in players only (an anonymous guest sign-in counts as authenticated)
grant execute on function public.delete_my_account() to authenticated;
