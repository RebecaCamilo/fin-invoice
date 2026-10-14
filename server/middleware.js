/* ============================================================
   middleware.js — cookie de sessão e exigência de autenticação
   ============================================================ */

import { HttpError } from './errors.js';
import { SESSION_TTL_MS } from './security.js';

export const SESSION_COOKIE = 'fininvoice_session';

/** Lê os cookies da requisição sem depender de biblioteca externa. */
export function cookieParser(request, _response, next) {
    request.cookies = String(request.headers.cookie ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const separator = part.indexOf('=');
            if (separator > 0) {
                cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
            }
            return cookies;
        }, {});

    next();
}

/**
 * Grava o cookie de sessão.
 *
 * httpOnly impede leitura por JavaScript (defesa contra XSS roubar a sessão);
 * sameSite=lax evita envio em requisições de terceiros (defesa contra CSRF).
 * "secure" fica condicionado ao ambiente porque o MVP roda em http://localhost.
 */
export function setSessionCookie(response, token) {
    response.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_TTL_MS,
        path: '/'
    });
}

export function clearSessionCookie(response) {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolve a sessão e anexa o usuário à requisição, sem bloquear anônimos. */
export function createSessionLoader(users) {
    return function loadSession(request, _response, next) {
        request.user = users.resolveSession(request.cookies?.[SESSION_COOKIE]) ?? null;
        next();
    };
}

/** Bloqueia a requisição quando não há sessão válida. */
export function requireAuth(request, _response, next) {
    if (!request.user) {
        next(new HttpError(401, 'Session expired or missing. Please sign in again.'));
        return;
    }
    next();
}

/** Tratador final de erros: devolve sempre JSON no mesmo formato. */
export function errorHandler(error, _request, response, _next) {
    const status = error instanceof HttpError ? error.status : 500;

    if (status >= 500) {
        console.error('Unhandled error:', error);
    }

    response.status(status).json({
        error: status >= 500 ? 'Internal server error.' : error.message
    });
}
