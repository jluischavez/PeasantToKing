import assert from 'node:assert/strict';
import { test } from 'vitest';
import { unitsPerResource } from '../src/economy/Inventories.ts';
import type { Cell } from '../src/map/CellSelection';
import { clearingCosts } from '../src/map/ConstructionCosts.ts';
import { generateTerrain, hasPlayableStart } from '../src/map/generateTerrain.ts';
import { groundNames, obstacleNames, TerrainMap } from '../src/map/Terrain.ts';
import type { TerrainTile } from '../src/map/Terrain';
import { maxSeed, newWorld, randomSeed, startingCell } from '../src/map/World.ts';
import { Session } from '../src/persistence/Session.ts';
import { SaveSlots } from '../src/persistence/SaveSlots.ts';
import { terrainAuditId } from '../src/simulation/SettlementSimulation.ts';

function matching(terrain: TerrainMap, predicate: (tile: TerrainTile) => boolean): Cell[] {
  const result: Cell[] = [];
  for (let row = 0; row < terrain.rows; row++) {
    for (let column = 0; column < terrain.columns; column++) {
      const cell = { column, row };
      if (predicate(terrain.at(cell)!)) result.push(cell);
    }
  }
  return result;
}

test('the same seed reproduces all terrain and other seeds generate distinct maps', () => {
  const game = Session.start(12);
  const terrain = game.map.terrain;
  assert.equal(terrain.rows, 100);
  assert.equal(terrain.columns, 100);
  assert.equal(terrain.save().length, 10_000);
  assert.equal(terrain.save(), Session.start(12).map.terrain.save());
  assert.notEqual(terrain.save(), Session.start(13).map.terrain.save());
  assert.ok(matching(terrain, tile => tile.obstacle === 'forest').length
    > matching(terrain, tile => tile.obstacle === 'tree').length);
  for (let i = 0; i < 10; i++) assert.notEqual(randomSeed(12), 12);
});

test('multiple seeds give a playable starting region and a single continuous river reaching both edges', () => {
  for (const seed of [0, 1, 12, 17, 108, 711, 10_385, 81_211, 987_654_321, maxSeed]) {
    const game = Session.start(seed);
    const center = startingCell(game.world);
    const terrain = game.map.terrain;
    assert.deepEqual(game.map.villageCenter, center);
    assert.equal(terrain.canBuild(center), true);
    assert.ok(hasPlayableStart(terrain, center), 'seed ' + seed);
    const water = matching(terrain, tile => tile.ground === 'river');
    const unseen = new Set(water.map(cell => cell.row * terrain.columns + cell.column));
    const queue = [water[0]!];
    assert.equal(queue[0]!.row, 0);
    unseen.delete(queue[0]!.column);
    for (let index = 0; index < queue.length; index++) {
      const { row, column } = queue[index]!;
      for (const cell of [{ row: row - 1, column }, { row: row + 1, column },
        { row, column: column - 1 }, { row, column: column + 1 }]) {
        if (terrain.at(cell)?.ground === 'river' && unseen.delete(cell.row * terrain.columns + cell.column)) {
          queue.push(cell);
        }
      }
    }
    assert.equal(unseen.size, 0, 'discontinuous river with seed ' + seed);
    assert.ok(queue.some(cell => cell.row === terrain.rows - 1));
  }
});

test('buildings and roads can be placed on free grass and meadow', () => {
  const game = Session.start(12);
  for (const ground of ['grass', 'meadow'] as const) {
    const cell = matching(game.map.terrain, tile => tile.ground === ground && !tile.obstacle)
      .find(cell => !game.map.getConstruction(cell))!;
    assert.equal(game.simulation.build(cell, 'road'), null);
    assert.equal(game.map.getConstruction(cell), 'road');
  }
});

test.each([['tree', 3], ['forest', 8], ['rock', 6]] as const)(
  'clearing %s costs %i gold once, keeps the soil and permits construction',
  (obstacle, cost) => {
    const game = Session.start(12);
    const { map, economy, simulation, connections } = game;
    const cell = matching(map.terrain, tile => tile.obstacle === obstacle)[0]!;
    const tile = map.terrain.at(cell)!;
    const initial = economy.resources;
    const inventories = economy.storage.inventories.saveState();
    const revision = connections.revision;
    assert.equal(map.place(cell, 'road'), false);
    assert.ok(simulation.constructionIssue(cell, 'house')?.includes(obstacleNames[obstacle]));
    assert.equal(simulation.requestDemolition(cell), null);
    assert.equal(simulation.demolitionTarget?.kind, 'obstacle');
    assert.deepEqual(economy.resources, initial);
    assert.equal(simulation.confirmDemolition(), null);
    assert.deepEqual(map.terrain.at(cell), { ...tile, obstacle: null });
    assert.deepEqual(economy.resources, { ...initial, gold: initial.gold - cost });
    assert.deepEqual(economy.storage.inventories.saveState(), inventories);
    assert.equal(connections.revision, revision);
    const events = economy.history.read('gold', terrainAuditId(cell));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.operation, 'clearing');
    assert.equal(events[0]!.units, cost * unitsPerResource);
    assert.ok(simulation.confirmDemolition());
    assert.ok(simulation.requestDemolition(cell));
    assert.equal(economy.history.read('gold', terrainAuditId(cell)).length, 1);
    assert.equal(simulation.build(cell, 'house'), null);
    assert.equal(simulation.requestDemolition(cell), null);
    assert.equal(simulation.demolitionTarget?.kind, 'building');
    assert.equal(simulation.confirmDemolition(), null);
    assert.equal(map.terrain.at(cell)?.obstacle, null);
  },
);

test.each(['river', 'ravine', 'mountain'] as const)('%s blocks placement and has no valid clearing confirmation', ground => {
  const game = Session.start(12);
  const { map, economy, simulation } = game;
  const cell = matching(map.terrain, tile => tile.ground === ground)[0]!;
  const before = economy.resources;
  assert.equal(map.place(cell, 'road'), false);
  assert.ok(simulation.build(cell, 'road')?.includes(groundNames[ground]));
  assert.match(simulation.requestDemolition(cell)!, /no puede limpiarse/);
  assert.equal(simulation.demolitionTarget, null);
  assert.ok(simulation.confirmDemolition());
  assert.deepEqual(map.terrain.at(cell), { ground, obstacle: null });
  assert.deepEqual(economy.resources, before);
  assert.deepEqual(economy.history.read(), []);
});

test('canceling a clearing, losing affordability before confirming, and a stale target do not charge', () => {
  const game = Session.start(12);
  const { map, economy, simulation } = game;
  const cell = matching(map.terrain, tile => tile.obstacle === 'forest')[0]!;
  assert.equal(simulation.requestDemolition(cell), null);
  simulation.cancelDemolition();
  assert.ok(simulation.confirmDemolition());
  assert.equal(economy.resources.gold, 150);
  assert.equal(map.terrain.at(cell)?.obstacle, 'forest');
  assert.equal(simulation.requestDemolition(cell), null);
  assert.ok(economy.payBuildingCost({ gold: 347, wood: 0 }, 'construction', 'test'));
  assert.match(simulation.confirmDemolition()!, /Faltan 5 oro/);
  assert.match(simulation.requestDemolition(cell)!, /insuficientes/);
  assert.equal(economy.resources.gold, -197);
  assert.equal(map.terrain.at(cell)?.obstacle, 'forest');

  const tree = matching(map.terrain, tile => tile.obstacle === 'tree')[0]!;
  assert.equal(simulation.requestDemolition(tree), null);
  assert.equal(map.terrain.clear(tree, 'tree'), true);
  assert.ok(simulation.confirmDemolition());
  assert.equal(economy.resources.gold, -200 + clearingCosts.tree.gold);
  assert.ok(economy.history.read().every(event => event.operation !== 'clearing'));
});

test('an encoded obstacle cannot be put on permanent ground', () => {
  const data = generateTerrain(newWorld(12)).save();
  assert.throws(() => TerrainMap.restore(100, 100, 'J' + data.slice(1)), /Terreno inválido/);
  assert.throws(() => TerrainMap.restore(100, 100, data.slice(1)), /Terreno inválido/);
});

test('slot and tab restore the exact procedural terrain, clearing history, seed and camera', () => {
  const game = Session.start(12);
  const { map, economy, simulation } = game;
  const cell = matching(map.terrain, tile => tile.obstacle === 'forest')[0]!;
  const camera = { x: 1250, y: 900, zoom: 1.5 };
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
  };
  const local = memory(), tab = memory();
  const open = () => new SaveSlots(() => local, () => tab);
  const slots = open();
  slots.save(1, null, game, null);
  assert.equal(simulation.requestDemolition(cell), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(simulation.build(cell, 'road'), null);
  slots.checkpointTab(game, cell, camera);
  const restored = open();
  const reopened = restored.resumeTab()!;
  assert.equal(restored.activeSlot, 1);
  assert.equal(reopened.session.world.seed, 12);
  assert.deepEqual(reopened.camera, camera);
  assert.deepEqual(reopened.selection, cell);
  assert.equal(reopened.session.map.terrain.save(), map.terrain.save());
  assert.equal(reopened.session.map.terrain.at(cell)?.obstacle, null);
  assert.equal(reopened.session.map.getConstruction(cell), 'road');
  assert.deepEqual(reopened.session.economy.resources, economy.resources);
  assert.equal(reopened.session.economy.history.read('gold', terrainAuditId(cell))[0]?.operation, 'clearing');
  assert.equal(open().load(1).session.map.terrain.at(cell)?.obstacle, 'forest');

  const otherTab = open();
  const raw = otherTab.inspect(1).raw;
  otherTab.save(1, raw, game, cell, camera);
  const stale = open();
  assert.equal(stale.resumeTab()?.session.map.terrain.save(), map.terrain.save());
  assert.equal(stale.activeSlot, null);
  const fromSlot = open().load(1);
  assert.deepEqual(fromSlot.camera, camera);
  assert.equal(fromSlot.session.world.seed, 12);
  assert.equal(fromSlot.session.map.terrain.save(), map.terrain.save());
});

test('a procedural save rejects invalid terrain and a building on protected ground', () => {
  const game = Session.start(12);
  const state = game.saveState(null);
  assert.throws(() => Session.restore({ ...state, terrainData: undefined }));
  const river = matching(game.map.terrain, tile => tile.ground === 'river')[0]!;
  const cells = [...state.cells];
  cells[river.row * game.map.columns + river.column] = 'road';
  assert.throws(() => Session.restore({ ...state, cells }));
});
