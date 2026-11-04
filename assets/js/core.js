/* =========================================================
   PresuFactu · Núcleo: utilidades, acceso, shell, panel y clientes
   ========================================================= */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const VIEW_META = {
    panel: { title: "Panel", subtitle: "Resumen de tu actividad" },
    clientes: { title: "Clientes", subtitle: "Gestiona tu cartera de clientes" },
    presupuestos: { title: "Presupuestos", subtitle: "Propuestas y ofertas para tus clientes" },
    facturas: { title: "Facturas", subtitle: "Emisión, cobro y seguimiento" },
    ajustes: { title: "Ajustes", subtitle: "Configuración de la aplicación" }
  };

  const QUOTE_STATUS = {
    draft: ["Borrador", "gray"],
    sent: ["Enviado", "blue"],
    accepted: ["Aceptado", "green"],
    rejected: ["Rechazado", "red"],
    invoiced: ["Facturado", "purple"]
  };

  const INVOICE_STATUS = {
    draft: ["Borrador", "gray"],
    issued: ["Emitida", "blue"],
    paid: ["Pagada", "green"],
    overdue: ["Vencida", "amber"],
    cancelled: ["Anulada", "red"]
  };

  const filters = {
    clients: { q: "" },
    quote: { q: "", status: "", year: "" },
    invoice: { q: "", status: "", year: "" }
  };

  let route = "panel";
  let idleTimer = null;
  let lastTouch = 0;
  let modals = [];

  function S() {
    return Store.state;
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || "") + '"><use href="#i-' + name + '"></use></svg>';
  }

  function statusInfo(doc) {
    const effective = Store.effectiveStatus(doc);
    const map = doc.type === "invoice" ? INVOICE_STATUS : QUOTE_STATUS;
    return { key: effective, label: (map[effective] || [effective, "gray"])[0], color: (map[effective] || [effective, "gray"])[1] };
  }

  function statusBadge(doc) {
    const info = statusInfo(doc);
    return '<span class="badge ' + info.color + '">' + esc(info.label) + "</span>";
  }

  function statusLabel(doc) {
    return statusInfo(doc).label;
  }

  function relativeTime(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (!isFinite(then)) return "";
    const diff = Math.max(0, Date.now() - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "hace un momento";
    if (mins < 60) return "hace " + mins + " min";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return "hace " + hours + " h";
    const days = Math.floor(hours / 24);
    if (days < 7) return "hace " + days + " d";
    return Store.fmtDate(new Date(then).toISOString().slice(0, 10));
  }

  /* ========================= MODALES ========================= */

  function openModal(options) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML =
      '<div class="modal ' + (options.size || "") + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          '<div><h3>' + esc(options.title || "") + "</h3>" +
          (options.subtitle ? "<p>" + esc(options.subtitle) + "</p>" : "") + "</div>" +
          '<button type="button" class="icon-btn" data-close="1" aria-label="Cerrar">' + icon("x") + "</button>" +
        "</div>" +
        '<div class="modal-body ' + (options.bodyClass || "") + '">' + (options.content || "") + "</div>" +
        (options.footer ? '<div class="modal-foot">' + options.footer + "</div>" : "") +
      "</div>";

    const entry = { el: overlay, onClose: options.onClose, closed: false };
    modals.push(entry);
    $("#modal-root").appendChild(overlay);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay || event.target.closest("[data-close]")) {
        event.preventDefault();
        closeModal(overlay);
      }
    });

    const focusTarget = overlay.querySelector("form input:not([type=hidden]):not([readonly]), form select, form textarea");
    if (focusTarget) {
      setTimeout(function () { focusTarget.focus(); }, 70);
    }

    return overlay;
  }

  function closeModal(overlay) {
    const index = modals.findIndex(function (entry) { return entry.el === overlay; });
    if (index === -1) return;
    const entry = modals[index];
    modals.splice(index, 1);
    entry.el.remove();
    if (!entry.closed) {
      entry.closed = true;
      if (typeof entry.onClose === "function") {
        try { entry.onClose(); } catch (err) { console.error(err); }
      }
    }
    if (!modals.length) document.body.style.overflow = "";
  }

  function closeTopModal() {
    if (!modals.length) return;
    closeModal(modals[modals.length - 1].el);
  }

  function closeAllModals() {
    while (modals.length) {
      const entry = modals.pop();
      entry.el.remove();
      if (!entry.closed) {
        entry.closed = true;
        if (typeof entry.onClose === "function") {
          try { entry.onClose(); } catch (err) { console.error(err); }
        }
      }
    }
    document.body.style.overflow = "";
  }

  function confirmDialog(options) {
    return new Promise(function (resolve) {
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      const overlay = openModal({
        title: options.title || "Confirmar",
        subtitle: options.subtitle || "",
        size: "sm",
        content: '<p class="confirm-text">' + (options.message || "") + "</p>",
        footer:
          '<button type="button" class="btn btn-ghost" data-confirm="0">Cancelar</button>' +
          '<button type="button" class="btn ' + (options.danger ? "btn-danger" : "btn-primary") + '" data-confirm="1" style="margin-left:auto">' +
            esc(options.confirmText || "Confirmar") + "</button>",
        onClose: function () { finish(false); }
      });
      overlay.querySelectorAll("[data-confirm]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-confirm") === "1";
          finish(value);
          closeModal(overlay);
        });
      });
    });
  }

  /* ========================= TOAST ========================= */

  function toast(message, type) {
    type = type || "info";
    const icons = { success: "check-circle", error: "alert", warning: "alert", info: "cloud" };
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = icon(icons[type] || "cloud") + "<span>" + esc(message) + "</span>";
    $("#toast-root").appendChild(el);
    const remove = function () {
      el.style.opacity = "0";
      el.style.transform = "translateX(12px)";
      el.style.transition = "opacity .2s, transform .2s";
      setTimeout(function () { el.remove(); }, 220);
    };
    el.addEventListener("click", remove);
    setTimeout(remove, 4600);
  }

  /* ========================= TEMA Y SHELL ========================= */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }

  function toggleTheme() {
    const next = S().settings.theme === "dark" ? "light" : "dark";
    S().settings.theme = next;
    applyTheme(next);
    Store.save();
  }

  function updateShell() {
    const state = S();
    if (!state) return;
    const clients = state.clients.filter(function (c) { return !c.deletedAt; }).length;
    const quotes = state.documents.filter(function (d) { return d.type === "quote"; }).length;
    const invoices = state.documents.filter(function (d) { return d.type === "invoice"; }).length;
    const set = function (id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set("nav-count-clients", clients);
    set("nav-count-quotes", quotes);
    set("nav-count-invoices", invoices);
    set("user-name", Auth.getUser() || "admin");
    const avatar = document.getElementById("user-avatar");
    if (avatar) avatar.textContent = (Auth.getUser() || "A").charAt(0).toUpperCase();
    updateSyncUI();
  }

  function updateSyncUI() {
    const config = S().settings.sheets;
    const configured = Sheets.hasConfig();
    const busy = Sheets.isBusy();
    let dot = "";
    let text = "Sheets sin configurar";
    let detail = "Añade la URL y el token en Ajustes.";

    if (configured && busy) {
      dot = "sync";
      text = "Sincronizando…";
      detail = "Conectando con Google Sheets.";
    } else if (configured && config.lastError) {
      dot = "err";
      text = "Error de sincronización";
      detail = config.lastError;
    } else if (configured && config.lastSync) {
      dot = "ok";
      text = "Sincronizado " + relativeTime(config.lastSync);
      detail = "Última sincronización: " + Store.fmtDateTime(config.lastSync);
    } else if (configured) {
      dot = "";
      text = "Sheets listo";
      detail = "Configurado, todavía sin sincronizar.";
    }

    const pill = document.getElementById("sync-pill");
    if (pill) {
      pill.querySelector(".sync-dot").className = "sync-dot " + dot;
      document.getElementById("sync-pill-text").textContent = text;
    }
    const sidebar = document.getElementById("sidebar-sync");
    if (sidebar) {
      sidebar.querySelector(".sync-dot").className = "sync-dot " + dot;
      const txt = document.getElementById("sidebar-sync-text");
      if (txt) txt.textContent = text;
    }
    const box = document.getElementById("settings-sync-status");
    if (box) {
      box.innerHTML = '<span class="sync-dot ' + dot + '"></span><div><strong class="' +
        (dot === "err" ? "err" : dot === "ok" ? "ok" : "") + '">' + esc(text) + "</strong>" +
        '<div class="small muted">' + esc(detail) + "</div></div>";
    }
  }

  /* ========================= NAVEGACIÓN ========================= */

  function currentRouteName() {
    const raw = String(window.location.hash || "").replace(/^#\/?/, "").split("?")[0];
    return VIEW_META[raw] ? raw : "panel";
  }

  function go(name) {
    if (!VIEW_META[name]) name = "panel";
    if (window.location.hash !== "#/" + name) {
      window.location.hash = "#/" + name;
    } else {
      renderRoute(name);
    }
  }

  function renderRoute(name) {
    route = name || currentRouteName();
    const meta = VIEW_META[route] || VIEW_META.panel;
    document.title = "PresuFactu · " + meta.title;
    const titleEl = document.getElementById("page-title");
    const subtitleEl = document.getElementById("page-subtitle");
    if (titleEl) titleEl.textContent = meta.title;
    if (subtitleEl) subtitleEl.textContent = meta.subtitle;

    $$(".nav-item").forEach(function (item) {
      item.classList.toggle("active", item.getAttribute("data-nav") === route);
    });

    closeSidebar();
    updateShell();

    if (route === "panel") PF.renderDashboard();
    else if (route === "clientes") PF.renderClients();
    else if (route === "presupuestos") PF.renderDocuments("quote");
    else if (route === "facturas") PF.renderDocuments("invoice");
    else PF.renderSettings();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (sidebar) sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("show");
  }

  function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!sidebar) return;
    sidebar.classList.toggle("open");
    if (backdrop) backdrop.classList.toggle("show", sidebar.classList.contains("open"));
  }

  /* ========================= AUTENTICACIÓN ========================= */

  function showAuthSetup() {
    closeAllModals();
    document.getElementById("app").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
    document.getElementById("setup-form").classList.remove("hidden");
    document.getElementById("login-form").classList.add("hidden");
    const user = document.getElementById("setup-user");
    if (user) user.value = "admin";
    ["setup-pin", "setup-pin2"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    authError("setup", "");
    setTimeout(function () { if (user) user.focus(); }, 100);
  }

  function showAuthLogin(message) {
    closeAllModals();
    document.getElementById("app").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
    document.getElementById("setup-form").classList.add("hidden");
    document.getElementById("login-form").classList.remove("hidden");
    const user = document.getElementById("login-user");
    const pin = document.getElementById("login-pin");
    if (user) user.value = Auth.getUser() || "admin";
    if (pin) pin.value = "";
    authError("login", "");
    if (message) toast(message, "info");
    setTimeout(function () { if (pin) pin.focus(); }, 120);
  }

  function authError(which, message) {
    const el = document.getElementById(which + "-error");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("hidden", !message);
  }

  function setAuthBusy(which, busy) {
    const button = document.getElementById(which + "-submit");
    if (!button) return;
    button.disabled = busy;
    if (!button.dataset.original) button.dataset.original = button.innerHTML;
    button.innerHTML = busy ? "Comprobando…" : button.dataset.original;
  }

  async function handleSetup(form) {
    const username = form.querySelector("#setup-user").value.trim() || "admin";
    const pin = form.querySelector("#setup-pin").value.trim();
    const pin2 = form.querySelector("#setup-pin2").value.trim();
    authError("setup", "");
    if (pin.length < 4) return authError("setup", "El PIN debe tener al menos 4 caracteres.");
    if (pin !== pin2) return authError("setup", "Los dos PIN no coinciden.");
    setAuthBusy("setup", true);
    try {
      await Auth.configure(username, pin);
      boot();
      toast("Acceso creado. ¡Bienvenido!", "success");
      if (!S().settings.company.name) {
        setTimeout(function () {
          go("ajustes");
          toast("Completa los datos de tu empresa para empezar.", "info");
        }, 500);
      }
    } catch (err) {
      authError("setup", err.message || "No se pudo crear el acceso.");
    } finally {
      setAuthBusy("setup", false);
    }
  }

  async function handleLogin(form) {
    const username = form.querySelector("#login-user").value.trim();
    const pin = form.querySelector("#login-pin").value.trim();
    authError("login", "");
    if (!pin) return authError("login", "Introduce tu PIN.");
    setAuthBusy("login", true);
    try {
      const result = await Auth.login(username, pin);
      if (!result.ok) {
        authError("login", result.error);
        form.querySelector("#login-pin").value = "";
        form.querySelector("#login-pin").focus();
        return;
      }
      boot();
    } catch (err) {
      authError("login", err.message || "No se pudo comprobar el PIN.");
    } finally {
      setAuthBusy("login", false);
    }
  }

  function boot() {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    applyTheme(S().settings.theme);
    Sheets.init();
    updateShell();
    renderRoute(currentRouteName());
    startIdleWatch();
    Auth.touch();
  }

  function lockApp(message) {
    Auth.logout();
    showAuthLogin(message || "Sesión bloqueada. Introduce tu PIN para continuar.");
  }

  function logoutApp() {
    Auth.logout();
    showAuthLogin("Has cerrado la sesión.");
  }

  async function forgotPin() {
    const ok = await confirmDialog({
      title: "Recuperar acceso",
      message:
        "<strong>El PIN es una barrera de acceso local, no un cifrado de los datos.</strong><br><br>" +
        "Si lo has olvidado puedes restablecer el acceso en este dispositivo. Tus clientes, presupuestos y facturas se conservarán. " +
        "Para evitar que alguien pueda hacer esto, mantén el dispositivo protegido y usa la copia de seguridad.",
      confirmText: "Restablecer acceso",
      danger: true
    });
    if (!ok) return;
    Auth.resetAccess();
    showAuthSetup();
    toast("Acceso restablecido. Crea un nuevo PIN.", "warning");
  }

  function startIdleWatch() {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(function () {
      if (Auth.isAuthenticated() && Auth.idleMinutes() > 30) {
        lockApp("Sesión bloqueada por inactividad. Introduce tu PIN para continuar.");
      }
    }, 30000);
  }

  function touchSession() {
    const now = Date.now();
    if (now - lastTouch < 15000) return;
    lastTouch = now;
    if (Auth.isAuthenticated()) Auth.touch();
  }

  /* ========================= PANEL ========================= */

  function renderDashboard() {
    const view = $("#view");
    const state = S();
    const hasData = state.clients.length > 0 || state.documents.length > 0;

    if (!hasData) {
      view.innerHTML =
        '<div class="page-head"><div><h2>Tu centro de mando</h2><p>Todo listo para crear tu primer presupuesto o factura.</p></div></div>' +
        '<div class="card card-pad">' +
          '<div class="empty-state" style="padding:40px 20px">' +
            '<div class="empty-icon">' + icon("trend") + "</div>" +
            "<h3>Empieza en tres pasos</h3>" +
            '<p>Configura tu empresa, añade un cliente y crea tu primer documento. También puedes cargar datos de ejemplo para explorar la aplicación.</p>' +
            '<div class="btn-row" style="justify-content:center">' +
              '<button class="btn btn-primary" data-action="go-settings">Configurar empresa</button>' +
              '<button class="btn" data-action="new-client">' + icon("users") + " Añadir cliente</button>" +
              '<button class="btn" data-action="seed-demo">Cargar datos de ejemplo</button>' +
            "</div>" +
          "</div>" +
        "</div>";
      return;
    }

    const year = new Date().getFullYear();
    const invoices = state.documents.filter(function (d) { return d.type === "invoice"; });
    const active = invoices.filter(function (d) {
      const st = Store.effectiveStatus(d);
      return st !== "cancelled" && st !== "draft";
    });
    let invoiced = 0;
    let paid = 0;
    let pending = 0;
    active.forEach(function (doc) {
      const total = Store.documentTotal(doc);
      if (Store.yearOf(doc.issueDate) === year) invoiced += total;
      if (Store.effectiveStatus(doc) === "paid") paid += total;
      else pending += total;
    });
    const openQuotes = state.documents.filter(function (d) {
      return d.type === "quote" && ["sent", "accepted"].indexOf(d.status) !== -1;
    });
    const openQuotesValue = openQuotes.reduce(function (sum, doc) { return sum + Store.documentTotal(doc); }, 0);

    view.innerHTML =
      '<div class="page-head">' +
        '<div><h2>Hola, ' + esc(Auth.getUser() || "admin") + " 👋</h2><p>Este es el estado de tu actividad en " + year + ".</p></div>" +
        '<div class="page-actions">' +
          '<button class="btn" data-action="new-doc" data-type="quote">' + icon("file") + " Nuevo presupuesto</button>" +
          '<button class="btn btn-primary" data-action="new-doc" data-type="invoice">' + icon("plus") + " Nueva factura</button>" +
        "</div>" +
      "</div>" +
      '<div class="stats-grid">' +
        statCard("trend", "Facturado en " + year, Store.fmtMoney(invoiced), active.length + " facturas emitidas", "") +
        statCard("wallet", "Cobrado", Store.fmtMoney(paid), "Facturas pagadas", "success") +
        statCard("clock", "Pendiente de cobro", Store.fmtMoney(pending), "Facturas emitidas sin pagar", "warning") +
        statCard("file", "Presupuestos abiertos", String(openQuotes.length), Store.fmtMoney(openQuotesValue) + " en juego", "purple") +
      "</div>" +
      '<div class="dash-grid">' +
        '<div class="card">' +
          '<div class="card-head"><div class="icon-wrap">' + icon("trend") + '</div><div class="grow"><h3>Facturación de los últimos 6 meses</h3><p>Importe total de facturas emitidas y cobradas</p></div></div>' +
          '<div class="card-pad">' + chartHTML(invoices) + "</div>" +
        "</div>" +
        '<div class="card">' +
          '<div class="card-head"><div class="icon-wrap">' + icon("receipt") + '</div><div class="grow"><h3>Últimos documentos</h3><p>Actividad reciente</p></div></div>' +
          '<div class="table-wrap">' + recentDocsHTML() + "</div>" +
        "</div>" +
      "</div>";
  }

  function statCard(iconName, label, value, sub, color) {
    return '<div class="stat-card ' + (color || "") + '">' +
      '<div class="stat-top"><div class="stat-icon">' + icon(iconName) + '</div><span class="stat-label">' + esc(label) + "</span></div>" +
      '<div class="stat-value">' + esc(value) + "</div>" +
      '<div class="stat-sub">' + esc(sub) + "</div>" +
    "</div>";
  }

  function chartHTML(invoices) {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""),
        total: 0
      });
    }
    invoices.forEach(function (doc) {
      const st = Store.effectiveStatus(doc);
      if (st === "cancelled" || st === "draft") return;
      const parts = String(doc.issueDate || "").split("-");
      if (parts.length < 3) return;
      const y = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const slot = months.filter(function (x) { return x.year === y && x.month === m; })[0];
      if (slot) slot.total += Store.documentTotal(doc);
    });
    const max = Math.max.apply(null, months.map(function (m) { return m.total; })) || 1;
    return '<div class="chart">' +
      months.map(function (m) {
        const height = m.total > 0 ? Math.max(8, Math.round(m.total / max * 100)) : 2;
        return '<div class="chart-col" title="' + esc(m.label + " " + m.year + ": " + Store.fmtMoney(m.total)) + '">' +
          '<span class="amount">' + (m.total > 0 ? Store.fmtMoney(m.total, { decimals: 0 }) : "") + "</span>" +
          '<div class="chart-bar-wrap"><div class="chart-bar ' + (m.total > 0 ? "" : "empty") + '" style="height:' + height + '%"></div></div>' +
          '<span class="label">' + esc(m.label) + "</span>" +
        "</div>";
      }).join("") +
    "</div>";
  }

  function recentDocsHTML() {
    const docs = S().documents.slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    }).slice(0, 6);
    if (!docs.length) {
      return '<div class="empty-state"><p class="muted">Todavía no hay documentos.</p></div>';
    }
    return '<table class="data"><tbody>' +
      docs.map(function (doc) {
        const client = doc.clientSnapshot && doc.clientSnapshot.name ? doc.clientSnapshot.name : "Sin cliente";
        return '<tr class="row-click" data-action="preview-doc" data-id="' + esc(doc.id) + '">' +
          "<td><div class=\"cell-title\">" + esc(doc.number) + '</div><div class="cell-sub">' + esc(client) + "</div></td>" +
          '<td class="nowrap">' + statusBadge(doc) + "</td>" +
          '<td class="num nowrap"><strong>' + esc(Store.fmtMoney(Store.documentTotal(doc))) + "</strong></td>" +
        "</tr>";
      }).join("") +
    "</tbody></table>";
  }

  /* ========================= CLIENTES ========================= */

  function renderClients() {
    const view = $("#view");
    view.innerHTML =
      '<div class="page-head">' +
        '<div><h2>Clientes</h2><p>Contactos y datos fiscales para tus documentos.</p></div>' +
        '<div class="page-actions">' +
          '<button class="btn" data-action="new-doc" data-type="quote">' + icon("file") + " Presupuesto</button>" +
          '<button class="btn btn-primary" data-action="new-client">' + icon("plus") + " Nuevo cliente</button>" +
        "</div>" +
      "</div>" +
      '<div class="card">' +
        '<div class="toolbar">' +
          '<div class="search-box">' + icon("search") + '<input type="search" id="client-search" placeholder="Buscar por nombre, NIF, email o ciudad…" value="' + esc(filters.clients.q) + '"></div>' +
          '<span class="count" id="clients-count"></span>' +
        "</div>" +
        '<div id="clients-table-wrap">' + clientsTableHTML() + "</div>" +
      "</div>";
    refreshClients();
  }

  function refreshClients() {
    const wrap = document.getElementById("clients-table-wrap");
    if (wrap) wrap.innerHTML = clientsTableHTML();
    const count = document.getElementById("clients-count");
    if (count) {
      const list = filteredClients();
      count.textContent = list.length + (list.length === 1 ? " cliente" : " clientes");
    }
  }

  function filteredClients() {
    const q = filters.clients.q.trim().toLowerCase();
    return S().clients.filter(function (client) {
      if (client.deletedAt) return false;
      if (!q) return true;
      const haystack = [client.name, client.nif, client.email, client.city, client.phone].join(" ").toLowerCase();
      return haystack.indexOf(q) !== -1;
    }).sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""), "es");
    });
  }

  function clientsTableHTML() {
    const list = filteredClients();
    if (!list.length) {
      const hasClients = S().clients.filter(function (c) { return !c.deletedAt; }).length > 0;
      return '<div class="empty-state">' +
        '<div class="empty-icon">' + icon("users") + "</div>" +
        "<h3>" + (hasClients ? "Sin resultados" : "Aún no tienes clientes") + "</h3>" +
        "<p>" + (hasClients ? "Prueba con otro término de búsqueda." : "Añade tu primer cliente para poder crear presupuestos y facturas.") + "</p>" +
        (hasClients ? "" : '<button class="btn btn-primary" data-action="new-client">' + icon("plus") + " Nuevo cliente</button>") +
      "</div>";
    }
    return '<table class="data"><thead><tr>' +
      "<th>Cliente</th><th>Contacto</th><th>Ubicación</th><th>Documentos</th><th></th>" +
      "</tr></thead><tbody>" +
      list.map(function (client) {
        const docs = S().documents.filter(function (d) { return d.clientId === client.id; });
        const location = [client.zip, client.city].filter(Boolean).join(" ") || client.country || "—";
        return '<tr class="row-click" data-action="edit-client" data-id="' + esc(client.id) + '">' +
          '<td><div class="cell-title">' + esc(client.name || "Sin nombre") + "</div>" +
            '<div class="cell-sub">' + esc(client.nif || "Sin NIF/CIF") + "</div></td>" +
          "<td>" + (client.email ? '<div class="cell-title" style="font-weight:500">' + esc(client.email) + "</div>" : "") +
            (client.phone ? '<div class="cell-sub">' + esc(client.phone) + "</div>" : "") +
            (!client.email && !client.phone ? '<span class="muted">—</span>' : "") + "</td>" +
          "<td>" + esc(location) + (client.country && client.country !== "España" ? '<div class="cell-sub">' + esc(client.country) + "</div>" : "") + "</td>" +
          '<td><span class="badge gray">' + docs.length + "</span></td>" +
          '<td><div class="actions">' +
            '<button class="icon-btn tiny" title="Editar cliente" data-action="edit-client" data-id="' + esc(client.id) + '">' + icon("edit") + "</button>" +
            '<button class="icon-btn tiny danger" title="Eliminar cliente" data-action="delete-client" data-id="' + esc(client.id) + '">' + icon("trash") + "</button>" +
          "</div></td>" +
        "</tr>";
      }).join("") +
      "</tbody></table>";
  }

  function openClientForm(id, options) {
    options = options || {};
    const client = id ? Store.getClient(id) : null;
    if (id && !client) return;
    const data = client || { name: "", nif: "", email: "", phone: "", address: "", city: "", zip: "", country: "España", notes: "" };
    const isQuick = !!options.quick;
    const overlay = openModal({
      title: client ? "Editar cliente" : (isQuick ? "Nuevo cliente rápido" : "Nuevo cliente"),
      subtitle: client ? "Datos de contacto y facturación" : "Añade los datos fiscales del cliente",
      size: "md",
      content:
        '<form id="client-form" data-client-id="' + esc(client ? client.id : "") + '" data-quick="' + (isQuick ? "1" : "0") + '" autocomplete="off">' +
          '<div class="form-grid">' +
            '<label class="field span-2"><span>Nombre o razón social *</span><input type="text" name="name" value="' + esc(data.name) + '" placeholder="Ej. Construcciones Sierra S.L." required></label>' +
            '<label class="field"><span>NIF / CIF</span><input type="text" name="nif" value="' + esc(data.nif) + '" placeholder="B12345678"></label>' +
            '<label class="field"><span>Email</span><input type="email" name="email" value="' + esc(data.email) + '" placeholder="cliente@email.com"></label>' +
            '<label class="field"><span>Teléfono</span><input type="tel" name="phone" value="' + esc(data.phone) + '" placeholder="600 000 000"></label>' +
            '<label class="field"><span>País</span><input type="text" name="country" value="' + esc(data.country) + '"></label>' +
            '<label class="field span-2"><span>Dirección</span><input type="text" name="address" value="' + esc(data.address) + '" placeholder="Calle, número, piso…"></label>' +
            '<label class="field"><span>Código postal</span><input type="text" name="zip" value="' + esc(data.zip) + '" placeholder="28001"></label>' +
            '<label class="field"><span>Ciudad</span><input type="text" name="city" value="' + esc(data.city) + '" placeholder="Madrid"></label>' +
            '<label class="field span-2"><span>Notas</span><textarea name="notes" placeholder="Observaciones internas…">' + esc(data.notes) + "</textarea></label>" +
          "</div>" +
          '<div id="client-form-error" class="form-error hidden mt-2"></div>' +
        "</form>",
      footer:
        '<button type="button" class="btn btn-ghost" data-close="1">Cancelar</button>' +
        '<button type="submit" form="client-form" class="btn btn-primary">' + (client ? "Guardar cambios" : "Crear cliente") + "</button>"
    });
    void overlay;
  }

  function saveClientForm(form) {
    const id = form.getAttribute("data-client-id") || "";
    const quick = form.getAttribute("data-quick") === "1";
    const data = {
      name: form.elements.name.value.trim(),
      nif: form.elements.nif.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      address: form.elements.address.value.trim(),
      city: form.elements.city.value.trim(),
      zip: form.elements.zip.value.trim(),
      country: form.elements.country.value.trim(),
      notes: form.elements.notes.value.trim()
    };
    const errorEl = document.getElementById("client-form-error");
    if (!data.name) {
      if (errorEl) {
        errorEl.textContent = "El nombre del cliente es obligatorio.";
        errorEl.classList.remove("hidden");
      }
      return;
    }
    const saved = Store.saveClient(data, id || null);
    closeTopModal();
    toast(id ? "Cliente actualizado." : "Cliente creado.", "success");

    if (quick) {
      if (PF.setDocumentClient) PF.setDocumentClient(saved.id);
      else if (PF.refreshClientHint) PF.refreshClientHint();
    }
    updateShell();
    if (route === "clientes") refreshClients();
    else if (route === "panel") renderDashboard();
    if (PF.refreshOpenDocumentTotal) PF.refreshOpenDocumentTotal();
  }

  async function deleteClient(id) {
    const client = Store.getClient(id);
    if (!client) return;
    const docs = S().documents.filter(function (d) { return d.clientId === id; });
    const ok = await confirmDialog({
      title: "Eliminar cliente",
      message: docs.length
        ? "El cliente <strong>" + esc(client.name) + "</strong> tiene " + docs.length +
          (docs.length === 1 ? " documento" : " documentos") +
          ". Se eliminará de la lista, pero los documentos conservarán sus datos históricos."
        : "¿Seguro que quieres eliminar a <strong>" + esc(client.name) + "</strong>? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    Store.deleteClient(id);
    updateShell();
    renderClients();
    toast("Cliente eliminado.", "success");
  }

  function clientOptions(selectedId) {
    const clients = S().clients.filter(function (c) { return !c.deletedAt || c.id === selectedId; })
      .sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || ""), "es"); });
    let html = '<option value="">— Seleccionar cliente —</option>';
    clients.forEach(function (client) {
      html += '<option value="' + esc(client.id) + '"' + (client.id === selectedId ? " selected" : "") + ">" +
        esc(client.name) + (client.deletedAt ? " (eliminado)" : "") + "</option>";
    });
    return html;
  }

  /* ========================= EXPOSICIÓN ========================= */

  const PF = {
    $: $,
    $$: $$,
    esc: esc,
    icon: icon,
    S: S,
    filters: filters,
    statusBadge: statusBadge,
    statusInfo: statusInfo,
    statusLabel: statusLabel,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    closeTopModal: closeTopModal,
    closeAllModals: closeAllModals,
    confirmDialog: confirmDialog,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    updateShell: updateShell,
    updateSyncUI: updateSyncUI,
    relativeTime: relativeTime,
    renderRoute: renderRoute,
    currentRouteName: currentRouteName,
    go: go,
    toggleSidebar: toggleSidebar,
    closeSidebar: closeSidebar,
    renderDashboard: renderDashboard,
    renderClients: renderClients,
    refreshClients: refreshClients,
    openClientForm: openClientForm,
    saveClientForm: saveClientForm,
    deleteClient: deleteClient,
    clientOptions: clientOptions,
    showAuthSetup: showAuthSetup,
    showAuthLogin: showAuthLogin,
    handleSetup: handleSetup,
    handleLogin: handleLogin,
    forgotPin: forgotPin,
    lockApp: lockApp,
    logoutApp: logoutApp,
    startIdleWatch: startIdleWatch,
    touchSession: touchSession,
    boot: boot
  };

  window.PF = PF;
})();
