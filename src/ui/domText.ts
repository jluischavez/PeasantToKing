export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
