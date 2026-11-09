import assert from 'node:assert/strict';
import { test } from 'vitest';
import { unitsPerResource } from '../src/economy/Inventories.ts';
import { bridgeCells, bridgeRules } from '../src/map/Bridge.ts';
import type { ConstructionType } from '../src/map/ConstructionMap';
import { getRoadMask, RoadDirection } from '../src/map/RoadAppearance.ts';
import { TerrainMap, terrainCode } from '../src/map/Terrain.ts';
import { legacyProceduralTerrain, newWorld } from '../src/map/World.ts';
import { Session } from '../src/persistence/Session.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';

function crossing(width = 2, vertical = false, shore = terrainCode('grass')) {
  const world = newWorld(22, legacyProceduralTerrain);
  const at = (x: number, y: number) => vertical ? { column: y, row: x } : { column: x, row: y };
  const codes = new Uint8Array(world.columns * world.rows);
  for (let x = 4; x < 4 + width; x++) {
    for (let y = 0; y < world.rows; y++) {
      const cell = at(x, y);
      codes[cell.row * world.columns + cell.column] = terrainCode('river');
    }
  }
  const from = at(3, 4), water = at(4, 4), to = at(4 + width, 4);
  codes[to.row * world.columns + to.column] = shore;
  const game = new Session(world, new TerrainMap(world.columns, world.rows, codes));
  assert.ok(game.map.place(at(2, 4), 'villageCenter'));
  assert.ok(game.map.place(from, 'road'));
  game.simulation.recalculate();
  return { game, at, from, to, water };
}

test.each([false, true])('builds a complete crossing with one total charge and preserves the river (vertical %s)', vertical => {
  const { game, at, from, to, water } = crossing(2, vertical);
  const { simulation, map, economy } = game;
  assert.equal(map.place(water, 'bridge'), false);
  assert.match(simulation.build(water, 'bridge')!, /orilla/);
  const preview = simulation.bridgePreview(from, at(5, 4));
  assert.deepEqual(preview.cells, [water, at(5, 4)]);
  assert.equal(preview.horizontal, !vertical);
  assert.deepEqual(preview.cost, { gold: 30, wood: 20 });
  assert.equal(simulation.requestBridge(from, water), null);
  assert.equal(map.getConstruction(water), null);
  assert.equal(simulation.confirmBridge(), null);
  assert.deepEqual(map.bridgeAt(water), { from, to });
  assert.equal(map.getConstruction(to), null);
  assert.equal(getRoadMask(map, from), vertical ? RoadDirection.South : RoadDirection.East);
  for (const cell of preview.cells) {
    assert.equal(map.getConstruction(cell), 'bridge');
    assert.equal(map.terrain.at(cell)?.ground, 'river');
  }
  assert.deepEqual(economy.resources, { gold: 120, wood: 30, food: 20 });
  assert.deepEqual(economy.history.read().map(event => [event.operation, event.units]), [
    ['construction-material', 20 * unitsPerResource], ['construction', 30 * unitsPerResource],
  ]);
  assert.ok(simulation.confirmBridge());
  assert.match(simulation.requestBridge(from, water)!, /superpone/);
  assert.equal(economy.resources.gold, 120);
});

test('upgrading the approach preserves the bridge, the river and connectivity', () => {
  const { game, from, to, water } = crossing();
  const { map, simulation, connections } = game;
  setFixtureRank(simulation, 'villa');
  assert.equal(simulation.requestBridge(from, water), null);
  assert.equal(simulation.confirmBridge(), null);
  assert.equal(simulation.build(to, 'road'), null);
  const revision = connections.revision;
  assert.equal(simulation.upgradeRoad(from, 1), null);
  assert.equal(simulation.upgradeRoad(from, 2), null);
  assert.equal(simulation.roadUpgradeAt(water), null);
  assert.equal(connections.revision, revision);
  assert.ok(connections.isConnected(to));
  assert.equal(map.terrain.at(water)?.ground, 'river');
  assert.deepEqual(map.bridgeAt(water), { from, to });
});

test('rejects invalid, incomplete, overlong and diagonal crossings without changing balances', () => {
  const base = crossing();
  const { game, from, water, at, to } = base;
  assert.match(game.simulation.requestBridge(from, at(4, 5))!, /línea recta/);
  assert.match(game.simulation.requestBridge(from, at(3, 5))!, /agua/);
  assert.match(game.simulation.requestBridge(water, at(5, 4))!, /camino conectado/);
  assert.ok(game.map.place(to, 'farm'));
  assert.match(game.simulation.requestBridge(from, water)!, /orilla opuesta/);
  assert.ok(game.simulation.confirmBridge());
  assert.deepEqual(game.economy.resources, { gold: 150, food: 20, wood: 50 });
  for (const soil of [terrainCode('mountain'), terrainCode('ravine'), terrainCode('grass', 'forest')]) {
    const blocked = crossing(2, false, soil);
    assert.match(blocked.game.simulation.requestBridge(blocked.from, blocked.water)!, /orilla opuesta/);
    assert.equal(blocked.game.map.bridgeSpans().length, 0);
  }
  const wide = crossing(bridgeRules.maxSegments + 1);
  assert.match(wide.game.simulation.requestBridge(wide.from, wide.water)!, /límite/);

  const world = newWorld(22, legacyProceduralTerrain);
  const codes = new Uint8Array(world.columns * world.rows);
  const edgeCell = at(0, 4), edgeBank = at(2, 4);
  codes[4 * world.columns] = codes[4 * world.columns + 1] = terrainCode('river');
  const edge = new Session(world, new TerrainMap(world.columns, world.rows, codes));
  assert.ok(edge.map.place(at(3, 4), 'villageCenter'));
  assert.ok(edge.map.place(edgeBank, 'road'));
  edge.simulation.recalculate();
  assert.match(edge.simulation.requestBridge(edgeBank, edgeCell)!, /orilla opuesta/);
  assert.equal(edge.map.placeBridge({ from: edgeBank, to: at(-1, 4) }), false);
});

test('cancel and failed confirmations leave water untouched and do not charge any part of a crossing', () => {
  const { game, from, water } = crossing();
  const { simulation, map, economy } = game;
  assert.equal(simulation.requestBridge(from, water), null);
  simulation.cancelBridge();
  assert.ok(simulation.confirmBridge());
  assert.deepEqual(economy.resources, { gold: 150, food: 20, wood: 50 });
  assert.deepEqual(economy.history.read(), []);
  assert.equal(simulation.requestBridge(from, water), null);
  assert.ok(economy.payBuildingCost({ gold: 0, wood: 31 }, 'construction', 'test'));
  const before = economy.resources;
  const ledger = economy.history.read().length;
  assert.match(simulation.confirmBridge()!, /Faltan 1 madera/);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.history.read().length, ledger);
  assert.equal(map.getConstruction(water), null);
  assert.equal(map.terrain.at(water)?.ground, 'river');
  assert.ok(map.remove(from));
  simulation.recalculate();
  assert.match(simulation.confirmBridge()!, /camino conectado/);
});

test('roads, production, storage, market and well coverage use bridge tiles, and recover after rebuilding', () => {
  const { game, at, from, to, water } = crossing();
  const { simulation, map, economy, connections, population } = game;
  const market = at(3, 3), well = at(3, 5), home = at(6, 5), farm = at(6, 3), warehouse = at(7, 3);
  const sites: [ReturnType<typeof at>, ConstructionType][] = [
    [at(1, 4), 'road'], [at(1, 3), 'house'], [at(1, 5), 'house'], [market, 'market'], [well, 'well'],
    [to, 'road'], [at(7, 4), 'road'], [home, 'house'], [at(7, 5), 'house'], [farm, 'farm'], [warehouse, 'warehouse'],
  ];
  for (const [cell, type] of sites) assert.ok(map.place(cell, type));
  simulation.recalculate();
  assert.equal(connections.isConnected(warehouse), false);
  assert.equal(economy.distribution.coverage.distance(market, home), undefined);
  assert.equal(simulation.requestBridge(from, water), null);
  assert.equal(simulation.confirmBridge(), null);
  for (let i = 0; i < 8; i++) population.immigrate(100);
  simulation.recalculate();
  assert.equal(connections.networkFor(warehouse), connections.networkFor(market));
  assert.equal(economy.distribution.coverage.distance(market, home), 4);
  assert.ok(simulation.water.suppliedAt(home) > 0);
  assert.ok(economy.storage.warehouseAt(warehouse)?.operational);
  assert.ok(economy.storage.depositProduction(farm, 'food', 30 * unitsPerResource));
  simulation.advance(15000);
  assert.ok(economy.distribution.marketAt(market)!.food > 0);
  const before = economy.resources;
  const terrain = map.terrain.save();
  assert.equal(simulation.requestDemolition(at(5, 4)), null);
  assert.deepEqual(simulation.demolitionCostAt(at(5, 4)), { gold: 10, wood: 0 });
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(economy.resources.gold, before.gold - 10);
  assert.equal(map.terrain.save(), terrain);
  assert.equal(map.getConstruction(water), null);
  assert.equal(connections.isConnected(warehouse), false);
  assert.equal(connections.isConnected(home), false);
  assert.equal(economy.storage.warehouseAt(warehouse)?.operational, false);
  assert.equal(economy.distribution.coverage.distance(market, home), undefined);
  assert.equal(simulation.water.suppliedAt(home), 0);
  assert.equal(simulation.requestBridge(from, water), null);
  assert.equal(simulation.confirmBridge(), null);
  assert.equal(connections.isConnected(warehouse), true);
  assert.equal(economy.distribution.coverage.distance(market, home), 4);
});

test('parallel bridge decks cannot join sideways or connect an isolated network', () => {
  const { game, at, from, water } = crossing();
  const parallel = { from: at(3, 5), to: at(6, 5) };
  assert.ok(game.map.placeBridge(parallel));
  game.simulation.recalculate();
  assert.equal(game.simulation.requestBridge(from, water), null);
  assert.equal(game.simulation.confirmBridge(), null);
  assert.equal(game.connections.isConnected(water), true);
  for (const cell of bridgeCells(parallel)) assert.equal(game.connections.isConnected(cell), false);
});

test('restores bridge metadata, river and economy even after the shore road is demolished', () => {
  const { game, from, water } = crossing();
  assert.equal(game.simulation.requestBridge(from, water), null);
  assert.equal(game.simulation.confirmBridge(), null);
  assert.equal(game.simulation.requestDemolition(from), null);
  assert.equal(game.simulation.confirmDemolition(), null);
  const snapshot = JSON.parse(JSON.stringify(game.saveState(water)));
  const { session: loaded, selection } = Session.restore(snapshot);
  assert.deepEqual(selection, water);
  assert.deepEqual(loaded.map.bridgeSpans(), game.map.bridgeSpans());
  assert.equal(loaded.map.terrain.save(), game.map.terrain.save());
  assert.equal(loaded.connections.isConnected(water), false);
  assert.deepEqual(loaded.economy.resources, game.economy.resources);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.saveState(water))), snapshot);
  delete snapshot.bridgeSpans;
  assert.throws(() => Session.restore(snapshot));
});

test('the starting resources can fund a connected crossing on a generated river', () => {
  const { map, simulation, economy, connections } = Session.start(12);
  const row = 55;
  for (let column = 51; column <= 80; column++) {
    const cell = { column, row };
    if (map.terrain.at(cell)?.obstacle) {
      assert.equal(simulation.requestDemolition(cell), null);
      assert.equal(simulation.confirmDemolition(), null);
    }
    assert.equal(simulation.build(cell, 'road'), null);
  }
  const from = { column: 80, row }, water = { column: 81, row };
  assert.equal(simulation.requestBridge(from, water), null);
  assert.equal(simulation.confirmBridge(), null);
  assert.equal(connections.isConnected({ column: 83, row }), true);
  assert.equal(economy.resources.wood, 20);
  assert.ok(economy.resources.gold >= 15);
});
