import type Phaser from 'phaser';
import type { Cell } from './CellSelection';
import type { ConstructionMap } from './ConstructionMap';
import type { RoadLevel } from './RoadMaterials';

export const RoadDirection = { North: 1, East: 2, South: 4, West: 8 } as const;

const neighbors = [
  { dx: 0, dy: -1, bit: RoadDirection.North },
  { dx: 1, dy: 0, bit: RoadDirection.East },
  { dx: 0, dy: 1, bit: RoadDirection.South },
  { dx: -1, dy: 0, bit: RoadDirection.West },
];
const roadColors = {
  1: { surface: 0xac8c5d, detail: 0x8c704d },
  2: { surface: 0xa69a83, detail: 0x777367 },
  3: { surface: 0xaba89a, detail: 0x77756b },
  royal: { surface: 0xaca18c, detail: 0xf1d189 },
} as const;

export function getRoadMask(map: ConstructionMap, cell: Cell): number {
  let mask = 0;
  const entry = map.kingdomRoad?.entry.cell;
  const isEntry = entry?.column === cell.column && entry.row === cell.row;
  for (const { dx, dy, bit } of neighbors) {
    const neighbor = { column: cell.column + dx, row: cell.row + dy };
    if (map.roadTouches(neighbor, cell)
      || (map.isKingdomRoad(cell) && map.getConstruction(neighbor) === 'villageCenter')
      || (isEntry && !map.contains(neighbor))) {
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
  royal = false,
  level: RoadLevel = 1,
): void {
  const { surface, detail } = roadColors[royal ? 'royal' : level];
  const start = 39 / 128, end = 89 / 128;
  const rect = (left: number, top: number, width: number, height: number) =>
    graphics.fillRect(x + left * size, y + top * size, width * size, height * size);
  graphics.fillStyle(surface, alpha);
  rect(start, start, end - start, end - start);
  if (royal) {
    graphics.fillStyle(detail, alpha);
    rect(0.35, 0.4, 0.12, 0.08);
    rect(0.54, 0.54, 0.1, 0.08);
  }
  // Every material uses the same edges, including when it meets a bridge or royal road.
  for (const { dx, dy, bit } of neighbors) {
    if (!(mask & bit)) continue;
    const offset = dx > 0 || dy > 0 ? end : 0;
    const arm = (along: number, across: number, length: number, width: number) =>
      dx ? rect(offset + along, across, length, width) : rect(across, offset + along, width, length);
    graphics.fillStyle(surface, alpha);
    arm(0, start, start, end - start);
    graphics.fillStyle(detail, alpha);
    if (level === 3) {
      arm(0.08, start, 0.012, end - start);
      arm(0.21, start, 0.012, end - start);
      arm(0, 0.47, 0.08, 0.012);
      arm(0.09, 0.55, 0.12, 0.012);
      arm(0.22, 0.47, 0.08, 0.012);
    } else {
      arm(0.06, 0.42, 0.04, 0.025);
      arm(0.19, 0.57, 0.05, 0.025);
      if (level === 2) arm(0.24, 0.37, 0.035, 0.03);
    }
  }
}
