/* ============================================================
   db.js — conexão SQLite e esquema

   Usa o módulo nativo node:sqlite (Node >= 22.5), portanto não
   há dependência nativa para compilar. Aceita ":memory:", o que
   permite subir um banco limpo e isolado por teste.
   ============================================================ */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    iterations    INTEGER NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Beneficiário único do MVP: linha fixa de id = 1.
CREATE TABLE IF NOT EXISTS issuer (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    name      TEXT NOT NULL DEFAULT '',
    document  TEXT NOT NULL DEFAULT '',
    regime    TEXT NOT NULL DEFAULT 'SIMPLES' CHECK (regime IN ('SIMPLES', 'MEI')),
    email     TEXT NOT NULL DEFAULT '',
    phone     TEXT NOT NULL DEFAULT '',
    address   TEXT NOT NULL DEFAULT '',
    pix_type  TEXT NOT NULL DEFAULT 'CNPJ',
    pix_key   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS clients (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL CHECK (type IN ('PJ', 'PF')),
    document   TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    phone      TEXT NOT NULL DEFAULT '',
    cep        TEXT NOT NULL DEFAULT '',
    street     TEXT NOT NULL DEFAULT '',
    number     TEXT NOT NULL DEFAULT '',
    district   TEXT NOT NULL DEFAULT '',
    city       TEXT NOT NULL DEFAULT '',
    state      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    number     TEXT NOT NULL,
    client_id  TEXT NOT NULL REFERENCES clients(id),
    issue_date TEXT NOT NULL,
    due_date   TEXT NOT NULL,
    notes      TEXT NOT NULL DEFAULT '',
    regime     TEXT NOT NULL,
    tax_rate   REAL NOT NULL,
    client_pays_grossup INTEGER NOT NULL DEFAULT 0,
    gross      REAL NOT NULL,
    tax        REAL NOT NULL,
    net        REAL NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga')),
    paid_at    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (owner_id, number)
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity   REAL NOT NULL,
    unit_price REAL NOT NULL,
    total      REAL NOT NULL
);

-- Numeração independente por usuário: cada beneficiário tem a própria série.
CREATE TABLE IF NOT EXISTS invoice_sequences (
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, year)
);

CREATE INDEX IF NOT EXISTS idx_invoices_owner ON invoices (owner_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

INSERT OR IGNORE INTO issuer (id) VALUES (1);
`;

/**
 * Abre (ou cria) o banco e aplica o esquema.
 * @param {string} [location] Caminho do arquivo ou ":memory:".
 * @returns {DatabaseSync} Conexão pronta para uso.
 */
export function createDatabase(location = ':memory:') {
    if (location !== ':memory:') {
        mkdirSync(dirname(location), { recursive: true });
    }

    const db = new DatabaseSync(location);
    db.exec(SCHEMA);

    const invoiceColumns = db.prepare('PRAGMA table_info(invoices)').all();
    if (!invoiceColumns.some((column) => column.name === 'client_pays_grossup')) {
        db.exec('ALTER TABLE invoices ADD COLUMN client_pays_grossup INTEGER NOT NULL DEFAULT 0');
    }

    return db;
}
