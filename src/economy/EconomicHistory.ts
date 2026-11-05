import type { ProductId } from './Products';

export type AuditResource = ProductId | 'gold';
export type AuditOperation = 'production' | 'transfer' | 'consumption' | 'sale' | 'construction' | 'construction-material' | 'demolition';
type Balance = Readonly<{ before: number; after: number }>;
type Movement = Readonly<{
  resource: AuditResource;
  units: number;
  origin: string;
  destination: string;
  operation: AuditOperation;
  originBalance?: Balance;
  destinationBalance?: Balance;
  household?: string;
}>;
export type EconomicEvent = Movement & Readonly<{ id: number; timeMs: number; result: 'completed' }>;

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

  get latestId(): number { return this.sequence; }

  record(movement: Movement): void {
    const { originBalance, destinationBalance } = movement;
    this.events.push(Object.freeze({
      ...movement, id: ++this.sequence, timeMs: this.time(), result: 'completed',
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
