import assert from 'node:assert/strict';
import { test } from 'vitest';
import { constructionDimensions } from '../src/map/ConstructionMap.ts';
import { Session } from '../src/persistence/Session.ts';
import { HousingEvolution } from '../src/population/HousingEvolution.ts';
import { urbanVoiceTemplates } from '../src/population/VillageVoiceCatalog.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';

const c = (column: number, row: number) => ({ column, row });
const home = c(10, 10);

function neighborhood() {
  const game = new Session();
  const { map } = game;
  assert.ok(map.place(c(0, 9), 'villageCenter'));
  for (let x = 1; x <= 20; x++) assert.ok(map.place(c(x, 9), 'road'));
  assert.ok(map.place(home, 'house'));
  assert.ok(map.place(c(20, 10), 'house'));
  game.simulation.recalculate();
  return game;
}

test('the best decoration counts from its nearest tile, gardens need no road, and the score is capped', () => {
  const { map, simulation } = neighborhood();
  assert.ok(map.place(c(7, 10), 'park', constructionDimensions.park));
  assert.ok(map.place(c(11, 10), 'plaza', constructionDimensions.plaza));
  assert.ok(map.place(c(10, 8), 'garden'));
  assert.ok(map.place(c(11, 8), 'garden'));
  assert.ok(map.place(c(10, 11), 'garden')); // Closer and valid despite being disconnected.
  simulation.recalculate();
  assert.deepEqual(simulation.beauty.at(home), { score: 100, sources: { garden: 25, park: 35, plaza: 40 } });
  assert.equal(simulation.beauty.at(c(20, 10)).score, 15);
  assert.ok(map.remove(c(9, 12)));
  simulation.recalculate();
  assert.equal(simulation.beauty.at(home).score, 80);
});

test('decoration charges maintenance once, employs nobody and a fountain supplies no water after loading', () => {
  const snapshot = neighborhood().saveState(null);
  snapshot.economy.treasury.units *= 4;
  const { session: game } = Session.restore(snapshot);
  const { economy, simulation, population } = game;
  setFixtureRank(simulation, 'villa');
  assert.equal(simulation.build(c(7, 10), 'park'), null);
  assert.equal(simulation.build(c(11, 10), 'plaza'), null);
  assert.equal(simulation.build(c(10, 8), 'garden'), null);
  const restored = Session.restore(game.saveState(null)).session;
  assert.equal(restored.map.constructionAt(c(8, 12))?.width, 3);
  assert.equal(restored.map.constructionAt(c(12, 11))?.height, 2);
  assert.deepEqual(restored.simulation.beauty.at(home), simulation.beauty.at(home));
  assert.deepEqual(restored.economy.resources, economy.resources);
  assert.equal(restored.economy.operatingCostsPerHour(0).maintenance, 6.74);
  assert.equal(restored.simulation.water.suppliedAt(home), 0);
  assert.equal(population.jobCapacity, 0);
});

test('advanced housing needs 35 and 65 beauty and deteriorates only after sustained loss', () => {
  const model = new HousingEvolution();
  const supply = { food: 1, wood: 1, water: 1 };
  const step = (level: 2 | 3 | 4, beauty: number, seconds: number) => {
    let changed;
    for (let second = 0; second < seconds; second++) changed = model.advanceSecond(home, level, 90, supply, 0, beauty);
    return changed;
  };
  assert.equal(step(2, 34, 60), undefined);
  assert.equal(step(2, 35, 60), 3);
  assert.equal(step(3, 64, 60), undefined);
  assert.equal(step(3, 65, 60), 4);
  assert.equal(step(4, 64, 59), undefined);
  assert.equal(model.at(home).deterioration, 59);
  assert.equal(step(4, 65, 1), undefined);
  assert.equal(model.at(home).deterioration, 0);
  assert.equal(step(4, 64, 60), 3);
});

test('urban comments use decoration and beauty at the author’s actual home', () => {
  const { map, simulation } = neighborhood();
  assert.ok(map.place(c(10, 8), 'garden'));
  simulation.recalculate();
  const observations = { residents: 2, seconds: 15, current: { food: 1, wood: 1, water: 1 },
    coverage: { food: 1, wood: 1, water: 1 } };
  const context = { unemployment: 0, tax: 'normal' as const, waiting: 0, beautyAt: (cell: typeof home) => simulation.beauty.at(cell) };
  const matches = (cell: typeof home) => urbanVoiceTemplates.filter(template => template.matches({ ...observations, cell }, context))
    .map(template => template.topic);
  assert.deepEqual(matches(home), ['garden']);
  assert.deepEqual(matches(c(20, 10)), ['sparse']);
});
