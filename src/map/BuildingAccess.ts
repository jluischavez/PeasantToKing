import type { ConstructionType } from './ConstructionMap';

// Permanent rule: gardens work without roads. This policy never grants physical
// connectivity; routing and recipient access still use RoadConnections.
export const requiresRoadConnection = (type: ConstructionType): boolean => type !== 'garden';
