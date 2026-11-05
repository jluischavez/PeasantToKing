import { gameTimeRules } from '../simulation/GameTime.ts';
import type { Cell } from '../map/CellSelection';
import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';

export const populationRules = {
  residentsPerPlot: 4,
  familySize: 2,
  immigrationIntervalSeconds: 5,
  foodPerResidentPerSecond: 0.1,
  laborParticipationRate: 0.5,
  migration: {
    wellbeingWeight: 35,
    neutralHappiness: 70,
    minimumWaitingCapacity: 4,
    waitingPerResident: 0.5,
    patienceHours: 1,
    foodWeight: 40,
    jobsWeight: 25,
    stopUnemploymentRate: 0.6,
  },
} as const;

export const employmentRules = {
  minimumServices: ['market', 'warehouse', 'farm', 'well'],
  productionRecoveryServices: ['farm', 'warehouse', 'market', 'well'],
  singleWorkerRecoveryServices: ['warehouse', 'market', 'farm', 'well'],
  fillPriority: { farm: 0, warehouse: 1, market: 2, well: 3, lumberjack: 10, house: 20, road: 20, villageCenter: 20 },
} as const;

type MigrationConditions = {
  modifier?: number;
  happiness?: number;
  seconds?: number;
  admissionsOpen?: boolean;
};

export type LaborContext = {
  produceFoodFirst?: boolean;
  essentialEligible?: (cell: Cell, type: ConstructionType) => boolean;
  marketCoverage?: (cell: Cell) => readonly string[];
};

const jobsByType: Record<ConstructionType, number> = {
  house: 0, road: 0, villageCenter: 0,
  farm: 4, lumberjack: 3, market: 3, warehouse: 2, well: 1,
};

type Residence = { cell: Cell; residents: number; connected: boolean };
type Workplace = { cell: Cell; type: ConstructionType; capacity: number; workers: number };
const key = (cell: Cell): string => `${cell.column},${cell.row}`;

export class Population {
  private residences = new Map<string, Residence>();
  private workplaces = new Map<string, Workplace>();
  private migrationCredit = 0;
  private waiting = 0;
  private unattractiveSeconds = 0;
  private laborContext: LaborContext = {};

  get residencesSnapshot(): readonly { cell: Cell; residents: number }[] {
    return [...this.residences.values()].map(home => ({
      cell: { ...home.cell }, residents: home.residents,
    }));
  }

  get total(): number {
    return [...this.residences.values()].reduce((sum, plot) => sum + plot.residents, 0);
  }

  // Simplified participation rule, independent of residential capacity or jobs.
  get activePopulation(): number {
    return Math.floor(this.total * populationRules.laborParticipationRate);
  }

  get unemploymentRate(): number {
    return this.activePopulation === 0 ? 0 : this.unemployed / this.activePopulation;
  }

  get waitingCapacity(): number {
    const rules = populationRules.migration;
    return Math.max(rules.minimumWaitingCapacity, Math.ceil(this.total * rules.waitingPerResident));
  }

  get waitingImmigrants(): number { return this.waiting; }

  get availableHousing(): number {
    return [...this.residences.values()]
      .filter(plot => plot.connected)
      .reduce((sum, plot) => sum + populationRules.residentsPerPlot - plot.residents, 0);
  }

  get residentialCapacity(): number {
    return this.residences.size * populationRules.residentsPerPlot;
  }

  get connectedCapacity(): number {
    return [...this.residences.values()].filter(plot => plot.connected).length
      * populationRules.residentsPerPlot;
  }

  get jobCapacity(): number {
    return [...this.workplaces.values()].reduce((sum, workplace) => sum + workplace.capacity, 0);
  }

  get employed(): number {
    return [...this.workplaces.values()].reduce((sum, workplace) => sum + workplace.workers, 0);
  }

  get unemployed(): number {
    return this.activePopulation - this.employed;
  }

  get availableJobs(): number {
    return this.jobCapacity - this.employed;
  }

  get foodConsumptionPerSecond(): number {
    return Math.round(this.total * populationRules.foodPerResidentPerSecond * 10) / 10;
  }

  residentsAt(cell: Cell): number {
    return this.residences.get(key(cell))?.residents ?? 0;
  }

  capacityFor(type: ConstructionType): number {
    return jobsByType[type];
  }

  workersAt(cell: Cell): number {
    return this.workplaces.get(key(cell))?.workers ?? 0;
  }

  recalculate(map: ConstructionMap, connections: RoadConnections, context: LaborContext = {}): void {
    this.laborContext = context;
    const residences = new Map<string, Residence>();
    const workplaces = new Map<string, Workplace>();
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const cell = { column, row };
        const type = map.getConstruction(cell);
        if (!type) continue;
        const connected = connections.isConnected(cell);
        if (type === 'house') {
          residences.set(key(cell), {
            cell, connected, residents: this.residentsAt(cell),
          });
        }
        if (connected && jobsByType[type] > 0) {
          workplaces.set(key(cell), { cell, type, capacity: jobsByType[type], workers: 0 });
        }
      }
    }
    this.residences = residences;
    this.waiting = Math.min(this.waiting, this.waitingCapacity);
    this.workplaces = workplaces;
    this.assignWorkers();
  }

  private foodSupportedArrivals(food: number): number {
    if (!Number.isFinite(food) || food <= 0) return 0;
    const foodPerResident = populationRules.foodPerResidentPerSecond
      * populationRules.immigrationIntervalSeconds;
    return Math.max(0, Math.floor(food / foodPerResident) - this.total);
  }

  migrationAttractiveness(food: number, modifier = 0, happiness: number = populationRules.migration.neutralHappiness): number {
    const supported = this.foodSupportedArrivals(food);
    const rules = populationRules.migration;
    if (supported === 0 || this.unemploymentRate >= rules.stopUnemploymentRate) return 0;
    const foodAvailability = Math.min(1, supported / populationRules.familySize);
    const opportunities = Math.min(1, this.availableJobs / Math.max(1, this.activePopulation));
    const employmentFactor = 1 - this.unemploymentRate / rules.stopUnemploymentRate;
    const wellbeing = happiness / rules.neutralHappiness;
    const weights = rules.wellbeingWeight + rules.foodWeight + rules.jobsWeight;
    const base = (rules.wellbeingWeight * wellbeing + rules.foodWeight * foodAvailability
      + rules.jobsWeight * opportunities) / weights;
    return Math.max(0, Math.min(100, Math.round(100 * base * employmentFactor) + modifier));
  }

  immigrate(food: number, supply?: ReadonlyMap<string, number>, conditions: MigrationConditions = {}): number {
    const attractiveness = this.migrationAttractiveness(food, conditions.modifier, conditions.happiness);
    if (attractiveness === 0) {
      this.migrationCredit = 0;
      const patience = populationRules.migration.patienceHours * gameTimeRules.secondsPerHour;
      this.unattractiveSeconds += conditions.seconds ?? populationRules.immigrationIntervalSeconds;
      const departures = Math.floor(this.unattractiveSeconds / patience);
      this.waiting = Math.max(0, this.waiting - departures);
      this.unattractiveSeconds %= patience;
      return 0;
    }
    this.unattractiveSeconds = 0;

    // Existing candidates have priority when a place opens.
    if (this.waiting > 0 && conditions.admissionsOpen !== false) {
      const admitted = this.admit(food, supply);
      if (admitted > 0) return admitted;
    }

    this.migrationCredit += populationRules.familySize * attractiveness;
    const interested = Math.floor(this.migrationCredit / 100);
    this.waiting = Math.min(this.waitingCapacity, this.waiting + interested);
    this.migrationCredit %= 100;
    return conditions.admissionsOpen !== false ? this.admit(food, supply) : 0;
  }

  private admit(food: number, supply?: ReadonlyMap<string, number>): number {
    let remaining = Math.min(this.waiting, populationRules.familySize,
      supply ? [...supply.values()].reduce((sum, count) => sum + count, 0)
        : this.foodSupportedArrivals(food), this.availableHousing);
    if (remaining <= 0) return 0;
    const plots = [...this.residences.values()]
      .filter(plot => plot.connected && plot.residents < populationRules.residentsPerPlot
        && (!supply || (supply.get(key(plot.cell)) ?? 0) > 0))
      .sort((a, b) => a.residents - b.residents);
    let arrived = 0;
    for (const plot of plots) {
      const count = Math.min(remaining, populationRules.residentsPerPlot - plot.residents,
        supply?.get(key(plot.cell)) ?? populationRules.familySize);
      plot.residents += count;
      remaining -= count;
      arrived += count;
      if (remaining === 0) break;
    }
    this.waiting -= arrived;
    this.assignWorkers();
    return arrived;
  }

  removeResident(cell: Cell): boolean {
    const home = this.residences.get(key(cell));
    if (!home || home.residents === 0) return false;
    home.residents--;
    this.waiting = Math.min(this.waiting, this.waitingCapacity);
    this.assignWorkers();
    return true;
  }

  private assignWorkers(): void {
    let available = this.activePopulation;
    const workplaces = [...this.workplaces.values()];
    for (const workplace of workplaces) workplace.workers = 0;
    const eligible = (workplace: Workplace) =>
      this.laborContext.essentialEligible?.(workplace.cell, workplace.type) ?? true;
    const order = available < 2 ? employmentRules.singleWorkerRecoveryServices
      : this.laborContext.produceFoodFirst ? employmentRules.productionRecoveryServices
      : employmentRules.minimumServices;
    // One worker per essential TYPE before second buildings or extra posts.
    // Equal candidates use stable row/column order, with authorized food services first.
    for (const type of order) {
      const workplace = workplaces.find(entry => entry.type === type && eligible(entry));
      if (available > 0 && workplace) {
        workplace.workers = 1;
        available--;
      }
    }
    // An extra market gets a minimum worker only if it reaches inhabitants
    // not covered by an already staffed market; redundant markets wait.
    const covered = new Set(workplaces.filter(entry => entry.type === 'market' && entry.workers > 0)
      .flatMap(entry => [...(this.laborContext.marketCoverage?.(entry.cell) ?? [])]));
    for (const workplace of workplaces) {
      const homes = this.laborContext.marketCoverage?.(workplace.cell) ?? [];
      if (available > 0 && workplace.type === 'market' && workplace.workers === 0
        && eligible(workplace) && homes.some(home => !covered.has(home))) {
        workplace.workers = 1;
        available--;
        for (const home of homes) covered.add(home);
      }
    }
    // Fill food production first; secondary services precede normal lumber jobs.
    workplaces.sort((a, b) => employmentRules.fillPriority[a.type] - employmentRules.fillPriority[b.type]
      || a.cell.row - b.cell.row || a.cell.column - b.cell.column);
    for (const workplace of workplaces) {
      const assigned = Math.min(available, workplace.capacity - workplace.workers);
      workplace.workers += assigned;
      available -= assigned;
    }
  }
}
