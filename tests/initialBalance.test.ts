import { deliverFixtureCargo } from './fixtures/logistics.ts';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import type { ConstructionType } from '../src/map/ConstructionMap';
import { constructionDimensions } from '../src/map/ConstructionMap.ts';
import { TerrainMap, terrainCode } from '../src/map/Terrain.ts';
import { hasHarvestableWoodland } from '../src/map/Woodland.ts';
import { legacyProceduralTerrain, newWorld } from '../src/map/World.ts';
import { Session } from '../src/persistence/Session.ts';
import { populationRules } from '../src/population/Population.ts';
import { simulatedMsPerGameHour as hour } from '../src/simulation/GameTime.ts';

const c = (column: number, row: number) => ({ column, row });

test('a new procedural village feeds 24 residents from one farm and earns Pueblo through ordinary play', () => {
  const game = Session.start(23);
  const { map, population, economy, simulation } = game;
  const at = (x: number, y: number) => c(50 + x, 50 + y);
  const build = (x: number, y: number, type: ConstructionType) => {
    const cell = at(x, y);
    if (type === 'road' && map.getConstruction(cell) === 'road') return;
    assert.equal(simulation.build(cell, type), null, `${type} ${x},${y} ${JSON.stringify(simulation.settlementStats())}`);
  };
  const waitFor = (condition: () => boolean, hours: number) => {
    for (let i = 0; i < hours && !condition(); i++) {
      const tribute = simulation.crown.obligation;
      if (tribute && !tribute.paid && tribute.dueAt - simulation.simulatedTimeMs <= hour) {
        assert.ok(economy.credit.balance >= tribute.gold);
        assert.ok(simulation.payTribute(tribute.dueAt));
      }
      simulation.advance(hour);
    }
    assert.ok(condition(), JSON.stringify({ stats: simulation.settlementStats(), rates: economy.perSecond,
      needs: simulation.needs.summarize(population.residencesSnapshot), wood: economy.availableConstructionWood }));
  };
  for (let x = 1; x <= 6; x++) build(x, 0, 'road');
  build(5, 1, 'road');
  build(5, 2, 'road');
  build(1, -3, 'farm');
  build(4, -2, 'lumberjack');
  build(1, 1, 'warehouse');
  build(3, 1, 'market');
  build(6, 1, 'house');
  build(6, 2, 'house');
  waitFor(() => population.total >= 8 && economy.resources.gold >= 7, 24);
  build(5, 3, 'road');
  build(6, 3, 'house');
  waitFor(() => population.total >= 12 && economy.resources.gold >= 29 && economy.availableConstructionWood >= 10, 48);
  build(5, 4, 'road');
  build(5, 5, 'road');
  build(5, 6, 'well');
  build(6, 4, 'house');
  waitFor(() => economy.resources.gold >= 14, 48);
  build(4, 3, 'road');
  build(3, 3, 'road');
  build(4, 4, 'house');
  build(3, 4, 'house');
  waitFor(() => population.total >= 24, 72);
  assert.ok(simulation.simulatedTimeMs <= 48 * hour);
  waitFor(() => economy.resources.gold >= 120, 72);
  build(6, -1, 'garden');
  build(6, 5, 'garden');
  build(2, 3, 'garden');
  // Keep cash for the first larger obligation when recognizing Pueblo.
  waitFor(() => simulation.progress.next(simulation.settlementStats())?.ready === true && economy.credit.balance >= 650, 350);
  assert.ok(simulation.simulatedTimeMs <= 360 * hour);
  assert.equal(simulation.recognize('pueblo'), true);
  const shortage = economy.distribution.cumulativeFoodShortage;
  for (let day = 0; day < 3; day++) {
    const until = simulation.simulatedTimeMs + 24 * hour;
    waitFor(() => simulation.simulatedTimeMs >= until, 24);
    assert.ok(population.total >= 24);
    assert.equal(economy.distribution.cumulativeFoodShortage, shortage);
    assert.equal(simulation.needs.summarize(population.residencesSnapshot).percentages?.water, 100);
  }
  assert.equal(population.workersAt(at(1, -3)), 4);
  assert.equal(economy.operatingDeficits.wages, 0);
  assert.ok(simulation.crown.tributeTotal >= 50);
  assert.equal(simulation.crown.streak, 0);
  assert.ok(economy.resources.gold > 0);
}, 20_000);

function stockedVillage() {
  const game = new Session();
  const { map, simulation } = game;
  map.place(c(0, 2), 'villageCenter');
  for (let x = 1; x <= 10; x++) map.place(c(x, 2), 'road');
  map.place(c(1, 1), 'farm');
  map.place(c(2, 1), 'warehouse');
  map.place(c(3, 1), 'market');
  map.place(c(4, 1), 'lumberjack');
  assert.ok(map.terrain.plantTree(c(4, 0)));
  for (let x = 1; x <= 7; x++) map.place(c(x, 3), 'house');
  map.place(c(10, 3), 'house');
  simulation.recalculate();
  const state = game.saveState(null);
  for (const [index, home] of state.population.residences.entries()) {
    home.residents = index < 5 ? 4 : index === 5 ? 2 : 0;
    if (index < 3) home.level = 2;
  }
  const restored = Session.restore(state).session; restored.economy.distribution.enableHouseholds(false); return restored;
}

test('a market shortfall requests a partial physical delivery and sells only after arrival within coverage', () => {
  const { economy } = stockedVillage();
  const warehouse = 'warehouse:2,1', market = 'market:3,1';
  const ledger = economy.storage.inventories;
  assert.ok(economy.storage.depositProduction(c(1, 1), 'food', U));
  assert.ok(ledger.transfer(warehouse, market, 'food', U));
  const nearby = c(5, 3), distant = c(10, 3);
  economy.consumeHomes({ residencesSnapshot: [{ cell: nearby, residents: 10 }] }, 0.1);
  assert.ok(economy.storage.depositProduction(c(1, 1), 'food', 0.2 * U));
  const before = economy.resources;
  const consume = () => economy.consumeHomes({ residencesSnapshot: [{ cell: distant, residents: 2 }, { cell: nearby, residents: 4 }] }, 0.1);
  consume();
  assert.equal(economy.distribution.foodShortageAt(distant), 0.2);
  assert.equal(economy.distribution.foodShortageAt(nearby), 0.4);
  assert.deepEqual(economy.resources, before);
  assert.equal(ledger.outgoing(warehouse, 'food'), 0.2 * U);
  deliverFixtureCargo(economy);
  consume();
  assert.equal(economy.distribution.foodShortageAt(nearby), 0.2);
  assert.deepEqual(economy.resources, { ...before, food: before.food - 0.2, gold: before.gold + 0.02 });
  assert.equal(ledger.snapshot(warehouse)?.goods.food, 0);
  assert.equal(ledger.snapshot(market)?.goods.food, 0);
});
test('22 residents with slight shortages can use a short real reserve; no-stock crises still block arrivals', () => {
  const { economy, population } = stockedVillage();
  const { familySize, immigrationIntervalSeconds, foodPerResidentPerSecond, residentsPerPlot } = populationRules;
  const supply = (coverage: number) => economy.immigrationSupply(population, familySize,
    immigrationIntervalSeconds, foodPerResidentPerSecond, residentsPerPlot, coverage);
  assert.equal(population.total, 22);
  assert.equal(population.residentialCapacity, 38);
  assert.equal(population.activePopulation, 11);
  assert.ok(economy.storage.depositProduction(c(1, 1), 'food', 2.4 * U));
  assert.ok(economy.storage.inventories.transfer('warehouse:2,1', 'market:3,1', 'food', 2.4 * U));
  assert.equal(supply(0.8).size, 0);
  assert.deepEqual([...supply(0.91).values()], [1]);
  const full = population.migrationAttractiveness(20, 0, 97, 1);
  const mild = population.migrationAttractiveness(2.4, 0, 97, 0.91);
  const sustained = population.migrationAttractiveness(2.4, 0, 97, 0.7);
  assert.ok(full > mild && mild > sustained && sustained > 0);
  let arrivals = 0;
  for (let i = 0; i < 3 && arrivals === 0; i++) arrivals = population.immigrate(2.4, supply(0.91), { happiness: 97, foodCoverage: 0.91 });
  assert.equal(arrivals, 1);
  assert.equal(population.immigrate(0, new Map(), { happiness: 97, foodCoverage: 0.4 }), 0);
  assert.equal(population.migrationAttractiveness(0, 0, 97, 0.4), 0);
  assert.equal(population.total, 23);
});

test('a camp accepts woodland six cells from its footprint, rejects barren placement and stops when cleared', () => {
  const world = newWorld(19, legacyProceduralTerrain);
  const camp = c(4, 1), timber = c(11, 1), barrenSite = c(3, 1);
  const tiles = new Uint8Array(world.rows * world.columns);
  tiles[timber.row * world.columns + timber.column] = terrainCode('grass', 'tree');
  const game = new Session(world, new TerrainMap(world.columns, world.rows, tiles));
  const { map, economy, population, simulation } = game;
  map.place(c(0, 0), 'villageCenter');
  for (let x = 1; x <= 9; x++) map.place(c(x, 0), 'road');
  map.place(c(1, 1), 'warehouse');
  const opening = economy.resources;
  const issue = simulation.constructionIssue(barrenSite, 'lumberjack');
  assert.match(issue!, /Sin árboles ni bosque a 6 casillas/);
  assert.equal(simulation.build(barrenSite, 'lumberjack'), issue);
  assert.deepEqual(economy.resources, opening);
  assert.equal(economy.history.latestId, 0);
  assert.equal(map.getConstruction(barrenSite), null);
  assert.equal(simulation.constructionIssue(camp, 'lumberjack'), null);
  assert.equal(simulation.build(camp, 'lumberjack'), null);
  for (let x = 1; x <= 4; x++) map.place(c(x, 9), 'house');
  simulation.recalculate();
  economy.recalculate(map, game.connections, { capacityFor: type => population.capacityFor(type), workersAt: () => 1 });
  assert.equal(economy.perSecond.wood, 0.56);
  assert.equal(economy.laborIssue(camp, 'lumberjack'), null);
  assert.ok(map.terrain.clear(timber, 'tree'));
  economy.advance(1000);
  assert.equal(economy.perSecond.wood, 0);
  assert.match(economy.laborIssue(camp, 'lumberjack')!, /Sin árboles ni bosque/);
  assert.equal(economy.storage.depositProduction(camp, 'wood', U), false);
  assert.equal(economy.resources.wood, 45);
  const restored = Session.restore(game.saveState(null)).session;
  assert.equal(restored.economy.productivityAt(camp)?.missingWoodland, true);
});

test('procedural starts have nearby lumber on both sides of the cleared building area', () => {
  for (let seed = 0; seed < 16; seed++) {
    const game = Session.start(seed);
    for (const camp of [c(44, 48), c(54, 48)]) {
      assert.ok(hasHarvestableWoodland(game.map.terrain, camp, constructionDimensions.lumberjack), `seed ${seed}`);
    }
  }
});

test('grass-only legacy saves gain real trees without changing buildings or resources, once', () => {
  const game = new Session();
  const camp = c(2, 1);
  assert.ok(game.map.place(c(0, 0), 'villageCenter'));
  assert.ok(game.map.place(camp, 'lumberjack', constructionDimensions.lumberjack));
  game.simulation.recalculate();
  const { terrainData, ...legacy } = game.saveState(null);
  const { session: migrated } = Session.restore(legacy);
  assert.deepEqual(migrated.map.saveCells(), legacy.cells);
  assert.deepEqual(migrated.economy.resources, game.economy.resources);
  assert.ok(hasHarvestableWoodland(migrated.map.terrain, camp, constructionDimensions.lumberjack));
  for (let row = 0; row <= 8; row++) {
    for (let column = 0; column <= 9; column++) migrated.map.terrain.clear(c(column, row), 'tree');
  }
  const { session: reloaded } = Session.restore(migrated.saveState(null));
  assert.equal(hasHarvestableWoodland(reloaded.map.terrain, camp, constructionDimensions.lumberjack), false);
});
