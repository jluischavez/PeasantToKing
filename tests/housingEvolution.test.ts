import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Economy } from '../src/economy/Economy.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { ConstructionMap, constructionDimensions } from '../src/map/ConstructionMap.ts';
import { RoadConnections } from '../src/map/RoadConnections.ts';
import { HousingEvolution, housingLevels, housingRules } from '../src/population/HousingEvolution.ts';
import { Population, populationRules } from '../src/population/Population.ts';
import { VillageVoices, voiceRules } from '../src/population/VillageVoices.ts';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation.ts';

const c = (column: number, row: number) => ({ column, row });
const house = c(5, 2), other = c(6, 2), well = c(5, 0);
const farm = c(1, 2), camp = c(2, 2);
const complete = { food: 1, wood: 1, water: 1 };
const duration = housingRules.seconds * 1000;

function village(decorated = false) {
  const map = new ConstructionMap(20, 20), population = new Population(), roads = new RoadConnections();
  const economy = new Economy();
  const simulation = new SettlementSimulation(economy, population, 1000, map, roads);
  map.place(c(0, 1), 'villageCenter');
  assert.ok(map.terrain.plantTree(c(2, 4)));
  for (let x = 1; x <= 6; x++) map.place(c(x, 1), 'road');
  for (const [cell, type] of [[farm, 'farm'], [camp, 'lumberjack'], [c(3, 2), 'warehouse'], [c(4, 2), 'market'],
    [well, 'well'], [house, 'house'], [other, 'house']] as const) map.place(cell, type);
  if (decorated) {
    for (let row = 1; row <= 3; row++) assert.ok(map.place(c(7, row), 'road'));
    assert.ok(map.place(c(5, 3), 'plaza', constructionDimensions.plaza));
    assert.ok(map.place(c(8, 2), 'park', constructionDimensions.park));
  }
  simulation.recalculate();
  while (population.total < 8) assert.ok(population.immigrate(100) > 0);
  simulation.recalculate();
  assert.equal(population.workersAt(well), 1);
  assert.equal(simulation.water.suppliedAt(house), 4);
  assert.ok(economy.storage.depositProduction(farm, 'food', 230 * U));
  assert.ok(economy.storage.depositProduction(camp, 'wood', 60 * U));
  return { map, population, economy, simulation };
}

function startProgress(simulation: SettlementSimulation) {
  for (let second = 0; second < 45 && simulation.housing.at(house).improvement === 0; second++) {
    simulation.advance(1000);
  }
  assert.equal(simulation.housing.at(house).improvement, 1);
}

test('continuous good conditions advance through all four capacities and stop at level four', () => {
  const { simulation, population } = village(true);
  startProgress(simulation);
  simulation.advance(duration - 2000);
  assert.equal(population.housingLevelAt(house), 1);
  assert.equal(simulation.housing.at(house).improvement, 59);
  simulation.advance(1000);
  assert.equal(population.housingLevelAt(house), 2);
  assert.equal(population.residentialCapacity, 12);
  assert.equal(population.availableHousing, 4);
  simulation.advance(duration);
  assert.equal(population.housingLevelAt(house), 3);
  assert.equal(population.connectedCapacity, 16);
  simulation.advance(duration);
  assert.equal(population.housingLevelAt(house), 4);
  assert.equal(population.residentialCapacity, 24);
  assert.equal(population.total, 8);
  simulation.advance(1000);
  assert.deepEqual(simulation.housing.at(house), { improvement: 0, deterioration: 0 });
});

test('any lost requirement resets continuous improvement and recovery starts a new count', () => {
  const housing = new HousingEvolution();
  for (let i = 0; i < 59; i++) assert.equal(housing.advanceSecond(house, 1, 80, complete, 0.25), undefined);
  assert.equal(housing.advanceSecond(house, 1, 90, { ...complete, water: 0.99 }, 0), undefined);
  assert.deepEqual(housing.at(house), { improvement: 0, deterioration: 0 });
  assert.equal(housing.advanceSecond(house, 1, 80, complete, 0.26), undefined);
  assert.equal(housing.at(house).improvement, 0);
  assert.equal(housing.advanceSecond(house, 1, 79.99, complete, 0), undefined);
  for (let i = 0; i < 59; i++) assert.equal(housing.advanceSecond(house, 1, 80, complete, 0), undefined);
  assert.equal(housing.advanceSecond(house, 1, 80, complete, 0), 2);
});

test('neutral conditions reset deterioration and the minimum level cannot deteriorate', () => {
  const housing = new HousingEvolution();
  for (let i = 0; i < 59; i++) housing.advanceSecond(house, 3, 39, complete, 0, 65);
  assert.equal(housing.at(house).deterioration, 59);
  assert.equal(housing.advanceSecond(house, 3, 50, complete, 0, 65), undefined);
  assert.deepEqual(housing.at(house), { improvement: 0, deterioration: 0 });
  for (let i = 0; i < 59; i++) assert.equal(housing.advanceSecond(house, 3, 90, { ...complete, food: 0 }, 0), undefined);
  assert.equal(housing.advanceSecond(house, 3, 90, { ...complete, food: 0 }, 0), 2);
  for (let i = 0; i < 180; i++) assert.equal(housing.advanceSecond(house, 1, 0, { food: 0, wood: 0, water: 0 }, 1), undefined);
});

test.each([1, 2, 3] as const)('pause and speed ×%i use the same simulated progress', speed => {
  const { simulation, population } = village();
  startProgress(simulation);
  simulation.setSpeed(speed);
  simulation.advance(29_000 / speed);
  assert.equal(simulation.housing.at(house).improvement, 30);
  simulation.setPaused(true);
  simulation.advance(120_000);
  assert.equal(simulation.housing.at(house).improvement, 30);
  simulation.setPaused(false);
  simulation.advance(30_000 / speed);
  assert.equal(population.housingLevelAt(house), 2);
});

test('immigration forecasts and admissions use the capacity of the upgraded house', () => {
  const { economy, simulation, population } = village();
  startProgress(simulation);
  simulation.advance(duration - 1000);
  const supply = economy.immigrationSupply(population, 2, 5, populationRules.foodPerResidentPerSecond, 4);
  assert.ok(supply.has('5,2'));
  assert.equal(population.immigrate(100, new Map([['5,2', 2]])), 2);
  assert.equal(population.residentsAt(house), housingLevels[2].capacity);
  assert.equal(population.immigrate(100, new Map([['5,2', 2]])), 0);
});

test('deterioration reduces capacity one level, records displaced residents and updates the workforce', () => {
  const { economy, simulation, population } = village();
  startProgress(simulation);
  simulation.advance(duration - 1000);
  assert.equal(population.immigrate(100, new Map([['5,2', 2]])), 2);
  assert.equal(population.total, 10);
  assert.equal(simulation.requestDemolition(well), null);
  assert.equal(simulation.confirmDemolition(), null);
  const employed = population.employed;
  simulation.advance(duration - 1000);
  assert.equal(population.housingLevelAt(house), 2);
  assert.equal(simulation.housing.at(house).deterioration, 59);
  simulation.advance(1000);
  assert.equal(population.housingLevelAt(house), 1);
  assert.equal(population.residentialCapacity, 8);
  assert.equal(population.total, 8);
  assert.equal(population.employed, employed - 1);
  assert.equal(population.foodConsumptionPerSecond, 0.8);
  assert.equal(economy.taxIncomePerHour(population.total), 0.8);
  const event = simulation.wellbeing.emigrationEvents.at(-1)!;
  assert.equal(event.reason, 'deterioration');
  assert.equal(event.residents, 2);
  assert.deepEqual(event.cell, house);
  simulation.advance(35_000);
  const voices = simulation.voices.read();
  assert.ok(voices.some(message => message.tone === 'positive' && message.text.includes('mejoramos nuestra casa')));
  assert.ok(voices.some(message => message.tone === 'negative' && message.text.includes('bajado de nivel')));
  assert.ok(voices.every((message, i) => i === 0 || message.timeMs - voices[i - 1]!.timeMs >= 15_000));
});

test('demolishing and rebuilding a developed house clears its level and its progress', () => {
  const { simulation, population } = village(true);
  startProgress(simulation);
  simulation.advance(duration - 1000);
  simulation.advance(5000);
  assert.equal(population.housingLevelAt(house), 2);
  assert.ok(simulation.housing.at(house).improvement > 0);
  assert.equal(simulation.requestDemolition(house), null);
  assert.equal(simulation.confirmDemolition(), null);
  assert.equal(simulation.build(house, 'house'), null);
  assert.equal(population.housingLevelAt(house), 1);
  assert.equal(population.residentsAt(house), 0);
  assert.deepEqual(simulation.housing.at(house), { improvement: 0, deterioration: 0 });
});

test('simultaneous upgrades share the voice cooldown while distinct deterioration can be reported', () => {
  const voices = new VillageVoices();
  const publish = (timeMs: number) => voices.advance(timeMs, () => [], { unemployment: 0, tax: 'normal', waiting: 0 });
  voices.reportHousingChange(house, true);
  voices.reportHousingChange(other, true);
  publish(15_000);
  publish(30_000);
  assert.equal(voices.read('positive').length, 1);
  voices.reportHousingChange(house, false);
  publish(30_000);
  assert.equal(voices.read('negative').length, 1);
  publish(15_000 + voiceRules.repeatMs);
  assert.equal(voices.read('positive').length, 2);
  assert.deepEqual(voices.read('positive').at(-1)?.home, other);
});
