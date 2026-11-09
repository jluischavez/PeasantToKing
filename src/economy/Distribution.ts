import { check, restoreEntries, whole } from '../persistence/validation.ts';
import { formatNumber } from '../formatNumber.ts';
import type { ProductId, ProductFlags } from './Products';
import { populationRules } from '../population/Population.ts';
import { unitsPerResource as U } from './Inventories.ts';
import type { Goods } from './Inventories';
import { gameMinutesForSeconds, gameTimeRules } from '../simulation/GameTime.ts';
import { MarketCoverage } from '../map/MarketCoverage.ts';
import type { Storage } from './Storage';
import type { Cell } from '../map/CellSelection';
import type { ConstructionMap } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { Population } from '../population/Population';

export const distributionRules = {
  marketCapacity: 100, mixedMarketWoodCapacity: 50, restockIntervalSeconds: 5, coverageRoadTiles: 6, woodPerResidentPerHour: 0.5,
} as const;
export type Residence = Readonly<{ cell: Cell; residents: number; capacity?: number }>;
export type MarketSnapshot = Readonly<{
  food: number; wood: number; capacity: number; workers: number; workerCapacity: number;
  connected: boolean; operational: boolean; coveredHomes: number; range: number;
  sells: Readonly<ProductFlags>;
  reason: string;
  incomingFood: number; incomingWood: number; incoming: number;
}>;
export type HousingSupply = Readonly<{ status: 'reserve' | 'market' | 'household' | 'unserved'; market?: Cell; distance?: number }>;
type Workforce = Pick<Population, 'workersAt' | 'capacityFor'>;
type Market = { id: string; cell: Cell; workers: number; workerCapacity: number; connected: boolean };
const key = (cell: Cell): string => `${cell.column},${cell.row}`;

export class Distribution {
  private physicalHouseholds = false;
  private readonly households = new Map<string, Cell>();
  enableHouseholds(enabled = true): void { this.physicalHouseholds = enabled; }
  beginSecond(): void { this.marketSales.clear(); }
  recordPurchase(market: string, units: number, product: ProductId): void {
    const sales = this.marketSales.get(market) ?? { food: 0, wood: 0 };
    sales[product] += units; this.marketSales.set(market, sales);
  }
  private ensureHousehold(cell: Cell): string {
    const id = `home-stock:${key(cell)}`;
    if (!this.households.has(id)) {
      this.storage.inventories.create(id, { kind: 'household', capacity: 128 * U,
        network: this.connections!.networkFor(cell), operational: true });
      this.households.set(id, { ...cell });
    }
    return id;
  }
  prepareHouseholds(cells: readonly Cell[] | undefined, map: ConstructionMap): void {
    if (cells === undefined) return;
    check(Array.isArray(cells) && cells.length <= map.columns * map.rows);
    for (const cell of cells) {
      check(map.getConstruction(cell) === 'house' && !this.households.has(`home-stock:${key(cell)}`));
      this.ensureHousehold(cell);
    }
  }
  private readonly storage: Storage;
  readonly coverage = new MarketCoverage();
  private readonly markets = new Map<string, Market>();
  private connections: RoadConnections | null = null;
  private coverageRevision = -1;
  private coverageMap: ConstructionMap | null = null;
  private readonly sourceCache = new Map<string, { id: string; distance: number; cell: Cell }[]>();
  private restockSeconds = 0;
  private bootstrap = true;
  private readonly marketSales = new Map<string, Goods>();
  private readonly lastHomeShortages = new Map<string, { cell: Cell; units: Goods }>();
  private shortageUnits = 0;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  saveState() {
    return { restockSeconds: this.restockSeconds, bootstrap: this.bootstrap, shortageUnits: this.shortageUnits,
      marketSales: [...this.marketSales], lastHomeShortages: [...this.lastHomeShortages],
      ...(this.households.size > 0 && { households: [...this.households.values()] }) };
  }

  restoreState(state: ReturnType<Distribution['saveState']>, map: ConstructionMap, ids: readonly string[]): void {
    const { restockSeconds, bootstrap, shortageUnits, marketSales, lastHomeShortages } = state;
    check(whole(restockSeconds, 0, distributionRules.restockIntervalSeconds - 1)
      && typeof bootstrap === 'boolean' && whole(shortageUnits));
    this.restockSeconds = restockSeconds;
    this.bootstrap = bootstrap;
    this.shortageUnits = shortageUnits;
    this.storage.inventories.setAccess('initial-reserve', null, bootstrap);
    const markets = new Map(this.markets);
    this.markets.clear();
    for (const id of ids) {
      const market = markets.get(id);
      if (market) this.markets.set(id, market);
    }
    const validGoods = (goods: Goods) => whole(goods.food) && whole(goods.wood);
    restoreEntries(this.marketSales, marketSales, this.markets.size,
      (id, goods) => this.markets.get(id)?.connected === true && validGoods(goods));
    restoreEntries(this.lastHomeShortages, lastHomeShortages, map.rows * map.columns,
      (id, shortage) => map.getConstruction(shortage.cell) === 'house' && id === key(shortage.cell) && validGoods(shortage.units));
  }

  get bootstrapActive(): boolean { return this.bootstrap; }
  private get soldUnits(): Goods {
    const total = { food: 0, wood: 0 };
    for (const goods of this.marketSales.values()) {
      total.food += goods.food;
      total.wood += goods.wood;
    }
    return total;
  }

  get salesPerSecond(): number {
    const units = this.soldUnits;
    return (units.food + units.wood) / U;
  }

  get salesByProductPerSecond(): Readonly<Goods> {
    const units = this.soldUnits;
    return { food: units.food / U, wood: units.wood / U };
  }

  get cumulativeFoodShortage(): number { return this.shortageUnits / U; }

  foodShortageAt(cell: Cell): number {
    return (this.lastHomeShortages.get(key(cell))?.units.food ?? 0) / U;
  }

  woodShortageAt(cell: Cell): number {
    return (this.lastHomeShortages.get(key(cell))?.units.wood ?? 0) / U;
  }

  sync(map: ConstructionMap, connections: RoadConnections, workforce: Workforce): void {
    this.connections = connections;
    for (const [id, cell] of this.households) {
      if (map.getConstruction(cell) !== 'house') {
        this.storage.inventories.removeEmptyBuilding(id); this.households.delete(id);
      } else this.storage.inventories.setAccess(id, connections.networkFor(cell), true);
    }
    if (this.coverageMap !== map || this.coverageRevision !== connections.revision) {
      this.coverage.recalculate(map, connections, distributionRules.coverageRoadTiles);
      this.sourceCache.clear();
      this.coverageMap = map;
      this.coverageRevision = connections.revision;
      for (const [id, shortage] of this.lastHomeShortages) {
        if (map.getConstruction(shortage.cell) !== 'house') this.lastHomeShortages.delete(id);
      }
    }
    for (const market of this.markets.values()) {
      if (map.getConstruction(market.cell) !== 'market') {
        this.storage.inventories.removeEmptyBuilding(market.id);
        this.markets.delete(market.id);
        this.marketSales.delete(market.id);
      }
    }
    for (const { cell, type } of map.occupiedCells()) {
      if (type !== 'market') continue;
      const id = 'market:' + key(cell);
      const network = connections.networkFor(cell);
      if (network === null) this.marketSales.delete(id);
      const workerCapacity = workforce.capacityFor('market');
      const workers = network ? Math.min(workerCapacity, Math.max(0, workforce.workersAt(cell))) : 0;
      if (!this.markets.has(id)) {
        this.storage.inventories.create(id, {
          kind: 'market', capacity: distributionRules.marketCapacity * U,
          network, operational: workers > 0,
        });
      }
      this.markets.set(id, { id, cell, workers, workerCapacity, connected: network !== null });
      this.storage.inventories.setAccess(id, network, workers > 0);
    }
    this.finishBootstrapIfStocked();
  }

  private finishBootstrapIfStocked(): void {
    if (!this.bootstrap) return;
    const ready = this.physicalHouseholds ? [...this.households.keys()].some(id => this.storage.inventories.snapshot(id)!.goods.food > 0)
      : [...this.markets.keys()].some(id => {
      const inventory = this.storage.inventories.snapshot(id)!;
      return inventory.operational && inventory.products.food && inventory.goods.food > 0;
    });
    if (ready) {
      this.bootstrap = false;
      this.storage.inventories.setAccess('initial-reserve', null, false);
    }
  }

  marketAt(cell: Cell): MarketSnapshot | undefined {
    const market = this.markets.get('market:' + key(cell));
    if (!market) return undefined;
    const inventory = this.storage.inventories.snapshot(market.id)!;
    const incomingFood = this.storage.logistics.incoming(cell, 'food', true) / U;
    const incomingWood = this.storage.logistics.incoming(cell, 'wood', true) / U;
    return {
      food: inventory.goods.food / U, wood: inventory.goods.wood / U, capacity: distributionRules.marketCapacity,
      workers: market.workers, workerCapacity: market.workerCapacity,
      connected: market.connected, operational: inventory.operational,
      coveredHomes: this.coverage.coveredHomes(cell), range: distributionRules.coverageRoadTiles,
      sells: inventory.products,
      incomingFood, incomingWood,
      incoming: this.storage.inventories.reserved(market.id) / U,
      reason: !market.connected ? 'Sin conexión al Centro de Aldea'
        : !inventory.products.food && !inventory.products.wood ? 'Ventas deshabilitadas'
        : market.workers === 0 ? 'Sin empleados asignados'
        : inventory.products.food && inventory.goods.wood === inventory.capacity ? 'La madera ocupa todo el espacio para comida'
        : !(inventory.products.food && inventory.goods.food > 0) && !(inventory.products.wood && inventory.goods.wood > 0)
          ? ((inventory.products.food && incomingFood > 0) || (inventory.products.wood && incomingWood > 0)
            ? 'Repartidores en camino; esperando descarga' : 'Sin existencias de productos habilitados; esperando reposición')
        : inventory.products.food && inventory.goods.food === 0 ? 'Sin reserva de comida en el mercado'
        : 'Abasteciendo viviendas en cobertura',
    };
  }

  setSale(cell: Cell, product: ProductId, enabled: boolean): boolean {
    const id = 'market:' + key(cell);
    return this.markets.has(id) && this.storage.inventories.setProductEnabled(id, product, enabled);
  }

  get totalMarketUnits(): Goods {
    const total = { food: 0, wood: 0 };
    for (const id of this.markets.keys()) {
      const { goods } = this.storage.inventories.snapshot(id)!;
      total.food += goods.food;
      total.wood += goods.wood;
    }
    for (const id of this.households.keys()) {
      const goods = this.storage.inventories.snapshot(id)!.goods;
      total.food += goods.food; total.wood += goods.wood;
    }
    return total;
  }

  get availableFood(): number {
    this.finishBootstrapIfStocked();
    let units = this.bootstrap ? this.storage.initialFoodReserve * U : 0;
    for (const id of this.markets.keys()) {
      const inventory = this.storage.inventories.snapshot(id)!;
      if (inventory.operational && this.storage.inventories.isProductEnabled(id, 'food')) units += inventory.available.food;
    }
    for (const id of this.households.keys()) units += this.storage.inventories.snapshot(id)!.goods.food;
    return units / U;
  }

  foodForStaffing(eligibleMarkets: ReadonlySet<string>): { stock: number; staffed: boolean } {
    let units = this.bootstrap ? this.storage.initialFoodReserve * U : 0;
    let staffed = false;
    for (const market of this.markets.values()) {
      if (!eligibleMarkets.has(key(market.cell))) continue;
      const inventory = this.storage.inventories.snapshot(market.id)!;
      units += inventory.goods.food;
      staffed ||= inventory.operational;
    }
    return { stock: units / U, staffed };
  }

  // A single settlement clock controls replenishment, never UI reconstruction.
  advanceSecond(): void {
    this.restockSeconds++;
    if (this.restockSeconds < distributionRules.restockIntervalSeconds) return;
    this.restockSeconds = 0;
    const ledger = this.storage.inventories;
    const warehouses = this.storage.operationalWarehouseIds();
    for (const market of this.markets.values()) {
      const destination = ledger.snapshot(market.id)!;
      if (!destination.operational || destination.free === 0) continue;
      const sources = warehouses.filter(id => ledger.snapshot(id)!.network === destination.network);
      const woodAvailable = destination.products.wood
        ? sources.reduce((sum, id) => {
          const source = ledger.snapshot(id)!;
          return sum + (source.marketDispatch.wood ? source.available.wood : 0);
        }, 0) : 0;
      // Give available wood a share of new space so a full food supply cannot starve it.
      const woodSpace = Math.min(destination.free, woodAvailable, destination.products.food
        ? Math.max(0, distributionRules.mixedMarketWoodCapacity * U - destination.goods.wood
          - this.storage.logistics.incoming(market.cell, 'wood', true)) : destination.free);
      if (destination.products.food) this.restockProduct(market.id, 'food', sources, destination.free - woodSpace);
      if (woodSpace > 0) this.restockProduct(market.id, 'wood', sources, woodSpace);
    }
    this.finishBootstrapIfStocked();
  }

  private restockProduct(market: string, product: ProductId, sources: readonly string[], limit: number): void {
    const ledger = this.storage.inventories;
    let remaining = limit;
    for (const id of sources) {
      if (remaining === 0) break;
      const source = ledger.snapshot(id)!;
      if (!source.marketDispatch[product]) continue;
      const quantity = Math.min(remaining, source.available[product]);
      if (quantity > 0) remaining -= this.storage.dispatch(id, this.markets.get(market)!.cell, product, quantity, true);
    }
  }

  private sources(cell: Cell, product: ProductId = 'food', useReserve = true): { id: string; distance: number; cell?: Cell }[] {
    if (!this.connections?.isConnected(cell)) return [];
    if (this.bootstrap && useReserve && product === 'food') return [{ id: 'initial-reserve', distance: 0 }];
    let candidates = this.sourceCache.get(key(cell));
    if (!candidates) {
      candidates = [...this.markets.values()].flatMap(market => {
        const distance = this.coverage.distance(market.cell, cell);
        return distance === undefined ? [] : [{ id: market.id, distance, cell: market.cell }];
      }).sort((a, b) => a.distance - b.distance || a.cell.row - b.cell.row || a.cell.column - b.cell.column);
      this.sourceCache.set(key(cell), candidates);
    }
    return candidates.filter(source => {
      const inventory = this.storage.inventories.snapshot(source.id)!;
      return inventory.operational && inventory.products[product];
    });
  }

  inhabitedCoverage(cell: Cell, homes: readonly Residence[]): readonly string[] {
    const market = this.markets.get('market:' + key(cell));
    if (!market?.connected || !this.storage.inventories.isProductEnabled(market.id, 'food')) return [];
    return homes.filter(home => home.residents > 0 && this.coverage.distance(cell, home.cell) !== undefined)
      .map(home => key(home.cell));
  }

  essentialMarkets(homes: readonly Residence[]): ReadonlySet<string> {
    const authorized = [...this.markets.values()].filter(market => market.connected
      && this.storage.inventories.isProductEnabled(market.id, 'food')
      && this.coverage.coveredHomes(market.cell) > 0);
    const inhabited = authorized.filter(market => homes.some(home => home.residents > 0
      && this.coverage.distance(market.cell, home.cell) !== undefined));
    return new Set((inhabited.length > 0 ? inhabited : authorized).map(market => key(market.cell)));
  }

  hasAuthorizedCoverage(cell: Cell): boolean {
    return this.connections?.isConnected(cell) === true && [...this.markets.values()].some(market =>
      market.connected && this.storage.inventories.isProductEnabled(market.id, 'food')
      && this.coverage.distance(market.cell, cell) !== undefined);
  }

  supplyBlockReason(homes: readonly Residence[]): string {
    const candidates = homes.filter(home => home.residents < (home.capacity ?? populationRules.residentsPerPlot));
    const connected = [...this.markets.values()].filter(market => market.connected);
    if (connected.length === 0) return 'No hay mercados conectados.';
    const authorized = connected.filter(market => this.storage.inventories.isProductEnabled(market.id, 'food'));
    if (authorized.length === 0) return 'La venta de comida está deshabilitada en los mercados conectados.';
    const serving = authorized.filter(market => candidates.some(home => this.coverage.distance(market.cell, home.cell) !== undefined));
    if (serving.length === 0) return 'Los solares disponibles están fuera de cobertura.';
    const staffed = serving.filter(market => market.workers > 0);
    if (staffed.length === 0) return 'Los mercados que cubren los solares disponibles están sin empleados.';
    if (staffed.every(market => {
      const stock = this.storage.inventories.snapshot(market.id)!;
      return stock.used === stock.capacity && stock.goods.food === 0;
    })) return 'Los mercados que cubren los solares están llenos de madera.';
    if (this.availableFood === 0) {
      if (staffed.some(market => this.storage.logistics.incoming(market.cell, 'food', true) > 0)) {
        return 'Hay comida en camino; esperando descarga en los mercados.';
      }
      if (this.storage.connectedWarehouseFood(true) > 0) return 'Hay comida en almacenes; esperando reposición de mercados.';
      if (this.storage.connectedWarehouseFood(false) > 0) return 'Comida en almacenes sin empleados: falta activar almacenamiento.';
      return 'Mercados sin existencias: esperando producción de alimentos.';
    }
    return 'Comida distribuida insuficiente para reservar '
      + formatNumber(gameMinutesForSeconds(populationRules.immigrationIntervalSeconds))
      + ' min del juego de consumo.';
  }

  supplyAt(cell: Cell, product: ProductId = 'food'): HousingSupply {
    this.finishBootstrapIfStocked();
    if (this.physicalHouseholds && (this.storage.inventories.snapshot(`home-stock:${key(cell)}`)?.goods[product] ?? 0) > 0) return { status: 'household' };
    const source = this.sources(cell, product).find(entry => this.storage.inventories.snapshot(entry.id)!.goods[product] > 0);
    if (!source) return { status: 'unserved' };
    return source.id === 'initial-reserve' ? { status: 'reserve' }
      : { status: 'market', market: { ...source.cell! }, distance: source.distance };
  }

  consumeHomes(homes: readonly Residence[], foodPerResident: number,
    onSale?: (market: string, household: string, units: number, product: ProductId) => void): number {
    this.finishBootstrapIfStocked();
    if (!this.physicalHouseholds) this.marketSales.clear();
    this.lastHomeShortages.clear();
    let totalSales = 0;
    let warehouses: string[] | undefined;
    for (const home of homes) {
      if (home.residents === 0) continue;
      const demand: Goods = {
        food: Math.round(home.residents * foodPerResident * U),
        wood: Math.round(home.residents * distributionRules.woodPerResidentPerHour * U / gameTimeRules.secondsPerHour),
      };
      const household = 'house:' + key(home.cell);
      const stockId = this.physicalHouseholds ? this.ensureHousehold(home.cell) : null;
      if (this.bootstrap && this.connections?.isConnected(home.cell)) {
        demand.food -= this.storage.consumeInventory('initial-reserve', 'food', demand.food, household);
      }
      for (const product of ['food', 'wood'] as const) {
        const markets = this.physicalHouseholds ? [] : this.sources(home.cell, product, false);
        if (this.physicalHouseholds) {
          const rate = Math.round(home.residents * (product === 'food' ? foodPerResident
            : distributionRules.woodPerResidentPerHour / gameTimeRules.secondsPerHour) * U);
          const owned = this.storage.inventories.snapshot(stockId!)!.goods[product];
          const pending = this.storage.logistics.incoming(home.cell, product);
          if (owned + pending < rate * 8) {
            for (const source of this.sources(home.cell, product, false)) {
              const inventory = this.storage.inventories.snapshot(source.id)!;
              if (product === 'food' && inventory.available.food === 0 && this.storage.logistics.incoming(source.cell!, 'food', true) === 0) {
                warehouses ??= this.storage.operationalWarehouseIds();
                this.restockProduct(source.id, product, warehouses, Math.min(inventory.free, Math.max(rate * 12, 5 * U)));
              }
              if (this.storage.logistics.queuePurchase(home.cell, source.cell!, product, Math.max(0, rate * 12 - owned - pending)) > 0) break;
            }
          }
        }
        if (demand[product] === 0) continue;
        for (const source of (stockId ? [{ id: stockId, cell: home.cell }] : markets)) {
          if (product === 'food' && !stockId) {
            const inventory = this.storage.inventories.snapshot(source.id)!;
            const shortage = Math.min(demand.food - inventory.goods.food, inventory.free);
            if (shortage > 0 && this.storage.logistics.incoming(source.cell!, 'food', true) === 0) {
              warehouses ??= this.storage.operationalWarehouseIds();
              // Batch an emergency reserve rather than spawning one courier per household meal.
              this.restockProduct(source.id, 'food', warehouses, Math.min(inventory.free, Math.max(shortage, 5 * U)));
              this.finishBootstrapIfStocked();
            }
          }
          const delivered = this.storage.consumeInventory(source.id, product, demand[product], household);
          demand[product] -= delivered;
          if (delivered > 0) {
            totalSales += delivered;
            if (!stockId) {
              this.recordPurchase(source.id, delivered, product);
              onSale?.(source.id, household, delivered, product);
            }
          }
          if (demand[product] === 0) break;
        }
      }
      if (demand.food > 0 || demand.wood > 0) {
        this.lastHomeShortages.set(key(home.cell), { cell: home.cell, units: demand });
        this.shortageUnits += demand.food;
      }
    }
    return totalSales;
  }

  // Forecast shared inventories once, reserving existing household demand first.
  // This plan never moves goods and never promises the same food to two homes.
  immigrationPlan(homes: readonly Residence[], maxResidents: number, seconds: number,
    foodPerResident: number, residentialCapacity: number): ReadonlyMap<string, number> {
    this.finishBootstrapIfStocked();
    const budgets = new Map<string, number>();
    budgets.set('initial-reserve', this.bootstrap ? Math.round(this.storage.initialFoodReserve * U) : 0);
    for (const id of this.markets.keys()) {
      const inventory = this.storage.inventories.snapshot(id)!;
      budgets.set(id, inventory.operational && this.storage.inventories.isProductEnabled(id, 'food') ? inventory.available.food : 0);
    }
    for (const id of this.households.keys()) budgets.set(id, this.storage.inventories.snapshot(id)!.goods.food);
    const reserve = (cell: Cell, units: number, requireFull: boolean): boolean => {
      const plan: { id: string; units: number }[] = [];
      let remaining = units;
      for (const source of [...(this.physicalHouseholds ? [{ id: `home-stock:${key(cell)}` }] : []), ...this.sources(cell)]) {
        const quantity = Math.min(remaining, budgets.get(source.id) ?? 0);
        plan.push({ id: source.id, units: quantity });
        remaining -= quantity;
        if (remaining === 0) break;
      }
      if (remaining > 0 && requireFull) return false;
      for (const entry of plan) budgets.set(entry.id, (budgets.get(entry.id) ?? 0) - entry.units);
      return remaining === 0;
    };
    const fed = new Set<string>();
    const unitDemand = Math.round(seconds * foodPerResident * U);
    for (const home of homes) {
      if (reserve(home.cell, home.residents * unitDemand, false)) fed.add(key(home.cell));
    }
    const result = new Map<string, number>();
    let remaining = maxResidents;
    for (const home of [...homes].sort((a, b) => a.residents - b.residents)) {
      if (!fed.has(key(home.cell))) continue;
      let count = 0;
      while (remaining > 0 && home.residents + count < (home.capacity ?? residentialCapacity)
        && reserve(home.cell, unitDemand, true)) {
        count++;
        remaining--;
      }
      if (count > 0) result.set(key(home.cell), count);
      if (remaining === 0) break;
    }
    return result;
  }
}
