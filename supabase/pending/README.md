# Held-back migrations

SQL here is tested (scripts/lib/supa/pgtest.mjs loads it) but NOT applied by the Game sync workflow,
which only applies supabase/migrations/*.sql.

- `0004_moves.sql`: Next Moves online markets. Held back at the v3 launch (2026-09-29) until the owner
  approves turning Next Moves on. To launch: move it to supabase/migrations/ and set GAME_MOVES_MARKETS=1.
