import { formatNumber } from '../formatNumber';
import type { Cell } from '../map/CellSelection';
import type { VillageVoices, VoiceTone } from '../population/VillageVoices';
import { formatGameTime, gameTimeAt } from '../simulation/GameTime';

import { Feed } from './Feed';

const tones = { positive: 'Positiva', negative: 'Negativa', neutral: 'Neutra' } as const;

export class VillageVoicesPanel {
  private readonly panel = document.querySelector<HTMLElement>('#voices-panel')!;
  private readonly filter = document.querySelector<HTMLSelectElement>('#voice-filter')!;
  private readonly empty = document.querySelector<HTMLElement>('#voices-empty')!;
  private readonly list = document.querySelector<HTMLElement>('#voices-list')!;
  private readonly feed = new Feed<ReturnType<VillageVoices['read']>[number]>(this.panel, this.list);
  private readonly events = new AbortController();
  private lastView = '';

  constructor(private readonly voices: VillageVoices, private readonly selectHome: (cell: Cell) => void) {
    const options = { signal: this.events.signal };
    this.filter.addEventListener('change', () => this.render(), options);
  }

  render(): void {
    if (this.panel.hidden) return;
    const tone = this.filter.value as VoiceTone | '';
    const view = this.voices.version + ':' + tone;
    if (view === this.lastView) return;
    this.lastView = view;
    const messages = this.voices.read(tone || undefined);
    this.empty.hidden = messages.length > 0;
    this.empty.textContent = tone ? 'No hay opiniones con este filtro.' : 'Todavía no hay opiniones.';
    this.feed.render([...messages].reverse(), message => message.timeMs, message => {
      const item = document.createElement('li');
      const author = document.createElement('strong');
      const coords = formatNumber(message.home.column) + ',' + formatNumber(message.home.row);
      author.textContent = 'Aldeano de (' + coords + ') · ' + tones[message.tone];
      const date = document.createElement('div');
      date.textContent = formatGameTime(gameTimeAt(message.timeMs));
      const quote = document.createElement('div');
      quote.textContent = message.text;
      item.append(author, date, quote);
      if (message.originExists) {
        const select = document.createElement('button');
        select.type = 'button';
        select.textContent = 'Seleccionar vivienda (' + coords + ')';
        select.addEventListener('click', () => this.selectHome(message.home));
        item.append(select);
      } else {
        const removed = document.createElement('small');
        removed.textContent = 'Vivienda demolida';
        item.append(removed);
      }
      return item;
    });
  }

  destroy(): void { this.events.abort(); }
}
