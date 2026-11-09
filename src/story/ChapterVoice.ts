const muteKey = 'peasant-to-king:narration-muted';
const knownMaleVoice = /\b(pablo|jorge|juan|diego|carlos|raul|raúl|miguel|andrés|andres|enrique|alvaro|álvaro|gonzalo|male|masculin[oa])\b/i;

export class ChapterVoice {
  private current: SpeechSynthesisUtterance | null = null;
  private preference = false;

  constructor(private readonly synthesis?: SpeechSynthesis,
    private readonly createUtterance?: (text: string) => SpeechSynthesisUtterance,
    private readonly storage?: () => Pick<Storage, 'getItem' | 'setItem'>) {
    try { this.preference = storage?.().getItem(muteKey) === 'true'; } catch { /* Storage can be disabled. */ }
  }

  get muted(): boolean { return this.preference; }
  get available(): boolean { return !!this.createUtterance && !!this.voice(); }

  private voice(): SpeechSynthesisVoice | undefined {
    const spanish = this.synthesis?.getVoices().filter(voice => /^es(?:[-_]|$)/i.test(voice.lang)) ?? [];
    return spanish.find(voice => voice.localService && knownMaleVoice.test(voice.name))
      ?? spanish.find(voice => knownMaleVoice.test(voice.name))
      ?? spanish.find(voice => voice.localService) ?? spanish[0];
  }

  setMuted(muted: boolean): void {
    this.preference = muted;
    if (muted) this.stop();
    try { this.storage?.().setItem(muteKey, String(muted)); } catch { /* Keep the in-memory preference. */ }
  }

  play(text: string, onEnd: (failed: boolean) => void): boolean {
    this.stop();
    const voice = this.voice();
    if (this.muted || !this.synthesis || !voice || !this.createUtterance) return false;
    const utterance = this.createUtterance(text);
    utterance.lang = voice.lang;
    utterance.voice = voice;
    utterance.pitch = 0.85;
    utterance.rate = 0.92;
    const finish = (failed: boolean) => {
      if (this.current !== utterance) return;
      this.current = null;
      onEnd(failed);
    };
    utterance.onend = () => finish(false);
    utterance.onerror = () => finish(true);
    this.current = utterance;
    try { this.synthesis.speak(utterance); }
    catch { finish(true); }
    return this.current === utterance;
  }

  togglePause(): void {
    if (!this.current || !this.synthesis) return;
    if (this.synthesis.paused) this.synthesis.resume();
    else this.synthesis.pause();
  }

  get active(): boolean { return this.current !== null; }
  get paused(): boolean { return this.active && !!this.synthesis?.paused; }

  stop(): void {
    if (!this.current || !this.synthesis) return;
    this.current = null;
    this.synthesis.cancel();
    if (this.synthesis.paused) this.synthesis.resume();
  }
}
