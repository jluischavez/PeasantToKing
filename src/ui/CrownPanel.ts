import type { Economy } from '../economy/Economy';
import { formatNumber } from '../formatNumber';
import { crownRules } from '../simulation/Crown';
import type { Offering, RoyalEvent } from '../simulation/Crown';
import { formatGameTime, gameTimeAt, simulatedMsPerGameHour } from '../simulation/GameTime';
import type { SettlementSimulation } from '../simulation/SettlementSimulation';
import { royalMessage, royalPrivilegeMessage } from '../story/RoyalScenes';
import { royalPrivileges, tributeReduction } from '../simulation/RoyalPrivileges';
import type { RoyalPrivilege, RoyalRequest } from '../simulation/RoyalPrivileges';
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
  private privilegeQuote: RoyalRequest | null = null;
  private lastGrant = 0;
  private readonly privilegeFields = new Map<RoyalPrivilege, { status: HTMLElement; button: HTMLButtonElement }>();

  constructor(private readonly simulation: SettlementSimulation, private readonly economy: Economy,
    changed: () => void, openDecree: () => void) {
    const { crown } = simulation;
    const options = { signal: this.events.signal };
    this.fields.feedback.textContent = '';
    this.fields.notice.hidden = true;
    this.lastEvent = crown.history.at(-1);
    this.lastGrant = crown.audiences.sequence;
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
    const privileges = document.getElementById('crown-privileges')!;
    privileges.replaceChildren();
    for (const kind of Object.keys(royalPrivileges) as RoyalPrivilege[]) {
      const rule = royalPrivileges[kind], card = document.createElement('article'), title = document.createElement('h4');
      card.className = 'mission-card'; title.textContent = rule.name;
      const description = document.createElement('p'); description.className = 'panel-note';
      description.textContent = `${rule.description} Requiere ${rule.required} de favor; consume ${rule.cost}. `
        + (kind === 'intercession' ? 'Una vez por obligación vigente.' : `${rule.amount} ${kind === 'gold' ? 'oro' : kind === 'food' ? 'comida' : 'madera'}. Recuperación compartida: 72 h del juego.`);
      const status = document.createElement('p'), button = document.createElement('button');
      status.className = 'panel-note'; button.type = 'button'; button.textContent = 'Solicitar ' + rule.name.toLowerCase();
      button.dataset.privilege = kind;
      button.addEventListener('click', () => {
        if (simulation.royalPrivilegeIssue(kind)) return;
        this.privilegeQuote = crown.preparePrivilege(kind); this.render();
      }, options);
      card.append(title, description, status, button); privileges.append(card);
      this.privilegeFields.set(kind, { status, button });
    }
    document.getElementById('crown-privilege-feedback')!.textContent = '';
    document.getElementById('crown-privilege-cancel')!.addEventListener('click', () => { this.privilegeQuote = null; this.render(); }, options);
    document.getElementById('crown-privilege-confirm')!.addEventListener('click', () => {
      const quote = this.privilegeQuote;
      if (!quote) return;
      this.privilegeQuote = null;
      if (simulation.requestRoyalPrivilege(quote)) {
        setText(document.getElementById('crown-privilege-feedback')!, royalPrivilegeMessage(crown.audiences.history.at(-1)!));
        changed();
      } else {
        setText(document.getElementById('crown-privilege-feedback')!,
          simulation.royalPrivilegeIssue(quote.kind) ?? 'La audiencia ha cambiado. Prepara una nueva solicitud.');
        this.render();
      }
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
      tribute: tribute ? (tribute.discount ? `Original: ${gold(tribute.discount.originalGold)} · Reducción: ${gold(tribute.discount.reduction)} · Importe actual: ` : '')
        + gold(tribute.gold) + ' · ' + (tribute.paid ? 'Pagado' : crown.defeated ? 'Vencido' : 'Pendiente')
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
    const aidMinutes = Math.max(0, Math.ceil((crown.audiences.nextAidAt - this.simulation.simulatedTimeMs) * 60 / simulatedMsPerGameHour));
    setText(document.getElementById('crown-aid-cooldown')!, aidMinutes
      ? `Próxima ayuda en ${Math.floor(aidMinutes / 60)} h ${aidMinutes % 60} min del juego. Comida, madera y subsidio comparten recuperación.`
      : 'Recuperación de ayudas completada. La intercesión tiene un límite separado por tributo.');
    for (const [kind, fields] of this.privilegeFields) {
      const issue = this.simulation.royalPrivilegeIssue(kind);
      setText(fields.status, issue ? 'Bloqueado · ' + issue : 'Disponible');
      fields.button.disabled = !!issue; fields.button.title = issue ?? '';
    }
    if (this.privilegeQuote && (this.privilegeQuote.favor !== crown.favor
      || this.privilegeQuote.sequence !== crown.audiences.sequence + 1
      || this.privilegeQuote.tributeDueAt !== crown.preparePrivilege(this.privilegeQuote.kind).tributeDueAt
      || this.simulation.royalPrivilegeIssue(this.privilegeQuote.kind))) this.privilegeQuote = null;
    document.getElementById('crown-privilege-confirmation')!.hidden = this.privilegeQuote === null;
    if (this.privilegeQuote) {
      const kind = this.privilegeQuote.kind, rule = royalPrivileges[kind];
      const benefit = kind === 'intercession' ? `reducir el tributo en ${gold(tributeReduction(tribute!.gold))}`
        : `recibir ${rule.amount} ${kind === 'gold' ? 'oro' : kind === 'food' ? 'comida' : 'madera'}`;
      setText(document.getElementById('crown-privilege-quote')!, `Solicitar ${benefit} a cambio de ${rule.cost} puntos de favor. Quedarán ${crown.favor - rule.cost}/100. `
        + (kind === 'intercession' ? 'Solo para esta obligación.' : 'Bloquea las tres ayudas durante 72 h del juego.'));
    }
    if (this.lastGrant !== crown.audiences.sequence) { this.lastGrant = crown.audiences.sequence; this.renderHistory(); }

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
    const entries = [...this.simulation.crown.history.map(event => ({ timeMs: event.timeMs, event })),
      ...this.simulation.crown.audiences.history.map(grant => ({ timeMs: grant.timeMs, grant }))];
    const rows = entries.sort((a, b) => b.timeMs - a.timeMs).map(entry => {
      const row = document.createElement('li');
      if ('grant' in entry) { row.textContent = `${formatGameTime(gameTimeAt(entry.timeMs))} · ${royalPrivilegeMessage(entry.grant)}`; return row; }
      const event = entry.event;
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
