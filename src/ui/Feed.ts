export class Feed<T> {
  private readonly rows = new Map<number, { item: T; node: HTMLElement }>();

  constructor(private readonly pane: HTMLElement, private readonly list: HTMLElement) {
    this.list.replaceChildren();
  }

  render(items: readonly T[], keyOf: (item: T) => number, makeRow: (item: T) => HTMLElement,
    updateHeader?: () => void): void {
    const top = this.pane.scrollTop;
    const nextKeys = new Set(items.map(keyOf));
    const paneTop = top > 4 ? this.pane.getBoundingClientRect().top : 0;
    const anchor = top > 4 ? Array.from(this.list.children).find(node =>
      nextKeys.has(Number((node as HTMLElement).dataset.feedKey)) && node.getBoundingClientRect().bottom > paneTop
    ) as HTMLElement | undefined : undefined;
    const anchorKey = anchor?.dataset.feedKey;
    const offset = anchor ? anchor.getBoundingClientRect().top - paneTop : 0;

    updateHeader?.();
    for (const [key, row] of this.rows) {
      if (!nextKeys.has(key)) {
        row.node.remove();
        this.rows.delete(key);
      }
    }
    let cursor = this.list.firstChild;
    for (const item of items) {
      const key = keyOf(item);
      let row = this.rows.get(key);
      if (!row || row.item !== item) {
        const node = makeRow(item);
        node.dataset.feedKey = String(key);
        if (row?.node === cursor) cursor = cursor?.nextSibling ?? null;
        row?.node.remove();
        row = { item, node };
        this.rows.set(key, row);
      }
      if (row.node === cursor) cursor = cursor.nextSibling;
      else this.list.insertBefore(row.node, cursor);
    }

    const retained = anchorKey ? this.rows.get(Number(anchorKey))?.node : undefined;
    if (retained) {
      this.pane.scrollTop += retained.getBoundingClientRect().top - paneTop - offset;
    } else {
      this.pane.scrollTop = top;
    }
  }
}
