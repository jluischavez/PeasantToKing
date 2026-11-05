import type { MarketSnapshot, HousingSupply } from '../economy/Distribution';
import type { WarehouseSnapshot } from '../economy/Storage';
import type { BuildingProductivity } from '../economy/Economy';
import type { Cell } from '../map/CellSelection';
import { constructionNames } from '../map/ConstructionMap';
import type { ConstructionType } from '../map/ConstructionMap';

export class SelectionPanel {
  private readonly coordinates = document.querySelector<HTMLElement>('#cell-coordinates')!;
  private readonly terrain = document.querySelector<HTMLElement>('#cell-terrain')!;
  private readonly status = document.querySelector<HTMLElement>('#cell-status')!;
  private readonly cancel = document.querySelector<HTMLButtonElement>('#cancel-selection')!;
  private readonly onCancel: () => void;

  constructor(onCancel: () => void) {
    this.onCancel = onCancel;
    this.cancel.addEventListener('click', onCancel);
    this.render(null);
  }

  render(cell: Cell | null, construction: ConstructionType | null = null, connected = false, residents = 0,
    productivity?: BuildingProductivity, warehouse?: WarehouseSnapshot, market?: MarketSnapshot,
    supply?: HousingSupply): void {
    this.coordinates.textContent = cell ? `X: ${cell.column} · Y: ${cell.row}` : 'X: — · Y: —';
    this.terrain.textContent = cell ? 'césped' : '—';
    this.status.textContent = cell
      ? (construction
        ? `ocupada — ${constructionNames[construction]} · ${connected ? 'Conectado' : 'Sin conexión'}`
        : 'disponible')
      : 'Sin selección';
    if (cell && construction === 'house') {
      this.status.textContent = `ocupada — ${residents > 0 ? 'Choza' : 'Solar vacío'} · ${residents}/4 habitantes · ${connected ? 'Conectado' : 'Sin conexión'}`;
    }
    if (cell && productivity) {
      const percent = (productivity.ratio * 100).toLocaleString('es', { maximumFractionDigits: 1 });
      this.status.textContent += ` · Empleados: ${productivity.workers}/${productivity.capacity} · Productividad: ${percent} %`;
    }
    if (productivity?.storageBlocked) {
      this.status.textContent += ' · Producción bloqueada por falta de almacenamiento operativo que acepte el producto y tenga espacio.';
    }
    if (cell && warehouse) {
      const format = (value: number) => value.toLocaleString('es', { maximumFractionDigits: 2 });
      this.status.textContent += ` · Comida: ${format(warehouse.food)} · Madera: ${format(warehouse.wood)} · Capacidad usada: ${format(warehouse.used)}/${warehouse.capacity} · Disponible: ${format(warehouse.free)} · Empleados: ${warehouse.workers}/${warehouse.workerCapacity} · ${warehouse.operational ? 'Operativo' : 'Inactivo'}`;
    }
    if (cell && market) {
      const food = market.food.toLocaleString('es', { maximumFractionDigits: 2 });
      this.status.textContent += ` · Comida: ${food}/${market.capacity} · Empleados: ${market.workers}/${market.workerCapacity} · Cobertura: ${market.coveredHomes} solares, hasta ${market.range} tramos de camino · ${market.operational ? 'Operativo' : 'Inactivo'}`;
    }
    if (cell && construction === 'house' && supply) {
      this.status.textContent += supply.status === 'reserve' ? ' · Abastecimiento: reserva inicial'
        : supply.status === 'market' ? ` · Mercado con existencias a ${supply.distance} tramos`
        : ' · Sin acceso a alimentos: inmigración detenida';
    }
    if (cell && market) this.status.textContent += ` · ${market.reason}`;
    this.cancel.disabled = cell === null;
  }

  destroy(): void {
    this.cancel.removeEventListener('click', this.onCancel);
  }
}
