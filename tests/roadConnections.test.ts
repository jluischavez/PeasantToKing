import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import type { ConstructionType } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';

const cell = (column: number, row: number) => ({ column, row });

function place(map: ConstructionMap, x: number, y: number, type: ConstructionType): void {
  assert.equal(map.place(cell(x, y), type), true);
}

test('without a center, buildings and roads stay disconnected', () => {
  const map = new ConstructionMap(20, 20);
  place(map, 1, 0, 'road');
  place(map, 2, 0, 'house');
  const connections = new RoadConnections();
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(1, 0)), false);
  assert.equal(connections.isConnected(cell(2, 0)), false);
});

test('the center works alone, but an adjacent building still needs a road', () => {
  const map = new ConstructionMap(20, 20);
  place(map, 0, 0, 'villageCenter');
  place(map, 0, 1, 'house');
  const connections = new RoadConnections();
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(0, 0)), true);
  assert.equal(connections.isConnected(cell(0, 1)), false);
});

test('only one center is allowed, including direct model calls', () => {
  const map = new ConstructionMap(20, 20);
  place(map, 0, 0, 'house');
  assert.equal(map.place(cell(0, 0), 'villageCenter'), false);
  assert.equal(map.villageCenter, null);
  place(map, 1, 0, 'villageCenter');
  assert.equal(map.canPlace(cell(2, 0), 'villageCenter'), false);
  assert.equal(map.place(cell(2, 0), 'villageCenter'), false);
  assert.equal(map.getConstruction(cell(2, 0)), null);
  assert.deepEqual(map.villageCenter, cell(1, 0));
});

test('all five building types use the same adjacent-road rule', () => {
  const types: ConstructionType[] = ['house', 'farm', 'lumberjack', 'warehouse', 'market'];
  for (const type of types) {
    const map = new ConstructionMap(20, 20);
    place(map, 0, 0, 'villageCenter');
    place(map, 1, 0, 'road');
    place(map, 2, 0, type);
    const connections = new RoadConnections();
    connections.recalculate(map);
    assert.equal(connections.isConnected(cell(2, 0)), true, type);
  }
});

test('diagonal roads, diagonal buildings and opposite map edges do not connect', () => {
  const map = new ConstructionMap(20, 20);
  place(map, 0, 0, 'villageCenter');
  place(map, 1, 0, 'road');
  place(map, 2, 1, 'road');
  place(map, 1, 1, 'house');
  place(map, 3, 1, 'market');
  place(map, 2, 0, 'farm');
  const connections = new RoadConnections();
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(1, 1)), true);
  assert.equal(connections.isConnected(cell(2, 1)), false);
  assert.equal(connections.isConnected(cell(3, 1)), false);
  const edgeMap = new ConstructionMap(20, 20);
  place(edgeMap, 19, 0, 'villageCenter');
  place(edgeMap, 0, 1, 'road');
  connections.recalculate(edgeMap);
  assert.equal(connections.isConnected(cell(0, 1)), false);
  assert.equal(connections.isConnected(cell(1, 1)), false);
});

test('diagonal access to a reachable road is insufficient for buildings', () => {
  const map = new ConstructionMap(20, 20);
  place(map, 0, 0, 'villageCenter');
  place(map, 1, 0, 'road');
  place(map, 2, 1, 'farm');
  const connections = new RoadConnections();
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(2, 1)), false);
});

test('connected buildings cannot relay a connection to another road', () => {
  const map = new ConstructionMap(20, 20);
  place(map, 0, 0, 'villageCenter');
  place(map, 1, 0, 'road');
  place(map, 2, 0, 'house');
  place(map, 3, 0, 'road');
  place(map, 4, 0, 'warehouse');
  const connections = new RoadConnections();
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(2, 0)), true);
  assert.equal(connections.isConnected(cell(3, 0)), false);
  assert.equal(connections.isConnected(cell(4, 0)), false);
});

test('closing a road gap connects an existing building immediately on recalculation', () => {
  const map = new ConstructionMap(20, 20);
  place(map, 0, 0, 'villageCenter');
  place(map, 1, 0, 'road');
  place(map, 3, 0, 'road');
  place(map, 4, 0, 'market');
  const connections = new RoadConnections();
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(4, 0)), false);
  place(map, 2, 0, 'road');
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(4, 0)), true);
});

test('placing the center last activates an existing road network with a loop', () => {
  const map = new ConstructionMap(20, 20);
  for (const [x, y] of [[1, 0], [2, 0], [2, 1], [1, 1], [2, 2]]) place(map, x!, y!, 'road');
  place(map, 3, 2, 'lumberjack');
  place(map, 8, 8, 'road');
  const connections = new RoadConnections();
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(3, 2)), false);
  place(map, 0, 0, 'villageCenter');
  connections.recalculate(map);
  assert.equal(connections.isConnected(cell(3, 2)), true);
  assert.equal(connections.isConnected(cell(8, 8)), false);
});
