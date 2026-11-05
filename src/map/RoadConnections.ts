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

  isConnected(cell: Cell): boolean {
    return this.connected.has(key(cell));
  }

  recalculate(map: ConstructionMap): void {
    this.connected.clear();
    const center = map.villageCenter;
    if (!center) return;

    // BFS: only roads can extend the network originating at the center.
    const queue: Cell[] = [center];
    this.connected.add(key(center));
    for (let index = 0; index < queue.length; index++) {
      for (const neighbor of neighbors(queue[index]!)) {
        if (map.getConstruction(neighbor) === 'road' && !this.isConnected(neighbor)) {
          this.connected.add(key(neighbor));
          queue.push(neighbor);
        }
      }
    }

    // Buildings can access a reachable road, but cannot relay its connection.
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const cell = { column, row };
        const type = map.getConstruction(cell);
        if (type && type !== 'road' && type !== 'villageCenter'
          && neighbors(cell).some(neighbor =>
            map.getConstruction(neighbor) === 'road' && this.isConnected(neighbor))) {
          this.connected.add(key(cell));
        }
      }
    }
  }
}
