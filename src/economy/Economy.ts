import { EconomicHistory } from './EconomicHistory.ts';
import type { SiteCharge } from './EconomicHistory';
import { Treasury } from './Treasury.ts';
import { check, range, whole } from '../persistence/validation.ts';
import { taxPolicies, taxRules } from './TaxPolicy.ts';
import type { TaxPolicy } from './TaxPolicy';
import { centsPerGold, maintenanceByType, wagePerWorker } from './OperatingCosts.ts';
import type { OperatingCosts } from './OperatingCosts';
import { simulatedMsPerGameHour } from '../simulation/GameTime.ts';
import { populationRules } from '../population/Population.ts';
import type { LaborContext } from '../population/Population';
import { productNames } from './Products.ts';
import type { ProductId } from './Products';
import { Distribution } from './Distribution.ts';
import type { Residence } from './Distribution';
import { Storage } from './Storage.ts';
import { unitsPerResource } from './Inventories.ts';
import type { StoredResource } from './Inventories';
import type { Cell } from '../map/CellSelection';
import type { ConstructionCost } from '../map/ConstructionCosts';
import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { Population } from '../population/Population';

export const resourceNames = { gold: 'Oro', ...productNames } as const;
export type Resource = keyof typeof resourceNames;
export type Resources = Record<Resource, number>;

export const economyRules = {
  initialResources: { gold: 150, food: 20, wood: 50 },
  recovery: { populationLimit: 12, arrivalsPerEvaluation: 1 },
} as const;

// Inventory units represent production and consumption fractions exactly.
// Public amounts use resource units; internal balances are never rounded per tick.

const productionByType: Record<ConstructionType, Readonly<Resources>> = {
  house: { gold: 0, food: 0, wood: 0 },
  road: { gold: 0, food: 0, wood: 0 },
  bridge: { gold: 0, food: 0, wood: 0 },
  farm: { gold: 0, food: 2, wood: 0 },
  lumberjack: { gold: 0, food: 0, wood: 2 },
  warehouse: { gold: 0, food: 0, wood: 0 },
  market: { gold: 0, food: 0, wood: 0 },
  well: { gold: 0, food: 0, wood: 0 },
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
  private readonly treasury: Treasury;
  private taxPolicy: TaxPolicy = taxRules.defaultPolicy;
  private maintenanceRate = 0;
  readonly storage: Storage;
  readonly distribution: Distribution;
  private context: { map: ConstructionMap; connections: RoadConnections; workforce: Workforce } | null = null;
  private batches: { cell: Cell; resource: StoredResource; units: number }[] = [];
  private productionUnits: Resources = { gold: 0, food: 0, wood: 0 };
  private readonly buildings = new Map<string, BuildingProductivity>();
  private elapsedMs = 0;
  private completedMs = 0;
  readonly history: EconomicHistory;

  // Called once for a new settlement. Recalculation and UI never grant resources.
  constructor(initial: Readonly<Resources> = economyRules.initialResources, historyCapacity = 200) {
    this.history = new EconomicHistory(historyCapacity, () => this.completedMs);
    this.treasury = new Treasury(initial.gold, this.history);
    this.storage = new Storage({
      food: Math.round(initial.food * unitsPerResource),
      wood: Math.round(initial.wood * unitsPerResource),
    }, this.history);
    this.distribution = new Distribution(this.storage);
  }

  saveState() {
    return { completedMs: this.completedMs, elapsedMs: this.elapsedMs, taxPolicy: this.taxPolicy,
      treasury: this.treasury.saveState(), inventories: this.storage.inventories.saveState(),
      distribution: this.distribution.saveState(), history: this.history.saveState() };
  }

  restoreState(state: ReturnType<Economy['saveState']>, map: ConstructionMap): void {
    const { completedMs, elapsedMs, taxPolicy, treasury, inventories, distribution, history } = state;
    check(whole(completedMs) && completedMs % 1000 === 0 && range(elapsedMs, 0, 1000) && elapsedMs < 1000
      && Object.prototype.hasOwnProperty.call(taxPolicies, taxPolicy));
    this.completedMs = completedMs;
    this.elapsedMs = elapsedMs;
    this.taxPolicy = taxPolicy;
    this.treasury.restoreState(treasury);
    this.history.restoreState(history, completedMs);
    this.storage.inventories.restoreState(inventories);
    const ids = inventories.map(inventory => inventory.id);
    this.storage.restoreWarehouseOrder(ids);
    this.distribution.restoreState(distribution, map, ids);
  }

  get simulatedTimeMs(): number { return this.completedMs; }

  get resources(): Readonly<Resources> {
    const goods = this.storage.totalsUnits;
    const markets = this.distribution.totalMarketUnits;
    goods.food += markets.food;
    goods.wood += markets.wood;
    return { gold: this.treasury.gold, food: goods.food / unitsPerResource, wood: goods.wood / unitsPerResource };
  }

  get availableConstructionWood(): number {
    return this.storage.inventories.availableConstructionWoodUnits / unitsPerResource;
  }

  missingCost(cost: ConstructionCost): ConstructionCost {
    return {
      gold: this.treasury.shortfall(cost.gold),
      wood: Math.max(0, Math.round(cost.wood * unitsPerResource)
        - this.storage.inventories.availableConstructionWoodUnits) / unitsPerResource,
    };
  }

  payBuildingCost(cost: ConstructionCost, operation: SiteCharge, destination: string): boolean {
    const wood = Math.round(cost.wood * unitsPerResource);
    if (!Number.isFinite(cost.gold) || cost.gold < 0 || this.treasury.shortfall(cost.gold) > 0
      || !this.storage.inventories.spendConstructionWood(wood, destination)) return false;
    this.treasury.payBuilding(cost.gold, operation, destination);
    return true;
  }

  operatingCostsPerHour(employed: number): OperatingCosts {
    return { wages: employed * wagePerWorker / centsPerGold, maintenance: this.maintenanceRate / centsPerGold };
  }

  get operatingDeficits(): OperatingCosts { return this.treasury.deficits; }

  get currentTaxPolicy(): TaxPolicy { return this.taxPolicy; }

  setTaxPolicy(policy: TaxPolicy): void { this.taxPolicy = policy; }

  get taxMigrationModifier(): number { return taxPolicies[this.taxPolicy].migrationModifier; }

  private taxHundredthsOfCentPerHour(residents: number): number {
    return residents * taxRules.baseCentsPerResident * taxPolicies[this.taxPolicy].percent;
  }

  taxIncomePerHour(residents: number): number { return this.taxHundredthsOfCentPerHour(residents) / centsPerGold ** 2; }

  accountOperatingSecond(employed: number, residents: number): void {
    this.treasury.accrueSecond({ wages: employed * wagePerWorker, maintenance: this.maintenanceRate },
      this.taxHundredthsOfCentPerHour(residents));
    if (this.completedMs % simulatedMsPerGameHour === 0) this.treasury.closeHour();
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
    this.maintenanceRate = 0;
    for (const { cell, type } of map.occupiedCells()) {
      if (!map.isKingdomRoad(cell)) this.maintenanceRate += maintenanceByType[type];
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
    this.productionUnits = total;
  }

  consumeHomes(population: Readonly<{ residencesSnapshot: readonly Residence[] }>, foodPerResident: number): void {
    // Provisional municipal revenue: one gold per food or wood unit consumed from a market.
    // No revenue from replenishment, reserve consumption or unsatisfied demand.
    this.distribution.consumeHomes(population.residencesSnapshot, foodPerResident,
      (market, household, units, product) => this.treasury.creditSale(market, household, units, product));
    this.refresh();
  }

  immigrationSupply(population: Readonly<{ residencesSnapshot: readonly Residence[] }>, maxResidents: number, seconds: number,
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
      .find(home => home.residents < (home.capacity ?? residentialCapacity) && this.distribution.hasAuthorizedCoverage(home.cell));
    return candidate ? new Map([[key(candidate.cell),
      Math.min(maxResidents, economyRules.recovery.arrivalsPerEvaluation, (candidate.capacity ?? residentialCapacity) - candidate.residents)]]) : normal;
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

  migrationFood(population: Population): number {
    const available = this.availableFood;
    const logisticsFood = available + this.storage.connectedWarehouseFood(true);
    const householdReserve = population.total * populationRules.foodPerResidentPerSecond
      * populationRules.immigrationIntervalSeconds;
    const oneArrival = populationRules.foodPerResidentPerSecond * populationRules.immigrationIntervalSeconds;
    if (population.total < economyRules.recovery.populationLimit && logisticsFood >= oneArrival
      && population.residencesSnapshot.some(home => this.distribution.hasAuthorizedCoverage(home.cell))) {
      return Math.max(available, householdReserve + oneArrival);
    }
    return available;
  }

  migrationReason(population: Population, supply: ReadonlyMap<string, number>, attractiveness: number): string {
    if (population.availableHousing === 0) return 'No hay solares conectados con espacio.';
    if (population.unemploymentRate >= populationRules.migration.stopUnemploymentRate) return 'Desempleo demasiado alto.';
    if (supply.size === 0) return this.distribution.supplyBlockReason(population.residencesSnapshot);
    if (attractiveness === 0) return 'El atractivo es insuficiente para nuevas llegadas.';
    const normal = this.distribution.immigrationPlan(population.residencesSnapshot, populationRules.familySize,
      populationRules.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond, populationRules.residentsPerPlot);
    return normal.size === 0 ? 'Recuperación limitada: hasta 1 habitante por evaluación con alimentos reales.'
      : 'Suministro previsto suficiente para inmigración.';
  }
  setWarehouseDraining(cell: Cell, draining: boolean): boolean {
    const changed = this.storage.setDraining(cell, draining);
    if (changed) this.refresh();
    return changed;
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

  setWarehouseMarketDispatch(cell: Cell, product: ProductId, enabled: boolean): boolean {
    const changed = this.storage.setMarketDispatch(cell, product, enabled);
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
      this.completedMs += 1000;
      this.refresh();

      for (const batch of this.batches) {
        this.storage.depositProduction(batch.cell, batch.resource, batch.units);
      }
      this.distribution.advanceSecond();
      this.storage.advanceDrain();
    }
    this.refresh();
    return true;
  }
}
