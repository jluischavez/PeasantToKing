import { populationRules } from '../population/Population.ts';
import type { ConstructionMap } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { Economy } from '../economy/Economy';
import type { Population } from '../population/Population';

export type SimulationSpeed = 1 | 2 | 3;

export class SettlementSimulation {
  private elapsedMs = 0;
  private isPaused = false;
  private multiplier: SimulationSpeed = 1;
  private immigrationSeconds = 0;
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

  setPaused(paused: boolean): void { this.isPaused = paused; }
  setSpeed(speed: SimulationSpeed): void { this.multiplier = speed; }

  recalculate(): void {
    this.connections.recalculate(this.map);
    this.economy.recalculate(this.map, this.connections, this.population);
    this.population.recalculate(this.map, this.connections, this.economy.laborContext(this.population));
    this.economy.recalculate(this.map, this.connections, this.population);
  }

  // One shared clock processes production, consumption and immigration in order.
  advance(deltaMs: number): boolean {
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
      this.immigrationSeconds++;
      if (this.immigrationSeconds === this.immigrationIntervalSeconds) {
        this.immigrationSeconds = 0;
        const supply = this.economy.immigrationSupply(this.population, populationRules.familySize,
          this.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond,
          populationRules.residentsPerPlot);
        if (this.population.immigrate(this.economy.availableFood, supply) > 0) {
          this.economy.recalculate(this.map, this.connections, this.population);
        }
      }
      advanced = true;
    }
    return advanced;
  }
}
