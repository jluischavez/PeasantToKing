import assert from 'node:assert/strict';
import { test } from 'vitest';
import { tradeGold, tradeIntervalMs } from '../src/economy/ExternalTrade.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { constructionDimensions } from '../src/map/ConstructionMap.ts';
import { constructionCosts, demolitionCost } from '../src/map/ConstructionCosts.ts';
import { TerrainMap, terrainCode } from '../src/map/Terrain.ts';
import { newWorld, proceduralTerrain } from '../src/map/World.ts';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots.ts';
import { Session } from '../src/persistence/Session.ts';
import { simulatedMsPerGameHour as hour } from '../src/simulation/GameTime.ts';
import { rankRules } from '../src/simulation/SettlementProgress.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';

const c = (column: number, row: number) => ({ column, row });
const house = c(4, 9), second = c(6, 9), depot = c(2, 9);

function flatRealm(center = 8, river?: number) {
  const world = newWorld(23, proceduralTerrain);
  const ground = new Uint8Array(world.columns * world.rows);
  if (river !== undefined) {
    for (let y = 0; y < world.rows; y++) ground[y * world.columns + river] = terrainCode('river');
  }
  const game = new Session(world, new TerrainMap(world.columns, world.rows, ground));
  const route = Array.from({ length: center }, (_, x) => c(x, 8));
  assert.ok(game.map.place(c(center, 8), 'villageCenter'));
  for (const cell of route) assert.ok(game.map.place(cell, 'road'));
  assert.ok(game.map.protectKingdomRoad(route));
  return game;
}

function populated(game: Session, residents: number) {
  game.simulation.recalculate();
  setFixtureRank(game.simulation, 'pueblo');
  const state = game.saveState(null);
  for (const residence of state.population.residences) {
    residence.residents = Math.min(residents, 4);
    residents -= residence.residents;
  }
  assert.equal(residents, 0);
  return Session.restore(state).session;
}

function outpost(residents = 12, houses = 1) {
  const game = flatRealm();
  for (let x = 1; x < 8; x++) assert.ok(game.map.place(c(x, 7), 'house'));
  assert.ok(game.map.place(depot, 'warehouse', constructionDimensions.warehouse));
  if (houses > 0) assert.ok(game.map.place(house, 'tradeHouse', constructionDimensions.tradeHouse));
  if (houses > 1) assert.ok(game.map.place(second, 'tradeHouse', constructionDimensions.tradeHouse));
  return populated(game, residents);
}

function stock(game: Session, food: number, wood: number, warehouse = 0) {
  const ledger = game.economy.storage.inventories;
  const state = ledger.saveState();
  const entry = state.filter(item => ledger.snapshot(item.id)?.kind === 'warehouse')[warehouse]!;
  entry.goods = { food: food * U, wood: wood * U };
  ledger.restoreState(state);
  return { ledger, id: entry.id, goods: () => ledger.snapshot(entry.id)!.goods };
}

function tradeOnly(game: Session) {
  game.economy.advance(tradeIntervalMs);
  game.simulation.trade.advance(game.economy.simulatedTimeMs);
}

test('Pueblo unlocks one 2×2 trading site, with one charge per placement and removal', () => {
  const game = flatRealm();
  const { simulation, map, economy } = game;
  assert.equal(simulation.build(house, 'tradeHouse'), 'Requiere rango de Pueblo');
  assert.deepEqual(rankRules.pueblo.minimum, { population: 24, happiness: 50, beauty: 30, gold: 500 });
  assert.deepEqual(rankRules.villa.minimum, { population: 60, happiness: 65, beauty: 55, gold: 800 });
  setFixtureRank(simulation, 'pueblo');
  assert.ok(map.terrain.plantTree(c(5, 10)));
  assert.ok(simulation.build(house, 'tradeHouse'));
  assert.ok(map.terrain.clear(c(5, 10), 'tree'));
  assert.ok(simulation.build(c(4, 7), 'tradeHouse')); // overlaps the royal road
  const before = economy.resources;
  assert.equal(simulation.build(house, 'tradeHouse'), null);
  assert.deepEqual(map.constructionAt(c(5, 10))?.cell, house);
  assert.ok(simulation.build(house, 'tradeHouse'));
  assert.equal(economy.resources.gold, before.gold - constructionCosts.tradeHouse.gold);
  assert.equal(economy.resources.wood, before.wood - constructionCosts.tradeHouse.wood);
  assert.equal(simulation.requestDemolition(c(5, 10)), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.ok(simulation.confirmDemolition());
  assert.deepEqual(simulation.trade.sites, []);
  assert.equal(map.getConstruction(house), null);
  assert.equal(economy.resources.gold, before.gold - constructionCosts.tradeHouse.gold - demolitionCost.gold);
});

test('a municipal road on the far side of the center trades only over a continuous exterior route with a bridge', () => {
  const base = flatRealm(8, 10);
  const site = c(12, 9);
  for (let x = 1; x < 7; x++) assert.ok(base.map.place(c(x, 7), 'house'));
  assert.ok(base.map.place(depot, 'warehouse', constructionDimensions.warehouse));
  const game = populated(base, 12);
  const { map, connections, simulation } = game;
  for (const x of [9, 11, 12]) assert.ok(map.place(c(x, 8), 'road'));
  assert.ok(map.placeBridge({ from: c(9, 8), to: c(11, 8) }));
  assert.ok(map.place(site, 'tradeHouse', constructionDimensions.tradeHouse));
  simulation.recalculate();
  const { trade } = simulation;
  const { goods } = stock(game, 200, 0);
  trade.configure(site, 'food', { mode: 'export', reserve: 0, target: 0 });
  assert.ok(connections.isConnected(site));
  assert.match(trade.at(site)!.issue!, /ruta vial/);
  tradeOnly(game);
  assert.equal(goods().food, 200 * U);
  for (const x of [7, 8, 9]) assert.ok(map.place(c(x, 9), 'road'));
  assert.ok(map.upgradeRoad(c(8, 9), 2));
  assert.ok(map.upgradeRoad(c(8, 9), 3));
  simulation.recalculate();
  assert.equal(trade.at(site)?.exterior, true);
  tradeOnly(game);
  assert.equal(goods().food, 140 * U);
  assert.ok(map.remove(c(8, 9)));
  simulation.recalculate();
  assert.equal(connections.isConnected(site), true);
  assert.match(trade.at(site)!.issue!, /ruta vial/);
  tradeOnly(game);
  assert.equal(goods().food, 140 * U);
  assert.match(simulation.demolitionIssue(c(7, 8))!, /pertenece al reino/);
});

test.each([[2, 0], [4, 1], [12, 2]])('with %i residents the assigned staff of %i sets actual capacity', (residents, workers) => {
  const game = outpost(residents);
  const { trade } = game.simulation;
  stock(game, 200, 0);
  assert.equal(game.population.workersAt(house), workers);
  assert.equal(game.population.activePopulation, game.population.employed + game.population.unemployed);
  trade.configure(house, 'food', { mode: 'export', reserve: 0, target: 150 });
  tradeOnly(game);
  assert.equal(trade.at(house)?.capacity, workers * 30);
  assert.equal(trade.history.at(-1)?.sold.food ?? 0, workers * 30 * U);
});

test('exports share the load, honor reserves and settle once without touching special stock', () => {
  const game = outpost();
  const { trade } = game.simulation;
  const { goods } = stock(game, 170, 90);
  trade.configure(house, 'food', { mode: 'export', reserve: 150, target: 150 });
  trade.configure(house, 'wood', { mode: 'export', reserve: 30, target: 30 });
  const gold = game.economy.resources.gold;
  trade.advance(tradeIntervalMs - 1);
  assert.equal(trade.history.length, 0);
  tradeOnly(game);
  const trip = trade.history[0]!;
  assert.deepEqual(trip.sold, { food: 20 * U, wood: 40 * U });
  assert.equal(tradeGold(trip.exports), 25.6);
  assert.deepEqual(game.economy.history.read().filter(event => event.operation === 'export').map(event => event.resource),
    ['gold', 'food', 'wood']);
  assert.equal(game.economy.resources.gold, gold + 25.6);
  assert.deepEqual(goods(), { food: 150 * U, wood: 50 * U });
  trade.advance(game.economy.simulatedTimeMs);
  assert.equal(trade.history.length, 1);
  tradeOnly(game);
  tradeOnly(game);
  assert.deepEqual(goods(), { food: 150 * U, wood: 30 * U });
  assert.deepEqual(game.economy.storage.inventories.snapshot('initial-reserve')!.goods, { food: 20 * U, wood: 0 });
  assert.deepEqual(game.economy.storage.inventories.snapshot('construction-reserve')!.goods, { food: 0, wood: 50 * U });
  assert.equal(trade.history.length, 2);
});

test('multiple houses share actual inventory, the highest reserve and any import target', () => {
  const game = outpost(16, 2);
  const { trade } = game.simulation;
  const { goods } = stock(game, 260, 0);
  trade.configure(house, 'food', { mode: 'export', reserve: 0, target: 0 });
  trade.configure(second, 'food', { mode: 'export', reserve: 160, target: 0 });
  tradeOnly(game);
  assert.deepEqual(trade.history.map(trip => trip.sold.food / U), [60, 40]);
  assert.equal(goods().food, 160 * U);
  trade.configure(second, 'food', { mode: 'import', reserve: 0, target: 180 });
  tradeOnly(game);
  tradeOnly(game);
  assert.equal(trade.history.length, 3);
  assert.equal(goods().food, 180 * U);
  assert.deepEqual(trade.totals, { exports: 32, imports: 13 });
});

test('imports honor capacity, targets, prices, and available Crown credit', () => {
  const game = outpost();
  const { trade } = game.simulation;
  const { goods } = stock(game, 290, 10);
  trade.configure(house, 'wood', { mode: 'import', reserve: 0, target: 25 });
  tradeOnly(game);
  assert.equal(trade.history.length, 0);
  stock(game, 0, 10);
  tradeOnly(game);
  assert.equal(goods().wood, 25 * U);
  assert.equal(trade.totals.imports, 13.5);
  assert.ok(game.economy.payBuildingCost({ gold: 326.5, wood: 0 }, 'construction', 'fixture'));
  assert.equal(game.economy.credit.balance, -190);
  trade.configure(house, 'food', { mode: 'import', reserve: 0, target: 100 });
  tradeOnly(game);
  const trip = trade.history.at(-1)!;
  assert.equal(trip.bought.food, Math.floor(10 * 100 * U / 65));
  assert.equal(game.economy.credit.balance, -190 - tradeGold(trip.imports));
  tradeOnly(game);
  assert.equal(trade.history.length, 2);
  trade.configure(house, 'wood', { mode: 'export', reserve: 0, target: 25 });
  trade.configure(house, 'food', { mode: 'off', reserve: 0, target: 100 });
  tradeOnly(game);
  assert.ok(game.economy.credit.debt < 190);
  assert.equal(trade.totals.exports, 12);
});

test('a warehouse manifest is validated in full before settling and can be declined atomically', () => {
  const game = outpost();
  const { ledger, id, goods } = stock(game, 20, 270);
  const network = game.connections.networkFor(house)!;
  const sale = { warehouse: id, product: 'food', units: 10 * U, direction: 'export' } as const;
  const order = { warehouse: id, product: 'wood', units: 21 * U, direction: 'import' } as const;
  assert.equal(ledger.exchange(network, 'test', [sale, order], () => assert.fail('invalid manifest called payment')), false);
  assert.equal(ledger.exchange(network, 'test', [sale], () => false), false);
  assert.deepEqual(goods(), { food: 20 * U, wood: 270 * U });
});

test.each([1, 2, 3] as const)('pause and ×%i use simulated time, and reload preserves the next trip and ledger', speed => {
  const game = outpost(24);
  const { simulation } = game;
  stock(game, 200, 60);
  const preference = { mode: 'export', reserve: 10, target: 30 } as const;
  simulation.trade.configure(house, 'wood', preference);
  simulation.setSpeed(speed);
  simulation.setPaused(true);
  assert.equal(simulation.advance(tradeIntervalMs), false);
  assert.equal(simulation.simulatedTimeMs, 0);
  simulation.setPaused(false);
  const delta = Math.floor((tradeIntervalMs - 1000) / speed);
  simulation.advance(delta);
  const load = (source: Session) => Session.restore(JSON.parse(JSON.stringify(source.saveState(house)))).session;
  const restored = load(game);
  assert.deepEqual(restored.simulation.trade.at(house)?.preferences.wood, preference);
  assert.equal(restored.simulation.trade.at(house)?.nextAt, tradeIntervalMs);
  assert.equal(restored.simulation.trade.history.length, 0);
  restored.simulation.advance(1001);
  game.simulation.advance(1001);
  assert.equal(restored.simulation.trade.history.length, 1);
  assert.equal(JSON.stringify(restored.economy.saveState()), JSON.stringify(game.economy.saveState()));
  const again = load(restored);
  again.simulation.advance(1000);
  assert.equal(again.simulation.trade.history.length, 1);
  assert.deepEqual(again.simulation.trade.totals, restored.simulation.trade.totals);
});

test('version 4 saves retain their inventory and a skipped Pueblo tutorial', () => {
  const game = outpost(12, 0);
  game.simulation.progress.markChapter('pueblo', 'tutorial', 'skipped');
  const { trade, ...simulation } = game.saveState(null).simulation;
  const raw = JSON.stringify({ version: 4, savedAt: 1, state: { ...game.saveState(null), simulation } });
  const saves = new SaveSlots(() => ({ getItem: key => key === saveKey(1) ? raw : null, setItem: () => {} }));
  const { session } = saves.load(1);
  assert.deepEqual(session.simulation.trade.sites, []);
  assert.deepEqual(session.simulation.progress.chapter('pueblo'), { tutorial: 'skipped' });
  assert.deepEqual(session.economy.saveState(), game.economy.saveState());
  assert.equal(session.map.getConstruction(depot), 'warehouse');
  assert.equal(session.takeIntroduction(), false);
});

test('warehouse dispatch protection and acceptance apply to exterior shipments', () => {
  const game = outpost();
  const { trade } = game.simulation;
  const { goods } = stock(game, 100, 10);
  assert.ok(game.economy.setWarehouseMarketDispatch(depot, 'food', false));
  assert.ok(game.economy.setWarehouseAcceptance(depot, 'wood', false));
  trade.configure(house, 'food', { mode: 'export', reserve: 0, target: 0 });
  trade.configure(house, 'wood', { mode: 'import', reserve: 0, target: 50 });
  tradeOnly(game);
  assert.equal(trade.history.length, 0);
  assert.deepEqual(goods(), { food: 100 * U, wood: 10 * U });
});

const firstShop = c(15, 9), secondShop = c(18, 9);

function tradeTown(farms: number, camps: number, shops = 1, leanSupply = false) {
  const game = flatRealm(22);
  const { map } = game;
  for (let x = 2; x <= 9; x++) assert.ok(map.place(c(x, 7), 'house'));
  for (const x of leanSupply ? [6] : [1, 6, 10]) assert.ok(map.place(c(x, 9), 'market'));
  for (const x of [4, 9]) assert.ok(map.place(c(x, 9), 'well'));
  for (const x of leanSupply ? [3, 7] : [3, 7, 12]) assert.ok(map.place(c(x, 9), 'warehouse'));
  for (let x = 11; x < 11 + farms; x++) assert.ok(map.place(c(x, 7), 'farm'));
  for (let x = 17; x < 17 + camps; x++) {
    assert.ok(map.place(c(x, 7), 'lumberjack'));
    assert.ok(map.terrain.plantTree(c(x, 6)));
  }
  const town = populated(game, 30);
  stock(town, 120, 0);
  if (shops > 0) assert.equal(town.simulation.build(firstShop, 'tradeHouse'), null);
  if (shops > 1) {
    // Both projects start with the same production and a funded construction-material inventory.
    stock(town, 120, 25);
    assert.equal(town.simulation.build(secondShop, 'tradeHouse'), null);
  }
  return town;
}

function runDays(game: Session, days: number) {
  const needs = () => game.simulation.needs.summarize(game.population.residencesSnapshot).percentages;
  let reached = 0;
  let shortageHours = 0;
  let woodCoveredHours = 0;
  for (let h = 1; h <= 24 * days; h++) {
    game.simulation.advance(hour);
    const { crown } = game.simulation;
    const bill = crown.obligation;
    if (bill && !bill.paid && game.economy.credit.balance >= bill.gold) assert.ok(game.simulation.payTribute(bill.dueAt));
    if (!reached && game.economy.credit.balance >= 800) reached = h;
    const coverage = needs();
    if ((coverage?.food ?? 0) < 99.99) shortageHours++;
    if ((coverage?.wood ?? 0) > 0) woodCoveredHours++;
  }
  return { reached, shortageHours, woodCoveredHours, ...game.simulation.trade.totals, gold: game.economy.credit.balance,
    food: needs()?.food ?? 0, wood: needs()?.wood ?? 0, population: game.population.total };
}

test('A–C: three days of food surplus, no surplus, and excessive sales during a shortage', () => {
  const balanced = tradeTown(4, 1);
  balanced.simulation.trade.configure(firstShop, 'food', { mode: 'export', reserve: 150, target: 150 });
  const noSurplus = tradeTown(4, 1);
  noSurplus.simulation.trade.configure(firstShop, 'food', { mode: 'export', reserve: 901, target: 150 });
  const safe = tradeTown(1, 1, 1, true), risky = tradeTown(1, 1, 1, true);
  for (const game of [safe, risky]) {
    stock(game, 180, 0);
    stock(game, 180, 0, 1);
  }
  safe.simulation.trade.configure(firstShop, 'food', { mode: 'export', reserve: 150, target: 150 });
  risky.simulation.trade.configure(firstShop, 'food', { mode: 'export', reserve: 0, target: 150 });
  const a = runDays(balanced, 3), b = runDays(noSurplus, 3), cSafe = runDays(safe, 3), cRisk = runDays(risky, 3);
  assert.ok(a.exports > 0 && a.exports <= 230.4);
  assert.equal(a.food, 100);
  assert.equal(b.exports, 0);
  assert.ok(cRisk.exports > cSafe.exports && cRisk.shortageHours > cSafe.shortageHours);
}, 20_000);

test('D–F: specialized wood exports, imports with a real cost, and two houses with higher upkeep', () => {
  const single = tradeTown(4, 3), double = tradeTown(4, 3, 2), importer = tradeTown(4, 0);
  for (const game of [single, double]) {
    for (const site of game.simulation.trade.sites) {
      game.simulation.trade.configure(site, 'wood', { mode: 'export', reserve: 30, target: 30 });
    }
  }
  importer.simulation.trade.configure(firstShop, 'wood', { mode: 'import', reserve: 30, target: 75 });
  assert.ok(double.economy.operatingCostsPerHour(0).maintenance > single.economy.operatingCostsPerHour(0).maintenance);
  const initialImporterGold = importer.economy.credit.balance;
  const d = runDays(single, 3), e = runDays(importer, 3), f = runDays(double, 3);
  assert.ok(d.exports > 0 && single.simulation.trade.history.every(trip => trip.sold.food === 0));
  assert.ok(e.imports > 0 && e.exports === 0 && e.woodCoveredHours > 0 && e.gold < initialImporterGold);
  assert.ok(f.exports > d.exports && f.gold - d.gold < f.exports - d.exports);
}, 20_000);

test('G: after the investment and tribute, a wood-exporting Pueblo saves 800 earlier', () => {
  const exporter = tradeTown(4, 3), local = tradeTown(4, 3, 0);
  exporter.simulation.trade.configure(firstShop, 'wood', { mode: 'export', reserve: 30, target: 30 });
  const withTrade = runDays(exporter, 6), without = runDays(local, 6);
  assert.ok(withTrade.reached > 24 && withTrade.reached < without.reached);
  assert.ok(withTrade.exports > constructionCosts.tradeHouse.gold);
}, 20_000);
