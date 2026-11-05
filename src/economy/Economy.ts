import { populationRules } from '../population/Population.ts';
import type { LaborContext } from '../population/Population';
import { productNames } from './Products.ts';
import type { ProductId } from './Products';
import { Distribution } from './Distribution.ts';
import { Storage } from './Storage.ts';
import { unitsPerResource } from './Inventories.ts';
import type { StoredResource } from './Inventories';
import type { Cell } from '../map/CellSelection';
import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { Population } from '../population/Population';

export const resourceNames = { gold: 'Oro', ...productNames } as const;
export type Resource = keyof typeof resourceNames;
export type Resources = Record<Resource, number>;

export const economyRules = {
  initialResources: { gold: 0, food: 20, wood: 0 },
  recovery: { populationLimit: 12, arrivalsPerEvaluation: 1 },
} as const;

// 1/30 represents halves, thirds and consumption in tenths exactly.
// Public amounts use resource units; internal balances are never rounded per tick.

const productionByType: Record<ConstructionType, Readonly<Resources>> = {
  house: { gold: 0, food: 0, wood: 0 },
  road: { gold: 0, food: 0, wood: 0 },
  farm: { gold: 0, food: 2, wood: 0 },
  lumberjack: { gold: 0, food: 0, wood: 2 },
  warehouse: { gold: 0, food: 0, wood: 0 },
  market: { gold: 0, food: 0, wood: 0 },
  villageCenter: { gold: 0, food: 0, wood: 0 },
};

export type BuildingProductivity = Readonly<{ workers: number; capacity: number; ratio: number; storageBlocked: boolean }>;
type Workforce = Pick<Population, 'workersAt' | 'capacityFor'>;
const key = (cell: Cell): string => `${cell.column},${cell.row}`;
const asResources = (units: Resources): Resources => ({
  gold: units.gold / unitsPerResource,
  food: units.food / unitsPerResource,
  wood: units.wood / unitsPerResource,
});

export class Economy {
  private goldUnits: number;
  readonly storage: Storage;
  readonly distribution: Distribution;
  private context: { map: ConstructionMap; connections: RoadConnections; workforce: Workforce } | null = null;
  private batches: { cell: Cell; resource: StoredResource; units: number }[] = [];
  private productionUnits: Resources = { gold: 0, food: 0, wood: 0 };
  private readonly buildings = new Map<string, BuildingProductivity>();
  private elapsedMs = 0;

  // Called once for a new settlement. Recalculation and UI never grant resources.
  constructor(initial: Readonly<Resources> = economyRules.initialResources) {
    this.goldUnits = Math.round(initial.gold * unitsPerResource);
    this.storage = new Storage({
      food: Math.round(initial.food * unitsPerResource),
      wood: Math.round(initial.wood * unitsPerResource),
    });
    this.distribution = new Distribution(this.storage);
  }

  get resources(): Readonly<Resources> {
    const goods = this.storage.totalsUnits;
    goods.food += this.distribution.totalMarketFoodUnits;
    return asResources({ gold: this.goldUnits, food: goods.food, wood: goods.wood });
  }

  get availableFood(): number {
    return this.distribution.availableFood;
  }

  get blockedProducers(): number {
    return [...this.buildings.values()].filter(building => building.storageBlocked).length;
  }

  get perSecond(): Readonly<Resources> {
    return { ...asResources(this.productionUnits), gold: this.distribution.salesPerSecond };
  }

  productivityAt(cell: Cell): BuildingProductivity | undefined {
    return this.buildings.get(key(cell));
  }

  // The existing Population model is the sole source of workers and capacities.
  recalculate(map: ConstructionMap, connections: RoadConnections, workforce: Workforce): void {
    this.context = { map, connections, workforce };
    this.storage.sync(map, connections, workforce);
    this.distribution.sync(map, connections, workforce);
    const spaces = this.storage.availableSpaces();
    this.batches = [];
    const total: Resources = { gold: 0, food: 0, wood: 0 };
    this.buildings.clear();
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const cell = { column, row };
        const type = map.getConstruction(cell);
        if (!type) continue;
        const maximum = productionByType[type];
        if (maximum.gold + maximum.food + maximum.wood === 0) continue;
        const capacity = workforce.capacityFor(type);
        const workers = connections.isConnected(cell)
          ? Math.min(capacity, Math.max(0, workforce.workersAt(cell))) : 0;
        const laborRatio = capacity > 0 ? workers / capacity : 0;
        const food = Math.round(maximum.food * unitsPerResource * laborRatio);
        const wood = Math.round(maximum.wood * unitsPerResource * laborRatio);
        const resource = food > 0 ? 'food' : 'wood';
        const quantity = food + wood;
        const storageBlocked = quantity > 0 && !this.storage.planProduction(cell, quantity, spaces);
        const ratio = storageBlocked ? 0 : laborRatio;
        this.buildings.set(key(cell), { workers, capacity, ratio, storageBlocked });
        total.gold += Math.round(maximum.gold * unitsPerResource * ratio);
        if (!storageBlocked && quantity > 0) {
          total.food += food;
          total.wood += wood;
          this.batches.push({ cell, resource, units: quantity });
        }
      }
    }
    this.productionUnits = total;
  }

  consumeHomes(population: Pick<Population, 'residencesSnapshot'>, foodPerResident: number): void {
    // Provisional revenue: one gold per resource unit delivered by a market.
    // No revenue from replenishment, reserve consumption or unsatisfied demand.
    this.goldUnits += this.distribution.consumeHomes(population.residencesSnapshot, foodPerResident);
    this.refresh();
  }

  immigrationSupply(population: Pick<Population, 'residencesSnapshot'>, maxResidents: number, seconds: number,
    foodPerResident: number, residentialCapacity: number): ReadonlyMap<string, number> {
    const homes = population.residencesSnapshot;
    const normal = this.distribution.immigrationPlan(homes, maxResidents,
      seconds, foodPerResident, residentialCapacity);
    if (normal.size > 0) return normal;
    const total = homes.reduce((sum, home) => sum + home.residents, 0);
    // Limited recruitment can use real logistics stocks as evidence of near-term
    // supply; it never consumes warehouse food directly or manufactures resources.
    // Existing consumption remains market-only, so shortage still has consequences.
    const logisticsFood = this.storage.connectedWarehouseFood(true) + this.distribution.availableFood;
    if (total >= economyRules.recovery.populationLimit || logisticsFood < seconds * foodPerResident) return normal;
    const candidate = [...homes].sort((a, b) => a.residents - b.residents)
      .find(home => home.residents < residentialCapacity && this.distribution.hasAuthorizedCoverage(home.cell));
    return candidate ? new Map([[key(candidate.cell),
      Math.min(maxResidents, economyRules.recovery.arrivalsPerEvaluation, residentialCapacity - candidate.residents)]]) : normal;
  }

  laborContext(population: Pick<Population, 'total' | 'activePopulation' | 'residencesSnapshot'>): LaborContext {
    const food = this.storage.connectedWarehouseFood(false) + this.distribution.availableFood;
    const buffer = (population.total + 1) * populationRules.foodPerResidentPerSecond * populationRules.immigrationIntervalSeconds;
    return {
      produceFoodFirst: population.activePopulation < 3 && food < buffer,
      marketCoverage: cell => this.distribution.inhabitedCoverage(cell, population.residencesSnapshot),
      essentialEligible: (cell, type) => {
        if (type === 'market') return this.distribution.essentialMarket(cell, population.residencesSnapshot);
        if (type === 'warehouse') return this.storage.essentialWarehouse(cell);
        return true;
      },
    };
  }

  migrationReason(population: Population, supply: ReadonlyMap<string, number>): string {
    const blocked = population.migrationBlockReason(this.availableFood, supply);
    if (blocked && supply.size === 0 && population.availableHousing > 0
      && population.unemploymentRate < populationRules.migration.stopUnemploymentRate) {
      return this.distribution.supplyBlockReason(population.residencesSnapshot);
    }
    if (blocked) return blocked;
    const normal = this.distribution.immigrationPlan(population.residencesSnapshot, populationRules.familySize,
      populationRules.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond, populationRules.residentsPerPlot);
    return normal.size === 0 ? 'Recuperación limitada: hasta 1 habitante por evaluación con alimentos reales.'
      : 'Suministro previsto suficiente para inmigración.';
  }
  setWarehouseAcceptance(cell: Cell, product: ProductId, enabled: boolean): boolean {
    const changed = this.storage.setAcceptance(cell, product, enabled);
    if (changed) this.refresh();
    return changed;
  }

  setMarketSale(cell: Cell, product: ProductId, enabled: boolean): boolean {
    const changed = this.distribution.setSale(cell, product, enabled);
    if (changed) this.refresh();
    return changed;
  }

  private refresh(): void {
    if (this.context) {
      const { map, connections, workforce } = this.context;
      this.recalculate(map, connections, workforce);
    }
  }

  consumeFood(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    const fed = amount === 0 || (this.distribution.bootstrapActive
      && this.storage.consumeFood(Math.round(amount * unitsPerResource)));
    this.refresh();
    return fed;
  }

  advance(deltaMs: number): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    this.elapsedMs += deltaMs;
    const seconds = Math.floor(this.elapsedMs / 1000);
    if (seconds === 0) return false;
    this.elapsedMs -= seconds * 1000;
    // Capacity is shared and can fill between seconds, even within one update.
    for (let second = 0; second < seconds; second++) {
      this.refresh();

      for (const batch of this.batches) {
        this.storage.depositProduction(batch.cell, batch.resource, batch.units);
      }
      this.distribution.advanceSecond();
    }
    this.refresh();
    return true;
  }
}
