/* =========================================================
   PresuFactu · Presupuestos y facturas
   ========================================================= */
(function () {
  "use strict";

  const $ = PF.$;
  const $$ = PF.$$;
  const esc = PF.esc;
  const icon = PF.icon;

  function S() { return Store.state; }

  const QUOTE_STATUS_OPTIONS = [
    ["draft", "Borrador"], ["sent", "Enviado"], ["accepted", "Aceptado"], ["rejected", "Rechazado"], ["invoiced", "Facturado"]
  ];
  const INVOICE_STATUS_OPTIONS = [
    ["draft", "Borrador"], ["issued", "Emitida"], ["paid", "Pagada"], ["cancelled", "Anulada"]
  ];

  const PAYMENT_METHODS = ["Transferencia", "Efectivo", "Tarjeta", "Bizum", "Domiciliación", "PayPal", "Otro"];

  function typeMeta(type) {
    return type === "invoice"
      ? { route: "facturas", label: "Factura", plural: "Facturas", article: "la", newLabel: "Nueva factura", prefix: "invoice" }
      : { route: "presupuestos", label: "Presupuesto", plural: "Presupuestos", article: "el", newLabel: "Nuevo presupuesto", prefix: "quote" };
  }

  function fmtQty(value) {
    const n = Store.num(value);
    return Store.fmtNumber(n, Number.isInteger(n) ? 0 : 2);
  }

  function vatLabel(rate) {
    return Store.num(rate) === 0 ? "Exento" : Store.num(rate) + "%";
  }

  /* ========================= LISTADO ========================= */

  function renderDocuments(type) {
    const meta = typeMeta(type);
    const view = $("#view");
    const f = PF.filters[meta.prefix];
    const years = availableYears(type);

    view.innerHTML =
      '<div class="page-head">' +
        "<div><h2>" + meta.plural + "</h2><p>" +
          (type === "invoice" ? "Emite, controla y cobra tus facturas." : "Crea propuestas y conviértelas en facturas.") +
        "</p></div>" +
        '<div class="page-actions">' +
          (type === "invoice"
            ? '<button class="btn" data-action="new-doc" data-type="quote">' + icon("file") + " Nuevo presupuesto</button>"
            : '<button class="btn" data-action="new-doc" data-type="invoice">' + icon("plus") + " Nueva factura</button>") +
          '<button class="btn btn-primary" data-action="new-doc" data-type="' + (type === "invoice" ? "invoice" : "quote") + '">' +
            icon("plus") + " " + meta.newLabel + "</button>" +
        "</div>" +
      "</div>" +
      '<div class="card">' +
        '<div class="toolbar">' +
          '<div class="search-box">' + icon("search") +
            '<input type="search" id="doc-search" placeholder="Buscar número o cliente…" value="' + esc(f.q) + '">' +
          "</div>" +
          '<select id="doc-status" aria-label="Filtrar por estado">' + statusFilterOptions(type, f.status) + "</select>" +
          '<select id="doc-year" aria-label="Filtrar por año"><option value="">Todos los años</option>' +
            years.map(function (year) {
              return '<option value="' + year + '"' + (String(f.year) === String(year) ? " selected" : "") + ">" + year + "</option>";
            }).join("") +
          "</select>" +
          '<span class="count" id="docs-count"></span>' +
        "</div>" +
        '<div id="docs-table-wrap">' + docsTableHTML(type) + "</div>" +
        '<div class="table-footer" id="docs-footer">' + docsFooterHTML(type) + "</div>" +
      "</div>";
    refreshDocuments(type);
  }

  function availableYears(type) {
    const set = {};
    S().documents.forEach(function (doc) {
      if (doc.type === type) set[Store.yearOf(doc.issueDate)] = true;
    });
    set[new Date().getFullYear()] = true;
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

  function statusFilterOptions(type, selected) {
    const list = type === "invoice"
      ? [["", "Todos los estados"], ["draft", "Borrador"], ["issued", "Emitida"], ["overdue", "Vencida"], ["paid", "Pagada"], ["cancelled", "Anulada"]]
      : [["", "Todos los estados"], ["draft", "Borrador"], ["sent", "Enviado"], ["accepted", "Aceptado"], ["rejected", "Rechazado"], ["invoiced", "Facturado"]];
    return list.map(function (item) {
      return '<option value="' + item[0] + '"' + (selected === item[0] ? " selected" : "") + ">" + item[1] + "</option>";
    }).join("");
  }

  function filteredDocs(type) {
    const f = PF.filters[type === "invoice" ? "invoice" : "quote"];
    const q = f.q.trim().toLowerCase();
    return S().documents.filter(function (doc) {
      if (doc.type !== type) return false;
      if (f.year && Store.yearOf(doc.issueDate) !== Number(f.year)) return false;
      if (f.status && Store.effectiveStatus(doc) !== f.status) return false;
      if (!q) return true;
      const client = doc.clientSnapshot || {};
      const haystack = [doc.number, client.name, client.nif, doc.notes, doc.subject].join(" ").toLowerCase();
      return haystack.indexOf(q) !== -1;
    }).sort(function (a, b) {
      return String(b.issueDate || "").localeCompare(String(a.issueDate || "")) ||
        String(b.number || "").localeCompare(String(a.number || ""), "es", { numeric: true });
    });
  }

  function docsTableHTML(type) {
    const list = filteredDocs(type);
    const meta = typeMeta(type);
    if (!list.length) {
      const any = S().documents.some(function (d) { return d.type === type; });
      return '<div class="empty-state">' +
        '<div class="empty-icon">' + icon(type === "invoice" ? "receipt" : "file") + "</div>" +
        "<h3>" + (any ? "Sin resultados" : "Todavía no hay " + meta.plural.toLowerCase()) + "</h3>" +
        "<p>" + (any ? "Prueba a cambiar los filtros de búsqueda." : "Crea " + meta.article + " " + meta.label.toLowerCase() + " y empieza a trabajar.") + "</p>" +
        (any ? "" : '<button class="btn btn-primary" data-action="new-doc" data-type="' + (type === "invoice" ? "invoice" : "quote") + '">' + icon("plus") + " " + meta.newLabel + "</button>") +
      "</div>";
    }
    return '<table class="data"><thead><tr>' +
      "<th>Documento</th><th>Cliente</th><th>Fecha</th><th>" + (type === "invoice" ? "Vencimiento" : "Validez") + "</th><th>Estado</th><th class=\"num\">Total</th><th></th>" +
      "</tr></thead><tbody>" +
      list.map(function (doc) {
        const client = doc.clientSnapshot || {};
        const canConvert = type === "quote" && ["draft", "sent", "accepted"].indexOf(doc.status) !== -1;
        return '<tr class="row-click" data-action="preview-doc" data-id="' + esc(doc.id) + '">' +
          '<td><div class="doc-number">' + esc(doc.number) + "</div>" +
            (doc.subject ? '<div class="cell-sub">' + esc(doc.subject) + "</div>" : "") + "</td>" +
          "<td><div class=\"cell-title\">" + esc(client.name || "Sin cliente") + "</div>" +
            '<div class="cell-sub">' + esc(client.nif || "") + "</div></td>" +
          '<td class="nowrap">' + esc(Store.fmtDate(doc.issueDate)) + "</td>" +
          '<td class="nowrap">' + esc(Store.fmtDate(doc.dueDate)) + "</td>" +
          "<td>" + PF.statusBadge(doc) + "</td>" +
          '<td class="num nowrap"><strong>' + esc(Store.fmtMoney(Store.documentTotal(doc))) + "</strong></td>" +
          '<td><div class="actions">' +
            '<button class="icon-btn tiny" title="Ver documento" data-action="preview-doc" data-id="' + esc(doc.id) + '">' + icon("eye") + "</button>" +
            '<button class="icon-btn tiny" title="Editar" data-action="edit-doc" data-id="' + esc(doc.id) + '">' + icon("edit") + "</button>" +
            (canConvert ? '<button class="icon-btn tiny" title="Convertir en factura" data-action="convert-doc" data-id="' + esc(doc.id) + '">' + icon("arrow-right") + "</button>" : "") +
            '<button class="icon-btn tiny danger" title="Eliminar" data-action="delete-doc" data-id="' + esc(doc.id) + '">' + icon("trash") + "</button>" +
          "</div></td>" +
        "</tr>";
      }).join("") +
      "</tbody></table>";
  }

  function docsFooterHTML(type) {
    const list = filteredDocs(type);
    let total = 0;
    list.forEach(function (doc) {
      if (Store.effectiveStatus(doc) !== "cancelled") total += Store.documentTotal(doc);
    });
    return '<div><span class="total-label">' + list.length + (list.length === 1 ? " documento" : " documentos") + "</span></div>" +
      '<div style="display:flex;align-items:baseline;gap:10px"><span class="total-label">Total</span>' +
      '<span class="total-value">' + esc(Store.fmtMoney(total)) + "</span></div>";
  }

  function refreshDocuments(type) {
    const wrap = document.getElementById("docs-table-wrap");
    if (wrap) wrap.innerHTML = docsTableHTML(type);
    const footer = document.getElementById("docs-footer");
    if (footer) footer.innerHTML = docsFooterHTML(type);
    const count = document.getElementById("docs-count");
    if (count) {
      const list = filteredDocs(type);
      count.textContent = list.length + (list.length === 1 ? " documento" : " documentos");
    }
  }

  /* ========================= FORMULARIO ========================= */

  function emptyLine(vat) {
    return { id: Store.uid("ln_"), description: "", qty: 1, price: 0, discount: 0, vat: vat === undefined ? Store.defaultVatRate() : vat };
  }

  function blankDoc(type, template) {
    const settings = S().settings;
    const base = template ? Store.clone(template) : null;
    const today = Store.todayISO();
    const days = type === "invoice" ? settings.billing.defaultPaymentDays : settings.billing.defaultValidDays;
    return {
      type: type,
      number: Store.peekNumber(type),
      status: type === "invoice" ? "issued" : "draft",
      issueDate: today,
      dueDate: Store.addDays(today, Number(days) || 0),
      dueDateManual: false,
      clientId: base ? base.clientId : "",
      subject: base ? base.subject || "" : "",
      paymentMethod: base ? base.paymentMethod : settings.billing.defaultPaymentMethod,
      globalDiscount: base ? Store.num(base.globalDiscount) : 0,
      irpfEnabled: base ? !!base.irpfEnabled : false,
      irpfRate: base ? Store.num(base.irpfRate) : Store.num(settings.taxes.irpfRate),
      notes: base ? base.notes || "" : "",
      lines: base && base.lines && base.lines.length
        ? base.lines.map(function (line) {
            return {
              id: Store.uid("ln_"),
              description: line.description,
              qty: Store.num(line.qty),
              price: Store.num(line.price),
              discount: Store.num(line.discount),
              vat: Store.num(line.vat)
            };
          })
        : [emptyLine()]
    };
  }

  function vatOptions(current) {
    const rates = Store.vatRates().slice();
    const exists = rates.some(function (r) { return Store.num(r.rate) === Store.num(current); });
    if (!exists) rates.push({ id: "custom", name: "IVA " + Store.num(current) + "%", rate: Store.num(current) });
    return rates.map(function (r) {
      return '<option value="' + Store.num(r.rate) + '"' + (Store.num(r.rate) === Store.num(current) ? " selected" : "") + ">" + esc(r.name) + "</option>";
    }).join("");
  }

  function statusOptions(type, current) {
    const list = type === "invoice" ? INVOICE_STATUS_OPTIONS : QUOTE_STATUS_OPTIONS;
    const options = list.slice();
    if (!options.some(function (item) { return item[0] === current; })) options.push([current, current]);
    return options.map(function (item) {
      return '<option value="' + item[0] + '"' + (item[0] === current ? " selected" : "") + ">" + item[1] + "</option>";
    }).join("");
  }

  function paymentOptions(current) {
    const list = PAYMENT_METHODS.slice();
    if (current && list.indexOf(current) === -1) list.push(current);
    return list.map(function (method) {
      return '<option value="' + esc(method) + '"' + (method === current ? " selected" : "") + ">" + esc(method) + "</option>";
    }).join("");
  }

  function lineRowHTML(line) {
    return '<tr class="line-row" data-line-id="' + esc(line.id) + '">' +
      '<td><input type="text" class="ln-desc" value="' + esc(line.description) + '" placeholder="Descripción del servicio o producto" aria-label="Descripción"></td>' +
      '<td><input type="number" class="ln-qty" value="' + esc(line.qty) + '" step="0.01" min="0" aria-label="Cantidad"></td>' +
      '<td><input type="number" class="ln-price" value="' + esc(line.price) + '" step="0.01" min="0" aria-label="Precio"></td>' +
      '<td><input type="number" class="ln-discount" value="' + esc(line.discount) + '" step="0.01" min="0" max="100" aria-label="Descuento"></td>' +
      '<td><select class="ln-vat" aria-label="IVA">' + vatOptions(line.vat) + "</select></td>" +
      '<td class="num line-total nowrap">—</td>' +
      '<td><button type="button" class="icon-btn tiny danger" data-action="remove-line" title="Quitar línea">' + icon("trash") + "</button></td>" +
    "</tr>";
  }

  function openDocumentForm(type, id, options) {
    options = options || {};
    const editing = id ? Store.getDocument(id) : null;
    if (id && !editing) return;
    const doc = editing ? Store.clone(editing) : blankDoc(type, options.template || null);
    const meta = typeMeta(type);
    const isEdit = !!editing;
    const title = isEdit ? "Editar " + meta.label.toLowerCase() : (options.template ? "Duplicar " + meta.label.toLowerCase() : meta.newLabel);
    const clients = S().clients.filter(function (c) { return !c.deletedAt; });

    if (!clients.length && !isEdit) {
      PF.openClientForm(null, { quick: false });
      PF.toast("Crea primero un cliente para poder emitir documentos.", "info");
      return;
    }

    const content =
      '<form id="doc-form" data-doc-id="' + esc(isEdit ? doc.id : "") + '" data-doc-type="' + esc(type) + '" autocomplete="off">' +
        '<div class="doc-form-grid">' +
          '<div class="doc-main">' +
            '<div class="form-section">' +
              '<div class="form-section-title">Cliente</div>' +
              '<div class="client-picker">' +
                '<label class="field"><span>Cliente *</span><select name="clientId">' + PF.clientOptions(doc.clientId) + "</select></label>" +
                '<button type="button" class="btn" data-action="quick-client">' + icon("plus") + " Nuevo</button>" +
              "</div>" +
              '<div id="client-hint" class="small muted"></div>' +
            "</div>" +

            '<div class="form-section">' +
              '<div class="form-section-title">Datos del documento</div>' +
              '<div class="form-grid">' +
                '<label class="field"><span>Número *</span><input type="text" name="number" value="' + esc(doc.number) + '" required></label>' +
                '<label class="field"><span>Estado</span><select name="status">' + statusOptions(type, doc.status) + "</select></label>" +
                '<label class="field"><span>Fecha de emisión *</span><input type="date" name="issueDate" value="' + esc(doc.issueDate) + '" required></label>' +
                '<label class="field"><span>' + (type === "invoice" ? "Vencimiento" : "Válido hasta") + '</span><input type="date" name="dueDate" value="' + esc(doc.dueDate) + '"></label>' +
                '<label class="field"><span>Forma de pago</span><select name="paymentMethod">' + paymentOptions(doc.paymentMethod) + "</select></label>" +
                '<label class="field"><span>Concepto / referencia</span><input type="text" name="subject" value="' + esc(doc.subject || "") + '" placeholder="Ej. Reforma de oficina"></label>' +
              "</div>" +
            "</div>" +

            '<div class="form-section">' +
              '<div class="lines-head"><div class="form-section-title" style="flex:1">Líneas</div>' +
                '<button type="button" class="quick-line-add" data-action="add-line">' + icon("plus") + " Añadir línea</button>" +
              "</div>" +
              '<div class="lines-wrap"><table class="lines-table">' +
                "<thead><tr><th class=\"col-desc\">Descripción</th><th class=\"col-qty num\">Cant.</th><th class=\"col-price num\">Precio</th>" +
                "<th class=\"col-disc num\">Dto. %</th><th class=\"col-vat\">IVA</th><th class=\"col-total num\">Importe</th><th class=\"col-del\"></th></tr></thead>" +
                '<tbody id="doc-lines-body">' + doc.lines.map(lineRowHTML).join("") + "</tbody>" +
              "</table></div>" +
            "</div>" +

            '<div class="form-section">' +
              '<div class="form-section-title">Notas y condiciones</div>' +
              '<label class="field"><textarea name="notes" placeholder="Texto que aparecerá en el documento…">' + esc(doc.notes || "") + "</textarea></label>" +
            "</div>" +
            '<div id="doc-form-error" class="form-error hidden"></div>' +
          "</div>" +

          '<aside>' +
            '<div class="summary-card">' +
              '<div class="form-section-title" style="margin-bottom:10px">Resumen</div>' +
              '<div class="summary-row"><span>Base imponible</span><span id="sum-base">—</span></div>' +
              '<div class="summary-row" id="sum-discount-row"><span>Descuento</span><span id="sum-discount">—</span></div>' +
              '<div id="sum-vat-rows"></div>' +
              '<div class="summary-row neg hidden" id="sum-irpf-row"><span>IRPF (<span id="sum-irpf-rate">0</span>%)</span><span id="sum-irpf">—</span></div>' +
              '<div class="summary-row total"><span>Total</span><span id="sum-total">—</span></div>' +
              '<div class="divider"></div>' +
              '<label class="field"><span>Descuento global (%)</span><input type="number" name="globalDiscount" min="0" max="100" step="0.01" value="' + esc(doc.globalDiscount) + '"></label>' +
              '<label class="inline-check" style="margin-top:12px"><input type="checkbox" name="irpfEnabled"' + (doc.irpfEnabled ? " checked" : "") + '> <span>Aplicar retención IRPF</span></label>' +
              '<label class="field" id="irpf-rate-field" style="margin-top:10px"><span>% de retención</span><input type="number" name="irpfRate" min="0" max="100" step="0.01" value="' + esc(doc.irpfRate) + '"></label>' +
              '<p class="summary-note">Los importes se calculan automáticamente. El descuento global se reparte proporcionalmente entre las líneas a efectos de IVA.</p>' +
            "</div>" +
          "</aside>" +
        "</div>" +
      "</form>";

    PF.openModal({
      title: title,
      subtitle: isEdit ? "Modifica los datos y guarda los cambios" : "Completa los datos del documento",
      size: "xl",
      content: content,
      footer:
        '<button type="button" class="btn btn-ghost" data-close="1">Cancelar</button>' +
        '<button type="submit" form="doc-form" class="btn btn-primary">' + (isEdit ? "Guardar cambios" : "Crear " + meta.label.toLowerCase()) + "</button>"
    });

    refreshClientHint();
    recalcDocForm();
  }

  function readLine(row) {
    return {
      id: row.getAttribute("data-line-id") || Store.uid("ln_"),
      description: row.querySelector(".ln-desc").value.trim(),
      qty: Store.num(row.querySelector(".ln-qty").value),
      price: Store.num(row.querySelector(".ln-price").value),
      discount: Store.num(row.querySelector(".ln-discount").value),
      vat: Store.num(row.querySelector(".ln-vat").value)
    };
  }

  function readDocForm(form) {
    return {
      type: form.getAttribute("data-doc-type"),
      number: form.elements.number.value.trim(),
      status: form.elements.status.value,
      issueDate: form.elements.issueDate.value,
      dueDate: form.elements.dueDate.value,
      clientId: form.elements.clientId.value,
      subject: form.elements.subject.value.trim(),
      paymentMethod: form.elements.paymentMethod.value,
      globalDiscount: Store.num(form.elements.globalDiscount.value),
      irpfEnabled: !!form.elements.irpfEnabled.checked,
      irpfRate: Store.num(form.elements.irpfRate.value),
      notes: form.elements.notes.value.trim(),
      lines: $$(".line-row", form).map(readLine)
    };
  }

  function recalcDocForm() {
    const form = document.getElementById("doc-form");
    if (!form) return;
    const doc = readDocForm(form);
    const totals = Store.computeTotals(doc);

    $$(".line-row", form).forEach(function (row) {
      const line = readLine(row);
      const base = Store.num(line.qty) * Store.num(line.price) * (1 - Store.num(line.discount) / 100);
      const cell = row.querySelector(".line-total");
      if (cell) cell.textContent = Store.fmtMoney(base);
    });

    const setText = function (id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText("sum-base", Store.fmtMoney(totals.base));
    setText("sum-discount", totals.discountAmount > 0 ? "-" + Store.fmtMoney(totals.discountAmount) : "—");
    setText("sum-total", Store.fmtMoney(totals.total));
    setText("sum-irpf-rate", Store.fmtNumber(doc.irpfRate, doc.irpfRate % 1 === 0 ? 0 : 2));

    const vatRows = document.getElementById("sum-vat-rows");
    if (vatRows) {
      vatRows.innerHTML = totals.breakdown.map(function (group) {
        return '<div class="summary-row"><span>' + esc(group.rate === 0 ? "IVA exento" : "IVA " + group.rate + "%") +
          ' <span class="muted" style="font-size:11px">(' + esc(Store.fmtMoney(group.taxable)) + ")</span></span>" +
          "<span>" + esc(Store.fmtMoney(group.amount)) + "</span></div>";
      }).join("");
    }

    const irpfRow = document.getElementById("sum-irpf-row");
    if (irpfRow) {
      irpfRow.classList.toggle("hidden", !doc.irpfEnabled);
      setText("sum-irpf", "-" + Store.fmtMoney(totals.irpfAmount));
    }
    const rateField = document.getElementById("irpf-rate-field");
    if (rateField) rateField.classList.toggle("hidden", !doc.irpfEnabled);
  }

  function refreshClientHint() {
    const form = document.getElementById("doc-form");
    const hint = document.getElementById("client-hint");
    if (!form || !hint) return;
    const client = Store.getClient(form.elements.clientId.value);
    if (!client) {
      hint.innerHTML = "Selecciona un cliente o créalo con el botón «Nuevo».";
      return;
    }
    const parts = [
      client.nif,
      [client.address, [client.zip, client.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      client.email,
      client.phone
    ].filter(Boolean);
    hint.textContent = parts.join(" · ");
  }

  function saveDocForm(form) {
    const id = form.getAttribute("data-doc-id") || "";
    const doc = readDocForm(form);
    doc.lines = doc.lines.filter(function (line) {
      return line.description || Store.num(line.qty) > 0 || Store.num(line.price) > 0;
    });
    const errorEl = document.getElementById("doc-form-error");
    const fail = function (message) {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
        errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    };
    const validation = Store.validateDocument(doc);
    if (validation) return fail(validation);
    const duplicate = S().documents.some(function (other) {
      return other.id !== id && other.type === doc.type && String(other.number).toLowerCase() === doc.number.toLowerCase();
    });
    if (duplicate) return fail("Ya existe " + (doc.type === "invoice" ? "una factura" : "un presupuesto") + " con el número " + doc.number + ".");

    const previous = id ? Store.getDocument(id) : null;
    if (doc.type === "invoice" && doc.status === "paid") {
      doc.paidDate = (previous && previous.paidDate) || Store.todayISO();
    } else if (previous && previous.paidDate) {
      doc.paidDate = "";
    }

    const saved = Store.saveDocument(doc, id || null);
    PF.closeTopModal();
    PF.updateShell();
    PF.renderRoute(PF.currentRouteName());
    PF.toast((id ? "Documento actualizado: " : "Documento creado: ") + saved.number, "success");
    void previous;
  }

  function addLine() {
    const body = document.getElementById("doc-lines-body");
    if (!body) return;
    const line = emptyLine();
    body.insertAdjacentHTML("beforeend", lineRowHTML(line));
    recalcDocForm();
    const rows = $$(".line-row", body);
    const last = rows[rows.length - 1];
    if (last) last.querySelector(".ln-desc").focus();
  }

  function removeLine(button) {
    const row = button.closest(".line-row");
    if (!row) return;
    const body = document.getElementById("doc-lines-body");
    row.remove();
    if (body && !body.querySelector(".line-row")) {
      body.insertAdjacentHTML("beforeend", lineRowHTML(emptyLine()));
    }
    recalcDocForm();
  }

  /* ========================= VISTA PREVIA E IMPRESIÓN ========================= */

  function openPreview(id) {
    const doc = Store.getDocument(id);
    if (!doc) return;
    const meta = typeMeta(doc.type);
    const info = PF.statusInfo(doc);
    const unpaid = doc.type === "invoice" && ["issued", "overdue"].indexOf(Store.effectiveStatus(doc)) !== -1;
    const canConvert = doc.type === "quote" && ["draft", "sent", "accepted"].indexOf(doc.status) !== -1;

    const leftButtons =
      '<button type="button" class="btn" data-action="print-doc" data-id="' + esc(doc.id) + '">' + icon("print") + " Imprimir / PDF</button>" +
      '<button type="button" class="btn" data-action="duplicate-doc" data-id="' + esc(doc.id) + '">' + icon("copy") + " Duplicar</button>" +
      (canConvert ? '<button type="button" class="btn btn-soft" data-action="convert-doc" data-id="' + esc(doc.id) + '">' + icon("arrow-right") + " Facturar</button>" : "") +
      (unpaid ? '<button type="button" class="btn btn-soft" data-action="pay-doc" data-id="' + esc(doc.id) + '">' + icon("check") + " Marcar pagada</button>" : "");

    PF.openModal({
      title: meta.label + " " + doc.number,
      subtitle: "Vista previa del documento",
      size: "lg",
      bodyClass: "preview-body",
      content:
        '<div class="preview-bar">' +
          '<div class="info"><strong>' + esc(doc.clientSnapshot && doc.clientSnapshot.name ? doc.clientSnapshot.name : "Sin cliente") + "</strong> · " +
            esc(Store.fmtMoney(Store.documentTotal(doc))) + "</div>" +
          PF.statusBadge(doc) +
        "</div>" +
        paperHTML(doc),
      footer:
        '<div class="left">' + leftButtons + "</div>" +
        '<button type="button" class="btn" data-action="edit-doc" data-id="' + esc(doc.id) + '">' + icon("edit") + " Editar</button>" +
        '<button type="button" class="btn btn-primary" data-close="1">Cerrar</button>'
    });
    void info;
  }

  function paperHTML(doc) {
    const settings = S().settings;
    const company = settings.company;
    const isInvoice = doc.type === "invoice";
    const client = doc.clientSnapshot && doc.clientSnapshot.name
      ? doc.clientSnapshot
      : Store.snapshotClient(Store.getClient(doc.clientId));
    const totals = Store.computeTotals(doc);
    const hasLineDiscount = (doc.lines || []).some(function (line) { return Store.num(line.discount) > 0; });

    const companyLines = [
      company.address,
      [company.zip, company.city].filter(Boolean).join(" "),
      company.country,
      company.phone ? "Tel. " + company.phone : "",
      company.email,
      company.web
    ].filter(Boolean);

    const clientLines = [
      client.nif ? "NIF/CIF: " + client.nif : "",
      client.address,
      [client.zip, client.city].filter(Boolean).join(" "),
      client.country,
      client.email,
      client.phone ? "Tel. " + client.phone : ""
    ].filter(Boolean);

    const itemsRows = (doc.lines || []).map(function (line) {
      const base = Store.num(line.qty) * Store.num(line.price) * (1 - Store.num(line.discount) / 100);
      return "<tr>" +
        "<td>" + esc(line.description) + "</td>" +
        '<td class="num">' + esc(fmtQty(line.qty)) + "</td>" +
        '<td class="num">' + esc(Store.fmtMoney(line.price)) + "</td>" +
        (hasLineDiscount ? '<td class="num">' + (Store.num(line.discount) > 0 ? esc(Store.fmtNumber(line.discount, 2)) + "%" : "—") + "</td>" : "") +
        '<td class="num">' + esc(vatLabel(line.vat)) + "</td>" +
        '<td class="num">' + esc(Store.fmtMoney(base)) + "</td>" +
      "</tr>";
    }).join("");

    let totalsHTML = "";
    if (totals.discountAmount > 0) {
      totalsHTML += '<div class="row"><span>Subtotal</span><span>' + esc(Store.fmtMoney(totals.grossBase)) + "</span></div>";
      totalsHTML += '<div class="row discount"><span>Descuento' + (Store.num(doc.globalDiscount) > 0 ? " " + esc(Store.fmtNumber(doc.globalDiscount, 2)) + "%" : "") + "</span><span>-" + esc(Store.fmtMoney(totals.discountAmount)) + "</span></div>";
    }
    totalsHTML += '<div class="row"><span>Base imponible</span><span>' + esc(Store.fmtMoney(totals.base)) + "</span></div>";
    totals.breakdown.forEach(function (group) {
      totalsHTML += '<div class="row"><span>' + esc(group.rate === 0 ? "IVA exento" : "IVA " + group.rate + "%") +
        ' <span class="vat-note">(' + esc(Store.fmtMoney(group.taxable)) + ")</span></span><span>" +
        esc(Store.fmtMoney(group.amount)) + "</span></div>";
    });
    if (doc.irpfEnabled) {
      totalsHTML += '<div class="row"><span>Retención IRPF (' + esc(Store.fmtNumber(doc.irpfRate, doc.irpfRate % 1 === 0 ? 0 : 2)) + "%)</span><span>-" +
        esc(Store.fmtMoney(totals.irpfAmount)) + "</span></div>";
    }
    totalsHTML += '<div class="row total"><span>Total</span><span>' + esc(Store.fmtMoney(totals.total)) + "</span></div>";

    const stamp = statusStamp(doc);
    const notes = doc.notes || settings.billing.defaultNotes;
    const legal = isInvoice ? settings.billing.legalFooter : settings.billing.quoteTerms;
    const footerLines = [];
    if (doc.paymentMethod) footerLines.push("Forma de pago: " + doc.paymentMethod);
    if (company.iban) footerLines.push("IBAN: " + company.iban);
    if (legal) footerLines.push(legal);
    const fiscal = [
      company.name,
      company.nif ? "NIF/CIF: " + company.nif : "",
      [company.address, [company.zip, company.city].filter(Boolean).join(" "), company.country].filter(Boolean).join(", "),
      company.phone ? "Tel. " + company.phone : "",
      company.email,
      company.web
    ].filter(Boolean).join(" · ");
    if (fiscal) footerLines.push(fiscal);

    return '<div class="paper">' +
      '<div class="paper-head">' +
        '<div class="paper-company">' +
          (company.logo ? '<img class="paper-logo" src="' + esc(company.logo) + '" alt="Logo de la empresa">' : "") +
          "<div>" +
            "<h1>" + esc(company.name || "Tu empresa") + "</h1>" +
            '<div class="paper-meta">' + companyLines.map(esc).join("<br>") + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="paper-doc-type">' +
          '<span class="type-label">' + (isInvoice ? "Factura" : "Presupuesto") + "</span>" +
          '<div class="type-number">' + esc(doc.number) + "</div>" +
          '<div class="type-dates">Emisión: ' + esc(Store.fmtDate(doc.issueDate)) + "<br>" +
            (isInvoice ? "Vencimiento" : "Válido hasta") + ": " + esc(Store.fmtDate(doc.dueDate)) + "</div>" +
          stamp +
        "</div>" +
      "</div>" +

      '<div class="paper-parties">' +
        '<div class="paper-party">' +
          '<div class="label">' + (isInvoice ? "Facturar a" : "Presupuesto para") + "</div>" +
          "<strong>" + esc(client.name || "Cliente") + "</strong>" +
          '<div class="line">' + clientLines.map(esc).join("<br>") + "</div>" +
        "</div>" +
        '<div class="paper-party">' +
          '<div class="label">Detalles</div>' +
          '<div class="line">' + (doc.paymentMethod ? "Forma de pago: " + esc(doc.paymentMethod) : "") + "</div>" +
          '<div class="line">Estado: ' + esc(PF.statusLabel(doc)) + "</div>" +
        "</div>" +
      "</div>" +

      (doc.subject ? '<div class="paper-desc"><strong>Concepto:</strong> ' + esc(doc.subject) + "</div>" : "") +

      '<table class="items"><thead><tr>' +
        "<th>Descripción</th>" +
        '<th class="num">Cant.</th>' +
        '<th class="num">Precio</th>' +
        (hasLineDiscount ? '<th class="num">Dto.</th>' : "") +
        '<th class="num">IVA</th>' +
        '<th class="num">Importe</th>' +
      "</tr></thead><tbody>" + itemsRows + "</tbody></table>" +

      '<div class="paper-bottom">' +
        '<div class="paper-notes">' +
          (notes ? '<div class="label">Notas</div><p>' + esc(notes) + "</p>" : "") +
        "</div>" +
        '<div class="paper-totals">' + totalsHTML + "</div>" +
      "</div>" +

      '<div class="paper-footer">' + footerLines.map(function (line) { return "<div>" + esc(line) + "</div>"; }).join("") + "</div>" +
    "</div>";
  }

  function statusStamp(doc) {
    const status = Store.effectiveStatus(doc);
    if (doc.type === "invoice" && status === "paid") return '<span class="paper-status-stamp stamp-paid">Pagada</span>';
    if (doc.type === "invoice" && status === "cancelled") return '<span class="paper-status-stamp stamp-cancelled">Anulada</span>';
    if (status === "draft") return '<span class="paper-status-stamp stamp-draft">Borrador</span>';
    return "";
  }

  function printDoc(id) {
    const doc = Store.getDocument(id);
    if (!doc) return;
    $("#print-root").innerHTML = paperHTML(doc);
    setTimeout(function () { window.print(); }, 80);
  }

  /* ========================= ACCIONES ========================= */

  function duplicateDoc(id) {
    const doc = Store.getDocument(id);
    if (!doc) return;
    PF.closeTopModal();
    openDocumentForm(doc.type, null, { template: doc });
    PF.toast("Documento duplicado como borrador. Revisa el número y guarda.", "info");
  }

  async function convertDoc(id) {
    const quote = Store.getDocument(id);
    if (!quote || quote.type !== "quote") return;
    if (quote.status === "invoiced") {
      PF.toast("Este presupuesto ya se convirtió en factura.", "warning");
      return;
    }
    const ok = await PF.confirmDialog({
      title: "Convertir en factura",
      message: "Se creará una factura con las líneas y el cliente del presupuesto <strong>" + esc(quote.number) +
        "</strong>. El presupuesto quedará marcado como facturado.",
      confirmText: "Crear factura"
    });
    if (!ok) return;

    const settings = S().settings;
    const invoice = Store.saveDocument({
      type: "invoice",
      number: Store.peekNumber("invoice"),
      status: "issued",
      issueDate: Store.todayISO(),
      dueDate: Store.addDays(Store.todayISO(), Number(settings.billing.defaultPaymentDays) || 0),
      clientId: quote.clientId,
      clientSnapshot: quote.clientSnapshot,
      subject: quote.subject || "",
      paymentMethod: quote.paymentMethod,
      globalDiscount: quote.globalDiscount,
      irpfEnabled: quote.irpfEnabled,
      irpfRate: quote.irpfRate,
      notes: quote.notes,
      lines: Store.clone(quote.lines)
    });
    Store.saveDocument({ status: "invoiced", invoiceId: invoice.id }, quote.id);
    PF.closeAllModals();
    PF.updateShell();
    if (window.location.hash !== "#/facturas") {
      window.location.hash = "#/facturas";
    } else {
      PF.renderRoute("facturas");
    }
    setTimeout(function () { openPreview(invoice.id); }, 150);
    PF.toast("Factura " + invoice.number + " creada desde el presupuesto.", "success");
  }

  async function markPaid(id) {
    const doc = Store.getDocument(id);
    if (!doc || doc.type !== "invoice") return;
    const ok = await PF.confirmDialog({
      title: "Marcar como pagada",
      message: "¿Confirmas que la factura <strong>" + esc(doc.number) + "</strong> por " +
        esc(Store.fmtMoney(Store.documentTotal(doc))) + " ya está cobrada?",
      confirmText: "Sí, está pagada"
    });
    if (!ok) return;
    Store.saveDocument({ status: "paid", paidDate: Store.todayISO() }, doc.id);
    PF.closeAllModals();
    PF.updateShell();
    PF.renderRoute(PF.currentRouteName());
    PF.toast("Factura marcada como pagada.", "success");
  }

  async function deleteDoc(id) {
    const doc = Store.getDocument(id);
    if (!doc) return;
    const ok = await PF.confirmDialog({
      title: "Eliminar documento",
      message: "¿Seguro que quieres eliminar " + (doc.type === "invoice" ? "la factura " : "el presupuesto ") +
        "<strong>" + esc(doc.number) + "</strong>? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    Store.deleteDocument(id);
    PF.closeAllModals();
    PF.updateShell();
    PF.renderRoute(PF.currentRouteName());
    PF.toast("Documento eliminado.", "success");
  }

  Object.assign(PF, {
    renderDocuments: renderDocuments,
    refreshDocuments: refreshDocuments,
    openDocumentForm: openDocumentForm,
    saveDocForm: saveDocForm,
    recalcDocForm: recalcDocForm,
    refreshClientHint: refreshClientHint,
    addLine: addLine,
    removeLine: removeLine,
    openPreview: openPreview,
    paperHTML: paperHTML,
    printDoc: printDoc,
    duplicateDoc: duplicateDoc,
    convertDoc: convertDoc,
    markPaid: markPaid,
    deleteDoc: deleteDoc
  });
})();
