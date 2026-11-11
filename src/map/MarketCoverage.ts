import type { Cell } from './CellSelection';
import type { ConstructionMap, Dimensions } from './ConstructionMap';
import type { RoadConnections } from './RoadConnections';

const key = (cell: Cell): string => `${cell.column},${cell.row}`;
const neighbors = (cell: Cell): Cell[] => [
  { column: cell.column - 1, row: cell.row }, { column: cell.column + 1, row: cell.row },
  { column: cell.column, row: cell.row - 1 }, { column: cell.column, row: cell.row + 1 },
];

export type RoadCoverage = { homes: ReadonlyMap<string, number>; roads: readonly { cell: Cell; distance: number }[] };

// The same bounded road traversal serves simulation and non-mutating previews.
export function traceRoadCoverage(map: ConstructionMap, connections: RoadConnections, source: Cell, size: Dimensions, range: number): RoadCoverage {
  const homes = new Map<string, number>(), visited = new Set<string>();
  const queue: { cell: Cell; distance: number }[] = [];
  for (const road of map.borderRoads(source, size)) {
    if (connections.isConnected(road)) { visited.add(key(road)); queue.push({ cell: road, distance: 1 }); }
  }
  for (let index = 0; index < queue.length; index++) {
    const { cell, distance } = queue[index]!;
    if (distance > range) continue;
    for (const neighbor of neighbors(cell)) {
      if (!map.roadTouches(cell, neighbor)) continue;
      if (map.getConstruction(neighbor) === 'house' && connections.isConnected(neighbor)) {
        const previous = homes.get(key(neighbor));
        if (previous === undefined || distance < previous) homes.set(key(neighbor), distance);
      }
      if (distance < range && map.roadTouches(neighbor, cell) && !visited.has(key(neighbor))) {
        visited.add(key(neighbor)); queue.push({ cell: neighbor, distance: distance + 1 });
      }
    }
  }
  return { homes, roads: queue.filter(item => item.distance <= range) };
}

export class MarketCoverage {
  private readonly areas = new Map<string, RoadCoverage>();

  recalculate(map: ConstructionMap, connections: RoadConnections, range: number, source: 'market' | 'well' = 'market'): void {
    this.areas.clear();
    for (const { cell: market, type } of map.occupiedCells()) {
      if (type !== source || !connections.isConnected(market)) continue;
      this.areas.set(key(market), traceRoadCoverage(map, connections, market, map.constructionAt(market)!, range));
    }
  }

  distance(market: Cell, home: Cell): number | undefined {
    return this.areas.get(key(market))?.homes.get(key(home));
  }

  coveredHomes(market: Cell): number {
    return this.areas.get(key(market))?.homes.size ?? 0;
  }
  area(source: Cell): RoadCoverage | undefined { return this.areas.get(key(source)); }
}
