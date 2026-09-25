// The daily game sync (see scripts/supabase-sync.mjs):
//   1. upload recent fantasy weeks and daily points      -> upsert_week, upsert_points
//   2. score weeks: live standings, then final            -> settle_week
//   3. close markets past Friday 4 PM New York            -> close_due_markets
//   4. on Mondays, open the week's markets if missing     -> create_market (same slugs every run)
//   5. resolve closed markets from our data files         -> resolve_market
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeRest } from './rest.mjs';
import { nyDate, nyWeekday, addDays } from './time.mjs';
import { generateMarkets, resolveMarket } from './markets.mjs';

export const RECENT_DAYS = 21;  // weeks that ended more than this many days ago are not re-uploaded
const DAY_BATCH = 20;

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
async function readJsonDir(dir) {
  let names;
  try { names = (await readdir(dir)).filter(f => f.endsWith('.json')).sort(); } catch { return []; }
  const out = [];
  for (const f of names) {
    try { out.push(await readJson(join(dir, f))); } catch (e) { console.warn(`skip ${f}: ${e.message}`); }
  }
  return out;
}
async function optionalJson(p, fallback) { try { return await readJson(p); } catch { return fallback; } }

export async function loadData(root) {
  // draftable may be slugs or objects {slug, name, sector, ...} (what build-fantasy writes); always hand on slugs
  const weeks = (await readJsonDir(join(root, 'data', 'fantasy', 'weeks'))).filter(w => w && w.week && w.start && w.end)
    .map(w => ({ ...w, draftable: (Array.isArray(w.draftable) ? w.draftable : []).map(x => (x && typeof x === 'object' ? x.slug : x)).filter(x => typeof x === 'string' && x) }));
  // people may be a list or an object keyed by slug (what build-fantasy writes); always hand on a list
  // practice days are dropped here, so nothing in the online game (upload, scoring, market results) uses them
  const days = (await readJsonDir(join(root, 'data', 'fantasy', 'days'))).filter(d => d && d.practice !== true && /^\d{4}-\d{2}-\d{2}$/.test(d.date || ''))
    .map(d => ({ ...d, people: (Array.isArray(d.people) ? d.people : Object.entries(d.people || {}).map(([slug, p]) => ({ slug, ...p })))
      .filter(p => p && p.slug && Number.isFinite(Number(p.points))) }));
  const filingsDoc = await optionalJson(join(root, 'data', 'filings', 'latest.json'), { filings: [] });
  const people = {};
  for (const p of await readJsonDir(join(root, 'data', 'people'))) {
    if (p && p.slug && p.name) people[p.slug] = { name: String(p.name).replace(/\s*&\s*family\s*$/i, ''), sector: p.sector || null };
  }
  return { weeks, days, filingsDoc, people };
}

export async function sync({ env = process.env, root, now = new Date(), fetchImpl = fetch, log = console.log } = {}) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    log('Game sync skipped: set SUPABASE_URL (variable) and SUPABASE_SERVICE_KEY (secret) to turn it on. Nothing was changed.');
    return { skipped: true };
  }
  const api = makeRest({ url, key, fetchImpl });
  const data = await loadData(root);
  const today = nyDate(now);
  const summary = { weeks: 0, points: 0, settled: [], closed: 0, created: [], resolved: [] };

  // 1. upload
  // practice weeks stay solo: never uploaded, scored or given markets
  const live = data.weeks.filter(w => w.practice !== true);
  const recent = live.filter(w => w.end >= addDays(today, -RECENT_DAYS));
  if (!data.weeks.length) log('No fantasy weeks in data/fantasy/weeks yet: skipping the fantasy upload.');
  for (const w of recent) {
    await api.rpc('upsert_week', { p: { week: w.week, start: w.start, end: w.end, locksAt: w.locksAt, salaries: w.salaries || {}, draftable: w.draftable || [] } });
    summary.weeks++;
  }
  const days = data.days.filter(d => recent.some(w => d.date >= w.start && d.date <= w.end));
  for (let i = 0; i < days.length; i += DAY_BATCH) {
    const batch = days.slice(i, i + DAY_BATCH).map(d => ({ date: d.date, people: (d.people || []).map(p => ({ slug: p.slug, points: p.points, returnPct: p.returnPct })) }));
    summary.points += Number(await api.rpc('upsert_points', { p: batch })) || 0;
  }

  // 2. settle
  if (recent.length) {
    const rows = await api.select('fantasy_weeks', 'select=week,final&week=in.(' + recent.map(w => `"${w.week.replace(/"/g, '')}"`).join(',') + ')');
    const isFinal = Object.fromEntries((rows || []).map(r => [r.week, !!r.final]));
    for (const w of recent) {
      const haveEnd = data.days.some(d => d.date === w.end);
      const done = today > w.end && (haveEnd || today >= addDays(w.end, 2));
      const locked = w.locksAt && now.getTime() >= new Date(w.locksAt).getTime();
      if (done && !isFinal[w.week]) {
        await api.rpc('settle_week', { p_week: w.week, p_final: true });
        summary.settled.push(`${w.week} (final)`);
      } else if (locked && !done) {
        await api.rpc('settle_week', { p_week: w.week, p_final: false });
        summary.settled.push(`${w.week} (live)`);
      }
    }
  }

  // 3. close
  summary.closed = Number(await api.rpc('close_due_markets', {})) || 0;

  // 4. create this week's markets (Mondays, or any day with GAME_FORCE_MARKETS=1)
  const current = live.filter(w => w.start <= today && today <= w.end).sort((a, b) => b.start.localeCompare(a.start))[0];
  const force = env.GAME_FORCE_MARKETS === '1';
  if (current && (nyWeekday(now) === 1 || force)) {
    const prevWeek = data.weeks.filter(w => w.end < current.start).sort((a, b) => b.end.localeCompare(a.end))[0] || null;
    const specs = generateMarkets({ week: current, people: data.people, filings: data.filingsDoc.filings || [], prevWeek,
      prevDays: prevWeek ? data.days.filter(d => d.date >= prevWeek.start && d.date <= prevWeek.end) : [], now });
    for (const m of specs) {
      if (new Date(m.closes_at) <= now) continue;
      const r = await api.rpc('create_market', { p: m });
      if (r && r.created) summary.created.push(m.slug);
    }
  } else if (!current) {
    log(`No fantasy week covers ${today}: no markets to open.`);
  }

  // 5. resolve
  const due = await api.select('markets', `select=slug,kind,params,closes_at,resolves_by,status&status=in.(open,closed)&closes_at=lte.${encodeURIComponent(now.toISOString())}&order=closes_at.asc`);
  const weeksById = Object.fromEntries(data.weeks.map(w => [w.week, w]));
  for (const m of due || []) {
    const r = resolveMarket(m, { weeks: weeksById, days: data.days, filingsDoc: data.filingsDoc, now });
    if (!r) { log(`waiting on data: ${m.slug}`); continue; }
    const res = await api.rpc('resolve_market', { p_slug: m.slug, p_outcome: r.outcome, p_note: r.note, p_source_url: r.source_url });
    if (!res || !res.already) summary.resolved.push(`${m.slug}: ${r.outcome}`);
  }

  log(`Game sync: ${summary.weeks} week(s), ${summary.points} point row(s), settled [${summary.settled.join(', ')}], ` +
    `closed ${summary.closed}, opened ${summary.created.length}, resolved ${summary.resolved.length}.`);
  for (const s of summary.created) log(`  opened ${s}`);
  for (const s of summary.resolved) log(`  resolved ${s}`);
  return summary;
}
