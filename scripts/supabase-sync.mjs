// Push the fantasy league's data to Supabase, score weeks, run The Book (upload odds, close at the lock, settle),
// and close/resolve any play-money LMSR markets still open (no new ones are opened unless GAME_LMSR_MARKETS=1).
// Runs daily from .github/workflows/game.yml. Needs SUPABASE_URL and SUPABASE_SERVICE_KEY;
// without them it prints a note and exits 0 without changing anything.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/supabase-sync.mjs
//   GAME_FORCE_MARKETS=1 opens this week's markets on a day other than Monday (if they are missing).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sync } from './lib/supa/sync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  await sync({ root: ROOT });
} catch (e) {
  console.error(`Game sync failed: ${e.message}`);
  process.exit(1);
}
