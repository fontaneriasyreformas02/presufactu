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
    try {
      suppressAuto = true;
      var data;
      try {
        data = await request("push", null, 45000);
      } finally {
        suppressAuto = false;
      }
      var c = cfg();
      c.lastSync = data.savedAt || new Date().toISOString();
      c.cloudUpdatedAt = c.lastSync;
      c.lastError = "";
      Store.state.meta.cloudUpdatedAt = c.lastSync;
      Store.save({ emit: false });
      notify("ok", "Datos guardados en Google Sheets.", { at: c.lastSync, silent: silent });
      return data;
    } catch (err) {
      var cc = cfg();
      cc.lastError = err.message;
      Store.save({ emit: false });
      notify("error", err.message, { silent: silent });
      throw err;
    } finally {
      syncBusy = false;
    }
  }

  async function pull() {
    if (!hasConfig()) throw new Error("Configura la URL y el token de Google Sheets.");
    if (syncBusy) throw new Error("Ya hay una sincronización en curso.");
    syncBusy = true;
    notify("syncing", "Descargando datos desde Google Sheets…");
    try {
      suppressAuto = true;
      var data;
      try {
        data = await request("pull", null, 45000);
      } finally {
        suppressAuto = false;
      }
      if (!data.state) {
        throw new Error("La hoja de Google no contiene datos guardados todavía.");
      }
      var incoming = data.state;
      var localSheets = Store.clone(cfg());
      incoming = Store.sanitizeState(incoming);
      incoming.settings.sheets.url = localSheets.url;
      incoming.settings.sheets.token = localSheets.token;
      incoming.settings.sheets.auto = localSheets.auto;
      incoming.settings.sheets.lastSync = data.savedAt || new Date().toISOString();
      incoming.settings.sheets.cloudUpdatedAt = data.savedAt || "";
      incoming.settings.sheets.lastError = "";
      Store.replaceState(incoming);
      var c = cfg();
      c.lastSync = data.savedAt || new Date().toISOString();
      c.cloudUpdatedAt = c.lastSync;
      Store.state.meta.cloudUpdatedAt = c.lastSync;
      Store.save({ emit: false });
      notify("ok", "Datos descargados desde Google Sheets.", { at: c.lastSync, pulled: true });
      return data;
    } catch (err) {
      var cc = cfg();
      cc.lastError = err.message;
      Store.save({ emit: false });
      notify("error", err.message);
      throw err;
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
  }

  var Sheets = {
    init: init,
    hasConfig: hasConfig,
    ping: ping,
    push: push,
    pull: pull,
    isBusy: function () { return syncBusy; },
    scheduleAutoSync: scheduleAutoSync,
    normalizeUrl: normalizeUrl
  };

  window.Sheets = Sheets;
})();
