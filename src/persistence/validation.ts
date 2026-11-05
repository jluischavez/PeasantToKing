export function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Datos de partida inválidos.');
}

export function whole(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function range(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function label(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 300;
}

export function list(value: unknown, limit: number): asserts value is readonly unknown[] {
  check(Array.isArray(value) && value.length <= limit);
}

export function restoreEntries<K, V>(target: Map<K, V>, entries: readonly (readonly [K, V])[], limit: number,
  valid: (key: K, value: V) => boolean): void {
  list(entries, limit);
  target.clear();
  for (const entry of entries) {
    check(Array.isArray(entry) && entry.length === 2);
    const [key, value] = entry;
    check(!target.has(key) && valid(key, value));
    target.set(key, value);
  }
}

