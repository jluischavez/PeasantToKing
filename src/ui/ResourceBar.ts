import { resourceNames } from '../economy/Economy';
import type { Resource, Resources } from '../economy/Economy';

export class ResourceBar {
  private readonly fields = (Object.keys(resourceNames) as Resource[]).map(resource => ({
    resource,
    amount: document.querySelector<HTMLElement>(`#resource-${resource}`)!,
    rate: document.querySelector<HTMLElement>(`#production-${resource}`)!,
  }));

  render(resources: Readonly<Resources>, perSecond: Readonly<Resources>): void {
    for (const { resource, amount, rate } of this.fields) {
      amount.textContent = String(resources[resource]);
      rate.textContent = `(+${perSecond[resource]}/s)`;
    }
  }
}