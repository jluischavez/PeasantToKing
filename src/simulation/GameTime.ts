export const gameTimeRules = {
  secondsPerHour: 25,
  hoursPerDay: 24,
  daysPerYear: 12,
  dayStartHour: 6,
  nightStartHour: 18,
} as const;

export const simulatedMsPerGameHour = gameTimeRules.secondsPerHour * 1000;

export function perGameHour(ratePerSecond: number): number {
  return ratePerSecond * gameTimeRules.secondsPerHour;
}

export function gameMinutesForSeconds(seconds: number): number {
  return seconds * 60 / gameTimeRules.secondsPerHour;
}

export function gameTimeAt(simulatedMs: number) {
  const minutes = Math.floor(simulatedMs * 60 / simulatedMsPerGameHour);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / gameTimeRules.hoursPerDay);
  const hour = hours % gameTimeRules.hoursPerDay;
  return {
    year: 1 + Math.floor(days / gameTimeRules.daysPerYear),
    day: 1 + days % gameTimeRules.daysPerYear,
    hour,
    minute: minutes % 60,
    daylight: hour >= gameTimeRules.dayStartHour && hour < gameTimeRules.nightStartHour,
  };
}

export function formatGameTime(time: ReturnType<typeof gameTimeAt>): string {
  const hour = String(time.hour).padStart(2, '0');
  const minute = String(time.minute).padStart(2, '0');
  return `Año ${time.year} · Día ${time.day} · ${hour}:${minute}`;
}
