import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { priceInvoice } from './invoices.js';

const issuer = { regime: 'SIMPLES' };
const invoice = {
    clientId: 'client-1',
    issueDate: '2026-10-14',
    dueDate: '2026-10-29',
    items: [{ description: 'Project', quantity: 1, unitPrice: 10000 }]
};

describe('priceInvoice', () => {
    it('prices an invoice with the client-paid gross-up enabled', () => {
        const priced = priceInvoice({ ...invoice, clientPaysGrossup: true }, issuer);

        assert.equal(priced.clientId, 'client-1');
        assert.equal(priced.issueDate, '2026-10-14');
        assert.equal(priced.dueDate, '2026-10-29');
        assert.equal(priced.clientPaysGrossup, true);
        assert.equal(priced.gross, 10638.3);
        assert.equal(priced.tax, 638.3);
        assert.equal(priced.net, 10000);
    });
    it('prices an invoice at the target payout when the freelancer covers the gross-up', () => {
        const priced = priceInvoice({ ...invoice, clientPaysGrossup: false }, issuer);

        assert.equal(priced.clientId, 'client-1');
        assert.equal(priced.issueDate, '2026-10-14');
        assert.equal(priced.dueDate, '2026-10-29');
        assert.equal(priced.clientPaysGrossup, false);
        assert.equal(priced.gross, 10000);
        assert.equal(priced.tax, 0);
        assert.equal(priced.net, 10000);
    });
    it('defaults older clients to charging the gross-up to preserve existing behavior', () => {
        const priced = priceInvoice(invoice, issuer);

        assert.equal(priced.clientId, 'client-1');
        assert.equal(priced.issueDate, '2026-10-14');
        assert.equal(priced.dueDate, '2026-10-29');
        assert.equal(priced.clientPaysGrossup, true);
        assert.equal(priced.gross, 10638.3);
        assert.equal(priced.tax, 638.3);
        assert.equal(priced.net, 10000);
    });
});
