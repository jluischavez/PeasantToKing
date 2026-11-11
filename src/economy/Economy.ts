import { EconomicHistory } from './EconomicHistory.ts';
import type { SiteCharge } from './EconomicHistory';
import { Treasury } from './Treasury.ts';
import { check, range, whole } from '../persistence/validation.ts';
import { taxPolicies, taxRules } from './TaxPolicy.ts';
import type { TaxPolicy } from './TaxPolicy';
import { centsPerGold, maintenanceByType, salePriceCents, wagePerWorker } from './OperatingCosts.ts';
import type { OperatingCosts } from './OperatingCosts';
import { gameTimeRules, simulatedMsPerGameHour } from '../simulation/GameTime.ts';
import { populationRules, recoveryMigrationRules } from '../population/Population.ts';
import type { LaborContext } from '../population/Population';
import { productNames } from './Products.ts';
import type { ProductId } from './Products';
import { Distribution } from './Distribution.ts';
import type { Residence } from './Distribution';
import { Storage } from './Storage.ts';
import { unitsPerResource } from './Inventories.ts';
import type { Goods, StoredResource, TradeLine } from './Inventories';
import type { Cell } from '../map/CellSelection';
import type { ConstructionCost } from '../map/ConstructionCosts';
import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { Population } from '../population/Population';
import { missingWoodlandReason } from '../map/Woodland.ts';
import { crownRules } from '../simulation/Crown.ts';
import type { Logistics } from './Logistics';

export const resourceNames = { gold: 'Oro', ...productNames } as const;
export type Resource = keyof typeof resourceNames;
export type Resources = Record<Resource, number>;

export const economyRules = {
  initialResources: { gold: 150, food: 20, wood: 50 },
  farmFoodPerSecond: 2.56,
  lumberWoodPerHour: [0, 14, 22, 30],
  recovery: { populationLimit: recoveryMigrationRules.populationLimit, arrivalsPerEvaluation: 1 },
} as const;

// Inventory units represent production and consumption fractions exactly.
// Public amounts use resource units; internal balances are never rounded per tick.

export type BuildingProductivity = Readonly<{
  workers: number; capacity: number; ratio: number; storageBlocked: boolean; missingWoodland?: true;
  transport: ReturnType<Logistics['at']>;
}>;
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
  private connectedFarms = 0;
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
  constructor(initial: Readonly<Resources> = economyRules.initialResources, historyCapacity = 200,
    creditLimit: number = crownRules.creditLimit) {
    this.history = new EconomicHistory(historyCapacity, () => this.completedMs);
    this.treasury = new Treasury(initial.gold, this.history, creditLimit);
    this.storage = new Storage({
      food: Math.round(initial.food * unitsPerResource),
      wood: Math.round(initial.wood * unitsPerResource),
    }, this.history);
    this.distribution = new Distribution(this.storage);
    this.storage.logistics.onPurchase = (market, household, units, product) => {
      this.distribution.recordPurchase(market, units, product);
      this.treasury.creditSale(market, household, units, product);
    };
  }

  saveState() {
    return { completedMs: this.completedMs, elapsedMs: this.elapsedMs, taxPolicy: this.taxPolicy,
      treasury: this.treasury.saveState(), inventories: this.storage.inventories.saveState(),
      distribution: this.distribution.saveState(), history: this.history.saveState(), logistics: this.storage.logistics.saveState() };
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
    if (state.logistics) this.storage.logistics.prepareInventories(state.logistics);
    this.distribution.prepareHouseholds(state.distribution.households, map);
    this.storage.inventories.restoreState(inventories);
    this.storage.logistics.restoreState(state.logistics, completedMs);
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
  get operatingArrears(): OperatingCosts { return this.treasury.arrears; }
  get tradeBudgetTicks(): number { return this.treasury.tradeBudgetTicks; }
  settleTrade(trader: string, exports: number, imports: number): boolean { return this.treasury.settleTrade(trader, exports, imports); }
  get credit() {
    return { balance: this.treasury.gold, debt: this.treasury.debt, limit: this.treasury.creditLimit,
      available: this.treasury.creditAvailable };
  }

  canPayRoyalCost(gold: number): boolean { return this.treasury.shortfall(gold) === 0; }

  payRoyalCost(gold: number, operation: 'tribute' | 'offering'): boolean {
    return this.payBuildingCost({ gold, wood: 0 }, operation, 'crown');
  }

  get missionStock(): Goods {
    const goods = { food: 0, wood: 0 };
    for (const id of this.storage.operationalWarehouseIds()) {
      const inventory = this.storage.inventories.snapshot(id)!;
      if (!inventory.network) continue;
      if (inventory.marketDispatch.food) goods.food += inventory.available.food;
      if (inventory.marketDispatch.wood) goods.wood += inventory.available.wood;
    }
    return { food: goods.food / unitsPerResource, wood: goods.wood / unitsPerResource };
  }

  settleMission(id: string, cost: number, reward: number, delivery?: { product: ProductId; amount: number }): boolean {
    const settle = () => this.treasury.settleMission(id, cost, reward);
    if (!delivery) return settle();
    if (!whole(delivery.amount, 1) || (delivery.product !== 'food' && delivery.product !== 'wood')) return false;
    let remaining = delivery.amount * unitsPerResource;
    const lines: TradeLine[] = [];
    let network: string | null = null;
    for (const warehouse of this.storage.operationalWarehouseIds()) {
      const inventory = this.storage.inventories.snapshot(warehouse)!;
      if (!inventory.network || !inventory.marketDispatch[delivery.product]
        || (network !== null && inventory.network !== network)) continue;
      network = inventory.network;
      const units = Math.min(remaining, inventory.available[delivery.product]);
      if (units > 0) lines.push({ warehouse, product: delivery.product, units, direction: 'export' });
      remaining -= units;
      if (remaining === 0) break;
    }
    return remaining === 0 && network !== null
      && this.storage.inventories.exchange(network, id, lines, settle, 'mission');
  }

  receiveMissionReward(id: string, product: ProductId, amount: number): number {
    const plan = this.incomingSupplyPlan(product, amount);
    return plan && this.storage.inventories.exchange(plan.network, id, plan.lines, () => true, 'mission')
      ? plan.received : 0;
  }

  canReceiveRoyalAid(product: ProductId, amount: number): boolean {
    return this.incomingSupplyPlan(product, amount)?.received === amount;
  }

  receiveRoyalAid(id: string, product: ProductId, amount: number): boolean {
    const plan = this.incomingSupplyPlan(product, amount);
    return !!plan && plan.received === amount
      && this.storage.inventories.exchange(plan.network, id, plan.lines, () => true, 'royal-aid');
  }

  receiveRoyalSubsidy(id: string, gold: number): boolean { return this.treasury.creditRoyalSubsidy(id, gold); }

  recordRoyalRelief(id: string, dueAt: number, original: number, reduction: number): boolean {
    if (!whole(dueAt) || !whole(original * centsPerGold, 1) || !whole(reduction * centsPerGold, 1, original * centsPerGold)) return false;
    this.history.record({ resource: 'gold', units: reduction * centsPerGold, unitScale: centsPerGold, operation: 'royal-relief',
      origin: id, destination: 'tribute:' + dueAt,
      originBalance: { before: original * centsPerGold, after: original * centsPerGold - reduction * centsPerGold } });
    return true;
  }

  private incomingSupplyPlan(product: ProductId, amount: number): { network: string; lines: TradeLine[]; received: number } | null {
    let remaining = Math.round(amount * unitsPerResource);
    if (!whole(remaining, 1) || remaining / unitsPerResource !== amount) return null;
    const requested = remaining;
    const lines: TradeLine[] = [];
    let network: string | null = null;
    for (const warehouse of this.storage.operationalWarehouseIds()) {
      const stock = this.storage.inventories.snapshot(warehouse)!;
      if (!stock.network || (network !== null && network !== stock.network)
        || !this.storage.inventories.acceptsIncoming(warehouse, product)
        || !this.storage.logistics.acceptsDestination(this.context!.map.cellAtKey(warehouse.split(':')[1])!)) continue;
      network = stock.network;
      const units = Math.min(remaining, stock.free);
      if (units > 0) lines.push({ warehouse, product, units, direction: 'import' });
      remaining -= units;
      if (remaining === 0) break;
    }
    return network && lines.length ? { network, lines, received: (requested - remaining) / unitsPerResource } : null;
  }

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
    const sales = this.salesRevenuePerSecond;
    return { ...asResources(this.productionUnits), gold: sales.food + sales.wood };
  }

  get salesRevenuePerSecond(): Readonly<Goods> {
    const quantities = this.distribution.salesByProductPerSecond;
    return {
      food: quantities.food * salePriceCents.food / centsPerGold,
      wood: quantities.wood * salePriceCents.wood / centsPerGold,
    };
  }

  productivityAt(cell: Cell): BuildingProductivity | undefined {
    return this.buildings.get(key(cell));
  }

  // The existing Population model is the sole source of workers and capacities.
  recalculate(map: ConstructionMap, connections: RoadConnections, workforce: Workforce): void {
    this.context = { map, connections, workforce };
    this.storage.sync(map, connections, workforce);
    this.distribution.sync(map, connections, workforce);
    this.storage.logistics.reconcile();
    const spaces = this.storage.availableSpaces();
    this.batches = [];
    const total: Resources = { gold: 0, food: 0, wood: 0 };
    this.buildings.clear();
    this.maintenanceRate = 0;
    this.connectedFarms = 0;
    for (const { cell, type } of map.occupiedCells()) {
      if (!map.isKingdomRoad(cell)) this.maintenanceRate += maintenanceByType[type];
      if (type !== 'farm' && type !== 'lumberjack') continue;
      const capacity = workforce.capacityFor(type);
      const connected = connections.isConnected(cell);
      if (type === 'farm' && connected) this.connectedFarms++;
      const workers = connected
        ? Math.min(capacity, Math.max(0, workforce.workersAt(cell))) : 0;
      const laborRatio = capacity > 0 ? workers / capacity : 0;
      const woodPerHour = economyRules.lumberWoodPerHour[workers] ?? 0;
      const resource = type === 'farm' ? 'food' : 'wood';
      const rate = type === 'farm' ? economyRules.farmFoodPerSecond * laborRatio : woodPerHour / gameTimeRules.secondsPerHour;
      const quantity = Math.round(rate * unitsPerResource);
      const missingWoodland = type === 'lumberjack' && !this.storage.hasProductionSource(cell);
      const storageBlocked = !missingWoodland && quantity > 0 && !this.storage.planTransport(cell, quantity, spaces);
      const outputRatio = type === 'farm' ? laborRatio : woodPerHour / economyRules.lumberWoodPerHour[3];
      const ratio = storageBlocked || missingWoodland ? 0 : outputRatio;
      this.buildings.set(key(cell), { workers, capacity, ratio, storageBlocked,
        transport: this.storage.logistics.at(cell), ...(missingWoodland && { missingWoodland }) });
      if (ratio > 0 && quantity > 0) {
        total[resource] += quantity;
        this.batches.push({ cell, resource, units: quantity });
      }
    }
    this.productionUnits = total;
  }

  consumeHomes(population: Readonly<{ residencesSnapshot: readonly Residence[] }>, foodPerResident: number): void {
    // Only units actually delivered from a market generate municipal revenue.
    this.distribution.consumeHomes(population.residencesSnapshot, foodPerResident,
      (market, household, units, product) => this.treasury.creditSale(market, household, units, product));
    this.refresh();
  }

  immigrationSupply(population: Readonly<{ residencesSnapshot: readonly Residence[] }>, maxResidents: number, seconds: number,
    foodPerResident: number, residentialCapacity: number, foodCoverage = 0): ReadonlyMap<string, number> {
    const homes = population.residencesSnapshot;
    const total = homes.reduce((sum, home) => sum + home.residents, 0);
    maxResidents = Math.min(maxResidents, this.sustainableArrivals(total, foodPerResident));
    if (maxResidents <= 0) return new Map();
    const normal = this.distribution.immigrationPlan(homes, maxResidents,
      seconds, foodPerResident, residentialCapacity);
    if (normal.size > 0) return normal;
    if (maxResidents > 0 && foodCoverage >= populationRules.migration.shortReserveFoodCoverage) {
      const shortReserve = this.distribution.immigrationPlan(homes, 1, 1, foodPerResident, residentialCapacity);
      if (shortReserve.size > 0) return shortReserve;
    }
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

  private sustainableArrivals(residents: number, foodPerResident: number): number {
    if (this.distribution.bootstrapActive || this.connectedFarms === 0 || foodPerResident <= 0) return Infinity;
    return Math.max(0, Math.floor(this.connectedFarms * economyRules.farmFoodPerSecond / foodPerResident) - residents);
  }

  laborContext(population: Pick<Population, 'total' | 'activePopulation' | 'residencesSnapshot' | 'capacityFor'>): LaborContext {
    const homes = population.residencesSnapshot;
    const markets = this.distribution.essentialMarkets(homes);
    const market = this.distribution.foodForStaffing(markets);
    const food = this.storage.connectedWarehouseFood(false) + market.stock;
    const buffer = (population.total + 1) * populationRules.foodPerResidentPerSecond * populationRules.immigrationIntervalSeconds;
    const warehouses = this.storage.essentialWarehouses();
    return {
      // Require a fuller buffer before moving a scarce worker back to sales.
      produceFoodFirst: population.activePopulation < 3 && food < buffer * (market.staffed ? 1 : 2),
      minimumFarmWorkers: population.activePopulation >= 3 && food < buffer && markets.size > 0 && this.storage.canReceiveMarketFood()
        ? Math.ceil(population.total * populationRules.foodPerResidentPerSecond * population.capacityFor('farm')
          / economyRules.farmFoodPerSecond) : 0,
      unavailable: (cell, type) => this.laborIssue(cell, type) !== null,
      marketCoverage: cell => this.distribution.inhabitedCoverage(cell, homes),
      essentialEligible: (cell, type) => {
        if (type === 'market') return markets.has(key(cell));
        if (type === 'warehouse') return warehouses.has('warehouse:' + key(cell));
        return true;
      },
    };
  }

  laborIssue(cell: Cell, type: ConstructionType): string | null {
    if (type === 'lumberjack' && !this.storage.hasProductionSource(cell)) {
      return missingWoodlandReason;
    }
    if (type !== 'market' && type !== 'warehouse') return null;
    const inventory = this.storage.inventories.snapshot(type + ':' + key(cell));
    if (!inventory) return null;
    if (type === 'market') {
      return inventory.products.food || inventory.products.wood ? null : 'Ventas de comida y madera deshabilitadas.';
    }
    if (inventory.used > 0) return null;
    if (inventory.draining) return 'El almacén en vaciado ya está vacío.';
    return inventory.products.food || inventory.products.wood ? null : 'Recepción deshabilitada y sin existencias.';
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
    if (this.sustainableArrivals(population.total, populationRules.foodPerResidentPerSecond) === 0) {
      return 'La producción máxima de las granjas conectadas no cubre más llegadas.';
    }
    if (supply.size === 0) return this.distribution.supplyBlockReason(population.residencesSnapshot);
    if (attractiveness === 0) return 'El atractivo es insuficiente para nuevas llegadas.';
    const normal = this.distribution.immigrationPlan(population.residencesSnapshot, populationRules.familySize,
      populationRules.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond, populationRules.residentsPerPlot);
    return normal.size === 0 ? 'Llegadas limitadas: hasta 1 habitante por evaluación con alimentos reales.'
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
      this.distribution.beginSecond();
      this.storage.logistics.advance(1000, this.completedMs);
      this.refresh();

      for (const batch of this.batches) {
        this.storage.queueProduction(batch.cell, batch.resource, batch.units, this.completedMs);
      }
      this.distribution.advanceSecond();
      this.storage.advanceDrain();
    }
    this.refresh();
    return true;
  }
}
