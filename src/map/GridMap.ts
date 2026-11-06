import type Phaser from 'phaser';
import { cellSize } from './MapCamera';
import type { Cell } from './CellSelection';
import { constructionDimensions, footprint, singleTile } from './ConstructionMap';
import type { ConstructionMap, ConstructionType, Dimensions } from './ConstructionMap';
import { buildingTexture, upgradedRoadArt } from './BuildingArt';
import type { RoadConnections } from './RoadConnections';
import type { Population } from '../population/Population';
import { drawRoad, getRoadMask, RoadDirection } from './RoadAppearance';
import { housingArt } from './HousingArt';
import { TerrainRenderer } from './TerrainRenderer';
import type { TerrainRegion } from './TerrainRenderer';
import type { TerrainMap } from './Terrain';

const regionPadding = 6;

export class GridMap {
  private readonly terrainArt: TerrainRenderer;
  private readonly constructions: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly connectionIndicators: Phaser.GameObjects.Graphics;
  private readonly buildingImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly previewImages: Phaser.GameObjects.Image[] = [];
  private region: TerrainRegion | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly terrain: TerrainMap) {
    this.terrainArt = new TerrainRenderer(scene, terrain);
    this.constructions = scene.add.graphics();
    this.preview = scene.add.graphics().setDepth(1);
    this.highlight = scene.add.graphics();
    this.selection = scene.add.graphics().setDepth(0.4);
    this.connectionIndicators = scene.add.graphics().setDepth(0.5);
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
      right: Math.min(this.terrain.columns, right + regionPadding),
      bottom: Math.min(this.terrain.rows, bottom + regionPadding),
    };
    this.terrainArt.show(this.region);
    this.renderConstructions(map, connections, population);
  }

  redrawTerrain(cell: Cell): void { this.terrainArt.redraw(cell); }

  destroy(): void { this.terrainArt.destroy(); }

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
    const drawn = new Set<string>();
    const visibleImages = new Set<string>();
    for (let row = region.top; row < region.bottom; row++) {
      for (let column = region.left; column < region.right; column++) {
        const building = map.constructionAt({ column, row });
        if (!building || drawn.has(building.id)) continue;
        drawn.add(building.id);
        const { cell, type } = building;
        const x = cell.column * cellSize;
        const y = cell.row * cellSize;
        const roadLevel = type === 'road' ? map.roadLevelAt(cell) : undefined;
        if (type === 'road') {
          drawRoad(this.constructions, x, y, cellSize, 1, getRoadMask(map, cell), roadLevel === undefined, roadLevel);
          if (roadLevel === undefined) continue;
        }
        const level = type === 'house' ? population.housingLevelAt(cell) : 1;
        visibleImages.add(building.id);
        const texture = type === 'house' && (population.residentsAt(cell) > 0 || level > 1)
          ? housingArt[level].texture : roadLevel === 2 || roadLevel === 3
            ? upgradedRoadArt[roadLevel].texture : buildingTexture(type);
        let image = this.buildingImages.get(building.id);
        if (!image) {
          image = this.scene.add.image(0, 0, texture).setDepth(0.25);
          this.buildingImages.set(building.id, image);
        }
        const span = type === 'bridge' ? map.bridgeAt(cell) : null;
        this.positionArt(image, cell, building, texture, Boolean(span && span.from.row !== span.to.row));
        if (type !== 'road' && type !== 'bridge' && !connections.isConnected(cell)) {
          const markerX = x + 0.86 * cellSize;
          const markerY = y + 0.14 * cellSize;
          this.connectionIndicators.fillStyle(0x1c211d);
          this.connectionIndicators.fillCircle(markerX, markerY, cellSize * 0.1);
          this.connectionIndicators.fillStyle(0xe8b65a);
          this.connectionIndicators.fillCircle(markerX, markerY, cellSize * 0.065);
        }
      }
    }
    for (const [key, image] of this.buildingImages) {
      if (!visibleImages.has(key)) {
        image.destroy();
        this.buildingImages.delete(key);
      }
    }
  }

  renderPreview(cell: Cell | null, type: ConstructionType | null, available: boolean, roadMask = 0): void {
    this.clearPreview();
    if (!cell || !type) return;
    this.drawPreview(cell, type, available, roadMask);
  }

  renderBridgePreview(cells: readonly Cell[], horizontal: boolean, available: boolean): void {
    this.clearPreview();
    cells.forEach((cell, index) => this.drawPreview(cell, 'bridge', available,
      horizontal ? RoadDirection.East : RoadDirection.North, index));
  }

  private clearPreview(): void {
    this.preview.clear();
    for (const image of this.previewImages) image.setVisible(false);
  }

  private positionArt(image: Phaser.GameObjects.Image, cell: Cell, size: Dimensions, texture: string, vertical: boolean): void {
    if (image.texture.key !== texture) image.setTexture(texture);
    image.setPosition((cell.column + size.width / 2) * cellSize, (cell.row + size.height / 2) * cellSize)
      .setDisplaySize(size.width * cellSize, size.height * cellSize).setAngle(vertical ? 90 : 0);
  }

  private drawPreview(cell: Cell, type: ConstructionType, available: boolean, roadMask: number, index = 0): void {
    const x = cell.column * cellSize;
    const y = cell.row * cellSize;
    const size = constructionDimensions[type];
    if (available) {
      if (type === 'road') drawRoad(this.preview, x, y, cellSize, 0.55, roadMask);
      const texture = buildingTexture(type);
      const image = this.previewImages[index] ??= this.scene.add.image(0, 0, texture).setDepth(0.9).setAlpha(0.62);
      this.positionArt(image, cell, size, texture, type === 'bridge' && roadMask === RoadDirection.North);
      image.setVisible(true);
    }
    this.preview.fillStyle(available ? 0xa4e69c : 0xf05252, 0.25);
    this.preview.fillRect(x, y, cellSize * size.width, cellSize * size.height);
    this.preview.lineStyle(2, available ? 0xa4e69c : 0xf05252);
    for (const tile of footprint(cell, size)) this.preview.strokeRect(tile.column * cellSize, tile.row * cellSize, cellSize, cellSize);
  }

  renderSelection(cell: Cell | null, size: Dimensions = singleTile): void {
    this.selection.clear();
    if (!cell) return;

    const cellX = cell.column * cellSize;
    const cellY = cell.row * cellSize;
    this.selection.fillStyle(0x80d6ff, 0.3);
    this.selection.fillRect(cellX, cellY, cellSize * size.width, cellSize * size.height);
    this.selection.lineStyle(3, 0x80d6ff);
    this.selection.strokeRect(cellX, cellY, cellSize * size.width, cellSize * size.height);
  }
}
