import type Phaser from 'phaser';
import type { ConstructionType } from './ConstructionMap';

export function drawConstruction(
  graphics: Phaser.GameObjects.Graphics,
  type: ConstructionType,
  x: number,
  y: number,
  size: number,
  alpha = 1,
): void {
  if (type === 'house') {
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
  } else {
    graphics.fillStyle(0xb99b6a, alpha);
    graphics.fillRect(x + size * 0.04, y + size * 0.3, size * 0.92, size * 0.4);
    graphics.fillStyle(0xd4bb8e, alpha);
    graphics.fillRect(x + size * 0.15, y + size * 0.38, size * 0.22, size * 0.1);
    graphics.fillRect(x + size * 0.58, y + size * 0.53, size * 0.22, size * 0.1);
  }
}
