/* ============================================================
   services/invoices.js — validação e precificação da fatura

   O servidor NUNCA confia nos totais enviados pelo navegador:
   recalcula bruto, tributo e líquido a partir dos itens e do
   regime gravado no cadastro do beneficiário.
   ============================================================ */

import { lineTotal, totals } from '../../shared/finance.js';
import { unprocessable } from '../errors.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 50;

/** Normaliza e valida uma linha de serviço. */
function normalizeItem(raw, index) {
    const description = String(raw?.description ?? '').trim();
    const quantity = Number(raw?.quantity);
    const unitPrice = Number(raw?.unitPrice);

    if (!description) {
        throw unprocessable(`Enter a description for item ${index + 1}.`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw unprocessable(`The quantity of item ${index + 1} must be greater than zero.`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw unprocessable(`The unit price of item ${index + 1} is invalid.`);
    }

    const item = { description, quantity, unitPrice };
    return { ...item, total: lineTotal(item) };
}

/**
 * Valida o payload e devolve a fatura pronta para persistir, com os
 * totais recalculados no servidor.
 * @param {object} payload Corpo recebido na requisição.
 * @param {object} issuer Beneficiário cadastrado (define o regime).
 * @returns {object} Fatura normalizada.
 */
export function priceInvoice(payload, issuer) {
    const clientId = String(payload?.clientId ?? '').trim();
    const issueDate = String(payload?.issueDate ?? '').trim();
    const dueDate = String(payload?.dueDate ?? '').trim();
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];

    if (!clientId) {
        throw unprocessable('Select the invoice payer.');
    }
    if (!DATE_PATTERN.test(issueDate) || !DATE_PATTERN.test(dueDate)) {
        throw unprocessable('Enter the issue and due dates.');
    }
    if (dueDate < issueDate) {
        throw unprocessable('The due date cannot be earlier than the issue date.');
    }
    if (!rawItems.length) {
        throw unprocessable('Add at least one service item.');
    }
    if (rawItems.length > MAX_ITEMS) {
        throw unprocessable(`An invoice accepts at most ${MAX_ITEMS} items.`);
    }

    const items = rawItems.map(normalizeItem);
    const clientPaysGrossup = issuer.regime === 'SIMPLES' && payload?.clientPaysGrossup !== false;
    const computed = totals(items, issuer.regime, clientPaysGrossup);

    if (computed.gross <= 0) {
        throw unprocessable('The gross amount must be greater than zero.');
    }

    return {
        clientId,
        issueDate,
        dueDate,
        notes: String(payload?.notes ?? '').trim(),
        regime: issuer.regime,
        taxRate: computed.rate,
        clientPaysGrossup,
        gross: computed.gross,
        tax: computed.tax,
        net: computed.net,
        items
    };
}
