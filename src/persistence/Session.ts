import { Economy } from '../economy/Economy.ts';
import { ConstructionMap, constructionDimensions, isConstructionType } from '../map/ConstructionMap.ts';
import type { Dimensions } from '../map/ConstructionMap';
import type { Cell } from '../map/CellSelection';
import { cameraRules, cellSize } from '../map/MapCamera.ts';
import type { CameraView } from '../map/MapCamera';
import { RoadConnections } from '../map/RoadConnections.ts';
import { legacyProceduralTerrain, legacyWorldSize, maxSeed, newWorld, proceduralTerrain, startingCell, worldRules } from '../map/World.ts';
import type { World } from '../map/World';
import { TerrainMap } from '../map/Terrain.ts';
import { generateTerrain, starterRules } from '../map/generateTerrain.ts';
import { ensureStarterWoodland, restoreLegacyWoodland } from '../map/Woodland.ts';
import { bridgeCells } from '../map/Bridge.ts';
import { kingdomEntryId, kingdomRoadId, planKingdomRoad } from '../map/KingdomRoad.ts';
import { Population, populationRules } from '../population/Population.ts';
import { SettlementSimulation } from '../simulation/SettlementSimulation.ts';
import { check, list, range, whole } from './validation.ts';

export class Session {
  readonly map: ConstructionMap;
  readonly economy = new Economy();
  readonly population = new Population();
  readonly connections = new RoadConnections();
  readonly simulation: SettlementSimulation;
  private introductionPending = false;

  constructor(readonly world: World = newWorld(), terrain?: TerrainMap) {
    check(world.terrain === worldRules.terrain || terrain);
    this.map = new ConstructionMap(world.columns, world.rows, terrain);
    this.economy.distribution.enableHouseholds();
    this.simulation = new SettlementSimulation(this.economy, this.population,
      populationRules.immigrationIntervalSeconds, this.map, this.connections, world.seed);
    this.simulation.recalculate();
  }

  static start(seed?: number): Session {
    const world = newWorld(seed, proceduralTerrain);
    check(whole(world.seed, 0, maxSeed));
    const create = (ensureNorthAccess: boolean) => {
      const session = new Session(world, generateTerrain(world, ensureNorthAccess));
      check(session.map.place(startingCell(world), 'villageCenter'));
      return session;
    };
    let session = create(false);
    let route = planKingdomRoad(session.map, world.seed);
    if (!route) {
      session = create(true);
      route = planKingdomRoad(session.map, world.seed);
    }
    check(route);
    for (const cell of route) {
      const obstacle = session.map.terrain.at(cell)?.obstacle;
      if (obstacle) check(session.map.terrain.clear(cell, obstacle));
      check(session.map.place(cell, 'road'));
    }
    check(session.map.protectKingdomRoad(route));
    ensureStarterWoodland(session.map, startingCell(world), starterRules.radius + 1);
    session.simulation.recalculate();
    session.introductionPending = true;
    return session;
  }

  takeIntroduction(): boolean {
    const pending = this.introductionPending;
    this.introductionPending = false;
    return pending;
  }

  saveState(selection: Cell | null, camera?: CameraView) {
    const bridgeSpans = this.map.bridgeSpans();
    const footprints = this.map.saveFootprints();
    const roadLevels = this.map.saveRoadLevels();
    return { world: this.world, cells: this.map.saveCells(), selection, ...(camera && { camera }),
      terrainData: this.map.terrain.save(),
      ...(this.map.kingdomRoad && { kingdomRoad: this.map.kingdomRoad }),
      ...(bridgeSpans.length > 0 && { bridgeSpans }),
      ...(footprints.length > 0 && { footprints }),
      ...(roadLevels.length > 0 && { roadLevels }),
      economy: this.economy.saveState(), population: this.population.saveState(), simulation: this.simulation.saveState(),
      progression: this.simulation.progress.saveState(), crown: this.simulation.crown.saveState() };
  }

  static restore(state: Omit<ReturnType<Session['saveState']>, 'progression' | 'terrainData' | 'crown'>
    & Partial<Pick<ReturnType<Session['saveState']>, 'progression' | 'terrainData' | 'crown'>>)
    : { session: Session; selection: Cell | null; camera?: CameraView } {
    const { world, cells, selection, economy, population, simulation, camera, terrainData,
      kingdomRoad, bridgeSpans, footprints, roadLevels } = state;
    const legacy = world.columns === legacyWorldSize && world.rows === legacyWorldSize;
    check((legacy || (world.columns === worldRules.columns && world.rows === worldRules.rows))
      && whole(world.seed, 0, maxSeed));
    check(world.terrain === worldRules.terrain
      || (!legacy && (world.terrain === legacyProceduralTerrain || world.terrain === proceduralTerrain)));
    list(cells, world.columns * world.rows);
    check(cells.length === world.columns * world.rows);
    check(selection === null || (whole(selection.column, 0, world.columns - 1)
      && whole(selection.row, 0, world.rows - 1)));
    check(camera === undefined || (camera && range(camera.x, 0, world.columns * cellSize)
      && range(camera.y, 0, world.rows * cellSize) && range(camera.zoom, cameraRules.minZoom, cameraRules.maxZoom)));
    // Read each index using the saved stride, even when restoring into a wider map.
    const terrain = terrainData !== undefined || world.terrain !== worldRules.terrain
      ? TerrainMap.restore(world.columns, world.rows, terrainData) : undefined;
    const session = new Session({ ...world, columns: worldRules.columns, rows: worldRules.rows },
      legacy ? terrain?.expanded(worldRules.columns, worldRules.rows) : terrain);
    const savedBridges = new Set<number>();
    const sizes = new Map<number, Dimensions>();
    if (footprints !== undefined) {
      list(footprints, cells.length);
      for (const { cell, width, height } of footprints) {
        check(whole(cell.column, 0, world.columns - 1) && whole(cell.row, 0, world.rows - 1));
        const index: number = cell.row * world.columns + cell.column;
        const type = cells[index];
        check(type && isConstructionType(type) && !sizes.has(index)
          && width === constructionDimensions[type].width && height === constructionDimensions[type].height
          && (width > 1 || height > 1));
        sizes.set(index, { width, height });
      }
    }
    for (const [index, type] of cells.entries()) {
      if (type === null) continue;
      check(typeof type === 'string' && isConstructionType(type));
      if (type === 'bridge') {
        savedBridges.add(index);
        continue;
      }
      check(session.map.place({ column: index % world.columns, row: Math.floor(index / world.columns) }, type, sizes.get(index)));
    }
    if (bridgeSpans !== undefined) {
      list(bridgeSpans, savedBridges.size);
      for (const span of bridgeSpans) {
        check(session.map.placeBridge(span));
        for (const cell of bridgeCells(span)) check(savedBridges.delete(cell.row * world.columns + cell.column));
      }
    }
    check(savedBridges.size === 0);
    if (world.terrain === proceduralTerrain) {
      check(kingdomRoad?.id === kingdomRoadId && kingdomRoad.entry?.id === kingdomEntryId
        && kingdomRoad.entry.roadId === kingdomRoadId);
      list(kingdomRoad.segments, world.columns * world.rows);
      check(session.map.protectKingdomRoad(kingdomRoad.segments));
      const entry = session.map.kingdomRoad!.entry.cell;
      check(kingdomRoad.entry.cell.column === entry.column && kingdomRoad.entry.cell.row === entry.row);
    } else check(kingdomRoad === undefined);
    if (roadLevels !== undefined) {
      list(roadLevels, cells.length);
      for (const { cell, level } of roadLevels) {
        check(whole(cell.column, 0, world.columns - 1) && whole(cell.row, 0, world.rows - 1));
        check((level === 2 || level === 3) && session.map.upgradeRoad(cell, 2));
        if (level === 3) check(session.map.upgradeRoad(cell, 3));
      }
    }

    if (!terrain) restoreLegacyWoodland(session.map, startingCell(world));
    // Set up derived slots and inventories before importing exact state. No ticks or charges occur.
    session.simulation.recalculate();
    session.population.restoreState(population);
    session.economy.restoreState(economy, session.map);
    session.simulation.crown.restoreState(state.crown, session.simulation.simulatedTimeMs);
    session.simulation.restoreState(simulation);
    session.simulation.progress.restoreState(state.progression, session.simulation.simulatedTimeMs);
    return { session, selection: selection ? session.map.constructionAt(selection)?.cell ?? selection : null, camera };
  }
}

