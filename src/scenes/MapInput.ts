import { cameraRules } from '../map/MapCamera';
import type { MapCamera } from '../map/MapCamera';
import type { Cell } from '../map/CellSelection';

const directions: Readonly<Record<string, readonly [number, number]>> = {
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
};

export function bindMapInput(canvas: HTMLCanvasElement, camera: MapCamera,
  gameSize: () => { width: number; height: number }, changed: () => void,
  hover: (cell: Cell | null) => void, click: (cell: Cell) => void, signal: AbortSignal) {
  const options = { signal };
  const keys = new Set<string>();
  let pointer: MouseEvent | null = null;
  const pointAt = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const size = gameSize();
    return { x: (event.clientX - rect.left) * size.width / rect.width,
      y: (event.clientY - rect.top) * size.height / rect.height };
  };
  const refreshHover = () => hover(pointer && !camera.dragging ? camera.cellAt(pointAt(pointer)) : null);
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Mapa. Usa WASD o flechas para desplazar la cámara.');

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || !camera.beginPointer(event.pointerId, pointAt(event), event.button)) return;
    pointer = event;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (!event.isPrimary) return;
    pointer = event;
    camera.movePointer(event.pointerId, pointAt(event));
    if (camera.dragging) changed();
    refreshHover();
  }, options);
  canvas.addEventListener('pointerup', event => {
    if (!event.isPrimary || !canvas.hasPointerCapture(event.pointerId)) return;
    pointer = event;
    const cell = camera.endPointer(event.pointerId, pointAt(event));
    changed();
    if (cell) click(cell);
    refreshHover();
  }, options);
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
    refreshHover();
  }, options);
  canvas.addEventListener('pointercancel', event => {
    camera.cancelPointer(event.pointerId);
    pointer = null;
    refreshHover();
  }, options);
  canvas.addEventListener('lostpointercapture', event => camera.cancelPointer(event.pointerId), options);
  canvas.addEventListener('contextmenu', event => {
    if (camera.contains(pointAt(event))) event.preventDefault();
  }, options);
  canvas.addEventListener('wheel', event => {
    const point = pointAt(event);
    if (!camera.contains(point)) return;
    event.preventDefault();
    pointer = event;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? camera.viewport.size : 1);
    camera.zoomAt(point, Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.002));
    changed();
    refreshHover();
  }, { ...options, passive: false });

  const canUseKeys = () => document.activeElement === canvas || document.activeElement === document.body;
  window.addEventListener('keydown', event => {
    if (!directions[event.code] || !canUseKeys() || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    keys.add(event.code);
  }, options);
  window.addEventListener('keyup', event => keys.delete(event.code), options);
  canvas.addEventListener('blur', () => keys.clear(), options);
  window.addEventListener('blur', () => {
    keys.clear();
    camera.cancelPointer();
    pointer = null;
    refreshHover();
  }, options);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    keys.clear();
    camera.cancelPointer();
    pointer = null;
    refreshHover();
  }, options);

  return {
    refreshHover,
    update(delta: number) {
      if (!canUseKeys()) keys.clear();
      let x = 0, y = 0;
      for (const key of keys) {
        const [dx, dy] = directions[key]!;
        x += dx;
        y += dy;
      }
      if (x === 0 && y === 0) return;
      const step = cameraRules.speed * Math.min(delta, 50) / 1000;
      const length = Math.hypot(Math.sign(x), Math.sign(y));
      camera.pan(Math.sign(x) * step / length, Math.sign(y) * step / length);
      changed();
      refreshHover();
    },
  };
}
