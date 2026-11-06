import { Session } from './Session.ts';
import { check, whole } from './validation.ts';
import type { Cell } from '../map/CellSelection';
import type { CameraView } from '../map/MapCamera';

export const saveSlots = [1, 2, 3] as const;
export type SaveSlot = typeof saveSlots[number];
export const autosaveMs = 60_000;
const version = 2;
const maxSaveLength = 2_000_000;
const tabKey = 'peasant-to-king:tab-session';
export const saveKey = (slot: SaveSlot) => 'peasant-to-king:save:' + slot;
type Backend = Pick<Storage, 'getItem' | 'setItem'>;
type Envelope = { version: number; savedAt: number; state: ReturnType<Session['saveState']> };
type ActiveSave = { slot: SaveSlot; raw: string };
type TabCheckpoint = Envelope & { active: ActiveSave | null };

function parse(raw: string): Envelope {
  check(raw.length <= maxSaveLength);
  const save = JSON.parse(raw) as Envelope;
  if (save?.version !== 1 && save?.version !== version) throw new Error('La versión del guardado no es compatible.');
  check(whole(save.savedAt, 1, 8.64e15) && save.state && typeof save.state === 'object');
  return save;
}

export class SaveSlots {
  private active: ActiveSave | null = null;

  constructor(private readonly backend: () => Backend = () => window.localStorage,
    private readonly tabBackend: () => Backend = () => window.sessionStorage) {}

  get activeSlot(): SaveSlot | null { return this.active?.slot ?? null; }
  detach(): void { this.active = null; }

  checkpointTab(session: Session, selection: Cell | null, camera: CameraView): void {
    try {
      const checkpoint = { version, savedAt: Date.now(), state: session.saveState(selection, camera), active: this.active };
      const raw = JSON.stringify(checkpoint);
      if (raw.length <= maxSaveLength) this.tabBackend().setItem(tabKey, raw);
    } catch {
      // Slot saves are independent of browser support for per-tab storage.
    }
  }

  resumeTab(): ReturnType<typeof Session.restore> | undefined {
    try {
      const raw = this.tabBackend().getItem(tabKey);
      if (!raw) return undefined;
      const { state, active } = parse(raw) as TabCheckpoint;
      const game = Session.restore(state);
      // A reload must not claim a slot another tab has changed.
      if (active && saveSlots.includes(active.slot) && typeof active.raw === 'string'
        && this.backend().getItem(saveKey(active.slot)) === active.raw) this.active = active;
      return game;
    } catch {
      return undefined;
    }
  }

  inspect(slot: SaveSlot) {
    const raw = this.backend().getItem(saveKey(slot));
    if (raw === null) return { raw, savedAt: null, corrupt: false };
    try {
      return { raw, savedAt: parse(raw).savedAt, corrupt: false };
    } catch {
      return { raw, savedAt: null, corrupt: true };
    }
  }

  needsConfirmation(slot: SaveSlot, raw: string | null): boolean {
    return raw !== null && (this.active?.slot !== slot || this.active.raw !== raw);
  }

  save(slot: SaveSlot, expected: string | null, session: Session, selection: Cell | null, camera?: CameraView): void {
    const backend = this.backend();
    if (backend.getItem(saveKey(slot)) !== expected) throw new Error('La ranura cambió. Revisa su contenido e inténtalo de nuevo.');
    const raw = JSON.stringify({ version, savedAt: Date.now(), state: session.saveState(selection, camera) } satisfies Envelope);
    if (raw.length > maxSaveLength) throw new Error('La partida supera el tamaño admitido.');
    backend.setItem(saveKey(slot), raw);
    this.active = { slot, raw };
  }

  load(slot: SaveSlot): ReturnType<typeof Session.restore> {
    const raw = this.backend().getItem(saveKey(slot));
    if (raw === null) throw new Error('La ranura está vacía.');
    let save: Envelope;
    try {
      save = parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('La partida está incompleta o dañada.');
      throw error;
    }
    let game: ReturnType<typeof Session.restore>;
    try {
      game = Session.restore(save.state);
    } catch {
      throw new Error('La partida está incompleta o dañada.');
    }
    this.active = { slot, raw };
    return game;
  }

  autosave(session: Session, selection: Cell | null, camera?: CameraView): SaveSlot | null {
    if (this.active) {
      const { slot, raw } = this.active;
      this.save(slot, raw, session, selection, camera);
      return slot;
    }
    const empty = saveSlots.find(slot => this.inspect(slot).raw === null);
    if (empty === undefined) return null;
    this.save(empty, null, session, selection, camera);
    return empty;
  }
}

