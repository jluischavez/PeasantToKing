import type { Cell } from './CellSelection';
import type { ConstructionMap } from './ConstructionMap';
import { isProtectedGround } from './Terrain.ts';

export const kingdomRoadId = 'kingdom-road' as const;
export const kingdomEntryId = 'kingdom-entry' as const;
export type KingdomRoad = Readonly<{
  id: typeof kingdomRoadId;
  entry: Readonly<{ id: typeof kingdomEntryId; roadId: typeof kingdomRoadId; cell: Cell }>;
  segments: readonly Cell[];
}>;

export function isMapEdge(cell: Cell, columns: number, rows: number): boolean {
  return cell.column === 0 || cell.row === 0 || cell.column === columns - 1 || cell.row === rows - 1;
}

export function planKingdomRoad(map: ConstructionMap, seed: number): Cell[] | null {
  const center = map.villageCenter;
  if (!center) return null;
  const { columns, rows } = map;
  const start = center.row * columns + center.column;
  const previous = new Int32Array(columns * rows).fill(-1);
  previous[start] = start;
  const queue = [start];
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const cell = { column: current % columns, row: Math.floor(current / columns) };
    if (isMapEdge(cell, columns, rows)) {
      const segments: Cell[] = [];
      for (let step = current; step !== start; step = previous[step]!) {
        segments.push({ column: step % columns, row: Math.floor(step / columns) });
      }
      return segments.length > 0 && segments.length <= Math.ceil(Math.min(columns, rows) * 0.75) ? segments : null;
    }
    for (let direction = 0; direction < directions.length; direction++) {
      const [dx, dy] = directions[(direction + seed % directions.length) % directions.length]!;
      const next = { column: cell.column + dx, row: cell.row + dy };
      const tile = map.terrain.at(next);
      if (!tile || isProtectedGround(tile.ground) || map.getConstruction(next)) continue;
      const index = next.row * columns + next.column;
      if (previous[index] !== -1) continue;
      previous[index] = current;
      queue.push(index);
    }
  }
  return null;
}
