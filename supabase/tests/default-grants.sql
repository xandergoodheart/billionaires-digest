-- Test-only: Supabase's older project default ("Automatically expose new tables" ON).
-- Every new table/function/sequence in public is granted to all three API roles.
-- The game tests run once with this file and once without it, so the migration is checked both ways:
-- its revokes must hold when these defaults exist, and its grants must be enough when they don't.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
