import type { Journey, Transport } from '../economy/Logistics';
import type { ConstructionType } from './ConstructionMap';

export const professionColors = {
  warehouse: 0xd33c36, lumberjack: 0x86502e, farmer: 0x36a34a,
  water: 0x318cde, unemployed: 0xffffff, outsider: 0xc99a30,
  buyer: 0xd9c39d, market: 0x85344f,
} as const;
export type Profession = keyof typeof professionColors;
export function transportProfession(op: Transport | Journey, workplace?: ConstructionType): Profession {
  if (op.kind === 'water-service') return 'water';
  if (op.kind === 'immigration') return 'outsider';
  if (op.kind === 'household-purchase') return 'buyer';
  if (op.kind === 'producer-to-warehouse') return workplace === 'farm' ? 'farmer'
    : workplace === 'lumberjack' ? 'lumberjack' : 'unemployed';
  return 'warehouse';
}
