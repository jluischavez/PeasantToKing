import type { EconomicHistory } from './EconomicHistory';
import { isProductId, marketProductIds, productFlags, productIds } from './Products.ts';
import type { ProductId, ProductFlags } from './Products';
// Integer units preserve all current production fractions and food consumption.
export const unitsPerResource = 30;
export type StoredResource = ProductId;
export type Goods = Record<StoredResource, number>;
type InventoryKind = 'reserve' | 'construction-reserve' | 'warehouse' | 'market' | 'production' | 'consumer';
export type InventoryAccess = {
  kind: InventoryKind;
  capacity: number;
  network: string | null;
  operational: boolean;
};
type Inventory = InventoryAccess & { goods: Goods; products: ProductFlags; auditId: string; draining: boolean };

export class Inventories {
  private readonly entries = new Map<string, Inventory>();

  private readonly history?: EconomicHistory;

  constructor(history?: EconomicHistory) {
    this.history = history;
  }

  create(id: string, access: InventoryAccess, goods: Goods = { food: 0, wood: 0 }, auditId = id): void {
    if (this.entries.has(id)) throw new Error('Inventory already exists: ' + id);
    if (![access.capacity, goods.food, goods.wood].every(value => Number.isSafeInteger(value) && value >= 0)
      || goods.food + goods.wood > access.capacity) throw new Error('Invalid inventory');
    this.entries.set(id, { ...access, auditId, draining: false, goods: { ...goods },
      products: productFlags(access.kind === 'market' ? marketProductIds : productIds) });
    if (access.kind === 'production' && this.history) {
      for (const resource of productIds) {
        if (goods[resource] > 0) this.history.record({
          resource, units: goods[resource], origin: 'production', destination: auditId,
          operation: 'production', destinationBalance: { before: 0, after: goods[resource] },
        });
      }
    }
  }

  snapshot(id: string): (InventoryAccess & { goods: Readonly<Goods>; products: Readonly<ProductFlags>; used: number; free: number; draining: boolean }) | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const used = entry.goods.food + entry.goods.wood;
    const { auditId: _auditId, ...inventory } = entry;
    return { ...inventory, goods: { ...entry.goods }, products: { ...entry.products }, used, free: entry.capacity - used };
  }

  setAccess(id: string, network: string | null, operational: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('Unknown inventory: ' + id);
    entry.network = network;
    entry.operational = operational;
  }

  isProductEnabled(id: string, product: ProductId): boolean {
    return isProductId(product) && this.entries.get(id)?.products[product] === true;
  }

  setDraining(id: string, draining: boolean): boolean {
    const entry = this.entries.get(id);
    if (entry?.kind !== 'warehouse') return false;
    entry.draining = draining;
    return true;
  }

  acceptsIncoming(id: string, product: ProductId): boolean {
    const entry = this.entries.get(id);
    return !!entry?.operational && !entry.draining && this.isProductEnabled(id, product);
  }

  // For warehouses this means acceptance; for markets it authorizes both
  // replenishment and sales. Existing goods are never modified by configuration.
  setProductEnabled(id: string, product: ProductId, enabled: boolean): boolean {
    const entry = this.entries.get(id);
    if (!entry || !isProductId(product) || typeof enabled !== 'boolean') return false;
    if (entry.kind !== 'warehouse' && entry.kind !== 'market') return false;
    if (entry.kind === 'market' && !marketProductIds.includes(product)) return false;
    entry.products[product] = enabled;
    return true;
  }

  // All movement, including consumption, passes through this atomic operation.
  // Quantities are integer units, never rounded during a transfer.
  transfer(sourceId: string, destinationId: string, resource: StoredResource, units: number): boolean {
    const source = this.entries.get(sourceId);
    const destination = this.entries.get(destinationId);
    if (!source || !destination || sourceId === destinationId
      || !Number.isSafeInteger(units) || units <= 0
      || !isProductId(resource)
      || !source.operational || !destination.operational) return false;
    const allowed = (source.kind === 'reserve' && destination.kind === 'consumer')
      || (source.kind === 'production' && destination.kind === 'warehouse')
      || (source.kind === 'warehouse' && (destination.kind === 'warehouse' || destination.kind === 'market'))
      || (source.kind === 'market' && destination.kind === 'consumer' && marketProductIds.includes(resource));
    if (!allowed || (destination.kind === 'market' && !marketProductIds.includes(resource))) return false;
    if ((destination.kind === 'warehouse' || destination.kind === 'market')
      && !this.acceptsIncoming(destinationId, resource)) return false;
    if (source.kind === 'market' && !this.isProductEnabled(sourceId, resource)) return false;
    if (destination.kind !== 'consumer'
      && (source.network === null || source.network !== destination.network)) return false;
    const free = destination.capacity - destination.goods.food - destination.goods.wood;
    if (source.goods[resource] < units || free < units) return false;
    source.goods[resource] -= units;
    destination.goods[resource] += units;
    const consumed = destination.kind === 'consumer';
    this.history?.record({
      resource, units, origin: source.auditId, destination: destination.auditId,
      operation: consumed ? 'consumption' : 'transfer',
      originBalance: { before: source.goods[resource] + units, after: source.goods[resource] },
      destinationBalance: consumed ? undefined
        : { before: destination.goods[resource] - units, after: destination.goods[resource] },
    });
    return true;
  }

  private *constructionWoodSources(): Iterable<Inventory> {
    const reserve = this.entries.get('construction-reserve');
    if (reserve) yield reserve;
    for (const entry of this.entries.values()) {
      if (entry.kind === 'warehouse' && entry.operational && entry.network !== null) yield entry;
    }
  }

  get availableConstructionWoodUnits(): number {
    let units = 0;
    for (const source of this.constructionWoodSources()) units += source.goods.wood;
    return units;
  }

  spendConstructionWood(units: number, destination: string): boolean {
    if (!Number.isSafeInteger(units) || units < 0 || units > this.availableConstructionWoodUnits) return false;
    if (units === 0) return true;
    // The full amount is available before any source is debited.
    for (const source of this.constructionWoodSources()) {
      const before = source.goods.wood;
      const quantity = Math.min(units, before);
      if (quantity === 0) continue;
      source.goods.wood -= quantity;
      this.history?.record({
        operation: 'construction-material', resource: 'wood', units: quantity,
        origin: source.auditId, destination, originBalance: { before, after: source.goods.wood },
      });
      units -= quantity;
      if (units === 0) break;
    }
    return true;
  }

  removeEmptyBuilding(id: string): void {
    const entry = this.entries.get(id);
    if ((entry?.kind !== 'warehouse' && entry?.kind !== 'market')
      || productIds.some(product => entry.goods[product] !== 0)) {
      throw new Error('Only empty building inventories can be removed: ' + id);
    }
    this.entries.delete(id);
  }

  discardTransient(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.kind !== 'production' && entry?.kind !== 'consumer') {
      throw new Error('Only production batches and consumed goods can be discarded');
    }
    this.entries.delete(id);
  }
}
