import type { Cell } from './CellSelection';
import type { ConstructionMap } from './ConstructionMap';
import type { RoadConnections } from './RoadConnections';

const key = (cell: Cell): string => `${cell.column},${cell.row}`;
const neighbors = (cell: Cell): Cell[] => [
  { column: cell.column - 1, row: cell.row }, { column: cell.column + 1, row: cell.row },
  { column: cell.column, row: cell.row - 1 }, { column: cell.column, row: cell.row + 1 },
];

export class MarketCoverage {
  private readonly distances = new Map<string, Map<string, number>>();

  recalculate(map: ConstructionMap, connections: RoadConnections, range: number, source: 'market' | 'well' = 'market'): void {
    this.distances.clear();
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const market = { column, row };
        if (map.getConstruction(market) !== source || !connections.isConnected(market)) continue;
        const homes = new Map<string, number>();
        const visited = new Set<string>();
        const queue: { cell: Cell; distance: number }[] = [];
        for (const road of neighbors(market)) {
          if (map.getConstruction(road) === 'road' && connections.isConnected(road)) {
            visited.add(key(road));
            queue.push({ cell: road, distance: 1 });
          }
        }
        for (let index = 0; index < queue.length; index++) {
          const { cell, distance } = queue[index]!;
          if (distance > range) continue;
          for (const neighbor of neighbors(cell)) {
            const type = map.getConstruction(neighbor);
            if (type === 'house' && connections.isConnected(neighbor)) {
              const previous = homes.get(key(neighbor));
              if (previous === undefined || distance < previous) homes.set(key(neighbor), distance);
            }
            // Buildings and the center never act as shortcuts through the road graph.
            if (type === 'road' && distance < range && !visited.has(key(neighbor))) {
              visited.add(key(neighbor));
              queue.push({ cell: neighbor, distance: distance + 1 });
            }
          }
        }
        this.distances.set(key(market), homes);
      }
    }
  }

  distance(market: Cell, home: Cell): number | undefined {
    return this.distances.get(key(market))?.get(key(home));
  }

  coveredHomes(market: Cell): number {
    return this.distances.get(key(market))?.size ?? 0;
  }
}
