import assert from 'node:assert/strict';
import { test } from 'vitest';
import { financeSummary, signedRate } from '../src/ui/FinanceSummary.ts';

test('finance summary shows hourly sales, tax income and operating expenses', () => {
  assert.deepEqual(financeSummary({ food: 0.1, wood: 0.02 }, 0.12, 0.5, { wages: 0.5, maintenance: 0.25 }), {
    food: 2.5, wood: 0.5, taxes: 0.5, income: 3.5, expenses: 0.75, net: 2.75,
  });
});

test('balance labels use Spanish decimals, show signs and keep a rounded zero neutral', () => {
  assert.equal(signedRate(2.75), '+2,75');
  assert.equal(signedRate(-0.25), '−0,25');
  assert.equal(signedRate(-0.001), '0');
  assert.equal(signedRate(0), '0');
});

