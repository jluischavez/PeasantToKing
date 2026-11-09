import { deliverFixtureCargo } from './fixtures/logistics.ts';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import type { Resources } from '../src/economy/Economy';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population, populationRules } from '../src/population/Population.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const cell = (column: number, row: number) => ({ column, row });
const center = cell(0, 0), road = cell(1, 0), warehouse = cell(2, 1);
const lumberjack = cell(3, 1), farm = cell(1, 1), market = cell(4, 1);
const home = cell(5, 1), emptyPlot = cell(8, 1);
const warehouseId = 'warehouse:2,1', marketId = 'market:4,1';

function setup(initial?: Resources) {
  const map = new ConstructionMap(20, 20);
  const economy = new Economy(initial);
  const roads = new RoadConnections();
  const population = new Population();
  const simulation = new SettlementSimulation(economy, population, populationRules.immigrationIntervalSeconds, map, roads);
  return { map, economy, roads, population, simulation };
}

function staffed(initial?: Resources) {
  const state = setup(initial);
  const { map, population, simulation } = state;
  map.place(center, 'villageCenter');
  for (let x = 1; x <= 5; x++) map.place(cell(x, 0), 'road');
  map.place(farm, 'farm');
  map.place(warehouse, 'warehouse');
  map.place(lumberjack, 'lumberjack');
  assert.ok(map.terrain.plantTree(cell(3, 5)));
  map.place(market, 'market');
  map.place(home, 'house');
  map.place(cell(4, 2), 'house'); // Disconnected until a road is placed next to it.
  map.place(cell(5, 2), 'road');
  map.place(cell(6, 0), 'road');
  map.place(cell(6, 1), 'house');
  map.place(emptyPlot, 'house');
  simulation.recalculate();
  for (let i = 0; i < 3; i++) population.immigrate(20);
  simulation.recalculate();
  assert.equal(population.total, 6);
  assert.ok(state.economy.storage.warehouseAt(warehouse)?.operational);
  return state;
}

test('new settlements build with the new reserves and record exact gold and wood debits', () => {
  const { economy, map, simulation } = setup();
  assert.deepEqual(economy.resources, { gold: 150, food: 20, wood: 50 });
  assert.equal(economy.storage.constructionWoodReserve, 50);
  assert.equal(economy.storage.inventories.snapshot('initial-reserve')?.goods.wood, 0);
  assert.equal(simulation.build(center, 'villageCenter'), null);
  assert.deepEqual(economy.history.read(), []);
  assert.equal(simulation.build(road, 'road'), null);
  assert.equal(simulation.build(farm, 'farm'), null);
  assert.equal(map.getConstruction(farm), 'farm');
  assert.deepEqual(economy.resources, { gold: 128, food: 20, wood: 40 });

  const events = economy.history.read(undefined, 'farm:1,1');
  assert.deepEqual(events.map(({ operation, origin, resource, units, originBalance }) =>
    ({ operation, origin, resource, units, originBalance })), [
    { operation: 'construction-material', origin: 'construction-reserve', resource: 'wood', units: 10 * U,
      originBalance: { before: 50 * U, after: 40 * U } },
    { operation: 'construction', origin: 'treasury', resource: 'gold', units: 20 * U,
      originBalance: { before: 148 * U, after: 128 * U } },
  ]);
  simulation.recalculate();
  simulation.advance(1000);
  assert.equal(economy.storage.constructionWoodReserve, 40);
  assert.equal(economy.resources.gold, 128);
});

test.each([
  [{ gold: -181, food: 20, wood: 10 }, /oro/],
  [{ gold: 20, food: 20, wood: 9 }, /madera/],
  [{ gold: -181, food: 20, wood: 9 }, /oro.*madera/],
] as const)('insufficient resources leave the placement, reserves and audit untouched', (initial, message) => {
  const { economy, map, simulation } = setup(initial);
  assert.match(simulation.build(farm, 'farm')!, message);
  assert.equal(map.getConstruction(farm), null);
  assert.deepEqual(economy.resources, initial);
  assert.deepEqual(economy.history.read(), []);
});

test('occupied cells and a second village center never charge again', () => {
  const { map, economy, simulation } = setup();
  assert.equal(simulation.build(center, 'villageCenter'), null);
  assert.equal(simulation.build(farm, 'farm'), null);
  const before = economy.resources, events = economy.history.read();
  assert.match(simulation.build(farm, 'market')!, /casilla/);
  assert.match(simulation.build(cell(9, 9), 'villageCenter')!, /Ya existe/);
  assert.equal(map.getConstruction(farm), 'farm');
  assert.deepEqual(economy.resources, before);
  assert.deepEqual(economy.history.read(), events);
});

test('wood is spent from the construction reserve before the operational warehouse, even after food bootstrap ends', () => {
  const { economy, simulation } = staffed({ gold: 150, food: 20, wood: 3 });
  assert.equal(economy.setMarketSale(market, 'wood', false), true);
  assert.ok(economy.storage.depositProduction(lumberjack, 'wood', 8 * U + 2 * U / 3));
  assert.ok(economy.storage.depositProduction(farm, 'food', 2 * U));
  for (let i = 0; i < 5; i++) economy.distribution.advanceSecond();
  deliverFixtureCargo(economy);
  assert.equal(economy.distribution.bootstrapActive, false);
  assert.equal(simulation.build(cell(8, 2), 'farm'), null);

  assert.equal(economy.storage.constructionWoodReserve, 0);
  assert.equal(economy.storage.warehouseAt(warehouse)?.wood, 5 / 3);
  assert.equal(economy.resources.wood, 5 / 3);
  const debits = economy.history.read('wood', 'farm:8,2');
  assert.deepEqual(debits.map(event => [event.origin, event.units, event.originBalance]), [
    ['construction-reserve', 3 * U, { before: 3 * U, after: 0 }],
    [warehouseId, 7 * U, { before: 26 * U / 3, after: 5 * U / 3 }],
  ]);
});

test('disconnecting a stocked warehouse prevents spending its wood or partially debiting the reserve', () => {
  const { economy, roads, simulation } = staffed({ gold: 150, food: 20, wood: 3 });
  assert.ok(economy.storage.depositProduction(lumberjack, 'wood', 20 * U));
  assert.equal(simulation.requestDemolition(road), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(roads.isConnected(warehouse), false);
  assert.equal(economy.availableConstructionWood, 3);
  const before = economy.resources, history = economy.history.read();
  assert.match(simulation.build(cell(8, 2), 'farm')!, /madera/);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.storage.warehouseAt(warehouse)?.wood, 20);
  assert.deepEqual(economy.history.read(), history);
});

test('connected but unstaffed warehouses cannot fund construction', () => {
  const { map, economy, population, simulation, roads } = staffed({ gold: 150, food: 20, wood: 0 });
  assert.ok(economy.storage.depositProduction(lumberjack, 'wood', 20 * U));
  economy.recalculate(
    // Sync through the existing economy with a workforce temporarily assigning nobody.
    // The connection and physical stock are preserved.
    map, roads, { workersAt: () => 0, capacityFor: type => population.capacityFor(type) },
  );
  assert.equal(economy.availableConstructionWood, 0);
  assert.match(simulation.build(cell(8, 2), 'farm')!, /madera/);
});

test('requesting and cancelling demolition keeps the building, gold and history', () => {
  const { map, economy, simulation } = setup();
  assert.equal(simulation.build(road, 'road'), null);
  const before = economy.resources, events = economy.history.read();
  assert.equal(simulation.requestDemolition(road), null);
  assert.equal(simulation.demolitionTarget?.type, 'road');
  simulation.cancelDemolition();
  assert.match(simulation.confirmDemolition()!, /Selecciona/);
  assert.equal(map.getConstruction(road), 'road');
  assert.deepEqual(economy.resources, before);
  assert.deepEqual(economy.history.read(), events);
});

test('confirmed demolition charges once and removes empty residential capacity', () => {
  const { map, economy, population, simulation } = staffed();
  assert.equal(population.residentsAt(emptyPlot), 0);
  const capacity = population.residentialCapacity;
  assert.equal(simulation.requestDemolition(emptyPlot), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(simulation.demolitionTarget, null);
  assert.match(simulation.confirmDemolition()!, /Selecciona/);
  assert.equal(map.getConstruction(emptyPlot), null);
  assert.equal(population.residentialCapacity, capacity - 4);
  assert.equal(population.total, 6);
  assert.equal(economy.resources.gold, 145);
  const [charge] = economy.history.read('gold', 'house:8,1');
  assert.deepEqual([charge.operation, charge.units, charge.origin, charge.originBalance],
    ['demolition', 5 * U, 'treasury', { before: 150 * U, after: 145 * U }]);
});

test('road removal updates connections, market coverage and production immediately', () => {
  const { economy, roads, population, simulation } = staffed();
  assert.equal(roads.isConnected(farm), true);
  assert.ok(economy.distribution.coverage.coveredHomes(market) > 0);
  assert.ok(economy.perSecond.food > 0);
  assert.equal(simulation.requestDemolition(road), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(roads.isConnected(farm), false);
  assert.equal(population.jobCapacity, 0);
  assert.equal(population.total, 6);
  assert.equal(economy.distribution.coverage.coveredHomes(market), 0);
  assert.equal(economy.perSecond.food, 0);
});

test('removing a staffed producer updates jobs and reassigns its worker', () => {
  const { economy, population, simulation } = staffed();
  const jobs = population.jobCapacity, employed = population.employed;
  assert.ok(population.workersAt(farm) > 0);
  assert.equal(simulation.requestDemolition(farm), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(population.jobCapacity, jobs - 4);
  assert.equal(population.workersAt(farm), 0);
  assert.equal(population.employed, employed);
  assert.equal(economy.productivityAt(farm), undefined);
  assert.equal(economy.perSecond.food, 0);
});

test('a warehouse that fills during confirmation cannot be demolished and a stocked market is protected', () => {
  const { economy, map, simulation } = staffed();
  assert.equal(simulation.requestDemolition(warehouse), null);
  assert.ok(economy.storage.depositProduction(farm, 'food', 2 * U));
  const before = economy.resources, history = economy.history.read();
  assert.match(simulation.confirmDemolition()!, /inventario/);
  assert.deepEqual(economy.resources, before);
  assert.deepEqual(economy.history.read(), history);

  for (let i = 0; i < 5; i++) economy.distribution.advanceSecond();
  deliverFixtureCargo(economy);
  const supplied = economy.resources, restocked = economy.history.read();
  assert.match(simulation.requestDemolition(market)!, /inventario/);
  assert.equal(map.getConstruction(warehouse), 'warehouse');
  assert.equal(map.getConstruction(market), 'market');
  assert.deepEqual(economy.resources, supplied);
  assert.deepEqual(economy.history.read(), restocked);
});

test('empty warehouse and market inventories are removed and rebuilt with fresh permissions', () => {
  const { economy, simulation } = staffed();
  economy.setWarehouseAcceptance(warehouse, 'wood', false);
  assert.ok(economy.storage.depositProduction(farm, 'food', U / 10));
  for (let i = 0; i < 5; i++) economy.distribution.advanceSecond();
  deliverFixtureCargo(economy);
  economy.consumeHomes({ residencesSnapshot: [{ cell: home, residents: 1 }] }, 0.1);
  assert.equal(economy.perSecond.gold, 0.01);
  assert.equal(economy.distribution.marketAt(market)?.food, 0);
  for (const target of [warehouse, market]) {
    assert.equal(simulation.requestDemolition(target), null);
    assert.equal(simulation.confirmDemolition(), null);
  }
  assert.equal(economy.storage.inventories.snapshot(warehouseId), undefined);
  assert.equal(economy.storage.inventories.snapshot(marketId), undefined);
  assert.equal(economy.distribution.coverage.coveredHomes(market), 0);
  assert.equal(economy.perSecond.gold, 0);
  assert.equal(economy.resources.gold, 140.01);
  const replacement = cell(2, 2);
  assert.equal(simulation.build(replacement, 'warehouse'), null);
  assert.equal(economy.storage.warehouseAt(replacement)?.accepts.wood, true);
});

test('the village center and empty ground are protected without payment', () => {
  const { economy, population, simulation } = staffed();
  assert.ok(population.residentsAt(home) > 0);
  assert.match(simulation.requestDemolition(center)!, /protegido/);
  assert.match(simulation.requestDemolition(cell(10, 10))!, /existente/);
  assert.equal(economy.resources.gold, 150);
  assert.deepEqual(economy.history.read(), []);
});

test('confirmation rechecks gold and pausing blocks edits', () => {
  const { map, economy, simulation } = setup({ gold: -194, food: 20, wood: 50 });
  map.place(road, 'road');
  assert.equal(simulation.requestDemolition(road), null);
  simulation.setPaused(true);
  assert.match(simulation.confirmDemolition()!, /Reanuda/);
  assert.match(simulation.build(home, 'house')!, /Reanuda/);
  assert.equal(economy.resources.gold, -194);
  simulation.setPaused(false);
  assert.equal(simulation.build(cell(2, 0), 'road'), null);
  assert.match(simulation.confirmDemolition()!, /oro/);
  assert.equal(map.getConstruction(road), 'road');
  assert.equal(economy.resources.gold, -196);
  assert.deepEqual(economy.history.read().map(event => event.operation), ['construction']);
});

test('the default budget can build a connected village and start earning through real sales', () => {
  const { map, economy, population, simulation } = setup();
  assert.equal(simulation.build(cell(0, 4), 'villageCenter'), null);
  for (let x = 1; x <= 8; x++) assert.equal(simulation.build(cell(x, 4), 'road'), null);
  assert.equal(simulation.build(cell(1, 1), 'farm'), null);
  assert.equal(simulation.build(cell(4, 2), 'warehouse'), null);
  assert.ok(map.terrain.plantTree(cell(6, 6)));
  assert.equal(simulation.build(cell(6, 2), 'lumberjack'), null);
  assert.equal(simulation.build(cell(8, 2), 'market'), null);
  assert.equal(simulation.build(cell(7, 5), 'house'), null);
  assert.equal(simulation.build(cell(8, 5), 'house'), null);
  assert.equal(economy.storage.constructionWoodReserve, 0);
  const openingGold = economy.resources.gold;
  simulation.advance(120_000);
  assert.ok(population.total > 4);
  assert.ok(economy.resources.gold > openingGold);
});

test('isolating the city keeps time and unmet demand advancing, without consuming or selling inaccessible stock', () => {
  const { economy, roads, population, simulation } = staffed();
  assert.ok(economy.storage.depositProduction(farm, 'food', 20 * U));
  for (let i = 0; i < 5; i++) economy.distribution.advanceSecond();
  deliverFixtureCargo(economy);
  simulation.advance(5000);
  assert.ok(economy.distribution.marketAt(market)!.food > 0);
  assert.ok(economy.storage.depositProduction(farm, 'food', 10 * U));
  assert.equal(simulation.requestDemolition(road), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(roads.isConnected(home), false);
  assert.equal(economy.perSecond.gold, 0);
  const balances = economy.resources;
  const stocks = [economy.storage.warehouseAt(warehouse)?.food, economy.distribution.marketAt(market)?.food];
  const people = population.total;
  const deficit = economy.distribution.cumulativeFoodShortage;
  const lastEvent = economy.history.latestId;

  assert.equal(simulation.advance(10_000), true);
  assert.equal(simulation.paused, false);
  assert.equal(simulation.simulatedTimeMs, 15_000);
  assert.deepEqual(economy.perSecond, { gold: 0, food: 0, wood: 0 });
  assert.deepEqual(economy.resources, balances);
  assert.deepEqual([economy.storage.warehouseAt(warehouse)?.food, economy.distribution.marketAt(market)?.food], stocks);
  assert.equal(economy.history.latestId, lastEvent);
  assert.equal(population.total, people);
  assert.equal(population.foodConsumptionPerSecond, people / 10);
  assert.equal(economy.distribution.cumulativeFoodShortage, deficit + people);
  assert.equal(economy.distribution.foodShortageAt(home), population.residentsAt(home) / 10);

  assert.equal(simulation.build(road, 'road'), null);
  assert.equal(roads.isConnected(home), true);
  assert.ok(economy.perSecond.food > 0);
  const shortageBeforeRecovery = economy.distribution.cumulativeFoodShortage;
  simulation.advance(1000);
  assert.equal(simulation.simulatedTimeMs, 16_000);
  assert.ok(economy.perSecond.gold > 0);
  assert.equal(economy.distribution.foodShortageAt(home), 0);
  assert.equal(economy.distribution.cumulativeFoodShortage, shortageBeforeRecovery);
  assert.equal(economy.perSecond.gold, people / 100);
});

test('an isolated home cannot consume from the initial reserve even before a market opens', () => {
  const { economy, population, simulation } = staffed();
  assert.equal(economy.distribution.bootstrapActive, true);
  assert.equal(simulation.requestDemolition(road), null);
  assert.equal(simulation.confirmDemolition(), null);
  const initialReserve = economy.storage.initialFoodReserve;
  simulation.advance(3000);
  assert.equal(economy.storage.initialFoodReserve, initialReserve);
  assert.equal(economy.distribution.cumulativeFoodShortage, 3 * population.total / 10);
  assert.equal(economy.history.read('food').length, 0);
});

test('a draining warehouse can still restock a market, then be demolished once empty', () => {
  const { economy, simulation } = staffed();
  assert.ok(economy.storage.depositProduction(farm, 'food', 20 * U));
  assert.equal(economy.setWarehouseDraining(warehouse, true), true);
  assert.match(simulation.requestDemolition(warehouse)!, /inventario/);
  assert.match(economy.storage.warehouseAt(warehouse)!.drainStatus, /falta otro almacén/);
  simulation.advance(10000);
  assert.equal(economy.storage.warehouseAt(warehouse)?.used, 0);
  assert.ok(economy.distribution.marketAt(market)!.food > 0);
  const before = economy.resources;
  assert.equal(simulation.requestDemolition(warehouse), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(economy.storage.inventories.snapshot(warehouseId), undefined);
  assert.deepEqual(economy.resources, { ...before, gold: before.gold - 5 });
});

test('cancelling an occupied home demolition preserves residents, employment and balances', () => {
  const { map, economy, population, simulation } = staffed();
  const residents = population.residencesSnapshot;
  const jobs = population.employed;
  const before = economy.resources;
  assert.ok(population.residentsAt(home) > 0);
  assert.equal(simulation.requestDemolition(home), null);
  simulation.cancelDemolition();
  assert.match(simulation.confirmDemolition()!, /Selecciona/);
  assert.equal(map.getConstruction(home), 'house');
  assert.deepEqual(population.residencesSnapshot, residents);
  assert.equal(population.employed, jobs);
  assert.deepEqual(economy.resources, before);
  assert.deepEqual(economy.history.read(), []);
});

test('demolishing an occupied home removes its residents and recomputes demand, workers and vacancies', () => {
  const { map, economy, population, simulation } = staffed();
  const residents = population.total, departing = population.residentsAt(home);
  const capacity = population.residentialCapacity, employment = population.employed;
  assert.ok(departing > 0);
  assert.equal(simulation.requestDemolition(home), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(map.getConstruction(home), null);
  assert.equal(population.residentsAt(home), 0);
  assert.equal(population.total, residents - departing);
  assert.equal(population.residentialCapacity, capacity - 4);
  assert.equal(population.activePopulation, Math.floor(population.total / 2));
  assert.equal(population.employed, population.activePopulation);
  assert.ok(population.employed < employment);
  assert.equal(population.unemployed, 0);
  assert.equal(population.availableJobs, population.jobCapacity - population.employed);
  assert.equal(population.foodConsumptionPerSecond, population.total / 10);
  assert.equal(economy.resources.gold, 145);
});
