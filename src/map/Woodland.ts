import type { Cell } from './CellSelection';
import type { ConstructionMap, Dimensions } from './ConstructionMap';
import type { TerrainMap } from './Terrain';

export const woodlandRules = { harvestRange: 6 } as const;
export const missingWoodlandReason = 'Sin árboles ni bosque a ' + woodlandRules.harvestRange + ' casillas del borde del campamento.';

export function isWoodland(terrain: TerrainMap, cell: Cell): boolean {
  const obstacle = terrain.at(cell)?.obstacle;
  return obstacle === 'tree' || obstacle === 'forest';
}

function* harvestArea(terrain: TerrainMap, cell: Cell, { width, height }: Dimensions): Iterable<Cell> {
  const { harvestRange: range } = woodlandRules;
  const right = cell.column + width - 1;
  const bottom = cell.row + height - 1;
  for (let row = Math.max(0, cell.row - range); row <= Math.min(terrain.rows - 1, bottom + range); row++) {
    for (let column = Math.max(0, cell.column - range); column <= Math.min(terrain.columns - 1, right + range); column++) {
      const distance = Math.max(cell.column - column, column - right, 0) + Math.max(cell.row - row, row - bottom, 0);
      if (distance <= range) yield { column, row };
    }
  }
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
