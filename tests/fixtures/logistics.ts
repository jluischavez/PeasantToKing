import type { Economy } from '../../src/economy/Economy';
import type { Storage } from '../../src/economy/Storage';

// Prepare already-delivered stock for tests of consumption, coverage or taxes.
// Use the real transport state machine without producing, consuming or changing their clocks.
export function deliverStorageFixture(storage: Storage, time = 0): void {
  for (let step = 0; step < 100; step++) {
    if (!storage.logistics.operations.some(op => op.kind !== 'producer-to-warehouse')) break;
    const before = JSON.stringify(storage.logistics.saveState());
    storage.logistics.advance(1000, time);
    if (JSON.stringify(storage.logistics.saveState()) === before) break;
  }
}
export function deliverFixtureCargo(economy: Economy): void {
  deliverStorageFixture(economy.storage, economy.simulatedTimeMs);
  void economy.availableFood;
}
