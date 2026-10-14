/* ============================================================
   api-client.js — cliente HTTP da API do FinInvoice

   Substitui o antigo acesso direto ao LocalStorage: todo dado
   agora vem do servidor, que é quem aplica autenticação,
   validação e cálculo. A sessão viaja em cookie httpOnly, por
   isso nenhum token é manipulado aqui.
   ============================================================ */

(function (global) {
    'use strict';

    /** Disparado quando o servidor recusa a sessão, para a interface voltar ao login. */
    var SESSION_EXPIRED = 'fininvoice:session-expired';

    /**
     * Executa uma requisição à API e normaliza a mensagem de erro.
     * @param {string} method Verbo HTTP.
     * @param {string} path Caminho a partir de /api.
     * @param {object} [body] Corpo a enviar como JSON.
     * @param {{silent401: boolean}} [options] Evita o evento de sessão expirada.
     */
    function request(method, path, body, options) {
        return fetch('/api' + path, {
            method: method,
            credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        }).then(function (response) {
            if (response.status === 204) {
                return null;
            }

            return response.json().catch(function () {
                throw new Error('Invalid response from the server.');
            }).then(function (data) {
                if (response.ok) {
                    return data;
                }
                if (response.status === 401 && !(options && options.silent401)) {
                    global.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
                }
                throw new Error(data && data.error ? data.error : 'Could not reach the server.');
            });
        }, function () {
            throw new Error('Server unavailable. Check whether it is running.');
        });
    }

    global.Api = {
        SESSION_EXPIRED: SESSION_EXPIRED,

        auth: {
            /** Há algum perfil cadastrado? Define se a tela abre em entrar ou criar conta. */
            status: function () {
                return request('GET', '/auth/status');
            },
            me: function () {
                return request('GET', '/auth/me', null, { silent401: true });
            },
            register: function (payload) {
                return request('POST', '/auth/register', payload);
            },
            login: function (username, password) {
                return request('POST', '/auth/login', { username: username, password: password });
            },
            logout: function () {
                return request('POST', '/auth/logout');
            }
        },

        issuer: {
            get: function () {
                return request('GET', '/issuer').then(function (data) {
                    return data.issuer;
                });
            },
            save: function (issuer) {
                return request('PUT', '/issuer', issuer).then(function (data) {
                    return data.issuer;
                });
            }
        },

        clients: {
            list: function () {
                return request('GET', '/clients').then(function (data) {
                    return data.clients;
                });
            },
            create: function (client) {
                return request('POST', '/clients', client);
            },
            update: function (id, client) {
                return request('PUT', '/clients/' + encodeURIComponent(id), client);
            },
            remove: function (id) {
                return request('DELETE', '/clients/' + encodeURIComponent(id));
            }
        },

        invoices: {
            list: function () {
                return request('GET', '/invoices').then(function (data) {
                    return data.invoices;
                });
            },
            nextNumber: function () {
                return request('GET', '/invoices/next-number').then(function (data) {
                    return data.number;
                });
            },
            create: function (invoice) {
                return request('POST', '/invoices', invoice).then(function (data) {
                    return data.invoice;
                });
            },
            update: function (id, invoice) {
                return request('PUT', '/invoices/' + encodeURIComponent(id), invoice).then(function (data) {
                    return data.invoice;
                });
            },
            setStatus: function (id, status) {
                return request('PATCH', '/invoices/' + encodeURIComponent(id) + '/status', { status: status });
            },
            remove: function (id) {
                return request('DELETE', '/invoices/' + encodeURIComponent(id));
            }
        }
    };
})(window);
