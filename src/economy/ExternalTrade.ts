import type { Cell } from '../map/CellSelection';
import type { ConstructionMap } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import { check, list, whole } from '../persistence/validation.ts';
import type { Population } from '../population/Population';
import { simulatedMsPerGameHour } from '../simulation/GameTime.ts';
import type { Economy } from './Economy';
import { unitsPerResource as U } from './Inventories.ts';
import type { Goods, TradeLine } from './Inventories';
import { centsPerGold } from './OperatingCosts.ts';
import { isProductId, productIds } from './Products.ts';
import type { ProductId } from './Products';

export const tradeRules = {
  intervalHours: 6, unitsPerWorker: 30, historyLimit: 60, maximumSetting: 1_000_000,
  protectedHours: 2,
  products: {
    food: { sell: 32, buy: 65, reserve: 150, target: 150 },
    wood: { sell: 48, buy: 90, reserve: 30, target: 30 },
  },
} as const;
export const tradeIntervalMs = tradeRules.intervalHours * simulatedMsPerGameHour;
export const tradeGold = (ticks: number): number => ticks / (centsPerGold * U);
export const tradeModes = ['off', 'export', 'import'] as const;
export type TradeMode = typeof tradeModes[number];
export type TradePreference = Readonly<{ mode: TradeMode; reserve: number; target: number }>;
type Preferences = Record<ProductId, TradePreference>;
type TradeHouse = { cell: Cell; nextAt: number; preferences: Preferences };
export type TradeTrip = Readonly<{
  timeMs: number; cell: Cell; sold: Readonly<Goods>; bought: Readonly<Goods>; exports: number; imports: number;
}>;
type TradeState = { houses: TradeHouse[]; trips: TradeTrip[]; exports: number; imports: number; exported?: Goods };
type Warehouse = { id: string; goods: Goods; free: number; accepts: Readonly<Record<ProductId, boolean>>;
  dispatch: Readonly<Record<ProductId, boolean>>; draining: boolean };
const key = ({ column, row }: Cell) => `${column},${row}`;
const initial = (product: ProductId): TradePreference => ({ mode: 'off', reserve: tradeRules.products[product].reserve,
  target: tradeRules.products[product].target });
const validPreference = (preference: TradePreference) => !!preference && tradeModes.includes(preference.mode)
  && whole(preference.reserve, 0, tradeRules.maximumSetting) && whole(preference.target, 0, tradeRules.maximumSetting);

export class ExternalTrade {
  private houses = new Map<string, TradeHouse>();
  private trips: TradeTrip[] = [];
  private exportTicks = 0;
  private importTicks = 0;
  private exported: Goods = { food: 0, wood: 0 };

  constructor(private readonly map: ConstructionMap, private readonly roads: RoadConnections,
    private readonly population: Population, private readonly economy: Economy,
    private readonly halted: () => boolean = () => false) {}

  get history(): readonly TradeTrip[] { return this.trips; }
  get totals() { return { exports: tradeGold(this.exportTicks), imports: tradeGold(this.importTicks) }; }
  get sites(): readonly Cell[] { return [...this.houses.values()].map(house => house.cell); }
  get exportedUnits(): Readonly<Goods> { return { ...this.exported }; }

  sync(timeMs: number): void {
    const houses = new Map<string, TradeHouse>();
    for (const { cell, type } of this.map.occupiedCells()) {
      if (type !== 'tradeHouse') continue;
      const id = key(cell);
      houses.set(id, this.houses.get(id) ?? { cell, nextAt: timeMs + tradeIntervalMs,
        preferences: { food: initial('food'), wood: initial('wood') } });
    }
    this.houses = houses;
  }

  configure(cell: Cell, product: ProductId, preference: TradePreference): boolean {
    const house = this.houses.get(key(cell));
    if (this.halted() || !house || !isProductId(product) || !validPreference(preference)) return false;
    house.preferences[product] = { ...preference };
    return true;
  }

  private issue(cell: Cell): string | null {
    if (this.halted()) return 'La partida ha terminado.';
    if (!this.map.kingdomRoad) return 'Este mapa carece de entrada exterior.';
    if (!this.roads.isConnected(cell)) return 'Sin conexión vial al Centro de Aldea.';
    if (!this.roads.reachesExterior(cell)) return 'Sin ruta vial hasta la entrada del reino.';
    if (this.population.workersAt(cell) === 0) return 'Sin empleados asignados.';
    return null;
  }

  private warehouses(network: string): Warehouse[] {
    const storage = this.economy.storage;
    return storage.commercialWarehouseIds(network, cell => this.roads.reachesExterior(cell)).map(id => {
      const stock = storage.inventories.snapshot(id)!;
      return { id, goods: { ...stock.available }, free: stock.free, accepts: stock.products,
        dispatch: stock.marketDispatch, draining: stock.draining };
    });
  }

  private exportFloor(product: ProductId, network: string): number {
    // Active houses share the strictest floor. Import targets also protect against automatic buy/sell loops.
    let reserve = 0;
    for (const house of this.houses.values()) {
      const { mode, target, reserve: minimum } = house.preferences[product];
      if (mode === 'off' || this.roads.networkFor(house.cell) !== network || this.issue(house.cell)) continue;
      reserve = Math.max(reserve, mode === 'export' ? minimum : target);
    }
    return reserve * U;
  }

  private metrics(warehouses: readonly Warehouse[], network: string, product: ProductId, preference: TradePreference) {
    const stock = warehouses.reduce((sum, warehouse) => sum + warehouse.goods[product], 0);
    const dispatchable = warehouses.reduce((sum, warehouse) => sum + (warehouse.dispatch[product] ? warehouse.goods[product] : 0), 0);
    const floor = Math.max(preference.reserve * U, this.exportFloor(product, network));
    const space = warehouses.reduce((sum, warehouse) => sum + (warehouse.accepts[product] && !warehouse.draining ? warehouse.free : 0), 0);
    return { stock, exportable: Math.max(0, dispatchable - floor), space, floor };
  }

  private plan(house: TradeHouse, network: string, capacity: number) {
    const warehouses = this.warehouses(network);
    const lines: TradeLine[] = [];
    const sold: Goods = { food: 0, wood: 0 }, bought: Goods = { food: 0, wood: 0 };
    let remaining = capacity * U, exports = 0, imports = 0;
    for (const product of productIds) {
      const preference = house.preferences[product];
      if (preference.mode !== 'export') continue;
      let quantity = Math.min(remaining, this.metrics(warehouses, network, product, preference).exportable);
      for (const warehouse of warehouses) {
        if (quantity === 0) break;
        if (!warehouse.dispatch[product] || warehouse.goods[product] === 0) continue;
        const units = Math.min(quantity, warehouse.goods[product]);
        lines.push({ warehouse: warehouse.id, product, units, direction: 'export' });
        warehouse.goods[product] -= units;
        warehouse.free += units;
        sold[product] += units;
        exports += units * tradeRules.products[product].sell;
        quantity -= units;
        remaining -= units;
      }
    }
    for (const product of productIds) {
      const preference = house.preferences[product];
      if (preference.mode !== 'import') continue;
      const { stock } = this.metrics(warehouses, network, product, preference);
      const price = tradeRules.products[product].buy;
      let quantity = Math.min(remaining, Math.max(0, preference.target * U - stock),
        Math.floor((this.economy.tradeBudgetTicks + exports - imports) / price));
      for (const warehouse of warehouses) {
        if (quantity === 0) break;
        if (!warehouse.accepts[product] || warehouse.draining || warehouse.free === 0) continue;
        const units = Math.min(quantity, warehouse.free);
        lines.push({ warehouse: warehouse.id, product, units, direction: 'import' });
        warehouse.goods[product] += units;
        warehouse.free -= units;
        bought[product] += units;
        imports += units * price;
        quantity -= units;
        remaining -= units;
      }
    }
    return { lines, sold, bought, exports, imports };
  }

  advance(timeMs: number): void {
    if (this.halted()) return;
    // Each house sees the committed warehouse balances from the preceding house.
    for (const house of this.houses.values()) {
      if (timeMs < house.nextAt) continue;
      house.nextAt = timeMs + tradeIntervalMs;
      if (this.issue(house.cell)) continue;
      const network = this.roads.networkFor(house.cell)!;
      const capacity = this.population.workersAt(house.cell) * tradeRules.unitsPerWorker;
      const { lines, sold, bought, exports, imports } = this.plan(house, network, capacity);
      const trader = 'tradeHouse:' + key(house.cell);
      if (!this.economy.storage.inventories.exchange(network, trader, lines, () => this.economy.settleTrade(trader, exports, imports))) continue;
      this.exportTicks += exports;
      this.importTicks += imports;
      for (const product of productIds) this.exported[product] += sold[product];
      this.trips.push({ timeMs, cell: house.cell, sold, bought, exports, imports });
      if (this.trips.length > tradeRules.historyLimit) this.trips.shift();
    }
  }

  at(cell: Cell) {
    const house = this.houses.get(key(cell));
    if (!house) return undefined;
    const network = this.roads.networkFor(cell) ?? '';
    const exterior = this.roads.reachesExterior(cell);
    const warehouses = exterior ? this.warehouses(network) : [];
    const workers = this.population.workersAt(cell);
    const products = Object.fromEntries(productIds.map(product => {
      const preference = house.preferences[product];
      const { stock, exportable, space, floor } = this.metrics(warehouses, network, product, preference);
      const status = preference.mode === 'off' ? 'Desactivado'
        : preference.mode === 'export' ? (exportable > 0 ? 'Hay excedente' : 'Sin excedente sobre la reserva')
        : stock >= preference.target * U ? 'Objetivo cubierto'
        : space === 0 ? 'Sin espacio compatible en almacenes'
        : this.economy.tradeBudgetTicks < tradeRules.products[product].buy ? 'Oro y crédito insuficientes'
        : 'Hay espacio para importar';
      return [product, { stock: stock / U, exportable: exportable / U, space: space / U, floor: floor / U, status }];
    })) as Record<ProductId, { stock: number; exportable: number; space: number; floor: number; status: string }>;
    return { ...house, workers, exterior, capacity: workers * tradeRules.unitsPerWorker, products,
      issue: this.issue(cell), lastTrip: [...this.trips].reverse().find(trip => key(trip.cell) === key(cell)) };
  }

  saveState(): TradeState {
    return { houses: [...this.houses.values()].map(house => ({ ...house, preferences: { ...house.preferences } })),
      trips: [...this.trips], exports: this.exportTicks, imports: this.importTicks, exported: { ...this.exported } };
  }

  restoreState(state: TradeState | undefined, timeMs: number, halted = false): void {
    if (state === undefined) {
      check(this.houses.size === 0);
      return;
    }
    check(state && typeof state === 'object');
    list(state.houses, this.houses.size);
    check(state.houses.length === this.houses.size && whole(state.exports) && whole(state.imports));
    const seen = new Set<string>();
    for (const { cell, nextAt, preferences } of state.houses) {
      const id = key(cell), house = this.houses.get(id);
      check(house && !seen.has(id) && whole(nextAt, timeMs + (halted ? 0 : 1)) && nextAt % 1000 === 0
        && preferences && productIds.every(product => validPreference(preferences[product])));
      house.nextAt = nextAt;
      house.preferences = { ...preferences };
      seen.add(id);
    }
    list(state.trips, tradeRules.historyLimit);
    let previous = 0, earned = 0, spent = 0;
    for (const trip of state.trips) {
      check(this.map.contains(trip.cell) && whole(trip.timeMs, previous, timeMs)
        && whole(trip.exports) && whole(trip.imports) && trip.exports + trip.imports > 0
        && productIds.every(product => whole(trip.sold[product]) && whole(trip.bought[product])));
      previous = trip.timeMs;
      earned += trip.exports;
      spent += trip.imports;
    }
    check(earned <= state.exports && spent <= state.imports);
    const recent = { food: 0, wood: 0 };
    for (const trip of state.trips) for (const product of productIds) recent[product] += trip.sold[product];
    const exported = state.exported ?? recent;
    check(productIds.every(product => whole(exported[product], recent[product])));
    check(exported.food * tradeRules.products.food.sell + exported.wood * tradeRules.products.wood.sell <= state.exports);
    this.exported = { ...exported };
    this.trips = [...state.trips];
    this.exportTicks = state.exports;
    this.importTicks = state.imports;
  }
}
