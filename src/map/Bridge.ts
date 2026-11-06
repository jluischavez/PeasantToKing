import type { Cell } from './CellSelection';

export const bridgeRules = { maxSegments: 8 } as const;
export type BridgeSpan = Readonly<{ from: Cell; to: Cell }>;

export function bridgeCells(span: BridgeSpan): Cell[] {
  const dx = span.to.column - span.from.column, dy = span.to.row - span.from.row;
  const distance = Math.abs(dx) + Math.abs(dy);
  if ((dx !== 0 && dy !== 0) || !Number.isInteger(distance) || distance < 2 || distance > bridgeRules.maxSegments + 1) return [];
  return Array.from({ length: distance - 1 }, (_, index) => ({
    column: span.from.column + Math.sign(dx) * (index + 1),
    row: span.from.row + Math.sign(dy) * (index + 1),
  }));
}
