import { check, list, whole } from '../persistence/validation';
import { simulatedMsPerGameHour } from './GameTime';

export const royalAidCooldownMs = 72 * simulatedMsPerGameHour;
export const royalPrivileges = {
  food: { name: 'Ayuda alimentaria', description: 'Provisiones reales para sostener vuestras mesas.', required: 60, cost: 8, amount: 20 },
  wood: { name: 'Suministro de madera', description: 'Vigas de los depósitos reales para vuestras obras.', required: 60, cost: 8, amount: 15 },
  gold: { name: 'Subsidio de la Corona', description: 'Una contribución extraordinaria de la tesorería real.', required: 80, cost: 15, amount: 20 },
  intercession: { name: 'Intercesión real', description: 'El tesorero revisará vuestra obligación: 15 % menos, hasta 50 oro.', required: 90, cost: 18, amount: 0 },
} as const;
export type RoyalPrivilege = keyof typeof royalPrivileges;
export const isRoyalPrivilege = (kind: string): kind is RoyalPrivilege => Object.hasOwn(royalPrivileges, kind);
export const tributeReduction = (gold: number) => Math.min(50, Math.round(gold * 15) / 100);
export type RoyalRequest = Readonly<{ kind: RoyalPrivilege; sequence: number; favor: number; tributeDueAt: number | null }>;
export type RoyalGrant = Readonly<{ sequence: number; kind: RoyalPrivilege; timeMs: number;
  favorSpent: number; favorAfter: number; benefit: number; tributeDueAt: number | null }>;
export type RoyalAudiences = {
  sequence: number; nextAidAt: number; lastAid: RoyalGrant | null; lastIntercessionDueAt: number | null;
  used: Record<RoyalPrivilege, number>; history: RoyalGrant[];
};
export const emptyRoyalAudiences = (): RoyalAudiences => ({ sequence: 0, nextAidAt: 0, lastAid: null,
  lastIntercessionDueAt: null, used: { food: 0, wood: 0, gold: 0, intercession: 0 }, history: [] });

export function validateRoyalAudiences(state: RoyalAudiences, timeMs: number): void {
  check(state && whole(state.sequence) && whole(state.nextAidAt, 0, timeMs + royalAidCooldownMs));
  check(state.used && Object.keys(state.used).length === 4);
  for (const kind of Object.keys(royalPrivileges) as RoyalPrivilege[]) check(whole(state.used[kind], 0, state.sequence));
  check(Object.values(state.used).reduce((a, b) => a + b, 0) === state.sequence);
  list(state.history, 60);
  check(state.history.length === Math.min(state.sequence, 60));
  const validate = (grant: RoyalGrant) => {
    check(grant && isRoyalPrivilege(grant.kind) && whole(grant.sequence, 1, state.sequence)
      && whole(grant.timeMs, 0, timeMs) && grant.timeMs % 1000 === 0);
    const rule = royalPrivileges[grant.kind];
    check(grant.favorSpent === rule.cost && whole(grant.favorAfter, rule.required - rule.cost, 100 - rule.cost)
      && (grant.kind === 'intercession' ? grant.benefit > 0 && grant.benefit <= 50
        && Number.isSafeInteger(grant.benefit * 100) && whole(grant.tributeDueAt!, grant.timeMs + 1, grant.timeMs + royalAidCooldownMs)
        && grant.tributeDueAt! % 1000 === 0
        : grant.benefit === rule.amount && grant.tributeDueAt === null));
  };
  let previousTime = 0, previousSequence = state.sequence - state.history.length;
  let previousAid: RoyalGrant | null = null, previousIntercessionDue = 0;
  const counts = { food: 0, wood: 0, gold: 0, intercession: 0 }, obligations = new Set<number>();
  for (const grant of state.history) {
    validate(grant); check(grant.sequence === ++previousSequence && grant.timeMs >= previousTime);
    counts[grant.kind]++; previousTime = grant.timeMs;
    if (grant.kind === 'intercession') {
      check(!obligations.has(grant.tributeDueAt!) && grant.tributeDueAt! > previousIntercessionDue);
      obligations.add(grant.tributeDueAt!); previousIntercessionDue = grant.tributeDueAt!;
    }
    else {
      check(!previousAid || grant.timeMs >= previousAid.timeMs + royalAidCooldownMs);
      previousAid = grant;
    }
  }
  for (const kind of Object.keys(counts) as RoyalPrivilege[]) check(counts[kind] <= state.used[kind]);
  if (state.sequence <= 60) check((Object.keys(counts) as RoyalPrivilege[]).every(kind => counts[kind] === state.used[kind]));
  check(state.used.intercession === 0 ? state.lastIntercessionDueAt === null : whole(state.lastIntercessionDueAt!, 1));
  const latestIntercession = state.history.filter(grant => grant.kind === 'intercession').at(-1);
  if (latestIntercession) check(latestIntercession.tributeDueAt === state.lastIntercessionDueAt);
  const aidCount = state.used.food + state.used.wood + state.used.gold;
  check(aidCount === 0 ? state.lastAid === null && state.nextAidAt === 0 : state.lastAid !== null);
  if (state.lastAid) {
    validate(state.lastAid);
    check(state.lastAid.kind !== 'intercession' && state.nextAidAt === state.lastAid.timeMs + royalAidCooldownMs);
    if (previousAid) check((Object.keys(previousAid) as (keyof RoyalGrant)[]).every(key => previousAid[key] === state.lastAid![key]));
    if (state.lastAid.sequence > state.sequence - state.history.length) check(previousAid !== null);
  }
}
