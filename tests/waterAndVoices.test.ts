import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { Population } from '../src/population/Population.ts';
import { HouseholdNeeds } from '../src/population/HouseholdNeeds.ts';
import type { NeedCoverage } from '../src/population/HouseholdNeeds';
import { VillageVoices, voiceRules } from '../src/population/VillageVoices.ts';
import { Wellbeing } from '../src/population/Wellbeing.ts';
import { WaterService } from '../src/simulation/WaterService.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const c = (column: number, row: number) => ({ column, row });
const firstWell = c(1, 2), secondWell = c(2, 2);
const servedHome = c(1, 0);

function network() {
  const map = new ConstructionMap(20, 20), roads = new RoadConnections();
  map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x <= 8; x++) map.place(c(x, 1), 'road');
  map.place(firstWell, 'well');
  const homes = Array.from({ length: 7 }, (_, i) => ({ cell: c(i + 1, 0), residents: 4 }));
  for (const home of homes) map.place(home.cell, 'house');
  const water = new WaterService();
  const refresh = (workers: number) => {
    roads.recalculate(map);
    water.refresh(map, roads, { workersAt: () => workers, residencesSnapshot: homes });
  };
  return { map, homes, water, refresh };
}

test('water travels at most six connected road tiles from a staffed well and each well serves up to 20 people', () => {
  const { water, homes, refresh } = network();
  refresh(1);
  assert.deepEqual(water.wellAt(firstWell), { connected: true, workers: 1, served: 20 });
  assert.equal(water.suppliedAt(servedHome), 4);
  assert.equal(homes.reduce((sum, home) => sum + water.suppliedAt(home.cell), 0), 20);
  assert.equal(water.suppliedAt(c(7, 0)), 0);

  // Make only the farthest two houses eligible for capacity, to check the range independently.
  for (const home of homes.slice(0, 5)) home.residents = 0;
  refresh(1);
  assert.equal(water.suppliedAt(c(6, 0)), 4);
  assert.equal(water.suppliedAt(c(7, 0)), 0);
});

test('an unstaffed well or a well isolated from the center supplies nobody', () => {
  const { map, water, refresh } = network();
  refresh(0);
  assert.equal(water.wellAt(firstWell)?.connected, true);
  assert.equal(water.suppliedAt(servedHome), 0);
  map.remove(c(1, 1));
  refresh(1);
  assert.deepEqual(water.wellAt(firstWell), { connected: false, workers: 0, served: 0 });
  assert.equal(water.suppliedAt(servedHome), 0);
});

test('overlapping wells allocate at most one unit of service per resident', () => {
  const { map, homes, water, refresh } = network();
  map.place(secondWell, 'well');
  refresh(1);
  assert.equal(homes.reduce((sum, home) => sum + water.suppliedAt(home.cell), 0), 28);
  assert.ok(homes.every(home => water.suppliedAt(home.cell) === home.residents));
  const supplied = [firstWell, secondWell].map(well => water.wellAt(well)!.served);
  assert.equal(supplied[0] + supplied[1], 28);
  assert.ok(supplied.every(count => count <= 20));
});

function village() {
  const map = new ConstructionMap(20, 20), roads = new RoadConnections(), population = new Population();
  const economy = new Economy();
  map.place(c(0, 1), 'villageCenter');
  map.place(c(1, 1), 'road');
  map.place(servedHome, 'house');
  const simulation = new SettlementSimulation(economy, population, 1000, map, roads);
  assert.equal(simulation.build(firstWell, 'well'), null);
  assert.equal(population.immigrate(20), 2);
  simulation.recalculate();
  return { map, population, economy, simulation };
}

test('a well charges construction, pays its water carrier and loses coverage, employment and upkeep on demolition', () => {
  const { economy, population, simulation } = village();
  assert.equal(economy.resources.gold, 130);
  assert.equal(economy.resources.wood, 40);
  assert.equal(simulation.water.suppliedAt(servedHome), 2);
  assert.equal(population.employed, 1);
  assert.deepEqual(economy.operatingCostsPerHour(population.employed), { wages: 0.1, maintenance: 0.07 });
  simulation.advance(25_000);
  assert.ok(economy.history.read('gold').some(event => event.operation === 'wages' && event.result === 'completed'));
  assert.equal(simulation.requestDemolition(firstWell), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(simulation.water.wellAt(firstWell), undefined);
  assert.equal(simulation.water.suppliedAt(servedHome), 0);
  assert.equal(population.employed, 0);
  assert.deepEqual(economy.operatingCostsPerHour(population.employed), { wages: 0, maintenance: 0.02 });
});

test('water shortages reduce wellbeing gradually and recovery is gradual too', () => {
  const wellbeing = new Wellbeing();
  const homes = [{ cell: servedHome, residents: 4 }];
  const coverage = (water: number) => () => ({ food: 1, wood: 1, water });
  for (let i = 1; i <= 50; i++) wellbeing.advanceSecond(homes, coverage(1), 0, 'normal', i * 1000);
  assert.equal(wellbeing.at(servedHome)?.happiness, 98);
  const candidate = wellbeing.advanceSecond(homes, coverage(0), 0, 'normal', 51_000);
  const after = wellbeing.at(servedHome)!.happiness;
  assert.ok(after < 98 && after > 88);
  assert.deepEqual(wellbeing.at(servedHome)?.concerns, ['Falta de agua']);
  assert.equal(candidate, undefined);
  wellbeing.advanceSecond(homes, coverage(1), 0, 'normal', 52_000);
  assert.ok(wellbeing.at(servedHome)!.happiness > after && wellbeing.at(servedHome)!.happiness < 98);
});

test('the rolling window weights occupied homes by residents and smooths an interrupted supply', () => {
  const needs = new HouseholdNeeds();
  const homes = [{ cell: servedHome, residents: 4 }, { cell: c(2, 0), residents: 1 }, { cell: c(3, 0), residents: 0 }];
  const coverage = ({ residents }: typeof homes[number]) => ({ food: 1, water: residents === 4 ? 1 : 0, wood: 0.5 });
  assert.equal(needs.summarize(homes).percentages, null);
  for (let i = 0; i < 25; i++) needs.recordSecond(homes, coverage);
  assert.deepEqual(needs.summarize(homes), { percentages: { food: 100, wood: 50, water: 80 }, mainNeed: 'wood', affected: 3 });
  assert.equal(needs.observations(homes).length, 2);
  needs.recordSecond(homes, () => ({ food: 1, wood: 0.5, water: 0 }));
  assert.equal(needs.summarize(homes).percentages?.water, 76.8);
});

const city = { unemployment: 0, tax: 'normal', waiting: 0 } as const;
const fullySupplied = { food: 1, wood: 1, water: 1 };
const observe = (coverage: NeedCoverage, current = coverage) => () =>
  [{ cell: servedHome, residents: 2, coverage, current, seconds: 25 }];

test('positive and negative opinions describe only observed conditions and can be filtered', () => {
  const voices = new VillageVoices();
  const noWater = { ...fullySupplied, water: 0 };
  for (let second = 1; second <= 240; second++) voices.advance(second * 1000, observe(noWater), city);
  const positives = voices.read('positive'), negatives = voices.read('negative'), neutrals = voices.read('neutral');
  assert.ok(positives.some(message => /comida/.test(message.text)));
  assert.ok(negatives.some(message => /falta agua/.test(message.text)));
  assert.ok(neutrals.length > 0);
  assert.ok(positives.every(message => !/agua/.test(message.text)));
  assert.ok(negatives.every(message => !/madera|comida/.test(message.text)));
  assert.equal(voices.read().length, positives.length + negatives.length + neutrals.length);
  for (let second = 241; second <= 330; second++) voices.advance(second * 1000, observe(fullySupplied), city);
  assert.ok(voices.read('positive').some(message => /agua/.test(message.text)));
  assert.ok(voices.read('negative').filter(message => message.timeMs > 240_000).length === 0);
});

test('a well-supplied home never gets a wood complaint from a stale average', () => {
  const voices = new VillageVoices();
  const formerlyShort = { ...fullySupplied, wood: 0 };
  for (let second = 1; second <= 120; second++) {
    voices.advance(second * 1000, observe(formerlyShort, fullySupplied), city);
  }
  assert.deepEqual(voices.read('negative'), []);
});

test('voices are bounded, do not publish per frame or repeat a topic too soon, and preserve demolished origins', () => {
  const voices = new VillageVoices();
  const see = observe(fullySupplied);
  for (let frame = 0; frame < 15000; frame += 16) voices.advance(frame, see, city);
  assert.deepEqual(voices.read(), []);
  for (let frame = 15000; frame <= 1800000; frame += 100) voices.advance(frame, see, city);
  const messages = voices.read();
  assert.equal(messages.length, voiceRules.historyLimit);
  const lastByText = new Map<string, number>();
  for (const [index, message] of messages.entries()) {
    if (index > 0) assert.ok(message.timeMs - messages[index - 1]!.timeMs >= voiceRules.intervalMs);
    const previous = lastByText.get(message.text);
    if (previous !== undefined) assert.ok(message.timeMs - previous >= voiceRules.repeatMs);
    lastByText.set(message.text, message.timeMs);
  }
  voices.retireHome(servedHome);
  assert.ok(voices.read().every(message => !message.originExists));
  assert.deepEqual(voices.read().map(message => message.text), messages.map(message => message.text));
});

test('demolishing a house retires its old comments even if another is built on the same tile', () => {
  const { simulation } = village();
  simulation.advance(20_000);
  assert.ok(simulation.voices.read().some(message => message.originExists));
  assert.equal(simulation.requestDemolition(servedHome), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(simulation.build(servedHome, 'house'), null);
  assert.ok(simulation.voices.read().every(message => !message.originExists));
});

test('water, needs and voices freeze on pause and match at ×1, ×2 and ×3', () => {
  const states = ([1, 2, 3] as const).map(speed => {
    const { simulation, population } = village();
    simulation.setSpeed(speed);
    simulation.advance(12_000 / speed);
    const before = simulation.needs.summarize(population.residencesSnapshot);
    simulation.setPaused(true);
    simulation.advance(100_000);
    assert.deepEqual(simulation.needs.summarize(population.residencesSnapshot), before);
    assert.deepEqual(simulation.voices.read(), []);
    assert.equal(simulation.water.suppliedAt(servedHome), 2);
    simulation.setPaused(false);
    simulation.advance(18_000 / speed);
    const voices = simulation.voices.read();
    assert.ok(voices.length > 0);
    return { needs: simulation.needs.summarize(population.residencesSnapshot), voices,
      wellbeing: simulation.wellbeing.at(servedHome), time: simulation.simulatedTimeMs };
  });
  assert.deepEqual(states[1], states[0]);
  assert.deepEqual(states[2], states[0]);
});
