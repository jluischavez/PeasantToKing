export const worldRules = { columns: 100, rows: 100, terrain: 'grass-v1' } as const;
export const legacyWorldSize = 20;

export type World = Readonly<{ columns: number; rows: number; terrain: typeof worldRules.terrain; seed: number }>;

export function startingCell(world: World) {
  return { column: Math.floor(world.columns / 2), row: Math.floor(world.rows / 2) };
}

export function newWorld(): World {
  return { ...worldRules, seed: Math.floor(Math.random() * 2 ** 32) };
}

