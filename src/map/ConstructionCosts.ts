import type { ConstructionType } from './ConstructionMap';
import type { Obstacle } from './Terrain';

export type ConstructionCost = Readonly<{ gold: number; wood: number }>;

export const constructionCosts: Readonly<Record<ConstructionType, ConstructionCost>> = {
  house: { gold: 5, wood: 0 },
  road: { gold: 2, wood: 0 },
  farm: { gold: 20, wood: 10 },
  lumberjack: { gold: 25, wood: 5 },
  warehouse: { gold: 35, wood: 15 },
  market: { gold: 40, wood: 20 },
  well: { gold: 20, wood: 10 },
  villageCenter: { gold: 0, wood: 0 },
};

export const demolitionCost: ConstructionCost = { gold: 5, wood: 0 };

export const clearingCosts: Readonly<Record<Obstacle, ConstructionCost>> = {
  tree: { gold: 3, wood: 0 },
  forest: { gold: 8, wood: 0 },
  rock: { gold: 6, wood: 0 },
};
