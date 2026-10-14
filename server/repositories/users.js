/* ============================================================
   repositories/users.js — usuários e sessões
   ============================================================ */

import { createId, createSessionToken, hashPassword, verifyPassword, SESSION_TTL_MS } from '../security.js';

/** Projeção pública: nunca expõe hash nem salt. */
function publicView(row) {
    return row ? { id: row.id, username: row.username, name: row.name } : null;
}

export function createUserRepository(db) {
    return {

        /** Quantidade de perfis cadastrados. */
        count() {
            return db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
        },

        findByUsername(username) {
            return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username)) || null;
        },

        findById(id) {
            return publicView(db.prepare('SELECT * FROM users WHERE id = ?').get(String(id)));
        },

        /**
         * Cria o usuário com a senha já derivada.
         * @returns {Promise<object>} Usuário em visão pública.
         */
        async create({ username, name, password }) {
            const credential = await hashPassword(password);
            const user = {
                id: createId('usr'),
                username,
                name,
                createdAt: new Date().toISOString()
            };

            db.prepare(`
                INSERT INTO users (id, username, name, password_hash, password_salt, iterations, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(user.id, user.username, user.name, credential.hash, credential.salt,
                credential.iterations, user.createdAt);

            return publicView(user);
        },

        /**
         * Valida as credenciais.
         * @returns {Promise<object|null>} Usuário em visão pública, ou null.
         */
        async authenticate(username, password) {
            const row = this.findByUsername(username);

            if (!row) {
                return null;
            }

            const valid = await verifyPassword(String(password ?? ''), {
                hash: row.password_hash,
                salt: row.password_salt,
                iterations: row.iterations
            });

            return valid ? publicView(row) : null;
        },

        /** Abre uma sessão e devolve o token opaco. */
        openSession(userId) {
            const token = createSessionToken();
            const now = Date.now();

            db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
                .run(token, userId, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString());

            return token;
        },

        /** Resolve o token em usuário, descartando sessões expiradas. */
        resolveSession(token) {
            if (!token) {
                return null;
            }

            const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(String(token));

            if (!session) {
                return null;
            }
            if (new Date(session.expires_at).getTime() <= Date.now()) {
                this.closeSession(token);
                return null;
            }

            return this.findById(session.user_id);
        },

        closeSession(token) {
            db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token ?? ''));
        }
    };
}
