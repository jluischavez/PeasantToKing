import { TerrainMap, terrainCode } from './Terrain.ts';
import type { Cell } from './CellSelection';
import { startingCell } from './World.ts';
import type { World } from './World';

export const starterRules = { radius: 6, expansionDistance: 14, reachableTiles: 350 } as const;

function sample(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 2 ** 32;
}

function noise(seed: number, x: number, y: number, scale: number): number {
  const left = Math.floor(x / scale), top = Math.floor(y / scale);
  const blend = (fraction: number) => fraction * fraction * (3 - 2 * fraction);
  const fx = blend(x / scale - left), fy = blend(y / scale - top);
  const a = sample(seed, left, top), b = sample(seed, left + 1, top);
  const c = sample(seed, left, top + 1), d = sample(seed, left + 1, top + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function hasPlayableStart(terrain: TerrainMap, start: Cell): boolean {
  const { radius, reachableTiles, expansionDistance } = starterRules;
  for (let row = start.row - radius; row <= start.row + radius; row++) {
    for (let column = start.column - radius; column <= start.column + radius; column++) {
      if (!terrain.canBuild({ column, row })) return false;
    }
  }
  const reached = new Set<number>([start.row * terrain.columns + start.column]);
  const queue = [start];
  let sides = 0;
  for (let index = 0; index < queue.length; index++) {
    const { column, row } = queue[index]!;
    if (column <= start.column - expansionDistance) sides |= 1;
    if (column >= start.column + expansionDistance) sides |= 2;
    if (row <= start.row - expansionDistance) sides |= 4;
    if (row >= start.row + expansionDistance) sides |= 8;
    if (reached.size >= reachableTiles && (sides & (sides - 1)) !== 0) return true;
    for (const neighbor of [{ column: column - 1, row }, { column: column + 1, row },
      { column, row: row - 1 }, { column, row: row + 1 }]) {
      if (!terrain.canBuild(neighbor)) continue;
      const key = neighbor.row * terrain.columns + neighbor.column;
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(neighbor);
    }
  }
  return false;
}

export function generateTerrain(world: World): TerrainMap {
  const { columns, rows, seed } = world;
  const start = startingCell(world);
  const codes = new Uint8Array(columns * rows);
  const put = (column: number, row: number, code: number) => { codes[row * columns + column] = code; };
  const riverSide = sample(seed ^ 43, 0, 0) < 0.5 ? 0.21 : 0.79;
  const ridgeSide = riverSide < 0.5 ? 0.83 : 0.17;
  const ridgeY = rows * (0.22 + sample(seed ^ 907, 0, 0) * 0.56);
  const riverAt = (row: number) => Math.round(columns * (riverSide + 0.1 * (noise(seed ^ 7891, 0, row, 23) - 0.5)
    + 0.045 * (noise(seed ^ 2761, 0, row, 9) - 0.5)));
  let previousRiver = riverAt(0);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const variation = sample(seed ^ 9173, column, row);
      const moisture = 0.72 * noise(seed ^ 515, column, row, 15) + 0.28 * noise(seed ^ 31, column, row, 6);
      const ridge = Math.max(0, 1 - Math.hypot((column - columns * ridgeSide) / 22, (row - ridgeY) / 32));
      const elevation = 0.6 * noise(seed ^ 6089, column, row, 20) + 0.4 * noise(seed ^ 876, column, row, 8);
      const rockiness = elevation * 0.5 + ridge * 0.85;
      const ground = noise(seed ^ 1049, column, row, 18) > 0.5 ? 'meadow' : 'grass';
      const sheltered = Math.max(Math.abs(column - start.column), Math.abs(row - start.row)) <= starterRules.radius;
      if (sheltered) put(column, row, terrainCode(ground));
      else if (rockiness > 0.78) put(column, row, terrainCode('mountain'));
      else if (rockiness > 0.58 && rockiness < 0.68 && noise(seed ^ 51, column, row, 8) > 0.42) {
        put(column, row, terrainCode('ravine'));
      } else if (moisture > 0.61) put(column, row, terrainCode(ground, 'forest'));
      else if (rockiness > 0.42 && variation > 0.8) put(column, row, terrainCode(ground, 'rock'));
      else if (variation > (moisture > 0.5 ? 0.86 : 0.98)) put(column, row, terrainCode(ground, 'tree'));
      else put(column, row, terrainCode(ground));
    }
    const river = riverAt(row);
    const width = noise(seed ^ 314, 0, row, 16) > 0.65 ? 2 : 1;
    const left = Math.max(0, Math.min(previousRiver, river) - width);
    const right = Math.min(columns - 1, Math.max(previousRiver, river) + width);
    for (let column = left; column <= right; column++) put(column, row, terrainCode('river'));
    previousRiver = river;
  }

  const terrain = new TerrainMap(columns, rows, codes);
  if (!hasPlayableStart(terrain, start)) {
    const distance = starterRules.expansionDistance;
    for (let row = start.row - distance; row <= start.row + distance; row++) {
      for (let column = start.column - distance; column <= start.column + distance; column++) {
        if (terrain.at({ column, row })?.ground !== 'river') put(column, row, terrainCode('meadow'));
      }
    }
    if (!hasPlayableStart(terrain, start)) throw new Error('No hay una zona inicial jugable.');
  }
  return terrain;
}
