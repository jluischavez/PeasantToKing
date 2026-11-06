import type Phaser from 'phaser';
import type { Cell } from './CellSelection';
import { cellSize } from './MapCamera';
import type { Ground, TerrainMap, TerrainTile } from './Terrain';

export type TerrainRegion = { left: number; top: number; right: number; bottom: number };
const chunkSize = 16;
const groundColor: Record<Ground, string> = {
  grass: '#527b43', meadow: '#78954b', river: '#3e7087', ravine: '#48392f', mountain: '#666b62',
};

function polygon(ctx: CanvasRenderingContext2D, color: string, points: readonly number[]): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0]!, points[1]!);
  for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index]!, points[index + 1]!);
  ctx.closePath();
  ctx.fill();
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, bright: boolean): void {
  ctx.fillStyle = '#523b26';
  ctx.fillRect(x - size * 0.08, y - size * 0.25, size * 0.16, size * 0.25);
  polygon(ctx, '#254c35', [x, y - size, x + size * 0.44, y - size * 0.18, x - size * 0.44, y - size * 0.18]);
  polygon(ctx, bright ? '#568052' : '#3a6945',
    [x, y - size, x, y - size * 0.25, x - size * 0.39, y - size * 0.22]);
}

function drawTile(ctx: CanvasRenderingContext2D, { ground, obstacle }: TerrainTile, column: number, row: number): void {
  ctx.fillStyle = groundColor[ground];
  ctx.fillRect(0, 0, cellSize, cellSize);
  const accent = ((column * 13 + row * 7) % 9) < 4;
  switch (ground) {
    case 'river':
      ctx.fillStyle = accent ? '#6c9eaa' : '#54869a';
      ctx.fillRect(3, 7, 7, 1);
      ctx.fillRect(12, 15, 9, 1);
      break;
    case 'ravine':
      polygon(ctx, '#6f5140', [0, 4, 7, 1, 15, 6, 24, 3, 24, 9, 15, 12, 6, 7, 0, 10]);
      polygon(ctx, '#302822', [0, 16, 8, 12, 16, 17, 24, 14, 24, 21, 16, 24, 7, 19, 0, 23]);
      break;
    case 'mountain':
      polygon(ctx, '#a0a298', [1, 21, 10, 3, 14, 8, 17, 5, 23, 22]);
      polygon(ctx, '#4c544e', [10, 3, 13, 16, 17, 5, 23, 22, 12, 21]);
      if (accent) polygon(ctx, '#d1cfb8', [7, 9, 10, 3, 14, 8, 10, 7]);
      break;
    default:
      if (accent) {
        ctx.fillStyle = ground === 'meadow' ? '#a9aa63' : '#628c50';
        ctx.fillRect(4, 15, 1, 3);
        ctx.fillRect(16, 7, 2, 1);
      }
  }

  if (obstacle === 'tree') tree(ctx, 12, 21, 17, true);
  if (obstacle === 'forest') {
    tree(ctx, 8, 15, 12, false);
    tree(ctx, 17, 17, 13, accent);
    tree(ctx, 10, 22, 14, true);
  }
  if (obstacle === 'rock') {
    polygon(ctx, '#5d5b51', [3, 16, 6, 10, 13, 9, 17, 15, 15, 20, 6, 21]);
    polygon(ctx, '#aaa596', [3, 16, 6, 10, 13, 9, 17, 15, 10, 15]);
    polygon(ctx, '#857f70', [15, 17, 18, 12, 22, 14, 23, 19, 19, 21]);
  }

  ctx.fillStyle = ground === 'river' ? 'rgba(30, 54, 66, .18)' : 'rgba(25, 36, 23, .28)';
  ctx.fillRect(0, cellSize - 1, cellSize, 1);
  ctx.fillRect(cellSize - 1, 0, 1, cellSize - 1);
}

type Chunk = {
  left: number; top: number; columns: number; rows: number;
  image: Phaser.GameObjects.Image; texture: Phaser.Textures.CanvasTexture;
};

export class TerrainRenderer {
  private readonly chunks = new Map<string, Chunk>();

  constructor(private readonly scene: Phaser.Scene, private readonly terrain: TerrainMap) {}

  show(region: TerrainRegion): void {
    const visible = new Set<string>();
    for (let y = Math.floor(region.top / chunkSize); y < Math.ceil(region.bottom / chunkSize); y++) {
      for (let x = Math.floor(region.left / chunkSize); x < Math.ceil(region.right / chunkSize); x++) {
        const key = this.key(x, y);
        visible.add(key);
        if (this.chunks.has(key)) continue;
        const left = x * chunkSize, top = y * chunkSize;
        const columns = Math.min(chunkSize, this.terrain.columns - left);
        const rows = Math.min(chunkSize, this.terrain.rows - top);
        const texture = this.scene.textures.createCanvas(key, columns * cellSize, rows * cellSize);
        if (!texture) throw new Error('Could not create terrain texture: ' + key);
        const image = this.scene.add.image(left * cellSize, top * cellSize, key).setOrigin(0).setDepth(-1);
        const chunk = { left, top, columns, rows, texture, image };
        this.chunks.set(key, chunk);
        this.draw(chunk);
      }
    }
    for (const key of this.chunks.keys()) {
      if (!visible.has(key)) this.remove(key);
    }
  }

  redraw(cell: Cell): void {
    const chunk = this.chunks.get(this.key(Math.floor(cell.column / chunkSize), Math.floor(cell.row / chunkSize)));
    if (chunk) this.draw(chunk);
  }

  destroy(): void {
    for (const key of this.chunks.keys()) this.remove(key);
  }

  private key(x: number, y: number): string { return 'terrain-chunk:' + x + ',' + y; }

  private remove(key: string): void {
    const chunk = this.chunks.get(key)!;
    chunk.image.destroy();
    this.scene.textures.remove(key);
    this.chunks.delete(key);
  }

  private draw(chunk: Chunk): void {
    const ctx = chunk.texture.context;
    for (let y = 0; y < chunk.rows; y++) {
      for (let x = 0; x < chunk.columns; x++) {
        const column = chunk.left + x, row = chunk.top + y;
        ctx.setTransform(1, 0, 0, 1, x * cellSize, y * cellSize);
        drawTile(ctx, this.terrain.at({ column, row })!, column, row);
      }
    }
    ctx.resetTransform();
    chunk.texture.refresh();
  }
}
