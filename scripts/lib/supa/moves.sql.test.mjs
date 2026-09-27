// node --test 'scripts/lib/supa/*.test.mjs'
// supabase/migrations/0004_moves.sql in PGlite: the Next Moves market kinds and set_market_start_odds.
// (Every migration is applied twice by makeDb, so this also checks 0004 is safe to re-run.)
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, rejectsWith, MODES } from './pgtest.mjs';
import { probToQ } from '../moves.mjs';

const CLOSES = '2026-10-31T20:00:00Z';
const mk = (slug, kind) => ({ slug, question: `Q ${slug}?`, kind, params: { startProb: 0.8 }, closes_at: CLOSES, b: 100 });

for (const mode of MODES) describe(mode, () => {
  let t;
  const create = p => t.admin('select public.create_market($1::jsonb) r', [JSON.stringify(p)]).then(r => r.rows[0].r);
  const odds = (slug, p) => t.admin('select public.set_market_start_odds($1, $2) r', [slug, p]).then(r => r.rows[0].r);
  const row = async slug => (await t.root('select id, q_yes, q_no, b, kind from public.markets where slug = $1', [slug])).rows[0];
  before(async () => {
    t = await makeDb({ mode });
    await t.setNow('2026-09-27T16:00:00Z');
  });

  test('kinds: the new Next Moves kinds are accepted, the old ones still are, anything else is refused; one constraint', async () => {
    const def = (await t.root(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'markets_kind_check'`)).rows;
    assert.equal(def.length, 1);
    for (const k of ['h2h', 'insider_buy', 'sector_top', 'other', 'insider_sell', 'sale_size', 'fund_move']) {
      assert.match(def[0].d, new RegExp(`'${k}'`));
      assert.equal((await create(mk(`kind-${k}`, k))).created, true);
    }
    await rejectsWith(assert, create(mk('kind-bad', 'rank_hold')), /markets_kind_check|check constraint/);
  });

  test('set_market_start_odds: the market opens at the starting odds, matching the JS math', async () => {
    await create(mk('mv-odds', 'insider_sell'));
    const r = await odds('mv-odds', 0.8);
    assert.equal(r.set, true);
    assert.ok(Math.abs(Number(r.price_yes) - 0.8) < 1e-9);
    const m = await row('mv-odds');
    const q = probToQ(0.8, 100);
    assert.ok(Math.abs(Number(m.q_yes) - q.q_yes) < 1e-9 && Number(m.q_no) === 0);
    const low = await odds('mv-odds', 0.2);
    assert.ok(Math.abs(Number(low.price_yes) - 0.2) < 1e-9);
    const m2 = await row('mv-odds');
    assert.equal(Number(m2.q_yes), 0);
    assert.ok(Number(m2.q_no) > 0);
    await rejectsWith(assert, odds('mv-odds', 1), /between 0.01 and 0.99/);
    await rejectsWith(assert, odds('mv-nope', 0.5), /unknown market/);
  });

  test('set_market_start_odds refuses once anyone has traded, and on closed markets', async () => {
    await create(mk('mv-traded', 'fund_move'));
    await odds('mv-traded', 0.3);
    const u = await t.newUser('mover_one');
    const m = await row('mv-traded');
    const b = await t.call(u, 'buy', [m.id, 'yes', 50]);
    assert.ok(Number(b.price_yes) > 0.3);
    const before = await row('mv-traded');
    const r = await odds('mv-traded', 0.9);
    assert.deepEqual([r.set, r.reason], [false, 'already traded']);
    const after = await row('mv-traded');
    assert.equal(String(after.q_yes), String(before.q_yes));
    await create({ ...mk('mv-closed', 'sale_size'), closes_at: '2026-09-27T12:00:00Z' });
    await t.admin('select public.close_due_markets()');
    assert.deepEqual((await odds('mv-closed', 0.4)).reason, 'not open');
  });

  test('resolve_market pays a Next Moves market like any other', async () => {
    await create(mk('mv-pay', 'insider_buy'));
    await odds('mv-pay', 0.6);
    const u = await t.newUser('mover_two');
    const m = await row('mv-pay');
    const start = await t.coins(u);
    const b = await t.call(u, 'buy', [m.id, 'yes', 100]);
    const r = (await t.admin('select public.resolve_market($1, $2, $3, $4) r', ['mv-pay', 'yes', 'Form 4 filed', 'https://www.sec.gov/x'])).rows[0].r;
    assert.equal(r.status, 'resolved');
    assert.equal(await t.coins(u), start - 100 + Math.floor(Number(b.shares)));
  });

  test('only the service role may set starting odds', async () => {
    const u = await t.newUser('mover_three');
    await rejectsWith(assert, t.as(u, `select public.set_market_start_odds('mv-odds', 0.5)`), /permission denied/);
    await rejectsWith(assert, t.as(null, `select public.set_market_start_odds('mv-odds', 0.5)`), /permission denied/);
  });
});
