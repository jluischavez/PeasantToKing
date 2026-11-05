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

export const distributionRules = { marketCapacity: 100, restockIntervalSeconds: 5, coverageRoadTiles: 6, woodPerResidentPerHour: 0.5 } as const;
export type Residence = Readonly<{ cell: Cell; residents: number }>;
export type MarketSnapshot = Readonly<{
  food: number; wood: number; capacity: number; workers: number; workerCapacity: number;
  connected: boolean; operational: boolean; coveredHomes: number; range: number;
  sells: Readonly<ProductFlags>;
  reason: string;
}>;
export type HousingSupply = Readonly<{ status: 'reserve' | 'market' | 'unserved'; market?: Cell; distance?: number }>;
type Workforce = Pick<Population, 'workersAt' | 'capacityFor'>;
type Market = { id: string; cell: Cell; workers: number; workerCapacity: number; connected: boolean };
const key = (cell: Cell): string => `${cell.column},${cell.row}`;

export class Distribution {
  private readonly storage: Storage;
  readonly coverage = new MarketCoverage();
  private readonly markets = new Map<string, Market>();
  private connections: RoadConnections | null = null;
  private coverageRevision = -1;
  private coverageMap: ConstructionMap | null = null;
  private restockSeconds = 0;
  private bootstrap = true;
  private readonly marketSales = new Map<string, number>();
  private readonly lastHomeShortages = new Map<string, { cell: Cell; units: Goods }>();
  private shortageUnits = 0;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  get bootstrapActive(): boolean { return this.bootstrap; }
  get salesPerSecond(): number {
    return [...this.marketSales.values()].reduce((total, units) => total + units, 0) / U;
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
    if (this.coverageMap !== map || this.coverageRevision !== connections.revision) {
      this.coverage.recalculate(map, connections, distributionRules.coverageRoadTiles);
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
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const cell = { column, row };
        if (map.getConstruction(cell) !== 'market') continue;
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
    }
    this.finishBootstrapIfStocked();
  }

  private finishBootstrapIfStocked(): void {
    if (!this.bootstrap) return;
    const ready = [...this.markets.keys()].some(id => {
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
    return {
      food: inventory.goods.food / U, wood: inventory.goods.wood / U, capacity: distributionRules.marketCapacity,
      workers: market.workers, workerCapacity: market.workerCapacity,
      connected: market.connected, operational: inventory.operational,
      coveredHomes: this.coverage.coveredHomes(cell), range: distributionRules.coverageRoadTiles,
      sells: inventory.products,
      reason: !market.connected ? 'Sin conexión al Centro de Aldea'
        : market.workers === 0 ? 'Sin empleados asignados'
        : !inventory.products.food && !inventory.products.wood ? 'Ventas deshabilitadas'
        : !(inventory.products.food && inventory.goods.food > 0) && !(inventory.products.wood && inventory.goods.wood > 0)
          ? 'Sin existencias de productos habilitados; esperando reposición'
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
    return total;
  }

  get availableFood(): number {
    this.finishBootstrapIfStocked();
    let units = this.bootstrap ? this.storage.initialFoodReserve * U : 0;
    for (const id of this.markets.keys()) {
      const inventory = this.storage.inventories.snapshot(id)!;
      if (inventory.operational && this.storage.inventories.isProductEnabled(id, 'food')) units += inventory.goods.food;
    }
    return units / U;
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
        ? sources.reduce((sum, id) => sum + ledger.snapshot(id)!.goods.wood, 0) : 0;
      // Give available wood a share of new space so a full food supply cannot starve it.
      const woodSpace = Math.min(destination.free, woodAvailable,
        Math.max(0, Math.floor(destination.capacity / 2) - destination.goods.wood));
      const foodMoved = destination.products.food
        ? this.restockProduct(market.id, 'food', sources, destination.free - woodSpace) : 0;
      if (destination.products.wood) this.restockProduct(market.id, 'wood', sources, destination.free - foodMoved);
    }
    this.finishBootstrapIfStocked();
  }

  private restockProduct(market: string, product: ProductId, sources: readonly string[], limit: number): number {
    const ledger = this.storage.inventories;
    let remaining = limit;
    for (const id of sources) {
      if (remaining === 0) break;
      const quantity = Math.min(remaining, ledger.snapshot(id)!.goods[product]);
      if (quantity > 0 && ledger.transfer(id, market, product, quantity)) remaining -= quantity;
    }
    return limit - remaining;
  }

  private sources(cell: Cell, product: ProductId = 'food'): { id: string; distance: number; cell?: Cell }[] {
    if (!this.connections?.isConnected(cell)) return [];
    if (this.bootstrap && product === 'food') return [{ id: 'initial-reserve', distance: 0 }];
    return [...this.markets.values()].flatMap(market => {
      const distance = this.coverage.distance(market.cell, cell);
      const inventory = this.storage.inventories.snapshot(market.id)!;
      return inventory.operational && inventory.products[product] && distance !== undefined
        ? [{ id: market.id, distance, cell: market.cell }] : [];
    }).sort((a, b) => a.distance - b.distance
      || a.cell!.row - b.cell!.row || a.cell!.column - b.cell!.column);
  }

  inhabitedCoverage(cell: Cell, homes: readonly Residence[]): readonly string[] {
    const market = this.markets.get('market:' + key(cell));
    if (!market?.connected || !this.storage.inventories.isProductEnabled(market.id, 'food')) return [];
    return homes.filter(home => home.residents > 0 && this.coverage.distance(cell, home.cell) !== undefined)
      .map(home => key(home.cell));
  }

  essentialMarket(cell: Cell, homes: readonly Residence[]): boolean {
    const authorized = [...this.markets.values()].filter(market => market.connected
      && this.storage.inventories.isProductEnabled(market.id, 'food')
      && this.coverage.coveredHomes(market.cell) > 0);
    const inhabited = authorized.filter(market => homes.some(home => home.residents > 0
      && this.coverage.distance(market.cell, home.cell) !== undefined));
    return (inhabited.length > 0 ? inhabited : authorized).some(market => key(market.cell) === key(cell));
  }

  hasAuthorizedCoverage(cell: Cell): boolean {
    return this.connections?.isConnected(cell) === true && [...this.markets.values()].some(market =>
      market.connected && this.storage.inventories.isProductEnabled(market.id, 'food')
      && this.coverage.distance(market.cell, cell) !== undefined);
  }

  supplyBlockReason(homes: readonly Residence[]): string {
    const candidates = homes.filter(home => home.residents < populationRules.residentsPerPlot);
    const connected = [...this.markets.values()].filter(market => market.connected);
    if (connected.length === 0) return 'No hay mercados conectados.';
    const authorized = connected.filter(market => this.storage.inventories.isProductEnabled(market.id, 'food'));
    if (authorized.length === 0) return 'La venta de comida está deshabilitada en los mercados conectados.';
    if (!candidates.some(home => this.hasAuthorizedCoverage(home.cell))) return 'Los solares disponibles están fuera de cobertura.';
    if (!authorized.some(market => market.workers > 0)) return 'Mercados sin empleados: comida almacenada no distribuida.';
    if (this.availableFood === 0) {
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
    const source = this.sources(cell, product).find(entry => this.storage.inventories.snapshot(entry.id)!.goods[product] > 0);
    if (!source) return { status: 'unserved' };
    return source.id === 'initial-reserve' ? { status: 'reserve' }
      : { status: 'market', market: { ...source.cell! }, distance: source.distance };
  }

  consumeHomes(homes: readonly Residence[], foodPerResident: number,
    onSale?: (market: string, household: string, units: number, product: ProductId) => void): number {
    this.finishBootstrapIfStocked();
    this.marketSales.clear();
    this.lastHomeShortages.clear();
    let totalSales = 0;
    for (const home of homes) {
      if (home.residents === 0) continue;
      const demand: Goods = {
        food: Math.round(home.residents * foodPerResident * U),
        wood: Math.round(home.residents * distributionRules.woodPerResidentPerHour * U / gameTimeRules.secondsPerHour),
      };
      const household = 'house:' + key(home.cell);
      for (const product of ['food', 'wood'] as const) {
        for (const source of this.sources(home.cell, product)) {
          const delivered = this.storage.consumeInventory(source.id, product, demand[product], household);
          demand[product] -= delivered;
          if (delivered > 0 && source.id !== 'initial-reserve') {
            totalSales += delivered;
            this.marketSales.set(source.id, (this.marketSales.get(source.id) ?? 0) + delivered);
            onSale?.(source.id, household, delivered, product);
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
      budgets.set(id, inventory.operational && this.storage.inventories.isProductEnabled(id, 'food') ? inventory.goods.food : 0);
    }
    const reserve = (cell: Cell, units: number, requireFull: boolean): boolean => {
      const plan: { id: string; units: number }[] = [];
      let remaining = units;
      for (const source of this.sources(cell)) {
        const quantity = Math.min(remaining, budgets.get(source.id) ?? 0);
        plan.push({ id: source.id, units: quantity });
        remaining -= quantity;
        if (remaining === 0) break;
      }
      if (remaining > 0 && requireFull) return false;
      for (const entry of plan) budgets.set(entry.id, budgets.get(entry.id)! - entry.units);
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
      while (remaining > 0 && home.residents + count < residentialCapacity
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
