import { ChapterVoice } from '../story/ChapterVoice';
import { chapterPages, chapters } from '../story/Chapters';
import type { ChapterTrack } from '../story/Chapters';
import type { ChapterStatus, SettlementRank } from '../simulation/SettlementProgress';
import type { SettlementSimulation } from '../simulation/SettlementSimulation';

export type NarrativeChoice = { label: string; disabled?: boolean; run: () => boolean };

export class ChapterDialog {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#chapter-dialog')!;
  private readonly title = document.getElementById('chapter-title')!;
  private readonly step = document.getElementById('chapter-step')!;
  private readonly passage = document.getElementById('chapter-passage')!;
  private readonly audio = document.getElementById('chapter-audio')!;
  private readonly voiceStatus = document.getElementById('chapter-voice-status')!;
  private readonly play = document.querySelector<HTMLButtonElement>('#chapter-play')!;
  private readonly pause = document.querySelector<HTMLButtonElement>('#chapter-pause')!;
  private readonly stop = document.querySelector<HTMLButtonElement>('#chapter-stop')!;
  private readonly mute = document.querySelector<HTMLInputElement>('#chapter-mute')!;
  private readonly back = document.querySelector<HTMLButtonElement>('#chapter-back')!;
  private readonly next = document.querySelector<HTMLButtonElement>('#chapter-next')!;
  private readonly skip = document.querySelector<HTMLButtonElement>('#chapter-skip')!;
  private readonly manage = document.querySelector<HTMLButtonElement>('#chapter-manage')!;
  private readonly choices = document.getElementById('chapter-decisions')!;
  private readonly choiceFeedback = document.getElementById('chapter-decision-feedback')!;
  private readonly events = new AbortController();
  private readonly voice: ChapterVoice;
  private rank: SettlementRank = 'aldea';
  private track: ChapterTrack = 'story';
  private offerTutorial = false;
  private offering = false;
  private pages: string[] = [];
  private page = 0;
  private played = false;
  private failed = false;
  private autoAttempted = false;
  private choiceActions: readonly NarrativeChoice[] = [];
  private royal: { title: string; text: string; final?: boolean; finished: (status: ChapterStatus) => void; manage?: () => void } | null = null;

  constructor(private readonly simulation: SettlementSimulation, private readonly onClose: () => void) {
    const synthesis = window.speechSynthesis;
    const utterance = typeof SpeechSynthesisUtterance === 'function' ? (text: string) => new SpeechSynthesisUtterance(text) : undefined;
    this.voice = new ChapterVoice(synthesis, utterance, () => window.localStorage);
    const options = { signal: this.events.signal };
    synthesis?.addEventListener('voiceschanged', () => { this.autoNarrate(); this.renderVoice(); }, options);
    this.play.addEventListener('click', () => this.narrate(), options);
    this.pause.addEventListener('click', () => { this.voice.togglePause(); this.renderVoice(); }, options);
    this.stop.addEventListener('click', () => { this.voice.stop(); this.renderVoice(); }, options);
    this.mute.addEventListener('change', () => {
      this.voice.setMuted(this.mute.checked);
      this.autoAttempted = false;
      this.autoNarrate();
      this.renderVoice();
    }, options);
    this.back.addEventListener('click', () => {
      if (this.page > 0) this.page--;
      this.renderPage();
    }, options);
    this.next.addEventListener('click', () => this.continue(), options);
    this.skip.addEventListener('click', () => this.finish('skipped'), options);
    this.manage.addEventListener('click', () => {
      const open = this.royal?.manage;
      this.finish('seen');
      open?.();
    }, options);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.finish('skipped'); }, options);
    this.choices.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-choice]');
      const choice = button ? this.choiceActions[Number(button.dataset.choice)] : undefined;
      if (!choice || choice.disabled) return;
      if (choice.run()) this.finish('seen');
      else this.choiceFeedback.textContent = 'La decisión no pudo aplicarse. Revisa los recursos y el plazo en Crónicas.';
    }, options);
  }

  open(rank: SettlementRank, track: ChapterTrack = 'story', offerTutorial = false): void {
    if (!this.simulation.progress.reached(rank)) return;
    this.royal = null;
    this.rank = rank;
    this.offerTutorial = offerTutorial;
    this.startTrack(track);
    this.show();
  }

  openRoyal(scene: { title: string; text: string; final?: boolean }, finished: (status: ChapterStatus) => void, manage?: () => void): void {
    this.royal = { ...scene, finished, manage };
    this.offering = this.offerTutorial = false;
    this.pages = [scene.text];
    this.page = 0;
    this.renderPage();
    this.show();
  }

  openEvent(scene: { title: string; text: string }, choices: readonly NarrativeChoice[]): void {
    this.openRoyal(scene, () => {});
    this.next.textContent = 'Volver a la ciudad';
    this.skip.textContent = 'Omitir narración';
    this.choiceActions = choices;
    this.choices.replaceChildren(...choices.map((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.disabled = !!choice.disabled;
      button.dataset.choice = String(index);
      return button;
    }));
  }

  private show(): void {
    if (!this.dialog.open) this.dialog.showModal();
    this.simulation.setReadingChapter(true);
    this.title.focus();
    this.autoNarrate();
  }

  private startTrack(track: ChapterTrack): void {
    this.track = track;
    this.offering = false;
    this.pages = chapterPages(this.rank, track, this.simulation.settlementStats());
    this.page = 0;
    this.renderPage();
  }

  private continue(): void {
    if (this.royal) {
      this.finish('seen');
    } else if (this.offering) {
      this.startTrack('tutorial');
    } else if (this.page < this.pages.length - 1) {
      this.page++;
      this.renderPage();
    } else if (this.track === 'story' && this.offerTutorial) {
      this.simulation.progress.markChapter(this.rank, 'story', 'seen');
      this.offering = true;
      this.renderPage();
      this.next.focus();
    } else this.finish('seen');
  }

  private renderPage(): void {
    this.voice.stop();
    this.choiceActions = [];
    this.choices.replaceChildren();
    this.choiceFeedback.textContent = '';
    this.played = false;
    this.failed = false;
    this.autoAttempted = false;
    this.title.textContent = this.royal?.title ?? chapters[this.rank].title;
    this.step.textContent = this.royal ? 'La Corona' : this.offering ? 'Tutorial opcional'
      : (this.track === 'story' ? 'Capítulo' : 'Tutorial') + ` · ${this.page + 1} de ${this.pages.length}`;
    this.passage.textContent = this.offering ? 'Puedes repasar las herramientas de este rango o seguir jugando.' : this.pages[this.page]!;
    this.back.hidden = this.offering || this.page === 0;
    this.audio.hidden = false;
    this.voiceStatus.hidden = false;
    this.next.textContent = this.royal ? (this.royal.final ? 'Ver resumen final' : 'Entendido') : this.offering ? 'Ver tutorial'
      : this.page < this.pages.length - 1 || (this.track === 'story' && this.offerTutorial) ? 'Continuar' : 'Terminar';
    this.skip.hidden = !!this.royal?.manage && !this.royal.final;
    this.manage.hidden = !this.royal?.manage;
    this.skip.textContent = this.royal ? (this.royal.final ? 'Omitir narración' : 'Omitir decreto')
      : this.offering || this.track === 'tutorial' ? 'Omitir tutorial' : 'Omitir capítulo';
    this.renderVoice();
    if (this.dialog.open) this.title.focus();
    this.autoNarrate();
  }

  private autoNarrate(): void {
    if (this.dialog.open && !this.autoAttempted && !this.voice.muted && this.voice.available) this.narrate();
  }

  private narrate(): void {
    this.autoAttempted = true;
    this.failed = false;
    this.played = this.voice.play(this.passage.textContent ?? '', failed => {
      this.failed = failed;
      this.renderVoice();
    }) || this.played;
    this.renderVoice();
  }

  private renderVoice(): void {
    const available = this.voice.available;
    this.mute.checked = this.voice.muted;
    this.play.disabled = !available || this.voice.muted;
    this.play.textContent = this.played ? 'Repetir narración' : 'Escuchar';
    this.pause.disabled = !this.voice.active;
    this.pause.textContent = this.voice.paused ? 'Reanudar voz' : 'Pausar voz';
    this.stop.disabled = !this.voice.active;
    this.voiceStatus.textContent = !available ? 'No hay una voz en español disponible. Puedes seguir leyendo.'
      : this.failed ? 'La voz no pudo reproducirse. Puedes seguir leyendo.' : '';
  }

  private finish(status: ChapterStatus): void {
    if (this.royal) this.royal.finished(status);
    else this.simulation.progress.markChapter(this.rank, this.offering ? 'tutorial' : this.track, status);
    this.close();
    this.onClose();
  }

  private close(): void {
    this.voice.stop();
    if (this.dialog.open) this.dialog.close();
    this.simulation.setReadingChapter(false);
  }

  destroy(): void { this.events.abort(); this.close(); }
}
