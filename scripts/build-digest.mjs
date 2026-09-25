// Builds today's Billionaires Digest edition through the Anthropic API and writes digest.json.
// Manual backup only: run it by hand via the "Morning edition (API backup)" workflow
// (.github/workflows/daily.yml). The daily edition is made by the agent following EDITION.md.
// Needs the ANTHROPIC_API_KEY secret. If anything fails, the previous
// digest.json is left untouched so the site never goes blank.

import { readFile, appendFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { schemaText, rulesText, validate, DIRECTIONS, normalizeUrl, dates, writeEdition } from './lib/edition.mjs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.DIGEST_MODEL || 'claude-sonnet-5';

if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Add it under Settings > Secrets and variables > Actions.');
  process.exit(1);
}

const client = new Anthropic({ apiKey: API_KEY });

const { longDate, shortDate, isoDate } = dates(new Date());

let previous = null;
try { previous = JSON.parse(await readFile('digest.json', 'utf8')); } catch { /* first run */ }

const SCHEMA = schemaText(longDate, shortDate);

const system = `You are the editor of Billionaires Digest, a daily brief on the investments and company moves of the world's 100 richest people, written like a trading desk.

Rules:
${rulesText(longDate)}
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
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 30 }]
  });
  const data = await stream.finalMessage();
  usage.requests += 1;
  addUsage(data.usage);
  return data;
}

// ---- source URL check ----

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

  await writeEdition(digest, isoDate);
  console.log(`Published ${digest.stories.length} stories for ${longDate}.`);
  await reportUsage(digest.stories.length);
} catch (err) {
  console.error('No new edition written. The site keeps showing the previous one.');
  console.error(err.message);
  await reportUsage(null);
  process.exit(1);
}
