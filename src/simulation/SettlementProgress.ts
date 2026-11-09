import { check, whole } from '../persistence/validation.ts';
import type { ConstructionType } from '../map/ConstructionMap';
import type { RoadLevel } from '../map/RoadMaterials';

export const settlementRanks = ['aldea', 'pueblo', 'villa'] as const;
export type SettlementRank = typeof settlementRanks[number];
type PromotionRank = Exclude<SettlementRank, 'aldea'>;
export type ChapterStatus = 'seen' | 'skipped';
export type SettlementStats = Readonly<Record<'population' | 'happiness' | 'beauty' | 'gold', number>>;

type RankDefinition = Readonly<{
  name: string;
  minimum: SettlementStats;
  buildings: readonly ConstructionType[];
  roadLevel: RoadLevel;
}>;

export const rankRules: Readonly<Record<SettlementRank, RankDefinition>> = {
  aldea: { name: 'Aldea', minimum: { population: 0, happiness: 0, beauty: 0, gold: 0 },
    buildings: ['villageCenter', 'house', 'road', 'bridge', 'farm', 'lumberjack', 'warehouse', 'market', 'well', 'garden'], roadLevel: 1 },
  pueblo: { name: 'Pueblo', minimum: { population: 24, happiness: 50, beauty: 30, gold: 500 },
    buildings: ['park', 'tradeHouse'], roadLevel: 2 },
  villa: { name: 'Villa', minimum: { population: 60, happiness: 65, beauty: 55, gold: 800 },
    buildings: ['plaza'], roadLevel: 3 },
};

const objectives = { population: 'Habitantes', happiness: 'Felicidad', beauty: 'Belleza residencial', gold: 'Oro disponible' } as const;
type Recognition = Readonly<{ rank: PromotionRank; timeMs: number }>;
type ChapterRecord = Readonly<{ story?: ChapterStatus; tutorial?: ChapterStatus }>;
type ProgressState = {
  rank: SettlementRank;
  recognitions: Recognition[];
  chapters: Partial<Record<SettlementRank, ChapterRecord>>;
};

export class SettlementProgress {
  private current: SettlementRank = 'aldea';
  private recognitions: Recognition[] = [];
  private chapters: ProgressState['chapters'] = {};

  get rank(): SettlementRank { return this.current; }

  reached(rank: SettlementRank): boolean {
    return settlementRanks.indexOf(rank) <= settlementRanks.indexOf(this.current);
  }

  private lockReason(rank: SettlementRank | undefined): string | null {
    return rank && !this.reached(rank) ? 'Requiere rango de ' + rankRules[rank].name : null;
  }

  buildingLock(type: ConstructionType): string | null {
    return this.lockReason(settlementRanks.find(rank => rankRules[rank].buildings.includes(type)));
  }

  roadLock(level: RoadLevel): string | null {
    return this.lockReason(settlementRanks.find(rank => rankRules[rank].roadLevel >= level));
  }

  next(stats: SettlementStats) {
    const rank = settlementRanks[settlementRanks.indexOf(this.current) + 1] as PromotionRank | undefined;
    if (!rank) return null;
    const rules = rankRules[rank];
    const goals = (Object.keys(objectives) as (keyof SettlementStats)[]).map(key => ({
      label: objectives[key], current: stats[key], minimum: rules.minimum[key], complete: stats[key] >= rules.minimum[key],
    }));
    return { rank, rules, goals, ready: goals.every(goal => goal.complete) };
  }

  recognize(rank: SettlementRank, stats: SettlementStats, timeMs: number, pay: (gold: number) => boolean): boolean {
    const next = this.next(stats);
    if (!next?.ready || next.rank !== rank || !pay(next.rules.minimum.gold)) return false;
    this.current = rank;
    this.recognitions.push({ rank: next.rank, timeMs });
    return true;
  }

  recognitionAt(rank: SettlementRank): number | undefined {
    return this.recognitions.find(event => event.rank === rank)?.timeMs;
  }

  chapter(rank: SettlementRank): ChapterRecord { return this.chapters[rank] ?? {}; }

  markChapter(rank: SettlementRank, track: keyof ChapterRecord, status: ChapterStatus): void {
    if (!this.reached(rank)) return;
    const chapter = this.chapter(rank);
    if (chapter[track] === 'seen') return;
    this.chapters[rank] = { ...chapter, [track]: status };
  }

  saveState(): ProgressState {
    return { rank: this.current, recognitions: [...this.recognitions], chapters: { ...this.chapters } };
  }

  restoreState(state: ProgressState | undefined, timeMs: number): void {
    if (state === undefined) return;
    const { rank, recognitions, chapters } = state;
    const index = settlementRanks.indexOf(rank);
    check(index >= 0 && Array.isArray(recognitions) && recognitions.length === index);
    let previousTime = 0;
    for (const [step, event] of recognitions.entries()) {
      check(event.rank === settlementRanks[step + 1] && whole(event.timeMs, previousTime, timeMs));
      previousTime = event.timeMs;
    }
    check(chapters && typeof chapters === 'object' && !Array.isArray(chapters));
    for (const [key, record] of Object.entries(chapters)) {
      check(settlementRanks.slice(0, index + 1).some(rank => rank === key) && record && typeof record === 'object'
        && !Array.isArray(record) && Object.entries(record).every(([track, status]) =>
          (track === 'story' || track === 'tutorial') && (status === 'seen' || status === 'skipped')));
    }
    this.current = rank;
    this.recognitions = recognitions.map(event => ({ ...event }));
    this.chapters = { ...chapters };
  }
}
