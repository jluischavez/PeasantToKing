import type Phaser from 'phaser';
import type { World } from './World';
import { cellSize } from './MapCamera';
import type { Cell } from './CellSelection';
import type { ConstructionMap, ConstructionType } from './ConstructionMap';
import { drawConstruction } from './drawConstruction';
import type { RoadConnections } from './RoadConnections';
import type { Population } from '../population/Population';
import { getRoadMask } from './RoadAppearance';
import { housingArt } from './HousingArt';

type Region = { left: number; top: number; right: number; bottom: number };
const regionPadding = 6;

export class GridMap {
  private readonly terrain: Phaser.GameObjects.Graphics;
  private readonly constructions: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly connectionIndicators: Phaser.GameObjects.Graphics;
  private readonly housingImages = new Map<number, Phaser.GameObjects.Image>();
  private region: Region | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly world: World) {
    this.terrain = scene.add.graphics();
    this.constructions = scene.add.graphics();
    this.preview = scene.add.graphics().setDepth(1);
    this.highlight = scene.add.graphics();
    this.selection = scene.add.graphics().setDepth(0.4);
    this.connectionIndicators = scene.add.graphics().setDepth(0.5);
    this.drawTerrain();
  }

  private drawTerrain(): void {
    const { columns, rows } = this.world;
    const width = columns * cellSize, height = rows * cellSize;
    this.terrain.fillStyle(0x527b43);
    this.terrain.fillRect(0, 0, width, height);
    this.terrain.lineStyle(1, 0x293f24, 0.85);
    this.terrain.beginPath();
    for (let column = 0; column <= columns; column++) {
      const x = column * cellSize;
      this.terrain.moveTo(x, 0);
      this.terrain.lineTo(x, height);
    }
    for (let row = 0; row <= rows; row++) {
      const y = row * cellSize;
      this.terrain.moveTo(0, y);
      this.terrain.lineTo(width, y);
    }
    this.terrain.strokePath();
  }

  updateView(view: { x: number; y: number; size: number }, map: ConstructionMap,
    connections: RoadConnections, population: Population): void {
    const left = Math.floor(view.x / cellSize);
    const top = Math.floor(view.y / cellSize);
    const right = Math.ceil((view.x + view.size) / cellSize);
    const bottom = Math.ceil((view.y + view.size) / cellSize);
    const region = this.region;
    if (region && left >= region.left && right <= region.right && top >= region.top && bottom <= region.bottom) return;
    this.region = {
      left: Math.max(0, left - regionPadding), top: Math.max(0, top - regionPadding),
      right: Math.min(this.world.columns, right + regionPadding),
      bottom: Math.min(this.world.rows, bottom + regionPadding),
    };
    this.renderConstructions(map, connections, population);
  }

  renderHover(cell: Cell | null): void {
    this.clearHighlight();
    if (!cell) return;

    const cellX = cell.column * cellSize;
    const cellY = cell.row * cellSize;
    this.highlight.fillStyle(0xffe29a, 0.3);
    this.highlight.fillRect(cellX, cellY, cellSize, cellSize);
    this.highlight.lineStyle(2, 0xffe29a);
    this.highlight.strokeRect(cellX, cellY, cellSize, cellSize);
  }

  clearHighlight(): void {
    this.highlight.clear();
  }

  renderConstructions(map: ConstructionMap, connections: RoadConnections, population: Population): void {
    const region = this.region;
    if (!region) return;
    this.constructions.clear();
    this.connectionIndicators.clear();
    const visibleHousing = new Set<number>();
    for (let row = region.top; row < region.bottom; row++) {
      for (let column = region.left; column < region.right; column++) {
        const cell = { column, row };
        const type = map.getConstruction(cell);
        if (!type) continue;
        const x = column * cellSize;
        const y = row * cellSize;
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
          image.setDisplaySize(cellSize, cellSize);
          visibleHousing.add(key);
        } else {
          drawConstruction(this.constructions, type, x, y, cellSize, 1, type === 'road' ? getRoadMask(map, cell) : 0);
        }
        if (type !== 'road' && !connections.isConnected(cell)) {
          const markerX = x + 0.86 * cellSize;
          const markerY = y + 0.14 * cellSize;
          this.connectionIndicators.fillStyle(0x1c211d);
          this.connectionIndicators.fillCircle(markerX, markerY, cellSize * 0.1);
          this.connectionIndicators.fillStyle(0xe8b65a);
          this.connectionIndicators.fillCircle(markerX, markerY, cellSize * 0.065);
        }
      }
    }
    for (const [key, image] of this.housingImages) {
      if (!visibleHousing.has(key)) {
        image.destroy();
        this.housingImages.delete(key);
      }
    }
  }

  renderPreview(cell: Cell | null, type: ConstructionType | null, available: boolean, roadMask = 0): void {
    this.preview.clear();
    if (!cell || !type) return;
    const x = cell.column * cellSize;
    const y = cell.row * cellSize;
    if (available) drawConstruction(this.preview, type, x, y, cellSize, 0.55, roadMask);
    this.preview.fillStyle(available ? 0xa4e69c : 0xf05252, 0.25);
    this.preview.fillRect(x, y, cellSize, cellSize);
    this.preview.lineStyle(2, available ? 0xa4e69c : 0xf05252);
    this.preview.strokeRect(x, y, cellSize, cellSize);
  }

  renderSelection(cell: Cell | null): void {
    this.selection.clear();
    if (!cell) return;

    const cellX = cell.column * cellSize;
    const cellY = cell.row * cellSize;
    this.selection.fillStyle(0x80d6ff, 0.3);
    this.selection.fillRect(cellX, cellY, cellSize, cellSize);
    this.selection.lineStyle(3, 0x80d6ff);
    this.selection.strokeRect(cellX, cellY, cellSize, cellSize);
  }
}
