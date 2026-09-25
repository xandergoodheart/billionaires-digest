-- Test-only stand-in for what a Supabase project already has: the auth schema, auth.uid(),
-- and the anon / authenticated / service_role roles with Supabase's default grants.
-- Used by scripts/lib/supa/sql.test.mjs (PGlite). Never run this against a real project.

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key, is_anonymous boolean not null default true);

-- Same idea as Supabase: the user id comes from the request's JWT claims.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
