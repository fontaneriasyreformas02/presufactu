/* =========================================================
   PresuFactu · Arranque y eventos globales
   ========================================================= */
(function () {
  "use strict";

  const $ = PF.$;

  /* ========================= ACCIONES ========================= */

  document.addEventListener("click", async function (event) {
    const target = event.target.closest("[data-action]");
    if (target) {
      const action = target.getAttribute("data-action");
      const id = target.getAttribute("data-id");

      if (action === "new-doc") event.preventDefault();
      if (action === "new-client") event.preventDefault();

      switch (action) {
        case "toggle-sidebar":
          event.preventDefault();
          PF.toggleSidebar();
          break;

        case "toggle-theme":
          event.preventDefault();
          PF.toggleTheme();
          break;

        case "lock":
          event.preventDefault();
          PF.lockApp();
          break;

        case "logout":
          event.preventDefault();
          PF.logoutApp();
          break;

        case "forgot-pin":
          event.preventDefault();
          PF.forgotPin();
          break;

        case "go-sync":
          event.preventDefault();
          PF.go("ajustes");
          setTimeout(function () { PF.jumpSettings("sheets"); }, 180);
          break;

        case "go-settings":
          event.preventDefault();
          PF.go("ajustes");
          break;

        case "sync-now":
          event.preventDefault();
          PF.syncNow();
          break;

        case "close-modal":
          event.preventDefault();
          PF.closeTopModal();
          break;

        case "new-client":
          event.preventDefault();
          PF.openClientForm(null);
          break;

        case "edit-client":
          event.preventDefault();
          PF.openClientForm(id);
          break;

        case "delete-client":
          event.preventDefault();
          PF.deleteClient(id);
          break;

        case "new-doc":
          event.preventDefault();
          PF.openDocumentForm(target.getAttribute("data-type") === "invoice" ? "invoice" : "quote");
          break;

        case "edit-doc": {
          event.preventDefault();
          const doc = Store.getDocument(id);
          if (!doc) break;
          PF.closeTopModal();
          PF.openDocumentForm(doc.type, doc.id);
          break;
        }

        case "preview-doc":
          event.preventDefault();
          PF.openPreview(id);
          break;

        case "delete-doc":
          event.preventDefault();
          PF.deleteDoc(id);
          break;

        case "duplicate-doc":
          event.preventDefault();
          PF.duplicateDoc(id);
          break;

        case "convert-doc":
          event.preventDefault();
          PF.convertDoc(id);
          break;

        case "pay-doc":
          event.preventDefault();
          PF.markPaid(id);
          break;

        case "print-doc":
          event.preventDefault();
          PF.printDoc(id);
          break;

        case "add-line":
          event.preventDefault();
          PF.addLine();
          break;

        case "remove-line":
          event.preventDefault();
          PF.removeLine(target);
          break;

        case "quick-client":
          event.preventDefault();
          PF.openClientForm(null, { quick: true });
          break;

        case "seed-demo": {
          event.preventDefault();
          const ok = await PF.confirmDialog({
            title: "Cargar datos de ejemplo",
            message: "Se añadirán 3 clientes y 4 documentos de ejemplo para que puedas explorar la aplicación. Podrás eliminarlos cuando quieras.",
            confirmText: "Cargar ejemplos"
          });
          if (!ok) break;
          Store.seedDemo();
          PF.updateShell();
          PF.renderRoute("panel");
          PF.toast("Datos de ejemplo cargados.", "success");
          break;
        }

        case "settings-jump":
          event.preventDefault();
          PF.jumpSettings(target.getAttribute("data-target"));
          break;

        case "add-tax-row":
          event.preventDefault();
          PF.addTaxRow();
          break;

        case "remove-tax-row":
          event.preventDefault();
          PF.removeTaxRow(target);
          break;

        case "upload-logo":
          event.preventDefault();
          {
            const input = document.getElementById("logo-file");
            if (input) input.click();
          }
          break;

        case "remove-logo":
          event.preventDefault();
          PF.removeLogo();
          break;

        case "toggle-token":
          event.preventDefault();
          PF.toggleToken();
          break;

        case "test-sync":
          event.preventDefault();
          PF.testSync();
          break;

        case "push-sync":
          event.preventDefault();
          PF.pushSync();
          break;

        case "pull-sync":
          event.preventDefault();
          PF.pullSync();
          break;

        case "export-json":
          event.preventDefault();
          PF.exportJSON();
          break;

        case "export-clients-csv":
          event.preventDefault();
          Store.download("presufactu-clientes-" + Store.todayISO() + ".csv", Store.clientsCSV(), "text/csv;charset=utf-8");
          PF.toast("Clientes exportados en CSV.", "success");
          break;

        case "export-quotes-csv":
          event.preventDefault();
          Store.download("presufactu-presupuestos-" + Store.todayISO() + ".csv", Store.documentsCSV("quote"), "text/csv;charset=utf-8");
          PF.toast("Presupuestos exportados en CSV.", "success");
          break;

        case "export-invoices-csv":
          event.preventDefault();
          Store.download("presufactu-facturas-" + Store.todayISO() + ".csv", Store.documentsCSV("invoice"), "text/csv;charset=utf-8");
          PF.toast("Facturas exportadas en CSV.", "success");
          break;

        case "import-json":
          event.preventDefault();
          {
            const input = document.getElementById("import-file");
            if (input) input.click();
          }
          break;

        case "import-clients-csv":
          event.preventDefault();
          {
            const input = document.getElementById("import-clients-file");
            if (input) input.click();
          }
          break;

        case "reset-data":
          event.preventDefault();
          PF.resetData();
          break;

        default:
          break;
      }
      return;
    }

    const backdrop = event.target.closest("#sidebar-backdrop");
    if (backdrop) PF.closeSidebar();
  });

  /* ========================= FORMULARIOS ========================= */

  document.addEventListener("submit", function (event) {
    const form = event.target;
    if (!form || !form.id) return;

    if (form.id === "setup-form") {
      event.preventDefault();
      PF.handleSetup(form);
      return;
    }
    if (form.id === "login-form") {
      event.preventDefault();
      PF.handleLogin(form);
      return;
    }
    if (form.id === "client-form") {
      event.preventDefault();
      PF.saveClientForm(form);
      return;
    }
    if (form.id === "doc-form") {
      event.preventDefault();
      PF.saveDocForm(form);
      return;
    }
    if (form.id.indexOf("settings-") === 0) {
      event.preventDefault();
      PF.handleSettingsSubmit(form);
    }
  });

  /* ========================= FILTROS Y CAMPOS EN VIVO ========================= */

  document.addEventListener("input", function (event) {
    const target = event.target;

    if (target.id === "client-search") {
      PF.filters.clients.q = target.value;
      PF.refreshClients();
      return;
    }
    if (target.id === "doc-search") {
      const type = PF.currentRouteName() === "presupuestos" ? "quote" : "invoice";
      PF.filters[type].q = target.value;
      PF.refreshDocuments(type);
      return;
    }
    if (target.closest && target.closest("#doc-form")) {
      PF.recalcDocForm();
      return;
    }
    if (target.closest && target.closest("#settings-currency")) {
      PF.updateCurrencyPreview();
      return;
    }
    if (target.closest && target.closest("#settings-numbering")) {
      PF.updateNumberingPreview();
    }
  });

  document.addEventListener("change", function (event) {
    const target = event.target;

    if (target.id === "doc-status") {
      const type = PF.currentRouteName() === "presupuestos" ? "quote" : "invoice";
      PF.filters[type].status = target.value;
      PF.refreshDocuments(type);
      return;
    }
    if (target.id === "doc-year") {
      const type = PF.currentRouteName() === "presupuestos" ? "quote" : "invoice";
      PF.filters[type].year = target.value;
      PF.refreshDocuments(type);
      return;
    }
    if (target.closest && target.closest("#doc-form")) {
      PF.recalcDocForm();
      if (target.name === "clientId") PF.refreshClientHint();
      return;
    }
    if (target.id === "logo-file") {
      PF.handleLogoFile(target);
      return;
    }
    if (target.id === "import-file") {
      PF.importJSONFile(target);
    }
    if (target.id === "import-clients-file") {
      PF.importClientsCSVFile(target);
    }
  });

  /* ========================= TECLADO Y ACTIVIDAD ========================= */

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (document.querySelector(".modal-overlay")) {
        event.preventDefault();
        PF.closeTopModal();
      }
    }
  });

  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(function (name) {
    window.addEventListener(name, function () { PF.touchSession(); }, { passive: true });
  });

  window.addEventListener("afterprint", function () {
    const root = document.getElementById("print-root");
    if (root) root.innerHTML = "";
  });

  /* ========================= RUTAS Y SINCRONIZACIÓN ========================= */

  window.addEventListener("hashchange", function () {
    const app = document.getElementById("app");
    if (!app || app.classList.contains("hidden")) return;
    PF.renderRoute(PF.currentRouteName());
  });

  window.addEventListener("presufactu:sync", function (event) {
    const detail = event.detail || {};
    PF.updateSyncUI();
    if (detail.pulled) {
      PF.applyTheme(Store.state.settings.theme);
      PF.updateShell();
      PF.renderRoute(PF.currentRouteName());
    }
    if (detail.status === "error" && detail.message) {
      PF.toast(detail.message, "error");
    } else if (detail.status === "ok" && detail.message && !detail.silent) {
      PF.toast(detail.message, "success");
    }
  });

  window.addEventListener("presufactu:saved", function () {
    PF.updateShell();
  });

  /* ========================= ARRANQUE ========================= */

  function init() {
    Store.init();
    PF.applyTheme(Store.state.settings.theme);

    if (!Auth.isConfigured()) {
      PF.showAuthSetup();
    } else if (!Auth.isAuthenticated()) {
      PF.showAuthLogin();
    } else {
      PF.boot();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
