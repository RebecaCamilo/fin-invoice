/* ============================================================
   finance.js — motor de cálculo financeiro e tributário

   Módulo COMPARTILHADO entre servidor e navegador:
   - o servidor o usa para calcular o valor gravado no banco
     (fonte da verdade, nunca confia nos totais enviados);
   - o navegador o usa para atualizar o resumo em tempo real.

   Por isso não depende de DOM, de rede nem de formatação pt-BR.

   Estimativa: o valor dos serviços é o líquido desejado. A taxa é
   aplicada como gross-up para que o líquido seja preservado.
   ============================================================ */

export const REGIMES = {
    SIMPLES: { label: 'Simples Nacional — Anexo III', rate: 6 },
    MEI: { label: 'MEI — exempt on the invoice', rate: 0 }
};

/** Arredonda para duas casas decimais evitando ruído de ponto flutuante. */
export function round(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Alíquota aplicável ao regime informado. */
export function rateFor(regime) {
    return (REGIMES[regime] || REGIMES.SIMPLES).rate;
}

/** Rótulo legível do regime informado. */
export function labelFor(regime) {
    return (REGIMES[regime] || REGIMES.SIMPLES).label;
}

/** Total de uma linha: quantidade × valor unitário. */
export function lineTotal(item) {
    return round((Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0));
}

/**
 * Consolida os totais de uma fatura.
 * @param {Array<{quantity: number, unitPrice: number}>} items Linhas de serviço.
 * @param {string} regime Regime tributário do beneficiário.
 * @returns {{rate: number, gross: number, tax: number, net: number}} Totais.
 */
export function totals(items, regime, clientPaysGrossup = true) {
    const rate = rateFor(regime);
    const net = round((items || []).reduce((sum, item) => sum + lineTotal(item), 0));
    const grossupRate = clientPaysGrossup ? rate : 0;
    const gross = round(net / (1 - grossupRate / 100));
    const tax = round(gross - net);

    return { rate, gross, tax, net, clientPaysGrossup };
}

/** Data corrente no formato "AAAA-MM-DD", em horário local. */
export function todayIso() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
}

/**
 * Status efetivo da fatura: "paga" é definitivo; "pendente" vira "vencida"
 * quando o vencimento já passou sem confirmação de liquidação.
 * @param {object} invoice Fatura persistida.
 * @param {string} [referenceDate] Data de referência "AAAA-MM-DD".
 */
export function statusOf(invoice, referenceDate) {
    if (!invoice) {
        return 'pendente';
    }
    if (invoice.status === 'paga') {
        return 'paga';
    }
    const today = referenceDate || todayIso();
    return invoice.dueDate && invoice.dueDate < today ? 'vencida' : 'pendente';
}

/** Rótulo exibido para cada status do ciclo de vida. */
export function statusLabel(status) {
    return { paga: 'Paid', pendente: 'Pending', vencida: 'Overdue' }[status] || status;
}

/**
 * Agrega faturas de uma competência "AAAA-MM" em totais por status.
 * @param {Array} invoices Faturas já no escopo do usuário.
 * @param {string} yearMonth Competência de referência.
 * @param {string} [referenceDate] Data de referência para o vencimento.
 */
export function summarize(invoices, yearMonth, referenceDate) {
    const summary = {
        issued: { total: 0, count: 0 },
        paga: { total: 0, count: 0 },
        pendente: { total: 0, count: 0 },
        vencida: { total: 0, count: 0 },
        invoices: []
    };

    (invoices || []).forEach((invoice) => {
        if (yearMonth && String(invoice.issueDate || '').slice(0, 7) !== yearMonth) {
            return;
        }
        const status = statusOf(invoice, referenceDate);
        const gross = Number(invoice.gross) || 0;

        summary.issued.total += gross;
        summary.issued.count += 1;
        summary[status].total += gross;
        summary[status].count += 1;
        summary.invoices.push(invoice);
    });

    ['issued', 'paga', 'pendente', 'vencida'].forEach((key) => {
        summary[key].total = round(summary[key].total);
    });

    summary.invoices.sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)));

    return summary;
}

export default {
    REGIMES, round, rateFor, labelFor, lineTotal, totals,
    todayIso, statusOf, statusLabel, summarize
};
