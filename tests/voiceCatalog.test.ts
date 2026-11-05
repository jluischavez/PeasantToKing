import assert from 'node:assert/strict';
import { test } from 'vitest';
import { housingVoiceTemplates, newVoiceTemplates, originalVoiceTemplates } from '../src/population/VillageVoiceCatalog.ts';
import { VillageVoices, voiceRules } from '../src/population/VillageVoices.ts';
import type { NeedsObservation } from '../src/population/HouseholdNeeds';
import { ConstructionMap } from '../src/map/ConstructionMap.ts';

const city = { unemployment: 0, tax: 'normal', waiting: 0 } as const;
const full = { food: 1, wood: 1, water: 1 };
const first = { column: 0, row: 0 }, second = { column: 1, row: 0 };
const home = (cell = first, coverage = full, current = coverage): NeedsObservation =>
  ({ cell, residents: 2, seconds: 25, coverage, current });
const templates = [...originalVoiceTemplates, ...newVoiceTemplates];

test('the catalog keeps the original messages and adds 69 unique templates with all three tones', () => {
  const housing = Object.values(housingVoiceTemplates);
  const additions = [...newVoiceTemplates.map(template => template.text), ...housing.flatMap(lines => lines.slice(1))];
  const originals = [...originalVoiceTemplates.map(template => template.text), ...housing.map(lines => lines[0])];
  assert.equal(originals.length, 13);
  assert.equal(additions.length, 69);
  assert.equal(new Set([...originals, ...additions]).size, 82);
  assert.deepEqual(new Set(newVoiceTemplates.map(template => template.tone)), new Set(['positive', 'negative', 'neutral']));
  assert.equal(new Set(newVoiceTemplates.map(template => template.topic)).size, 15);
  for (const text of additions) assert.doesNotMatch(text, /\b(invierno|verano|puentes?|ejército|aserradero)\b/i);
});

test('comments about supplies need both current and observed coverage and buildings must exist', () => {
  for (const [need, good, bad] of [['food', 'fed', 'hungry'], ['water', 'watered', 'thirsty'], ['wood', 'warm', 'cold']] as const) {
    const missing = { ...full, [need]: 0 };
    for (const template of templates.filter(entry => entry.topic === good || entry.topic === bad)) {
      assert.equal(template.matches(home(), city), template.topic === good);
      assert.equal(template.matches(home(first, missing), city), template.topic === bad);
      assert.equal(template.matches(home(first, missing, full), city), false);
    }
  }
  for (const [topic, setting] of [['market', 'hasMarket'], ['warehouse', 'hasWarehouse'], ['road', 'hasRoad']] as const) {
    for (const template of templates.filter(entry => entry.topic === topic)) {
      assert.equal(template.matches(home(), city), false);
      assert.equal(template.matches(home(), { ...city, [setting]: true }), true);
    }
  }
});

test('eligible households take turns and variants share their topic cooldown', () => {
  const voices = new VillageVoices();
  const observe = () => [home(), home(second, { ...full, water: 0 })];
  for (let stamp = 0; stamp <= 600_000; stamp += 1000) voices.advance(stamp, observe, city);
  const topicTimes = new Map<string, number>();
  const authorTimes = new Map<number, number>();
  const texts = new Set<string>();
  for (const message of voices.read()) {
    const template = templates.find(entry => entry.text === message.text)!;
    const author = observe().find(entry => entry.cell.column === message.home.column)!;
    assert.ok(template.matches(author, city));
    assert.ok(message.timeMs - (topicTimes.get(template.topic) ?? -Infinity) >= voiceRules.repeatMs);
    assert.ok(message.timeMs - (authorTimes.get(author.cell.column) ?? -Infinity) >= voiceRules.authorRepeatMs);
    topicTimes.set(template.topic, message.timeMs);
    authorTimes.set(author.cell.column, message.timeMs);
    texts.add(message.text);
  }
  assert.equal(authorTimes.size, 2);
  assert.ok(texts.size > originalVoiceTemplates.length);
  for (const tone of ['positive', 'negative', 'neutral'] as const) {
    assert.ok(voices.read(tone).length > 0);
    assert.ok(voices.read(tone).every(message => message.tone === tone));
  }
});

test('legacy template indices retain their cooldown when an old save is restored', () => {
  const map = new ConstructionMap(2, 1);
  map.place(first, 'house');
  map.place(second, 'house');
  const voices = new VillageVoices();
  const legacyMessage = { timeMs: 15_000, home: first, originExists: true, ...originalVoiceTemplates[0]! };
  voices.restoreState({
    messages: [legacyMessage], housingNews: [], lastHousingNews: [],
    lastTopic: [[0, 15_000]], nextPublication: 30_000,
  }, map, 15_000);
  voices.advance(30_000, () => [home(second, { ...full, food: 0 })], city);
  assert.equal(voices.read('negative').length, 1);
  assert.equal(voices.read().length, 2);
});
