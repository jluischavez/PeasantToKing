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
  private network: string | null = null;
  private map: ConstructionMap | null = null;
  revision = 0;

  isConnected(cell: Cell): boolean {
    return this.connected.has(key(this.map?.constructionAt(cell)?.cell ?? cell));
  }

  // The existing BFS treats the unique center and all reachable road branches
  // as one village network. Isolated roads never receive a network identifier.
  networkFor(cell: Cell): string | null {
    return this.isConnected(cell) ? this.network : null;
  }

  recalculate(map: ConstructionMap): void {
    this.map = map;
    this.revision++;
    this.connected.clear();
    const center = map.villageCenter;
    this.network = center ? key(center) : null;
    if (!center) return;

    // Only roads and aligned bridge decks can extend the network.
    const queue: Cell[] = [center];
    this.connected.add(key(center));
    for (let index = 0; index < queue.length; index++) {
      const cell = queue[index]!;
      for (const neighbor of neighbors(cell)) {
        if (!this.isConnected(neighbor) && map.roadTouches(neighbor, cell)
          && (index === 0 || map.roadTouches(cell, neighbor))) {
          this.connected.add(key(neighbor));
          queue.push(neighbor);
        }
      }
    }

    // Buildings can access a reachable road, but cannot relay its connection.
    for (const { cell, type } of map.occupiedCells()) {
      if (type !== 'road' && type !== 'bridge' && type !== 'villageCenter'
        && [...map.borderRoads(cell)].some(neighbor => this.isConnected(neighbor))) {
        this.connected.add(key(cell));
      }
    }
  }
}
