export const taxRules = {
  baseCentsPerResident: 100,
  defaultPolicy: 'normal',
} as const;

export const taxPolicies = {
  low: { label: 'Bajos', percent: 5, migrationModifier: 10 },
  normal: { label: 'Normales', percent: 10, migrationModifier: 0 },
  high: { label: 'Altos', percent: 20, migrationModifier: -20 },
} as const;

export type TaxPolicy = keyof typeof taxPolicies;
