import { formatNumber } from '../formatNumber';
import { resourceNames } from '../economy/Economy';
import type { Resource, Resources } from '../economy/Economy';
import type { OperatingCosts } from '../economy/OperatingCosts';
import { perGameHour } from '../simulation/GameTime';
import { taxPolicies } from '../economy/TaxPolicy';
import type { TaxPolicy } from '../economy/TaxPolicy';

export class ResourceBar {
  private readonly reserve = document.querySelector<HTMLElement>('#initial-food-reserve')!;
  private readonly constructionWood = document.querySelector<HTMLElement>('#construction-wood')!;
  private readonly constructionReserve = document.querySelector<HTMLElement>('#construction-reserve')!;
  private readonly reserveStatus = document.querySelector<HTMLElement>('#reserve-status')!;
  private readonly available = document.querySelector<HTMLElement>('#available-food')!;
  private readonly storageStatus = document.querySelector<HTMLElement>('#storage-status')!;
  private readonly taxSelect = document.querySelector<HTMLSelectElement>('#tax-policy')!;
  private readonly taxes = document.querySelector<HTMLElement>('#tax-rate')!;
  private readonly events = new AbortController();
  private readonly wages = document.querySelector<HTMLElement>('#wages-rate')!;
  private readonly maintenance = document.querySelector<HTMLElement>('#maintenance-rate')!;
  private readonly net = document.querySelector<HTMLElement>('#net-rate')!;
  private readonly fields = (Object.keys(resourceNames) as Resource[]).map(resource => ({
    resource,
    amount: document.querySelector<HTMLElement>(`#resource-${resource}`)!,
    rate: document.querySelector<HTMLElement>(`#production-${resource}`)!,
  }));

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

  render(resources: Readonly<Resources>, perSecond: Readonly<Resources>,
    storage: {
      reserve: number; availableFood: number; blocked: number; bootstrap: boolean;
      constructionReserve: number; constructionWood: number;
      costs: OperatingCosts; taxes: number;
    }): void {
    this.reserveStatus.textContent = storage.reserve === 0 ? 'agotada' : storage.bootstrap ? 'reserva de arranque' : 'cerrada: consumo por mercados';
    this.reserve.textContent = formatNumber(storage.reserve);
    this.available.textContent = formatNumber(storage.availableFood);
    this.constructionWood.textContent = formatNumber(storage.constructionWood);
    this.constructionReserve.textContent = formatNumber(storage.constructionReserve);
    const storageMessage = storage.blocked > 0
      ? `Producción bloqueada por falta de almacenamiento: ${formatNumber(storage.blocked)} edificio(s).`
      : 'Almacenamiento sin bloqueos.';
    if (this.storageStatus.textContent !== storageMessage) this.storageStatus.textContent = storageMessage;
    this.taxes.textContent = formatNumber(storage.taxes);
    this.wages.textContent = formatNumber(storage.costs.wages);
    this.maintenance.textContent = formatNumber(storage.costs.maintenance);
    const net = perGameHour(perSecond.gold) + storage.taxes - storage.costs.wages - storage.costs.maintenance;
    this.net.textContent = formatNumber(net);
    for (const { resource, amount, rate } of this.fields) {
      amount.textContent = formatNumber(resources[resource]);
      const value = formatNumber(perGameHour(perSecond[resource]));
      rate.textContent = resource === 'gold' ? `(ventas: +${value}/h)` : `(+${value}/h)`;
    }
  }
}
