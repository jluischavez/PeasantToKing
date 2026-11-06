import { check, list, restoreEntries, whole } from '../persistence/validation.ts';
import { gameTimeRules } from '../simulation/GameTime.ts';
import { housingLevels } from './HousingEvolution.ts';
import type { HousingLevel } from './HousingEvolution';
import type { Cell } from '../map/CellSelection';
import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';

export const populationRules = {
  residentsPerPlot: housingLevels[1].capacity,
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
  fillPriority: { farm: 0, warehouse: 1, market: 2, well: 3, lumberjack: 10, house: 20, road: 20, bridge: 20,
    villageCenter: 20, garden: 20, park: 20, plaza: 20 },
} as const;

type MigrationConditions = {
  modifier?: number;
  happiness?: number;
  seconds?: number;
  admissionsOpen?: boolean;
};

export type LaborContext = {
  produceFoodFirst?: boolean;
  unavailable?: (cell: Cell, type: ConstructionType) => boolean;
  essentialEligible?: (cell: Cell, type: ConstructionType) => boolean;
  marketCoverage?: (cell: Cell) => readonly string[];
};

const jobsByType: Record<ConstructionType, number> = {
  house: 0, road: 0, bridge: 0, villageCenter: 0,
  garden: 0, park: 0, plaza: 0,
  farm: 4, lumberjack: 3, market: 3, warehouse: 2, well: 1,
};

type Residence = { cell: Cell; residents: number; connected: boolean; level: HousingLevel };
type Workplace = { cell: Cell; type: ConstructionType; capacity: number; workers: number; eligible: boolean };
const key = (cell: Cell): string => `${cell.column},${cell.row}`;

export class Population {
  private residences = new Map<string, Residence>();
  private workplaces = new Map<string, Workplace>();
  private migrationCredit = 0;
  private waiting = 0;
  private unattractiveSeconds = 0;
  private laborContext: LaborContext = {};

  saveState() {
    return { residences: [...this.residences.values()].map(({ cell, residents, level }) => ({ cell: { ...cell }, residents, level })),
      workers: [...this.workplaces].map(([id, workplace]) => [id, workplace.workers] as const),
      migrationCredit: this.migrationCredit, waiting: this.waiting, unattractiveSeconds: this.unattractiveSeconds };
  }

  restoreState(state: ReturnType<Population['saveState']>): void {
    const { residences, workers, migrationCredit, waiting, unattractiveSeconds } = state;
    list(residences, this.residences.size);
    check(residences.length === this.residences.size && whole(unattractiveSeconds) && whole(migrationCredit, 0, 99));
    const seen = new Set<string>();
    for (const { cell, residents, level } of residences) {
      const id = key(cell);
      const home = this.residences.get(id);
      check(home && !seen.has(id) && whole(cell.column) && whole(cell.row)
        && whole(level, 1, 4) && whole(residents, 0, housingLevels[level].capacity));
      seen.add(id);
      home.residents = residents;
      home.level = level;
    }
    check(whole(waiting, 0, this.waitingCapacity));
    this.waiting = waiting;
    this.migrationCredit = migrationCredit;
    this.unattractiveSeconds = unattractiveSeconds;
    const assignments = new Map<string, number>();
    restoreEntries(assignments, workers, this.workplaces.size, (id, count) => {
      const workplace = this.workplaces.get(id);
      return workplace !== undefined && whole(count, 0, workplace.capacity);
    });
    check(assignments.size === this.workplaces.size);
    for (const [id, count] of assignments) this.workplaces.get(id)!.workers = count;
    check(this.employed <= this.activePopulation);
  }

  get residencesSnapshot(): readonly { cell: Cell; residents: number; capacity: number; level: HousingLevel }[] {
    return [...this.residences.values()].map(home => ({
      cell: { ...home.cell }, residents: home.residents, capacity: housingLevels[home.level].capacity, level: home.level,
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
      .reduce((sum, plot) => sum + housingLevels[plot.level].capacity - plot.residents, 0);
  }

  get residentialCapacity(): number {
    return [...this.residences.values()].reduce((sum, plot) => sum + housingLevels[plot.level].capacity, 0);
  }

  get connectedCapacity(): number {
    return [...this.residences.values()].filter(plot => plot.connected)
      .reduce((sum, plot) => sum + housingLevels[plot.level].capacity, 0);
  }

  get jobCapacity(): number {
    return [...this.workplaces.values()].reduce((sum, workplace) => sum + (workplace.eligible ? workplace.capacity : 0), 0);
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

  housingLevelAt(cell: Cell): HousingLevel { return this.residences.get(key(cell))?.level ?? 1; }

  setHousingLevel(cell: Cell, level: HousingLevel): number {
    const home = this.residences.get(key(cell));
    if (!home) return 0;
    home.level = level;
    const displaced = Math.max(0, home.residents - housingLevels[level].capacity);
    if (displaced > 0) {
      home.residents -= displaced;
      this.waiting = Math.min(this.waiting, this.waitingCapacity);
      this.assignWorkers();
    }
    return displaced;
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
    for (const { cell, type } of map.occupiedCells()) {
      const connected = connections.isConnected(cell);
      if (type === 'house') {
        residences.set(key(cell), {
          cell, connected, residents: this.residentsAt(cell), level: this.housingLevelAt(cell),
        });
      }
      if (connected && jobsByType[type] > 0) {
        const previous = this.workplaces.get(key(cell));
        const workers = previous?.type === type ? previous.workers : 0;
        workplaces.set(key(cell), { cell, type, capacity: jobsByType[type], workers, eligible: true });
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
      .filter(plot => plot.connected && plot.residents < housingLevels[plot.level].capacity
        && (!supply || (supply.get(key(plot.cell)) ?? 0) > 0))
      .sort((a, b) => a.residents - b.residents);
    let arrived = 0;
    for (const plot of plots) {
      const count = Math.min(remaining, housingLevels[plot.level].capacity - plot.residents,
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
    const active = this.activePopulation;
    let available = active;
    const workplaces = [...this.workplaces.values()];
    for (const workplace of workplaces) {
      workplace.eligible = !this.laborContext.unavailable?.(workplace.cell, workplace.type);
      if (!workplace.eligible) workplace.workers = 0;
    }
    const eligible = workplaces.filter(workplace => workplace.eligible);
    const priority = [...eligible].sort((a, b) => employmentRules.fillPriority[a.type] - employmentRules.fillPriority[b.type]
      || a.cell.row - b.cell.row || a.cell.column - b.cell.column);
    const essential = (workplace: Workplace) =>
      this.laborContext.essentialEligible?.(workplace.cell, workplace.type) ?? true;
    const firstPosts = new Set<Workplace>();
    const cover = (workplace: Workplace) => {
      if (available > 0 && !firstPosts.has(workplace)) {
        firstPosts.add(workplace);
        available--;
      }
    };
    const order = available < 2 ? employmentRules.singleWorkerRecoveryServices
      : this.laborContext.produceFoodFirst ? employmentRules.productionRecoveryServices
      : employmentRules.minimumServices;
    // Preserve the recovery order and prefer incumbents among equally useful services.
    for (const type of order) {
      if (available === 0) break;
      const candidates = eligible.filter(entry => entry.type === type && essential(entry));
      const workplace = candidates.find(entry => entry.workers > 0) ?? candidates[0];
      if (workplace) cover(workplace);
    }
    // An extra market gets a minimum worker only if it reaches inhabitants
    // not covered by an already staffed market; redundant markets wait.
    const covered = new Set([...firstPosts].filter(entry => entry.type === 'market')
      .flatMap(entry => [...(this.laborContext.marketCoverage?.(entry.cell) ?? [])]));
    const markets = eligible.filter(workplace => workplace.type === 'market')
      .sort((a, b) => Number(b.workers > 0) - Number(a.workers > 0));
    for (const workplace of markets) {
      if (available === 0) break;
      if (firstPosts.has(workplace) || !essential(workplace)) continue;
      const homes = this.laborContext.marketCoverage?.(workplace.cell) ?? [];
      if (homes.some(home => !covered.has(home))) {
        cover(workplace);
        for (const home of homes) covered.add(home);
      }
    }
    // Keep existing first posts where possible, then cover empty workplaces before filling extras.
    for (const workplace of priority) if (workplace.workers > 0) cover(workplace);
    for (const workplace of priority) cover(workplace);
    let assigned = 0, highest = 0;
    for (const workplace of eligible) {
      workplace.workers = firstPosts.has(workplace) ? Math.max(1, workplace.workers) : 0;
      assigned += workplace.workers;
      highest = Math.max(highest, workplace.workers);
    }
    // Unemployed residents cover vacancies first. If needed, transfer surplus from the largest rosters.
    const donors = [...priority].reverse();
    for (let staff = highest; staff > 1 && assigned > active; staff--) {
      for (const workplace of donors) {
        if (assigned <= active) break;
        if (workplace.workers !== staff) continue;
        workplace.workers--;
        assigned--;
      }
    }
    available = active - assigned;
    for (const workplace of priority) {
      const assigned = Math.min(available, workplace.capacity - workplace.workers);
      workplace.workers += assigned;
      available -= assigned;
    }
  }
}
