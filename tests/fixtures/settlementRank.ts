import { settlementRanks } from '../../src/simulation/SettlementProgress.ts';
import type { SettlementRank } from '../../src/simulation/SettlementProgress.ts';
import type { SettlementSimulation } from '../../src/simulation/SettlementSimulation.ts';

export function setFixtureRank(simulation: SettlementSimulation, rank: SettlementRank): void {
  const steps = settlementRanks.slice(1, settlementRanks.indexOf(rank) + 1) as ('pueblo' | 'villa')[];
  simulation.progress.restoreState({ rank, chapters: {}, recognitions: steps.map(rank => ({ rank, timeMs: 0 })) },
    simulation.simulatedTimeMs);
}
