import { resourceNames } from '../economy/Economy';
import type { Resource, Resources } from '../economy/Economy';
import type { OperatingCosts } from '../economy/OperatingCosts';
import { perGameHour } from '../simulation/GameTime';

export class ResourceBar {
  private readonly reserve = document.querySelector<HTMLElement>('#initial-food-reserve')!;
  private readonly constructionWood = document.querySelector<HTMLElement>('#construction-wood')!;
  private readonly constructionReserve = document.querySelector<HTMLElement>('#construction-reserve')!;
  private readonly reserveStatus = document.querySelector<HTMLElement>('#reserve-status')!;
  private readonly available = document.querySelector<HTMLElement>('#available-food')!;
  private readonly storageStatus = document.querySelector<HTMLElement>('#storage-status')!;
  private readonly wages = document.querySelector<HTMLElement>('#wages-rate')!;
  private readonly maintenance = document.querySelector<HTMLElement>('#maintenance-rate')!;
  private readonly net = document.querySelector<HTMLElement>('#net-rate')!;
  private readonly fields = (Object.keys(resourceNames) as Resource[]).map(resource => ({
    resource,
    amount: document.querySelector<HTMLElement>(`#resource-${resource}`)!,
    rate: document.querySelector<HTMLElement>(`#production-${resource}`)!,
  }));

  render(resources: Readonly<Resources>, perSecond: Readonly<Resources>,
    storage: {
      reserve: number; availableFood: number; blocked: number; bootstrap: boolean;
      constructionReserve: number; constructionWood: number;
      costs: OperatingCosts;
    }): void {
    this.reserveStatus.textContent = storage.reserve === 0 ? 'agotada' : storage.bootstrap ? 'reserva de arranque' : 'cerrada: consumo por mercados';
    this.reserve.textContent = storage.reserve.toLocaleString('es', { maximumFractionDigits: 2 });
    this.available.textContent = storage.availableFood.toLocaleString('es', { maximumFractionDigits: 2 });
    this.constructionWood.textContent = storage.constructionWood.toLocaleString('es', { maximumFractionDigits: 2 });
    this.constructionReserve.textContent = storage.constructionReserve.toLocaleString('es', { maximumFractionDigits: 2 });
    const storageMessage = storage.blocked > 0
      ? `Producción bloqueada por falta de almacenamiento: ${storage.blocked} edificio(s).`
      : 'Almacenamiento sin bloqueos.';
    if (this.storageStatus.textContent !== storageMessage) this.storageStatus.textContent = storageMessage;
    const hourly = (amount: number) => amount.toLocaleString('es', { maximumFractionDigits: 3 });
    this.wages.textContent = hourly(storage.costs.wages);
    this.maintenance.textContent = hourly(storage.costs.maintenance);
    const net = perGameHour(perSecond.gold) - storage.costs.wages - storage.costs.maintenance;
    this.net.textContent = hourly(Math.round(net * 1000) / 1000 || 0);
    for (const { resource, amount, rate } of this.fields) {
      amount.textContent = resources[resource].toLocaleString('es', { maximumFractionDigits: 2 });
      const value = hourly(perGameHour(perSecond[resource]));
      rate.textContent = resource === 'gold' ? `(ventas: +${value}/h)` : `(+${value}/h)`;
    }
  }
}
