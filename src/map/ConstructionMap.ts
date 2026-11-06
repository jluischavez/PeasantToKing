import type { Cell } from './CellSelection';
import { TerrainMap } from './Terrain.ts';
import { bridgeCells } from './Bridge.ts';
import type { BridgeSpan } from './Bridge';
import { isMapEdge, kingdomEntryId, kingdomRoadId } from './KingdomRoad.ts';
import type { KingdomRoad } from './KingdomRoad';

export const constructionNames = {
  // Stable map identifier: a residential plot, occupied only after immigration.
  house: 'Zona residencial',
  road: 'Camino',
  bridge: 'Puente de madera',
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
  private readonly bridges = new Map<number, BridgeSpan>();
  private readonly royalSegments = new Set<number>();
  private royalRoad: KingdomRoad | null = null;
  private orderedCells: readonly Readonly<{ cell: Readonly<Cell>; type: ConstructionType }>[] | null = null;
  private center: Cell | null = null;
  readonly columns: number;
  readonly rows: number;

  constructor(columns: number, rows: number, readonly terrain = new TerrainMap(columns, rows)) {
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

  get kingdomRoad(): KingdomRoad | null { return this.royalRoad; }

  private index(cell: Cell): number { return cell.row * this.columns + cell.column; }

  isKingdomRoad(cell: Cell): boolean {
    return this.contains(cell) && this.royalSegments.has(this.index(cell));
  }

  protectKingdomRoad(segments: readonly Cell[]): boolean {
    if (this.royalRoad || !this.center || segments.length === 0) return false;
    const entry = segments[0]!;
    if (!this.contains(entry) || !isMapEdge(entry, this.columns, this.rows)) return false;
    const indices = new Set<number>();
    for (const [index, cell] of segments.entries()) {
      const next = segments[index + 1] ?? this.center;
      if (this.getConstruction(cell) !== 'road' || indices.has(this.index(cell))
        || Math.abs(cell.column - next.column) + Math.abs(cell.row - next.row) !== 1) return false;
      indices.add(this.index(cell));
    }
    for (const index of indices) this.royalSegments.add(index);
    this.royalRoad = { id: kingdomRoadId, entry: { id: kingdomEntryId, roadId: kingdomRoadId, cell: { ...entry } },
      segments: segments.map(cell => ({ ...cell })) };
    return true;
  }

  bridgeAt(cell: Cell): BridgeSpan | undefined {
    return this.contains(cell) ? this.bridges.get(this.index(cell)) : undefined;
  }

  bridgeSpans(): readonly BridgeSpan[] { return [...new Set(this.bridges.values())]; }

  // Only the ends of a bridge tile can touch the next tile in a route.
  roadTouches(road: Cell, neighbor: Cell): boolean {
    if (Math.abs(road.column - neighbor.column) + Math.abs(road.row - neighbor.row) !== 1) return false;
    const bridge = this.bridgeAt(road);
    if (bridge) return bridge.from.row === bridge.to.row ? road.row === neighbor.row : road.column === neighbor.column;
    return this.getConstruction(road) === 'road';
  }

  placeBridge(span: BridgeSpan): boolean {
    if (!this.contains(span.from) || !this.contains(span.to)
      || !this.terrain.canBuild(span.from) || !this.terrain.canBuild(span.to)) return false;
    const cells = bridgeCells(span);
    if (!cells.length || cells.some(cell => this.terrain.at(cell)?.ground !== 'river' || this.getConstruction(cell))) return false;
    const bridge = { from: { ...span.from }, to: { ...span.to } };
    for (const cell of cells) {
      this.occupy(cell, 'bridge');
      this.bridges.set(this.index(cell), bridge);
    }
    return true;
  }

  canPlace(cell: Cell, type?: ConstructionType): boolean {
    return type !== 'bridge' && this.contains(cell) && this.terrain.canBuild(cell) && this.getConstruction(cell) === null
      && (type !== 'villageCenter' || this.center === null);
  }

  remove(cell: Cell): boolean {
    const type = this.getConstruction(cell);
    if (!type || this.isProtectedConstruction(cell)) return false;
    const bridge = this.bridgeAt(cell);
    for (const segment of bridge ? bridgeCells(bridge) : [cell]) this.removeCell(segment);
    return true;
  }

  private removeCell(cell: Cell): void {
    const index = this.index(cell);
    this.cells[index] = null;
    this.occupied.delete(index);
    this.bridges.delete(index);
    this.orderedCells = null;
  }

  isProtectedConstruction(cell: Cell): boolean {
    return this.getConstruction(cell) === 'villageCenter' || this.isKingdomRoad(cell);
  }

  place(cell: Cell, type: ConstructionType): boolean {
    if (!this.canPlace(cell, type)) return false;
    this.occupy(cell, type);
    if (type === 'villageCenter') this.center = { column: cell.column, row: cell.row };
    return true;
  }

  private occupy(cell: Cell, type: ConstructionType): void {
    const index = this.index(cell);
    this.cells[index] = type;
    this.occupied.add(index);
    this.orderedCells = null;
  }
}
