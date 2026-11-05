import { constructionNames, isConstructionType } from '../map/ConstructionMap';
import type { ConstructionType } from '../map/ConstructionMap';

export class ConstructionMenu {
  private readonly root = document.querySelector<HTMLElement>('#construction-menu')!;
  private readonly status = document.querySelector<HTMLElement>('#construction-status')!;
  private readonly onClick: (event: MouseEvent) => void;

  constructor(onChange: (type: ConstructionType | null) => void) {
    const buttons = this.root.querySelector<HTMLElement>('.construction-buttons')!;
    const cancel = buttons.querySelector<HTMLButtonElement>('[data-construction="cancel"]')!;
    for (const [type, name] of Object.entries(constructionNames)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.construction = type;
      button.textContent = name;
      button.setAttribute('aria-pressed', 'false');
      buttons.insertBefore(button, cancel);
    }
    this.onClick = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement) || target.disabled) return;
      const value = target.dataset.construction;
      if (!isConstructionType(value) && value !== 'cancel') return;
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
      : 'Selecciona un tipo de construcción.';
  }

  disableVillageCenter(): void {
    this.root.querySelector<HTMLButtonElement>('[data-construction="villageCenter"]')!.disabled = true;
    this.render(null);
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.querySelectorAll('[data-construction]:not([data-construction="cancel"])')
      .forEach((button) => button.remove());
  }
}
