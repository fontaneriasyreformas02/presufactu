/* =========================================================
   PresuFactu · Ajustes y sincronización
   ========================================================= */
(function () {
  "use strict";

  const $ = PF.$;
  const $$ = PF.$$;
  const esc = PF.esc;
  const icon = PF.icon;

  function S() { return Store.state; }

  const NAV = [
    ["empresa", "Empresa", "building"],
    ["impuestos", "Impuestos", "percent"],
    ["moneda", "Moneda", "coins"],
    ["numeracion", "Numeración", "hash"],
    ["facturacion", "Facturación", "receipt"],
    ["sheets", "Google Sheets", "cloud"],
    ["seguridad", "Seguridad", "shield"],
    ["datos", "Datos", "database"]
  ];

  function cardHead(iconName, title, subtitle, extra) {
    return '<div class="card-head"><div class="icon-wrap">' + icon(iconName) + "</div>" +
      '<div class="grow"><h3>' + esc(title) + "</h3><p>" + esc(subtitle) + "</p></div>" +
      (extra || "") + "</div>";
  }

  function renderSettings() {
    const settings = S().settings;
    const navHTML = NAV.map(function (item) {
      return '<button type="button" class="settings-link" data-action="settings-jump" data-target="' + item[0] + '">' +
        icon(item[2]) + " " + esc(item[1]) + "</button>";
    }).join("");

    $("#view").innerHTML =
      '<div class="page-head">' +
        '<div><h2>Ajustes</h2><p>Configura tu empresa, impuestos, numeración y copia de seguridad.</p></div>' +
        '<div class="page-actions">' +
          '<button class="btn" data-action="export-json">' + icon("download") + " Descargar copia</button>" +
          '<button class="btn btn-primary" data-action="new-doc" data-type="invoice">' + icon("plus") + " Nueva factura</button>" +
        "</div>" +
      "</div>" +
      '<div class="settings-layout">' +
        '<nav class="settings-nav">' + navHTML + "</nav>" +
        '<div class="settings-content">' +
          companyCard(settings) +
          taxesCard(settings) +
          currencyCard(settings) +
          numberingCard(settings) +
          billingCard(settings) +
          sheetsCard(settings) +
          securityCard() +
          dataCard() +
        "</div>" +
      "</div>";

    PF.updateSyncUI();
    updateCurrencyPreview();
    updateNumberingPreview();
  }

  /* ========================= EMPRESA ========================= */

  function companyCard(settings) {
    const c = settings.company;
    const logo = c.logo
      ? '<img src="' + esc(c.logo) + '" alt="Logo">'
      : "<span>Sin logo</span>";
    return '<section class="card settings-card" id="settings-empresa">' +
      cardHead("building", "Datos de la empresa", "Aparecerán en la cabecera de tus presupuestos y facturas") +
      '<form id="settings-company" autocomplete="off">' +
        '<div class="settings-body">' +
          '<div class="logo-row">' +
            '<div class="logo-preview" id="logo-preview">' + logo + "</div>" +
            '<div class="logo-actions">' +
              '<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden">' +
              '<input type="hidden" name="logo" id="logo-data" value="' + esc(c.logo) + '">' +
              '<button type="button" class="btn btn-sm" data-action="upload-logo">' + icon("upload") + " Subir logo</button>" +
              '<button type="button" class="btn btn-sm btn-ghost" data-action="remove-logo">Quitar logo</button>' +
              '<span class="hint">PNG, JPG o WebP. Se ajusta automáticamente al documento.</span>' +
            "</div>" +
          "</div>" +
          '<div class="form-grid">' +
            '<label class="field span-2"><span>Nombre o razón social *</span><input type="text" name="name" value="' + esc(c.name) + '" placeholder="Ej. Estudio Sierra S.L." required></label>' +
            '<label class="field"><span>NIF / CIF</span><input type="text" name="nif" value="' + esc(c.nif) + '" placeholder="B12345678"></label>' +
            '<label class="field"><span>Teléfono</span><input type="tel" name="phone" value="' + esc(c.phone) + '" placeholder="912 345 678"></label>' +
            '<label class="field span-2"><span>Dirección</span><input type="text" name="address" value="' + esc(c.address) + '" placeholder="Calle, número, piso…"></label>' +
            '<label class="field"><span>Código postal</span><input type="text" name="zip" value="' + esc(c.zip) + '" placeholder="28001"></label>' +
            '<label class="field"><span>Ciudad</span><input type="text" name="city" value="' + esc(c.city) + '" placeholder="Madrid"></label>' +
            '<label class="field"><span>País</span><input type="text" name="country" value="' + esc(c.country) + '"></label>' +
            '<label class="field"><span>Email</span><input type="email" name="email" value="' + esc(c.email) + '" placeholder="hola@empresa.es"></label>' +
            '<label class="field"><span>Web</span><input type="text" name="web" value="' + esc(c.web) + '" placeholder="www.empresa.es"></label>' +
            '<label class="field"><span>IBAN</span><input type="text" name="iban" value="' + esc(c.iban) + '" placeholder="ES00 0000 0000 0000 0000 0000"></label>' +
          "</div>" +
        "</div>" +
        '<div class="settings-foot"><span class="desc">Estos datos se guardan en este dispositivo y se sincronizan con tu hoja de Google.</span>' +
          '<button type="submit" class="btn btn-primary">Guardar empresa</button></div>' +
      "</form>" +
    "</section>";
  }

  /* ========================= IMPUESTOS ========================= */

  function taxRowHTML(tax, defaultId) {
    return '<div class="tax-row" data-tax-id="' + esc(tax.id) + '">' +
      '<input type="text" class="vat-name" value="' + esc(tax.name) + '" placeholder="Ej. IVA 21%" aria-label="Nombre del impuesto">' +
      '<input type="number" class="vat-rate" value="' + esc(tax.rate) + '" step="0.01" min="0" max="100" placeholder="%" aria-label="Porcentaje">' +
      '<label class="default-flag"><input type="radio" name="defaultVat" value="' + esc(tax.id) + '"' + (tax.id === defaultId ? " checked" : "") + "> Predeterminado</label>" +
      '<button type="button" class="icon-btn tiny danger" data-action="remove-tax-row" title="Eliminar tipo">' + icon("trash") + "</button>" +
    "</div>";
  }

  function taxesCard(settings) {
    const taxes = settings.taxes;
    return '<section class="card settings-card" id="settings-impuestos">' +
      cardHead("percent", "Impuestos", "Tipos de IVA y retención de IRPF") +
      '<form id="settings-taxes" autocomplete="off">' +
        '<div class="settings-body">' +
          '<p class="muted small">Define los tipos que podrás aplicar en cada línea: IVA general, reducido, superreducido o exento. El tipo predeterminado se usará en las nuevas líneas.</p>' +
          '<div class="tax-list" id="tax-list">' +
            taxes.rates.map(function (tax) { return taxRowHTML(tax, taxes.defaultVatId); }).join("") +
          "</div>" +
          '<div><button type="button" class="btn btn-sm" data-action="add-tax-row">' + icon("plus") + " Añadir tipo de IVA</button></div>" +
          '<div class="form-grid">' +
            '<label class="inline-check span-2"><input type="checkbox" name="irpfEnabled"' + (taxes.irpfEnabled ? " checked" : "") + ">" +
              "<span>Activar retención de IRPF<span class=\"hint\">Se podrá aplicar documento a documento. Habitual en profesionales autónomos.</span></span></label>" +
            '<label class="field"><span>% de IRPF por defecto</span><input type="number" name="irpfRate" min="0" max="100" step="0.01" value="' + esc(taxes.irpfRate) + '"></label>' +
          "</div>" +
        "</div>" +
        '<div class="settings-foot"><span class="desc">Los documentos ya creados conservan el porcentaje con el que se emitieron.</span>' +
          '<button type="submit" class="btn btn-primary">Guardar impuestos</button></div>' +
      "</form>" +
    "</section>";
  }

  /* ========================= MONEDA ========================= */

  function currencyCard(settings) {
    const c = settings.currency;
    return '<section class="card settings-card" id="settings-moneda">' +
      cardHead("coins", "Moneda y formato", "Símbolo y decimales de los importes") +
      '<form id="settings-currency" autocomplete="off">' +
        '<div class="settings-body">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Código ISO</span><input type="text" name="code" value="' + esc(c.code) + '" maxlength="4" placeholder="EUR"></label>' +
            '<label class="field"><span>Símbolo</span><input type="text" name="symbol" value="' + esc(c.symbol) + '" maxlength="4" placeholder="€"></label>' +
            '<label class="field"><span>Posición del símbolo</span><select name="position">' +
              '<option value="after"' + (c.position === "after" ? " selected" : "") + ">Después (1.234,56 €)</option>" +
              '<option value="before"' + (c.position === "before" ? " selected" : "") + ">Antes (€ 1.234,56)</option>" +
            "</select></label>" +
            '<label class="field"><span>Decimales</span><input type="number" name="decimals" min="0" max="4" step="1" value="' + esc(c.decimals) + '"></label>' +
          "</div>" +
          '<div class="number-preview">Ejemplo de importe: <code id="currency-preview">—</code></div>' +
        "</div>" +
        '<div class="settings-foot"><span class="desc">El formato se aplica a toda la aplicación y a los documentos.</span>' +
          '<button type="submit" class="btn btn-primary">Guardar moneda</button></div>' +
      "</form>" +
    "</section>";
  }

  /* ========================= NUMERACIÓN ========================= */

  function numberingCard(settings) {
    const n = settings.numbering;
    return '<section class="card settings-card" id="settings-numeracion">' +
      cardHead("hash", "Numeración de documentos", "Prefijos y correlativos de facturas y presupuestos") +
      '<form id="settings-numbering" autocomplete="off">' +
        '<div class="settings-body">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Prefijo de factura</span><input type="text" name="invoicePrefix" value="' + esc(n.invoicePrefix) + '" placeholder="FAC"></label>' +
            '<label class="field"><span>Prefijo de presupuesto</span><input type="text" name="quotePrefix" value="' + esc(n.quotePrefix) + '" placeholder="PRE"></label>' +
            '<label class="field"><span>Próximo nº de factura</span><input type="number" name="nextInvoice" min="1" step="1" value="' + esc(n.nextInvoice) + '"></label>' +
            '<label class="field"><span>Próximo nº de presupuesto</span><input type="number" name="nextQuote" min="1" step="1" value="' + esc(n.nextQuote) + '"></label>' +
            '<label class="field"><span>Dígitos del correlativo</span><input type="number" name="padding" min="1" max="10" step="1" value="' + esc(n.padding) + '"></label>' +
            '<label class="inline-check" style="align-self:end;padding-bottom:9px"><input type="checkbox" name="resetYearly"' + (n.resetYearly ? " checked" : "") + "><span>Incluir año y reiniciar cada año</span></label>" +
          "</div>" +
          '<div class="number-preview">Próxima factura: <code id="next-invoice-preview">—</code> · Próximo presupuesto: <code id="next-quote-preview">—</code></div>' +
        "</div>" +
        '<div class="settings-foot"><span class="desc">El contador se actualiza automáticamente al guardar cada documento. Puedes editar el número manualmente.</span>' +
          '<button type="submit" class="btn btn-primary">Guardar numeración</button></div>' +
      "</form>" +
    "</section>";
  }

  /* ========================= FACTURACIÓN ========================= */

  function billingCard(settings) {
    const b = settings.billing;
    const methods = ["Transferencia", "Efectivo", "Tarjeta", "Bizum", "Domiciliación", "PayPal", "Otro"];
    return '<section class="card settings-card" id="settings-facturacion">' +
      cardHead("receipt", "Facturación por defecto", "Plazos, notas y textos legales") +
      '<form id="settings-billing" autocomplete="off">' +
        '<div class="settings-body">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Días de vencimiento (factura)</span><input type="number" name="defaultPaymentDays" min="0" max="365" step="1" value="' + esc(b.defaultPaymentDays) + '"></label>' +
            '<label class="field"><span>Días de validez (presupuesto)</span><input type="number" name="defaultValidDays" min="0" max="365" step="1" value="' + esc(b.defaultValidDays) + '"></label>' +
            '<label class="field"><span>Forma de pago habitual</span><select name="defaultPaymentMethod">' +
              methods.map(function (m) { return '<option value="' + esc(m) + '"' + (m === b.defaultPaymentMethod ? " selected" : "") + ">" + esc(m) + "</option>"; }).join("") +
            "</select></label>" +
            '<label class="field"><span>Nota por defecto</span><input type="text" name="defaultNotes" value="' + esc(b.defaultNotes) + '" placeholder="Gracias por confiar en nosotros."></label>' +
            '<label class="field span-2"><span>Condiciones del presupuesto</span><textarea name="quoteTerms" placeholder="Texto legal o condiciones que aparecerán al pie de los presupuestos…">' + esc(b.quoteTerms) + "</textarea></label>" +
            '<label class="field span-2"><span>Texto legal de la factura</span><textarea name="legalFooter" placeholder="Ej. Datos de inscripción registral, condiciones de pago, ley aplicable…">' + esc(b.legalFooter) + "</textarea></label>" +
          "</div>" +
        "</div>" +
        '<div class="settings-foot"><span class="desc">Los nuevos documentos usarán estos valores por defecto.</span>' +
          '<button type="submit" class="btn btn-primary">Guardar facturación</button></div>' +
      "</form>" +
    "</section>";
  }

  /* ========================= SHEETS ========================= */

  function sheetsCard(settings) {
    const sh = settings.sheets;
    return '<section class="card settings-card" id="settings-sheets">' +
      cardHead("cloud", "Google Sheets", "Copia y sincronización con tu hoja de cálculo") +
      '<form id="settings-sheets-form" autocomplete="off">' +
        '<div class="settings-body">' +
          '<div class="sync-status-box" id="settings-sync-status"></div>' +
          '<div class="form-grid">' +
            '<label class="field span-2"><span>URL de la Web App de Apps Script</span>' +
              '<input type="url" name="url" value="' + esc(sh.url) + '" placeholder="https://script.google.com/macros/s/AKfy…/exec">' +
              '<span class="hint">Usa la URL de implementación que termina en <code>/exec</code>.</span></label>' +
            '<label class="field span-2"><span>Token secreto</span>' +
              '<div style="display:flex;gap:8px">' +
                '<input type="password" name="token" id="sheets-token" value="' + esc(sh.token) + '" placeholder="Una clave larga y privada">' +
                '<button type="button" class="btn" data-action="toggle-token" id="toggle-token-btn">Ver</button>' +
              "</div>" +
              '<span class="hint">Debe coincidir con la constante <code>TOKEN</code> de tu Apps Script.</span></label>' +
            '<label class="inline-check span-2"><input type="checkbox" name="auto"' + (sh.auto ? " checked" : "") + ">" +
              "<span>Subir automáticamente al guardar<span class=\"hint\">Envía los cambios a Google Sheets 2 segundos después de cada modificación.</span></span></label>" +
          "</div>" +
          '<p class="muted small">Al abrir la aplicación se comprueba la hoja de Google y se descargan los cambios si son más recientes, sin necesidad de pulsar «Descargar de Sheets». Si tienes cambios locales sin subir, no se descarga nada para no perderlos.</p>' +
          '<div class="btn-row">' +
            '<button type="button" class="btn" data-action="test-sync">' + icon("refresh") + " Probar conexión</button>" +
            '<button type="button" class="btn btn-soft" data-action="push-sync">' + icon("upload") + " Subir a Sheets</button>" +
            '<button type="button" class="btn btn-soft" data-action="pull-sync">' + icon("download") + " Descargar de Sheets</button>" +
          "</div>" +
          '<details class="help-details">' +
            "<summary>Cómo conectar tu hoja de Google (3 minutos)</summary>" +
            '<div class="help-body"><ol>' +
              "<li>Crea una hoja de cálculo nueva en Google Sheets.</li>" +
              "<li>Abre <strong>Extensiones → Apps Script</strong> y pega el contenido del archivo <code>apps-script/Code.gs</code> incluido en la aplicación.</li>" +
              "<li>Cambia la constante <code>TOKEN</code> por una clave privada larga (por ejemplo, 30 caracteres aleatorios).</li>" +
              "<li>Publica con <strong>Implementar → Nueva implementación → Aplicación web</strong>: ejecutar como <em>tú</em> y acceso <em>cualquier persona</em>.</li>" +
              "<li>Copia la URL que termina en <code>/exec</code>, pégala arriba junto al mismo token y pulsa «Probar conexión».</li>" +
              "<li>Pulsa «Subir a Sheets» para crear la primera copia. Después podrás descargar los datos en cualquier dispositivo.</li>" +
            "</ol>" +
            '<p class="mt-2"><strong>Importante:</strong> la hoja de cálculo y la URL con token son privadas. Cualquiera que tenga ambos podría leer o modificar tus datos.</p>' +
            "</div>" +
          "</details>" +
        "</div>" +
        '<div class="settings-foot"><span class="desc">La copia de seguridad en JSON también está disponible en la sección Datos.</span>' +
          '<button type="submit" class="btn btn-primary">Guardar conexión</button></div>' +
      "</form>" +
    "</section>";
  }

  /* ========================= SEGURIDAD ========================= */

  function securityCard() {
    return '<section class="card settings-card" id="settings-seguridad">' +
      cardHead("shield", "Seguridad y acceso", "PIN local y sesión de este dispositivo") +
      '<form id="settings-user" autocomplete="off">' +
        '<div class="settings-body">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Nombre de usuario</span><input type="text" name="username" value="' + esc(Auth.getUser()) + '" maxlength="30" required></label>' +
            '<div class="field"><span>Sesión</span><div class="btn-row">' +
              '<button type="button" class="btn" data-action="lock">' + icon("lock") + " Bloquear</button>" +
              '<button type="button" class="btn btn-ghost" data-action="logout">' + icon("logout") + " Cerrar sesión</button>" +
            "</div></div>" +
          "</div>" +
        "</div>" +
        '<div class="settings-foot"><span class="desc">El PIN se guarda derivado con PBKDF2-SHA256 y una sal aleatoria; nunca en texto plano.</span>' +
          '<button type="submit" class="btn btn-primary">Guardar usuario</button></div>' +
      "</form>" +
      '<form id="settings-pin" autocomplete="off" style="border-top:1px solid var(--border)">' +
        '<div class="settings-body">' +
          '<div class="form-section-title">Cambiar PIN</div>' +
          '<div class="form-grid">' +
            '<label class="field"><span>PIN actual</span><input type="password" name="currentPin" inputmode="numeric" maxlength="12" autocomplete="current-password" required></label>' +
            '<div></div>' +
            '<label class="field"><span>Nuevo PIN</span><input type="password" name="newPin" inputmode="numeric" minlength="4" maxlength="12" autocomplete="new-password" required></label>' +
            '<label class="field"><span>Repite el nuevo PIN</span><input type="password" name="newPin2" inputmode="numeric" minlength="4" maxlength="12" autocomplete="new-password" required></label>' +
          "</div>" +
          '<div id="pin-error" class="form-error hidden"></div>' +
        "</div>" +
        '<div class="settings-foot"><span class="desc">Al cambiar el PIN no se pierde ningún dato.</span>' +
          '<button type="submit" class="btn btn-primary">Cambiar PIN</button></div>' +
      "</form>" +
    "</section>";
  }

  /* ========================= DATOS ========================= */

  function dataCard() {
    return '<section class="card settings-card" id="settings-datos">' +
      cardHead("database", "Datos y copias de seguridad", "Exporta, importa o restablece la aplicación") +
      '<div class="settings-body">' +
        '<div class="form-section-title">Exportar</div>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn" data-action="export-json">' + icon("download") + " Copia completa (JSON)</button>" +
          '<button type="button" class="btn" data-action="export-clients-csv">' + icon("download") + " Clientes (CSV)</button>" +
          '<button type="button" class="btn" data-action="export-quotes-csv">' + icon("download") + " Presupuestos (CSV)</button>" +
          '<button type="button" class="btn" data-action="export-invoices-csv">' + icon("download") + " Facturas (CSV)</button>" +
        "</div>" +
        '<div class="form-section-title">Importar</div>' +
        '<div class="btn-row">' +
          '<input type="file" id="import-file" accept="application/json,.json" class="hidden">' +
          '<button type="button" class="btn" data-action="import-json">' + icon("upload") + " Restaurar copia JSON</button>" +
          '<input type="file" id="import-clients-file" accept=".csv,text/csv" class="hidden">' +
          '<button type="button" class="btn" data-action="import-clients-csv">' + icon("users") + " Importar clientes (CSV)</button>" +
        "</div>" +
        '<p class="muted small">El CSV de clientes debe llevar una fila de cabecera con columnas como Nombre, NIF/CIF, Dirección, Móvil, Teléfono, Email, CP, Ciudad, País o Notas. Se aceptan separadores «;» y «,».</p>' +
        '<p class="muted small">Al restaurar una copia se reemplazan todos los datos actuales de este dispositivo. Si tienes la sincronización automática activada, la copia también se subirá a Google Sheets.</p>' +
      "</div>" +
      '<div class="settings-body danger-zone" style="border-top:1px solid var(--border)">' +
        '<div class="form-section-title" style="color:var(--danger)">Zona de peligro</div>' +
        '<p class="muted small">Borra clientes, documentos y ajustes de este dispositivo. El acceso (usuario y PIN) se mantiene. La copia en Google Sheets no se elimina.</p>' +
        '<div><button type="button" class="btn btn-danger-soft" data-action="reset-data">' + icon("trash") + " Borrar todos los datos locales</button></div>" +
      "</div>" +
    "</section>";
  }

  /* ========================= ACCIONES ========================= */

  function jumpSettings(target) {
    const section = document.getElementById("settings-" + target);
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    $$(".settings-link").forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("data-target") === target);
    });
  }

  function addTaxRow() {
    const list = document.getElementById("tax-list");
    if (!list) return;
    const id = "vat_" + Math.random().toString(36).slice(2, 9);
    list.insertAdjacentHTML("beforeend", taxRowHTML({ id: id, name: "", rate: "" }, ""));
    const row = list.lastElementChild;
    if (row) {
      const nameInput = row.querySelector(".vat-name");
      if (nameInput) nameInput.focus();
    }
  }

  function removeTaxRow(button) {
    const row = button.closest(".tax-row");
    const list = document.getElementById("tax-list");
    if (!row || !list) return;
    if (list.querySelectorAll(".tax-row").length <= 1) {
      PF.toast("Debe existir al menos un tipo de IVA.", "warning");
      return;
    }
    const wasDefault = row.querySelector('input[name="defaultVat"]').checked;
    row.remove();
    if (wasDefault) {
      const first = list.querySelector('input[name="defaultVat"]');
      if (first) first.checked = true;
    }
  }

  function updateCurrencyPreview() {
    const form = document.getElementById("settings-currency");
    const out = document.getElementById("currency-preview");
    if (!form || !out) return;
    const symbol = form.elements.symbol.value || form.elements.code.value || "€";
    const position = form.elements.position.value;
    const decimals = Math.min(4, Math.max(0, Store.num(form.elements.decimals.value)));
    let number;
    try {
      number = new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(1234.56);
    } catch (err) {
      number = "1.234,56";
    }
    out.textContent = position === "before" ? symbol + " " + number : number + " " + symbol;
  }

  function updateNumberingPreview() {
    const form = document.getElementById("settings-numbering");
    if (!form) return;
    const year = new Date().getFullYear();
    const reset = form.elements.resetYearly.checked;
    const pad = Math.max(1, Math.min(10, Store.num(form.elements.padding.value) || 4));
    const build = function (prefix, counter) {
      const parts = [];
      if (prefix) parts.push(prefix);
      if (reset) parts.push(year);
      parts.push(String(Math.max(1, Store.num(counter) || 1)).padStart(pad, "0"));
      return parts.join("-");
    };
    const invoice = document.getElementById("next-invoice-preview");
    const quote = document.getElementById("next-quote-preview");
    if (invoice) invoice.textContent = build(form.elements.invoicePrefix.value.trim(), form.elements.nextInvoice.value);
    if (quote) quote.textContent = build(form.elements.quotePrefix.value.trim(), form.elements.nextQuote.value);
  }

  function collectTaxes(form) {
    const rows = $$(".tax-row", form);
    const rates = [];
    rows.forEach(function (row) {
      const name = row.querySelector(".vat-name").value.trim();
      const rate = Store.num(row.querySelector(".vat-rate").value);
      if (!name) return;
      rates.push({
        id: row.getAttribute("data-tax-id") || Store.uid("vat_"),
        name: name,
        rate: rate
      });
    });
    return rates;
  }

  function saveCompany(form) {
    const logo = document.getElementById("logo-data");
    const current = S().settings.company;
    S().settings.company = {
      name: form.elements.name.value.trim(),
      nif: form.elements.nif.value.trim(),
      address: form.elements.address.value.trim(),
      zip: form.elements.zip.value.trim(),
      city: form.elements.city.value.trim(),
      country: form.elements.country.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      web: form.elements.web.value.trim(),
      iban: form.elements.iban.value.trim(),
      logo: logo ? logo.value : current.logo
    };
    Store.save();
    PF.toast("Datos de la empresa guardados.", "success");
    PF.updateShell();
  }

  function saveTaxes(form) {
    const rates = collectTaxes(form);
    if (!rates.length) {
      PF.toast("Añade al menos un tipo de IVA con nombre.", "warning");
      return;
    }
    const selected = form.querySelector('input[name="defaultVat"]:checked');
    let defaultId = selected ? selected.value : "";
    if (!rates.some(function (r) { return r.id === defaultId; })) defaultId = rates[0].id;
    S().settings.taxes = {
      rates: rates,
      defaultVatId: defaultId,
      irpfEnabled: !!form.elements.irpfEnabled.checked,
      irpfRate: Store.num(form.elements.irpfRate.value)
    };
    Store.save();
    PF.toast("Impuestos guardados.", "success");
  }

  function saveCurrency(form) {
    S().settings.currency = {
      code: form.elements.code.value.trim().toUpperCase() || "EUR",
      symbol: form.elements.symbol.value.trim(),
      position: form.elements.position.value === "before" ? "before" : "after",
      decimals: Math.max(0, Math.min(4, Math.round(Store.num(form.elements.decimals.value))))
    };
    Store.save();
    updateCurrencyPreview();
    PF.toast("Moneda y formato guardados.", "success");
  }

  function saveNumbering(form) {
    const n = S().settings.numbering;
    n.invoicePrefix = form.elements.invoicePrefix.value.trim();
    n.quotePrefix = form.elements.quotePrefix.value.trim();
    n.nextInvoice = Math.max(1, Math.round(Store.num(form.elements.nextInvoice.value)));
    n.nextQuote = Math.max(1, Math.round(Store.num(form.elements.nextQuote.value)));
    n.padding = Math.max(1, Math.min(10, Math.round(Store.num(form.elements.padding.value) || 4)));
    n.resetYearly = !!form.elements.resetYearly.checked;
    if (n.resetYearly) n.year = new Date().getFullYear();
    Store.recalculateCounters();
    Store.save();
    form.elements.nextInvoice.value = n.nextInvoice;
    form.elements.nextQuote.value = n.nextQuote;
    updateNumberingPreview();
    PF.toast("Numeración guardada.", "success");
  }

  function saveBilling(form) {
    const b = S().settings.billing;
    b.defaultPaymentDays = Math.max(0, Math.min(365, Math.round(Store.num(form.elements.defaultPaymentDays.value))));
    b.defaultValidDays = Math.max(0, Math.min(365, Math.round(Store.num(form.elements.defaultValidDays.value))));
    b.defaultPaymentMethod = form.elements.defaultPaymentMethod.value;
    b.defaultNotes = form.elements.defaultNotes.value.trim();
    b.quoteTerms = form.elements.quoteTerms.value.trim();
    b.legalFooter = form.elements.legalFooter.value.trim();
    Store.save();
    PF.toast("Configuración de facturación guardada.", "success");
  }

  function saveSheetsForm(emit) {
    const form = document.getElementById("settings-sheets-form");
    if (!form) return false;
    const config = S().settings.sheets;
    config.url = Sheets.normalizeUrl(form.elements.url.value);
    config.token = form.elements.token.value.trim();
    config.auto = !!form.elements.auto.checked;
    if (emit) Store.save();
    else Store.save({ emit: false });
    PF.updateSyncUI();
    return Sheets.hasConfig();
  }

  function requireSheetsConfig() {
    if (!saveSheetsForm(false) || !Sheets.hasConfig()) {
      PF.toast("Introduce la URL del Apps Script y el token secreto.", "warning");
      return false;
    }
    return true;
  }

  async function testSync() {
    if (!requireSheetsConfig()) return;
    try {
      await Sheets.ping();
    } catch (err) {
      /* el evento de sincronización ya muestra el error */
    }
  }

  async function pushSync() {
    if (!requireSheetsConfig()) return;
    const ok = await PF.confirmDialog({
      title: "Subir a Google Sheets",
      message: "Se <strong>reemplazarán</strong> los datos guardados en la hoja de cálculo con los de este dispositivo. Úsalo cuando estés seguro de que esta es la versión más reciente.",
      confirmText: "Subir datos"
    });
    if (!ok) return;
    try {
      await Sheets.push();
      PF.updateShell();
    } catch (err) { /* notificado */ }
  }

  async function pullSync() {
    if (!requireSheetsConfig()) return;
    const ok = await PF.confirmDialog({
      title: "Descargar desde Google Sheets",
      message: "Se <strong>reemplazarán</strong> los clientes, documentos y ajustes de este dispositivo con lo que haya guardado en la hoja de Google. Si tienes cambios locales sin subir, se perderán.",
      confirmText: "Descargar datos",
      danger: true
    });
    if (!ok) return;
    try {
      await Sheets.pull();
      PF.applyTheme(S().settings.theme);
      PF.closeAllModals();
      PF.updateShell();
      PF.renderRoute("ajustes");
    } catch (err) { /* notificado */ }
  }

  async function syncNow() {
    if (!Sheets.hasConfig()) {
      PF.go("ajustes");
      setTimeout(function () { jumpSettings("sheets"); }, 250);
      PF.toast("Configura Google Sheets para sincronizar.", "info");
      return;
    }
    const ok = await PF.confirmDialog({
      title: "Sincronizar ahora",
      message: "Se subirán los datos de este dispositivo a Google Sheets, reemplazando la versión de la nube.",
      confirmText: "Sincronizar"
    });
    if (!ok) return;
    try {
      await Sheets.push();
    } catch (err) { /* notificado */ }
  }

  async function handleSettingsSubmit(form) {
    if (form.id === "settings-company") return saveCompany(form);
    if (form.id === "settings-taxes") return saveTaxes(form);
    if (form.id === "settings-currency") return saveCurrency(form);
    if (form.id === "settings-numbering") return saveNumbering(form);
    if (form.id === "settings-billing") return saveBilling(form);
    if (form.id === "settings-sheets-form") {
      if (saveSheetsForm(true)) PF.toast("Conexión guardada.", "success");
      else PF.toast("Conexión guardada. Faltan la URL o el token para sincronizar.", "warning");
      return;
    }
    if (form.id === "settings-user") {
      const username = form.elements.username.value.trim();
      if (!username) {
        PF.toast("El nombre de usuario no puede estar vacío.", "warning");
        return;
      }
      Auth.changeUsername(username);
      PF.updateShell();
      PF.toast("Usuario actualizado.", "success");
      return;
    }
    if (form.id === "settings-pin") {
      const error = document.getElementById("pin-error");
      const currentPin = form.elements.currentPin.value.trim();
      const newPin = form.elements.newPin.value.trim();
      const newPin2 = form.elements.newPin2.value.trim();
      if (error) error.classList.add("hidden");
      if (newPin.length < 4) {
        if (error) { error.textContent = "El nuevo PIN debe tener al menos 4 caracteres."; error.classList.remove("hidden"); }
        return;
      }
      if (newPin !== newPin2) {
        if (error) { error.textContent = "Los nuevos PIN no coinciden."; error.classList.remove("hidden"); }
        return;
      }
      const result = await Auth.changePin(currentPin, newPin);
      if (!result.ok) {
        if (error) { error.textContent = result.error; error.classList.remove("hidden"); }
        return;
      }
      form.reset();
      PF.toast("PIN actualizado correctamente.", "success");
    }
  }

  async function handleLogoFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      const hidden = document.getElementById("logo-data");
      const preview = document.getElementById("logo-preview");
      if (hidden) hidden.value = dataUrl;
      if (preview) preview.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Logo">';
      PF.toast("Logo cargado. Pulsa «Guardar empresa» para aplicarlo.", "info");
    } catch (err) {
      PF.toast(err.message || "No se pudo cargar la imagen.", "error");
    } finally {
      input.value = "";
    }
  }

  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) {
        reject(new Error("El archivo debe ser una imagen."));
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        reject(new Error("La imagen supera los 6 MB. Usa una más pequeña."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error("No se pudo leer la imagen.")); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error("La imagen no es válida.")); };
        img.onload = function () {
          const maxW = 360;
          const maxH = 180;
          const scale = Math.min(1, maxW / img.width, maxH / img.height);
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function removeLogo() {
    const hidden = document.getElementById("logo-data");
    const preview = document.getElementById("logo-preview");
    if (hidden) hidden.value = "";
    if (preview) preview.innerHTML = "<span>Sin logo</span>";
    PF.toast("Logo quitado. Pulsa «Guardar empresa» para confirmar.", "info");
  }

  function toggleToken() {
    const input = document.getElementById("sheets-token");
    const button = document.getElementById("toggle-token-btn");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    if (button) button.textContent = show ? "Ocultar" : "Ver";
  }

  function exportJSON() {
    Store.download("presufactu-copia-" + Store.todayISO() + ".json", Store.backupJSON(), "application/json");
    PF.toast("Copia de seguridad descargada.", "success");
  }

  async function importJSONFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ok = await PF.confirmDialog({
        title: "Restaurar copia de seguridad",
        message: "Se reemplazarán <strong>todos</strong> los datos actuales de este dispositivo por los del archivo. ¿Continuar?",
        confirmText: "Restaurar",
        danger: true
      });
      if (!ok) return;
      Store.importJSON(text);
      PF.applyTheme(S().settings.theme);
      PF.closeAllModals();
      PF.updateShell();
      PF.renderRoute("panel");
      PF.toast("Copia restaurada correctamente.", "success");
    } catch (err) {
      PF.toast(err.message || "No se pudo restaurar el archivo.", "error");
    } finally {
      input.value = "";
    }
  }

  async function importClientsCSVFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = Store.parseCSV(text);
      const list = Store.mapClientRows(rows);
      if (!list.length) {
        throw new Error("No se han encontrado clientes en el archivo CSV.");
      }
      const ok = await PF.confirmDialog({
        title: "Importar clientes",
        message: "Se añadirán <strong>" + list.length + "</strong> clientes desde el archivo. Los que ya existan (mismo nombre y NIF) se omitirán.",
        confirmText: "Importar"
      });
      if (!ok) return;
      const result = Store.importClients(list);
      PF.updateShell();
      PF.go("clientes");
      PF.toast(
        result.added + (result.added === 1 ? " cliente importado" : " clientes importados") +
        (result.skipped ? ". " + result.skipped + " omitidos (duplicados o sin nombre)." : "."),
        result.added ? "success" : "info"
      );
    } catch (err) {
      PF.toast(err.message || "No se pudo importar el archivo CSV.", "error");
    } finally {
      input.value = "";
    }
  }

  async function resetData() {
    const ok = await PF.confirmDialog({
      title: "Borrar datos locales",
      message: "Se eliminarán <strong>todos los clientes, presupuestos, facturas y ajustes</strong> de este dispositivo. El usuario y el PIN se conservan. Esta acción no se puede deshacer.",
      confirmText: "Borrar todo",
      danger: true
    });
    if (!ok) return;
    if (typeof Store.resetAll === "function") Store.resetAll();
    else {
      try { localStorage.removeItem("presufactu.state.v1"); } catch (err) { /* ignorar */ }
    }
    window.location.reload();
  }

  Object.assign(PF, {
    renderSettings: renderSettings,
    jumpSettings: jumpSettings,
    addTaxRow: addTaxRow,
    removeTaxRow: removeTaxRow,
    updateCurrencyPreview: updateCurrencyPreview,
    updateNumberingPreview: updateNumberingPreview,
    handleSettingsSubmit: handleSettingsSubmit,
    handleLogoFile: handleLogoFile,
    removeLogo: removeLogo,
    toggleToken: toggleToken,
    testSync: testSync,
    pushSync: pushSync,
    pullSync: pullSync,
    syncNow: syncNow,
    exportJSON: exportJSON,
    importJSONFile: importJSONFile,
    importClientsCSVFile: importClientsCSVFile,
    resetData: resetData
  });
})();
