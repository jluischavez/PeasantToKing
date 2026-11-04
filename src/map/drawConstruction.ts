import type Phaser from 'phaser';
import type { ConstructionType } from './ConstructionMap';

type ConstructionDrawer = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  alpha: number,
) => void;

const constructionDrawers: Record<ConstructionType, ConstructionDrawer> = {
  house(graphics, x, y, size, alpha) {
    graphics.fillStyle(0xe4c68e, alpha);
    graphics.fillRect(x + size * 0.2, y + size * 0.42, size * 0.6, size * 0.45);
    graphics.fillStyle(0x914d39, alpha);
    graphics.fillTriangle(
      x + size * 0.1, y + size * 0.45,
      x + size * 0.5, y + size * 0.1,
      x + size * 0.9, y + size * 0.45,
    );
    graphics.fillStyle(0x503a29, alpha);
    graphics.fillRect(x + size * 0.43, y + size * 0.62, size * 0.16, size * 0.25);
  },
  road(graphics, x, y, size, alpha) {
    graphics.fillStyle(0xb99b6a, alpha);
    graphics.fillRect(x + size * 0.04, y + size * 0.3, size * 0.92, size * 0.4);
    graphics.fillStyle(0xd4bb8e, alpha);
    graphics.fillRect(x + size * 0.15, y + size * 0.38, size * 0.22, size * 0.1);
    graphics.fillRect(x + size * 0.58, y + size * 0.53, size * 0.22, size * 0.1);
  },
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
): void {
  constructionDrawers[type](graphics, x, y, size, alpha);
}
