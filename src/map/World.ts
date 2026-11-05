export const worldRules = { columns: 20, rows: 20, terrain: 'grass-v1' } as const;

export type World = Readonly<typeof worldRules & { seed: number }>;

export function newWorld(): World {
  return { ...worldRules, seed: Math.floor(Math.random() * 2 ** 32) };
}

