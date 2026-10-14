/* ============================================================
   routes/auth.js — cadastro, login, logout e sessão corrente
   ============================================================ */

import { Router } from 'express';
import { conflict, unauthorized, unprocessable } from '../errors.js';
import { clearSessionCookie, requireAuth, setSessionCookie, SESSION_COOKIE } from '../middleware.js';

const MIN_PASSWORD = 6;
const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

/** Valida e normaliza os dados do cadastro. */
function normalizeRegistration(body) {
    const username = String(body?.username ?? '').trim().toLowerCase();
    const name = String(body?.name ?? '').trim();
    const password = String(body?.password ?? '');

    if (username.length < 3) {
        throw unprocessable('The username must have at least 3 characters.');
    }
    if (!USERNAME_PATTERN.test(username)) {
        throw unprocessable('Use only lowercase letters, digits, dot, hyphen or underscore.');
    }
    if (!name) {
        throw unprocessable('Enter a display name.');
    }
    if (password.length < MIN_PASSWORD) {
        throw unprocessable(`The password must have at least ${MIN_PASSWORD} characters.`);
    }

    return { username, name, password };
}

export function createAuthRouter({ users }) {
    const router = Router();

    router.get('/me', (request, response) => {
        if (!request.user) {
            response.status(401).json({ error: 'No active session.' });
            return;
        }
        response.json({ user: request.user, hasUsers: users.count() > 0 });
    });

    /** Indica se já existe algum perfil, para a tela abrir em "entrar" ou "criar conta". */
    router.get('/status', (_request, response) => {
        response.json({ hasUsers: users.count() > 0 });
    });

    router.post('/register', async (request, response, next) => {
        try {
            const input = normalizeRegistration(request.body);

            if (users.findByUsername(input.username)) {
                throw conflict('This username is already taken.');
            }

            const user = await users.create(input);
            setSessionCookie(response, users.openSession(user.id));
            response.status(201).json({ user });
        } catch (error) {
            next(error);
        }
    });

    router.post('/login', async (request, response, next) => {
        try {
            const user = await users.authenticate(
                String(request.body?.username ?? '').trim().toLowerCase(),
                request.body?.password
            );

            if (!user) {
                throw unauthorized('Invalid username or password.');
            }

            setSessionCookie(response, users.openSession(user.id));
            response.json({ user });
        } catch (error) {
            next(error);
        }
    });

    router.post('/logout', requireAuth, (request, response) => {
        users.closeSession(request.cookies?.[SESSION_COOKIE]);
        clearSessionCookie(response);
        response.status(204).end();
    });

    return router;
}
