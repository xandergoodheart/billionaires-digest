// Billionaire Fantasy League data (game only; no real money, no prizes, not financial advice).
//
//   node scripts/build-fantasy.mjs [--now=2026-09-28T14:00:00Z] [--force-day]
//
// Reads data/people, data/ceos/index.json, data/prices/latest.json, data/filings/latest.json and archive/<date>.json.
// CEOs (data/ceos) join every week's pool as type "ceo" players on their company stock (see scripts/lib/fantasy.mjs).
// Writes:
//   data/fantasy/days/<YYYY-MM-DD>.json  one file per trading day (New York date of the quotes); never duplicated
//   data/fantasy/weeks/<YYYY-Www>.json   salaries frozen when the week file is first written, days, totals, benchmarks
//                                        (a week that has not locked yet and has no CEOs gets them appended, with
//                                        nobody else's salary changed)
//   data/fantasy/index.json              current and draft week, weeks list, latest day, not-draftable list, news counts
// Needs no network and no keys. Skips the day file when the quotes are not from a new trading day.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadProfiles, loadCeos, readJson, writeJson, adrSet } from './lib/data-common.mjs';
import {
  core, BENCHMARK_SYMBOL, personPortfolio, scorePersonDay, tradingDateOf, computeSalaries, top5Team, POINTS, storyMatches,
  isCeo, ceoPlayer, CEO_SALARY_NOTE,
} from './lib/fantasy.mjs';

const OUT = join(ROOT, 'data', 'fantasy');
const DAYS = join(OUT, 'days');
const WEEKS = join(OUT, 'weeks');
const PRACTICE_LABEL = 'Practice week';

const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const flag = (name) => process.argv.includes(`--${name}`);

async function listJson(dir) {
  try { return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
}
const round4 = (x) => Math.round(x * 10000) / 10000;

// ceos: data/ceos/index.json people. Every CEO is draftable (their company stock is a US listing; a day without a
// fresh quote counts 0%, like any stale quote). A CEO slug that is also a billionaire slug is skipped.
export function buildPool(indexPeople, profiles, quotes, ceos = []) {
  const bySlug = new Map(profiles.map((p) => [p.slug, p]));
  const adrs = adrSet(profiles);
  const draftable = [], notDraftable = [];
  for (const ip of indexPeople) {
    const prof = bySlug.get(ip.slug);
    const base = { slug: ip.slug, name: ip.name, rank: ip.rank, sector: ip.sector || 'Other' };
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
  return core.isPractice(id) ? PRACTICE_LABEL : `Week of ${info.start}`;
}

export function salaryMethodText(adjusted, withCeos) {
  const base = adjusted ? `Forbes-rank tiers ±${4} by recent points percentile` : 'Forbes-rank tiers among draftable';
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
  const filings = (await readJson(join(ROOT, 'data', 'filings', 'latest.json'), { filings: [] })).filings ?? [];
  const editions = ((await readJson(join(ROOT, 'archive', 'index.json'), { editions: [] })).editions ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

  const ceos = await loadCeos();
  const pool = buildPool(indexPeople, profiles, quotes, ceos);
  console.log(`Draftable: ${pool.draftable.length} (${pool.draftable.filter(isCeo).length} CEOs); not draftable: ${pool.notDraftable.length}`);

  // ---- day file ----
  const tradingDate = Object.keys(quotes).length ? tradingDateOf(quotes) : null;
  const existingDays = await listJson(DAYS);
  const latestExisting = existingDays[existingDays.length - 1] ?? null;
  if (!tradingDate) console.log('No quotes: no day file.');
  else if (!core.isWeekday(tradingDate)) console.log(`Quotes are from ${tradingDate}, a weekend: no day file.`);
  else if (existingDays.includes(tradingDate) && !flag('force-day')) console.log(`Day ${tradingDate} already written: not duplicated.`);
  else if (latestExisting && tradingDate < latestExisting) console.log(`Quotes (${tradingDate}) are older than the latest day file (${latestExisting}): skipped.`);
  else {
    const edition = editions.includes(tradingDate) ? await readJson(join(ROOT, 'archive', `${tradingDate}.json`), null) : null;
    const stories = Array.isArray(edition?.stories) ? edition.stories : [];
    const people = {};
    for (const p of pool.draftable) {
      people[p.slug] = scorePersonDay({ slug: p.slug, name: p.name, holdings: p.holdings, quotes, tradingDate, filings, stories });
    }
    const sq = quotes[BENCHMARK_SYMBOL];
    const spyFresh = sq && typeof sq.changePct === 'number' && (!sq.time || core.nyDate(Date.parse(sq.time)) === tradingDate);
    const spy = spyFresh ? { ticker: BENCHMARK_SYMBOL, changePct: round4(sq.changePct), points: core.spyPoints(sq.changePct) } : { ticker: BENCHMARK_SYMBOL, changePct: null, points: null, note: 'No SPY quote for this day' };
    const practice = core.isPractice(core.isoWeek(tradingDate));
    await writeJson(join(DAYS, `${tradingDate}.json`), {
      date: tradingDate, week: core.isoWeek(tradingDate), generated, practice,
      quotesGenerated: prices?.generated ?? null, edition: edition ? tradingDate : null,
      rules: { pricePoints: 'round(portfolio return % × 100)', insiderBuy: POINTS.insiderBuy, perStory: POINTS.story },
      spy, people,
    }, { pretty: false });
    console.log(`Wrote day ${tradingDate}${practice ? ' (practice)' : ''}: ${Object.keys(people).length} people; SPY ${spy.points ?? 'n/a'}; stories in edition ${stories.length}.`);
  }

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
    if (!wk.final || wk.benchmarks?.perfect == null) wk = scoreWeek(wk, dayFiles, todayNy);
    await writeJson(path, wk);
    if (wk.final && !wk.practice) finishedReal.push(wk);
    weekSummaries.push({ week: wk.week, label: wk.label, practice: wk.practice, start: wk.start, end: wk.end, locksAt: wk.locksAt, days: wk.days.length, final: wk.final });
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
