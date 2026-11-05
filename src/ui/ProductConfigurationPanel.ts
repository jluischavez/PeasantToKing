import { productIds, marketProductIds, productNames } from '../economy/Products';
import type { ProductId, ProductFlags } from '../economy/Products';
import type { WarehouseSnapshot } from '../economy/Storage';
import type { MarketSnapshot } from '../economy/Distribution';
import type { Cell } from '../map/CellSelection';

type BuildingKind = 'warehouse' | 'market';
type Setting = 'accepts' | 'marketDispatch' | 'sells';
type OnChange = (cell: Cell, setting: Setting, product: ProductId, enabled: boolean) => void;

export class ProductConfigurationPanel {
  private readonly root = document.querySelector<HTMLFieldSetElement>('#product-configuration')!;
  private readonly title = document.querySelector<HTMLElement>('#product-config-title')!;
  private readonly options = document.querySelector<HTMLElement>('#product-config-options')!;
  private readonly drain = document.querySelector<HTMLElement>('#warehouse-drain')!;
  private readonly drainButton = document.querySelector<HTMLButtonElement>('#toggle-warehouse-drain')!;
  private readonly drainStatus = document.querySelector<HTMLElement>('#warehouse-drain-status')!;
  private readonly events = new AbortController();
  private readonly fields = new Map<HTMLInputElement, { setting: Setting; product: ProductId; status: HTMLElement }>();
  private cell: Cell | null = null;
  private kind: BuildingKind | null = null;

  constructor(onChange: OnChange, onDrainToggle: (cell: Cell) => void) {
    const options = { signal: this.events.signal };
    this.root.addEventListener('change', event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !this.cell || !this.kind) return;
      const field = this.fields.get(input);
      if (field && !input.disabled) onChange({ ...this.cell }, field.setting, field.product, input.checked);
    }, options);
    this.drainButton.addEventListener('click', () => {
      if (this.cell && this.kind === 'warehouse') onDrainToggle({ ...this.cell });
    }, options);
    this.render(null);
  }

  render(cell: Cell | null, warehouse?: WarehouseSnapshot, market?: MarketSnapshot, paused = false): void {
    const kind = warehouse ? 'warehouse' : market ? 'market' : null;
    if (!cell || !kind) {
      this.root.hidden = true;
      this.cell = null;
      this.kind = null;
      this.fields.clear();
      this.options.replaceChildren();
      return;
    }
    if (kind !== this.kind) {
      this.options.replaceChildren();
      this.fields.clear();
      this.title.textContent = kind === 'warehouse' ? 'Configuración del almacén' : 'Mercado: autorizar ventas';
      if (kind === 'warehouse') {
        this.addOptions('accepts', productIds, 'Recepción', 'Aceptar');
        this.addOptions('marketDispatch', productIds, 'Distribución a mercados', 'Enviar');
      } else this.addOptions('sells', marketProductIds);
    }
    this.cell = { ...cell };
    this.kind = kind;
    this.root.hidden = false;
    this.drain.hidden = !warehouse;
    this.drainButton.disabled = paused;
    this.drainButton.textContent = warehouse?.draining ? 'Cancelar vaciado' : 'Vaciar almacén';
    const drainMessage = warehouse?.draining ? 'En vaciado. Entradas cerradas. ' + warehouse.drainStatus : '';
    if (this.drainStatus.textContent !== drainMessage) this.drainStatus.textContent = drainMessage;
    const flags: Partial<Record<Setting, Readonly<ProductFlags>>> = warehouse ? warehouse : market!;
    // Reuse controls during simulation ticks to preserve keyboard/touch focus.
    for (const [input, { setting, product, status }] of this.fields) {
      input.checked = flags[setting]![product];
      input.disabled = paused && setting !== 'marketDispatch';
      status.textContent = input.checked ? '(Habilitado)' : '(Deshabilitado)';
    }
  }

  private addOptions(setting: Setting, products: readonly ProductId[], heading?: string, verb?: string): void {
    const group = heading ? document.createElement('fieldset') : this.options;
    if (heading) {
      group.className = 'product-option-group';
      const legend = document.createElement('legend');
      legend.textContent = heading;
      group.append(legend);
      this.options.append(group);
    }
    for (const product of products) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      const status = document.createElement('span');
      const name = verb ? verb + ' ' + productNames[product].toLowerCase() : productNames[product];
      label.append(input, document.createTextNode(name + ' '), status);
      group.append(label);
      this.fields.set(input, { setting, product, status });
    }
  }

  destroy(): void {
    this.events.abort();
    this.render(null);
  }
}
