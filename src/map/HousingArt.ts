import type { HousingLevel } from '../population/HousingEvolution';
import hut from '../assets/housing/choza.svg?url';
import timber from '../assets/housing/madera.svg?url';
import stone from '../assets/housing/piedra.svg?url';
import prosperous from '../assets/housing/prospera.svg?url';

export const housingArt: Readonly<Record<HousingLevel, { texture: string; url: string }>> = {
  1: { texture: 'housing-hut', url: hut },
  2: { texture: 'housing-timber', url: timber },
  3: { texture: 'housing-stone', url: stone },
  4: { texture: 'housing-prosperous', url: prosperous },
};
