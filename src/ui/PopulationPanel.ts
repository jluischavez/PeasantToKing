import { populationRules } from '../population/Population';
import type { Population } from '../population/Population';

export class PopulationPanel {
  private readonly total = document.querySelector<HTMLElement>('#population-total')!;
  private readonly active = document.querySelector<HTMLElement>('#population-active')!;
  private readonly unemploymentRate = document.querySelector<HTMLElement>('#unemployment-rate')!;
  private readonly attractiveness = document.querySelector<HTMLElement>('#migration-attractiveness')!;
  private readonly reason = document.querySelector<HTMLElement>('#migration-reason')!;
  private readonly capacity = document.querySelector<HTMLElement>('#residential-capacity')!;
  private readonly connected = document.querySelector<HTMLElement>('#connected-capacity')!;
  private readonly jobs = document.querySelector<HTMLElement>('#job-capacity')!;
  private readonly employed = document.querySelector<HTMLElement>('#workers-employed')!;
  private readonly unemployed = document.querySelector<HTMLElement>('#workers-unemployed')!;
  private readonly available = document.querySelector<HTMLElement>('#jobs-available')!;
  private readonly consumption = document.querySelector<HTMLElement>('#food-consumption')!;

  constructor() {
    this.active.title = `Participación laboral: ${populationRules.laborParticipationRate * 100} % de la población, redondeada hacia abajo.`;
    this.attractiveness.title = `Las llegadas se detienen con ${populationRules.migration.stopUnemploymentRate * 100} % de desempleo, sin espacio conectado o sin abastecimiento de alimentos.`;
  }

  render(population: Population, food: number, supply: ReadonlyMap<string, number>, reason: string): void {
    this.reason.textContent = reason;
    this.total.textContent = String(population.total);
    this.active.textContent = String(population.activePopulation);
    this.unemploymentRate.textContent = (population.unemploymentRate * 100).toLocaleString('es', {
      maximumFractionDigits: 1,
    });
    this.attractiveness.textContent = String(population.migrationAttractiveness(food, supply));
    this.capacity.textContent = String(population.residentialCapacity);
    this.connected.textContent = String(population.connectedCapacity);
    this.jobs.textContent = String(population.jobCapacity);
    this.employed.textContent = String(population.employed);
    this.unemployed.textContent = String(population.unemployed);
    this.available.textContent = String(population.availableJobs);
    this.consumption.textContent = population.foodConsumptionPerSecond.toLocaleString('es', {
      minimumFractionDigits: 1, maximumFractionDigits: 1,
    });
  }
}
