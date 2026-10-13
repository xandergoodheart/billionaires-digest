# Backups

Two kinds of backup exist.

1. **The code and site files**: dated folders in `~/Documents` and iCloud Drive "Billionaires Digest backups"
   (git bundle + snapshot + private research + checksums). See CLAUDE.md.
2. **The game database** (Supabase): the nightly GitHub workflow `.github/workflows/backup.yml`. This page is about this one.

## What the nightly database backup contains

- Everything in the database's `public` schema: tables **and** their data (player nicknames and coins, rosters, scores,
  leagues, The Book, waitlist signups and emails, events), plus the functions, policies and grants.
- **Not** included: Supabase Auth (`auth.users`: sign-in accounts and their emails) and Supabase's own settings.
  What Supabase itself keeps depends on the project's plan; this backup is our own copy either way.

It runs every night at 07:30 UTC (3:30 AM New York in summer) and can be started by hand
(GitHub → Actions → "Nightly backup" → Run workflow).

## Why it is encrypted

The GitHub repository is public, and so are workflow artifacts. The dump is encrypted with `gpg --symmetric`
(AES-256) using the `BACKUP_PASSPHRASE` secret **before** it is uploaded. Only the `.gpg` file is uploaded; the plain dump
is shredded on the runner. Each backup is kept for 30 days as an artifact named `db-backup-<run id>`.

## Turning it on (owner)

1. Make a long random passphrase (for example, 6+ random words) and save it in your password manager as
   "Billionaires Digest backup passphrase". **Without it the backups cannot be opened.**
2. GitHub → repository Settings → Secrets and variables → Actions → New repository secret:
   name `BACKUP_PASSPHRASE`, value = the passphrase.
3. `SUPABASE_DB_URL` is already set for the Game sync workflow; the backup uses the same secret.

If either secret is missing the workflow prints "Backup skipped" and passes.

## Restoring

You need: the passphrase, `gpg`, and PostgreSQL client tools of the same major version as the database
(`pg_restore`, `psql`; on a Mac: `brew install postgresql@17 gnupg`, adjusting the version).

**Practise this once on a scratch database before you ever need it.**

### 1. Download and decrypt

1. GitHub → Actions → "Nightly backup" → pick the run from the day you want → download the `db-backup-…` artifact
   (a zip) and unzip it. You get `bd-public-<date>.dump.gpg`.
2. Decrypt (asks for the passphrase):

   ```sh
   gpg --output public.dump --decrypt bd-public-<date>.dump.gpg
   ```

3. Look inside without changing anything:

   ```sh
   pg_restore --list public.dump | less
   ```

Treat `public.dump` like the database itself (it holds emails): keep it off shared folders and delete it when done.

### 2a. Look at old data without touching the live database (safest)

Restore into a throwaway local database and query it:

```sh
createdb bd_restore_check
psql bd_restore_check -c 'create role anon; create role authenticated; create role service_role; create schema extensions; create extension citext with schema extensions; create schema auth; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql as $$ select null::uuid $$;'
pg_restore --no-owner --dbname=bd_restore_check public.dump
psql bd_restore_check -c 'select count(*) from public.profiles'
```

(Foreign keys to `auth.users` will report errors in a scratch database because the auth accounts are not in the backup.
That is expected; the tables and rows still load.)

### 2b. Put lost rows back into the live database

Do this only when you know which tables lost data. Take a fresh backup first (run the workflow by hand).

1. Supabase dashboard → Project Settings → Database: copy the **Session pooler** connection string (same as `SUPABASE_DB_URL`).
2. For each damaged table, empty it and load the backup's rows. Triggers (for example the roster check) must be
   off while loading, which `session_replication_role = replica` does:

   ```sh
   export DB='<session pooler connection string>'
   psql "$DB" -c 'truncate public.rosters'          # only the tables you are restoring
   PGOPTIONS='-c session_replication_role=replica' \
     pg_restore --data-only --no-owner --table=rosters --schema=public --dbname="$DB" public.dump
   ```

   Repeat `--table=…` per table (or several `--table` flags). Restore parents before children
   (`profiles` before `rosters`, `team_scores`, `leagues`, `bets`; `waitlist` before `waitlist_leagues` and
   `waitlist_league_members`).
3. Rows that point at sign-in accounts (`profiles.id`, `waitlist.user_id`) only work if those accounts still exist in
   Supabase Auth. If the whole project was lost, players must sign in again and their old rows cannot be re-linked
   automatically.
4. Run the Game sync workflow by hand afterwards: it re-applies `supabase/migrations` (functions, grants, policies)
   and re-syncs scores.

### 3. If the whole Supabase project is gone

1. Create a new project, put its URL and keys in `config/supabase.json` (public URL + publishable key only) and the
   GitHub settings (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`).
2. Run the Game sync workflow once: it creates all tables, functions and policies from `supabase/migrations`.
3. Restore data as in 2b. Without `auth.users`, player accounts cannot be restored; nicknames, scores and waitlist
   emails can be read from the backup (2a) and players re-invited.
