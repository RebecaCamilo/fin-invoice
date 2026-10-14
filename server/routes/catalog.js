/* ============================================================
   routes/catalog.js — beneficiário (emissor) e clientes
   ============================================================ */

import { Router } from 'express';
import { REGIMES } from '../../shared/finance.js';
import { conflict, notFound, unprocessable } from '../errors.js';

const TEXT_FIELDS = ['document', 'email', 'phone', 'cep', 'street', 'number', 'district', 'city'];

function normalizeIssuer(body) {
    const name = String(body?.name ?? '').trim();
    const regime = String(body?.regime ?? 'SIMPLES').toUpperCase();

    if (!name) {
        throw unprocessable('Enter the payee name.');
    }
    if (!Object.hasOwn(REGIMES, regime)) {
        throw unprocessable('Invalid tax regime.');
    }

    return {
        name,
        regime,
        document: String(body?.document ?? '').trim(),
        email: String(body?.email ?? '').trim(),
        phone: String(body?.phone ?? '').trim(),
        address: String(body?.address ?? '').trim(),
        pixType: String(body?.pixType ?? 'CNPJ').trim(),
        pixKey: String(body?.pixKey ?? '').trim()
    };
}

function normalizeClient(body) {
    const name = String(body?.name ?? '').trim();
    const type = String(body?.type ?? 'PJ').toUpperCase();

    if (!name) {
        throw unprocessable('Enter the payer name.');
    }
    if (type !== 'PJ' && type !== 'PF') {
        throw unprocessable('Invalid payer type.');
    }

    const client = { name, type, state: String(body?.state ?? '').trim().toUpperCase().slice(0, 2) };
    TEXT_FIELDS.forEach((field) => {
        client[field] = String(body?.[field] ?? '').trim();
    });

    return client;
}

export function createIssuerRouter({ issuer }) {
    const router = Router();

    router.get('/', (_request, response) => {
        response.json({ issuer: issuer.get() });
    });

    router.put('/', (request, response, next) => {
        try {
            response.json({ issuer: issuer.save(normalizeIssuer(request.body)) });
        } catch (error) {
            next(error);
        }
    });

    return router;
}

export function createClientRouter({ clients }) {
    const router = Router();

    router.get('/', (_request, response) => {
        response.json({ clients: clients.list() });
    });

    router.post('/', (request, response, next) => {
        try {
            response.status(201).json({ client: clients.create(normalizeClient(request.body)) });
        } catch (error) {
            next(error);
        }
    });

    router.put('/:id', (request, response, next) => {
        try {
            const client = clients.update(request.params.id, normalizeClient(request.body));

            if (!client) {
                throw notFound('Client not found.');
            }
            response.json({ client });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:id', (request, response, next) => {
        try {
            if (!clients.find(request.params.id)) {
                throw notFound('Client not found.');
            }
            if (clients.isInUse(request.params.id)) {
                throw conflict('This client has issued invoices and cannot be deleted.');
            }

            clients.delete(request.params.id);
            response.status(204).end();
        } catch (error) {
            next(error);
        }
    });

    return router;
}
