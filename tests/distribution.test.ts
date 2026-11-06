import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { distributionRules } from '../src/economy/Distribution.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { MarketCoverage } from '../src/map/MarketCoverage.ts';
import { Population, populationRules } from '../src/population/Population.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const cell = (column: number, row: number) => ({ column, row });
const farm = cell(1, 1), warehouse = cell(2, 1), market = cell(4, 1);
const near = cell(5, 1), boundary = cell(9, 1), outside = cell(10, 1);
const marketId = 'market:4,1', warehouseId = 'warehouse:2,1';
function setup(marketWorkers = 1) {
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  for (let x = 1; x <= 15; x++) map.place(cell(x, 0), 'road');
  map.place(farm, 'farm');
  map.place(warehouse, 'warehouse');
  map.place(market, 'market');
  for (const home of [near, boundary, outside]) map.place(home, 'house');
  const roads = new RoadConnections(), economy = new Economy({ gold: 0, food: 20, wood: 0 }), population = new Population();
  const counts = new Map([['4,1', marketWorkers]]);
  const workforce = {
    capacityFor: (type: Parameters<Population['capacityFor']>[0]) => population.capacityFor(type),
    workersAt: (position: { column: number; row: number }) => counts.get(position.column + ',' + position.row) ?? 1,
  };
  const sync = () => {
    roads.recalculate(map);
    economy.recalculate(map, roads, workforce);
  };
  sync();
  const food = (amount: number) => assert.equal(economy.storage.depositProduction(farm, 'food', Math.round(amount * U)), true);
  const restock = () => {
    for (let i = 0; i < distributionRules.restockIntervalSeconds; i++) economy.distribution.advanceSecond();
  };
  const consume = (homes: { cell: { column: number; row: number }; residents: number }[]) =>
    economy.consumeHomes({ residencesSnapshot: homes }, populationRules.foodPerResidentPerSecond);
  return { map, roads, economy, population, workforce, counts, sync, food, restock, consume };
}

test('restocking occurs at the configured interval, preserves totals and respects 100-unit capacity', () => {
  const { economy, food, sync } = setup();
  food(150);
  const before = economy.resources.food;
  for (let i = 0; i < distributionRules.restockIntervalSeconds - 1; i++) {
    economy.distribution.advanceSecond();
    sync(); // UI/model rebuilds cannot trigger an extra replenishment.
    assert.equal(economy.distribution.marketAt(market)!.food, 0);
  }
  economy.distribution.advanceSecond();
  assert.equal(economy.distribution.marketAt(market)!.food, 100);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 50);
  assert.equal(economy.resources.food, before);
  assert.equal(economy.resources.gold, 0);
  for (let i = 0; i < 10; i++) economy.distribution.advanceSecond();
  assert.equal(economy.distribution.marketAt(market)!.food, 100);
  assert.equal(economy.resources.food, before);
});

test('unemployed and disconnected markets neither restock nor serve, while preserving their goods', () => {
  const { map, roads, economy, workforce, counts, food, restock, sync, consume } = setup(0);
  food(10);
  restock();
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  counts.set('4,1', 1);
  sync();
  restock();
  assert.equal(economy.distribution.marketAt(market)!.food, 10);
  counts.set('4,1', 0);
  sync();
  const before = economy.resources;
  consume([{ cell: near, residents: 4 }]);
  restock();
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.distribution.marketAt(market)!.food, 10);
  const disconnected = new ConstructionMap(20, 20);
  disconnected.place(market, 'market');
  roads.recalculate(disconnected);
  economy.recalculate(disconnected, roads, workforce);
  assert.equal(economy.distribution.marketAt(market)!.connected, false);
  assert.equal(economy.distribution.marketAt(market)!.food, 10);
  assert.equal(economy.availableFood, 0);
  assert.equal(economy.resources.food, 30); // Preserved market goods plus closed initial reserve.
});

test('only operational warehouses can supply markets on the same network', () => {
  const { map, economy, counts, sync, food, restock } = setup();
  food(10);
  counts.set('2,1', 0);
  sync();
  restock();
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  counts.set('2,1', 1);
  map.place(cell(17, 10), 'market');
  map.place(cell(18, 10), 'road');
  sync();
  restock();
  assert.equal(economy.distribution.marketAt(market)!.food, 10);
  assert.equal(economy.distribution.marketAt(cell(17, 10))!.food, 0);
  assert.equal(economy.distribution.marketAt(cell(17, 10))!.operational, false);
});

test('coverage includes six road tiles, excludes seven, and never uses straight-line distance', () => {
  const { economy } = setup();
  assert.equal(economy.distribution.coverage.distance(market, boundary), 6);
  assert.equal(economy.distribution.coverage.distance(market, outside), undefined);
  assert.equal(economy.distribution.marketAt(market)!.coveredHomes, 2);
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  for (const [x, y] of [[1, 2], [1, 1], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]]) map.place(cell(x!, y!), 'road');
  map.place(cell(1, 3), 'market');
  map.place(cell(3, 3), 'house');
  const roads = new RoadConnections(), coverage = new MarketCoverage();
  roads.recalculate(map);
  assert.equal(roads.isConnected(cell(3, 3)), true);
  coverage.recalculate(map, roads, 6);
  assert.equal(coverage.distance(cell(1, 3), cell(3, 3)), undefined);
  map.place(cell(2, 2), 'road');
  roads.recalculate(map);
  coverage.recalculate(map, roads, 6);
  assert.equal(coverage.distance(cell(1, 3), cell(3, 3)), 3);
});

test('diagonals, buildings and the village center do not create road shortcuts', () => {
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  map.place(cell(1, 0), 'road');
  map.place(cell(2, 0), 'market');
  map.place(cell(0, 1), 'road');
  map.place(cell(0, 2), 'house');
  map.place(cell(2, 1), 'house');
  const roads = new RoadConnections(), coverage = new MarketCoverage();
  roads.recalculate(map);
  coverage.recalculate(map, roads, 6);
  assert.equal(roads.isConnected(cell(0, 2)), true);
  assert.equal(coverage.distance(cell(2, 0), cell(0, 2)), undefined);
  assert.equal(coverage.distance(cell(2, 0), cell(2, 1)), undefined);
});

test('household consumption uses the nearest stocked market and can finish at the next nearest', () => {
  const { map, economy, sync, food, consume } = setup();
  const further = cell(8, 1);
  map.place(further, 'market');
  sync();
  food(10.1);
  const ledger = economy.storage.inventories;
  assert.equal(ledger.transfer(warehouseId, marketId, 'food', U / 10), true);
  assert.equal(ledger.transfer(warehouseId, 'market:8,1', 'food', 10 * U), true);
  assert.deepEqual(economy.distribution.supplyAt(near), { status: 'market', market, distance: 2 });
  consume([{ cell: near, residents: 4 }]);
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  assert.equal(economy.distribution.marketAt(further)!.food, 9.7);
  assert.equal(economy.resources.gold, 0.04);
  assert.equal(economy.perSecond.gold, 0.04);
  assert.deepEqual(economy.distribution.supplyAt(near), { status: 'market', market: further, distance: 4 });
});

test('food outside coverage cannot feed residents even with a stocked warehouse or leftover reserve', () => {
  const { economy, food, restock, consume } = setup();
  food(20);
  restock();
  const before = economy.resources;
  consume([{ cell: outside, residents: 4 }]);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.perSecond.gold, 0);
  assert.equal(economy.distribution.supplyAt(outside).status, 'unserved');
  assert.equal(economy.storage.initialFoodReserve, 20);
  assert.equal(economy.consumeFood(0.1), false);
});

test('sales pay exactly for delivered food, including partial demand, with no passive gold', () => {
  const { economy, food, restock, consume } = setup();
  economy.advance(1000);
  assert.equal(economy.resources.gold, 0); // A staffed market alone earns nothing.
  food(0.1);
  restock(); // Includes 0.5 food produced by the farm during the previous update.
  const marketFood = economy.distribution.marketAt(market)!.food;
  const before = economy.resources.food;
  consume([{ cell: near, residents: 4 }, { cell: boundary, residents: 4 }]);
  assert.equal(economy.resources.gold, marketFood / 10);
  assert.equal(economy.resources.food, before - marketFood);
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  assert.equal(economy.storage.initialFoodReserve, 20);
  consume([{ cell: near, residents: 4 }]);
  assert.equal(economy.perSecond.gold, 0);
  assert.equal(economy.resources.gold, marketFood / 10);
});

test('the bootstrap reserve feeds first inhabitants until an authorized market has real stock', () => {
  const { economy, counts, sync, consume, food, restock } = setup(0);
  consume([{ cell: near, residents: 2 }]);
  assert.equal(economy.storage.initialFoodReserve, 19.8);
  assert.equal(economy.resources.gold, 0);
  counts.set('4,1', 1);
  sync();
  assert.equal(economy.distribution.bootstrapActive, true);
  consume([{ cell: near, residents: 2 }]);
  assert.equal(economy.storage.initialFoodReserve, 19.6);
  food(1);
  restock();
  assert.equal(economy.distribution.bootstrapActive, false);
  for (let i = 0; i < 5; i++) consume([{ cell: near, residents: 2 }]);
  assert.equal(economy.resources.gold, 0.1);
  assert.equal(economy.storage.initialFoodReserve, 19.6);
  counts.set('4,1', 0);
  for (let i = 0; i < 5; i++) sync();
  const before = economy.resources;
  consume([{ cell: near, residents: 2 }]);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.distribution.bootstrapActive, false);
  assert.equal(economy.storage.consumeFood(3), false);
  assert.equal(economy.storage.initialFoodReserve, 19.6);
  assert.equal(economy.availableFood, 0);
});

test('reserve exhaustion prevents consumption and immigration if no operating market exists', () => {
  const { economy, consume } = setup(0);
  economy.consumeFood(19.9);
  consume([{ cell: near, residents: 2 }]);
  assert.equal(economy.storage.initialFoodReserve, 0);
  assert.equal(economy.resources.gold, 0);
  const supply = economy.distribution.immigrationPlan([{ cell: near, residents: 2 }], 2, 5, 0.1, 4);
  assert.equal(supply.size, 0);
});

test('immigration forecasting never promises one market unit twice and does not move inventory', () => {
  const { economy, food, restock } = setup();
  food(3.5);
  restock();
  const homes = [{ cell: near, residents: 3 }, { cell: boundary, residents: 3 }];
  const before = economy.resources;
  const supply = economy.distribution.immigrationPlan(homes, 2, 5, 0.1, 4);
  assert.equal(supply.get('5,1'), 1); // Existing demand 3 + newcomer reserve 0.5.
  assert.equal(supply.get('9,1'), undefined);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.resources.gold, 0);
});

test('immigration fills only supplied plots, leaving uncovered plots empty despite globally stored food', () => {
  const { map, roads, economy, population, food, restock } = setup();
  population.recalculate(map, roads);
  food(20);
  restock();
  for (let i = 0; i < 10; i++) {
    const supply = economy.immigrationSupply(population, 2, 5, 0.1, 4);
    population.immigrate(economy.availableFood, supply);
  }
  assert.equal(population.residentsAt(near), 4);
  assert.equal(population.residentsAt(boundary), 4);
  assert.equal(population.residentsAt(outside), 0);
  assert.equal(population.total, 8);
});

test('an unfed house does not prevent immigration into another house with adequate local supply', () => {
  const { map, roads, economy, population } = setup();
  population.recalculate(map, roads);
  for (let i = 0; i < 3; i++) population.immigrate(100);
  assert.equal(population.residentsAt(outside), 2);
  const simulation = new SettlementSimulation(economy, population, 5, map, roads);
  simulation.recalculate();
  economy.storage.depositProduction(farm, 'food', 10 * U);
  simulation.advance(5000);
  assert.equal(population.residentsAt(outside), 2);
  assert.equal(population.residentsAt(near), 4);
  assert.equal(population.total, 8);
  assert.equal(economy.resources.gold, 0.04);
});

test('central transfers reject unavailable wood, direct warehouse consumption and market production deposits', () => {
  const { economy, food } = setup();
  food(1);
  const ledger = economy.storage.inventories;
  ledger.create('test-consumer', { kind: 'consumer', capacity: U, network: null, operational: true });
  assert.equal(ledger.transfer(warehouseId, 'test-consumer', 'food', 1), false);
  assert.equal(economy.storage.consumeInventoryFood(warehouseId, 1), 0);
  assert.equal(economy.storage.depositProduction(market, 'food', 1), false);
  assert.equal(ledger.transfer(warehouseId, marketId, 'wood', 1), false);
  assert.equal(economy.resources.gold, 0);
  ledger.discardTransient('test-consumer');
});

test('supply chain starts and remains deterministic using only the existing workforce and initial reserve', () => {
  function village() {
    const map = new ConstructionMap(20, 20);
    map.place(cell(0, 0), 'villageCenter');
    for (let x = 1; x <= 8; x++) map.place(cell(x, 0), 'road');
    map.place(cell(1, 1), 'warehouse'); // Earlier than farm: food priority must still sustain growth.
    map.place(cell(2, 1), 'farm');
    map.place(cell(3, 1), 'market');
    for (let x = 4; x <= 8; x++) map.place(cell(x, 1), 'house');
    const economy = new Economy({ gold: 0, food: 20, wood: 0 }), population = new Population(), roads = new RoadConnections();
    const simulation = new SettlementSimulation(economy, population,
      populationRules.immigrationIntervalSeconds, map, roads);
    simulation.recalculate();
    return { map, economy, population, roads, simulation };
  }
  const batch = village(), frames = village();
  batch.simulation.advance(120000);
  for (let i = 0; i < 1200; i++) frames.simulation.advance(100);
  assert.deepEqual(batch.economy.resources, frames.economy.resources);
  assert.equal(batch.population.total, frames.population.total);
  assert.ok(batch.population.total > 6);
  assert.ok(batch.economy.resources.gold > 0);
  assert.equal(batch.economy.distribution.bootstrapActive, false);
  assert.ok(batch.economy.distribution.marketAt(cell(3, 1))!.food > 0);
  const before = batch.economy.resources;
  batch.simulation.recalculate();
  assert.deepEqual(batch.economy.resources, before);
  assert.equal(batch.population.employed + batch.population.unemployed, batch.population.activePopulation);
});
test('multiple markets share finite warehouse stock only on scheduled replenishment', () => {
  const { map, economy, sync, food, restock, consume } = setup();
  const second = cell(8, 1);
  map.place(second, 'market');
  sync();
  food(150);
  restock();
  assert.equal(economy.distribution.marketAt(market)!.food, 100);
  assert.equal(economy.distribution.marketAt(second)!.food, 50);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 0);
  const before = economy.resources.food;
  consume([{ cell: near, residents: 4 }]);
  food(1);
  economy.distribution.advanceSecond();
  assert.equal(economy.distribution.marketAt(market)!.food, 99.6);
  assert.equal(economy.distribution.marketAt(second)!.food, 50);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 1);
  for (let i = 1; i < distributionRules.restockIntervalSeconds; i++) economy.distribution.advanceSecond();
  assert.equal(economy.distribution.marketAt(market)!.food, 100);
  assert.equal(economy.distribution.marketAt(second)!.food, 50.6);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 0);
  assert.equal(economy.resources.food, before + 0.6);
  assert.equal(economy.resources.gold, 0.04);
});

test('fractional sales conserve food and treasury exactly over a thousand withdrawals', () => {
  const { economy, food, restock, consume } = setup();
  food(100);
  restock();
  for (let i = 0; i < 1000; i++) consume([{ cell: near, residents: 1 }]);
  assert.equal(economy.resources.gold, 10);
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 0);
  assert.equal(economy.resources.food, 20); // Closed, unused bootstrap stock remains real.
  assert.equal(economy.perSecond.gold, 0.01);
  consume([{ cell: near, residents: 1 }]);
  assert.equal(economy.perSecond.gold, 0);
  assert.equal(economy.resources.gold, 10);
});
test('simulation moves farm food through the warehouse and market before households buy it', () => {
  const map = new ConstructionMap(20, 20);
  const farm = cell(1, 1), warehouse = cell(2, 1), market = cell(3, 1);
  map.place(cell(0, 0), 'villageCenter');
  for (let x = 1; x <= 5; x++) map.place(cell(x, 0), 'road');
  map.place(farm, 'farm');
  map.place(warehouse, 'warehouse');
  map.place(market, 'market');
  map.place(cell(4, 1), 'house');
  map.place(cell(5, 1), 'house');

  const roads = new RoadConnections(), population = new Population(), economy = new Economy({ gold: 0, food: 20, wood: 0 });
  const simulation = new SettlementSimulation(economy, population,
    populationRules.immigrationIntervalSeconds, map, roads);
  simulation.recalculate();
  for (let i = 0; i < 3; i++) population.immigrate(economy.availableFood);
  simulation.recalculate();
  assert.equal(population.total, 6);
  assert.equal(population.workersAt(farm), 1);
  assert.equal(population.workersAt(warehouse), 1);
  assert.equal(population.workersAt(market), 1);

  simulation.advance(4999);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 2);
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  assert.equal(economy.storage.initialFoodReserve, 17.6);
  assert.equal(economy.resources.gold, 0);

  simulation.advance(1);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 0);
  assert.equal(economy.distribution.marketAt(market)!.food, 1.9);
  assert.equal(economy.storage.initialFoodReserve, 17.6);
  assert.equal(economy.resources.food, 19.5);
  assert.equal(economy.resources.gold, 0.06);
});
