/* ============================================================
   security.js — derivação de senha e token de sessão

   A senha nunca é armazenada nem registrada em log: guarda-se
   apenas o hash PBKDF2-SHA256 com salt por usuário. A verificação
   usa comparação de tempo constante para não vazar informação
   pelo tempo de resposta.
   ============================================================ */

import { randomBytes, pbkdf2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);

export const PBKDF2 = {
    iterations: 150000,
    digest: 'sha256',
    keyBytes: 32,
    saltBytes: 16
};

/** Duração da sessão: 12 horas. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Deriva a senha e devolve hash e salt em base64.
 * @param {string} password Senha em texto puro.
 * @returns {Promise<{hash: string, salt: string, iterations: number}>} Credencial derivada.
 */
export async function hashPassword(password) {
    const salt = randomBytes(PBKDF2.saltBytes);
    const hash = await derive(password, salt, PBKDF2.iterations, PBKDF2.keyBytes, PBKDF2.digest);

    return {
        hash: hash.toString('base64'),
        salt: salt.toString('base64'),
        iterations: PBKDF2.iterations
    };
}

/**
 * Confere a senha contra a credencial armazenada.
 * @param {string} password Senha informada.
 * @param {{hash: string, salt: string, iterations: number}} credential Credencial do usuário.
 * @returns {Promise<boolean>} Verdadeiro quando confere.
 */
export async function verifyPassword(password, credential) {
    const expected = Buffer.from(credential.hash, 'base64');
    const actual = await derive(
        password,
        Buffer.from(credential.salt, 'base64'),
        credential.iterations,
        expected.length,
        PBKDF2.digest
    );

    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Token de sessão opaco, com 256 bits de entropia. */
export function createSessionToken() {
    return randomBytes(32).toString('base64url');
}

/** Identificador curto e único para registros do domínio. */
export function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
}
