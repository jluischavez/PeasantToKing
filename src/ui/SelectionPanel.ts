import { formatNumber } from '../formatNumber';
import { distributionRules } from '../economy/Distribution';
import type { MarketSnapshot, HousingSupply } from '../economy/Distribution';
import { gameMinutesForSeconds } from '../simulation/GameTime';
import type { WarehouseSnapshot } from '../economy/Storage';
import type { BuildingProductivity } from '../economy/Economy';
import type { Cell } from '../map/CellSelection';
import { populationRules } from '../population/Population';
import { wellbeingState } from '../population/Wellbeing';
import { waterRules } from '../simulation/WaterService';
import type { WellSnapshot } from '../simulation/WaterService';
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
    supply?: HousingSupply, foodShortage = 0, woodSupply?: HousingSupply, woodShortage = 0,
    wellbeing?: Readonly<{ happiness: number; concerns: readonly string[] }>, waterSupplied = 0, well?: WellSnapshot): void {
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
      const percent = formatNumber(productivity.ratio * 100);
      this.status.textContent += ` · Empleados: ${productivity.workers}/${productivity.capacity} · Productividad: ${percent} %`;
    }
    if (productivity?.storageBlocked) {
      this.status.textContent += ' · Producción bloqueada por falta de almacenamiento operativo que acepte el producto y tenga espacio.';
    }
    if (cell && warehouse) {
      this.status.textContent += ` · Comida: ${formatNumber(warehouse.food)} · Madera: ${formatNumber(warehouse.wood)} · Capacidad usada: ${formatNumber(warehouse.used)}/${warehouse.capacity} · Disponible: ${formatNumber(warehouse.free)} · Empleados: ${warehouse.workers}/${warehouse.workerCapacity} · ${warehouse.operational ? 'Operativo' : 'Inactivo'}`;
    }
    if (cell && market) {
      const restockMinutes = formatNumber(gameMinutesForSeconds(distributionRules.restockIntervalSeconds));
      this.status.textContent += ' · Reposición cada ' + restockMinutes + ' min del juego';
      this.status.textContent += ` · Comida: ${formatNumber(market.food)} · Madera: ${formatNumber(market.wood)} · Capacidad usada: ${formatNumber(market.food + market.wood)}/${market.capacity} · Empleados: ${market.workers}/${market.workerCapacity} · Cobertura: ${market.coveredHomes} solares, hasta ${market.range} tramos de camino · ${market.operational ? 'Operativo' : 'Inactivo'}`;
    }
    if (cell && construction === 'house' && supply) {
      this.status.textContent += supply.status === 'reserve' ? ' · Abastecimiento: reserva inicial'
        : supply.status === 'market' ? ` · Mercado con existencias a ${supply.distance} tramos`
        : ' · Sin comida disponible en esta vivienda';
    }
    if (woodSupply && residents > 0) {
      this.status.textContent += woodSupply.status === 'market'
        ? ' · Madera disponible en mercado a ' + woodSupply.distance + ' tramos'
        : ' · Sin acceso a madera disponible';
      if (woodShortage > 0) this.status.textContent += ' · Madera sin entregar en el último ciclo: ' + formatNumber(woodShortage);
    }
    if (foodShortage > 0) {
      this.status.textContent += ' · Comida sin entregar en el último ciclo: ' + formatNumber(foodShortage);
    }
    if (well) {
      this.status.textContent += ' · Aguadores: ' + well.workers + '/1 · Habitantes abastecidos: ' + well.served
        + '/' + waterRules.capacity + ' · Cobertura: hasta ' + waterRules.roadRange + ' tramos de camino';
    }
    if (residents > 0) {
      this.status.textContent += ' · Agua: ' + waterSupplied + '/' + residents + ' habitantes abastecidos';
      const happiness = wellbeing?.happiness ?? populationRules.migration.neutralHappiness;
      this.status.textContent += ' · Felicidad: ' + formatNumber(happiness)
        + '/100 · ' + wellbeingState(happiness);
      const concerns = wellbeing?.concerns ?? [];
      this.status.textContent += concerns.length > 0 ? ' · ' + concerns.join(' · ')
        : wellbeing ? ' · Suministros cubiertos y empleo estable' : ' · Bienestar inicial';
    }
    if (cell && market) this.status.textContent += ` · ${market.reason}`;
    this.cancel.disabled = cell === null;
  }

  destroy(): void {
    this.events.abort();
  }
}
