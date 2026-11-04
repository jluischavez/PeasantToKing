import type { Cell } from './CellSelection';

export const constructionNames = {
  house: 'Casa',
  road: 'Camino',
  farm: 'Granja',
  lumberjack: 'Leñador',
  warehouse: 'Almacén',
  market: 'Mercado',
} as const;

export type ConstructionType = keyof typeof constructionNames;

export function isConstructionType(value: string | undefined): value is ConstructionType {
  return value !== undefined && Object.prototype.hasOwnProperty.call(constructionNames, value);
}

export class ConstructionMap {
  private readonly cells: (ConstructionType | null)[];
  readonly columns: number;
  readonly rows: number;

  constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
    this.cells = Array(columns * rows).fill(null);
  }

  private contains(cell: Cell): boolean {
    return Number.isInteger(cell.column) && Number.isInteger(cell.row)
      && cell.column >= 0 && cell.column < this.columns
      && cell.row >= 0 && cell.row < this.rows;
  }

  getConstruction(cell: Cell): ConstructionType | null {
    return this.contains(cell) ? this.cells[cell.row * this.columns + cell.column]! : null;
  }

  canPlace(cell: Cell): boolean {
    return this.contains(cell) && this.getConstruction(cell) === null;
  }

  place(cell: Cell, type: ConstructionType): boolean {
    if (!this.canPlace(cell)) return false;
    this.cells[cell.row * this.columns + cell.column] = type;
    return true;
  }
}
