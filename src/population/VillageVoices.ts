import type { ConstructionMap } from '../map/ConstructionMap';
import { check, label, list, restoreEntries, whole } from '../persistence/validation.ts';
import type { Cell } from '../map/CellSelection';
import { simulatedMsPerGameHour } from '../simulation/GameTime.ts';
import type { NeedsObservation } from './HouseholdNeeds';
import { housingVoiceTemplates, newVoiceTemplates, originalVoiceTemplates, urbanVoiceTemplates } from './VillageVoiceCatalog.ts';
import type { VoiceCity, VoiceTone } from './VillageVoiceCatalog';

export type { VoiceTone } from './VillageVoiceCatalog';
type VoiceMessage = Readonly<{ timeMs: number; home: Readonly<Cell>; originExists: boolean; tone: VoiceTone; text: string }>;
const templates = [...originalVoiceTemplates, ...newVoiceTemplates, ...urbanVoiceTemplates];
type Template = typeof templates[number];
const homeKey = (cell: Cell): string => cell.column + ',' + cell.row;

export const voiceRules = {
  intervalMs: 15_000,
  authorRepeatMs: 30_000,
  repeatMs: 3 * simulatedMsPerGameHour,
  minimumObservationSeconds: 10,
  historyLimit: 50,
} as const;

export class VillageVoices {
  private readonly messages: VoiceMessage[] = [];
  private readonly housingNews = new Map<string, Omit<VoiceMessage, 'timeMs'>>();
  private readonly lastHousingNews = new Map<VoiceTone, number>();
  private readonly lastTemplate = new Map<Template, number>();
  private nextPublication: number = voiceRules.intervalMs;
  private revision = 0;

  constructor(private readonly limit: number = voiceRules.historyLimit) {}

  saveState() {
    return { messages: [...this.messages], housingNews: [...this.housingNews], lastHousingNews: [...this.lastHousingNews],
      lastTopic: [...this.lastTemplate].map(([template, time]) => [templates.indexOf(template), time] as const),
      nextPublication: this.nextPublication };
  }

  restoreState(state: ReturnType<VillageVoices['saveState']>, map: ConstructionMap, time: number): void {
    const { messages, housingNews, lastHousingNews, lastTopic, nextPublication } = state;
    const validTone = (tone: VoiceTone) => ['positive', 'negative', 'neutral'].includes(tone);
    const validMessage = (message: Omit<VoiceMessage, 'timeMs'>) =>
      validTone(message.tone) && label(message.text) && map.contains(message.home)
      && typeof message.originExists === 'boolean'
      && (!message.originExists || map.getConstruction(message.home) === 'house');
    list(messages, this.limit);
    let previousTime = 0;
    for (const message of messages) {
      check(validMessage(message) && whole(message.timeMs, previousTime + voiceRules.intervalMs, time));
      previousTime = message.timeMs;
    }
    check(nextPublication === previousTime + voiceRules.intervalMs);
    this.messages.splice(0, this.messages.length, ...messages);
    restoreEntries(this.housingNews, housingNews, this.limit,
      (id, message) => validMessage(message) && id === message.home.column + ',' + message.home.row);
    restoreEntries(this.lastHousingNews, lastHousingNews, 3, (tone, stamp) => validTone(tone) && whole(stamp, 0, time));
    const stamps = new Map<number, number>();
    restoreEntries(stamps, lastTopic, templates.length,
      (index, stamp) => whole(index, 0, templates.length - 1) && whole(stamp, 0, time));
    this.lastTemplate.clear();
    for (const [index, stamp] of stamps) this.lastTemplate.set(templates[index]!, stamp);
    this.nextPublication = nextPublication;
    this.revision++;
  }

  get version(): number { return this.revision; }

  read(tone?: VoiceTone): readonly VoiceMessage[] {
    return this.messages.filter(message => tone === undefined || message.tone === tone);
  }

  reportHousingChange(cell: Cell, upgraded: boolean): void {
    const tone = upgraded ? 'positive' : 'negative';
    this.queueHomeNews(cell, tone, housingVoiceTemplates[tone][0]);
  }

  reportOccasionalArrival(cell: Cell): void {
    this.queueHomeNews(cell, 'neutral', 'Un viajero se ha instalado pese a las dificultades. Dice que aquí aún hay trabajo por hacer.');
  }

  private queueHomeNews(cell: Cell, tone: VoiceTone, text: string): void {
    const key = homeKey(cell);
    if (this.housingNews.size >= this.limit && !this.housingNews.has(key)) {
      const oldest = this.housingNews.keys().next();
      if (!oldest.done) this.housingNews.delete(oldest.value);
    }
    this.housingNews.set(key, { home: { ...cell }, originExists: true, tone, text });
  }

  advance(timeMs: number, observe: () => readonly NeedsObservation[], city: VoiceCity | (() => VoiceCity)): void {
    if (timeMs < this.nextPublication) return;
    for (const [key, message] of this.housingNews) {
      const last = this.lastHousingNews.get(message.tone) ?? -Infinity;
      if (timeMs - last < voiceRules.repeatMs) continue;
      this.housingNews.delete(key);
      this.lastHousingNews.set(message.tone, timeMs);
      const lines = message.tone === 'neutral' ? [message.text] : housingVoiceTemplates[message.tone];
      const recent = new Map(this.messages.map(entry => [entry.text, entry.timeMs]));
      const text = lines.reduce<string>((oldest, line) =>
        (recent.get(line) ?? -Infinity) < (recent.get(oldest) ?? -Infinity) ? line : oldest, lines[0]);
      this.publish({ ...message, text, timeMs });
      return;
    }
    const lastAuthor = new Map(this.messages.filter(message => message.originExists)
      .map(message => [homeKey(message.home), message.timeMs]));
    const lastSpoke = (home: NeedsObservation) => lastAuthor.get(homeKey(home.cell)) ?? -Infinity;
    const homes = observe().filter(home => home.residents > 0 && home.seconds >= voiceRules.minimumObservationSeconds
      && timeMs - lastSpoke(home) >= voiceRules.authorRepeatMs);
    if (homes.length === 0) return;
    homes.sort((first, second) => lastSpoke(first) - lastSpoke(second));
    const context = typeof city === 'function' ? city() : city;
    const lastTopic = new Map<Template['topic'], number>();
    for (const [template, stamp] of this.lastTemplate) {
      lastTopic.set(template.topic, Math.max(lastTopic.get(template.topic) ?? -Infinity, stamp));
    }
    let chosen: Template | undefined;
    let author: NeedsObservation | undefined;
    let oldestTopic = Infinity;
    let oldestTemplate = Infinity;
    for (const template of templates) {
      const topicStamp = lastTopic.get(template.topic) ?? -Infinity;
      const templateStamp = this.lastTemplate.get(template) ?? -Infinity;
      if (timeMs - topicStamp < voiceRules.repeatMs || topicStamp > oldestTopic
        || (topicStamp === oldestTopic && templateStamp >= oldestTemplate)) continue;
      const home = homes.find(candidate => template.matches(candidate, context));
      if (!home) continue;
      chosen = template;
      author = home;
      oldestTopic = topicStamp;
      oldestTemplate = templateStamp;
    }
    if (!chosen || !author) return;
    this.lastTemplate.set(chosen, timeMs);
    this.publish({ timeMs, home: { ...author.cell }, originExists: true, tone: chosen.tone, text: chosen.text });
  }

  private publish(message: VoiceMessage): void {
    this.messages.push(message);
    if (this.messages.length > this.limit) this.messages.shift();
    this.nextPublication = message.timeMs + voiceRules.intervalMs;
    this.revision++;
  }

  retireHome(cell: Cell): void {
    const key = homeKey(cell);
    const pending = this.housingNews.get(key);
    if (pending) this.housingNews.set(key, { ...pending, originExists: false });
    for (const [index, message] of this.messages.entries()) {
      if (message.originExists && message.home.column === cell.column && message.home.row === cell.row) {
        this.messages[index] = { ...message, originExists: false };
        this.revision++;
      }
    }
  }
}
