import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import type { ConstructionType } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population } from '../src/population/Population.ts';

const cell = (column: number, row: number) => ({ column, row });
function setup() {
  const map = new ConstructionMap(20, 20);
  const connections = new RoadConnections();
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  const population = new Population();
  map.place(cell(0, 0), 'villageCenter');
  map.place(cell(19, 1), 'warehouse');
  for (let x = 1; x <= 19; x++) map.place(cell(x, 0), 'road');
  for (let x = 1; x <= 12; x++) map.place(cell(x, 1), 'house');
  const recalculate = () => {
    connections.recalculate(map);
    population.recalculate(map, connections);
    economy.recalculate(map, connections, population);
  };
  const fillWorkers = (workers: number) => {
    const farmOnly = map.getConstruction(cell(13, 1)) === 'farm'
      && map.getConstruction(cell(14, 1)) === null;
    const storageWorkers = farmOnly ? 1 : 2;
    const residents = (workers + storageWorkers) * 2;
    // Use actual immigration/assignment, limiting arrivals with the food reserve.
    for (let i = 0; i < 100 && population.total < residents; i++) {
      population.immigrate(residents / 2);
    }
    assert.equal(population.activePopulation, workers + storageWorkers);
    economy.recalculate(map, connections, population);
  };
  return { map, connections, economy, population, recalculate, fillWorkers };
}

test('the new-game reserve is configurable and never reissued by recalculation or clock updates', () => {
  const { economy, recalculate } = setup();
  assert.deepEqual(economy.resources, { gold: 0, food: 20, wood: 0 });
  economy.consumeFood(7);
  for (let i = 0; i < 10; i++) recalculate();
  economy.advance(10000);
  assert.deepEqual(economy.resources, { gold: 0, food: 13, wood: 0 });
  economy.consumeFood(13);
  recalculate();
  assert.equal(economy.resources.food, 0);
  assert.deepEqual(new Economy({ gold: 0, food: 0, wood: 0 }).resources,
    { gold: 0, food: 0, wood: 0 });
});

test('connected producers without assigned workers produce nothing', () => {
  const { map, economy, recalculate } = setup();
  map.place(cell(13, 1), 'farm');
  map.place(cell(14, 1), 'lumberjack');
  map.place(cell(15, 1), 'market');
  recalculate();
  assert.deepEqual(economy.perSecond, { gold: 0, food: 0, wood: 0 });
  economy.advance(5000);
  assert.deepEqual(economy.resources, { gold: 0, food: 20, wood: 0 });
});

for (const [type, resource, capacity, maximum] of [
  ['farm', 'food', 4, 2], ['lumberjack', 'wood', 3, 2],
] as const) {
  test(type + ' scales production at every workforce level, including full capacity', () => {
    for (let workers = 0; workers <= capacity; workers++) {
      const { map, economy, population, recalculate, fillWorkers } = setup();
      map.place(cell(13, 1), type);
      recalculate();
      fillWorkers(workers);
      assert.equal(population.workersAt(cell(13, 1)), workers);
      assert.equal(economy.perSecond[resource], maximum * workers / capacity);
      assert.deepEqual(economy.productivityAt(cell(13, 1)),
        { workers, capacity, ratio: workers / capacity, storageBlocked: false });
      const before = economy.resources[resource];
      economy.advance(3000);
      assert.equal(economy.resources[resource], before + maximum * workers / capacity * 3);
      assert.ok(economy.perSecond[resource] <= maximum);
    }
  });
}

test('multiple fully staffed buildings accumulate production and nonproducers contribute zero', () => {
  const { map, economy, recalculate, fillWorkers } = setup();
  const types: ConstructionType[] = ['farm', 'farm', 'lumberjack', 'lumberjack', 'market', 'market', 'warehouse'];
  types.forEach((type, i) => map.place(cell(i + 13, 1), type));
  recalculate();
  fillWorkers(20);
  assert.deepEqual(economy.perSecond, { gold: 0, food: 4, wood: 4 });
  assert.equal(economy.productivityAt(cell(19, 1)), undefined);
  economy.advance(3000);
  assert.deepEqual(economy.resources, { gold: 0, food: 32, wood: 12 });
});

test('disconnected production is zero even if an old workforce snapshot still has employees', () => {
  const { map, connections, economy, population, recalculate, fillWorkers } = setup();
  map.place(cell(13, 1), 'farm');
  recalculate();
  fillWorkers(4);
  const disconnected = new ConstructionMap(20, 20);
  disconnected.place(cell(13, 1), 'farm');
  connections.recalculate(disconnected);
  economy.recalculate(disconnected, connections, population);
  assert.deepEqual(economy.perSecond, { gold: 0, food: 0, wood: 0 });
  assert.deepEqual(economy.productivityAt(cell(13, 1)), { workers: 0, capacity: 4, ratio: 0, storageBlocked: false });
  economy.advance(1000);
  assert.equal(economy.resources.food, 20);
});

test('closing a road gap starts staffed production without paying for disconnected seconds', () => {
  const { map, economy, recalculate, fillWorkers } = setup();
  map.place(cell(13, 1), 'farm');
  map.place(cell(15, 2), 'lumberjack'); // Needs the road in (15, 1).
  recalculate();
  fillWorkers(6);
  economy.advance(3000);
  assert.equal(economy.resources.wood, 0);
  map.place(cell(15, 1), 'road');
  recalculate();
  assert.equal(economy.perSecond.wood, 2 / 3);
  assert.equal(economy.resources.wood, 0);
  economy.advance(3000);
  assert.equal(economy.resources.wood, 2);
});

test('shared clock preserves fractions and long-running thirds stop exactly at warehouse capacity', () => {
  const { map, economy, recalculate, fillWorkers } = setup();
  map.place(cell(13, 1), 'lumberjack');
  recalculate();
  fillWorkers(1);
  recalculate();
  recalculate();
  assert.equal(economy.advance(999), false);
  assert.equal(economy.resources.wood, 0);
  assert.equal(economy.advance(1), true);
  assert.equal(economy.resources.wood, 2 / 3);
  economy.advance(2000);
  assert.equal(economy.resources.wood, 2);
  for (let i = 0; i < 30000; i++) economy.advance(1000);
  assert.equal(economy.resources.wood, 300);
  assert.equal(economy.perSecond.wood, 0);
  assert.equal(economy.productivityAt(cell(13, 1))!.storageBlocked, true);
  for (const delta of [0, -1, NaN, Infinity]) assert.equal(economy.advance(delta), false);
});

test('consumption preserves fractional food residue rather than rounding stocks to tenths', () => {
  const economy = new Economy({ gold: 0, food: 1 / 3, wood: 0 });
  assert.equal(economy.consumeFood(0.1), true);
  assert.equal(economy.resources.food, 7 / 30);
  assert.equal(economy.consumeFood(0.1), true);
  assert.equal(economy.resources.food, 4 / 30);
  assert.equal(economy.consumeFood(0.1), true);
  assert.equal(economy.resources.food, 1 / 30);
  assert.equal(economy.consumeFood(0.1), false);
  assert.equal(economy.resources.food, 0);
});

test('production never exceeds maximum even if a workforce provider reports too many workers', () => {
  const { map, connections, economy, population, recalculate } = setup();
  map.place(cell(13, 1), 'farm');
  recalculate();
  economy.recalculate(map, connections, {
    capacityFor: type => population.capacityFor(type),
    workersAt: () => 100,
  });
  assert.equal(economy.perSecond.food, 2);
  assert.deepEqual(economy.productivityAt(cell(13, 1)), { workers: 4, capacity: 4, ratio: 1, storageBlocked: false });
});