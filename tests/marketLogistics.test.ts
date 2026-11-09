import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population } from '../src/population/Population.ts';
import { Session } from '../src/persistence/Session.ts';
import { logisticsRules } from '../src/economy/Logistics.ts';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots.ts';
const c = (column: number, row = 2) => ({ column, row });
const farm = c(1), source = c(3), target = c(9), other = c(12);
const from = 'warehouse:3,2', market = 'market:9,2';
function fixture() {
  const map = new ConstructionMap(100, 100), roads = new RoadConnections(), population = new Population();
  map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x < 20; x++) map.place(c(x, 1), 'road');
  map.place(farm, 'farm'); map.place(source, 'warehouse'); map.place(target, 'market'); map.place(other, 'warehouse');
  map.place(c(2), 'lumberjack'); map.terrain.plantTree(c(2, 4));
  map.place(c(10), 'house');
  const economy = new Economy({ food: 0, wood: 0, gold: 0 }, 10000);
  const workers = new Map<string, number>();
  const workforce = { workersAt: (cell: { column: number; row: number }) => workers.get(`${cell.column},${cell.row}`) ?? 1,
    capacityFor: (type: Parameters<Population['capacityFor']>[0]) => population.capacityFor(type) };
  const sync = () => { roads.recalculate(map); economy.recalculate(map, roads, workforce); };
  sync();
  const stock = (food = 0, wood = 0) => {
    if (food) assert.ok(economy.storage.depositProduction(farm, 'food', food * U));
    if (wood) assert.ok(economy.storage.depositProduction(c(2), 'wood', wood * U));
  };
  const order = () => { for (let i = 0; i < 5; i++) economy.distribution.advanceSecond(); };
  const travel = () => { for (let i = 0; i < 12; i++) economy.storage.logistics.advance(1000, economy.simulatedTimeMs); };
  return { map, roads, economy, ledger: economy.storage.inventories, logistics: economy.storage.logistics,
    workers, sync, stock, order, travel };
}
test('markets receive real food and wood only after pickup, walking and unloading', () => {
  const { economy, ledger, logistics, stock, order, travel } = fixture();
  stock(20, 10); const before = economy.resources;
  order();
  assert.equal(ledger.snapshot(market)!.used, 0);
  assert.equal(ledger.snapshot(from)!.goods.food, 20 * U);
  assert.deepEqual(ledger.snapshot(from)!.available, { food: 0, wood: 0 });
  assert.deepEqual(economy.resources, before);
  assert.ok(logistics.operations.every(op => op.kind === 'warehouse-to-market' && op.state === 'Loading'));
  logistics.advance(1000, 0);
  assert.equal(ledger.snapshot(from)!.used, 0);
  assert.equal(ledger.snapshot(market)!.used, 0);
  assert.deepEqual(economy.resources, before);
  travel();
  assert.deepEqual(ledger.snapshot(market)!.goods, { food: 20 * U, wood: 10 * U });
  assert.deepEqual(economy.resources, before);
  travel();
  const deliveries = economy.history.read().filter(event => event.destination === market);
  assert.equal(deliveries.length, 2);
  assert.ok(deliveries.every(event => event.operation === 'transfer'));
});
test('source reservations cannot be spent by construction, another courier or external exchange', () => {
  const { economy, ledger, logistics, stock } = fixture();
  stock(0, 10);
  assert.equal(logistics.queueTransfer(source, target, 'wood', 10 * U, true), 10 * U);
  assert.equal(economy.availableConstructionWood, 0);
  assert.equal(ledger.spendConstructionWood(1, 'build'), false);
  assert.equal(logistics.queueTransfer(source, other, 'wood', U, false), 0);
  assert.equal(ledger.exchange('0,1', 'trade', [{ warehouse: from, product: 'wood', units: U, direction: 'export' }], () => true), false);
  assert.equal(ledger.snapshot(from)!.goods.wood, 10 * U);
});
test('pending orders do not duplicate, and food/wood share the market capacity including future deliveries', () => {
  const { ledger, economy, stock, order, travel, logistics } = fixture();
  stock(150, 100);
  order(); const count = logistics.operations.length;
  assert.equal(ledger.reserved(market), 100 * U);
  for (let i = 0; i < 10; i++) order();
  assert.equal(logistics.operations.length, count);
  assert.equal(economy.distribution.marketAt(target)!.incomingWood, 50);
  travel();
  assert.equal(ledger.snapshot(market)!.used, 100 * U);
  assert.deepEqual(ledger.snapshot(market)!.goods, { food: 50 * U, wood: 50 * U });
});
test('shipping and receiving permissions and employees gate pickup; cargo remains safe after pickup', () => {
  const { economy, ledger, logistics, workers, sync, stock, order, travel } = fixture();
  stock(10);
  economy.setWarehouseMarketDispatch(source, 'food', false); order();
  assert.equal(logistics.operations.length, 0);
  economy.setWarehouseMarketDispatch(source, 'food', true); order();
  economy.setWarehouseMarketDispatch(source, 'food', false); travel();
  assert.equal(ledger.snapshot(from)!.goods.food, 10 * U);
  assert.equal(ledger.outgoing(from, 'food'), 10 * U);
  economy.setWarehouseMarketDispatch(source, 'food', true);
  workers.set('3,2', 0); sync(); travel();
  assert.equal(ledger.snapshot(market)!.used, 0);
  workers.set('3,2', 1); sync(); logistics.advance(1000, 0);
  economy.setMarketSale(target, 'food', false); travel();
  assert.equal(ledger.snapshot(from)!.goods.food, 0);
  assert.equal(logistics.goods().food, 10 * U);
  economy.setMarketSale(target, 'food', true); travel();
  assert.equal(ledger.snapshot(market)!.goods.food, 10 * U);
});
test('unarrived food is never sold; emergency requests aggregate households rather than meals', () => {
  const { economy, stock, logistics, travel } = fixture();
  stock(20);
  const consume = () => economy.consumeHomes({ residencesSnapshot: [{ cell: c(10), residents: 4 }] }, 0.1);
  consume(); const count = logistics.operations.length;
  for (let i = 0; i < 20; i++) consume();
  assert.equal(economy.resources.gold, 0);
  assert.equal(logistics.operations.length, count);
  assert.equal(logistics.operations[0].units, 5 * U);
  travel(); consume();
  assert.equal(economy.resources.gold, 0.04);
});
test('warehouse drainage uses physical trips and protects the empty source until the last delivery', () => {
  const { economy, ledger, stock, travel, logistics } = fixture();
  stock(10, 5); economy.storage.setDraining(source, true);
  economy.storage.advanceDrain();
  assert.equal(ledger.snapshot('warehouse:12,2')!.used, 0);
  assert.equal(ledger.snapshot(from)!.used, 15 * U);
  logistics.advance(1000, 0);
  assert.equal(ledger.snapshot(from)!.used, 0);
  assert.match(economy.storage.warehouseAt(source)!.drainStatus, /tránsito/);
  assert.ok(logistics.demolitionIssue(source));
  travel();
  assert.equal(ledger.snapshot('warehouse:12,2')!.used, 15 * U);
  assert.equal(logistics.demolitionIssue(source), null);
  assert.match(economy.storage.warehouseAt(source)!.drainStatus, /Vacío/);
});
test('cut roads block and detours resume warehouse shipments without losing reserved goods', () => {
  const { economy, map, sync, stock, order, logistics, travel, ledger } = fixture();
  stock(10); order(); logistics.advance(1000, 0);
  map.remove(c(6, 1)); sync(); travel();
  assert.equal(ledger.snapshot(market)!.used, 0);
  assert.equal(economy.resources.food, 10);
  assert.equal(logistics.operations[0].state, 'Blocked');
  for (let x = 5; x <= 7; x++) map.place(c(x, 0), 'road');
  sync(); travel();
  assert.equal(ledger.snapshot(market)!.goods.food, 10 * U);
});
function playable() {
  const game = new Session();
  game.map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x < 14; x++) game.map.place(c(x, 1), 'road');
  for (const [cell, type] of [[farm, 'farm'], [source, 'warehouse'], [target, 'market'], [other, 'warehouse'],
    [c(2), 'lumberjack'], [c(5), 'house'], [c(6), 'house'], [c(7), 'house'], [c(10), 'house']] as const) game.map.place(cell, type);
  game.map.terrain.plantTree(c(2, 4));
  game.simulation.recalculate();
  for (let i = 0; i < 8; i++) game.population.immigrate(100);
  game.simulation.recalculate();
  assert.ok(game.economy.storage.depositProduction(farm, 'food', 50 * U));
  assert.ok(game.economy.storage.depositProduction(c(2), 'wood', 20 * U));
  return game;
}
const json = (game: Session) => JSON.parse(JSON.stringify(game.saveState(null)));
test.each([0, 1000, 2000, 4000])('saving at %s ms after dispatch keeps orders, stock and both reservations exactly', elapsed => {
  const game = playable();
  game.economy.storage.dispatch(from, target, 'food', 10 * U, true);
  if (elapsed) game.simulation.advance(elapsed);
  const state = json(game), restored = Session.restore(state).session;
  assert.deepEqual(json(restored), state);
  for (let i = 0; i < 15; i++) { game.simulation.advance(1000); restored.simulation.advance(1000); }
  assert.deepEqual(json(restored), json(game));
});
test.each([1, 2, 3] as const)('pause and ×%s preserve shipments independently of rendering', speed => {
  const game = playable(), normal = playable();
  game.simulation.setSpeed(speed);
  for (let i = 0; i < 50; i++) { game.simulation.advance(100); normal.simulation.advance(100 * speed); }
  assert.deepEqual(game.economy.saveState(), normal.economy.saveState());
  game.simulation.setPaused(true); const state = json(game);
  game.simulation.advance(60000); assert.deepEqual(json(game), state);
});
test('version 8 saves retain the exact producer trips and continue through the extended engine', () => {
  const game = playable();
  game.economy.setMarketSale(target, 'food', false); game.economy.setMarketSale(target, 'wood', false);
  game.simulation.advance(3500);
  const state = json(game);
  assert.ok(state.economy.logistics.operations.length > 0);
  assert.ok(state.economy.logistics.operations.every(op => op.kind === 'producer-to-warehouse'));
  const raw = JSON.stringify({ version: 8, savedAt: 1, state });
  const slots = new SaveSlots(() => ({ getItem: key => key === saveKey(1) ? raw : null, setItem: () => {} }));
  const restored = slots.load(1).session;
  assert.deepEqual(json(restored), state);
  restored.simulation.advance(20000); game.simulation.advance(20000);
  assert.deepEqual(json(restored), json(game));
});
test('actual demolition commands protect pending endpoints and allow the source after all shipments finish', () => {
  const game = playable(), logistics = game.economy.storage.logistics;
  game.economy.storage.dispatch(from, target, 'food', U, true);
  assert.match(game.simulation.requestDemolition(target)!, /mercancías/);
  game.simulation.cancelDemolition();
  assert.match(game.simulation.requestDemolition(source)!, /mercancías/);
  game.simulation.advance(20000);
  assert.equal(game.economy.storage.warehouseAt(source)!.used, 0);
  assert.equal(logistics.demolitionIssue(source), null);
  assert.equal(game.simulation.requestDemolition(source), null);
  assert.equal(game.simulation.confirmDemolition(), null);
  assert.equal(game.map.getConstruction(source), null);
});
test('many markets use the existing bounded operations and conserve stock outside any camera', () => {
  const { economy, map, sync, stock, order, travel, ledger } = fixture();
  for (let x = 10; x < 20; x++) map.place(c(x, 0), 'market');
  sync(); stock(150, 100);
  const before = economy.resources;
  for (let i = 0; i < 10; i++) { order(); travel(); }
  assert.deepEqual(economy.resources, before);
  assert.ok(economy.history.read().some(event => event.destination.startsWith('market:')));
  for (const entry of ledger.saveState()) assert.ok(entry.goods.food >= 0 && entry.goods.wood >= 0);
  assert.ok(economy.storage.logistics.operations.length <= logisticsRules.maxTripsPerProducer);
});
