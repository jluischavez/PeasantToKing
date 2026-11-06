import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { generateTerrain } from '../src/map/generateTerrain.ts';
import { isMapEdge, planKingdomRoad } from '../src/map/KingdomRoad.ts';
import { TerrainMap, terrainCode } from '../src/map/Terrain.ts';
import { legacyProceduralTerrain, maxSeed, newWorld, startingCell } from '../src/map/World.ts';
import { Session } from '../src/persistence/Session.ts';

const c = (column: number, row: number) => ({ column, row });

test('procedural worlds have a short connected kingdom road on dry land and pay neither construction nor upkeep', () => {
  for (const seed of [...Array.from({ length: 48 }, (_, index) => index), 9_888_555, maxSeed]) {
    const { map, connections, economy } = Session.start(seed);
    const road = map.kingdomRoad!;
    assert.equal(road.entry.roadId, road.id);
    assert.ok(isMapEdge(road.entry.cell, map.columns, map.rows));
    assert.deepEqual(road.entry.cell, road.segments[0]);
    assert.ok(road.segments.length <= 75);
    assert.equal(new Set(road.segments.map(cell => cell.row * map.columns + cell.column)).size, road.segments.length);
    for (const [index, cell] of road.segments.entries()) {
      const next = road.segments[index + 1] ?? map.villageCenter!;
      assert.equal(Math.abs(cell.column - next.column) + Math.abs(cell.row - next.row), 1);
      assert.equal(map.getConstruction(cell), 'road');
      assert.equal(map.terrain.canBuild(cell), true);
      assert.equal(map.isKingdomRoad(cell), true);
      assert.equal(connections.isConnected(cell), true);
    }
    assert.deepEqual(economy.resources, { gold: 150, food: 20, wood: 50 });
    assert.equal(economy.operatingCostsPerHour(0).maintenance, 0);
    assert.deepEqual(economy.history.read(), []);
  }
});

test('route planning is deterministic, avoids existing buildings and terminates on a sealed map', () => {
  const original = Session.start(12);
  assert.deepEqual(Session.start(12).map.kingdomRoad, original.map.kingdomRoad);
  assert.notEqual(Session.start(13).map.terrain.save(), original.map.terrain.save());
  const map = new ConstructionMap(7, 7);
  assert.ok(map.place(c(3, 3), 'villageCenter'));
  assert.ok(map.place(c(3, 2), 'house'));
  const route = planKingdomRoad(map, 0)!;
  assert.ok(!route.some(cell => cell.column === 3 && cell.row === 2));
  assert.equal(map.getConstruction(c(3, 2)), 'house');

  const codes = new Uint8Array(49).fill(terrainCode('mountain'));
  codes[24] = terrainCode('meadow');
  const sealed = new ConstructionMap(7, 7, new TerrainMap(7, 7, codes));
  assert.ok(sealed.place(c(3, 3), 'villageCenter'));
  assert.equal(planKingdomRoad(sealed, 0), null);
});

test('protected roads reject removal and replacement while normal roads keep standard charges', () => {
  const { map, simulation, economy } = Session.start(12);
  const segment = map.kingdomRoad!.entry.cell;
  assert.equal(map.remove(segment), false);
  assert.equal(map.place(segment, 'house'), false);
  assert.match(simulation.requestDemolition(segment)!, /reino.*no puede demolerse/);
  assert.equal(simulation.demolitionTarget, null);
  assert.match(simulation.build(segment, 'house')!, /reino/);
  simulation.advance(25_000);
  assert.equal(economy.resources.gold, 150);
  assert.deepEqual(economy.history.read(), []);

  const road = c(51, 50);
  assert.equal(simulation.build(road, 'road'), null);
  assert.equal(map.isKingdomRoad(road), false);
  assert.equal(economy.operatingCostsPerHour(0).maintenance, 0.01);
  assert.equal(simulation.requestDemolition(road), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(economy.resources.gold, 143);
  assert.equal(economy.operatingCostsPerHour(0).maintenance, 0);
});

test('saving restores the same entry, route and protection and rejects a falsified entry', () => {
  const session = Session.start(12);
  const raw = JSON.parse(JSON.stringify(session.saveState(null)));
  const { session: loaded } = Session.restore(raw);
  const road = session.map.kingdomRoad!;
  assert.deepEqual(loaded.map.kingdomRoad, road);
  assert.deepEqual(loaded.map.saveCells(), session.map.saveCells());
  assert.equal(loaded.map.terrain.save(), session.map.terrain.save());
  assert.equal(loaded.connections.isConnected(road.entry.cell), true);
  assert.equal(loaded.map.remove(road.entry.cell), false);
  assert.deepEqual(loaded.economy.resources, session.economy.resources);
  raw.kingdomRoad.entry.cell = c(0, 0);
  assert.throws(() => Session.restore(raw));
});

test('procedural-v1 saves keep the original map and buildings without acquiring a royal road', () => {
  const world = newWorld(12, legacyProceduralTerrain);
  const session = new Session(world, generateTerrain(world));
  assert.ok(session.map.place(startingCell(world), 'villageCenter'));
  assert.equal(session.simulation.build(c(50, 51), 'house'), null);
  const state = session.saveState(c(50, 51));
  const { session: loaded } = Session.restore(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded.map.kingdomRoad, null);
  assert.deepEqual(loaded.map.saveCells(), state.cells);
  assert.equal(loaded.map.terrain.save(), state.terrainData);
  assert.deepEqual(loaded.world, world);
});
