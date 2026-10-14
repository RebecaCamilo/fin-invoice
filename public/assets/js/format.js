/* ============================================================
   format.js — formatação e máscaras

   Interface em inglês, mas os valores seguem a convenção
   brasileira (R$ 1.699,80): a cobrança é em real e será
   liquidada no Brasil, então o número precisa ser lido sem
   tradução mental por quem paga.

   As datas usam o formato "Oct 20, 2026" justamente para evitar
   a ambiguidade entre dd/mm e mm/dd num app bilíngue.
   ============================================================ */

(function (global) {
    'use strict';

    var currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    var longDate = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    var monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

    var Format = {

        /** Formata um número como moeda brasileira. */
        money: function (value) {
            return currency.format(Number(value) || 0);
        },

        /** Remove tudo que não for dígito. */
        digits: function (value) {
            return String(value || '').replace(/\D/g, '');
        },

        /** Aplica a máscara 00.000.000/0000-00. */
        cnpj: function (value) {
            return Format.digits(value).slice(0, 14)
                .replace(/^(\d{2})(\d)/, '$1.$2')
                .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
                .replace(/\.(\d{3})(\d)/, '.$1/$2')
                .replace(/(\d{4})(\d)/, '$1-$2');
        },

        /** Aplica a máscara 000.000.000-00. */
        cpf: function (value) {
            return Format.digits(value).slice(0, 11)
                .replace(/^(\d{3})(\d)/, '$1.$2')
                .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
                .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
        },

        /** Aplica a máscara 00000-000. */
        cep: function (value) {
            return Format.digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
        },

        /** Converte "AAAA-MM-DD" em "Oct 20, 2026", montando a data em horário local. */
        date: function (isoDate) {
            if (!isoDate) {
                return '—';
            }
            var parts = String(isoDate).slice(0, 10).split('-').map(Number);

            if (parts.length !== 3 || parts.some(Number.isNaN)) {
                return String(isoDate);
            }
            return longDate.format(new Date(parts[0], parts[1] - 1, parts[2]));
        },

        /** Data de hoje no formato "AAAA-MM-DD" (horário local). */
        today: function () {
            var now = new Date();
            return [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0')
            ].join('-');
        },

        /** Soma dias a uma data "AAAA-MM-DD". */
        addDays: function (isoDate, days) {
            var parts = String(isoDate).split('-').map(Number);
            var base = new Date(parts[0], parts[1] - 1, parts[2]);
            base.setDate(base.getDate() + days);
            return [
                base.getFullYear(),
                String(base.getMonth() + 1).padStart(2, '0'),
                String(base.getDate()).padStart(2, '0')
            ].join('-');
        },

        /** Competência "AAAA-MM" do mês corrente. */
        currentMonth: function () {
            return Format.today().slice(0, 7);
        },

        /** Rótulo legível da competência, ex.: "October 2026". */
        monthLabel: function (yearMonth) {
            var parts = String(yearMonth || '').split('-').map(Number);
            if (parts.length < 2 || parts.some(Number.isNaN)) {
                return '';
            }
            return monthYear.format(new Date(parts[0], parts[1] - 1, 1));
        },

        /** Escapa texto para interpolação segura em HTML. */
        escape: function (value) {
            return String(value === undefined || value === null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };

    global.Format = Format;
})(window);
