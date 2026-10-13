import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listMovers, pickMoverDate, mainHoldings, dayTickerMoves, holdersOf } from './movers.mjs';
import { checkMovers, mergeMoversFile, hasAdviceWords, rulesText, schemaText } from './edition.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/movers/${name}`, import.meta.url), 'utf8'));
const day = fx('day.json');
const week = fx('week.json');

// ---- list-movers ----

test('listMovers picks the 8 biggest absolute moves among draftable main holdings', () => {
  const m = listMovers(day, week);
  assert.deepEqual(m.map((x) => x.ticker), ['NVDA', 'AMZN', 'MIDX', 'DELL', 'CCC', 'BBB', 'AAA', 'BRK.B']);
  assert.deepEqual(m[0], { ticker: 'NVDA', company: 'NVIDIA Corporation', date: '2026-10-09', changePct: -4.1234, players: ['jensen-huang'] });
  assert.deepEqual(m[1].players, ['andy-jassy', 'jeff-bezos']);
  // small side holdings (TINY 5%, SAFE 12.5%), undraftable players, stale and quarantined rows are left out
  for (const t of ['TINY', 'SAFE', 'UNDR', 'STAL', 'QUAR']) assert.ok(!m.some((x) => x.ticker === t), t);
});

test('mainHoldings keeps holdings of 25%+ plus the single largest', () => {
  assert.deepEqual(mainHoldings([{ ticker: 'A', weight: 0.1 }, { ticker: 'B', weight: 0.2 }]).map((h) => h.ticker), ['B']);
  assert.deepEqual(mainHoldings([{ ticker: 'A', weight: 0.5 }, { ticker: 'B', weight: 0.3 }, { ticker: 'C', weight: 0.2 }]).map((h) => h.ticker), ['A', 'B']);
});

test('pickMoverDate uses the latest day unless it is today (partial)', () => {
  assert.equal(pickMoverDate(['2026-10-08', '2026-10-09'], '2026-10-13'), '2026-10-09');
  assert.equal(pickMoverDate(['2026-10-09', '2026-10-13', '2026-10-12'], '2026-10-13'), '2026-10-12');
  assert.equal(pickMoverDate(['2026-10-13'], '2026-10-13'), null);
  assert.equal(pickMoverDate([], '2026-10-13'), null);
});

test('holdersOf lists every player holding the ticker that day', () => {
  assert.deepEqual(holdersOf(day, 'AMZN'), ['andy-jassy', 'jeff-bezos']);
});

// ---- checkMovers (validation) ----

const movesByDate = new Map([['2026-10-09', dayTickerMoves(day)]]);
const good = {
  ticker: 'NVDA', date: '2026-10-09', changePct: -4.1234,
  why: 'Nvidia fell 4.1% after reports that a large customer delayed chip orders.',
  sourceName: 'Reuters', sourceUrl: 'https://www.reuters.com/technology/example-2026-10-09/'
};

test('checkMovers accepts a good entry', () => {
  const r = checkMovers([good], movesByDate, '2026-10-13');
  assert.equal(r.dropped.length, 0);
  assert.deepEqual(r.kept, [good]);
});

test('checkMovers drops bad entries and keeps the rest', () => {
  const bad = [
    { ...good, ticker: 'AMZN', changePct: 3.2945, why: 'Amazon rose 3.3% after the company said cloud sales grew.', sourceUrl: 'http://example.com/a' }, // not https
    { ...good, ticker: 'AMZN', changePct: 3.2945, why: 'Amazon rose 3.3% after reports.', sourceUrl: 'not a url' },
    { ...good, ticker: 'DELL', changePct: 2.2 }, // wrong changePct (ours 2.0033)
    { ...good, ticker: 'MIDX', changePct: -2.5, why: 'x'.repeat(161) }, // too long
    { ...good, ticker: 'CCC', changePct: 1.3, why: 'C Co rose 1.3% and analysts say it will keep rising.' }, // advice/certainty
    { ...good, ticker: 'BBB', changePct: -1.2, why: 'B Co fell 1.2%; investors should sell.' },
    { ...good, ticker: 'ZZZ' }, // not a holding
    { ...good, date: '2026-10-08' }, // no day file
    { ...good, date: '2026-13-01' }, // bad date
    { ...good, why: 'Nvidia fell 7.5% after reports of delayed orders.' }, // percent in why doesn't match
    { ...good } // duplicate of the first good entry
  ];
  const r = checkMovers([good, ...bad], movesByDate, '2026-10-13');
  assert.deepEqual(r.kept, [good]);
  assert.equal(r.dropped.length, bad.length);
  const reasons = r.dropped.map((d) => d.reason);
  assert.match(reasons[0], /https/);
  assert.match(reasons[1], /https/);
  assert.match(reasons[2], /does not match/);
  assert.match(reasons[3], /longer than 160/);
  assert.match(reasons[4], /advice/);
  assert.match(reasons[5], /advice/);
  assert.match(reasons[6], /not a player holding/);
  assert.match(reasons[7], /no scored day file/);
  assert.match(reasons[8], /valid/);
  assert.match(reasons[9], /percentage/);
  assert.match(reasons[10], /duplicate/);
});

test('checkMovers allows changePct within 0.05 and caps at 8 entries', () => {
  assert.equal(checkMovers([{ ...good, changePct: -4.17 }], movesByDate).kept.length, 1);
  assert.equal(checkMovers([{ ...good, changePct: -4.18 }], movesByDate).kept.length, 0);
  const many = ['NVDA', 'AMZN', 'MIDX', 'DELL', 'CCC', 'BBB', 'AAA', 'BRK.B', 'DDD'].map((t) => ({
    ...good, ticker: t, changePct: movesByDate.get('2026-10-09').get(t), why: 'Shares moved after the company said results changed.'
  }));
  const r = checkMovers(many, movesByDate);
  assert.equal(r.kept.length, 8);
  assert.match(r.dropped[0].reason, /more than 8/);
});

test('checkMovers: missing movers is fine, a non-array is dropped', () => {
  assert.deepEqual(checkMovers(undefined, movesByDate), { kept: [], dropped: [] });
  assert.equal(checkMovers({ a: 1 }, movesByDate).dropped.length, 1);
});

test('advice check allows sell-off but not sell/will/should', () => {
  assert.equal(hasAdviceWords('Shares fell 3% in a chip-sector sell-off.'), false);
  assert.equal(hasAdviceWords('Shares fell 3% in a selloff.'), false);
  assert.equal(hasAdviceWords('Shares rose after a buyback was announced.'), false);
  assert.equal(hasAdviceWords('Time to sell.'), true);
  assert.equal(hasAdviceWords('It will rise.'), true);
  assert.equal(hasAdviceWords('You should buy.'), true);
});

// ---- data/fantasy/movers.json ----

test('mergeMoversFile keeps 10 trading days, dedupes by ticker+date, newer replaces older', () => {
  const tradingDays = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'];
  const existing = { updated: 'x', days: [], movers: {} };
  for (const d of tradingDays) {
    existing.movers[`NVDA@${d}`] = { ticker: 'NVDA', date: d, changePct: 2.5, why: 'old', sourceName: 'A', sourceUrl: 'https://a.example/1', players: ['jensen-huang'] };
  }
  const now = new Date('2026-10-13T10:00:00Z');
  const next = mergeMoversFile(existing, [
    { ticker: 'NVDA', date: '2026-10-12', changePct: 2.5, why: 'new reason', sourceName: 'B', sourceUrl: 'https://b.example/2', players: ['jensen-huang'] },
    { ticker: 'AMZN', date: '2026-10-12', changePct: -3.1, why: 'amazon reason', sourceName: 'C', sourceUrl: 'https://c.example/3', players: ['jeff-bezos', 'andy-jassy'] }
  ], { tradingDays, edition: '2026-10-13', now });
  assert.equal(next.updated, now.toISOString());
  assert.equal(next.days.length, 10);
  assert.equal(next.days[0], '2026-10-12');
  assert.equal(next.days[9], '2026-09-29');
  assert.ok(!('NVDA@2026-09-28' in next.movers));
  assert.equal(Object.keys(next.movers).length, 11); // 10 NVDA days + AMZN
  assert.equal(next.movers['NVDA@2026-10-12'].why, 'new reason');
  assert.equal(next.movers['NVDA@2026-10-12'].edition, '2026-10-13');
  assert.deepEqual(next.movers['AMZN@2026-10-12'].players, ['andy-jassy', 'jeff-bezos']);
  // newest first; same day by size of move
  assert.deepEqual(Object.keys(next.movers).slice(0, 2), ['AMZN@2026-10-12', 'NVDA@2026-10-12']);
});

test('mergeMoversFile from nothing', () => {
  const next = mergeMoversFile(null, [{ ...good, players: ['jensen-huang'] }], { tradingDays: ['2026-10-09'] });
  assert.deepEqual(next.days, ['2026-10-09']);
  assert.equal(next.movers['NVDA@2026-10-09'].sourceName, 'Reuters');
});

test('rules and schema mention movers', () => {
  assert.match(rulesText('Tuesday, October 13, 2026'), /list-movers\.mjs/);
  assert.match(schemaText('a', 'b'), /"movers": optional/);
});
