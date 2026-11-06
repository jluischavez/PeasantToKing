export const worldRules = { columns: 100, rows: 100, terrain: 'grass-v1' } as const;
export const legacyWorldSize = 20;
export const legacyProceduralTerrain = 'procedural-v1' as const;
export const proceduralTerrain = 'procedural-v2' as const;
export const maxSeed = 2 ** 32 - 1;

export type World = Readonly<{
  columns: number; rows: number;
  terrain: typeof worldRules.terrain | typeof legacyProceduralTerrain | typeof proceduralTerrain; seed: number;
}>;

export function startingCell(world: World) {
  return { column: Math.floor(world.columns / 2), row: Math.floor(world.rows / 2) };
}

export function newWorld(seed = randomSeed(), terrain: World['terrain'] = worldRules.terrain): World {
  return { ...worldRules, seed, terrain };
}

export function randomSeed(previous?: number): number {
  const seed = Math.floor(Math.random() * (maxSeed + 1));
  return seed === previous ? (seed + 1) >>> 0 : seed;
}

