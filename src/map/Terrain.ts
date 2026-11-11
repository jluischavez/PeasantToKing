import type { Cell } from './CellSelection';

export const groundKinds = ['grass', 'meadow', 'river', 'ravine', 'mountain'] as const;
export const obstacleKinds = [null, 'tree', 'forest', 'rock'] as const;
export type Ground = typeof groundKinds[number];
export type Obstacle = NonNullable<typeof obstacleKinds[number]>;
export type TerrainTile = Readonly<{ ground: Ground; obstacle: Obstacle | null }>;

export const groundNames: Record<Ground, string> = {
  grass: 'Pasto', meadow: 'Pradera', river: 'Río', ravine: 'Barranco', mountain: 'Montaña escarpada',
};
export const obstacleNames: Record<Obstacle, string> = {
  tree: 'Árbol individual', forest: 'Bosque denso', rock: 'Rocas superficiales',
};

const stride = obstacleKinds.length;
const tiles = groundKinds.flatMap(ground => obstacleKinds.map(obstacle => ({ ground, obstacle } as const)));
const encodingStart = 'A'.charCodeAt(0);

export function terrainCode(ground: Ground, obstacle: Obstacle | null = null): number {
  return groundKinds.indexOf(ground) * stride + obstacleKinds.indexOf(obstacle);
}

export function isProtectedGround(ground: Ground): boolean {
  return ground !== 'grass' && ground !== 'meadow';
}

export class TerrainMap {
  revision = 0;
  constructor(readonly columns: number, readonly rows: number, private readonly codes = new Uint8Array(columns * rows)) {}

  private index(cell: Cell): number {
    const { column, row } = cell;
    return Number.isInteger(column) && Number.isInteger(row)
      && column >= 0 && column < this.columns && row >= 0 && row < this.rows ? row * this.columns + column : -1;
  }

  at(cell: Cell): TerrainTile | undefined {
    return tiles[this.codes[this.index(cell)]!];
  }

  canBuild(cell: Cell): boolean {
    const code = this.codes[this.index(cell)];
    return code === 0 || code === stride;
  }

  clear(cell: Cell, expected: Obstacle): boolean {
    const tile = this.at(cell);
    if (!tile || tile.obstacle !== expected || isProtectedGround(tile.ground)) return false;
    this.codes[this.index(cell)] = terrainCode(tile.ground);
    this.revision++;
    return true;
  }

  plantTree(cell: Cell): boolean {
    if (!this.canBuild(cell)) return false;
    this.codes[this.index(cell)] = terrainCode(this.at(cell)!.ground, 'tree');
    this.revision++;
    return true;
  }

  save(): string {
    return Array.from(this.codes, code => String.fromCharCode(encodingStart + code)).join('');
  }

  expanded(columns: number, rows: number): TerrainMap {
    const codes = new Uint8Array(columns * rows);
    for (let row = 0; row < this.rows; row++) {
      codes.set(this.codes.subarray(row * this.columns, (row + 1) * this.columns), row * columns);
    }
    return new TerrainMap(columns, rows, codes);
  }

  static restore(columns: number, rows: number, data: unknown): TerrainMap {
    if (typeof data !== 'string' || data.length !== columns * rows) throw new Error('Terreno inválido.');
    const codes = new Uint8Array(data.length);
    for (let index = 0; index < codes.length; index++) {
      const code = data.charCodeAt(index) - encodingStart;
      const tile = tiles[code];
      if (!tile || (tile.obstacle && isProtectedGround(tile.ground))) throw new Error('Terreno inválido.');
      codes[index] = code;
    }
    return new TerrainMap(columns, rows, codes);
  }
}
