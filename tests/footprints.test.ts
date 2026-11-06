import assert from 'node:assert/strict';
import { test } from 'vitest';
import { constructionDimensions, footprint } from '../src/map/ConstructionMap.ts';
import { Session } from '../src/persistence/Session.ts';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots.ts';
import { MarketCoverage } from '../src/map/MarketCoverage.ts';
import { TerrainMap, terrainCode } from '../src/map/Terrain.ts';
import { legacyProceduralTerrain, newWorld } from '../src/map/World.ts';

const c = (column: number, row: number) => ({ column, row });

test('a farm has nine occupied tiles, one entity, one charge and one demolition', () => {
  const { map, simulation, economy } = new Session();
  const anchor = c(4, 4), corner = c(6, 6);
  assert.equal(simulation.build(anchor, 'farm'), null);
  const farm = map.constructionAt(anchor)!;
  assert.equal(farm.width, 3);
  assert.equal(farm.height, 3);
  for (const tile of footprint(anchor, farm)) assert.equal(map.constructionAt(tile), farm);
  assert.equal(map.occupiedCells().length, 1);
  assert.deepEqual(economy.resources, { gold: 130, wood: 40, food: 20 });
  assert.equal(economy.operatingCostsPerHour(0).maintenance, 0.25);
  assert.equal(simulation.requestDemolition(corner), null);
  assert.deepEqual(simulation.demolitionTarget?.cell, anchor);
  assert.equal(simulation.confirmDemolition(), null);
  for (const tile of footprint(anchor, farm)) assert.equal(map.constructionAt(tile), null);
  assert.deepEqual(map.occupiedCells(), []);
  assert.equal(economy.resources.gold, 125);
});

test('one blocked or out-of-bounds tile rejects an entire footprint before any charge', () => {
  const { map, simulation, economy } = new Session();
  assert.ok(map.place(c(6, 6), 'road'));
  assert.match(simulation.build(c(4, 4), 'farm')!, /ocupada/);
  assert.match(simulation.build(c(98, 98), 'farm')!, /fuera del mapa/);
  assert.equal(economy.resources.gold, 150);
  assert.equal(economy.resources.wood, 50);
  assert.equal(map.occupiedCells().length, 1);
  const world = Session.start(12);
  const route = world.map.kingdomRoad!;
  const road = route.segments.at(-2)!;
  assert.match(world.simulation.build(c(road.column - 1, road.row - 1), 'market')!, /reino/);
  assert.equal(world.economy.resources.gold, 150);
});

test.each([terrainCode('grass', 'tree'), terrainCode('grass', 'rock'), terrainCode('river'),
  terrainCode('ravine'), terrainCode('mountain')])('natural terrain on the far corner blocks the whole farm (%i)', code => {
  const world = newWorld(22, legacyProceduralTerrain);
  const tiles = new Uint8Array(world.columns * world.rows);
  tiles[6 * world.columns + 6] = code;
  const { simulation, map, economy } = new Session(world, new TerrainMap(world.columns, world.rows, tiles));
  assert.ok(simulation.build(c(4, 4), 'farm'));
  assert.equal(map.occupiedCells().length, 0);
  assert.equal(economy.resources.gold, 150);
});

test('one large farm provides one roster, one output rate and no shortcut through the footprint', () => {
  const { map, connections, simulation, population, economy } = new Session();
  assert.ok(map.place(c(0, 4), 'villageCenter'));
  for (let x = 1; x <= 5; x++) assert.ok(map.place(c(x, 4), 'road'));
  assert.ok(map.place(c(1, 5), 'house'));
  assert.ok(map.place(c(2, 5), 'house'));
  assert.ok(map.place(c(3, 5), 'warehouse', constructionDimensions.warehouse));
  assert.ok(map.place(c(4, 0), 'road'));
  assert.equal(simulation.build(c(3, 1), 'farm'), null);
  assert.ok(connections.isConnected(c(5, 1)));
  assert.equal(connections.isConnected(c(4, 0)), false);
  while (population.total < 8) assert.ok(population.immigrate(100) > 0);
  simulation.refreshWorkforce();
  const workers = population.workersAt(c(3, 1));
  assert.ok(workers > 0);
  assert.equal(population.jobCapacity, 6);
  assert.equal(economy.perSecond.food, workers * 0.5);
  assert.equal(economy.storage.inventories.saveState().filter(item => item.id.startsWith('warehouse:')).length, 1);
});

test('markets connect and measure coverage from the opposite corner of their footprint', () => {
  const { map, connections, simulation, economy, population } = new Session();
  assert.ok(map.place(c(0, 4), 'villageCenter'));
  for (let x = 1; x <= 5; x++) assert.ok(map.place(c(x, 4), 'road'));
  assert.ok(map.place(c(5, 3), 'road'));
  assert.ok(map.place(c(5, 2), 'road'));
  assert.ok(map.place(c(5, 1), 'house'));
  assert.equal(simulation.build(c(3, 2), 'market'), null);
  assert.ok(connections.isConnected(c(3, 2)));
  assert.ok(connections.isConnected(c(4, 3)));
  const coverage = new MarketCoverage();
  coverage.recalculate(map, connections, 6);
  assert.equal(coverage.distance(c(3, 2), c(5, 1)), 1);
  assert.equal(population.capacityFor('market'), 3);
  assert.equal(economy.storage.inventories.saveState().filter(item => item.id.startsWith('market:')).length, 1);
  assert.equal([...footprint(c(3, 2), constructionDimensions.market)].length, 4);
});

test('a loaded 1×1 farm keeps its neighbors and a new large market keeps its exact footprint', () => {
  const game = new Session();
  assert.ok(game.map.place(c(1, 1), 'farm'));
  assert.ok(game.map.place(c(2, 1), 'house'));
  game.simulation.recalculate();
  const items = new Map([[saveKey(1), JSON.stringify({ version: 1, savedAt: 1, state: game.saveState(null) })]]);
  const slots = new SaveSlots(() => ({ getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); } }));
  const old = slots.load(1).session;
  assert.equal(old.map.constructionAt(c(1, 1))?.width, 1);
  assert.equal(old.map.getConstruction(c(2, 1)), 'house');
  assert.equal(old.simulation.build(c(4, 4), 'market'), null);
  slots.save(2, null, old, c(5, 5));
  assert.equal(JSON.parse(items.get(saveKey(2))!).version, 2);
  const { session: loaded, selection } = slots.load(2);
  assert.deepEqual(selection, c(4, 4));
  assert.equal(loaded.map.constructionAt(c(5, 5)), loaded.map.constructionAt(c(4, 4)));
  assert.equal(loaded.map.occupiedCells().length, 3);
  assert.deepEqual(loaded.economy.resources, old.economy.resources);
});
