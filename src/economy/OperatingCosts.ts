import type { ConstructionType } from '../map/ConstructionMap';
import type { ProductId } from './Products';

export const centsPerGold = 100;
export const salePriceCents: Readonly<Record<ProductId, number>> = { food: 10, wood: 20 };

// Rates in cents of gold per game hour.
export const wagePerWorker = 40;
export const maintenanceByType: Readonly<Record<ConstructionType, number>> = {
  road: 1,
  bridge: 0,
  house: 2,
  farm: 25,
  lumberjack: 20,
  warehouse: 35,
  market: 30,
  well: 15,
  villageCenter: 0,
  garden: 50,
  park: 200,
  plaza: 400,
};

export type OperatingCosts = Readonly<{ wages: number; maintenance: number }>;
