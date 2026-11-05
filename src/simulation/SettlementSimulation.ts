import { check, range, whole } from '../persistence/validation.ts';
import { formatNumber } from '../formatNumber.ts';
import { populationRules } from '../population/Population.ts';
import { gameTimeAt, gameTimeRules } from './GameTime.ts';
import { distributionRules } from '../economy/Distribution.ts';
import { Wellbeing } from '../population/Wellbeing.ts';
import { HousingEvolution } from '../population/HousingEvolution.ts';
import { HouseholdNeeds } from '../population/HouseholdNeeds.ts';
import { VillageVoices } from '../population/VillageVoices.ts';
import { WaterService } from './WaterService.ts';
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
  readonly wellbeing = new Wellbeing();
  readonly housing = new HousingEvolution();
  readonly water = new WaterService();
  readonly needs = new HouseholdNeeds();
  readonly voices = new VillageVoices();
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

  saveState() {
    return { elapsedMs: this.elapsedMs, paused: this.paused, speed: this.speed, immigrationSeconds: this.immigrationSeconds,
      wellbeing: this.wellbeing.saveState(), housing: this.housing.saveState(), needs: this.needs.saveState(), voices: this.voices.saveState() };
  }

  restoreState(state: ReturnType<SettlementSimulation['saveState']>): void {
    const { elapsedMs, paused, speed, immigrationSeconds, wellbeing, housing, needs, voices } = state;
    check(range(elapsedMs, 0, 1000) && elapsedMs < 1000 && typeof paused === 'boolean' && whole(speed, 1, 3)
      && whole(immigrationSeconds, 0, this.immigrationIntervalSeconds - 1));
    this.elapsedMs = elapsedMs;
    this.isPaused = paused;
    this.multiplier = speed;
    this.immigrationSeconds = immigrationSeconds;
    this.wellbeing.restoreState(wellbeing, this.map, this.simulatedTimeMs);
    this.housing.restoreState(housing, this.map);
    this.needs.restoreState(needs, this.map);
    this.voices.restoreState(voices, this.map, this.simulatedTimeMs);
    // The saved roster is the roster from the last tick. A new assignment is due on the next tick.
    this.economy.recalculate(this.map, this.connections, this.population);
    this.water.refresh(this.map, this.connections, this.population);
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
    const formatShortfall = (value: number) => value < 0.005
      ? 'menos de ' + formatNumber(0.01) : formatNumber(value);
    if (missing.gold > 0) quantities.push(formatShortfall(missing.gold) + ' oro');
    if (missing.wood > 0) quantities.push(formatShortfall(missing.wood) + ' madera disponible');
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
    if (target.type === 'house') {
      this.wellbeing.forget(target.cell);
      this.housing.forget(target.cell);
      this.needs.forget(target.cell);
      this.voices.retireHome(target.cell);
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
    this.water.refresh(this.map, this.connections, this.population);
  }

  migrationAttractiveness(happiness: number): number {
    if (!this.map.villageCenter) return 0;
    return this.population.migrationAttractiveness(this.economy.migrationFood(this.population),
      this.economy.taxMigrationModifier, happiness);
  }

  private updateWellbeing(): void {
    const distribution = this.economy.distribution;
    const homes = this.population.residencesSnapshot;
    this.water.refresh(this.map, this.connections, this.population);
    this.needs.recordSecond(homes, home => ({
      food: Math.max(0, 1 - distribution.foodShortageAt(home.cell)
        / (home.residents * populationRules.foodPerResidentPerSecond)),
      wood: Math.max(0, 1 - distribution.woodShortageAt(home.cell)
        / (home.residents * distributionRules.woodPerResidentPerHour / gameTimeRules.secondsPerHour)),
      water: this.water.suppliedAt(home.cell) / home.residents,
    }));
    const candidate = this.wellbeing.advanceSecond(homes, home => this.needs.currentAt(home.cell)!,
      this.population.unemploymentRate, this.economy.currentTaxPolicy, this.simulatedTimeMs);
    let populationChanged = false;
    const unemployment = this.population.unemploymentRate;
    for (const home of homes) {
      if (home.residents === 0) {
        this.housing.forget(home.cell);
        continue;
      }
      const level = this.housing.advanceSecond(home.cell, home.level, this.wellbeing.at(home.cell)!.happiness,
        this.needs.currentAt(home.cell)!, unemployment);
      if (level === undefined) continue;
      const displaced = this.population.setHousingLevel(home.cell, level);
      this.voices.reportHousingChange(home.cell, level > home.level);
      if (displaced > 0) {
        this.wellbeing.recordDeparture(this.simulatedTimeMs, home.cell, home.residents - displaced, displaced, 'deterioration');
        this.needs.forget(home.cell);
        populationChanged = true;
      }
    }
    if (!populationChanged && candidate && this.population.removeResident(candidate)) {
      this.wellbeing.recordDeparture(this.simulatedTimeMs, candidate, this.population.residentsAt(candidate));
      this.needs.forget(candidate);
      populationChanged = true;
    }
    if (populationChanged) {
      this.economy.recalculate(this.map, this.connections, this.population);
      this.water.refresh(this.map, this.connections, this.population);
    }
  }

  // One shared clock processes production, consumption, wellbeing and migration in order.
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
      this.updateWellbeing();
      this.immigrationSeconds++;
      if (this.immigrationSeconds === this.immigrationIntervalSeconds) {
        this.immigrationSeconds = 0;
        const supply = this.economy.immigrationSupply(this.population, populationRules.familySize,
          this.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond,
          populationRules.residentsPerPlot);
        const { happiness } = this.wellbeing.summarize(this.population.residencesSnapshot);
        const food = this.map.villageCenter ? this.economy.migrationFood(this.population) : 0;
        if (this.population.immigrate(food, supply, {
          happiness, modifier: this.economy.taxMigrationModifier, seconds: this.immigrationIntervalSeconds,
          admissionsOpen: this.wellbeing.admissionsOpen(this.simulatedTimeMs, happiness),
        }) > 0) {
          this.economy.recalculate(this.map, this.connections, this.population);
          this.water.refresh(this.map, this.connections, this.population);
        }
      }
      this.voices.advance(this.simulatedTimeMs, () => this.needs.observations(this.population.residencesSnapshot), () => {
        const buildings = this.map.saveCells();
        return {
          unemployment: this.population.unemploymentRate, tax: this.economy.currentTaxPolicy,
          waiting: this.population.waitingImmigrants,
          hasMarket: buildings.includes('market'), hasWarehouse: buildings.includes('warehouse'),
          hasRoad: buildings.includes('road'),
        };
      });
      advanced = true;
    }
    return advanced;
  }
}
