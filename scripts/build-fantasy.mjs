// Billionaire Fantasy League data (game only; no real money, no prizes, not financial advice).
//
//   node scripts/build-fantasy.mjs [--now=2026-09-28T14:00:00Z] [--root=<site dir>] [--rebuild-days=10]
//
// Reads data/people, data/ceos/index.json, data/prices/latest.json (which tickers are quoted, for the pool),
// data/prices/networth-est.json (Public Stake Value rank: player order and salary tiers),
// data/prices/history (closes), data/prices/quality.json (quarantined sessions), data/filings/latest.json and
// archive/<date>.json (news counts only; stories are not scored).
// CEOs (data/ceos) join every week's pool as type "ceo" players on their company stock (see scripts/lib/fantasy.mjs).
// Writes:
//   data/fantasy/days/<YYYY-MM-DD>.json  one file per NYSE trading day, written once both that day's close and the
//                                        previous trading day's close are in history (SPY decides); the last
//                                        REBUILD_TRADING_DAYS trading days are rebuilt every run, so late or repaired
//                                        closes correct them. A day file on a non-trading day, or one in that window
//                                        whose closes are not in yet (an old intraday file), is removed.
//   data/fantasy/weeks/<YYYY-Www>.json   salaries frozen when the week file is first written, days, totals, benchmarks
//                                        (a week that has not locked yet and has no CEOs gets them appended, with
//                                        nobody else's salary changed)
//   data/fantasy/index.json              current and draft week, weeks list, latest day, not-draftable list, news counts
// Needs no network and no keys. Files are rewritten only when their content changes (ignoring `generated`).

import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT as REPO_ROOT, loadProfiles, loadCeos, readJson, writeJson, adrSet, stakeTable } from './lib/data-common.mjs';
import {
  core, BENCHMARK_SYMBOL, personPortfolio, scorePersonDay, tickerMove, closeOn, computeSalaries, top5Team, POINTS, MAX_DAY_MOVE_PCT,
  storyMatches, isCeo, ceoPlayer, CEO_SALARY_NOTE, NO_STAKE_SALARY, ADJUST_MAX,
} from './lib/fantasy.mjs';
import { loadSeriesDir } from './fetch-prices.mjs';

export const REBUILD_TRADING_DAYS = 10;
const PRACTICE_LABEL = 'Practice week';

const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };

async function listJson(dir) {
  try { return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
}
const round4 = (x) => Math.round(x * 10000) / 10000;
const sameDoc = (a, b) => JSON.stringify({ ...(a || {}), generated: null }) === JSON.stringify({ ...(b || {}), generated: null });

// The last n NYSE trading days on or before `todayNy`, oldest first.
export function recentTradingDays(todayNy, n = REBUILD_TRADING_DAYS) {
  const out = [];
  let d = core.isTradingDay(todayNy) ? todayNy : core.prevTradingDay(todayNy);
  while (out.length < n) { out.unshift(d); d = core.prevTradingDay(d); }
  return out;
}

// A day is buildable once SPY has both its close and the previous trading day's close.
export const dayReady = (history, date) => core.isTradingDay(date) &&
  closeOn(history, BENCHMARK_SYMBOL, date) != null && closeOn(history, BENCHMARK_SYMBOL, core.prevTradingDay(date)) != null;

// The day file for a trading day, from closes. players: [{ slug, holdings: [{ ticker, weight }] }].
export function buildDay({ date, players, history, conflicts, filings, generated }) {
  const people = {};
  const flagged = new Map();
  for (const p of players) {
    const r = scorePersonDay({ slug: p.slug, holdings: p.holdings || [], history, conflicts, date, filings });
    people[p.slug] = r;
    for (const h of r.holdings) if (h.quarantined) {
      if (!flagged.has(h.ticker)) flagged.set(h.ticker, { ticker: h.ticker, reason: tickerMove(history, conflicts, h.ticker, date).reason, people: [] });
      flagged.get(h.ticker).people.push(p.slug);
    }
  }
  const m = tickerMove(history, conflicts, BENCHMARK_SYMBOL, date);
  const spy = m.stale || m.quarantined
    ? { ticker: BENCHMARK_SYMBOL, changePct: null, points: null, note: m.quarantined ? `SPY quarantined: ${m.reason}` : 'No SPY close for this day' }
    : { ticker: BENCHMARK_SYMBOL, changePct: m.changePct, points: core.spyPoints(m.changePct) };
  if (m.quarantined && !flagged.has(BENCHMARK_SYMBOL)) flagged.set(BENCHMARK_SYMBOL, { ticker: BENCHMARK_SYMBOL, reason: m.reason, people: [] });
  const week = core.isoWeek(date);
  return {
    date, week, generated, practice: core.isPractice(week),
    closes: `${core.prevTradingDay(date)} close -> ${date} close (data/prices/history)`,
    rules: { pricePoints: 'round(portfolio close-to-close return % × 100)', insiderBuy: POINTS.insiderBuy, maxDayMovePct: MAX_DAY_MOVE_PCT },
    spy, people,
    flags: [...flagged.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)),
  };
}

// Who a day scores: the week file's frozen draftable (holdings and weights as of the week's start) when there is one,
// plus anyone in the current pool it lacks (with current holdings).
export function dayPlayers(weekFile, pool) {
  const out = [], seen = new Set();
  for (const p of (weekFile && Array.isArray(weekFile.draftable) ? weekFile.draftable : [])) {
    if (p && p.slug && Array.isArray(p.holdings) && !seen.has(p.slug)) { seen.add(p.slug); out.push(p); }
  }
  for (const p of pool.draftable) if (!seen.has(p.slug)) { seen.add(p.slug); out.push(p); }
  return out;
}
// ceos: data/ceos/index.json people. Every CEO is draftable (their company stock is a US listing; a day without a
// fresh quote counts 0%, like any stale quote). A CEO slug that is also a billionaire slug is skipped.
// stakeRank: { slug: n } Public Stake Value rank (data-common stakeTable). A player's `rank` is that rank (null without
// one); the index's list rank is not used.
export function buildPool(indexPeople, profiles, quotes, ceos = [], stakeRank = {}) {
  const bySlug = new Map(profiles.map((p) => [p.slug, p]));
  const adrs = adrSet(profiles);
  const draftable = [], notDraftable = [];
  for (const ip of indexPeople) {
    const prof = bySlug.get(ip.slug);
    const base = { slug: ip.slug, name: ip.name, rank: stakeRank?.[ip.slug] ?? null, sector: ip.sector || 'Other' };
    const pf = prof ? personPortfolio(prof, quotes, adrs) : { holdings: [], method: null };
    if (!pf.holdings.length) { notDraftable.push({ ...base, reason: 'No daily market price (private wealth)' }); continue; }
    draftable.push({ ...base, method: pf.method, holdings: pf.holdings.map((h) => ({ ticker: h.ticker, name: h.name, weight: round4(h.weight), tier: h.tier, ...(h.adr ? { adr: true } : {}) })) });
  }
  const taken = new Set(indexPeople.map((p) => p.slug));
  for (const c of ceos) {
    if (!c || !c.slug || !c.name || !c.ticker || taken.has(c.slug)) continue;
    taken.add(c.slug);
    draftable.push(ceoPlayer(c));
  }
  return { draftable, notDraftable };
}

function weekLabel(id) {
  const info = core.weekInfo(id);
  if (core.isPractice(id)) return PRACTICE_LABEL;
  return core.isPreseason(id) ? `Preseason week of ${info.start}` : `Week of ${info.start}`;
}

export function salaryMethodText(adjusted, withCeos) {
  const tiers = `Public Stake Value rank tiers among draftable (no stake on file: ${NO_STAKE_SALARY})`;
  const base = adjusted ? `${tiers} ±${ADJUST_MAX} by recent points percentile` : tiers;
  return withCeos ? `${base}; ${CEO_SALARY_NOTE}` : base;
}

export function newWeekFile(id, pool, history, createdAt) {
  const info = core.weekInfo(id);
  const { salaries, adjusted } = computeSalaries(pool.draftable, history);
  return {
    week: id, label: weekLabel(id), practice: core.isPractice(id),
    start: info.start, end: info.end, locksAt: new Date(info.locksAt).toISOString(),
    createdAt, cap: core.CAP, picks: core.PICKS, captainMultiplier: core.CAPTAIN_MULT,
    salaryMethod: salaryMethodText(adjusted, pool.draftable.some(isCeo)),
    salaries,
    draftable: pool.draftable.filter((p) => salaries[p.slug] != null),
    days: [], daily: {}, spyDaily: {}, totals: {},
    benchmarks: { spy: null, top5: null, perfect: null },
    final: false,
  };
}

// A week file written before CEOs joined: when it has not locked yet (now < locksAt) and is not final, append the
// CEOs from the pool that it lacks. Their salaries follow the same rule as a new week (computeSalaries on the week's
// billionaires plus the CEOs, with the same history); nobody already in the file changes salary.
// Returns { wk, added: [slug] } (wk unchanged when nothing is added).
export function addCeosToWeek(wk, pool, history, now) {
  if (!wk || wk.final || !(now < Date.parse(wk.locksAt))) return { wk, added: [] };
  const have = wk.salaries || {};
  const missing = pool.draftable.filter((p) => isCeo(p) && have[p.slug] == null);
  if (!missing.length) return { wk, added: [] };
  const bill = (wk.draftable || []).filter((p) => p && !isCeo(p) && have[p.slug] != null);
  const { salaries, adjusted } = computeSalaries([...bill, ...missing], history);
  const next = { ...wk, salaries: { ...have }, draftable: [...(wk.draftable || [])] };
  for (const p of missing) { next.salaries[p.slug] = salaries[p.slug]; next.draftable.push(p); }
  next.salaryMethod = salaryMethodText(adjusted, true);
  return { wk: next, added: missing.map((p) => p.slug) };
}

// Recompute days, totals and benchmarks of a week file from the day files.
export function scoreWeek(wk, dayFiles, todayNy) {
  const days = Object.keys(dayFiles).filter((d) => d >= wk.start && d <= wk.end).sort();
  const slugs = Object.keys(wk.salaries);
  const totals = Object.fromEntries(slugs.map((s) => [s, 0]));
  const daily = {}, spyDaily = {};
  let spy = null;
  for (const d of days) {
    const f = dayFiles[d];
    daily[d] = {};
    for (const s of slugs) {
      const p = f.people?.[s]?.points ?? 0;
      daily[d][s] = p;
      totals[s] += p;
    }
    const sp = f.spy?.points;
    spyDaily[d] = typeof sp === 'number' ? sp : null;
    if (typeof sp === 'number') spy = (spy ?? 0) + sp;
  }
  const t5 = top5Team(wk.draftable);
  const top5 = t5.picks.length === core.PICKS ? {
    picks: t5.picks, captain: t5.captain,
    points: days.reduce((sum, d) => sum + core.teamDay(t5.picks, t5.captain, dayFiles[d]).total, 0),
  } : null;
  const ended = todayNy > wk.end;
  let perfect = null;
  if (ended && days.length) {
    const best = core.perfectTeam(totals, wk.salaries, wk.cap ?? core.CAP, wk.picks ?? core.PICKS);
    if (best) perfect = { picks: best.picks, captain: best.captain, points: best.points, salary: best.salary, method: 'exact search (dynamic programming over salary and picks)' };
  }
  return { ...wk, days, daily, spyDaily, totals, benchmarks: { spy, top5, perfect }, final: ended };
}

async function main() {
  const ROOT = arg('root') ?? REPO_ROOT;
  const OUT = join(ROOT, 'data', 'fantasy');
  const DAYS = join(OUT, 'days');
  const WEEKS = join(OUT, 'weeks');
  const nowArg = arg('now');
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  if (!Number.isFinite(now)) throw new Error(`bad --now: ${nowArg}`);
  const todayNy = core.nyDate(now);
  const generated = new Date(now).toISOString();

  const index = await readJson(join(ROOT, 'data', 'people', 'index.json'), { people: [] });
  const indexPeople = (index.people ?? []).filter((p) => p && p.slug);
  const profiles = await loadProfiles();
  const prices = await readJson(join(ROOT, 'data', 'prices', 'latest.json'), null);
  const quotes = prices?.quotes ?? {};
  const history = await loadSeriesDir(join(ROOT, 'data', 'prices', 'history'));
  const conflicts = (await readJson(join(ROOT, 'data', 'prices', 'quality.json'), {}))?.conflicts ?? {};
  const filings = (await readJson(join(ROOT, 'data', 'filings', 'latest.json'), { filings: [] })).filings ?? [];
  const editions = ((await readJson(join(ROOT, 'archive', 'index.json'), { editions: [] })).editions ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

  const ceos = await loadCeos();
  const stakes = stakeTable(await readJson(join(ROOT, 'data', 'prices', 'networth-est.json'), null));
  const pool = buildPool(indexPeople, profiles, quotes, ceos, stakes.rank);
  console.log(`Draftable: ${pool.draftable.length} (${pool.draftable.filter(isCeo).length} CEOs); not draftable: ${pool.notDraftable.length}`);

  // ---- day files (closes only) ----
  const nDays = Number(arg('rebuild-days') ?? REBUILD_TRADING_DAYS);
  if (!(Number.isInteger(nDays) && nDays >= 1 && nDays <= 300)) throw new Error(`bad --rebuild-days: ${arg('rebuild-days')}`);
  const window = recentTradingDays(todayNy, nDays);
  const removeDay = async (d, why) => { await unlink(join(DAYS, `${d}.json`)); console.log(`Removed day ${d}: ${why}.`); };
  for (const d of await listJson(DAYS)) {
    if (!core.isTradingDay(d)) await removeDay(d, 'not an NYSE trading day');
    else if (d >= window[0] && !dayReady(history, d)) await removeDay(d, 'its closes are not in yet (built from intraday quotes)');
  }
  const weekCache = {};
  const weekFileOf = async (id) => (id in weekCache ? weekCache[id] : (weekCache[id] = await readJson(join(WEEKS, `${id}.json`), null)));
  let written = 0;
  for (const d of window) {
    if (!dayReady(history, d)) { console.log(`Day ${d}: waiting for closes.`); continue; }
    const doc = buildDay({ date: d, players: dayPlayers(await weekFileOf(core.isoWeek(d)), pool), history, conflicts, filings, generated });
    const path = join(DAYS, `${d}.json`);
    if (sameDoc(await readJson(path, null), doc)) continue;
    await writeJson(path, doc, { pretty: false });
    written++;
    console.log(`Wrote day ${d}${doc.practice ? ' (practice)' : ''}: ${Object.keys(doc.people).length} people; SPY ${doc.spy.points ?? 'n/a'}` +
      (doc.flags.length ? `; quarantined ${doc.flags.map((f) => f.ticker).join(', ')}` : '') + '.');
  }
  console.log(`Day files: ${written} written; window ${window[0]}..${window[window.length - 1]}.`);

  // ---- weeks ----
  const dayIds = await listJson(DAYS);
  const dayFiles = {};
  for (const d of dayIds) dayFiles[d] = await readJson(join(DAYS, `${d}.json`), null);
  for (const d of Object.keys(dayFiles)) if (!dayFiles[d]) delete dayFiles[d];

  const want = new Set(await listJson(WEEKS));
  const firstWeek = dayIds.length ? core.isoWeek(dayIds[0]) : core.lockedWeek(now);
  for (const d of dayIds) want.add(core.isoWeek(d));
  for (const w of [core.lockedWeek(now), core.draftWeek(now)]) if (w >= firstWeek) want.add(w);

  const weekIds = [...want].sort();
  const finishedReal = [];
  const weekSummaries = [];
  for (const id of weekIds) {
    const path = join(WEEKS, `${id}.json`);
    let wk = await readJson(path, null);
    if (!wk) {
      wk = newWeekFile(id, pool, finishedReal, generated);
      console.log(`New week ${id} (${wk.label}): salaries frozen for ${Object.keys(wk.salaries).length} people.`);
    } else {
      const r = addCeosToWeek(wk, pool, finishedReal, now);
      if (r.added.length) {
        wk = r.wk;
        console.log(`Week ${id} has not locked: added ${r.added.length} CEOs (${r.added.map((s) => `${s} ${wk.salaries[s]}`).join(', ')}); other salaries unchanged.`);
      }
    }
    const before = JSON.stringify(wk);
    if (!wk.final || wk.benchmarks?.perfect == null || wk.end >= window[0]) wk = scoreWeek(wk, dayFiles, todayNy);
    if (JSON.stringify(wk) !== before) await writeJson(path, wk);
    // Salary history ("recent form" for the ±adjustment) keeps using preseason weeks: it is price information about
    // the players, not anyone's score, so the Season 1 reset does not apply to it.
    if (wk.final && !wk.practice) finishedReal.push(wk);
    // label recomputed (older week files froze "Week of …" before the preseason existed); preseason: never counts in Season 1
    weekSummaries.push({ week: wk.week, label: weekLabel(wk.week), practice: wk.practice, preseason: core.isPreseason(wk.week), start: wk.start, end: wk.end, locksAt: wk.locksAt, days: wk.days.length, final: wk.final });
  }

  // news in the last 7 editions (draft room column)
  const news = {};
  for (const d of editions.slice(-7)) {
    const ed = await readJson(join(ROOT, 'archive', `${d}.json`), null);
    for (const s of Array.isArray(ed?.stories) ? ed.stories : []) {
      for (const p of pool.draftable) if (storyMatches(s, p.name)) news[p.slug] = (news[p.slug] || 0) + 1;
    }
  }

  const latestDay = dayIds[dayIds.length - 1] ?? null;
  await writeJson(join(OUT, 'index.json'), {
    generated,
    currentWeek: core.lockedWeek(now),
    draftWeek: core.draftWeek(now),
    practiceWeeks: weekSummaries.filter((w) => w.practice).map((w) => w.week),
    firstRealWeek: core.FIRST_REAL_WEEK,
    seasonStartWeek: core.SEASON_START_WEEK,   // Season 1: totals, records and streaks count only weeks from here
    latestDay,
    weeks: weekSummaries,
    news, newsEditions: editions.slice(-7),
    notDraftable: pool.notDraftable,
    disclaimer: 'Game only. No real money, no prizes, not financial advice. Scores use public prices and disclosed holdings and are approximate.',
  });
  console.log(`Weeks: ${weekIds.join(', ')}; latest day ${latestDay ?? 'none'}; current ${core.lockedWeek(now)}, draft ${core.draftWeek(now)}.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((code) => process.exit(code), (err) => { console.error(err); process.exit(1); });
}
