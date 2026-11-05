import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Inventories, unitsPerResource as U } from '../src/economy/Inventories.ts';
import type { StoredResource } from '../src/economy/Inventories.ts';
import { Storage } from '../src/economy/Storage.ts';
import { Economy } from '../src/economy/Economy.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population, populationRules } from '../src/population/Population.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const cell = (column: number, row: number) => ({ column, row });
const first = cell(4, 1);
const second = cell(5, 1);
const farm = cell(2, 1);
const camp = cell(3, 1);
function setup() {
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  for (let x = 1; x <= 8; x++) map.place(cell(x, 0), 'road');
  map.place(farm, 'farm');
  map.place(camp, 'lumberjack');
  map.place(first, 'warehouse');
  const connections = new RoadConnections();
  const storage = new Storage({ food: 20 * U, wood: 0 });
  const population = new Population();
  let workers = 1;
  const workforce = {
    workersAt: () => workers,
    capacityFor: (type: Parameters<Population['capacityFor']>[0]) => population.capacityFor(type),
  };
  const sync = () => {
    connections.recalculate(map);
    storage.sync(map, connections, workforce);
  };
  sync();
  return { map, connections, storage, workforce, sync, setWorkers: (value: number) => { workers = value; } };
}

test('central transfer moves rather than copies stock and rejects invalid quantities, destinations and routes', () => {
  const ledger = new Inventories();
  ledger.create('source', { kind: 'production', capacity: 100, network: 'A', operational: true }, { food: 100, wood: 0 });
  ledger.create('destination', { kind: 'warehouse', capacity: 80, network: 'A', operational: true });
  const before = ledger.snapshot('source');
  for (const amount of [0, -1, 0.5, NaN, Infinity, 81, 101]) {
    assert.equal(ledger.transfer('source', 'destination', 'food', amount), false);
  }
  assert.equal(ledger.transfer('missing', 'destination', 'food', 1), false);
  assert.equal(ledger.transfer('source', 'source', 'food', 1), false);
  assert.equal(ledger.transfer('source', 'destination', 'gold' as StoredResource, 1), false);
  ledger.setAccess('destination', 'B', true);
  assert.equal(ledger.transfer('source', 'destination', 'food', 1), false);
  ledger.setAccess('destination', 'A', false);
  assert.equal(ledger.transfer('source', 'destination', 'food', 1), false);
  ledger.setAccess('destination', 'A', true);
  assert.deepEqual(ledger.snapshot('source'), before);
  assert.equal(ledger.transfer('source', 'destination', 'food', 30), true);
  assert.equal(ledger.snapshot('source')!.goods.food, 70);
  assert.equal(ledger.snapshot('destination')!.goods.food, 30);
  assert.equal(ledger.snapshot('source')!.goods.food + ledger.snapshot('destination')!.goods.food, 100);
  assert.equal(ledger.transfer('destination', 'source', 'food', 10), false);
  assert.throws(() => ledger.create('destination', { kind: 'warehouse', capacity: 80, network: 'A', operational: true }));
  assert.throws(() => ledger.discardTransient('destination'));
});

test('warehouse capacity is shared exactly between fractional food and wood quantities', () => {
  const { storage } = setup();
  assert.equal(storage.depositProduction(farm, 'food', 300 * U - 1), true);
  assert.equal(storage.depositProduction(camp, 'wood', 1), true);
  assert.equal(storage.warehouseAt(first)!.used, 300);
  assert.equal(storage.warehouseAt(first)!.free, 0);
  assert.equal(storage.depositProduction(camp, 'wood', 1), false);
  assert.equal(storage.warehouseAt(first)!.food, (300 * U - 1) / U);
  assert.equal(storage.warehouseAt(first)!.wood, 1 / U);
  assert.deepEqual(storage.totalsUnits, { food: 320 * U - 1, wood: 1 });
});

test('one batch can be split across operational warehouses without duplicating units', () => {
  const { map, storage, sync } = setup();
  map.place(second, 'warehouse');
  sync();
  storage.depositProduction(farm, 'food', 300 * U - 1);
  assert.equal(storage.depositProduction(camp, 'wood', 20), true);
  assert.equal(storage.warehouseAt(first)!.used, 300);
  assert.equal(storage.warehouseAt(first)!.wood, 1 / U);
  assert.equal(storage.warehouseAt(second)!.wood, 19 / U);
  assert.equal(storage.totalsUnits.wood, 20);
  assert.equal(storage.inventories.snapshot('production-batch'), undefined);
});

test('a batch that cannot fit is discarded whole and does not partially fill or reserve space', () => {
  const { storage } = setup();
  storage.depositProduction(farm, 'food', 300 * U - 10);
  const before = storage.totalsUnits;
  assert.equal(storage.depositProduction(camp, 'wood', 20), false);
  assert.deepEqual(storage.totalsUnits, before);
  assert.equal(storage.warehouseAt(first)!.free, 10 / U);
  assert.equal(storage.depositProduction(camp, 'wood', 10), true);
  assert.equal(storage.warehouseAt(first)!.used, 300);
});

test('workers, real producer type and center-connected road network are all required', () => {
  const { storage, map, sync, setWorkers } = setup();
  setWorkers(0);
  sync();
  assert.equal(storage.depositProduction(farm, 'food', U), false);
  assert.equal(storage.warehouseAt(first)!.operational, false);
  setWorkers(1);
  sync();
  assert.equal(storage.depositProduction(cell(1, 0), 'food', 30), false); // A road is not a producer.
  assert.equal(storage.depositProduction(farm, 'wood', 30), false);
  map.place(cell(10, 10), 'farm');
  map.place(cell(11, 10), 'road');
  map.place(cell(12, 10), 'warehouse');
  sync();
  assert.equal(storage.depositProduction(cell(10, 10), 'food', 30), false);
  assert.equal(storage.warehouseAt(cell(12, 10))!.operational, false);
  assert.equal(storage.depositProduction(farm, 'food', U), true);
  assert.equal(storage.warehouseAt(first)!.food, 1);
  assert.equal(storage.warehouseAt(cell(12, 10))!.food, 0);
});

test('reserve stays separate and exhausted reserve cannot consume warehouse food directly', () => {
  const { storage, map, sync } = setup();
  storage.depositProduction(farm, 'food', 3 * U);
  assert.equal(storage.initialFoodReserve, 20);
  assert.equal(storage.consumeFood(19 * U), true);
  assert.equal(storage.initialFoodReserve, 1);
  assert.equal(storage.warehouseAt(first)!.food, 3);
  assert.equal(storage.consumeFood(2 * U), false);
  assert.equal(storage.initialFoodReserve, 0);
  assert.equal(storage.warehouseAt(first)!.food, 3);
  assert.equal(storage.totalsUnits.food, 3 * U);
  map.place(second, 'warehouse');
  for (let i = 0; i < 10; i++) sync();
  assert.equal(storage.initialFoodReserve, 0);
  assert.equal(storage.warehouseAt(second)!.food, 0);
  assert.equal(storage.totalsUnits.food, 3 * U);
  assert.equal(storage.consumeFood(3 * U), false);
  assert.equal(storage.totalsUnits.food, 3 * U);
  assert.equal(storage.inventories.snapshot('food-consumption'), undefined);
});

test('warehouse food remains real but homes cannot withdraw it directly, even when operational', () => {
  const { storage, sync, setWorkers } = setup();
  storage.depositProduction(farm, 'food', 5 * U);
  storage.consumeFood(20 * U);
  setWorkers(0);
  sync();
  assert.equal(storage.totalsUnits.food, 5 * U);
  assert.equal(storage.availableFoodUnits, 0);
  assert.equal(storage.consumeFood(U), false);
  assert.equal(storage.totalsUnits.food, 5 * U);
  setWorkers(1);
  sync();
  assert.equal(storage.availableFoodUnits, 5 * U);
  assert.equal(storage.consumeFood(U), false);
  assert.equal(storage.totalsUnits.food, 5 * U);
});

test('disconnecting a stocked warehouse preserves goods and prevents new transfers and consumption', () => {
  const { storage, connections, workforce } = setup();
  storage.depositProduction(farm, 'food', U);
  storage.consumeFood(20 * U);
  const disconnected = new ConstructionMap(20, 20);
  disconnected.place(first, 'warehouse');
  disconnected.place(farm, 'farm');
  connections.recalculate(disconnected);
  storage.sync(disconnected, connections, workforce);
  assert.equal(storage.warehouseAt(first)!.food, 1);
  assert.equal(storage.warehouseAt(first)!.connected, false);
  assert.equal(storage.availableFoodUnits, 0);
  assert.equal(storage.depositProduction(farm, 'food', U), false);
  assert.equal(storage.consumeFood(U), false);
  assert.equal(storage.totalsUnits.food, U);
});

test('production blocking is visible and stops resource growth until operational storage is built', () => {
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  for (let x = 1; x <= 4; x++) map.place(cell(x, 0), 'road');
  map.place(farm, 'farm');
  const connections = new RoadConnections();
  connections.recalculate(map);
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  const population = new Population();
  const workforce = {
    workersAt: () => 1,
    capacityFor: (type: Parameters<Population['capacityFor']>[0]) => population.capacityFor(type),
  };
  economy.recalculate(map, connections, workforce);
  assert.equal(economy.blockedProducers, 1);
  assert.equal(economy.productivityAt(farm)!.workers, 1);
  assert.equal(economy.productivityAt(farm)!.ratio, 0);
  assert.equal(economy.perSecond.food, 0);
  economy.advance(10000);
  assert.equal(economy.resources.food, 20);
  map.place(first, 'warehouse');
  connections.recalculate(map);
  economy.recalculate(map, connections, workforce);
  assert.equal(economy.blockedProducers, 0);
  assert.equal(economy.resources.food, 20);
  assert.equal(economy.perSecond.food, 0.5);
  economy.advance(1000);
  assert.equal(economy.resources.food, 20.5);
  assert.equal(economy.storage.warehouseAt(first)!.food, 0.5);
});

test('global totals count warehouse food once and legacy consumption withdraws only the initial reserve', () => {
  const { map, connections, workforce } = setup();
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  economy.recalculate(map, connections, workforce);
  economy.advance(3000); // Farm: 1.5 food; camp: 2 wood.
  const inventory = economy.storage.warehouseAt(first)!;
  assert.equal(economy.resources.food, economy.storage.initialFoodReserve + inventory.food);
  assert.equal(economy.resources.wood, inventory.wood);
  assert.equal(economy.consumeFood(20.5), false);
  assert.equal(economy.storage.initialFoodReserve, 0);
  assert.equal(economy.storage.warehouseAt(first)!.food, 1.5);
  assert.equal(economy.resources.food, 1.5);
  assert.equal(economy.resources.wood, 2);
});

test('minimal workforce priority bootstraps storage and food even when a camp comes first in map order', () => {
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  map.place(cell(0, 1), 'road');
  for (let x = 0; x <= 8; x++) map.place(cell(x, 2), 'road');
  map.place(cell(2, 1), 'lumberjack');
  map.place(cell(3, 1), 'warehouse');
  map.place(cell(4, 3), 'farm');
  for (let x = 5; x <= 8; x++) map.place(cell(x, 3), 'house');
  const connections = new RoadConnections();
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  const population = new Population();
  const simulation = new SettlementSimulation(economy, population,
    populationRules.immigrationIntervalSeconds, map, connections);
  simulation.recalculate();
  simulation.advance(10000);
  assert.equal(population.total, 4);
  assert.equal(population.activePopulation, 2);
  assert.equal(population.workersAt(cell(3, 1)), 1);
  assert.equal(population.workersAt(cell(4, 3)), 1);
  assert.equal(population.workersAt(cell(2, 1)), 0);
  assert.equal(economy.perSecond.food, 0.5);
  simulation.advance(1000);
  assert.equal(economy.storage.warehouseAt(cell(3, 1))!.food, 0.5);
  assert.ok(economy.storage.initialFoodReserve < 20);
  assert.equal(population.employed + population.unemployed, population.activePopulation);
});

test('snapshots cannot mutate inventories or create resources', () => {
  const { storage } = setup();
  storage.depositProduction(farm, 'food', U);
  const snapshot = storage.inventories.snapshot('warehouse:4,1')!;
  (snapshot.goods as { food: number }).food = 9000;
  snapshot.operational = false;
  assert.equal(storage.warehouseAt(first)!.food, 1);
  assert.equal(storage.warehouseAt(first)!.operational, true);
});
test('inaccessible warehouse food is included globally but cannot enable immigration', () => {
  const { map, connections, workforce } = setup();
  map.place(cell(6, 1), 'house');
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  economy.recalculate(map, connections, workforce);
  economy.storage.depositProduction(farm, 'food', 5 * U);
  economy.consumeFood(20);
  const population = new Population();
  const simulation = new SettlementSimulation(economy, population,
    populationRules.immigrationIntervalSeconds, map, connections);
  simulation.recalculate();
  assert.equal(economy.resources.food, 5);
  assert.equal(economy.availableFood, 0);
  simulation.advance(5000);
  assert.equal(population.total, 0);
  assert.equal(economy.resources.food, 5);
  assert.equal(economy.availableFood, 0);
});
test.each([
  { limit: 'source stock', stock: 30, capacity: 60, quantity: 31 },
  { limit: 'destination space', stock: 60, capacity: 30, quantity: 31 },
])('transfer exceeding $limit leaves both inventories unchanged', ({ stock, capacity, quantity }) => {
  const ledger = new Inventories();
  ledger.create('origin', { kind: 'warehouse', capacity: 100, network: 'A', operational: true },
    { food: stock, wood: 0 });
  ledger.create('destination', { kind: 'warehouse', capacity, network: 'A', operational: true });
  const originBefore = ledger.snapshot('origin');
  const destinationBefore = ledger.snapshot('destination');

  assert.equal(ledger.transfer('origin', 'destination', 'food', quantity), false);
  assert.deepEqual(ledger.snapshot('origin'), originBefore);
  assert.deepEqual(ledger.snapshot('destination'), destinationBefore);
});

test('draining warehouses block production and warehouse deliveries until drainage is cancelled', () => {
  const { map, storage, sync } = setup();
  map.place(second, 'warehouse');
  sync();
  const from = 'warehouse:4,1', to = 'warehouse:5,1';
  assert.ok(storage.depositProduction(farm, 'food', 3));
  assert.equal(storage.setAcceptance(second, 'wood', false), true);
  assert.equal(storage.setDraining(second, true), true);
  assert.equal(storage.inventories.transfer(from, to, 'food', 1), false);
  assert.equal(storage.setAcceptance(first, 'food', false), true);
  assert.equal(storage.depositProduction(farm, 'food', 3), false);
  assert.equal(storage.setDraining(second, false), true);
  assert.equal(storage.warehouseAt(second)?.accepts.wood, false);
  assert.equal(storage.depositProduction(farm, 'food', 3), true);
  assert.equal(storage.inventories.transfer(from, to, 'food', 1), true);
});

test('drainage moves only accepted products within remaining capacity and conserves fractional stock', () => {
  const { map, storage, sync } = setup();
  assert.ok(storage.depositProduction(farm, 'food', 3));
  assert.ok(storage.depositProduction(camp, 'wood', 5));
  map.place(second, 'warehouse');
  sync();
  assert.equal(storage.setDraining(first, true), true);
  assert.equal(storage.setAcceptance(second, 'wood', false), true);
  assert.ok(storage.depositProduction(farm, 'food', 300 * U - 1));
  const before = storage.totalsUnits;
  storage.advanceDrain();
  assert.equal(storage.warehouseAt(first)?.food, 2 / U);
  assert.equal(storage.warehouseAt(first)?.wood, 5 / U);
  assert.equal(storage.warehouseAt(second)?.used, 300);
  assert.match(storage.warehouseAt(first)!.drainStatus, /llenos.*ningún destino/);
  assert.deepEqual(storage.totalsUnits, before);
});

test('warehouses draining simultaneously cannot swap stock or create transfer cycles', () => {
  const { map, storage, sync } = setup();
  assert.ok(storage.depositProduction(camp, 'wood', 5));
  map.place(second, 'warehouse');
  sync();
  assert.equal(storage.setDraining(first, true), true);
  assert.ok(storage.depositProduction(farm, 'food', 3));
  assert.equal(storage.setDraining(second, true), true);

  const firstBefore = storage.warehouseAt(first);
  const secondBefore = storage.warehouseAt(second);
  assert.match(firstBefore!.drainStatus, /falta otro almacén/);
  for (let i = 0; i < 10; i++) storage.advanceDrain();
  assert.deepEqual(storage.warehouseAt(first), firstBefore);
  assert.deepEqual(storage.warehouseAt(second), secondBefore);

  assert.equal(storage.setDraining(second, false), true);
  storage.advanceDrain();
  assert.equal(storage.warehouseAt(first)?.used, 0);
  assert.equal(storage.warehouseAt(second)?.food, 3 / U);
  assert.equal(storage.warehouseAt(second)?.wood, 5 / U);
});
