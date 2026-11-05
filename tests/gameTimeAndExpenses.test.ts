import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { EconomicHistory } from '../src/economy/EconomicHistory.ts';
import type { EconomicEvent } from '../src/economy/EconomicHistory';
import { Treasury } from '../src/economy/Treasury.ts';
import { unitsPerResource } from '../src/economy/Inventories.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population } from '../src/population/Population.ts';
import { gameMinutesForSeconds, gameTimeAt, perGameHour } from '../src/simulation/GameTime.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const cell = (column: number, row: number) => ({ column, row });
const center = cell(0, 1), road = cell(1, 1), farm = cell(1, 0), house = cell(1, 2);

function setup(gold = 150) {
  const map = new ConstructionMap(20, 20);
  map.place(center, 'villageCenter');
  const population = new Population();
  const economy = new Economy({ gold, wood: 50, food: 20 });
  const simulation = new SettlementSimulation(economy, population, 10_000, map, new RoadConnections());
  simulation.recalculate();
  return { map, population, economy, simulation };
}

function staffed(gold = 150) {
  const state = setup(gold);
  const { map, population, simulation } = state;
  map.place(road, 'road');
  map.place(farm, 'farm');
  map.place(house, 'house');
  simulation.recalculate();
  assert.equal(population.immigrate(20), 2);
  simulation.recalculate();
  assert.equal(population.employed, 1);
  return state;
}

const stamp = (year: number, day: number, hour: number, minute: number, daylight = false) =>
  ({ year, day, hour, minute, daylight });

function charge(event: EconomicEvent) {
  const scale = event.unitScale ?? unitsPerResource;
  const balance = (event.originBalance ?? event.destinationBalance)!;
  return [event.operation, event.result, event.units / scale, balance.before / scale, balance.after / scale, event.timeMs];
}

test('the game starts at midnight and rolls from 23:59 at exactly 600 real seconds at ×1', () => {
  const { simulation } = setup();
  assert.deepEqual(simulation.gameTime, stamp(1, 1, 0, 0));
  simulation.advance(599_750);
  assert.deepEqual(simulation.gameTime, stamp(1, 1, 23, 59));
  simulation.advance(249);
  assert.deepEqual(simulation.gameTime, stamp(1, 1, 23, 59));
  simulation.advance(1);
  assert.equal(simulation.simulatedTimeMs, 600_000);
  assert.deepEqual(simulation.gameTime, stamp(1, 2, 0, 0));
});

test('daylight runs from 06:00 through 17:59 and the year has 12 days', () => {
  assert.deepEqual(gameTimeAt(149_999), stamp(1, 1, 5, 59));
  assert.deepEqual(gameTimeAt(150_000), stamp(1, 1, 6, 0, true));
  assert.deepEqual(gameTimeAt(449_999), stamp(1, 1, 17, 59, true));
  assert.deepEqual(gameTimeAt(450_000), stamp(1, 1, 18, 0));
  assert.deepEqual(gameTimeAt(7_199_999), stamp(1, 12, 23, 59));
  assert.deepEqual(gameTimeAt(7_200_000), stamp(2, 1, 0, 0));
});

test.each([[2, 300_000], [3, 200_000]] as const)('speed ×%i advances an entire day at the specified real duration', (speed, ms) => {
  const { simulation } = setup();
  simulation.setSpeed(speed);
  simulation.advance(ms);
  assert.equal(simulation.simulatedTimeMs, 600_000);
  assert.deepEqual(simulation.gameTime, stamp(1, 2, 0, 0));
});

test('pause preserves the partial second and prevents calendar changes and charges', () => {
  const { economy, simulation } = staffed();
  simulation.advance(24_900);
  const before = simulation.gameTime;
  const gold = economy.resources.gold;
  simulation.setPaused(true);
  assert.equal(simulation.advance(180_000), false);
  assert.deepEqual(simulation.gameTime, before);
  assert.equal(economy.resources.gold, gold);
  assert.deepEqual(economy.history.read('gold'), []);

  simulation.setPaused(false);
  simulation.advance(100);
  assert.deepEqual(simulation.gameTime, stamp(1, 1, 1, 0));
  assert.equal(economy.resources.gold, 150.03);
});

test('suspension and the first resumed frame add no time or operating expenses', () => {
  const { economy, simulation } = staffed();
  simulation.advance(24_900);
  const before = simulation.gameTime;
  const gold = economy.resources.gold;
  simulation.setSuspended(true);
  assert.equal(simulation.advance(100_000), false);
  simulation.setSuspended(false);
  assert.equal(simulation.advance(100_000), false);
  assert.deepEqual(simulation.gameTime, before);
  assert.equal(economy.resources.gold, gold);
  assert.deepEqual(economy.history.read('gold'), []);
  simulation.advance(100);
  assert.equal(economy.resources.gold, 150.03);
});

test('speed changes prorate exactly the same simulated hour and never duplicate payments', () => {
  const normal = staffed(), accelerated = staffed();
  normal.simulation.advance(25_000);
  accelerated.simulation.advance(10_000);
  accelerated.simulation.setSpeed(2);
  accelerated.simulation.advance(4500);
  accelerated.simulation.setSpeed(3);
  accelerated.simulation.advance(2000);
  assert.equal(accelerated.simulation.simulatedTimeMs, 25_000);
  assert.deepEqual(accelerated.economy.resources, normal.economy.resources);
  assert.deepEqual(accelerated.economy.history.read(), normal.economy.history.read());
  assert.deepEqual(accelerated.economy.history.read('gold').filter(event => event.operation !== 'tax').map(charge), [
    ['wages', 'completed', 0.1, 150.2, 150.1, 25_000],
    ['maintenance', 'completed', 0.07, 150.1, 150.03, 25_000],
  ]);
});

test('the time conversion presents hourly rates without changing the existing per-second model', () => {
  assert.equal(perGameHour(2), 50);
  assert.equal(perGameHour(0.1), 2.5);
  assert.equal(gameMinutesForSeconds(5), 12);
  const { population } = staffed();
  assert.equal(population.foodConsumptionPerSecond, 0.2);
  assert.equal(perGameHour(population.foodConsumptionPerSecond), 5);
});

test('only employed workers earn wages when the active population exceeds available jobs', () => {
  const { map, economy, population, simulation } = staffed();
  for (let x = 2; x <= 5; x++) {
    map.place(cell(x, 1), 'road');
    map.place(cell(x, 2), 'house');
  }
  simulation.recalculate();
  for (let i = 0; i < 10; i++) population.immigrate(20);
  simulation.recalculate();
  assert.ok(population.unemployed > 0);
  assert.equal(population.employed, 4);
  assert.equal(economy.operatingCostsPerHour(population.employed).wages, 0.4);
  simulation.advance(25_000);
  const [wages] = economy.history.read('gold').filter(event => event.operation === 'wages');
  assert.equal(charge(wages)[2], 0.4);
});

test('cutting the road stops wage accrual and the demolished road stops incurring maintenance', () => {
  const { economy, population, simulation } = staffed();
  simulation.advance(10_000);
  assert.equal(simulation.requestDemolition(road), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(population.employed, 0);
  assert.deepEqual(economy.operatingCostsPerHour(population.employed), { wages: 0, maintenance: 0.06 });
  simulation.advance(15_000);
  assert.deepEqual(economy.history.read('gold').map(charge), [
    ['demolition', 'completed', 5, 150, 145, 10_000],
    ['tax', 'completed', 0.2, 145, 145.2, 25_000],
    ['wages', 'completed', 0.04, 145.2, 145.16, 25_000],
    ['maintenance', 'completed', 0.064, 145.16, 145.096, 25_000],
  ]);
  simulation.advance(25_000);
  assert.equal(economy.resources.gold, 145.236);
});

test('maintenance includes all existing construction types even without connections or workers', () => {
  const { map, economy, population, simulation } = setup();
  const types = ['road', 'house', 'farm', 'lumberjack', 'warehouse', 'market'] as const;
  types.forEach((type, index) => map.place(cell(index + 1, 5), type));
  simulation.recalculate();
  assert.deepEqual(economy.operatingCostsPerHour(population.employed), { wages: 0, maintenance: 0.28 });
  simulation.advance(25_000);
  assert.deepEqual(economy.history.read('gold').map(charge), [
    ['maintenance', 'completed', 0.28, 150, 149.72, 25_000],
  ]);
});

test('shortfalls are recorded separately from actual payments without spending beyond treasury funds', () => {
  let time = 0;
  const history = new EconomicHistory(200, () => time);
  const treasury = new Treasury(0.04, history);
  const advanceHourWithoutIncome = () => {
    for (let second = 0; second < 25; second++) treasury.accrueSecond({ wages: 10, maintenance: 7 }, 0);
    time += 25_000;
    treasury.closeHour();
  };
  advanceHourWithoutIncome();
  assert.equal(treasury.gold, 0);
  assert.deepEqual(treasury.deficits, { wages: 0.06, maintenance: 0.07 });
  assert.deepEqual(history.read('gold').map(charge), [
    ['wages', 'completed', 0.04, 0.04, 0, 25_000],
    ['wages', 'unpaid', 0.06, 0, 0, 25_000],
    ['maintenance', 'unpaid', 0.07, 0, 0, 25_000],
  ]);
  advanceHourWithoutIncome();
  assert.equal(treasury.gold, 0);
  assert.deepEqual(treasury.deficits, { wages: 0.16, maintenance: 0.14 });
});
