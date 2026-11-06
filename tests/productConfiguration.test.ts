import assert from 'node:assert/strict';
import { test } from 'vitest';
import { productIds, marketProductIds, productNames, isProductId } from '../src/economy/Products.ts';
import type { ProductId, ProductFlags } from '../src/economy/Products.ts';
import { Economy } from '../src/economy/Economy.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population } from '../src/population/Population.ts';
import { distributionRules } from '../src/economy/Distribution.ts';

const cell = (column: number, row: number) => ({ column, row });
const farm = cell(1, 1), camp = cell(2, 1);
const firstWarehouse = cell(3, 1), secondWarehouse = cell(4, 1);
const firstMarket = cell(5, 1), secondMarket = cell(9, 1), home = cell(6, 1);
const warehouseId = 'warehouse:3,1', otherWarehouseId = 'warehouse:4,1';
const marketId = 'market:5,1', otherMarketId = 'market:9,1';
function setup() {
  const map = new ConstructionMap(20, 20);
  map.place(cell(0, 0), 'villageCenter');
  for (let x = 1; x <= 12; x++) map.place(cell(x, 0), 'road');
  for (const [position, type] of [
    [farm, 'farm'], [camp, 'lumberjack'], [firstWarehouse, 'warehouse'],
    [secondWarehouse, 'warehouse'], [firstMarket, 'market'], [secondMarket, 'market'], [home, 'house'],
  ] as const) map.place(position, type);
  const economy = new Economy({ gold: 0, food: 20, wood: 0 }), roads = new RoadConnections(), population = new Population();
  const counts = new Map<string, number>();
  const workforce = {
    workersAt: (position: { column: number; row: number }) =>
      counts.get(position.column + ',' + position.row) ?? 1,
    capacityFor: (type: Parameters<Population['capacityFor']>[0]) => population.capacityFor(type),
  };
  const sync = () => {
    roads.recalculate(map);
    economy.recalculate(map, roads, workforce);
  };
  sync();
  const consume = () => economy.consumeHomes({ residencesSnapshot: [{ cell: home, residents: 4 }] }, 0.1);
  const restock = () => {
    for (let i = 0; i < distributionRules.restockIntervalSeconds; i++) economy.distribution.advanceSecond();
  };
  return { map, economy, roads, counts, sync, consume, restock, ledger: economy.storage.inventories };
}

test('product identifiers are centralized and only current products are configurable', () => {
  assert.deepEqual(productIds, ['food', 'wood']);
  assert.deepEqual(marketProductIds, ['food', 'wood']);
  assert.deepEqual(productNames, { food: 'Comida', wood: 'Madera' });
  for (const value of ['stone', 'clay', 'gold', '__proto__', 'constructor', undefined, null]) {
    assert.equal(isProductId(value), false);
  }
  const { economy } = setup();
  assert.equal(economy.setWarehouseAcceptance(firstWarehouse, 'stone' as ProductId, true), false);
  assert.equal(economy.setMarketSale(firstMarket, 'wood', true), true);
  assert.equal(economy.setMarketSale(firstMarket, 'wood', false), true);
  assert.equal(economy.setMarketSale(firstMarket, 'food', 'yes' as unknown as boolean), false);
  assert.equal(economy.setWarehouseAcceptance(cell(19, 19), 'food', false), false);
  assert.equal(economy.setMarketSale(firstWarehouse, 'food', false), false);
});

test('default settings are enabled and each building keeps independent configuration', () => {
  const { economy, sync } = setup();
  assert.deepEqual(economy.storage.warehouseAt(firstWarehouse)!.accepts, { food: true, wood: true });
  assert.deepEqual(economy.distribution.marketAt(firstMarket)!.sells, { food: true, wood: true });
  economy.setWarehouseAcceptance(firstWarehouse, 'food', false);
  economy.setMarketSale(firstMarket, 'food', false);
  for (let i = 0; i < 10; i++) sync();
  assert.deepEqual(economy.storage.warehouseAt(firstWarehouse)!.accepts, { food: false, wood: true });
  assert.deepEqual(economy.storage.warehouseAt(secondWarehouse)!.accepts, { food: true, wood: true });
  assert.equal(economy.distribution.marketAt(firstMarket)!.sells.food, false);
  assert.equal(economy.distribution.marketAt(secondMarket)!.sells.food, true);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.capacity, 300);
  assert.equal(economy.distribution.marketAt(firstMarket)!.capacity, 100);
});

test('warehouse acceptance filters incoming goods but preserves stock and its shared capacity', () => {
  const { economy } = setup();
  economy.storage.depositProduction(farm, 'food', 100 * U);
  economy.storage.depositProduction(camp, 'wood', 200 * U);
  const before = economy.resources;
  economy.setWarehouseAcceptance(firstWarehouse, 'food', false);
  economy.setWarehouseAcceptance(firstWarehouse, 'wood', false);
  const inventory = economy.storage.warehouseAt(firstWarehouse)!;
  assert.equal(inventory.food, 100);
  assert.equal(inventory.wood, 200);
  assert.equal(inventory.used, 300);
  assert.equal(inventory.free, 0);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.storage.depositProduction(farm, 'food', U), true);
  assert.equal(economy.storage.warehouseAt(secondWarehouse)!.food, 1);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.used, 300);
});

test('production searches another accepting warehouse and blocks only the rejected product if none exists', () => {
  const { economy } = setup();
  economy.setWarehouseAcceptance(firstWarehouse, 'food', false);
  economy.advance(1000);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.food, 0);
  assert.equal(economy.storage.warehouseAt(secondWarehouse)!.food, 0.5);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.wood, 2 / 3);
  economy.setWarehouseAcceptance(secondWarehouse, 'food', false);
  assert.equal(economy.perSecond.food, 0);
  assert.equal(economy.perSecond.wood, 2 / 3);
  assert.equal(economy.productivityAt(farm)!.storageBlocked, true);
  assert.equal(economy.productivityAt(camp)!.storageBlocked, false);
  const before = economy.resources;
  economy.advance(1000);
  assert.equal(economy.resources.food, before.food);
  assert.equal(economy.resources.wood, before.wood + 2 / 3);
  economy.setWarehouseAcceptance(firstWarehouse, 'food', true);
  assert.equal(economy.perSecond.food, 0.5);
  assert.equal(economy.productivityAt(farm)!.storageBlocked, false);
});

test('central transfer cannot bypass acceptance even for warehouse-to-warehouse movements', () => {
  const { economy, ledger } = setup();
  economy.storage.depositProduction(farm, 'food', U);
  economy.setWarehouseAcceptance(secondWarehouse, 'food', false);
  const before = economy.resources;
  assert.equal(ledger.transfer(warehouseId, otherWarehouseId, 'food', 1), false);
  assert.deepEqual(economy.resources, before);
  economy.setWarehouseAcceptance(secondWarehouse, 'food', true);
  assert.equal(ledger.transfer(warehouseId, otherWarehouseId, 'food', 1), true);
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.storage.warehouseAt(secondWarehouse)!.food, 1 / U);
});

test('rejecting warehouse food still permits markets to withdraw already stored food', () => {
  const { economy, restock } = setup();
  economy.storage.depositProduction(farm, 'food', 10 * U);
  economy.setWarehouseAcceptance(firstWarehouse, 'food', false);
  const before = economy.resources;
  restock();
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.food, 0);
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 10);
  assert.deepEqual(economy.resources, before);
});

test('a warehouse receives reserved wood, sends food, and resumes wood shipments independently', () => {
  const { economy, ledger, restock, sync } = setup();
  assert.equal(economy.setWarehouseMarketDispatch(firstWarehouse, 'wood', false), true);
  assert.equal(economy.setWarehouseMarketDispatch(firstMarket, 'wood', false), false);
  sync();
  assert.deepEqual(economy.storage.warehouseAt(firstWarehouse)!.accepts, { food: true, wood: true });
  assert.deepEqual(economy.storage.warehouseAt(firstWarehouse)!.marketDispatch, { food: true, wood: false });
  assert.deepEqual(economy.storage.warehouseAt(secondWarehouse)!.marketDispatch, { food: true, wood: true });
  assert.ok(economy.storage.depositProduction(farm, 'food', 100 * U));
  assert.ok(economy.storage.depositProduction(camp, 'wood', 60 * U));
  const before = economy.resources;
  assert.equal(ledger.transfer(warehouseId, marketId, 'wood', U), false);
  restock();
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 100);
  assert.equal(economy.distribution.marketAt(firstMarket)!.wood, 0);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.wood, 60);
  assert.deepEqual(economy.resources, before);

  assert.ok(economy.payBuildingCost({ gold: 0, wood: 5 }, 'construction', 'road:1,2'));
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.wood, 55);
  const afterConstruction = economy.resources;
  economy.setWarehouseAcceptance(firstWarehouse, 'wood', false);
  economy.setWarehouseMarketDispatch(firstWarehouse, 'wood', true);
  restock();
  assert.equal(economy.distribution.marketAt(secondMarket)!.wood, 55);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.wood, 0);
  assert.deepEqual(economy.resources, afterConstruction);
});

test('draining moves reserved goods to another accepting warehouse without sending them to markets', () => {
  const { economy, restock } = setup();
  assert.ok(economy.storage.depositProduction(camp, 'wood', 10 * U));
  for (const warehouse of [firstWarehouse, secondWarehouse]) {
    economy.setWarehouseMarketDispatch(warehouse, 'wood', false);
  }
  const before = economy.resources;
  economy.setWarehouseDraining(firstWarehouse, true);
  economy.setWarehouseDraining(secondWarehouse, true);
  economy.storage.advanceDrain();
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.wood, 10);
  economy.setWarehouseDraining(secondWarehouse, false);
  economy.storage.advanceDrain();
  restock();
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.wood, 0);
  assert.equal(economy.storage.warehouseAt(secondWarehouse)!.wood, 10);
  assert.equal(economy.distribution.marketAt(firstMarket)!.wood, 0);
  assert.equal(economy.distribution.marketAt(secondMarket)!.wood, 0);
  assert.deepEqual(economy.resources, before);
});

test('food kept in reserve is excluded from the estimate of pending market supply', () => {
  const { economy, restock } = setup();
  assert.ok(economy.storage.depositProduction(farm, 'food', 10 * U));
  economy.setWarehouseMarketDispatch(firstWarehouse, 'food', false);
  restock();
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 0);
  assert.equal(economy.storage.connectedWarehouseFood(true), 0);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.food, 10);
});

test('disabling sales preserves market stock, blocks replenishment and consumption, and generates no income', () => {
  const { economy, restock, consume, ledger } = setup();
  economy.storage.depositProduction(farm, 'food', 10 * U);
  restock();
  economy.setMarketSale(firstMarket, 'food', false);
  economy.setMarketSale(secondMarket, 'food', false);
  economy.storage.depositProduction(farm, 'food', 2 * U);
  const before = economy.resources;
  const reserve = economy.storage.initialFoodReserve;
  restock();
  consume();
  assert.deepEqual(economy.resources, before);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.food, 2);
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 10);
  assert.equal(economy.perSecond.gold, 0);
  assert.equal(economy.availableFood, 0);
  assert.equal(economy.distribution.supplyAt(home).status, 'unserved');
  assert.equal(economy.storage.initialFoodReserve, reserve);
  assert.equal(economy.distribution.bootstrapActive, false);
  assert.equal(ledger.transfer(warehouseId, marketId, 'food', 1), false);
  assert.equal(economy.storage.consumeInventoryFood(marketId, 1), 0);
});

test('homes fall back to the next authorized covered market despite stock in the disabled nearest market', () => {
  const { economy, ledger, consume } = setup();
  economy.storage.depositProduction(farm, 'food', 3 * U);
  assert.equal(ledger.transfer(warehouseId, marketId, 'food', U), true);
  assert.equal(ledger.transfer(warehouseId, otherMarketId, 'food', 2 * U), true);
  economy.setMarketSale(firstMarket, 'food', false);
  assert.deepEqual(economy.distribution.supplyAt(home), { status: 'market', market: secondMarket, distance: 4 });
  consume();
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 1);
  assert.equal(economy.distribution.marketAt(secondMarket)!.food, 1.6);
  assert.equal(economy.resources.gold, 0.04);
  assert.equal(economy.perSecond.gold, 0.04);
});

test('re-enabling a market resumes sales from its existing stock without granting resources', () => {
  const { economy, ledger, consume } = setup();
  economy.storage.depositProduction(farm, 'food', U);
  ledger.transfer(warehouseId, marketId, 'food', U);
  economy.setMarketSale(firstMarket, 'food', false);
  const before = economy.resources;
  economy.setMarketSale(firstMarket, 'food', true);
  assert.deepEqual(economy.resources, before);
  consume();
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 0.6);
  assert.equal(economy.resources.gold, 0.04);
  assert.equal(economy.resources.food, before.food - 0.4);
});

test('sale permissions filter immigration forecasting, with a covered alternative restoring local supply', () => {
  const { economy, ledger } = setup();
  economy.storage.depositProduction(farm, 'food', 3 * U);
  ledger.transfer(warehouseId, marketId, 'food', 2 * U);
  ledger.transfer(warehouseId, otherMarketId, 'food', U);
  economy.setMarketSale(firstMarket, 'food', false);
  economy.setMarketSale(secondMarket, 'food', false);
  const homes = { residencesSnapshot: [{ cell: home, residents: 0 }] };
  const blocked = economy.immigrationSupply(homes, 2, 5, 0.1, 4);
  assert.equal(blocked.size, 0);
  economy.setMarketSale(secondMarket, 'food', true);
  const supply = economy.immigrationSupply(homes, 2, 5, 0.1, 4);
  assert.equal(supply.get('6,1'), 2);
  assert.equal(economy.availableFood, 1);
});

test('permission changes do not restart replenishment clocks or cause immediate transfers', () => {
  const { economy } = setup();
  economy.storage.depositProduction(farm, 'food', U);
  economy.setMarketSale(secondMarket, 'food', false);
  economy.distribution.advanceSecond();
  economy.distribution.advanceSecond();
  economy.setMarketSale(firstMarket, 'food', false);
  economy.setMarketSale(firstMarket, 'food', true);
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 0);
  for (let i = 2; i < distributionRules.restockIntervalSeconds - 1; i++) economy.distribution.advanceSecond();
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 0);
  economy.distribution.advanceSecond();
  assert.equal(economy.distribution.marketAt(firstMarket)!.food, 1);
});

test('permissions never bypass workforce or road requirements and survive disconnection/reconnection', () => {
  const { economy, counts, sync, map, roads } = setup();
  economy.setWarehouseAcceptance(firstWarehouse, 'wood', false);
  economy.setMarketSale(firstMarket, 'food', false);
  counts.set('3,1', 0);
  counts.set('5,1', 0);
  sync();
  economy.setMarketSale(firstMarket, 'food', true);
  economy.setWarehouseAcceptance(firstWarehouse, 'wood', true);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.operational, false);
  assert.equal(economy.distribution.marketAt(firstMarket)!.operational, false);
  economy.setMarketSale(firstMarket, 'food', false);
  economy.setWarehouseAcceptance(firstWarehouse, 'wood', false);
  const disconnected = new ConstructionMap(20, 20);
  disconnected.place(firstWarehouse, 'warehouse');
  disconnected.place(firstMarket, 'market');
  roads.recalculate(disconnected);
  economy.recalculate(disconnected, roads, {
    workersAt: () => 1, capacityFor: type => new Population().capacityFor(type),
  });
  assert.equal(economy.distribution.marketAt(firstMarket)!.sells.food, false);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.accepts.wood, false);
  counts.set('3,1', 1);
  counts.set('5,1', 1);
  sync();
  assert.equal(economy.distribution.marketAt(firstMarket)!.sells.food, false);
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.accepts.wood, false);
  assert.equal(map.getConstruction(firstMarket), 'market');
});

test('configuration snapshots cannot mutate live settings and cannot affect another building', () => {
  const { economy } = setup();
  const warehouse = economy.storage.warehouseAt(firstWarehouse)!;
  const market = economy.distribution.marketAt(firstMarket)!;
  (warehouse.accepts as ProductFlags).food = false;
  (market.sells as ProductFlags).food = false;
  assert.equal(economy.storage.warehouseAt(firstWarehouse)!.accepts.food, true);
  assert.equal(economy.distribution.marketAt(firstMarket)!.sells.food, true);
  assert.equal(economy.storage.warehouseAt(secondWarehouse)!.accepts.food, true);
  assert.equal(economy.distribution.marketAt(secondMarket)!.sells.food, true);
});
