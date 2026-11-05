import type { TaxPolicy } from '../economy/TaxPolicy';
import type { Cell } from '../map/CellSelection';
import { simulatedMsPerGameHour } from '../simulation/GameTime.ts';
import type { Need, NeedsObservation } from './HouseholdNeeds';

export type VoiceTone = 'positive' | 'negative' | 'neutral';
type VoiceMessage = Readonly<{ timeMs: number; home: Readonly<Cell>; originExists: boolean; tone: VoiceTone; text: string }>;
type City = Readonly<{ unemployment: number; tax: TaxPolicy; waiting: number }>;
type Topic = Readonly<{ tone: VoiceTone; text: string; matches: (home: NeedsObservation, city: City) => boolean }>;
const shortage = (need: Need) => (home: NeedsObservation) => home.coverage[need] < 0.8 && home.current[need] < 1;
const supplied = (need: Need) => (home: NeedsObservation) => home.coverage[need] >= 0.95 && home.current[need] === 1;
const topics: readonly Topic[] = [
  { tone: 'negative', text: 'Llevamos demasiado tiempo sin comida en casa.', matches: shortage('food') },
  { tone: 'negative', text: 'Otra vez falta agua. Necesitamos más aguadores.', matches: shortage('water') },
  { tone: 'negative', text: 'Nos está faltando madera en casa.', matches: shortage('wood') },
  { tone: 'negative', text: 'Los impuestos están por las nubes.', matches: (_home, city) => city.tax === 'high' },
  { tone: 'negative', text: 'Cuesta encontrar trabajo en la aldea.', matches: (_home, city) => city.unemployment >= 0.25 },
  { tone: 'positive', text: '¡Qué gusto tener comida en casa!', matches: supplied('food') },
  { tone: 'positive', text: '¡Los aguadores ya traen agua a nuestra casa!', matches: supplied('water') },
  { tone: 'positive', text: 'Podemos contar con la madera del mercado.', matches: supplied('wood') },
  { tone: 'positive', text: 'Con estos impuestos queda más margen para vivir.', matches: (_home, city) => city.tax === 'low' },
  { tone: 'neutral', text: 'Hay gente esperando un solar para mudarse.', matches: (_home, city) => city.waiting > 0 },
  { tone: 'neutral', text: 'Otro día en nuestra aldea.', matches: () => true },
];

export const voiceRules = {
  intervalMs: 15_000,
  repeatMs: 3 * simulatedMsPerGameHour,
  minimumObservationSeconds: 10,
  historyLimit: 50,
} as const;

export class VillageVoices {
  private readonly messages: VoiceMessage[] = [];
  private readonly lastTopic = new Map<Topic, number>();
  private nextPublication: number = voiceRules.intervalMs;
  private revision = 0;

  constructor(private readonly limit: number = voiceRules.historyLimit) {}

  get version(): number { return this.revision; }

  read(tone?: VoiceTone): readonly VoiceMessage[] {
    return this.messages.filter(message => tone === undefined || message.tone === tone);
  }

  advance(timeMs: number, observe: () => readonly NeedsObservation[], city: City): void {
    if (timeMs < this.nextPublication) return;
    const homes = observe().filter(home => home.residents > 0 && home.seconds >= voiceRules.minimumObservationSeconds);
    let chosen: Topic | undefined, author: NeedsObservation | undefined, oldest = Infinity;
    for (const topic of topics) {
      const last = this.lastTopic.get(topic) ?? -Infinity;
      if (last >= oldest || timeMs - last < voiceRules.repeatMs) continue;
      const home = homes.find(candidate => topic.matches(candidate, city));
      if (!home) continue;
      chosen = topic;
      author = home;
      oldest = last;
    }
    if (!chosen || !author) return;
    this.messages.push({ timeMs, home: { ...author.cell }, originExists: true, tone: chosen.tone, text: chosen.text });
    if (this.messages.length > this.limit) this.messages.shift();
    this.lastTopic.set(chosen, timeMs);
    this.nextPublication = timeMs + voiceRules.intervalMs;
    this.revision++;
  }

  retireHome(cell: Cell): void {
    for (const [index, message] of this.messages.entries()) {
      if (message.originExists && message.home.column === cell.column && message.home.row === cell.row) {
        this.messages[index] = { ...message, originExists: false };
        this.revision++;
      }
    }
  }
}
