import type { Cell } from './CellSelection';
import type { ConstructionMap } from './ConstructionMap';

function key(cell: Cell): string {
  return `${cell.column},${cell.row}`;
}

function neighbors(cell: Cell): Cell[] {
  return [
    { column: cell.column - 1, row: cell.row },
    { column: cell.column + 1, row: cell.row },
    { column: cell.column, row: cell.row - 1 },
    { column: cell.column, row: cell.row + 1 },
  ];
}

export class RoadConnections {
  private readonly connected = new Set<string>();
  private readonly exterior = new Set<string>();
  private network: string | null = null;
  private map: ConstructionMap | null = null;
  revision = 0;
  topologyRevision = 0;

  isConnected(cell: Cell): boolean {
    return this.connected.has(key(this.map?.constructionAt(cell)?.cell ?? cell));
  }

  // The existing BFS treats the unique center and all reachable road branches
  // as one village network. Isolated roads never receive a network identifier.
  networkFor(cell: Cell): string | null {
    return this.isConnected(cell) ? this.network : null;
  }

  reachesExterior(cell: Cell): boolean {
    const map = this.map;
    if (!map) return false;
    return this.exterior.has(key(cell)) || [...map.borderRoads(cell)].some(road => this.exterior.has(key(road)));
  }

  recalculate(map: ConstructionMap): void {
    this.map = map;
    this.revision++;
    // Deterministic across reloads: UI/workforce recalculation does not invalidate routes.
    let hash = 2166136261;
    for (const { cell, type } of map.occupiedCells()) {
      const building = map.constructionAt(cell)!;
      const bridge = type === 'bridge' ? map.bridgeAt(cell) : null;
      const token = `${cell.column},${cell.row}:${type}:${building.width},${building.height}:${bridge?.from.row === bridge?.to.row};`;
      for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    }
    this.topologyRevision = hash >>> 0;
    this.connected.clear();
    this.exterior.clear();
    const entry = map.kingdomRoad?.entry.cell;
    if (entry) this.traceRoads(map, entry, this.exterior);
    const center = map.villageCenter;
    this.network = center ? key(center) : null;
    if (!center) return;

    this.traceRoads(map, center, this.connected, true);

    // Buildings can access a reachable road, but cannot relay its connection.
    for (const { cell, type } of map.occupiedCells()) {
      if (type !== 'road' && type !== 'bridge' && type !== 'villageCenter'
        && [...map.borderRoads(cell)].some(neighbor => this.isConnected(neighbor))) {
        this.connected.add(key(cell));
      }
    }
  }

  private traceRoads(map: ConstructionMap, start: Cell, reached: Set<string>, fromCenter = false): void {
    const queue = [start];
    reached.add(key(start));
    for (const [index, cell] of queue.entries()) {
      for (const neighbor of neighbors(cell)) {
        const id = key(neighbor);
        if (!reached.has(id) && map.roadTouches(neighbor, cell)
          && ((fromCenter && index === 0) || map.roadTouches(cell, neighbor))) {
          reached.add(id);
          queue.push(neighbor);
        }
      }
    }
  }
}
