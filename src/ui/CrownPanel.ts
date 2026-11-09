import type { Economy } from '../economy/Economy';
import { formatNumber } from '../formatNumber';
import { crownRules } from '../simulation/Crown';
import type { Offering, RoyalEvent } from '../simulation/Crown';
import { formatGameTime, gameTimeAt, simulatedMsPerGameHour } from '../simulation/GameTime';
import type { SettlementSimulation } from '../simulation/SettlementSimulation';
import { royalMessage } from '../story/RoyalScenes';
import { setText } from './domText';

const offerings = Object.keys(crownRules.offerings).map(Number) as Offering[];
const gold = (amount: number) => formatNumber(amount) + ' oro';

export class CrownPanel {
  private readonly fields = Object.fromEntries(['favor', 'balance', 'debt', 'credit', 'arrears', 'tribute',
    'date', 'date-label', 'time', 'streak', 'consequences', 'quote', 'feedback', 'history', 'notice', 'confirmation']
    .map(id => [id, document.getElementById('crown-' + id)!]));
  private readonly pay = document.querySelector<HTMLButtonElement>('#crown-pay')!;
  private readonly decree = document.querySelector<HTMLButtonElement>('#crown-decree')!;
  private readonly select = document.querySelector<HTMLSelectElement>('#crown-offering')!;
  private readonly prepare = document.querySelector<HTMLButtonElement>('#crown-prepare')!;
  private readonly events = new AbortController();
  private quote: { amount: Offering; favor: number } | null = null;
  private lastEvent: RoyalEvent | undefined;
  private noticeTimer = 0;

  constructor(private readonly simulation: SettlementSimulation, private readonly economy: Economy,
    changed: () => void, openDecree: () => void) {
    const { crown } = simulation;
    const options = { signal: this.events.signal };
    this.fields.feedback.textContent = '';
    this.fields.notice.hidden = true;
    this.lastEvent = crown.history.at(-1);
    this.renderHistory();
    this.select.replaceChildren(...offerings.map(amount => new Option(
      gold(amount) + ' · hasta +' + crownRules.offerings[amount] + ' de favor', String(amount))));
    this.pay.addEventListener('click', () => {
      const due = crown.obligation?.dueAt;
      if (due !== undefined && simulation.payTribute(due)) changed();
    }, options);
    this.decree.addEventListener('click', openDecree, options);
    this.select.addEventListener('change', () => { this.quote = null; this.render(); }, options);
    this.prepare.addEventListener('click', () => {
      const amount = this.amount();
      if (amount === undefined || this.prepare.disabled) return;
      this.quote = { amount, favor: crown.favor };
      this.render();
    }, options);
    document.getElementById('crown-cancel')!.addEventListener('click', () => { this.quote = null; this.render(); }, options);
    document.getElementById('crown-confirm')!.addEventListener('click', () => {
      const quote = this.quote;
      this.quote = null;
      if (quote && simulation.makeOffering(quote.amount, quote.favor)) changed();
      else this.render();
    }, options);
  }

  private amount(): Offering | undefined { return offerings.find(amount => String(amount) === this.select.value); }

  render(): void {
    const { crown, progress } = this.simulation;
    const { balance, debt, limit, available } = this.economy.credit;
    const arrears = this.economy.operatingArrears;
    const tribute = crown.obligation;
    const remainingHours = Math.max(0, Math.ceil((crown.nextAt - this.simulation.simulatedTimeMs) / simulatedMsPerGameHour));
    const affordable = !!tribute && this.economy.canPayRoyalCost(tribute.gold);
    const values = {
      favor: `${crown.favor} / 100`, balance: gold(balance), debt: gold(debt), credit: `${formatNumber(available)} / ${gold(limit)}`,
      arrears: gold(arrears.wages + arrears.maintenance),
      tribute: tribute ? gold(tribute.gold) + ' · ' + (tribute.paid ? 'Pagado' : crown.defeated ? 'Vencido' : 'Pendiente')
        : 'Por emitir · ' + gold(crownRules.tribute[progress.rank]) + ' al rango actual',
      'date-label': tribute && !tribute.paid ? 'Vencimiento' : 'Próxima emisión',
      date: formatGameTime(gameTimeAt(crown.nextAt)), time: remainingHours + ' h del juego',
      streak: `${crown.streak} / ${crownRules.defeatAfter}`,
      consequences: crown.defeatReason ?? `Pagar a tiempo da +${crownRules.tributeFavor} de favor. El primer impago resta ${crownRules.missedFavor} y la pérdida aumenta con cada impago consecutivo. El tercero causa la destitución. Permanecer un día completo con favor cero también causa la destitución.`,
    };
    for (const [key, value] of Object.entries(values)) setText(this.fields[key], value);
    const warning = crown.confidence;
    document.getElementById('royal-status')!.hidden = !warning && !crown.defeated;
    setText(document.getElementById('royal-status-title')!, crown.defeated
      ? 'DERROTA — HAS SIDO DESTITUIDO POR EL REY' : 'Favor real en cero — Última advertencia');
    const minutes = warning ? Math.max(0, Math.ceil((warning.dueAt - this.simulation.simulatedTimeMs) * 60 / simulatedMsPerGameHour)) : 0;
    setText(document.getElementById('royal-status-detail')!, crown.defeatReason
      ?? `Quedan ${Math.floor(minutes / 60)} h ${minutes % 60} min del juego. Entrega una ofrenda o paga un tributo pendiente para recuperar favor.`);
    document.getElementById('royal-recover')!.hidden = crown.defeated;
    document.getElementById('royal-summary')!.hidden = !crown.defeated;
    document.getElementById('royal-new-or-load')!.hidden = !crown.defeated;
    this.fields.balance.toggleAttribute('data-debt', balance < 0);
    this.pay.disabled = crown.defeated || !tribute || tribute.paid || !affordable;
    this.pay.title = tribute && !tribute.paid && !affordable ? 'El saldo y el crédito disponible no alcanzan.' : '';
    this.decree.hidden = !crown.decreeAvailable;
    const amount = this.amount();
    this.select.disabled = crown.defeated || crown.favor === 100;
    this.prepare.disabled = this.select.disabled || amount === undefined || !this.economy.canPayRoyalCost(amount);
    if (this.prepare.disabled || this.quote?.favor !== crown.favor) this.quote = null;
    this.fields.confirmation.hidden = this.quote === null;
    if (this.quote) setText(this.fields.quote, `Entregar ${gold(this.quote.amount)} · +${Math.min(100 - crown.favor, crownRules.offerings[this.quote.amount])} de favor.`);

    const event = crown.history.at(-1);
    if (event && event !== this.lastEvent) {
      this.lastEvent = event;
      this.renderHistory();
      const message = royalMessage(event);
      setText(this.fields.feedback, message);
      setText(this.fields.notice, message);
      this.fields.notice.hidden = false;
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = window.setTimeout(() => { this.fields.notice.hidden = true; }, 8000);
    }
  }

  private renderHistory(): void {
    const rows = [...this.simulation.crown.history].reverse().map(event => {
      const row = document.createElement('li');
      const label = event.kind === 'paid' ? 'Tributo pagado' : event.kind === 'offering' ? 'Ofrenda'
        : event.kind === 'missed' ? 'Tributo vencido' : royalMessage(event);
      row.textContent = `${formatGameTime(gameTimeAt(event.timeMs))} · ${label}` + (event.gold ? ' · ' + gold(event.gold) : '')
        + (event.kind === 'missed' ? ' · ' + royalMessage(event) : '');
      return row;
    });
    this.fields.history.replaceChildren(...rows);
  }

  destroy(): void {
    this.events.abort();
    window.clearTimeout(this.noticeTimer);
    this.fields.notice.hidden = true;
  }
}
