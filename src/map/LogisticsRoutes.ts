import type { Cell } from './CellSelection';
import type { ConstructionMap } from './ConstructionMap';

const key = (c: Cell) => `${c.column},${c.row}`;
// Multi-source BFS selects the shortest pair of perimeter accesses. Buildings never relay roads.
export class LogisticsRoutes {
  private revision = -1;
  private readonly cache = new Map<string, Cell[] | null>();
  searches = 0;
  constructor(private readonly map: ConstructionMap) {}

  find(source: Cell, destination: Cell, revision: number, fromRoad = false): Cell[] | null {
    if (revision !== this.revision) { this.cache.clear(); this.revision = revision; }
    const id = `${key(source)}>${key(destination)}:${fromRoad}`;
    if (this.cache.has(id)) return this.cache.get(id)!;
    this.searches++;
    const ends = new Set([...this.map.borderRoads(destination)].map(key));
    const queue = fromRoad ? [source] : [...this.map.borderRoads(source)];
    const parents = new Map<string, Cell | null>();
    for (const start of queue) {
      const type = this.map.getConstruction(start);
      if (type === 'road' || type === 'bridge') parents.set(key(start), null);
    }
    let route: Cell[] | null = null;
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (!parents.has(key(current))) continue;
      if (ends.has(key(current))) {
        route = [];
        let cursor: Cell | null = current;
        while (cursor) { route.push(cursor); cursor = parents.get(key(cursor))!; }
        route.reverse();
        break;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { column: current.column + dx, row: current.row + dy };
        if (!parents.has(key(next)) && this.map.roadTouches(current, next) && this.map.roadTouches(next, current)) {
          parents.set(key(next), current); queue.push(next);
        }
      }
    }
    // Bound cache even in very large, repeatedly edited cities.
    if (this.cache.size >= 4096) this.cache.clear();
    this.cache.set(id, route);
    return route;
  }
}
