import type { AuditResource, EconomicHistory } from '../economy/EconomicHistory';
import { resourceNames } from '../economy/Economy';
import { unitsPerResource } from '../economy/Inventories';
import { constructionNames, isConstructionType } from '../map/ConstructionMap';
import type { SettlementSimulation } from '../simulation/SettlementSimulation';
import { formatGameTime, gameTimeAt } from '../simulation/GameTime';

const operationNames = {
  production: 'Producción', transfer: 'Transferencia', consumption: 'Consumo', sale: 'Venta',
  construction: 'Costo de construcción', 'construction-material': 'Material de construcción',
  demolition: 'Costo de demolición', wages: 'Salarios', maintenance: 'Mantenimiento', tax: 'Impuestos',
} as const;
const endpointNames: Readonly<Record<string, string>> = {
  production: 'Producción local', treasury: 'Tesorería',
  'initial-reserve': 'Reserva inicial', 'food-consumption': 'Consumo',
  'construction-reserve': 'Reserva de construcción', workers: 'Trabajadores',
  'building-maintenance': 'Mantenimiento de construcciones', 'tax-base': 'Base tributaria residencial',
};

function endpointName(id: string): string {
  const [type, coordinates] = id.split(':');
  return isConstructionType(type) && coordinates
    ? constructionNames[type] + ' (' + coordinates + ')'
    : endpointNames[id] ?? id;
}

function exactAmount(units: number, scale = unitsPerResource): string {
  if ((units % scale * 10_000) % scale === 0) {
    return (units / scale).toLocaleString('es', { maximumFractionDigits: 4 });
  }
  const whole = Math.floor(units / scale);
  const fraction = (units % scale) + '/' + scale;
  return whole ? whole + ' + ' + fraction : fraction;
}

export class SimulationPanel {
  private readonly pause = document.querySelector<HTMLButtonElement>('#simulation-pause')!;
  private readonly speed = document.querySelector<HTMLSelectElement>('#simulation-speed')!;
  private readonly time = document.querySelector<HTMLElement>('#simulation-time')!;
  private readonly audit = document.querySelector<HTMLDetailsElement>('#audit-panel')!;
  private readonly resource = document.querySelector<HTMLSelectElement>('#audit-resource')!;
  private readonly selectedOnly = document.querySelector<HTMLInputElement>('#audit-selected-only')!;
  private readonly list = document.querySelector<HTMLOListElement>('#audit-list')!;
  private readonly empty = document.querySelector<HTMLElement>('#audit-empty')!;
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
    this.speed.addEventListener('change', () => {
      const value = Number(this.speed.value);
      if (value === 1 || value === 2 || value === 3) simulation.setSpeed(value);
      this.render();
    }, options);
    this.audit.addEventListener('toggle', () => this.render(), options);
    this.resource.addEventListener('change', () => this.render(), options);
    this.selectedOnly.addEventListener('change', () => this.render(), options);
    this.render();
  }

  renderClock(): void {
    const time = this.simulation.gameTime;
    const label = formatGameTime(time) + (time.daylight ? ' · Día' : ' · Noche');
    if (this.time.textContent !== label) this.time.textContent = label;
  }

  render(building = this.building): void {
    this.building = building;
    this.pause.textContent = this.simulation.paused ? 'Reanudar' : 'Pausar';
    this.speed.value = String(this.simulation.speed);
    this.renderClock();
    if (!this.audit.open) return;

    const target = this.selectedOnly.checked ? building : undefined;
    const resource = this.resource.value as AuditResource | '';
    const view = JSON.stringify([this.history.latestId, resource, target, this.selectedOnly.checked]);
    if (view === this.lastView) return;
    this.lastView = view;
    const events = target === null ? [] : this.history.read(resource || undefined, target);
    this.empty.hidden = events.length > 0;
    this.empty.textContent = target === null ? 'Selecciona un edificio en el mapa.'
      : 'Todavía no hay movimientos para este filtro.';
    this.list.replaceChildren(...[...events].reverse().map(event => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      const amount = (units: number) => exactAmount(units, event.unitScale);
      const operation = event.soldProduct ? 'Venta de ' + resourceNames[event.soldProduct].toLowerCase()
        : operationNames[event.operation];
      title.textContent = '#' + event.id + ' · ' + formatGameTime(gameTimeAt(event.timeMs)) + ' · '
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
    }));
  }

  destroy(): void {
    this.events.abort();
  }
}
