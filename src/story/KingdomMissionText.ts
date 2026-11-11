import { formatNumber } from '../formatNumber.ts';
import { constructionNames } from '../map/ConstructionMap.ts';
import { productNames } from '../economy/Products.ts';
import { formatGameTime, gameTimeAt, simulatedMsPerGameHour as hour } from '../simulation/GameTime.ts';
import type { KingdomMission, Objective } from '../simulation/KingdomEvents';

export const missionStatusNames = { available: 'Disponible', active: 'Activa', completed: 'Completada',
  rejected: 'Rechazada', expired: 'Expirada' } as const;
export const missionDecisionNames = { accept: 'Aceptada', fulfill: 'Entrega o recompensa confirmada', reject: 'Rechazada',
  defer: 'Respuesta pospuesta' } as const;
export const missionDate = (timeMs: number) => formatGameTime(gameTimeAt(timeMs));
export const missionReward = (mission: Readonly<KingdomMission>) =>
  formatNumber(mission.reward.gold) + ' oro · hasta +' + mission.reward.favor + ' favor'
    + (mission.reward.food ? ' · ' + mission.reward.food + ' comida' : '')
    + (mission.reward.wood ? ' · ' + mission.reward.wood + ' madera' : '');
export const missionResult = (mission: Readonly<KingdomMission>) => mission.result
  ? 'Resultado · ' + formatNumber(mission.result.gold) + ' oro neto · ' + mission.result.favor + ' favor'
    + (mission.result.goldReceived !== undefined ? ' · Recompensa recibida: ' + mission.result.goldReceived + ' oro' : '')
    + (mission.result.materials ? (['food', 'wood'] as const).map(product => {
      const received = mission.result!.materials![product], pending = mission.status === 'completed'
        ? Math.max(0, (mission.reward[product] ?? 0) - received) : 0;
      return (received ? ' · Recibido: ' + formatNumber(received) + ' ' + productNames[product].toLowerCase() : '')
        + (pending ? ' · Pendiente de almacenar: ' + formatNumber(pending) + ' ' + productNames[product].toLowerCase() : '');
    }).join('') : '')
    + (mission.result.delivery ? ' · ' + mission.result.delivery.amount + ' de '
      + productNames[mission.result.delivery.product].toLowerCase() + ' entregados' : '') : '';
export const missionRisk = (mission: Readonly<KingdomMission>) =>
  'Rechazar ' + mission.rejectFavor + ' favor. Incumplir después de aceptar ' + mission.expireFavor
  + ' favor. Dejar pasar sin aceptar no tiene penalización.';

export function missionObjective(objective: Objective): string {
  switch (objective.kind) {
    case 'gold': return 'Entregar ' + objective.target + ' oro de tesorería.';
    case 'delivery': return 'Entregar ' + objective.target + ' de ' + productNames[objective.product].toLowerCase() + ' desde almacenes autorizados.';
    case 'wellbeing': return 'Mantener ' + formatNumber(objective.target / hour) + ' h consecutivas con felicidad ≥'
      + objective.happiness + ', belleza ≥' + objective.beauty + ', comida ≥' + objective.food + ' % y agua ≥' + objective.water + ' %.';
    case 'roads': return 'Mejorar ' + objective.target + ' nuevos tramos propios a '
      + (objective.level === 3 ? 'piedra' : 'grava') + ', conectados al Centro.';
    case 'building': return 'Añadir ' + objective.target + ' ' + constructionNames[objective.building].toLowerCase()
      + (objective.building === 'garden' ? ' (no necesita caminos).' : ' conectado al Centro.');
    case 'growth': return 'Ganar ' + objective.target + ' habitantes desde la aceptación y sostenerlos durante '
      + formatNumber(objective.holdMs / hour) + ' h con felicidad ≥' + objective.happiness + ' y comida y agua ≥90 %.';
    case 'trade': return 'Exportar ' + objective.target + ' de ' + productNames[objective.product].toLowerCase()
      + ' en viajes reales posteriores a la aceptación.';
    case 'reward': return 'Recibir el reconocimiento de la Corona.';
  }
}

export function missionProgress(mission: Readonly<KingdomMission>): string {
  const { objective } = mission;
  return objective.kind === 'wellbeing' ? formatNumber(mission.progress / hour) + ' / ' + formatNumber(objective.target / hour) + ' h'
    : formatNumber(mission.progress) + ' / ' + objective.target + (objective.kind === 'growth'
      ? ' habitantes · ' + formatNumber(mission.sustainedMs / hour) + ' / ' + formatNumber(objective.holdMs / hour) + ' h de bienestar' : '');
}

export function missionNarrative(mission: Readonly<KingdomMission>): string {
  return [mission.story, 'Petición voluntaria. Omitir la narración deja la respuesta pendiente.',
    'Objetivo\n' + missionObjective(mission.objective), 'Progreso\n' + missionProgress(mission),
    'Plazo\n' + missionDate(mission.deadline), 'Recompensa\n' + missionReward(mission),
    'Consecuencias\n' + missionRisk(mission), missionResult(mission)].filter(Boolean).join('\n\n');
}
