import type { Cell } from '../map/CellSelection';
import { gameTimeRules } from '../simulation/GameTime.ts';

export const needIds = ['food', 'water', 'wood'] as const;
export type Need = typeof needIds[number];
export type NeedCoverage = Readonly<Record<Need, number>>;
export type Household = Readonly<{ cell: Cell; residents: number }>;
export type NeedsObservation = Household & Readonly<{ coverage: NeedCoverage; current: NeedCoverage; seconds: number }>;
type Samples = { residents: number; values: NeedCoverage[] };
const key = (cell: Cell) => cell.column + ',' + cell.row;

export class HouseholdNeeds {
  private readonly samples = new Map<string, Samples>();

  recordSecond(homes: readonly Household[], coverage: (home: Household) => NeedCoverage): void {
    const occupied = new Set<string>();
    for (const home of homes) {
      if (home.residents === 0) continue;
      const id = key(home.cell);
      occupied.add(id);
      let samples = this.samples.get(id);
      if (!samples || samples.residents !== home.residents) {
        samples = { residents: home.residents, values: [] };
        this.samples.set(id, samples);
      }
      samples.values.push(coverage(home));
      if (samples.values.length > gameTimeRules.secondsPerHour) samples.values.shift();
    }
    for (const id of this.samples.keys()) if (!occupied.has(id)) this.samples.delete(id);
  }

  forget(cell: Cell): void { this.samples.delete(key(cell)); }

  currentAt(cell: Cell): NeedCoverage | undefined { return this.samples.get(key(cell))?.values.at(-1); }

  observations(homes: readonly Household[]): NeedsObservation[] {
    return homes.flatMap(home => {
      const samples = this.samples.get(key(home.cell));
      if (!samples || samples.residents !== home.residents) return [];
      const coverage = { food: 0, wood: 0, water: 0 };
      for (const value of samples.values) for (const need of needIds) coverage[need] += value[need];
      for (const need of needIds) coverage[need] /= samples.values.length;
      return [{ ...home, coverage, current: samples.values.at(-1)!, seconds: samples.values.length }];
    });
  }

  summarize(homes: readonly Household[]) {
    const observed = this.observations(homes);
    const measured = observed.reduce((total, home) => total + home.residents, 0);
    const supplied = { food: 0, wood: 0, water: 0 };
    for (const home of observed) {
      for (const need of needIds) supplied[need] += home.coverage[need] * home.residents;
    }
    const mainNeed = needIds.reduce((lowest, need) => supplied[need] < supplied[lowest] ? need : lowest);
    const affected = Math.max(0, Math.ceil(measured - supplied[mainNeed] - 1e-9));
    return {
      percentages: measured > 0 ? {
        food: 100 * supplied.food / measured, wood: 100 * supplied.wood / measured, water: 100 * supplied.water / measured,
      } : null,
      mainNeed: affected > 0 ? mainNeed : null,
      affected,
    };
  }
}
