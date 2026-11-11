import { formatNumber } from '../formatNumber';
import type { EmigrationEvent } from '../population/Wellbeing';
import { Feed } from './Feed';
import { setText } from './domText';
import type { AuditResource, EconomicEvent, EconomicHistory } from '../economy/EconomicHistory';
import { resourceNames } from '../economy/Economy';
import { unitsPerResource } from '../economy/Inventories';
import { constructionNames, isConstructionType } from '../map/ConstructionMap';
import type { OccasionalArrival, SettlementSimulation } from '../simulation/SettlementSimulation';
import { formatGameTime, gameTimeAt } from '../simulation/GameTime';
import { rankRules, settlementRanks } from '../simulation/SettlementProgress';

const operationNames = {
  'royal-aid': 'Provisiones reales', 'royal-subsidy': 'Subsidio real', 'royal-relief': 'Reducción del tributo',
  'mission-contribution': 'Contribución de misión', 'mission-reward': 'Recompensa de misión', 'mission-delivery': 'Entrega de misión',
  production: 'Producción', transfer: 'Transferencia', consumption: 'Consumo', sale: 'Venta',
  construction: 'Costo de construcción', 'construction-material': 'Material de construcción',
  demolition: 'Costo de demolición', clearing: 'Limpieza de terreno', recognition: 'Pago de reconocimiento',
  tribute: 'Tributo real', offering: 'Ofrenda real',
  export: 'Exportación', import: 'Importación',
  wages: 'Salarios', maintenance: 'Mantenimiento', tax: 'Impuestos',
} as const;
const endpointNames: Readonly<Record<string, string>> = {
  production: 'Producción local', treasury: 'Tesorería',
  'initial-reserve': 'Reserva inicial', 'food-consumption': 'Consumo',
  'construction-reserve': 'Reserva de construcción', workers: 'Trabajadores',
  'building-maintenance': 'Mantenimiento de construcciones', 'tax-base': 'Base tributaria residencial',
  crown: 'La Corona', 'workers-arrears': 'Salarios pendientes', 'maintenance-arrears': 'Mantenimiento pendiente',
};

function endpointName(id: string): string {
  const [type, coordinates] = id.split(':');
  if (type === 'royal-audience') return 'Audiencia real ' + coordinates;
  if (type === 'tribute' && Number.isFinite(Number(coordinates))) return 'Obligación real · ' + formatGameTime(gameTimeAt(Number(coordinates)));
  if (type === 'cargo') return 'Cargamento ' + coordinates;
  if (type === 'mission') return 'Misión del reino ' + id.slice(8);
  if (type === 'terrain' && coordinates) return 'Terreno (' + coordinates + ')';
  if (type === 'rank') {
    const rank = settlementRanks.find(rank => rank === coordinates);
    if (rank) return rankRules[rank].name;
  }
  return isConstructionType(type) && coordinates
    ? constructionNames[type] + ' (' + coordinates + ')'
    : endpointNames[id] ?? id;
}

export class SimulationPanel {
  private readonly pause = document.querySelector<HTMLButtonElement>('#simulation-pause')!;
  private readonly speed = document.querySelector<HTMLSelectElement>('#simulation-speed')!;
  private readonly time = document.querySelector<HTMLElement>('#simulation-time')!;
  private readonly date = document.getElementById('simulation-date')!;
  private readonly phase = document.getElementById('simulation-phase')!;
  private readonly audit = document.getElementById('audit-panel')!;
  private readonly resource = document.querySelector<HTMLSelectElement>('#audit-resource')!;
  private readonly selectedOnly = document.querySelector<HTMLInputElement>('#audit-selected-only')!;
  private readonly list = document.querySelector<HTMLOListElement>('#audit-list')!;
  private readonly feed = new Feed<EconomicEvent>(this.audit, this.list);
  private readonly empty = document.querySelector<HTMLElement>('#audit-empty')!;
  private readonly populationList = document.querySelector<HTMLOListElement>('#population-events-list')!;
  private readonly populationEmpty = document.querySelector<HTMLElement>('#population-events-empty')!;
  private lastDeparture: EmigrationEvent | null = null;
  private lastArrival: OccasionalArrival | null = null;
  private readonly events = new AbortController();
  private readonly simulation: SettlementSimulation;
  private readonly history: EconomicHistory;
  private building: string | null = null;
  private lastView = '';

  constructor(simulation: SettlementSimulation, history: EconomicHistory, onPauseChanged: () => void) {
    this.simulation = simulation;
    this.history = history;
    const options = { signal: this.events.signal };
    this.pause.addEventListener('click', () => {
      simulation.setPaused(!simulation.paused);
      onPauseChanged();
      this.render();
    }, options);
    this.populationList.replaceChildren();
    this.populationEmpty.hidden = false;
    this.speed.addEventListener('change', () => {
      const value = Number(this.speed.value);
      if (value === 1 || value === 2 || value === 3) simulation.setSpeed(value);
      this.render();
    }, options);
    this.resource.addEventListener('change', () => this.render(), options);
    this.selectedOnly.addEventListener('change', () => this.render(), options);
    this.render();
  }

  renderClock(): void {
    const time = this.simulation.gameTime;
    setText(this.date, 'Año ' + formatNumber(time.year) + ' · Día ' + formatNumber(time.day));
    setText(this.time, [time.hour, time.minute].map(value => String(value).padStart(2, '0')).join(':'));
    setText(this.phase, time.daylight ? 'Día' : 'Noche');
  }

  render(building = this.building): void {
    this.building = building;
    const defeated = this.simulation.crown.defeated;
    setText(this.pause, defeated ? 'Partida terminada' : this.simulation.paused ? 'Reanudar' : 'Pausar');
    this.pause.disabled = this.speed.disabled = defeated;
    const speed = String(this.simulation.speed);
    if (this.speed.value !== speed) this.speed.value = speed;
    this.renderClock();
    if (this.audit.hidden) return;
    const departures = this.simulation.wellbeing.emigrationEvents;
    const arrivals = this.simulation.occasionalArrivals;

    const target = this.selectedOnly.checked ? building : undefined;
    const resource = this.resource.value as AuditResource | '';
    const view = JSON.stringify([this.history.latestId, resource, target, this.selectedOnly.checked]);
    if (view === this.lastView && (departures.at(-1) ?? null) === this.lastDeparture
      && (arrivals.at(-1) ?? null) === this.lastArrival) return;
    this.lastView = view;
    const events = target === null ? [] : this.history.read(resource || undefined, target);
    this.feed.render([...events].reverse(), event => event.id, event => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      const amount = (units: number) => formatNumber(units / (event.unitScale ?? unitsPerResource));
      const operation = event.soldProduct ? 'Venta de ' + resourceNames[event.soldProduct].toLowerCase()
        : operationNames[event.operation];
      title.textContent = '#' + formatNumber(event.id) + ' · ' + formatGameTime(gameTimeAt(event.timeMs)) + ' · '
        + operation + (event.result === 'unpaid' ? ' (impago)' : '')
        + ' · ' + resourceNames[event.resource] + ' ' + amount(event.units);
      const route = document.createElement('div');
      route.textContent = endpointName(event.origin) + ' → ' + endpointName(event.destination)
        + (event.household ? ' · Entrega a ' + endpointName(event.household) : '');
      const balances = document.createElement('small');
      const parts = [];
      if (event.originBalance) {
        parts.push('Origen ' + amount(event.originBalance.before) + ' → ' + amount(event.originBalance.after));
      }
      if (event.destinationBalance) {
        parts.push('Destino ' + amount(event.destinationBalance.before) + ' → ' + amount(event.destinationBalance.after));
      }
      balances.textContent = parts.join(' · ');
      row.append(title, route, balances);
      return row;
    }, () => {
      this.renderPopulationEvents(departures, arrivals);
      this.empty.hidden = events.length > 0;
      setText(this.empty, target === null ? 'Selecciona un edificio en el mapa.' : 'Todavía no hay movimientos para este filtro.');
    });
  }

  private renderPopulationEvents(departures: readonly EmigrationEvent[], arrivals: readonly OccasionalArrival[]): void {
    this.lastDeparture = departures.at(-1) ?? null;
    this.lastArrival = arrivals.at(-1) ?? null;
    const events = [
      ...arrivals.map(event => ({ ...event, residents: 1, label: 'Llegada ocasional' })),
      ...departures.map(event => ({ ...event, label: event.reason === 'deterioration'
        ? 'Emigración por deterioro de vivienda' : 'Emigración por descontento sostenido' })),
    ].sort((a, b) => b.timeMs - a.timeMs);
    this.populationEmpty.hidden = events.length > 0;
    this.populationList.replaceChildren(...events.map(event => {
      const row = document.createElement('li');
      row.textContent = formatGameTime(gameTimeAt(event.timeMs)) + ' · ' + event.label + ' · '
        + formatNumber(event.residents) + (event.residents === 1 ? ' habitante' : ' habitantes')
        + ' · Vivienda (' + event.cell.column + ',' + event.cell.row + ')';
      return row;
    }));
  }

  destroy(): void {
    this.events.abort();
  }
}
