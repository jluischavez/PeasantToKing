import type { Cell } from '../map/CellSelection';
import type { ConstructionMap } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import { LogisticsRoutes } from '../map/LogisticsRoutes.ts';
import { check, list, whole } from '../persistence/validation.ts';
import { unitsPerResource } from './Inventories.ts';
import type { Inventories } from './Inventories';
import type { ProductId } from './Products';

export const logisticsRules = { capacity: 12 * unitsPerResource, maxTripsPerProducer: 8,
  deliveryCapacity: 30 * unitsPerResource, deliveryLoadingMs: 1000,
  loadingMs: 2000, unloadingMs: 1000, msPerTile: 350, maxSprites: 96 } as const;
type TransportKind = 'producer-to-warehouse' | 'warehouse-to-market' | 'warehouse-to-warehouse' | 'household-purchase';
export type Transport = {
  id: number; npc: string; kind: TransportKind; source: Cell; destination: Cell;
  resource: ProductId; units: number; capacity: number; route: Cell[]; index: number;
  phaseMs: number; state: 'WalkingToSource' | 'Loading' | 'Carrying' | 'Unloading' | 'Blocked';
  createdMs: number; pickupMs: number | null; revision: number;
};
export type Journey = Omit<Transport, 'kind' | 'resource' | 'capacity' | 'pickupMs'> & {
  kind: 'immigration' | 'water-service'; resource: 'luggage' | 'water';
};
type JourneyEvent = Pick<Journey, 'id' | 'kind' | 'source' | 'destination' | 'units' | 'createdMs'> & {
  completedMs: number; result: 'completed' | 'cancelled';
};
function moveOnRoad(op: Pick<Transport, 'route' | 'index' | 'phaseMs'>): boolean {
  while (op.phaseMs >= logisticsRules.msPerTile && op.index < op.route.length - 1) {
    op.phaseMs -= logisticsRules.msPerTile; op.index++;
  }
  return op.index === op.route.length - 1;
}
const same = (a: Cell, b: Cell) => a.column === b.column && a.row === b.row;
export const cargoId = (id: number) => `cargo:${id}`;
const warehouseId = (cell: Cell) => `warehouse:${cell.column},${cell.row}`;
const destinationId = (op: Pick<Transport, 'kind' | 'destination'>) =>
  `${op.kind === 'household-purchase' ? 'home-stock' : op.kind === 'warehouse-to-market' ? 'market' : 'warehouse'}:${op.destination.column},${op.destination.row}`;
const sourceId = (op: Transport) => `${op.kind === 'household-purchase' ? 'market' : 'warehouse'}:${op.source.column},${op.source.row}`;
// A fixed packing stride preserves coordinates when legacy 20×20 worlds expand to 100×100.
const pathStride = 1024;

// Cargo stays in the central ledger from production through unloading. Only this
// model can settle a delivery; camera, sprites and visual limits have no authority.
export class Logistics {
  readonly journeys: Journey[] = [];
  readonly journeyHistory: JourneyEvent[] = [];
  activityValid?: (journey: Journey) => boolean;
  arrivalResidents?: (cell: Cell) => number;
  private readonly waterWindows = new Map<string, number>();
  onPurchase?: (market: string, household: string, units: number, product: ProductId) => void;
  readonly operations: Transport[] = [];
  private sequence = 0;
  private time = 0;
  private stoppedSources: Cell[] = [];
  private routes: LogisticsRoutes | null = null;
  private map: ConstructionMap | null = null;
  private connections: RoadConnections | null = null;
  private workforce: { workersAt(cell: Cell): number } | null = null;
  constructor(private readonly inventories: Inventories) {}

  sync(map: ConstructionMap, connections: RoadConnections, workforce: { workersAt(cell: Cell): number }): void {
    if (this.map !== map) this.routes = new LogisticsRoutes(map);
    this.map = map; this.connections = connections; this.workforce = workforce;
  }
  reconcile(includeMarkets = true): void {
    // Access and workforce must be rebuilt before validating restored or reconnected trips.
    for (const op of this.operations) if ((op.state === 'Blocked' || op.revision !== this.connections!.topologyRevision)
      && (includeMarkets || (op.kind !== 'warehouse-to-market' && op.kind !== 'household-purchase'))) this.validateRoute(op);
  }
  route(source: Cell, destination: Cell): Cell[] | null {
    return this.routes?.find(source, destination, this.connections!.topologyRevision) ?? null;
  }
  queueArrival(home: Cell, residents: number): void {
    if (!this.map?.villageCenter || this.map.getConstruction(home) !== 'house'
      || [...this.journeys, ...this.journeyHistory].some(j => j.kind === 'immigration'
        && j.createdMs === this.time && same(j.destination, home))) return;
    const pending = this.journeys.filter(j => j.kind === 'immigration' && same(j.destination, home)).reduce((n, j) => n + j.units, 0);
    if (this.arrivalResidents) residents = Math.min(residents, this.arrivalResidents(home) - pending);
    const entry = this.map!.kingdomRoad?.entry.cell;
    const candidates = entry ? [entry] : [...this.map!.borderRoads(this.map!.villageCenter!)];
    let start = candidates[0], path: Cell[] | null = null;
    for (const source of candidates) {
      const route = this.routes!.find(source, home, this.connections!.topologyRevision, true);
      if (route && (!path || route.length < path.length)) { start = source; path = route; }
    }
    if (!start || !whole(residents, 1)) return;
    this.addJourney('immigration', start, home, residents, path);
  }
  queueWater(well: Cell, home: Cell, residents: number): void {
    if (this.map?.getConstruction(well) !== 'well' || this.map.getConstruction(home) !== 'house'
      || this.workforce!.workersAt(well) <= 0 || !this.connections!.isConnected(well) || !whole(residents, 1, 30)) return;
    const window = Math.floor(this.time / 10000), key = `${well.column},${well.row}>${home.column},${home.row}`;
    if (this.waterWindows.get(key) === window || this.journeys.some(j => j.kind === 'water-service' && same(j.source, well))) return;
    const route = this.route(well, home);
    if (!route) return;
    this.waterWindows.set(key, window); this.addJourney('water-service', well, home, residents, route);
    for (const [id, previous] of this.waterWindows) if (previous < window - 1) this.waterWindows.delete(id);
  }
  requestWater(assignments: readonly { well: Cell; home: Cell; residents: number }[]): void {
    const busy = new Set(this.journeys.filter(j => j.kind === 'water-service').map(j => `${j.source.column},${j.source.row}`));
    const chosen = new Map<string, { well: Cell; home: Cell; residents: number; last: number }>();
    const window = Math.floor(this.time / 10000);
    for (const assignment of assignments) {
      const id = `${assignment.well.column},${assignment.well.row}`;
      if (busy.has(id)) continue;
      const last = this.waterWindows.get(`${id}>${assignment.home.column},${assignment.home.row}`) ?? -1;
      if (last === window || (chosen.has(id) && chosen.get(id)!.last <= last)) continue;
      chosen.set(id, { ...assignment, last });
    }
    for (const assignment of chosen.values()) this.queueWater(assignment.well, assignment.home, assignment.residents);
  }
  private addJourney(kind: Journey['kind'], source: Cell, destination: Cell, units: number, route: Cell[] | null): void {
    const id = this.sequence + 1;
    const journey: Journey = { id, npc: `carrier:${id}`, kind, source: { ...source }, destination: { ...destination },
      resource: kind === 'immigration' ? 'luggage' : 'water', units, route: route ?? [], index: 0,
      phaseMs: 0, state: route ? 'Carrying' : 'Blocked', createdMs: this.time, revision: this.connections!.topologyRevision };
    if (kind === 'water-service' && this.activityValid && !this.activityValid(journey)) return;
    this.sequence = id; this.journeys.push(journey);
  }
  private finishJourney(index: number, result: JourneyEvent['result']): void {
    const j = this.journeys[index];
    this.journeyHistory.push({ id: j.id, kind: j.kind, source: j.source, destination: j.destination,
      units: j.units, createdMs: j.createdMs, completedMs: this.time, result });
    if (this.journeyHistory.length > 128) this.journeyHistory.shift();
    this.journeys.splice(index, 1);
  }
  reconcileJourneys(): void {
    const incoming = new Map<string, number>();
    for (let i = this.journeys.length - 1; i >= 0; i--) {
      const j = this.journeys[i], id = `${j.destination.column},${j.destination.row}`;
      if (this.map!.getConstruction(j.destination) !== 'house' || (this.activityValid && !this.activityValid(j))) { this.finishJourney(i, 'cancelled'); continue; }
      if (j.kind === 'immigration') {
        const count = (incoming.get(id) ?? 0) + j.units;
        if (this.arrivalResidents && count > this.arrivalResidents(j.destination)) { this.finishJourney(i, 'cancelled'); continue; }
        incoming.set(id, count);
      }
      if (j.revision !== this.connections!.topologyRevision || j.state === 'Blocked') {
        const current = j.route[j.index];
        const route = current ? this.routes!.find(current, j.destination, this.connections!.topologyRevision, true)
          : j.kind === 'immigration' ? this.routes!.find(j.source, j.destination, this.connections!.topologyRevision, true) : this.route(j.source, j.destination);
        if (!route) { j.state = 'Blocked'; continue; }
        j.route = route; j.index = 0; j.phaseMs = 0; j.state = 'Carrying'; j.revision = this.connections!.topologyRevision;
      }
    }
  }
  canProduce(source: Cell): boolean {
    return !this.stoppedSources.some(cell => same(cell, source))
      && this.operations.filter(op => same(op.source, source)).length < logisticsRules.maxTripsPerProducer;
  }
  stopForDemolition(cell: Cell): void { this.stoppedSources = [{ ...cell }]; }
  cancelDemolition(): void { this.stoppedSources = []; }
  acceptsDestination(cell: Cell): boolean { return !this.stoppedSources.some(stopped => same(stopped, cell)); }
  slotsAt(source: Cell): number { return logisticsRules.maxTripsPerProducer - this.operations.filter(op => same(op.source, source)).length; }
  incoming(cell: Cell, resource: ProductId, market = false): number {
    let units = 0;
    for (const op of this.operations) if (same(cell, op.destination) && op.resource === resource
      && (op.kind === 'warehouse-to-market') === market) units += op.units;
    return units;
  }
  at(cell: Cell) {
    let pending = 0, inTransit = 0, blocked = 0;
    for (const op of this.operations) {
      if (!same(op.source, cell)) continue;
      if (op.pickupMs === null) pending += op.units; else inTransit += op.units;
      if (op.state === 'Blocked') blocked++;
    }
    return { pending: pending / unitsPerResource, inTransit: inTransit / unitsPerResource, blocked,
      dispatchStopped: this.stoppedSources.some(stopped => same(stopped, cell)) };
  }
  queue(source: Cell, destination: Cell, resource: ProductId, units: number, time: number): boolean {
    const route = this.route(source, destination);
    const target = this.inventories.snapshot(warehouseId(destination));
    if (!route || !this.canProduce(source) || !this.acceptsDestination(destination)
      || !whole(units, 1, logisticsRules.capacity) || !target || target.free < units
      || !this.inventories.acceptsIncoming(warehouseId(destination), resource)
      || target.network !== this.connections!.networkFor(source) || this.workforce!.workersAt(source) <= 0
      || this.map!.getConstruction(source) !== (resource === 'food' ? 'farm' : 'lumberjack')) return false;
    let op = this.operations.find(item => same(item.source, source) && same(item.destination, destination)
      && item.resource === resource && item.state === 'Loading' && item.units + units <= item.capacity);
    if (!op) {
      const id = ++this.sequence;
      op = { id, npc: `carrier:${id}`, kind: 'producer-to-warehouse', source: { ...source }, destination: { ...destination },
        resource, units: 0, capacity: logisticsRules.capacity, route, index: 0, phaseMs: 0,
        state: 'Loading', createdMs: time, pickupMs: null, revision: this.connections!.topologyRevision };
      this.inventories.create(cargoId(id), { kind: 'production', capacity: op.capacity,
        network: this.connections!.networkFor(source), operational: true }, undefined,
        `${resource === 'food' ? 'farm' : 'lumberjack'}:${source.column},${source.row}`);
      this.operations.push(op);
    }
    if (!this.inventories.produce(cargoId(op.id), resource, units)) throw new Error('Invalid production cargo');
    op.units += units;
    this.reserve(op, units);
    return true;
  }
  queueTransfer(source: Cell, destination: Cell, resource: ProductId, requested: number, market: boolean): number {
    const kind: TransportKind = market ? 'warehouse-to-market' : 'warehouse-to-warehouse';
    const sourceId = warehouseId(source), targetId = destinationId({ kind, destination });
    const stock = this.inventories.snapshot(sourceId), target = this.inventories.snapshot(targetId);
    const route = this.route(source, destination);
    if (!whole(requested, 1) || !stock?.operational || !target?.operational || stock.network !== target.network
      || !route || same(source, destination) || this.slotsAt(source) <= 0 || !this.acceptsDestination(destination)
      || (market && !stock.marketDispatch[resource])
      || !this.inventories.acceptsIncoming(targetId, resource)
      || this.map!.getConstruction(source) !== 'warehouse'
      || this.map!.getConstruction(destination) !== (market ? 'market' : 'warehouse')) return 0;
    const units = Math.min(requested, stock.available[resource], target.free, logisticsRules.deliveryCapacity);
    if (units <= 0) return 0;
    const id = ++this.sequence;
    const op: Transport = { id, npc: `carrier:${id}`, kind, source: { ...source }, destination: { ...destination },
      resource, units, capacity: logisticsRules.deliveryCapacity, route, index: 0, phaseMs: 0,
      state: 'Loading', createdMs: this.time, pickupMs: null, revision: this.connections!.topologyRevision };
    this.inventories.create(cargoId(id), { kind: 'transit', destinationKind: market ? 'market' : 'warehouse',
      capacity: op.capacity, network: stock.network, operational: true });
    this.inventories.reserveOutgoing(sourceId, resource, this.inventories.outgoing(sourceId, resource) + units);
    this.operations.push(op); this.reserve(op, units);
    return units;
  }
  queuePurchase(home: Cell, market: Cell, resource: ProductId, requested: number): number {
    if (this.operations.some(op => op.kind === 'household-purchase' && same(op.destination, home) && op.resource === resource)) return 0;
    const stockId = `market:${market.column},${market.row}`, stock = this.inventories.snapshot(stockId);
    const homeId = `home-stock:${home.column},${home.row}`, target = this.inventories.snapshot(homeId);
    const route = this.route(home, market);
    if (!route || !whole(requested, 1) || !stock?.operational || !stock.products[resource]
      || !target || !this.connections!.isConnected(home) || !this.acceptsDestination(home)) return 0;
    const units = Math.min(requested, stock.available[resource], target.free, logisticsRules.deliveryCapacity);
    if (units <= 0) return 0;
    const id = ++this.sequence;
    const op: Transport = { id, npc: `carrier:${id}`, kind: 'household-purchase', source: { ...market }, destination: { ...home },
      resource, units, capacity: logisticsRules.deliveryCapacity, route, index: 0, phaseMs: 0,
      state: 'WalkingToSource', createdMs: this.time, pickupMs: null, revision: this.connections!.topologyRevision };
    this.inventories.create(cargoId(id), { kind: 'transit', destinationKind: 'household', capacity: op.capacity,
      network: stock.network, operational: true });
    this.inventories.reserveOutgoing(stockId, resource, this.inventories.outgoing(stockId, resource) + units);
    this.operations.push(op); this.reserve(op, units); return units;
  }
  private reserve(op: Pick<Transport, 'kind' | 'destination'>, units: number): void {
    const id = destinationId(op);
    this.inventories.reserveIncoming(id, this.inventories.reserved(id) + units);
  }
  goods() {
    const goods = { food: 0, wood: 0 };
    for (const op of this.operations) if (op.kind === 'producer-to-warehouse' || op.pickupMs !== null) goods[op.resource] += op.units;
    return goods;
  }
  demolitionIssue(cell: Cell): string | null {
    return this.operations.some(op => same(cell, op.source) || same(cell, op.destination))
      ? 'Hay mercancías pendientes o en tránsito. Se detiene la producción o recepción nueva; espera las entregas y vuelve a intentarlo. Cancelar modo reactiva el flujo.' : null;
  }
  advance(delta: number, time: number): void {
    this.time = time;
    this.reconcileJourneys();
    for (let i = this.journeys.length - 1; i >= 0; i--) {
      const j = this.journeys[i];
      if (j.state === 'Blocked') continue;
      j.phaseMs += delta;
      if (j.state === 'Carrying' && moveOnRoad(j)) { j.state = 'Unloading'; j.phaseMs = 0; }
      else if (j.state === 'Unloading' && j.phaseMs >= logisticsRules.unloadingMs) this.finishJourney(i, 'completed');
    }
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i];
      if (!this.validateRoute(op)) continue;
      const target = this.inventories.snapshot(destinationId(op));
      const source = op.kind === 'producer-to-warehouse' ? null : this.inventories.snapshot(sourceId(op));
      op.phaseMs += delta;
      if (op.state === 'Loading') {
        if (op.phaseMs < (op.kind === 'producer-to-warehouse' ? logisticsRules.loadingMs : logisticsRules.deliveryLoadingMs)) continue;
        if (op.kind !== 'producer-to-warehouse') {
          const id = sourceId(op);
          this.inventories.reserveOutgoing(id, op.resource, this.inventories.outgoing(id, op.resource) - op.units);
          this.inventories.setAccess(cargoId(op.id), source!.network, true);
          if (!this.inventories.transfer(id, cargoId(op.id), op.resource, op.units)) {
            this.inventories.reserveOutgoing(id, op.resource, this.inventories.outgoing(id, op.resource) + op.units);
            op.state = 'Blocked'; op.phaseMs = 0;
            continue;
          }
        }
        op.phaseMs = 0; op.pickupMs = time; op.state = 'Carrying';
        if (op.kind === 'household-purchase') {
          this.onPurchase?.(sourceId(op), `house:${op.destination.column},${op.destination.row}`, op.units, op.resource);
          const route = this.routes!.find(op.route[op.index], op.destination, this.connections!.topologyRevision, true);
          if (!route) { op.state = 'Blocked'; continue; }
          op.route = route; op.index = 0;
        }
        if (op.kind === 'producer-to-warehouse') this.inventories.logisticsPickup(cargoId(op.id), op.resource, op.units,
          `${op.resource === 'food' ? 'farm' : 'lumberjack'}:${op.source.column},${op.source.row}`);
      } else if (op.state === 'Carrying' || op.state === 'WalkingToSource') {
        if (moveOnRoad(op)) {
          op.state = op.state === 'WalkingToSource' ? 'Loading' : 'Unloading';
          if (op.state === 'Loading') { op.route = [op.route[op.index]]; op.index = 0; }
          op.phaseMs = 0;
        }
      } else if (op.state === 'Unloading' && op.phaseMs >= logisticsRules.unloadingMs) {
        this.reserve(op, -op.units);
        this.inventories.setAccess(cargoId(op.id), target!.network, true);
        if (this.inventories.transfer(cargoId(op.id), destinationId(op), op.resource, op.units)) {
          this.inventories.discardTransient(cargoId(op.id)); this.operations.splice(i, 1);
        } else { this.reserve(op, op.units); op.state = 'Blocked'; }
      }
    }
  }
  private validateRoute(op: Transport): boolean {
    const target = this.inventories.snapshot(destinationId(op));
    const source = op.kind === 'producer-to-warehouse' ? null : this.inventories.snapshot(sourceId(op));
    const eligible = !!target?.operational && this.inventories.acceptsIncoming(destinationId(op), op.resource)
      && (op.kind !== 'household-purchase' || this.connections!.isConnected(op.destination))
      && (op.pickupMs !== null || (this.workforce!.workersAt(op.source) > 0 && this.connections!.isConnected(op.source)
        && (op.kind === 'producer-to-warehouse' || (!!source?.operational
          && (op.kind !== 'household-purchase' || source.products[op.resource])
          && (op.kind !== 'warehouse-to-market' || source.marketDispatch[op.resource])))));
    if (!eligible) { op.state = 'Blocked'; return false; }
    if (op.revision !== this.connections!.topologyRevision || op.state === 'Blocked') {
      const walkingOut = op.kind === 'household-purchase' && op.pickupMs === null;
      const route = walkingOut ? this.routes!.find(op.route[op.index], op.source, this.connections!.topologyRevision, true)
        : op.pickupMs === null ? this.route(op.source, op.destination)
        : this.routes!.find(op.route[op.index], op.destination, this.connections!.topologyRevision, true);
      if (!route) { op.state = 'Blocked'; return false; }
      op.route = route; op.index = 0; op.phaseMs = 0; op.revision = this.connections!.topologyRevision;
      op.state = walkingOut ? (route.length === 1 ? 'Loading' : 'WalkingToSource') : op.pickupMs === null ? 'Loading' : 'Carrying';
    }
    return true;
  }
  saveState() {
    // Deduplicate routes and encode each tile as one integer, only at save time.
    const paths: number[][] = [], known = new Map<string, number>();
    const operations = this.operations.map(({ route, ...operation }) => {
      const encoded = route.map(cell => cell.row * pathStride + cell.column);
      const key = encoded.join(',');
      let path = known.get(key);
      if (path === undefined) { path = paths.length; known.set(key, path); paths.push(encoded); }
      return { ...structuredClone(operation), path };
    });
    const journeys = this.journeys.map(({ route, ...journey }) => {
      const encoded = route.map(cell => cell.row * pathStride + cell.column), key = encoded.join(',');
      let path = known.get(key);
      if (path === undefined) { path = paths.length; known.set(key, path); paths.push(encoded); }
      return { ...structuredClone(journey), path };
    });
    return { sequence: this.sequence, operations, paths, stoppedSources: structuredClone(this.stoppedSources),
      ...(journeys.length > 0 && { journeys }), ...(this.journeyHistory.length > 0 && { journeyHistory: structuredClone(this.journeyHistory) }),
      ...(this.waterWindows.size > 0 && { waterWindows: [...this.waterWindows] }) };
  }
  restoreState(state: ReturnType<Logistics['saveState']> | undefined, time: number): void {
    this.time = time;
    if (state === undefined) return;
    list(state.stoppedSources, 1);
    for (const cell of state.stoppedSources) check(whole(cell.column, 0, this.map!.columns - 1) && whole(cell.row, 0, this.map!.rows - 1));
    this.stoppedSources = structuredClone(state.stoppedSources);
    check(whole(state.sequence)); list(state.operations, this.map!.columns * this.map!.rows * logisticsRules.maxTripsPerProducer);
    list(state.journeys ?? [], this.map!.columns * this.map!.rows * 4);
    list(state.paths, state.operations.length + (state.journeys?.length ?? 0));
    const paths = state.paths.map(path => {
      list(path, this.map!.columns * this.map!.rows);
      return path.map(index => {
        check(whole(index, 0, pathStride * this.map!.rows - 1));
        return { column: index % pathStride, row: Math.floor(index / pathStride) };
      });
    });
    const ids = new Set<number>();
    const perProducer = new Map<string, number>();
    const usedPaths = new Set<number>();
    for (const { path, ...fields } of state.operations) {
      check(whole(path, 0, paths.length - 1)); usedPaths.add(path);
      const op: Transport = { ...fields, route: paths[path] };
      const producer = op.kind === 'household-purchase' ? `home:${op.destination.column},${op.destination.row}:${op.resource}` : `${op.source.column},${op.source.row}`;
      perProducer.set(producer, (perProducer.get(producer) ?? 0) + 1);
      check(perProducer.get(producer)! <= (op.kind === 'household-purchase' ? 1 : logisticsRules.maxTripsPerProducer));
      check(whole(op.id, 1, state.sequence) && !ids.has(op.id) && op.npc === `carrier:${op.id}`
        && ['producer-to-warehouse', 'warehouse-to-market', 'warehouse-to-warehouse', 'household-purchase'].includes(op.kind) && ['food', 'wood'].includes(op.resource)
        && this.map!.getConstruction(op.source) === (op.kind === 'household-purchase' ? 'market' : op.kind === 'producer-to-warehouse' ? (op.resource === 'food' ? 'farm' : 'lumberjack') : 'warehouse')
        && this.map!.getConstruction(op.destination) === (op.kind === 'household-purchase' ? 'house' : op.kind === 'warehouse-to-market' ? 'market' : 'warehouse')
        && !same(op.source, op.destination)
        && same(this.map!.constructionAt(op.source)!.cell, op.source)
        && same(this.map!.constructionAt(op.destination)!.cell, op.destination)
        && whole(op.units, 1, op.kind === 'producer-to-warehouse' ? logisticsRules.capacity : logisticsRules.deliveryCapacity)
        && op.capacity === (op.kind === 'producer-to-warehouse' ? logisticsRules.capacity : logisticsRules.deliveryCapacity)
        && ['WalkingToSource', 'Loading', 'Carrying', 'Unloading', 'Blocked'].includes(op.state)
        && whole(op.createdMs, 0, time) && (op.pickupMs === null || whole(op.pickupMs, op.createdMs, time))
        && (op.state !== 'Loading' || op.pickupMs === null)
        && (op.state !== 'Carrying' && op.state !== 'Unloading' || op.pickupMs !== null)
        && whole(op.phaseMs, 0, logisticsRules.loadingMs + 1000) && whole(op.revision));
      list(op.route, this.map!.columns * this.map!.rows);
      check(op.route.length > 0 && whole(op.index, 0, op.route.length - 1));
      check((op.state !== 'Loading' || (op.index === 0 && op.phaseMs < (op.kind === 'producer-to-warehouse'
        ? logisticsRules.loadingMs : logisticsRules.deliveryLoadingMs)))
        && (op.state !== 'WalkingToSource' || (op.kind === 'household-purchase' && op.pickupMs === null && op.phaseMs < logisticsRules.msPerTile))
        && (op.state !== 'Carrying' || op.phaseMs < logisticsRules.msPerTile)
        && (op.state !== 'Unloading' || (op.index === op.route.length - 1 && op.phaseMs < logisticsRules.unloadingMs)));
      const unique = new Set<string>();
      for (let j = 0; j < op.route.length; j++) {
        const c = op.route[j];
        check(whole(c.column, 0, this.map!.columns - 1) && whole(c.row, 0, this.map!.rows - 1));
        const key = `${c.column},${c.row}`;
        check(!unique.has(key)); unique.add(key);
        if (j > 0) check(Math.abs(c.column - op.route[j - 1].column) + Math.abs(c.row - op.route[j - 1].row) === 1);
        if (op.revision === this.connections!.topologyRevision) {
          check(['road', 'bridge'].includes(this.map!.getConstruction(c)!));
          if (j > 0) check(this.map!.roadTouches(c, op.route[j - 1]) && this.map!.roadTouches(op.route[j - 1], c));
        }
      }
      if (op.revision === this.connections!.topologyRevision) {
        const outward = op.kind === 'household-purchase' && op.pickupMs === null;
        check([...this.map!.borderRoads(outward ? op.source : op.destination)].some(cell => same(cell, op.route.at(-1)!)));
        if (op.pickupMs === null && !outward) check([...this.map!.borderRoads(op.source)].some(cell => same(cell, op.route[0])));
      }
      const stock = this.inventories.snapshot(cargoId(op.id));
      const pending = op.kind !== 'producer-to-warehouse' && op.pickupMs === null;
      check(stock && stock.kind === (op.kind === 'producer-to-warehouse' ? 'production' : 'transit') && stock.goods[op.resource] === (pending ? 0 : op.units)
        && stock.goods[op.resource === 'food' ? 'wood' : 'food'] === 0);
      if (pending) {
        const id = sourceId(op);
        this.inventories.reserveOutgoing(id, op.resource, this.inventories.outgoing(id, op.resource) + op.units);
      }
      ids.add(op.id); this.operations.push(structuredClone(op)); this.reserve(op, op.units);
    }
    const pendingArrivals = new Map<string, number>();
    for (const { path, ...fields } of state.journeys ?? []) {
      check(whole(path, 0, paths.length - 1)); usedPaths.add(path);
      const j: Journey = { ...fields, route: paths[path] };
      check(whole(j.id, 1, state.sequence) && !ids.has(j.id) && j.npc === `carrier:${j.id}`
        && ['immigration', 'water-service'].includes(j.kind) && j.resource === (j.kind === 'immigration' ? 'luggage' : 'water')
        && this.map!.getConstruction(j.destination) === 'house' && whole(j.units, 1, 30)
        && this.map!.contains(j.source) && (j.kind !== 'water-service' || this.map!.getConstruction(j.source) === 'well')
        && whole(j.createdMs, 0, time) && whole(j.revision) && ['Carrying', 'Unloading', 'Blocked'].includes(j.state)
        && whole(j.index, 0, Math.max(0, j.route.length - 1)) && whole(j.phaseMs, 0, 1000)
        && (j.route.length > 0 || (j.kind === 'immigration' && j.state === 'Blocked'))
        && (j.state !== 'Carrying' || j.phaseMs < logisticsRules.msPerTile)
        && (j.state !== 'Unloading' || (j.index === j.route.length - 1 && j.phaseMs < logisticsRules.unloadingMs)));
      if (j.kind === 'immigration') {
        const key = `${j.destination.column},${j.destination.row}`;
        pendingArrivals.set(key, (pendingArrivals.get(key) ?? 0) + j.units);
        if (this.arrivalResidents) check(pendingArrivals.get(key)! <= this.arrivalResidents(j.destination));
        const entry = this.map!.kingdomRoad?.entry.cell;
        if (entry) check(same(j.source, entry));
      }
      for (let k = 0; k < j.route.length; k++) {
        const cell = j.route[k]; check(this.map!.contains(cell));
        if (k > 0) check(Math.abs(cell.column - j.route[k - 1].column) + Math.abs(cell.row - j.route[k - 1].row) === 1);
        if (j.revision === this.connections!.topologyRevision) {
          check(['road', 'bridge'].includes(this.map!.getConstruction(cell)!));
          if (k > 0) check(this.map!.roadTouches(cell, j.route[k - 1]) && this.map!.roadTouches(j.route[k - 1], cell));
        }
      }
      if (j.route.length > 0 && j.revision === this.connections!.topologyRevision) {
        check([...this.map!.borderRoads(j.destination)].some(cell => same(cell, j.route.at(-1)!)));
      }
      ids.add(j.id); this.journeys.push(structuredClone(j));
    }
    list(state.journeyHistory ?? [], 128);
    for (const event of state.journeyHistory ?? []) {
      check(whole(event.id, 1, state.sequence) && !ids.has(event.id) && ['immigration', 'water-service'].includes(event.kind)
        && ['completed', 'cancelled'].includes(event.result) && whole(event.createdMs, 0, time)
        && whole(event.completedMs, event.createdMs, time) && whole(event.units, 1, 30)
        && this.map!.contains(event.source) && this.map!.contains(event.destination));
      ids.add(event.id); this.journeyHistory.push(structuredClone(event));
    }
    list(state.waterWindows ?? [], this.map!.columns * this.map!.rows * 4);
    for (const [key, window] of state.waterWindows ?? []) {
      check(typeof key === 'string' && /^\d+,\d+>\d+,\d+$/.test(key) && !this.waterWindows.has(key) && whole(window, 0, Math.floor(time / 10000)));
      const [well, home] = key.split('>');
      check(this.map!.cellAtKey(well) && this.map!.cellAtKey(home));
      this.waterWindows.set(key, window);
    }
    check(usedPaths.size === paths.length);
    for (const op of this.operations) {
      const stock = this.inventories.snapshot(destinationId(op))!;
      check(stock.used + this.inventories.reserved(destinationId(op)) <= stock.capacity);
    }
    this.sequence = state.sequence;
  }
  prepareInventories(state: ReturnType<Logistics['saveState']>): void {
    list(state.operations, this.map!.columns * this.map!.rows * logisticsRules.maxTripsPerProducer);
    for (const op of state.operations) {
      const producer = op.kind === 'producer-to-warehouse';
      check(whole(op.id, 1) && op.capacity === (producer ? logisticsRules.capacity : logisticsRules.deliveryCapacity));
      this.inventories.create(cargoId(op.id), { kind: producer ? 'production' : 'transit', capacity: op.capacity,
        ...(!producer && { destinationKind: op.kind === 'household-purchase' ? 'household' as const : op.kind === 'warehouse-to-market' ? 'market' as const : 'warehouse' as const }),
        network: null, operational: true }, undefined,
        producer && op.pickupMs === null ? `${op.resource === 'food' ? 'farm' : 'lumberjack'}:${op.source.column},${op.source.row}` : cargoId(op.id));
    }
  }
}
