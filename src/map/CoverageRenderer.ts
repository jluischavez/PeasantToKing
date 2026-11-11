import type Phaser from 'phaser';
import type { BuildingCoverage } from './BuildingCoverage';
import { footprint } from './ConstructionMap';
import { cellSize } from './MapCamera';

export const coverageColors = { benefit: 0x55dd83, potential: 0xeac55b, invalid: 0xf05252, outside: 0xb6bdca } as const;

// One world-space graphics object, below selection/NPCs and above building art.
export class CoverageRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private current: BuildingCoverage | null = null;
  constructor(scene: Phaser.Scene) { this.graphics = scene.add.graphics().setDepth(0.32); }
  render(report: BuildingCoverage | null): void {
    if (report === this.current) return;
    this.current = report; const g = this.graphics; g.clear();
    if (!report) return;
    const preview = report.target.preview;
    const area = new Set(report.tiles.filter(tile => tile.reachable).map(tile => `${tile.cell.column},${tile.cell.row}`));
    for (const tile of report.tiles) {
      const x = tile.cell.column * cellSize, y = tile.cell.row * cellSize;
      if (!tile.reachable) {
        if (tile.kind === 'home') g.lineStyle(1, coverageColors.outside, 0.65).strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
        continue;
      }
      g.fillStyle(coverageColors.potential, tile.kind === 'home' ? 0.2 : 0.1).fillRect(x, y, cellSize, cellSize);
      if (!preview && tile.benefit > 0) {
        const height = cellSize * Math.min(1, tile.benefit);
        g.fillStyle(coverageColors.benefit, tile.points ? 0.13 + tile.points / 250 : 0.25).fillRect(x, y + cellSize - height, cellSize, height);
      }
      if (tile.kind === 'home' || tile.kind === 'woodland') {
        const color = tile.kind === 'woodland' || (preview && (tile.gain ?? 0) > 0) || (!preview && tile.benefit > 0) ? coverageColors.benefit : coverageColors.potential;
        g.lineStyle(2, color, 0.85).strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }
      g.lineStyle(1, coverageColors.potential, 0.55);
      const { column, row } = tile.cell;
      if (!area.has(`${column - 1},${row}`)) g.lineBetween(x, y, x, y + cellSize);
      if (!area.has(`${column + 1},${row}`)) g.lineBetween(x + cellSize, y, x + cellSize, y + cellSize);
      if (!area.has(`${column},${row - 1}`)) g.lineBetween(x, y, x + cellSize, y);
      if (!area.has(`${column},${row + 1}`)) g.lineBetween(x, y + cellSize, x + cellSize, y + cellSize);
    }
    const color = report.target.issue ? coverageColors.invalid : 0x80d6ff;
    for (const tile of footprint(report.target.cell, report.target.size)) {
      g.fillStyle(color, 0.12).fillRect(tile.column * cellSize, tile.row * cellSize, cellSize, cellSize);
      g.lineStyle(2, color, 0.9).strokeRect(tile.column * cellSize, tile.row * cellSize, cellSize, cellSize);
    }
  }
  destroy(): void { this.graphics.destroy(); this.current = null; }
}
