import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { TransportRenderer } from '../src/map/TransportRenderer.ts';
const c = (column: number, row = 1) => ({ column, row });
function fixture() {
  const map = new ConstructionMap(100, 100), roads = new RoadConnections();
  map.place(c(0), 'villageCenter');
  for (let x = 1; x < 12; x++) map.place(c(x), 'road');
  map.place(c(1, 2), 'farm'); map.place(c(9, 2), 'warehouse');
  const economy = new Economy({ gold: 0, food: 0, wood: 0 });
  let workers = 1;
  const sync = () => { roads.recalculate(map); economy.recalculate(map, roads, { workersAt: () => workers, capacityFor: () => 4 }); };
  sync();
  const images: any[] = [];
  const g: any = new Proxy({}, { get: () => () => g });
  const scene = { make: { graphics: () => g }, textures: { exists: () => true },
    cameras: { main: { worldView: { left: 0, right: 2400, top: 0, bottom: 2400 } } },
    add: { image: () => { const image = { visible: false, setDepth() { return this; }, setTexture() { return this; },
      setPosition() { return this; }, setVisible(v: boolean) { this.visible = v; return this; }, setAlpha() { return this; } };
      images.push(image); return image; } } };
  const logistics = economy.storage.logistics, renderer = new TransportRenderer(scene as never, logistics);
  const queue = () => assert.ok(economy.storage.queueProduction(c(1, 2), 'food', 150, 0));
  const render = () => renderer.update(0, 0);
  return { map, economy, logistics, renderer, images, scene, queue, sync, render, workers: (value: number) => { workers = value; sync(); } };
}
test('cutting a route immediately hides its sprite and preserves cargo, then restores it on reconnection', () => {
  const f = fixture(); f.queue(); f.logistics.advance(2000, 2000); f.render();
  assert.equal(f.images.filter(i => i.visible).length, 1);
  f.map.remove(c(5)); f.sync(); f.render();
  assert.equal(f.logistics.operations[0].state, 'Blocked');
  assert.equal(f.images.filter(i => i.visible).length, 0);
  assert.equal(f.economy.resources.food, 1);
  f.map.place(c(5), 'road'); f.sync(); f.render();
  assert.equal(f.images.filter(i => i.visible).length, 1);
});
test('a detour resumes walking without a stationary ghost or any instant delivery', () => {
  const f = fixture(); f.queue(); f.logistics.advance(2000, 2000);
  f.map.remove(c(5)); f.sync();
  for (let x = 4; x <= 6; x++) f.map.place(c(x, 0), 'road');
  f.sync(); f.render();
  assert.equal(f.logistics.operations[0].state, 'Carrying');
  assert.equal(f.economy.storage.warehouseAt(c(9, 2))!.food, 0);
  assert.ok(f.logistics.operations[0].route.some(cell => cell.row === 0));
});
test('unavailable Loading is Blocked and invisible, rather than permanently parked at the entrance', () => {
  const f = fixture(); f.queue(); f.workers(0); f.logistics.advance(1000, 1000); f.render();
  assert.equal(f.logistics.operations[0].state, 'Blocked');
  assert.equal(f.images.filter(i => i.visible).length, 0);
  f.workers(1); f.logistics.advance(2000, 2000); f.render();
  assert.equal(f.logistics.operations[0].state, 'Carrying');
  assert.equal(f.images.filter(i => i.visible).length, 1);
});
test('one-tile routes, loading and unloading complete and repeated operations reuse and release sprites', () => {
  const f = fixture();
  for (let trip = 0; trip < 100; trip++) {
    f.queue();
    for (let tick = 0; tick < 10; tick++) { f.logistics.advance(1000, 1000); f.render(); }
    assert.equal(f.logistics.operations.length, 0);
    assert.ok(f.images.every(image => !image.visible));
  }
  assert.equal(f.images.length, 1);
  assert.equal(f.economy.resources.food, 100);
});
test('one shared access tile completes loading/unloading and arrival sprites are also released', () => {
  const f = fixture();
  f.map.place(c(1, 0), 'warehouse'); f.map.place(c(3, 2), 'house'); f.sync();
  assert.ok(f.logistics.queue(c(1, 2), c(1, 0), 'food', 150, 0));
  assert.equal(f.logistics.operations[0].route.length, 1);
  for (let i = 0; i < 4; i++) { f.logistics.advance(1000, (i + 1) * 1000); f.render(); }
  assert.equal(f.logistics.operations.length, 0);
  f.logistics.arrivalResidents = () => 2;
  f.logistics.queueArrival(c(3, 2), 2); f.render();
  assert.equal(f.images.filter(image => image.visible).length, 1);
  for (let i = 0; i < 4; i++) { f.logistics.advance(1000, 5000 + i * 1000); f.render(); }
  assert.equal(f.logistics.journeys.length, 0);
  assert.ok(f.images.every(image => !image.visible));
});
test('offscreen activity completes without allocating a sprite or changing population through rendering', () => {
  const f = fixture(); f.map.place(c(3, 2), 'house'); f.sync(); f.logistics.arrivalResidents = () => 2;
  f.logistics.queueArrival(c(3, 2), 2);
  f.scene.cameras.main.worldView.left = 1500;
  for (let i = 0; i < 5; i++) { f.logistics.advance(1000, (i + 1) * 1000); f.render(); }
  assert.equal(f.images.length, 0);
  assert.equal(f.logistics.journeys.length, 0);
  assert.equal(f.logistics.journeyHistory.filter(j => j.result === 'completed').length, 1);
});
