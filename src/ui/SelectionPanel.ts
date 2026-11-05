import { distributionRules } from '../economy/Distribution';
import type { MarketSnapshot, HousingSupply } from '../economy/Distribution';
import { gameMinutesForSeconds } from '../simulation/GameTime';
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
  private readonly demolition = document.querySelector<HTMLElement>('#demolition-confirmation')!;
  private readonly demolitionTarget = document.querySelector<HTMLElement>('#demolition-target')!;
  private readonly demolitionIssue = document.querySelector<HTMLElement>('#demolition-issue')!;
  private readonly confirmDemolition = document.querySelector<HTMLButtonElement>('#confirm-demolition')!;
  private readonly cancelDemolition = document.querySelector<HTMLButtonElement>('#cancel-demolition')!;
  private readonly events = new AbortController();

  constructor(onCancel: () => void, onConfirmDemolition: () => void, onCancelDemolition: () => void) {
    const options = { signal: this.events.signal };
    this.cancel.addEventListener('click', onCancel, options);
    this.confirmDemolition.addEventListener('click', onConfirmDemolition, options);
    this.cancelDemolition.addEventListener('click', onCancelDemolition, options);
    this.render(null);
    this.renderDemolition(null);
  }

  renderDemolition(target: string | null, issue: string | null = null): void {
    this.demolition.hidden = target === null;
    this.demolitionTarget.textContent = target;
    this.demolitionIssue.hidden = issue === null;
    this.demolitionIssue.textContent = issue;
    this.confirmDemolition.disabled = issue !== null;
  }

  render(cell: Cell | null, construction: ConstructionType | null = null, connected = false, residents = 0,
    productivity?: BuildingProductivity, warehouse?: WarehouseSnapshot, market?: MarketSnapshot,
    supply?: HousingSupply, foodShortage = 0): void {
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
      const restockMinutes = gameMinutesForSeconds(distributionRules.restockIntervalSeconds).toLocaleString('es');
      this.status.textContent += ' · Reposición cada ' + restockMinutes + ' min del juego';
      const food = market.food.toLocaleString('es', { maximumFractionDigits: 2 });
      this.status.textContent += ` · Comida: ${food}/${market.capacity} · Empleados: ${market.workers}/${market.workerCapacity} · Cobertura: ${market.coveredHomes} solares, hasta ${market.range} tramos de camino · ${market.operational ? 'Operativo' : 'Inactivo'}`;
    }
    if (cell && construction === 'house' && supply) {
      this.status.textContent += supply.status === 'reserve' ? ' · Abastecimiento: reserva inicial'
        : supply.status === 'market' ? ` · Mercado con existencias a ${supply.distance} tramos`
        : ' · Sin acceso a alimentos: inmigración detenida';
    }
    if (foodShortage > 0) {
      this.status.textContent += ' · Comida sin entregar en el último ciclo: ' + foodShortage.toLocaleString('es');
    }
    if (cell && market) this.status.textContent += ` · ${market.reason}`;
    this.cancel.disabled = cell === null;
  }

  destroy(): void {
    this.events.abort();
  }
}
