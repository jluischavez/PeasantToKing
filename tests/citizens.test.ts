import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Session } from '../src/persistence/Session.ts';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots.ts';
const c = (column: number, row = 2) => ({ column, row });
const home = c(9), market = c(6), warehouse = c(3), well = c(10);
function buyer() {
  const map = new ConstructionMap(100, 100), roads = new RoadConnections(), economy = new Economy({ gold: 0, food: 0, wood: 0 }, 10000);
  map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x < 15; x++) map.place(c(x, 1), 'road');
  for (const [cell, type] of [[home, 'house'], [market, 'market'], [warehouse, 'warehouse'], [c(1), 'farm'], [c(2), 'lumberjack']] as const) map.place(cell, type);
  map.terrain.plantTree(c(2, 4));
  const sync = () => { roads.recalculate(map); economy.recalculate(map, roads, { capacityFor: () => 4,
    workersAt: cell => map.getConstruction(cell) === 'market' || map.getConstruction(cell) === 'warehouse' ? 1 : 0 }); };
  economy.distribution.enableHouseholds(); sync();
  economy.storage.depositProduction(c(1), 'food', 20 * U);
  economy.storage.depositProduction(c(2), 'wood', 10 * U);
  const ledger = economy.storage.inventories;
  assert.ok(ledger.transfer('warehouse:3,2', 'market:6,2', 'food', 20 * U));
  assert.ok(ledger.transfer('warehouse:3,2', 'market:6,2', 'wood', 10 * U));
  const consume = () => economy.consumeHomes({ residencesSnapshot: [{ cell: home, residents: 4 }] }, 0.1);
  const step = (ticks: number) => { for (let i = 0; i < ticks; i++) { economy.advance(1000); consume(); } };
  return { map, roads, economy, ledger, sync, consume, step, logistics: economy.storage.logistics };
}
test('an inhabited household walks out empty, picks up actual stock and returns before it can consume it', () => {
  const f = buyer(); f.consume();
  assert.equal(f.logistics.operations.length, 2);
  assert.ok(f.logistics.operations.every(op => op.kind === 'household-purchase' && op.state === 'WalkingToSource'));
  assert.equal(f.ledger.snapshot('market:6,2')!.goods.food, 20 * U);
  assert.equal(f.ledger.snapshot('home-stock:9,2')!.used, 0);
  assert.equal(f.economy.resources.gold, 0);
  f.step(3);
  assert.ok(f.economy.resources.gold > 0);
  assert.equal(f.ledger.snapshot('home-stock:9,2')!.used, 0);
  assert.equal(f.economy.resources.food, 20);
  assert.ok(f.logistics.operations.every(op => op.pickupMs !== null && op.state === 'Carrying'));
  f.step(3);
  assert.ok(f.ledger.snapshot('home-stock:9,2')!.goods.food > 0);
  assert.ok(f.economy.resources.food < 20);
  const sales = f.economy.history.read('gold').filter(event => event.operation === 'sale');
  assert.equal(sales.length, 2);
  f.consume(); f.consume();
  assert.equal(f.economy.history.read('gold').filter(event => event.operation === 'sale').length, 2);
});
test('reservations prevent other households buying nonexistent products; empty or disabled markets create no shopping trips', () => {
  const f = buyer(); f.economy.setMarketSale(market, 'food', false); f.economy.setMarketSale(market, 'wood', false); f.consume();
  assert.equal(f.logistics.operations.length, 0);
  f.economy.setMarketSale(market, 'food', true); f.consume();
  const quantity = f.ledger.outgoing('market:6,2', 'food');
  for (let i = 0; i < 50; i++) f.consume();
  assert.equal(f.ledger.outgoing('market:6,2', 'food'), quantity);
  assert.equal(f.logistics.operations.length, 1);
  assert.equal(f.economy.resources.food, 20);
});
test('cuts block buyers without losing reserved or carried goods, and reconnection resumes their real return', () => {
  const f = buyer(); f.consume(); f.step(3);
  const before = f.economy.resources;
  f.map.remove(c(8, 1)); f.sync();
  assert.ok(f.logistics.operations.every(op => op.state === 'Blocked'));
  assert.deepEqual(f.economy.resources, before);
  f.economy.advance(5000);
  assert.equal(f.ledger.snapshot('home-stock:9,2')!.used, 0);
  f.map.place(c(8, 1), 'road'); f.sync(); f.step(8);
  assert.ok(f.ledger.snapshot('home-stock:9,2')!.used > 0);
});
function village(residents = 8) {
  const game = new Session(); game.map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x < 15; x++) game.map.place(c(x, 1), 'road');
  for (const [cell, type] of [[home, 'house'], [c(8), 'house'], [c(7), 'house'], [market, 'market'], [warehouse, 'warehouse'], [c(1), 'farm'], [well, 'well']] as const) game.map.place(cell, type);
  game.simulation.recalculate();
  const state = game.saveState(null);
  for (const h of state.population.residences) { h.residents = Math.min(residents, 4); residents -= h.residents; }
  return Session.restore(state).session;
}
const json = (game: Session) => JSON.parse(JSON.stringify(game.saveState(null)));
test.each([1, 2, 3] as const)('buyers and journeys preserve exact simulated time, pause and reload at ×%s', speed => {
  const game = village(), normal = village(); game.simulation.setSpeed(speed);
  for (let i = 0; i < 80; i++) { game.simulation.advance(100); normal.simulation.advance(100 * speed); }
  assert.deepEqual(game.economy.saveState(), normal.economy.saveState());
  const restored = Session.restore(json(game)).session;
  assert.deepEqual(json(restored), json(game));
  game.simulation.setPaused(true); const state = json(game); game.simulation.advance(90000); assert.deepEqual(json(game), state);
});
test('legacy settlements schedule a real admitted family from a valid center road, without overbooking', () => {
  const game = village(0); game.simulation.advance(5000);
  assert.ok(game.population.total > 0);
  const incoming = game.economy.storage.logistics.journeys.filter(j => j.kind === 'immigration');
  assert.ok(incoming.length > 0);
  assert.equal(incoming.reduce((n, j) => n + j.units, 0), game.population.total);
  for (const j of incoming) {
    assert.ok(['road', 'bridge'].includes(game.map.getConstruction(j.route[0])!));
    assert.ok(j.units <= game.population.residentsAt(j.destination));
    const before = incoming.length; game.economy.storage.logistics.queueArrival(j.destination, j.units);
    assert.equal(game.economy.storage.logistics.journeys.filter(j => j.kind === 'immigration').length, before);
  }
});
test('a procedural immigration event starts at the real kingdom entry and survives reload without adding residents twice', () => {
  const game = Session.start(23), center = game.map.villageCenter!;
  const road = [...game.map.borderRoads(center)][0];
  const options = [c(road.column, road.row + 1), c(road.column + 1, road.row), c(road.column, road.row - 1), c(road.column - 1, road.row)];
  const position = options.find(cell => game.map.canPlace(cell, 'house'))!;
  assert.ok(position); game.map.place(position, 'house'); game.simulation.recalculate();
  game.simulation.advance(5000);
  const journey = game.economy.storage.logistics.journeys.find(j => j.kind === 'immigration')!;
  assert.ok(journey);
  assert.deepEqual(journey.source, game.map.kingdomRoad!.entry.cell);
  const restored = Session.restore(json(game)).session;
  assert.deepEqual(json(restored), json(game));
});
test('removing an arrival home cancels its activity and actual residents through normal demolition, without ghosts', () => {
  const game = village(0); game.simulation.advance(5000);
  const journey = game.economy.storage.logistics.journeys.find(j => j.kind === 'immigration')!;
  assert.ok(journey); const cell = journey.destination;
  assert.equal(game.simulation.requestDemolition(cell), null); assert.equal(game.simulation.confirmDemolition(), null);
  assert.equal(game.population.residentsAt(cell), 0);
  assert.ok(!game.economy.storage.logistics.journeys.some(j => j.destination.column === cell.column && j.destination.row === cell.row));
  assert.ok(game.economy.storage.logistics.journeyHistory.some(j => j.id === journey.id && j.result === 'cancelled'));
});
test('water visits use real assignments and capacity once per window, and inactive wells leave no visible activity', () => {
  const game = village(12); game.simulation.advance(1000);
  const logistics = game.economy.storage.logistics;
  const water = logistics.journeys.filter(j => j.kind === 'water-service');
  assert.ok(water.length > 0);
  assert.equal(water.length, 1); // The existing single well employee is not cloned per household.
  assert.ok(water.reduce((n, j) => n + j.units, 0) <= 30);
  const count = water.length;
  for (const a of game.simulation.water.assignments) logistics.queueWater(a.well, a.home, a.residents);
  assert.equal(logistics.journeys.filter(j => j.kind === 'water-service').length, count);
  for (const j of water) assert.ok(game.simulation.water.assignments.some(a => a.home.column === j.destination.column && a.home.row === j.destination.row && a.residents >= j.units));
  assert.equal(game.simulation.requestDemolition(well), null); assert.equal(game.simulation.confirmDemolition(), null);
  assert.equal(logistics.journeys.filter(j => j.kind === 'water-service').length, 0);
  assert.equal(game.simulation.water.suppliedAt(home), 0);
});
test('old version 9 inventories migrate without granting domestic goods or duplicating operations', () => {
  const game = village(); const state = json(game);
  const raw = JSON.stringify({ version: 9, savedAt: 1, state });
  const slots = new SaveSlots(() => ({ getItem: key => key === saveKey(1) ? raw : null, setItem: () => {} }));
  const restored = slots.load(1).session;
  assert.deepEqual(restored.economy.resources, game.economy.resources);
  assert.deepEqual(json(restored), state);
});
test('400 inhabitants on 100×100 aggregate shopping and conserve all integer goods beyond the sprite cap', () => {
  const map = new ConstructionMap(100, 100), roads = new RoadConnections(), economy = new Economy({ gold: 0, food: 0, wood: 0 }, 100000);
  const homes: { cell: { column: number; row: number }; residents: number }[] = [];
  map.place(c(0, 0), 'villageCenter');
  for (let y = 1; y <= 40; y++) map.place(c(0, y), 'road');
  for (let block = 0; block < 10; block++) {
    const row = 1 + block * 4;
    for (let x = 1; x < 16; x++) map.place(c(x, row), 'road');
    map.place(c(6, row + 1), 'market'); map.place(c(14, row + 1), 'warehouse');
    for (const x of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
      const cell = c(x, row + 1); map.place(cell, 'house'); homes.push({ cell, residents: 4 });
    }
  }
  roads.recalculate(map); economy.distribution.enableHouseholds();
  economy.recalculate(map, roads, { workersAt: () => 1, capacityFor: () => 4 });
  const ledger = economy.storage.inventories;
  ledger.create('stress-production', { kind: 'production', capacity: 1000 * U, network: '0,0', operational: true }, { food: 1000 * U, wood: 0 });
  for (let block = 0; block < 10; block++) {
    const row = 2 + block * 4, warehouse = `warehouse:14,${row}`, market = `market:6,${row}`;
    assert.ok(ledger.transfer('stress-production', warehouse, 'food', 100 * U));
    assert.ok(ledger.transfer(warehouse, market, 'food', 100 * U));
  }
  ledger.discardTransient('stress-production');
  let peak = 0;
  for (let tick = 0; tick < 25; tick++) {
    economy.advance(1000); economy.consumeHomes({ residencesSnapshot: homes }, 0.1);
    peak = Math.max(peak, economy.storage.logistics.operations.length);
    const consumed = economy.history.read('food').filter(event => event.operation === 'consumption').reduce((n, event) => n + event.units, 0);
    assert.equal(Math.round(economy.resources.food * U), 1000 * U - consumed);
    assert.ok(ledger.saveState().every(entry => entry.goods.food >= 0));
  }
  assert.ok(peak >= 100);
  assert.ok(economy.resources.gold > 0);
  assert.ok(economy.storage.logistics.operations.filter(op => op.kind === 'household-purchase').length <= homes.length * 2);
});
test('blocked arrivals remain auditable across reload and resume without creating a second resident', () => {
  const game = village(0); game.simulation.advance(5000);
  const arrival = game.economy.storage.logistics.journeys.find(j => j.kind === 'immigration')!;
  assert.ok(arrival); const residents = game.population.total;
  game.map.remove(c(5, 1)); game.simulation.recalculate();
  assert.equal(arrival.state, 'Blocked');
  const restored = Session.restore(json(game)).session;
  assert.equal(restored.population.total, residents);
  assert.equal(restored.economy.storage.logistics.journeys.find(j => j.id === arrival.id)!.state, 'Blocked');
  restored.map.place(c(5, 1), 'road'); restored.simulation.recalculate(); restored.simulation.advance(9000);
  assert.equal(restored.economy.storage.logistics.journeyHistory.filter(j => j.id === arrival.id && j.result === 'completed').length, 1);
  for (const h of restored.population.residencesSnapshot) assert.ok(h.residents <= (h.capacity ?? 4));
});
test('suspending the tab and narrative pauses freeze all activities and discard suspended wall time', () => {
  const game = village(); game.simulation.advance(1500); const state = json(game);
  game.simulation.setSuspended(true); game.simulation.advance(120000); assert.deepEqual(json(game), state);
  game.simulation.setSuspended(false); game.simulation.advance(120000); assert.deepEqual(json(game), state);
  game.simulation.setReadingChapter(true); game.simulation.advance(120000); assert.deepEqual(json(game), state);
  game.simulation.setReadingChapter(false);
});
test('corrupted household cargo, activity counts and water windows are rejected before replacing a session', () => {
  const game = village(); game.simulation.advance(5000); const state = json(game);
  const cargo = structuredClone(state);
  const inventory = cargo.economy.inventories.find(entry => entry.id.startsWith('home-stock:'))!;
  assert.ok(inventory); inventory.goods.food = -1; assert.throws(() => Session.restore(cargo));
  const activity = structuredClone(state); assert.ok(activity.economy.logistics.journeys?.length);
  activity.economy.logistics.journeys![0].units = 999; assert.throws(() => Session.restore(activity));
  const window = structuredClone(state); assert.ok(window.economy.logistics.waterWindows?.length);
  window.economy.logistics.waterWindows![0][1] = 999999; assert.throws(() => Session.restore(window));
});
