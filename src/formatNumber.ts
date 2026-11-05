const spanishNumber = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const formatted = spanishNumber.format(value);
  return formatted === '-0' ? '0' : formatted;
}
