// node --test scripts/lib/  (real git in a temp dir for the main test; no network)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safePush, redact } from './safe-push.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
};
const noSleep = async () => {};
const quiet = () => {};

function gitIn(dir) {
  return (args) => execFileSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// The "page builder" for the test repo: pages/index.txt = all inputs/*.txt, sorted, concatenated.
function rebuildIn(dir) {
  const files = readdirSync(join(dir, 'inputs')).filter(f => f.endsWith('.txt')).sort();
  const body = files.map(f => readFileSync(join(dir, 'inputs', f), 'utf8')).join('');
  mkdirSync(join(dir, 'pages'), { recursive: true });
  writeFileSync(join(dir, 'pages', 'index.txt'), body);
  return body;
}

function clone(root, remote, name) {
  const dir = join(root, name);
  execFileSync('git', ['clone', '-q', '-b', 'main', remote, dir], { env: GIT_ENV, stdio: 'ignore' });
  const git = gitIn(dir);
  git(['config', 'user.name', `Test ${name}`]);
  git(['config', 'user.email', `${name}@example.com`]);
  git(['config', 'commit.gpgsign', 'false']);
  return { dir, git };
}

test('two writers: the second rebases, rebuilds pages from both inputs, and pushes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'safe-push-'));
  try {
    const remote = join(root, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: GIT_ENV, stdio: 'ignore' });

    // Seed the remote with one input and its built page.
    const seed = join(root, 'seed');
    mkdirSync(join(seed, 'inputs'), { recursive: true });
    const sg = gitIn(seed);
    sg(['init', '-q', '-b', 'main']);
    sg(['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(seed, 'inputs', 'base.txt'), 'base\n');
    rebuildIn(seed);
    sg(['add', '.']);
    sg(['commit', '-q', '-m', 'seed']);
    sg(['remote', 'add', 'origin', remote]);
    sg(['push', '-q', 'origin', 'main']);

    const A = clone(root, remote, 'a');
    const B = clone(root, remote, 'b');

    // A: new input + rebuilt page, pushed normally.
    writeFileSync(join(A.dir, 'inputs', 'a.txt'), 'from a\n');
    rebuildIn(A.dir);
    A.git(['add', '.']);
    A.git(['commit', '-q', '-m', 'A update']);
    A.git(['push', '-q', 'origin', 'main']);

    // B: a different input + rebuilt page (pages/index.txt now conflicts with A's).
    writeFileSync(join(B.dir, 'inputs', 'b.txt'), 'from b\n');
    rebuildIn(B.dir);

    const res = await safePush({
      git: B.git,
      run: () => rebuildIn(B.dir),
      sleep: noSleep,
      exists: (p) => existsSync(join(B.dir, p)),
      message: 'Morning data 2026-10-25',
      paths: ['inputs', 'pages'],
      rebuild: 'rebuild',
      log: quiet,
    });
    assert.equal(res.pushed, true);
    assert.equal(res.attempts, 1);

    // Check what the remote main now holds, from a fresh clone.
    const C = clone(root, remote, 'c');
    assert.equal(readFileSync(join(C.dir, 'inputs', 'a.txt'), 'utf8'), 'from a\n');
    assert.equal(readFileSync(join(C.dir, 'inputs', 'b.txt'), 'utf8'), 'from b\n');
    const page = readFileSync(join(C.dir, 'pages', 'index.txt'), 'utf8');
    assert.equal(page, 'from a\nfrom b\nbase\n'); // sorted: a.txt, b.txt, base.txt
    // The rebuilt page matches a fresh build from the combined inputs.
    assert.equal(page, rebuildIn(C.dir));
    // B's commit message is kept.
    const subjects = C.git(['log', '--format=%s']).split('\n');
    assert.ok(subjects.includes('Morning data 2026-10-25'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A mocked git: `handlers` maps the first arg (or "rebase --abort" etc.) to a function.
function mockGit(handlers = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    const key2 = args.slice(0, 2).join(' ');
    const h = handlers[key2] || handlers[args[0]];
    if (h) return h(args);
    return '';
  };
  return { git, calls };
}

// Staged changes exist: `git diff --cached --quiet` exits non-zero.
const stagedOnce = () => {
  let n = 0;
  return () => { n++; if (n === 1) throw new Error('exit 1'); return ''; };
};

function assertNoDestructive(calls) {
  for (const c of calls) {
    assert.ok(!/^reset\b/.test(c), `unexpected git ${c}`);
    assert.ok(!/--hard/.test(c), `unexpected git ${c}`);
    assert.ok(!/--force|\s-f(\s|$)/.test(c), `unexpected git ${c}`);
    assert.ok(!/^(branch -D|checkout -- |clean|update-ref -d)/.test(c), `unexpected git ${c}`);
  }
}

test('no staged changes: returns no-changes and makes no commit', async () => {
  const { git, calls } = mockGit({ diff: () => '' });
  const res = await safePush({ git, sleep: noSleep, exists: () => true, message: 'm', paths: ['data'], log: quiet });
  assert.deepEqual(res, { pushed: false, reason: 'no-changes' });
  assert.ok(!calls.some(c => c.startsWith('commit')));
  assert.ok(!calls.some(c => c.startsWith('push')));
});

test('push rejected once, then accepted: retries after the first wait', async () => {
  let pushes = 0;
  const { git, calls } = mockGit({
    diff: stagedOnce(),
    push: () => { pushes++; if (pushes === 1) throw new Error('! [rejected] main -> main (fetch first)'); return ''; },
  });
  const sleeps = [];
  const res = await safePush({
    git, sleep: async (ms) => { sleeps.push(ms); }, exists: () => true,
    message: 'm', paths: ['data'], waitsMs: [5000, 15000, 30000], log: quiet,
  });
  assert.deepEqual(res, { pushed: true, attempts: 2 });
  assert.deepEqual(sleeps, [5000]);
  assert.equal(calls.filter(c => c.startsWith('fetch')).length, 2);
  assert.equal(calls.filter(c => c === 'rebase -X theirs origin/main').length, 2);
  assert.equal(calls.filter(c => c.startsWith('commit')).length, 1);
});

test('all attempts fail: throws, keeps the local commit, no destructive git', async () => {
  const { git, calls } = mockGit({
    diff: stagedOnce(),
    push: () => { throw new Error('! [rejected] main -> main'); },
  });
  const sleeps = [];
  await assert.rejects(
    safePush({ git, sleep: async (ms) => { sleeps.push(ms); }, exists: () => true, message: 'm', paths: ['data'], attempts: 4, log: quiet }),
    /gave up after 4 attempts/
  );
  assert.deepEqual(sleeps, [5000, 15000, 30000]);
  assert.equal(calls.filter(c => c.startsWith('push')).length, 4);
  assertNoDestructive(calls);
});

test('rebase conflict that -X theirs cannot resolve: aborts the rebase and counts the attempt', async () => {
  let rebases = 0;
  const { git, calls } = mockGit({
    diff: stagedOnce(),
    'rebase -X': () => { rebases++; if (rebases === 1) throw new Error('CONFLICT (modify/delete)'); return ''; },
  });
  const res = await safePush({ git, sleep: noSleep, exists: () => true, message: 'm', paths: ['data'], log: quiet });
  assert.deepEqual(res, { pushed: true, attempts: 2 });
  const abortAt = calls.indexOf('rebase --abort');
  assert.ok(abortAt > 0, 'rebase --abort was called');
  // The first attempt never pushed; the abort came before any push.
  assert.ok(calls.findIndex(c => c.startsWith('push')) > abortAt);
  assertNoDestructive(calls);
});

test('missing untracked paths are skipped, tracked ones still staged', async () => {
  const { git, calls } = mockGit({
    'ls-files': (args) => (args[2] === 'gone' ? 'gone/x.json\n' : ''),
    diff: () => '',
  });
  await safePush({ git, sleep: noSleep, exists: (p) => p === 'here', message: 'm', paths: ['here', 'gone', 'never'], log: quiet });
  assert.ok(calls.includes('add -- here gone'));
});

test('redact hides credentials in URLs', () => {
  assert.equal(redact('fatal: https://x-access-token:abc123@github.com/o/r.git'), 'fatal: https://***@github.com/o/r.git');
});
