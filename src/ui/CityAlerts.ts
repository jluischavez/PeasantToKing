import { formatNumber } from '../formatNumber';
import type { ConstructionMap } from '../map/ConstructionMap';
import type { RoadConnections } from '../map/RoadConnections';
import type { HouseholdNeeds } from '../population/HouseholdNeeds';
import { setText } from './domText';
import { signedRate } from './FinanceSummary';

export class CityAlerts {
  private readonly count = document.getElementById('alert-count')!;
  private readonly list = document.getElementById('alert-list')!;
  private readonly empty = document.getElementById('alerts-empty')!;
  private lastView: string | null = null;
  private revision = -1;
  private disconnected = 0;

  render(map: ConstructionMap, roads: RoadConnections, needs: ReturnType<HouseholdNeeds['summarize']>,
    full: number, blocked: number, net: number): void {
    if (this.revision !== roads.revision) {
      this.revision = roads.revision;
      this.disconnected = 0;
      for (const { cell, type } of map.occupiedCells()) {
        if (type !== 'road' && type !== 'bridge' && !roads.isConnected(cell)) this.disconnected++;
      }
    }
    const alerts = [];
    const coverage = needs.percentages;
    if (coverage) {
      if (coverage.food < 99.995) alerts.push('Falta comida · ' + formatNumber(coverage.food) + ' % cubierto');
      if (coverage.wood < 99.995) alerts.push('Falta madera · ' + formatNumber(coverage.wood) + ' % cubierto');
      if (coverage.water < 99.995) alerts.push('Falta agua · ' + formatNumber(coverage.water) + ' % cubierto');
    }
    if (this.disconnected) alerts.push('Construcciones desconectadas · ' + formatNumber(this.disconnected));
    if (full || blocked) alerts.push('Almacenamiento · ' + formatNumber(full) + ' llenos, ' + formatNumber(blocked) + ' productores bloqueados');
    if (signedRate(net).startsWith('−')) alerts.push('Déficit estimado · ' + signedRate(net) + ' oro/h');

    const view = alerts.join('\n');
    if (view === this.lastView) return;
    this.lastView = view;
    setText(this.count, formatNumber(alerts.length));
    this.empty.hidden = alerts.length > 0;
    this.list.replaceChildren(...alerts.map(message => {
      const row = document.createElement('li');
      row.textContent = message;
      return row;
    }));
  }
}
