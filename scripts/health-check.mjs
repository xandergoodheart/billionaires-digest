#!/usr/bin/env node
// Daily site health check. No dependencies. Always exits 0.
// Checks the live site: home page, today's digest, story count, and freshness of filings and prices.
// Game: the game server answers a public read (current_week, using the site's own public config/supabase.json),
// and the Game sync workflow succeeded within the last 36 hours (GitHub API; needs GITHUB_TOKEN + GITHUB_REPOSITORY,
// which the workflow provides; skipped with a note when run by hand without them).
// Prints a markdown report. When $GITHUB_OUTPUT is set, writes `healthy` and `report` to it.
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = (process.env.SITE_URL || 'https://billionairesdigest.com').replace(/\/+$/, '');
const TZ = 'America/New_York';
const FRESH_HOURS = 30;
const WEEKEND_PRICE_HOURS = 80;
const MIN_STORIES = 3;
const TIMEOUT_MS = 20000;
const GAME_SYNC_HOURS = 36;
const GAME_SYNC_WORKFLOW = 'game.yml';

const now = new Date();

// "Friday, September 25, 2026" in New York time
function nyLongDate(d) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}
function nyWeekday(d) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(d);
}

async function get(path) {
  const url = BASE + path;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(url + sep + 'hc=' + Date.now(), {
      signal: ctrl.signal,
      headers: { 'cache-control': 'no-cache', 'user-agent': 'billionairesdigest-health-check' },
    });
    const text = await res.text();
    return { url, status: res.status, ok: res.ok, text };
  } catch (e) {
    return { url, status: 0, ok: false, text: '', error: e.name === 'AbortError' ? 'timed out' : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

async function getJson(path) {
  const r = await get(path);
  if (!r.ok) return { ...r, json: null };
  try { return { ...r, json: JSON.parse(r.text) }; }
  catch { return { ...r, json: null, error: 'not valid JSON' }; }
}

// fetch with a timeout; never throws
async function fetchT(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    return { url, status: res.status, ok: res.ok, text };
  } catch (e) {
    return { url, status: 0, ok: false, text: '', error: e.name === 'AbortError' ? 'timed out' : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

// The game server answers a public, read-only function with the site's public URL + publishable key.
async function gameServerCheck(cfgRes) {
  const name = 'Game server answers';
  if (!cfgRes.json) return { name, ok: false, detail: cfgRes.ok ? `${cfgRes.url}: ${cfgRes.error || 'no data'}` : httpProblem(cfgRes) };
  const c = cfgRes.json;
  const key = c.publishableKey || c.anonKey;
  if (c.enabled === false || !c.url || !key) return { name, ok: true, detail: 'Skipped: the game is switched off in config/supabase.json.' };
  const url = String(c.url).replace(/\/+$/, '') + '/rest/v1/rpc/current_week';
  const r = await fetchT(url, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json', 'user-agent': 'billionairesdigest-health-check' },
    body: '{}',
  });
  if (r.status !== 200) return { name, ok: false, detail: r.error ? `current_week failed: ${r.error}` : `current_week returned HTTP ${r.status}.` };
  let week = null;
  try { week = JSON.parse(r.text); } catch { /* keep null */ }
  return { name, ok: true, detail: `current_week returned 200 (${JSON.stringify(week)}).` };
}

// The Game sync workflow's last successful run is recent.
async function gameSyncCheck() {
  const name = `Game sync succeeded in the last ${GAME_SYNC_HOURS} hours`;
  const { GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return { name, ok: true, detail: 'Skipped: GITHUB_TOKEN / GITHUB_REPOSITORY not set (runs in the workflow).' };
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${GAME_SYNC_WORKFLOW}/runs?status=success&per_page=1`;
  const r = await fetchT(url, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'user-agent': 'billionairesdigest-health-check' },
  });
  if (!r.ok) return { name, ok: false, detail: r.error ? `GitHub API failed: ${r.error}` : `GitHub API returned HTTP ${r.status}.` };
  let run = null;
  try { run = (JSON.parse(r.text).workflow_runs || [])[0] || null; } catch { /* keep null */ }
  if (!run) return { name, ok: false, detail: 'No successful Game sync run found.' };
  const at = run.updated_at || run.run_started_at || run.created_at;
  const hours = (now.getTime() - Date.parse(at)) / 3600000;
  if (Number.isNaN(hours)) return { name, ok: false, detail: `Last successful run has no valid time (${JSON.stringify(at ?? null)}).` };
  return { name, ok: hours <= GAME_SYNC_HOURS, detail: `Last success ${at} (${hours.toFixed(1)} hours ago; limit ${GAME_SYNC_HOURS} hours).` };
}

function httpProblem(r) {
  return r.error ? `${r.url} failed: ${r.error}` : `${r.url} returned HTTP ${r.status}`;
}

function ageCheck(name, r, maxHours) {
  if (!r.json) return { name, ok: false, detail: r.ok ? `${r.url}: ${r.error || 'no data'}` : httpProblem(r) };
  const g = r.json.generated;
  const t = Date.parse(g);
  if (!g || Number.isNaN(t)) return { name, ok: false, detail: `No valid \`generated\` time (got ${JSON.stringify(g ?? null)}).` };
  const hours = (now.getTime() - t) / 3600000;
  const ok = hours <= maxHours;
  return { name, ok, detail: `Generated ${g} (${hours.toFixed(1)} hours ago; limit ${maxHours} hours).` };
}

const today = nyLongDate(now);
const weekday = nyWeekday(now);
const checks = [];

const [home, digest, filings, prices, gameCfg, gameSync] = await Promise.all([
  get('/'),
  getJson('/digest.json'),
  getJson('/data/filings/latest.json'),
  getJson('/data/prices/latest.json'),
  getJson('/config/supabase.json'),
  gameSyncCheck(),
]);
const gameServer = await gameServerCheck(gameCfg);

// (a) home page
checks.push({
  name: 'Home page loads',
  ok: home.status === 200,
  detail: home.status === 200 ? `${home.url} returned 200.` : httpProblem(home),
});

// (b) today's digest
if (!digest.json) {
  checks.push({ name: "Today's digest is live", ok: false, detail: digest.ok ? `${digest.url}: ${digest.error}` : httpProblem(digest) });
} else {
  const d = digest.json.date;
  checks.push({
    name: "Today's digest is live",
    ok: d === today,
    detail: d === today ? `Digest date is ${d}.` : `Digest date is ${JSON.stringify(d ?? null)}; expected "${today}".`,
  });
}

// (c) filings freshness
checks.push(ageCheck('SEC filings are fresh', filings, FRESH_HOURS));

// (d) prices freshness (markets closed over the weekend, so allow longer Sat/Sun/Mon)
const relaxed = ['Saturday', 'Sunday', 'Monday'].includes(weekday);
const pc = ageCheck('Stock prices are fresh', prices, relaxed ? WEEKEND_PRICE_HOURS : FRESH_HOURS);
if (relaxed) pc.detail += ` ${weekday} in New York, so the weekend limit applies.`;
checks.push(pc);

// (e) story count
if (!digest.json) {
  checks.push({ name: `Digest has at least ${MIN_STORIES} stories`, ok: false, detail: 'Digest did not load.' });
} else {
  const n = Array.isArray(digest.json.stories) ? digest.json.stories.length : 0;
  checks.push({ name: `Digest has at least ${MIN_STORIES} stories`, ok: n >= MIN_STORIES, detail: `${n} ${n === 1 ? 'story' : 'stories'}.` });
}

// (f) game server and (g) game sync
checks.push(gameServer, gameSync);

const healthy = checks.every((c) => c.ok);
const failed = checks.filter((c) => !c.ok).length;
const lines = [
  `## Site health: ${healthy ? 'OK' : `${failed} problem${failed === 1 ? '' : 's'}`}`,
  '',
  `Checked ${BASE} at ${now.toISOString()} (${today}, New York).`,
  '',
  '| Check | Result | Details |',
  '| --- | --- | --- |',
  ...checks.map((c) => `| ${c.name} | ${c.ok ? 'OK' : 'FAIL'} | ${String(c.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`),
];
const report = lines.join('\n');
console.log(report);

if (process.env.GITHUB_OUTPUT) {
  const delim = 'REPORT_' + randomUUID().replace(/-/g, '');
  appendFileSync(process.env.GITHUB_OUTPUT, `healthy=${healthy}\nreport<<${delim}\n${report}\n${delim}\n`);
}
process.exit(0);
