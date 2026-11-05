import type { EconomicHistory } from './EconomicHistory';
import { productIds, productNames } from './Products.ts';
import type { ProductId, ProductFlags } from './Products';
import { Inventories, unitsPerResource } from './Inventories.ts';
import type { Goods, StoredResource } from './Inventories';
import type { Cell } from '../map/CellSelection';
import type { ConstructionMap } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { Population } from '../population/Population';

export const storageRules = { warehouseCapacity: 300 } as const;
export type WarehouseSnapshot = Readonly<{
  food: number; wood: number; used: number; free: number; capacity: number;
  workers: number; workerCapacity: number; connected: boolean; operational: boolean;
  accepts: Readonly<ProductFlags>; draining: boolean; drainStatus: string;
}>;
type Warehouse = { id: string; cell: Cell; workers: number; workerCapacity: number; connected: boolean };
type Allocation = { destination: string; units: number };
type InventorySnapshot = NonNullable<ReturnType<Inventories['snapshot']>>;
type Workforce = Pick<Population, 'workersAt' | 'capacityFor'>;
const key = (cell: Cell): string => `warehouse:${cell.column},${cell.row}`;

export class Storage {
  readonly inventories: Inventories;
  private readonly warehouses = new Map<string, Warehouse>();
  private connections: RoadConnections | null = null;
  private readonly producers = new Map<string, StoredResource>();

  constructor(initial: Goods, history?: EconomicHistory) {
    this.inventories = new Inventories(history);
    this.inventories.create('initial-reserve', {
      kind: 'reserve', capacity: Number.MAX_SAFE_INTEGER, network: null, operational: true,
    }, { food: initial.food, wood: 0 });
    this.inventories.create('construction-reserve', {
      kind: 'construction-reserve', capacity: Number.MAX_SAFE_INTEGER, network: null, operational: true,
    }, { food: 0, wood: initial.wood });
  }

  sync(map: ConstructionMap, connections: RoadConnections, workforce: Workforce): void {
    this.connections = connections;
    this.producers.clear();
    for (const warehouse of this.warehouses.values()) {
      if (map.getConstruction(warehouse.cell) !== 'warehouse') {
        this.inventories.removeEmptyBuilding(warehouse.id);
        this.warehouses.delete(warehouse.id);
      }
    }
    for (let row = 0; row < map.rows; row++) {
      for (let column = 0; column < map.columns; column++) {
        const cell = { column, row };
        const type = map.getConstruction(cell);
        if (type === 'farm' || type === 'lumberjack') {
          this.producers.set(key(cell), type === 'farm' ? 'food' : 'wood');
        }
        if (type !== 'warehouse') continue;
        const id = key(cell);
        const network = connections.networkFor(cell);
        const workerCapacity = workforce.capacityFor('warehouse');
        const workers = network ? Math.min(workerCapacity, Math.max(0, workforce.workersAt(cell))) : 0;
        if (!this.warehouses.has(id)) {
          this.inventories.create(id, {
            kind: 'warehouse', capacity: storageRules.warehouseCapacity * unitsPerResource,
            network, operational: workers > 0,
          });
        }
        this.warehouses.set(id, { id, cell, workers, workerCapacity, connected: network !== null });
        this.inventories.setAccess(id, network, workers > 0);
      }
    }
  }

  warehouseAt(cell: Cell): WarehouseSnapshot | undefined {
    const warehouse = this.warehouses.get(key(cell));
    const inventory = this.inventories.snapshot(key(cell));
    if (!warehouse || !inventory) return undefined;
    return {
      food: inventory.goods.food / unitsPerResource, wood: inventory.goods.wood / unitsPerResource,
      used: inventory.used / unitsPerResource, free: inventory.free / unitsPerResource,
      capacity: inventory.capacity / unitsPerResource,
      workers: warehouse.workers, workerCapacity: warehouse.workerCapacity,
      connected: warehouse.connected, operational: inventory.operational, accepts: inventory.products,
      draining: inventory.draining, drainStatus: inventory.draining ? this.drainStatus(inventory) : '',
    };
  }

  setAcceptance(cell: Cell, product: ProductId, enabled: boolean): boolean {
    return this.warehouses.has(key(cell)) && this.inventories.setProductEnabled(key(cell), product, enabled);
  }

  setDraining(cell: Cell, draining: boolean): boolean {
    return this.inventories.setDraining(key(cell), draining);
  }

  private drainDestinations(network: string): string[] {
    return this.operationalWarehouseIds().filter(id => {
      const inventory = this.inventories.snapshot(id)!;
      return inventory.network === network && !inventory.draining;
    });
  }

  private drainStatus(source: InventorySnapshot): string {
    if (source.used === 0) return 'Vacío. Puedes demoler este almacén.';
    if (source.network === null) return 'Vaciado bloqueado: conecta este almacén por caminos.';
    if (!source.operational) return 'Vaciado bloqueado: este almacén necesita empleados.';
    const destinations = this.drainDestinations(source.network);
    if (destinations.length === 0) return 'Traslado bloqueado: falta otro almacén operativo conectado que no esté en vaciado.';

    const blocked = [];
    for (const product of productIds) {
      if (source.goods[product] === 0) continue;
      const accepting = destinations.filter(id => this.inventories.acceptsIncoming(id, product));
      if (accepting.length === 0) blocked.push(productNames[product] + ': ningún destino lo acepta');
      else if (accepting.every(id => this.inventories.snapshot(id)!.free === 0)) {
        blocked.push(productNames[product] + ': los destinos que lo aceptan están llenos');
      }
    }
    return blocked.length ? 'Sin destino de almacén para ' + blocked.join(' · ') + '.' : 'Traslado a otros almacenes en el próximo ciclo.';
  }

  advanceDrain(): void {
    for (const id of this.operationalWarehouseIds()) {
      const source = this.inventories.snapshot(id)!;
      if (!source.draining || source.network === null || source.used === 0) continue;
      const destinations = this.drainDestinations(source.network);
      for (const product of productIds) {
        let remaining = source.goods[product];
        for (const destination of destinations) {
          if (remaining === 0) break;
          if (!this.inventories.acceptsIncoming(destination, product)) continue;
          const quantity = Math.min(remaining, this.inventories.snapshot(destination)!.free);
          if (quantity > 0 && this.inventories.transfer(id, destination, product, quantity)) remaining -= quantity;
        }
      }
    }
  }

  get initialFoodReserve(): number {
    return this.inventories.snapshot('initial-reserve')!.goods.food / unitsPerResource;
  }

  get constructionWoodReserve(): number {
    return this.inventories.snapshot('construction-reserve')!.goods.wood / unitsPerResource;
  }

  get totalsUnits(): Goods {
    const total = { ...this.inventories.snapshot('initial-reserve')!.goods };
    total.wood += this.inventories.snapshot('construction-reserve')!.goods.wood;
    for (const warehouse of this.warehouses.values()) {
      const goods = this.inventories.snapshot(warehouse.id)!.goods;
      total.food += goods.food;
      total.wood += goods.wood;
    }
    return total;
  }

  get availableFoodUnits(): number {
    let food = this.inventories.snapshot('initial-reserve')!.goods.food;
    for (const warehouse of this.warehouses.values()) {
      const inventory = this.inventories.snapshot(warehouse.id)!;
      if (inventory.operational) food += inventory.goods.food;
    }
    return food;
  }

  essentialWarehouse(cell: Cell): boolean {
    const stocked = [...this.warehouses.values()].filter(warehouse => warehouse.connected
      && this.inventories.snapshot(warehouse.id)!.goods.food > 0);
    if (stocked.length > 0) return stocked.some(warehouse => warehouse.id === key(cell));
    return this.inventories.snapshot(key(cell))?.products.food ?? true;
  }

  connectedWarehouseFood(operationalOnly: boolean): number {
    let units = 0;
    for (const warehouse of this.warehouses.values()) {
      const inventory = this.inventories.snapshot(warehouse.id)!;
      if (warehouse.connected && (!operationalOnly || inventory.operational)) units += inventory.goods.food;
    }
    return units / unitsPerResource;
  }

  availableSpaces(): Map<string, number> {
    const spaces = new Map<string, number>();
    for (const warehouse of this.warehouses.values()) {
      const inventory = this.inventories.snapshot(warehouse.id)!;
      if (inventory.operational && !inventory.draining) spaces.set(warehouse.id, inventory.free);
    }
    return spaces;
  }

  // Plan a whole batch, possibly across multiple warehouses. Failed plans
  // neither reserve capacity nor create goods.
  planProduction(cell: Cell, units: number, spaces = this.availableSpaces()): Allocation[] | undefined {
    if (!this.producers.has(key(cell)) || !Number.isSafeInteger(units) || units <= 0) return undefined;
    const product = this.producers.get(key(cell))!;
    const network = this.connections?.networkFor(cell);
    if (!network) return undefined;
    const plan: Allocation[] = [];
    let remaining = units;
    for (const [id, free] of spaces) {
      const inventory = this.inventories.snapshot(id);
      if (!inventory?.operational || inventory.network !== network
        || !this.inventories.acceptsIncoming(id, product)) continue;
      const quantity = Math.min(free, remaining);
      if (quantity > 0) plan.push({ destination: id, units: quantity });
      remaining -= quantity;
      if (remaining === 0) break;
    }
    if (remaining > 0) return undefined;
    for (const allocation of plan) {
      spaces.set(allocation.destination, spaces.get(allocation.destination)! - allocation.units);
    }
    return plan;
  }

  depositProduction(cell: Cell, resource: StoredResource, units: number): boolean {
    if (this.producers.get(key(cell)) !== resource) return false;
    const plan = this.planProduction(cell, units);
    if (!plan) return false;
    this.inventories.create('production-batch', {
      kind: 'production', capacity: units, network: this.connections!.networkFor(cell), operational: true,
    }, { food: resource === 'food' ? units : 0, wood: resource === 'wood' ? units : 0 },
    (resource === 'food' ? 'farm:' : 'lumberjack:') + cell.column + ',' + cell.row);
    for (const allocation of plan) {
      if (!this.inventories.transfer('production-batch', allocation.destination, resource, allocation.units)) {
        throw new Error('A validated production transfer failed');
      }
    }
    this.inventories.discardTransient('production-batch');
    return true;
  }

  operationalWarehouseIds(): string[] {
    return [...this.warehouses.keys()].filter(id => this.inventories.snapshot(id)!.operational);
  }

  // Only markets can supply both products. The initial reserve supplies only food.
  consumeInventory(id: string, product: ProductId, units: number, destination = 'food-consumption'): number {
    if (!Number.isSafeInteger(units) || units <= 0) return 0;
    const source = this.inventories.snapshot(id);
    if (!source?.operational || (source.kind !== 'market' && (source.kind !== 'reserve' || product !== 'food'))) return 0;
    const quantity = Math.min(units, source.goods[product]);
    if (quantity === 0) return 0;
    this.inventories.create('food-consumption', {
      kind: 'consumer', capacity: quantity, network: null, operational: true,
    }, undefined, destination);
    const transferred = this.inventories.transfer(id, 'food-consumption', product, quantity);
    this.inventories.discardTransient('food-consumption');
    return transferred ? quantity : 0;
  }

  consumeInventoryFood(id: string, units: number): number {
    return this.consumeInventory(id, 'food', units);
  }

  consumeFood(units: number): boolean {
    if (!Number.isSafeInteger(units) || units < 0) return false;
    return units === 0 || this.consumeInventoryFood('initial-reserve', units) === units;
  }
}
