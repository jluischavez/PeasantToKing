import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';

export const resourceNames = {
  gold: 'Oro',
  food: 'Comida',
  wood: 'Madera',
} as const;

export type Resource = keyof typeof resourceNames;
export type Resources = Record<Resource, number>;

// Base production only. Future building rules can extend this configuration
// without coupling workers, consumption or storage to the map renderer.
const productionByType: Record<ConstructionType, Readonly<Resources>> = {
  house: { gold: 0, food: 0, wood: 0 },
  road: { gold: 0, food: 0, wood: 0 },
  farm: { gold: 0, food: 2, wood: 0 },
  lumberjack: { gold: 0, food: 0, wood: 2 },
  warehouse: { gold: 0, food: 0, wood: 0 },
  market: { gold: 1, food: 0, wood: 0 },
  villageCenter: { gold: 0, food: 0, wood: 0 },
};

export class Economy {
  private readonly stock: Resources = { gold: 0, food: 0, wood: 0 };
  private production: Resources = { gold: 0, food: 0, wood: 0 };
  private elapsedMs = 0;

  get resources(): Readonly<Resources> {
    return this.stock;
  }

  get perSecond(): Readonly<Resources> {
    return this.production;
  }

  // Call after the road network has been recalculated.
  recalculate(map: ConstructionMap, connections: RoadConnections): void {
    const total: Resources = { gold: 0, food: 0, wood: 0 };
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const cell = { column, row };
        const type = map.getConstruction(cell);
        if (!type || !connections.isConnected(cell)) continue;
        const output = productionByType[type];
        total.gold += output.gold;
        total.food += output.food;
        total.wood += output.wood;
      }
    }
    this.production = total;
  }

  // One shared simulation clock: no timers per building.
  advance(deltaMs: number): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    this.elapsedMs += deltaMs;
    const seconds = Math.floor(this.elapsedMs / 1000);
    if (seconds === 0) return false;
    this.elapsedMs -= seconds * 1000;
    this.stock.gold += this.production.gold * seconds;
    this.stock.food += this.production.food * seconds;
    this.stock.wood += this.production.wood * seconds;
    return true;
  }
}