import { formatNumber } from '../formatNumber';
import { constructionNames } from '../map/ConstructionMap';
import { roadMaterials } from '../map/RoadMaterials';
import { chapters } from '../story/Chapters';
import type { ChapterTrack } from '../story/Chapters';
import { formatGameTime, gameTimeAt } from '../simulation/GameTime';
import { rankRules, settlementRanks } from '../simulation/SettlementProgress';
import type { ChapterStatus, SettlementRank } from '../simulation/SettlementProgress';
import type { SettlementSimulation } from '../simulation/SettlementSimulation';
import { setText } from './domText';

const statusNames: Record<ChapterStatus, string> = { seen: 'visto', skipped: 'omitido' };

export class ChroniclesPanel {
  private readonly rank = document.getElementById('settlement-rank')!;
  private readonly target = document.getElementById('promotion-target')!;
  private readonly goals = document.getElementById('promotion-goals')!;
  private readonly unlocks = document.getElementById('promotion-unlocks')!;
  private readonly promote = document.querySelector<HTMLButtonElement>('#recognize-settlement')!;
  private readonly archive = document.getElementById('chapter-archive')!;
  private readonly events = new AbortController();
  private readonly rows: HTMLElement[] = [];
  private readonly archiveNotes = new Map<SettlementRank, HTMLElement>();
  private renderedRank?: SettlementRank;

  constructor(private readonly simulation: SettlementSimulation,
    onPromotion: (rank: SettlementRank) => void, private readonly open: (rank: SettlementRank, track: ChapterTrack) => void) {
    this.promote.addEventListener('click', () => {
      const next = simulation.progress.next(simulation.settlementStats());
      if (next && simulation.recognize(next.rank)) onPromotion(next.rank);
    }, { signal: this.events.signal });
  }

  render(): void {
    const { progress } = this.simulation;
    const next = progress.next(this.simulation.settlementStats());
    if (this.renderedRank !== progress.rank) {
      this.renderedRank = progress.rank;
      setText(this.rank, rankRules[progress.rank].name);
      setText(this.target, next ? 'Objetivo · Convertirse en ' + next.rules.name
        : 'Villa es el rango máximo actual. Quedan desafíos por descubrir.');
      this.goals.replaceChildren();
      this.rows.length = 0;
      for (const goal of next?.goals ?? []) {
        const label = document.createElement('dt');
        const value = document.createElement('dd');
        label.textContent = goal.label;
        this.goals.append(label, value);
        this.rows.push(value);
      }
      this.unlocks.hidden = this.promote.hidden = !next;
      if (next) {
        setText(this.promote, 'Solicitar reconocimiento de ' + next.rules.name);
        const buildings = next.rules.buildings.map(type => constructionNames[type]);
        setText(this.unlocks, 'Desbloquea ' + [...buildings, roadMaterials[next.rules.roadLevel]].join(' y ') + '.');
      }
      for (const rank of settlementRanks) {
        if (progress.reached(rank) && !this.archiveNotes.has(rank)) this.addChapter(rank);
      }
    }
    this.promote.disabled = !next?.ready || this.simulation.crown.defeated;
    for (const [index, goal] of (next?.goals ?? []).entries()) {
      const value = this.rows[index];
      setText(value, (goal.complete ? '✓ ' : '') + formatNumber(goal.current) + ' / ' + formatNumber(goal.minimum));
      value.toggleAttribute('data-complete', goal.complete);
    }
    for (const [rank, note] of this.archiveNotes) {
      const { story, tutorial } = progress.chapter(rank);
      const recognition = progress.recognitionAt(rank);
      const date = recognition === undefined ? '' : formatGameTime(gameTimeAt(recognition)) + ' · ';
      setText(note, date + 'Capítulo ' + (story ? statusNames[story] : 'pendiente')
        + ' · Tutorial ' + (tutorial ? statusNames[tutorial] : 'pendiente'));
    }
  }

  private addChapter(rank: SettlementRank): void {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = chapters[rank].title;
    const note = document.createElement('p');
    note.className = 'panel-note';
    const actions = document.createElement('div');
    actions.className = 'chapter-actions';
    for (const [track, text] of [['story', 'Abrir capítulo'], ['tutorial', 'Ver tutorial']] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label', text + ' · ' + chapters[rank].title);
      button.setAttribute('aria-haspopup', 'dialog');
      button.addEventListener('click', () => this.open(rank, track), { signal: this.events.signal });
      actions.append(button);
    }
    item.append(title, note, actions);
    this.archive.append(item);
    this.archiveNotes.set(rank, note);
  }

  destroy(): void { this.events.abort(); this.archive.replaceChildren(); }
}
