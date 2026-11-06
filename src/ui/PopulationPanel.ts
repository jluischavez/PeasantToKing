import { formatNumber } from '../formatNumber';
import { populationRules } from '../population/Population';
import type { Population } from '../population/Population';
import type { CityWellbeing } from '../population/Wellbeing';
import { needIds } from '../population/HouseholdNeeds';
import type { HouseholdNeeds } from '../population/HouseholdNeeds';
import { perGameHour } from '../simulation/GameTime';
import { setText } from './domText';

const needNames = { food: 'comida', wood: 'madera', water: 'agua' } as const;

export class PopulationPanel {
  private readonly total = document.querySelector<HTMLElement>('#population-total')!;
  private readonly totalInNeeds = document.getElementById('needs-population-total')!;
  private readonly active = document.querySelector<HTMLElement>('#population-active')!;
  private readonly unemploymentRate = document.querySelector<HTMLElement>('#unemployment-rate')!;
  private readonly attractiveness = document.querySelector<HTMLElement>('#migration-attractiveness')!;
  private readonly housing = document.querySelector<HTMLElement>('#housing-free')!;
  private readonly waiting = document.querySelector<HTMLElement>('#migration-waiting')!;
  private readonly happiness = document.querySelector<HTMLElement>('#city-happiness')!;
  private readonly wellbeing = document.querySelector<HTMLElement>('#city-wellbeing')!;
  private readonly beauty = document.getElementById('city-beauty')!;
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
  private readonly coverage = Object.fromEntries(needIds.map(need =>
    [need, document.querySelector<HTMLProgressElement>('#coverage-' + need)!]));
  private readonly priorityNeed = document.querySelector<HTMLElement>('#need-priority')!;
  private readonly shortage = document.querySelector<HTMLElement>('#food-shortage')!;

  constructor() {
    this.shortage.title = 'Comida que los hogares necesitaron y no recibieron desde el inicio de la partida.';
    this.active.title = `Participación laboral: ${populationRules.laborParticipationRate * 100} % de la población, redondeada hacia abajo.`;
    this.housing.title = 'Plazas libres en solares conectados por caminos.';
    this.attractiveness.title = 'Interés por vivir en la ciudad según el abastecimiento, el bienestar, el empleo y los impuestos.';
  }

  render(population: Population, attraction: number, city: CityWellbeing, reason: string, shortage: number,
    needs: ReturnType<HouseholdNeeds['summarize']>, beauty?: number): void {
    for (const need of needIds) {
      const percent = needs.percentages?.[need];
      setText(this.needs[need], percent === undefined ? '—' : formatNumber(percent) + ' %');
      const meter = this.coverage[need];
      if (percent === undefined) {
        if (meter.hasAttribute('value')) meter.removeAttribute('value');
      } else if (!meter.hasAttribute('value') || meter.value !== percent) meter.value = percent;
    }
    setText(this.priorityNeed, needs.mainNeed
      ? 'Falta principalmente ' + needNames[needs.mainNeed] + ' · ' + formatNumber(needs.affected) + ' hab. afectados (est.)'
      : needs.percentages ? 'Necesidades cubiertas' : 'Sin datos de suministro');
    setText(this.reason, reason);
    setText(this.shortage, formatNumber(shortage));
    const total = formatNumber(population.total);
    setText(this.total, total);
    setText(this.totalInNeeds, total);
    setText(this.active, formatNumber(population.activePopulation));
    setText(this.unemploymentRate, formatNumber(population.unemploymentRate * 100));
    setText(this.attractiveness, formatNumber(attraction));
    setText(this.housing, formatNumber(population.availableHousing));
    setText(this.waiting, formatNumber(population.waitingImmigrants));
    this.waiting.title = 'Límite de la lista de espera: ' + population.waitingCapacity;
    setText(this.happiness, formatNumber(city.happiness));
    setText(this.wellbeing, city.state + ' · ' + formatNumber(city.happiness) + '/100');
    setText(this.beauty, beauty === undefined ? '—' : formatNumber(beauty) + '/100');
    setText(this.wellbeingCounts, 'Viviendas satisfechas: ' + city.satisfied
      + ' · Inconformes: ' + city.dissatisfied + ' · En crisis: ' + city.crisis);
    this.concerns.hidden = city.concerns.length === 0;
    setText(this.concerns, 'Principales causas de descontento: ' + city.concerns.join(' · '));
    setText(this.capacity, formatNumber(population.residentialCapacity));
    setText(this.connected, formatNumber(population.connectedCapacity));
    setText(this.jobs, formatNumber(population.jobCapacity));
    setText(this.employed, formatNumber(population.employed));
    setText(this.unemployed, formatNumber(population.unemployed));
    setText(this.available, formatNumber(population.availableJobs));
    setText(this.consumption, formatNumber(perGameHour(population.foodConsumptionPerSecond)));
  }
}
