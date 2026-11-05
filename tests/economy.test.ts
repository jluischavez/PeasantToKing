import assert from 'node:assert/strict';
import test from 'node:test';
import { Economy } from '../src/economy/Economy.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';

function setup() {
  const map = new ConstructionMap(20, 20);
  const connections = new RoadConnections();
  const economy = new Economy();
  const recalculate = () => {
    connections.recalculate(map);
    economy.recalculate(map, connections);
  };
  return { map, connections, economy, recalculate };
}

test('resources start at zero and disconnected producers never produce', () => {
  const { map, economy, recalculate } = setup();
  map.place({ column: 0, row: 0 }, 'farm');
  map.place({ column: 1, row: 0 }, 'lumberjack');
  map.place({ column: 2, row: 0 }, 'market');
  recalculate();
  economy.advance(5000);
  assert.deepEqual(economy.resources, { gold: 0, food: 0, wood: 0 });
  assert.deepEqual(economy.perSecond, { gold: 0, food: 0, wood: 0 });
});

test('connected producers accumulate, while houses and warehouses produce nothing', () => {
  const { map, economy, recalculate } = setup();
  map.place({ column: 0, row: 0 }, 'villageCenter');
  const types = ['farm', 'farm', 'lumberjack', 'lumberjack', 'market', 'market', 'house', 'warehouse'] as const;
  for (const [index, type] of types.entries()) {
    map.place({ column: index + 1, row: 0 }, 'road');
    map.place({ column: index + 1, row: 1 }, type);
  }
  recalculate();
  assert.deepEqual(economy.perSecond, { gold: 2, food: 4, wood: 4 });
  assert.equal(economy.advance(999), false);
  assert.deepEqual(economy.resources, { gold: 0, food: 0, wood: 0 });
  assert.equal(economy.advance(1), true);
  assert.deepEqual(economy.resources, { gold: 2, food: 4, wood: 4 });
  economy.advance(2000);
  assert.deepEqual(economy.resources, { gold: 6, food: 12, wood: 12 });
});

test('closing a road gap starts existing production without paying disconnected seconds', () => {
  const { map, economy, recalculate } = setup();
  map.place({ column: 0, row: 0 }, 'villageCenter');
  map.place({ column: 2, row: 0 }, 'road');
  map.place({ column: 3, row: 0 }, 'farm');
  recalculate();
  economy.advance(4000);
  map.place({ column: 1, row: 0 }, 'road');
  recalculate();
  assert.deepEqual(economy.perSecond, { gold: 0, food: 2, wood: 0 });
  assert.equal(economy.resources.food, 0);
  economy.advance(1000);
  assert.equal(economy.resources.food, 2);
});

test('placing the center last activates all connected resource types', () => {
  const { map, economy, recalculate } = setup();
  map.place({ column: 1, row: 0 }, 'road');
  map.place({ column: 2, row: 0 }, 'road');
  map.place({ column: 3, row: 0 }, 'market');
  map.place({ column: 1, row: 1 }, 'farm');
  map.place({ column: 2, row: 1 }, 'lumberjack');
  recalculate();
  economy.advance(1000);
  assert.deepEqual(economy.resources, { gold: 0, food: 0, wood: 0 });
  map.place({ column: 0, row: 0 }, 'villageCenter');
  recalculate();
  economy.advance(1000);
  assert.deepEqual(economy.resources, { gold: 1, food: 2, wood: 2 });
});

test('diagonal access and roads beyond a building cannot produce', () => {
  const { map, economy, recalculate } = setup();
  map.place({ column: 0, row: 0 }, 'villageCenter');
  map.place({ column: 1, row: 0 }, 'road');
  map.place({ column: 2, row: 1 }, 'farm');
  map.place({ column: 2, row: 0 }, 'house');
  map.place({ column: 3, row: 0 }, 'road');
  map.place({ column: 4, row: 0 }, 'market');
  recalculate();
  economy.advance(1000);
  assert.deepEqual(economy.resources, { gold: 0, food: 0, wood: 0 });
});

test('shared clock preserves fractional seconds and recalculation never duplicates income', () => {
  const { map, connections, economy, recalculate } = setup();
  map.place({ column: 0, row: 0 }, 'villageCenter');
  map.place({ column: 1, row: 0 }, 'road');
  map.place({ column: 2, row: 0 }, 'market');
  recalculate();
  recalculate();
  economy.advance(2500);
  assert.equal(economy.resources.gold, 2);
  economy.advance(499);
  assert.equal(economy.resources.gold, 2);
  economy.advance(1);
  assert.equal(economy.resources.gold, 3);
  for (const delta of [0, -1, NaN, Infinity]) {
    assert.equal(economy.advance(delta), false);
  }
  // Recalculation also clears obsolete rates if connectivity changes.
  const disconnected = new ConstructionMap(20, 20);
  connections.recalculate(disconnected);
  economy.recalculate(disconnected, connections);
  economy.advance(1000);
  assert.equal(economy.resources.gold, 3);
  assert.deepEqual(economy.perSecond, { gold: 0, food: 0, wood: 0 });
});