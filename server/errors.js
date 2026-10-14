/* ============================================================
   errors.js — erro de aplicação com status HTTP
   ============================================================ */

export class HttpError extends Error {
    /**
     * @param {number} status Código HTTP da resposta.
     * @param {string} message Mensagem exibível ao usuário final.
     */
    constructor(status, message) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

export const badRequest = (message) => new HttpError(400, message);
export const unauthorized = (message) => new HttpError(401, message);
export const forbidden = (message) => new HttpError(403, message);
export const notFound = (message) => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);
export const unprocessable = (message) => new HttpError(422, message);
