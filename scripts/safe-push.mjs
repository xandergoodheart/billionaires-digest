// Commit and push with retries; rebuilds generated pages after a rebase.
// Usage: node scripts/safe-push.mjs --message "Morning data 2026-10-25" \
//          [--rebuild "node scripts/build-pages.mjs"] [--attempts 4] -- <paths...>
// Exit code 0 when pushed or there was nothing to commit, 1 on failure (the local commit is kept).

import { safePush } from './lib/safe-push.mjs';

export function parseArgs(argv) {
  const out = { message: null, rebuild: null, attempts: 4, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out.paths = argv.slice(i + 1); break; }
    if (a === '--message') out.message = argv[++i];
    else if (a === '--rebuild') out.rebuild = argv[++i];
    else if (a === '--attempts') out.attempts = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.message) throw new Error('--message is required');
  if (!out.paths.length) throw new Error('list the paths to commit after --');
  if (!Number.isInteger(out.attempts) || out.attempts < 1) throw new Error('--attempts must be a whole number of at least 1');
  return out;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  await safePush(opts);
  process.exit(0);
} catch (err) {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
}
