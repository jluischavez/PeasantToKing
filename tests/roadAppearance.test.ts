import assert from 'node:assert/strict';
import test from 'node:test';
import type Phaser from 'phaser';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { drawRoad, getRoadMask, RoadDirection } from '../src/map/RoadAppearance.ts';

test('all 16 masks detect exactly the orthogonal road neighbors', () => {
  for (let mask = 0; mask < 16; mask++) {
    const map = new ConstructionMap(20, 20);
    for (const [column, row, bit] of [[5, 4, 1], [6, 5, 2], [5, 6, 4], [4, 5, 8]]) {
      if (mask & bit!) assert.equal(map.place({ column: column!, row: row! }, 'road'), true);
    }
    map.place({ column: 4, row: 4 }, 'road'); // A diagonal must not add an arm.
    assert.equal(getRoadMask(map, { column: 5, row: 5 }), mask);
  }
});

test('new roads update the masks of existing neighbors; buildings and map edges add no arms', () => {
  const map = new ConstructionMap(20, 20);
  const first = { column: 0, row: 0 };
  const second = { column: 1, row: 0 };
  map.place(first, 'road');
  assert.equal(getRoadMask(map, first), 0);
  map.place(second, 'road');
  assert.equal(getRoadMask(map, first), RoadDirection.East);
  assert.equal(getRoadMask(map, second), RoadDirection.West);
  map.place({ column: 0, row: 1 }, 'house');
  map.place({ column: 19, row: 0 }, 'road');
  assert.equal(getRoadMask(map, first), RoadDirection.East);
});

test('each mask reaches precisely its connected edges with a continuous surface', () => {
  for (let mask = 0; mask < 16; mask++) {
    for (const size of [8, 18.4, 40]) {
      for (const alpha of [1, 0.55]) {
        const rectangles: number[][] = [];
        const graphics = {
          fillStyle(_color: number, opacity: number) { assert.equal(opacity, alpha); },
          fillRect(...args: number[]) { rectangles.push(args); },
        } as unknown as Phaser.GameObjects.Graphics;
        drawRoad(graphics, 0, 0, size, alpha, mask);
        const covers = (x: number, y: number) => rectangles.some(([rx, ry, w, h]) =>
          x >= rx! && x <= rx! + w! && y >= ry! && y <= ry! + h!);
        assert.ok(covers(size * 0.5, size * 0.5));
        for (const [bit, x, y] of [[1, 0.5, 0], [2, 1, 0.5], [4, 0.5, 1], [8, 0, 0.5]]) {
          assert.equal(covers(size * x!, size * y!), Boolean(mask & bit!));
          if (mask & bit!) {
            for (let step = 0; step <= 20; step++) {
              const t = step / 20;
              assert.ok(covers(size * (0.5 + (x! - 0.5) * t), size * (0.5 + (y! - 0.5) * t)));
            }
          }
        }
      }
    }
  }
});
