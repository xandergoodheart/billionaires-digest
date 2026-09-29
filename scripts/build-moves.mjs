// Next Moves: build the play-money markets on billionaires' next business moves from our own data files.
//
//   node scripts/build-moves.mjs                 (uses the current time)
//   node scripts/build-moves.mjs --now=2026-09-27T12:00:00Z
//
// Reads  data/filings/latest.json, data/13f/*.json, data/people/*.json, and the last data/moves/*.json
// Writes data/moves/markets.json   open markets (and closed ones waiting for filings), with starting odds from history
//        data/moves/resolved.json  resolved markets (outcome, note, source_url) plus a backtest of past months
// Deterministic for the same inputs and --now. Missing data is skipped with a note; it never invents a market.
// See docs/MOVES-PLAN.md and scripts/lib/moves.mjs.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMoves, SKIPPED } from './lib/moves.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(p, fallback) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; } }
async function readDir(dir) {
  let names = [];
  try { names = (await readdir(dir)).filter(f => f.endsWith('.json')).sort(); } catch { return []; }
  const out = [];
  for (const f of names) { const d = await readJson(join(dir, f), null); if (d) out.push({ file: f, data: d }); }
  return out;
}

export async function run({ root = ROOT, now = new Date(), log = console.log } = {}) {
  const filingsDoc = await readJson(join(root, 'data', 'filings', 'latest.json'), null);
  if (!filingsDoc || !Array.isArray(filingsDoc.filings)) log('build-moves: no data/filings/latest.json: Form 4 markets skipped.');
  const thirteenF = (await readDir(join(root, 'data', '13f'))).filter(x => x.file !== 'index.json' && x.data && x.data.slug).map(x => x.data);
  if (!thirteenF.length) log('build-moves: no 13F files in data/13f: fund markets skipped.');
  const people = {};
  for (const { file, data } of await readDir(join(root, 'data', 'people'))) {
    if (file === 'index.json' || !data || !data.slug || !data.name) continue;
    people[data.slug] = { name: String(data.name) };
  }
  if (!Object.keys(people).length) { log('build-moves: no people profiles in data/people: nothing to build.'); return null; }
  const outDir = join(root, 'data', 'moves');
  const prev = await readJson(join(outDir, 'markets.json'), { markets: [] });
  const prevRes = await readJson(join(outDir, 'resolved.json'), { resolved: [] });
  const { markets, resolved, backtest } = buildMoves({ filingsDoc, thirteenF, people, now, prevMarkets: prev.markets || [], prevResolved: prevRes.resolved || [] });

  const sources = {
    filings: filingsDoc ? { file: 'data/filings/latest.json', generated: filingsDoc.generated || null, windowDays: filingsDoc.windowDays || null } : null,
    thirteenF: thirteenF.length ? { files: 'data/13f/*.json', generated: thirteenF.map(d => d.generated).filter(Boolean).sort().pop() || null } : null
  };
  const common = {
    playMoney: 'Play money only. Coins have no cash value: no purchases, cash-out or prizes. Not financial advice.',
    sources
  };
  await mkdir(outDir, { recursive: true });
  const marketsDoc = {
    title: 'Next Moves',
    note: 'Yes/no markets on billionaires\' next business moves, created and resolved only from public SEC filings in our data. Starting odds come from each person\'s own filing history (50% when the history is too thin).',
    asOf: new Date(now).toISOString(),
    ...common,
    skipped: SKIPPED,
    markets
  };
  const resolvedDoc = {
    title: 'Next Moves: results',
    asOf: new Date(now).toISOString(),
    ...common,
    resolved,
    backtestNote: 'Backtest: the same questions for complete past months, checked against SEC filings. They were never open for trading.',
    backtest
  };
  await writeFile(join(outDir, 'markets.json'), JSON.stringify(marketsDoc, null, 2) + '\n');
  await writeFile(join(outDir, 'resolved.json'), JSON.stringify(resolvedDoc, null, 2) + '\n');
  const open = markets.filter(m => m.status === 'open').length;
  log(`build-moves: ${open} open market(s), ${markets.length - open} waiting for filings, ${resolved.length} resolved, ${backtest.length} backtest result(s).`);
  return { markets, resolved, backtest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.find(a => a.startsWith('--now='));
  const now = arg ? new Date(arg.slice(6)) : new Date();
  if (Number.isNaN(now.getTime())) { console.error('build-moves: --now must be an ISO date'); process.exit(1); }
  run({ now }).catch(e => { console.error(`build-moves failed: ${e.message}`); process.exit(1); });
}
