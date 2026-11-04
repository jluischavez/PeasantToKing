export interface Cell {
  readonly column: number;
  readonly row: number;
}

export class CellSelection {
  private current: Cell | null = null;

  get selected(): Cell | null {
    return this.current;
  }

  select(cell: Cell): void {
    this.current = { column: cell.column, row: cell.row };
  }

  clear(): void {
    this.current = null;
  }
}
