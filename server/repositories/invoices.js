/* ============================================================
   repositories/invoices.js — faturas e itens de serviço

   FRONTEIRA DE ISOLAMENTO: toda consulta exige ownerId e o
   compara no WHERE. Nenhum método permite alcançar a fatura de
   outro usuário, nem por leitura, nem por escrita, nem por
   exclusão — mesmo que a rota acima esqueça de verificar.
   ============================================================ */

import { createId } from '../security.js';

function toInvoice(row, items) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        ownerId: row.owner_id,
        number: row.number,
        clientId: row.client_id,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        notes: row.notes,
        regime: row.regime,
        taxRate: row.tax_rate,
        clientPaysGrossup: Boolean(row.client_pays_grossup),
        gross: row.gross,
        tax: row.tax,
        net: row.net,
        status: row.status,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        items: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            total: item.total
        }))
    };
}

export function createInvoiceRepository(db) {
    const selectItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position');

    /** Executa a função dentro de uma transação. */
    function transaction(run) {
        db.exec('BEGIN');
        try {
            const result = run();
            db.exec('COMMIT');
            return result;
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    function replaceItems(invoiceId, items) {
        db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoiceId);

        const insert = db.prepare(`
            INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price, total)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        items.forEach((item, position) => {
            insert.run(invoiceId, position, item.description, item.quantity, item.unitPrice, item.total);
        });
    }

    return {

        /** Faturas do usuário informado, da mais recente para a mais antiga. */
        list(ownerId) {
            return db.prepare('SELECT * FROM invoices WHERE owner_id = ? ORDER BY created_at DESC')
                .all(String(ownerId))
                .map((row) => toInvoice(row, selectItems.all(row.id)));
        },

        /** Fatura do usuário informado, ou null quando não existe ou pertence a outro. */
        find(ownerId, id) {
            const row = db.prepare('SELECT * FROM invoices WHERE id = ? AND owner_id = ?')
                .get(String(id), String(ownerId));

            return row ? toInvoice(row, selectItems.all(row.id)) : null;
        },

        /** Próximo número da série do usuário, sem consumir o contador. */
        peekNumber(ownerId) {
            const year = new Date().getFullYear();
            const row = db.prepare('SELECT last_number FROM invoice_sequences WHERE owner_id = ? AND year = ?')
                .get(String(ownerId), year);

            return `FAT-${year}-${String((row?.last_number ?? 0) + 1).padStart(4, '0')}`;
        },

        /** Consome o contador da série do usuário e devolve o número gerado. */
        consumeNumber(ownerId) {
            const year = new Date().getFullYear();

            db.prepare(`
                INSERT INTO invoice_sequences (owner_id, year, last_number) VALUES (?, ?, 1)
                ON CONFLICT (owner_id, year) DO UPDATE SET last_number = last_number + 1
            `).run(String(ownerId), year);

            const { last_number: last } = db
                .prepare('SELECT last_number FROM invoice_sequences WHERE owner_id = ? AND year = ?')
                .get(String(ownerId), year);

            return `FAT-${year}-${String(last).padStart(4, '0')}`;
        },

        create(ownerId, invoice) {
            return transaction(() => {
                const id = createId('fat');
                const number = this.consumeNumber(ownerId);

                db.prepare(`
                    INSERT INTO invoices (id, owner_id, number, client_id, issue_date, due_date, notes,
                                          regime, tax_rate, client_pays_grossup, gross, tax, net, status, paid_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', '', ?)
                `).run(id, String(ownerId), number, invoice.clientId, invoice.issueDate, invoice.dueDate,
                    invoice.notes, invoice.regime, invoice.taxRate, Number(invoice.clientPaysGrossup),
                    invoice.gross, invoice.tax, invoice.net,
                    new Date().toISOString());

                replaceItems(id, invoice.items);

                return this.find(ownerId, id);
            });
        },

        update(ownerId, id, invoice) {
            if (!this.find(ownerId, id)) {
                return null;
            }

            return transaction(() => {
                db.prepare(`
                    UPDATE invoices SET client_id = ?, issue_date = ?, due_date = ?, notes = ?,
                                        regime = ?, tax_rate = ?, client_pays_grossup = ?, gross = ?, tax = ?, net = ?
                    WHERE id = ? AND owner_id = ?
                `).run(invoice.clientId, invoice.issueDate, invoice.dueDate, invoice.notes, invoice.regime,
                    invoice.taxRate, Number(invoice.clientPaysGrossup), invoice.gross, invoice.tax, invoice.net,
                    String(id), String(ownerId));

                replaceItems(String(id), invoice.items);

                return this.find(ownerId, id);
            });
        },

        /** Confirma ou reverte a liquidação. */
        setStatus(ownerId, id, status, paidAt) {
            if (!this.find(ownerId, id)) {
                return null;
            }

            db.prepare('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ? AND owner_id = ?')
                .run(status, paidAt, String(id), String(ownerId));

            return this.find(ownerId, id);
        },

        delete(ownerId, id) {
            const result = db.prepare('DELETE FROM invoices WHERE id = ? AND owner_id = ?')
                .run(String(id), String(ownerId));

            return result.changes > 0;
        }
    };
}
