// node --test 'scripts/lib/supa/*.test.mjs'
// supabase/migrations/0003_book_wealth.sql in PGlite: price-market event types, long-shot stake caps,
// settle_book_events (only the events passed), book_season_leaderboard.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, rejectsWith, MODES } from './pgtest.mjs';

const W = '2026-W40';
const LOCK = '2026-09-28T13:30:00.000Z';
const WEEK_CLOSE = '2026-09-25T20:00:00.000Z';   // Friday 4 PM New York before the week
const TUE_CLOSE = '2026-09-28T20:00:00.000Z';    // Tuesday's daily board closes at Monday's close
const sel = (id, label, americanOdds, decimalOdds, extra = {}) => ({ id, label, americanOdds, decimalOdds, fairProb: 0.3, ...extra });
const E = { blast: `${W}:blast:pct:up:week`, ladder: `${W}:ladder:a`, race: `${W}:race:b:a`, daily: `${W}:blast:pct:up:2026-09-29`, h2h: `${W}:h2h:a:b`, duel: `${W}:duel:a:b`, bracket: `${W}:bracket:a` };
const S = {
  x1: `${E.blast}:a`, x2: `${E.blast}:b`, x3: `${E.blast}:c`, x4: `${E.blast}:d`,
  l1: `${E.ladder}:up2`, l2: `${E.ladder}:down2`, yes: `${E.race}:yes`, no: `${E.race}:no`,
  d1: `${E.daily}:a`, d2: `${E.daily}:b`, mlA: `${E.h2h}:ml:a`, mlB: `${E.h2h}:ml:b`,
  duA: `${E.duel}:ml:a`, duB: `${E.duel}:ml:b`, r0: `${E.bracket}:r0`, r1: `${E.bracket}:r1`
};
const BOOK = {
  week: W, locksAt: LOCK,
  events: [
    { id: E.blast, type: 'blast', title: 'Biggest % gainer this week', closesAt: WEEK_CLOSE, sort: 0, params: { metric: 'pct', side: 'up' }, selections: [
      sel(S.x1, 'A', 2000, 21, { market: 'pick', person: 'a' }), sel(S.x2, 'B', 500, 6, { market: 'pick', person: 'b' }),
      sel(S.x3, 'C', 490, 5.9, { market: 'pick', person: 'c' }), sel(S.x4, 'D', -110, 1.9091, { market: 'pick', person: 'd' })] },
    { id: E.ladder, type: 'ladder', title: "A: this week's move", closesAt: WEEK_CLOSE, sort: 1, selections: [
      sel(S.l1, 'Up 2% or more', 180, 2.8, { market: 'strike', person: 'a', line: 2 }), sel(S.l2, 'Down 2% or more', 180, 2.8, { market: 'strike', person: 'a', line: -2 })] },
    { id: E.race, type: 'race', title: 'Will B pass A?', closesAt: WEEK_CLOSE, sort: 2, selections: [
      sel(S.yes, 'Yes', 250, 3.5, { market: 'yes', person: 'b' }), sel(S.no, 'No', -300, 1.3333, { market: 'no' })] },
    { id: E.daily, type: 'blast', title: 'Biggest % gainer today (Tue Sep 29)', closesAt: TUE_CLOSE, sort: 3, selections: [
      sel(S.d1, 'A', 200, 3, { market: 'pick', person: 'a' }), sel(S.d2, 'B', -200, 1.5, { market: 'pick', person: 'b' })] },
    { id: E.h2h, type: 'h2h', title: 'A vs B', sort: 4, selections: [
      sel(S.mlA, 'A to win', -110, 1.9091, { market: 'ml', person: 'a' }), sel(S.mlB, 'B to win', -110, 1.9091, { market: 'ml', person: 'b' })] },
    { id: E.duel, type: 'duel', title: 'A vs B: dollar change', closesAt: WEEK_CLOSE, sort: 5, selections: [
      sel(S.duA, 'A to win', -110, 1.9091, { market: 'ml', person: 'a' }), sel(S.duB, 'B to win', -110, 1.9091, { market: 'ml', person: 'b' })] },
    { id: E.bracket, type: 'bracket', title: "A: this week's range", closesAt: WEEK_CLOSE, sort: 6, selections: [
      sel(S.r0, 'Down more than 5%', 400, 5, { market: 'bracket', person: 'a' }), sel(S.r1, 'Up 5% or more', 400, 5, { market: 'bracket', person: 'a' })] }
  ]
};
const DEC = Object.fromEntries(BOOK.events.flatMap(e => e.selections.map(s => [s.id, s.decimalOdds])));

for (const mode of MODES) describe(mode, () => {
  let t;
  const bet = (uid, ids, stake) => t.call(uid, 'place_bet', [ids, stake, ids.map(i => DEC[i])]);
  const upsert = b => t.admin('select public.upsert_book($1::jsonb) r', [JSON.stringify(b)]).then(r => r.rows[0].r);
  const settleEvents = p => t.admin('select public.settle_book_events($1::jsonb) r', [JSON.stringify(p)]).then(r => r.rows[0].r);
  const status = async id => (await t.root('select status, payout from public.bets where id = $1', [id])).rows[0];
  before(async () => {
    t = await makeDb({ mode });
    await t.setNow('2026-09-24T12:00:00Z');
    const r = await upsert(BOOK);
    assert.equal(r.events, BOOK.events.length);
  });

  test('event types: the five price markets are accepted; anything else is refused; closesAt per event', async () => {
    const def = (await t.root(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'book_events_type_check'`)).rows;
    assert.equal(def.length, 1);                                  // one constraint after applying every migration twice
    for (const ty of ['blast', 'ladder', 'bracket', 'race', 'duel', 'h2h', 'prop_sector']) assert.match(def[0].d, new RegExp(`'${ty}'`));
    const types = (await t.root('select type from public.book_events where week = $1 order by sort', [W])).rows.map(x => x.type);
    assert.deepEqual(types, ['blast', 'ladder', 'race', 'blast', 'h2h', 'duel', 'bracket']);
    const closes = Object.fromEntries((await t.root('select id, closes_at from public.book_events where week = $1', [W])).rows.map(x => [x.id, new Date(x.closes_at).toISOString()]));
    assert.equal(closes[E.blast], WEEK_CLOSE);
    assert.equal(closes[E.daily], TUE_CLOSE);
    assert.equal(closes[E.h2h], LOCK);
    await rejectsWith(assert, upsert({ week: W, locksAt: LOCK, events: [{ id: `${W}:x`, type: 'moonshot', title: 'X', selections: [] }] }), /book_events_type_check|check constraint/);
  });

  test('long-shot caps: 21.0+ -> 50 coins, 6.0+ -> 150, otherwise 500; parlays use the combined odds', async () => {
    await t.setNow('2026-09-24T12:00:00Z');
    const u = await t.newUser('long_shot');
    await t.root('update public.profiles set coins = 100000 where id = $1', [u]);
    await rejectsWith(assert, bet(u, [S.x1], 51), /^Long shots are capped at 50 coins\.$/);
    assert.equal((await bet(u, [S.x1], 50)).potential_payout, 1050);
    await rejectsWith(assert, bet(u, [S.x2], 151), /^Long shots are capped at 150 coins\.$/);
    assert.equal((await bet(u, [S.x2], 150)).potential_payout, 900);
    assert.equal((await bet(u, [S.x3], 500)).potential_payout, 2950);          // 5.9 < 6.0: the normal limit
    await rejectsWith(assert, bet(u, [S.x3], 501), /up to 500/);
    assert.equal((await bet(u, [S.l1, S.x4], 500)).legs, 2);                   // 2.8 x 1.9091 = 5.35: normal limit
    await rejectsWith(assert, bet(u, [S.l1, S.yes], 151), /capped at 150/);   // 2.8 x 3.5 = 9.8
    await rejectsWith(assert, bet(u, [S.l1, S.yes, S.d1], 51), /capped at 50/);  // 2.8 x 3.5 x 3 = 29.4
    assert.equal((await bet(u, [S.l1, S.yes, S.d1], 50)).potential_payout, 1470);
  });

  test('settle_book_events: only the events passed, only once closed; bets pay when all their legs are in; idempotent', async () => {
    await t.setNow('2026-09-24T12:00:00Z');
    const u = await t.newUser('price_bettor');
    const single = await bet(u, [S.x1], 50);                       // win -> 1050
    const lad = await bet(u, [S.l1], 100);                         // win -> 280
    const lost = await bet(u, [S.no], 30);                         // lose
    const cross = await bet(u, [S.yes, S.d1], 10);                 // 3.5 x 3 = 10.5: waits for the daily board -> 105
    const mixed = await bet(u, [S.l2, S.mlA], 20);                 // l2 void (missing result) + h2h at week end -> 38
    const brk = await bet(u, [S.r0], 40);                          // bracket void (event not in results) -> refund 40
    assert.equal(await t.coins(u), 1000 - 50 - 100 - 30 - 10 - 20 - 40);

    await t.setNow('2026-09-26T12:00:00Z');                        // weekly markets closed; the daily board and h2h still open
    await rejectsWith(assert, settleEvents({ events: [E.blast] }), /week is required/);
    await rejectsWith(assert, settleEvents({ week: W, events: [E.blast], results: { [S.x1]: 'maybe' } }), /win, lose or void/);
    const r = await settleEvents({ week: W, events: [E.blast, E.ladder, E.race, E.bracket, E.daily, `${W}:nope`], results: {
      [S.x1]: 'win', [S.x2]: 'lose', [S.x3]: 'lose', [S.x4]: 'lose', [S.l1]: 'win', [S.yes]: 'win', [S.no]: 'lose', [S.d1]: 'win', [S.d2]: 'lose'
    }, notes: { [E.ladder]: 'a +2.40%.' } });
    assert.equal(r.events, 4);                                     // blast, ladder, race, bracket; the daily one has not closed
    assert.equal(r.skipped, 2);
    assert.equal(r.already, false);
    assert.deepEqual(await status(single.id), { status: 'won', payout: 1050 });
    assert.deepEqual(await status(lad.id), { status: 'won', payout: 280 });
    assert.deepEqual(await status(lost.id), { status: 'lost', payout: 0 });
    assert.deepEqual(await status(brk.id), { status: 'void', payout: 40 });
    assert.deepEqual(await status(cross.id), { status: 'open', payout: null });
    assert.deepEqual(await status(mixed.id), { status: 'open', payout: null });
    const ev = Object.fromEntries((await t.root('select id, status, result from public.book_events where week = $1', [W])).rows.map(x => [x.id, x]));
    assert.equal(ev[E.ladder].status, 'settled');
    assert.deepEqual(ev[E.ladder].result, { note: 'a +2.40%.', winners: [S.l1] });
    assert.equal(ev[E.bracket].status, 'void');
    assert.equal(ev[E.daily].status, 'open');
    assert.equal(ev[E.h2h].status, 'open');
    assert.equal(ev[E.duel].status, 'open');                       // not passed: untouched
    const selRes = Object.fromEntries((await t.root('select id, result from public.book_selections where event_id = any($1)', [[E.ladder, E.daily, E.duel]])).rows.map(x => [x.id, x.result]));
    assert.deepEqual(selRes, { [S.l1]: 'win', [S.l2]: 'void', [S.d1]: null, [S.d2]: null, [S.duA]: null, [S.duB]: null });
    const afterFirst = 1000 - 250 + 1050 + 280 + 40;
    assert.equal(await t.coins(u), afterFirst);
    // settled events take no bets; a rerun changes nothing
    await t.setNow('2026-09-24T12:00:00Z');
    await rejectsWith(assert, bet(u, [S.x4], 5), /closed/);
    await t.setNow('2026-09-26T12:00:00Z');
    const again = await settleEvents({ week: W, events: [E.blast, E.ladder], results: { [S.x1]: 'lose' } });
    assert.equal(again.already, true);
    assert.equal(await t.coins(u), afterFirst);

    // Tuesday: the daily board settles and pays the cross parlay
    await t.setNow('2026-09-29T21:00:00Z');
    assert.equal((await settleEvents({ week: W, events: [E.daily], results: { [S.d1]: 'win', [S.d2]: 'lose' } })).bets, 2);   // + long_shot's 3-leg parlay
    assert.deepEqual(await status(cross.id), { status: 'won', payout: 105 });
    // week end: settle_book finishes the rest and never changes a price market already settled
    await t.setNow('2026-10-03T12:00:00Z');
    await t.admin('select public.settle_book($1::jsonb)', [JSON.stringify({ week: W, results: { [S.mlA]: 'win', [S.mlB]: 'lose', [S.x1]: 'lose', [S.duA]: 'win', [S.duB]: 'lose' } })]);
    assert.deepEqual(await status(mixed.id), { status: 'won', payout: 38 });
    assert.equal((await t.root('select result from public.book_selections where id = $1', [S.x1])).rows[0].result, 'win');
    assert.equal(await t.coins(u), afterFirst + 105 + 38);
  });

  test('settle_book_events is for the sync job only', async () => {
    const u = await t.newUser('plain_player');
    for (const who of [null, u]) await rejectsWith(assert, t.as(who, `select public.settle_book_events('{}'::jsonb)`), /permission denied/);
  });

  test('season leaderboard: 10+ settled bets, staked, net, ROI; public', async () => {
    const mk = async (nick, rows) => {
      const id = await t.newUser(nick);
      for (const [stake, status, payout] of rows) {
        await t.root(`insert into public.bets (user_id, week, stake, potential_payout, status, payout, settled_at) values ($1, $2, $3, $4, $5, $6, now())`,
          [id, W, stake, stake * 3, status, payout]);
      }
      return id;
    };
    const ten = (win, lose) => [...Array(win).fill([10, 'won', 30]), ...Array(lose).fill([10, 'lost', 0])];
    const sharp = await mk('sharp_one', ten(5, 5));                // staked 100, net +50, ROI 0.5
    await mk('almost_there', ten(5, 4));                           // 9 bets: not listed
    await mk('cold_streak', [...ten(1, 10), [20, 'void', 20], [10, 'open', null]]);  // 12 settled, staked 130, net 20 - 100 + 0 = -80
    const lb = (await t.as(null, 'select * from public.book_season_leaderboard(500)')).rows;
    const by = Object.fromEntries(lb.map(x => [x.nickname, x]));
    assert.equal(by.almost_there, undefined);
    assert.deepEqual({ bets: Number(by.sharp_one.bets), staked: Number(by.sharp_one.staked), net: Number(by.sharp_one.net), roi: Number(by.sharp_one.roi) },
      { bets: 10, staked: 100, net: 50, roi: 0.5 });
    assert.deepEqual({ bets: Number(by.cold_streak.bets), staked: Number(by.cold_streak.staked), net: Number(by.cold_streak.net), roi: Number(by.cold_streak.roi) },
      { bets: 12, staked: 130, net: -80, roi: -0.6154 });
    assert.ok(lb.findIndex(x => x.nickname === 'sharp_one') < lb.findIndex(x => x.nickname === 'cold_streak'));
    for (let i = 1; i < lb.length; i++) assert.ok(Number(lb[i - 1].net) >= Number(lb[i].net));
    const mine = (await t.as(sharp, 'select nickname, is_me from public.book_season_leaderboard()')).rows.find(x => x.is_me);
    assert.equal(mine.nickname, 'sharp_one');
  });
});
