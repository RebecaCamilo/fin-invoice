/* ============================================================
   repositories/catalog.js — beneficiário (emissor) e clientes

   Ambos são compartilhados entre os perfis, por decisão de
   produto: a carteira de clientes pertence à operação, não ao
   operador. Só as faturas são segregadas por usuário.
   ============================================================ */

import { createId } from '../security.js';

const CLIENT_FIELDS = ['type', 'document', 'name', 'email', 'phone', 'cep',
    'street', 'number', 'district', 'city', 'state'];

function toClient(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        type: row.type,
        document: row.document,
        name: row.name,
        email: row.email,
        phone: row.phone,
        cep: row.cep,
        street: row.street,
        number: row.number,
        district: row.district,
        city: row.city,
        state: row.state,
        createdAt: row.created_at
    };
}

function toIssuer(row) {
    return {
        name: row.name,
        document: row.document,
        regime: row.regime,
        email: row.email,
        phone: row.phone,
        address: row.address,
        pixType: row.pix_type,
        pixKey: row.pix_key
    };
}

export function createIssuerRepository(db) {
    return {
        get() {
            return toIssuer(db.prepare('SELECT * FROM issuer WHERE id = 1').get());
        },

        save(issuer) {
            db.prepare(`
                UPDATE issuer SET name = ?, document = ?, regime = ?, email = ?,
                                  phone = ?, address = ?, pix_type = ?, pix_key = ?
                WHERE id = 1
            `).run(issuer.name, issuer.document, issuer.regime, issuer.email,
                issuer.phone, issuer.address, issuer.pixType, issuer.pixKey);

            return this.get();
        }
    };
}

export function createClientRepository(db) {
    return {
        list() {
            return db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all().map(toClient);
        },

        find(id) {
            return toClient(db.prepare('SELECT * FROM clients WHERE id = ?').get(String(id)));
        },

        create(input) {
            const id = createId('cli');
            const values = CLIENT_FIELDS.map((field) => input[field] ?? '');

            db.prepare(`
                INSERT INTO clients (id, type, document, name, email, phone, cep,
                                     street, number, district, city, state, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, ...values, new Date().toISOString());

            return this.find(id);
        },

        update(id, input) {
            const existing = this.find(id);

            if (!existing) {
                return null;
            }

            const values = CLIENT_FIELDS.map((field) => input[field] ?? existing[field] ?? '');

            db.prepare(`
                UPDATE clients SET type = ?, document = ?, name = ?, email = ?, phone = ?,
                                   cep = ?, street = ?, number = ?, district = ?, city = ?, state = ?
                WHERE id = ?
            `).run(...values, String(id));

            return this.find(id);
        },

        /**
         * O cliente está referenciado por alguma fatura, de qualquer usuário?
         * A varredura ignora o escopo de propósito: excluir um cliente
         * compartilhado quebraria o histórico de outro perfil.
         */
        isInUse(id) {
            return db.prepare('SELECT 1 FROM invoices WHERE client_id = ? LIMIT 1').get(String(id)) !== undefined;
        },

        delete(id) {
            db.prepare('DELETE FROM clients WHERE id = ?').run(String(id));
        }
    };
}
