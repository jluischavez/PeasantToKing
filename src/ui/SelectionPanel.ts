import { formatNumber } from '../formatNumber';
import { unitsPerResource } from '../economy/Inventories';
import { setText } from './domText';
import { distributionRules } from '../economy/Distribution';
import type { MarketSnapshot, HousingSupply } from '../economy/Distribution';
import { gameMinutesForSeconds } from '../simulation/GameTime';
import type { WarehouseSnapshot } from '../economy/Storage';
import type { BuildingProductivity } from '../economy/Economy';
import type { Cell } from '../map/CellSelection';
import { populationRules } from '../population/Population';
import { wellbeingState } from '../population/Wellbeing';
import { housingLevels, housingRules, nextHousingBeauty } from '../population/HousingEvolution';
import type { HousingLevel, HousingEvolution } from '../population/HousingEvolution';
import { beautyRules, beautySourceName } from '../population/ResidentialBeauty';
import type { Beauty, BeautySource } from '../population/ResidentialBeauty';
import type { NeedCoverage } from '../population/HouseholdNeeds';
import { waterRules } from '../simulation/WaterService';
import type { WellSnapshot } from '../simulation/WaterService';
import { constructionNames } from '../map/ConstructionMap';
import type { ConstructionType, Dimensions } from '../map/ConstructionMap';
import { clearingCosts } from '../map/ConstructionCosts';
import { groundNames, isProtectedGround, obstacleNames } from '../map/Terrain';
import type { TerrainTile } from '../map/Terrain';
import { roadMaterials } from '../map/RoadMaterials';
import { requiresRoadConnection } from '../map/BuildingAccess';
import type { RoadLevel } from '../map/RoadMaterials';

export class SelectionPanel {
  private readonly details = document.getElementById('cell-details')!;
  private readonly rows = new Map<string, HTMLElement>();
  private layout = '';
  private readonly cancel = document.querySelector<HTMLButtonElement>('#cancel-selection')!;
  private readonly clearTerrain = document.querySelector<HTMLButtonElement>('#clear-terrain')!;
  private readonly upgradeRoad = document.querySelector<HTMLButtonElement>('#upgrade-road')!;
  private readonly demolition = document.querySelector<HTMLElement>('#demolition-confirmation')!;
  private readonly demolitionTarget = document.querySelector<HTMLElement>('#demolition-target')!;
  private readonly demolitionIssue = document.querySelector<HTMLElement>('#demolition-issue')!;
  private readonly confirmDemolition = document.querySelector<HTMLButtonElement>('#confirm-demolition')!;
  private readonly cancelDemolition = document.querySelector<HTMLButtonElement>('#cancel-demolition')!;
  private readonly events = new AbortController();

  constructor(onCancel: () => void, onConfirm: () => void, onCancelConfirmation: () => void,
    onClearTerrain: () => void, onUpgradeRoad: () => void) {
    const options = { signal: this.events.signal };
    this.cancel.addEventListener('click', onCancel, options);
    this.confirmDemolition.addEventListener('click', onConfirm, options);
    this.cancelDemolition.addEventListener('click', onCancelConfirmation, options);
    this.clearTerrain.addEventListener('click', onClearTerrain, options);
    this.upgradeRoad.addEventListener('click', onUpgradeRoad, options);
    this.render(null);
    this.renderConfirmation(null);
  }

  renderConfirmation(target: string | null, issue: string | null = null,
    action: 'demolition' | 'clearing' | 'bridge' | 'upgrade' = 'demolition'): void {
    this.demolition.hidden = target === null;
    const labels = {
      bridge: ['Construir puente', 'Cancelar puente'],
      clearing: ['Confirmar limpieza', 'Cancelar limpieza'],
      demolition: ['Confirmar demolición', 'Cancelar demolición'],
      upgrade: ['Confirmar mejora', 'Cancelar mejora'],
    } as const;
    const [confirm, cancel] = labels[action];
    this.demolition.setAttribute('aria-label', confirm);
    setText(this.demolitionTarget, target ?? '');
    this.demolitionIssue.hidden = issue === null;
    setText(this.demolitionIssue, issue ?? '');
    this.confirmDemolition.disabled = issue !== null;
    setText(this.confirmDemolition, confirm);
    setText(this.cancelDemolition, cancel);
  }

  renderClearing(available: boolean): void { this.clearTerrain.hidden = !available; }

  renderRoadUpgrade(label: string | null, paused: boolean): void {
    this.upgradeRoad.hidden = label === null;
    this.upgradeRoad.disabled = paused;
    if (label) setText(this.upgradeRoad, label);
  }

  render(cell: Cell | null, terrain?: TerrainTile, construction: ConstructionType | null = null, connected = false, residents = 0,
    productivity?: BuildingProductivity, warehouse?: WarehouseSnapshot, market?: MarketSnapshot,
    supply?: HousingSupply, foodShortage = 0, woodSupply?: HousingSupply, woodShortage = 0,
    wellbeing?: Readonly<{ happiness: number; concerns: readonly string[] }>, waterSupplied = 0, well?: WellSnapshot,
    housing?: { level: HousingLevel; progress: ReturnType<HousingEvolution['at']>; beauty: Beauty;
      needs?: NeedCoverage; unemployment: number; waterIssue?: string },
    royal?: 'segment' | 'entry', employment?: { workers: number; capacity: number; issue: string | null },
    dimensions?: Dimensions, road?: RoadLevel, domestic?: { food: number; wood: number; purchases: number; arrivals: number }): void {
    const fields: [string, string, string][] = [];
    const add = (id: string, label: string, value: string) => fields.push([id, label, value]);
    const fraction = (value: number, total: number) => formatNumber(value) + ' / ' + formatNumber(total);
    add('coordinates', 'Coordenadas', cell ? `X ${cell.column} · Y ${cell.row}` : '—');
    add('terrain', 'Terreno', terrain ? groundNames[terrain.ground] : '—');
    if (terrain?.obstacle) {
      add('obstacle', 'Obstáculo', obstacleNames[terrain.obstacle]);
      add('clearing-cost', 'Costo de limpieza', formatNumber(clearingCosts[terrain.obstacle].gold) + ' oro');
    }
    const homeLevel = housing ? housingLevels[housing.level] : undefined;
    if (construction) add('construction', 'Construcción', royal ? 'Camino exterior del reino' : constructionNames[construction]);
    if (dimensions && (dimensions.width > 1 || dimensions.height > 1)) {
      add('dimensions', 'Huella', dimensions.width + ' × ' + dimensions.height);
    }
    if (royal === 'entry') add('entry', 'Punto de entrada', 'Entrada al reino');
    if (road) add('road-material', 'Superficie', roadMaterials[road] + ' · Nivel ' + road + (road === 3 ? ' (máximo)' : ''));
    const status = royal ? 'Protegido. Este camino pertenece al reino y no puede demolerse.'
      : construction === 'bridge' ? 'Cruce de madera sobre el río.'
      : terrain && isProtectedGround(terrain.ground) ? 'Terreno protegido. No se puede construir ni limpiar.'
      : terrain?.obstacle ? 'Limpia el terreno antes de construir.'
      : housing && homeLevel
      ? (residents > 0 || housing.level > 1 ? homeLevel.name : 'Solar vacío')
      : construction ? 'Ocupada' : cell ? 'Casilla disponible' : 'Sin selección';
    add('status', 'Estado', status);
    if (construction) add('connection', 'Conexión vial', requiresRoadConnection(construction)
      ? connected ? 'Conectado' : 'Sin conexión' : 'No necesaria');
    if (employment) {
      add('workers', 'Empleados', fraction(employment.workers, employment.capacity));
      add('operation', 'Operación', employment.issue ? 'Inactivo' : 'Operativo');
      add('operation-reason', 'Motivo de inactividad', employment.issue ?? '—');
    }
    if (productivity) add('productivity', 'Productividad', formatNumber(productivity.ratio * 100) + ' %');
      if (productivity) {
        add('pending-cargo', 'Pendiente de recogida', formatNumber(productivity.transport.pending));
        add('transit-cargo', 'En tránsito', formatNumber(productivity.transport.inTransit));
        if (productivity.transport.blocked > 0) add('blocked-cargo', 'Transportes bloqueados', formatNumber(productivity.transport.blocked));
        if (productivity.transport.dispatchStopped) add('dispatch-stopped', 'Despachos', 'Detenidos para demoler. Cancelar modo los reactiva.');
      }
    if (warehouse || market) {
      const inventory = warehouse ?? market!;
      add('food-stock', 'Comida', formatNumber(inventory.food));
      add('wood-stock', 'Madera', formatNumber(inventory.wood));
      add('used', 'Capacidad usada', fraction(warehouse?.used ?? inventory.food + inventory.wood, inventory.capacity));
      if (warehouse) {
        add('incoming-cargo', 'Reservado para entregas', formatNumber(warehouse.incoming));
        add('outgoing-pending', 'Reservado para recogida', formatNumber(warehouse.outgoing.pending));
        add('outgoing-transit', 'En reparto', formatNumber(warehouse.outgoing.inTransit));
        add('free', 'Disponible', formatNumber(warehouse.free));
      }
    }
    if (market) {
        add('market-incoming-food', 'Comida en camino', formatNumber(market.incomingFood));
        add('market-incoming-wood', 'Madera en camino', formatNumber(market.incomingWood));
      add('coverage', 'Cobertura', formatNumber(market.coveredHomes) + ' solares · hasta ' + formatNumber(market.range) + ' tramos');
      add('restock', 'Reposición', 'Cada ' + formatNumber(gameMinutesForSeconds(distributionRules.restockIntervalSeconds)) + ' min del juego');
      add('market-reason', 'Abastecimiento', market.reason);
    }
    if (housing && homeLevel) {
      const happiness = wellbeing?.happiness ?? populationRules.migration.neutralHappiness;
      const requirement = nextHousingBeauty(housing.level);
      const { score, sources } = housing.beauty;
      const bonuses = (Object.entries(sources) as [BeautySource, number][])
        .sort((a, b) => b[1] - a[1]).map(([source, points]) => beautySourceName(source) + ' +' + points);
      add('beauty', 'Belleza', fraction(score, beautyRules.maximum));
      add('beauty-sources', 'Fuentes de belleza', ['Base ' + beautyRules.base, ...bonuses].join(' · '));
      add('beauty-required', 'Belleza para mejorar', requirement === undefined ? 'Nivel máximo'
        : requirement === 0 ? 'Sin mínimo' : fraction(requirement, beautyRules.maximum));
      const missing: string[] = [];
      if (residents === 0) missing.push('Vivienda habitada');
      else {
        if ((housing.needs?.food ?? 0) < 1) missing.push('Comida');
        if ((housing.needs?.wood ?? 0) < 1) missing.push('Madera');
        if ((housing.needs?.water ?? 0) < 1) missing.push('Agua');
        if (happiness < housingRules.upgradeHappiness) missing.push('Felicidad ≥ ' + housingRules.upgradeHappiness);
        if (housing.unemployment > housingRules.maximumUnemployment) {
          missing.push('Desempleo ≤ ' + formatNumber(housingRules.maximumUnemployment * 100) + ' %');
        }
      }
      if (requirement !== undefined && score < requirement) missing.push('Belleza ≥ ' + requirement);
      add('housing-missing', 'Pendiente para mejorar', requirement === undefined ? '—' : missing.join(' · ') || 'Requisitos cumplidos');
      add('beauty-maintain', 'Belleza para conservar el nivel',
        housingRules.minimumBeauty[housing.level] ? fraction(housingRules.minimumBeauty[housing.level], beautyRules.maximum) : 'Sin mínimo');
      add('housing-level', 'Nivel de vivienda', formatNumber(housing.level));
      add('residents', 'Habitantes', fraction(residents, homeLevel.capacity));
      if (supply) add('food-supply', 'Comida', supply.status === 'reserve' ? 'Reserva inicial'
        : supply.status === 'household' ? 'Reserva doméstica' : supply.status === 'market' ? 'Mercado a ' + formatNumber(supply.distance ?? 0) + ' tramos' : 'Sin abastecimiento');
      if (residents > 0) {
        if (domestic) {
          add('home-food', 'Comida en casa', formatNumber(domestic.food / unitsPerResource));
          add('home-wood', 'Madera en casa', formatNumber(domestic.wood / unitsPerResource));
          add('home-shopping', 'Compras en curso', formatNumber(domestic.purchases));
          add('home-arrivals', 'Vecinos admitidos en camino', formatNumber(domestic.arrivals));
        }
        add('wood-supply', 'Madera', woodSupply?.status === 'household' ? 'Reserva doméstica' : woodSupply?.status === 'market'
          ? 'Mercado a ' + formatNumber(woodSupply.distance ?? 0) + ' tramos' : 'Sin abastecimiento');
        add('water-supply', 'Agua', fraction(waterSupplied, residents) + ' hab. abastecidos');
        if (housing.waterIssue) add('water-issue', 'Motivo de falta de agua', housing.waterIssue);
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
      add('well-capacity', 'Capacidad', formatNumber(waterRules.capacity) + ' habitantes');
      add('well-served', 'Habitantes abastecidos', formatNumber(well.served));
      add('coverage', 'Cobertura', 'Hasta ' + formatNumber(waterRules.roadRange) + ' tramos');
      add('water-issue', 'Estado del servicio', !well.connected ? 'Pozo sin conexión vial.' : well.workers === 0 ? 'Pozo sin aguador.'
        : well.served >= waterRules.capacity ? 'Todos los cupos ocupados.' : 'Quedan cupos en la zona de cobertura.');
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
