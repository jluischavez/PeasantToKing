import type Phaser from 'phaser';
import type { World } from './World';
import type { Cell } from './CellSelection';
import type { ConstructionMap, ConstructionType } from './ConstructionMap';
import { drawConstruction } from './drawConstruction';
import type { RoadConnections } from './RoadConnections';
import type { Population } from '../population/Population';
import { getRoadMask } from './RoadAppearance';
import { housingArt } from './HousingArt';

export class GridMap {
  readonly columns: number;
  readonly rows: number;
  private readonly terrain: Phaser.GameObjects.Graphics;
  private readonly constructions: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly connectionIndicators: Phaser.GameObjects.Graphics;
  private readonly housingImages = new Map<number, Phaser.GameObjects.Image>();
  private x = 0;
  private y = 0;
  private cellSize = 0;

  constructor(private readonly scene: Phaser.Scene, world: World) {
    this.columns = world.columns;
    this.rows = world.rows;
    this.terrain = scene.add.graphics();
    this.constructions = scene.add.graphics();
    this.preview = scene.add.graphics().setDepth(1);
    this.highlight = scene.add.graphics();
    this.selection = scene.add.graphics().setDepth(0.4);
    this.connectionIndicators = scene.add.graphics().setDepth(0.5);
  }

  layout(x: number, y: number, size: number): void {
    this.x = x;
    this.y = y;
    this.cellSize = size / this.columns;
    this.terrain.clear();
    this.constructions.clear();
    this.preview.clear();
    this.clearHighlight();
    this.selection.clear();
    this.connectionIndicators.clear();
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

  renderHover(cell: Cell | null): void {
    this.clearHighlight();
    if (!cell || this.cellSize <= 0) return;

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

  renderConstructions(map: ConstructionMap, connections: RoadConnections, population: Population): void {
    this.constructions.clear();
    this.connectionIndicators.clear();
    for (const image of this.housingImages.values()) image.setVisible(false);
    if (this.cellSize <= 0) return;
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const cell = { column, row };
        const type = map.getConstruction(cell);
        if (type) {
          const x = this.x + column * this.cellSize;
          const y = this.y + row * this.cellSize;
          const level = type === 'house' ? population.housingLevelAt(cell) : 1;
          if (type === 'house' && (population.residentsAt(cell) > 0 || level > 1)) {
            const key = row * map.columns + column;
            const texture = housingArt[level].texture;
            let image = this.housingImages.get(key);
            if (!image) {
              image = this.scene.add.image(x, y, texture).setOrigin(0).setDepth(0.25);
              this.housingImages.set(key, image);
            } else if (image.texture.key !== texture) {
              image.setTexture(texture);
            }
            image.setPosition(x, y).setDisplaySize(this.cellSize, this.cellSize).setVisible(true);
          } else {
            drawConstruction(this.constructions, type, x, y, this.cellSize,
              1, type === 'road' ? getRoadMask(map, cell) : 0);
          }
          if (type !== 'road' && !connections.isConnected({ column, row })) {
            const markerX = this.x + (column + 0.86) * this.cellSize;
            const markerY = this.y + (row + 0.14) * this.cellSize;
            this.connectionIndicators.fillStyle(0x1c211d);
            this.connectionIndicators.fillCircle(markerX, markerY, this.cellSize * 0.1);
            this.connectionIndicators.fillStyle(0xe8b65a);
            this.connectionIndicators.fillCircle(markerX, markerY, this.cellSize * 0.065);
          }
        }
      }
    }
  }

  renderPreview(cell: Cell | null, type: ConstructionType | null, available: boolean, roadMask = 0): void {
    this.preview.clear();
    if (!cell || !type || this.cellSize <= 0) return;
    const x = this.x + cell.column * this.cellSize;
    const y = this.y + cell.row * this.cellSize;
    if (available) drawConstruction(this.preview, type, x, y, this.cellSize, 0.55, roadMask);
    this.preview.fillStyle(available ? 0xa4e69c : 0xf05252, 0.25);
    this.preview.fillRect(x, y, this.cellSize, this.cellSize);
    this.preview.lineStyle(2, available ? 0xa4e69c : 0xf05252);
    this.preview.strokeRect(x, y, this.cellSize, this.cellSize);
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
