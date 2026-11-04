/* =========================================================
   PresuFactu · Almacén de datos y reglas de negocio
   ========================================================= */
(function () {
  "use strict";

  var STATE_KEY = "presufactu.state.v1";
  var IS_DEVICE = typeof window !== "undefined";

  function uid(prefix) {
    var id;
    if (window.crypto && window.crypto.randomUUID) {
      id = window.crypto.randomUUID();
    } else {
      id = "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
    return (prefix || "") + id;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function num(value) {
    if (typeof value === "number") return isFinite(value) ? value : 0;
    if (value === null || value === undefined || value === "") return 0;
    var n = Number(String(value).replace(",", "."));
    return isFinite(n) ? n : 0;
  }

  function round2(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function pad(value, size) {
    var s = String(value);
    while (s.length < size) s = "0" + s;
    return s;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
  }

  function addDays(iso, days) {
    var parts = String(iso || todayISO()).split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + Number(days || 0));
    return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
  }

  function yearOf(iso) {
    return Number(String(iso || "").slice(0, 4)) || new Date().getFullYear();
  }

  var DEFAULTS = {
    version: 1,
    settings: {
      company: {
        name: "",
        nif: "",
        address: "",
        city: "",
        zip: "",
        country: "España",
        phone: "",
        email: "",
        web: "",
        iban: "",
        logo: ""
      },
      currency: {
        code: "EUR",
        symbol: "€",
        position: "after",
        decimals: 2
      },
      taxes: {
        rates: [
          { id: "iva21", name: "IVA 21%", rate: 21 },
          { id: "iva10", name: "IVA 10%", rate: 10 },
          { id: "iva4", name: "IVA 4%", rate: 4 },
          { id: "iva0", name: "Exento de IVA", rate: 0 }
        ],
        defaultVatId: "iva21",
        irpfEnabled: false,
        irpfRate: 15
      },
      numbering: {
        invoicePrefix: "FAC",
        quotePrefix: "PRE",
        nextInvoice: 1,
        nextQuote: 1,
        padding: 4,
        resetYearly: true,
        year: new Date().getFullYear()
      },
      billing: {
        defaultPaymentDays: 30,
        defaultValidDays: 30,
        defaultPaymentMethod: "Transferencia",
        defaultNotes: "Gracias por confiar en nosotros.",
        legalFooter: "",
        quoteTerms: "Presupuesto válido durante el plazo indicado. Los precios no incluyen impuestos salvo que se indique lo contrario."
      },
      sheets: {
        url: "",
        token: "",
        auto: false,
        lastSync: "",
        lastError: "",
        cloudUpdatedAt: ""
      },
      theme: "light"
    },
    clients: [],
    documents: [],
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cloudUpdatedAt: ""
    }
  };

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function mergeDefaults(target, defaults) {
    var out = isPlainObject(target) ? target : {};
    Object.keys(defaults).forEach(function (key) {
      var def = defaults[key];
      if (isPlainObject(def)) {
        out[key] = mergeDefaults(out[key], def);
      } else if (Array.isArray(def)) {
        if (!Array.isArray(out[key])) out[key] = clone(def);
      } else if (out[key] === undefined) {
        out[key] = def;
      }
    });
    return out;
  }

  function sanitizeState(raw) {
    var merged = mergeDefaults(raw, clone(DEFAULTS));
    if (!Array.isArray(merged.clients)) merged.clients = [];
    if (!Array.isArray(merged.documents)) merged.documents = [];
    if (!merged.meta) merged.meta = clone(DEFAULTS.meta);
    merged.documents = merged.documents.filter(function (doc) {
      return doc && typeof doc === "object" && doc.id && doc.number;
    });
    merged.clients = merged.clients.filter(function (client) {
      return client && typeof client === "object" && client.id;
    });
    merged.documents.forEach(function (doc) {
      if (!Array.isArray(doc.lines)) doc.lines = [];
      doc.lines.forEach(function (line) {
        line.qty = num(line.qty);
        line.price = num(line.price);
        line.discount = num(line.discount);
        line.vat = num(line.vat);
      });
      doc.globalDiscount = num(doc.globalDiscount);
      doc.irpfRate = num(doc.irpfRate);
      if (doc.type !== "invoice") doc.type = "quote";
    });
    return merged;
  }

  var state = null;

  function load() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      state = raw ? sanitizeState(JSON.parse(raw)) : sanitizeState(clone(DEFAULTS));
    } catch (err) {
      state = sanitizeState(clone(DEFAULTS));
    }
    return state;
  }

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (err) {
      if (window.console) console.error("No se pudieron guardar los datos", err);
      throw new Error("No se pudieron guardar los datos en el navegador. Revisa el espacio disponible.");
    }
  }

  function emitSaved() {
    try {
      window.dispatchEvent(new CustomEvent("presufactu:saved", { detail: { at: Date.now() } }));
    } catch (err) { /* ignorar */ }
  }

  function save(options) {
    state.meta.updatedAt = new Date().toISOString();
    persist();
    if (!options || options.emit !== false) emitSaved();
  }

  /* ---------------- Impuestos y numeración ---------------- */

  function vatRates() {
    return state.settings.taxes.rates || [];
  }

  function defaultVatRate() {
    var taxes = state.settings.taxes;
    var found = vatRates().filter(function (r) { return r.id === taxes.defaultVatId; })[0];
    if (found) return num(found.rate);
    return vatRates().length ? num(vatRates()[0].rate) : 21;
  }

  function vatName(rate) {
    var rateNum = num(rate);
    var found = vatRates().filter(function (r) { return num(r.rate) === rateNum; })[0];
    if (found) return found.name;
    if (rateNum === 0) return "Exento de IVA";
    return "IVA " + rateNum + "%";
  }

  function buildNumber(prefix, counter, year, config) {
    var parts = [];
    if (prefix) parts.push(prefix);
    if (config.resetYearly) parts.push(year);
    parts.push(pad(counter, Math.max(1, Number(config.padding) || 4)));
    return parts.join("-");
  }

  function peekNumber(type) {
    var cfg = state.settings.numbering;
    var currentYear = new Date().getFullYear();
    var counter = type === "invoice" ? num(cfg.nextInvoice) : num(cfg.nextQuote);
    if (cfg.resetYearly && num(cfg.year) !== currentYear) counter = 1;
    var prefix = type === "invoice" ? cfg.invoicePrefix : cfg.quotePrefix;
    return buildNumber(prefix, Math.max(1, counter), currentYear, cfg);
  }

  function registerNumber(type, number) {
    var cfg = state.settings.numbering;
    var currentYear = new Date().getFullYear();
    var match = String(number || "").match(/(\d+)\s*$/);
    if (!match) return;
    var n = parseInt(match[1], 10);
    if (!isFinite(n)) return;
    var isNewYear = cfg.resetYearly && num(cfg.year) !== currentYear;
    if (cfg.resetYearly) cfg.year = currentYear;
    if (type === "invoice") {
      cfg.nextInvoice = isNewYear ? Math.max(1, n + 1) : Math.max(num(cfg.nextInvoice) || 1, n + 1);
    } else {
      cfg.nextQuote = isNewYear ? Math.max(1, n + 1) : Math.max(num(cfg.nextQuote) || 1, n + 1);
    }
  }

  function recalculateCounters() {
    var cfg = state.settings.numbering;
    var currentYear = new Date().getFullYear();
    var targetYear = cfg.resetYearly ? currentYear : null;
    var maxInvoice = 0;
    var maxQuote = 0;
    state.documents.forEach(function (doc) {
      // Con reinicio anual solo cuentan los documentos del año en curso.
      if (targetYear !== null && yearOf(doc.issueDate) !== targetYear) return;
      var match = String(doc.number || "").match(/(\d+)\s*$/);
      if (!match) return;
      var n = parseInt(match[1], 10);
      if (!isFinite(n)) return;
      if (doc.type === "invoice") maxInvoice = Math.max(maxInvoice, n);
      else maxQuote = Math.max(maxQuote, n);
    });
    if (cfg.resetYearly && num(cfg.year) !== currentYear) {
      cfg.nextInvoice = maxInvoice + 1;
      cfg.nextQuote = maxQuote + 1;
      cfg.year = currentYear;
    } else {
      cfg.nextInvoice = Math.max(num(cfg.nextInvoice) || 1, maxInvoice + 1);
      cfg.nextQuote = Math.max(num(cfg.nextQuote) || 1, maxQuote + 1);
    }
  }

  /* ---------------- Totales ---------------- */

  function computeTotals(doc) {
    var lines = Array.isArray(doc.lines) ? doc.lines : [];
    var grossBase = 0;
    var globalFactor = 1 - num(doc.globalDiscount) / 100;
    if (globalFactor < 0) globalFactor = 0;

    var vatGroups = {};
    lines.forEach(function (line) {
      var gross = num(line.qty) * num(line.price);
      var lineBase = gross * (1 - num(line.discount) / 100);
      grossBase += lineBase;
      var rate = num(line.vat);
      vatGroups[rate] = (vatGroups[rate] || 0) + lineBase * globalFactor;
    });

    var base = round2(grossBase * globalFactor);
    var breakdown = Object.keys(vatGroups)
      .map(function (rateKey) {
        var rate = Number(rateKey);
        var taxable = round2(vatGroups[rateKey]);
        return { rate: rate, name: vatName(rate), taxable: taxable, amount: round2(taxable * rate / 100) };
      })
      .sort(function (a, b) { return b.rate - a.rate; });

    var vatTotal = round2(breakdown.reduce(function (sum, g) { return sum + g.amount; }, 0));
    var irpfAmount = doc.irpfEnabled ? round2(base * num(doc.irpfRate) / 100) : 0;
    var total = round2(base + vatTotal - irpfAmount);

    return {
      grossBase: round2(grossBase),
      discountAmount: round2(grossBase - base),
      base: base,
      breakdown: breakdown,
      vatTotal: vatTotal,
      irpfAmount: irpfAmount,
      total: total
    };
  }

  function documentTotal(doc) {
    return computeTotals(doc).total;
  }

  function effectiveStatus(doc) {
    if (doc.type === "invoice" && doc.status === "issued" && doc.dueDate && doc.dueDate < todayISO()) {
      return "overdue";
    }
    return doc.status || (doc.type === "invoice" ? "issued" : "draft");
  }

  /* ---------------- Formato ---------------- */

  function fmtMoney(value, options) {
    var cfg = state.settings.currency;
    var decimals = Math.min(4, Math.max(0, Number(cfg.decimals)));
    if (options && options.decimals !== undefined) decimals = options.decimals;
    var nf;
    try {
      nf = new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    } catch (err) {
      nf = { format: function (n) { return Number(n).toFixed(decimals); } };
    }
    var text = nf.format(num(value));
    var symbol = cfg.symbol || cfg.code || "€";
    if (!symbol) return text;
    return cfg.position === "before" ? symbol + " " + text : text + " " + symbol;
  }

  function fmtNumber(value, decimals) {
    var d = decimals === undefined ? 2 : decimals;
    return new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }).format(num(value));
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var parts = String(iso).slice(0, 10).split("-");
    if (parts.length !== 3) return iso;
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("es-ES") + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      return iso;
    }
  }

  /* ---------------- CRUD ---------------- */

  function getClient(id) {
    return state.clients.filter(function (c) { return c.id === id; })[0] || null;
  }

  function saveClient(data, id) {
    var now = new Date().toISOString();
    if (id) {
      var existing = getClient(id);
      if (!existing) throw new Error("Cliente no encontrado.");
      Object.assign(existing, data, { id: id, updatedAt: now });
      save();
      return existing;
    }
    var client = Object.assign({
      id: uid("cli_"),
      createdAt: now,
      updatedAt: now
    }, data);
    state.clients.push(client);
    save();
    return client;
  }

  function deleteClient(id) {
    var hasDocs = state.documents.some(function (d) { return d.clientId === id; });
    var client = getClient(id);
    if (client) {
      client.deletedAt = new Date().toISOString();
    }
    if (hasDocs) {
      // Se conservan los documentos con la copia de los datos del cliente.
      save();
      return { soft: true };
    }
    state.clients = state.clients.filter(function (c) { return c.id !== id; });
    save();
    return { soft: false };
  }

  function getDocument(id) {
    return state.documents.filter(function (d) { return d.id === id; })[0] || null;
  }

  function saveDocument(data, id) {
    var now = new Date().toISOString();
    var doc;
    if (id) {
      doc = getDocument(id);
      if (!doc) throw new Error("Documento no encontrado.");
      var createdAt = doc.createdAt;
      Object.assign(doc, data, { id: id, createdAt: createdAt, updatedAt: now });
    } else {
      doc = Object.assign({ id: uid("doc_"), createdAt: now, updatedAt: now }, data);
      state.documents.push(doc);
    }
    if (doc.clientId) {
      var client = getClient(doc.clientId);
      if (client) doc.clientSnapshot = snapshotClient(client);
    }
    registerNumber(doc.type, doc.number);
    save();
    return doc;
  }

  function deleteDocument(id) {
    state.documents = state.documents.filter(function (d) { return d.id !== id; });
    save();
  }

  function snapshotClient(client) {
    if (!client) return { name: "", nif: "", address: "", city: "", zip: "", country: "", email: "", phone: "" };
    return {
      name: client.name || "",
      nif: client.nif || "",
      address: client.address || "",
      city: client.city || "",
      zip: client.zip || "",
      country: client.country || "",
      email: client.email || "",
      phone: client.phone || ""
    };
  }

  function validateDocument(doc) {
    if (!doc.clientId) return "Selecciona un cliente.";
    if (!doc.number || !String(doc.number).trim()) return "El número de documento es obligatorio.";
    if (!doc.issueDate) return "La fecha de emisión es obligatoria.";
    var validLines = (doc.lines || []).filter(function (l) {
      return String(l.description || "").trim() && num(l.qty) > 0;
    });
    if (!validLines.length) return "Añade al menos una línea con descripción y cantidad.";
    return null;
  }

  /* ---------------- Demo ---------------- */

  function seedDemo() {
    var now = new Date();
    var iso = function (offset) { return addDays(todayISO(), offset); };
    var c1 = saveClient({
      name: "Construcciones Sierra S.L.",
      nif: "B12345678",
      email: "admin@construccionessierra.es",
      phone: "912 345 678",
      address: "Calle Mayor 24",
      city: "Madrid",
      zip: "28013",
      country: "España",
      notes: "Cliente habitual de reformas."
    });
    var c2 = saveClient({
      name: "María López García",
      nif: "12345678Z",
      email: "maria.lopez@email.com",
      phone: "655 123 456",
      address: "Avenida del Mar 8, 3ºB",
      city: "Valencia",
      zip: "46002",
      country: "España",
      notes: ""
    });
    var c3 = saveClient({
      name: "Talleres Norte S.A.",
      nif: "A87654321",
      email: "compras@talleresnorte.com",
      phone: "944 556 677",
      address: "Polígono Industrial Ribera, nave 12",
      city: "Bilbao",
      zip: "48003",
      country: "España",
      notes: ""
    });

    var quote = saveDocument({
      type: "quote",
      number: peekNumber("quote"),
      status: "accepted",
      issueDate: iso(-18),
      dueDate: iso(12),
      clientId: c1.id,
      clientSnapshot: snapshotClient(c1),
      paymentMethod: "Transferencia",
      globalDiscount: 0,
      irpfEnabled: false,
      irpfRate: state.settings.taxes.irpfRate,
      notes: "Reforma integral de local comercial. Incluye materiales y mano de obra.",
      lines: [
        { id: uid("ln_"), description: "Proyecto y dirección de obra", qty: 1, price: 1200, discount: 0, vat: 21 },
        { id: uid("ln_"), description: "Mano de obra (horas)", qty: 60, price: 28, discount: 5, vat: 21 },
        { id: uid("ln_"), description: "Material eléctrico", qty: 1, price: 845.5, discount: 0, vat: 21 }
      ]
    });

    saveDocument({
      type: "invoice",
      number: peekNumber("invoice"),
      status: "paid",
      issueDate: iso(-30),
      dueDate: iso(-2),
      clientId: c1.id,
      clientSnapshot: snapshotClient(c1),
      paymentMethod: "Transferencia",
      globalDiscount: 0,
      irpfEnabled: false,
      irpfRate: state.settings.taxes.irpfRate,
      notes: "Trabajos de albañilería y pintura.",
      paidDate: iso(-4),
      lines: [
        { id: uid("ln_"), description: "Albañilería y tabiquería", qty: 1, price: 1850, discount: 0, vat: 21 },
        { id: uid("ln_"), description: "Pintura interior", qty: 120, price: 9.5, discount: 0, vat: 10 }
      ]
    });

    saveDocument({
      type: "invoice",
      number: peekNumber("invoice"),
      status: "issued",
      issueDate: iso(-8),
      dueDate: iso(22),
      clientId: c2.id,
      clientSnapshot: snapshotClient(c2),
      paymentMethod: "Bizum",
      globalDiscount: 5,
      irpfEnabled: false,
      irpfRate: state.settings.taxes.irpfRate,
      notes: "Instalación de climatización.",
      lines: [
        { id: uid("ln_"), description: "Split inverter 3.500 frigorías", qty: 2, price: 649, discount: 0, vat: 21 },
        { id: uid("ln_"), description: "Instalación y puesta en marcha", qty: 1, price: 320, discount: 0, vat: 21 }
      ]
    });

    saveDocument({
      type: "quote",
      number: peekNumber("quote"),
      status: "sent",
      issueDate: iso(-3),
      dueDate: iso(27),
      clientId: c3.id,
      clientSnapshot: snapshotClient(c3),
      paymentMethod: "Transferencia",
      globalDiscount: 0,
      irpfEnabled: false,
      irpfRate: state.settings.taxes.irpfRate,
      notes: "Mantenimiento anual de instalaciones.",
      lines: [
        { id: uid("ln_"), description: "Mantenimiento preventivo anual", qty: 1, price: 2400, discount: 10, vat: 21 },
        { id: uid("ln_"), description: "Revisión extraordinaria", qty: 4, price: 95, discount: 0, vat: 21 }
      ]
    });

    void quote;
    void now;
    save();
  }

  /* ---------------- Exportaciones ---------------- */

  function csvEscape(value) {
    var s = value === null || value === undefined ? "" : String(value);
    if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(headers, rows) {
    var lines = [headers.map(csvEscape).join(";")];
    rows.forEach(function (row) {
      lines.push(row.map(csvEscape).join(";"));
    });
    return "\ufeff" + lines.join("\r\n");
  }

  function clientsCSV() {
    var headers = ["Nombre", "NIF/CIF", "Email", "Teléfono", "Dirección", "CP", "Ciudad", "País", "Notas", "Creado"];
    var rows = state.clients.filter(function (c) { return !c.deletedAt; }).map(function (c) {
      return [c.name, c.nif, c.email, c.phone, c.address, c.zip, c.city, c.country, c.notes, c.createdAt];
    });
    return toCSV(headers, rows);
  }

  function documentsCSV(type) {
    var headers = ["Número", "Tipo", "Estado", "Fecha", "Vencimiento", "Cliente", "NIF", "Base", "IVA", "IRPF", "Total", "Moneda", "Líneas", "Notas"];
    var rows = state.documents.filter(function (d) { return d.type === type; }).map(function (d) {
      var t = computeTotals(d);
      return [
        d.number,
        d.type === "invoice" ? "Factura" : "Presupuesto",
        effectiveStatus(d),
        d.issueDate,
        d.dueDate,
        d.clientSnapshot ? d.clientSnapshot.name : "",
        d.clientSnapshot ? d.clientSnapshot.nif : "",
        t.base,
        t.vatTotal,
        t.irpfAmount,
        t.total,
        state.settings.currency.code,
        (d.lines || []).map(function (l) { return l.description + " x" + l.qty; }).join(" | "),
        d.notes
      ];
    });
    return toCSV(headers, rows);
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function backupJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.documents)) {
      throw new Error("El archivo no tiene el formato de copia de seguridad de PresuFactu.");
    }
    state = sanitizeState(parsed);
    recalculateCounters();
    save();
    return state;
  }

  var Store = {
    init: function () {
      load();
      recalculateCounters();
      return state;
    },
    refresh: load,
    save: save,
    persist: persist,
    get state() { return state; },
    settings: function () { return state.settings; },
    uid: uid,
    clone: clone,
    num: num,
    round2: round2,
    todayISO: todayISO,
    addDays: addDays,
    yearOf: yearOf,
    vatRates: vatRates,
    vatName: vatName,
    defaultVatRate: defaultVatRate,
    peekNumber: peekNumber,
    registerNumber: registerNumber,
    recalculateCounters: recalculateCounters,
    computeTotals: computeTotals,
    documentTotal: documentTotal,
    effectiveStatus: effectiveStatus,
    fmtMoney: fmtMoney,
    fmtNumber: fmtNumber,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    getClient: getClient,
    saveClient: saveClient,
    deleteClient: deleteClient,
    getDocument: getDocument,
    saveDocument: saveDocument,
    deleteDocument: deleteDocument,
    snapshotClient: snapshotClient,
    validateDocument: validateDocument,
    seedDemo: seedDemo,
    clientsCSV: clientsCSV,
    documentsCSV: documentsCSV,
    backupJSON: backupJSON,
    importJSON: importJSON,
    download: download,
    sanitizeState: sanitizeState,
    replaceState: function (newState) {
      state = sanitizeState(newState);
      recalculateCounters();
      save();
    },
    resetAll: function () {
      localStorage.removeItem(STATE_KEY);
    },
    DEFAULTS: DEFAULTS
  };

  window.Store = Store;
})();
