import type { SettlementSimulation } from '../simulation/SettlementSimulation';
import type { KingdomMission } from '../simulation/KingdomEvents';
import { missionDate, missionDecisionNames, missionNarrative, missionObjective, missionProgress,
  missionReward, missionResult, missionRisk, missionStatusNames } from '../story/KingdomMissionText';
import type { ChapterDialog, NarrativeChoice } from './ChapterDialog';
import { simulatedMsPerGameHour } from '../simulation/GameTime';
import { setText } from './domText';

export class KingdomEventsPanel {
  private readonly current = document.getElementById('kingdom-current')!;
  private readonly completed = document.getElementById('kingdom-completed')!;
  private readonly history = document.getElementById('kingdom-history')!;
  private readonly schedule = document.getElementById('kingdom-schedule')!;
  private readonly events = new AbortController();
  private currentId = '';
  private fields = new Map<string, HTMLElement>();
  private historyView = '';

  constructor(private readonly simulation: SettlementSimulation, private readonly dialog: ChapterDialog,
    private readonly changed: () => void) {
    this.current.replaceChildren();
    this.completed.replaceChildren();
    this.history.replaceChildren();
    const open = (event: Event) => {
      const id = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-mission]')?.dataset.mission;
      const mission = [simulation.kingdomEvents.current, ...simulation.kingdomEvents.history].find(mission => mission?.id === id);
      if (mission) this.open(mission);
    };
    for (const root of [this.current, this.completed, this.history]) root.addEventListener('click', open, { signal: this.events.signal });
  }

  open(mission: Readonly<KingdomMission>): void {
    const choices: NarrativeChoice[] = [];
    const pending = mission.status === 'available' || mission.status === 'active';
    const decide = (choice: 'accept' | 'fulfill' | 'reject' | 'defer') => {
      const applied = this.simulation.decideMission(mission.id, choice);
      this.changed();
      return applied;
    };
    for (const option of this.simulation.kingdomEvents.options(mission.id)) {
      const labels = { accept: 'Aceptar misión', fulfill: mission.objective.kind === 'reward' ? 'Recibir recompensa' : 'Entregar ahora',
        reject: 'Rechazar · ' + mission.rejectFavor + ' favor', defer: 'Decidir más tarde' };
      choices.push({ label: labels[option.choice], disabled: !option.enabled, run: () => decide(option.choice) });
    }
    this.dialog.openEvent({ title: mission.title, text: missionNarrative(mission)
      + (pending ? '' : '\n\n' + missionStatusNames[mission.status] + ' · ' + missionDate(mission.resolvedAt!)) }, choices);
  }

  render(): void {
    const engine = this.simulation.kingdomEvents, mission = engine.current;
    setText(this.schedule, this.simulation.crown.defeated ? 'La partida ha terminado.'
      : mission ? 'Una misión pendiente. Las nuevas peticiones esperan a que se resuelva.'
      : 'Próxima oportunidad de acontecimiento · ' + missionDate(engine.nextAt));
    if (this.currentId !== (mission?.id ?? 'none')) {
      this.currentId = mission?.id ?? 'none';
      this.fields.clear();
      this.current.replaceChildren();
      if (mission) {
        const card = document.createElement('article');
        card.className = 'mission-card';
        const title = document.createElement('h4');
        title.textContent = mission.title;
        card.append(title);
        for (const name of ['description', 'status', 'objective', 'progress', 'deadline', 'reward', 'risk']) {
          const field = document.createElement('p');
          field.className = 'panel-note';
          this.fields.set(name, field);
          card.append(field);
        }
        card.append(this.button(mission));
        this.current.append(card);
      } else this.current.textContent = 'No hay misiones pendientes.';
    }
    if (mission) {
      const remaining = Math.max(0, Math.ceil((mission.deadline - this.simulation.simulatedTimeMs) / simulatedMsPerGameHour));
      const values = { description: mission.story.slice(0, 160) + '…', status: missionStatusNames[mission.status],
        objective: missionObjective(mission.objective), progress: 'Progreso · ' + missionProgress(mission),
        deadline: 'Vence · ' + missionDate(mission.deadline) + ' · Quedan ' + remaining + ' h del juego',
        reward: 'Recompensa · ' + missionReward(mission), risk: missionRisk(mission) };
      for (const [key, value] of Object.entries(values)) setText(this.fields.get(key)!, value);
    }
    const view = engine.history.length + ':' + engine.history.at(-1)?.id;
    if (view === this.historyView) return;
    this.historyView = view;
    this.completed.replaceChildren(...engine.history.filter(mission => mission.status === 'completed').reverse().map(mission => {
      const item = document.createElement('li');
      item.append(mission.title + ' · Completada · ' + missionResult(mission) + ' · ' + missionDate(mission.resolvedAt!), this.button(mission));
      return item;
    }));
    this.history.replaceChildren(...[...engine.history].reverse().map(mission => {
      const item = document.createElement('li');
      item.append(mission.title + ' · ' + missionStatusNames[mission.status] + ' · ' + missionDate(mission.resolvedAt!)
        + ' · ' + missionResult(mission));
      const decisions = document.createElement('p');
      decisions.className = 'panel-note';
      decisions.textContent = mission.decisions.map(decision => missionDecisionNames[decision.choice] + ' · ' + missionDate(decision.timeMs)).join(' · ')
        || 'Sin respuesta antes del plazo.';
      item.append(decisions, this.button(mission));
      return item;
    }));
  }

  private button(mission: Readonly<KingdomMission>): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mission = mission.id;
    button.textContent = 'Abrir detalles';
    button.setAttribute('aria-label', 'Abrir detalles de ' + mission.title);
    button.setAttribute('aria-haspopup', 'dialog');
    return button;
  }

  destroy(): void { this.events.abort(); }
}
