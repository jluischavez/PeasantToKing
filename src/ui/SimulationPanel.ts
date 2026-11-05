import type { AuditResource, EconomicHistory } from '../economy/EconomicHistory';
import { resourceNames } from '../economy/Economy';
import { unitsPerResource } from '../economy/Inventories';
import { constructionNames, isConstructionType } from '../map/ConstructionMap';
import type { SettlementSimulation } from '../simulation/SettlementSimulation';

const operationNames = {
  production: 'Producción', transfer: 'Transferencia', consumption: 'Consumo', sale: 'Venta',
} as const;
const endpointNames: Readonly<Record<string, string>> = {
  production: 'Producción local', treasury: 'Tesorería',
  'initial-reserve': 'Reserva inicial', 'food-consumption': 'Consumo',
};

function endpointName(id: string): string {
  const [type, coordinates] = id.split(':');
  return isConstructionType(type) && coordinates
    ? constructionNames[type] + ' (' + coordinates + ')'
    : endpointNames[id] ?? id;
}

function exactAmount(units: number): string {
  if ((units * 10) % unitsPerResource === 0) return (units / unitsPerResource).toLocaleString('es');
  const whole = Math.floor(units / unitsPerResource);
  const fraction = (units % unitsPerResource) + '/' + unitsPerResource;
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

  render(building = this.building): void {
    this.building = building;
    this.pause.textContent = this.simulation.paused ? 'Reanudar' : 'Pausar';
    this.speed.value = String(this.simulation.speed);
    this.time.textContent = (this.simulation.simulatedTimeMs / 1000).toLocaleString('es') + ' s simulados';
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
      title.textContent = '#' + event.id + ' · ' + (event.timeMs / 1000).toLocaleString('es') + ' s · '
        + operationNames[event.operation] + ' · ' + resourceNames[event.resource] + ' ' + exactAmount(event.units);
      const route = document.createElement('div');
      route.textContent = endpointName(event.origin) + ' → ' + endpointName(event.destination)
        + (event.household ? ' · Entrega a ' + endpointName(event.household) : '');
      const balances = document.createElement('small');
      const parts = [];
      if (event.originBalance) {
        parts.push('Origen ' + exactAmount(event.originBalance.before) + ' → ' + exactAmount(event.originBalance.after));
      }
      if (event.destinationBalance) {
        parts.push('Destino ' + exactAmount(event.destinationBalance.before) + ' → ' + exactAmount(event.destinationBalance.after));
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
