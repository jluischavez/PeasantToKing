import type { Cell } from './CellSelection';
import type { Dimensions } from './ConstructionMap';

export function distanceFromFootprint(source: Cell, size: Dimensions, target: Cell): number {
  return Math.max(source.column - target.column, target.column - (source.column + size.width - 1), 0)
    + Math.max(source.row - target.row, target.row - (source.row + size.height - 1), 0);
}

export function* footprintRange(bounds: { columns: number; rows: number }, source: Cell, size: Dimensions, range: number): Iterable<Cell> {
  for (let row = Math.max(0, source.row - range); row <= Math.min(bounds.rows - 1, source.row + size.height - 1 + range); row++) {
    for (let column = Math.max(0, source.column - range); column <= Math.min(bounds.columns - 1, source.column + size.width - 1 + range); column++) {
      const cell = { column, row };
      if (distanceFromFootprint(source, size, cell) <= range) yield cell;
    }
  }
}
