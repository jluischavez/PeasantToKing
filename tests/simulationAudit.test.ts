import assert from 'node:assert/strict';
import { test } from 'vitest';
import { EconomicHistory } from '../src/economy/EconomicHistory.ts';
import { Economy } from '../src/economy/Economy.ts';
import { Inventories, unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population, populationRules } from '../src/population/Population.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const cell = (column: number, row: number) => ({ column, row });
const farm = cell(1, 1), warehouse = cell(2, 1), market = cell(3, 1);
const farmId = 'farm:1,1', warehouseId = 'warehouse:2,1', marketId = 'market:3,1';
const nearId = 'house:4,1';

function village() {
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  for (let column = 1; column <= 5; column++) map.place(cell(column, 0), 'road');
  map.place(farm, 'farm');
  map.place(warehouse, 'warehouse');
  map.place(market, 'market');
  map.place(cell(4, 1), 'house');
  map.place(cell(5, 1), 'house');

  const economy = new Economy({ gold: 0, food: 20, wood: 0 }), population = new Population(), roads = new RoadConnections();
  const simulation = new SettlementSimulation(economy, population, populationRules.immigrationIntervalSeconds, map, roads);
  simulation.recalculate();
  for (let i = 0; i < 3; i++) population.immigrate(economy.availableFood);
  simulation.recalculate();

  const state = () => ({
    time: simulation.simulatedTimeMs,
    residents: population.total,
    workers: [farm, warehouse, market].map(building => population.workersAt(building)),
    resources: economy.resources,
    reserve: economy.storage.initialFoodReserve,
    warehouse: economy.storage.inventories.snapshot(warehouseId),
    market: economy.storage.inventories.snapshot(marketId),
    history: economy.history.read(),
  });
  return { simulation, economy, population, state };
}

test('pausing freezes production, consumption, sales and the economic history', () => {
  const { simulation, state } = village();
  assert.equal(simulation.advance(5000), true);
  const before = state();
  assert.ok(before.resources.gold > 0);
  assert.ok(before.history.some(event => event.operation === 'production'));
  assert.ok(before.history.some(event => event.operation === 'consumption'));

  simulation.setPaused(true);
  assert.equal(simulation.advance(30_000), false);
  assert.deepEqual(state(), before);
});

test('pausing before an interval boundary freezes immigration and market replenishment', () => {
  const { simulation, economy, population, state } = village();
  simulation.advance(4999);
  const before = state();
  assert.equal(before.residents, 6);
  assert.equal(before.market?.goods.food, 0);

  simulation.setPaused(true);
  simulation.advance(30_000);
  assert.deepEqual(state(), before);

  simulation.setPaused(false);
  assert.equal(simulation.advance(1), true);
  assert.equal(simulation.simulatedTimeMs, 5000);
  assert.ok(population.total > before.residents);
  assert.equal(economy.distribution.marketAt(market)?.food, 1.9);
});

test('resuming discards paused wall time, preserves the fractional tick and keeps the selected speed', () => {
  const { simulation, state } = village();
  simulation.setSpeed(3);
  assert.equal(simulation.advance(250), false);
  const before = state();

  simulation.setPaused(true);
  simulation.advance(60_000);
  simulation.setPaused(false);

  assert.equal(simulation.speed, 3);
  assert.equal(simulation.advance(83), false);
  assert.deepEqual(state(), before);
  assert.equal(simulation.advance(1), true);
  assert.equal(simulation.simulatedTimeMs, 1000);
  assert.equal(state().warehouse?.goods.food, U / 2);
});

test.each([2, 3] as const)('speed ×%i matches an equal duration at ×1 across economic systems', speed => {
  const normal = village(), accelerated = village();
  accelerated.simulation.setSpeed(speed);

  normal.simulation.advance(5000);
  const normalTime = normal.simulation.simulatedTimeMs;
  accelerated.simulation.advance(5000);
  assert.equal(accelerated.simulation.simulatedTimeMs, normalTime * speed);
  normal.simulation.advance(5000 * (speed - 1));
  assert.deepEqual(accelerated.state(), normal.state());
});

function inventories(history = new EconomicHistory(200, () => 5000)) {
  const ledger = new Inventories(history);
  const access = { capacity: 100, network: 'village', operational: true };
  ledger.create(warehouseId, { ...access, kind: 'warehouse' }, { food: 90, wood: 0 });
  ledger.create(marketId, { ...access, kind: 'market' }, { food: 30, wood: 0 });
  return { ledger, history };
}

test('a confirmed transfer records exact quantities and both balances in one event', () => {
  const { ledger, history } = inventories();
  assert.equal(ledger.transfer(warehouseId, marketId, 'food', 20), true);
  assert.deepEqual(history.read(), [{
    id: 1, timeMs: 5000, result: 'completed', operation: 'transfer',
    resource: 'food', units: 20, origin: warehouseId, destination: marketId,
    originBalance: { before: 90, after: 70 }, destinationBalance: { before: 30, after: 50 },
  }]);
  assert.equal(ledger.snapshot(warehouseId)!.goods.food + ledger.snapshot(marketId)!.goods.food, 120);
});

test('reading and filtering history leaves balances and the stored events unchanged', () => {
  const { ledger, history } = inventories();
  ledger.transfer(warehouseId, marketId, 'food', 20);
  const source = ledger.snapshot(warehouseId), destination = ledger.snapshot(marketId);
  const all = history.read();
  assert.deepEqual(history.read('food', warehouseId), all);
  assert.deepEqual(history.read('food', marketId), all);
  assert.deepEqual(history.read('wood'), []);
  assert.deepEqual(history.read('food', nearId), []);
  assert.notEqual(history.read(), all);
  assert.ok(Object.isFrozen(all[0]));
  assert.ok(Object.isFrozen(all[0].originBalance));
  assert.deepEqual(ledger.snapshot(warehouseId), source);
  assert.deepEqual(ledger.snapshot(marketId), destination);
  assert.equal(history.latestId, 1);
});

test('rejected transfers leave balances and the history unchanged', () => {
  const { ledger, history } = inventories();
  assert.equal(ledger.transfer(warehouseId, marketId, 'food', 91), false);
  assert.equal(ledger.transfer(warehouseId, marketId, 'food', 71), false);
  assert.equal(ledger.transfer(warehouseId, marketId, 'wood', 1), false);
  ledger.setProductEnabled(marketId, 'food', false);
  assert.equal(ledger.transfer(warehouseId, marketId, 'food', 1), false);
  assert.equal(ledger.snapshot(warehouseId)?.goods.food, 90);
  assert.equal(ledger.snapshot(marketId)?.goods.food, 30);
  assert.deepEqual(history.read(), []);
});

test('a bounded history discards the oldest entries without reusing identifiers', () => {
  const { ledger, history } = inventories(new EconomicHistory(3));
  for (let i = 0; i < 5; i++) assert.equal(ledger.transfer(warehouseId, marketId, 'food', 1), true);

  assert.deepEqual(history.read().map(event => event.id), [3, 4, 5]);
  assert.equal(history.latestId, 5);
  assert.equal(ledger.snapshot(warehouseId)!.goods.food + ledger.snapshot(marketId)!.goods.food, 120);
});

test('the audited food chain distinguishes production, transfers, consumption and gold from sales', () => {
  const { simulation, economy } = village();
  simulation.advance(5000);
  const events = economy.history.read();
  const lastTick = events.filter(event => event.timeMs === 5000);
  const [production, deposit, restock] = lastTick;
  assert.deepEqual([production.operation, production.destination, production.units], ['production', farmId, U / 2]);
  assert.deepEqual([deposit.operation, deposit.origin, deposit.destination, deposit.units],
    ['transfer', farmId, warehouseId, U / 2]);
  assert.deepEqual([restock.operation, restock.origin, restock.destination, restock.units],
    ['transfer', warehouseId, marketId, 2.5 * U]);
  assert.deepEqual(restock.originBalance, { before: 2.5 * U, after: 0 });
  assert.deepEqual(restock.destinationBalance, { before: 0, after: 2.5 * U });

  const meals = lastTick.filter(event => event.operation === 'consumption');
  const sales = lastTick.filter(event => event.operation === 'sale');
  assert.equal(meals.length, 2);
  assert.equal(sales.length, meals.length);
  let goldUnits = 0;
  let marketUnits = 2.5 * U;
  for (const [index, meal] of meals.entries()) {
    assert.equal(meal.resource, 'food');
    assert.equal(meal.origin, marketId);
    assert.deepEqual(meal.originBalance, { before: marketUnits, after: marketUnits - meal.units });
    assert.equal(meal.destinationBalance, undefined);
    const sale = sales[index];
    assert.equal(sale.resource, 'gold');
    assert.equal(sale.origin, marketId);
    assert.equal(sale.destination, 'treasury');
    assert.equal(sale.household, meal.destination);
    assert.equal(sale.units, meal.units);
    assert.deepEqual(sale.destinationBalance, { before: goldUnits, after: goldUnits + sale.units });
    goldUnits += sale.units;
    marketUnits -= meal.units;
  }
  assert.equal(goldUnits, 0.6 * U);
  assert.equal(marketUnits, 1.9 * U);
  assert.equal(economy.resources.food, 19.5);
  assert.equal(economy.resources.gold, 0.6);
  assert.equal(events.filter(event => event.timeMs < 5000 && event.operation === 'sale').length, 0);
  assert.ok(events.some(event => event.operation === 'consumption' && event.origin === 'initial-reserve'));
  assert.equal(economy.history.read('gold', nearId).length, 1);
  assert.deepEqual(economy.history.read('wood', marketId), []);
});

test('blocked production does not appear as a successful batch or delivery', () => {
  const { simulation, economy } = village();
  assert.equal(economy.setWarehouseAcceptance(warehouse, 'food', false), true);
  simulation.advance(1000);

  assert.equal(economy.storage.warehouseAt(warehouse)?.food, 0);
  assert.deepEqual(economy.history.read('food', farmId), []);
  assert.ok(economy.history.read('food').every(event => event.operation === 'consumption'));
});
