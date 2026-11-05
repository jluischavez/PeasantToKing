import { populationRules } from '../population/Population.ts';
import { gameTimeAt } from './GameTime.ts';
import { constructionCosts, demolitionCost } from '../map/ConstructionCosts.ts';
import type { ConstructionCost } from '../map/ConstructionCosts';
import type { Cell } from '../map/CellSelection';
import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { Economy } from '../economy/Economy';
import type { Population } from '../population/Population';

export type SimulationSpeed = 1 | 2 | 3;
type DemolitionTarget = Readonly<{ cell: Readonly<Cell>; type: ConstructionType }>;

function buildingId(cell: Cell, type: ConstructionType): string {
  return type + ':' + cell.column + ',' + cell.row;
}

export class SettlementSimulation {
  private elapsedMs = 0;
  private isPaused = false;
  private suspended = false;
  private discardResumingFrame = false;
  private multiplier: SimulationSpeed = 1;
  private immigrationSeconds = 0;
  private demolition: DemolitionTarget | null = null;
  private readonly economy: Economy;
  private readonly population: Population;
  private readonly immigrationIntervalSeconds: number;
  private readonly map: ConstructionMap;
  private readonly connections: RoadConnections;

  constructor(economy: Economy, population: Population, immigrationIntervalSeconds: number,
    map: ConstructionMap, connections: RoadConnections) {
    this.map = map;
    this.connections = connections;
    this.economy = economy;
    this.population = population;
    this.immigrationIntervalSeconds = immigrationIntervalSeconds;
  }

  get paused(): boolean { return this.isPaused; }
  get speed(): SimulationSpeed { return this.multiplier; }
  get simulatedTimeMs(): number { return this.economy.simulatedTimeMs; }

  get gameTime(): ReturnType<typeof gameTimeAt> {
    return gameTimeAt(this.simulatedTimeMs + this.elapsedMs);
  }

  setPaused(paused: boolean): void { this.isPaused = paused; }

  setSuspended(suspended: boolean): void {
    if (this.suspended && !suspended) this.discardResumingFrame = true;
    this.suspended = suspended;
  }
  setSpeed(speed: SimulationSpeed): void { this.multiplier = speed; }

  costIssue(cost: ConstructionCost): string | null {
    const missing = this.economy.missingCost(cost);
    const quantities = [];
    const format = (value: number) => value.toLocaleString('es', { maximumFractionDigits: 3 });
    if (missing.gold > 0) quantities.push(format(missing.gold) + ' oro');
    if (missing.wood > 0) quantities.push(format(missing.wood) + ' madera disponible');
    return quantities.length ? 'Recursos insuficientes. Faltan ' + quantities.join(' y ') + '.' : null;
  }

  constructionIssue(cell: Cell, type: ConstructionType): string | null {
    if (this.paused) return 'Reanuda la simulación para construir.';
    if (!this.map.canPlace(cell, type)) return 'La casilla no está disponible para esta construcción.';
    return this.costIssue(constructionCosts[type]);
  }

  build(cell: Cell, type: ConstructionType): string | null {
    const issue = this.constructionIssue(cell, type);
    if (issue) return issue;
    if (!this.map.place(cell, type)) return 'La casilla no está disponible para esta construcción.';
    // Placement does not change the inventories used by the validated charge.
    if (!this.economy.payBuildingCost(constructionCosts[type], 'construction', buildingId(cell, type))) {
      throw new Error('A validated construction charge failed');
    }
    this.recalculate();
    return null;
  }

  demolitionIssue(cell: Cell): string | null {
    if (this.paused) return 'Reanuda la simulación para demoler.';
    const type = this.map.getConstruction(cell);
    if (!type) return 'Selecciona una construcción existente.';
    if (type === 'villageCenter') return 'El Centro de Aldea está protegido.';
    if (type === 'warehouse' || type === 'market') {
      const inventory = this.economy.storage.inventories.snapshot(buildingId(cell, type));
      if (inventory && inventory.used > 0) {
        return type === 'warehouse' ? 'El inventario debe estar vacío. Usa «Vaciar almacén» en el inspector.'
          : 'El inventario debe estar vacío.';
      }
    }
    return this.costIssue(demolitionCost);
  }

  get demolitionTarget(): DemolitionTarget | null { return this.demolition; }

  requestDemolition(cell: Cell): string | null {
    this.cancelDemolition();
    const issue = this.demolitionIssue(cell);
    if (issue) return issue;
    this.demolition = { cell: { ...cell }, type: this.map.getConstruction(cell)! };
    return null;
  }

  cancelDemolition(): void { this.demolition = null; }

  confirmDemolition(): string | null {
    const target = this.demolition;
    if (!target || this.map.getConstruction(target.cell) !== target.type) {
      this.cancelDemolition();
      return 'Selecciona una construcción para demoler.';
    }
    const issue = this.demolitionIssue(target.cell);
    if (issue) return issue;
    if (!this.map.remove(target.cell)) return 'La construcción ya no está disponible.';
    if (!this.economy.payBuildingCost(demolitionCost, 'demolition', buildingId(target.cell, target.type))) {
      throw new Error('A validated demolition charge failed');
    }
    this.cancelDemolition();
    this.recalculate();
    return null;
  }

  recalculate(): void {
    this.connections.recalculate(this.map);
    this.economy.recalculate(this.map, this.connections, this.population);
    this.population.recalculate(this.map, this.connections, this.economy.laborContext(this.population));
    this.economy.recalculate(this.map, this.connections, this.population);
  }

  // One shared clock processes production, consumption and immigration in order.
  advance(deltaMs: number): boolean {
    if (this.suspended) return false;
    if (this.discardResumingFrame) {
      this.discardResumingFrame = false;
      return false;
    }
    if (this.paused || !Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    this.elapsedMs += deltaMs * this.speed;
    let advanced = false;
    while (this.elapsedMs >= 1000) {
      this.elapsedMs -= 1000;
      this.economy.recalculate(this.map, this.connections, this.population);
      this.population.recalculate(this.map, this.connections, this.economy.laborContext(this.population));
      this.economy.recalculate(this.map, this.connections, this.population);
      this.economy.advance(1000);
      this.economy.consumeHomes(this.population, populationRules.foodPerResidentPerSecond);
      this.economy.accountOperatingSecond(this.population.employed, this.population.total);
      this.immigrationSeconds++;
      if (this.immigrationSeconds === this.immigrationIntervalSeconds) {
        this.immigrationSeconds = 0;
        const supply = this.economy.immigrationSupply(this.population, populationRules.familySize,
          this.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond,
          populationRules.residentsPerPlot);
        if (this.population.immigrate(this.economy.availableFood, supply, this.economy.taxMigrationModifier) > 0) {
          this.economy.recalculate(this.map, this.connections, this.population);
        }
      }
      advanced = true;
    }
    return advanced;
  }
}
