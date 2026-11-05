import type { Cell } from './CellSelection';

export const constructionNames = {
  // Stable map identifier: a residential plot, occupied only after immigration.
  house: 'Zona residencial',
  road: 'Camino',
  farm: 'Granja',
  lumberjack: 'Campamento maderero',
  warehouse: 'Almacén',
  market: 'Mercado',
  well: 'Pozo',
  villageCenter: 'Centro de Aldea',
} as const;

export type ConstructionType = keyof typeof constructionNames;

export function isConstructionType(value: string | undefined): value is ConstructionType {
  return value !== undefined && Object.prototype.hasOwnProperty.call(constructionNames, value);
}

export class ConstructionMap {
  private readonly cells: (ConstructionType | null)[];
  private readonly occupied = new Set<number>();
  private orderedCells: readonly Readonly<{ cell: Readonly<Cell>; type: ConstructionType }>[] | null = null;
  private center: Cell | null = null;
  readonly columns: number;
  readonly rows: number;

  constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
    this.cells = Array(columns * rows).fill(null);
  }

  saveCells(): readonly (ConstructionType | null)[] { return [...this.cells]; }

  // Retain row-major order for allocation, workforce and save compatibility.
  occupiedCells() {
    this.orderedCells ??= [...this.occupied].sort((first, second) => first - second).map(index => ({
      cell: { column: index % this.columns, row: Math.floor(index / this.columns) },
      type: this.cells[index]!,
    }));
    return this.orderedCells;
  }

  cellAtKey(key: string): Cell | undefined {
    if (typeof key !== 'string' || !/^\d+,\d+$/.test(key)) return undefined;
    const [column, row] = key.split(',').map(Number);
    const cell = { column: column!, row: row! };
    return key === cell.column + ',' + cell.row && this.contains(cell) ? cell : undefined;
  }

  contains(cell: Cell): boolean {
    return Number.isInteger(cell.column) && Number.isInteger(cell.row)
      && cell.column >= 0 && cell.column < this.columns
      && cell.row >= 0 && cell.row < this.rows;
  }

  getConstruction(cell: Cell): ConstructionType | null {
    return this.contains(cell) ? this.cells[cell.row * this.columns + cell.column]! : null;
  }

  get villageCenter(): Cell | null {
    return this.center;
  }

  canPlace(cell: Cell, type?: ConstructionType): boolean {
    return this.contains(cell) && this.getConstruction(cell) === null
      && (type !== 'villageCenter' || this.center === null);
  }

  remove(cell: Cell): boolean {
    const type = this.getConstruction(cell);
    if (!type || type === 'villageCenter') return false;
    const index = cell.row * this.columns + cell.column;
    this.cells[index] = null;
    this.occupied.delete(index);
    this.orderedCells = null;
    return true;
  }

  place(cell: Cell, type: ConstructionType): boolean {
    if (!this.canPlace(cell, type)) return false;
    const index = cell.row * this.columns + cell.column;
    this.cells[index] = type;
    this.occupied.add(index);
    this.orderedCells = null;
    if (type === 'villageCenter') this.center = { column: cell.column, row: cell.row };
    return true;
  }
}
