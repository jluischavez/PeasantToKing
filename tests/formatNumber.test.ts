import assert from 'node:assert/strict';
import { test } from 'vitest';
import { formatNumber } from '../src/formatNumber.ts';
import { EconomicHistory } from '../src/economy/EconomicHistory.ts';
import { Inventories, unitsPerResource } from '../src/economy/Inventories.ts';
import { Treasury } from '../src/economy/Treasury.ts';

test('Spanish number labels use up to two decimals, including negative balances and zero', () => {
  assert.equal(formatNumber(840.6455000375), '840,65');
  assert.equal(formatNumber(839.6455000375), '839,65');
  assert.equal(formatNumber(12_345.6789), '12.345,68');
  assert.equal(formatNumber(-12_345.675), '-12.345,68');
  assert.equal(formatNumber(0.5), '0,5');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(-0.001), '0');
});

test('invalid and extreme values do not produce NaN, Infinity or scientific notation', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(formatNumber(value), '—');
  assert.equal(formatNumber(1e-15), '0');
  assert.equal(formatNumber(1e21), '1.000.000.000.000.000.000.000');
});

test('rounding a treasury label leaves the fine-grained balance and recorded debit intact', () => {
  const history = new EconomicHistory();
  const treasury = new Treasury(840.6455, history);
  for (let i = 0; i < 1000; i++) {
    treasury.payBuilding(1, 'construction', 'road:1,1');
    treasury.creditSale('market:0,0', 'house:0,1', 10 * unitsPerResource, 'food');
  }

  const debit = history.read('gold').at(-2)!;
  const { before, after } = debit.originBalance!;
  const scale = debit.unitScale ?? unitsPerResource;
  assert.equal(formatNumber(before / scale), '840,65');
  assert.equal(formatNumber(after / scale), '839,65');
  assert.equal(formatNumber(debit.units / scale), '1');
  assert.equal(before - after, debit.units);
  assert.equal(after / scale, 839.6455);
  assert.equal(treasury.gold, 840.6455);
});

test('formatting fractional food and wood in the history leaves both inventories exact', () => {
  const history = new EconomicHistory();
  const inventory = new Inventories(history);
  const access = { kind: 'warehouse', capacity: 300 * unitsPerResource, network: 'village', operational: true } as const;
  const goods = { food: unitsPerResource, wood: unitsPerResource };
  inventory.create('source', access, goods);
  inventory.create('destination', access);
  for (let i = 0; i < 1000; i++) {
    for (const product of ['food', 'wood'] as const) {
      assert.equal(inventory.transfer('source', 'destination', product, 1), true);
      const movement = history.read(product).at(-1)!;
      assert.equal(formatNumber(movement.units / unitsPerResource), '0,01');
      assert.equal(movement.originBalance!.before - movement.originBalance!.after, 1);
      assert.equal(movement.destinationBalance!.after - movement.destinationBalance!.before, 1);
      assert.equal(inventory.transfer('destination', 'source', product, 1), true);
    }
  }
  assert.deepEqual(inventory.snapshot('source')?.goods, goods);
  assert.deepEqual(inventory.snapshot('destination')?.goods, { food: 0, wood: 0 });
});
