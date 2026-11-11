import type { Session } from '../persistence/Session';
import type { Cell } from './CellSelection';
import { constructionDimensions, constructionNames } from './ConstructionMap';
import { unitsPerResource } from '../economy/Inventories';
import type { ConstructionMap, ConstructionType, Dimensions } from './ConstructionMap';
import { beautyPoints, beautyRules } from '../population/ResidentialBeauty';
import { requiresRoadConnection } from './BuildingAccess';
import { distributionRules } from '../economy/Distribution';
import { waterRules } from '../simulation/WaterService';
import { distanceFromFootprint, footprintRange } from './FootprintRange';
import { traceRoadCoverage } from './MarketCoverage';
import { harvestArea, isWoodland, woodlandRules } from './Woodland';

type Context = Pick<Session, 'map' | 'connections' | 'population' | 'economy' | 'simulation'>;
export type CoverageTarget = { cell: Cell; type: ConstructionType; size: Dimensions; preview: boolean; issue: string | null };
export type CoverageTile = { cell: Cell; kind: 'area' | 'home' | 'woodland'; reachable: boolean;
  benefit: number; points?: number; gain?: number; note?: string };
export type BuildingCoverage = { target: CoverageTarget; range: number; tiles: readonly CoverageTile[];
  summary: string; restriction: string; legend: string; reachableHomes: number; benefitedHomes: number };

export function supportsCoverage(map: ConstructionMap, type: ConstructionType, cell: Cell, preview = false): boolean {
  return ['garden', 'park', 'plaza', 'market', 'well', 'lumberjack'].includes(type)
    || (type === 'road' && !preview && (map.roadLevelAt(cell) ?? 0) >= 2);
}

// Tool state has priority over selection, including tools with no range.
export function coverageTarget(map: ConstructionMap, selected: Cell | null, mode: ConstructionType | 'demolish' | null,
  hovered: Cell | null, issue: string | null = null, suppressSelection = false): CoverageTarget | null {
  if (mode) return mode !== 'demolish' && hovered && supportsCoverage(map, mode, hovered, true)
    ? { cell: hovered, type: mode, size: constructionDimensions[mode], preview: true, issue } : null;
  const building = !suppressSelection && selected ? map.constructionAt(selected) : null;
  return building && supportsCoverage(map, building.type, building.cell)
    ? { cell: building.cell, type: building.type, size: { width: building.width, height: building.height }, preview: false, issue: null } : null;
}

const key = (cell: Cell) => `${cell.column},${cell.row}`;
type Geometry = { range: number; cells: readonly Cell[]; homes: ReadonlyMap<string, number>; roadService: boolean };

export class BuildingCoverageModel {
  private shapeKey = '';
  private occupied: ReturnType<ConstructionMap['occupiedCells']> | null = null;
  private shape: Geometry | null = null;
  private viewKey = '';
  private report: BuildingCoverage | null = null;
  constructor(private readonly context: Context) {}

  calculate(target: CoverageTarget | null, revision: number): BuildingCoverage | null {
    if (!target || !supportsCoverage(this.context.map, target.type, target.cell, target.preview)) { this.report = null; this.viewKey = ''; return null; }
    const { map, connections, population, economy, simulation } = this.context;
    const { type, cell, size, preview } = target;
    const shapeKey = `${type}:${key(cell)}:${size.width},${size.height}:${preview}:${connections.topologyRevision}:${map.terrain.revision}:${map.roadLevelAt(cell)}`;
    if (this.shapeKey !== shapeKey || this.occupied !== map.occupiedCells()) {
      this.shapeKey = shapeKey; this.occupied = map.occupiedCells(); this.shape = this.geometry(target); this.viewKey = '';
    }
    const viewKey = `${revision}:${simulation.simulatedTimeMs}:${connections.revision}:${target.issue}`;
    if (viewKey === this.viewKey && this.report) return this.report;
    this.viewKey = viewKey;
    const { range, cells, homes, roadService } = this.shape!;
    const sourceConnected = preview ? [...map.borderRoads(cell, size)].some(road => connections.isConnected(road)) : connections.isConnected(cell);
    const sourceActive = !requiresRoadConnection(type) || sourceConnected;
    const tiles: CoverageTile[] = [];
    let reachableHomes = 0, benefitedHomes = 0, woodland = 0, partial = 0, foodHomes = 0, woodHomes = 0, improvedHomes = 0;
    const market = type === 'market' && !preview ? economy.distribution.marketAt(cell) : undefined;
    const marketStock = type === 'market' && !preview ? economy.storage.inventories.snapshot(`market:${key(cell)}`) : undefined;
    const waterAssignments = type === 'well' && !preview ? simulation.water.assignments.filter(a => key(a.well) === key(cell)) : [];
    const assigned = new Map(waterAssignments.map(a => [key(a.home), a.residents]));
    const isBeauty = type === 'garden' || type === 'park' || type === 'plaza' || type === 'road';
    for (const tile of cells) {
      if (distanceFromFootprint(cell, size, tile) === 0) continue;
      const home = map.getConstruction(tile) === 'house';
      let reachable = roadService ? homes.has(key(tile)) : true;
      let benefit = 0, points: number | undefined, gain: number | undefined, note = '';
      if (type === 'lumberjack') {
        const wood = isWoodland(map.terrain, tile); if (wood) woodland++;
        tiles.push({ cell: tile, kind: wood ? 'woodland' : 'area', reachable: true, benefit: !preview && wood ? 1 : 0 }); continue;
      }
      if (home) {
        const residents = population.residentsAt(tile);
        const eligible = reachable && connections.isConnected(tile) && (roadService || sourceActive);
        if (isBeauty) reachable = eligible;
        if (eligible) reachableHomes++;
        if (isBeauty) {
          const rule = type === 'road' ? { range: beautyRules.road.range, bonus: beautyRules.road.bonus[map.roadLevelAt(cell) as 2 | 3] } : beautyRules.decoration[type];
          points = beautyPoints(type, rule.bonus, range, distanceFromFootprint(cell, size, tile));
          if (!preview && eligible && simulation.beauty.at(tile).sources[type] === points) benefit = 1;
          note = `${points} puntos de belleza; cuenta el mejor aporte de cada tipo.`;
          if (preview) {
            const old = simulation.beauty.at(tile);
            gain = eligible ? Math.min(beautyRules.maximum, old.score + Math.max(0, points - (old.sources[type] ?? 0))) - old.score : 0;
            if (gain > 0) improvedHomes++;
            note += ` Mejora estimada: +${gain} (respeta el máximo de belleza).`;
          }
          if (!eligible) note = `Potencial: ${note} ${type === 'garden'
            ? 'La vivienda necesita conexión vial; el jardín no la requiere.'
            : 'Sin conexión válida del emisor o de la vivienda.'}`;
        } else if (type === 'well') {
          benefit = !preview && eligible && residents > 0 ? (assigned.get(key(tile)) ?? 0) / residents : 0;
          note = `${assigned.get(key(tile)) ?? 0}/${residents} habitantes asignados a este pozo.`;
        } else if (type === 'market') {
          // Food actually received is a household observation, not provenance.
          // Never call supplyAt here: that method can close the bootstrap reserve.
          const observed = simulation.needs.currentAt(tile);
          const canObserve = !preview && eligible && residents > 0 && market?.operational;
          const food = canObserve && market.sells.food ? observed?.food ?? 0 : 0;
          const wood = canObserve && market.sells.wood ? observed?.wood ?? 0 : 0;
          if (food > 0) foodHomes++; if (wood > 0) woodHomes++;
          const products = Number(!!market?.sells.food) + Number(!!market?.sells.wood);
          benefit = products ? (food + wood) / products : 0;
          note = `Recibido: comida ${Math.round(food * 100)} %, madera ${Math.round(wood * 100)} % (cualquier origen; solo productos autorizados). No atribuye reservas domésticas a este mercado.`;
        }
        if (benefit > 0) { benefitedHomes++; if (benefit < 1) partial++; }
      }
      tiles.push({ cell: tile, kind: home ? 'home' : 'area', reachable, benefit, ...(points !== undefined && { points }), ...(gain !== undefined && { gain }), ...(note && { note }) });
    }
    const prefix = `${preview ? 'Potencial · ' : ''}${constructionNames[type]} · Alcance: ${range} ${roadService ? 'tramos viales' : 'casillas desde la huella'}.`;
    let summary = `${prefix} Viviendas elegibles: ${reachableHomes}.`, restriction = '';
    if (isBeauty) {
      summary += preview ? ` Con mejora estimada: ${improvedHomes}; aún no construido.` : ` Con aporte vigente de este tipo: ${benefitedHomes}.`;
      restriction = type === 'garden' ? 'No necesita caminos; las viviendas receptoras sí deben estar conectadas.'
        : 'Requiere conexión vial del emisor y de la vivienda.';
      if (type === 'plaza') restriction += ' La fuente es decorativa y no da agua.';
    } else if (type === 'well') {
      summary += preview ? ' Asignación aún desconocida.' : ` Con asignación: ${benefitedHomes}${partial ? ` (${partial} ${partial === 1 ? 'parcial' : 'parciales'})` : ''}. Habitantes asignados: ${waterAssignments.reduce((sum, a) => sum + a.residents, 0)}/${waterRules.capacity}.`;
      restriction = preview ? 'Potencial: depende de conexión, aguador, ocupación y cupos compartidos con otros pozos.'
        : !sourceConnected ? 'Sin conexión vial.' : !simulation.water.wellAt(cell)?.workers ? 'Sin aguador.' : 'Verde: asignación real a este pozo; relleno parcial si el cupo no cubre todo el hogar.';
    } else if (type === 'market') {
      summary += preview ? ' No confirma personal, existencias ni entregas.' : ` Con productos recibidos: ${benefitedHomes}${partial ? ` (${partial} ${partial === 1 ? 'parcial' : 'parciales'})` : ''}. Comida: ${foodHomes}; madera: ${woodHomes} (cualquier origen, con venta habilitada).`;
      const foodReady = market?.operational && market.sells.food ? marketStock?.available.food ?? 0 : 0;
      const woodReady = market?.operational && market.sells.wood ? marketStock?.available.wood ?? 0 : 0;
      restriction = preview ? 'Potencial vial, no es un círculo: requiere personal, permisos, existencias y viajes reales.'
        : `${market?.reason || 'Mercado operativo.'} Comida libre para comprar: ${foodReady / unitsPerResource}; madera: ${woodReady / unitsPerResource}. El verde no atribuye la comida al mercado ni promete una entrega.`;
    } else {
      summary = `${prefix} Árboles/bosques aprovechables: ${woodland}.`;
      restriction = 'Se cuentan casillas con árbol o bosque, no unidades de madera. La producción conserva sus requisitos de acceso y empleo.';
    }
    if (preview && !sourceConnected && type !== 'garden') restriction += ' Sin acceso conectado en esta posición.';
    if (target.issue) restriction = `Posición no confirmable: ${target.issue} ${restriction}`;
    const legend = preview ? 'Amarillo: potencial. Contorno verde: mejora estimada de belleza o arbolado. Gris: sin acceso. Rojo: huella inválida; no confirma servicios.'
      : 'Verde: beneficio observado o arbolado. Amarillo: alcance sin beneficio. Gris: sin acceso. Relleno verde parcial: servicio o productos parciales.';
    return this.report = { target, range, tiles, summary, restriction, legend, reachableHomes, benefitedHomes };
  }

  private geometry(target: CoverageTarget): Geometry {
    const { map, connections, economy } = this.context, { type, cell, size, preview } = target;
    const roadService = type === 'market' || type === 'well';
    const range = type === 'lumberjack' ? woodlandRules.harvestRange : type === 'well' ? waterRules.roadRange
      : type === 'market' ? distributionRules.coverageRoadTiles : type === 'road' ? beautyRules.road.range
      : beautyRules.decoration[type as 'garden' | 'park' | 'plaza'].range;
    if (roadService) {
      const area = type === 'market' && !preview ? economy.distribution.coverage.area(cell) : undefined;
      const trace = area ?? traceRoadCoverage(map, connections, cell, size, range);
      const cells = new Map(trace.roads.map(item => [key(item.cell), item.cell]));
      // Nearby homes with no route are outlines, never a fictitious service radius.
      for (const tile of footprintRange(map, cell, size, range + 1)) if (map.getConstruction(tile) === 'house') cells.set(key(tile), tile);
      return { range, cells: [...cells.values()], homes: trace.homes, roadService };
    }
    return { range, cells: [...(type === 'lumberjack' ? harvestArea(map.terrain, cell, size) : footprintRange(map, cell, size, range))], homes: new Map(), roadService };
  }
}
