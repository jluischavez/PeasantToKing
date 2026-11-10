import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { logisticsRules } from '../src/economy/Logistics.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap, constructionDimensions } from '../src/map/ConstructionMap.ts';
import { LogisticsRoutes } from '../src/map/LogisticsRoutes.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { TerrainMap, terrainCode } from '../src/map/Terrain.ts';
import { Population } from '../src/population/Population.ts';
import { Session } from '../src/persistence/Session.ts';
import { TransportRenderer } from '../src/map/TransportRenderer.ts';

const c = (column: number, row: number) => ({ column, row });
const farm = c(1, 2), warehouse = c(12, 2), camp = c(4, 2);
function fixture() {
  const map = new ConstructionMap(100, 100), roads = new RoadConnections();
  map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x <= 16; x++) map.place(c(x, 1), 'road');
  map.place(farm, 'farm'); map.place(camp, 'lumberjack'); map.place(warehouse, 'warehouse');
  map.terrain.plantTree(c(4, 4));
  const people = new Population();
  const workforce = { workersAt: () => 1, capacityFor: (type: Parameters<Population['capacityFor']>[0]) => people.capacityFor(type) };
  const economy = new Economy({ gold: 0, food: 0, wood: 0 }, 10000);
  const sync = () => { roads.recalculate(map); economy.recalculate(map, roads, workforce); };
  sync();
  return { map, roads, workforce, economy, storage: economy.storage, logistics: economy.storage.logistics, sync };
}
test('real production waits in the central ledger, travels, and is delivered exactly once', () => {
  const { economy, storage, logistics } = fixture();
  economy.advance(1000);
  assert.equal(storage.warehouseAt(warehouse)!.used, 0);
  assert.equal(economy.resources.food, 0.64);
  assert.equal(economy.availableConstructionWood, 0);
  assert.equal(logistics.operations.length, 2);
  logistics.stopForDemolition(farm);
  economy.setWarehouseAcceptance(warehouse, 'wood', false);
  for (let i = 0; i < 12; i++) economy.advance(1000);
  assert.equal(storage.warehouseAt(warehouse)!.food, 0.64);
  assert.equal(logistics.goods().food, 0);
  assert.equal(logistics.goods().wood, Math.round(0.56 * U));
  assert.equal(economy.resources.wood, 0.56);
  economy.setWarehouseAcceptance(warehouse, 'wood', true);
  economy.advance(15000);
  const deliveries = economy.history.read('food').filter(e => e.destination === 'warehouse:12,2');
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].units, 0.64 * U);
});
test('simultaneous trips reserve exact shared space, including against imports and direct deposits', () => {
  const { storage, logistics, map, sync } = fixture();
  const second = c(8, 2); map.place(second, 'farm'); sync();
  storage.setAcceptance(warehouse, 'wood', false);
  assert.ok(storage.depositProduction(farm, 'food', 299 * U));
  assert.ok(storage.queueProduction(farm, 'food', 100, 0));
  assert.equal(storage.queueProduction(second, 'food', 51, 0), false);
  assert.equal(storage.depositProduction(farm, 'food', 51), false);
  assert.equal(storage.inventories.exchange('0,1', 'import', [{ warehouse: 'warehouse:12,2', product: 'food', units: 51, direction: 'import' }], () => true), false);
  assert.equal(storage.warehouseAt(warehouse)!.free, 50 / U);
  assert.equal(logistics.goods().food, 100);
  assert.equal(storage.totalsUnits.food, 299 * U + 100);
  assert.ok(storage.queueProduction(second, 'food', 50, 0));
  assert.equal(logistics.operations.length, 2);
  assert.equal(storage.warehouseAt(warehouse)!.free, 0);
  assert.equal(storage.totalsUnits.food, 300 * U);
});
test('employees and permissions gate pickup and delivery without deleting blocked cargo', () => {
  const { logistics, storage, workforce, sync } = fixture();
  assert.ok(storage.queueProduction(farm, 'food', U, 0));
  workforce.workersAt = () => 0; sync();
  logistics.advance(10000, 10000);
  assert.equal(logistics.operations[0].pickupMs, null);
  assert.equal(storage.totalsUnits.food, U);
  workforce.workersAt = () => 1; sync();
  logistics.advance(2000, 12000);
  workforce.workersAt = cell => cell.column === warehouse.column ? 0 : 1; sync();
  logistics.advance(10000, 22000);
  assert.equal(logistics.operations[0].state, 'Blocked');
  assert.equal(storage.warehouseAt(warehouse)!.food, 0);
  workforce.workersAt = () => 1; sync();
  logistics.advance(10000, 32000); logistics.advance(1000, 33000);
  assert.equal(storage.warehouseAt(warehouse)!.food, 1);
});
test('a cut route blocks without loss; reconnecting or adding a detour resumes physical travel', () => {
  const { storage, logistics, map, sync } = fixture();
  assert.ok(storage.queueProduction(farm, 'food', U, 0));
  logistics.advance(2000, 2000);
  map.remove(c(6, 1)); sync();
  logistics.advance(1000, 3000);
  assert.equal(logistics.operations[0].state, 'Blocked');
  assert.equal(storage.totalsUnits.food, U);
  assert.equal(storage.warehouseAt(warehouse)!.food, 0);
  for (let x = 5; x <= 7; x++) map.place(c(x, 0), 'road');
  sync();
  for (let i = 0; i < 15; i++) logistics.advance(1000, 4000 + i * 1000);
  assert.equal(storage.warehouseAt(warehouse)!.food, 1);
  assert.equal(logistics.operations.length, 0);
});
test('removed current road never teleports a load, and blocked production is bounded', () => {
  const { storage, logistics, map, sync, economy } = fixture();
  storage.queueProduction(farm, 'food', U, 0); logistics.advance(2000, 2000);
  map.remove(c(1, 1)); sync();
  economy.advance(60000);
  assert.equal(storage.totalsUnits.food, U);
  assert.equal(storage.warehouseAt(warehouse)!.food, 0);
  assert.equal(logistics.operations[0].state, 'Blocked');
  map.place(c(1, 1), 'road'); sync();
  logistics.advance(10000, 70000); logistics.advance(1000, 71000);
  assert.equal(storage.warehouseAt(warehouse)!.food, 1);
});
test('a picked-up shipment can finish when only its former producer loses road access', () => {
  const { storage, logistics, map, sync } = fixture();
  const source = c(15, 2); map.place(source, 'farm'); sync();
  assert.ok(storage.queueProduction(source, 'food', U, 0));
  logistics.advance(2000, 2000); logistics.advance(700, 2700);
  map.remove(c(15, 1)); sync();
  logistics.advance(1000, 3700); logistics.advance(1000, 4700);
  assert.equal(storage.warehouseAt(warehouse)!.food, 1);
  assert.equal(logistics.operations.length, 0);
});
test.each([false, true])('routes obey bridge axes and never enter river sideways (vertical %s)', vertical => {
  const at = (x: number, y: number) => vertical ? c(y, x) : c(x, y);
  const codes = new Uint8Array(20 * 20);
  for (let y = 0; y < 20; y++) for (const x of [5, 6]) {
    const cell = at(x, y); codes[cell.row * 20 + cell.column] = terrainCode('river');
  }
  const map = new ConstructionMap(20, 20, new TerrainMap(20, 20, codes));
  for (const x of [3, 4, 7, 8]) map.place(at(x, 5), 'road');
  map.place(at(3, 4), 'farm'); map.place(at(8, 4), 'warehouse');
  assert.ok(map.placeBridge({ from: at(4, 5), to: at(7, 5) }));
  const routes = new LogisticsRoutes(map);
  const route = routes.find(at(3, 4), at(8, 4), 1)!;
  assert.ok(route.some(cell => JSON.stringify(cell) === JSON.stringify(at(5, 5))));
  for (let i = 1; i < route.length; i++) assert.ok(map.roadTouches(route[i], route[i - 1]) && map.roadTouches(route[i - 1], route[i]));
  assert.equal(map.roadTouches(at(5, 5), at(5, 4)), false);
  assert.equal(routes.find(at(5, 4), at(8, 4), 1), null);
});
test('3×3 and 2×2 buildings select shortest perimeter accesses without crossing occupied tiles', () => {
  const map = new ConstructionMap(20, 20);
  map.place(c(2, 2), 'farm', constructionDimensions.farm);
  map.place(c(9, 2), 'warehouse', constructionDimensions.warehouse);
  for (let x = 1; x <= 11; x++) map.place(c(x, 1), 'road');
  const routes = new LogisticsRoutes(map), path = routes.find(c(2, 2), c(9, 2), 1)!;
  assert.deepEqual(path[0], c(4, 1));
  assert.deepEqual(path.at(-1), c(9, 1));
  assert.equal(path.length, 6);
  assert.ok(path.every(cell => map.getConstruction(cell) === 'road'));
  routes.find(c(2, 2), c(9, 2), 1); assert.equal(routes.searches, 1);
  map.remove(c(6, 1)); assert.equal(routes.find(c(2, 2), c(9, 2), 2), null);
});
function playable() {
  const game = new Session();
  game.map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x < 14; x++) game.map.place(c(x, 1), 'road');
  game.map.place(farm, 'farm'); game.map.place(warehouse, 'warehouse');
  game.map.place(c(3, 2), 'house'); game.map.place(c(5, 2), 'house');
  game.simulation.recalculate();
  for (let i = 0; i < 2; i++) game.population.immigrate(100);
  game.simulation.recalculate();
  return game;
}
test.each([1, 2, 3] as const)('pause and speed ×%s preserve the entire cargo ledger and progress', speed => {
  const game = playable(), reference = playable();
  game.simulation.setSpeed(speed);
  for (let i = 0; i < 50; i++) { game.simulation.advance(100); reference.simulation.advance(100 * speed); }
  assert.deepEqual(game.economy.saveState(), reference.economy.saveState());
  game.simulation.setPaused(true);
  const before = game.saveState(null);
  game.simulation.advance(60000);
  assert.deepEqual(game.saveState(null), before);
});
test('save mid-route preserves exact progress, reservations, fractional clock and future deliveries', () => {
  const game = playable(); game.simulation.advance(4250);
  assert.ok(game.economy.storage.logistics.operations.some(op => op.state === 'Carrying'));
  const state = game.saveState(null), restored = Session.restore(JSON.parse(JSON.stringify(state))).session;
  assert.deepEqual(JSON.parse(JSON.stringify(restored.saveState(null))), JSON.parse(JSON.stringify(state)));
  for (let i = 0; i < 15; i++) { game.simulation.advance(1000); restored.simulation.advance(1000); }
  assert.deepEqual(JSON.parse(JSON.stringify(restored.saveState(null))), JSON.parse(JSON.stringify(game.saveState(null))));
  const corrupt = structuredClone(state); corrupt.economy.logistics.operations[0].units++;
  assert.throws(() => Session.restore(corrupt));
  const badRoute = structuredClone(state); badRoute.economy.logistics.operations[0].index = 9999;
  assert.throws(() => Session.restore(badRoute));
});
test('pre-logistics saves default to an empty system and keep all stock', () => {
  const game = playable(), state = game.saveState(null);
  delete (state.economy as Partial<typeof state.economy>).logistics;
  const loaded = Session.restore(state).session;
  assert.deepEqual(loaded.economy.resources, game.economy.resources);
  assert.equal(loaded.economy.storage.logistics.operations.length, 0);
});
test('demolition drains production before removal and never deletes or duplicates cargo', () => {
  const game = playable(); game.simulation.advance(4000);
  assert.match(game.simulation.requestDemolition(farm)!, /mercancías/);
  const food = game.economy.resources.food;
  game.simulation.advance(10000);
  assert.equal(game.economy.storage.logistics.operations.length, 0);
  assert.equal(game.simulation.requestDemolition(farm), null);
  assert.equal(game.simulation.confirmDemolition(), null);
  assert.equal(game.map.getConstruction(farm), null);
  // Reserve consumption is the only loss; every produced unit is still in the warehouse.
  const produced = game.economy.history.read('food').filter(e => e.operation === 'production').reduce((n, e) => n + e.units, 0);
  assert.equal(game.economy.storage.warehouseAt(warehouse)!.food * U, produced);
  assert.ok(game.economy.resources.food <= food);
});
test('100×100 stress: many producers and trips conserve integer goods beyond the visual cap', () => {
  const { map, roads, workforce } = fixture();
  for (let x = 17; x < 98; x++) map.place(c(x, 1), 'road');
  for (let x = 18; x < 98; x += 2) { map.place(c(x, 2), 'farm'); map.place(c(x, 0), 'warehouse'); }
  roads.recalculate(map);
  const economy = new Economy({ gold: 0, food: 0, wood: 0 }, 100000);
  economy.recalculate(map, roads, workforce);
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    economy.advance(1000);
    peak = Math.max(peak, economy.storage.logistics.operations.length);
    for (const inv of economy.storage.inventories.saveState()) assert.ok(inv.goods.food >= 0 && inv.goods.wood >= 0);
  }
  assert.ok(peak > logisticsRules.maxSprites);
  for (const product of ['food', 'wood'] as const) {
    const produced = economy.history.read(product).filter(e => e.operation === 'production').reduce((n, e) => n + e.units, 0);
    assert.equal(economy.storage.totalsUnits[product], produced);
  }
  assert.ok(economy.storage.warehouseAt(c(18, 0))!.food > 0);
});
test('visual pooling, culling and pause never mutate economics or allocate extra sprites each frame', () => {
  const { logistics, storage } = fixture();
  storage.queueProduction(farm, 'food', U, 0);
  logistics.advance(logisticsRules.loadingMs, logisticsRules.loadingMs);
  const operation = logistics.operations[0];
  for (let i = 1; i < logisticsRules.maxSprites + 10; i++) logistics.operations.push({ ...structuredClone(operation), id: i + 1 });
  const images: { visible: boolean; x: number; y: number; texture: string }[] = [];
  const graphic = new Proxy({}, { get: () => () => graphic });
  const scene = { make: { graphics: () => graphic }, textures: { exists: () => true },
    cameras: { main: { worldView: { left: 0, right: 2400, top: 0, bottom: 2400 } } },
    add: { image: () => {
      const sprite = { visible: true, x: 0, y: 0, texture: '',
        setDepth() { return this; }, setTexture(value: string) { this.texture = value; return this; },
        setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
        setVisible(value: boolean) { this.visible = value; return this; }, setAlpha() { return this; } };
      images.push(sprite); return sprite;
    } } };
  const renderer = new TransportRenderer(scene as never, logistics);
  const before = logistics.saveState();
  renderer.update(1000, 1000);
  assert.equal(images.length, logisticsRules.maxSprites);
  const positions = images.map(image => [image.x, image.y, image.texture]);
  for (let frame = 0; frame < 50; frame++) renderer.update(1000, 1000);
  assert.equal(images.length, logisticsRules.maxSprites);
  assert.deepEqual(images.map(image => [image.x, image.y, image.texture]), positions);
  scene.cameras.main.worldView.left = 2000;
  renderer.update(1000, 1000);
  assert.ok(images.every(image => !image.visible));
  assert.deepEqual(logistics.saveState(), before);
});
