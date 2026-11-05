import type { Cell } from './CellSelection';
import type { World } from './World';

export const cellSize = 24;
export const cameraRules = { initialTiles: 20, minZoom: 0.5, maxZoom: 2.5, speed: 420, dragThreshold: 5 } as const;

type Point = Readonly<{ x: number; y: number }>;
export type CameraView = Readonly<Point & { zoom: number }>;
type Viewport = Readonly<Point & { size: number }>;
type Gesture = { id: number; start: Point; previous: Point; button: number; dragged: boolean };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class MapCamera {
  private center: Point;
  private zoomFactor: number;
  private gesture: Gesture | null = null;
  viewport: Viewport = { x: 0, y: 0, size: 1 };

  constructor(private readonly world: World, start: Cell, saved?: CameraView) {
    this.center = saved ? { x: saved.x, y: saved.y } : this.centerOf(start);
    this.zoomFactor = saved?.zoom ?? 1;
    this.constrain();
  }

  get view(): CameraView { return { ...this.center, zoom: this.zoomFactor }; }
  get zoom(): number { return this.viewport.size / this.visibleSize; }
  get dragging(): boolean { return this.gesture?.dragged === true; }

  private get visibleSize(): number { return cameraRules.initialTiles * cellSize / this.zoomFactor; }

  get bounds() {
    const size = this.visibleSize;
    return { x: this.center.x - size / 2, y: this.center.y - size / 2, size };
  }

  setViewport(viewport: Viewport): void { this.viewport = viewport; }

  private centerOf(cell: Cell): Point {
    return { x: (cell.column + 0.5) * cellSize, y: (cell.row + 0.5) * cellSize };
  }

  focus(cell: Cell): void {
    this.center = this.centerOf(cell);
    this.constrain();
  }

  private constrain(): void {
    const minimum = Math.max(cameraRules.minZoom, cameraRules.initialTiles / Math.min(this.world.columns, this.world.rows));
    this.zoomFactor = clamp(this.zoomFactor, minimum, cameraRules.maxZoom);
    const half = this.visibleSize / 2;
    this.center = {
      x: clamp(this.center.x, half, this.world.columns * cellSize - half),
      y: clamp(this.center.y, half, this.world.rows * cellSize - half),
    };
  }

  contains(point: Point): boolean {
    const { x, y, size } = this.viewport;
    return point.x >= x && point.x < x + size && point.y >= y && point.y < y + size;
  }

  worldAt(point: Point): Point {
    const { x, y } = this.bounds;
    return { x: x + (point.x - this.viewport.x) / this.zoom, y: y + (point.y - this.viewport.y) / this.zoom };
  }

  cellAt(point: Point): Cell | null {
    if (!this.contains(point)) return null;
    const world = this.worldAt(point);
    return { column: Math.floor(world.x / cellSize), row: Math.floor(world.y / cellSize) };
  }

  pan(screenX: number, screenY: number): void {
    this.center = { x: this.center.x + screenX / this.zoom, y: this.center.y + screenY / this.zoom };
    this.constrain();
  }

  zoomAt(point: Point, multiplier: number): void {
    if (!this.contains(point) || !Number.isFinite(multiplier) || multiplier <= 0) return;
    const anchor = this.worldAt(point);
    this.zoomFactor *= multiplier;
    this.constrain();
    const moved = this.worldAt(point);
    this.center = { x: this.center.x + anchor.x - moved.x, y: this.center.y + anchor.y - moved.y };
    this.constrain();
  }

  beginPointer(id: number, point: Point, button: number): boolean {
    if (this.gesture || !this.contains(point) || ![0, 1, 2].includes(button)) return false;
    this.gesture = { id, start: point, previous: point, button, dragged: false };
    return true;
  }

  movePointer(id: number, point: Point): void {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return;
    if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= cameraRules.dragThreshold) gesture.dragged = true;
    if (!gesture.dragged) return;
    this.pan(gesture.previous.x - point.x, gesture.previous.y - point.y);
    gesture.previous = point;
  }

  endPointer(id: number, point: Point): Cell | null {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return null;
    this.movePointer(id, point);
    this.gesture = null;
    return !gesture.dragged && gesture.button === 0 ? this.cellAt(point) : null;
  }

  cancelPointer(id?: number): void {
    if (id === undefined || this.gesture?.id === id) this.gesture = null;
  }
}
