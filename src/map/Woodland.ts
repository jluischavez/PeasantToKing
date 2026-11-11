import type { Cell } from './CellSelection';
import type { ConstructionMap, Dimensions } from './ConstructionMap';
import type { TerrainMap } from './Terrain';
import { footprintRange } from './FootprintRange';

export const woodlandRules = { harvestRange: 6 } as const;
export const missingWoodlandReason = 'Sin árboles ni bosque a ' + woodlandRules.harvestRange + ' casillas del borde del campamento.';

export function isWoodland(terrain: TerrainMap, cell: Cell): boolean {
  const obstacle = terrain.at(cell)?.obstacle;
  return obstacle === 'tree' || obstacle === 'forest';
}

export function harvestArea(terrain: TerrainMap, cell: Cell, dimensions: Dimensions): Iterable<Cell> {
  return footprintRange(terrain, cell, dimensions, woodlandRules.harvestRange);
}

export function hasHarvestableWoodland(terrain: TerrainMap, cell: Cell, dimensions: Dimensions): boolean {
  for (const tile of harvestArea(terrain, cell, dimensions)) {
    if (isWoodland(terrain, tile)) return true;
  }
  return false;
}

export function ensureStarterWoodland(map: ConstructionMap, center: Cell, distance: number): void {
  // Leave the sheltered construction area clear and give both sides of town a nearby source.
  for (const direction of [-1, 1]) {
    const column = center.column + direction * distance;
    for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
      const cell = { column, row: center.row + offset };
      if (isWoodland(map.terrain, cell) || (!map.getConstruction(cell) && map.terrain.plantTree(cell))) break;
    }
  }
}

export function restoreLegacyWoodland(map: ConstructionMap, start: Cell): void {
  ensureStarterWoodland(map, map.villageCenter ?? start, woodlandRules.harvestRange);
  for (const { cell, type } of map.occupiedCells()) {
    if (type !== 'lumberjack') continue;
    const dimensions = map.constructionAt(cell)!;
    if (hasHarvestableWoodland(map.terrain, cell, dimensions)) continue;
    for (const tile of harvestArea(map.terrain, cell, dimensions)) {
      if (!map.getConstruction(tile) && map.terrain.plantTree(tile)) break;
    }
  }
}
