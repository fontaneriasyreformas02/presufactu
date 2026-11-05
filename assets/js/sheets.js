/* =========================================================
   PresuFactu · Sincronización con Google Sheets
   ---------------------------------------------------------
   Habla con una Web App de Google Apps Script (ver
   apps-script/Code.gs). Envía el estado completo en JSON y
   recibe el estado guardado en la hoja de cálculo.
   ========================================================= */
(function () {
  "use strict";

  var syncBusy = false;
  var autoTimer = null;
  var initialized = false;
  var suppressAuto = false;

  function cfg() {
    return Store.state.settings.sheets;
  }

  function notify(status, message, extra) {
    try {
      window.dispatchEvent(new CustomEvent("presufactu:sync", {
        detail: Object.assign({ status: status, message: message || "" }, extra || {})
      }));
    } catch (err) { /* ignorar */ }
  }

  function hasConfig() {
    var c = cfg();
    return !!(c && String(c.url || "").trim() && String(c.token || "").trim());
  }

  function normalizeUrl(url) {
    return String(url || "").trim().replace(/\s+/g, "");
  }

  async function readResponse(response) {
    var text = await response.text();
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      if (text && text.indexOf("<html") !== -1) {
        throw new Error("La URL no devuelve JSON. Comprueba que has desplegado el Apps Script como Web App con acceso para cualquiera.");
      }
      throw new Error("Respuesta no válida del servidor de Google.");
    }
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || "Google Sheets devolvió un error.");
    }
    return data;
  }

  async function request(action, extra, timeoutMs) {
    var c = cfg();
    if (!hasConfig()) throw new Error("Configura la URL y el token de Google Sheets en Ajustes.");

    var controller = null;
    var timer = null;
    var options = { method: "GET" };

    if (action === "push") {
      var stateCopy = Store.clone(Store.state);
      if (stateCopy.settings && stateCopy.settings.sheets) {
        stateCopy.settings.sheets.token = "";
        stateCopy.settings.sheets.url = "";
        stateCopy.settings.sheets.dirty = false;
      }
      options = {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action: action, token: c.token, state: stateCopy }, extra || {}))
      };
    }

    if (typeof AbortController !== "undefined") {
      controller = new AbortController();
      options.signal = controller.signal;
    }

    var url = normalizeUrl(c.url);
    var query = "?action=" + encodeURIComponent(action) + "&token=" + encodeURIComponent(c.token);
    if (action !== "push" && extra) {
      Object.keys(extra).forEach(function (key) {
        query += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(extra[key]);
      });
    }

    var timeoutPromise = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error("La operación ha tardado demasiado. Revisa tu conexión o la URL del Apps Script."));
      }, timeoutMs || 30000);
    });

    var fetchPromise = fetch(url + query, options).then(function (response) {
      if (!response.ok) throw new Error("Error HTTP " + response.status + " al contactar con Google.");
      return readResponse(response);
    });

    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function ping() {
    if (!hasConfig()) throw new Error("Configura primero la URL y el token.");
    notify("syncing", "Conectando con Google Sheets…");
    try {
      var data = await request("ping", null, 20000);
      notify("ok", "Conexión correcta con Google Sheets.");
      return data;
    } catch (err) {
      notify("error", err.message);
      throw err;
    }
  }

  async function push(options) {
    var silent = !!(options && options.silent);
    if (!hasConfig()) throw new Error("Configura la URL y el token de Google Sheets.");
    if (syncBusy) throw new Error("Ya hay una sincronización en curso.");
    syncBusy = true;
    notify("syncing", "Subiendo datos a Google Sheets…", { silent: silent });
    var data;
    var failure = null;
    try {
      suppressAuto = true;
      try {
        data = await request("push", null, 45000);
      } finally {
        suppressAuto = false;
      }
      var c = cfg();
      c.lastSync = data.savedAt || new Date().toISOString();
      c.cloudUpdatedAt = c.lastSync;
      c.lastError = "";
      c.dirty = false;
      Store.state.meta.cloudUpdatedAt = c.lastSync;
      Store.state.meta.updatedAt = c.lastSync;
      Store.save({ emit: false, touchMeta: false });
    } catch (err) {
      failure = err;
      var cc = cfg();
      cc.lastError = err.message;
      Store.save({ emit: false, touchMeta: false });
    } finally {
      syncBusy = false;
    }
    if (failure) {
      notify("error", failure.message, { silent: silent });
      throw failure;
    }
    notify("ok", "Datos guardados en Google Sheets.", { at: data.savedAt, silent: silent });
    return data;
  }

  function applyPulledState(data) {
    var incoming = data.state;
    var localSheets = Store.clone(cfg());
    incoming = Store.sanitizeState(incoming);
    incoming.settings.sheets.url = localSheets.url;
    incoming.settings.sheets.token = localSheets.token;
    incoming.settings.sheets.auto = localSheets.auto;
    incoming.settings.sheets.lastSync = data.savedAt || new Date().toISOString();
    incoming.settings.sheets.cloudUpdatedAt = data.savedAt || "";
    incoming.settings.sheets.lastError = "";
    incoming.settings.sheets.dirty = false;
    incoming.meta = incoming.meta || {};
    incoming.meta.updatedAt = data.savedAt || new Date().toISOString();
    incoming.meta.cloudUpdatedAt = data.savedAt || "";
    Store.replaceState(incoming);
    var c = cfg();
    c.lastSync = data.savedAt || new Date().toISOString();
    c.cloudUpdatedAt = c.lastSync;
    c.lastError = "";
    c.dirty = false;
    Store.state.meta.cloudUpdatedAt = c.lastSync;
    Store.state.meta.updatedAt = c.lastSync;
    Store.save({ emit: false, touchMeta: false });
  }

  async function pull(options) {
    var silent = !!(options && options.silent);
    if (!hasConfig()) throw new Error("Configura la URL y el token de Google Sheets.");
    if (syncBusy) throw new Error("Ya hay una sincronización en curso.");
    syncBusy = true;
    notify("syncing", "Descargando datos desde Google Sheets…", { silent: silent });
    var data;
    var failure = null;
    try {
      suppressAuto = true;
      try {
        data = await request("pull", null, 45000);
      } finally {
        suppressAuto = false;
      }
      if (!data.state) {
        throw new Error("La hoja de Google no contiene datos guardados todavía.");
      }
      applyPulledState(data);
    } catch (err) {
      failure = err;
      var cc = cfg();
      cc.lastError = err.message;
      Store.save({ emit: false });
    } finally {
      syncBusy = false;
    }
    if (failure) {
      notify("error", failure.message, { silent: silent });
      throw failure;
    }
    notify("ok", syncSummary("Datos descargados desde Google Sheets"), { at: cfg().lastSync, pulled: true, silent: silent });
    return data;
  }

  function syncSummary(prefix) {
    var clients = (Store.state.clients || []).filter(function (c) { return !c.deletedAt; }).length;
    var docs = (Store.state.documents || []).filter(function (d) { return !d.deletedAt; }).length;
    return prefix + ": " + clients + " clientes y " + docs + (docs === 1 ? " documento." : " documentos.");
  }

  function isNewer(cloudAt, localAt) {
    var cloud = Date.parse(cloudAt);
    if (!isFinite(cloud)) return false;
    var local = Date.parse(localAt);
    if (!isFinite(local)) return true;
    return cloud > local;
  }

  /* Al abrir la app (o al volver a la pestaña): trae los datos de la hoja
     si son más recientes. No toca nada si hay cambios locales sin subir,
     salvo que este dispositivo no tenga ningún documento y la nube sí. */
  async function syncOnStart(options) {
    if (!hasConfig() || syncBusy) return null;
    if (typeof document !== "undefined" && document.hidden) return null;
    if (typeof document !== "undefined" && document.querySelector("#modal-root .modal-overlay")) return null;

    var c = cfg();
    var localDocs = (Store.state.documents || []).length;
    if (c.dirty && localDocs > 0) return null;

    syncBusy = true;
    try {
      var data;
      try {
        data = await request("pull", null, 20000);
      } catch (err) {
        c.lastError = err.message;
        Store.save({ emit: false, touchMeta: false });
        return null;
      }
      if (!data || !data.state) return null;

      var cloudDocs = (data.state.documents || []).length;
      var adoptEmpty = localDocs === 0 && cloudDocs > 0;
      if (cfg().dirty && !adoptEmpty) return null;

      var localAt = (Store.state.meta && Store.state.meta.updatedAt) || c.lastSync || "";
      var hasLocal = (Store.state.clients || []).length || localDocs;
      if (!adoptEmpty && hasLocal) {
        if (!localAt) return null;
        if (!isNewer(data.savedAt, localAt)) return null;
      }

      if (adoptEmpty) {
        var ids = {};
        (data.state.clients || []).forEach(function (client) { ids[client.id] = true; });
        (Store.state.clients || []).forEach(function (client) {
          if (!ids[client.id]) {
            data.state.clients.push(client);
            ids[client.id] = true;
          }
        });
      }

      applyPulledState(data);
      notify("ok", syncSummary("Datos actualizados desde Google Sheets"), { at: cfg().lastSync, pulled: true });
      return data;
    } finally {
      syncBusy = false;
    }
  }

  function scheduleAutoSync() {
    var c = cfg();
    if (!c || !c.auto || !hasConfig()) return;
    if (suppressAuto || syncBusy) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      autoTimer = null;
      push({ silent: true }).catch(function () { /* el error ya se notifica */ });
    }, 1800);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    window.addEventListener("presufactu:saved", function () {
      if (!suppressAuto) scheduleAutoSync();
    });
    var lastCheck = 0;
    function checkCloud() {
      if (document.hidden) return;
      var now = Date.now();
      if (now - lastCheck < 15000) return;
      lastCheck = now;
      syncOnStart().catch(function () { /* silencioso */ });
    }
    window.addEventListener("focus", checkCloud);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) checkCloud();
    });
  }

  var Sheets = {
    init: init,
    hasConfig: hasConfig,
    ping: ping,
    push: push,
    pull: pull,
    syncOnStart: syncOnStart,
    isBusy: function () { return syncBusy; },
    scheduleAutoSync: scheduleAutoSync,
    normalizeUrl: normalizeUrl
  };

  window.Sheets = Sheets;
})();
