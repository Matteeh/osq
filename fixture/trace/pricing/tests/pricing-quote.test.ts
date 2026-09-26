import assert from 'node:assert/strict';
import { scenario } from '@matteeh/osq/testing';
import { type Quote, quote } from '../src/pricing/quote.js';

/** Dollars as written in the spec, in integer cents. */
function cents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}

scenario('pricing', 'Volume discount tiers', { covers: quote }, ({ run, each }) => {
  each('the unit price follows this table', (row) => {
    const result: Quote = run(Number(row.quantity));
    assert.equal(result.unitPrice, cents(row['unit price']));
  });
});

scenario(
  'pricing',
  'A percentage code comes off the tiered subtotal',
  { covers: quote },
  ({ run, then }) => {
    const result: Quote = run(200, 'SAVE10');
    then('the subtotal is 1800.00', () => assert.equal(result.subtotal, cents('1800.00')));
    then('the discount is 180.00', () => assert.equal(result.discount, cents('180.00')));
    then('the total is 1620.00', () => assert.equal(result.total, cents('1620.00')));
  },
);
