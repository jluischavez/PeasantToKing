import type { ConstructionType } from './ConstructionMap';
import bridge from '../assets/buildings/bridge.svg?url';
import farm from '../assets/buildings/farm.svg?url';
import garden from '../assets/buildings/garden.svg?url';
import house from '../assets/buildings/housing-plot.svg?url';
import lumberjack from '../assets/buildings/lumberjack.svg?url';
import market from '../assets/buildings/market.svg?url';
import park from '../assets/buildings/park.svg?url';
import plaza from '../assets/buildings/plaza.svg?url';
import road from '../assets/buildings/road.svg?url';
import gravel from '../assets/buildings/road-gravel.svg?url';
import stone from '../assets/buildings/road-stone.svg?url';
import villageCenter from '../assets/buildings/village-center.svg?url';
import warehouse from '../assets/buildings/warehouse.svg?url';
import well from '../assets/buildings/well.svg?url';

export const buildingArt: Record<ConstructionType, string> = {
  bridge, farm, garden, house, lumberjack, market, park, plaza, road, villageCenter, warehouse, well,
};

export const buildingTexture = (type: ConstructionType): string => 'building-' + type;
export const upgradedRoadArt = {
  2: { texture: 'road-gravel', url: gravel },
  3: { texture: 'road-stone', url: stone },
} as const;
