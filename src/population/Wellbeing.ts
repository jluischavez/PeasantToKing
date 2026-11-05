import type { ConstructionMap } from '../map/ConstructionMap';
import { check, label, list, range, restoreEntries, whole } from '../persistence/validation.ts';
import type { TaxPolicy } from '../economy/TaxPolicy';
import type { Cell } from '../map/CellSelection';
import type { NeedCoverage } from './HouseholdNeeds';
import { gameTimeRules, simulatedMsPerGameHour } from '../simulation/GameTime.ts';
import { populationRules } from './Population.ts';

export const wellbeingRules = {
  weights: { food: 50, wood: 10, water: 10, jobs: 20, taxes: 10 },
  taxSatisfaction: { low: 100, normal: 80, high: 45 },
  lossPerHour: 20,
  recoveryPerHour: 15,
  distressThreshold: 40,
  toleranceHours: 2,
  hoursBetweenDepartures: 1,
  readmissionDelayHours: 2,
  readmissionHappiness: 45,
  eventLimit: 100,
} as const;

type Household = Readonly<{ cell: Cell; residents: number }>;
type HomeState = { happiness: number; distressedSeconds: number; concerns: readonly string[] };
export type CityWellbeing = Readonly<{
  happiness: number;
  state: string;
  satisfied: number;
  dissatisfied: number;
  crisis: number;
  concerns: readonly string[];
}>;
export type EmigrationEvent = Readonly<{ timeMs: number; cell: Readonly<Cell>; residents: number; reason?: 'deterioration' }>;

const key = (cell: Cell) => cell.column + ',' + cell.row;
const initialHappiness = populationRules.migration.neutralHappiness;

export function wellbeingState(happiness: number): string {
  if (happiness >= 80) return 'Muy felices';
  if (happiness >= 60) return 'Satisfechos';
  if (happiness >= 40) return 'Inconformes';
  if (happiness >= 20) return 'Descontentos';
  return 'En crisis';
}

export class Wellbeing {
  private readonly homes = new Map<string, HomeState>();
  private readonly departures: EmigrationEvent[] = [];
  private lastDeparture = -Infinity;

  saveState() {
    return { homes: [...this.homes], departures: [...this.departures],
      lastDeparture: Number.isFinite(this.lastDeparture) ? this.lastDeparture : null };
  }

  restoreState(state: ReturnType<Wellbeing['saveState']>, map: ConstructionMap, time: number): void {
    const { homes, departures, lastDeparture } = state;
    list(departures, wellbeingRules.eventLimit);
    check(lastDeparture === (departures.at(-1)?.timeMs ?? null));
    let previousTime = 0;
    for (const event of departures) {
      check(map.contains(event.cell) && whole(event.timeMs, previousTime, time) && whole(event.residents, 1, 12)
        && (event.reason === undefined || event.reason === 'deterioration'));
      previousTime = event.timeMs;
    }
    restoreEntries(this.homes, homes, map.rows * map.columns, (id, home) => {
      const cell = map.cellAtKey(id);
      list(home.concerns, 5);
      return !!cell && map.getConstruction(cell) === 'house' && range(home.happiness, 0, 100)
        && whole(home.distressedSeconds, 0, time / 1000) && home.concerns.every(label);
    });
    this.departures.splice(0, this.departures.length, ...departures);
    this.lastDeparture = lastDeparture ?? -Infinity;
  }

  get emigrationEvents(): readonly EmigrationEvent[] { return this.departures; }

  at(cell: Cell): Readonly<HomeState> | undefined { return this.homes.get(key(cell)); }

  forget(cell: Cell): void { this.homes.delete(key(cell)); }

  admissionsOpen(timeMs: number, happiness: number): boolean {
    return timeMs - this.lastDeparture >= wellbeingRules.readmissionDelayHours * simulatedMsPerGameHour
      && happiness >= wellbeingRules.readmissionHappiness;
  }

  advanceSecond(households: readonly Household[], coverage: (home: Household) => NeedCoverage,
    unemployment: number, tax: TaxPolicy, timeMs: number): Cell | undefined {
    const occupied = new Set<string>();
    const rules = wellbeingRules;
    const { weights } = rules;
    const jobs = 1 - unemployment;
    let candidate: Cell | undefined;
    let lowest = Infinity;
    for (const home of households) {
      if (home.residents === 0) continue;
      const id = key(home.cell);
      occupied.add(id);
      const state = this.homes.get(id) ?? { happiness: initialHappiness, distressedSeconds: 0, concerns: [] };
      const { food, wood, water } = coverage(home);
      const target = (100 * (weights.food * food + weights.wood * wood + weights.water * water + weights.jobs * jobs)
        + weights.taxes * rules.taxSatisfaction[tax]) / (weights.food + weights.wood + weights.water + weights.jobs + weights.taxes);
      const difference = target - state.happiness;
      const step = (difference < 0 ? rules.lossPerHour : rules.recoveryPerHour) / gameTimeRules.secondsPerHour;
      state.happiness += Math.sign(difference) * Math.min(Math.abs(difference), step);
      state.distressedSeconds = state.happiness < rules.distressThreshold ? state.distressedSeconds + 1 : 0;
      state.concerns = [
        ...(food < 1 ? ['Falta de comida'] : []),
        ...(wood < 1 ? ['Falta de madera'] : []),
        ...(water < 1 ? ['Falta de agua'] : []),
        ...(unemployment > 0 ? ['Desempleo'] : []),
        ...(tax === 'high' ? ['Impuestos altos'] : []),
      ];
      this.homes.set(id, state);
      if (state.distressedSeconds >= rules.toleranceHours * gameTimeRules.secondsPerHour && state.happiness < lowest) {
        candidate = home.cell;
        lowest = state.happiness;
      }
    }
    for (const id of this.homes.keys()) {
      if (!occupied.has(id)) this.homes.delete(id);
    }
    if (timeMs - this.lastDeparture < rules.hoursBetweenDepartures * simulatedMsPerGameHour) return undefined;
    return candidate;
  }

  recordDeparture(timeMs: number, cell: Cell, remaining: number, residents = 1, reason?: 'deterioration'): void {
    this.lastDeparture = timeMs;
    if (remaining === 0) this.forget(cell);
    else this.homes.get(key(cell))!.distressedSeconds = 0;
    this.departures.push({ timeMs, cell: { ...cell }, residents, ...(reason && { reason }) });
    if (this.departures.length > wellbeingRules.eventLimit) this.departures.shift();
  }

  summarize(households: readonly Household[]): CityWellbeing {
    let residents = 0, weighted = 0, satisfied = 0, dissatisfied = 0, crisis = 0;
    const concerns = new Map<string, number>();
    for (const home of households) {
      if (home.residents === 0) continue;
      const state = this.at(home.cell);
      const happiness = state?.happiness ?? initialHappiness;
      residents += home.residents;
      weighted += home.residents * happiness;
      if (happiness >= 60) satisfied++;
      else if (happiness < 20) crisis++;
      else dissatisfied++;
      for (const concern of state?.concerns ?? []) {
        concerns.set(concern, (concerns.get(concern) ?? 0) + home.residents);
      }
    }
    const happiness = residents > 0 ? weighted / residents : initialHappiness;
    const mainConcerns = [...concerns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cause]) => cause);
    return { happiness, state: residents > 0 ? wellbeingState(happiness) : 'Neutral · sin habitantes',
      satisfied, dissatisfied, crisis, concerns: mainConcerns };
  }
}
