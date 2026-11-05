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
}>;
type Warehouse = { id: string; cell: Cell; workers: number; workerCapacity: number; connected: boolean };
type Allocation = { destination: string; units: number };
type Workforce = Pick<Population, 'workersAt' | 'capacityFor'>;
const key = (cell: Cell): string => `warehouse:${cell.column},${cell.row}`;

export class Storage {
  readonly inventories = new Inventories();
  private readonly warehouses = new Map<string, Warehouse>();
  private connections: RoadConnections | null = null;
  private readonly producers = new Map<string, StoredResource>();

  constructor(initial: Goods) {
    this.inventories.create('initial-reserve', {
      kind: 'reserve', capacity: Number.MAX_SAFE_INTEGER, network: null, operational: true,
    }, initial);
  }

  sync(map: ConstructionMap, connections: RoadConnections, workforce: Workforce): void {
    this.connections = connections;
    this.producers.clear();
    for (const warehouse of this.warehouses.values()) {
      warehouse.connected = false;
      warehouse.workers = 0;
      this.inventories.setAccess(warehouse.id, null, false);
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
      connected: warehouse.connected, operational: inventory.operational,
    };
  }

  get initialFoodReserve(): number {
    return this.inventories.snapshot('initial-reserve')!.goods.food / unitsPerResource;
  }

  get totalsUnits(): Goods {
    const total = { ...this.inventories.snapshot('initial-reserve')!.goods };
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

  availableSpaces(): Map<string, number> {
    const spaces = new Map<string, number>();
    for (const warehouse of this.warehouses.values()) {
      const inventory = this.inventories.snapshot(warehouse.id)!;
      if (inventory.operational) spaces.set(warehouse.id, inventory.free);
    }
    return spaces;
  }

  // Plan a whole batch, possibly across multiple warehouses. Failed plans
  // neither reserve capacity nor create goods.
  planProduction(cell: Cell, units: number, spaces = this.availableSpaces()): Allocation[] | undefined {
    if (!this.producers.has(key(cell)) || !Number.isSafeInteger(units) || units <= 0) return undefined;
    const network = this.connections?.networkFor(cell);
    if (!network) return undefined;
    const plan: Allocation[] = [];
    let remaining = units;
    for (const [id, free] of spaces) {
      const inventory = this.inventories.snapshot(id);
      if (!inventory?.operational || inventory.network !== network) continue;
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
    }, { food: resource === 'food' ? units : 0, wood: resource === 'wood' ? units : 0 });
    for (const allocation of plan) {
      if (!this.inventories.transfer('production-batch', allocation.destination, resource, allocation.units)) {
        throw new Error('A validated production transfer failed');
      }
    }
    this.inventories.discardTransient('production-batch');
    return true;
  }

  consumeFood(units: number): boolean {
    if (!Number.isSafeInteger(units) || units < 0) return false;
    if (units === 0) return true;
    this.inventories.create('food-consumption', {
      kind: 'consumer', capacity: units, network: null, operational: true,
    });
    let remaining = units;
    for (const id of ['initial-reserve', ...this.warehouses.keys()]) {
      const inventory = this.inventories.snapshot(id)!;
      if (!inventory.operational) continue;
      const quantity = Math.min(remaining, inventory.goods.food);
      if (quantity > 0 && this.inventories.transfer(id, 'food-consumption', 'food', quantity)) {
        remaining -= quantity;
      }
      if (remaining === 0) break;
    }
    this.inventories.discardTransient('food-consumption');
    return remaining === 0;
  }
}
