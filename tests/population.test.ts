import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Economy } from '../src/economy/Economy.ts';
import { Population, populationRules } from '../src/population/Population.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const cell = (column: number, row: number) => ({ column, row });

function setup() {
  const map = new ConstructionMap(20, 20);
  const connections = new RoadConnections();
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  const population = new Population();
  const simulation = new SettlementSimulation(economy, population, populationRules.immigrationIntervalSeconds, map, connections);
  const recalculate = () => {
    simulation.recalculate();
  };
  return { map, connections, economy, population, simulation, recalculate };
}

function village() {
  const state = setup();
  state.map.place(cell(0, 0), 'villageCenter');
  for (let x = 1; x <= 8; x++) state.map.place(cell(x, 0), 'road');
  return state;
}

test('residential plots start empty, occupy one cell, and disconnected plots cannot receive residents', () => {
  const { map, population, recalculate } = village();
  assert.equal(map.place(cell(10, 10), 'house'), true);
  assert.equal(map.place(cell(10, 10), 'road'), false);
  map.place(cell(1, 1), 'farm');
  recalculate();
  assert.equal(population.total, 0);
  assert.equal(population.residentialCapacity, 4);
  assert.equal(population.connectedCapacity, 0);
  assert.equal(population.immigrate(100), 0);
});

test('immigration still requires a food reserve, while connected jobs improve attraction', () => {
  const { map, population, recalculate } = village();
  map.place(cell(1, 1), 'house');
  map.place(cell(10, 10), 'farm');
  recalculate();
  assert.equal(population.jobCapacity, 0);
  assert.ok(population.migrationAttractiveness(100) > 0);
  map.place(cell(2, 1), 'warehouse');
  recalculate();
  assert.equal(population.immigrate(0), 0);
  assert.equal(population.immigrate(0.49), 0);
  assert.equal(population.immigrate(0.5), 1);
  assert.equal(population.residentsAt(cell(1, 1)), 1);
  // 0.5 food supports the existing resident but no newcomer.
  assert.equal(population.immigrate(0.5), 0);
});

test('each connected building offers configured jobs but produces nothing without workers', () => {
  const { map, economy, population, simulation, recalculate } = village();
  const types = ['farm', 'lumberjack', 'market', 'warehouse'] as const;
  types.forEach((type, i) => map.place(cell(i + 1, 1), type));
  map.place(cell(15, 15), 'farm');
  recalculate();
  assert.equal(population.jobCapacity, 12);
  assert.equal(population.employed, 0);
  assert.equal(population.availableJobs, 12);
  simulation.advance(1000);
  assert.deepEqual(economy.resources, { gold: 0, food: 20, wood: 0 });
});

test('one family arrives only at each five-second evaluation and consumption starts next second', () => {
  const { map, economy, population, simulation, recalculate } = village();
  map.place(cell(1, 1), 'house');
  map.place(cell(2, 1), 'farm');
  recalculate();
  simulation.advance(4999);
  assert.equal(population.total, 0);
  simulation.advance(1);
  assert.equal(population.total, 2);
  assert.equal(population.employed, 1);
  assert.equal(population.workersAt(cell(2, 1)), 1);
  assert.equal(economy.resources.food, 20);
  assert.equal(economy.perSecond.food, 0);
  simulation.advance(1000);
  assert.equal(economy.resources.food, 19.8);
  simulation.advance(4000);
  assert.equal(population.total, 4);
  assert.equal(population.residentsAt(cell(1, 1)), 4);
  simulation.advance(10000);
  assert.equal(population.total, 4);
});

test('central assignment uses active residents, respects workplace capacities and permits unemployment', () => {
  const { map, population, recalculate } = village();
  for (let x = 1; x <= 4; x++) map.place(cell(x, 1), 'house');
  map.place(cell(5, 1), 'warehouse');
  map.place(cell(6, 1), 'market');
  recalculate();
  for (let i = 0; i < 100; i++) {
    population.immigrate(100);
    assert.equal(population.activePopulation, Math.floor(population.total * 0.5));
    assert.equal(population.employed + population.unemployed, population.activePopulation);
    assert.ok(population.workersAt(cell(5, 1)) <= 2);
    assert.ok(population.workersAt(cell(6, 1)) <= 3);
    assert.equal(population.employed,
      population.workersAt(cell(5, 1)) + population.workersAt(cell(6, 1)));
  }
  assert.equal(population.total, 16);
  assert.equal(population.activePopulation, 8);
  assert.equal(population.employed, 5);
  assert.equal(population.unemployed, 3);
  assert.equal(population.unemploymentRate, 3 / 8);
  assert.equal(population.workersAt(cell(5, 1)), 2);
  assert.equal(population.workersAt(cell(6, 1)), 3);
});

test('families use multiple connected plots and never exceed four residents per plot', () => {
  const { map, population, recalculate } = village();
  for (let x = 1; x <= 3; x++) map.place(cell(x, 1), 'house');
  for (let x = 4; x <= 6; x++) map.place(cell(x, 1), 'farm');
  map.place(cell(15, 15), 'house');
  recalculate();
  for (let i = 0; i < 6; i++) assert.equal(population.immigrate(100), 2);
  assert.equal(population.total, 12);
  assert.equal(population.residentialCapacity, 16);
  assert.equal(population.connectedCapacity, 12);
  for (let x = 1; x <= 3; x++) assert.equal(population.residentsAt(cell(x, 1)), 4);
  assert.equal(population.residentsAt(cell(15, 15)), 0);
  assert.equal(population.immigrate(100), 0);
});

test('closing a road gap activates existing plots and jobs without resetting residents on recalculation', () => {
  const { map, population, recalculate } = setup();
  map.place(cell(0, 0), 'villageCenter');
  map.place(cell(2, 0), 'road');
  map.place(cell(3, 0), 'house');
  map.place(cell(2, 1), 'farm');
  recalculate();
  assert.equal(population.immigrate(100), 0);
  assert.equal(population.waitingImmigrants, 1);
  map.place(cell(1, 0), 'road');
  recalculate();
  assert.equal(population.immigrate(100), 1);
  assert.equal(population.waitingImmigrants, 0);
  recalculate();
  recalculate();
  assert.equal(population.total, 1);
  assert.equal(population.residentsAt(cell(3, 0)), 1);
  assert.equal(population.jobCapacity, 4);
});

test('loss of connectivity preserves inhabitants and recalculates unemployment', () => {
  const { map, connections, population, recalculate } = village();
  map.place(cell(1, 1), 'house');
  map.place(cell(2, 1), 'warehouse');
  recalculate();
  population.immigrate(100);
  // A disconnected network snapshot; no demolition feature is introduced.
  const disconnected = new ConstructionMap(20, 20);
  disconnected.place(cell(1, 1), 'house');
  disconnected.place(cell(2, 1), 'warehouse');
  connections.recalculate(disconnected);
  population.recalculate(disconnected, connections);
  assert.equal(population.total, 2);
  assert.equal(population.connectedCapacity, 0);
  assert.equal(population.employed, 0);
  assert.equal(population.unemployed, 1);
  assert.equal(population.immigrate(100), 0);
});

test('food consumption is exact in tenths, clamps at zero and never removes inhabitants', () => {
  const { map, economy, population, simulation, recalculate } = village();
  map.place(cell(1, 1), 'house');
  map.place(cell(2, 1), 'warehouse');
  recalculate();
  economy.consumeFood(20);
  population.immigrate(100);
  simulation.advance(10000);
  assert.equal(economy.resources.food, 0);
  assert.equal(population.total, 2);
  assert.equal(economy.consumeFood(-1), false);
  assert.equal(economy.consumeFood(NaN), false);
  assert.equal(economy.resources.food, 0);

  const foodState = village();
  foodState.map.place(cell(1, 1), 'farm');
  foodState.recalculate();
  foodState.economy.consumeFood(18);
  for (let i = 0; i < 5; i++) assert.equal(foodState.economy.consumeFood(0.3), true);
  assert.equal(foodState.economy.resources.food, 0.5);
  assert.equal(foodState.economy.consumeFood(0.3), true);
  assert.equal(foodState.economy.resources.food, 0.2);
  assert.equal(foodState.economy.consumeFood(0.3), false);
  assert.equal(foodState.economy.resources.food, 0);
});

test('food reserve must cover existing inhabitants as well as the arriving family', () => {
  const { map, population, recalculate } = village();
  map.place(cell(1, 1), 'house');
  map.place(cell(2, 1), 'farm');
  recalculate();
  assert.equal(population.immigrate(1), 2);
  assert.equal(population.immigrate(1), 0);
  assert.equal(population.immigrate(1.5), 1);
  assert.equal(population.foodConsumptionPerSecond, 0.3);
});

test('large and fractional updates match sequential seconds, including immigration and food consumption', () => {
  function ready() {
    const state = village();
    state.map.place(cell(1, 1), 'house');
    state.map.place(cell(2, 1), 'house');
    state.map.place(cell(3, 1), 'farm');
    state.map.place(cell(4, 1), 'farm');
    state.recalculate();
    return state;
  }
  const batch = ready();
  const frames = ready();
  batch.simulation.advance(23456);
  for (let i = 0; i < 234; i++) frames.simulation.advance(100);
  frames.simulation.advance(56);
  assert.deepEqual(batch.economy.resources, frames.economy.resources);
  assert.equal(batch.population.total, frames.population.total);
  assert.equal(batch.population.total, 8);
  for (const delta of [0, -100, NaN, Infinity]) {
    assert.equal(batch.simulation.advance(delta), false);
  }
});

test('placing the center last unlocks immigration only at the next scheduled evaluation', () => {
  const { map, population, simulation, recalculate } = setup();
  map.place(cell(1, 0), 'road');
  map.place(cell(2, 0), 'house');
  map.place(cell(1, 1), 'farm');
  recalculate();
  simulation.advance(5000);
  assert.equal(population.total, 0);
  map.place(cell(0, 0), 'villageCenter');
  recalculate();
  simulation.advance(4999);
  assert.equal(population.total, 0);
  simulation.advance(1);
  assert.equal(population.total, 2);
});
test('no vacancies allow moderate immigration, but high unemployment prevents endless growth', () => {
  const { map, population, recalculate } = village();
  map.place(cell(1, 1), 'house');
  map.place(cell(2, 1), 'house');
  recalculate();
  assert.equal(population.jobCapacity, 0);
  assert.equal(population.activePopulation, 0);
  assert.equal(population.unemploymentRate, 0);
  const arrivals: number[] = [];
  for (let i = 0; i < 100; i++) arrivals.push(population.immigrate(100));
  assert.equal(arrivals[0], 1);
  assert.equal(arrivals[1], 2);
  assert.equal(population.total, 3);
  assert.equal(population.activePopulation, 1);
  assert.equal(population.unemployed, 1);
  assert.equal(population.unemploymentRate, 1);
  assert.equal(population.migrationAttractiveness(100), 0);
  assert.ok(arrivals.slice(2).every(count => count === 0));
});

test('the initial food reserve bootstraps worker-based production while unemployment still limits growth', () => {
  const { map, economy, population, simulation, recalculate } = village();
  for (let x = 1; x <= 6; x++) map.place(cell(x, 1), 'house');
  map.place(cell(8, 1), 'farm');
  map.place(cell(9, 0), 'warehouse');
  recalculate();
  assert.deepEqual(economy.resources, { gold: 0, food: 20, wood: 0 });
  assert.equal(population.migrationAttractiveness(0), 0);
  simulation.advance(5000);
  assert.equal(population.total, 2);
  assert.equal(population.activePopulation, 1);
  assert.equal(population.employed, 1);
  assert.equal(population.workersAt(cell(9, 0)), 1);
  assert.equal(economy.resources.food, 20);
  assert.equal(economy.perSecond.food, 0);
  simulation.advance(5000);
  assert.equal(population.total, 4);
  assert.equal(economy.resources.food, 19);
  simulation.advance(20000);
  assert.ok(population.employed <= population.activePopulation);
  assert.ok(population.migrationAttractiveness(economy.availableFood) <= 100);
  assert.ok(economy.resources.food > 0);
  assert.ok(economy.perSecond.food > 0);
  assert.equal(economy.perSecond.food, population.workersAt(cell(8, 1)) / 2);
  assert.ok(economy.storage.warehouseAt(cell(9, 0))!.operational);
  simulation.advance(600000);
  assert.ok(economy.resources.food >= 0);
  assert.ok(population.total <= population.connectedCapacity);
});

test('new connected jobs employ unemployed residents immediately and restore migration attraction', () => {
  const { map, population, recalculate } = village();
  for (let x = 1; x <= 6; x++) map.place(cell(x, 1), 'house');
  map.place(cell(8, 1), 'farm');
  recalculate();
  for (let i = 0; i < 30; i++) population.immigrate(100);
  assert.ok(population.unemployed > 0);
  const total = population.total;
  const before = population.migrationAttractiveness(100);
  map.place(cell(7, 2), 'market');
  recalculate();
  assert.equal(population.total, total);
  assert.equal(population.jobCapacity, 4); // Diagonal to road: not connected.
  assert.equal(population.workersAt(cell(7, 2)), 0);
  map.place(cell(7, 1), 'road');
  recalculate();
  assert.equal(population.jobCapacity, 7);
  assert.equal(population.employed, Math.min(7, population.activePopulation));
  assert.equal(population.workersAt(cell(7, 2)), Math.min(3, Math.max(0, population.activePopulation - 4)));
  assert.ok(population.migrationAttractiveness(100) > before);
});

test('food and housing are hard limits regardless of jobs or migration credit', () => {
  const { map, population, recalculate } = village();
  map.place(cell(1, 1), 'house');
  map.place(cell(2, 1), 'farm');
  recalculate();
  population.immigrate(100);
  for (const food of [0, -1, NaN, Infinity, 0.49]) {
    assert.equal(population.migrationAttractiveness(food), 0);
    assert.equal(population.immigrate(food), 0);
  }
  assert.equal(population.total, 2);
  assert.equal(population.immigrate(100), 2); // No backlog after starvation.
  assert.equal(population.total, 4);
  assert.equal(population.availableHousing, 0);
  assert.ok(population.migrationAttractiveness(100) > 0);
  assert.equal(population.immigrate(100), 0);
  assert.ok(population.waitingImmigrants > 0);
});

test('rising unemployment progressively reduces both attraction and the deterministic arrival rate', () => {
  const { map, population, recalculate } = village();
  for (let x = 1; x <= 6; x++) map.place(cell(x, 1), 'house');
  map.place(cell(8, 1), 'farm');
  recalculate();
  let previousScore = 100;
  let zeroArrivalEvaluations = 0;
  let reachedUnemployment = false;
  for (let i = 0; i < 200; i++) {
    const score = population.migrationAttractiveness(100);
    assert.ok(score <= previousScore);
    previousScore = score;
    const arrived = population.immigrate(100);
    assert.ok(arrived >= 0 && arrived <= populationRules.familySize);
    if (population.unemployed > 0) {
      reachedUnemployment = true;
      if (arrived === 0) zeroArrivalEvaluations++;
    }
  }
  assert.equal(reachedUnemployment, true);
  assert.ok(zeroArrivalEvaluations > 0);
  assert.equal(population.total, 20);
});

test('migration credit preserves batch-versus-frame determinism even after jobs fill', () => {
  function ready() {
    const state = village();
    for (let x = 1; x <= 6; x++) state.map.place(cell(x, 1), 'house');
    state.map.place(cell(8, 1), 'farm');
    state.recalculate();
    return state;
  }
  const batch = ready();
  const frames = ready();
  batch.simulation.advance(123456);
  for (let i = 0; i < 1234; i++) frames.simulation.advance(100);
  frames.simulation.advance(56);
  assert.equal(batch.population.total, frames.population.total);
  assert.equal(batch.population.unemployed, frames.population.unemployed);
  assert.deepEqual(batch.economy.resources, frames.economy.resources);
  assert.ok(batch.population.unemployed > 0);
});
test('food-worker priority is preserved when another producer is built without changing stocks', () => {
  const { map, economy, population, simulation, recalculate } = village();
  for (let x = 1; x <= 3; x++) map.place(cell(x, 1), 'house');
  map.place(cell(8, 1), 'farm');
  recalculate();
  simulation.advance(10000);
  assert.equal(population.total, 4);
  assert.equal(economy.perSecond.food, 0);
  const before = economy.resources;
  // Existing row-major assignment fills this new workplace before the farm.
  map.place(cell(9, 0), 'lumberjack');
  recalculate();
  assert.equal(population.workersAt(cell(9, 0)), 0);
  assert.equal(population.workersAt(cell(8, 1)), 2);
  assert.deepEqual(economy.perSecond, { gold: 0, food: 0, wood: 0 });
  assert.deepEqual(economy.resources, before);
  simulation.advance(1000);
  assert.equal(economy.resources.wood, 0);
  assert.equal(economy.resources.food, before.food - 0.4);
});

test('rebuilding simulation integration does not reissue initial food', () => {
  const { map, connections, economy, population } = setup();
  economy.consumeFood(3.4);
  const rebuilt = new SettlementSimulation(
    economy, population, populationRules.immigrationIntervalSeconds, map, connections);
  rebuilt.recalculate();
  rebuilt.advance(10000);
  assert.deepEqual(economy.resources, { gold: 0, food: 16.6, wood: 0 });
});