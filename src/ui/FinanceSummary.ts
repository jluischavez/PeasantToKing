import { formatNumber } from '../formatNumber.ts';
import { perGameHour } from '../simulation/GameTime.ts';
import type { Goods } from '../economy/Inventories';
import type { OperatingCosts } from '../economy/OperatingCosts';

export function financeSummary(sales: Readonly<Goods>, totalSales: number, taxes: number, costs: OperatingCosts) {
  const food = perGameHour(sales.food), wood = perGameHour(sales.wood);
  const income = perGameHour(totalSales) + taxes;
  const expenses = costs.wages + costs.maintenance;
  return { food, wood, taxes, income, expenses, net: income - costs.wages - costs.maintenance };
}

export function signedRate(value: number): string {
  const formatted = formatNumber(Math.abs(value));
  if (formatted === '0' || formatted === '—') return formatted;
  return (value < 0 ? '−' : '+') + formatted;
}
