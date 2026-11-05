import { isProductId, productIds, marketProductIds, productNames } from '../economy/Products';
import type { ProductId, ProductFlags } from '../economy/Products';
import type { WarehouseSnapshot } from '../economy/Storage';
import type { MarketSnapshot } from '../economy/Distribution';
import type { Cell } from '../map/CellSelection';

type BuildingKind = 'warehouse' | 'market';
type OnChange = (cell: Cell, kind: BuildingKind, product: ProductId, enabled: boolean) => void;

export class ProductConfigurationPanel {
  private readonly root = document.querySelector<HTMLFieldSetElement>('#product-configuration')!;
  private readonly title = document.querySelector<HTMLElement>('#product-config-title')!;
  private readonly options = document.querySelector<HTMLElement>('#product-config-options')!;
  private readonly fields = new Map<ProductId, { input: HTMLInputElement; status: HTMLElement }>();
  private cell: Cell | null = null;
  private kind: BuildingKind | null = null;
  private readonly onChange: (event: Event) => void;

  constructor(onChange: OnChange) {
    this.onChange = event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !this.cell || !this.kind) return;
      const product = input.dataset.product;
      if (!isProductId(product) || this.fields.get(product)?.input !== input) return;
      onChange({ ...this.cell }, this.kind, product, input.checked);
    };
    this.root.addEventListener('change', this.onChange);
    this.render(null);
  }

  render(cell: Cell | null, warehouse?: WarehouseSnapshot, market?: MarketSnapshot): void {
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
      this.title.textContent = kind === 'warehouse' ? 'Almacén: aceptar productos' : 'Mercado: autorizar ventas';
      const products = kind === 'warehouse' ? productIds : marketProductIds;
      for (const product of products) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.product = product;
        const status = document.createElement('span');
        label.append(input, document.createTextNode(productNames[product] + ' '), status);
        this.options.append(label);
        this.fields.set(product, { input, status });
      }
    }
    this.cell = { ...cell };
    this.kind = kind;
    this.root.hidden = false;
    const enabled: Readonly<ProductFlags> = warehouse ? warehouse.accepts : market!.sells;
    // Reuse controls during simulation ticks to preserve keyboard/touch focus.
    for (const [product, { input, status }] of this.fields) {
      input.checked = enabled[product];
      status.textContent = enabled[product] ? '(Habilitado)' : '(Deshabilitado)';
    }
  }

  destroy(): void {
    this.root.removeEventListener('change', this.onChange);
    this.render(null);
  }
}
