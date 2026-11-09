import { formatNumber } from '../formatNumber';
import type { Resources } from '../economy/Economy';
import type { Goods } from '../economy/Inventories';
import type { OperatingCosts } from '../economy/OperatingCosts';
import { perGameHour } from '../simulation/GameTime';
import { taxPolicies } from '../economy/TaxPolicy';
import type { TaxPolicy } from '../economy/TaxPolicy';
import { financeSummary, signedRate } from './FinanceSummary';
import { setText } from './domText';

const fieldIds = [
  'resource-gold', 'resource-food', 'resource-wood', 'production-gold', 'production-food', 'production-wood',
  'initial-food-reserve', 'reserve-status', 'available-food', 'construction-wood', 'construction-reserve',
  'finance-gold', 'food-sales-rate', 'wood-sales-rate', 'tax-rate', 'total-income', 'wages-rate', 'maintenance-rate',
  'total-expenses', 'finance-net', 'net-rate', 'finance-balance-state',
  'finance-tributes', 'finance-offerings', 'finance-wages-arrears', 'finance-maintenance-arrears',
  'finance-exports', 'finance-imports', 'finance-trade-net',
] as const;
type Field = typeof fieldIds[number];

export class ResourceBar {
  private readonly fields = Object.fromEntries(fieldIds.map(id => [id, document.getElementById(id)!])) as Record<Field, HTMLElement>;
  private readonly taxSelect = document.querySelector<HTMLSelectElement>('#tax-policy')!;
  private readonly events = new AbortController();

  constructor(policy: TaxPolicy, onTaxChange: (policy: TaxPolicy) => void) {
    this.taxSelect.replaceChildren(...Object.entries(taxPolicies).map(([value, tax]) =>
      new Option(tax.label + ' (' + formatNumber(tax.percent) + ' %)', value)));
    this.taxSelect.value = policy;
    this.taxSelect.addEventListener('change', () => {
      const policy = (Object.keys(taxPolicies) as TaxPolicy[]).find(value => value === this.taxSelect.value);
      if (policy) onTaxChange(policy);
    }, { signal: this.events.signal });
  }

  destroy(): void { this.events.abort(); }

  render(resources: Readonly<Resources>, perSecond: Readonly<Resources>, data: {
    reserve: number; availableFood: number; bootstrap: boolean; constructionReserve: number; constructionWood: number;
    costs: OperatingCosts; taxes: number; sales: Readonly<Goods>;
    tributes: number; offerings: number; arrears: OperatingCosts; defeated: boolean;
    trade: { exports: number; imports: number };
  }): number {
    const { food, wood, income, expenses, net } = financeSummary(data.sales, perSecond.gold, data.taxes, data.costs);
    const displayNet = signedRate(net);
    const trend = displayNet.startsWith('−') ? 'negative' : displayNet.startsWith('+') ? 'positive' : 'neutral';
    const values: Record<Field, string> = {
      'resource-gold': formatNumber(resources.gold),
      'resource-food': formatNumber(resources.food),
      'resource-wood': formatNumber(resources.wood),
      'production-gold': signedRate(perGameHour(perSecond.gold)) + ' ventas/h',
      'production-food': signedRate(perGameHour(perSecond.food)) + ' prod./h',
      'production-wood': signedRate(perGameHour(perSecond.wood)) + ' prod./h',
      'initial-food-reserve': formatNumber(data.reserve),
      'reserve-status': data.reserve === 0 ? 'agotada' : data.bootstrap ? 'de arranque' : 'cerrada',
      'available-food': formatNumber(data.availableFood),
      'construction-wood': formatNumber(data.constructionWood),
      'construction-reserve': formatNumber(data.constructionReserve),
      'finance-gold': formatNumber(resources.gold),
      'food-sales-rate': signedRate(food),
      'wood-sales-rate': signedRate(wood),
      'tax-rate': signedRate(data.taxes),
      'total-income': signedRate(income),
      'wages-rate': signedRate(-data.costs.wages),
      'maintenance-rate': signedRate(-data.costs.maintenance),
      'total-expenses': signedRate(-expenses),
      'finance-net': displayNet,
      'net-rate': displayNet,
      'finance-balance-state': trend === 'positive' ? 'Positivo' : trend === 'negative' ? 'Negativo' : 'Neutral',
      'finance-tributes': formatNumber(data.tributes), 'finance-offerings': formatNumber(data.offerings),
      'finance-wages-arrears': formatNumber(data.arrears.wages),
      'finance-maintenance-arrears': formatNumber(data.arrears.maintenance),
      'finance-exports': formatNumber(data.trade.exports), 'finance-imports': formatNumber(data.trade.imports),
      'finance-trade-net': signedRate(data.trade.exports - data.trade.imports),
    };
    for (const id of fieldIds) setText(this.fields[id], values[id]);
    for (const id of ['finance-net', 'net-rate'] as const) {
      if (this.fields[id].dataset.trend !== trend) this.fields[id].dataset.trend = trend;
    }
    for (const id of ['resource-gold', 'finance-gold'] as const) {
      this.fields[id].toggleAttribute('data-debt', resources.gold < 0);
    }
    this.taxSelect.disabled = data.defeated;
    return net;
  }
}
