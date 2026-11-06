import type Phaser from 'phaser';
import type { ConstructionType } from './ConstructionMap';
import { drawBridge, drawRoad } from './RoadAppearance';

type ConstructionDrawer = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  alpha: number,
  roadMask?: number,
) => void;

const constructionDrawers: Record<ConstructionType, ConstructionDrawer> = {
  villageCenter(graphics, x, y, size, alpha) {
    graphics.fillStyle(0xc5c3ad, alpha);
    graphics.fillRect(x + size * 0.18, y + size * 0.4, size * 0.64, size * 0.48);
    graphics.fillStyle(0x687f99, alpha);
    graphics.fillTriangle(x + size * 0.08, y + size * 0.42,
      x + size * 0.5, y + size * 0.16, x + size * 0.92, y + size * 0.42);
    graphics.fillStyle(0x564231, alpha);
    graphics.fillRect(x + size * 0.42, y + size * 0.62, size * 0.16, size * 0.26);
    graphics.fillRect(x + size * 0.48, y + size * 0.05, size * 0.04, size * 0.22);
    graphics.fillStyle(0xe8c75e, alpha);
    graphics.fillTriangle(x + size * 0.52, y + size * 0.05,
      x + size * 0.78, y + size * 0.11, x + size * 0.52, y + size * 0.17);
  },
  house(graphics, x, y, size, alpha) {
    graphics.fillStyle(0x8a7653, alpha);
    graphics.fillRect(x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76);
    graphics.lineStyle(Math.max(1, size * 0.04), 0xd4bd8e, alpha);
    graphics.strokeRect(x + size * 0.16, y + size * 0.16, size * 0.68, size * 0.68);
    // Four short stakes distinguish an empty reserved plot from a road.
    graphics.fillStyle(0x503a29, alpha);
    for (const dx of [0.12, 0.8]) {
      for (const dy of [0.12, 0.8]) {
        graphics.fillRect(x + size * dx, y + size * dy, size * 0.08, size * 0.08);
      }
    }
  },
  road: drawRoad,
  bridge: drawBridge,
  farm(graphics, x, y, size, alpha) {
    graphics.fillStyle(0x795238, alpha);
    graphics.fillRect(x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84);
    graphics.fillStyle(0xe6c75c, alpha);
    for (let row = 0; row < 3; row++) {
      graphics.fillRect(x + size * 0.16, y + size * (0.22 + row * 0.24), size * 0.68, size * 0.09);
    }
    graphics.fillStyle(0x80a54b, alpha);
    for (let column = 0; column < 4; column++) {
      graphics.fillRect(x + size * (0.2 + column * 0.17), y + size * 0.14, size * 0.05, size * 0.7);
    }
  },
  lumberjack(graphics, x, y, size, alpha) {
    graphics.fillStyle(0x68462e, alpha);
    graphics.fillRect(x + size * 0.3, y + size * 0.32, size * 0.12, size * 0.42);
    graphics.fillStyle(0x214d31, alpha);
    graphics.fillTriangle(x + size * 0.08, y + size * 0.52,
      x + size * 0.36, y + size * 0.06, x + size * 0.64, y + size * 0.52);
    graphics.fillStyle(0x37734a, alpha);
    graphics.fillTriangle(x + size * 0.13, y + size * 0.36,
      x + size * 0.36, y + size * 0.05, x + size * 0.59, y + size * 0.36);
    graphics.fillStyle(0x98653b, alpha);
    graphics.fillRect(x + size * 0.45, y + size * 0.58, size * 0.4, size * 0.14);
    graphics.fillRect(x + size * 0.35, y + size * 0.77, size * 0.5, size * 0.14);
    graphics.fillStyle(0xe0b67a, alpha);
    graphics.fillCircle(x + size * 0.85, y + size * 0.65, size * 0.07);
    graphics.fillCircle(x + size * 0.85, y + size * 0.84, size * 0.07);
  },
  warehouse(graphics, x, y, size, alpha) {
    graphics.fillStyle(0xadb0a5, alpha);
    graphics.fillRect(x + size * 0.13, y + size * 0.35, size * 0.74, size * 0.53);
    graphics.fillStyle(0x52616e, alpha);
    graphics.fillTriangle(x + size * 0.06, y + size * 0.36,
      x + size * 0.5, y + size * 0.1, x + size * 0.94, y + size * 0.36);
    graphics.fillStyle(0x654d35, alpha);
    graphics.fillRect(x + size * 0.31, y + size * 0.5, size * 0.38, size * 0.38);
    graphics.fillStyle(0xc3a875, alpha);
    graphics.fillRect(x + size * 0.48, y + size * 0.5, size * 0.04, size * 0.38);
    graphics.fillRect(x + size * 0.31, y + size * 0.65, size * 0.38, size * 0.04);
  },
  well(graphics, x, y, size, alpha) {
    graphics.fillStyle(0xc1b79a, alpha);
    graphics.fillCircle(x + size * 0.5, y + size * 0.56, size * 0.32);
    graphics.fillStyle(0x3e8aa8, alpha);
    graphics.fillCircle(x + size * 0.5, y + size * 0.56, size * 0.22);
    graphics.fillStyle(0x624734, alpha);
    graphics.fillRect(x + size * 0.28, y + size * 0.2, size * 0.06, size * 0.44);
    graphics.fillRect(x + size * 0.66, y + size * 0.2, size * 0.06, size * 0.44);
    graphics.fillRect(x + size * 0.28, y + size * 0.18, size * 0.44, size * 0.08);
  },
  market(graphics, x, y, size, alpha) {
    graphics.fillStyle(0x65472f, alpha);
    graphics.fillRect(x + size * 0.15, y + size * 0.3, size * 0.06, size * 0.58);
    graphics.fillRect(x + size * 0.79, y + size * 0.3, size * 0.06, size * 0.58);
    for (let stripe = 0; stripe < 4; stripe++) {
      graphics.fillStyle(stripe % 2 === 0 ? 0xb7473b : 0xf0ddb0, alpha);
      graphics.fillRect(x + size * (0.08 + stripe * 0.21), y + size * 0.16, size * 0.21, size * 0.28);
    }
    graphics.fillStyle(0xb18650, alpha);
    graphics.fillRect(x + size * 0.13, y + size * 0.65, size * 0.74, size * 0.23);
    graphics.fillStyle(0xe8c75e, alpha);
    graphics.fillCircle(x + size * 0.35, y + size * 0.6, size * 0.08);
    graphics.fillStyle(0xb6503d, alpha);
    graphics.fillCircle(x + size * 0.64, y + size * 0.6, size * 0.08);
  },
};

export function drawConstruction(
  graphics: Phaser.GameObjects.Graphics,
  type: ConstructionType,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  roadMask = 0,
): void {
  constructionDrawers[type](graphics, x, y, size, alpha, roadMask);
}
