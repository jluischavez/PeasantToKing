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
): void {
  graphics.fillStyle(royal ? 0xaca18c : 0xb99b6a, alpha);
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
  graphics.fillStyle(royal ? 0xf1d189 : 0xd4bb8e, alpha);
  graphics.fillRect(x + size * 0.35, y + size * 0.4, size * 0.12, size * 0.08);
  graphics.fillRect(x + size * 0.54, y + size * 0.54, size * 0.1, size * 0.08);
}

export function drawBridge(graphics: Phaser.GameObjects.Graphics, x: number, y: number,
  size: number, alpha = 1, mask = 0): void {
  const horizontal = (mask & (RoadDirection.East | RoadDirection.West)) !== 0;
  const rect = (along: number, across: number, length: number, width: number) => {
    graphics.fillRect(x + size * (horizontal ? along : across), y + size * (horizontal ? across : along),
      size * (horizontal ? length : width), size * (horizontal ? width : length));
  };
  graphics.fillStyle(0x423123, alpha);
  rect(0, 0.22, 1, 0.56);
  graphics.fillStyle(0xb9854d, alpha);
  for (let plank = 0; plank < 5; plank++) rect(plank / 5 + 0.015, 0.26, 0.17, 0.48);
  graphics.fillStyle(0xe0b477, alpha);
  rect(0, 0.22, 1, 0.07);
  rect(0, 0.71, 1, 0.07);
}
