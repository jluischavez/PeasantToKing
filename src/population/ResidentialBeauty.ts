import type { Cell } from '../map/CellSelection';
import type { ConstructionMap } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';

export const beautyRules = {
  base: 15,
  maximum: 100,
  decoration: {
    garden: { range: 3, bonus: 25, name: 'Jardín' },
    park: { range: 6, bonus: 35, name: 'Parque' },
    plaza: { range: 5, bonus: 40, name: 'Plaza con fuente' },
  },
  road: { range: 2, bonus: { 2: 5, 3: 10 }, name: 'Camino mejorado' },
} as const;

type Decoration = keyof typeof beautyRules.decoration;
export type BeautySource = Decoration | 'road';
export const beautySourceName = (source: BeautySource) =>
  source === 'road' ? beautyRules.road.name : beautyRules.decoration[source].name;
export type Beauty = Readonly<{ score: number; sources: Readonly<Partial<Record<BeautySource, number>>> }>;
const baseline: Beauty = { score: beautyRules.base, sources: {} };
const key = ({ column, row }: Cell) => column + ',' + row;

export class ResidentialBeauty {
  private readonly homes = new Map<string, Beauty>();

  at(cell: Cell): Beauty { return this.homes.get(key(cell)) ?? baseline; }

  average(homes: readonly { cell: Cell; residents: number }[]): number | undefined {
    const occupied = homes.filter(home => home.residents > 0);
    return occupied.length ? occupied.reduce((sum, home) => sum + this.at(home.cell).score, 0) / occupied.length : undefined;
  }

  recalculate(map: ConstructionMap, roads: RoadConnections): void {
    this.homes.clear();
    for (const { cell, type } of map.occupiedCells()) {
      if (type !== 'garden' && type !== 'park' && type !== 'plaza' && type !== 'road') continue;
      const level = type === 'road' ? map.roadLevelAt(cell) : undefined;
      const source = type !== 'road' ? beautyRules.decoration[type] : level === 2 || level === 3
        ? { range: beautyRules.road.range, bonus: beautyRules.road.bonus[level] } : null;
      if (!source) continue;
      if (!roads.isConnected(cell)) continue;
      const { width, height } = map.constructionAt(cell)!;
      const { range, bonus } = source;
      const right = cell.column + width - 1;
      const bottom = cell.row + height - 1;
      for (let row = Math.max(0, cell.row - range); row <= Math.min(map.rows - 1, bottom + range); row++) {
        for (let column = Math.max(0, cell.column - range); column <= Math.min(map.columns - 1, right + range); column++) {
          const distance = Math.max(cell.column - column, column - right, 0) + Math.max(cell.row - row, row - bottom, 0);
          const home = { column, row };
          if (distance > range || map.getConstruction(home) !== 'house' || !roads.isConnected(home)) continue;
          const old = this.at(home);
          const points = type === 'road' ? bonus : Math.round(bonus * (range - distance + 1) / range);
          if (points <= (old.sources[type] ?? 0)) continue;
          const sources = { ...old.sources, [type]: points };
          const score = Math.min(beautyRules.maximum, beautyRules.base + Object.values(sources).reduce((a, b) => a + b, 0));
          this.homes.set(key(home), { score, sources });
        }
      }
    }
  }
}
