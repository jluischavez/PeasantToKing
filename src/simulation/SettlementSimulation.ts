import { check, range, whole } from '../persistence/validation.ts';
import { formatNumber } from '../formatNumber.ts';
import { populationRules } from '../population/Population.ts';
import { gameTimeAt, gameTimeRules } from './GameTime.ts';
import { distributionRules } from '../economy/Distribution.ts';
import { Wellbeing } from '../population/Wellbeing.ts';
import { HousingEvolution, housingRules } from '../population/HousingEvolution.ts';
import { ResidentialBeauty } from '../population/ResidentialBeauty.ts';
import { HouseholdNeeds } from '../population/HouseholdNeeds.ts';
import { VillageVoices } from '../population/VillageVoices.ts';
import { WaterService } from './WaterService.ts';
import { clearingCosts, constructionCosts, demolitionCost } from '../map/ConstructionCosts.ts';
import type { ConstructionCost } from '../map/ConstructionCosts';
import { roadUpgradeCosts } from '../map/RoadMaterials.ts';
import type { RoadLevel } from '../map/RoadMaterials';
import type { Cell } from '../map/CellSelection';
import { groundNames, isProtectedGround, obstacleNames } from '../map/Terrain.ts';
import type { Obstacle } from '../map/Terrain';
import type { ConstructionMap, ConstructionType } from '../map/ConstructionMap';
import { constructionDimensions, footprint } from '../map/ConstructionMap.ts';
import { bridgeCells, bridgeRules } from '../map/Bridge.ts';
import type { BridgeSpan } from '../map/Bridge';
import type { RoadConnections } from '../map/RoadConnections';
import type { Economy } from '../economy/Economy';
import type { Population } from '../population/Population';

export type SimulationSpeed = 1 | 2 | 3;
type DemolitionTarget = Readonly<{ cell: Cell } & (
  { kind: 'building'; type: ConstructionType } | { kind: 'obstacle'; type: Obstacle }
)>;
type BridgePreview = {
  cells: readonly Cell[]; horizontal: boolean; issue: string | null; span?: BridgeSpan; cost?: ConstructionCost;
};

function buildingId(cell: Cell, type: ConstructionType): string {
  return type + ':' + cell.column + ',' + cell.row;
}

export function terrainAuditId(cell: Cell): string {
  return 'terrain:' + cell.column + ',' + cell.row;
}

export class SettlementSimulation {
  readonly wellbeing = new Wellbeing();
  readonly housing = new HousingEvolution();
  readonly beauty = new ResidentialBeauty();
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
  private pendingBridge: BridgeSpan | null = null;
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
    // Restore inventories and the previous roster before applying current eligibility rules.
    this.economy.recalculate(this.map, this.connections, this.population);
    this.refreshWorkforce();
  }

  get paused(): boolean { return this.isPaused; }
  get speed(): SimulationSpeed { return this.multiplier; }
  get simulatedTimeMs(): number { return this.economy.simulatedTimeMs; }

  roadUpgradeAt(cell: Cell) {
    const level = this.map.roadLevelAt(cell);
    if (level === undefined || level === 3) return null;
    const next = level === 1 ? 2 : 3;
    const cost = roadUpgradeCosts[next];
    const issue = this.paused ? 'Reanuda la simulación para mejorar el camino.' : this.costIssue(cost);
    return { level, next, cost, issue } as const;
  }

  upgradeRoad(cell: Cell, expectedLevel: RoadLevel): string | null {
    const upgrade = this.roadUpgradeAt(cell);
    if (!upgrade || upgrade.level !== expectedLevel) return 'El tramo seleccionado ya no admite esta mejora.';
    if (upgrade.issue) return upgrade.issue;
    if (!this.economy.payBuildingCost(upgrade.cost, 'construction', buildingId(cell, 'road'))) {
      return 'Recursos insuficientes para mejorar el camino.';
    }
    this.map.upgradeRoad(cell, upgrade.next);
    this.beauty.recalculate(this.map, this.connections);
    return null;
  }

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
    if (type === 'bridge') return 'Selecciona un camino conectado en la orilla para iniciar el puente.';
    for (const part of footprint(cell, constructionDimensions[type])) {
      if (!this.map.contains(part)) return 'Parte de la construcción queda fuera del mapa.';
      if (this.map.isKingdomRoad(part)) return 'El camino del reino ocupa una casilla de la construcción.';
      const tile = this.map.terrain.at(part)!;
      if (isProtectedGround(tile.ground)) return groundNames[tile.ground] + '. El terreno no es construible.';
      if (tile.obstacle) return obstacleNames[tile.obstacle] + '. Limpia el terreno antes de construir.';
      if (this.map.getConstruction(part)) return 'Una casilla de la construcción ya está ocupada.';
    }
    if (type === 'villageCenter' && this.map.villageCenter) return 'Ya existe un Centro de Aldea.';
    return this.costIssue(constructionCosts[type]);
  }

  bridgeOriginIssue(cell: Cell): string | null {
    if (this.paused) return 'Reanuda la simulación para construir.';
    const { column, row } = cell;
    const bank = [{ column: column - 1, row }, { column: column + 1, row },
      { column, row: row - 1 }, { column, row: row + 1 }]
      .some(neighbor => this.map.terrain.at(neighbor)?.ground === 'river');
    return bank && this.map.getConstruction(cell) === 'road' && this.connections.isConnected(cell)
      ? null : 'Selecciona un camino conectado al Centro de Aldea en la orilla del río.';
  }

  bridgePreview(from: Cell, selected: Cell): BridgePreview {
    const cells: Cell[] = [];
    const dx = Math.sign(selected.column - from.column), dy = Math.sign(selected.row - from.row);
    const horizontal = dx !== 0;
    const invalid = (issue: string): BridgePreview => ({ cells, horizontal, issue });
    const originIssue = this.bridgeOriginIssue(from);
    if (originIssue) return invalid(originIssue);
    if ((dx === 0) === (dy === 0) || this.map.terrain.at(selected)?.ground !== 'river') {
      return invalid('Selecciona agua en línea recta desde la orilla.');
    }
    const at = (step: number): Cell => ({ column: from.column + dx * step, row: from.row + dy * step });
    let to = at(1);
    while (this.map.terrain.at(to)?.ground === 'river') {
      if (cells.length >= bridgeRules.maxSegments) return invalid('El cruce supera el límite de ' + bridgeRules.maxSegments + ' casillas.');
      cells.push(to);
      to = at(cells.length + 1);
    }
    if (!cells.some(cell => cell.column === selected.column && cell.row === selected.row)) {
      return invalid('El agua debe ser continua desde la orilla seleccionada.');
    }
    const destination = this.map.getConstruction(to);
    if (!this.map.terrain.canBuild(to) || (destination && destination !== 'road')) {
      return invalid('La orilla opuesta debe ser tierra firme despejada o un camino.');
    }
    if (cells.some(cell => this.map.getConstruction(cell))) return invalid('El cruce se superpone con otro puente.');
    const cost = { gold: constructionCosts.bridge.gold * cells.length, wood: constructionCosts.bridge.wood * cells.length };
    return { cells, horizontal, span: { from: { ...from }, to }, cost, issue: this.costIssue(cost) };
  }

  get bridgeTarget(): BridgeSpan | null { return this.pendingBridge; }

  requestBridge(from: Cell, selected: Cell): string | null {
    this.cancelDemolition();
    const preview = this.bridgePreview(from, selected);
    this.pendingBridge = preview.span ?? null;
    return preview.issue;
  }

  cancelBridge(): void { this.pendingBridge = null; }

  pendingBridgePreview(): BridgePreview | null {
    const target = this.pendingBridge;
    if (!target) return null;
    const preview = this.bridgePreview(target.from, bridgeCells(target)[0]!);
    if (preview.span && (preview.span.to.column !== target.to.column || preview.span.to.row !== target.to.row)) {
      return { ...preview, issue: 'Cambió la orilla del cruce. Selecciona el puente de nuevo.' };
    }
    return preview;
  }

  confirmBridge(): string | null {
    const preview = this.pendingBridgePreview();
    if (!preview) return 'Selecciona primero un cruce para construir.';
    if (preview.issue) return preview.issue;
    if (!preview.span || !preview.cost || !this.map.placeBridge(preview.span)) return 'El cruce ya no está disponible.';
    const first = preview.cells[0]!;
    if (!this.economy.payBuildingCost(preview.cost, 'construction', buildingId(first, 'bridge'))) {
      this.map.remove(first);
      return 'Recursos insuficientes para construir el cruce.';
    }
    this.cancelBridge();
    this.recalculate();
    return null;
  }

  build(cell: Cell, type: ConstructionType): string | null {
    const issue = this.constructionIssue(cell, type);
    if (issue) return issue;
    if (!this.map.place(cell, type, constructionDimensions[type])) return 'La casilla no está disponible para esta construcción.';
    // Placement does not change the inventories used by the validated charge.
    if (!this.economy.payBuildingCost(constructionCosts[type], 'construction', buildingId(cell, type))) {
      throw new Error('A validated construction charge failed');
    }
    this.recalculate();
    return null;
  }

  demolitionIssue(cell: Cell): string | null {
    if (this.paused) return 'Reanuda la simulación para demoler o limpiar.';
    const target = this.removalTargetAt(cell);
    if (!target) {
      const tile = this.map.terrain.at(cell);
      return tile && isProtectedGround(tile.ground) ? groundNames[tile.ground] + '. El terreno no puede limpiarse.'
        : 'Selecciona una construcción existente o un obstáculo removible.';
    }
    if (target.kind === 'obstacle') return this.costIssue(clearingCosts[target.type]);
    const { type } = target;
    cell = target.cell;
    if (this.map.isKingdomRoad(cell)) return 'Este camino pertenece al reino y no puede demolerse.';
    if (this.map.isProtectedConstruction(cell)) {
      return type === 'villageCenter' ? 'El Centro de Aldea está protegido.' : 'La construcción está protegida.';
    }
    if (type === 'warehouse' || type === 'market') {
      const inventory = this.economy.storage.inventories.snapshot(buildingId(cell, type));
      if (inventory && inventory.used > 0) {
        return type === 'warehouse' ? 'El inventario debe estar vacío. Usa «Vaciar almacén» en el inspector.'
          : 'El inventario debe estar vacío.';
      }
    }
    return this.costIssue(this.demolitionCostAt(cell));
  }

  demolitionCostAt(cell: Cell): ConstructionCost {
    const span = this.map.bridgeAt(cell);
    return span ? { gold: demolitionCost.gold * bridgeCells(span).length, wood: 0 } : demolitionCost;
  }

  private removalTargetAt(cell: Cell): DemolitionTarget | null {
    const building = this.map.constructionAt(cell);
    if (building) return { cell: { ...building.cell }, kind: 'building', type: building.type };
    const tile = this.map.terrain.at(cell);
    return tile?.obstacle && !isProtectedGround(tile.ground)
      ? { cell: { ...cell }, kind: 'obstacle', type: tile.obstacle } : null;
  }

  get demolitionTarget(): DemolitionTarget | null { return this.demolition; }

  requestDemolition(cell: Cell): string | null {
    this.cancelBridge();
    this.cancelDemolition();
    const issue = this.demolitionIssue(cell);
    if (issue) return issue;
    this.demolition = this.removalTargetAt(cell);
    return null;
  }

  cancelDemolition(): void { this.demolition = null; }

  confirmDemolition(): string | null {
    const target = this.demolition;
    const current = target && this.removalTargetAt(target.cell);
    if (!target || current?.kind !== target.kind || current.type !== target.type) {
      this.cancelDemolition();
      return 'Selecciona una construcción para demoler o un obstáculo para limpiar.';
    }
    const issue = this.demolitionIssue(target.cell);
    if (issue) return issue;
    if (target.kind === 'obstacle') {
      if (!this.map.terrain.clear(target.cell, target.type)) return 'El obstáculo ya no está disponible.';
      if (!this.economy.payBuildingCost(clearingCosts[target.type], 'clearing', terrainAuditId(target.cell))) {
        throw new Error('A validated terrain clearing charge failed');
      }
      this.cancelDemolition();
      return null;
    }
    const cost = this.demolitionCostAt(target.cell);
    if (!this.map.remove(target.cell)) return 'La construcción ya no está disponible.';
    if (!this.economy.payBuildingCost(cost, 'demolition', buildingId(target.cell, target.type))) {
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
    this.beauty.recalculate(this.map, this.connections);
    this.economy.recalculate(this.map, this.connections, this.population);
    this.refreshWorkforce();
  }

  refreshWorkforce(): void {
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
        this.needs.currentAt(home.cell)!, unemployment, this.beauty.at(home.cell).score);
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
    if (populationChanged) this.refreshWorkforce();
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
          this.refreshWorkforce();
        }
      }
      this.voices.advance(this.simulatedTimeMs, () => this.needs.observations(this.population.residencesSnapshot), () => {
        const buildings = this.map.occupiedCells();
        return {
          unemployment: this.population.unemploymentRate, tax: this.economy.currentTaxPolicy,
          waiting: this.population.waitingImmigrants,
          hasMarket: buildings.some(({ type }) => type === 'market'),
          hasWarehouse: buildings.some(({ type }) => type === 'warehouse'),
          hasRoad: buildings.some(({ type }) => type === 'road'),
          beautyAt: (cell: Cell) => this.beauty.at(cell),
          lacksHousingBeauty: (cell: Cell) =>
            this.beauty.at(cell).score < housingRules.minimumBeauty[this.population.housingLevelAt(cell)],
        };
      });
      advanced = true;
    }
    return advanced;
  }
}
