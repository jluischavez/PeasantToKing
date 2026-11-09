import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ChapterVoice } from '../src/story/ChapterVoice.ts';
import { chapterPages } from '../src/story/Chapters.ts';
import { rankRules } from '../src/simulation/SettlementProgress.ts';

function speechFixture() {
  const active: SpeechSynthesisUtterance[] = [];
  const synth = {
    paused: false,
    getVoices: () => [
      { lang: 'en-US', name: 'John', localService: true },
      { lang: 'es-MX', name: 'Sabina', localService: true },
      { lang: 'es-ES', name: 'Microsoft Pablo', localService: true },
    ],
    speak: (utterance: SpeechSynthesisUtterance) => active.push(utterance),
    cancel: () => { active.length = 0; },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
  };
  const data = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); } });
  const voice = () => new ChapterVoice(synth as unknown as SpeechSynthesis,
    text => ({ text }) as SpeechSynthesisUtterance, storage);
  return { active, synth, voice };
}

test('repeat replaces the old Spanish utterance, and pause and skip cancel cleanly', () => {
  const { voice, active } = speechFixture();
  const narrator = voice();
  const complete: boolean[] = [];
  const report = (failed: boolean) => { complete.push(failed); };
  assert.equal(narrator.play('Página de prueba', report), true);
  const first = active[0]!;
  assert.equal(first.voice?.name, 'Microsoft Pablo');
  assert.equal(first.lang, 'es-ES');
  narrator.togglePause();
  assert.equal(narrator.paused, true);
  assert.equal(narrator.play('Página de prueba', report), true);
  assert.equal(narrator.paused, false);
  assert.equal(active.length, 1);
  first.onerror?.call(first, {} as SpeechSynthesisErrorEvent);
  assert.deepEqual(complete, []);
  narrator.togglePause();
  narrator.togglePause();
  assert.equal(narrator.paused, false);
  narrator.stop();
  assert.equal(active.length, 0);
  assert.equal(narrator.active, false);
});

test('mute stops narration and is preserved in a new reader', () => {
  const { voice, active } = speechFixture();
  const narrator = voice();
  assert.equal(narrator.play('Página de prueba', () => {}), true);
  narrator.setMuted(true);
  assert.equal(active.length, 0);
  assert.equal(narrator.play('Página de prueba', () => {}), false);
  assert.equal(voice().muted, true);
  narrator.setMuted(false);
  assert.equal(voice().muted, false);
});

test('blocked speech reports failure and leaves the reader available for a manual retry', () => {
  const { voice, synth, active } = speechFixture();
  const reader = voice();
  const failures: boolean[] = [];
  synth.speak = () => { throw new Error('autoplay blocked'); };
  assert.equal(reader.play('Escena automática', failed => failures.push(failed)), false);
  assert.deepEqual(failures, [true]);
  assert.equal(reader.active, false);
  synth.speak = utterance => { active.push(utterance); };
  assert.equal(reader.play('Escena manual', failed => failures.push(failed)), true);
  const utterance = active[0]!;
  utterance.onerror?.call(utterance, {} as SpeechSynthesisErrorEvent);
  assert.deepEqual(failures, [true, true]);
  assert.equal(reader.active, false);
});

test('story and tutorials are independently readable without speech support or a Spanish voice', () => {
  const { synth } = speechFixture();
  synth.getVoices = () => [{ lang: 'en-US', name: 'John', localService: true }];
  const englishOnly = new ChapterVoice(synth as unknown as SpeechSynthesis, text => ({ text }) as SpeechSynthesisUtterance);
  for (const voice of [new ChapterVoice(), englishOnly]) {
    assert.equal(voice.available, false);
    assert.equal(voice.play('Texto', () => assert.fail()), false);
    voice.stop();
  }
  for (const rank of ['aldea', 'pueblo', 'villa'] as const) {
    const story = chapterPages(rank, 'story', rankRules[rank].minimum);
    const tutorial = chapterPages(rank, 'tutorial', rankRules[rank].minimum);
    assert.ok(story.length > 1 && tutorial.length > 1);
    assert.ok(story.every(text => text.length > 50 && !tutorial.includes(text)));
  }
  for (const rank of ['pueblo', 'villa'] as const) {
    assert.notDeepEqual(chapterPages(rank, 'story', rankRules[rank].minimum),
      chapterPages(rank, 'story', { ...rankRules[rank].minimum, happiness: 90, gold: 0 }));
  }
});
