export class CityTabs {
  private readonly buttons = [...document.querySelectorAll<HTMLButtonElement>('#city-tabs [role="tab"]')];
  private readonly scroll = new Map<HTMLElement, number>();
  private readonly events = new AbortController();

  constructor(onChange: () => void) {
    const options = { signal: this.events.signal };
    const select = (active: HTMLButtonElement) => {
      if (active.getAttribute('aria-selected') === 'true') return;
      for (const button of this.buttons) {
        const selected = active === button;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        const pane = document.getElementById(button.getAttribute('aria-controls')!)!;
        if (!pane.hidden) this.scroll.set(pane, pane.scrollTop);
        pane.hidden = !selected;
        if (selected) pane.scrollTop = this.scroll.get(pane) ?? 0;
      }
      onChange();
    };
    for (const [index, button] of this.buttons.entries()) {
      button.addEventListener('click', () => select(button), options);
      button.addEventListener('keydown', event => {
        const length = this.buttons.length;
        const positions = { ArrowLeft: (index + length - 1) % length, ArrowRight: (index + 1) % length, Home: 0, End: length - 1 };
        const next = positions[event.key as keyof typeof positions];
        if (next === undefined) return;
        event.preventDefault();
        this.buttons[next].focus();
        select(this.buttons[next]);
      }, options);
    }
  }

  destroy(): void { this.events.abort(); }
}
