/* =========================================================
   PresuFactu · Guardado de PDF en una carpeta del equipo
   - La carpeta se elige una vez con la API File System Access
     (Chrome/Edge). El permiso se guarda en IndexedDB.
   - El PDF se genera con html2pdf.js, cargada bajo demanda
     desde CDN (solo cuando se usa esta función).
   - La configuración es local a este dispositivo: no se
     sincroniza con Google Sheets.
   ========================================================= */
(function () {
  "use strict";

  const DB_NAME = "presufactu-fs";
  const DB_STORE = "handles";
  const KEY = "pdfFolder";

  const CDN_URLS = [
    "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.3/dist/html2pdf.bundle.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js"
  ];

  let record = null;    // { handle, name, autoOnCreate }
  let permission = "";  // "granted" | "prompt" | "denied"
  let loaded = false;
  let libPromise = null;

  function supported() {
    return typeof window.showDirectoryPicker === "function" && !!window.indexedDB;
  }

  /* ========================= INDEXEDDB ========================= */

  function openDB() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("No se pudo abrir el almacenamiento de carpetas.")); };
    });
  }

  async function idbGet() {
    const db = await openDB();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(KEY);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
      tx.oncomplete = function () { db.close(); };
    });
  }

  async function idbSet(value) {
    const db = await openDB();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, KEY);
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onerror = function () { db.close(); reject(tx.error); };
    });
  }

  async function idbDelete() {
    const db = await openDB();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(KEY);
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onerror = function () { db.close(); reject(tx.error); };
    });
  }

  /* ========================= CONFIGURACIÓN ========================= */

  async function initPdfFolder() {
    if (!supported()) { loaded = true; refreshPdfCard(); return; }
    try {
      const rec = await idbGet();
      if (rec && rec.handle) {
        record = rec;
        permission = await rec.handle.queryPermission({ mode: "readwrite" });
      }
    } catch (err) {
      record = null;
    }
    loaded = true;
    refreshPdfCard();
  }

  function pdfFolderInfo() {
    return {
      supported: supported(),
      configured: !!(record && record.handle),
      name: record ? (record.name || (record.handle && record.handle.name) || "Carpeta seleccionada") : "",
      permission: permission,
      autoOnCreate: !!(record && record.autoOnCreate)
    };
  }

  async function choosePdfFolder() {
    if (!supported()) {
      PF.toast("Tu navegador no permite elegir carpetas. Usa Chrome o Edge, o el botón «Imprimir / PDF».", "warning");
      return;
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: "presufactu-pdf", mode: "readwrite" });
    } catch (err) {
      if (err && err.name === "AbortError") return; // el usuario canceló
      throw new Error("No se pudo elegir la carpeta: " + (err && err.message ? err.message : err));
    }
    record = {
      handle: handle,
      name: handle.name || "",
      autoOnCreate: record ? record.autoOnCreate : true
    };
    permission = await handle.queryPermission({ mode: "readwrite" });
    await idbSet(record);
    loaded = true;
    refreshPdfCard();
    PF.toast("Carpeta configurada: " + pdfFolderInfo().name, "success");
  }

  async function removePdfFolder() {
    record = null;
    permission = "";
    loaded = true;
    try { await idbDelete(); } catch (err) { /* ignorar */ }
    refreshPdfCard();
    PF.toast("Carpeta de PDF quitada. Los archivos ya guardados no se borran.", "info");
  }

  async function setPdfAutoCreate(value) {
    if (!record) return;
    record.autoOnCreate = !!value;
    try { await idbSet(record); } catch (err) { /* ignorar */ }
  }

  /* ========================= GENERADOR PDF ========================= */

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error("No se pudo descargar " + url)); };
      document.head.appendChild(s);
    });
  }

  function loadLib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!libPromise) {
      libPromise = (async function () {
        for (let i = 0; i < CDN_URLS.length; i++) {
          try {
            await loadScript(CDN_URLS[i]);
            if (window.html2pdf) return window.html2pdf;
          } catch (err) { /* probar el siguiente CDN */ }
        }
        libPromise = null;
        throw new Error("No se pudo cargar el generador de PDF. Comprueba tu conexión a internet o usa «Imprimir / PDF».");
      })();
    }
    return libPromise;
  }

  /* Renderiza el documento en un contenedor oculto con el mismo aspecto
     que la impresión (A4, márgenes de 12 mm) y devuelve el PDF como Blob. */
  async function renderPdfBlob(doc) {
    const html2pdf = await loadLib();
    const holder = document.createElement("div");
    holder.className = "pdf-render";
    holder.setAttribute("aria-hidden", "true");
    holder.innerHTML = PF.paperHTML(doc);
    document.body.appendChild(holder);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const imgs = Array.prototype.slice.call(holder.querySelectorAll("img"));
      await Promise.all(imgs.map(function (img) {
        return img.decode ? img.decode().catch(function () { /* ignorar */ }) : Promise.resolve();
      }));
      const worker = html2pdf().set({
        margin: [12, 12, 12, 12],
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] }
      }).from(holder.firstElementChild);
      return await worker.outputPdf("blob");
    } finally {
      holder.remove();
    }
  }

  /* ========================= GUARDADO ========================= */

  async function ensurePermission(noPrompt) {
    if (!record || !record.handle) {
      throw new Error("No hay ninguna carpeta configurada. Ve a Ajustes → Documentos PDF.");
    }
    let perm = await record.handle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted" && !noPrompt) {
      perm = await record.handle.requestPermission({ mode: "readwrite" });
    }
    permission = perm;
    refreshPdfCard();
    if (perm !== "granted") {
      throw new Error("El navegador no ha dado permiso para escribir en la carpeta. Vuelve a elegirla en Ajustes → Documentos PDF.");
    }
  }

  async function savePdfToFolder(doc, options) {
    const opts = options || {};
    if (!supported()) {
      throw new Error("Tu navegador no permite guardar en carpetas automáticamente. Usa «Imprimir / PDF».");
    }
    if (!loaded) {
      try {
        const rec = await idbGet();
        if (rec && rec.handle) record = rec;
      } catch (err) { /* ignorar */ }
      loaded = true;
    }
    await ensurePermission(opts.noPrompt);
    const blob = await renderPdfBlob(doc);
    const filename = PF.pdfFileName(doc) + ".pdf";
    const fileHandle = await record.handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return filename;
  }

  /* Guardado automático al crear o convertir documentos. Solo actúa si el
     permiso ya está concedido: nunca abre diálogos de permiso por su cuenta. */
  function autoSavePdf(doc) {
    const info = pdfFolderInfo();
    if (!info.configured || !info.autoOnCreate || info.permission !== "granted") return;
    savePdfToFolder(doc, { noPrompt: true }).then(function (name) {
      PF.toast("PDF guardado en la carpeta: " + name, "success");
    }).catch(function (err) {
      PF.toast("No se pudo guardar el PDF automático: " + (err && err.message ? err.message : err), "warning");
    });
  }

  /* ========================= TARJETA DE AJUSTES ========================= */

  function refreshPdfCard() {
    const box = document.getElementById("pdf-folder-status");
    if (!box) return;
    const info = pdfFolderInfo();
    const removeBtn = document.querySelector('[data-action="remove-pdf-folder"]');
    const auto = document.getElementById("pdf-auto-create");
    if (auto) { auto.checked = info.autoOnCreate; auto.disabled = !info.configured; }
    if (removeBtn) removeBtn.disabled = !info.configured;
    if (!info.supported) {
      box.innerHTML = '<span class="err">Este navegador no permite guardar en carpetas automáticamente (hace falta Chrome o Edge). Puedes seguir usando «Imprimir / PDF».</span>';
      return;
    }
    if (!info.configured) {
      box.innerHTML = "Sin carpeta configurada. Pulsa <strong>«Elegir carpeta…»</strong> y selecciona dónde quieres que se guarden los PDF de presupuestos y facturas.";
      return;
    }
    const permText = info.permission === "granted"
      ? '<span class="ok">Permiso concedido: los PDF se guardarán sin abrir ningún diálogo.</span>'
      : "Permiso pendiente: el navegador lo pedirá la primera vez que guardes un PDF.";
    box.innerHTML = "<strong>Carpeta: " + PF.esc(info.name) + "</strong><br>" + permText;
  }

  Object.assign(PF, {
    pdfSupported: supported,
    pdfFolderInfo: pdfFolderInfo,
    initPdfFolder: initPdfFolder,
    choosePdfFolder: choosePdfFolder,
    removePdfFolder: removePdfFolder,
    setPdfAutoCreate: setPdfAutoCreate,
    savePdfToFolder: savePdfToFolder,
    autoSavePdf: autoSavePdf,
    refreshPdfCard: refreshPdfCard
  });

  initPdfFolder();
})();
