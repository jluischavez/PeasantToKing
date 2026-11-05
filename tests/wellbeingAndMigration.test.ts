import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population } from '../src/population/Population.ts';
import { Wellbeing, wellbeingRules } from '../src/population/Wellbeing.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';
import { simulatedMsPerGameHour } from '../src/simulation/GameTime.ts';

const c = (column: number, row: number) => ({ column, row });
const road = c(1, 0), house = c(4, 1), another = c(5, 1);

function town({ food = 20, interval = 5, seed = true } = {}) {
  const map = new ConstructionMap(20, 20);
  const economy = new Economy({ gold: 150, food, wood: 50 });
  const population = new Population();
  const roads = new RoadConnections();
  const simulation = new SettlementSimulation(economy, population, interval, map, roads);
  map.place(c(0, 0), 'villageCenter');
  for (let x = 1; x <= 5; x++) map.place(c(x, 0), 'road');
  map.place(c(2, 1), 'farm');
  map.place(house, 'house');
  simulation.recalculate();
  if (seed) {
    population.immigrate(100);
    population.immigrate(100);
    simulation.recalculate();
    assert.equal(population.total, 4);
  }
  const city = () => simulation.wellbeing.summarize(population.residencesSnapshot);
  return { map, economy, population, simulation, city };
}

test('a city with no housing can still attract a waiting list and keeps neutral wellbeing', () => {
  const { map, population, simulation, city } = town({ seed: false });
  map.remove(house);
  simulation.recalculate();
  simulation.advance(10_000);
  assert.equal(population.availableHousing, 0);
  assert.ok(simulation.migrationAttractiveness(city().happiness) > 0);
  assert.ok(population.waitingImmigrants > 0);
  assert.equal(population.total, 0);
  assert.deepEqual(city(), {
    happiness: 70, state: 'Neutral · sin habitantes', satisfied: 0, dissatisfied: 0, crisis: 0, concerns: [],
  });
});

test('a full attractive town builds a bounded queue and fills a new plot from that queue first', () => {
  const { population, simulation, city } = town();
  simulation.advance(15_000);
  assert.equal(population.availableHousing, 0);
  assert.ok(simulation.migrationAttractiveness(city().happiness) > 0);
  const waiting = population.waitingImmigrants;
  assert.equal(waiting, population.waitingCapacity);
  assert.equal(population.total, 4);
  assert.equal(simulation.build(another, 'house'), null);
  simulation.advance(5000);
  assert.equal(population.residentsAt(another), 2);
  assert.equal(population.waitingImmigrants, waiting - 2);
  simulation.advance(5000);
  assert.equal(population.total, population.residentialCapacity);
  assert.equal(population.residentsAt(another), 4);
});

test('people on the waiting list do not consume, work or pay taxes', () => {
  const queued = town(), control = town({ interval: 1000 });
  for (const state of [queued, control]) state.simulation.advance(simulatedMsPerGameHour);
  assert.ok(queued.population.waitingImmigrants > 0);
  assert.equal(control.population.waitingImmigrants, 0);
  assert.equal(queued.population.total, control.population.total);
  assert.equal(queued.population.employed, control.population.employed);
  assert.equal(queued.population.foodConsumptionPerSecond, control.population.foodConsumptionPerSecond);
  assert.deepEqual(queued.economy.resources, control.economy.resources);
  assert.deepEqual(queued.economy.history.read(), control.economy.history.read());
});

test('prolonged unattractiveness gradually reduces the waiting list', () => {
  const { map, population, simulation } = town();
  simulation.advance(10_000);
  const before = population.waitingImmigrants;
  assert.ok(before >= 2);
  map.remove(road);
  simulation.recalculate();
  simulation.advance(simulatedMsPerGameHour - 1000);
  assert.equal(population.waitingImmigrants, before);
  simulation.advance(1000);
  assert.equal(population.waitingImmigrants, before - 1);
  assert.equal(population.total, 4);
});

test('the queue limit grows with the current population and remains bounded at full capacity', () => {
  const small = town();
  const { map, population, simulation } = town({ seed: false });
  for (let x = 1; x <= 5; x++) {
    map.place(c(x, 2), 'house');
    map.place(c(x, 1), 'road');
  }
  simulation.recalculate();
  for (let i = 0; i < 100; i++) population.immigrate(100);
  assert.ok(population.total > 8);
  assert.ok(population.waitingCapacity > small.population.waitingCapacity);
  assert.ok(population.waitingImmigrants <= population.waitingCapacity);
  assert.ok(population.total <= population.residentialCapacity);
});

test('a brief food shortage lowers wellbeing gradually, and reconnection reverses the trend', () => {
  const { map, population, simulation, city } = town();
  simulation.advance(5000);
  const before = city().happiness;
  map.remove(road);
  simulation.recalculate();
  simulation.advance(10_000);
  const low = city().happiness;
  assert.ok(low < before && low > 0);
  assert.ok(city().concerns.includes('Falta de comida'));
  assert.deepEqual(simulation.wellbeing.emigrationEvents, []);
  assert.equal(population.total, 4);
  assert.equal(simulation.build(road, 'road'), null);
  simulation.advance(10_000);
  assert.ok(city().happiness > low);
  assert.ok(!city().concerns.includes('Falta de comida'));
});

test('policy affects wellbeing gradually while tax attraction is a separate one-time modifier', () => {
  const { simulation, economy, city } = town();
  simulation.advance(1000);
  const current = city().happiness;
  const normal = simulation.migrationAttractiveness(current);
  economy.setTaxPolicy('high');
  assert.equal(city().happiness, current);
  assert.equal(simulation.migrationAttractiveness(current), normal - 20);

  const households = [{ cell: house, residents: 4 }];
  const model = new Wellbeing();
  const supplied = () => ({ food: 1, wood: 1, water: 1 });
  for (let i = 1; i <= 100; i++) model.advanceSecond(households, supplied, 0, 'high', i * 1000);
  assert.equal(model.at(house)?.happiness, 94.5);
  model.advanceSecond(households, supplied, 0, 'low', 101_000);
  assert.ok(model.at(house)!.happiness > 94.5 && model.at(house)!.happiness < 100);
});

test('city wellbeing weights actual residents and ignores empty lots', () => {
  const model = new Wellbeing();
  const empty = c(6, 1);
  const homes = [{ cell: house, residents: 4 }, { cell: another, residents: 1 }, { cell: empty, residents: 0 }];
  for (let i = 1; i <= 25; i++) model.advanceSecond(homes,
    home => home.cell === house ? { food: 1, wood: 1, water: 1 } : { food: 0, wood: 0, water: 0 }, 0, 'normal', i * 1000);
  assert.equal(model.at(empty), undefined);
  const high = model.at(house)!.happiness, low = model.at(another)!.happiness;
  assert.ok(high > low);
  const city = model.summarize(homes);
  assert.equal(city.happiness, (high * 4 + low) / 5);
  assert.deepEqual([city.satisfied, city.dissatisfied, city.crisis], [1, 1, 0]);
});

test('after sustained distress a resident leaves an actual house and the normal economic counters update', () => {
  const { economy, population, simulation } = town({ food: 0 });
  simulation.advance(50_000);
  assert.equal(population.total, 4);
  assert.equal(simulation.wellbeing.emigrationEvents.length, 0);
  simulation.advance(50_000);
  assert.equal(population.residentsAt(house), 3);
  assert.equal(population.total, 3);
  assert.equal(population.employed, 1);
  assert.equal(population.activePopulation, 1);
  assert.equal(population.unemployed, 0);
  assert.equal(population.foodConsumptionPerSecond, 0.3);
  assert.equal(economy.distribution.woodShortageAt(house), 0.06);
  assert.equal(economy.taxIncomePerHour(population.total), 0.3);
  assert.equal(population.availableHousing, 1);
  const [departure] = simulation.wellbeing.emigrationEvents;
  assert.deepEqual(departure.cell, house);
  assert.equal(departure.residents, 1);
  assert.ok(departure.timeMs > 2 * simulatedMsPerGameHour);
});

test('emigration opens a recovery interval before readmission even if there is housing and food', () => {
  const { population, simulation } = town({ food: 0 });
  simulation.advance(100_000);
  const [departure] = simulation.wellbeing.emigrationEvents;
  assert.ok(departure);
  const wellbeing = simulation.wellbeing;
  const during = departure.timeMs + simulatedMsPerGameHour;
  const after = departure.timeMs + wellbeingRules.readmissionDelayHours * simulatedMsPerGameHour;
  const residents = population.total;
  assert.equal(population.immigrate(100, undefined, { admissionsOpen: wellbeing.admissionsOpen(during, 70) }), 0);
  assert.equal(population.total, residents);
  assert.ok(population.waitingImmigrants > 0);
  assert.equal(wellbeing.admissionsOpen(after, 40), false);
  assert.equal(population.immigrate(100, undefined, { admissionsOpen: wellbeing.admissionsOpen(after, 70) }), 1);
});

test('pause freezes wellbeing, waiting and departures; accelerated time gives the same results', () => {
  const normal = town({ food: 0 }), fast = town({ food: 0 });
  fast.simulation.setSpeed(3);
  fast.simulation.advance(15_000);
  const before = fast.city(), waiting = fast.population.waitingImmigrants;
  fast.simulation.setPaused(true);
  fast.simulation.advance(120_000);
  assert.deepEqual(fast.city(), before);
  assert.equal(fast.population.waitingImmigrants, waiting);
  assert.equal(fast.simulation.wellbeing.emigrationEvents.length, 0);
  fast.simulation.setPaused(false);
  fast.simulation.advance(25_000);
  normal.simulation.advance(120_000);
  assert.deepEqual(fast.city(), normal.city());
  assert.deepEqual(fast.simulation.wellbeing.emigrationEvents, normal.simulation.wellbeing.emigrationEvents);
  assert.deepEqual(fast.economy.resources, normal.economy.resources);
});
