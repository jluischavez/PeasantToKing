import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ConstructionType } from '../src/map/ConstructionMap';
import { Session } from '../src/persistence/Session.ts';
import { perGameHour, simulatedMsPerGameHour } from '../src/simulation/GameTime.ts';
import { crownRules } from '../src/simulation/Crown.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';

const c = (column: number, row: number) => ({ column, row });
const market = c(5, 1);
const day = 24 * simulatedMsPerGameHour;

function plannedVillage(excess = false, residents = 18) {
  const game = new Session();
  const { map, population, simulation } = game;
  assert.ok(map.terrain.plantTree(c(3, 0)));
  assert.ok(map.place(c(0, 2), 'villageCenter'));
  for (let x = 1; x <= 8; x++) assert.ok(map.place(c(x, 2), 'road'));
  const sites = [
    [1, 1, 'farm'], [2, 1, 'farm'], [3, 1, 'lumberjack'], [4, 1, 'warehouse'], [5, 1, 'market'],
    [1, 3, 'well'], [5, 3, 'well'], [2, 3, 'house'], [3, 3, 'house'], [4, 3, 'house'],
  ] as const satisfies readonly (readonly [number, number, ConstructionType])[];
  for (const [x, y, type] of sites) assert.ok(map.place(c(x, y), type));
  if (residents > 18) for (const x of [6, 7]) assert.ok(map.place(c(x, 3), 'house'));
  if (excess) {
    for (let x = 0; x < 10; x++) assert.ok(map.place(c(x, 7), x % 2 === 0 ? 'warehouse' : 'market'));
  }
  simulation.recalculate();
  for (let x = 2; x <= 4; x++) population.setHousingLevel(c(x, 3), 2);
  for (let i = 0; i < 20 && population.total < residents; i++) population.immigrate(200);
  assert.equal(population.total, residents);
  simulation.refreshWorkforce();
  return game;
}

function marketOpen(game: Session, enabled: boolean): void {
  game.economy.setMarketSale(market, 'food', enabled);
  game.economy.setMarketSale(market, 'wood', enabled);
  game.simulation.refreshWorkforce();
}

function assertBalances(game: Session): void {
  assert.ok(game.economy.credit.balance >= -game.economy.credit.limit);
  for (const { goods } of game.economy.storage.inventories.saveState()) {
    assert.ok(goods.food >= 0 && goods.wood >= 0);
  }
}

test('over three days a supplied village makes modest gains while excess infrastructure and weak sales drain another', () => {
  const balanced = plannedVillage(), mismanaged = plannedVillage(true);
  marketOpen(mismanaged, false);
  assert.ok(mismanaged.economy.operatingCostsPerHour(0).maintenance > balanced.economy.operatingCostsPerHour(0).maintenance);
  const balancedBalances = [], mismanagedBalances = [];
  for (let i = 0; i < 3; i++) {
    for (const game of [balanced, mismanaged]) {
      game.simulation.advance(day);
      assertBalances(game);
      assert.equal(game.population.employed + game.population.unemployed, game.population.activePopulation);
    }
    balancedBalances.push(balanced.economy.resources.gold);
    mismanagedBalances.push(mismanaged.economy.resources.gold);
  }
  assert.deepEqual(balancedBalances, [212.38, 277.42, 342.46]);
  assert.equal(mismanagedBalances[0], 15.608);
  assert.ok(mismanagedBalances[1]! < 0);
  assert.equal(mismanagedBalances[2], -200);
  assert.ok((balancedBalances[2]! - balancedBalances[1]!) / 24 > 0);
  assert.ok((balancedBalances[2]! - balancedBalances[1]!) / 24 < 10);
  assert.ok(perGameHour(balanced.economy.perSecond.gold) < 20);
  assert.ok(mismanaged.economy.operatingDeficits.maintenance > 0);
});

test('a village in debt can recover by restoring a staffed market without spending on new construction', () => {
  const game = plannedVillage();
  const { economy, population, simulation } = game;
  assert.ok(economy.payBuildingCost({ gold: 138, wood: 0 }, 'construction', 'fixture'));
  marketOpen(game, false);
  simulation.advance(6 * simulatedMsPerGameHour);
  assert.equal(economy.resources.gold, -6.96);
  assert.equal(population.total, 10);
  assert.equal(population.workersAt(market), 0);
  const deficits = economy.operatingDeficits;
  marketOpen(game, true);
  assert.ok(population.workersAt(market) > 0);
  const balances = [];
  for (let i = 0; i < 3; i++) {
    simulation.advance(day);
    assertBalances(game);
    balances.push(economy.resources.gold);
  }
  assert.deepEqual(balances, [48.076, 113.116, 178.156]);
  assert.deepEqual(economy.operatingDeficits, deficits);
});

test('a prosperous Pueblo can save and pay its higher tribute from operating income', () => {
  const game = plannedVillage(false, 25);
  const { economy, simulation } = game;
  setFixtureRank(simulation, 'pueblo');
  simulation.advance(crownRules.periodMs);
  const tribute = simulation.crown.obligation!;
  assert.equal(tribute.gold, 150);
  const before = economy.credit.balance;
  assert.ok(before > 150 + tribute.gold);
  assert.ok(simulation.payTribute(tribute.dueAt));
  simulation.advance(crownRules.periodMs);
  assert.ok(simulation.payTribute(simulation.crown.obligation!.dueAt));
  assert.ok(economy.credit.balance > 150);
  assert.equal(simulation.crown.streak, 0);
}, 20_000);

function establishedVilla(excess: boolean) {
  const game = new Session();
  const { map, simulation } = game;
  map.place(c(0, 2), 'villageCenter');
  for (let x = 1; x <= 16; x++) map.place(c(x, 2), 'road');
  for (let x = 1; x <= 15; x++) map.place(c(x, 3), 'house');
  for (const x of [1, 2, 6, 11, 15]) map.place(c(x, 1), 'farm');
  for (const x of [3, 14]) {
    map.place(c(x, 1), 'lumberjack');
    map.terrain.plantTree(c(x, 0));
  }
  for (const x of [4, 12]) map.place(c(x, 1), 'market');
  for (const x of [5, 10]) map.place(c(x, 1), 'warehouse');
  for (const x of [7, 13]) map.place(c(x, 1), 'well');
  if (excess) for (let x = 1; x <= 15; x++) map.place(c(x, 8), 'plaza');
  simulation.recalculate();
  setFixtureRank(simulation, 'villa');
  const state = game.saveState(null);
  for (const home of state.population.residences) home.residents = 4;
  return Session.restore(state).session;
}

test('an established Villa pays, while an overbuilt Villa exhausts credit and misses the same tribute', () => {
  const healthy = establishedVilla(false), excessive = establishedVilla(true);
  for (const game of [healthy, excessive]) game.simulation.advance(crownRules.periodMs);
  const bill = healthy.simulation.crown.obligation!;
  assert.equal(bill.gold, crownRules.tribute.villa);
  assert.ok(healthy.economy.credit.balance >= bill.gold);
  assert.ok(healthy.simulation.payTribute(bill.dueAt));
  assert.equal(excessive.economy.credit.balance, -200);
  assert.equal(excessive.simulation.payTribute(bill.dueAt), false);
  excessive.simulation.advance(crownRules.periodMs);
  assert.equal(excessive.simulation.crown.streak, 1);
  assert.ok(excessive.economy.operatingArrears.maintenance > 0);
}, 20_000);

test('decoration can use credit and its ordinary maintenance remains visible', () => {
  const { economy, simulation } = plannedVillage(false, 25);
  setFixtureRank(simulation, 'pueblo');
  const before = economy.operatingCostsPerHour(0).maintenance;
  assert.equal(simulation.build(c(12, 4), 'park'), null);
  assert.equal(simulation.build(c(16, 4), 'park'), null);
  assert.equal(economy.credit.debt, 150);
  assert.ok(simulation.build(c(20, 4), 'park'));
  assert.equal(economy.operatingCostsPerHour(0).maintenance, before + 4);
  simulation.advance(day);
  assert.ok(economy.credit.debt > 0);
  assert.equal(simulation.crown.favor, 50);
});
