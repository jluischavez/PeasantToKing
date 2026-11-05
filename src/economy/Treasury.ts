import type { EconomicHistory } from './EconomicHistory';
import { unitsPerResource } from './Inventories.ts';
import { centsPerGold } from './OperatingCosts.ts';
import type { OperatingCosts } from './OperatingCosts';
import { gameTimeRules } from '../simulation/GameTime.ts';

const unitsPerGold = unitsPerResource * centsPerGold * gameTimeRules.secondsPerHour;
const unitsPerInventoryUnit = unitsPerGold / unitsPerResource;
const unitsPerCentSecond = unitsPerGold / (centsPerGold * gameTimeRules.secondsPerHour);
type Movement = Omit<Parameters<EconomicHistory['record']>[0], 'resource' | 'unitScale'>;

export class Treasury {
  private units: number;
  private accruedWages = 0;
  private accruedMaintenance = 0;
  private unpaidWages = 0;
  private unpaidMaintenance = 0;

  constructor(initialGold: number, private readonly history: EconomicHistory) {
    this.units = Math.round(initialGold * unitsPerGold);
  }

  get gold(): number { return this.units / unitsPerGold; }

  get deficits(): OperatingCosts {
    return { wages: this.unpaidWages / unitsPerGold, maintenance: this.unpaidMaintenance / unitsPerGold };
  }

  shortfall(gold: number): number {
    return Math.max(0, Math.round(gold * unitsPerGold) - this.units) / unitsPerGold;
  }

  payBuilding(gold: number, operation: 'construction' | 'demolition', destination: string): void {
    this.debit(Math.round(gold * unitsPerGold), operation, destination);
  }

  creditSale(market: string, household: string, inventoryUnits: number): void {
    const units = inventoryUnits * unitsPerInventoryUnit;
    const before = this.units;
    this.units += units;
    this.record({
      operation: 'sale', units, origin: market, destination: 'treasury',
      household, destinationBalance: { before, after: this.units },
    });
  }

  accrueSecond(costs: OperatingCosts): void {
    this.accruedWages += costs.wages * unitsPerCentSecond;
    this.accruedMaintenance += costs.maintenance * unitsPerCentSecond;
  }

  closeHour(): void {
    this.unpaidWages += this.settle(this.accruedWages, 'wages', 'workers');
    this.unpaidMaintenance += this.settle(this.accruedMaintenance, 'maintenance', 'building-maintenance');
    this.accruedWages = 0;
    this.accruedMaintenance = 0;
  }

  private settle(due: number, operation: 'wages' | 'maintenance', destination: string): number {
    const paid = Math.min(due, this.units);
    this.debit(paid, operation, destination);
    const unpaid = due - paid;
    if (unpaid > 0) this.record({
      operation, units: unpaid, origin: 'treasury', destination,
      originBalance: { before: this.units, after: this.units },
    }, 'unpaid');
    return unpaid;
  }

  private debit(units: number, operation: 'construction' | 'demolition' | 'wages' | 'maintenance', destination: string): void {
    if (units === 0) return;
    const before = this.units;
    this.units -= units;
    this.record({
      operation, units, origin: 'treasury', destination, originBalance: { before, after: this.units },
    });
  }

  private record(movement: Movement, result: 'completed' | 'unpaid' = 'completed'): void {
    const balance = movement.originBalance ?? movement.destinationBalance!;
    // Keep the original denomination when the amount and balances fit it exactly.
    const divisor = [movement.units, balance.before, balance.after].every(value => value % unitsPerInventoryUnit === 0)
      ? unitsPerInventoryUnit : 1;
    const normalized = { before: balance.before / divisor, after: balance.after / divisor };
    const balances = movement.originBalance ? { originBalance: normalized } : { destinationBalance: normalized };
    const scale = divisor === 1 ? { unitScale: unitsPerGold } : {};
    this.history.record({ ...movement, ...balances, ...scale, units: movement.units / divisor, resource: 'gold' }, result);
  }
}
