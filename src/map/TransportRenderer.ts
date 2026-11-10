import type Phaser from 'phaser';
import { logisticsRules } from '../economy/Logistics';
import type { Logistics } from '../economy/Logistics';
import { cellSize } from './MapCamera';
import { professionColors, transportProfession } from './TransportAppearance';
import type { Profession } from './TransportAppearance';

// One bounded pool for the scene. Offscreen operations are never instantiated.
export class TransportRenderer {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  constructor(private readonly scene: Phaser.Scene, private readonly logistics: Logistics) {}
  // Only generate combinations used by real roles, lazily on first appearance.
  private texture(role: Profession, resource: string, frame: number): string {
      const scene = this.scene, texture = `carrier-${role}-${resource}-${frame}`;
      if (scene.textures.exists(texture)) return texture;
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.clear();
      g.fillStyle(0x000000, 0.2).fillEllipse(12, 21, 13, 4);
      g.fillStyle(0x403125).fillRect(7 + frame * 2, 16, 3, 6).fillRect(13 - frame * 2, 16, 3, 6);
      g.fillStyle(professionColors[role]).fillRect(7, 9, 10, 9);
      g.fillStyle(0xe3b282).fillCircle(12, 7, 3);
      g.fillStyle(0x65452d).fillRect(8, 3, 8, 3);
      g.fillStyle(0xe3b282).fillRect(5, 11, 3, 5);
      if (resource === 'food') {
        g.fillStyle(0xc49b57).fillEllipse(17, 13, 8, 10);
        g.lineStyle(1, 0x73502c).lineBetween(14, 10, 20, 10);
      } else if (resource === 'wood') {
        g.fillStyle(0x71492e).fillRoundedRect(14, 8, 8, 12, 2);
        g.fillStyle(0xd3b178).fillCircle(16, 9, 2).fillCircle(20, 10, 2);
      } else if (resource === 'water') {
        g.fillStyle(0x937451).fillRect(16, 12, 7, 7);
        g.fillStyle(0x65c5e4).fillEllipse(19, 12, 7, 3);
      } else if (resource === 'luggage') {
        g.fillStyle(0x8d5f82).fillRoundedRect(15, 8, 8, 10, 2);
        g.lineStyle(1, 0xd7c795).lineBetween(15, 12, 23, 12);
      }
      g.generateTexture(texture, 24, 24);
      g.destroy();
      return texture;
  }
  update(time: number, confirmedTime: number): void {
    const bounds = this.scene.cameras.main.worldView;
    let used = 0;
    const operations = this.logistics.operations, journeys = this.logistics.journeys;
    for (let index = 0; index < operations.length + journeys.length; index++) {
      const op = index < operations.length ? operations[index] : journeys[index - operations.length];
      // Handling happens inside buildings. A logical operation needs a street
      // sprite only while walking, never during Loading, Unloading or Blocked.
      if (op.state !== 'Carrying' && op.state !== 'WalkingToSource') continue;
      const current = op.route[op.index];
      let x = current.column, y = current.row;
      const progress = op.index + (op.phaseMs + Math.max(0, time - confirmedTime)) / logisticsRules.msPerTile;
      // Enter as soon as interpolation reaches the access; do not park there
      // until the next simulation tick. Shared one-tile routes never flash.
      if (progress >= op.route.length - 1) continue;
      const routeIndex = Math.floor(progress), a = op.route[routeIndex], b = op.route[Math.min(routeIndex + 1, op.route.length - 1)];
      x = a.column + (b.column - a.column) * (progress - routeIndex);
      y = a.row + (b.row - a.row) * (progress - routeIndex);
      x = (x + 0.5) * cellSize; y = (y + 0.5) * cellSize;
      // Keep simultaneous couriers distinguishable within the same road tile.
      x += (op.id % 3 - 1) * 2;
      y += (Math.floor(op.id / 3) % 3 - 1) * 2;
      if (x < bounds.left - cellSize || x > bounds.right + cellSize || y < bounds.top - cellSize || y > bounds.bottom + cellSize) continue;
      if (used === logisticsRules.maxSprites) break;
      const frame = Math.floor(time / 140) % 2;
      const resource = op.kind === 'household-purchase' && op.pickupMs === null ? 'empty' : op.resource;
      const texture = this.texture(transportProfession(op, this.logistics.workplaceAt(op.source)), resource, frame);
      const sprite = this.pool[used] ?? (this.pool[used] = this.scene.add.image(0, 0, texture).setDepth(0.7));
      sprite.name = op.npc;
      sprite.setTexture(texture).setPosition(x, y - 5).setVisible(true).setAlpha(1);
      used++;
    }
    for (let i = used; i < this.pool.length; i++) { this.pool[i].setVisible(false); this.pool[i].name = ''; }
  }
  destroy(): void {
    for (const sprite of this.pool) sprite.destroy();
    this.pool.length = 0;
  }
}
