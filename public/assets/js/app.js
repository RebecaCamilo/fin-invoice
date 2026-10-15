/* ============================================================
   app.js — orquestração da interface

   Camada de apresentação apenas: toda regra de negócio e toda
   verificação de permissão vivem no servidor. Aqui há cache em
   memória dos dados carregados, para que a renderização seja
   síncrona e o resumo financeiro responda enquanto o usuário
   digita.
   ============================================================ */

(function (global) {
    'use strict';

    var $ = function (id) {
        return document.getElementById(id);
    };

    var state = {
        user: null,
        issuer: null,
        clients: [],
        invoices: [],
        editingItems: [],
        clientFilter: '',
        invoiceFilter: 'todas'
    };

    /* ============================================================
       Utilitários de interface
       ============================================================ */

    var toastTimer = null;

    /** Exibe uma mensagem temporária ao usuário. */
    function toast(message, kind) {
        var box = $('box_toast');

        box.textContent = message;
        box.className = 'toast' + (kind ? ' is-' + kind : '');
        box.hidden = false;

        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            box.hidden = true;
        }, 3600);
    }

    /** Aplica uma máscara enquanto o usuário digita. */
    function bindMask(input, maskFn) {
        input.addEventListener('input', function () {
            input.value = maskFn(input.value);
        });
    }

    /** Atualiza um campo de apoio (hint) com estado visual. */
    function setHint(element, message, kind) {
        element.textContent = message || '';
        element.className = 'field__hint' + (kind ? ' is-' + kind : '');
    }

    /** Monta o selo de status do ciclo de vida da fatura. */
    function statusBadge(status) {
        return '<span class="badge badge--' + status + '">' + Finance.statusLabel(status) + '</span>';
    }

    /** Desabilita o botão durante a chamada, evitando envio duplicado. */
    function withBusy(button, action) {
        button.disabled = true;
        return Promise.resolve()
            .then(action)
            .catch(function (error) {
                toast(error.message, 'error');
                throw error;
            })
            .finally(function () {
                button.disabled = false;
            });
    }

    function findClient(id) {
        return state.clients.filter(function (client) {
            return client.id === id;
        })[0] || null;
    }

    /* ============================================================
       Navegação
       ============================================================ */

    function showView(name) {
        document.querySelectorAll('.nav__item').forEach(function (tab) {
            var active = tab.dataset.view === name;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        });

        document.querySelectorAll('.view').forEach(function (view) {
            var active = view.id === 'view_' + name;
            view.hidden = !active;
            view.classList.toggle('is-active', active);
        });

        $('nav_main').classList.remove('is-open');
        $('button_toggle_menu').setAttribute('aria-expanded', 'false');
        global.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function initNavigation() {
        document.querySelectorAll('.nav__item').forEach(function (tab) {
            tab.addEventListener('click', function () {
                showView(tab.dataset.view);
            });
        });

        $('button_toggle_menu').addEventListener('click', function () {
            var nav = $('nav_main');
            var open = nav.classList.toggle('is-open');
            this.setAttribute('aria-expanded', String(open));
        });
    }

    /* ============================================================
       Beneficiário (emissor)
       ============================================================ */

    function loadIssuerForm() {
        var issuer = state.issuer;

        $('input_issuer_name').value = issuer.name;
        $('input_issuer_document').value = issuer.document;
        $('select_issuer_regime').value = issuer.regime;
        $('input_issuer_email').value = issuer.email;
        $('input_issuer_phone').value = issuer.phone;
        $('input_issuer_address').value = issuer.address;
        $('select_issuer_pix_type').value = issuer.pixType;
        $('input_issuer_pix_key').value = issuer.pixKey;

        updateRegimeHint();
    }

    function updateRegimeHint() {
        var regime = $('select_issuer_regime').value;
        setHint($('text_issuer_regime_hint'), regime === 'MEI'
            ? 'No gross-up is applied in this estimate. MEI tax obligations are not calculated here.'
            : 'Illustrative 6% gross-up estimate. Confirm your actual rate and obligations with an accountant.');

        var grossupToggle = $('input_invoice_client_pays_grossup');
        grossupToggle.disabled = regime === 'MEI';
        if (grossupToggle.disabled) {
            grossupToggle.checked = false;
        }
        setHint($('text_invoice_grossup_hint'), regime === 'MEI'
            ? 'Not applicable for the selected MEI estimate (0%).'
            : grossupToggle.checked
                ? 'Enabled: the invoice total is increased to preserve your target payout.'
                : 'Disabled: no gross-up is added to the invoice. You remain responsible for any separate tax payments.');
    }

    /**
     * Explicação dos regimes tributários.
     *
     * Modal, e não tooltip: o conteúdo tem tabela comparativa e ressalva legal,
     * que não cabem num balão e somem em telas de toque. E aberto a partir do
     * próprio campo, e não de uma página separada, para ficar no momento em que
     * o usuário decide.
     */
    function initTaxRegimeHelp() {
        var dialog = $('dialog_tax_regimes');

        function open() {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
                return;
            }
            dialog.setAttribute('open', 'open');
        }

        function close() {
            if (typeof dialog.close === 'function') {
                dialog.close();
                return;
            }
            dialog.removeAttribute('open');
        }

        $('button_help_regime').addEventListener('click', open);
        $('button_help_regime_summary').addEventListener('click', open);
        $('button_close_tax_regimes').addEventListener('click', close);
        $('button_dismiss_tax_regimes').addEventListener('click', close);

        // Clique no backdrop: o alvo é o próprio <dialog>, nunca o cartão interno.
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                close();
            }
        });
    }

    function initIssuer() {
        $('select_issuer_regime').addEventListener('change', updateRegimeHint);

        $('form_issuer').addEventListener('submit', function (event) {
            event.preventDefault();

            withBusy($('button_save_issuer'), function () {
                return Api.issuer.save({
                    name: $('input_issuer_name').value,
                    document: $('input_issuer_document').value,
                    regime: $('select_issuer_regime').value,
                    email: $('input_issuer_email').value,
                    phone: $('input_issuer_phone').value,
                    address: $('input_issuer_address').value,
                    pixType: $('select_issuer_pix_type').value,
                    pixKey: $('input_issuer_pix_key').value
                }).then(function (issuer) {
                    state.issuer = issuer;
                    loadIssuerForm();
                    recalculateInvoice();
                    toast('Payee details saved.', 'success');
                });
            }).catch(function () { /* mensagem já exibida */ });
        });
    }

    /* ============================================================
       Clientes
       ============================================================ */

    function clientType() {
        return $('radio_client_pf').checked ? 'PF' : 'PJ';
    }

    function applyClientType() {
        var isPf = clientType() === 'PF';

        $('group_client_cnpj').hidden = isPf;
        $('group_client_cpf').hidden = !isPf;
        $('label_client_name').textContent = isPf ? 'Full name' : 'Legal name';
    }

    function resetClientForm() {
        $('form_client').reset();
        $('input_client_id').value = '';
        $('text_client_form_title').textContent = 'New client';
        setHint($('text_cnpj_status'), '');
        setHint($('text_cep_status'), '');
        applyClientType();
    }

    function fillClientAddress(data) {
        if (data.street) {
            $('input_client_street').value = data.street;
        }
        if (data.district) {
            $('input_client_district').value = data.district;
        }
        if (data.city) {
            $('input_client_city').value = data.city;
        }
        if (data.state) {
            $('input_client_state').value = data.state;
        }
    }

    function lookupCnpj() {
        var button = $('button_lookup_cnpj');
        var status = $('text_cnpj_status');

        button.disabled = true;
        setHint(status, 'Querying the federal tax registry…');

        Lookup.fetchCnpj($('input_client_cnpj').value)
            .then(function (data) {
                $('input_client_name').value = data.name;
                $('input_client_cep').value = data.cep;
                $('input_client_number').value = data.number;
                if (!$('input_client_email').value) {
                    $('input_client_email').value = data.email;
                }
                if (!$('input_client_phone').value) {
                    $('input_client_phone').value = data.phone;
                }
                fillClientAddress(data);
                setHint(status, 'Company details loaded from BrasilAPI.', 'ok');
            })
            .catch(function (error) {
                setHint(status, error.message, 'error');
            })
            .finally(function () {
                button.disabled = false;
            });
    }

    function lookupCep() {
        var button = $('button_lookup_cep');
        var status = $('text_cep_status');

        button.disabled = true;
        setHint(status, 'Looking up the postal code…');

        Lookup.fetchCep($('input_client_cep').value)
            .then(function (data) {
                fillClientAddress(data);
                setHint(status, 'Address filled in from ViaCEP.', 'ok');
                $('input_client_number').focus();
            })
            .catch(function (error) {
                setHint(status, error.message, 'error');
            })
            .finally(function () {
                button.disabled = false;
            });
    }

    function renderClients() {
        var term = state.clientFilter.toLowerCase();
        var clients = state.clients.filter(function (client) {
            return !term
                || String(client.name).toLowerCase().indexOf(term) >= 0
                || String(client.document).toLowerCase().indexOf(term) >= 0;
        });

        $('body_clients').innerHTML = clients.map(function (client) {
            var place = [client.city, client.state].filter(Boolean).join('/') || '—';
            return ''
                + '<tr>'
                + '<td><span class="cell-strong">' + Format.escape(client.name) + '</span>'
                + '<span class="cell-sub">' + (client.type === 'PF' ? 'Individual' : 'Company') + '</span></td>'
                + '<td>' + Format.escape(client.document || '—') + '</td>'
                + '<td>' + Format.escape(place) + '</td>'
                + '<td class="is-actions"><div class="cell-actions">'
                + '<button type="button" class="btn--link" data-action="edit-client" data-id="' + client.id
                + '" title="Edit client">Edit</button>'
                + '<button type="button" class="btn--link is-danger" data-action="delete-client" data-id="' + client.id
                + '" title="Delete client">Delete</button>'
                + '</div></td>'
                + '</tr>';
        }).join('');

        $('text_clients_empty').hidden = clients.length > 0;
        $('text_clients_empty').textContent = state.clients.length
            ? 'No client matches the current filter.'
            : 'No clients registered yet.';
    }

    function editClient(id) {
        var client = findClient(id);
        if (!client) {
            return;
        }

        $('input_client_id').value = client.id;
        $('radio_client_pf').checked = client.type === 'PF';
        $('radio_client_pj').checked = client.type !== 'PF';
        applyClientType();

        $('input_client_cnpj').value = client.type === 'PF' ? '' : client.document || '';
        $('input_client_cpf').value = client.type === 'PF' ? client.document || '' : '';
        $('input_client_name').value = client.name || '';
        $('input_client_email').value = client.email || '';
        $('input_client_phone').value = client.phone || '';
        $('input_client_cep').value = client.cep || '';
        $('input_client_street').value = client.street || '';
        $('input_client_number').value = client.number || '';
        $('input_client_district').value = client.district || '';
        $('input_client_city').value = client.city || '';
        $('input_client_state').value = client.state || '';

        $('text_client_form_title').textContent = 'Editing: ' + client.name;
        showView('clients');
        $('input_client_name').focus();
    }

    function deleteClient(id) {
        var client = findClient(id);

        if (!client || !global.confirm('Delete the client "' + client.name + '"?')) {
            return;
        }

        Api.clients.remove(id)
            .then(reloadClients)
            .then(function () {
                resetClientForm();
                toast('Client deleted.', 'success');
            })
            .catch(function (error) {
                toast(error.message, 'error');
            });
    }

    function reloadClients() {
        return Api.clients.list().then(function (clients) {
            state.clients = clients;
            renderClients();
            refreshClientSelect();
        });
    }

    function initClients() {
        bindMask($('input_client_cnpj'), Format.cnpj);
        bindMask($('input_client_cpf'), Format.cpf);
        bindMask($('input_client_cep'), Format.cep);

        $('radio_client_pj').addEventListener('change', applyClientType);
        $('radio_client_pf').addEventListener('change', applyClientType);
        $('button_lookup_cnpj').addEventListener('click', lookupCnpj);
        $('button_lookup_cep').addEventListener('click', lookupCep);
        $('button_reset_client').addEventListener('click', resetClientForm);

        $('input_client_cnpj').addEventListener('blur', function () {
            if (Format.digits(this.value).length === 14 && !$('input_client_name').value) {
                lookupCnpj();
            }
        });

        $('input_client_cep').addEventListener('blur', function () {
            if (Format.digits(this.value).length === 8 && !$('input_client_street').value) {
                lookupCep();
            }
        });

        $('input_search_client').addEventListener('input', function () {
            state.clientFilter = this.value.trim();
            renderClients();
        });

        $('form_client').addEventListener('submit', function (event) {
            event.preventDefault();

            var id = $('input_client_id').value;
            var type = clientType();
            var payload = {
                type: type,
                document: type === 'PF' ? $('input_client_cpf').value : $('input_client_cnpj').value,
                name: $('input_client_name').value,
                email: $('input_client_email').value,
                phone: $('input_client_phone').value,
                cep: $('input_client_cep').value,
                street: $('input_client_street').value,
                number: $('input_client_number').value,
                district: $('input_client_district').value,
                city: $('input_client_city').value,
                state: $('input_client_state').value
            };

            withBusy($('button_save_client'), function () {
                return (id ? Api.clients.update(id, payload) : Api.clients.create(payload))
                    .then(reloadClients)
                    .then(function () {
                        resetClientForm();
                        toast('Client saved.', 'success');
                    });
            }).catch(function () { /* mensagem já exibida */ });
        });

        $('body_clients').addEventListener('click', function (event) {
            var button = event.target.closest('button[data-action]');
            if (!button) {
                return;
            }
            if (button.dataset.action === 'edit-client') {
                editClient(button.dataset.id);
            }
            if (button.dataset.action === 'delete-client') {
                deleteClient(button.dataset.id);
            }
        });
    }

    /* ============================================================
       Faturas — itens dinâmicos e cálculo em tempo real
       ============================================================ */

    function itemRowHtml(item, index) {
        return ''
            + '<div class="item" data-index="' + index + '">'
            + '  <label class="field"><span class="field__label">Service description</span>'
            + '    <input type="text" class="input" data-field="description" value="' + Format.escape(item.description)
            + '" placeholder="e.g. API development" title="Description of the service provided"></label>'
            + '  <label class="field"><span class="field__label">Qty</span>'
            + '    <input type="number" class="input" data-field="quantity" min="0" step="0.01" value="'
            + item.quantity + '" title="Number of hours, items or deliverables"></label>'
            + '  <label class="field"><span class="field__label">Unit price</span>'
            + '    <input type="number" class="input" data-field="unitPrice" min="0" step="0.01" value="'
            + item.unitPrice + '" title="Unit price in reais"></label>'
            + '  <div class="field"><span class="field__label">Line total</span>'
            + '    <div class="item__total" data-role="line-total">' + Format.money(Finance.lineTotal(item)) + '</div>'
            + '  </div>'
            + '  <button type="button" class="item__remove" data-action="remove-item" data-index="' + index
            + '" title="Remove this line" aria-label="Remove service line">×</button>'
            + '</div>';
    }

    function renderItems() {
        $('list_invoice_items').innerHTML = state.editingItems.map(itemRowHtml).join('');
        recalculateInvoice();
    }

    function addItem(item) {
        state.editingItems.push(Object.assign({ description: '', quantity: 1, unitPrice: 0 }, item));
        renderItems();
    }

    function removeItem(index) {
        state.editingItems.splice(index, 1);
        if (!state.editingItems.length) {
            addItem();
            return;
        }
        renderItems();
    }

    /**
     * Prévia dos totais enquanto o usuário digita. É só prévia: o valor
     * gravado é o que o servidor recalcula com o mesmo módulo compartilhado.
     */
    function recalculateInvoice() {
        var issuer = state.issuer || { regime: 'SIMPLES', pixKey: '', pixType: '' };
        var clientPaysGrossup = $('input_invoice_client_pays_grossup').checked
            && issuer.regime === 'SIMPLES';
        var totals = Finance.totals(state.editingItems, issuer.regime, clientPaysGrossup);

        document.querySelectorAll('#list_invoice_items .item').forEach(function (row) {
            var item = state.editingItems[Number(row.dataset.index)];
            row.querySelector('[data-role="line-total"]').textContent = Format.money(Finance.lineTotal(item));
        });

        $('text_summary_target').textContent = Format.money(totals.net);
        $('text_summary_regime').textContent = Finance.labelFor(issuer.regime);
        $('text_summary_rate').textContent = totals.rate + '%';
        $('text_summary_client_pays_grossup').textContent = issuer.regime === 'MEI'
            ? 'Not applicable'
            : clientPaysGrossup ? 'Yes' : 'No';
        $('text_summary_tax').textContent = '+ ' + Format.money(totals.tax);
        $('text_summary_total').textContent = Format.money(totals.gross);
        $('text_summary_pix').textContent = issuer.pixKey
            ? issuer.pixType + ' — ' + issuer.pixKey
            : 'not registered';

        return totals;
    }

    function refreshClientSelect() {
        var select = $('select_invoice_client');
        var current = select.value;

        select.innerHTML = '<option value="">Select a client…</option>'
            + state.clients.map(function (client) {
                return '<option value="' + client.id + '">' + Format.escape(client.name)
                    + (client.document ? ' — ' + Format.escape(client.document) : '') + '</option>';
            }).join('');

        select.value = current;
        updateClientHint();
    }

    function updateClientHint() {
        var client = findClient($('select_invoice_client').value);
        setHint($('text_invoice_client_hint'), client
            ? [client.street, client.number, client.city, client.state].filter(Boolean).join(', ')
            : 'Register the payer under Clients before issuing.');
    }

    function resetInvoiceForm() {
        $('form_invoice').reset();
        $('input_invoice_id').value = '';
        $('text_invoice_form_title').textContent = 'New invoice';
        $('text_invoice_number').textContent = 'Number: …';
        $('input_invoice_issue_date').value = Format.today();
        $('input_invoice_due_date').value = Format.addDays(Format.today(), 15);
        updateRegimeHint();

        state.editingItems = [];
        addItem();
        refreshClientSelect();

        return Api.invoices.nextNumber().then(function (number) {
            if (!$('input_invoice_id').value) {
                $('text_invoice_number').textContent = 'Number: ' + number;
            }
        }).catch(function () {
            $('text_invoice_number').textContent = 'Number: —';
        });
    }

    /** Monta o payload da fatura. A validação definitiva é do servidor. */
    function collectInvoice() {
        return {
            clientId: $('select_invoice_client').value,
            issueDate: $('input_invoice_issue_date').value,
            dueDate: $('input_invoice_due_date').value,
            notes: $('input_invoice_notes').value,
            clientPaysGrossup: $('input_invoice_client_pays_grossup').checked,
            items: state.editingItems.filter(function (item) {
                return String(item.description).trim() || Finance.lineTotal(item) > 0;
            })
        };
    }

    function saveInvoice() {
        var id = $('input_invoice_id').value;
        var payload = collectInvoice();

        return (id ? Api.invoices.update(id, payload) : Api.invoices.create(payload))
            .then(function (invoice) {
                return reloadInvoices().then(function () {
                    return invoice;
                });
            });
    }

    function reloadInvoices() {
        return Api.invoices.list().then(function (invoices) {
            state.invoices = invoices;
            renderInvoices();
            renderDashboard();
        });
    }

    function renderInvoices() {
        var invoices = state.invoices.filter(function (invoice) {
            return state.invoiceFilter === 'todas' || Finance.statusOf(invoice) === state.invoiceFilter;
        });

        $('body_invoices').innerHTML = invoices.map(function (invoice) {
            var client = findClient(invoice.clientId);
            var status = Finance.statusOf(invoice);
            var toggleLabel = status === 'paga' ? 'Reopen' : 'Settle';
            var toggleTitle = status === 'paga'
                ? 'Revert the settlement of this invoice'
                : 'Confirm receipt of this invoice';

            return ''
                + '<tr>'
                + '<td class="cell-strong">' + Format.escape(invoice.number) + '</td>'
                + '<td>' + Format.escape(client ? client.name : 'Deleted client') + '</td>'
                + '<td>' + Format.date(invoice.dueDate) + '</td>'
                + '<td class="is-numeric">' + Format.money(invoice.gross) + '</td>'
                + '<td class="is-numeric cell-strong">' + Format.money(invoice.net) + '</td>'
                + '<td>' + statusBadge(status) + '</td>'
                + '<td class="is-actions"><div class="cell-actions">'
                + '<button type="button" class="btn--link" data-action="toggle-paid" data-id="' + invoice.id
                + '" title="' + toggleTitle + '">' + toggleLabel + '</button>'
                + '<button type="button" class="btn--link" data-action="pdf" data-id="' + invoice.id
                + '" title="Download this invoice as PDF">PDF</button>'
                + '<button type="button" class="btn--link" data-action="edit-invoice" data-id="' + invoice.id
                + '" title="Edit this invoice">Edit</button>'
                + '<button type="button" class="btn--link is-danger" data-action="delete-invoice" data-id="'
                + invoice.id + '" title="Delete this invoice">Delete</button>'
                + '</div></td>'
                + '</tr>';
        }).join('');

        $('text_invoices_empty').hidden = invoices.length > 0;
    }

    function findInvoice(id) {
        return state.invoices.filter(function (invoice) {
            return invoice.id === id;
        })[0] || null;
    }

    function editInvoice(id) {
        var invoice = findInvoice(id);
        if (!invoice) {
            return;
        }

        $('input_invoice_id').value = invoice.id;
        $('text_invoice_form_title').textContent = 'Editing invoice';
        $('text_invoice_number').textContent = 'Number: ' + invoice.number;
        refreshClientSelect();
        $('select_invoice_client').value = invoice.clientId;
        $('input_invoice_issue_date').value = invoice.issueDate;
        $('input_invoice_due_date').value = invoice.dueDate;
        $('input_invoice_notes').value = invoice.notes || '';
        $('input_invoice_client_pays_grossup').checked = Boolean(invoice.clientPaysGrossup);
        updateRegimeHint();

        state.editingItems = (invoice.items || []).map(function (item) {
            return { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice };
        });
        if (!state.editingItems.length) {
            state.editingItems = [{ description: '', quantity: 1, unitPrice: 0 }];
        }

        renderItems();
        updateClientHint();
        showView('invoices');
    }

    function togglePaid(id) {
        var invoice = findInvoice(id);
        if (!invoice) {
            return;
        }

        var paying = Finance.statusOf(invoice) !== 'paga';

        Api.invoices.setStatus(id, paying ? 'paga' : 'pendente')
            .then(reloadInvoices)
            .then(function () {
                toast(paying ? 'Settlement confirmed.' : 'Invoice reopened as pending.', 'success');
            })
            .catch(function (error) {
                toast(error.message, 'error');
            });
    }

    function deleteInvoice(id) {
        var invoice = findInvoice(id);

        if (!invoice || !global.confirm('Delete invoice ' + invoice.number + '?')) {
            return;
        }

        Api.invoices.remove(id)
            .then(function () {
                if ($('input_invoice_id').value === id) {
                    return resetInvoiceForm();
                }
                return null;
            })
            .then(reloadInvoices)
            .then(function () {
                toast('Invoice deleted.', 'success');
            })
            .catch(function (error) {
                toast(error.message, 'error');
            });
    }

    function exportPdf(invoice) {
        if (!invoice) {
            toast('Invoice not found.', 'error');
            return;
        }
        if (!state.issuer.name) {
            toast('Fill in the payee details before generating the PDF.', 'error');
            showView('issuer');
            return;
        }

        try {
            InvoicePdf.download(invoice, findClient(invoice.clientId) || { name: 'Deleted client' }, state.issuer);
            toast('PDF for invoice ' + invoice.number + ' generated.', 'success');
        } catch (error) {
            console.error(error);
            toast(error.message, 'error');
        }
    }

    function initInvoices() {
        $('input_invoice_client_pays_grossup').addEventListener('change', function () {
            updateRegimeHint();
            recalculateInvoice();
        });

        $('button_add_item').addEventListener('click', function () {
            addItem();
            var inputs = document.querySelectorAll('#list_invoice_items [data-field="description"]');
            inputs[inputs.length - 1].focus();
        });

        $('list_invoice_items').addEventListener('input', function (event) {
            var input = event.target.closest('[data-field]');
            if (!input) {
                return;
            }
            var index = Number(input.closest('.item').dataset.index);
            var field = input.dataset.field;
            state.editingItems[index][field] = field === 'description' ? input.value : Number(input.value);
            recalculateInvoice();
        });

        $('list_invoice_items').addEventListener('click', function (event) {
            var button = event.target.closest('[data-action="remove-item"]');
            if (button) {
                removeItem(Number(button.dataset.index));
            }
        });

        $('select_invoice_client').addEventListener('change', updateClientHint);
        $('button_reset_invoice').addEventListener('click', resetInvoiceForm);

        $('select_invoice_filter').addEventListener('change', function () {
            state.invoiceFilter = this.value;
            renderInvoices();
        });

        $('form_invoice').addEventListener('submit', function (event) {
            event.preventDefault();

            withBusy($('button_save_invoice'), function () {
                return saveInvoice().then(function (invoice) {
                    return resetInvoiceForm().then(function () {
                        toast('Invoice ' + invoice.number + ' saved.', 'success');
                    });
                });
            }).catch(function () { /* mensagem já exibida */ });
        });

        $('button_generate_pdf').addEventListener('click', function () {
            withBusy($('button_generate_pdf'), function () {
                return saveInvoice().then(function (invoice) {
                    exportPdf(invoice);
                    return resetInvoiceForm();
                });
            }).catch(function () { /* mensagem já exibida */ });
        });

        $('body_invoices').addEventListener('click', function (event) {
            var button = event.target.closest('button[data-action]');
            if (!button) {
                return;
            }
            var id = button.dataset.id;
            var actions = {
                'toggle-paid': function () {
                    togglePaid(id);
                },
                'edit-invoice': function () {
                    editInvoice(id);
                },
                'delete-invoice': function () {
                    deleteInvoice(id);
                },
                pdf: function () {
                    exportPdf(findInvoice(id));
                }
            };
            (actions[button.dataset.action] || function () { })();
        });
    }

    /* ============================================================
       Painel principal
       ============================================================ */

    function renderDashboard() {
        var month = $('input_dashboard_month').value || Format.currentMonth();
        var summary = Finance.summarize(state.invoices, month);

        $('text_dashboard_period').textContent = 'Billing volume for ' + Format.monthLabel(month);
        $('text_total_issued').textContent = Format.money(summary.issued.total);
        $('text_count_issued').textContent = summary.issued.count + ' invoice(s)';
        $('text_total_paid').textContent = Format.money(summary.paga.total);
        $('text_count_paid').textContent = summary.paga.count + ' invoice(s)';
        $('text_total_pending').textContent = Format.money(summary.pendente.total);
        $('text_count_pending').textContent = summary.pendente.count + ' invoice(s)';
        $('text_total_overdue').textContent = Format.money(summary.vencida.total);
        $('text_count_overdue').textContent = summary.vencida.count + ' invoice(s)';

        $('body_dashboard_invoices').innerHTML = summary.invoices.map(function (invoice) {
            var client = findClient(invoice.clientId);
            return ''
                + '<tr>'
                + '<td class="cell-strong">' + Format.escape(invoice.number) + '</td>'
                + '<td>' + Format.escape(client ? client.name : 'Deleted client') + '</td>'
                + '<td>' + Format.date(invoice.issueDate) + '</td>'
                + '<td>' + Format.date(invoice.dueDate) + '</td>'
                + '<td class="is-numeric">' + Format.money(invoice.gross) + '</td>'
                + '<td class="is-numeric cell-strong">' + Format.money(invoice.net) + '</td>'
                + '<td>' + statusBadge(Finance.statusOf(invoice)) + '</td>'
                + '</tr>';
        }).join('');

        $('text_dashboard_empty').hidden = summary.invoices.length > 0;
    }

    function initDashboard() {
        $('input_dashboard_month').value = Format.currentMonth();
        $('input_dashboard_month').addEventListener('change', renderDashboard);
    }

    /* ============================================================
       Acesso — login, cadastro e sessão
       ============================================================ */

    function setAuthMode(mode) {
        var registering = mode === 'register';

        $('form_login').hidden = registering;
        $('form_register').hidden = !registering;
        $('text_auth_title').textContent = registering ? 'Create your account' : 'Sign in to your account';
        $('text_auth_switch_label').textContent = registering
            ? 'Already have an account?'
            : "Don't have an account yet?";
        $('button_toggle_auth_mode').textContent = registering ? 'Sign in' : 'Create account';
        setHint($('text_login_status'), '');
        setHint($('text_register_status'), '');
        ($(registering ? 'input_register_name' : 'input_login_username')).focus();
    }

    function showAuth() {
        document.body.classList.remove('is-authenticated');
        $('view_auth').hidden = false;
        $('form_login').reset();
        $('form_register').reset();

        return Api.auth.status()
            .then(function (data) {
                setAuthMode(data.hasUsers ? 'login' : 'register');
                $('text_auth_subtitle').textContent = data.hasUsers
                    ? 'Each user can only access their own invoices.'
                    : 'No profile registered yet. Create the first one to get started.';
            })
            .catch(function (error) {
                setAuthMode('login');
                setHint($('text_login_status'), error.message, 'error');
            });
    }

    /** Carrega o espaço de trabalho do usuário e abre o painel. */
    function startSession(user) {
        state.user = user;
        $('text_session_user').textContent = user.name;

        return Promise.all([Api.issuer.get(), Api.clients.list(), Api.invoices.list()])
            .then(function (results) {
                state.issuer = results[0];
                state.clients = results[1];
                state.invoices = results[2];

                document.body.classList.add('is-authenticated');
                $('view_auth').hidden = true;

                loadIssuerForm();
                resetClientForm();
                renderClients();
                renderInvoices();
                renderDashboard();
                showView('dashboard');

                return resetInvoiceForm();
            })
            .then(function () {
                if (!state.issuer.name) {
                    showView('issuer');
                    toast('Start by filling in the payee details.');
                }
            });
    }

    /** Devolve a interface ao estado anônimo, sem manter dado do usuário anterior. */
    function clearSession() {
        state.user = null;
        state.issuer = null;
        state.clients = [];
        state.invoices = [];
        state.editingItems = [];
        return showAuth();
    }

    function initAuth() {
        $('button_toggle_auth_mode').addEventListener('click', function () {
            setAuthMode($('form_register').hidden ? 'register' : 'login');
        });

        $('button_logout').addEventListener('click', function () {
            Api.auth.logout().catch(function () { /* sessão já perdida */ }).then(function () {
                return clearSession();
            }).then(function () {
                toast('Signed out.');
            });
        });

        // O servidor recusou a sessão no meio do uso: volta ao login sem travar a tela.
        global.addEventListener(Api.SESSION_EXPIRED, function () {
            if (state.user) {
                clearSession().then(function () {
                    toast('Your session expired. Please sign in again.', 'error');
                });
            }
        });

        $('form_login').addEventListener('submit', function (event) {
            event.preventDefault();

            var status = $('text_login_status');
            setHint(status, 'Checking credentials…');

            withBusy($('button_login'), function () {
                return Api.auth.login($('input_login_username').value, $('input_login_password').value)
                    .then(function (data) {
                        $('form_login').reset();
                        setHint(status, '');
                        return startSession(data.user).then(function () {
                            toast('Welcome, ' + data.user.name + '.', 'success');
                        });
                    });
            }).catch(function (error) {
                setHint(status, error.message, 'error');
                $('input_login_password').value = '';
            });
        });

        $('form_register').addEventListener('submit', function (event) {
            event.preventDefault();

            var status = $('text_register_status');

            if ($('input_register_password').value !== $('input_register_confirm').value) {
                setHint(status, 'The confirmation does not match the password.', 'error');
                return;
            }

            setHint(status, 'Creating the account…');

            withBusy($('button_register'), function () {
                return Api.auth.register({
                    name: $('input_register_name').value,
                    username: $('input_register_username').value,
                    password: $('input_register_password').value
                }).then(function (data) {
                    $('form_register').reset();
                    setHint(status, '');
                    return startSession(data.user).then(function () {
                        toast('Account created.', 'success');
                    });
                });
            }).catch(function (error) {
                setHint(status, error.message, 'error');
            });
        });
    }

    /* ============================================================
       Bootstrap
       ============================================================ */

    function init() {
        initAuth();
        initNavigation();
        initTaxRegimeHelp();
        initIssuer();
        initClients();
        initInvoices();
        initDashboard();

        // Cookie httpOnly não é legível aqui: quem diz se há sessão é o servidor.
        Api.auth.me()
            .then(function (data) {
                return startSession(data.user);
            })
            .catch(function () {
                return showAuth();
            });
    }

    document.addEventListener('DOMContentLoaded', init);
})(window);
