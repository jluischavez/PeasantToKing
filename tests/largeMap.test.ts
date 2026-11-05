import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CellSelection } from '../src/map/CellSelection.ts';
import { MapCamera, cameraRules, cellSize } from '../src/map/MapCamera.ts';
import { Session } from '../src/persistence/Session.ts';

const viewport = { x: 80, y: 50, size: cameraRules.initialTiles * cellSize };
const middle = { x: viewport.x + viewport.size / 2, y: viewport.y + viewport.size / 2 };
const start = { column: 50, row: 50 };

function gameAndCamera() {
  const game = Session.start();
  const camera = new MapCamera(game.world, game.map.villageCenter!);
  camera.setViewport(viewport);
  return { game, camera };
}

test('a new session has a 100 by 100 world and opens on the center with twenty tiles per side', () => {
  const { game, camera } = gameAndCamera();
  assert.equal(game.map.columns, 100);
  assert.equal(game.map.rows, 100);
  assert.equal(game.map.saveCells().length, 10_000);
  assert.deepEqual(game.map.occupiedCells(), [{ cell: start, type: 'villageCenter' }]);
  assert.deepEqual(camera.cellAt(middle), start);
  assert.equal(camera.bounds.size / cellSize, 20);
  assert.equal(game.economy.resources.gold, 150);
});

test('screen coordinates select the same world cell through panning and cursor-anchored zoom', () => {
  const { camera } = gameAndCamera();
  assert.deepEqual(camera.worldAt(middle), { x: 50.5 * cellSize, y: 50.5 * cellSize });
  camera.pan(3 * cellSize, 2 * cellSize);
  assert.deepEqual(camera.cellAt(middle), { column: 53, row: 52 });
  const pointer = { x: middle.x + 31, y: middle.y - 67 };
  const anchor = camera.worldAt(pointer);
  const selection = new CellSelection();
  selection.select(camera.cellAt(pointer)!);
  camera.zoomAt(pointer, 2);
  assert.deepEqual(camera.worldAt(pointer), anchor);
  assert.deepEqual(camera.cellAt(pointer), selection.selected);
  assert.deepEqual(camera.cellAt(middle), { column: 54, row: 51 });
  assert.equal(camera.cellAt({ x: viewport.x - 1, y: middle.y }), null);
});

test('panning, resizing and zooming keep every visible edge within the world', () => {
  const { camera, game } = gameAndCamera();
  camera.zoomAt(middle, 100);
  assert.equal(camera.view.zoom, cameraRules.maxZoom);
  camera.pan(-100_000, -100_000);
  assert.equal(camera.bounds.x, 0);
  assert.equal(camera.bounds.y, 0);
  assert.deepEqual(camera.cellAt(viewport), { column: 0, row: 0 });
  camera.pan(100_000, 100_000);
  const maxX = game.world.columns * cellSize, maxY = game.world.rows * cellSize;
  assert.equal(camera.bounds.x + camera.bounds.size, maxX);
  assert.equal(camera.bounds.y + camera.bounds.size, maxY);
  camera.zoomAt(middle, 0.01);
  assert.equal(camera.view.zoom, cameraRules.minZoom);
  camera.setViewport({ ...viewport, size: viewport.size / 2 });
  assert.equal(camera.bounds.x + camera.bounds.size, maxX);
  assert.equal(camera.bounds.y + camera.bounds.size, maxY);
  assert.deepEqual(camera.cellAt({ x: viewport.x + viewport.size / 2 - 1, y: viewport.y + viewport.size / 2 - 1 }),
    { column: 99, row: 99 });
  camera.focus(start);
  assert.equal(camera.view.zoom, cameraRules.minZoom);
  assert.deepEqual(camera.cellAt({ x: viewport.x + viewport.size / 4, y: viewport.y + viewport.size / 4 }), start);
});

test('a drag, canceled gesture or alternate button never returns a construction click', () => {
  const { camera, game } = gameAndCamera();
  const buildOnRelease = (point: typeof middle) => {
    const cell = camera.endPointer(1, point);
    if (cell) assert.equal(game.simulation.build(cell, 'road'), null);
  };
  const away = { ...middle, x: middle.x - 3 * cellSize };
  assert.equal(camera.beginPointer(1, middle, 0), true);
  camera.movePointer(1, away);
  assert.equal(camera.dragging, true);
  buildOnRelease(away);
  assert.deepEqual(camera.cellAt(middle), { column: 53, row: 50 });
  assert.equal(camera.beginPointer(1, middle, 0), true);
  buildOnRelease(away); // Fast drag first observed on pointer-up.
  for (const button of [1, 2]) {
    assert.equal(camera.beginPointer(1, middle, button), true);
    buildOnRelease(middle);
  }
  assert.equal(camera.beginPointer(1, middle, 0), true);
  camera.cancelPointer(1);
  buildOnRelease(middle);
  assert.equal(game.map.occupiedCells().length, 1);
  assert.equal(game.economy.resources.gold, 150);
  assert.equal(camera.beginPointer(1, middle, 0), true);
  buildOnRelease({ ...middle, x: middle.x + 1 });
  assert.equal(game.map.occupiedCells().length, 2);
});

test('a panned camera targets construction and demolition beyond the initial view with working road access', () => {
  const { game, camera } = gameAndCamera();
  const { simulation, connections, map } = game;
  const far = { column: 72, row: 51 };
  for (let column = start.column + 1; column <= far.column; column++) {
    assert.equal(simulation.build({ column, row: start.row }, 'road'), null);
  }
  camera.pan((far.column - start.column) * cellSize, cellSize);
  camera.zoomAt(middle, 1.5);
  const targeted = camera.cellAt(middle)!;
  assert.deepEqual(targeted, far);
  assert.equal(simulation.build(targeted, 'house'), null);
  assert.equal(connections.isConnected(far), true);
  assert.equal(connections.networkFor(far), connections.networkFor(start));
  assert.equal(simulation.requestDemolition(targeted), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(map.getConstruction(far), null);
  assert.equal(connections.isConnected(far), false);
});
