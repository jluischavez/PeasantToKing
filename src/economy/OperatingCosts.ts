import type { ConstructionType } from '../map/ConstructionMap';

export const centsPerGold = 100;

// Rates in cents of gold per game hour.
export const wagePerWorker = 10;
export const maintenanceByType: Readonly<Record<ConstructionType, number>> = {
  road: 1,
  bridge: 0,
  house: 1,
  farm: 5,
  lumberjack: 5,
  warehouse: 8,
  market: 8,
  well: 5,
  villageCenter: 0,
};

export type OperatingCosts = Readonly<{ wages: number; maintenance: number }>;
