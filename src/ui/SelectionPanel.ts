import { formatNumber } from '../formatNumber';
import { setText } from './domText';
import { distributionRules } from '../economy/Distribution';
import type { MarketSnapshot, HousingSupply } from '../economy/Distribution';
import { gameMinutesForSeconds } from '../simulation/GameTime';
import type { WarehouseSnapshot } from '../economy/Storage';
import type { BuildingProductivity } from '../economy/Economy';
import type { Cell } from '../map/CellSelection';
import { populationRules } from '../population/Population';
import { wellbeingState } from '../population/Wellbeing';
import { housingLevels, housingRules } from '../population/HousingEvolution';
import type { HousingLevel, HousingEvolution } from '../population/HousingEvolution';
import { waterRules } from '../simulation/WaterService';
import type { WellSnapshot } from '../simulation/WaterService';
import { constructionNames } from '../map/ConstructionMap';
import type { ConstructionType } from '../map/ConstructionMap';

export class SelectionPanel {
  private readonly details = document.getElementById('cell-details')!;
  private readonly rows = new Map<string, HTMLElement>();
  private layout = '';
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
    setText(this.demolitionTarget, target ?? '');
    this.demolitionIssue.hidden = issue === null;
    setText(this.demolitionIssue, issue ?? '');
    this.confirmDemolition.disabled = issue !== null;
  }

  render(cell: Cell | null, construction: ConstructionType | null = null, connected = false, residents = 0,
    productivity?: BuildingProductivity, warehouse?: WarehouseSnapshot, market?: MarketSnapshot,
    supply?: HousingSupply, foodShortage = 0, woodSupply?: HousingSupply, woodShortage = 0,
    wellbeing?: Readonly<{ happiness: number; concerns: readonly string[] }>, waterSupplied = 0, well?: WellSnapshot,
    housing?: { level: HousingLevel; progress: ReturnType<HousingEvolution['at']> }): void {
    const fields: [string, string, string][] = [];
    const add = (id: string, label: string, value: string) => fields.push([id, label, value]);
    const fraction = (value: number, total: number) => formatNumber(value) + ' / ' + formatNumber(total);
    add('coordinates', 'Coordenadas', cell ? `X ${cell.column} · Y ${cell.row}` : '—');
    add('terrain', 'Terreno', cell ? 'Césped' : '—');
    const homeLevel = housing ? housingLevels[housing.level] : undefined;
    if (construction) add('construction', 'Construcción', constructionNames[construction]);
    const status = housing && homeLevel
      ? (residents > 0 || housing.level > 1 ? homeLevel.name : 'Solar vacío')
      : construction ? 'Ocupada' : cell ? 'Casilla disponible' : 'Sin selección';
    add('status', 'Estado', status);
    if (construction) add('connection', 'Conexión', connected ? 'Conectado' : 'Sin conexión');
    if (productivity) {
      add('workers', 'Empleados', fraction(productivity.workers, productivity.capacity));
      add('productivity', 'Productividad', formatNumber(productivity.ratio * 100) + ' %');
      if (productivity.storageBlocked) add('blocked', 'Producción', 'Bloqueada por falta de almacenamiento operativo, compatible y con espacio');
    }
    if (warehouse || market) {
      const inventory = warehouse ?? market!;
      add('food-stock', 'Comida', formatNumber(inventory.food));
      add('wood-stock', 'Madera', formatNumber(inventory.wood));
      add('used', 'Capacidad usada', fraction(warehouse?.used ?? inventory.food + inventory.wood, inventory.capacity));
      if (warehouse) add('free', 'Disponible', formatNumber(warehouse.free));
      if (!productivity) add('workers', 'Empleados', fraction(inventory.workers, inventory.workerCapacity));
      add('operation', 'Operación', inventory.operational ? 'Operativo' : 'Inactivo');
    }
    if (market) {
      add('coverage', 'Cobertura', formatNumber(market.coveredHomes) + ' solares · hasta ' + formatNumber(market.range) + ' tramos');
      add('restock', 'Reposición', 'Cada ' + formatNumber(gameMinutesForSeconds(distributionRules.restockIntervalSeconds)) + ' min del juego');
      add('market-reason', 'Abastecimiento', market.reason);
    }
    if (housing && homeLevel) {
      add('housing-level', 'Nivel de vivienda', formatNumber(housing.level));
      add('residents', 'Habitantes', fraction(residents, homeLevel.capacity));
      if (supply) add('food-supply', 'Comida', supply.status === 'reserve' ? 'Reserva inicial'
        : supply.status === 'market' ? 'Mercado a ' + formatNumber(supply.distance ?? 0) + ' tramos' : 'Sin abastecimiento');
      if (residents > 0) {
        add('wood-supply', 'Madera', woodSupply?.status === 'market'
          ? 'Mercado a ' + formatNumber(woodSupply.distance ?? 0) + ' tramos' : 'Sin abastecimiento');
        add('water-supply', 'Agua', fraction(waterSupplied, residents) + ' hab. abastecidos');
        const happiness = wellbeing?.happiness ?? populationRules.migration.neutralHappiness;
        add('happiness', 'Felicidad', fraction(happiness, 100) + ' · ' + wellbeingState(happiness));
        add('concerns', 'Bienestar', wellbeing?.concerns.join(' · ') ||
          (wellbeing ? 'Suministros cubiertos y empleo estable' : 'Bienestar inicial'));
        add('food-shortage', 'Comida sin entregar', formatNumber(foodShortage));
        add('wood-shortage', 'Madera sin entregar', formatNumber(woodShortage));
      }
      const { improvement, deterioration } = housing.progress;
      const progress = improvement || deterioration;
      add('progress', 'Evolución', progress > 0
        ? (improvement > 0 ? 'Mejora' : 'Deterioro') + ' · ' + formatNumber(100 * progress / housingRules.seconds) + ' %'
        : housing.level === 4 ? 'Nivel máximo · Sin deterioro' : 'Sin progreso');
      add('remaining', 'Tiempo restante', progress > 0 ? formatNumber(housingRules.seconds - progress) + ' s simulados' : '—');
    }
    if (well) {
      add('workers', 'Aguadores', fraction(well.workers, 1));
      add('well-served', 'Habitantes abastecidos', fraction(well.served, waterRules.capacity));
      add('coverage', 'Cobertura', 'Hasta ' + formatNumber(waterRules.roadRange) + ' tramos');
    }
    this.renderRows(fields);
    this.cancel.disabled = cell === null;
  }

  private renderRows(fields: readonly [string, string, string][]): void {
    const layout = fields.map(([id, label]) => id + ':' + label).join('|');
    if (layout !== this.layout) {
      this.layout = layout;
      this.rows.clear();
      const nodes = fields.flatMap(([id, label]) => {
        const term = document.createElement('dt');
        term.textContent = label;
        const value = document.createElement('dd');
        value.id = 'cell-' + id;
        this.rows.set(id, value);
        return [term, value];
      });
      this.details.replaceChildren(...nodes);
    }
    for (const [id, , value] of fields) setText(this.rows.get(id)!, value);
  }


  destroy(): void {
    this.events.abort();
  }
}
