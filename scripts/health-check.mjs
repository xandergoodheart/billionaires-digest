#!/usr/bin/env node
// Daily site health check. No dependencies. Always exits 0.
// Checks the live site: home page, today's digest, story count, and freshness of filings and prices.
// Prints a markdown report. When $GITHUB_OUTPUT is set, writes `healthy` and `report` to it.
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = (process.env.SITE_URL || 'https://billionairesdigest.com').replace(/\/+$/, '');
const TZ = 'America/New_York';
const FRESH_HOURS = 30;
const WEEKEND_PRICE_HOURS = 80;
const MIN_STORIES = 3;
const TIMEOUT_MS = 20000;

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

const [home, digest, filings, prices] = await Promise.all([
  get('/'),
  getJson('/digest.json'),
  getJson('/data/filings/latest.json'),
  getJson('/data/prices/latest.json'),
]);

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
