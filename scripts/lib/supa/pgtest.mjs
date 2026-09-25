// Test helper: a throwaway Postgres (PGlite, in memory) with Supabase-like auth stubs and the game migration.
// Dev only; @electric-sql/pglite is a devDependency.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MIGRATION = join(ROOT, 'supabase', 'migrations', '0001_game.sql');
const STUB = join(ROOT, 'supabase', 'tests', 'auth-stub.sql');
const DEFAULT_GRANTS = join(ROOT, 'supabase', 'tests', 'default-grants.sql');

// Test clock: game_now() reads the test.now setting when present.
const CLOCK = `create or replace function public.game_now() returns timestamptz
language sql stable as $$ select coalesce(nullif(current_setting('test.now', true), '')::timestamptz, now()) $$;`;

// mode 'no-auto-expose': the owner's project setting (new tables are NOT granted to the API roles).
// mode 'supabase-defaults': older projects, where Supabase grants everything to anon/authenticated by default.
export const MODES = ['no-auto-expose', 'supabase-defaults'];

export async function makeDb({ mode = 'no-auto-expose' } = {}) {
  const db = new PGlite({ extensions: { citext } });
  await db.exec(await readFile(STUB, 'utf8'));
  if (mode === 'supabase-defaults') await db.exec(await readFile(DEFAULT_GRANTS, 'utf8'));
  const sql = await readFile(MIGRATION, 'utf8');
  await db.exec(sql);
  await db.exec(sql); // run twice: the migration must be safe to re-apply
  await db.exec(CLOCK);
  const h = {
    db,
    async setNow(iso) { await db.exec(`reset role; select set_config('test.now', '${iso}', false)`); },
    async admin(q, params) { await db.exec('reset role'); await db.exec('set role service_role'); try { return await db.query(q, params); } finally { await db.exec('reset role'); } },
    async root(q, params) { await db.exec('reset role'); return db.query(q, params); },
    async as(uid, q, params) {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
      await db.exec(uid ? 'set role authenticated' : 'set role anon');
      try { return await db.query(q, params); } finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
    },
    // one call as a user, returning the json result of a function
    async call(uid, fn, args = []) {
      const ph = args.map((_, i) => `$${i + 1}`).join(', ');
      const r = await h.as(uid, `select public.${fn}(${ph}) as r`, args);
      return r.rows[0].r;
    },
    async newUser(nickname) {
      const id = randomUUID();
      await h.root('insert into auth.users (id) values ($1)', [id]);
      if (nickname) await h.call(id, 'set_nickname', [nickname]);
      return id;
    },
    async coins(uid) { return Number((await h.root('select coins from public.profiles where id = $1', [uid])).rows[0].coins); }
  };
  return h;
}

// assert.rejects helper that matches the Postgres error message
export async function rejectsWith(assert, p, re) {
  await assert.rejects(p, e => { assert.match(String(e && e.message), re); return true; });
}
