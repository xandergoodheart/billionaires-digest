// One-time (re-runnable) repair of data/prices/history, data/prices/opens and data/prices/quality.json by replaying
// every committed data/prices/latest.json snapshot, oldest first, through the same close rules as fetch-prices.mjs
// (session dating, final closes only, previous closes, 2% conflict check, no weekend/holiday rows).
// Fixes closes written before those rules: intraday prices stored as closes, and end-of-day OTC/ADR quotes (IDEXY, LVMUY,
// PSKY after 2026-10-05, ...) stored one day early (e.g. PSKY 2026-10-04, a Sunday).
// Needs the git history (a full clone, not the shallow CI checkout). No network, no keys.
//
//   node scripts/fetch-prices-repair.mjs [--root=<site dir to write>] [--git=<repo to read snapshots from>] [--dry-run]
//
// --root defaults to this repo; --git defaults to --root. Rows the snapshots say nothing about are kept as they are.

import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/data-common.mjs';
import { loadStore, saveStore, recordQuote } from './fetch-prices.mjs';

const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };

// latest.json entry -> the Finnhub quote fields recordQuote reads.
export function entryToQuote(e) {
  if (!e || typeof e.time !== 'string') return null;
  const t = Date.parse(e.time);
  if (!Number.isFinite(t)) return null;
  return { c: e.price, pc: e.prevClose, o: e.open, t: Math.floor(t / 1000) };
}

// Replay snapshots [{ generated, quotes }] (oldest first) into a store. Returns the number of quotes replayed.
export function replay(store, snapshots) {
  let n = 0;
  for (const snap of snapshots) {
    const now = Date.parse(snap?.generated);
    if (!Number.isFinite(now)) continue;
    for (const [sym, e] of Object.entries(snap.quotes ?? {})) {
      const q = entryToQuote(e);
      if (!q) continue;
      recordQuote(store, sym, q, now);
      n++;
    }
  }
  return n;
}

function snapshotsFromGit(gitDir) {
  const out = [];
  const log = execFileSync('git', ['-C', gitDir, 'log', '--reverse', '--format=%H', '--', 'data/prices/latest.json'], { encoding: 'utf8' });
  for (const sha of log.split('\n').filter(Boolean)) {
    try {
      out.push(JSON.parse(execFileSync('git', ['-C', gitDir, 'show', `${sha}:data/prices/latest.json`], { encoding: 'utf8', maxBuffer: 64 << 20 })));
    } catch { /* deleted in that commit or unreadable */ }
  }
  return out.sort((a, b) => String(a.generated).localeCompare(String(b.generated)));
}

async function main() {
  const root = resolve(arg('root') ?? ROOT);
  const gitDir = resolve(arg('git') ?? root);
  const pricesDir = join(root, 'data', 'prices');
  const snaps = snapshotsFromGit(gitDir);
  if (!snaps.length) { console.log('No committed data/prices/latest.json snapshots found: nothing to replay.'); return 0; }
  const store = await loadStore(pricesDir);
  const n = replay(store, snaps);
  const last = snaps[snaps.length - 1].generated;
  console.log(`Replayed ${n} quotes from ${snaps.length} snapshots (${snaps[0].generated} .. ${last}).`);
  const conflicts = [...store.conflicts].flatMap(([s, o]) => Object.keys(o).map((d) => `${s} ${d}`));
  console.log(`Open conflicts (quarantined): ${conflicts.length ? conflicts.join(', ') : 'none'}`);
  if (process.argv.includes('--dry-run')) { console.log('Dry run: nothing written.'); return 0; }
  const saved = await saveStore(pricesDir, store, new Date().toISOString(), Date.parse(last));
  console.log(`Wrote ${saved.history} history and ${saved.opens} opens file(s) and quality.json under ${pricesDir}.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
