import assert from 'node:assert/strict';
import { test } from 'vitest';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { Session } from '../src/persistence/Session.ts';
import { SaveSlots } from '../src/persistence/SaveSlots.ts';
import { recoveryMigrationRules } from '../src/population/Population.ts';
import { wellbeingRules } from '../src/population/Wellbeing.ts';
import { crownRules } from '../src/simulation/Crown.ts';
import { gameTimeRules, simulatedMsPerGameHour as hour } from '../src/simulation/GameTime.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';

const at = (column: number, row: number) => ({ column, row });
const farm = at(1, 1), market = at(3, 1);
const interval = recoveryMigrationRules.intervalHours * hour;
const day = 24 * hour;

function village(residents: number, services = 'none', houses = 8) {
  const game = new Session();
  const { map, simulation } = game;
  assert.ok(map.place(at(0, 2), 'villageCenter'));
  for (let x = 1; x <= houses; x++) {
    assert.ok(map.place(at(x, 2), 'road'));
    assert.ok(map.place(at(x, 3), 'house'));
  }
  if (services !== 'none') {
    assert.ok(map.place(farm, 'farm'));
    assert.ok(map.place(at(2, 1), 'warehouse'));
    assert.ok(map.place(market, 'market'));
  }
  if (services === 'all') {
    assert.ok(map.place(at(5, 1), 'well'));
    assert.ok(map.place(at(6, 1), 'lumberjack'));
    assert.ok(map.terrain.plantTree(at(6, 0)));
  }
  simulation.recalculate();
  const saved = game.saveState(null);
  for (const home of saved.population.residences) {
    home.residents = Math.min(residents, 4);
    residents -= home.residents;
  }
  assert.equal(residents, 0);
  const { session } = Session.restore(saved);
  assert.ok(session.economy.consumeFood(20));
  return session;
}

test('seven residents recover through partial physical deliveries without waiting for a traveler', () => {
  const { economy, population, simulation } = village(7, 'food');
  assert.equal(population.activePopulation, 3);
  assert.equal(population.workersAt(market), 1);
  simulation.advance(1000);
  assert.equal(economy.distribution.marketAt(market)?.food, 0);
  assert.ok(economy.storage.logistics.goods().food > 0);
  simulation.advance(interval - 2000);
  assert.ok(population.total >= 8);
  assert.ok(population.activePopulation >= 4);
  assert.ok(population.workersAt(farm) >= 2);
  assert.ok(economy.distribution.marketAt(market)!.food > 0);
  assert.deepEqual(simulation.occasionalArrivals, []);
  simulation.advance(3 * day - simulation.simulatedTimeMs);
  assert.ok(population.total >= 24);
  assert.equal(simulation.occasionalArrivals.length, 0);
});
test('a well-supplied village grows earlier through normal immigration', () => {
  const healthy = village(7, 'all'), scarce = village(7, 'food');
  assert.ok(healthy.economy.storage.depositProduction(farm, 'food', 65 * U));
  for (const game of [healthy, scarce]) game.simulation.advance(hour);
  assert.ok(healthy.population.total > scarce.population.total);
  assert.equal(healthy.simulation.occasionalArrivals.length, 0);
  const firstHour = healthy.population.total;
  healthy.simulation.advance(3 * day - hour);
  assert.ok(healthy.population.total > firstHour);
  assert.deepEqual(healthy.simulation.occasionalArrivals, []);
  assert.deepEqual(healthy.simulation.needs.summarize(healthy.population.residencesSnapshot).percentages,
    { food: 100, water: 100, wood: 100 });
});

test('even at zero attraction a traveler arrives, needs supplies and can emigrate after sustained hardship', () => {
  const { simulation, population, economy } = village(0);
  assert.equal(simulation.migrationOutlook(70).attraction, 0);
  assert.equal(simulation.migrationOutlook(70).mode, 'occasional');
  simulation.advance(interval);
  const [event] = simulation.occasionalArrivals;
  assert.ok(event);
  assert.equal(population.total, 1);
  assert.equal(population.employed, 0);
  simulation.advance(1000);
  assert.equal(population.total, 1);
  assert.equal(economy.distribution.foodShortageAt(event.cell), 0.1);
  assert.equal(economy.distribution.woodShortageAt(event.cell), 0.02);
  assert.equal(simulation.water.suppliedAt(event.cell), 0);
  assert.deepEqual(simulation.wellbeing.emigrationEvents, []);
  simulation.advance(4 * hour);
  assert.equal(population.total, 0);
  assert.ok(simulation.wellbeing.emigrationEvents[0]!.timeMs - event.timeMs >= wellbeingRules.toleranceHours * hour);
  simulation.advance(3 * day - simulation.simulatedTimeMs);
  assert.equal(population.total, 1);
  assert.equal(simulation.occasionalArrivals.length, 9);
  assert.equal(simulation.wellbeing.emigrationEvents.length, 8);
  assert.equal(population.waitingImmigrants, 0);
});

test('an arrival in an already distressed house restarts its tolerance and deterioration windows', () => {
  const game = village(4, 'none', 1);
  const home = at(1, 3);
  game.population.setHousingLevel(home, 2);
  game.economy.advance(interval - 1000);
  const saved = game.saveState(null);
  saved.simulation.wellbeing.homes = [['1,3', {
    happiness: 20, distressedSeconds: wellbeingRules.toleranceHours * gameTimeRules.secondsPerHour - 2, concerns: [],
  }]];
  saved.simulation.housing = [['1,3', { improvement: 0, deterioration: 58 }]];
  const { simulation, population } = Session.restore(saved).session;
  simulation.advance(2000);
  assert.equal(population.total, 5);
  assert.equal(population.housingLevelAt(home), 2);
  assert.equal(simulation.wellbeing.at(home)?.distressedSeconds, 1);
  assert.equal(simulation.housing.at(home).deterioration, 1);
  assert.deepEqual(simulation.wellbeing.emigrationEvents, []);
});

test('disconnected housing and a missing center block admission without accumulating past opportunities', () => {
  const game = new Session();
  const { economy, simulation, map, population } = game;
  assert.ok(economy.consumeFood(20));
  assert.ok(map.place(at(2, 3), 'house'));
  simulation.recalculate();
  simulation.advance(interval);
  assert.equal(simulation.migrationOutlook(70).mode, 'closed');
  assert.match(simulation.migrationOutlook(70).reason, /Centro de Aldea/);
  assert.ok(map.place(at(0, 2), 'villageCenter'));
  simulation.recalculate();
  simulation.advance(interval);
  assert.equal(population.total, 0);
  assert.deepEqual(simulation.occasionalArrivals, []);
  assert.ok(map.place(at(1, 2), 'road'));
  assert.ok(map.place(at(2, 2), 'road'));
  simulation.recalculate();
  simulation.advance(interval - 1000);
  assert.equal(population.total, 0);
  simulation.advance(1000);
  assert.equal(population.total, 1);
  assert.deepEqual(simulation.occasionalArrivals, [{ timeMs: 3 * interval, cell: at(2, 3) }]);
});

test('the initial recovery exception is capped and a developed city in crisis cannot use it', () => {
  const capped = village(recoveryMigrationRules.populationLimit);
  capped.economy.advance(interval - 1000);
  capped.simulation.advance(1000);
  assert.equal(capped.population.total, recoveryMigrationRules.populationLimit);
  assert.deepEqual(capped.simulation.occasionalArrivals, []);

  const developed = village(24);
  setFixtureRank(developed.simulation, 'pueblo');
  developed.simulation.advance(3 * day);
  assert.ok(developed.population.total < recoveryMigrationRules.populationLimit);
  assert.equal(developed.simulation.migrationOutlook(70).mode, 'closed');
  assert.deepEqual(developed.simulation.occasionalArrivals, []);
  assert.ok(developed.simulation.wellbeing.emigrationEvents.length > 0);
});

test.each([1, 2, 3] as const)('speed ×%i uses the simulated interval and pause discards real time', speed => {
  const { simulation, population } = village(0);
  simulation.setSpeed(speed);
  simulation.advance((interval - 1000) / speed);
  simulation.setPaused(true);
  simulation.advance(3 * interval);
  assert.equal(population.total, 0);
  simulation.setPaused(false);
  simulation.advance(1000 / speed + 0.001);
  assert.equal(population.total, 1);
  assert.equal(simulation.occasionalArrivals[0]?.timeMs, interval);
});

test('save and load retain the clock, history and ordinary population state without duplicating arrivals', () => {
  const game = village(0);
  const data = new Map<string, string>();
  const slots = new SaveSlots(() => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }));
  game.simulation.advance(interval - 500);
  slots.save(1, null, game, null);
  const resumed = slots.load(1).session;
  assert.equal(resumed.simulation.simulatedTimeMs, interval - 1000);
  assert.equal(resumed.population.total, 0);
  game.simulation.advance(500);
  resumed.simulation.advance(500);
  assert.deepEqual(JSON.parse(JSON.stringify(resumed.saveState(null))), JSON.parse(JSON.stringify(game.saveState(null))));
  slots.save(1, slots.inspect(1).raw, resumed, null);
  for (let reload = 0; reload < 3; reload++) {
    const loaded = slots.load(1).session;
    loaded.simulation.advance(1000);
    assert.equal(loaded.population.total, 1);
    assert.equal(loaded.simulation.occasionalArrivals.length, 1);
  }
  const snapshot = resumed.saveState(null);
  const { occasionalArrivals, ...legacySimulation } = snapshot.simulation;
  const legacy = Session.restore({ ...snapshot, simulation: legacySimulation }).session;
  legacy.simulation.advance(1000);
  assert.equal(legacy.population.total, 1);
  assert.deepEqual(legacy.simulation.occasionalArrivals, []);
});

test('a destitution freezes all future exceptional arrivals', () => {
  const { simulation, population } = village(0);
  simulation.advance(4 * crownRules.periodMs);
  assert.equal(simulation.crown.defeated, true);
  const before = simulation.occasionalArrivals.length;
  const residents = population.total;
  assert.equal(simulation.advance(interval), false);
  assert.equal(simulation.occasionalArrivals.length, before);
  assert.equal(population.total, residents);
});
