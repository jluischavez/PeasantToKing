import { check, label, list, whole } from '../persistence/validation.ts';
import type { ProductId } from './Products';

export type AuditResource = ProductId | 'gold';
export type AuditOperation = 'production' | 'transfer' | 'consumption' | 'sale' | 'construction' | 'construction-material' | 'demolition' | 'wages' | 'maintenance' | 'tax';
type Balance = Readonly<{ before: number; after: number }>;
type Movement = Readonly<{
  resource: AuditResource;
  units: number;
  unitScale?: number;
  origin: string;
  destination: string;
  operation: AuditOperation;
  originBalance?: Balance;
  destinationBalance?: Balance;
  household?: string;
  soldProduct?: ProductId;
}>;
export type EconomicEvent = Movement & Readonly<{ id: number; timeMs: number; result: 'completed' | 'unpaid' }>;

export class EconomicHistory {
  private readonly events: EconomicEvent[] = [];
  private sequence = 0;
  private readonly capacity: number;
  private readonly time: () => number;

  constructor(capacity = 200, time: () => number = () => 0) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('Invalid history capacity');
    this.capacity = capacity;
    this.time = time;
  }

  saveState() {
    return { sequence: this.sequence, events: [...this.events] };
  }

  restoreState(state: ReturnType<EconomicHistory['saveState']>, time: number): void {
    const { sequence, events } = state;
    list(events, this.capacity);
    check(whole(sequence) && events.length === Math.min(sequence, this.capacity) && (events.at(-1)?.id ?? 0) === sequence);
    let previousId = sequence - events.length;
    let previousTime = 0;
    const balance = (value?: Balance) => value === undefined || (whole(value.before) && whole(value.after));
    for (const event of events) {
      check(whole(event.id, 1) && event.id === ++previousId && whole(event.timeMs, previousTime, time)
        && ['food', 'wood', 'gold'].includes(event.resource) && whole(event.units, 1)
        && (event.unitScale === undefined || whole(event.unitScale, 1))
        && label(event.origin) && label(event.destination)
        && (event.household === undefined || label(event.household))
        && (event.soldProduct === undefined || ['food', 'wood'].includes(event.soldProduct))
        && ['completed', 'unpaid'].includes(event.result) && balance(event.originBalance) && balance(event.destinationBalance)
        && ['production', 'transfer', 'consumption', 'sale', 'construction', 'construction-material',
          'demolition', 'wages', 'maintenance', 'tax'].includes(event.operation));
      previousTime = event.timeMs;
    }
    this.sequence = sequence;
    this.events.splice(0, this.events.length, ...events);
  }

  get latestId(): number { return this.sequence; }

  record(movement: Movement, result: EconomicEvent['result'] = 'completed'): void {
    const { originBalance, destinationBalance } = movement;
    this.events.push(Object.freeze({
      ...movement, id: ++this.sequence, timeMs: this.time(), result,
      originBalance: originBalance && Object.freeze({ ...originBalance }),
      destinationBalance: destinationBalance && Object.freeze({ ...destinationBalance }),
    }));
    if (this.events.length > this.capacity) this.events.shift();
  }

  read(resource?: AuditResource, building?: string): readonly EconomicEvent[] {
    return this.events.filter(event => (!resource || event.resource === resource)
      && (!building || [event.origin, event.destination, event.household].includes(building)));
  }
}
