import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy, economyRules } from '../src/economy/Economy.ts';
import { Population, populationRules, employmentRules } from '../src/population/Population.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';

const c = (column: number, row: number) => ({ column, row });
const farm = c(2, 1), warehouse = c(4, 1), market = c(7, 1), otherMarket = c(8, 1);
function town(residents = 4, storedFood = 77.5) {
  const map = new ConstructionMap(20, 20);
  map.place(c(0, 2), 'villageCenter');
  for (let x = 1; x <= 18; x++) map.place(c(x, 2), 'road');
  const entries = [[1, 'lumberjack'], [2, 'farm'], [3, 'farm'],
    [4, 'warehouse'], [5, 'warehouse'], [6, 'warehouse'], [7, 'market'], [8, 'market']] as const;
  for (const [x, type] of entries) map.place(c(x, 1), type);
  for (let x = 4; x <= 10; x++) map.place(c(x, 3), 'house');
  const roads = new RoadConnections(), population = new Population();
  roads.recalculate(map);
  population.recalculate(map, roads);
  for (let i = 0; i < 20 && population.total < residents; i++) population.immigrate(residents / 2);
  assert.equal(population.total, residents);
  const economy = new Economy({ gold: 0, food: 0, wood: 0 });
  // Historical state from the old allocator: warehouse + farm, no market worker.
  const oldWorkforce = {
    capacityFor: type => population.capacityFor(type),
    workersAt: cell => (cell.row === 1 && (cell.column === 2 || cell.column === 4)) ? 1 : 0,
  };
  economy.recalculate(map, roads, oldWorkforce);
  if (storedFood > 0) assert.equal(economy.storage.depositProduction(farm, 'food', Math.round(storedFood * U)), true);
  const simulation = new SettlementSimulation(economy, population,
    populationRules.immigrationIntervalSeconds, map, roads);
  return { map, roads, population, economy, simulation };
}

test('reproduces 4 residents, 23 jobs and stored food with no operational markets, then fixes assignment', () => {
  const { map, population, economy, simulation } = town();
  assert.equal(population.total, 4);
  assert.equal(population.activePopulation, 2);
  assert.equal(population.jobCapacity, 23);
  assert.equal(population.availableJobs, 21);
  assert.equal(economy.storage.initialFoodReserve, 0);
  assert.equal(economy.resources.food, 77.5);
  assert.equal(economy.availableFood, 0);
  assert.equal(economy.distribution.marketAt(market)!.workers, 0);
  assert.equal(economy.distribution.marketAt(otherMarket)!.workers, 0);
  const strict = economy.distribution.immigrationPlan(population.residencesSnapshot, 2, 5, 0.1, 4);
  assert.equal(strict.size, 0);
  assert.equal(population.migrationAttractiveness(0, strict), 0);
  assert.match(economy.distribution.marketAt(market)!.reason, /Sin empleados/);
  simulation.recalculate();
  assert.equal(population.workersAt(market), 1);
  assert.equal(population.workersAt(warehouse), 1);
  assert.equal(population.workersAt(farm), 0);
  assert.equal(population.employed, 2);
  assert.equal(economy.resources.food, 77.5);
  simulation.advance(4999);
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  assert.equal(economy.resources.gold, 0);
  assert.equal(population.total, 4);
  simulation.advance(1);
  assert.equal(economy.storage.warehouseAt(warehouse)!.food, 0);
  assert.equal(economy.distribution.marketAt(market)!.food, 77.1);
  assert.equal(economy.resources.gold, 0.4);
  simulation.advance(5000);
  assert.ok(population.total > 4);
  assert.ok(economy.resources.gold > 0);
  assert.equal(economy.storage.initialFoodReserve, 0);
  assert.equal(map.getConstruction(otherMarket), 'market');
});

test('recovery uses no extra food: warehouse stocks plus food-sale treasury remain conserved', () => {
  const { population, economy, simulation } = town();
  simulation.recalculate();
  for (const x of [4, 5, 6]) economy.setWarehouseAcceptance(c(x, 1), 'food', false);
  economy.setMarketSale(otherMarket, 'food', false);
  for (let i = 0; i < 25; i++) {
    simulation.advance(1000);
    assert.equal(economy.perSecond.food, 0);
    assert.equal(economy.resources.food + economy.resources.gold, 77.5);
    assert.equal(economy.storage.initialFoodReserve, 0);
    assert.equal(population.employed + population.unemployed, population.activePopulation);
    assert.equal(economy.storage.warehouseAt(warehouse)!.accepts.food, false);
    assert.equal(economy.distribution.marketAt(otherMarket)!.sells.food, false);
  }
  assert.ok(population.total > 4);
});

test('an exhausted reserve and empty warehouses can recover by staffed production before distribution', () => {
  const { population, economy, simulation } = town(4, 0);
  simulation.recalculate();
  assert.equal(population.workersAt(farm), 1);
  assert.equal(population.workersAt(warehouse), 1);
  assert.equal(population.workersAt(market), 0);
  assert.equal(economy.perSecond.food, 0.5);
  simulation.advance(1000);
  assert.equal(economy.resources.food, 0.5);
  assert.equal(economy.resources.gold, 0);
  simulation.advance(59000);
  assert.ok(population.total >= 8);
  assert.ok(economy.resources.gold > 0);
  assert.equal(economy.storage.initialFoodReserve, 0);
});

test('one active resident can operate storage and recruit moderately before a market can be staffed', () => {
  const { population, economy, simulation } = town(2, 10);
  simulation.recalculate();
  assert.equal(population.workersAt(warehouse), 1);
  assert.equal(population.workersAt(market), 0);
  const supply = economy.immigrationSupply(population, 2, 5, 0.1, 4);
  assert.equal([...supply.values()].reduce((sum, count) => sum + count, 0), 1);
  assert.ok(population.migrationAttractiveness(0, supply) > 0);
  simulation.advance(10000);
  assert.ok(population.total >= 4);
  assert.equal(population.workersAt(market), 1);
  assert.equal(economy.storage.initialFoodReserve, 0);
});

test('recovery recruitment has a population cap, needs actual accessible food, and respects sales/coverage', () => {
  const { population, economy, simulation } = town(4, 0);
  simulation.recalculate();
  assert.equal(economy.immigrationSupply(population, 2, 5, 0.1, 4).size, 0);
  economy.storage.depositProduction(farm, 'food', U);
  assert.ok(economy.immigrationSupply(population, 2, 5, 0.1, 4).size > 0);
  economy.setMarketSale(market, 'food', false);
  economy.setMarketSale(otherMarket, 'food', false);
  assert.equal(economy.immigrationSupply(population, 2, 5, 0.1, 4).size, 0);
  economy.setMarketSale(market, 'food', true);
  const outside = { residencesSnapshot: [{ cell: c(18, 3), residents: 4 }] };
  assert.equal(economy.immigrationSupply(outside, 2, 5, 0.1, 4).size, 0);
  const capped = { residencesSnapshot: [
    { cell: c(4, 3), residents: 4 }, { cell: c(5, 3), residents: 4 },
    { cell: c(6, 3), residents: 4 }, { cell: c(7, 3), residents: 0 },
  ] };
  assert.equal(economyRules.recovery.populationLimit, 12);
  assert.equal(economy.immigrationSupply(capped, 2, 5, 0.1, 4).size, 0);
});

test('sparse workers are not duplicated among many market jobs and ties remain deterministic', () => {
  const { population, simulation } = town();
  simulation.recalculate();
  assert.equal(employmentRules.minimumServices[0], 'market');
  assert.equal(population.workersAt(market), 1);
  assert.equal(population.workersAt(otherMarket), 0);
  const previous = population.residencesSnapshot;
  for (let i = 0; i < 10; i++) simulation.recalculate();
  assert.equal(population.workersAt(market), 1);
  assert.equal(population.workersAt(otherMarket), 0);
  assert.equal(population.employed, 2);
  assert.deepEqual(population.residencesSnapshot, previous);
});

test('disabled food markets cannot steal the essential slot from an authorized connected market', () => {
  const { population, economy, simulation } = town();
  economy.setMarketSale(market, 'food', false);
  simulation.recalculate();
  assert.equal(population.workersAt(market), 0);
  assert.equal(population.workersAt(otherMarket), 1);
  simulation.advance(5000);
  assert.equal(economy.distribution.marketAt(market)!.food, 0);
  assert.ok(economy.distribution.marketAt(otherMarket)!.food > 0);
});

test('initial reserve is not closed by an employed but empty market and never regenerates', () => {
  const { map, roads, population } = town(4, 0);
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  const simulation = new SettlementSimulation(economy, population, 5, map, roads);
  simulation.recalculate();
  assert.equal(population.workersAt(market), 1);
  assert.equal(economy.distribution.bootstrapActive, true);
  const initial = economy.storage.initialFoodReserve;
  simulation.advance(1000);
  assert.equal(economy.storage.initialFoodReserve, initial - 0.4);
  assert.equal(economy.resources.gold, 0);
  let previous = economy.storage.initialFoodReserve;
  for (let i = 0; i < 30; i++) {
    simulation.advance(1000);
    assert.ok(economy.storage.initialFoodReserve <= previous);
    previous = economy.storage.initialFoodReserve;
  }
  assert.equal(economy.distribution.bootstrapActive, false);
});

test('market and migration diagnostics name the actual blocking condition', () => {
  const { population, economy, simulation } = town(4, 0);
  simulation.recalculate();
  const supply = economy.immigrationSupply(population, 2, 5, 0.1, 4);
  assert.equal(population.migrationAttractiveness(0, supply), 0);
  assert.match(economy.migrationReason(population, supply), /sin empleados/);
  economy.setMarketSale(market, 'food', false);
  economy.setMarketSale(otherMarket, 'food', false);
  assert.match(economy.migrationReason(population, supply), /deshabilitada/);
  assert.match(economy.distribution.marketAt(market)!.reason, /Sin empleados/);
});
test('the essential warehouse slot follows existing food rather than an earlier empty warehouse', () => {
  const { roads, population, economy, simulation } = town();
  const ledger = economy.storage.inventories;
  ledger.setAccess('warehouse:5,1', roads.networkFor(c(5, 1)), true);
  assert.equal(ledger.transfer('warehouse:4,1', 'warehouse:5,1', 'food', 77.5 * U), true);
  simulation.recalculate();
  assert.equal(population.workersAt(warehouse), 0);
  assert.equal(population.workersAt(c(5, 1)), 1);
  assert.equal(population.workersAt(market), 1);
  assert.equal(economy.resources.food, 77.5);
  simulation.advance(5000);
  assert.ok(economy.distribution.marketAt(market)!.food > 0);
  assert.ok(population.total > 4);
});

test('a connected market without housing coverage does not take the essential worker from a useful market', () => {
  const { map, population, economy, simulation } = town();
  map.place(c(0, 1), 'road');
  map.place(c(0, 0), 'road');
  map.place(c(1, 0), 'market'); // Connected through the center, no road-only route to houses.
  simulation.recalculate();
  assert.equal(economy.distribution.marketAt(c(1, 0))!.connected, true);
  assert.equal(economy.distribution.marketAt(c(1, 0))!.coveredHomes, 0);
  assert.equal(population.workersAt(c(1, 0)), 0);
  assert.equal(population.workersAt(market), 1);
  simulation.advance(5000);
  assert.ok(population.total > 4);
});

test('adaptive scarcity priorities and recovery migration match batched and frame-based updates', () => {
  const batch = town(4, 0), frames = town(4, 0);
  batch.simulation.recalculate();
  frames.simulation.recalculate();
  batch.simulation.advance(60000);
  for (let i = 0; i < 600; i++) frames.simulation.advance(100);
  assert.deepEqual(batch.economy.resources, frames.economy.resources);
  assert.deepEqual(batch.population.residencesSnapshot, frames.population.residencesSnapshot);
  assert.equal(batch.population.employed, frames.population.employed);
  assert.equal(batch.economy.storage.initialFoodReserve, 0);
  assert.equal(frames.economy.storage.initialFoodReserve, 0);
});
test('markets serving distinct inhabited areas receive minimum staff before extra production posts', () => {
  const map = new ConstructionMap(20, 20);
  map.place(c(0, 2), 'villageCenter');
  for (let x = 1; x <= 16; x++) map.place(c(x, 2), 'road');
  map.place(c(2, 1), 'market');
  map.place(c(12, 1), 'market');
  map.place(c(7, 1), 'farm');
  map.place(c(8, 1), 'warehouse');
  map.place(c(1, 3), 'house');
  map.place(c(12, 3), 'house');
  const population = new Population(), roads = new RoadConnections(), economy = new Economy({ gold: 0, food: 20, wood: 0 });
  roads.recalculate(map);
  population.recalculate(map, roads);
  for (let i = 0; i < 4; i++) population.immigrate(100);
  assert.equal(population.total, 8);
  const simulation = new SettlementSimulation(economy, population, 5, map, roads);
  simulation.recalculate();
  assert.equal(population.workersAt(c(2, 1)), 1);
  assert.equal(population.workersAt(c(12, 1)), 1);
  assert.equal(population.workersAt(c(7, 1)), 1);
  assert.equal(population.workersAt(c(8, 1)), 1);
  assert.equal(population.employed, 4);
  assert.equal(population.unemployed, 0);
});