-- Local/dev sample data only. Never run this against the live project.
-- Run after 0001_game.sql, e.g. psql "$LOCAL_DB_URL" -f supabase/seed.sql
select public.upsert_week('{
  "week": "2026-W40", "start": "2026-09-28", "end": "2026-10-02", "locksAt": "2026-09-28T13:30:00Z",
  "salaries": {"elon-musk": 30, "jeff-bezos": 28, "bill-gates": 20, "warren-buffett": 18, "larry-page": 15, "michael-dell": 12},
  "draftable": ["elon-musk", "jeff-bezos", "bill-gates", "warren-buffett", "larry-page", "michael-dell"]
}'::jsonb);

select public.create_market('{
  "slug": "h2h-2026-w40-elon-musk-vs-jeff-bezos", "kind": "h2h",
  "question": "Will Elon Musk out-score Jeff Bezos in the fantasy league this week?",
  "params": {"week": "2026-W40", "a": "elon-musk", "b": "jeff-bezos", "aName": "Elon Musk", "bName": "Jeff Bezos"},
  "closes_at": "2026-10-02T20:00:00Z", "resolves_by": "2026-10-04T03:59:00Z"
}'::jsonb);
