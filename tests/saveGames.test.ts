import assert from 'node:assert/strict';
import { test } from 'vitest';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { MapCamera } from '../src/map/MapCamera.ts';
import { legacyWorldSize, newWorld } from '../src/map/World.ts';
import { SaveSlots, autosaveMs, saveKey } from '../src/persistence/SaveSlots.ts';
import { Session } from '../src/persistence/Session.ts';

const cell = (column: number, row: number) => ({ column, row });
const farm = cell(1, 2), camp = cell(2, 2), warehouse = cell(3, 2), market = cell(4, 2);
const home = cell(5, 2), well = cell(5, 0), other = cell(6, 2);

function memory() {
  const items = new Map<string, string>();
  const backend = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
  return { backend, reopen: () => new SaveSlots(() => backend) };
}

function town(session = new Session()) {
  const { map, economy, population, simulation } = session;
  assert.ok(map.terrain.plantTree(cell(2, 4)));
  map.place(cell(0, 1), 'villageCenter');
  for (let x = 1; x <= 6; x++) map.place(cell(x, 1), 'road');
  // Insertion order matters for warehouse withdrawals. Place them out of grid order.
  map.place(cell(6, 0), 'warehouse');
  simulation.recalculate();
  for (const [where, type] of [[farm, 'farm'], [camp, 'lumberjack'], [warehouse, 'warehouse'],
    [market, 'market'], [home, 'house'], [well, 'well'], [other, 'house']] as const) map.place(where, type);
  simulation.recalculate();
  while (population.total < 8) assert.ok(population.immigrate(100) > 0);
  simulation.recalculate();
  assert.ok(economy.storage.depositProduction(farm, 'food', 230 * U));
  assert.ok(economy.storage.depositProduction(camp, 'wood', 60 * U));
  return session;
}

const jsonState = (game: Session) => JSON.parse(JSON.stringify(game.saveState(home)));

test('a new browser session restores exact world, selection, stock, housing, work, taxes and time', () => {
  const { reopen } = memory();
  const game = town();
  game.population.setHousingLevel(home, 2);
  game.economy.setTaxPolicy('high');
  game.simulation.advance(24_800);
  game.economy.setWarehouseAcceptance(warehouse, 'wood', false);
  game.economy.setWarehouseMarketDispatch(warehouse, 'food', false);
  game.economy.setWarehouseDraining(warehouse, true);
  game.economy.setMarketSale(market, 'wood', false);
  game.simulation.refreshWorkforce();
  game.simulation.setSpeed(3);
  game.simulation.setPaused(true);

  reopen().save(2, null, game, home);
  const { session: loaded, selection } = reopen().load(2);

  assert.deepEqual(selection, home);
  assert.deepEqual(jsonState(loaded), jsonState(game));
  assert.deepEqual(loaded.economy.resources, game.economy.resources);
  assert.equal(loaded.world.terrain, 'grass-v1');
  assert.deepEqual(loaded.map.terrain.at(cell(99, 99)), { ground: 'grass', obstacle: null });
  assert.equal(loaded.population.employed, game.population.employed);
  assert.equal(loaded.population.housingLevelAt(home), 2);
  assert.equal(loaded.connections.isConnected(market), true);
  assert.deepEqual(loaded.economy.storage.warehouseAt(warehouse)!.marketDispatch, { food: false, wood: true });
  assert.equal(loaded.simulation.water.suppliedAt(home), game.simulation.water.suppliedAt(home));
  assert.deepEqual(loaded.simulation.gameTime, game.simulation.gameTime);
  assert.equal(loaded.simulation.advance(120_000), false);
});

test('older saves default to enabled dispatch without changing acceptance or inventory', () => {
  const game = town();
  game.economy.setWarehouseAcceptance(warehouse, 'wood', false);
  const old = jsonState(game) as ReturnType<Session['saveState']>;
  for (const inventory of old.economy.inventories) delete inventory.marketDispatch;
  const { session: loaded } = Session.restore(old);
  assert.deepEqual(loaded.economy.storage.warehouseAt(warehouse), game.economy.storage.warehouseAt(warehouse));
  assert.deepEqual(loaded.economy.storage.warehouseAt(warehouse)!.marketDispatch, { food: true, wood: true });
});

test('camera movement preserves logistics and a save restores distant buildings and the camera', () => {
  const game = town();
  const camera = new MapCamera(game.world, game.map.villageCenter!);
  camera.setViewport({ x: 20, y: 40, size: 480 });
  const far = cell(99, 99);
  assert.equal(game.simulation.build(far, 'road'), null);
  const before = jsonState(game);
  const revision = game.connections.revision;
  camera.focus(far);
  camera.zoomAt({ x: 260, y: 280 }, 1.5);
  assert.equal(game.connections.revision, revision);
  assert.deepEqual(jsonState(game), before);

  const { reopen } = memory();
  assert.equal(reopen().autosave(game, far, camera.view), 1);
  const loaded = reopen().load(1);
  assert.deepEqual(loaded.selection, far);
  assert.deepEqual(loaded.camera, camera.view);
  assert.equal(loaded.session.map.getConstruction(far), 'road');
  assert.deepEqual(jsonState(loaded.session), before);
  const resized = new MapCamera(loaded.session.world, loaded.session.map.villageCenter!, loaded.camera);
  resized.setViewport({ x: 0, y: 0, size: 320 });
  assert.deepEqual(resized.bounds, camera.bounds);
});

test('loading a legacy 20 by 20 slot expands the world without shifting cells or rewriting the slot', () => {
  const oldWorld = { ...newWorld(), columns: legacyWorldSize, rows: legacyWorldSize };
  const game = town(new Session(oldWorld));
  const edge = cell(19, 19);
  assert.equal(game.simulation.build(edge, 'road'), null);
  game.simulation.advance(24_800);
  const before = jsonState(game);
  assert.equal(before.cells.length, 400);
  const { backend, reopen } = memory();
  const saves = reopen();
  saves.save(1, null, game, edge);
  const oldRaw = backend.getItem(saveKey(1));
  const { session: loaded, selection, camera } = saves.load(1);
  assert.equal(backend.getItem(saveKey(1)), oldRaw);
  assert.equal(camera, undefined);
  assert.deepEqual(selection, edge);
  assert.deepEqual(loaded.world, { ...oldWorld, columns: 100, rows: 100 });
  assert.equal(loaded.map.getConstruction(edge), 'road');
  assert.deepEqual(loaded.map.terrain.at(cell(99, 99)), { ground: 'grass', obstacle: null });
  assert.deepEqual(loaded.map.occupiedCells(), game.map.occupiedCells());
  assert.equal(loaded.connections.isConnected(market), true);
  const restored = jsonState(loaded);
  assert.deepEqual(restored.economy, before.economy);
  assert.deepEqual(restored.population, before.population);
  assert.deepEqual(restored.simulation, before.simulation);
  for (const session of [game, loaded]) session.simulation.advance(200);
  assert.deepEqual(jsonState(loaded).economy, jsonState(game).economy);
});

test('reloading before an hourly settlement and restock produces the same ledger as continuous play', () => {
  const game = town();
  game.simulation.advance(24_800);
  const { session: loaded } = Session.restore(jsonState(game));
  for (const session of [game, loaded]) {
    assert.equal(session.simulation.advance(199), false);
    assert.equal(session.simulation.advance(1), true);
    assert.equal(session.economy.simulatedTimeMs, 25_000);
    assert.equal(session.economy.history.read('gold').filter(event => event.operation === 'wages').length, 1);
    assert.equal(session.economy.history.read('gold').filter(event => event.operation === 'tax').length, 1);
    assert.ok(session.economy.history.read('food').some(event => event.timeMs === 25_000 && event.operation === 'production'));
  }
  assert.deepEqual(jsonState(loaded), jsonState(game));
  loaded.simulation.advance(75_500);
  game.simulation.advance(75_500);
  assert.deepEqual(jsonState(loaded), jsonState(game));
});

test('residential evolution keeps its progress and finishes on the same tick after loading', () => {
  const game = town();
  const progress = () => game.simulation.housing.at(home).improvement;
  for (let tick = 0; tick < 100 && progress() < 59; tick++) game.simulation.advance(1000);
  assert.equal(progress(), 59);
  assert.equal(game.population.housingLevelAt(home), 1);
  const { session: loaded } = Session.restore(jsonState(game));
  assert.equal(loaded.simulation.housing.at(home).improvement, 59);
  game.simulation.advance(1000);
  loaded.simulation.advance(1000);
  assert.equal(loaded.population.housingLevelAt(home), 2);
  assert.deepEqual(jsonState(loaded), jsonState(game));
});

test('three slots are independent and detaching for a new game preserves occupied saves', () => {
  const { reopen } = memory();
  const saves = reopen();
  const game = town();
  for (const slot of [1, 2, 3] as const) {
    game.simulation.advance(1000);
    saves.save(slot, null, game, home);
  }
  const fresh = new Session();
  saves.detach();
  assert.equal(saves.autosave(fresh, null), null);
  for (const slot of [1, 2, 3] as const) {
    assert.equal(reopen().load(slot).session.simulation.simulatedTimeMs, slot * 1000);
    assert.equal(saves.needsConfirmation(slot, saves.inspect(slot).raw), true);
  }
});

test('autosave takes an empty slot and keeps it unless another tab changed the save', () => {
  const { reopen } = memory();
  const game = town();
  const saves = reopen();
  assert.equal(autosaveMs, 60_000);
  assert.equal(saves.autosave(game, home), 1);
  game.simulation.advance(3000);
  assert.equal(saves.autosave(game, home), 1);
  assert.equal(reopen().load(1).session.simulation.simulatedTimeMs, 3000);
  const otherTab = reopen();
  const { raw } = otherTab.inspect(1);
  assert.equal(otherTab.needsConfirmation(1, raw), true);
  otherTab.save(1, raw, new Session(), null);
  assert.throws(() => saves.autosave(game, home), /ranura cambió/);
  assert.equal(reopen().load(1).session.simulation.simulatedTimeMs, 0);
});

test('invalid JSON, incompatible versions and inconsistent model state fail without replacing an active game', () => {
  const { backend, reopen } = memory();
  const game = town();
  game.simulation.advance(25_000);
  const saves = reopen();
  saves.save(1, null, game, home);
  const original = backend.getItem(saveKey(1))!;
  const bad = JSON.parse(original);
  bad.state.economy.inventories.find((entry: { id: string }) => entry.id.startsWith('warehouse:')).goods.food = -1;
  const missing = JSON.parse(original);
  delete missing.state.simulation.immigrationSeconds;
  const overstaffed = JSON.parse(original);
  overstaffed.state.population.workers[0][1] = 99;
  const unknownMap = JSON.parse(original);
  unknownMap.state.world.columns = 20;
  const invalidCamera = JSON.parse(original);
  invalidCamera.state.camera = { x: 50, y: 50, zoom: 999 };

  for (const raw of ['{', '{"version":99}', ...[bad, missing, overstaffed, unknownMap, invalidCamera].map(value => JSON.stringify(value))]) {
    backend.setItem(saveKey(2), raw);
    assert.throws(() => saves.load(2), /dañada|compatible/);
    assert.equal(saves.activeSlot, 1);
    assert.equal(backend.getItem(saveKey(1)), original);
  }
  assert.equal(game.simulation.simulatedTimeMs, 25_000);
});

test('a rejected storage write leaves the active slot and previous snapshot intact', () => {
  const { backend } = memory();
  let full = false;
  const saves = new SaveSlots(() => ({
    ...backend,
    setItem: (key, value) => {
      if (full) throw new DOMException('Quota', 'QuotaExceededError');
      backend.setItem(key, value);
    },
  }));
  const game = new Session();
  saves.save(1, null, game, null);
  const original = backend.getItem(saveKey(1));
  full = true;
  game.simulation.advance(1000);
  assert.throws(() => saves.autosave(game, null), { name: 'QuotaExceededError' });
  assert.equal(saves.activeSlot, 1);
  assert.equal(backend.getItem(saveKey(1)), original);
  assert.equal(game.simulation.simulatedTimeMs, 1000);
});

