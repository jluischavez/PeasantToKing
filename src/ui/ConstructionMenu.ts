import { constructionNames } from '../map/ConstructionMap';
import type { ConstructionType } from '../map/ConstructionMap';

export class ConstructionMenu {
  private readonly root = document.querySelector<HTMLElement>('#construction-menu')!;
  private readonly status = document.querySelector<HTMLElement>('#construction-status')!;
  private readonly onClick: (event: MouseEvent) => void;

  constructor(onChange: (type: ConstructionType | null) => void) {
    this.onClick = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const value = target.dataset.construction;
      if (value !== 'house' && value !== 'road' && value !== 'cancel') return;
      const type = value === 'cancel' ? null : value;
      this.render(type);
      onChange(type);
    };
    this.root.addEventListener('click', this.onClick);
    this.render(null);
  }

  private render(type: ConstructionType | null): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-construction]').forEach((button) => {
      if (button.dataset.construction === 'cancel') {
        button.disabled = type === null;
      } else {
        button.setAttribute('aria-pressed', String(button.dataset.construction === type));
      }
    });
    this.status.textContent = type
      ? `${constructionNames[type]}: haz clic en una casilla disponible. Rojo: casilla ocupada.`
      : 'Selecciona Casa o Camino para construir.';
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
  }
}
