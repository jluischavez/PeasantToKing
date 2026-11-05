import { formatNumber } from '../formatNumber';
import { populationRules } from '../population/Population';
import type { Population } from '../population/Population';
import type { CityWellbeing } from '../population/Wellbeing';
import { needIds } from '../population/HouseholdNeeds';
import type { HouseholdNeeds } from '../population/HouseholdNeeds';

const needNames = { food: 'comida', wood: 'madera', water: 'agua' } as const;
import { perGameHour } from '../simulation/GameTime';

export class PopulationPanel {
  private readonly total = document.querySelector<HTMLElement>('#population-total')!;
  private readonly active = document.querySelector<HTMLElement>('#population-active')!;
  private readonly unemploymentRate = document.querySelector<HTMLElement>('#unemployment-rate')!;
  private readonly attractiveness = document.querySelector<HTMLElement>('#migration-attractiveness')!;
  private readonly housing = document.querySelector<HTMLElement>('#housing-free')!;
  private readonly waiting = document.querySelector<HTMLElement>('#migration-waiting')!;
  private readonly happiness = document.querySelector<HTMLElement>('#city-happiness')!;
  private readonly wellbeing = document.querySelector<HTMLElement>('#city-wellbeing')!;
  private readonly wellbeingCounts = document.querySelector<HTMLElement>('#housing-wellbeing-counts')!;
  private readonly concerns = document.querySelector<HTMLElement>('#wellbeing-concerns')!;
  private readonly reason = document.querySelector<HTMLElement>('#migration-reason')!;
  private readonly capacity = document.querySelector<HTMLElement>('#residential-capacity')!;
  private readonly connected = document.querySelector<HTMLElement>('#connected-capacity')!;
  private readonly jobs = document.querySelector<HTMLElement>('#job-capacity')!;
  private readonly employed = document.querySelector<HTMLElement>('#workers-employed')!;
  private readonly unemployed = document.querySelector<HTMLElement>('#workers-unemployed')!;
  private readonly available = document.querySelector<HTMLElement>('#jobs-available')!;
  private readonly consumption = document.querySelector<HTMLElement>('#food-consumption')!;

  private readonly needs = Object.fromEntries(needIds.map(need =>
    [need, document.querySelector<HTMLElement>('#need-' + need)!]));
  private readonly priorityNeed = document.querySelector<HTMLElement>('#need-priority')!;
  private readonly shortage = document.querySelector<HTMLElement>('#food-shortage')!;

  constructor() {
    this.shortage.title = 'Comida que los hogares necesitaron y no recibieron desde el inicio de la partida.';
    this.active.title = `Participación laboral: ${populationRules.laborParticipationRate * 100} % de la población, redondeada hacia abajo.`;
    this.housing.title = 'Plazas libres en solares conectados por caminos.';
    this.attractiveness.title = 'Interés por vivir en la ciudad según el abastecimiento, el bienestar, el empleo y los impuestos.';
  }

  render(population: Population, attraction: number, city: CityWellbeing, reason: string, shortage: number,
    needs: ReturnType<HouseholdNeeds['summarize']>): void {
    for (const need of needIds) {
      this.needs[need].textContent = needs.percentages ? formatNumber(needs.percentages[need]) + ' %' : '—';
    }
    this.priorityNeed.textContent = needs.mainNeed
      ? 'Falta principalmente ' + needNames[needs.mainNeed] + ' · ' + formatNumber(needs.affected) + ' hab. afectados (est.)'
      : needs.percentages ? 'Necesidades cubiertas' : 'Sin datos de suministro';
    this.reason.textContent = reason;
    this.shortage.textContent = formatNumber(shortage);
    this.total.textContent = formatNumber(population.total);
    this.active.textContent = formatNumber(population.activePopulation);
    this.unemploymentRate.textContent = formatNumber(population.unemploymentRate * 100);
    this.attractiveness.textContent = formatNumber(attraction);
    this.housing.textContent = formatNumber(population.availableHousing);
    this.waiting.textContent = formatNumber(population.waitingImmigrants);
    this.waiting.title = 'Límite de la lista de espera: ' + population.waitingCapacity;
    this.happiness.textContent = formatNumber(city.happiness);
    this.wellbeing.textContent = city.state;
    this.wellbeingCounts.textContent = 'Viviendas satisfechas: ' + city.satisfied
      + ' · Inconformes: ' + city.dissatisfied + ' · En crisis: ' + city.crisis;
    this.concerns.hidden = city.concerns.length === 0;
    this.concerns.textContent = 'Principales causas de descontento: ' + city.concerns.join(' · ');
    this.capacity.textContent = formatNumber(population.residentialCapacity);
    this.connected.textContent = formatNumber(population.connectedCapacity);
    this.jobs.textContent = formatNumber(population.jobCapacity);
    this.employed.textContent = formatNumber(population.employed);
    this.unemployed.textContent = formatNumber(population.unemployed);
    this.available.textContent = formatNumber(population.availableJobs);
    this.consumption.textContent = formatNumber(perGameHour(population.foodConsumptionPerSecond));
  }
}
