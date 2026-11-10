import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { TransportRenderer } from '../src/map/TransportRenderer.ts';
import { professionColors, transportProfession } from '../src/map/TransportAppearance.ts';
import type { Transport, Journey } from '../src/economy/Logistics.ts';
const c = (column: number, row = 1) => ({ column, row });
function fixture(saved?: ReturnType<Economy['saveState']>) {
  const map = new ConstructionMap(100, 100), roads = new RoadConnections();
  map.place(c(0), 'villageCenter');
  for (let x = 1; x < 12; x++) map.place(c(x), 'road');
  map.place(c(1, 2), 'farm'); map.place(c(9, 2), 'warehouse');
  const economy = new Economy({ gold: 0, food: 0, wood: 0 });
  let workers = 1;
  const sync = () => { roads.recalculate(map); economy.recalculate(map, roads, { workersAt: () => workers, capacityFor: () => 4 }); };
  sync();
  if (saved) { economy.restoreState(saved, map); sync(); }
  const images: any[] = [];
  const g: any = new Proxy({}, { get: () => () => g });
  const scene = { make: { graphics: () => g }, textures: { exists: () => true },
    cameras: { main: { worldView: { left: 0, right: 2400, top: 0, bottom: 2400 } } },
    add: { image: () => { const image = { visible: false, texture: '', name: '', x: 0, y: 0, setDepth() { return this; }, setTexture(value: string) { this.texture = value; return this; },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }, setVisible(v: boolean) { this.visible = v; return this; }, setAlpha() { return this; } };
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

test('repeated topology edits cannot restart Loading or Unloading at unchanged entrances', () => {
  const f = fixture(); f.map.place(c(1, 0), 'warehouse'); f.sync();
  assert.ok(f.logistics.queue(c(1, 2), c(1, 0), 'food', 150, 0));
  for (let tick = 1; tick <= 10; tick++) {
    f.map.place(c(30 + tick, 20), 'road'); f.sync();
    f.logistics.advance(500, tick * 500); f.render();
  }
  assert.equal(f.logistics.operations.length, 0);
  assert.equal(f.economy.storage.inventories.reserved('warehouse:1,0'), 0);
  assert.equal(f.economy.storage.inventories.saveState().filter(entry => entry.id.startsWith('cargo:')).length, 0);
  assert.ok(f.images.every(image => !image.visible));
  assert.equal(f.economy.resources.food, 1);
});

test('loss of workforce reconciles immediately even with unchanged topology', () => {
  const f = fixture(); f.queue(); f.render();
  f.workers(0); f.render();
  assert.equal(f.logistics.operations[0].state, 'Blocked');
  assert.ok(f.images.every(image => !image.visible));
});

test('a prolonged broken route creates no new transports and reconnects its original cargo', () => {
  const f = fixture(); f.queue(); f.logistics.advance(2000, 2000);
  const id = f.logistics.operations[0].id;
  f.map.remove(c(5)); f.sync();
  for (let second = 1; second <= 100; second++) f.economy.advance(1000);
  assert.deepEqual(f.logistics.operations.map(op => op.id), [id]);
  assert.equal(f.economy.resources.food, 1);
  f.map.place(c(5), 'road'); f.sync();
  for (let second = 0; second < 10; second++) f.logistics.advance(1000, 103000 + second * 1000);
  assert.equal(f.logistics.operations.length, 0);
  assert.equal(f.economy.resources.food, 1);
});

test.each(['food', 'wood'] as const)('warehouse shirts stay red with %s, independently of load', resource => {
  const op = { kind: 'warehouse-to-market', resource } as Transport;
  assert.equal(transportProfession(op), 'warehouse');
  assert.equal(professionColors[transportProfession(op)], 0xd33c36);
  op.kind = 'warehouse-to-warehouse';
  assert.equal(transportProfession(op), 'warehouse');
});

test('profession palette separates actual workers, civilians and future roles', () => {
  for (const [kind, resource, role] of [
    ['producer-to-warehouse', 'wood', 'lumberjack'], ['producer-to-warehouse', 'food', 'farmer'],
    ['water-service', 'water', 'water'], ['immigration', 'luggage', 'outsider'],
    ['household-purchase', 'wood', 'buyer'], ['household-purchase', 'food', 'buyer'],
  ] as const) assert.equal(transportProfession({ kind, resource } as Transport | Journey,
    role === 'farmer' ? 'farm' : role === 'lumberjack' ? 'lumberjack' : undefined), role);
  for (const resource of ['food', 'wood'] as const) {
    const op = { kind: 'producer-to-warehouse', resource } as Transport;
    assert.equal(transportProfession(op, 'farm'), 'farmer');
    assert.equal(transportProfession(op, 'lumberjack'), 'lumberjack');
  }
  assert.equal(professionColors.unemployed, 0xffffff);
  assert.equal(professionColors.outsider, 0xc99a30);
  assert.equal(professionColors.water, 0x318cde);
  assert.equal(professionColors.farmer, 0x36a34a);
  assert.equal(professionColors.lumberjack, 0x86502e);
  assert.equal(new Set(Object.values(professionColors)).size, 8);
});

test('reused pool image resets profession and cargo texture without spawning fictional characters', () => {
  const f = fixture(); f.queue(); f.logistics.advance(2000, 2000); f.render();
  assert.equal(f.images[0].texture, 'carrier-farmer-food-0');
  for (let second = 0; second < 10; second++) f.logistics.advance(1000, second * 1000);
  f.render();
  f.map.place(c(3, 2), 'house'); f.sync();
  f.logistics.queueArrival(c(3, 2), 2); f.render();
  assert.equal(f.images.length, 1);
  assert.equal(f.images[0].texture, 'carrier-outsider-luggage-0');
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

test('identity trace distinguishes successive access work from a stuck operation, without changing its ledger', () => {
  const f = fixture();
  const traces: { id: number; npc: string; kind: string; source: unknown; destination: unknown;
    state: string; phaseMs: number; position: unknown; time: number; visible: boolean }[] = [];
  const finished = new Set<number>();
  let time = 0;
  for (let trip = 0; trip < 3; trip++) {
    f.queue(); const op = f.logistics.operations[0];
    assert.ok(!finished.has(op.id));
    while (f.logistics.operations.length) {
      const before = f.economy.saveState();
      f.renderer.update(time, time);
      assert.deepEqual(f.economy.saveState(), before);
      const visible = f.images.filter(image => image.visible);
      traces.push({ id: op.id, npc: op.npc, kind: op.kind, source: op.source, destination: op.destination,
        state: op.state, phaseMs: op.phaseMs, position: op.route[op.index], time,
        visible: visible.some(image => image.name === op.npc) });
      assert.ok(time < (trip + 1) * 10000, JSON.stringify(traces));
      time += 250; f.logistics.advance(250, time);
    }
    finished.add(op.id); f.renderer.update(time, time);
    assert.ok(f.images.every(image => !image.visible && image.name === ''));
  }
  assert.equal(finished.size, 3);
  const loading = traces.filter(trace => trace.state === 'Loading');
  assert.equal(loading.length, 24); // Each distinct ID spends exactly 2 s inside the same origin.
  assert.equal(new Set(loading.map(trace => trace.id)).size, 3);
  assert.ok(loading.every(trace => JSON.stringify(trace.position) === JSON.stringify(c(1))));
  assert.ok(traces.filter(trace => trace.state === 'Loading' || trace.state === 'Unloading').every(trace => !trace.visible), JSON.stringify(traces));
  assert.ok(traces.some(trace => trace.state === 'Carrying' && trace.visible));
  assert.equal(f.economy.resources.food, 3);
  assert.equal(f.economy.storage.inventories.reserved('warehouse:9,2'), 0);
});

test('walking interpolation enters the building immediately instead of waiting visibly for the next tick', () => {
  const f = fixture(); f.queue(); f.logistics.advance(2000, 2000);
  const op = f.logistics.operations[0], before = f.logistics.saveState();
  f.renderer.update(2000, 2000);
  const image = f.images[0], start = image.x;
  f.renderer.update(2175, 2000);
  assert.equal(image.visible, true); assert.ok(image.x > start);
  f.renderer.update(2000 + (op.route.length - 1) * 350, 2000);
  assert.equal(op.state, 'Carrying');
  assert.equal(image.visible, false); assert.equal(image.name, '');
  assert.deepEqual(f.logistics.saveState(), before);
});

test.each(['Loading', 'Unloading'] as const)('save/reload during %s preserves the same invisible operation and settles once', phase => {
  const f = fixture(); f.queue(); f.logistics.stopForDemolition(c(1, 2));
  f.economy.advance(phase === 'Loading' ? 1000 : 5000);
  const op = f.logistics.operations[0];
  assert.equal(op.state, phase);
  const saved = f.economy.saveState(), restored = fixture(structuredClone(saved));
  assert.equal(restored.logistics.operations[0].id, op.id);
  assert.equal(restored.logistics.operations[0].phaseMs, op.phaseMs);
  for (const game of [f, restored]) {
    game.renderer.update(game.economy.simulatedTimeMs, game.economy.simulatedTimeMs);
    assert.ok(game.images.every(image => !image.visible && image.name === ''));
    assert.deepEqual(game.economy.saveState(), saved);
  }
  for (let tick = 0; tick < 8; tick++) {
    for (const game of [f, restored]) {
      game.economy.advance(1000);
      game.renderer.update(game.economy.simulatedTimeMs, game.economy.simulatedTimeMs);
      assert.equal(game.economy.resources.food, 1);
      assert.ok(game.images.filter(image => image.visible).every(image => image.name === op.npc));
    }
    assert.deepEqual(restored.economy.saveState(), f.economy.saveState());
  }
  assert.equal(restored.logistics.operations.length, 0);
  assert.equal(restored.economy.storage.warehouseAt(c(9, 2))!.food, 1);
  assert.equal(restored.economy.storage.inventories.reserved('warehouse:9,2'), 0);
  assert.ok(restored.images.every(image => !image.visible && image.name === ''));
});

test('one-tile deliveries never flash a street sprite, even across a hundred distinct IDs', () => {
  const f = fixture(); f.map.place(c(1, 0), 'warehouse'); f.sync();
  const ids = new Set<number>(), phases = new Set<string>();
  for (let trip = 0; trip < 100; trip++) {
    assert.ok(f.logistics.queue(c(1, 2), c(1, 0), 'food', 150, trip * 4000));
    const op = f.logistics.operations[0]; ids.add(op.id);
    assert.equal(op.route.length, 1);
    for (let tick = 0; tick < 16; tick++) {
      const time = trip * 4000 + tick * 250;
      if (f.logistics.operations.length) phases.add(op.state);
      f.renderer.update(time, time);
      assert.ok(f.images.every(image => !image.visible));
      f.logistics.advance(250, time + 250);
    }
    assert.equal(f.logistics.operations.length, 0);
  }
  assert.deepEqual(phases, new Set(['Loading', 'Carrying', 'Unloading']));
  assert.equal(ids.size, 100); assert.equal(f.images.length, 0);
  assert.equal(f.economy.storage.warehouseAt(c(1, 0))!.food, 100);
  assert.equal(f.economy.storage.inventories.reserved('warehouse:1,0'), 0);
});

test('several couriers unloading at one warehouse release their own identities and reservations', () => {
  const f = fixture();
  for (let trip = 0; trip < 3; trip++) {
    f.queue(); f.logistics.advance(2000, trip * 2000 + 2000);
  }
  assert.equal(new Set(f.logistics.operations.map(op => op.npc)).size, 3);
  for (let tick = 0; tick < 20; tick++) {
    f.renderer.update(6000 + tick * 250, 6000 + tick * 250);
    const visible = f.images.filter(image => image.visible);
    assert.equal(new Set(visible.map(image => image.name)).size, visible.length);
    for (const image of visible) assert.ok(f.logistics.operations.some(op => op.npc === image.name
      && (op.state === 'Carrying' || op.state === 'WalkingToSource')));
    f.logistics.advance(250, 6250 + tick * 250);
  }
  f.renderer.update(11000, 11000);
  assert.equal(f.logistics.operations.length, 0);
  assert.equal(f.economy.resources.food, 3);
  assert.equal(f.economy.storage.inventories.reserved('warehouse:9,2'), 0);
  assert.ok(f.images.every(image => !image.visible && image.name === ''));
});

test('a topology edit during unloading keeps the timer; removal of the occupied access blocks invisibly until rebuilt', () => {
  const f = fixture(); f.queue(); f.logistics.advance(2000, 2000); f.logistics.advance(2800, 4800);
  const op = f.logistics.operations[0]; assert.equal(op.state, 'Unloading');
  f.logistics.advance(500, 5300);
  f.map.remove(c(11)); f.sync();
  assert.equal(op.state, 'Unloading'); assert.equal(op.phaseMs, 500);
  f.renderer.update(5300, 5300); assert.ok(f.images.every(image => !image.visible));
  f.map.remove(c(9)); f.sync();
  assert.equal(op.state, 'Blocked');
  for (let tick = 0; tick < 8; tick++) {
    f.logistics.advance(1000, 6300 + tick * 1000); f.render();
    assert.equal(f.logistics.operations[0].id, op.id);
    assert.equal(op.state, 'Blocked'); assert.equal(f.economy.resources.food, 1);
    assert.ok(f.images.every(image => !image.visible));
  }
  f.map.place(c(9), 'road'); f.sync();
  for (let tick = 0; tick < 4; tick++) { f.logistics.advance(1000, 14300 + tick * 1000); f.render(); }
  assert.equal(f.logistics.operations.length, 0); assert.equal(f.economy.resources.food, 1);
});
