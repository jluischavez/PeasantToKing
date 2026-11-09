import assert from 'node:assert/strict';
import { test } from 'vitest';
import { constructionDimensions } from '../src/map/ConstructionMap.ts';
import { Session } from '../src/persistence/Session.ts';
import { SaveSlots, saveKey } from '../src/persistence/SaveSlots.ts';
import { Crown, crownRules, defeatReasons } from '../src/simulation/Crown.ts';
import { simulatedMsPerGameHour as hour } from '../src/simulation/GameTime.ts';
import { royalDefeat, royalLastWarning } from '../src/story/RoyalScenes.ts';

const period = crownRules.periodMs;
const grace = 24 * hour;
const pay = () => true;
const c = (column: number, row: number) => ({ column, row });

function legacyCrown(favor: number) {
  const crown = new Crown();
  const { confidence, defeat, ...state } = crown.saveState();
  return { ...state, favor };
}

function endangered() {
  const crown = new Crown();
  crown.restoreState(legacyCrown(15), 0);
  crown.advance(period, 'aldea');
  crown.advance(2 * period, 'aldea');
  return crown;
}

function zeroFavorGame() {
  const base = new Session();
  base.map.place(c(0, 2), 'villageCenter');
  base.map.place(c(1, 2), 'road');
  base.map.place(c(2, 2), 'road');
  base.map.place(c(2, 3), 'tradeHouse', constructionDimensions.tradeHouse);
  base.simulation.recalculate();
  const state = JSON.parse(JSON.stringify(base.saveState(null)));
  state.crown = legacyCrown(0);
  return Session.restore(state).session;
}

test('falling to zero starts one exact 24-hour deadline and one royal warning', () => {
  const crown = endangered();
  assert.equal(crown.favor, 0);
  assert.equal(crown.defeated, false);
  assert.deepEqual(crown.confidence, { startedAt: 2 * period, dueAt: 2 * period + grace, decree: 'ready' });
  assert.ok(crown.takeConfidenceDecree());
  assert.equal(crown.takeConfidenceDecree(), false);
  crown.markConfidenceDecree('skipped');
  crown.advance(2 * period + hour, 'aldea');
  assert.equal(crown.confidence?.dueAt, 2 * period + grace);
  assert.equal(crown.takeConfidenceDecree(), false);
  assert.equal(crown.history.filter(event => event.kind === 'confidence-lost').length, 1);
});

test.each([1, 15, 50, 100])('favor %i never runs a destitution timer', favor => {
  const crown = new Crown();
  crown.restoreState(legacyCrown(favor), 0);
  crown.advance(grace, 'aldea');
  assert.equal(crown.confidence, null);
  assert.equal(crown.defeated, false);
});

test.each(['tribute', 'offering'] as const)('%s restores confidence before expiry and a later fall starts a full new day', mechanism => {
  const crown = endangered();
  const deadline = crown.confidence!.dueAt;
  const success = mechanism === 'tribute'
    ? crown.pay(crown.nextAt, deadline - 1000, pay)
    : crown.offer(50, 0, deadline - 1000, pay);
  assert.ok(success);
  assert.equal(crown.favor, 5);
  assert.equal(crown.confidence, null);
  crown.advance(deadline, 'aldea');
  assert.equal(crown.defeated, false);
  assert.equal(crown.history.filter(event => event.kind === 'confidence-restored').length, 1);
  crown.advance(3 * period, 'aldea');
  if (mechanism === 'tribute') crown.advance(4 * period, 'aldea');
  const startedAt = mechanism === 'tribute' ? 4 * period : 3 * period;
  assert.equal(crown.favor, 0);
  assert.equal(crown.confidence?.startedAt, startedAt);
  assert.equal(crown.confidence?.dueAt, startedAt + grace);
  assert.ok(crown.takeConfidenceDecree());
  const restored = new Crown();
  restored.restoreState(crown.saveState(), startedAt);
  assert.deepEqual(restored.saveState(), crown.saveState());
});

test('the full day expires exactly once and neither a late offering nor a late tribute rescues it', () => {
  const crown = endangered();
  const dueAt = crown.confidence!.dueAt;
  crown.advance(dueAt - 1000, 'aldea');
  assert.equal(crown.defeated, false);
  crown.advance(dueAt, 'aldea');
  assert.equal(crown.defeated, true);
  assert.equal(crown.defeatReason, defeatReasons.confidence);
  const frozen = crown.saveState();
  assert.equal(crown.offer(50, 0, dueAt, () => assert.fail('late payment')), false);
  assert.equal(crown.pay(crown.nextAt, dueAt, () => assert.fail('late payment')), false);
  crown.advance(crown.nextAt, 'aldea');
  assert.deepEqual(crown.saveState(), frozen);
  const restored = new Crown();
  restored.restoreState(frozen, dueAt);
  assert.deepEqual(restored.saveState(), frozen);
});

test.each([1, 2, 3] as const)('the timer uses ×%i, freezes during pause and narrative, and cannot be restarted by reload', speed => {
  let game = zeroFavorGame();
  const { simulation } = game;
  simulation.setSpeed(speed);
  simulation.setPaused(true);
  simulation.advance(grace);
  assert.equal(simulation.simulatedTimeMs, 0);
  simulation.setPaused(false);
  simulation.setReadingChapter(true);
  simulation.advance(grace);
  assert.equal(simulation.simulatedTimeMs, 0);
  simulation.setReadingChapter(false);
  simulation.setSuspended(true);
  simulation.advance(grace);
  assert.equal(simulation.simulatedTimeMs, 0);
  simulation.setSuspended(false);
  assert.equal(simulation.advance(grace), false);
  simulation.advance(4 * hour / speed);
  for (let i = 0; i < 3; i++) {
    game = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
    assert.equal(game.simulation.crown.confidence?.dueAt, grace);
    assert.equal(game.simulation.simulatedTimeMs, 4 * hour);
  }
  game.simulation.advance((20 * hour - 1000) / speed);
  assert.equal(game.simulation.crown.defeated, false);
  game.simulation.advance(1000 / speed + 0.01);
  assert.equal(game.simulation.simulatedTimeMs, grace);
  assert.equal(game.simulation.crown.defeatReason, defeatReasons.confidence);
  assert.equal(game.simulation.advance(grace), false);
  const frozen = JSON.stringify(game.saveState(null));
  game.simulation.setPaused(false);
  assert.match(game.simulation.build(c(4, 3), 'road')!, /simulación/);
  assert.match(game.simulation.requestDemolition(c(1, 2))!, /simulación/);
  assert.match(game.simulation.upgradeRoad(c(1, 2), 1)!, /simulación|rango/);
  assert.ok(game.simulation.confirmBridge());
  assert.equal(game.simulation.payTribute(2 * period), false);
  assert.equal(game.simulation.makeOffering(50, 0), false);
  assert.equal(game.simulation.recognize('pueblo'), false);
  assert.equal(game.simulation.trade.configure(c(2, 3), 'food', { mode: 'import', reserve: 0, target: 100 }), false);
  game.simulation.trade.advance(grace * 2);
  assert.equal(JSON.stringify(game.saveState(null)), frozen);
  const restored = Session.restore(JSON.parse(frozen)).session;
  assert.equal(JSON.stringify(restored.saveState(null)), frozen);
  assert.equal(restored.simulation.advance(hour), false);
});

test('a legacy zero favor gets one full day from its saved clock, and current saves preserve warning and defeat', () => {
  const base = new Session();
  base.simulation.advance(7 * hour);
  const state = JSON.parse(JSON.stringify(base.saveState(null)));
  state.crown = { ...legacyCrown(0), nextAt: period };
  const data = new Map([[saveKey(1), JSON.stringify({ version: 5, savedAt: 1, state })]]);
  const slots = new SaveSlots(() => ({
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
  }));
  const game = slots.load(1).session;
  assert.equal(game.simulation.crown.confidence?.dueAt, 31 * hour);
  game.simulation.crown.takeConfidenceDecree();
  game.simulation.crown.markConfidenceDecree('skipped');
  game.simulation.advance(10 * hour);
  slots.save(2, null, game, null);
  const reloaded = slots.load(2).session;
  assert.equal(reloaded.simulation.crown.confidence?.dueAt, 31 * hour);
  assert.equal(reloaded.simulation.crown.takeConfidenceDecree(), false);
  reloaded.simulation.advance(14 * hour);
  slots.save(3, null, reloaded, null);
  assert.equal(slots.load(3).session.simulation.crown.defeatReason, defeatReasons.confidence);
  assert.throws(() => slots.load(3, true), /ya terminó/);
  assert.equal(slots.load(2, true).session.simulation.crown.defeated, false);
  const raw = JSON.parse(data.get(saveKey(2))!);
  delete raw.state.crown.confidence;
  data.set(saveKey(2), JSON.stringify(raw));
  assert.throws(() => slots.load(2), /./);
});

test('both final narratives and the warning provide the requested text and legitimate recovery actions', () => {
  assert.equal(royalDefeat.title, 'Capítulo final — El rey ya no os quiere');
  assert.equal(royalDefeat.final, true);
  assert.match(royalDefeat.text, /DERROTA — HAS SIDO DESTITUIDO POR EL REY/);
  assert.match(royalLastWarning.text, /24 horas.*ofrenda.*tributo/);
  const crown = new Crown();
  for (let i = 1; i <= 4; i++) crown.advance(i * period, 'aldea');
  assert.equal(crown.defeatReason, defeatReasons.tributes);
  assert.equal(crown.confidence, null);
});

test('paying at the deadline cannot bypass expiry without first calling advance', () => {
  for (const mechanism of ['tribute', 'offering']) {
    const crown = endangered();
    const deadline = crown.confidence!.dueAt;
    const charged = () => assert.fail('expired confidence accepted payment');
    assert.equal(mechanism === 'tribute' ? crown.pay(crown.nextAt, deadline, charged)
      : crown.offer(50, 0, deadline, charged), false);
    assert.equal(crown.defeatReason, defeatReasons.confidence);
  }
});

test('a positive saved favor cannot keep an active zero-favor countdown', () => {
  const crown = endangered();
  assert.throws(() => new Crown().restoreState({ ...crown.saveState(), favor: 1 }, 2 * period));
});

test('confidence defeat at the next tribute emission remains loadable without emitting or paying a new bill', () => {
  const base = new Session();
  base.simulation.advance(48 * hour);
  const state = JSON.parse(JSON.stringify(base.saveState(null)));
  state.crown = legacyCrown(0);
  const game = Session.restore(state).session;
  assert.equal(game.simulation.crown.confidence?.dueAt, period);
  game.simulation.advance(grace);
  assert.equal(game.simulation.crown.defeatReason, defeatReasons.confidence);
  assert.equal(game.simulation.crown.obligation, null);
  const restored = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
  assert.equal(restored.simulation.crown.defeatReason, defeatReasons.confidence);
  assert.equal(restored.simulation.advance(hour), false);
});
