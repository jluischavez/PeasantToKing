import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ConstructionType } from '../src/map/ConstructionMap';
import { Session } from '../src/persistence/Session.ts';

const c = (column: number, row = 1) => ({ column, row });
const farm = c(1), warehouse = c(2), market = c(3), camp = c(4, 3), well = c(5);

function town(sites: readonly (readonly [number, ConstructionType])[], residents = 12) {
  const game = new Session();
  const { map, population, simulation } = game;
  assert.ok(map.place(c(0, 2), 'villageCenter'));
  for (let x = 1; x <= 6; x++) assert.ok(map.place(c(x, 2), 'road'));
  for (let x = 1; x <= 3; x++) assert.ok(map.place(c(x, 3), 'house'));
  for (const [x, type] of sites) assert.ok(map.place(type === 'lumberjack' ? camp : c(x), type));
  simulation.recalculate();
  for (let i = 0; i < 20 && population.total < residents; i++) population.immigrate(residents / 2);
  assert.equal(population.total, residents);
  simulation.refreshWorkforce();
  return game;
}

test('a new camp takes one surplus worker while retaining the other three rosters', () => {
  const { population, simulation, economy } = town([[1, 'farm'], [2, 'warehouse'], [3, 'market']]);
  population.restoreState({ ...population.saveState(), workers: [['1,1', 3], ['2,1', 1], ['3,1', 2]] });
  assert.equal(simulation.build(camp, 'lumberjack'), null);
  const roster = () => [farm, warehouse, market, camp].map(cell => population.workersAt(cell));
  assert.deepEqual(roster(), [2, 1, 2, 1]);
  assert.equal(economy.perSecond.food, 1);
  assert.equal(economy.perSecond.wood, 2 / 3);
  assert.equal(economy.operatingCostsPerHour(population.employed).wages, 2.4);
  for (let i = 0; i < 12; i++) {
    simulation.recalculate();
    simulation.advance(1000);
    assert.deepEqual(roster(), [2, 1, 2, 1]);
  }
  assert.equal(simulation.requestDemolition(camp), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.deepEqual(roster(), [3, 1, 2, 0]);
});

test('unemployed workers cover new posts before taking extras from an incumbent', () => {
  const { population, simulation } = town([[1, 'farm']]);
  assert.equal(population.workersAt(farm), 4);
  assert.equal(population.unemployed, 2);
  assert.equal(simulation.build(camp, 'lumberjack'), null);
  assert.equal(population.workersAt(farm), 4);
  assert.equal(population.workersAt(camp), 2);
  assert.equal(population.unemployed, 0);
});

test('connected eligible jobs get one worker each and maintain priorities as residents leave or arrive', () => {
  const { population, simulation, map, economy } = town([
    [1, 'farm'], [2, 'warehouse'], [3, 'market'], [4, 'lumberjack'], [5, 'well'],
  ], 10);
  const workplaces = [farm, warehouse, market, camp, well];
  const roster = () => workplaces.map(cell => population.workersAt(cell));
  assert.deepEqual(roster(), [1, 1, 1, 1, 1]);
  const occupied = population.residencesSnapshot.find(home => home.residents > 0)!;
  assert.ok(population.removeResident(occupied.cell));
  simulation.refreshWorkforce();
  assert.equal(population.activePopulation, 4);
  assert.deepEqual(roster(), [1, 1, 1, 0, 1]);
  assert.equal(population.immigrate(5), 1);
  simulation.refreshWorkforce();
  assert.deepEqual(roster(), [1, 1, 1, 1, 1]);
  assert.equal(population.employed, population.activePopulation);
  assert.ok(workplaces.every(cell => population.workersAt(cell) <= population.capacityFor(map.getConstruction(cell)!)));
  economy.setMarketSale(market, 'food', false);
  economy.setMarketSale(market, 'wood', false);
  simulation.refreshWorkforce();
  assert.equal(population.workersAt(market), 0);
  assert.match(economy.laborIssue(market, 'market')!, /deshabilitadas/);
  assert.equal(population.jobCapacity, 10);
  assert.equal(population.employed, 5);
});

test('loading an older skewed roster corrects jobs and preserves gold, accrued costs and history', () => {
  const game = town([[1, 'farm'], [2, 'warehouse'], [3, 'market'], [4, 'lumberjack']]);
  game.simulation.advance(12_000);
  const saved = JSON.parse(JSON.stringify(game.saveState(null)));
  saved.population.workers = [['1,1', 3], ['2,1', 1], ['3,1', 2], ['4,3', 0]];
  const { session: loaded } = Session.restore(saved);
  assert.deepEqual([farm, warehouse, market, camp].map(cell => loaded.population.workersAt(cell)), [2, 1, 2, 1]);
  const economy = JSON.parse(JSON.stringify(loaded.economy.saveState()));
  assert.deepEqual(economy.treasury, saved.economy.treasury);
  assert.deepEqual(economy.inventories, saved.economy.inventories);
  assert.deepEqual(economy.history, saved.economy.history);
});
