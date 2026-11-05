import type Phaser from 'phaser';
import type { Cell } from './CellSelection';
import type { ConstructionMap } from './ConstructionMap';

export const RoadDirection = { North: 1, East: 2, South: 4, West: 8 } as const;

const neighbors = [
  { dx: 0, dy: -1, bit: RoadDirection.North },
  { dx: 1, dy: 0, bit: RoadDirection.East },
  { dx: 0, dy: 1, bit: RoadDirection.South },
  { dx: -1, dy: 0, bit: RoadDirection.West },
];

export function getRoadMask(map: ConstructionMap, cell: Cell): number {
  let mask = 0;
  for (const { dx, dy, bit } of neighbors) {
    if (map.getConstruction({ column: cell.column + dx, row: cell.row + dy }) === 'road') {
      mask |= bit;
    }
  }
  return mask;
}

export function drawRoad(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  mask = 0,
): void {
  graphics.fillStyle(0xb99b6a, alpha);
  graphics.fillRect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4);
  // Arms meet the cell edges; neighboring roads share the same width.
  if (mask & RoadDirection.North) {
    graphics.fillRect(x + size * 0.3, y, size * 0.4, size * 0.3);
  }
  if (mask & RoadDirection.East) {
    graphics.fillRect(x + size * 0.7, y + size * 0.3, size * 0.3, size * 0.4);
  }
  if (mask & RoadDirection.South) {
    graphics.fillRect(x + size * 0.3, y + size * 0.7, size * 0.4, size * 0.3);
  }
  if (mask & RoadDirection.West) {
    graphics.fillRect(x, y + size * 0.3, size * 0.3, size * 0.4);
  }
  graphics.fillStyle(0xd4bb8e, alpha);
  graphics.fillRect(x + size * 0.35, y + size * 0.4, size * 0.12, size * 0.08);
  graphics.fillRect(x + size * 0.54, y + size * 0.54, size * 0.1, size * 0.08);
}
