/* ============================================================
   routes/invoices.js — ciclo de vida da cobrança

   Toda rota opera com request.user.id como escopo. O repositório
   compara o dono no WHERE, então uma fatura de outro usuário
   responde 404 — e não 403, para não confirmar que ela existe.
   ============================================================ */

import { Router } from 'express';
import { todayIso } from '../../shared/finance.js';
import { notFound, unprocessable } from '../errors.js';
import { priceInvoice } from '../services/invoices.js';

export function createInvoiceRouter({ invoices, clients, issuer }) {
    const router = Router();

    /** Valida o payload, confere o pagador e recalcula os totais no servidor. */
    function prepare(body) {
        const priced = priceInvoice(body, issuer.get());

        if (!clients.find(priced.clientId)) {
            throw unprocessable('The selected payer does not exist.');
        }
        return priced;
    }

    router.get('/', (request, response) => {
        response.json({ invoices: invoices.list(request.user.id) });
    });

    router.get('/next-number', (request, response) => {
        response.json({ number: invoices.peekNumber(request.user.id) });
    });

    router.get('/:id', (request, response, next) => {
        try {
            const invoice = invoices.find(request.user.id, request.params.id);

            if (!invoice) {
                throw notFound('Invoice not found.');
            }
            response.json({ invoice });
        } catch (error) {
            next(error);
        }
    });

    router.post('/', (request, response, next) => {
        try {
            response.status(201).json({ invoice: invoices.create(request.user.id, prepare(request.body)) });
        } catch (error) {
            next(error);
        }
    });

    router.put('/:id', (request, response, next) => {
        try {
            const invoice = invoices.update(request.user.id, request.params.id, prepare(request.body));

            if (!invoice) {
                throw notFound('Invoice not found.');
            }
            response.json({ invoice });
        } catch (error) {
            next(error);
        }
    });

    /** Confirma a liquidação (status "paga") ou reabre a cobrança. */
    router.patch('/:id/status', (request, response, next) => {
        try {
            const status = String(request.body?.status ?? '');

            if (status !== 'paga' && status !== 'pendente') {
                throw unprocessable('Invalid status: use "paga" or "pendente".');
            }

            const invoice = invoices.setStatus(
                request.user.id,
                request.params.id,
                status,
                status === 'paga' ? todayIso() : ''
            );

            if (!invoice) {
                throw notFound('Invoice not found.');
            }
            response.json({ invoice });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:id', (request, response, next) => {
        try {
            if (!invoices.delete(request.user.id, request.params.id)) {
                throw notFound('Invoice not found.');
            }
            response.status(204).end();
        } catch (error) {
            next(error);
        }
    });

    return router;
}
