#!/usr/bin/env node
// Waitlist numbers from waitlist_admin_metrics (service role only).
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/waitlist-metrics.mjs [--days=30]
// Prints counts only (league names, no emails).
import { makeRest } from './lib/supa/rest.mjs';

const daysArg = process.argv.slice(2).find(a => a.startsWith('--days='));
const days = daysArg ? Number(daysArg.slice(7)) : 30;
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (service role) to read waitlist metrics.');
  process.exit(1);
}
if (!Number.isInteger(days) || days < 1) { console.error('--days must be a whole number of days'); process.exit(1); }

const m = await makeRest({ url: SUPABASE_URL, key: SUPABASE_SERVICE_KEY }).rpc('waitlist_admin_metrics', { p_days: days });
const pct = v => (v == null ? 'n/a' : `${v}%`);

console.log(`Waitlist metrics (events since ${String(m.since).slice(0, 10)}, ${m.days} days)\n`);
console.table({
  'Signups (all)': m.signups,
  'Confirmed': m.confirmed,
  'Confirmed with a captain': pct(m.captain_pct),
  'Leagues reserved': m.leagues_reserved,
  'Confirmed who referred 1+ confirmed friend': pct(m.referral_share_pct),
  'Unsubscribes': m.unsubscribes
});

// events per day: one row per day, one column per event name
const names = [...new Set(m.events_per_day.map(e => e.name))].sort();
const byDay = {};
for (const e of m.events_per_day) (byDay[e.day] ||= Object.fromEntries(names.map(n => [n, 0])))[e.name] = e.count;
console.log('\nEvents per day (New York dates)');
if (names.length) console.table(byDay); else console.log('  none');

console.log('\nMembers per reserved league');
if (m.league_members.length) console.table(m.league_members); else console.log('  none');
