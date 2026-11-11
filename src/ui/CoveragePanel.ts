import type { BuildingCoverage } from '../map/BuildingCoverage';
import { setText } from './domText';

export class CoveragePanel {
  private readonly root = document.getElementById('coverage-info')!;
  constructor() { this.render(null); }
  render(report: BuildingCoverage | null): void {
    this.root.hidden = !report;
    if (!report) return;
    setText(document.getElementById('coverage-summary')!, report.summary);
    setText(document.getElementById('coverage-restriction')!, report.restriction);
    setText(document.getElementById('coverage-legend')!, report.legend);
  }
}
