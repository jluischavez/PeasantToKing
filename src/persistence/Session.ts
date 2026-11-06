import { Economy } from '../economy/Economy.ts';
import { ConstructionMap, isConstructionType } from '../map/ConstructionMap.ts';
import type { Cell } from '../map/CellSelection';
import { cameraRules, cellSize } from '../map/MapCamera.ts';
import type { CameraView } from '../map/MapCamera';
import { RoadConnections } from '../map/RoadConnections.ts';
import { legacyWorldSize, maxSeed, newWorld, proceduralTerrain, startingCell, worldRules } from '../map/World.ts';
import type { World } from '../map/World';
import { TerrainMap } from '../map/Terrain.ts';
import { generateTerrain } from '../map/generateTerrain.ts';
import { Population, populationRules } from '../population/Population.ts';
import { SettlementSimulation } from '../simulation/SettlementSimulation.ts';
import { check, list, range, whole } from './validation.ts';

export class Session {
  readonly map: ConstructionMap;
  readonly economy = new Economy();
  readonly population = new Population();
  readonly connections = new RoadConnections();
  readonly simulation: SettlementSimulation;

  constructor(readonly world: World = newWorld(), terrain?: TerrainMap) {
    check(world.terrain !== proceduralTerrain || terrain);
    this.map = new ConstructionMap(world.columns, world.rows, terrain);
    this.simulation = new SettlementSimulation(this.economy, this.population,
      populationRules.immigrationIntervalSeconds, this.map, this.connections);
    this.simulation.recalculate();
  }

  static start(seed?: number): Session {
    const world = newWorld(seed, proceduralTerrain);
    check(whole(world.seed, 0, maxSeed));
    const session = new Session(world, generateTerrain(world));
    check(session.map.place(startingCell(world), 'villageCenter'));
    session.simulation.recalculate();
    return session;
  }

  saveState(selection: Cell | null, camera?: CameraView) {
    const terrainData = this.world.terrain === proceduralTerrain ? this.map.terrain.save() : undefined;
    return { world: this.world, cells: this.map.saveCells(), selection, ...(camera && { camera }),
      ...(terrainData !== undefined && { terrainData }),
      economy: this.economy.saveState(), population: this.population.saveState(), simulation: this.simulation.saveState() };
  }

  static restore(state: ReturnType<Session['saveState']>): { session: Session; selection: Cell | null; camera?: CameraView } {
    const { world, cells, selection, economy, population, simulation, camera, terrainData } = state;
    const legacy = world.columns === legacyWorldSize && world.rows === legacyWorldSize;
    check((legacy || (world.columns === worldRules.columns && world.rows === worldRules.rows))
      && whole(world.seed, 0, maxSeed));
    check(world.terrain === worldRules.terrain || (!legacy && world.terrain === proceduralTerrain));
    list(cells, world.columns * world.rows);
    check(cells.length === world.columns * world.rows);
    check(selection === null || (whole(selection.column, 0, world.columns - 1)
      && whole(selection.row, 0, world.rows - 1)));
    check(camera === undefined || (camera && range(camera.x, 0, world.columns * cellSize)
      && range(camera.y, 0, world.rows * cellSize) && range(camera.zoom, cameraRules.minZoom, cameraRules.maxZoom)));
    // Read each index using the saved stride, even when restoring into a wider map.
    const terrain = world.terrain === proceduralTerrain
      ? TerrainMap.restore(world.columns, world.rows, terrainData) : undefined;
    check(terrain || terrainData === undefined);
    const session = new Session({ ...world, columns: worldRules.columns, rows: worldRules.rows }, terrain);
    for (const [index, type] of cells.entries()) {
      if (type === null) continue;
      check(typeof type === 'string' && isConstructionType(type));
      check(session.map.place({ column: index % world.columns, row: Math.floor(index / world.columns) }, type));
    }

    // Set up derived slots and inventories before importing exact state. No ticks or charges occur.
    session.simulation.recalculate();
    session.population.restoreState(population);
    session.economy.restoreState(economy, session.map);
    session.simulation.restoreState(simulation);
    return { session, selection, camera };
  }
}

