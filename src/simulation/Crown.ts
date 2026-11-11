import { gameTimeRules, simulatedMsPerGameHour } from './GameTime.ts';
import type { SettlementRank } from './SettlementProgress';
import { check, list, whole } from '../persistence/validation.ts';
import { emptyRoyalAudiences, royalAidCooldownMs, royalPrivileges, tributeReduction, validateRoyalAudiences, isRoyalPrivilege } from './RoyalPrivileges';
import type { RoyalAudiences, RoyalPrivilege, RoyalRequest } from './RoyalPrivileges';

export const crownRules = {
  creditLimit: 200, initialFavor: 50, periodMs: 3 * gameTimeRules.hoursPerDay * simulatedMsPerGameHour,
  tribute: { aldea: 50, pueblo: 150, villa: 350 }, tributeFavor: 5, missedFavor: 15, repeatPenalty: 5, defeatAfter: 3,
  offerings: { 50: 5, 100: 12, 200: 25 }, historyLimit: 60,
  confidenceGraceMs: gameTimeRules.hoursPerDay * simulatedMsPerGameHour,
} as const;

export type Offering = keyof typeof crownRules.offerings;
export type RoyalEvent = Readonly<{ kind: 'paid' | 'missed' | 'offering' | 'confidence-lost' | 'confidence-restored' | 'mission';
  gold: number; timeMs: number; streak: number }>;
export const defeatReasons = {
  confidence: 'Destitución por pérdida de confianza real',
  tributes: 'Destitución por tres tributos consecutivos sin pagar',
} as const;
type Tribute = Readonly<{ gold: number; dueAt: number; paid: boolean;
  discount?: { originalGold: number; reduction: number; requestSequence: number } }>;
type Decree = 'waiting' | 'ready' | 'presented' | 'seen' | 'skipped';
type CrownState = {
  favor: number; nextAt: number; obligation: Tribute | null; streak: number; decree: Decree;
  events: RoyalEvent[]; tributeTotal: number; offeringTotal: number;
  confidence: { startedAt: number; dueAt: number; decree: Decree } | null;
  defeat: { reason: keyof typeof defeatReasons; timeMs: number } | null;
  audiences?: RoyalAudiences;
};
type SavedCrown = Omit<CrownState, 'confidence' | 'defeat'> & Partial<Pick<CrownState, 'confidence' | 'defeat'>>;

export class Crown {
  private state: CrownState = {
    favor: crownRules.initialFavor, nextAt: crownRules.periodMs, obligation: null, streak: 0, decree: 'waiting',
    events: [], tributeTotal: 0, offeringTotal: 0, confidence: null, defeat: null,
  };

  get favor(): number { return this.state.favor; }
  get obligation(): Tribute | null { return this.state.obligation; }
  get nextAt(): number { return this.state.nextAt; }
  get streak(): number { return this.state.streak; }
  get defeated(): boolean { return this.state.defeat !== null; }
  get defeatReason(): string | null { return this.state.defeat ? defeatReasons[this.state.defeat.reason] : null; }
  get confidence(): Readonly<NonNullable<CrownState['confidence']>> | null { return this.state.confidence; }
  get decreeAvailable(): boolean { return this.state.decree !== 'waiting'; }
  get history(): readonly RoyalEvent[] { return this.state.events; }
  get tributeTotal(): number { return this.state.tributeTotal; }
  get offeringTotal(): number { return this.state.offeringTotal; }
  get audiences(): Readonly<RoyalAudiences> { return this.state.audiences ?? emptyRoyalAudiences(); }

  privilegeIssue(kind: RoyalPrivilege, timeMs: number): string | null {
    if (!isRoyalPrivilege(kind)) return 'Solicitud desconocida.';
    if (this.defeated) return 'La partida ha terminado.';
    const rule = royalPrivileges[kind];
    if (this.favor < rule.required) return `Requiere ${rule.required} de favor; tienes ${this.favor}.`;
    if (kind !== 'intercession') return timeMs < this.audiences.nextAidAt ? 'Las ayudas reales están en recuperación.' : null;
    if (!this.obligation || this.obligation.paid || timeMs >= this.obligation.dueAt) return 'Requiere un tributo vigente y pendiente de pago.';
    return this.obligation.discount || this.audiences.lastIntercessionDueAt === this.obligation.dueAt
      ? 'Esta obligación ya recibió una intercesión.' : null;
  }

  preparePrivilege(kind: RoyalPrivilege): RoyalRequest {
    return { kind, sequence: this.audiences.sequence + 1, favor: this.favor,
      tributeDueAt: kind === 'intercession' ? this.obligation?.dueAt ?? null : null };
  }

  requestPrivilege(request: RoyalRequest, timeMs: number, grant: (id: string, benefit: number) => boolean): boolean {
    this.expireConfidence(timeMs);
    if (!request || !whole(timeMs) || timeMs % 1000 !== 0 || this.privilegeIssue(request.kind, timeMs)
      || timeMs < Math.max(this.audiences.history.at(-1)?.timeMs ?? 0, this.history.at(-1)?.timeMs ?? 0)
      || request.sequence !== this.audiences.sequence + 1 || request.favor !== this.favor
      || request.tributeDueAt !== (request.kind === 'intercession' ? this.obligation?.dueAt ?? null : null)) return false;
    const rule = royalPrivileges[request.kind], tribute = this.obligation;
    const benefit = request.kind === 'intercession' ? tributeReduction(tribute!.gold) : rule.amount;
    if (!grant('royal-audience:' + request.sequence, benefit)) return false;
    // The callback is synchronous and validates its whole economic transaction first.
    if (request.kind === 'intercession') this.state.obligation = { ...tribute!, gold: tribute!.gold - benefit,
      discount: { originalGold: tribute!.gold, reduction: benefit, requestSequence: request.sequence } };
    this.changeFavor(-rule.cost, timeMs);
    const audiences = this.state.audiences ??= emptyRoyalAudiences();
    const event = { sequence: ++audiences.sequence, kind: request.kind, timeMs,
      favorSpent: rule.cost, favorAfter: this.favor, benefit, tributeDueAt: request.tributeDueAt };
    audiences.used[request.kind]++;
    if (request.kind === 'intercession') audiences.lastIntercessionDueAt = request.tributeDueAt;
    audiences.history.push(event); if (audiences.history.length > 60) audiences.history.shift();
    if (request.kind !== 'intercession') { audiences.lastAid = event; audiences.nextAidAt = timeMs + royalAidCooldownMs; }
    return true;
  }

  advance(timeMs: number, rank: SettlementRank): void {
    this.expireConfidence(timeMs);
    if (timeMs !== this.nextAt || this.defeated) return;
    const tribute = this.obligation;
    if (tribute && !tribute.paid) {
      this.state.streak++;
      if (this.streak >= crownRules.defeatAfter) this.end('tributes', timeMs);
      this.record('missed', tribute.gold, timeMs);
      this.changeFavor(-crownRules.missedFavor - (this.streak - 1) * crownRules.repeatPenalty, timeMs);
      if (this.defeated) return;
    }
    this.state.nextAt += crownRules.periodMs;
    this.state.obligation = { gold: crownRules.tribute[rank], dueAt: this.nextAt, paid: false };
    if (this.state.decree === 'waiting') this.state.decree = 'ready';
  }

  pay(dueAt: number, timeMs: number, charge: (gold: number) => boolean): boolean {
    this.expireConfidence(timeMs);
    const tribute = this.obligation;
    if (this.defeated || !tribute || tribute.paid || tribute.dueAt !== dueAt || timeMs >= dueAt || !charge(tribute.gold)) return false;
    this.state.obligation = { ...tribute, paid: true };
    this.state.streak = 0;
    this.state.tributeTotal += tribute.gold;
    this.record('paid', tribute.gold, timeMs);
    this.changeFavor(crownRules.tributeFavor, timeMs);
    return true;
  }

  offer(gold: Offering, expectedFavor: number, timeMs: number, charge: (gold: number) => boolean): boolean {
    this.expireConfidence(timeMs);
    const increase = crownRules.offerings[gold];
    if (this.defeated || this.favor !== expectedFavor || this.favor === 100 || !increase || !charge(gold)) return false;
    this.state.offeringTotal += gold;
    this.changeFavor(increase, timeMs);
    this.record('offering', gold, timeMs);
    return true;
  }

  takeDecree(): boolean {
    if (this.state.decree !== 'ready') return false;
    this.state.decree = 'presented';
    return true;
  }

  applyMissionFavor(amount: number, timeMs: number): boolean {
    this.expireConfidence(timeMs);
    if (this.defeated || !whole(amount, -5, 10)) return false;
    if (amount !== 0) {
      this.record('mission', 0, timeMs);
      this.changeFavor(amount, timeMs);
    }
    return true;
  }

  markDecree(status: 'seen' | 'skipped'): void {
    if (this.decreeAvailable && this.state.decree !== 'seen') this.state.decree = status;
  }

  takeConfidenceDecree(): boolean {
    if (this.defeated || this.state.confidence?.decree !== 'ready') return false;
    this.state.confidence.decree = 'presented';
    return true;
  }

  markConfidenceDecree(status: 'seen' | 'skipped'): void {
    if (this.state.confidence) this.state.confidence.decree = status;
  }

  saveState(): CrownState {
    return { ...this.state, events: [...this.history],
      obligation: this.obligation ? structuredClone(this.obligation) : null,
      audiences: structuredClone(this.audiences),
      confidence: this.confidence ? { ...this.confidence } : null, defeat: this.state.defeat ? { ...this.state.defeat } : null };
  }

  restoreState(state: SavedCrown | undefined, timeMs: number): void {
    if (state === undefined) {
      this.state.nextAt = timeMs + crownRules.periodMs;
      return;
    }
    const { favor, nextAt, obligation, streak, decree, events, tributeTotal, offeringTotal } = state;
    check(whole(favor, 0, 100) && whole(streak, 0, crownRules.defeatAfter)
      && whole(nextAt, timeMs, timeMs + crownRules.periodMs) && nextAt % 1000 === 0
      && (streak === crownRules.defeatAfter ? nextAt === timeMs
        : nextAt > timeMs || state.defeat?.reason === 'confidence')
      && ['waiting', 'ready', 'presented', 'seen', 'skipped'].includes(decree)
      && Number.isSafeInteger(tributeTotal * 100) && tributeTotal >= 0 && whole(offeringTotal));
    check(obligation === null ? decree === 'waiting' && streak === 0 && tributeTotal === 0
      : decree !== 'waiting' && (obligation.discount ? Number.isSafeInteger(obligation.gold * 100) && obligation.gold >= 0 : whole(obligation.gold, 1))
        && obligation.dueAt === nextAt && typeof obligation.paid === 'boolean' && (!obligation.paid || streak === 0));
    if (state.audiences !== undefined) validateRoyalAudiences(state.audiences, timeMs);
    if (state.audiences?.lastIntercessionDueAt !== null && state.audiences?.lastIntercessionDueAt !== undefined) {
      check(obligation && state.audiences.lastIntercessionDueAt <= obligation.dueAt);
      if (state.audiences.lastIntercessionDueAt === obligation.dueAt) check(obligation.discount !== undefined);
    }
    if (obligation?.discount) {
      const discount = obligation.discount;
      check(whole(discount.originalGold, 1) && discount.reduction === tributeReduction(discount.originalGold)
        && obligation.gold === discount.originalGold - discount.reduction
        && state.audiences?.lastIntercessionDueAt === obligation.dueAt
        && whole(discount.requestSequence, 1, state.audiences?.sequence ?? 0));
      const event = state.audiences!.history.find(grant => grant.sequence === discount.requestSequence);
      check(discount.requestSequence <= state.audiences!.sequence - state.audiences!.history.length
        || (event?.kind === 'intercession' && event.tributeDueAt === obligation.dueAt && event.benefit === discount.reduction));
    }
    list(events, crownRules.historyLimit);
    let previous = 0;
    let previousStreak: number | undefined;
    for (const event of events) {
      const confidenceEvent = event.kind === 'confidence-lost' || event.kind === 'confidence-restored' || event.kind === 'mission';
      check(['paid', 'missed', 'offering', 'confidence-lost', 'confidence-restored', 'mission'].includes(event.kind)
        && (confidenceEvent ? event.gold === 0 : event.kind === 'paid' || event.kind === 'missed'
          ? Number.isSafeInteger(event.gold * 100) && event.gold >= 0 : whole(event.gold, 1))
        && whole(event.streak, 0, crownRules.defeatAfter) && whole(event.timeMs, previous, timeMs));
      if (event.kind === 'paid') check(event.streak === 0);
      if (event.kind === 'missed') check(event.streak > 0 && (previousStreak === undefined || event.streak === previousStreak + 1));
      if ((event.kind === 'offering' || confidenceEvent) && previousStreak !== undefined) check(event.streak === previousStreak);
      previous = event.timeMs;
      previousStreak = event.streak;
    }
    check((previousStreak ?? 0) === streak);
    if (streak === crownRules.defeatAfter) {
      const last = events.at(-1);
      check(last?.kind === 'missed' && last.streak === streak && last.timeMs === nextAt);
    }
    const defeat = state.defeat === undefined
      ? (streak === crownRules.defeatAfter ? { reason: 'tributes' as const, timeMs } : null) : state.defeat;
    check(defeat === null || (defeat && Object.hasOwn(defeatReasons, defeat.reason) && defeat.timeMs === timeMs
      && (defeat.reason === 'confidence' ? favor === 0 && streak < crownRules.defeatAfter : streak === crownRules.defeatAfter)));
    check(streak < crownRules.defeatAfter || defeat?.reason === 'tributes');
    const confidence = state.confidence === undefined
      ? (favor === 0 && !defeat ? { startedAt: timeMs, dueAt: timeMs + crownRules.confidenceGraceMs, decree: 'ready' as const } : null)
      : state.confidence;
    check(confidence === null ? favor > 0 || !!defeat
      : favor === 0 && confidence && whole(confidence.startedAt, 0, timeMs) && confidence.startedAt % 1000 === 0
        && confidence.dueAt === confidence.startedAt + crownRules.confidenceGraceMs
        && ['ready', 'presented', 'seen', 'skipped'].includes(confidence.decree)
        && (defeat?.reason === 'confidence' ? confidence.dueAt === timeMs : confidence.dueAt > timeMs));
    check(defeat?.reason !== 'confidence' || confidence !== null);
    this.state = { ...structuredClone(state), events: [...events], confidence: confidence ? { ...confidence } : null,
      defeat: defeat ? { ...defeat } : null };
  }

  private changeFavor(amount: number, timeMs: number): void {
    this.state.favor = Math.min(100, Math.max(0, this.favor + amount));
    if (this.defeated) return;
    if (this.favor === 0 && !this.confidence) {
      this.state.confidence = { startedAt: timeMs, dueAt: timeMs + crownRules.confidenceGraceMs, decree: 'ready' };
      this.record('confidence-lost', 0, timeMs);
    } else if (this.favor > 0 && this.confidence) {
      this.state.confidence = null;
      this.record('confidence-restored', 0, timeMs);
    }
  }

  private expireConfidence(timeMs: number): void {
    if (this.confidence && this.favor === 0 && timeMs >= this.confidence.dueAt) this.end('confidence', this.confidence.dueAt);
  }

  private end(reason: keyof typeof defeatReasons, timeMs: number): void {
    if (!this.defeated) this.state.defeat = { reason, timeMs };
  }

  private record(kind: RoyalEvent['kind'], gold: number, timeMs: number): void {
    this.state.events.push(Object.freeze({ kind, gold, timeMs, streak: this.streak }));
    if (this.state.events.length > crownRules.historyLimit) this.state.events.shift();
  }
}
