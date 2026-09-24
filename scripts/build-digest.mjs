// Builds today's Billionaires Digest edition and writes digest.json.
// Runs every morning from .github/workflows/daily.yml.
// Needs the ANTHROPIC_API_KEY secret. If anything fails, the previous
// digest.json is left untouched so the site never goes blank.

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.DIGEST_MODEL || 'claude-sonnet-5';

if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Add it under Settings > Secrets and variables > Actions.');
  process.exit(1);
}

const client = new Anthropic({ apiKey: API_KEY });

const now = new Date();
const tz = 'America/New_York';
const longDate = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = now.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' });
const isoDate = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD

let previous = null;
try { previous = JSON.parse(await readFile('digest.json', 'utf8')); } catch { /* first run */ }

const SCHEMA = `{
  "date": "${longDate}",
  "updated": "${shortDate} · morning edition",
  "lede": { "kicker": "Lede of the day", "headline": string, "dek": string (1-2 sentences), "ini": two-letter initials of the person },
  "top10": [ { "name": string, "ini": string, "tick": short last name, "worth": "$123B" } ] (exactly 10, richest first),
  "top10AsOf": string saying which source and date the net worths come from,
  "stories": [ {
      "who": person's name, "sector": one of "AI & tech" | "Finance" | "Aerospace" | "Luxury & retail" | "Real estate" | "Energy" | "Media" | "Autos" | "Other",
      "type": e.g. "Acquisition" | "Investment" | "Insider trade" | "IPO / Markets" | "Leadership" | "Product launch" | "Policy" | "Property" | "Divestiture",
      "tickers": e.g. "NVDA · MSFT" (or "Private"),
      "read": short opinion label, "direction": "up" | "down" | "flat",
      "headline": under 12 words,
      "move": what happened, facts only,
      "why": why it matters,
      "bear": the strongest counterargument,
      "watch": the next date or signal to watch,
      "source": publication name, "url": the article URL exactly as found in search results
  } ] (5 to 8 stories),
  "consensus": { "headline": string, "body": string, "tags": [string] } or null,
  "filings": [ { "filer": string, "form": "Form 4" | "13F" | "8-K" | "S-1" | "13D" | other, "change": string, "direction": "up" | "down" | "flat" } ],
  "watch": [string] (upcoming dates and events),
  "quickHits": [string] (one-sentence moves that didn't get a full story),
  "memo": [string] (3 short takeaways for someone running a business, not a fund),
  "ledger": null
}`;

const system = `You are the editor of Billionaires Digest, a daily brief on the investments and company moves of the world's 100 richest people, written like a trading desk.

Rules:
- Today is ${longDate}. Use web search to find real news from the last 48 hours (extend to 7 days only if needed) about investments, acquisitions, sales, insider trades, IPOs, leadership changes and major company moves by people on the Forbes or Bloomberg billionaire lists, focusing on the top 100.
- Every story must come from a search result. Copy its URL exactly. Never invent a story, number, quote, date or URL. If you can't verify a detail, leave it out.
- Only use URLs of news articles or filings, not stock-quote or company profile pages.
- Look up the current top 10 by net worth (Forbes real-time or Bloomberg Billionaires Index) and say which source and date in top10AsOf.
- Only include a consensus alert when two or more billionaires moved money the same direction in the same sector. Otherwise set it to null.
- Write plainly: short sentences, no jargon, no hype. Keep facts in "move"; put opinion only in "read", "why", "bear" and "memo".
- Do not reproduce article text. Summarize in your own words.
- Your final message must be ONLY the JSON object, with no markdown fences and no commentary, matching this shape:
${SCHEMA}`;

const messages = [{ role: 'user', content: `Build today's edition for ${longDate}. Return only the JSON.` }];

// ---- usage and cost tracking ----

// USD per million tokens; web search is per 1,000 searches.
const PRICES = {
  'claude-sonnet-5': { input: 2, output: 10 }
};
const SEARCH_PRICE_PER_1K = 10;

const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0, requests: 0 };

function addUsage(u) {
  if (!u) return;
  usage.input += u.input_tokens || 0;
  usage.output += u.output_tokens || 0;
  usage.cacheWrite += u.cache_creation_input_tokens || 0;
  usage.cacheRead += u.cache_read_input_tokens || 0;
  usage.searches += u.server_tool_use?.web_search_requests || 0;
}

function estimateCost() {
  const p = PRICES[MODEL];
  if (!p) return null;
  const tokens =
    usage.input * p.input +
    usage.output * p.output +
    usage.cacheWrite * p.input * 1.25 +
    usage.cacheRead * p.input * 0.1;
  return tokens / 1e6 + (usage.searches / 1000) * SEARCH_PRICE_PER_1K;
}

async function reportUsage(storiesPublished) {
  if (!usage.requests) return;
  const cost = estimateCost();
  const costText = cost == null ? `no price table for ${MODEL}` : `est. $${cost.toFixed(4)}`;
  console.log(
    `Usage: ${usage.requests} requests, ${usage.input} input / ${usage.output} output tokens, ` +
    `${usage.cacheWrite} cache write / ${usage.cacheRead} cache read tokens, ${usage.searches} searches, ${costText}.`
  );
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const lines = [
      '### Morning edition',
      '',
      `- Stories published: ${storiesPublished == null ? 'none (run failed)' : storiesPublished}`,
      `- Model: ${MODEL}`,
      `- Requests: ${usage.requests}`,
      `- Tokens: ${usage.input} input, ${usage.output} output, ${usage.cacheWrite} cache write, ${usage.cacheRead} cache read`,
      `- Web searches: ${usage.searches}`,
      `- Estimated cost: ${cost == null ? 'unknown (no price table for this model)' : '$' + cost.toFixed(4)}`,
      ''
    ];
    try { await appendFile(summaryFile, lines.join('\n')); } catch (e) { console.error('Could not write step summary:', e.message); }
  }
}

// ---- API call ----

async function callClaude(msgs) {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system,
    messages: msgs,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 20 }]
  });
  const data = await stream.finalMessage();
  usage.requests += 1;
  addUsage(data.usage);
  return data;
}

// ---- source URL check ----

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.search = '';
    let s = `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`;
    while (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

function collectSourceUrls(content, into) {
  for (const b of content || []) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) {
        const n = r && r.url ? normalizeUrl(r.url) : null;
        if (n) into.add(n);
      }
    }
    if (b.type === 'text' && Array.isArray(b.citations)) {
      for (const c of b.citations) {
        const n = c && c.url ? normalizeUrl(c.url) : null;
        if (n) into.add(n);
      }
    }
  }
}

function filterToSources(digest, sources) {
  if (!sources.size) {
    console.warn('Warning: no source URLs were collected from search results; skipping the source-URL check.');
    return;
  }
  const kept = [];
  for (const s of digest.stories || []) {
    const n = normalizeUrl(s.url || '');
    if (n && sources.has(n)) kept.push(s);
    else console.warn(`Dropped story not backed by a search result: "${s.headline}" (${s.url})`);
  }
  digest.stories = kept;
}

// ---- parsing and checks ----

function finalText(content) {
  const blocks = content || [];
  let lastNonText = -1;
  blocks.forEach((b, i) => { if (b.type !== 'text') lastNonText = i; });
  const after = blocks.slice(lastNonText + 1).filter(b => b.type === 'text').map(b => b.text).join('');
  if (after.trim()) return after;
  return blocks.filter(b => b.type === 'text').map(b => b.text).join('');
}

function extractJson(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in the response');
  return JSON.parse(clean.slice(start, end + 1));
}

const DIRECTIONS = ['up', 'down', 'flat'];

function validate(d) {
  const problems = [];
  if (!d || typeof d !== 'object') problems.push('not an object');
  if (!d.lede || !d.lede.headline) problems.push('missing lede');
  if (!Array.isArray(d.stories) || d.stories.length < 3) problems.push('fewer than 3 stories');
  (d.stories || []).forEach((s, i) => {
    if (!s.headline || !s.move) problems.push(`story ${i + 1} missing headline or move`);
    if (!/^https?:\/\//.test(s.url || '')) problems.push(`story ${i + 1} missing a real URL`);
    if (!s.source) problems.push(`story ${i + 1} missing source`);
    if (!DIRECTIONS.includes(s.direction)) problems.push(`story ${i + 1} has an invalid direction`);
  });
  if (!Array.isArray(d.top10) || d.top10.length !== 10) problems.push('top10 is not exactly 10 people');
  (Array.isArray(d.top10) ? d.top10 : []).forEach((p, i) => {
    if (!p || !p.name || !p.worth) problems.push(`top10 #${i + 1} missing name or worth`);
  });
  return problems;
}

try {
  let msgs = messages;
  let data = null;
  const sources = new Set();
  // Server-side web search can pause long turns; continue until the model finishes.
  for (let turn = 0; turn < 6; turn++) {
    data = await callClaude(msgs);
    collectSourceUrls(data.content, sources);
    if (data.stop_reason !== 'pause_turn') break;
    msgs = [...msgs, { role: 'assistant', content: data.content }];
  }
  if (data.stop_reason !== 'end_turn') {
    throw new Error(`Model stopped with stop_reason "${data.stop_reason}" instead of "end_turn"`);
  }

  const digest = extractJson(finalText(data.content));
  digest.date = longDate;
  digest.updated = `${shortDate} · morning edition`;
  // The ledger is a human-written column; never take it from the model.
  digest.ledger = previous?.ledger ?? null;
  if (Array.isArray(digest.stories)) {
    digest.stories.forEach(s => { if (s && !DIRECTIONS.includes(s.direction)) s.direction = 'flat'; });
  }

  filterToSources(digest, sources);

  const problems = validate(digest);
  if (problems.length) throw new Error('Edition failed checks: ' + problems.join('; '));

  const json = JSON.stringify(digest, null, 2) + '\n';
  await writeFile('digest.json', json);
  await mkdir('archive', { recursive: true });
  await writeFile(`archive/${isoDate}.json`, json);
  console.log(`Published ${digest.stories.length} stories for ${longDate}.`);
  await reportUsage(digest.stories.length);
} catch (err) {
  console.error('No new edition written. The site keeps showing the previous one.');
  console.error(err.message);
  await reportUsage(null);
  process.exit(1);
}
