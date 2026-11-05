import { Economy } from '../economy/Economy.ts';
import { ConstructionMap, isConstructionType } from '../map/ConstructionMap.ts';
import type { Cell } from '../map/CellSelection';
import { RoadConnections } from '../map/RoadConnections.ts';
import { newWorld, worldRules } from '../map/World.ts';
import type { World } from '../map/World';
import { Population, populationRules } from '../population/Population.ts';
import { SettlementSimulation } from '../simulation/SettlementSimulation.ts';
import { check, list, whole } from './validation.ts';

export class Session {
  readonly map: ConstructionMap;
  readonly economy = new Economy();
  readonly population = new Population();
  readonly connections = new RoadConnections();
  readonly simulation: SettlementSimulation;

  constructor(readonly world: World = newWorld()) {
    this.map = new ConstructionMap(world.columns, world.rows);
    this.simulation = new SettlementSimulation(this.economy, this.population,
      populationRules.immigrationIntervalSeconds, this.map, this.connections);
    this.simulation.recalculate();
  }

  saveState(selection: Cell | null) {
    return { world: this.world, cells: this.map.saveCells(), selection,
      economy: this.economy.saveState(), population: this.population.saveState(), simulation: this.simulation.saveState() };
  }

  static restore(state: ReturnType<Session['saveState']>): { session: Session; selection: Cell | null } {
    const { world, cells, selection, economy, population, simulation } = state;
    check(world.columns === worldRules.columns && world.rows === worldRules.rows
      && world.terrain === worldRules.terrain && whole(world.seed, 0, 2 ** 32 - 1));
    const session = new Session({ ...worldRules, seed: world.seed });
    list(cells, world.columns * world.rows);
    check(cells.length === world.columns * world.rows);
    for (const [index, type] of cells.entries()) {
      if (type === null) continue;
      check(typeof type === 'string' && isConstructionType(type));
      check(session.map.place({ column: index % world.columns, row: Math.floor(index / world.columns) }, type));
    }
    check(selection === null || session.map.contains(selection));

    // Set up derived slots and inventories before importing exact state. No ticks or charges occur.
    session.simulation.recalculate();
    session.population.restoreState(population);
    session.economy.restoreState(economy, session.map);
    session.simulation.restoreState(simulation);
    return { session, selection };
  }
}

