import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Session } from '../src/persistence/Session';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots';
import { Crown, crownRules } from '../src/simulation/Crown';
import { royalAidCooldownMs, royalPrivileges, tributeReduction } from '../src/simulation/RoyalPrivileges';
import type { RoyalPrivilege, RoyalRequest } from '../src/simulation/RoyalPrivileges';
import { unitsPerResource as U } from '../src/economy/Inventories';
import { tradeRules } from '../src/economy/ExternalTrade';
import { royalPrivilegeMessage } from '../src/story/RoyalScenes';

const c = (column: number, row = 2) => ({ column, row });
const warehouse = 'warehouse:3,2', period = crownRules.periodMs;
const json = (game: Session) => JSON.parse(JSON.stringify(game.saveState(null)));
function favor(game: Session, amount: number) {
  game.simulation.crown.restoreState({ ...game.simulation.crown.saveState(), favor: amount,
    confidence: amount > 0 ? null : undefined }, game.simulation.simulatedTimeMs);
}
function fixture(amount = 100, buildings = true) {
  const game = new Session();
  if (buildings) {
    game.map.place(c(0, 1), 'villageCenter');
    for (let x = 1; x <= 12; x++) game.map.place(c(x, 1), 'road');
    for (const [cell, type] of [[c(1), 'farm'], [c(3), 'warehouse'], [c(6), 'market'], [c(9), 'well'],
      [c(8), 'house'], [c(10), 'house'], [c(11), 'house']] as const) game.map.place(cell, type);
    game.simulation.recalculate();
    const state = game.saveState(null);
    for (const home of state.population.residences) home.residents = 4;
    state.crown.favor = amount;
    return Session.restore(state).session;
  }
  favor(game, amount); return game;
}
const request = (game: Session, kind: RoyalPrivilege) => game.simulation.crown.preparePrivilege(kind);
const claim = (game: Session, kind: RoyalPrivilege) => game.simulation.requestRoyalPrivilege(request(game, kind));
const grantEvents = (game: Session) => game.economy.history.read().filter(event => event.operation.startsWith('royal-'));

test.each([0, 50, 59])('favor %i cannot request provisions and spends nothing', amount => {
  const game = fixture(); favor(game, amount);
  const before = json(game);
  assert.match(game.simulation.royalPrivilegeIssue('food')!, /Requiere 60/);
  assert.equal(claim(game, 'food'), false); assert.equal(claim(game, 'wood'), false);
  assert.deepEqual(json(game), before);
});

test.each(['food', 'wood'] as const)('%s provisions arrive entirely in a real warehouse with one favor debit and audit', product => {
  const game = fixture(60), before = game.economy.resources, rule = royalPrivileges[product];
  const stock = game.economy.storage.inventories.snapshot(warehouse)!;
  const reserve = game.economy.distribution.bootstrapActive;
  assert.ok(claim(game, product));
  assert.equal(game.economy.resources[product], before[product] + rule.amount);
  assert.equal(game.economy.storage.inventories.snapshot(warehouse)!.goods[product], stock.goods[product] + rule.amount * U);
  assert.equal(game.simulation.crown.favor, 52);
  assert.equal(game.economy.distribution.bootstrapActive, reserve);
  assert.equal(game.simulation.crown.audiences.nextAidAt, royalAidCooldownMs);
  const events = grantEvents(game);
  assert.equal(events.length, 1); assert.equal(events[0].operation, 'royal-aid');
  assert.equal(events[0].origin, 'royal-audience:1'); assert.equal(events[0].destination, warehouse);
  assert.equal(events[0].units, rule.amount * U);
  assert.equal(game.economy.storage.logistics.operations.length, 0);
});

test.each(['full', 'reservation', 'permission', 'draining', 'demolition', 'disconnected', 'unemployed', 'missing'] as const)('%s storage blocks the whole supply without losing favor or starting cooldown', cause => {
  let game = fixture(100, cause !== 'missing');
  const ledger = game.economy.storage.inventories;
  if (cause === 'full' || cause === 'reservation') {
    const stock = ledger.saveState(); stock.find(entry => entry.id === warehouse)!.goods.food = (cause === 'full' ? 295 : 280) * U;
    ledger.restoreState(stock);
    if (cause === 'reservation') ledger.reserveIncoming(warehouse, 1);
  }
  if (cause === 'permission') ledger.setProductEnabled(warehouse, 'food', false);
  if (cause === 'draining') ledger.setDraining(warehouse, true);
  if (cause === 'demolition') game.economy.storage.logistics.stopForDemolition(c(3));
  if (cause === 'disconnected') { game.map.remove(c(2, 1)); game.simulation.recalculate(); }
  if (cause === 'unemployed') {
    const state = game.saveState(null); for (const home of state.population.residences) home.residents = 0;
    state.population.workers = state.population.workers.map(([id]) => [id, 0] as const);
    game = Session.restore(state).session;
  }
  const before = json(game);
  for (let repeat = 0; repeat < 5; repeat++) assert.equal(claim(game, 'food'), false);
  assert.deepEqual(json(game), before);
  assert.equal(grantEvents(game).length, 0);
  assert.equal(game.simulation.crown.audiences.nextAidAt, 0);
});

test('a subsidized indebted treasury recovers exactly 20 gold, once, without minting mission or tax income', () => {
  const game = fixture(80, false);
  assert.ok(game.economy.payBuildingCost({ gold: 340, wood: 0 }, 'construction', 'fixture'));
  const quote = request(game, 'gold');
  assert.ok(game.simulation.requestRoyalPrivilege(quote));
  assert.equal(game.economy.credit.balance, -170); assert.equal(game.economy.credit.debt, 170);
  assert.equal(game.simulation.crown.favor, 65);
  for (let i = 0; i < 100; i++) assert.equal(game.simulation.requestRoyalPrivilege(quote), false);
  assert.equal(game.economy.credit.balance, -170);
  const events = grantEvents(game); assert.equal(events.length, 1);
  assert.equal(events[0].operation, 'royal-subsidy');
  assert.equal(events[0].units / (events[0].unitScale ?? U), 20);
});

test('food, wood and gold share cooldown; failed or stale quotes never grant a second aid', () => {
  const game = fixture(), stale = request(game, 'gold');
  assert.ok(claim(game, 'food'));
  const saved = json(game);
  for (const kind of ['food', 'wood', 'gold'] as const) assert.equal(claim(game, kind), false);
  assert.equal(game.simulation.requestRoyalPrivilege(stale), false);
  assert.deepEqual(json(game), saved);
  assert.deepEqual(game.simulation.crown.audiences.used, { food: 1, wood: 0, gold: 0, intercession: 0 });
});

test.each([1, 2, 3] as const)('pause, speed changes and the exact 72-hour boundary retain cooldown at ×%s', speed => {
  const game = fixture(100, false), quote = request(game, 'gold');
  assert.ok(game.simulation.requestRoyalPrivilege(quote));
  game.simulation.setSpeed(speed); game.simulation.setPaused(true);
  const paused = json(game); game.simulation.advance(royalAidCooldownMs);
  assert.deepEqual(json(game), paused);
  game.simulation.setPaused(false); game.simulation.advance((royalAidCooldownMs - 1) / speed);
  assert.equal(claim(game, 'gold'), false);
  const saved = json(game), loaded = Session.restore(saved).session;
  assert.deepEqual(loaded.simulation.crown.audiences, game.simulation.crown.audiences);
  loaded.simulation.setSpeed(speed === 3 ? 1 : 3);
  loaded.simulation.advance(1 / loaded.simulation.speed + 0.01);
  assert.equal(loaded.simulation.simulatedTimeMs, royalAidCooldownMs);
  assert.equal(loaded.simulation.requestRoyalPrivilege(quote), false); // Expired sequence, despite restored eligibility.
  assert.ok(claim(loaded, 'gold'));
  assert.equal(loaded.simulation.crown.audiences.sequence, 2);
});

test.each(['aldea', 'pueblo', 'villa'] as const)('%s intercession saves exactly 15 percent capped at 50 and persists through payment', rank => {
  const crown = new Crown(); crown.restoreState({ ...crown.saveState(), favor: 100 }, 0); crown.advance(period, rank);
  const before = crown.obligation!, quote = crown.preparePrivilege('intercession');
  let callbacks = 0;
  assert.ok(crown.requestPrivilege(quote, period, () => { callbacks++; return true; }));
  const reduction = tributeReduction(before.gold);
  assert.equal(reduction, rank === 'aldea' ? 7.5 : rank === 'pueblo' ? 22.5 : 50);
  assert.equal(crown.obligation!.gold, before.gold - reduction);
  assert.equal(crown.obligation!.dueAt, before.dueAt); assert.equal(crown.nextAt, before.dueAt);
  assert.equal(crown.obligation!.discount!.originalGold, before.gold);
  assert.equal(crown.favor, 82);
  const loaded = new Crown(); loaded.restoreState(JSON.parse(JSON.stringify(crown.saveState())), period);
  assert.deepEqual(loaded.obligation, crown.obligation);
  assert.equal(loaded.requestPrivilege(quote, period, () => { callbacks++; return true; }), false);
  assert.equal(callbacks, 1);
  let charged = 0;
  assert.ok(loaded.pay(before.dueAt, period, gold => { charged += gold; return true; }));
  assert.equal(charged, before.gold - reduction); assert.equal(loaded.tributeTotal, charged);
  const paid = new Crown(); paid.restoreState(JSON.parse(JSON.stringify(loaded.saveState())), period);
  assert.equal(paid.pay(before.dueAt, period, () => true), false);
  assert.equal(paid.privilegeIssue('intercession', period) !== null, true);
});

test('intercession audits a reduced liability, never credits treasury, and does not consume the shared aid slot', () => {
  const game = fixture(100, false); game.simulation.advance(period);
  const before = game.economy.credit.balance, nextAt = game.simulation.crown.nextAt;
  assert.ok(claim(game, 'intercession'));
  assert.equal(game.economy.credit.balance, before);
  assert.equal(game.simulation.crown.nextAt, nextAt);
  assert.equal(game.simulation.crown.audiences.nextAidAt, 0);
  assert.ok(claim(game, 'gold'));
  const event = grantEvents(game).find(event => event.operation === 'royal-relief')!;
  assert.equal(event.units / event.unitScale!, 7.5); assert.equal(event.destination, 'tribute:' + nextAt);
  assert.deepEqual(event.originBalance, { before: 5000, after: 4250 });
  assert.ok(game.simulation.payTribute(nextAt));
  assert.equal(game.economy.credit.balance, before + 20 - 42.5);
  const loaded = Session.restore(json(game)).session;
  assert.equal(loaded.simulation.crown.tributeTotal, 42.5);
  assert.deepEqual(loaded.economy.history.read(), JSON.parse(JSON.stringify(game.economy.history.read())));
});

test('intercession preserves missed streak, previous warnings and the next due date', () => {
  const crown = new Crown(); crown.advance(period, 'aldea'); crown.advance(2 * period, 'pueblo');
  crown.restoreState({ ...crown.saveState(), favor: 95 }, 2 * period);
  const history = crown.history, nextAt = crown.nextAt;
  assert.equal(crown.streak, 1);
  assert.ok(crown.requestPrivilege(crown.preparePrivilege('intercession'), 2 * period, () => true));
  assert.equal(crown.streak, 1); assert.equal(crown.nextAt, nextAt); assert.deepEqual(crown.history, history);
  crown.advance(nextAt, 'villa');
  assert.equal(crown.streak, 2); assert.equal(crown.obligation!.gold, 350); assert.equal(crown.obligation!.discount, undefined);
});

test('no pending tribute, a paid tribute and an expired due date cannot receive intercession', () => {
  const crown = new Crown(); crown.restoreState({ ...crown.saveState(), favor: 100 }, 0);
  assert.equal(crown.requestPrivilege(crown.preparePrivilege('intercession'), 0, () => true), false);
  crown.advance(period, 'aldea');
  assert.equal(crown.requestPrivilege(crown.preparePrivilege('intercession'), 2 * period, () => true), false);
  assert.ok(crown.pay(2 * period, period, () => true));
  assert.equal(crown.requestPrivilege(crown.preparePrivilege('intercession'), period, () => true), false);
});

test('a failed economic transaction and forged confirmation leave favor, counters and cooldown intact', () => {
  const crown = new Crown(); crown.restoreState({ ...crown.saveState(), favor: 100 }, 0);
  const before = crown.saveState(), quote = crown.preparePrivilege('gold');
  assert.equal(crown.requestPrivilege(quote, 0, () => false), false);
  for (const bad of [{ ...quote, favor: 99 }, { ...quote, sequence: 2 }, { ...quote, tributeDueAt: 5000 },
    { ...quote, kind: 'unknown' }]) assert.equal(crown.requestPrivilege(bad as RoyalRequest, 0, () => assert.fail('must not settle')), false);
  assert.deepEqual(crown.saveState(), before);
});

test('save slots migrate a genuine version 10 crown without granting retroactive aid; version 11 keeps cooldown', () => {
  const game = fixture(), state = json(game); delete state.crown.audiences;
  const items = new Map([[saveKey(1), JSON.stringify({ version: 10, savedAt: 1, state })]]);
  const backend = () => ({ getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } });
  const slots = new SaveSlots(backend, backend), loaded = slots.load(1).session;
  assert.deepEqual(loaded.economy.resources, game.economy.resources);
  assert.equal(loaded.simulation.crown.audiences.sequence, 0); assert.equal(loaded.simulation.crown.favor, 100);
  assert.ok(claim(loaded, 'wood')); slots.save(1, slots.inspect(1).raw, loaded, null);
  assert.equal(JSON.parse(items.get(saveKey(1))!).version, 11);
  const restored = slots.load(1).session;
  assert.deepEqual(restored.simulation.crown.audiences, loaded.simulation.crown.audiences);
  const before = json(restored); assert.equal(claim(restored, 'food'), false); assert.deepEqual(json(restored), before);
});

test('offerings and missions still change favor, and cannot create profitable gold arbitration', () => {
  const game = fixture(60, false), before = game.economy.credit.balance;
  assert.ok(game.simulation.makeOffering(200, 60)); assert.equal(game.simulation.crown.favor, 85);
  assert.ok(claim(game, 'gold')); assert.equal(game.simulation.crown.favor, 70);
  assert.equal(game.economy.credit.balance, before - 180);
  assert.ok(game.simulation.crown.applyMissionFavor(5, 0)); assert.equal(game.simulation.crown.favor, 75);
  const cheapestFavor = Math.min(...Object.entries(crownRules.offerings).map(([gold, points]) => Number(gold) / points));
  assert.ok(cheapestFavor * 15 > 20); assert.ok(cheapestFavor * 18 > 50);
  assert.ok(cheapestFavor * 8 > 20 * tradeRules.products.food.sell / 100);
  assert.ok(cheapestFavor * 8 > 15 * tradeRules.products.wood.sell / 100);
});

test('favor zero and both defeat rules still block every privilege', () => {
  const zero = fixture(100, false); favor(zero, 0);
  const deadline = zero.simulation.crown.confidence!.dueAt;
  for (const kind of Object.keys(royalPrivileges) as RoyalPrivilege[]) assert.equal(claim(zero, kind), false);
  zero.simulation.advance(deadline); assert.equal(zero.simulation.crown.defeatReason, 'Destitución por pérdida de confianza real');
  for (const kind of Object.keys(royalPrivileges) as RoyalPrivilege[]) assert.equal(claim(zero, kind), false);
  const missed = new Crown(); missed.restoreState({ ...missed.saveState(), favor: 100 }, 0);
  for (let cycle = 1; cycle <= 4; cycle++) missed.advance(cycle * period, 'aldea');
  assert.equal(missed.streak, 3); assert.ok(missed.defeated);
  for (const kind of Object.keys(royalPrivileges) as RoyalPrivilege[]) assert.equal(missed.requestPrivilege(missed.preparePrivilege(kind), 4 * period, () => assert.fail()), false);
});

test('impossible audience counters, duplicates, cooldowns and removed tribute discounts are rejected', () => {
  const game = fixture(100, false); game.simulation.advance(period); assert.ok(claim(game, 'intercession')); assert.ok(claim(game, 'gold'));
  const base = json(game);
  for (const corrupt of [
    state => state.crown.audiences.history.push(state.crown.audiences.history[0]),
    state => state.crown.audiences.used.gold++,
    state => state.crown.audiences.nextAidAt--,
    state => state.crown.audiences.lastAid.benefit++,
    state => state.crown.audiences.history[0].favorSpent--,
    state => state.crown.obligation.discount.reduction++,
    state => state.crown.obligation.gold++,
    state => { delete state.crown.obligation.discount; },
  ] as ((state: any) => void)[]) {
    const state = structuredClone(base); corrupt(state); assert.throws(() => Session.restore(state));
  }
  assert.match(royalPrivilegeMessage(game.simulation.crown.audiences.lastAid!), /20 oro recibidos/);
});

test.each([['gold', 79, 80], ['intercession', 89, 90]] as const)('%s requires its higher threshold', (kind, current, required) => {
  const game = fixture(current, false), before = json(game);
  assert.match(game.simulation.royalPrivilegeIssue(kind)!, new RegExp('Requiere ' + required));
  assert.equal(claim(game, kind), false); assert.deepEqual(json(game), before);
});

test('a capacity change after preparing the quote fails atomically and the same unspent request can be retried', () => {
  const game = fixture(), ledger = game.economy.storage.inventories, quote = request(game, 'food');
  assert.equal(game.simulation.royalPrivilegeIssue('food'), null);
  ledger.reserveIncoming(warehouse, 300 * U);
  const before = json(game); assert.equal(game.simulation.requestRoyalPrivilege(quote), false); assert.deepEqual(json(game), before);
  ledger.reserveIncoming(warehouse, 0);
  assert.ok(game.simulation.requestRoyalPrivilege(quote));
  assert.equal(game.economy.storage.inventories.snapshot(warehouse)!.goods.food, 20 * U);
  assert.equal(game.simulation.requestRoyalPrivilege(quote), false);
});

test('audience history remains bounded without losing cooldown, counts or tribute protection', () => {
  const crown = new Crown(); crown.restoreState({ ...crown.saveState(), favor: 100 }, 0);
  for (let cycle = 1; cycle <= 70; cycle++) {
    const time = cycle * period;
    crown.advance(time, 'villa');
    crown.restoreState({ ...crown.saveState(), favor: 100 }, time);
    assert.ok(crown.requestPrivilege(crown.preparePrivilege('intercession'), time, () => true));
    assert.ok(crown.requestPrivilege(crown.preparePrivilege('gold'), time, () => true));
    assert.ok(crown.pay(crown.nextAt, time, () => true));
  }
  const state = crown.saveState(), loaded = new Crown(); loaded.restoreState(JSON.parse(JSON.stringify(state)), 70 * period);
  assert.equal(loaded.audiences.sequence, 140); assert.equal(loaded.audiences.history.length, 60);
  assert.equal(loaded.audiences.used.gold, 70); assert.equal(loaded.audiences.used.intercession, 70);
  assert.equal(loaded.audiences.nextAidAt, 71 * period);
  assert.equal(loaded.requestPrivilege(loaded.preparePrivilege('gold'), 70 * period, () => assert.fail()), false);
});

test('a supply can be split between operative warehouses while charging favor once', () => {
  const base = fixture();
  base.map.place(c(12), 'warehouse');
  for (const x of [2, 4, 5, 7]) base.map.place(c(x), 'house');
  base.simulation.recalculate();
  const state = base.saveState(null);
  for (const home of state.population.residences) home.residents = 4;
  const game = Session.restore(state).session, ledger = game.economy.storage.inventories;
  assert.equal(game.economy.storage.operationalWarehouseIds().length, 2);
  const stock = ledger.saveState();
  for (const entry of stock) if (ledger.snapshot(entry.id)?.kind === 'warehouse') entry.goods = { food: 0, wood: 290 * U };
  ledger.restoreState(stock);
  assert.ok(claim(game, 'food')); assert.equal(game.simulation.crown.favor, 92);
  for (const id of game.economy.storage.operationalWarehouseIds()) {
    assert.equal(ledger.snapshot(id)!.used, 300 * U); assert.equal(ledger.snapshot(id)!.goods.food, 10 * U);
  }
  const events = grantEvents(game); assert.equal(events.length, 2);
  assert.equal(new Set(events.map(event => event.origin)).size, 1);
});
