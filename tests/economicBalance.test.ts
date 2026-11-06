import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ConstructionType } from '../src/map/ConstructionMap';
import { Session } from '../src/persistence/Session.ts';
import { perGameHour, simulatedMsPerGameHour } from '../src/simulation/GameTime.ts';

const c = (column: number, row: number) => ({ column, row });
const market = c(5, 1);
const day = 24 * simulatedMsPerGameHour;

function plannedVillage(excess = false) {
  const game = new Session();
  const { map, population, simulation } = game;
  assert.ok(map.place(c(0, 2), 'villageCenter'));
  for (let x = 1; x <= 8; x++) assert.ok(map.place(c(x, 2), 'road'));
  const sites = [
    [1, 1, 'farm'], [2, 1, 'farm'], [3, 1, 'lumberjack'], [4, 1, 'warehouse'], [5, 1, 'market'],
    [1, 3, 'well'], [5, 3, 'well'], [2, 3, 'house'], [3, 3, 'house'], [4, 3, 'house'],
  ] as const satisfies readonly (readonly [number, number, ConstructionType])[];
  for (const [x, y, type] of sites) assert.ok(map.place(c(x, y), type));
  if (excess) {
    for (let x = 0; x < 10; x++) assert.ok(map.place(c(x, 7), x % 2 === 0 ? 'warehouse' : 'market'));
  }
  simulation.recalculate();
  for (let x = 2; x <= 4; x++) population.setHousingLevel(c(x, 3), 2);
  for (let i = 0; i < 20 && population.total < 18; i++) population.immigrate(200);
  assert.equal(population.total, 18);
  simulation.refreshWorkforce();
  return game;
}

function marketOpen(game: Session, enabled: boolean): void {
  game.economy.setMarketSale(market, 'food', enabled);
  game.economy.setMarketSale(market, 'wood', enabled);
  game.simulation.refreshWorkforce();
}

function assertNonNegative(game: Session): void {
  for (const amount of Object.values(game.economy.resources)) assert.ok(amount >= 0);
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
      assertNonNegative(game);
      assert.equal(game.population.employed + game.population.unemployed, game.population.activePopulation);
    }
    balancedBalances.push(balanced.economy.resources.gold);
    mismanagedBalances.push(mismanaged.economy.resources.gold);
  }
  assert.deepEqual(balancedBalances, [214.032, 279.072, 335.162]);
  assert.deepEqual(mismanagedBalances, [16.82, 0, 0]);
  assert.ok((balancedBalances[2]! - balancedBalances[1]!) / 24 > 0);
  assert.ok((balancedBalances[2]! - balancedBalances[1]!) / 24 < 10);
  assert.ok(perGameHour(balanced.economy.perSecond.gold) < 20);
  assert.ok(mismanaged.economy.operatingDeficits.maintenance > 0);
});

test('a village at zero gold can recover by restoring a staffed market without spending on new construction', () => {
  const game = plannedVillage();
  const { economy, population, simulation } = game;
  assert.ok(economy.payBuildingCost({ gold: 138, wood: 0 }, 'construction', 'fixture'));
  marketOpen(game, false);
  simulation.advance(6 * simulatedMsPerGameHour);
  assert.equal(economy.resources.gold, 0);
  assert.equal(population.total, 10);
  assert.equal(population.workersAt(market), 0);
  const deficits = economy.operatingDeficits;
  marketOpen(game, true);
  assert.ok(population.workersAt(market) > 0);
  const balances = [];
  for (let i = 0; i < 3; i++) {
    simulation.advance(day);
    assertNonNegative(game);
    balances.push(economy.resources.gold);
  }
  assert.deepEqual(balances, [55.38, 120.42, 185.46]);
  assert.deepEqual(economy.operatingDeficits, deficits);
});
