import type { Cell } from '../map/CellSelection';
import { constructionNames } from '../map/ConstructionMap';
import type { ConstructionType } from '../map/ConstructionMap';

export class SelectionPanel {
  private readonly coordinates = document.querySelector<HTMLElement>('#cell-coordinates')!;
  private readonly terrain = document.querySelector<HTMLElement>('#cell-terrain')!;
  private readonly status = document.querySelector<HTMLElement>('#cell-status')!;
  private readonly cancel = document.querySelector<HTMLButtonElement>('#cancel-selection')!;
  private readonly onCancel: () => void;

  constructor(onCancel: () => void) {
    this.onCancel = onCancel;
    this.cancel.addEventListener('click', onCancel);
    this.render(null);
  }

  render(cell: Cell | null, construction: ConstructionType | null = null, connected = false): void {
    this.coordinates.textContent = cell ? `X: ${cell.column} · Y: ${cell.row}` : 'X: — · Y: —';
    this.terrain.textContent = cell ? 'césped' : '—';
    this.status.textContent = cell
      ? (construction
        ? `ocupada — ${constructionNames[construction]} · ${connected ? 'Conectado' : 'Sin conexión'}`
        : 'disponible')
      : 'Sin selección';
    this.cancel.disabled = cell === null;
  }

  destroy(): void {
    this.cancel.removeEventListener('click', this.onCancel);
  }
}
