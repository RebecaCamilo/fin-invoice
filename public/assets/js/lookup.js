/* ============================================================
   lookup.js — enriquecimento de dados via APIs públicas
   BrasilAPI (CNPJ / Receita Federal) e ViaCEP (endereço).
   Ambas são somente leitura (GET) e não possuem ambiente de
   homologação próprio — por isso são consultadas diretamente.

   Chamadas a partir do navegador, e não do servidor, porque são
   apoio ao preenchimento do formulário: se falharem, o cadastro
   manual continua possível e nada é bloqueado.
   ============================================================ */

(function (global) {
    'use strict';

    var ENDPOINTS = {
        cnpj: 'https://brasilapi.com.br/api/cnpj/v1/',
        cep: 'https://viacep.com.br/ws/'
    };

    var TIMEOUT_MS = 10000;

    /** Executa um GET JSON com timeout, normalizando a mensagem de erro. */
    function getJson(url) {
        var controller = new AbortController();
        var timer = setTimeout(function () {
            controller.abort();
        }, TIMEOUT_MS);

        return fetch(url, { signal: controller.signal })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(response.status === 404
                        ? 'Not found in the public registry.'
                        : 'Service unavailable right now (HTTP ' + response.status + ').');
                }
                return response.json();
            })
            .catch(function (error) {
                if (error.name === 'AbortError') {
                    throw new Error('The request timed out. Try again.');
                }
                if (error instanceof TypeError) {
                    throw new Error('No connection to the lookup service.');
                }
                throw error;
            })
            .finally(function () {
                clearTimeout(timer);
            });
    }

    var Lookup = {

        /**
         * Consulta um CNPJ na BrasilAPI e devolve os campos cadastrais relevantes.
         * @param {string} cnpj CNPJ com ou sem máscara.
         */
        fetchCnpj: function (cnpj) {
            var clean = Format.digits(cnpj);

            if (clean.length !== 14) {
                return Promise.reject(new Error('Enter a CNPJ with 14 digits.'));
            }

            return getJson(ENDPOINTS.cnpj + clean).then(function (data) {
                return {
                    name: data.razao_social || data.nome_fantasia || '',
                    tradeName: data.nome_fantasia || '',
                    email: data.email || '',
                    phone: data.ddd_telefone_1 || '',
                    cep: Format.cep(data.cep || ''),
                    street: [data.descricao_tipo_de_logradouro, data.logradouro]
                        .filter(Boolean).join(' ').trim(),
                    number: data.numero || '',
                    district: data.bairro || '',
                    city: data.municipio || '',
                    state: data.uf || ''
                };
            });
        },

        /**
         * Consulta um CEP na ViaCEP e devolve o endereço normalizado.
         * @param {string} cep CEP com ou sem máscara.
         */
        fetchCep: function (cep) {
            var clean = Format.digits(cep);

            if (clean.length !== 8) {
                return Promise.reject(new Error('Enter a postal code with 8 digits.'));
            }

            return getJson(ENDPOINTS.cep + clean + '/json/').then(function (data) {
                if (data.erro) {
                    throw new Error('Postal code not found.');
                }
                return {
                    street: data.logradouro || '',
                    district: data.bairro || '',
                    city: data.localidade || '',
                    state: data.uf || ''
                };
            });
        }
    };

    global.Lookup = Lookup;
})(window);
