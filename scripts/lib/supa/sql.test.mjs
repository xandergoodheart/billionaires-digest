// node --test 'scripts/lib/supa/*.test.mjs'
// Runs supabase/migrations/0001_game.sql in PGlite (in-memory Postgres 18) with Supabase-like roles,
// then checks the rules as a player (role authenticated), a visitor (anon) and the service role.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, rejectsWith, MODES } from './pgtest.mjs';

const WEEK = {
  week: '2026-W40', start: '2026-09-28', end: '2026-10-02', locksAt: '2026-09-28T13:30:00Z',
  salaries: { a: 25, b: 22, c: 20, d: 18, e: 15, f: 12, g: 10, h: 30, x: 5 },
  draftable: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
};
const BEFORE_LOCK = '2026-09-27T20:00:00Z';
const AFTER_LOCK = '2026-09-29T15:00:00Z';

for (const mode of MODES) describe(mode, () => {
  let t;
  before(async () => {
    t = await makeDb({ mode });
    await t.setNow(BEFORE_LOCK);
    await t.admin('select public.upsert_week($1::jsonb)', [JSON.stringify(WEEK)]);
  });

  // ---------- nicknames ----------
  test('nickname: format, blocklist, case-insensitive unique', async () => {
    const u1 = await t.newUser();
    for (const [bad, re] of [
      ['ab', /3 to 20/], ['a'.repeat(21), /3 to 20/], ['bad name', /letters, numbers/], ['émile', /letters, numbers/],
      ['Admin_Bob', /not allowed/], ['sh1t_lord', /not allowed/], ['F-U-C-K', /not allowed/], ['cool-ass', /not allowed/]
    ]) await rejectsWith(assert, t.call(u1, 'set_nickname', [bad]), re);
    // whole-word terms do not block longer words
    assert.deepEqual(await t.call(u1, 'set_nickname', ['classic_bass']), { nickname: 'classic_bass' });
    assert.deepEqual(await t.call(u1, 'set_nickname', ['Nick_1']), { nickname: 'Nick_1' });
    const u2 = await t.newUser();
    await rejectsWith(assert, t.call(u2, 'set_nickname', ['nick_1']), /taken/);
    assert.equal(await t.coins(u1), 1000);
    // signed-out visitors cannot pick one
    await rejectsWith(assert, t.call(null, 'set_nickname', ['whoever']), /permission denied/);
    // players cannot write their own coins
    await rejectsWith(assert, t.as(u1, 'update public.profiles set coins = 999999 where id = auth.uid()'), /permission denied/);
  });

  // ---------- rosters ----------
  test('roster: validation, lock, RLS visibility', async () => {
    const u = await t.newUser('roster_guy');
    const other = await t.newUser('peeker');
    await t.setNow(BEFORE_LOCK);
    const save = (uid, picks, cap) => t.call(uid, 'save_roster', [WEEK.week, picks, cap]);
    await rejectsWith(assert, save(u, ['a', 'b', 'c', 'd'], 'a'), /exactly 5/);
    await rejectsWith(assert, save(u, ['a', 'b', 'c', 'd', 'd'], 'a'), /5 different/);
    await rejectsWith(assert, save(u, ['a', 'b', 'c', 'd', 'x'], 'a'), /x cannot be picked/);
    await rejectsWith(assert, save(u, ['a', 'b', 'c', 'd', 'e'], 'f'), /captain/);
    await rejectsWith(assert, save(u, ['h', 'a', 'b', 'c', 'd'], 'a'), /cost 115 points/);
    await rejectsWith(assert, t.call(u, 'save_roster', ['nope', ['a', 'b', 'c', 'd', 'e'], 'a']), /not open/);
    assert.equal((await save(u, ['a', 'b', 'c', 'd', 'e'], 'a')).saved, true);       // 100 exactly is fine
    assert.equal((await save(u, ['a', 'b', 'c', 'e', 'f'], 'c')).saved, true);       // edit before lock
    // direct writes: can't write someone else's roster
    await rejectsWith(assert, t.as(other, `insert into public.rosters (user_id, week, picks, captain) values ($1, $2, $3, $4)`,
      [u, WEEK.week, ['a', 'b', 'c', 'd', 'e'], 'a']), /row-level security/);
    // before lock: others can't see it, owner can
    assert.equal((await t.as(other, 'select * from public.rosters where user_id = $1', [u])).rows.length, 0);
    assert.equal((await t.as(null, 'select * from public.rosters')).rows.length, 0);
    assert.equal((await t.as(u, 'select captain from public.rosters where user_id = $1', [u])).rows[0].captain, 'c');
    // after lock: no changes, everyone can see
    await t.setNow(AFTER_LOCK);
    await rejectsWith(assert, save(u, ['a', 'b', 'c', 'd', 'e'], 'a'), /locked/);
    // a player with no roster yet may join late...
    assert.equal((await save(other, ['a', 'b', 'c', 'd', 'e'], 'a')).saved, true);
    // ...but not replace it afterwards, by upsert or by direct update
    await rejectsWith(assert, save(other, ['a', 'b', 'c', 'e', 'f'], 'c'), /locked/);
    await rejectsWith(assert, t.as(other, `update public.rosters set captain = 'b' where user_id = auth.uid()`), /locked/);
    await rejectsWith(assert, t.as(u, `update public.rosters set captain = 'a' where user_id = auth.uid()`), /locked/);
    assert.equal((await t.as(other, 'select * from public.rosters where user_id = $1', [u])).rows.length, 1);
    assert.equal((await t.as(null, 'select * from public.rosters where user_id = $1', [u])).rows.length, 1);
    await t.setNow(BEFORE_LOCK);
  });

  test('settle_week: captain 1.5x, only the week days, leaderboard', async () => {
    const u = await t.newUser('scorer');
    await t.setNow(BEFORE_LOCK);
    await t.call(u, 'save_roster', [WEEK.week, ['a', 'b', 'c', 'd', 'e'], 'a']);
    const days = [
      { date: '2026-09-28', people: [{ slug: 'a', points: 10, returnPct: 1.2 }, { slug: 'b', points: 4 }, { slug: 'h', points: 50 }] },
      { date: '2026-09-29', people: [{ slug: 'a', points: -2 }, { slug: 'c', points: 7 }] },
      { date: '2026-10-05', people: [{ slug: 'a', points: 100 }] } // next week: ignored
    ];
    // players cannot call admin functions
    await rejectsWith(assert, t.as(u, 'select public.upsert_points($1::jsonb)', [JSON.stringify(days)]), /permission denied/);
    await rejectsWith(assert, t.as(u, 'select public.settle_week($1)', [WEEK.week]), /permission denied/);
    assert.equal((await t.admin('select public.upsert_points($1::jsonb) n', [JSON.stringify(days)])).rows[0].n, 6);
    await t.setNow(AFTER_LOCK);
    await t.admin('select public.settle_week($1, true)', [WEEK.week]);
    const s = (await t.root('select points, days from public.team_scores where user_id = $1', [u])).rows[0];
    assert.equal(Number(s.points), 10 * 1.5 + 4 - 2 * 1.5 + 7); // 23
    assert.equal(s.days, 2);
    assert.equal((await t.root('select final from public.fantasy_weeks where week = $1', [WEEK.week])).rows[0].final, true);
    const lb = (await t.as(null, 'select * from public.leaderboard_week($1)', [WEEK.week])).rows;
    assert.ok(lb.some(r => r.nickname === 'scorer' && Number(r.points) === 23));
    assert.ok((await t.as(null, 'select * from public.leaderboard_season()')).rows.length >= 1);
    // late-entry rule: a roster stamped after the lock only counts days after its NY creation date
    await t.root('alter table public.rosters disable trigger rosters_check');
    await t.root(`update public.rosters set created_at = '2026-09-28T18:00:00Z' where user_id = $1`, [u]);
    await t.root('alter table public.rosters enable trigger rosters_check');
    await t.admin('select public.settle_week($1)', [WEEK.week]);
    const late = (await t.root('select points from public.team_scores where user_id = $1', [u])).rows[0];
    assert.equal(Number(late.points), -2 * 1.5 + 7);
    await t.setNow(BEFORE_LOCK);
  });

  test('late entry: allowed once after the lock, scores from the next trading day, not after the week ends', async () => {
    const W2 = { ...WEEK, week: '2026-W41', start: '2026-10-05', end: '2026-10-09', locksAt: '2026-10-05T13:30:00Z' };
    await t.admin('select public.upsert_week($1::jsonb)', [JSON.stringify(W2)]);
    const early = await t.newUser('early_bird'), late = await t.newUser('late_comer'), tooLate = await t.newUser('too_late');
    const picks = ['b', 'c', 'e', 'f', 'g'];  // not 'a': another test gave it points on 2026-10-05
    await t.setNow('2026-10-04T20:00:00Z');
    await t.call(early, 'save_roster', [W2.week, picks, 'g']);
    await t.setNow('2026-10-06T15:00:00Z'); // Tuesday 11:00 New York, after the lock
    assert.equal((await t.call(late, 'save_roster', [W2.week, picks, 'g'])).saved, true);
    await rejectsWith(assert, t.call(late, 'save_roster', [W2.week, ['a', 'b', 'c', 'd', 'e'], 'a']), /locked/);
    await rejectsWith(assert, t.as(late, `update public.rosters set captain = 'a' where user_id = auth.uid() and week = '2026-W41'`), /locked/);
    const ca = (await t.root(`select created_at from public.rosters where user_id = $1 and week = '2026-W41'`, [late])).rows[0].created_at;
    assert.equal(new Date(ca).toISOString(), '2026-10-06T15:00:00.000Z');
    await t.admin('select public.upsert_points($1::jsonb)', [JSON.stringify([
      { date: '2026-10-05', people: [{ slug: 'g', points: 100 }] },
      { date: '2026-10-06', people: [{ slug: 'g', points: 50 }] },
      { date: '2026-10-07', people: [{ slug: 'g', points: 8 }, { slug: 'f', points: 2 }] }
    ])]);
    await t.admin('select public.settle_week($1)', [W2.week]);
    const pts = async u => Number((await t.root(`select points from public.team_scores where user_id = $1 and week = '2026-W41'`, [u])).rows[0].points);
    assert.equal(await pts(early), 100 * 1.5 + 50 * 1.5 + 8 * 1.5 + 2);   // every day
    assert.equal(await pts(late), 8 * 1.5 + 2);                           // Wednesday on (joined Tuesday)
    // after Friday the week is closed to newcomers
    await t.setNow('2026-10-10T15:00:00Z');
    await rejectsWith(assert, t.call(tooLate, 'save_roster', [W2.week, picks, 'g']), /week is over/);
    await t.setNow(BEFORE_LOCK);
  });

  // ---------- coins ----------
  test('weekly top-up: once per NY week, only under 5,000', async () => {
    const u = await t.newUser('topper');
    await t.setNow('2026-09-28T03:30:00Z'); // Sunday 23:30 in New York: still ISO week 39 there
    assert.equal((await t.call(u, 'me')).topup_available, true);
    assert.equal((await t.call(u, 'claim_topup')).coins, 1250);
    await rejectsWith(assert, t.call(u, 'claim_topup'), /already claimed/);
    await t.setNow('2026-09-28T05:00:00Z'); // Monday 01:00 New York: new week
    assert.equal((await t.call(u, 'claim_topup')).week, '2026-W40');
    await t.root('update public.profiles set coins = 5000 where id = $1', [u]);
    await t.setNow('2026-10-06T12:00:00Z');
    await rejectsWith(assert, t.call(u, 'claim_topup'), /under 5,000/);
    assert.equal((await t.call(u, 'me')).topup_available, false);
    await t.setNow(BEFORE_LOCK);
  });

  // ---------- markets ----------
  async function newMarket(slug, extra = {}) {
    const r = await t.admin('select public.create_market($1::jsonb) r', [JSON.stringify({
      slug, question: 'Will A out-score B this week?', kind: 'h2h', params: { week: WEEK.week, a: 'a', b: 'b' },
      opens_at: '2026-09-27T00:00:00Z', closes_at: '2026-10-02T20:00:00Z', resolves_by: '2026-10-04T03:59:00Z', ...extra
    })]);
    return r.rows[0].r.id;
  }
  const price = async id => Number((await t.root('select public.lmsr_price_yes(q_yes, q_no, b) p from public.markets where id = $1', [id])).rows[0].p);

  test('LMSR: price in (0,1), cost monotonic, sell after buy returns <= spent', async () => {
    const id = await newMarket('lmsr-math');
    assert.equal((await t.admin('select public.create_market($1::jsonb) r', [JSON.stringify({ slug: 'lmsr-math', question: 'dup', kind: 'h2h', closes_at: '2026-10-02T20:00:00Z' })])).rows[0].r.created, false);
    const u = await t.newUser('trader1');
    await t.setNow(BEFORE_LOCK);
    assert.equal(await price(id), 0.5);
    let lastShares = 0, lastP = 0.5;
    // bigger spend -> more shares; price rises but stays under 1
    for (const c of [1, 10, 50, 100, 300]) {
      const s = Number((await t.root('select public.lmsr_shares_for(0, 0, 100, $1) s', [c])).rows[0].s);
      assert.ok(s > lastShares && s > c, `shares for ${c}`); lastShares = s;
    }
    const b1 = await t.call(u, 'buy', [id, 'yes', 100]);
    assert.ok(b1.price_yes > 0.5 && b1.price_yes < 1);
    assert.equal(b1.coins, 900);
    const p1 = await price(id); assert.ok(p1 > lastP); lastP = p1;
    const b2 = await t.call(u, 'buy', [id, 'yes', 100]);
    assert.ok(Number(b2.shares) < Number(b1.shares), 'same spend buys fewer shares at a higher price');
    // sell everything: get back at most what was spent
    const held = Number((await t.root('select yes_shares from public.positions where user_id = $1 and market_id = $2', [u, id])).rows[0].yes_shares);
    const sold = await t.call(u, 'sell', [id, 'yes', held]);
    assert.ok(sold.coins_back <= 200 && sold.coins_back >= 198, `got ${sold.coins_back}`);
    assert.ok(await t.coins(u) <= 1000);
    assert.ok(Math.abs(await price(id) - 0.5) < 1e-6);
    // NO side pushes price down
    const n1 = await t.call(u, 'buy', [id, 'no', 200]);
    assert.ok(n1.price_yes > 0 && n1.price_yes < 0.5);
    // can't sell more than held
    await rejectsWith(assert, t.call(u, 'sell', [id, 'yes', 1]), /only have/);
    await rejectsWith(assert, t.call(u, 'sell', [id, 'no', 1e6]), /only have/);
  });

  test('buy limits: balance never negative, 1..500, 99% band, closed markets', async () => {
    const id = await newMarket('limits');
    const u = await t.newUser('trader2');
    await t.setNow(BEFORE_LOCK);
    await rejectsWith(assert, t.call(u, 'buy', [id, 'yes', 0]), /at least 1/);
    await rejectsWith(assert, t.call(u, 'buy', [id, 'yes', 501]), /up to 500/);
    await rejectsWith(assert, t.call(u, 'buy', [id, 'maybe', 5]), /YES or NO/);
    await t.root('update public.profiles set coins = 30 where id = $1', [u]);
    await rejectsWith(assert, t.call(u, 'buy', [id, 'yes', 31]), /only have 30/);
    await t.call(u, 'buy', [id, 'yes', 30]);
    assert.equal(await t.coins(u), 0);
    await rejectsWith(assert, t.call(u, 'buy', [id, 'yes', 1]), /only have 0/);
    // band: a whale can't push YES past 99%
    const w = await t.newUser('whale');
    await t.root('update public.profiles set coins = 100000 where id = $1', [w]);
    let refused = false;
    for (let i = 0; i < 20 && !refused; i++) {
      try { await t.call(w, 'buy', [id, 'yes', 500]); } catch (e) { assert.match(e.message, /99%/); refused = true; }
    }
    assert.ok(refused);
    let p = await price(id); assert.ok(p > 0.5 && p <= 0.99, `price ${p}`);
    // smaller buys still go through until the band is reached
    for (let i = 0; i < 50; i++) { try { await t.call(w, 'buy', [id, 'yes', 20]); } catch (e) { assert.match(e.message, /99%/); break; } }
    p = await price(id); assert.ok(p > 0.97 && p <= 0.99, `price ${p}`);
    // closed: after closes_at nothing trades
    await t.setNow('2026-10-02T20:00:01Z');
    await rejectsWith(assert, t.call(w, 'buy', [id, 'no', 5]), /closed/);
    assert.equal((await t.admin('select public.close_due_markets() n')).rows[0].n >= 1, true);
    await t.setNow(BEFORE_LOCK);
    await rejectsWith(assert, t.call(w, 'buy', [id, 'no', 5]), /closed/); // status closed now
    // players can't touch the market row or call admin functions
    await rejectsWith(assert, t.as(w, `update public.markets set q_yes = 0`), /permission denied/);
    await rejectsWith(assert, t.as(w, `select public.resolve_market('limits', 'yes', 'x', null)`), /permission denied/);
    await rejectsWith(assert, t.as(null, `select public.buy($1, 'yes', 5)`, [id]), /permission denied/);
  });

  test('resolve: winners paid 1 coin per share, void refunds, idempotent', async () => {
    await t.setNow(BEFORE_LOCK);
    const id = await newMarket('resolve-yes');
    const yes = await t.newUser('yes_guy'), no = await t.newUser('no_guy');
    const by = await t.call(yes, 'buy', [id, 'yes', 100]);
    await t.call(no, 'buy', [id, 'no', 50]);
    const r = await t.admin(`select public.resolve_market('resolve-yes', 'yes', 'A 42 vs B 37', 'https://billionairesdigest.com/fantasy.html') r`);
    assert.equal(r.rows[0].r.status, 'resolved');
    assert.equal(await t.coins(yes), 900 + Math.floor(Number(by.shares)));
    assert.equal(await t.coins(no), 950);
    const again = await t.admin(`select public.resolve_market('resolve-yes', 'no', 'x', null) r`);
    assert.equal(again.rows[0].r.already, true);
    assert.equal(await t.coins(no), 950);
    // void: everyone gets their net stake back
    const id2 = await newMarket('resolve-void');
    const a = await t.newUser('void_a');
    await t.call(a, 'buy', [id2, 'yes', 120]);
    const held = Number((await t.root('select yes_shares from public.positions where user_id = $1 and market_id = $2', [a, id2])).rows[0].yes_shares);
    const back = (await t.call(a, 'sell', [id2, 'yes', held / 2])).coins_back;
    await t.admin(`select public.resolve_market('resolve-void', 'void', 'Tie: both 40', null)`);
    assert.equal(await t.coins(a), 1000);
    assert.ok(back > 0);
    const m = (await t.as(null, `select status, outcome from public.markets where slug = 'resolve-void'`)).rows[0];
    assert.deepEqual(m, { status: 'void', outcome: null });
    // positions are private
    assert.equal((await t.as(no, 'select * from public.positions where user_id = $1', [yes])).rows.length, 0);
    assert.equal((await t.as(yes, 'select * from public.positions where user_id = $1', [yes])).rows.length, 1);
    const cl = (await t.as(null, 'select * from public.coin_leaderboard()')).rows;
    assert.ok(cl.length > 0 && cl.every(x => x.nickname));
  });

  // ---------- leagues ----------
  test('leagues: codes, limits, members-only standings, leaving', async () => {
    await t.setNow(BEFORE_LOCK);
    const owner = await t.newUser('league_boss');
    await rejectsWith(assert, t.call(owner, 'create_league', ['no spaces here']), /League name/);
    await rejectsWith(assert, t.call(owner, 'create_league', ['nazi_club']), /not allowed/);
    const L = await t.call(owner, 'create_league', ['Desk_Crew']);
    assert.match(L.invite_code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    // codes are unique and random-looking
    const codes = new Set();
    for (let i = 0; i < 300; i++) codes.add((await t.root('select public.new_invite_code() c')).rows[0].c);
    assert.equal(codes.size, 300);
    for (const c of codes) assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    // joining: lower case and dashes are fine, twice is a no-op
    const j = await t.newUser('joiner');
    const code = L.invite_code.toLowerCase().replace(/^(.{4})/, '$1-');
    assert.equal((await t.call(j, 'join_league', [code])).already, false);
    assert.equal((await t.call(j, 'join_league', [L.invite_code])).already, true);
    await rejectsWith(assert, t.call(j, 'join_league', ['ZZZZZZZZ']), /No league/);
    // members-only
    const outsider = await t.newUser('outsider');
    await rejectsWith(assert, t.as(outsider, 'select * from public.league_standings($1)', [L.id]), /Only members/);
    assert.equal((await t.as(outsider, 'select * from public.leagues')).rows.length, 0);
    assert.equal((await t.as(outsider, 'select * from public.league_members')).rows.length, 0);
    const st = (await t.as(j, 'select * from public.league_standings($1)', [L.id])).rows;
    assert.deepEqual(st.map(r => r.nickname).sort(), ['joiner', 'league_boss']);
    assert.equal((await t.as(j, 'select * from public.my_leagues()')).rows[0].members, 2);
    // max 50 members
    await t.root(`insert into auth.users (id) select gen_random_uuid() from generate_series(1, 48)`);
    await t.root(`insert into public.profiles (id, nickname) select u.id, 'filler_' || row_number() over () from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)`);
    await t.root(`insert into public.league_members (league_id, user_id, joined_at) select $1, p.id, '2026-09-30' from public.profiles p where p.nickname::text like 'filler_%' limit 48`, [L.id]);
    await rejectsWith(assert, t.call(outsider, 'join_league', [L.invite_code]), /full/);
    // max 10 leagues per player
    const busy = await t.newUser('busy_bee');
    for (let i = 0; i < 10; i++) await t.call(busy, 'create_league', ['lg_' + i]);
    await rejectsWith(assert, t.call(busy, 'create_league', ['lg_10']), /up to 10/);
    const other = await t.call(outsider, 'create_league', ['Other_one']);
    await rejectsWith(assert, t.call(busy, 'join_league', [other.invite_code]), /up to 10/);
    // owner leaves -> oldest member takes over; last one out removes the league
    await t.call(owner, 'leave_league', [L.id]);
    assert.equal((await t.root('select owner from public.leagues where id = $1', [L.id])).rows[0].owner, j);
    await t.call(outsider, 'leave_league', [other.id]);
    assert.equal((await t.root('select count(*)::int n from public.leagues where id = $1', [other.id])).rows[0].n, 0);
    await rejectsWith(assert, t.call(outsider, 'leave_league', [L.id]), /not in that league/);
  });

  // ---------- privileges ----------
  test('privileges: visitors and players cannot write tables or call admin functions', async () => {
    const u = await t.newUser('priv_check');
    const tables = ['profiles', 'fantasy_weeks', 'person_points', 'rosters', 'team_scores', 'leagues', 'league_members', 'markets', 'positions', 'trades', 'name_blocklist'];
    for (const who of [null, u]) {
      for (const tb of tables) {
        await rejectsWith(assert, t.as(who, `delete from public.${tb}`), /permission denied/);
        await rejectsWith(assert, t.as(who, `insert into public.${tb} default values`), /permission denied|violates|null value|not open for picks/);
        if (tb !== 'rosters') await rejectsWith(assert, t.as(who, `update public.${tb} set ctid = ctid`), /permission denied|cannot assign|column "ctid"/);
      }
      await rejectsWith(assert, t.as(who, 'select * from public.name_blocklist'), /permission denied/);
      for (const q of [
        `select public.upsert_week('{}'::jsonb)`, `select public.upsert_points('[]'::jsonb)`, `select public.settle_week('x')`,
        `select public.create_market('{}'::jsonb)`, `select public.close_due_markets()`, `select public.resolve_market('x', 'yes', null, null)`,
        `select public.new_invite_code()`, `select public.name_problem('abc')`
      ]) await rejectsWith(assert, t.as(who, q), /permission denied/);
    }
    // anon inserts into rosters are refused outright (no grant), even for a made-up row
    await rejectsWith(assert, t.as(null, `insert into public.rosters (user_id, week, picks, captain) values ($1, $2, $3, 'a')`, [u, WEEK.week, ['a', 'b', 'c', 'd', 'e']]), /permission denied/);
    // players cannot set their own created_at to dodge the late-entry rule
    await rejectsWith(assert, t.as(u, `update public.rosters set created_at = now()`), /permission denied/);
    // visitors can read public boards and markets
    assert.ok(Array.isArray((await t.as(null, 'select * from public.coin_leaderboard(5)')).rows));
    assert.ok(Array.isArray((await t.as(null, 'select slug from public.markets')).rows));
    await rejectsWith(assert, t.as(null, 'select * from public.positions'), /permission denied/);
    // the service role can read tables for the sync job
    assert.ok(Array.isArray((await t.admin('select week, final from public.fantasy_weeks')).rows));
  });
});
