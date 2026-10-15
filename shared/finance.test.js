import test from 'node:test';
import assert from 'node:assert/strict';
import { totals } from './finance.js';

test('grosses up the target payout to preserve it after a 6% deduction', () => {
    const result = totals([{ quantity: 1, unitPrice: 10000 }], 'SIMPLES');

    assert.deepEqual(result, {
        rate: 6,
        gross: 10638.3,
        tax: 638.3,
        net: 10000,
        clientPaysGrossup: true
    });
});

test('does not add a gross-up for MEI', () => {
    const result = totals([{ quantity: 2, unitPrice: 5000 }], 'MEI');

    assert.deepEqual(result, {
        rate: 0,
        gross: 10000,
        tax: 0,
        net: 10000,
        clientPaysGrossup: true
    });
});

test('does not add a gross-up when the freelancer covers the estimated 6%', () => {
    const result = totals([{ quantity: 1, unitPrice: 10000 }], 'SIMPLES', false);

    assert.deepEqual(result, {
        rate: 6,
        gross: 10000,
        tax: 0,
        net: 10000,
        clientPaysGrossup: false
    });
});
