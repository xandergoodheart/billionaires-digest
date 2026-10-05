#!/usr/bin/env node
// The Billionaire Brief: email to confirmed waitlist signups (not unsubscribed). Built, but OFF by default.
//
//   node scripts/send-brief.mjs                 dry run (default): writes out/brief-preview.html + .txt, prints the
//                                               recipient count. Without SUPABASE_URL / SUPABASE_SERVICE_KEY it uses one
//                                               sample recipient and makes no network calls.
//   node scripts/send-brief.mjs --send --confirm-date=YYYY-MM-DD
//                                               really sends. Needs env RESEND_API_KEY, BRIEF_FROM, SUPABASE_URL,
//                                               SUPABASE_SERVICE_KEY, and --confirm-date must be today (New York).
// Options: --digest=path (default digest.json)
//
// Sending: Resend batch API, up to 50 emails per request, at most 2 requests a second, retries on 429/5xx.
// Logs one brief_sent event (date + counts) through waitlist_admin_log. Never prints email addresses or keys.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { briefContent, buildBrief, nyDate, chunk } from './lib/brief.mjs';
import { makeRest } from './lib/supa/rest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BATCH = 50;
const MIN_GAP_MS = 500;   // <= 2 requests per second
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const a = { send: false, confirmDate: null, digest: join(ROOT, 'digest.json') };
  for (const x of argv) {
    if (x === '--send') a.send = true;
    else if (x === '--dry-run') a.send = false;
    else if (x.startsWith('--confirm-date=')) a.confirmDate = x.slice(15);
    else if (x.startsWith('--digest=')) a.digest = x.slice(9);
    else throw new Error(`Unknown option ${x}`);
  }
  return a;
}

async function seasonLabel() {
  try { return JSON.parse(await readFile(join(ROOT, 'config', 'launch.json'), 'utf8')).seasonStartLabel || 'Monday, Nov 9'; }
  catch { return 'Monday, Nov 9'; }
}

async function postWithRetry(url, init, tries = 5) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, init);
    if (r.ok) return r.json().catch(() => null);
    const body = (await r.text()).slice(0, 300);
    if ((r.status === 429 || r.status >= 500) && i < tries) {
      const wait = Math.max(Number(r.headers.get('retry-after')) * 1000 || 0, 1000 * 2 ** (i - 1));
      console.log(`  HTTP ${r.status}, retrying in ${wait} ms`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Resend HTTP ${r.status}: ${body}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = nyDate();
  const digest = JSON.parse(await readFile(args.digest, 'utf8'));
  const content = briefContent(digest);
  const label = await seasonLabel();
  console.log(`Brief for ${content.date || '(no date)'}: ${content.stories.length} stories${content.lede ? ' + lede' : ''}.`);
  if (!content.enough) console.log('Warning: fewer than 3 stories with source links and no raw prices.');

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, BRIEF_FROM } = process.env;
  const haveDb = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

  if (!args.send) {
    let recipients = null;
    if (haveDb) recipients = await makeRest({ url: SUPABASE_URL, key: SUPABASE_SERVICE_KEY }).rpc('waitlist_brief_recipients');
    const sample = recipients && recipients.length ? recipients[0]
      : { position: 1, unsub_token: '00000000-0000-0000-0000-000000000000', referral_code: 'SAMPLE23' };
    const b = buildBrief(content, sample, { campaign: today, seasonLabel: label });
    const out = join(ROOT, 'out');
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'brief-preview.html'), b.html);
    await writeFile(join(out, 'brief-preview.txt'), `Subject: ${b.subject}\n\n${b.text}`);
    console.log(`Dry run. Preview: out/brief-preview.html (subject: ${b.subject})`);
    console.log(haveDb ? `Recipients (confirmed, subscribed): ${recipients.length}`
      : 'Recipients: unknown (SUPABASE_URL / SUPABASE_SERVICE_KEY not set; preview uses a sample recipient). Nothing sent.');
    return;
  }

  // ---- real send ----
  const missing = ['RESEND_API_KEY', 'BRIEF_FROM', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
  if (missing.length) throw new Error(`--send needs env: ${missing.join(', ')}`);
  if (args.confirmDate !== today) throw new Error(`--send needs --confirm-date=${today} (today in New York).`);
  if (!content.enough) throw new Error('Not sending: fewer than 3 usable stories in the digest.');

  const rest = makeRest({ url: SUPABASE_URL, key: SUPABASE_SERVICE_KEY });
  const recipients = await rest.rpc('waitlist_brief_recipients');
  console.log(`Sending to ${recipients.length} recipients in batches of ${BATCH}.`);
  let sent = 0, failed = 0, last = 0;
  const batches = chunk(recipients, BATCH);
  for (let i = 0; i < batches.length; i++) {
    const emails = batches[i].map(r => {
      const b = buildBrief(content, r, { campaign: today, seasonLabel: label });
      return { from: BRIEF_FROM, to: [r.email], subject: b.subject, html: b.html, text: b.text, headers: b.headers };
    });
    const gap = last + MIN_GAP_MS - Date.now();
    if (gap > 0) await sleep(gap);
    last = Date.now();
    try {
      await postWithRetry('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `brief-${today}-${i}` },
        body: JSON.stringify(emails)
      });
      sent += emails.length;
      console.log(`  batch ${i + 1}/${batches.length}: ${emails.length} sent`);
    } catch (e) {
      failed += emails.length;
      console.log(`  batch ${i + 1}/${batches.length} failed: ${e.message}`);
    }
  }
  await rest.rpc('waitlist_admin_log', { p_name: 'brief_sent', p_props: { date: today, sent, failed, batches: batches.length } });
  console.log(`Done: ${sent} sent, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error(e.message); process.exit(1); });
