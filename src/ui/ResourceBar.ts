import { resourceNames } from '../economy/Economy';
import type { Resource, Resources } from '../economy/Economy';

export class ResourceBar {
  private readonly reserve = document.querySelector<HTMLElement>('#initial-food-reserve')!;
  private readonly reserveStatus = document.querySelector<HTMLElement>('#reserve-status')!;
  private readonly available = document.querySelector<HTMLElement>('#available-food')!;
  private readonly storageStatus = document.querySelector<HTMLElement>('#storage-status')!;
  private readonly fields = (Object.keys(resourceNames) as Resource[]).map(resource => ({
    resource,
    amount: document.querySelector<HTMLElement>(`#resource-${resource}`)!,
    rate: document.querySelector<HTMLElement>(`#production-${resource}`)!,
  }));

  render(resources: Readonly<Resources>, perSecond: Readonly<Resources>,
    storage: { reserve: number; availableFood: number; blocked: number; bootstrap: boolean }): void {
    this.reserveStatus.textContent = storage.reserve === 0 ? 'agotada' : storage.bootstrap ? 'reserva de arranque' : 'cerrada: consumo por mercados';
    this.reserve.textContent = storage.reserve.toLocaleString('es', { maximumFractionDigits: 2 });
    this.available.textContent = storage.availableFood.toLocaleString('es', { maximumFractionDigits: 2 });
    const storageMessage = storage.blocked > 0
      ? `Producción bloqueada por falta de almacenamiento: ${storage.blocked} edificio(s).`
      : 'Almacenamiento sin bloqueos.';
    if (this.storageStatus.textContent !== storageMessage) this.storageStatus.textContent = storageMessage;
    for (const { resource, amount, rate } of this.fields) {
      amount.textContent = resources[resource].toLocaleString('es', { maximumFractionDigits: 2 });
      const value = perSecond[resource].toLocaleString('es', { maximumFractionDigits: 3 });
      rate.textContent = resource === 'gold' ? `(ventas: +${value}/s)` : `(+${value}/s)`;
    }
  }
}
