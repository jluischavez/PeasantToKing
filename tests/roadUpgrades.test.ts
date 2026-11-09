import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Session } from '../src/persistence/Session.ts';
import { getRoadMask, RoadDirection } from '../src/map/RoadAppearance.ts';
import { setFixtureRank } from './fixtures/settlementRank.ts';

const c = (column: number, row: number) => ({ column, row });
const road = c(2, 1), adjacent = c(3, 1), home = c(2, 2);

function village() {
  const game = new Session();
  assert.ok(game.map.place(c(0, 1), 'villageCenter'));
  for (let x = 1; x <= 4; x++) assert.ok(game.map.place(c(x, 1), 'road'));
  assert.ok(game.map.place(home, 'house'));
  game.simulation.recalculate();
  setFixtureRank(game.simulation, 'villa');
  return game;
}

test('paving charges once per step, keeps connectivity and caps nearby road beauty', () => {
  const game = village();
  const { economy, map, connections, simulation } = game;
  const revision = connections.revision;
  assert.ok(simulation.upgradeRoad(road, 2));
  assert.equal(simulation.upgradeRoad(road, 1), null);
  assert.ok(simulation.upgradeRoad(road, 1));
  assert.equal(map.roadLevelAt(road), 2);
  assert.deepEqual(economy.resources, { gold: 144, wood: 48, food: 20 });
  assert.equal(simulation.beauty.at(home).score, 20);
  assert.equal(simulation.upgradeRoad(road, 2), null);
  assert.equal(simulation.upgradeRoad(adjacent, 1), null);
  assert.deepEqual(economy.resources, { gold: 123, wood: 42, food: 20 });
  assert.equal(simulation.beauty.at(home).score, 25);
  assert.equal(connections.revision, revision);
  assert.ok(connections.isConnected(home));
  assert.equal(getRoadMask(map, road), RoadDirection.East | RoadDirection.West);
  assert.deepEqual(economy.history.read('gold').map(event => event.destination), ['road:2,1', 'road:2,1', 'road:3,1']);

  const loaded = Session.restore(game.saveState(road)).session;
  assert.equal(loaded.map.roadLevelAt(road), 3);
  assert.equal(loaded.map.roadLevelAt(adjacent), 2);
  assert.equal(loaded.map.roadLevelAt(c(4, 1)), 1);
  assert.deepEqual(loaded.simulation.beauty.at(home), simulation.beauty.at(home));
  assert.deepEqual(loaded.economy.resources, economy.resources);
  assert.equal(loaded.simulation.requestDemolition(road), null);
  assert.equal(loaded.simulation.confirmDemolition(), null);
  assert.equal(loaded.simulation.build(road, 'road'), null);
  assert.equal(loaded.map.roadLevelAt(road), 1);
});

test('paving rejects shortages and protected roads without changing the map or charging', () => {
  const { economy, simulation, map } = village();
  assert.ok(economy.payBuildingCost({ gold: 0, wood: 50 }, 'construction', 'fixture'));
  const resources = economy.resources;
  assert.match(simulation.upgradeRoad(road, 1)!, /madera/);
  assert.deepEqual(economy.resources, resources);
  assert.equal(map.roadLevelAt(road), 1);
  simulation.setPaused(true);
  assert.match(simulation.upgradeRoad(road, 1)!, /Reanuda/);
  const world = Session.start(23);
  const protectedRoad = world.map.kingdomRoad!.segments[0]!;
  assert.equal(world.simulation.roadUpgradeAt(protectedRoad), null);
  assert.ok(world.simulation.upgradeRoad(protectedRoad, 1));
  assert.ok(world.map.isKingdomRoad(protectedRoad));
  assert.ok(world.simulation.requestDemolition(protectedRoad));
  assert.equal(world.economy.resources.gold, 150);
});

test('loading rejects repeated paving records and levels attached to other constructions', () => {
  const state = village().saveState(null);
  const valid = { cell: road, level: 2 as const };
  assert.throws(() => Session.restore({ ...state, roadLevels: [valid, valid] }), /inválidos/);
  assert.throws(() => Session.restore({ ...state, roadLevels: [{ ...valid, cell: home }] }), /inválidos/);
});
