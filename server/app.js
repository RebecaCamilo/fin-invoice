/* ============================================================
   app.js — montagem da aplicação Express

   createApp recebe a conexão já aberta e não escuta porta
   nenhuma: isso permite subir a aplicação inteira sobre um
   banco ":memory:" dentro de um teste, sem rede nem arquivo.
   ============================================================ */

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createUserRepository } from './repositories/users.js';
import { createIssuerRepository, createClientRepository } from './repositories/catalog.js';
import { createInvoiceRepository } from './repositories/invoices.js';
import { createAuthRouter } from './routes/auth.js';
import { createIssuerRouter, createClientRouter } from './routes/catalog.js';
import { createInvoiceRouter } from './routes/invoices.js';
import { cookieParser, createSessionLoader, errorHandler, requireAuth } from './middleware.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Monta a aplicação sobre a conexão informada.
 * @param {import('node:sqlite').DatabaseSync} db Banco já inicializado.
 * @returns {import('express').Express} Aplicação pronta para escutar ou testar.
 */
export function createApp(db) {
    const repositories = {
        users: createUserRepository(db),
        issuer: createIssuerRepository(db),
        clients: createClientRepository(db),
        invoices: createInvoiceRepository(db)
    };

    const app = express();

    app.disable('x-powered-by');
    app.use(express.json({ limit: '256kb' }));
    app.use(cookieParser);
    app.use(createSessionLoader(repositories.users));

    app.use('/api/auth', createAuthRouter(repositories));
    app.use('/api/issuer', requireAuth, createIssuerRouter(repositories));
    app.use('/api/clients', requireAuth, createClientRouter(repositories));
    app.use('/api/invoices', requireAuth, createInvoiceRouter(repositories));

    app.use('/api', (_request, response) => {
        response.status(404).json({ error: 'Resource not found.' });
    });

    // O motor de cálculo é servido ao navegador a partir da mesma fonte usada
    // pelo servidor, para que a prévia na tela e o valor gravado não divirjam.
    app.use('/shared', express.static(join(ROOT, 'shared')));
    app.use(express.static(join(ROOT, 'public')));

    app.use(errorHandler);

    return app;
}
