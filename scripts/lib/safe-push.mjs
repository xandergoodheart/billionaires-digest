// Commit and push to main without losing the day's work when two jobs push at once.
//
// Several writers push to main on overlapping schedules (Morning data, the morning edition
// routine, manual backfills). The generated pages (people/, companies/, editions/, guides/,
// sitemap.xml, robots.txt) are a pure function of the inputs, so after a rebase we let our
// replayed commit win any line conflict and then rebuild the pages from the combined inputs.
// If the push is rejected because someone pushed in between, we fetch, rebase, rebuild and
// try again, a few times with growing waits. If every attempt fails we throw: the local
// commit is kept and the job goes red. Never resets, never drops the local commit.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DEFAULT_WAITS_MS = [5000, 15000, 30000];

// Default runners: output captured, throw on non-zero exit.
function defaultGit(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function defaultRun(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function defaultSleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Hide any credentials that might appear in a git error (https://user:token@host).
export function redact(text) {
  return String(text ?? '').replace(/(https?:\/\/)[^\s/@]+@/gi, '$1***@');
}

// First line of an error's message, redacted, for one-line logs.
function errLine(err) {
  const msg = err && (err.stderr || err.message) ? String(err.stderr || err.message) : String(err);
  const line = msg.split('\n').map(s => s.trim()).find(Boolean) || 'unknown error';
  return redact(line);
}

// True when the index has staged changes. `git diff --cached --quiet` exits 1 when it does.
function hasStaged(git) {
  try { git(['diff', '--cached', '--quiet']); return false; } catch { return true; }
}

// Stage paths. A path missing on disk is still staged if git tracks it (a deletion);
// a missing untracked path is skipped so `git add` doesn't fail.
function stagePaths(git, paths, exists, log) {
  const keep = [];
  for (const p of paths) {
    if (exists(p)) { keep.push(p); continue; }
    let tracked = '';
    try { tracked = String(git(['ls-files', '--', p]) || '').trim(); } catch { tracked = ''; }
    if (tracked) keep.push(p);
    else log(`safe-push: skipping missing path ${p}`);
  }
  if (keep.length) git(['add', '--', ...keep]);
}

export async function safePush({
  git = defaultGit,
  run = defaultRun,
  sleep = defaultSleep,
  exists = existsSync,
  message,
  paths,
  rebuild = null,
  rebuildPaths = null,
  attempts = 4,
  waitsMs = DEFAULT_WAITS_MS,
  remote = 'origin',
  branch = 'main',
  log = console.log,
} = {}) {
  if (!message) throw new Error('safe-push: a commit message is required');
  if (!Array.isArray(paths) || !paths.length) throw new Error('safe-push: at least one path is required');
  const total = Math.max(1, Number(attempts) || 1);

  stagePaths(git, paths, exists, log);
  if (!hasStaged(git)) {
    log('No changes');
    return { pushed: false, reason: 'no-changes' };
  }
  git(['commit', '-m', message]);
  log(`safe-push: committed "${message}"`);

  let lastError = 'unknown error';
  for (let n = 1; n <= total; n++) {
    log(`safe-push: attempt ${n} of ${total}`);
    try {
      await attempt(n);
      log(`safe-push: pushed to ${remote}/${branch}`);
      return { pushed: true, attempts: n };
    } catch (err) {
      lastError = err && err.step ? `${err.step}: ${errLine(err.cause)}` : errLine(err);
      log(`safe-push: attempt ${n} failed (${lastError})`);
    }
    if (n < total) {
      const wait = waitsMs.length ? waitsMs[Math.min(n - 1, waitsMs.length - 1)] : 0;
      if (wait > 0) log(`safe-push: waiting ${Math.round(wait / 1000)} s before retrying`);
      await sleep(wait);
    }
  }
  throw new Error(`safe-push: gave up after ${total} attempts; the local commit is kept (last error: ${lastError})`);

  // One fetch → rebase → rebuild → push pass. Throws an error tagged with the failing step.
  async function attempt() {
    step('fetch', () => git(['fetch', remote, branch]));
    try {
      git(['rebase', '-X', 'theirs', `${remote}/${branch}`]);
    } catch (err) {
      try { git(['rebase', '--abort']); } catch { /* nothing to abort */ }
      throw tagged('rebase', err);
    }
    let sha = '';
    try { sha = String(git(['rev-parse', '--short', `${remote}/${branch}`]) || '').trim(); } catch { sha = ''; }
    log(`safe-push: rebased onto ${sha || `${remote}/${branch}`}`);
    if (rebuild) {
      step('rebuild', () => run(rebuild));
      stagePaths(git, rebuildPaths || paths, exists, log);
      if (hasStaged(git)) {
        git(['commit', '-m', `${message} (pages rebuilt after rebase)`]);
        log('safe-push: rebuilt pages and committed the result');
      } else {
        log('safe-push: rebuilt pages (no changes)');
      }
    }
    step('push', () => git(['push', remote, `HEAD:${branch}`]));
  }
}

function tagged(stepName, cause) {
  const e = new Error(`${stepName} failed`);
  e.step = stepName;
  e.cause = cause;
  return e;
}

function step(stepName, fn) {
  try { return fn(); } catch (err) { throw tagged(stepName, err); }
}
