import { deliverFixtureCargo } from './fixtures/logistics.ts';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import type { EconomicEvent } from '../src/economy/EconomicHistory';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population } from '../src/population/Population.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const c = (column: number, row: number) => ({ column, row });
const amount = (event: EconomicEvent) => event.units / (event.unitScale ?? U);
const taxEvents = (economy: Economy) => economy.history.read('gold').filter(event => event.operation === 'tax');

function town(residents = 20, interval = 1000) {
  const map = new ConstructionMap(20, 20), roads = new RoadConnections(), population = new Population();
  const economy = new Economy();
  map.place(c(0, 2), 'villageCenter');
  for (let x = 1; x <= 10; x++) {
    map.place(c(x, 2), 'road');
    map.place(c(x, 3), 'house');
    if (residents > 0) map.place(c(x, 1), 'farm');
  }
  const simulation = new SettlementSimulation(economy, population, interval, map, roads);
  simulation.recalculate();
  for (let i = 0; population.total < residents && i < 30; i++) population.immigrate(residents / 2);
  simulation.recalculate();
  assert.equal(population.total, residents);
  return { map, economy, population, simulation };
}

test.each([['low', 1], ['normal', 2], ['high', 4]] as const)('collects the %s policy using 20 residents and exact elapsed game time', (policy, income) => {
  const { economy, population, simulation } = town();
  assert.equal(economy.currentTaxPolicy, 'normal');
  economy.setTaxPolicy(policy);
  assert.equal(economy.taxIncomePerHour(population.total), income);
  simulation.advance(24_999);
  assert.deepEqual(taxEvents(economy), []);
  simulation.advance(1);
  const [tax] = taxEvents(economy);
  assert.equal(tax.timeMs, 25_000);
  assert.equal(tax.result, 'completed');
  assert.equal(tax.destination, 'treasury');
  assert.equal(amount(tax), income);
  const scale = tax.unitScale ?? U;
  assert.equal(tax.destinationBalance?.before, 150 * scale);
  assert.equal(tax.destinationBalance?.after, (150 + income) * scale);
});

test('policy changes do not recompute earlier seconds and a pause never adds revenue', () => {
  const { economy, simulation } = town();
  simulation.advance(10_000);
  economy.setTaxPolicy('high');
  assert.equal(economy.taxIncomePerHour(20), 4);
  simulation.setPaused(true);
  simulation.advance(90_000);
  assert.equal(economy.resources.gold, 150);
  assert.deepEqual(taxEvents(economy), []);
  simulation.setPaused(false);
  simulation.advance(15_000);
  assert.deepEqual(taxEvents(economy).map(amount), [3.2]);
  economy.setTaxPolicy('low');
  simulation.advance(25_000);
  assert.deepEqual(taxEvents(economy).map(amount), [3.2, 1]);
});

test.each([1, 2, 3] as const)('speed ×%i preserves the amount collected per simulated hour', speed => {
  const { economy, simulation } = town();
  simulation.setSpeed(speed);
  simulation.advance(75_000 / speed);
  assert.deepEqual(taxEvents(economy).map(amount), [2, 2, 2]);
});

test('tax attraction is applied once, is bounded and does not override immigration prerequisites', () => {
  const { economy, population } = town(0);
  assert.equal(population.migrationAttractiveness(20), 75);
  economy.setTaxPolicy('low');
  assert.equal(population.migrationAttractiveness(20, economy.taxMigrationModifier), 85);
  assert.equal(population.migrationAttractiveness(0, economy.taxMigrationModifier), 0);
  economy.setTaxPolicy('high');
  for (let i = 0; i < 3; i++) {
    assert.equal(population.migrationAttractiveness(20, economy.taxMigrationModifier), 55);
  }
  const capped = town(2);
  capped.economy.setTaxPolicy('low');
  assert.equal(capped.population.migrationAttractiveness(20, capped.economy.taxMigrationModifier), 100);
});

test('the settlement applies tax attractiveness to actual arrivals', () => {
  const normal = town(0, 5), high = town(0, 5);
  high.economy.setTaxPolicy('high');
  normal.simulation.advance(10_000);
  high.simulation.advance(10_000);
  assert.equal(normal.population.total, 3);
  assert.equal(high.population.total, 2);
});

test('construction and demolition keep treasury balances coherent and tax actual resident time', () => {
  const { map, economy, population, simulation } = town();
  const home = c(1, 3);
  const departing = population.residentsAt(home);
  assert.ok(departing > 0);
  simulation.advance(10_000);
  assert.equal(simulation.build(c(11, 3), 'house'), null);
  assert.equal(simulation.requestDemolition(home), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(map.getConstruction(home), null);
  assert.equal(economy.resources.gold, 140);
  simulation.advance(15_000);
  const [tax] = taxEvents(economy);
  assert.equal(amount(tax), (20 * 10 + (20 - departing) * 15) / 250);
  const scale = tax.unitScale ?? U;
  assert.equal(tax.destinationBalance?.before, 140 * scale);
  assert.equal(population.total, 20 - departing);
});

const farm = c(1, 1), camp = c(2, 1), warehouse = c(3, 1);
const market = c(4, 1), secondMarket = c(6, 1), home = c(5, 1), far = c(16, 1);
const warehouseId = 'warehouse:3,1', marketId = 'market:4,1';
function chain() {
  const map = new ConstructionMap(20, 20), roads = new RoadConnections();
  const economy = new Economy({ gold: 0, food: 20, wood: 0 });
  const ledger = economy.storage.inventories;
  map.place(c(0, 0), 'villageCenter');
  for (let x = 1; x <= 16; x++) map.place(c(x, 0), 'road');
  assert.ok(map.terrain.plantTree(c(2, 3)));
  for (const [cell, type] of [[farm, 'farm'], [camp, 'lumberjack'], [warehouse, 'warehouse'],
    [market, 'market'], [home, 'house'], [far, 'house']] as const) map.place(cell, type);
  const workforce = new Population();
  let marketWorkers = 1;
  const sync = () => {
    roads.recalculate(map);
    economy.recalculate(map, roads, {
      capacityFor: type => workforce.capacityFor(type),
      workersAt: cell => map.getConstruction(cell) === 'market' ? marketWorkers : 1,
    });
  };
  sync();
  const restock = () => { for (let i = 0; i < 5; i++) economy.distribution.advanceSecond();
  deliverFixtureCargo(economy); };
  const consume = (cell = home, residents = 1) =>
    economy.consumeHomes({ residencesSnapshot: [{ cell, residents }] }, 0.1);
  return { map, economy, ledger, sync, restock, consume, unstaff: () => { marketWorkers = 0; sync(); } };
}

test('restocking preserves global stock and stores both goods within the shared capacity', () => {
  const { economy, restock } = chain();
  assert.ok(economy.storage.depositProduction(farm, 'food', 110 * U));
  assert.ok(economy.storage.depositProduction(camp, 'wood', 70 * U));
  const before = economy.resources;
  restock();
  const stocked = economy.distribution.marketAt(market)!;
  assert.equal(stocked.food, 50);
  assert.equal(stocked.wood, 50);
  assert.equal(stocked.food + stocked.wood, stocked.capacity);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.storage.warehouseAt(warehouse)?.wood, 20);
  const transfers = economy.history.read('wood', marketId);
  assert.ok(transfers.every(transfer => transfer.origin.startsWith('cargo:') && transfer.destination === marketId));
  assert.equal(transfers.reduce((total, transfer) => total + amount(transfer), 0), 50);
});

test('wood can enter free space in a food-filled market after households buy food', () => {
  const { economy, restock, consume } = chain();
  assert.ok(economy.storage.depositProduction(farm, 'food', 120 * U));
  restock();
  assert.equal(economy.distribution.marketAt(market)?.food, 100);
  assert.ok(economy.storage.depositProduction(camp, 'wood', U));
  consume();
  restock();
  assert.equal(economy.distribution.marketAt(market)?.wood, 0.1);
  assert.equal(economy.distribution.marketAt(market)?.food, 99.9);
});

test('disabling wood freezes its market stock without blocking food replenishment or sales', () => {
  const { economy, ledger, restock, consume } = chain();
  assert.ok(economy.storage.depositProduction(camp, 'wood', 2 * U));
  assert.ok(ledger.transfer(warehouseId, marketId, 'wood', U));
  assert.ok(economy.setMarketSale(market, 'wood', false));
  assert.equal(ledger.transfer(warehouseId, marketId, 'wood', 1), false);
  assert.ok(economy.storage.depositProduction(farm, 'food', 2 * U));
  restock();
  consume();
  assert.equal(economy.distribution.marketAt(market)?.wood, 1);
  assert.equal(economy.distribution.marketAt(market)?.food, 1.9);
  assert.equal(economy.storage.warehouseAt(warehouse)?.wood, 1);
  assert.equal(economy.distribution.woodShortageAt(home), 0.02);
  assert.deepEqual(economy.history.read('gold').map(event => event.soldProduct), ['food']);
});

test('production, restocking and consumption complete the food and wood chains with distinct audited sales', () => {
  const { economy, consume } = chain();
  economy.advance(5000);
  assert.equal(economy.distribution.marketAt(market)?.food, 0);
  deliverFixtureCargo(economy);
  assert.equal(economy.distribution.marketAt(market)?.food, 1.28);
  assert.equal(economy.distribution.marketAt(market)?.wood, 1.12);
  consume();
  assert.equal(economy.resources.gold, 0.014);
  assert.equal(economy.perSecond.gold, 0.014);
  assert.deepEqual(economy.distribution.salesByProductPerSecond, { food: 0.1, wood: 0.02 });
  assert.equal(economy.distribution.woodShortageAt(home), 0);
  const sales = economy.history.read('gold').filter(event => event.operation === 'sale');
  assert.deepEqual(sales.map(event => [event.soldProduct, amount(event)]), [['food', 0.01], ['wood', 0.004]]);
});

test('a household can get food and wood from different markets without double consumption', () => {
  const { map, economy, sync, ledger, consume } = chain();
  map.place(secondMarket, 'market');
  sync();
  assert.ok(economy.storage.depositProduction(farm, 'food', 5 * U));
  assert.ok(economy.storage.depositProduction(camp, 'wood', 2 * U));
  assert.ok(ledger.transfer(warehouseId, marketId, 'food', 5 * U));
  assert.ok(ledger.transfer(warehouseId, marketId, 'wood', 1));
  assert.ok(ledger.transfer(warehouseId, 'market:6,1', 'wood', U));
  assert.ok(economy.setMarketSale(market, 'wood', false));
  for (let i = 0; i < 25; i++) consume();
  assert.equal(economy.distribution.marketAt(market)?.food, 2.5);
  assert.equal(economy.distribution.marketAt(market)?.wood, 1 / U);
  assert.equal(economy.distribution.marketAt(secondMarket)?.wood, 0.5);
  assert.equal(economy.resources.wood, 1.5);
  assert.equal(economy.resources.gold, 0.35);
  const soldWood = economy.history.read('gold').filter(event => event.soldProduct === 'wood');
  assert.equal(soldWood.length, 25);
  assert.ok(soldWood.every(event => event.origin === 'market:6,1' && amount(event) === 0.004));
});

test('empty, out-of-range and unstaffed supplies do not consume warehouse or market wood', () => {
  const { economy, ledger, restock, consume, unstaff } = chain();
  assert.ok(economy.storage.depositProduction(camp, 'wood', U));
  assert.equal(economy.storage.consumeInventory(warehouseId, 'wood', 3), 0);
  consume();
  assert.equal(economy.distribution.woodShortageAt(home), 0.02);
  restock();
  consume(far);
  assert.equal(economy.distribution.woodShortageAt(far), 0.02);
  consume(home, 0);
  assert.equal(economy.distribution.woodShortageAt(home), 0);
  unstaff();
  assert.ok(economy.storage.depositProduction(camp, 'wood', U));
  restock();
  consume();
  assert.equal(economy.distribution.woodShortageAt(home), 0.02);
  assert.equal(ledger.snapshot(marketId)?.goods.wood, U);
  assert.equal(economy.storage.warehouseAt(warehouse)?.wood, 1);
  assert.equal(economy.resources.gold, 0);
});

test('domestic wood purchases and inventory movements match at ×1 and ×3 for the same simulated time', () => {
  const prepare = () => {
    const state = town();
    for (let x = 2; x <= 10; x++) assert.equal(state.map.remove(c(x, 1)), true);
    state.map.place(c(2, 1), 'lumberjack');
    assert.ok(state.map.terrain.plantTree(c(2, 0)));
    state.map.place(c(3, 1), 'warehouse');
    state.map.place(c(4, 1), 'market');
    state.simulation.recalculate();
    assert.ok(state.population.workersAt(c(2, 1)) > 0);
    return state;
  };
  const normal = prepare(), fast = prepare();
  normal.simulation.advance(30_000);
  fast.simulation.setSpeed(3);
  fast.simulation.advance(10_000);
  assert.deepEqual(normal.economy.resources, fast.economy.resources);
  assert.deepEqual(normal.economy.history.read(), fast.economy.history.read());
  assert.ok(fast.economy.history.read('gold').some(event => event.soldProduct === 'wood'));
  assert.ok(fast.economy.history.read('gold').some(event => event.soldProduct === 'food'));
});
