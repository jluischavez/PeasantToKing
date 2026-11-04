import type Phaser from 'phaser';
import type { Cell } from './CellSelection';

export class GridMap {
  readonly columns = 20;
  readonly rows = 20;
  private readonly terrain: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly selection: Phaser.GameObjects.Graphics;
  private x = 0;
  private y = 0;
  private cellSize = 0;

  constructor(scene: Phaser.Scene) {
    this.terrain = scene.add.graphics();
    this.highlight = scene.add.graphics();
    this.selection = scene.add.graphics();
  }

  layout(x: number, y: number, size: number): void {
    this.x = x;
    this.y = y;
    this.cellSize = size / this.columns;
    this.terrain.clear();
    this.clearHighlight();
    this.selection.clear();
    if (size <= 0) return;

    this.terrain.fillStyle(0x527b43);
    this.terrain.fillRect(x, y, size, size);
    this.terrain.lineStyle(1, 0x293f24, 0.85);
    this.terrain.beginPath();

    for (let column = 0; column <= this.columns; column++) {
      const lineX = x + column * this.cellSize;
      this.terrain.moveTo(lineX, y);
      this.terrain.lineTo(lineX, y + size);
    }
    for (let row = 0; row <= this.rows; row++) {
      const lineY = y + row * this.cellSize;
      this.terrain.moveTo(x, lineY);
      this.terrain.lineTo(x + size, lineY);
    }
    this.terrain.strokePath();
  }

  getCellAt(x: number, y: number): Cell | null {
    if (this.cellSize <= 0) return null;
    const column = Math.floor((x - this.x) / this.cellSize);
    const row = Math.floor((y - this.y) / this.cellSize);
    if (column < 0 || column >= this.columns || row < 0 || row >= this.rows) {
      return null;
    }
    return { column, row };
  }

  highlightAt(x: number, y: number): void {
    this.clearHighlight();
    const cell = this.getCellAt(x, y);
    if (!cell) return;

    const cellX = this.x + cell.column * this.cellSize;
    const cellY = this.y + cell.row * this.cellSize;
    this.highlight.fillStyle(0xffe29a, 0.3);
    this.highlight.fillRect(cellX, cellY, this.cellSize, this.cellSize);
    this.highlight.lineStyle(2, 0xffe29a);
    this.highlight.strokeRect(cellX, cellY, this.cellSize, this.cellSize);
  }

  clearHighlight(): void {
    this.highlight.clear();
  }

  renderSelection(cell: Cell | null): void {
    this.selection.clear();
    if (!cell || this.cellSize <= 0) return;

    const cellX = this.x + cell.column * this.cellSize;
    const cellY = this.y + cell.row * this.cellSize;
    this.selection.fillStyle(0x80d6ff, 0.3);
    this.selection.fillRect(cellX, cellY, this.cellSize, this.cellSize);
    this.selection.lineStyle(3, 0x80d6ff);
    this.selection.strokeRect(cellX, cellY, this.cellSize, this.cellSize);
  }
}
