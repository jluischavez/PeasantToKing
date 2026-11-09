import { distributionRules } from '../economy/Distribution';
import { tradeGold, tradeModes, tradeRules } from '../economy/ExternalTrade';
import type { ExternalTrade, TradeMode, TradeTrip } from '../economy/ExternalTrade';
import { unitsPerResource } from '../economy/Inventories';
import { productIds, productNames } from '../economy/Products';
import type { ProductId } from '../economy/Products';
import { formatNumber } from '../formatNumber';
import type { Cell } from '../map/CellSelection';
import { populationRules } from '../population/Population';
import { formatGameTime, gameTimeAt, perGameHour } from '../simulation/GameTime';
import { setText } from './domText';

const modeNames = { off: 'Sin comercio', export: 'Exportar', import: 'Importar' } as const;
const date = (timeMs: number) => formatGameTime(gameTimeAt(timeMs));
const coordinates = (cell: Cell) => `(${cell.column}, ${cell.row})`;

function describeTrip(trip: TradeTrip): string {
  const goods = (stock: TradeTrip['sold']) => productIds.filter(product => stock[product] > 0)
    .map(product => `${formatNumber(stock[product] / unitsPerResource)} ${productNames[product].toLowerCase()}`).join(', ');
  const parts = [];
  if (trip.exports) parts.push(`Exportó ${goods(trip.sold)} · +${formatNumber(tradeGold(trip.exports))} oro`);
  if (trip.imports) parts.push(`Importó ${goods(trip.bought)} · −${formatNumber(tradeGold(trip.imports))} oro`);
  return parts.join(' · ');
}

export class TradePanel {
  private readonly root = document.querySelector<HTMLFieldSetElement>('#trade-configuration')!;
  private readonly options = document.getElementById('trade-product-options')!;
  private readonly status = document.getElementById('trade-site-state')!;
  private readonly lastTrip = document.getElementById('trade-site-last')!;
  private readonly overview = document.getElementById('trade-overview')!;
  private readonly pane = document.getElementById('trade-panel')!;
  private readonly sites = document.getElementById('trade-sites')!;
  private readonly history = document.getElementById('trade-history')!;
  private readonly latest = document.getElementById('trade-latest')!;
  private readonly events = new AbortController();
  private readonly rows = new Map<ProductId, ReturnType<TradePanel['addProduct']>>();
  private cell: Cell | null = null;
  private siteView = '';
  private lastEvent?: TradeTrip;

  constructor(private readonly trade: ExternalTrade, private readonly selectSite: (cell: Cell) => void,
    private readonly changed: () => void) {
    this.history.replaceChildren();
    this.sites.replaceChildren();
    this.options.replaceChildren();
    setText(this.latest, 'Todavía no se ha realizado ningún viaje.');
    for (const product of productIds) this.rows.set(product, this.addProduct(product));
    this.sites.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-site]');
      const cell = this.trade.sites.find(site => coordinates(site) === button?.dataset.site);
      if (cell) this.selectSite(cell);
    }, { signal: this.events.signal });
  }

  private addProduct(product: ProductId) {
    const row = document.createElement('section');
    row.className = 'trade-product';
    const title = document.createElement('strong');
    title.textContent = productNames[product];
    const mode = document.createElement('select');
    mode.id = `trade-${product}-mode`;
    mode.replaceChildren(...tradeModes.map(value => new Option(modeNames[value], value)));
    const number = (setting: 'reserve' | 'target') => {
      const input = document.createElement('input');
      input.id = `trade-${product}-${setting}`;
      input.type = 'number';
      input.min = '0';
      input.max = String(tradeRules.maximumSetting);
      input.step = '1';
      return input;
    };
    const reserve = number('reserve'), target = number('target');
    const label = (text: string, input: HTMLElement) => {
      const element = document.createElement('label');
      element.append(text + ' ', input);
      return element;
    };
    const details = document.createElement('p'), warning = document.createElement('p');
    details.className = warning.className = 'panel-note';
    warning.setAttribute('data-warning', '');
    row.append(title, label(`Modo de ${productNames[product].toLowerCase()}`, mode), label('Reserva mínima', reserve),
      label('Objetivo de importación', target), details, warning);
    this.options.append(row);
    const commit = () => {
      if (!this.cell || this.root.disabled) return;
      if (this.trade.configure(this.cell, product, { mode: mode.value as TradeMode, reserve: reserve.valueAsNumber,
        target: target.valueAsNumber })) this.changed();
      else setText(warning, 'Introduce reservas y objetivos enteros entre 0 y ' + formatNumber(tradeRules.maximumSetting) + '.');
    };
    for (const control of [mode, reserve, target]) control.addEventListener('change', commit, { signal: this.events.signal });
    return { mode, reserve, target, details, warning };
  }

  renderSelected(cell: Cell | null, residents: number, defeated: boolean): void {
    const house = cell ? this.trade.at(cell) : undefined;
    const changedSite = this.cell?.column !== cell?.column || this.cell?.row !== cell?.row;
    this.cell = house ? cell : null;
    this.root.hidden = !house;
    this.root.disabled = defeated;
    if (!house) return;
    setText(this.status, (house.issue ?? 'Esperando el próximo viaje.')
      + ` · Carga máxima ${formatNumber(house.capacity)} · Próxima oportunidad ${date(house.nextAt)}`);
    setText(this.lastTrip, house.lastTrip ? 'Último viaje · ' + describeTrip(house.lastTrip) : 'Esta casa aún no tiene viajes registrados.');
    for (const [product, row] of this.rows) {
      const { mode, reserve, target } = house.preferences[product];
      const { stock, exportable, space, floor, status } = house.products[product];
      if (row.mode.value !== mode) row.mode.value = mode;
      for (const [input, value] of [[row.reserve, reserve], [row.target, target]] as const) {
        if ((changedSite || document.activeElement !== input) && input.value !== String(value)) input.value = String(value);
      }
      const { buy, sell } = tradeRules.products[product];
      setText(row.details, `${status} · Stock ${formatNumber(stock)} · Excedente ${formatNumber(exportable)} · Reserva efectiva ${formatNumber(floor)}`
        + ` · Espacio ${formatNumber(space)} · Venta ${formatNumber(sell / 100)} oro/u · Compra ${formatNumber(buy / 100)} oro/u`);
      const demand = residents * tradeRules.protectedHours * (product === 'food'
        ? perGameHour(populationRules.foodPerResidentPerSecond) : distributionRules.woodPerResidentPerHour);
      setText(row.warning, mode === 'export' && floor < demand
        ? `La reserva efectiva cubre menos de ${tradeRules.protectedHours} h de consumo estimado (${formatNumber(demand)} unidades).` : '');
    }
  }

  render(hasEntry: boolean): void {
    if (this.pane.hidden) return;
    const houses = this.trade.sites.map(cell => this.trade.at(cell)!);
    setText(this.overview, hasEntry ? `${houses.length} casas · Viajes cada ${tradeRules.intervalHours} h del juego.`
      : 'Este mapa carece de entrada exterior. Hace falta una ruta hasta un acceso del reino.');
    const rows = houses.map(house => ({ cell: house.cell, summary: `${coordinates(house.cell)} · ${house.workers}/2 empleados`
      + ` · ${house.issue ?? 'Ruta exterior activa'} · ${date(house.nextAt)}` }));
    const view = JSON.stringify(rows);
    if (view !== this.siteView) {
      this.siteView = view;
      this.sites.replaceChildren(...rows.map(({ cell, summary }) => {
        const item = document.createElement('li'), button = document.createElement('button');
        button.type = 'button';
        button.dataset.site = coordinates(cell);
        button.textContent = 'Inspeccionar ' + coordinates(cell);
        item.append(button, ' · ' + summary);
        return item;
      }));
    }
    const event = this.trade.history.at(-1);
    if (event === this.lastEvent) return;
    this.lastEvent = event;
    if (event) setText(this.latest, describeTrip(event));
    this.history.replaceChildren(...[...this.trade.history].reverse().map(trip => {
      const item = document.createElement('li');
      item.textContent = `${date(trip.timeMs)} · ${coordinates(trip.cell)} · ${describeTrip(trip)}`;
      return item;
    }));
  }

  destroy(): void { this.events.abort(); }
}
