import assert from 'node:assert/strict';
import { test } from 'vitest';
import { kingdomEventCatalog } from '../src/story/KingdomEventCatalog.ts';
import { KingdomEvents, kingdomEventRules } from '../src/simulation/KingdomEvents.ts';
import type { MissionEffect, RealmContext } from '../src/simulation/KingdomEvents.ts';
import { simulatedMsPerGameHour as hour } from '../src/simulation/GameTime.ts';
import { unitsPerResource as U } from '../src/economy/Inventories.ts';
import { Session } from '../src/persistence/Session.ts';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots.ts';
import { newWorld, proceduralTerrain } from '../src/map/World.ts';
import { TerrainMap } from '../src/map/Terrain.ts';
import { constructionDimensions } from '../src/map/ConstructionMap.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';
import { missionReward, missionResult } from '../src/story/KingdomMissionText.ts';

const day = 24 * hour;
const c = (column: number, row: number) => ({ column, row });

function rewardScenario() {
  const game = town(23);
  installOffer(game, 'royal-war');
  const state = game.simulation.kingdomEvents.saveState();
  state.current!.reward = { gold: 18, favor: 4, food: 20, wood: 15 };
  game.simulation.kingdomEvents.restoreState(state, game.simulation.simulatedTimeMs);
  return { game, engine: game.simulation.kingdomEvents, mission: game.simulation.kingdomEvents.current! };
}

test('gold contributions and rewards retain separate exact ledger balances and the mission reports their net', () => {
  const { game, engine, mission } = rewardScenario(), before = game.economy.credit.balance;
  assert.equal(mission.objective.kind, 'gold'); assert.ok(mission.reward.gold > 0);
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  const contribution = game.economy.history.read('gold').find(event => event.operation === 'mission-contribution')!;
  const reward = game.economy.history.read('gold').find(event => event.operation === 'mission-reward')!;
  const cost = mission.objective.target, credit = mission.reward.gold;
  const costScale = contribution.unitScale ?? U, rewardScale = reward.unitScale ?? U;
  assert.equal(contribution.units / costScale, cost); assert.equal(reward.units / rewardScale, credit);
  assert.deepEqual(contribution.originBalance, { before: before * costScale, after: (before - cost) * costScale });
  assert.deepEqual(reward.destinationBalance, { before: (before - cost) * rewardScale, after: (before - cost + credit) * rewardScale });
  assert.equal(game.economy.credit.balance, before - cost + credit);
  assert.equal(engine.history.at(-1)!.result!.gold, credit - cost);
  assert.equal(engine.history.at(-1)!.result!.goldReceived, credit);
});

test('combined gold, food, wood and favor settle exactly once through real inventories and audit', () => {
  const { game, engine, mission } = rewardScenario();
  const before = game.economy.resources, favor = game.simulation.crown.favor;
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  assert.deepEqual(game.economy.resources, { gold: before.gold - mission.objective.target + 18,
    food: before.food + 20, wood: before.wood + 15 });
  assert.equal(game.simulation.crown.favor, favor + 4);
  assert.deepEqual(engine.history.at(-1)!.result!.materials, { food: 20, wood: 15 });
  assert.equal(engine.pendingRewards.length, 0);
  for (let repeat = 0; repeat < 100; repeat++) {
    assert.equal(game.simulation.decideMission(mission.id, 'fulfill'), false);
    assert.equal(engine.claimRewards(mission.id), false);
  }
  for (const product of ['food', 'wood'] as const) {
    const events = game.economy.history.read(product).filter(event => event.operation === 'mission-reward');
    assert.equal(events.reduce((sum, event) => sum + event.units, 0), mission.reward[product]! * U);
    assert.ok(events.every(event => event.origin === 'mission:' + mission.id && event.destination.startsWith('warehouse:')));
  }
  const loaded = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
  assert.deepEqual(loaded.economy.resources, game.economy.resources);
  assert.equal(loaded.simulation.kingdomEvents.claimRewards(mission.id), false);
  assert.match(missionResult(engine.history.at(-1)!), /Recibido: 20 comida/);
  assert.match(missionReward(mission), /15 madera/);
});

test('full warehouses keep persistent claims; partial fractional reception respects reserved space', () => {
  const { game, engine, mission } = rewardScenario();
  const ledger = game.economy.storage.inventories;
  const stock = ledger.saveState();
  for (const entry of stock) if (ledger.snapshot(entry.id)?.kind === 'warehouse') entry.goods = { food: 300 * U, wood: 0 };
  ledger.restoreState(stock);
  const reserve = game.economy.distribution.bootstrapActive;
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  assert.deepEqual(engine.pendingRewards[0].remaining, { food: 20, wood: 15 });
  assert.match(missionResult(engine.history.at(-1)!), /Pendiente de almacenar: 20 comida/);
  assert.doesNotMatch(missionResult(engine.history.at(-1)!), /Recibido:/);
  assert.equal(engine.claimRewards(mission.id), false);
  const loaded = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
  assert.deepEqual(loaded.simulation.kingdomEvents.pendingRewards, engine.pendingRewards);
  const inventories = loaded.economy.storage.inventories;
  const warehouse = loaded.economy.storage.operationalWarehouseIds()[0];
  assert.equal(inventories.exchange(inventories.snapshot(warehouse)!.network!, 'fixture',
    [{ warehouse, product: 'food', units: 1, direction: 'export' }], () => true), true);
  assert.equal(loaded.simulation.kingdomEvents.claimRewards(mission.id), true);
  assert.equal(inventories.snapshot(warehouse)!.used, 300 * U);
  const state = loaded.saveState(null);
  const twice = Session.restore(JSON.parse(JSON.stringify(state))).session;
  assert.deepEqual(twice.simulation.kingdomEvents.pendingRewards, loaded.simulation.kingdomEvents.pendingRewards);
  assert.equal(twice.simulation.kingdomEvents.claimRewards(mission.id), false);
  assert.equal(twice.economy.distribution.bootstrapActive, reserve);
});

test.each(['reject', 'expire'] as const)('%s never grants success materials or gold', outcome => {
  const { game, engine, mission } = rewardScenario();
  const before = game.economy.resources;
  if (outcome === 'reject') assert.ok(game.simulation.decideMission(mission.id, 'reject'));
  else engine.advance(mission.deadline);
  assert.deepEqual(game.economy.resources, before);
  assert.equal(engine.pendingRewards.length, 0);
  assert.deepEqual(engine.history.at(-1)!.result!.materials, { food: 0, wood: 0 });
});

test('loading an older resolved mission grants no retroactive materials', () => {
  const { game, engine, mission } = rewardScenario();
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  const state = game.saveState(null), history = state.simulation.kingdomEvents.history[0];
  delete history.reward.food; delete history.reward.wood;
  delete history.result!.materials; delete history.result!.goldReceived;
  delete state.simulation.kingdomEvents.pendingRewards;
  const loaded = Session.restore(JSON.parse(JSON.stringify(state))).session;
  assert.equal(loaded.simulation.kingdomEvents.pendingRewards.length, 0);
  assert.equal(loaded.simulation.kingdomEvents.claimRewards(mission.id), false);
  assert.deepEqual(loaded.economy.resources, game.economy.resources);
  assert.equal(engine.history.length, 1);
});

test('all eleven missions and both variants offer moderate material rewards', () => {
  for (const event of kingdomEventCatalog) for (const variant of [0, 1]) {
    const terms = event.terms(context(), variant), prize = terms.reward;
    assert.ok(prize.gold + (prize.food ?? 0) + (prize.wood ?? 0) > 0, event.key);
    assert.ok(prize.gold <= 75 && (prize.food ?? 0) <= 30 && (prize.wood ?? 0) <= 30);
  }
});

test('saving before completion then after completion cannot repeat a combined reward', () => {
  const { game, mission } = rewardScenario();
  const before = game.saveState(null), restored = Session.restore(JSON.parse(JSON.stringify(before))).session;
  assert.ok(restored.simulation.decideMission(mission.id, 'fulfill'));
  const completed = restored.saveState(null);
  for (let reload = 0; reload < 3; reload++) {
    const loaded = Session.restore(JSON.parse(JSON.stringify(completed))).session;
    assert.equal(loaded.simulation.decideMission(mission.id, 'fulfill'), false);
    assert.equal(loaded.simulation.kingdomEvents.claimRewards(mission.id), false);
    assert.deepEqual(loaded.economy.resources, restored.economy.resources);
  }
});

test('reward reception honors incoming reservations, permissions, draining and shared capacity', () => {
  const { game, engine, mission } = rewardScenario();
  const ledger = game.economy.storage.inventories, ids = game.economy.storage.operationalWarehouseIds();
  for (const id of ids) {
    ledger.setProductEnabled(id, 'food', false); ledger.setProductEnabled(id, 'wood', false);
  }
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  const id = ids[0], stock = ledger.snapshot(id)!;
  ledger.setProductEnabled(id, 'food', true); ledger.setProductEnabled(id, 'wood', true);
  ledger.reserveIncoming(id, stock.capacity - stock.used - 1);
  ledger.setDraining(id, true);
  assert.equal(engine.claimRewards(mission.id), false);
  ledger.setDraining(id, false);
  assert.ok(engine.claimRewards(mission.id));
  assert.equal(ledger.snapshot(id)!.free, 0);
  assert.deepEqual(engine.pendingRewards[0].remaining, { food: (20 * U - 1) / U, wood: 15 });
  assert.equal(engine.claimRewards(mission.id), false);
  ledger.reserveIncoming(id, 0);
  assert.ok(engine.claimRewards(mission.id));
  assert.equal(engine.pendingRewards.length, 0);
  assert.deepEqual(engine.history.at(-1)!.result!.materials, { food: 20, wood: 15 });
});

test('pending supplies remain claimable after their mission leaves the bounded history', () => {
  const { game, engine, mission } = rewardScenario();
  const ledger = game.economy.storage.inventories;
  for (const id of game.economy.storage.operationalWarehouseIds()) ledger.setDraining(id, true);
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  const state = game.saveState(null);
  state.simulation.kingdomEvents.history = [];
  const loaded = Session.restore(JSON.parse(JSON.stringify(state))).session;
  for (const entry of loaded.economy.storage.inventories.saveState()) {
    if (loaded.economy.storage.inventories.snapshot(entry.id)?.kind === 'warehouse')
      loaded.economy.storage.inventories.setDraining(entry.id, false);
  }
  loaded.simulation.refreshWorkforce();
  assert.ok(loaded.simulation.kingdomEvents.claimRewards(mission.id));
  assert.equal(loaded.simulation.kingdomEvents.pendingRewards.length, 0);
  assert.equal(loaded.simulation.kingdomEvents.claimRewards(mission.id), false);
});

test('a save with duplicated or inflated pending rewards is rejected', () => {
  const { game, engine, mission } = rewardScenario();
  for (const id of game.economy.storage.operationalWarehouseIds()) game.economy.storage.inventories.setDraining(id, true);
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  const state = game.saveState(null);
  state.simulation.kingdomEvents.pendingRewards!.push(structuredClone(engine.pendingRewards[0]));
  assert.throws(() => Session.restore(state));
  state.simulation.kingdomEvents.pendingRewards!.pop();
  state.simulation.kingdomEvents.pendingRewards![0].remaining.food++;
  assert.throws(() => Session.restore(state));
});

function context(overrides: Partial<RealmContext> = {}): RealmContext {
  return { hasCenter: true, rank: 'villa', population: 30, capacity: 48, happiness: 80, beauty: 45,
    gold: 300, food: 400, wood: 150, foodCoverage: 100, waterCoverage: 100, favor: 80,
    confidenceWarning: false, tribute: null, nextTributeAt: 3 * day, recentTribute: true,
    buildings: { villageCenter: 1, house: 8, farm: 3, lumberjack: 2, market: 2, well: 2, warehouse: 2, tradeHouse: 1, garden: 2 },
    improvedRoads: 4, stoneRoads: 0, gravelRoads: 4, upgradableRoads: 10,
    decorationSpace: { garden: true, park: true, plaza: true }, exteriorTrade: true,
    exports: { food: 100 * U, wood: 100 * U },
    sites: { '1,1': { type: 'garden', level: 0, connected: true }, '1,2': { type: 'road', level: 2, connected: true } },
    ...overrides };
}

function fixture(seed: number, overrides: Partial<RealmContext> = {}) {
  const city = context(overrides);
  const effects: MissionEffect[] = [];
  let stopped = false;
  const engine = new KingdomEvents(seed, () => city, (_id, effect) => {
    if (effect.goldCost > city.gold || (effect.delivery && effect.delivery.amount > city[effect.delivery.product])) return false;
    city.gold += effect.goldReward - effect.goldCost;
    city.favor = Math.max(0, Math.min(100, city.favor + effect.favor));
    if (effect.delivery) city[effect.delivery.product] -= effect.delivery.amount;
    effects.push(effect);
    return true;
  }, () => stopped);
  return { engine, city, effects, halt: () => { stopped = true; } };
}

function offering(key: string, overrides: Partial<RealmContext> = {}) {
  for (let seed = 0; seed < 500; seed++) {
    const result = fixture(seed, overrides);
    result.engine.advance(day);
    if (result.engine.current?.key === key) return result;
  }
  assert.fail('No eligible seeded offer for ' + key);
}

test('the catalog has eleven functional events with original story variants', () => {
  assert.equal(kingdomEventCatalog.length, 11);
  assert.equal(new Set(kingdomEventCatalog.map(event => event.key)).size, 11);
  for (const definition of kingdomEventCatalog) {
    assert.equal(definition.stories.length, 2);
    assert.ok(definition.stories.every(story => story.length > 100));
    const { engine } = offering(definition.key);
    assert.ok(engine.current!.objective.target > 0);
    assert.ok(engine.current!.deadline > day);
    const restored = fixture(engine.saveState().seed).engine;
    restored.restoreState(engine.saveState(), day);
    assert.deepEqual(restored.saveState(), engine.saveState());
  }
});

test('first opportunity is at one day, missing settlements defer, and a pending event blocks new offers', () => {
  const { engine } = fixture(23);
  engine.advance(day - 1000);
  assert.equal(engine.current, null);
  engine.advance(day);
  assert.ok(engine.current);
  const id = engine.current.id;
  engine.advance(day + hour);
  assert.equal(engine.current?.id, id);
  assert.ok(engine.nextAt >= 2 * day && engine.nextAt <= 3 * day);
  assert.equal(engine.takeNotice()?.id, id);
  assert.equal(engine.takeNotice(), null);
  const absent = fixture(23, { hasCenter: false }).engine;
  absent.advance(day);
  assert.equal(absent.current, null);
  assert.equal(absent.nextAt, day + kingdomEventRules.retryMs);
});

function sequence(seed: number, reload = false) {
  let result = fixture(seed);
  const events: string[] = [];
  const repeats = new Map<string, number>();
  for (let h = 1; h <= 24 * 24; h++) {
    const time = h * hour;
    result.city.nextTributeAt = time + 3 * day;
    result.engine.advance(time);
    const mission = result.engine.current;
    if (mission) {
      const previous = repeats.get(mission.key);
      const definition = kingdomEventCatalog.find(event => event.key === mission.key)!;
      if (previous !== undefined) assert.ok(time - previous >= definition.cooldownHours * hour);
      assert.notEqual(events.at(-1)?.split('/')[0], mission.key);
      repeats.set(mission.key, time);
      events.push(mission.key + '/' + mission.variant + '/' + JSON.stringify(mission.objective));
      assert.ok(result.engine.decide(mission.id, 'reject', time));
    }
    if (reload && h % 11 === 0) {
      const saved = result.engine.saveState(), city = structuredClone(result.city);
      result = fixture(seed, city);
      result.engine.restoreState(saved, time);
    }
  }
  return events;
}

test('same seed, city and decisions reproduce a long sequence across reloads, with cooldowns and distinct other seeds', () => {
  const first = sequence(23);
  assert.ok(first.length >= 10);
  assert.deepEqual(first, sequence(23, true));
  assert.notDeepEqual(first, sequence(24));
  assert.notDeepEqual(first, sequence(1023));
});

test('Aldea never receives locked roads or decorations, and unavailable production and trade are excluded', () => {
  const alder = context({ rank: 'aldea', exteriorTrade: false, buildings: { villageCenter: 1, house: 5 },
    food: 0, wood: 0, recentTribute: false, beauty: 15, foodCoverage: 0, waterCoverage: 0 });
  for (let seed = 0; seed < 100; seed++) {
    const { engine } = fixture(seed, alder);
    engine.advance(day);
    const mission = engine.current!;
    assert.ok(mission);
    assert.ok(!['admired-roads', 'royal-merchants', 'northern-famine', 'winter-wood', 'royal-loyalty'].includes(mission.key));
    if (mission.objective.kind === 'building') assert.equal(mission.objective.building, 'garden');
    if (mission.objective.kind === 'gold') assert.ok(mission.objective.target <= 30);
  }
});

test.each([false, true])('royal pressure defers demanding requests and does not invent obligations (confidence warning %s)', warning => {
  for (let seed = 0; seed < 80; seed++) {
    const { engine } = fixture(seed, { confidenceWarning: warning,
      tribute: { gold: 150, paid: false, dueAt: day + 12 * hour } });
    engine.advance(day);
    const definition = kingdomEventCatalog.find(event => event.key === engine.current?.key);
    assert.ok(!definition || !definition.demanding);
  }
});

test('accepting gold, rejection, expiry and defer have distinct once-only consequences', () => {
  const result = offering('royal-war');
  const { engine, city, effects } = result;
  const mission = engine.current!, cost = mission.objective.target, initial = city.gold;
  assert.ok(engine.decide(mission.id, 'defer', day));
  assert.ok(engine.decide(mission.id, 'defer', day));
  assert.equal(mission.decisions.length, 1);
  assert.equal(effects.length, 0);
  assert.ok(engine.decide(mission.id, 'accept', day));
  assert.equal(city.gold, initial);
  assert.ok(engine.decide(mission.id, 'fulfill', day));
  assert.equal(city.gold, initial - cost);
  assert.equal(city.favor, 85);
  assert.equal(engine.decide(mission.id, 'fulfill', day), false);
  assert.equal(effects.length, 1);
  assert.equal(engine.history[0]?.rewarded, true);

  const rejected = offering('royal-war');
  assert.ok(rejected.engine.decide(rejected.engine.current!.id, 'reject', day));
  assert.equal(rejected.city.favor, 78);
  assert.equal(rejected.city.gold, initial);
  const expired = offering('royal-war'), offer = expired.engine.current!;
  expired.engine.decide(offer.id, 'accept', day);
  expired.engine.advance(offer.deadline);
  assert.equal(expired.city.favor, 77);
  assert.equal(expired.engine.history[0]?.status, 'expired');
  assert.equal(expired.engine.decide(offer.id, 'fulfill', offer.deadline), false);
  const ignored = offering('royal-war'), ignoredId = ignored.engine.current!.id;
  assert.equal(ignored.engine.decide(ignoredId, 'accept', ignored.engine.current!.deadline), false);
  assert.equal(ignored.city.favor, 80);
});

test('wellbeing must hold continuously, resets on a bad second, and does not accumulate duplicate ticks', () => {
  const { engine, city, effects } = offering('royal-visit');
  const mission = engine.current!, start = day;
  engine.decide(mission.id, 'accept', start);
  engine.advance(start + 1000);
  assert.equal(mission.progress, 1000);
  engine.advance(start + 1000);
  assert.equal(mission.progress, 1000);
  city.beauty = 0;
  engine.advance(start + 2000);
  assert.equal(mission.progress, 0);
  city.beauty = 45;
  for (let t = start + 3000; t < start + 2000 + mission.objective.target; t += 1000) engine.advance(t);
  assert.equal(engine.current?.id, mission.id);
  engine.advance(start + 2000 + mission.objective.target);
  assert.equal(engine.history.at(-1)?.status, 'completed');
  assert.equal(effects.length, 1);
});

test('growth counts only new residents after acceptance and requires their sustained wellbeing', () => {
  const { engine, city } = offering('new-families');
  const mission = engine.current!, objective = mission.objective;
  assert.equal(objective.kind, 'growth');
  city.population += 5; // Growth while the offer was still unanswered is not progress.
  engine.decide(mission.id, 'accept', day);
  engine.advance(day + 1000);
  assert.equal(mission.progress, 0);
  city.population += objective.target;
  engine.advance(day + 2000);
  assert.equal(engine.current?.id, mission.id);
  city.happiness = 40;
  engine.advance(day + 3000);
  assert.equal(mission.sustainedMs, 0);
  city.happiness = 80;
  for (let t = day + 4000; t <= day + 3000 + objective.holdMs; t += 1000) engine.advance(t);
  assert.equal(engine.history.at(-1)?.status, 'completed');
});

test.each(['royal-whim', 'admired-roads', 'royal-merchants'])('%s counts only development after acceptance', key => {
  const { engine, city, effects } = offering(key);
  const mission = engine.current!, objective = mission.objective;
  engine.decide(mission.id, 'accept', day);
  engine.advance(day + 1000);
  assert.equal(mission.progress, 0);
  if (objective.kind === 'building') {
    city.buildings[objective.building] = (city.buildings[objective.building] ?? 0) + objective.target;
    city.sites['4,4'] = { type: objective.building, level: 0, connected: true };
  }
  if (objective.kind === 'roads') {
    city.improvedRoads += objective.target;
    city.stoneRoads += objective.target;
    for (let x = 4; x < 4 + objective.target; x++) city.sites[x + ',5'] = { type: 'road', level: objective.level, connected: true };
  }
  if (objective.kind === 'trade') city.exports[objective.product] += objective.target * U;
  engine.advance(day + 2000);
  assert.equal(engine.history.at(-1)?.status, 'completed');
  assert.equal(effects.length, 1);
});

test('stopped games cannot accept, expire or reward missions', () => {
  const { engine, halt, effects } = offering('royal-war');
  const mission = engine.current!;
  halt();
  const saved = engine.saveState();
  assert.equal(engine.decide(mission.id, 'fulfill', day), false);
  assert.equal(engine.takeNotice(), null);
  engine.advance(mission.deadline);
  assert.deepEqual(engine.saveState(), saved);
  assert.equal(effects.length, 0);
});

test.each(['royal-whim', 'admired-roads'])('%s cannot count merely reconnecting old constructions', key => {
  const { engine, city } = offering(key);
  const mission = engine.current!, objective = mission.objective;
  if (objective.kind === 'building') city.sites['8,8'] = { type: objective.building, level: 0, connected: false };
  if (objective.kind === 'roads') {
    for (let x = 8; x < 8 + objective.target; x++) city.sites[x + ',8'] = { type: 'road', level: objective.level, connected: false };
  }
  engine.decide(mission.id, 'accept', day);
  for (const site of Object.values(city.sites)) site.connected = true;
  engine.advance(day + 1000);
  assert.equal(mission.progress, 0);
  assert.equal(engine.current?.id, mission.id);
});

function town(seed: number) {
  const world = newWorld(seed, proceduralTerrain);
  const base = new Session(world, new TerrainMap(world.columns, world.rows, new Uint8Array(world.columns * world.rows)));
  const { map, simulation } = base;
  map.place(c(22, 8), 'villageCenter');
  const route = Array.from({ length: 22 }, (_, x) => c(x, 8));
  for (const cell of route) map.place(cell, 'road');
  assert.ok(map.protectKingdomRoad(route));
  for (let x = 2; x <= 9; x++) map.place(c(x, 7), 'house');
  for (const x of [11, 12, 13, 14]) map.place(c(x, 7), 'farm');
  for (const x of [17, 18, 19]) { map.place(c(x, 7), 'lumberjack'); map.terrain.plantTree(c(x, 6)); }
  for (const x of [3, 7, 12]) map.place(c(x, 9), 'warehouse');
  for (const x of [1, 6, 10]) map.place(c(x, 9), 'market');
  for (const x of [4, 9]) map.place(c(x, 9), 'well');
  simulation.recalculate();
  setFixtureRank(simulation, 'pueblo');
  const saved = base.saveState(null);
  for (const home of saved.population.residences) home.residents = 4;
  saved.crown.favor = 80;
  const game = Session.restore(saved).session;
  assert.equal(game.simulation.build(c(15, 9), 'tradeHouse'), null);
  return game;
}

function warehouseStock(game: Session, food: number, wood: number) {
  // Finish existing fixture commitments before replacing stock for a mission scenario.
  for (let step = 0; step < 100 && game.economy.storage.logistics.operations.length > 0; step++) {
    game.economy.storage.logistics.advance(1000, game.simulation.simulatedTimeMs);
  }
  const ledger = game.economy.storage.inventories, state = ledger.saveState();
  const entry = state.find(entry => ledger.snapshot(entry.id)?.kind === 'warehouse')!;
  entry.goods = { food: food * U + ledger.outgoing(entry.id, 'food'), wood: wood * U + ledger.outgoing(entry.id, 'wood') };
  ledger.restoreState(state);
  return entry.id;
}

function installOffer(game: Session, key: string) {
  const generated = offering(key, game.simulation.realmContext()).engine.saveState();
  generated.seed = game.world.seed;
  generated.current!.id = game.world.seed + ':' + generated.current!.sequence;
  generated.lastAt = game.simulation.simulatedTimeMs;
  generated.current!.offeredAt = generated.lastAt;
  generated.current!.deadline = generated.lastAt + 48 * hour;
  generated.lastSeen[key] = generated.lastAt;
  game.simulation.kingdomEvents.restoreState(generated, generated.lastAt);
  return game.simulation.kingdomEvents.current!;
}

test('real warehouse deliveries are atomic, skip markets and reserves, and reward only once across reloads', () => {
  const game = town(23);
  game.simulation.advance(day);
  const warehouse = warehouseStock(game, 0, 150);
  const mission = installOffer(game, 'winter-wood');
  assert.equal(mission.objective.kind, 'delivery');
  const before = game.economy.missionStock.wood;
  const reserve = game.economy.storage.constructionWoodReserve;
  const gold = game.economy.credit.balance;
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  assert.equal(Math.round(game.economy.missionStock.wood * U), Math.round(before * U) - mission.objective.target * U);
  assert.equal(game.economy.credit.balance, gold + mission.reward.gold);
  assert.equal(game.economy.storage.constructionWoodReserve, reserve);
  assert.ok(game.economy.storage.inventories.snapshot(warehouse)!.goods.wood >= 0);
  assert.equal(game.economy.history.read('gold').filter(event => event.operation === 'mission-reward').length, 1);
  const restored = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
  const balance = JSON.stringify(restored.economy.saveState());
  assert.equal(restored.simulation.decideMission(mission.id, 'fulfill'), false);
  assert.equal(JSON.stringify(restored.economy.saveState()), balance);
  assert.equal(restored.simulation.kingdomEvents.history.at(-1)?.rewarded, true);
});

test('food aid excludes immediate market supplies and disabled warehouse dispatch, without partial payment', () => {
  const game = town(24);
  game.simulation.advance(day);
  warehouseStock(game, 300, 0);
  const mission = installOffer(game, 'northern-famine');
  assert.equal(mission.objective.kind, 'delivery');
  for (const { cell, type } of game.map.occupiedCells()) {
    if (type === 'warehouse') game.economy.setWarehouseMarketDispatch(cell, 'food', false);
  }
  const before = JSON.stringify(game.economy.saveState()), favor = game.simulation.crown.favor;
  assert.equal(game.simulation.decideMission(mission.id, 'fulfill'), false);
  assert.equal(JSON.stringify(game.economy.saveState()), before);
  assert.equal(game.simulation.crown.favor, favor);
});

test('food aid removes exactly the promised food from warehouses and leaves market and initial stock intact', () => {
  const game = town(31);
  game.simulation.advance(day);
  warehouseStock(game, 300, 0);
  const mission = installOffer(game, 'northern-famine');
  const ledger = game.economy.storage.inventories;
  const special = ledger.saveState().filter(entry => ledger.snapshot(entry.id)?.kind !== 'warehouse');
  const food = game.economy.missionStock.food, gold = game.economy.credit.balance;
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  assert.equal(game.economy.missionStock.food, food - mission.objective.target);
  assert.equal(game.economy.credit.balance, gold + mission.reward.gold);
  assert.deepEqual(ledger.saveState().filter(entry => ledger.snapshot(entry.id)?.kind !== 'warehouse'), special);
});

test('recognition records the actual capped favor and cannot claim its gold twice', () => {
  const { engine, city } = offering('royal-loyalty', { favor: 99 });
  const mission = engine.current!, gold = city.gold;
  assert.ok(engine.decide(mission.id, 'fulfill', day));
  assert.equal(city.gold, gold + mission.reward.gold);
  assert.equal(city.favor, 100);
  assert.equal(engine.history[0]?.result?.favor, 1);
  assert.equal(engine.decide(mission.id, 'fulfill', day), false);
});

test('reload preserves an accepted deadline and its expiry result', () => {
  const source = offering('royal-war');
  const mission = source.engine.current!;
  source.engine.decide(mission.id, 'accept', day);
  source.engine.advance(day + hour);
  const loaded = fixture(source.engine.saveState().seed, structuredClone(source.city));
  loaded.engine.restoreState(source.engine.saveState(), day + hour);
  loaded.engine.advance(mission.deadline - 1000);
  assert.equal(loaded.engine.current?.deadline, mission.deadline);
  loaded.engine.advance(mission.deadline);
  assert.equal(loaded.engine.history.at(-1)?.status, 'expired');
  assert.equal(loaded.engine.history.at(-1)?.result?.favor, -3);
  const again = fixture(loaded.engine.saveState().seed, structuredClone(loaded.city));
  again.engine.restoreState(loaded.engine.saveState(), mission.deadline);
  assert.equal(again.engine.decide(mission.id, 'fulfill', mission.deadline), false);
  assert.equal(again.city.favor, 77);
});

test('an optional contribution cannot use the Crown credit or award favor after a failed payment', () => {
  const game = town(25);
  game.simulation.advance(day);
  const mission = installOffer(game, 'royal-war');
  assert.ok(game.economy.payBuildingCost({ gold: game.economy.credit.balance + 10, wood: 0 }, 'construction', 'fixture'));
  const favor = game.simulation.crown.favor, before = game.economy.credit.balance;
  assert.equal(before, -10);
  assert.equal(game.simulation.decideMission(mission.id, 'fulfill'), false);
  assert.equal(game.economy.credit.balance, before);
  assert.equal(game.simulation.crown.favor, favor);
});

test.each([1, 2, 3] as const)('×%i, pause and narrative suspension preserve offers and clock through a slot save', speed => {
  const game = town(26);
  game.simulation.setSpeed(speed);
  game.simulation.advance((day - 1000) / speed);
  assert.equal(game.simulation.kingdomEvents.current, null);
  game.simulation.setPaused(true);
  game.simulation.advance(day);
  assert.equal(game.simulation.kingdomEvents.current, null);
  game.simulation.setPaused(false);
  game.simulation.setReadingChapter(true);
  game.simulation.advance(day);
  assert.equal(game.simulation.kingdomEvents.current, null);
  game.simulation.setReadingChapter(false);
  game.simulation.advance(1000 / speed + 0.01);
  const mission = game.simulation.kingdomEvents.current!;
  assert.ok(mission);
  game.simulation.kingdomEvents.takeNotice();
  game.simulation.setPaused(true);
  const items = new Map<string, string>();
  const slots = new SaveSlots(() => ({ getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); } }));
  slots.save(1, null, game, null);
  const loaded = slots.load(1).session;
  assert.equal(loaded.simulation.paused, true);
  assert.equal(loaded.simulation.speed, speed);
  assert.deepEqual(loaded.simulation.kingdomEvents.saveState(), game.simulation.kingdomEvents.saveState());
  assert.equal(loaded.simulation.kingdomEvents.takeNotice(), null);
  loaded.simulation.advance(day);
  assert.equal(loaded.simulation.simulatedTimeMs, day);
});

test('an event can trigger the existing zero-favor grace period, and recovery uses the same Crown', () => {
  const game = town(27);
  game.simulation.advance(day);
  const mission = installOffer(game, 'royal-war');
  game.simulation.crown.restoreState({ ...game.simulation.crown.saveState(), favor: 2 }, day);
  assert.ok(game.simulation.decideMission(mission.id, 'reject'));
  assert.equal(game.simulation.crown.favor, 0);
  assert.equal(game.simulation.crown.confidence?.dueAt, 2 * day);
  const saved = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
  assert.ok(saved.simulation.makeOffering(50, 0));
  assert.equal(saved.simulation.crown.confidence, null);
  assert.equal(saved.simulation.crown.favor, 5);
});

test('version 6 cities gain a first future event without losing their Crown or inventories', () => {
  const game = town(28);
  game.simulation.advance(3 * hour);
  const state = JSON.parse(JSON.stringify(game.saveState(null)));
  delete state.simulation.kingdomEvents;
  delete state.simulation.trade.exported;
  const raw = JSON.stringify({ version: 6, savedAt: 1, state });
  const slots = new SaveSlots(() => ({ getItem: key => key === saveKey(1) ? raw : null, setItem: () => {} }));
  const loaded = slots.load(1).session;
  assert.equal(loaded.simulation.kingdomEvents.nextAt, 27 * hour);
  assert.equal(loaded.simulation.kingdomEvents.current, null);
  assert.deepEqual(loaded.economy.resources, game.economy.resources);
  assert.deepEqual(loaded.simulation.crown.saveState(), game.simulation.crown.saveState());
});

test('a merchant mission counts new physical export cargo and adds its premium once', () => {
  const game = town(29), site = c(15, 9);
  game.simulation.trade.configure(site, 'wood', { mode: 'export', reserve: 30, target: 30 });
  game.simulation.advance(day);
  assert.ok(game.simulation.trade.exportedUnits.wood > 0);
  const mission = installOffer(game, 'royal-merchants');
  assert.equal(mission.objective.kind, 'trade');
  if (mission.objective.kind !== 'trade') return;
  game.simulation.trade.configure(site, mission.objective.product, { mode: 'export', reserve: 0, target: 30 });
  const before = game.simulation.trade.exportedUnits[mission.objective.product];
  assert.ok(game.simulation.decideMission(mission.id, 'accept'));
  assert.equal(game.simulation.decideMission(mission.id, 'fulfill'), false);
  game.simulation.advance(1000);
  assert.equal(game.simulation.kingdomEvents.current?.progress, 0);
  for (let h = 0; h < 24 && game.simulation.kingdomEvents.current?.id === mission.id; h++) game.simulation.advance(hour);
  const completed = game.simulation.kingdomEvents.history.find(event => event.id === mission.id)!;
  assert.equal(completed.status, 'completed');
  assert.ok(game.simulation.trade.exportedUnits[mission.objective.product] - before >= mission.objective.target * U);
  assert.equal(completed.result?.gold, mission.reward.gold);
  const loaded = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
  const gold = loaded.economy.credit.balance;
  assert.equal(loaded.simulation.decideMission(mission.id, 'fulfill'), false);
  assert.equal(loaded.economy.credit.balance, gold);
});

test('road and decoration missions follow the normal building commands and charge their actual costs', () => {
  const game = town(30);
  for (let x = 23; x < 30; x++) game.map.place(c(x, 8), 'road');
  game.simulation.recalculate();
  game.simulation.advance(day);
  warehouseStock(game, 0, 100);
  const roads = installOffer(game, 'admired-roads');
  assert.ok(game.simulation.decideMission(roads.id, 'accept'));
  const before = game.economy.credit.balance;
  for (let x = 23; x < 23 + roads.objective.target; x++) assert.equal(game.simulation.upgradeRoad(c(x, 8), 1), null);
  assert.equal(game.economy.credit.balance, before - roads.objective.target * 6);
  game.simulation.advance(1000);
  assert.equal(game.simulation.kingdomEvents.history.find(event => event.id === roads.id)?.status, 'completed');
  const decoration = installOffer(game, 'royal-whim');
  assert.equal(decoration.objective.kind, 'building');
  assert.ok(game.simulation.decideMission(decoration.id, 'accept'));
  if (decoration.objective.kind !== 'building') return;
  assert.equal(game.simulation.build(c(24, 9), decoration.objective.building), null);
  game.simulation.advance(1000);
  assert.equal(game.simulation.kingdomEvents.history.at(-1)?.status, 'completed');
});

function playTenDays(seed: number, respond: boolean) {
  const game = town(seed);
  for (let x = 23; x < 31; x++) game.map.place(c(x, 8), 'road');
  game.simulation.recalculate();
  game.simulation.trade.configure(c(15, 9), 'wood', { mode: 'export', reserve: 30, target: 30 });
  let first800 = 0;
  for (let h = 1; h <= 10 * 24; h++) {
    game.simulation.advance(hour);
    const bill = game.simulation.crown.obligation;
    if (bill && !bill.paid && game.economy.canPayRoyalCost(bill.gold)) assert.ok(game.simulation.payTribute(bill.dueAt));
    const mission = game.simulation.kingdomEvents.current;
    if (respond && mission) {
      const objective = mission.objective;
      if (game.simulation.kingdomEvents.canFulfill(mission.id)) {
        const safeFood = objective.kind !== 'delivery' || objective.product !== 'food'
          || game.economy.missionStock.food - objective.target >= game.population.total * 5;
        if (safeFood) game.simulation.decideMission(mission.id, 'fulfill');
      } else if (mission.status === 'available') game.simulation.decideMission(mission.id, 'accept');
      if (mission.status === 'active' && objective.kind === 'building') {
        for (let x = 23; x < 31; x++) {
          if (game.simulation.build(c(x, 9), objective.building) === null) break;
        }
      }
      if (mission.status === 'active' && objective.kind === 'roads') {
        for (let x = 23; x < 31; x++) {
          if (game.map.roadLevelAt(c(x, 8)) === objective.level - 1
            && game.simulation.upgradeRoad(c(x, 8), objective.level - 1 as 1 | 2) === null) break;
        }
      }
      if (mission.status === 'active' && objective.kind === 'trade') {
        game.simulation.trade.configure(c(15, 9), objective.product,
          { mode: 'export', reserve: objective.product === 'food' ? 150 : 30, target: 30 });
      }
    }
    if (!first800 && game.economy.credit.balance >= 800) first800 = h;
    assert.equal(game.simulation.crown.defeated, false);
    assert.ok(game.economy.credit.balance >= -200);
  }
  const history = game.simulation.kingdomEvents.history;
  return { seed, respond, sequence: history.map(mission => mission.key + '/' + mission.variant), first800,
    gold: game.economy.credit.balance, population: game.population.total, favor: game.simulation.crown.favor,
    completed: history.filter(mission => mission.status === 'completed').length,
    rewards: history.reduce((total, mission) => total + (mission.rewarded ? mission.reward.gold : 0), 0),
    contributions: history.reduce((total, mission) => total + Math.max(0, -(mission.result?.gold ?? 0)), 0),
    exports: game.simulation.trade.totals.exports };
}

test('ten-day settlements get distinct achievable missions, modest rewards and continued growth', () => {
  const runs = [playTenDays(23, true), playTenDays(24, true), playTenDays(1023, true), playTenDays(23, false)];
  assert.equal(new Set(runs.slice(0, 3).map(run => JSON.stringify(run.sequence))).size, 3);
  for (const run of runs) {
    assert.ok(run.sequence.length >= 3);
    assert.ok(run.population >= 30);
    assert.ok(run.rewards <= 250);
    assert.ok(run.first800 > 24 && run.first800 <= 240);
  }
  assert.ok(runs.slice(0, 3).every(run => run.completed >= 2));
  assert.equal(runs[3]!.completed, 0);
}, 30_000);
