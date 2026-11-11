import type { ConstructionType } from '../map/ConstructionMap';
import type { ProductId } from '../economy/Products';
import type { Goods } from '../economy/Inventories';
import { unitsPerResource } from '../economy/Inventories.ts';
import { check, label, list, range, whole } from '../persistence/validation.ts';
import { kingdomEventCatalog } from '../story/KingdomEventCatalog.ts';
import { simulatedMsPerGameHour as hour } from './GameTime.ts';
import type { SettlementRank } from './SettlementProgress';

export const kingdomEventRules = { firstMs: 24 * hour, minimumHours: 24, maximumHours: 48,
  retryMs: 6 * hour, historyLimit: 60, tributeBufferMs: 24 * hour } as const;
export type RealmContext = {
  hasCenter: boolean; rank: SettlementRank; population: number; capacity: number; happiness: number; beauty: number;
  gold: number; food: number; wood: number; foodCoverage: number; waterCoverage: number; favor: number;
  confidenceWarning: boolean; tribute: { gold: number; dueAt: number; paid: boolean } | null;
  nextTributeAt: number; recentTribute: boolean; buildings: Partial<Record<ConstructionType, number>>;
  improvedRoads: number; stoneRoads: number; gravelRoads: number; upgradableRoads: number;
  decorationSpace: Record<'garden' | 'park' | 'plaza', boolean>; exteriorTrade: boolean;
  exports: Record<ProductId, number>;
  sites: Record<string, { type: ConstructionType; level: number; connected: boolean }>;
};
export type Objective =
  | { kind: 'gold'; target: number }
  | { kind: 'delivery'; target: number; product: ProductId }
  | { kind: 'wellbeing'; target: number; happiness: number; beauty: number; food: number; water: number }
  | { kind: 'roads'; target: number; level: 2 | 3 }
  | { kind: 'building'; target: number; building: ConstructionType }
  | { kind: 'growth'; target: number; happiness: number; holdMs: number }
  | { kind: 'trade'; target: number; product: ProductId }
  | { kind: 'reward'; target: number };
export type MissionChoice = 'accept' | 'fulfill' | 'reject' | 'defer';
export type MissionStatus = 'available' | 'active' | 'completed' | 'rejected' | 'expired';
export type MissionReward = { gold: number; favor: number; food?: number; wood?: number };
type PendingReward = { id: string; title: string; remaining: Goods };
export type KingdomMission = {
  id: string; sequence: number; key: string; variant: number; type: string; title: string; story: string; requirements: string;
  objective: Objective; reward: MissionReward; rejectFavor: number; expireFavor: number;
  status: MissionStatus; offeredAt: number; deadline: number; acceptedAt: number | null; resolvedAt: number | null;
  baseline: number; baselineSites: Record<string, number>; progress: number; sustainedMs: number; presented: boolean; rewarded: boolean;
  decisions: { choice: MissionChoice; timeMs: number }[];
  result: { gold: number; favor: number; goldReceived?: number; materials?: Goods; delivery: { product: ProductId; amount: number } | null } | null;
};
export type MissionEffect = { goldCost: number; goldReward: number; favor: number;
  delivery?: { product: ProductId; amount: number } };
type EventState = {
  seed: number; random: number; sequence: number; nextAt: number; lastAt: number; lastKey: string | null;
  lastSeen: Record<string, number>; current: KingdomMission | null; history: KingdomMission[];
  pendingRewards?: PendingReward[];
};
const pending = (mission: KingdomMission) => mission.status === 'available' || mission.status === 'active';
const product = (value: string) => value === 'food' || value === 'wood';

export class KingdomEvents {
  private state: EventState;

  constructor(seed: number, private readonly observe: () => RealmContext,
    private readonly settle: (id: string, effect: MissionEffect) => boolean,
    private readonly halted: () => boolean,
    private readonly receive: (id: string, product: ProductId, amount: number) => number = () => 0) {
    this.state = { seed, random: Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0, sequence: 0, nextAt: kingdomEventRules.firstMs, lastAt: 0,
      lastKey: null, lastSeen: {}, current: null, history: [] };
  }

  get current(): Readonly<KingdomMission> | null { return this.state.current; }
  get history(): readonly Readonly<KingdomMission>[] { return this.state.history; }
  get nextAt(): number { return this.state.nextAt; }
  get pendingRewards(): readonly Readonly<PendingReward>[] { return this.state.pendingRewards ?? []; }

  claimRewards(id: string): boolean {
    if (this.halted()) return false;
    const pending = this.state.pendingRewards?.find(entry => entry.id === id);
    if (!pending) return false;
    let received = false;
    for (const product of ['food', 'wood'] as const) {
      const amount = pending.remaining[product];
      if (amount === 0) continue;
      const delivered = this.receive('mission:' + id, product, amount);
      check(range(delivered, 0, amount) && whole(Math.round(delivered * unitsPerResource)));
      pending.remaining[product] = (Math.round(amount * unitsPerResource) - Math.round(delivered * unitsPerResource)) / unitsPerResource;
      const mission = this.state.history.find(mission => mission.id === id);
      if (mission?.result?.materials) mission.result.materials[product] =
        (Math.round(mission.result.materials[product] * unitsPerResource) + Math.round(delivered * unitsPerResource)) / unitsPerResource;
      received ||= delivered > 0;
    }
    this.state.pendingRewards = this.state.pendingRewards!.filter(entry => entry.remaining.food + entry.remaining.wood > 0);
    return received;
  }

  private random(): number {
    this.state.random = (Math.imul(this.state.random, 1664525) + 1013904223) >>> 0;
    return this.state.random / 0x1_0000_0000;
  }

  private baseline(objective: Objective, context: RealmContext): number {
    switch (objective.kind) {
      case 'growth': return context.population;
      case 'roads': return objective.level === 3 ? context.stoneRoads : context.improvedRoads;
      case 'building': return context.buildings[objective.building] ?? 0;
      case 'trade': return context.exports[objective.product];
      default: return 0;
    }
  }

  private baselineSites(objective: Objective, context: RealmContext): Record<string, number> {
    const type = objective.kind === 'roads' ? 'road' : objective.kind === 'building' ? objective.building : null;
    return Object.fromEntries(Object.entries(context.sites).filter(([, site]) => site.type === type)
      .map(([id, site]) => [id, site.level]));
  }

  advance(timeMs: number): void {
    if (this.halted() || timeMs <= this.state.lastAt) return;
    const delta = Math.min(1000, timeMs - this.state.lastAt);
    this.state.lastAt = timeMs;
    const mission = this.state.current;
    if (mission) {
      if (timeMs >= mission.deadline) {
        this.finish('expired', timeMs);
        return;
      }
      if (mission.status === 'active') this.update(mission, this.observe(), delta, timeMs);
      return;
    }
    if (timeMs < this.nextAt) return;
    const context = this.observe();
    if (!context.hasCenter || context.population < 4) {
      this.state.nextAt = timeMs + kingdomEventRules.retryMs;
      return;
    }
    const royalPressure = context.confidenceWarning || (context.tribute && !context.tribute.paid
      && context.tribute.dueAt - timeMs <= kingdomEventRules.tributeBufferMs)
      || context.nextTributeAt - timeMs <= 6 * hour;
    const eligible = kingdomEventCatalog.filter(event => event.key !== this.state.lastKey
      && timeMs - (this.state.lastSeen[event.key] ?? -Infinity) >= event.cooldownHours * hour
      && (!royalPressure || !event.demanding) && event.eligible(context));
    if (!eligible.length) {
      this.state.nextAt = timeMs + kingdomEventRules.retryMs;
      return;
    }
    const definition = eligible[Math.floor(this.random() * eligible.length)]!;
    const variant = Math.floor(this.random() * definition.stories.length);
    const terms = definition.terms(context, variant);
    const sequence = ++this.state.sequence;
    this.state.current = {
      id: this.state.seed + ':' + sequence, sequence, key: definition.key, variant, type: definition.type,
      title: definition.title, story: definition.stories[variant]!, requirements: definition.requirements,
      objective: terms.objective, reward: terms.reward, rejectFavor: terms.rejectFavor, expireFavor: terms.expireFavor,
      status: 'available', offeredAt: timeMs, deadline: timeMs + terms.hours * hour, acceptedAt: null, resolvedAt: null,
      baseline: this.baseline(terms.objective, context), baselineSites: this.baselineSites(terms.objective, context),
      progress: 0, sustainedMs: 0, presented: false, rewarded: false, decisions: [], result: null,
    };
    this.state.lastKey = definition.key;
    this.state.lastSeen[definition.key] = timeMs;
    this.state.nextAt = timeMs + (kingdomEventRules.minimumHours
      + Math.floor(this.random() * (kingdomEventRules.maximumHours - kingdomEventRules.minimumHours + 1))) * hour;
  }

  private update(mission: KingdomMission, context: RealmContext, delta: number, timeMs: number): void {
    const objective = mission.objective;
    switch (objective.kind) {
      case 'wellbeing':
        mission.progress = context.happiness >= objective.happiness && context.beauty >= objective.beauty
          && context.foodCoverage >= objective.food && context.waterCoverage >= objective.water
          ? Math.min(objective.target, mission.progress + delta) : 0;
        break;
      case 'growth':
        mission.progress = Math.min(objective.target, Math.max(0, context.population - mission.baseline));
        mission.sustainedMs = mission.progress >= objective.target && context.happiness >= objective.happiness
          && context.foodCoverage >= 90 && context.waterCoverage >= 90 ? Math.min(objective.holdMs, mission.sustainedMs + delta) : 0;
        break;
      case 'building':
        mission.progress = Math.min(objective.target, Object.entries(context.sites).filter(([id, site]) => (site.connected || site.type === 'garden')
          && site.type === objective.building && !Object.hasOwn(mission.baselineSites, id)).length);
        break;
      case 'roads':
        mission.progress = Math.min(objective.target, Object.entries(context.sites).filter(([id, site]) => site.connected
          && site.type === 'road' && site.level >= objective.level && (mission.baselineSites[id] ?? 0) < objective.level).length);
        break;
      case 'trade':
        mission.progress = Math.min(objective.target,
          Math.max(0, context.exports[objective.product] - mission.baseline) / unitsPerResource);
        break;
      default: return;
    }
    if (mission.progress >= objective.target && (objective.kind !== 'growth' || mission.sustainedMs >= objective.holdMs)) {
      this.finish('completed', timeMs);
    }
  }

  takeNotice(): Readonly<KingdomMission> | null {
    const mission = this.state.current;
    if (this.halted() || !mission || mission.presented) return null;
    mission.presented = true;
    return mission;
  }

  canFulfill(id: string): boolean {
    const mission = this.current;
    if (this.halted() || mission?.id !== id) return false;
    const objective = mission.objective, context = this.observe();
    return objective.kind === 'gold' ? context.gold >= objective.target
      : objective.kind === 'delivery' ? context[objective.product] >= objective.target : objective.kind === 'reward';
  }

  options(id: string): readonly { choice: MissionChoice; enabled: boolean }[] {
    const mission = this.current;
    if (this.halted() || mission?.id !== id || this.state.lastAt >= mission.deadline) return [];
    const options: { choice: MissionChoice; enabled: boolean }[] = [];
    if (mission.status === 'available' && mission.objective.kind !== 'reward') options.push({ choice: 'accept', enabled: true });
    if (['gold', 'delivery', 'reward'].includes(mission.objective.kind)) options.push({ choice: 'fulfill', enabled: this.canFulfill(id) });
    options.push({ choice: 'reject', enabled: true }, { choice: 'defer', enabled: true });
    return options;
  }

  decide(id: string, choice: MissionChoice, timeMs: number): boolean {
    const mission = this.state.current;
    if (this.halted() || mission?.id !== id || !pending(mission)) return false;
    if (timeMs >= mission.deadline) { this.finish('expired', timeMs); return false; }
    if (timeMs < this.state.lastAt || !this.options(id).some(option => option.choice === choice && option.enabled)) return false;
    if (choice === 'fulfill') {
      if (!this.canFulfill(id)) return false;
      if (!this.finish('completed', timeMs)) return false;
      mission.decisions.push({ choice, timeMs });
      return true;
    }
    if (choice === 'reject') {
      if (!this.finish('rejected', timeMs)) return false;
      mission.decisions.push({ choice, timeMs });
      return true;
    }
    if (choice === 'accept') {
      if (mission.status !== 'available') return false;
      mission.status = 'active';
      mission.acceptedAt = timeMs;
      mission.baseline = this.baseline(mission.objective, this.observe());
      mission.baselineSites = this.baselineSites(mission.objective, this.observe());
    } else if (choice !== 'defer') return false;
    else if (mission.decisions.some(decision => decision.choice === 'defer')) return true;
    mission.presented = true;
    mission.decisions.push({ choice, timeMs });
    return true;
  }

  private finish(status: 'completed' | 'rejected' | 'expired', timeMs: number): boolean {
    const mission = this.state.current!;
    const objective = mission.objective;
    const effect: MissionEffect = status === 'completed'
      ? { goldCost: objective.kind === 'gold' ? objective.target : 0, goldReward: mission.reward.gold, favor: mission.reward.favor,
        ...(objective.kind === 'delivery' ? { delivery: { product: objective.product, amount: objective.target } } : {}) }
      : { goldCost: 0, goldReward: 0, favor: status === 'rejected' ? mission.rejectFavor
        : mission.status === 'active' ? mission.expireFavor : 0 };
    const beforeFavor = this.observe().favor;
    if (!this.settle(mission.id, effect)) return false;
    mission.result = { gold: effect.goldReward - effect.goldCost, favor: this.observe().favor - beforeFavor,
      goldReceived: effect.goldReward, materials: { food: 0, wood: 0 },
      delivery: effect.delivery ? { ...effect.delivery } : null };
    mission.status = status;
    mission.resolvedAt = timeMs;
    mission.rewarded = status === 'completed';
    mission.baselineSites = {};
    if (status === 'completed') {
      mission.progress = objective.target;
      mission.acceptedAt ??= timeMs;
    }
    this.state.history.push(mission);
    if (status === 'completed' && ((mission.reward.food ?? 0) + (mission.reward.wood ?? 0) > 0)) {
      (this.state.pendingRewards ??= []).push({ id: mission.id, title: mission.title,
        remaining: { food: mission.reward.food ?? 0, wood: mission.reward.wood ?? 0 } });
      this.claimRewards(mission.id);
    }
    if (this.state.history.length > kingdomEventRules.historyLimit) this.state.history.shift();
    this.state.current = null;
    this.state.nextAt = Math.max(this.nextAt, timeMs + kingdomEventRules.retryMs);
    return true;
  }

  saveState(): EventState { return structuredClone(this.state); }

  restoreState(state: EventState | undefined, timeMs: number): void {
    if (state === undefined) {
      this.state.nextAt = timeMs + kingdomEventRules.firstMs;
      this.state.lastAt = timeMs;
      return;
    }
    check(state && state.seed === this.state.seed && whole(state.random, 0, 0xffff_ffff) && whole(state.sequence)
      && whole(state.nextAt, 0) && state.nextAt % 1000 === 0
      && whole(state.lastAt, 0, timeMs)
      && (state.lastKey === null || kingdomEventCatalog.some(event => event.key === state.lastKey)));
    check(state.lastSeen && Object.keys(state.lastSeen).length <= kingdomEventCatalog.length);
    for (const [key, seen] of Object.entries(state.lastSeen)) {
      check(kingdomEventCatalog.some(event => event.key === key) && whole(seen, 0, timeMs));
    }
    list(state.history, kingdomEventRules.historyLimit);
    const missions = [...state.history, ...(state.current ? [state.current] : [])];
    const ids = new Set<string>();
    let previous = 0;
    for (const mission of missions) {
      const definition = kingdomEventCatalog.find(event => event.key === mission.key);
      check(definition && whole(mission.sequence, 1, state.sequence) && mission.id === state.seed + ':' + mission.sequence
        && !ids.has(mission.id) && whole(mission.variant, 0, definition.stories.length - 1)
        && mission.type === definition.type && label(mission.title) && label(mission.requirements)
        && typeof mission.story === 'string' && mission.story.length > 0 && mission.story.length <= 5000
        && whole(mission.offeredAt, previous, timeMs)
        && whole(mission.deadline, mission.offeredAt + hour, mission.offeredAt + 72 * hour)
        && typeof mission.presented === 'boolean' && typeof mission.rewarded === 'boolean'
        && whole(mission.reward?.gold, 0, 100) && whole(mission.reward.favor, 0, 10)
        && whole(mission.reward.food ?? 0, 0, 100) && whole(mission.reward.wood ?? 0, 0, 100)
        && whole(mission.rejectFavor, -5, 0) && whole(mission.expireFavor, -5, 0)
        && whole(mission.baseline) && range(mission.progress, 0, mission.objective.target)
        && whole(mission.sustainedMs, 0, 12 * hour));
      this.validateObjective(mission.objective);
      if (mission.result?.materials) {
        for (const product of ['food', 'wood'] as const) {
          const amount = mission.result.materials[product];
          check(range(amount, 0, mission.status === 'completed' ? mission.reward[product] ?? 0 : 0)
            && Math.abs(amount * unitsPerResource - Math.round(amount * unitsPerResource)) < 1e-9);
        }
      }
      if (mission.result?.goldReceived !== undefined) check(mission.result.goldReceived === (mission.status === 'completed' ? mission.reward.gold : 0));
      check(mission.baselineSites && Object.keys(mission.baselineSites).length <= 10_000);
      for (const [site, level] of Object.entries(mission.baselineSites)) {
        check(/^\d+,\d+$/.test(site) && whole(level, 0, 3));
      }
      check(['available', 'active', 'completed', 'rejected', 'expired'].includes(mission.status)
        && (pending(mission) ? mission === state.current && mission.resolvedAt === null
          && (mission.deadline > timeMs || this.halted()) : mission !== state.current
          && whole(mission.resolvedAt!, mission.offeredAt, timeMs))
        && mission.rewarded === (mission.status === 'completed')
        && (pending(mission) ? mission.result === null : mission.result && whole(mission.result.gold, -100, 100)
          && whole(mission.result.favor, -5, 10) && (mission.result.delivery === null
            || (product(mission.result.delivery.product) && whole(mission.result.delivery.amount, 1, 100))))
        && (mission.acceptedAt === null ? mission.status !== 'active' && mission.status !== 'completed'
          : whole(mission.acceptedAt, mission.offeredAt, mission.resolvedAt ?? timeMs)));
      list(mission.decisions, 4);
      let decisionAt = mission.offeredAt;
      for (const decision of mission.decisions) {
        check(['accept', 'fulfill', 'reject', 'defer'].includes(decision.choice)
          && whole(decision.timeMs, decisionAt, mission.resolvedAt ?? timeMs));
        decisionAt = decision.timeMs;
      }
      ids.add(mission.id);
      previous = mission.offeredAt;
    }
    check(state.current === null || pending(state.current));
    check(state.pendingRewards === undefined || Array.isArray(state.pendingRewards));
    const rewards = new Set<string>();
    for (const entry of state.pendingRewards ?? []) {
      const sequence = Number(entry.id.split(':')[1]);
      check(entry.id === state.seed + ':' + sequence && whole(sequence, 1, state.sequence)
        && !rewards.has(entry.id) && label(entry.title));
      for (const product of ['food', 'wood'] as const) check(range(entry.remaining[product], 0, 100)
        && Math.abs(entry.remaining[product] * unitsPerResource - Math.round(entry.remaining[product] * unitsPerResource)) < 1e-9);
      check(entry.remaining.food + entry.remaining.wood > 0);
      const mission = missions.find(mission => mission.id === entry.id);
      if (mission) check(mission.status === 'completed' && mission.result?.materials
        && (['food', 'wood'] as const).every(product => Math.abs(mission.result!.materials![product]
          + entry.remaining[product] - (mission.reward[product] ?? 0)) < 1e-9));
      rewards.add(entry.id);
    }
    for (const mission of missions) if (mission.status === 'completed' && mission.result?.materials) {
      if ((['food', 'wood'] as const).some(product => mission.result!.materials![product] < (mission.reward[product] ?? 0))) check(rewards.has(mission.id));
    }
    this.state = structuredClone(state);
  }

  private validateObjective(objective: Objective): void {
    check(objective && whole(objective.target, 1, 12 * hour));
    switch (objective.kind) {
      case 'gold': check(objective.target <= 100); break;
      case 'delivery':
      case 'trade': check(product(objective.product) && objective.target <= 100); break;
      case 'wellbeing': check([objective.happiness, objective.beauty, objective.food, objective.water]
        .every(value => whole(value, 0, 100))); break;
      case 'roads': check(objective.level === 2 || objective.level === 3); break;
      case 'building': check(['garden', 'park', 'plaza'].includes(objective.building)); break;
      case 'growth': check(whole(objective.happiness, 0, 100) && whole(objective.holdMs, 1000, 12 * hour)); break;
      case 'reward': check(objective.target === 1); break;
      default: check(false);
    }
  }
}
