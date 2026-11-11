import { check, list, whole } from '../persistence/validation.ts';
import type { EconomicHistory } from './EconomicHistory';
import { isProductId, marketProductIds, productFlags, productIds } from './Products.ts';
import type { ProductId, ProductFlags } from './Products';
// Integer units preserve thirds in production and 1/50 wood per resident per simulated second.
export const unitsPerResource = 150;
export type StoredResource = ProductId;
export type Goods = Record<StoredResource, number>;
export type TradeLine = Readonly<{ warehouse: string; product: ProductId; units: number; direction: 'export' | 'import' }>;
type InventoryKind = 'reserve' | 'construction-reserve' | 'warehouse' | 'market' | 'household' | 'production' | 'transit' | 'consumer';
export type InventoryAccess = {
  kind: InventoryKind;
  capacity: number;
  network: string | null;
  operational: boolean;
  destinationKind?: 'warehouse' | 'market' | 'household';
};
type Inventory = InventoryAccess & {
  goods: Goods; outgoing: Goods; products: ProductFlags; marketDispatch: ProductFlags; auditId: string; draining: boolean;
};

export class Inventories {
  private readonly entries = new Map<string, Inventory>();
  private readonly incoming = new Map<string, number>();

  reserveIncoming(id: string, units: number): void {
    if (!Number.isSafeInteger(units) || units < 0) throw new Error('Invalid reservation');
    this.incoming.set(id, units);
  }

  reserved(id: string): number { return this.incoming.get(id) ?? 0; }

  reserveOutgoing(id: string, resource: StoredResource, units: number): void {
    const entry = this.entries.get(id);
    if (!entry || !whole(units) || units > entry.goods[resource]) throw new Error('Invalid outgoing reservation');
    entry.outgoing[resource] = units;
  }

  outgoing(id: string, resource: StoredResource): number { return this.entries.get(id)?.outgoing[resource] ?? 0; }

  produce(id: string, resource: StoredResource, units: number): boolean {
    const entry = this.entries.get(id);
    if (entry?.kind !== 'production' || !Number.isSafeInteger(units) || units <= 0
      || entry.goods.food + entry.goods.wood + units > entry.capacity) return false;
    const before = entry.goods[resource];
    entry.goods[resource] += units;
    this.history?.record({ resource, units, origin: 'production', destination: entry.auditId,
      operation: 'production', destinationBalance: { before, after: entry.goods[resource] } });
    return true;
  }

  logisticsPickup(id: string, resource: StoredResource, units: number, source: string): void {
    this.entries.get(id)!.auditId = id;
    this.history?.record({ resource, units, origin: source, destination: id, operation: 'transfer' });
  }

  private readonly history?: EconomicHistory;

  constructor(history?: EconomicHistory) {
    this.history = history;
  }

  create(id: string, access: InventoryAccess, goods: Goods = { food: 0, wood: 0 }, auditId = id): void {
    if (this.entries.has(id)) throw new Error('Inventory already exists: ' + id);
    if (![access.capacity, goods.food, goods.wood].every(value => Number.isSafeInteger(value) && value >= 0)
      || goods.food + goods.wood > access.capacity) throw new Error('Invalid inventory');
    this.entries.set(id, { ...access, auditId, draining: false, goods: { ...goods }, outgoing: { food: 0, wood: 0 }, marketDispatch: productFlags(),
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

  saveState() {
    return [...this.entries].map(([id, entry]) => {
      const { goods, products, marketDispatch, draining } = entry;
      return { id, goods: { ...goods }, products: { ...products }, draining,
        ...(entry.kind === 'warehouse' && { marketDispatch: { ...marketDispatch } }) };
    });
  }

  restoreState(state: ReturnType<Inventories['saveState']>): void {
    list(state, this.entries.size);
    check(state.length === this.entries.size);
    const ordered = new Map<string, Inventory>();
    for (const { id, goods, products, draining, marketDispatch } of state) {
      const entry = this.entries.get(id);
      check(entry && !ordered.has(id) && whole(goods.food) && whole(goods.wood)
        && goods.food + goods.wood <= entry.capacity
        && goods.food >= entry.outgoing.food && goods.wood >= entry.outgoing.wood
        && typeof products.food === 'boolean' && typeof products.wood === 'boolean'
        && typeof draining === 'boolean' && (!draining || entry.kind === 'warehouse')
        && (marketDispatch === undefined || (entry.kind === 'warehouse'
          && typeof marketDispatch?.food === 'boolean' && typeof marketDispatch.wood === 'boolean'))
        && (entry.kind !== 'reserve' || (goods.wood === 0 && goods.food <= entry.goods.food))
        && (entry.kind !== 'construction-reserve' || (goods.food === 0 && goods.wood <= entry.goods.wood)));
      ordered.set(id, { ...entry, goods: { food: goods.food, wood: goods.wood },
        products: { food: products.food, wood: products.wood }, draining,
        marketDispatch: marketDispatch ? { food: marketDispatch.food, wood: marketDispatch.wood } : productFlags() });
    }
    this.entries.clear();
    for (const [id, entry] of ordered) this.entries.set(id, entry);
  }

  snapshot(id: string): (InventoryAccess & {
    goods: Readonly<Goods>; products: Readonly<ProductFlags>; marketDispatch: Readonly<ProductFlags>;
    used: number; free: number; draining: boolean;
    available: Readonly<Goods>; outgoing: Readonly<Goods>;
  }) | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const used = entry.goods.food + entry.goods.wood;
    const { auditId: _auditId, ...inventory } = entry;
    return { ...inventory, goods: { ...entry.goods }, outgoing: { ...entry.outgoing },
      available: { food: entry.goods.food - entry.outgoing.food, wood: entry.goods.wood - entry.outgoing.wood }, products: { ...entry.products },
      marketDispatch: { ...entry.marketDispatch }, used, free: Math.max(0, entry.capacity - used - this.reserved(id)) };
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

  setMarketDispatch(id: string, product: ProductId, enabled: boolean): boolean {
    const entry = this.entries.get(id);
    if (entry?.kind !== 'warehouse' || !isProductId(product) || typeof enabled !== 'boolean') return false;
    entry.marketDispatch[product] = enabled;
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
    const allowed = (source.kind === 'reserve' && destination.kind === 'consumer' && resource === 'food')
      || (source.kind === 'production' && destination.kind === 'warehouse')
      || (source.kind === 'transit' && destination.kind === source.destinationKind)
      || (source.kind === 'warehouse' && destination.kind === 'transit')
      || (source.kind === 'market' && destination.kind === 'transit' && destination.destinationKind === 'household')
      || (source.kind === 'household' && destination.kind === 'consumer')
      || (source.kind === 'warehouse' && (destination.kind === 'warehouse' || destination.kind === 'market'))
      || (source.kind === 'market' && destination.kind === 'consumer' && marketProductIds.includes(resource));
    if (!allowed || (destination.kind === 'market' && !marketProductIds.includes(resource))) return false;
    if (source.kind === 'warehouse' && destination.kind === 'market' && !source.marketDispatch[resource]) return false;
    if (source.kind === 'warehouse' && destination.kind === 'transit'
      && destination.destinationKind === 'market' && !source.marketDispatch[resource]) return false;
    if ((destination.kind === 'warehouse' || destination.kind === 'market')
      && !this.acceptsIncoming(destinationId, resource)) return false;
    if (source.kind === 'market' && !this.isProductEnabled(sourceId, resource)) return false;
    if (destination.kind !== 'consumer'
      && (source.network === null || source.network !== destination.network)) return false;
    const free = destination.capacity - destination.goods.food - destination.goods.wood - this.reserved(destinationId);
    if (source.goods[resource] - source.outgoing[resource] < units || free < units) return false;
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

  // Validate the full manifest against shadow balances before settling gold or touching stock.
  exchange(network: string, trader: string, lines: readonly TradeLine[], settlePayment: () => boolean, purpose: 'trade' | 'mission' | 'royal-aid' = 'trade'): boolean {
    const balances = new Map<Inventory, Goods>();
    if (lines.length === 0) return false;
    for (const { warehouse, product, units, direction } of lines) {
      const entry = this.entries.get(warehouse);
      if (purpose === 'royal-aid' && direction !== 'import') return false;
      if (!entry || entry.kind !== 'warehouse' || !entry.operational || entry.network !== network
        || !isProductId(product) || !whole(units, 1)) return false;
      const goods = balances.get(entry) ?? { ...entry.goods };
      if (direction === 'export') {
        if (!entry.marketDispatch[product] || goods[product] - entry.outgoing[product] < units) return false;
        goods[product] -= units;
      } else {
        if (direction !== 'import' || !this.acceptsIncoming(warehouse, product)
          || units > entry.capacity - goods.food - goods.wood - this.reserved(warehouse)) return false;
        goods[product] += units;
      }
      balances.set(entry, goods);
    }
    if (!settlePayment()) return false;
    for (const { warehouse, product, units, direction } of lines) {
      const entry = this.entries.get(warehouse)!;
      const before = entry.goods[product];
      const exports = direction === 'export';
      entry.goods[product] += exports ? -units : units;
      const balance = { before, after: entry.goods[product] };
      this.history?.record({ resource: product, units, operation: purpose === 'royal-aid' ? 'royal-aid'
        : purpose === 'mission' ? (exports ? 'mission-delivery' : 'mission-reward') : direction,
        origin: exports ? entry.auditId : trader, destination: exports ? trader : entry.auditId,
        ...(exports ? { originBalance: balance } : { destinationBalance: balance }) });
    }
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
    for (const source of this.constructionWoodSources()) units += source.goods.wood - source.outgoing.wood;
    return units;
  }

  spendConstructionWood(units: number, destination: string): boolean {
    if (!Number.isSafeInteger(units) || units < 0 || units > this.availableConstructionWoodUnits) return false;
    if (units === 0) return true;
    // The full amount is available before any source is debited.
    for (const source of this.constructionWoodSources()) {
      const before = source.goods.wood;
      const quantity = Math.min(units, before - source.outgoing.wood);
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
    if ((entry?.kind !== 'warehouse' && entry?.kind !== 'market' && entry?.kind !== 'household')
      || this.reserved(id) > 0 || productIds.some(product => entry.goods[product] !== 0 || entry.outgoing[product] !== 0)) {
      throw new Error('Only empty building inventories can be removed: ' + id);
    }
    this.entries.delete(id);
  }

  discardTransient(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.kind !== 'production' && entry?.kind !== 'transit' && entry?.kind !== 'consumer') {
      throw new Error('Only production batches and consumed goods can be discarded');
    }
    if ((entry.kind === 'production' || entry.kind === 'transit') && entry.goods.food + entry.goods.wood > 0) {
      throw new Error('Production cargo must be delivered before removal');
    }
    this.entries.delete(id);
  }
}
