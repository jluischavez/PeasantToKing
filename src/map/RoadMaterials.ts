import type { ConstructionCost } from './ConstructionCosts';

export type RoadLevel = 1 | 2 | 3;
export type UpgradedRoadLevel = Exclude<RoadLevel, 1>;
export const roadMaterials = { 1: 'Tierra', 2: 'Grava', 3: 'Piedra' } as const;
export const roadUpgradeCosts: Readonly<Record<UpgradedRoadLevel, ConstructionCost>> = {
  2: { gold: 6, wood: 2 },
  3: { gold: 15, wood: 4 },
};
