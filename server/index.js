/* ============================================================
   index.js — bootstrap do servidor

   Único arquivo que decide porta e caminho do banco. Mantê-lo
   separado de app.js é o que permite testar a aplicação sem
   abrir socket nem tocar no arquivo de produção.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createApp } from './app.js';
import { createDatabase } from './db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DATABASE_PATH ?? join(ROOT, 'data', 'fininvoice.db');

const db = createDatabase(DB_PATH);
const server = createApp(db).listen(PORT, () => {
    console.log(`FinInvoice running at http://localhost:${PORT}`);
    console.log(`Database: ${DB_PATH}`);
});

/** Fecha conexão e socket antes de sair, para não deixar o arquivo WAL travado. */
function shutdown() {
    server.close(() => {
        db.close();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
