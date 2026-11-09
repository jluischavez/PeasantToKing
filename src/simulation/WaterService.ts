import type { Cell } from '../map/CellSelection';
import type { ConstructionMap } from '../map/ConstructionMap';
import { MarketCoverage } from '../map/MarketCoverage.ts';
import type { RoadConnections } from '../map/RoadConnections';
import type { Population } from '../population/Population';
import type { Household } from '../population/HouseholdNeeds';

export const waterRules = { capacity: 30, roadRange: 6 } as const;
export type WellSnapshot = Readonly<{ connected: boolean; workers: number; served: number }>;
type Well = { cell: Cell; connected: boolean; workers: number; served: number };
const key = (cell: Cell) => cell.column + ',' + cell.row;

export class WaterService {
  readonly assignments: { well: Cell; home: Cell; residents: number }[] = [];
  private readonly coverage = new MarketCoverage();
  private readonly wells = new Map<string, Well>();
  private readonly supplied = new Map<string, number>();
  private map: ConstructionMap | undefined;
  private roads: RoadConnections | undefined;
  private revision = -1;

  refresh(map: ConstructionMap, roads: RoadConnections, population: Pick<Population, 'workersAt'> & { residencesSnapshot: readonly Household[] }): void {
    if (map !== this.map || roads !== this.roads || roads.revision !== this.revision) {
      this.map = map;
      this.roads = roads;
      this.revision = roads.revision;
      this.coverage.recalculate(map, roads, waterRules.roadRange, 'well');
      this.wells.clear();
      for (const { cell, type } of map.occupiedCells()) {
        if (type === 'well') {
          this.wells.set(key(cell), { cell, connected: roads.isConnected(cell), workers: 0, served: 0 });
        }
      }
    }

    this.supplied.clear();
    this.assignments.length = 0;
    const active = [...this.wells.values()].filter(well => {
      well.workers = well.connected ? population.workersAt(well.cell) : 0;
      well.served = 0;
      return well.workers > 0;
    });
    if (active.length === 0) return;

    const homes = population.residencesSnapshot.filter(home => home.residents > 0).map(home => {
      const options = active.flatMap(well => {
        const distance = this.coverage.distance(well.cell, home.cell);
        return distance === undefined ? [] : [{ well, distance }];
      }).sort((a, b) => a.distance - b.distance);
      return { ...home, options };
    }).sort((a, b) => a.options.length - b.options.length);
    // Start with the homes that have the fewest alternatives.
    for (const home of homes) {
      let remaining = home.residents;
      for (const { well } of home.options) {
        const amount = Math.min(remaining, waterRules.capacity - well.served);
        if (amount > 0) this.assignments.push({ well: well.cell, home: home.cell, residents: amount });
        well.served += amount;
        remaining -= amount;
        if (remaining === 0) break;
      }
      if (remaining < home.residents) this.supplied.set(key(home.cell), home.residents - remaining);
    }
  }

  suppliedAt(cell: Cell): number { return this.supplied.get(key(cell)) ?? 0; }

  shortageReason(cell: Cell): string {
    if (!this.roads?.isConnected(cell)) return 'Vivienda sin conexión vial al Centro de Aldea.';
    const nearby = [...this.wells.values()].filter(well => this.coverage.distance(well.cell, cell) !== undefined);
    if (nearby.length === 0) return 'Sin pozo conectado dentro del alcance vial de ' + waterRules.roadRange + ' tramos.';
    return nearby.some(well => well.workers > 0) ? 'Los pozos operativos de la zona agotaron sus cupos.' : 'Pozos de la zona sin aguador.';
  }

  wellAt(cell: Cell): WellSnapshot | undefined {
    const well = this.wells.get(key(cell));
    if (!well) return undefined;
    const { connected, workers, served } = well;
    return { connected, workers, served };
  }
}
