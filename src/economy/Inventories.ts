import { isProductId, marketProductIds, productFlags, productIds } from './Products.ts';
import type { ProductId, ProductFlags } from './Products';
// Integer units preserve all current production fractions and food consumption.
export const unitsPerResource = 30;
export type StoredResource = ProductId;
export type Goods = Record<StoredResource, number>;
type InventoryKind = 'reserve' | 'warehouse' | 'market' | 'production' | 'consumer';
export type InventoryAccess = {
  kind: InventoryKind;
  capacity: number;
  network: string | null;
  operational: boolean;
};
type Inventory = InventoryAccess & { goods: Goods; products: ProductFlags };

export class Inventories {
  private readonly entries = new Map<string, Inventory>();

  create(id: string, access: InventoryAccess, goods: Goods = { food: 0, wood: 0 }): void {
    if (this.entries.has(id)) throw new Error('Inventory already exists: ' + id);
    if (![access.capacity, goods.food, goods.wood].every(value => Number.isSafeInteger(value) && value >= 0)
      || goods.food + goods.wood > access.capacity) throw new Error('Invalid inventory');
    this.entries.set(id, { ...access, goods: { ...goods },
      products: productFlags(access.kind === 'market' ? marketProductIds : productIds) });
  }

  snapshot(id: string): (InventoryAccess & { goods: Readonly<Goods>; products: Readonly<ProductFlags>; used: number; free: number }) | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const used = entry.goods.food + entry.goods.wood;
    return { ...entry, goods: { ...entry.goods }, products: { ...entry.products }, used, free: entry.capacity - used };
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
      && !this.isProductEnabled(destinationId, resource)) return false;
    if (source.kind === 'market' && !this.isProductEnabled(sourceId, resource)) return false;
    if (destination.kind !== 'consumer'
      && (source.network === null || source.network !== destination.network)) return false;
    const free = destination.capacity - destination.goods.food - destination.goods.wood;
    if (source.goods[resource] < units || free < units) return false;
    source.goods[resource] -= units;
    destination.goods[resource] += units;
    return true;
  }

  discardTransient(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.kind !== 'production' && entry?.kind !== 'consumer') {
      throw new Error('Only production batches and consumed goods can be discarded');
    }
    this.entries.delete(id);
  }
}
