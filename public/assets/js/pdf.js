/* ============================================================
   pdf.js — geração do documento de fatura (jsPDF)
   Layout minimalista corporativo em A4 retrato.
   ============================================================ */

(function (global) {
    'use strict';

    var PAGE = { width: 210, height: 297, margin: 16 };
    var COLORS = {
        brand: [15, 61, 110],
        accent: [0, 163, 122],
        text: [16, 25, 43],
        soft: [91, 102, 120],
        line: [226, 230, 239],
        zebra: [249, 250, 252]
    };
    var COLUMNS = { description: 16, quantity: 118, unitPrice: 140, total: 194 };

    function setColor(doc, rgb) {
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    }

    function setFill(doc, rgb) {
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    }

    function setDraw(doc, rgb) {
        doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    }

    /** Escreve um bloco rotulado (título em caixa alta + linhas de texto). */
    function block(doc, title, lines, x, y, maxWidth) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        setColor(doc, COLORS.soft);
        doc.text(title.toUpperCase(), x, y);

        doc.setFontSize(9.5);
        setColor(doc, COLORS.text);

        var cursor = y + 5.5;
        lines.filter(Boolean).forEach(function (line, index) {
            doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
            doc.splitTextToSize(String(line), maxWidth).forEach(function (part) {
                doc.text(part, x, cursor);
                cursor += 4.6;
            });
        });

        return cursor;
    }

    /** Cabeçalho do documento: faixa da marca, número e datas. */
    function header(doc, invoice) {
        setFill(doc, COLORS.brand);
        doc.rect(0, 0, PAGE.width, 30, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text('SERVICE INVOICE', PAGE.margin, 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Non-fiscal document — issued through FinInvoice', PAGE.margin, 22);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(invoice.number || '—', PAGE.width - PAGE.margin, 13, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text('Issued: ' + Format.date(invoice.issueDate), PAGE.width - PAGE.margin, 19, { align: 'right' });
        doc.text('Due: ' + Format.date(invoice.dueDate), PAGE.width - PAGE.margin, 24, { align: 'right' });
    }

    /** Tabela de itens de serviço. */
    function itemsTable(doc, items, startY) {
        var y = startY;

        setFill(doc, COLORS.brand);
        doc.rect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, 8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text('SERVICE DESCRIPTION', COLUMNS.description + 2, y + 5.4);
        doc.text('QTY', COLUMNS.quantity + 14, y + 5.4, { align: 'right' });
        doc.text('UNIT PRICE', COLUMNS.unitPrice + 24, y + 5.4, { align: 'right' });
        doc.text('TOTAL', COLUMNS.total, y + 5.4, { align: 'right' });

        y += 8;
        doc.setFontSize(9);

        items.forEach(function (item, index) {
            var lines = doc.splitTextToSize(String(item.description || 'Service provided'), 96);
            var rowHeight = Math.max(9, lines.length * 4.6 + 4);

            if (index % 2 === 1) {
                setFill(doc, COLORS.zebra);
                doc.rect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, rowHeight, 'F');
            }

            doc.setFont('helvetica', 'normal');
            setColor(doc, COLORS.text);
            lines.forEach(function (line, lineIndex) {
                doc.text(line, COLUMNS.description + 2, y + 6 + lineIndex * 4.6);
            });

            doc.text(String(item.quantity), COLUMNS.quantity + 14, y + 6, { align: 'right' });
            doc.text(Format.money(item.unitPrice), COLUMNS.unitPrice + 24, y + 6, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.text(Format.money(Finance.lineTotal(item)), COLUMNS.total, y + 6, { align: 'right' });

            setDraw(doc, COLORS.line);
            doc.line(PAGE.margin, y + rowHeight, PAGE.width - PAGE.margin, y + rowHeight);
            y += rowHeight;
        });

        return y;
    }

    /** Quadro de totais: valor desejado, gross-up e total a pagar. */
    function totalsBox(doc, invoice, startY) {
        var boxX = 112;
        var boxWidth = PAGE.width - PAGE.margin - boxX;
        var y = startY + 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        setColor(doc, COLORS.soft);
        doc.text('Target payout', boxX, y);
        setColor(doc, COLORS.text);
        doc.text(Format.money(invoice.net), COLUMNS.total, y, { align: 'right' });

        y += 6;
        setColor(doc, COLORS.soft);
        doc.text(invoice.clientPaysGrossup
            ? 'Gross-up (' + invoice.taxRate + '%, charged to client)'
            : 'Gross-up not charged to client', boxX, y);
        setColor(doc, COLORS.text);
        doc.text('+ ' + Format.money(invoice.tax), COLUMNS.total, y, { align: 'right' });

        y += 4;
        setFill(doc, COLORS.accent);
        doc.rect(boxX, y, boxWidth, 14, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('INVOICE TOTAL', boxX + 4, y + 6);
        doc.setFontSize(13);
        doc.text(Format.money(invoice.gross), COLUMNS.total - 2, y + 11, { align: 'right' });

        return y + 14;
    }

    /** Instruções de liquidação (chave Pix) e observações. */
    function paymentBox(doc, issuer, invoice, startY) {
        var y = startY;

        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.3);
        doc.rect(PAGE.margin, y, 90, 26);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        setColor(doc, COLORS.soft);
        doc.text('PAYMENT VIA PIX', PAGE.margin + 4, y + 6);

        doc.setFontSize(9);
        setColor(doc, COLORS.text);
        doc.text('Key type: ' + (issuer.pixType || '—'), PAGE.margin + 4, y + 12);
        doc.setFont('helvetica', 'bold');
        doc.splitTextToSize(issuer.pixKey || 'Key not registered', 82).slice(0, 2)
            .forEach(function (line, index) {
                doc.text(line, PAGE.margin + 4, y + 18 + index * 4.6);
            });

        if (invoice.notes) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            setColor(doc, COLORS.soft);
            doc.text('NOTES', 112, y + 6);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            setColor(doc, COLORS.text);
            doc.splitTextToSize(invoice.notes, 82).slice(0, 4).forEach(function (line, index) {
                doc.text(line, 112, y + 12 + index * 4.6);
            });
        }

        return y + 26;
    }

    /** Rodapé institucional. */
    function footer(doc, invoice) {
        var y = PAGE.height - 14;

        setDraw(doc, COLORS.line);
        doc.line(PAGE.margin, y - 6, PAGE.width - PAGE.margin, y - 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setColor(doc, COLORS.soft);
        doc.text('Invoice ' + (invoice.number || '') + ' — generated on ' + Format.date(Format.today())
            + ' by FinInvoice. Billing document with no fiscal validity.', PAGE.margin, y);
    }

    var InvoicePdf = {

        /**
         * Monta e baixa o PDF da fatura.
         * @param {object} invoice Invoice consolidada (com totais calculados).
         * @param {object} client Dados do pagador.
         * @param {object} issuer Dados do beneficiário.
         */
        download: function (invoice, client, issuer) {
            if (!global.jspdf || !global.jspdf.jsPDF) {
                throw new Error('jsPDF library not loaded. Check your connection.');
            }

            var doc = new global.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
            var addressLine = [client.street, client.number].filter(Boolean).join(', ');
            var cityLine = [client.district, [client.city, client.state].filter(Boolean).join('/')]
                .filter(Boolean).join(' — ');

            header(doc, invoice);

            var leftEnd = block(doc, 'Payee (receives payment)', [
                issuer.name || 'Payee not registered',
                issuer.document ? 'Tax ID: ' + issuer.document : '',
                issuer.address,
                issuer.email,
                issuer.phone,
                'Regime: ' + Finance.labelFor(issuer.regime)
            ], PAGE.margin, 42, 85);

            var rightEnd = block(doc, 'Payer (makes payment)', [
                client.name || '—',
                client.document ? (client.type === 'PF' ? 'CPF: ' : 'CNPJ: ') + client.document : '',
                addressLine,
                cityLine,
                client.cep ? 'CEP: ' + client.cep : '',
                client.email
            ], 112, 42, 82);

            var tableEnd = itemsTable(doc, invoice.items || [], Math.max(leftEnd, rightEnd) + 6);
            var totalsEnd = totalsBox(doc, invoice, tableEnd);

            paymentBox(doc, issuer, invoice, totalsEnd + 10);
            footer(doc, invoice);

            doc.save((invoice.number || 'invoice') + '.pdf');
        }
    };

    global.InvoicePdf = InvoicePdf;
})(window);
