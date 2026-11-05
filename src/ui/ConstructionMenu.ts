import { formatNumber } from '../formatNumber';
import { constructionNames, isConstructionType } from '../map/ConstructionMap';
import type { ConstructionType } from '../map/ConstructionMap';
import { constructionCosts, demolitionCost } from '../map/ConstructionCosts';
import type { ConstructionCost } from '../map/ConstructionCosts';

const categories = {
  housing: { label: 'Viviendas', icon: '⌂' },
  roads: { label: 'Caminos', icon: '═' },
  agriculture: { label: 'Agricultura', icon: '🌾' },
  resources: { label: 'Recursos', icon: '♣' },
  storage: { label: 'Almacenamiento', icon: '▣' },
  economy: { label: 'Economía', icon: '◈' },
  services: { label: 'Servicios', icon: '✦' },
} as const;
type Category = keyof typeof categories;

const categoryFor: Readonly<Record<ConstructionType, Category>> = {
  house: 'housing', road: 'roads', farm: 'agriculture', lumberjack: 'resources',
  warehouse: 'storage', market: 'economy', villageCenter: 'services', well: 'services',
};

export type ConstructionMode = ConstructionType | 'demolish' | null;

export function formatCost(cost: ConstructionCost): string {
  const parts = [];
  if (cost.gold > 0) parts.push(formatNumber(cost.gold) + ' oro');
  if (cost.wood > 0) parts.push(formatNumber(cost.wood) + ' madera');
  return parts.join(' + ') || 'gratis';
}

export class ConstructionMenu {
  private readonly root = document.querySelector<HTMLElement>('#construction-menu')!;
  private readonly status = document.querySelector<HTMLElement>('#construction-status')!;
  private readonly choices = new Map<Exclude<ConstructionMode, null>, HTMLButtonElement>();
  private readonly cancel = this.root.querySelector<HTMLButtonElement>('[data-construction="cancel"]')!;
  private readonly categories = new Map<Category, HTMLButtonElement>();
  private readonly buttons = this.root.querySelector<HTMLElement>('.construction-buttons')!;
  private category: Category = 'services';
  private readonly onClick: (event: MouseEvent) => void;

  constructor(onChange: (mode: ConstructionMode) => void) {
    const categoryBar = this.root.querySelector('#construction-categories')!;
    for (const category of Object.keys(categories) as Category[]) {
      const { icon, label } = categories[category];
      const button = document.createElement('button');
      const symbol = document.createElement('span');
      symbol.textContent = icon;
      symbol.setAttribute('aria-hidden', 'true');
      button.type = 'button';
      button.dataset.category = category;
      button.append(symbol, ' ', label);
      categoryBar.append(button);
      this.categories.set(category, button);
    }
    for (const type of Object.keys(constructionNames) as ConstructionType[]) {
      this.addChoice(type, constructionNames[type], constructionCosts[type]);
    }
    this.addChoice('demolish', 'Demoler', demolitionCost);
    this.onClick = (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!target || target.disabled) return;
      const category = target.dataset.category as Category | undefined;
      if (category && this.categories.has(category)) {
        if (category !== this.category) {
          this.renderCategory(category);
          this.renderMode(null);
          onChange(null);
        }
        return;
      }
      const value = target.dataset.construction;
      if (!isConstructionType(value) && value !== 'demolish' && value !== 'cancel') return;
      const mode = value === 'cancel' ? null : value;
      this.renderMode(mode);
      onChange(mode);
    };
    this.root.addEventListener('click', this.onClick);
    this.renderCategory(this.category);
    this.renderMode(null);
  }

  private addChoice(type: Exclude<ConstructionMode, null>, name: string, cost: ConstructionCost): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.construction = type;
    const price = document.createElement('span');
    price.className = 'construction-cost';
    price.textContent = formatCost(cost);
    const label = document.createElement('span');
    label.textContent = name;
    if (type === 'demolish') {
      this.cancel.before(button);
    } else {
      const thumbnail = document.createElement('span');
      thumbnail.className = 'construction-thumbnail';
      thumbnail.hidden = true;
      thumbnail.setAttribute('aria-hidden', 'true');
      button.append(thumbnail);
      this.buttons.append(button);
    }
    button.append(label, price);
    this.choices.set(type, button);
  }

  private renderCategory(category: Category): void {
    this.category = category;
    for (const [key, button] of this.categories) {
      button.setAttribute('aria-pressed', String(key === category));
      if (key === category) button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    for (const [type, button] of this.choices) {
      button.hidden = type !== 'demolish' && categoryFor[type] !== category;
    }
  }

  renderMode(mode: ConstructionMode): void {
    this.cancel.disabled = mode === null;
    for (const [type, button] of this.choices) {
      button.setAttribute('aria-pressed', String(type === mode));
    }
    this.showStatus(mode === 'demolish' ? 'Selecciona una construcción para demoler y confirma en el inspector.'
      : mode ? constructionNames[mode] + ' · Verde: puedes construir. Rojo: casilla no disponible o recursos insuficientes.'
        : 'Selecciona un tipo de construcción.');
  }

  showStatus(message: string): void {
    if (this.status.textContent !== message) this.status.textContent = message;
  }

  renderCosts(costIssue: (cost: ConstructionCost) => string | null): void {
    for (const [type, button] of this.choices) {
      const issue = costIssue(type === 'demolish' ? demolitionCost : constructionCosts[type]);
      button.toggleAttribute('data-unaffordable', issue !== null);
      button.title = issue ?? '';
      if (issue) button.setAttribute('aria-label', button.textContent + '. ' + issue);
      else button.removeAttribute('aria-label');
    }
  }

  disableVillageCenter(): void {
    this.choices.get('villageCenter')!.disabled = true;
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    for (const button of this.choices.values()) button.remove();
    for (const button of this.categories.values()) button.remove();
  }
}
