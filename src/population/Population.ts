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
    housingWeight: 35,
    foodWeight: 40,
    jobsWeight: 25,
    stopUnemploymentRate: 0.6,
  },
} as const;

const jobsByType: Record<ConstructionType, number> = {
  house: 0, road: 0, villageCenter: 0,
  farm: 4, lumberjack: 3, market: 3, warehouse: 2,
};

type Residence = { cell: Cell; residents: number; connected: boolean };
type Workplace = { cell: Cell; type: ConstructionType; capacity: number; workers: number };
const key = (cell: Cell): string => `${cell.column},${cell.row}`;

export class Population {
  private residences = new Map<string, Residence>();
  private workplaces = new Map<string, Workplace>();
  private migrationCredit = 0;

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

  recalculate(map: ConstructionMap, connections: RoadConnections): void {
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
    this.workplaces = workplaces;
    this.assignWorkers();
  }

  private foodSupportedArrivals(food: number): number {
    if (!Number.isFinite(food) || food <= 0) return 0;
    const foodPerResident = populationRules.foodPerResidentPerSecond
      * populationRules.immigrationIntervalSeconds;
    return Math.max(0, Math.floor(food / foodPerResident) - this.total);
  }

  // A score from 0 to 100; food and connected housing remain hard requirements.
  migrationAttractiveness(food: number, supply?: ReadonlyMap<string, number>): number {
    const supported = supply ? [...supply.values()].reduce((sum, count) => sum + count, 0)
      : this.foodSupportedArrivals(food);
    if (this.availableHousing === 0 || supported === 0) return 0;
    const rules = populationRules.migration;
    const housing = Math.min(1, this.availableHousing / populationRules.familySize);
    const foodAvailability = Math.min(1, supported / populationRules.familySize);
    const opportunities = Math.min(1, this.availableJobs / Math.max(1, this.activePopulation));
    const employmentFactor = Math.max(0, 1 - this.unemploymentRate / rules.stopUnemploymentRate);
    const weights = rules.housingWeight + rules.foodWeight + rules.jobsWeight;
    const base = (rules.housingWeight * housing + rules.foodWeight * foodAvailability
      + rules.jobsWeight * opportunities) / weights;
    return Math.round(100 * base * employmentFactor);
  }

  // Evaluated once per immigration interval. Fractional credit slows arrivals
  // predictably as attraction falls; no random rolls or accumulating backlog.
  immigrate(food: number, supply?: ReadonlyMap<string, number>): number {
    const attractiveness = this.migrationAttractiveness(food, supply);
    if (attractiveness === 0) {
      this.migrationCredit = 0;
      return 0;
    }
    this.migrationCredit = Math.min(populationRules.familySize,
      this.migrationCredit + populationRules.familySize * attractiveness / 100);
    let remaining = Math.min(Math.floor(this.migrationCredit),
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
    this.migrationCredit -= arrived;
    this.assignWorkers();
    return arrived;
  }

  private assignWorkers(): void {
    let available = this.activePopulation;
    for (const workplace of this.workplaces.values()) workplace.workers = 0;
    // Bootstrap uses one existing worker per link: storage, farm and market.
    // This is the same allocator; no workers are created or counted twice.
    for (const type of ['warehouse', 'farm', 'market'] as const) {
      const workplace = [...this.workplaces.values()].find(entry => entry.type === type);
      if (available > 0 && workplace) {
        workplace.workers = 1;
        available--;
      }
    }
    // Complete food production before secondary posts to avoid a distribution deadlock.
    const farm = [...this.workplaces.values()].find(entry => entry.type === 'farm');
    if (farm) {
      const assigned = Math.min(available, farm.capacity - farm.workers);
      farm.workers += assigned;
      available -= assigned;
    }
    for (const workplace of this.workplaces.values()) {
      const assigned = Math.min(available, workplace.capacity - workplace.workers);
      workplace.workers += assigned;
      available -= assigned;
    }
  }
}
