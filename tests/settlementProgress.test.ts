import assert from 'node:assert/strict';
import { test } from 'vitest';
import { constructionDimensions, constructionNames } from '../src/map/ConstructionMap.ts';
import type { ConstructionType } from '../src/map/ConstructionMap.ts';
import { Session } from '../src/persistence/Session.ts';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots.ts';
import { simulatedMsPerGameHour } from '../src/simulation/GameTime.ts';
import { SettlementProgress, rankRules } from '../src/simulation/SettlementProgress.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';

const c = (column: number, row: number) => ({ column, row });

test('a new world is an Aldea and offers the introduction once, including after tab recovery', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const saves = new SaveSlots(() => storage, () => storage);
  const game = Session.start(81);
  assert.equal(game.simulation.progress.rank, 'aldea');
  assert.equal(game.takeIntroduction(), true);
  assert.equal(game.takeIntroduction(), false);
  game.simulation.progress.markChapter('aldea', 'story', 'skipped');
  saves.checkpointTab(game, null, { x: 100, y: 100, zoom: 1 });
  const restored = saves.resumeTab()!.session;
  assert.equal(restored.takeIntroduction(), false);
  assert.deepEqual(restored.simulation.progress.chapter('aldea'), { story: 'skipped' });
  assert.equal(Session.restore(Session.start(82).saveState(null)).session.takeIntroduction(), false);
});

test.each(['pueblo', 'villa'] as const)('%s requires every objective and a successful payment', rank => {
  const progress = new SettlementProgress();
  const rules = rankRules[rank];
  const payment: number[] = [];
  const pay = (gold: number) => { payment.push(gold); return true; };
  if (rank === 'villa') {
    assert.equal(progress.recognize(rank, rules.minimum, 0, pay), false);
    assert.equal(progress.recognize('pueblo', rankRules.pueblo.minimum, 0, () => true), true);
  }
  for (const [index, [key, value]] of Object.entries(rules.minimum).entries()) {
    const stats = { ...rules.minimum, [key]: value - 1 };
    const next = progress.next(stats)!;
    assert.equal(next.goals[index]?.current, value - 1);
    assert.equal(next.goals[index]?.complete, false);
    assert.equal(next.ready, false);
    assert.equal(progress.recognize(rank, stats, 1000, pay), false);
  }
  assert.equal(progress.next(rules.minimum)?.ready, true);
  assert.equal(progress.recognize(rank, rules.minimum, 1000, () => false), false);
  assert.deepEqual(payment, []);
  assert.equal(progress.recognize(rank, rules.minimum, 1000, pay), true);
  assert.equal(progress.recognize(rank, rules.minimum, 1000, pay), false);
  assert.deepEqual(payment, [rules.minimum.gold]);
  assert.equal(progress.recognitionAt(rank), 1000);
});

test('the catalog and construction commands enforce the rank for parks, plazas and road upgrades', () => {
  const { simulation, map, economy } = new Session();
  assert.ok(map.place(c(2, 3), 'road'));
  const site = c(3, 3);
  const locked = (rank: string) => 'Requiere rango de ' + rank;
  const resources = economy.resources;
  assert.deepEqual(Object.keys(constructionNames).filter(type => simulation.progress.buildingLock(type as ConstructionType)),
    ['tradeHouse', 'park', 'plaza']);
  assert.equal(simulation.build(site, 'park'), locked('Pueblo'));
  assert.equal(simulation.build(site, 'plaza'), locked('Villa'));
  assert.equal(simulation.upgradeRoad(c(2, 3), 1), locked('Pueblo'));
  assert.deepEqual(economy.resources, resources);
  assert.equal(map.getConstruction(site), null);
  setFixtureRank(simulation, 'pueblo');
  assert.equal(simulation.build(site, 'park'), null);
  assert.equal(simulation.upgradeRoad(c(2, 3), 1), null);
  assert.equal(simulation.build(c(7, 7), 'plaza'), locked('Villa'));
  setFixtureRank(simulation, 'villa');
  assert.equal(simulation.progress.buildingLock('plaza'), null);
  assert.equal(simulation.progress.roadLock(3), null);
});

test('older saves retain multicell decoration, paving and resources without unlocking construction or reopening the story', () => {
  const game = new Session();
  assert.ok(game.map.place(c(2, 2), 'plaza', constructionDimensions.plaza));
  assert.ok(game.map.place(c(2, 4), 'park', constructionDimensions.park));
  assert.ok(game.map.place(c(2, 7), 'road'));
  assert.ok(game.map.upgradeRoad(c(2, 7), 2));
  assert.ok(game.map.upgradeRoad(c(2, 7), 3));
  const { progression, ...legacy } = game.saveState(null);
  const data = new Map([[saveKey(1), JSON.stringify({ version: 2, savedAt: 1, state: legacy })]]);
  const slots = new SaveSlots(() => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }));
  const { session } = slots.load(1);
  assert.equal(session.simulation.progress.rank, 'aldea');
  assert.equal(session.takeIntroduction(), false);
  assert.equal(session.map.getConstruction(c(3, 3)), 'plaza');
  assert.equal(session.map.getConstruction(c(4, 6)), 'park');
  assert.equal(session.map.roadLevelAt(c(2, 7)), 3);
  assert.deepEqual(session.economy.resources, game.economy.resources);
});

test.each([false, true])('closing an omitted chapter preserves clock, fractional tick, speed and player pause (%s)', paused => {
  const game = new Session();
  const { simulation } = game;
  simulation.advance(400);
  simulation.setPaused(paused);
  simulation.setSpeed(3);
  simulation.setReadingChapter(true);
  const clock = simulation.saveState();
  assert.equal(simulation.advance(99_999), false);
  simulation.progress.markChapter('aldea', 'story', 'skipped');
  const loaded = Session.restore(game.saveState(null)).session.simulation;
  assert.deepEqual(loaded.saveState(), clock);
  assert.equal(loaded.advance(200), !paused);
  simulation.setReadingChapter(false);
  assert.deepEqual(simulation.saveState(), clock);
  assert.equal(simulation.advance(200), !paused);
  assert.equal(simulation.simulatedTimeMs, paused ? 0 : 1000);
});

test('a supplied settlement earns both recognitions using only construction available at the previous rank', () => {
  const game = new Session();
  const { map, economy, population, simulation } = game;
  assert.ok(map.terrain.plantTree(c(6, 2)));
  const build = (x: number, y: number, type: ConstructionType) =>
    assert.equal(simulation.build(c(x, y), type), null, `${type} at ${x},${y} with ${JSON.stringify(economy.resources)}`);
  const hoursUntil = (condition: () => boolean, maxHours: number) => {
    for (let hour = 0; hour < maxHours && !condition(); hour++) {
      const tribute = simulation.crown.obligation;
      if (tribute && !tribute.paid && tribute.dueAt - simulation.simulatedTimeMs <= simulatedMsPerGameHour) {
        assert.ok(simulation.payTribute(tribute.dueAt));
      }
      simulation.advance(simulatedMsPerGameHour);
    }
    assert.ok(condition(), JSON.stringify({ stats: simulation.settlementStats(), resources: economy.resources,
      homes: population.residencesSnapshot, firstMarket: economy.distribution.marketAt(c(3, 6)),
      warehouse: economy.storage.warehouseAt(c(1, 6)) }));
  };
  build(0, 5, 'villageCenter');
  for (let x = 1; x <= 7; x++) build(x, 5, 'road');
  build(1, 2, 'farm');
  build(4, 3, 'lumberjack');
  build(1, 6, 'warehouse');
  build(3, 6, 'market');
  build(5, 6, 'house');
  build(6, 6, 'house');
  build(7, 6, 'house');
  economy.setTaxPolicy('high');
  hoursUntil(() => population.total >= 10 && economy.resources.gold >= 35, 120);
  build(8, 5, 'road');
  build(8, 4, 'well');
  hoursUntil(() => economy.resources.gold >= 300, 400);

  for (let x = 9; x <= 14; x++) build(x, 5, 'road');
  build(12, 2, 'farm');
  build(13, 6, 'warehouse');
  economy.setWarehouseAcceptance(c(13, 6), 'wood', false);
  build(9, 3, 'market');
  economy.setMarketSale(c(9, 3), 'wood', true); // This supplied-town fixture must also replenish domestic wood.
  economy.setMarketSale(c(3, 6), 'food', false);
  economy.setMarketSale(c(3, 6), 'wood', false);
  build(7, 4, 'house');
  for (const x of [8, 9]) build(x, 6, 'house');
  for (let y = 6; y <= 8; y++) build(0, y, 'road');
  for (let x = 1; x <= 10; x++) build(x, 8, 'road');
  build(6, 4, 'garden');
  build(10, 6, 'garden');
  build(6, 7, 'garden');
  hoursUntil(() => simulation.progress.next(simulation.settlementStats())!.ready, 600);
  assert.equal(simulation.progress.rank, 'aldea');
  const original = economy.resources;
  const cells = map.saveCells();
  assert.equal(simulation.recognize('pueblo'), true);
  assert.equal(simulation.recognize('pueblo'), false);
  assert.deepEqual({ ...economy.resources, gold: economy.resources.gold + rankRules.pueblo.minimum.gold }, original);
  assert.deepEqual(map.saveCells(), cells);
  assert.equal(economy.history.read('gold').filter(event => event.operation === 'recognition').length, 1);

  economy.setMarketSale(c(3, 6), 'wood', true);
  hoursUntil(() => economy.resources.gold >= 900, 650);
  economy.setWarehouseMarketDispatch(c(1, 6), 'wood', false);
  hoursUntil(() => economy.availableConstructionWood >= 125, 24);
  build(5, 9, 'park');
  build(9, 9, 'park');
  for (let x = 5; x <= 9; x++) assert.equal(simulation.upgradeRoad(c(x, 5), 1), null);

  for (let x = 15; x <= 26; x++) build(x, 5, 'road');
  build(15, 2, 'farm');
  build(18, 2, 'farm');
  build(24, 2, 'farm');
  build(22, 3, 'warehouse');
  economy.setWarehouseAcceptance(c(22, 3), 'wood', false);
  build(11, 6, 'market');
  economy.setMarketSale(c(11, 6), 'wood', false);
  build(21, 6, 'market');
  economy.setMarketSale(c(21, 6), 'wood', false);
  for (const x of [15, 18, 24]) build(x, 6, 'well');
  for (const x of [16, 17, 19, 20, 23, 25, 26]) build(x, 6, 'house');
  for (let x = 11; x <= 26; x++) build(x, 8, 'road');
  build(27, 5, 'road');
  for (let y = 6; y <= 8; y++) build(27, y, 'road');
  for (const x of [15, 20, 25]) build(x, 7, 'garden');
  economy.setWarehouseMarketDispatch(c(1, 6), 'wood', true);
  // Bank the recognition and park costs before taking on the new upkeep.
  hoursUntil(() => economy.resources.gold >= 2200, 950);
  for (const x of [14, 18, 24]) build(x, 9, 'park');
  economy.setWarehouseMarketDispatch(c(1, 6), 'wood', false);
  hoursUntil(() => economy.availableConstructionWood >= 8, 24);
  for (const x of [15, 19, 24, 26]) assert.equal(simulation.upgradeRoad(c(x, 5), 1), null);
  economy.setWarehouseMarketDispatch(c(1, 6), 'wood', true);
  hoursUntil(() => simulation.progress.next(simulation.settlementStats())!.ready, 300);
  const villaGold = economy.resources.gold;
  assert.equal(simulation.recognize('villa'), true);
  assert.equal(simulation.recognize('villa'), false);
  assert.equal(Math.round((economy.resources.gold + rankRules.villa.minimum.gold) * 1e6), Math.round(villaGold * 1e6));
  assert.equal(simulation.progress.next(simulation.settlementStats()), null);
  simulation.progress.markChapter('pueblo', 'story', 'seen');
  simulation.progress.markChapter('pueblo', 'tutorial', 'skipped');
  simulation.progress.markChapter('villa', 'story', 'skipped');
  simulation.progress.markChapter('villa', 'tutorial', 'seen');
  const restored = Session.restore(game.saveState(null)).session;
  assert.equal(restored.simulation.progress.rank, 'villa');
  assert.deepEqual(restored.simulation.progress.saveState(), simulation.progress.saveState());
  assert.deepEqual(restored.economy.resources, economy.resources);
  assert.equal(restored.takeIntroduction(), false);
}, 40_000);
