// Next Moves in the online game (OFF by default). Called by sync.mjs only when GAME_MOVES_MARKETS=1.
// Needs supabase/migrations/0004_moves.sql applied (new market kinds + set_market_start_odds).
// Source of truth: data/moves/markets.json and data/moves/resolved.json, written by scripts/build-moves.mjs.
//   1. open markets from markets.json that are not in the database yet   -> create_market, then set_market_start_odds
//   2. resolve database markets (slug mv-...) that resolved.json settled   -> resolve_market (backtest rows are never used)
// Closing happens in the main sync (close_due_markets), like every other market.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KINDS, marketPayload } from '../moves.mjs';

export const MOVES_KINDS = new Set(KINDS);
export const SLUG_PREFIX = 'mv-';   // every Next Moves market slug starts with this (insider_buy is also a v1 kind)
export const isMovesMarket = m => !!m && typeof m.slug === 'string' && m.slug.startsWith(SLUG_PREFIX);
export const movesEnabled = env => (env && env.GAME_MOVES_MARKETS) === '1';

async function optionalJson(p, fallback) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; } }

export async function loadMoves(root) {
  const m = await optionalJson(join(root, 'data', 'moves', 'markets.json'), null);
  const r = await optionalJson(join(root, 'data', 'moves', 'resolved.json'), null);
  return { markets: (m && Array.isArray(m.markets)) ? m.markets : null, resolved: (r && Array.isArray(r.resolved)) ? r.resolved.filter(x => x && !x.backtest) : [] };
}

export async function syncMoves({ api, root, now = new Date(), log = console.log }) {
  const out = { created: [], resolved: [], odds: 0 };
  const { markets, resolved } = await loadMoves(root);
  if (!markets) { log('Next Moves: no data/moves/markets.json yet (run node scripts/build-moves.mjs): nothing to open.'); return out; }
  const nowMs = now.getTime();
  // 1. open
  for (const m of markets) {
    if (!isMovesMarket(m) || !MOVES_KINDS.has(m.kind) || m.status === 'closed') continue;
    if (new Date(m.closes_at).getTime() <= nowMs) continue;
    const r = await api.rpc('create_market', { p: marketPayload(m) });
    if (r && r.created) {
      out.created.push(m.slug);
      const p = Number(m.startProb);
      if (Number.isFinite(p) && p >= 0.01 && p <= 0.99 && p !== 0.5) {
        const o = await api.rpc('set_market_start_odds', { p_slug: m.slug, p_prob: p });
        if (o && o.set) out.odds++;
      }
    }
  }
  // 2. resolve
  const bySlug = Object.fromEntries(resolved.map(x => [x.slug, x]));
  if (resolved.length) {
    const due = await api.select('markets', `select=slug,kind,status&slug=like.${SLUG_PREFIX}*&status=in.(open,closed)&order=closes_at.asc`);
    for (const m of due || []) {
      if (!isMovesMarket(m)) continue;
      const r = bySlug[m.slug];
      if (!r || !['yes', 'no', 'void'].includes(r.outcome)) continue;
      const res = await api.rpc('resolve_market', { p_slug: m.slug, p_outcome: r.outcome, p_note: r.note || null, p_source_url: r.source_url || null });
      if (!res || !res.already) out.resolved.push(`${m.slug}: ${r.outcome}`);
    }
  }
  log(`Next Moves: opened ${out.created.length} (starting odds set on ${out.odds}), resolved ${out.resolved.length}.`);
  return out;
}
