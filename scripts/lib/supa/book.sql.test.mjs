// node --test 'scripts/lib/supa/*.test.mjs'
// The Book (supabase/migrations/0002_book.sql) in PGlite: placing bets, limits, settlement, privileges.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, rejectsWith, MODES } from './pgtest.mjs';

const LOCK = '2026-09-28T13:30:00.000Z';
const BEFORE = '2026-09-27T20:00:00Z';
const W = '2026-W40';
const sel = (id, label, americanOdds, decimalOdds, extra = {}) => ({ id, label, americanOdds, decimalOdds, fairProb: 0.5, ...extra });
const BOOK = {
  week: W, locksAt: LOCK,
  events: [
    { id: `${W}:h2h:a:b`, type: 'h2h', title: 'A vs B', params: { a: 'a', b: 'b' }, sort: 0, selections: [
      sel(`${W}:h2h:a:b:ml:a`, 'A to win', -110, 1.9091, { market: 'ml', person: 'a' }),
      sel(`${W}:h2h:a:b:ml:b`, 'B to win', -110, 1.9091, { market: 'ml', person: 'b' }),
      sel(`${W}:h2h:a:b:sp:a`, 'A −2.5', 150, 2.5, { market: 'spread', person: 'a', line: -2.5 }),
      sel(`${W}:h2h:a:b:sp:b`, 'B +2.5', -180, 1.5556, { market: 'spread', person: 'b', line: 2.5 })] },
    { id: `${W}:ou:a`, type: 'player_ou', title: 'A: weekly points', params: { slug: 'a' }, sort: 1, selections: [
      sel(`${W}:ou:a:o:10.5`, 'Over 10.5', 250, 3.5, { market: 'over', line: 10.5 }),
      sel(`${W}:ou:a:u:10.5`, 'Under 10.5', -300, 1.3333, { market: 'under', line: 10.5 })] },
    { id: `${W}:top`, type: 'futures_top', title: 'Top scorer of the week', params: {}, sort: 2, selections: [
      sel(`${W}:top:a`, 'A', 5000, 51, { market: 'pick', person: 'a' }),
      sel(`${W}:top:b`, 'B', 1900, 20, { market: 'pick', person: 'b' }),
      sel(`${W}:top:c`, 'C', 400, 5, { market: 'pick', person: 'c' })] },
    { id: `${W}:sector`, type: 'prop_sector', title: 'Top sector', params: {}, sort: 3, selections: [
      sel(`${W}:sector:x`, 'X', 900, 10, { market: 'pick', sector: 'X' }),
      sel(`${W}:sector:y`, 'Y', -110, 1.9091, { market: 'pick', sector: 'Y' })] },
    { id: `${W}:buy:a`, type: 'prop_insider', title: 'A: insider buy?', params: { slug: 'a' }, sort: 4, selections: [
      sel(`${W}:buy:a:yes`, 'Yes', 300, 4, { market: 'yes' }), sel(`${W}:buy:a:no`, 'No', -400, 1.25, { market: 'no' })] }
  ]
};
const S = {
  mlA: `${W}:h2h:a:b:ml:a`, mlB: `${W}:h2h:a:b:ml:b`, spA: `${W}:h2h:a:b:sp:a`, spB: `${W}:h2h:a:b:sp:b`,
  over: `${W}:ou:a:o:10.5`, under: `${W}:ou:a:u:10.5`, topA: `${W}:top:a`, topB: `${W}:top:b`, topC: `${W}:top:c`,
  secX: `${W}:sector:x`, secY: `${W}:sector:y`, yes: `${W}:buy:a:yes`, no: `${W}:buy:a:no`
};
const DEC = { [S.mlA]: 1.9091, [S.mlB]: 1.9091, [S.spA]: 2.5, [S.spB]: 1.5556, [S.over]: 3.5, [S.under]: 1.3333, [S.topA]: 51, [S.topB]: 20, [S.topC]: 5, [S.secX]: 10, [S.secY]: 1.9091, [S.yes]: 4, [S.no]: 1.25 };

for (const mode of MODES) describe(mode, () => {
  let t;
  const bet = (uid, ids, stake, dec = ids.map(i => DEC[i])) => t.call(uid, 'place_bet', [ids, stake, dec]);
  const upsert = b => t.admin('select public.upsert_book($1::jsonb) r', [JSON.stringify(b)]).then(r => r.rows[0].r);
  before(async () => {
    t = await makeDb({ mode });
    await t.setNow(BEFORE);
    const r = await upsert(BOOK);
    assert.deepEqual(r, { week: W, events: 5, selections: 13, frozen: 0, skipped: 0, removed: 0 });
    assert.deepEqual(await upsert(BOOK), { week: W, events: 5, selections: 13, frozen: 0, skipped: 0, removed: 0 });  // idempotent
  });

  test('anyone can read the book; bets are private; only place_bet writes', async () => {
    const ev = (await t.as(null, `select id, status, closes_at from public.book_events where week = $1 order by sort`, [W])).rows;
    assert.equal(ev.length, 5);
    assert.ok(ev.every(e => e.status === 'open' && new Date(e.closes_at).toISOString() === LOCK));
    const s = (await t.as(null, `select id, american_odds, decimal_odds, meta, line from public.book_selections where id = $1`, [S.spA])).rows[0];
    assert.deepEqual({ ...s, decimal_odds: Number(s.decimal_odds), line: Number(s.line) },
      { id: S.spA, american_odds: 150, decimal_odds: 2.5, meta: { market: 'spread', person: 'a' }, line: -2.5 });
    const u = await t.newUser('priv_bettor');
    await bet(u, [S.mlA], 10);
    const other = await t.newUser('snoop');
    assert.equal((await t.as(other, 'select * from public.bets where user_id = $1', [u])).rows.length, 0);
    assert.equal((await t.as(other, 'select * from public.bet_legs')).rows.length, 0);
    assert.equal((await t.as(u, 'select * from public.bets')).rows.length, 1);
    assert.equal((await t.as(u, 'select * from public.bet_legs')).rows.length, 1);
    await rejectsWith(assert, t.as(null, 'select * from public.bets'), /permission denied/);
    for (const who of [null, u]) {
      for (const tb of ['book_events', 'book_selections', 'bets', 'bet_legs']) {
        await rejectsWith(assert, t.as(who, `delete from public.${tb}`), /permission denied/);
        await rejectsWith(assert, t.as(who, `insert into public.${tb} default values`), /permission denied/);
        await rejectsWith(assert, t.as(who, `update public.${tb} set ctid = ctid`), /permission denied|cannot assign|column "ctid"/);
      }
      for (const q of [`select public.upsert_book('{}'::jsonb)`, `select public.settle_book('{}'::jsonb)`, `select public.close_due_book()`])
        await rejectsWith(assert, t.as(who, q), /permission denied/);
    }
    // visitors can't bet or list bets; the leaderboard is public
    await rejectsWith(assert, t.as(null, `select public.place_bet($1, 10, $2)`, [[S.mlA], [1.9091]]), /permission denied/);
    await rejectsWith(assert, t.as(null, `select public.my_bets()`), /permission denied/);
    assert.ok(Array.isArray((await t.as(null, 'select * from public.book_leaderboard()')).rows));
  });

  test('place_bet: single and parlay, coins, payout, legs', async () => {
    await t.setNow(BEFORE);
    const u = await t.newUser('bettor_one');
    const r = await bet(u, [S.mlA], 100);
    assert.equal(r.potential_payout, 190);                       // floor(100 x 1.9091)
    assert.equal(r.coins, 900);
    assert.equal(await t.coins(u), 900);
    const p = await bet(u, [S.spA, S.over, S.secY], 10);         // 10 x 2.5 x 3.5 x 1.9091 = 167.05
    assert.equal(p.potential_payout, 167);
    assert.equal(p.legs, 3);
    const mine = await t.call(u, 'my_bets');
    assert.equal(mine.length, 2);
    const parlay = mine.find(b => b.is_parlay);
    assert.deepEqual(parlay.legs.map(l => l.label), ['A −2.5', 'Over 10.5', 'Y']);
    assert.equal(parlay.status, 'open');
    assert.equal(parlay.week, W);
  });

  test('place_bet validations: odds changed, limits, balance, same event, unknown, nickname', async () => {
    await t.setNow(BEFORE);
    const u = await t.newUser('bettor_two');
    await rejectsWith(assert, bet(u, [S.mlA], 10, [1.95]), /Odds changed — review your slip/);
    await rejectsWith(assert, bet(u, [S.mlA, S.over], 10, [1.9091]), /Odds changed/);
    await rejectsWith(assert, bet(u, [S.mlA], 0), /at least 1 coin/);
    await rejectsWith(assert, bet(u, [S.mlA], 501), /up to 500/);
    await rejectsWith(assert, bet(u, [], 10, []), /1 to 4 picks/);
    await rejectsWith(assert, bet(u, [S.mlA, S.over, S.topA, S.secX, S.yes], 10), /1 to 4 picks/);
    await rejectsWith(assert, bet(u, [S.mlA, S.spA], 10), /different events/);
    await rejectsWith(assert, bet(u, [S.over, S.under], 10), /different events/);
    await rejectsWith(assert, bet(u, [S.mlA, S.mlA], 10), /only once/);
    await rejectsWith(assert, bet(u, ['nope'], 10, [2]), /no longer available/);
    await t.root('update public.profiles set coins = 40 where id = $1', [u]);
    await rejectsWith(assert, bet(u, [S.mlA], 41), /only have 40 coins/);
    assert.equal((await bet(u, [S.mlA], 40)).coins, 0);
    await rejectsWith(assert, bet(u, [S.mlA], 1), /only have 0 coins/);
    assert.equal(await t.coins(u), 0);
    const nonick = await t.newUser();
    await rejectsWith(assert, bet(nonick, [S.mlA], 1), /nickname/);
    // nothing was written by the refused bets
    assert.equal(Number((await t.root('select count(*) n from public.bets where user_id = $1', [u])).rows[0].n), 1);
  });

  test('payout cap 10,000 and daily limit of 50 bets', async () => {
    await t.setNow(BEFORE);
    const u = await t.newUser('whale_bettor');
    await t.root('update public.profiles set coins = 100000 where id = $1', [u]);
    const r = await bet(u, [S.topA, S.secX], 50);                // 50 x 51 x 10 = 25,500 -> capped (long shot: 50 coins max)
    assert.equal(r.potential_payout, 10000);
    // 49 more today is fine; the 51st is refused
    await t.root(`insert into public.bets (user_id, week, created_at, stake, potential_payout, is_parlay) select $1, $2, $3::timestamptz, 1, 1, false from generate_series(1, 49)`, [u, W, BEFORE]);
    await rejectsWith(assert, bet(u, [S.mlB], 1), /up to 50 bets a day/);
    // a new New York day resets it (BEFORE is Sunday 16:00 NY; 04:30 UTC Monday is still Sunday NY)
    await t.setNow('2026-09-28T03:59:00Z');
    await rejectsWith(assert, bet(u, [S.mlB], 1), /up to 50 bets a day/);
    await t.setNow('2026-09-28T04:30:00Z');
    assert.equal((await bet(u, [S.mlB], 1)).legs, 1);
    await t.root(`delete from public.bets where user_id = $1 and stake = 1 and potential_payout = 1`, [u]);
    await t.setNow(BEFORE);
  });

  test('odds freeze once bet on; re-pricing moves the others; players must re-confirm', async () => {
    await t.setNow(BEFORE);
    const u = await t.newUser('reprice_guy');
    await bet(u, [S.topB], 5);                                   // topB now has a bet
    const moved = JSON.parse(JSON.stringify(BOOK));
    for (const e of moved.events) for (const s of e.selections) if (s.id === S.topB || s.id === S.topC) { s.americanOdds = 600; s.decimalOdds = 7; }
    const r = await upsert(moved);
    assert.ok(r.frozen >= 1);
    const odds = Object.fromEntries((await t.root('select id, decimal_odds from public.book_selections where id = any($1)', [[S.topB, S.topC]])).rows.map(x => [x.id, Number(x.decimal_odds)]));
    assert.deepEqual(odds, { [S.topB]: 20, [S.topC]: 7 });
    await rejectsWith(assert, bet(u, [S.topC], 5, [5]), /Odds changed — review your slip/);
    assert.equal((await bet(u, [S.topC], 5, [7])).potential_payout, 35);
    await upsert(BOOK);                                          // back to the original prices (topC has a bet now: stays 7)
    assert.equal(Number((await t.root('select decimal_odds from public.book_selections where id = $1', [S.topC])).rows[0].decimal_odds), 7);
    DEC[S.topC] = 7;
  });

  test('closed: at the lock nothing can be bet; close_due_book; upsert leaves closed events alone', async () => {
    const u = await t.newUser('late_bettor');
    await t.setNow(LOCK);
    await rejectsWith(assert, bet(u, [S.mlA], 5), /closed/);
    assert.equal((await t.admin('select public.close_due_book() n')).rows[0].n, 5);
    assert.equal((await t.admin('select public.close_due_book() n')).rows[0].n, 0);
    await t.setNow(BEFORE);                                      // even with the clock back, status closed blocks bets
    await rejectsWith(assert, bet(u, [S.mlA], 5), /closed/);
    const r = await upsert(BOOK);
    assert.equal(r.skipped, 5);
    assert.equal(r.events, 0);
  });

  test('settle: singles, parlays with void legs, all-void refund, idempotent, missing results void', async () => {
    // fresh week so this test controls every bet
    const W2 = '2026-W41', LOCK2 = '2026-10-05T13:30:00.000Z';
    const book2 = JSON.parse(JSON.stringify(BOOK).replaceAll(W, W2));
    book2.locksAt = LOCK2;
    await t.setNow('2026-10-04T12:00:00Z');
    await upsert(book2);
    const id = s => s.replace(W, W2);
    const d = s => DEC[s] === 7 ? 5 : DEC[s];
    const b2 = (uid, ids, stake) => t.call(uid, 'place_bet', [ids.map(id), stake, ids.map(d)]);
    const u = await t.newUser('settle_me');
    const single = await b2(u, [S.mlA], 100);                    // win: +190
    const loser = await b2(u, [S.under], 50);                    // lose
    const pVoid = await b2(u, [S.spA, S.over, S.topA], 10);      // spA void (row missing in results), over win, topA void -> 10 x 3.5 = 35
    const allVoid = await b2(u, [S.topB, S.secX], 20);           // both void -> refund 20
    const pLost = await b2(u, [S.secY, S.yes], 10);              // secY win, yes lose -> lost
    const mlTieUser = await t.newUser('tie_fan');
    const tie = await b2(mlTieUser, [S.mlB], 30);                // void -> 30 back
    assert.equal(await t.coins(u), 1000 - 100 - 50 - 10 - 20 - 10);
    await t.setNow('2026-10-10T12:00:00Z');
    await t.admin('select public.close_due_book()');
    const results = {
      [id(S.mlA)]: 'win', [id(S.mlB)]: 'void', [id(S.spB)]: 'win',
      [id(S.over)]: 'win', [id(S.under)]: 'lose',
      [id(S.topA)]: 'void', [id(S.topB)]: 'void', [id(S.topC)]: 'lose',
      [id(S.secX)]: 'void', [id(S.secY)]: 'win', [id(S.yes)]: 'lose', [id(S.no)]: 'win'
    };  // spA left out on purpose: missing results are void
    await rejectsWith(assert, t.admin('select public.settle_book($1::jsonb)', [JSON.stringify({ week: W2, results: { x: 'maybe' } })]), /win, lose or void/);
    const r = (await t.admin('select public.settle_book($1::jsonb) r', [JSON.stringify({ week: W2, results, notes: { [id(`${W}:top`)]: 'Top: C' } })])).rows[0].r;
    assert.equal(r.bets, 6);
    assert.equal(r.already, false);
    const st = Object.fromEntries((await t.root('select id, status, payout from public.bets where user_id = any($1)', [[u, mlTieUser]])).rows.map(x => [x.id, [x.status, x.payout]]));
    assert.deepEqual(st[single.id], ['won', 190]);
    assert.deepEqual(st[loser.id], ['lost', 0]);
    assert.deepEqual(st[pVoid.id], ['won', 35]);
    assert.deepEqual(st[allVoid.id], ['void', 20]);
    assert.deepEqual(st[pLost.id], ['lost', 0]);
    assert.deepEqual(st[tie.id], ['void', 30]);
    const expected = 1000 - 190 + 190 + 35 + 20;
    assert.equal(await t.coins(u), expected);
    assert.equal(await t.coins(mlTieUser), 1000);
    assert.equal((await t.root('select result from public.book_selections where id = $1', [id(S.spA)])).rows[0].result, 'void');
    const evs = Object.fromEntries((await t.root('select id, status, result from public.book_events where week = $1', [W2])).rows.map(x => [x.id, x]));
    assert.equal(evs[id(`${W}:top`)].status, 'settled');
    assert.equal(evs[id(`${W}:top`)].result.note, 'Top: C');
    // idempotent: a second run changes nothing and pays nothing
    const again = (await t.admin('select public.settle_book($1::jsonb) r', [JSON.stringify({ week: W2, results: { ...results, [id(S.under)]: 'win' } })])).rows[0].r;
    assert.equal(again.already, true);
    assert.equal(await t.coins(u), expected);
    assert.equal((await t.root('select result from public.book_selections where id = $1', [id(S.under)])).rows[0].result, 'lose');
    // settled events take no bets, and my_bets shows results
    await t.setNow('2026-10-04T12:00:00Z');
    await rejectsWith(assert, b2(u, [S.no], 5), /closed/);
    const mine = await t.call(u, 'my_bets');
    const pv = mine.find(b => b.id === pVoid.id);
    assert.deepEqual(pv.legs.map(l => l.result), ['void', 'win', 'void']);
    // leaderboard: net = payouts - stakes of settled bets
    const lb = (await t.as(null, 'select * from public.book_leaderboard($1)', [W2])).rows;
    const me = lb.find(x => x.nickname === 'settle_me');
    assert.equal(Number(me.net), (190 + 0 + 35 + 20 + 0) - (100 + 50 + 10 + 20 + 10));
    assert.equal(Number(me.bets), 5);
    assert.equal(Number(lb.find(x => x.nickname === 'tie_fan').net), 0);
    // a week where every selection is void becomes a void event
    const W3 = '2026-W42';
    const book3 = { week: W3, locksAt: '2026-10-12T13:30:00Z', events: [{ id: `${W3}:x`, type: 'h2h', title: 'X', selections: [sel(`${W3}:x:1`, 'one', 100, 2)] }] };
    await t.setNow('2026-10-11T12:00:00Z');
    await upsert(book3);
    const vb = await t.call(u, 'place_bet', [[`${W3}:x:1`], 7, [2]]);
    await t.admin('select public.settle_book($1::jsonb)', [JSON.stringify({ week: W3, results: {} })]);
    assert.equal((await t.root('select status from public.book_events where id = $1', [`${W3}:x`])).rows[0].status, 'void');
    assert.deepEqual((await t.root('select status, payout from public.bets where id = $1', [vb.id])).rows[0], { status: 'void', payout: 7 });
  });

  test('upsert_book removes dropped selections/events without bets, keeps ones with bets', async () => {
    const W4 = '2026-W43';
    await t.setNow('2026-10-18T12:00:00Z');
    const mk = (evs) => ({ week: W4, locksAt: '2026-10-19T13:30:00Z', events: evs });
    const e1 = { id: `${W4}:e1`, type: 'h2h', title: 'E1', selections: [sel(`${W4}:e1:a`, 'a', 100, 2), sel(`${W4}:e1:b`, 'b', 100, 2)] };
    const e2 = { id: `${W4}:e2`, type: 'h2h', title: 'E2', selections: [sel(`${W4}:e2:a`, 'a', 100, 2)] };
    const e3 = { id: `${W4}:e3`, type: 'h2h', title: 'E3', selections: [sel(`${W4}:e3:a`, 'a', 100, 2)] };
    await upsert(mk([e1, e2, e3]));
    const u = await t.newUser('keeper');
    await t.call(u, 'place_bet', [[`${W4}:e2:a`], 5, [2]]);
    const r = await upsert(mk([{ ...e1, selections: [e1.selections[0]] }]));
    assert.equal(r.removed, 1);                                   // e3 gone, e2 kept (has a bet)
    const ids = (await t.root('select id from public.book_selections where event_id like $1 order by id', [`${W4}%`])).rows.map(x => x.id);
    assert.deepEqual(ids, [`${W4}:e1:a`, `${W4}:e2:a`]);
  });
});
