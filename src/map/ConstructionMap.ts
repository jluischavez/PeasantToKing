import type { Cell } from './CellSelection';
import { TerrainMap } from './Terrain.ts';
import { bridgeCells } from './Bridge.ts';
import type { BridgeSpan } from './Bridge';
import { isMapEdge, kingdomEntryId, kingdomRoadId } from './KingdomRoad.ts';
import type { KingdomRoad } from './KingdomRoad';
import type { RoadLevel, UpgradedRoadLevel } from './RoadMaterials';

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
  garden: 'Jardín',
  park: 'Parque',
  plaza: 'Plaza con fuente',
} as const;

export type ConstructionType = keyof typeof constructionNames;
export type Dimensions = Readonly<{ width: number; height: number }>;
export type Construction = Readonly<{ id: string; cell: Cell; type: ConstructionType } & Dimensions>;
export const singleTile: Dimensions = { width: 1, height: 1 };
export const constructionDimensions: Readonly<Record<ConstructionType, Dimensions>> = {
  house: singleTile, road: singleTile, bridge: singleTile, well: singleTile, villageCenter: singleTile,
  farm: { width: 3, height: 3 },
  lumberjack: { width: 2, height: 2 }, warehouse: { width: 2, height: 2 }, market: { width: 2, height: 2 },
  garden: singleTile, park: { width: 3, height: 3 }, plaza: { width: 2, height: 2 },
};

export function* footprint(cell: Cell, { width, height }: Dimensions): Iterable<Cell> {
  for (let row = cell.row; row < cell.row + height; row++) {
    for (let column = cell.column; column < cell.column + width; column++) yield { column, row };
  }
}

export function isConstructionType(value: string | undefined): value is ConstructionType {
  return value !== undefined && Object.prototype.hasOwnProperty.call(constructionNames, value);
}

export class ConstructionMap {
  private readonly cells: (Construction | null)[];
  private readonly occupied = new Set<number>();
  private readonly bridges = new Map<number, BridgeSpan>();
  private readonly royalSegments = new Set<number>();
  private readonly roadLevels = new Map<number, UpgradedRoadLevel>();
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

  saveCells(): readonly (ConstructionType | null)[] {
    return this.cells.map((building, index) => building && this.index(building.cell) === index ? building.type : null);
  }

  saveFootprints() {
    return this.occupiedCells().flatMap(({ cell }) => {
      const { width, height } = this.constructionAt(cell)!;
      return width > 1 || height > 1 ? [{ cell, width, height }] : [];
    });
  }

  saveRoadLevels() {
    return [...this.roadLevels].sort(([first], [second]) => first - second)
      .map(([index, level]) => ({ cell: { column: index % this.columns, row: Math.floor(index / this.columns) }, level }));
  }

  // Retain row-major order for allocation, workforce and save compatibility.
  occupiedCells() {
    this.orderedCells ??= [...this.occupied].sort((first, second) => first - second).map(index => ({
      cell: { column: index % this.columns, row: Math.floor(index / this.columns) },
      type: this.cells[index]!.type,
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
    return this.constructionAt(cell)?.type ?? null;
  }

  constructionAt(cell: Cell): Construction | null {
    return this.contains(cell) ? this.cells[this.index(cell)]! : null;
  }

  *borderRoads(cell: Cell): Iterable<Cell> {
    const size = this.constructionAt(cell) ?? singleTile;
    const { column, row } = this.constructionAt(cell)?.cell ?? cell;
    const right = column + size.width - 1, bottom = row + size.height - 1;
    for (let x = column; x <= right; x++) {
      const north = { column: x, row: row - 1 }, south = { column: x, row: bottom + 1 };
      if (this.roadTouches(north, { column: x, row })) yield north;
      if (this.roadTouches(south, { column: x, row: bottom })) yield south;
    }
    for (let y = row; y <= bottom; y++) {
      const west = { column: column - 1, row: y }, east = { column: right + 1, row: y };
      if (this.roadTouches(west, { column, row: y })) yield west;
      if (this.roadTouches(east, { column: right, row: y })) yield east;
    }
  }

  get villageCenter(): Cell | null {
    return this.center;
  }

  get kingdomRoad(): KingdomRoad | null { return this.royalRoad; }

  private index(cell: Cell): number { return cell.row * this.columns + cell.column; }

  isKingdomRoad(cell: Cell): boolean {
    return this.contains(cell) && this.royalSegments.has(this.index(cell));
  }

  roadLevelAt(cell: Cell): RoadLevel | undefined {
    return this.getConstruction(cell) === 'road' && !this.isKingdomRoad(cell)
      ? this.roadLevels.get(this.index(cell)) ?? 1 : undefined;
  }

  upgradeRoad(cell: Cell, level: UpgradedRoadLevel): boolean {
    if (this.roadLevelAt(cell) !== level - 1) return false;
    this.roadLevels.set(this.index(cell), level);
    return true;
  }

  protectKingdomRoad(segments: readonly Cell[]): boolean {
    if (this.royalRoad || !this.center || segments.length === 0) return false;
    const entry = segments[0]!;
    if (!this.contains(entry) || !isMapEdge(entry, this.columns, this.rows)) return false;
    const indices = new Set<number>();
    for (const [index, cell] of segments.entries()) {
      const next = segments[index + 1] ?? this.center;
      if (this.roadLevelAt(cell) !== 1 || indices.has(this.index(cell))
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

  canPlace(cell: Cell, type?: ConstructionType, size = singleTile): boolean {
    if (type === 'bridge' || (type === 'villageCenter' && this.center)
      || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1
      || !this.contains(cell)
      || !this.contains({ column: cell.column + size.width - 1, row: cell.row + size.height - 1 })) return false;
    for (const tile of footprint(cell, size)) {
      if (!this.terrain.canBuild(tile) || this.getConstruction(tile)) return false;
    }
    return true;
  }

  remove(cell: Cell): boolean {
    const building = this.constructionAt(cell);
    if (!building || this.isProtectedConstruction(cell)) return false;
    const bridge = this.bridgeAt(cell);
    for (const segment of bridge ? bridgeCells(bridge) : footprint(building.cell, building)) this.removeCell(segment);
    return true;
  }

  private removeCell(cell: Cell): void {
    const index = this.index(cell);
    this.cells[index] = null;
    this.occupied.delete(index);
    this.bridges.delete(index);
    this.roadLevels.delete(index);
    this.orderedCells = null;
  }

  isProtectedConstruction(cell: Cell): boolean {
    return this.getConstruction(cell) === 'villageCenter' || this.isKingdomRoad(cell);
  }

  place(cell: Cell, type: ConstructionType, size = singleTile): boolean {
    if (!this.canPlace(cell, type, size)) return false;
    this.occupy(cell, type, size);
    if (type === 'villageCenter') this.center = { column: cell.column, row: cell.row };
    return true;
  }

  private occupy(cell: Cell, type: ConstructionType, { width, height } = singleTile): void {
    const building = { id: type + ':' + cell.column + ',' + cell.row, cell: { ...cell }, type, width, height };
    for (const tile of footprint(cell, building)) this.cells[this.index(tile)] = building;
    this.occupied.add(this.index(cell));
    this.orderedCells = null;
  }
}
