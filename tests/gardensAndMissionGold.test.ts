import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { Session } from '../src/persistence/Session';
import { ConstructionMap, constructionDimensions } from '../src/map/ConstructionMap';
import { TerrainMap, terrainCode } from '../src/map/Terrain';
import { RoadConnections } from '../src/map/RoadConnections';
import { Economy } from '../src/economy/Economy';
import { unitsPerResource as U } from '../src/economy/Inventories';
import { Population } from '../src/population/Population';
import { KingdomEvents } from '../src/simulation/KingdomEvents';
import { SettlementSimulation } from '../src/simulation/SettlementSimulation';
import { simulatedMsPerGameHour as hour } from '../src/simulation/GameTime';
import { missionObjective, missionResult } from '../src/story/KingdomMissionText';
import { constructionCosts } from '../src/map/ConstructionCosts';
import { setFixtureRank } from './fixtures/settlementRank';

const c = (column: number, row: number) => ({ column, row });
const home = c(10, 10), garden = c(10, 11);
const json = (game: Session) => JSON.parse(JSON.stringify(game.saveState(null)));
function village() {
  const base = new Session(); base.map.place(c(0, 9), 'villageCenter');
  for (let column = 1; column <= 20; column++) base.map.place(c(column, 9), 'road');
  base.map.place(home, 'house'); base.simulation.recalculate();
  const saved = base.saveState(null); saved.population.residences[0].residents = 4;
  return Session.restore(saved).session;
}
function installOffer(game: Session, key: string) {
  const context = game.simulation.realmContext(), time = game.simulation.simulatedTimeMs;
  for (let seed = 0; seed < 500; seed++) {
    const engine = new KingdomEvents(seed, () => context, () => false, () => false);
    engine.advance(24 * hour);
    if (engine.current?.key !== key) continue;
    const state = engine.saveState(); state.seed = game.world.seed;
    state.current!.id = state.seed + ':' + state.current!.sequence;
    state.current!.offeredAt = time; state.current!.deadline = time + 48 * hour;
    state.lastAt = time; state.lastSeen[key] = time;
    game.simulation.kingdomEvents.restoreState(state, time);
    return game.simulation.kingdomEvents.current!;
  }
  assert.fail('No seeded offer for ' + key);
}
function gardenMission() {
  const game = village(), mission = installOffer(game, 'royal-whim');
  assert.deepEqual(mission.objective, { kind: 'building', building: 'garden', target: 1 });
  assert.ok(game.simulation.decideMission(mission.id, 'accept'));
  return { game, mission };
}
const amount = (event: { units: number; unitScale?: number }) => event.units / (event.unitScale ?? U);

test('PERMANENT: a paid isolated garden adds beauty to connected homes without becoming connected itself', () => {
  const game = village(), before = game.economy.resources.gold;
  assert.equal(game.simulation.build(garden, 'garden'), null);
  assert.equal(game.economy.resources.gold, before - constructionCosts.garden.gold);
  assert.equal(game.connections.isConnected(garden), false);
  assert.deepEqual(game.simulation.beauty.at(home), { score: 40, sources: { garden: 25 } });
  const context = game.simulation.realmContext();
  assert.equal(context.buildings.garden, 1);
  assert.deepEqual(context.sites['10,11'], { type: 'garden', connected: false, level: 0 });
  assert.equal(game.simulation.water.suppliedAt(home), 0);
  assert.equal(game.population.jobCapacity, 0);
  assert.equal(game.economy.storage.logistics.operations.length, 0);
});

test('removing garden access keeps its bonus, while disconnecting the recipient home removes it', () => {
  const game = village();
  game.map.place(garden, 'garden'); game.map.place(c(11, 11), 'road'); game.map.place(c(11, 10), 'road');
  game.simulation.recalculate(); assert.equal(game.connections.isConnected(garden), true);
  const before = game.simulation.beauty.at(home);
  game.map.remove(c(11, 11)); game.map.remove(c(11, 10)); game.simulation.recalculate();
  assert.equal(game.connections.isConnected(garden), false);
  assert.deepEqual(game.simulation.beauty.at(home), before);
  game.map.remove(c(10, 9)); game.simulation.recalculate();
  assert.equal(game.connections.isConnected(home), false);
  assert.deepEqual(game.simulation.beauty.at(home), { score: 15, sources: {} });
});

test('a disconnected garden preserves beauty, resources and mission eligibility across JSON reloads', () => {
  const game = village(); assert.equal(game.simulation.build(garden, 'garden'), null);
  const restored = Session.restore(json(game)).session;
  assert.equal(restored.connections.isConnected(garden), false);
  assert.deepEqual(restored.simulation.beauty.at(home), game.simulation.beauty.at(home));
  assert.deepEqual(restored.economy.resources, game.economy.resources);
  assert.equal(restored.simulation.realmContext().buildings.garden, 1);
});

test('a newly built isolated garden completes the actual garden mission and pays its promised gold exactly once', () => {
  const { game, mission } = gardenMission();
  assert.match(missionObjective(mission.objective), /no necesita caminos/);
  assert.equal(game.simulation.build(c(50, 50), 'garden'), null);
  assert.equal(game.connections.isConnected(c(50, 50)), false);
  const before = game.economy.credit.balance;
  const saved = json(game), loaded = Session.restore(saved).session;
  loaded.simulation.advance(1000);
  const completed = loaded.simulation.kingdomEvents.history.at(-1)!;
  assert.equal(completed.id, mission.id); assert.equal(completed.status, 'completed');
  assert.equal(loaded.economy.credit.balance, before + mission.reward.gold);
  const rewards = loaded.economy.history.read('gold').filter(event => event.operation === 'mission-reward');
  assert.equal(rewards.length, 1); const reward = rewards[0], scale = reward.unitScale ?? U;
  assert.equal(mission.reward.gold, 15); assert.equal(amount(reward), 15);
  assert.equal(reward.origin, 'mission:' + mission.id); assert.equal(reward.destination, 'treasury');
  assert.deepEqual(reward.destinationBalance, { before: before * scale, after: (before + 15) * scale });
  assert.equal(completed.result!.goldReceived, 15); assert.equal(completed.result!.gold, 15);
  assert.match(missionResult(completed), /Recompensa recibida: 15 oro/);
  const after = json(loaded), reloaded = Session.restore(after).session;
  for (let i = 0; i < 10; i++) assert.equal(reloaded.simulation.decideMission(mission.id, 'fulfill'), false);
  assert.deepEqual(json(reloaded), after);
});

test('an isolated garden present at acceptance is a baseline, not a newly completed objective', () => {
  const game = village(); game.map.place(garden, 'garden'); game.simulation.recalculate();
  const mission = installOffer(game, 'royal-whim');
  assert.ok(game.simulation.decideMission(mission.id, 'accept'));
  game.simulation.advance(1000); assert.equal(game.simulation.kingdomEvents.current!.progress, 0);
  assert.equal(game.simulation.build(c(50, 50), 'garden'), null); game.simulation.advance(1000);
  assert.equal(game.simulation.kingdomEvents.history.at(-1)!.status, 'completed');
});

test('garden space is found away from roads; unchanged full maps are not rescanned and terrain edits invalidate the cache', () => {
  const terrain = new TerrainMap(4, 4, new Uint8Array(16).fill(terrainCode('grass', 'rock')));
  const map = new ConstructionMap(4, 4, terrain), roads = new RoadConnections();
  const sim = new SettlementSimulation(new Economy(), new Population(), 5, map, roads);
  sim.recalculate(); const spy = vi.spyOn(map, 'canPlace');
  assert.equal(sim.realmContext().decorationSpace.garden, false);
  assert.equal(spy.mock.calls.length, 16);
  for (let i = 0; i < 30; i++) assert.equal(sim.realmContext().decorationSpace.garden, false);
  assert.equal(spy.mock.calls.length, 16);
  assert.ok(terrain.clear(c(3, 3), 'rock')); assert.equal(sim.realmContext().decorationSpace.garden, true);
  assert.equal(roads.isConnected(c(3, 3)), false);
  const count = spy.mock.calls.length;
  for (let i = 0; i < 30; i++) assert.equal(sim.realmContext().decorationSpace.garden, true);
  assert.equal(spy.mock.calls.length, count);
  assert.ok(terrain.plantTree(c(3, 3))); assert.equal(sim.realmContext().decorationSpace.garden, false);
  assert.ok(terrain.clear(c(3, 3), 'tree')); assert.ok(map.place(c(3, 3), 'garden'));
  assert.equal(sim.realmContext().decorationSpace.garden, false);
  assert.ok(map.remove(c(3, 3))); assert.equal(sim.realmContext().decorationSpace.garden, true);
  spy.mockRestore();
});

test('a garden plot does not require a road network or unprotect invalid terrain', () => {
  const game = new Session(); game.map.place(c(20, 20), 'villageCenter'); game.simulation.recalculate();
  assert.equal(game.simulation.realmContext().decorationSpace.garden, true);
  assert.equal(game.simulation.build(c(30, 30), 'garden'), null);
  assert.equal(game.connections.isConnected(c(30, 30)), false);
  assert.notEqual(game.simulation.build(c(30, 30), 'garden'), null);
});

test.each(['park', 'plaza'] as const)('%s still needs roads for beauty and valid mission construction', type => {
  const game = village(); setFixtureRank(game.simulation, 'villa');
  installOffer(game, 'royal-whim');
  const state = game.simulation.kingdomEvents.saveState();
  state.current!.objective = { kind: 'building', building: type, target: 1 };
  game.simulation.kingdomEvents.restoreState(state, 0);
  assert.ok(game.simulation.decideMission(state.current!.id, 'accept'));
  assert.ok(game.map.place(c(10, 11), type, constructionDimensions[type])); game.simulation.recalculate();
  assert.equal(game.connections.isConnected(c(10, 11)), false);
  assert.equal(game.simulation.beauty.at(home).score, 15);
  assert.equal(game.simulation.realmContext().buildings[type], undefined);
  assert.equal(game.simulation.realmContext().sites['10,11'].connected, false);
  assert.match(missionObjective({ kind: 'building', building: type, target: 1 }), /conectado al Centro/);
  game.simulation.advance(1000); assert.equal(game.simulation.kingdomEvents.current!.progress, 0);
  game.map.place(c(9, 10), 'road'); game.map.place(c(9, 11), 'road'); game.simulation.recalculate();
  assert.equal(game.connections.isConnected(c(10, 11)), true);
  game.simulation.advance(1000); assert.equal(game.simulation.kingdomEvents.history.at(-1)!.status, 'completed');
});

test('a real gold contribution with zero gold reward completes without inventing a reward movement', () => {
  const game = village(), mission = installOffer(game, 'royal-war');
  assert.equal(mission.objective.kind, 'gold'); assert.equal(mission.reward.gold, 0);
  const before = game.economy.credit.balance;
  assert.ok(game.simulation.decideMission(mission.id, 'fulfill'));
  assert.equal(game.economy.credit.balance, before - mission.objective.target);
  assert.equal(game.economy.history.read('gold').filter(event => event.operation === 'mission-reward').length, 0);
  const contribution = game.economy.history.read('gold').find(event => event.operation === 'mission-contribution')!;
  assert.equal(amount(contribution), mission.objective.target);
  const result = game.simulation.kingdomEvents.history.at(-1)!;
  assert.equal(result.status, 'completed'); assert.equal(result.result!.gold, -mission.objective.target);
  assert.equal(result.result!.goldReceived, 0);
  const restored = Session.restore(json(game)).session;
  const saved = json(restored); assert.equal(restored.simulation.decideMission(mission.id, 'fulfill'), false);
  assert.deepEqual(json(restored), saved);
});

test('the 200-movement economic history can evict a correct reward without changing its completed mission result', () => {
  const { game, mission } = gardenMission();
  assert.equal(game.simulation.build(c(50, 50), 'garden'), null); game.simulation.advance(1000);
  const reward = game.economy.history.read('gold').find(event => event.operation === 'mission-reward')!;
  assert.ok(reward); const before = game.economy.credit.balance;
  for (let i = 0; i < 200; i++) assert.ok(game.economy.payBuildingCost({ gold: 1, wood: 0 }, 'construction', 'audit-fixture:' + i));
  assert.equal(game.economy.credit.balance, before - 200);
  assert.equal(game.economy.history.read().length, 200);
  assert.equal(game.economy.history.read('gold').some(event => event.id === reward.id), false);
  assert.equal(game.simulation.kingdomEvents.history.at(-1)!.result!.goldReceived, mission.reward.gold);
  const loaded = Session.restore(json(game)).session;
  assert.equal(loaded.economy.history.read().length, 200);
  assert.equal(loaded.simulation.kingdomEvents.history.at(-1)!.result!.goldReceived, 15);
  const saved = json(loaded); assert.equal(loaded.simulation.decideMission(mission.id, 'fulfill'), false);
  assert.deepEqual(json(loaded), saved);
});
