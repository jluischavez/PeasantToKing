import type { ConstructionMap } from '../map/ConstructionMap';
import { restoreEntries, whole } from '../persistence/validation.ts';
import type { Cell } from '../map/CellSelection';
import type { NeedCoverage } from './HouseholdNeeds';
import { beautyRules } from './ResidentialBeauty.ts';

export const housingLevels = {
  1: { name: 'Choza', capacity: 4 },
  2: { name: 'Casa de madera', capacity: 6 },
  3: { name: 'Casa de piedra', capacity: 8 },
  4: { name: 'Residencia próspera', capacity: 12 },
} as const;

export type HousingLevel = keyof typeof housingLevels;
export const housingRules = {
  seconds: 60,
  upgradeHappiness: 80,
  deteriorationHappiness: 40,
  maximumUnemployment: 0.25,
  minimumBeauty: { 1: 0, 2: 0, 3: 35, 4: 65 },
} as const;
export function nextHousingBeauty(level: HousingLevel): number | undefined {
  return level < 4 ? housingRules.minimumBeauty[(level + 1) as HousingLevel] : undefined;
}
type Progress = { improvement: number; deterioration: number };
const key = (cell: Cell) => cell.column + ',' + cell.row;

export class HousingEvolution {
  private readonly progress = new Map<string, Progress>();
  private changes = 0;

  saveState() { return [...this.progress]; }

  restoreState(state: ReturnType<HousingEvolution['saveState']>, map: ConstructionMap): void {
    restoreEntries(this.progress, state, map.rows * map.columns, (id, progress) => {
      const cell = map.cellAtKey(id);
      return !!cell && map.getConstruction(cell) === 'house'
        && whole(progress.improvement, 0, housingRules.seconds - 1)
        && whole(progress.deterioration, 0, housingRules.seconds - 1)
        && (progress.improvement === 0) !== (progress.deterioration === 0);
    });
  }

  get revision(): number { return this.changes; }
  at(cell: Cell): Readonly<Progress> {
    return this.progress.get(key(cell)) ?? { improvement: 0, deterioration: 0 };
  }

  forget(cell: Cell): void { this.progress.delete(key(cell)); }

  advanceSecond(cell: Cell, level: HousingLevel, happiness: number, supply: NeedCoverage,
    unemployment: number, beauty: number = beautyRules.base): HousingLevel | undefined {
    const adequatelySupplied = supply.food >= 1 && supply.wood >= 1 && supply.water >= 1;
    const nextBeauty = nextHousingBeauty(level);
    const improves = nextBeauty !== undefined && beauty >= nextBeauty && happiness >= housingRules.upgradeHappiness
      && adequatelySupplied && unemployment <= housingRules.maximumUnemployment;
    const deteriorates = level > 1 && (happiness < housingRules.deteriorationHappiness || !adequatelySupplied
      || beauty < housingRules.minimumBeauty[level]);
    const previous = this.at(cell);
    const improvement = improves ? previous.improvement + 1 : 0;
    const deterioration = deteriorates ? previous.deterioration + 1 : 0;

    if (improvement >= housingRules.seconds || deterioration >= housingRules.seconds) {
      this.forget(cell);
      this.changes++;
      return (level + (improves ? 1 : -1)) as HousingLevel;
    }
    if (improvement > 0 || deterioration > 0) this.progress.set(key(cell), { improvement, deterioration });
    else this.forget(cell);
    return undefined;
  }
}
