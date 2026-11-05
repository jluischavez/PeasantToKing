import type { Cell } from '../map/CellSelection';
import { autosaveMs, saveSlots } from '../persistence/SaveSlots.ts';
import type { SaveSlot, SaveSlots } from '../persistence/SaveSlots';
import { Session } from '../persistence/Session.ts';
import { setText } from './domText';

const dates = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });

export class SavePanel {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#save-dialog')!;
  private readonly select = document.querySelector<HTMLSelectElement>('#save-slot')!;
  private readonly message = document.getElementById('save-message')!;
  private readonly status = document.getElementById('save-status')!;
  private notice = 0;
  private readonly badge = document.getElementById('save-active-slot')!;
  private readonly events = new AbortController();
  private readonly timer: number;

  constructor(private readonly slots: SaveSlots, session: Session, selection: () => Cell | null,
    replace: (session: Session, selection: Cell | null) => void) {
    const options = { signal: this.events.signal };
    const onClick = (id: string, action: () => void) => {
      document.getElementById(id)!.addEventListener('click', action, options);
    };
    onClick('open-save-dialog', () => {
      this.dialog.showModal();
      this.run(() => this.refresh(this.slots.activeSlot ?? this.slot()));
    });
    onClick('save-game', () => this.run(() => {
      const slot = this.slot();
      const { raw } = this.slots.inspect(slot);
      if (this.slots.needsConfirmation(slot, raw) && !window.confirm('¿Sobrescribir la partida de la ranura ' + slot + '?')) return;
      this.slots.save(slot, raw, session, selection());
      this.report('Partida guardada en la ranura ' + slot + '.');
      this.refresh(slot);
    }));
    onClick('load-game', () => this.run(() => {
      const slot = this.slot();
      if (!window.confirm('¿Cargar la ranura ' + slot + '? Se perderá el progreso sin guardar de la partida activa.')) return;
      const game = this.slots.load(slot);
      this.dialog.close();
      this.report('Partida cargada de la ranura ' + slot + '.');
      replace(game.session, game.selection);
    }));
    onClick('new-game', () => this.run(() => {
      if (!window.confirm('¿Iniciar una nueva partida? Se perderá el progreso sin guardar de la partida activa.')) return;
      this.slots.detach();
      this.dialog.close();
      this.report('Nueva partida iniciada. Las ranuras guardadas se conservan.');
      replace(new Session(), null);
    }));

    this.timer = window.setInterval(() => this.run(() => {
      const slot = this.slots.autosave(session, selection());
      this.report(slot === null ? 'Autoguardado pendiente. Elige una ranura para guardar.'
        : 'Autoguardado completado en la ranura ' + slot + '.');
      if (this.dialog.open) this.refresh(this.slot());
    }), autosaveMs);
    this.updateBadge();
    if (this.status.textContent) this.hideNotice();
  }

  private slot(): SaveSlot {
    return saveSlots.find(slot => String(slot) === this.select.value) ?? 1;
  }

  private refresh(selected: SaveSlot): void {
    this.select.replaceChildren(...saveSlots.map(slot => {
      const { savedAt, corrupt } = this.slots.inspect(slot);
      const description = corrupt ? 'datos inválidos' : savedAt === null ? 'vacía' : dates.format(savedAt);
      return new Option('Ranura ' + slot + ' · ' + description, String(slot));
    }));
    this.select.value = String(selected);
  }

  private updateBadge(): void {
    setText(this.badge, this.slots.activeSlot ? 'Ranura ' + this.slots.activeSlot : 'Sin ranura');
  }

  private report(message: string, error = false): void {
    this.updateBadge();
    setText(this.message, message);
    setText(this.status, message);
    this.message.classList.toggle('save-error', error);
    this.status.classList.toggle('save-error', error);
    this.hideNotice();
  }

  private hideNotice(): void {
    window.clearTimeout(this.notice);
    this.notice = window.setTimeout(() => setText(this.status, ''), 8_000);
  }

  private run(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.report(error instanceof DOMException ? 'No se pudo acceder al guardado local. Revisa los permisos o el espacio del navegador.'
        : error instanceof Error ? error.message : 'No se pudo completar la operación.', true);
    }
  }

  destroy(): void {
    this.events.abort();
    window.clearInterval(this.timer);
    window.clearTimeout(this.notice);
    if (this.dialog.open) this.dialog.close();
  }
}

