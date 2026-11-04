/**
 * ============================================================
 *  PresuFactu · API de sincronización con Google Sheets
 * ============================================================
 *
 *  CÓMO INSTALARLO (3 minutos)
 *  1. Crea una hoja de cálculo nueva en Google Sheets.
 *  2. Menú Extensiones → Apps Script.
 *  3. Borra el contenido de Código.gs y pega TODO este archivo.
 *  4. Cambia TOKEN por una clave privada larga (mínimo 20 caracteres).
 *  5. Implementar → Nueva implementación → Aplicación web:
 *       · Ejecutar como: Yo
 *       · Quién tiene acceso: Cualquier persona
 *  6. Copia la URL que termina en /exec.
 *  7. En PresuFactu → Ajustes → Google Sheets, pega la URL y el mismo TOKEN.
 *
 *  IMPORTANTE: si cambias el TOKEN, vuelve a implementar una nueva versión.
 *  No compartas la URL ni el token: quien los tenga puede leer tus datos.
 * ============================================================
 */

var CONFIG = {
  TOKEN: 'CAMBIA_ESTE_TOKEN_POR_UNA_CLAVE_LARGA_Y_PRIVADA',

  // Si el script está vinculado a la hoja, déjalo vacío.
  // Si usas un script independiente, pega aquí el ID de la hoja.
  SHEET_ID: '',

  STATE_SHEET: 'Estado',
  INFO_SHEET: 'Info',
  MIRROR: true,
  CHUNK_SIZE: 45000,
  MAX_STATE_SIZE: 8000000
};

/* ============================ ENDPOINTS ============================ */

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    var params = (e && e.parameter) || {};
    var body = {};

    if (method === 'POST' && e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseError) {
        throw new Error('El cuerpo de la petición no es JSON válido.');
      }
    }

    var token = params.token || body.token || '';
    if (!CONFIG.TOKEN || String(token) !== String(CONFIG.TOKEN)) {
      return jsonResponse({ ok: false, error: 'Token de acceso incorrecto.' });
    }

    var action = params.action || body.action || 'ping';
    var ss = getSpreadsheet();

    if (action === 'ping') {
      return jsonResponse({
        ok: true,
        app: 'PresuFactu',
        version: 1,
        time: new Date().toISOString(),
        sheet: ss.getName()
      });
    }

    if (action === 'pull') {
      var state = readState(ss);
      var meta = readMeta(ss);
      return jsonResponse({
        ok: true,
        state: state,
        savedAt: meta.savedAt || '',
        updatedAt: meta.updatedAt || ''
      });
    }

    if (action === 'push') {
      if (!body.state) throw new Error('No se han recibido datos para guardar.');
      var serialized = JSON.stringify(body.state);
      if (serialized.length > CONFIG.MAX_STATE_SIZE) {
        throw new Error('Los datos son demasiado grandes para la hoja. Reduce el tamaño del logo o divídelos.');
      }
      var savedAt = writeState(ss, body.state, serialized);
      return jsonResponse({ ok: true, savedAt: savedAt });
    }

    return jsonResponse({ ok: false, error: 'Acción no válida: ' + action });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: (error && error.message) ? error.message : String(error)
    });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================ HOJA DE CÁLCULO ============================ */

function getSpreadsheet() {
  if (CONFIG.SHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SHEET_ID);
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  var props = PropertiesService.getScriptProperties();
  var storedId = props.getProperty('PRESUFACTU_SHEET_ID');
  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (error) {
      props.deleteProperty('PRESUFACTU_SHEET_ID');
    }
  }

  var created = SpreadsheetApp.create('PresuFactu · Datos');
  props.setProperty('PRESUFACTU_SHEET_ID', created.getId());

  var first = created.getSheets()[0];
  if (first && first.getLastRow() === 0) {
    first.setName('Léeme');
    first.getRange(1, 1, 9, 1).setValues([
      ['PresuFactu · Hoja de datos'],
      [''],
      ['Esta hoja guarda una copia de seguridad de tu aplicación PresuFactu.'],
      ['No borres ni edites las hojas "Estado" e "Info".'],
      ['Las hojas "Clientes", "Documentos" y "Ajustes" son copias legibles:'],
      ['se regeneran en cada sincronización.'],
      [''],
      ['Configura la URL y el token de esta Web App en Ajustes → Google Sheets.'],
      ['Más información en el archivo README.md del proyecto.']
    ]);
    first.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  }

  return created;
}

function getSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function readState(ss) {
  var sheet = ss.getSheetByName(CONFIG.STATE_SHEET);
  if (!sheet) return null;

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return null;

  var values = sheet.getRange(1, 1, lastRow, 1).getValues();
  var json = values.map(function (row) { return row[0] || ''; }).join('');
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error('Los datos guardados en la hoja "Estado" están dañados. Prueba a subirlos de nuevo desde la aplicación.');
  }
}

function writeState(ss, state, serialized) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    serialized = serialized || JSON.stringify(state);
    var sheet = getSheet(ss, CONFIG.STATE_SHEET);
    sheet.clearContents();

    var chunks = [];
    for (var i = 0; i < serialized.length; i += CONFIG.CHUNK_SIZE) {
      chunks.push([serialized.substring(i, i + CONFIG.CHUNK_SIZE)]);
    }
    if (!chunks.length) chunks.push(['']);

    sheet.getRange(1, 1, chunks.length, 1).setValues(chunks);
    try { sheet.hideSheet(); } catch (error) { /* no es crítico */ }

    var savedAt = new Date().toISOString();
    writeInfo(ss, savedAt, state);
    if (CONFIG.MIRROR) writeMirrors(ss, state);

    return savedAt;
  } finally {
    lock.releaseLock();
  }
}

/* ============================ INFORMACIÓN ============================ */

function writeInfo(ss, savedAt, state) {
  var sheet = getSheet(ss, CONFIG.INFO_SHEET);
  sheet.clearContents();
  var updated = (state && state.meta && state.meta.updatedAt) ? state.meta.updatedAt : '';
  var rows = [
    ['Clave', 'Valor'],
    ['Última sincronización', savedAt],
    ['Datos actualizados', updated],
    ['Versión', '1'],
    ['Aplicación', 'PresuFactu']
  ];
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  sheet.setColumnWidth(1, 190);
  sheet.setColumnWidth(2, 280);
}

function readMeta(ss) {
  var sheet = ss.getSheetByName(CONFIG.INFO_SHEET);
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var map = {};
  values.forEach(function (row) {
    if (row[0]) map[String(row[0])] = row[1];
  });
  return {
    savedAt: map['Última sincronización'] || '',
    updatedAt: map['Datos actualizados'] || ''
  };
}

/* ============================ COPIAS LEGIBLES ============================ */

function writeMirrors(ss, state) {
  writeClientsSheet(ss, state.clients || []);
  writeDocumentsSheet(ss, state.documents || [], state.settings || {});
  writeSettingsSheet(ss, state.settings || {});
}

function writeClientsSheet(ss, clients) {
  var sheet = getSheet(ss, 'Clientes');
  sheet.clearContents();

  var header = ['Nombre', 'NIF/CIF', 'Email', 'Teléfono', 'Dirección', 'Código postal', 'Ciudad', 'País', 'Notas', 'Creado', 'Actualizado'];
  var rows = [header];
  clients.forEach(function (client) {
    rows.push([
      safe(client.name),
      safe(client.nif),
      safe(client.email),
      safe(client.phone),
      safe(client.address),
      safe(client.zip),
      safe(client.city),
      safe(client.country),
      safe(client.notes),
      safe(client.createdAt),
      safe(client.updatedAt)
    ]);
  });
  sheet.getRange(1, 1, rows.length, header.length).setValues(rows);
  styleHeader(sheet, header.length);
  sheet.setFrozenRows(1);
}

function writeDocumentsSheet(ss, documents, settings) {
  var sheet = getSheet(ss, 'Documentos');
  sheet.clearContents();

  var header = [
    'Número', 'Tipo', 'Estado', 'Fecha emisión', 'Vencimiento', 'Cliente', 'NIF/CIF',
    'Concepto', 'Base imponible', 'IVA', 'IRPF', 'Total', 'Moneda', 'Forma de pago',
    'Líneas', 'Notas', 'Creado', 'Actualizado'
  ];
  var rows = [header];
  var currency = (settings.currency && settings.currency.code) || 'EUR';

  documents.forEach(function (doc) {
    var totals = computeTotals(doc);
    rows.push([
      safe(doc.number),
      doc.type === 'invoice' ? 'Factura' : 'Presupuesto',
      readableStatus(doc),
      safe(doc.issueDate),
      safe(doc.dueDate),
      safe(doc.clientSnapshot ? doc.clientSnapshot.name : ''),
      safe(doc.clientSnapshot ? doc.clientSnapshot.nif : ''),
      safe(doc.subject),
      totals.base,
      totals.vatTotal,
      totals.irpfAmount,
      totals.total,
      safe(currency),
      safe(doc.paymentMethod),
      linesSummary(doc.lines),
      safe(doc.notes),
      safe(doc.createdAt),
      safe(doc.updatedAt)
    ]);
  });

  sheet.getRange(1, 1, rows.length, header.length).setValues(rows);
  styleHeader(sheet, header.length);
  sheet.setFrozenRows(1);
  try {
    sheet.getRange(2, 9, Math.max(1, rows.length - 1), 4).setNumberFormat('#,##0.00');
  } catch (error) { /* no es crítico */ }
}

function writeSettingsSheet(ss, settings) {
  var sheet = getSheet(ss, 'Ajustes');
  sheet.clearContents();

  var rows = [['Sección', 'Clave', 'Valor']];
  var sections = [
    ['Empresa', settings.company || {}],
    ['Moneda', settings.currency || {}],
    ['Impuestos', settings.taxes || {}],
    ['Numeración', settings.numbering || {}],
    ['Facturación', settings.billing || {}]
  ];

  sections.forEach(function (section) {
    Object.keys(section[1]).forEach(function (key) {
      if (key === 'logo') return;
      var value = section[1][key];
      rows.push([
        section[0],
        key,
        (value !== null && typeof value === 'object') ? JSON.stringify(value) : safe(value)
      ]);
    });
  });

  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  styleHeader(sheet, 3);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 360);
}

function styleHeader(sheet, columns) {
  var range = sheet.getRange(1, 1, 1, columns);
  range.setFontWeight('bold');
  range.setBackground('#eef2ff');
  range.setFontColor('#3730a3');
}

/* ============================ UTILIDADES ============================ */

function safe(value) {
  if (value === null || value === undefined) return '';
  var text = String(value);
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function linesSummary(lines) {
  if (!Array.isArray(lines)) return '';
  return lines.map(function (line) {
    return line.description + ' x' + line.qty + ' @' + line.price + ' (' + line.vat + '% IVA)';
  }).join(' | ');
}

function readableStatus(doc) {
  var map = doc.type === 'invoice'
    ? { draft: 'Borrador', issued: 'Emitida', paid: 'Pagada', cancelled: 'Anulada' }
    : { draft: 'Borrador', sent: 'Enviado', accepted: 'Aceptado', rejected: 'Rechazado', invoiced: 'Facturado' };
  var status = map[doc.status] || doc.status || '';
  if (doc.type === 'invoice' && doc.status === 'issued' && doc.dueDate && doc.dueDate < todayISO()) {
    status = 'Vencida';
  }
  return status;
}

function todayISO() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function computeTotals(doc) {
  var lines = Array.isArray(doc.lines) ? doc.lines : [];
  var factor = 1 - (Number(doc.globalDiscount) || 0) / 100;
  if (factor < 0) factor = 0;
  var groups = {};
  var gross = 0;

  lines.forEach(function (line) {
    var qty = Number(line.qty) || 0;
    var price = Number(line.price) || 0;
    var discount = Number(line.discount) || 0;
    var vat = Number(line.vat) || 0;
    var lineBase = qty * price * (1 - discount / 100);
    gross += lineBase;
    groups[vat] = (groups[vat] || 0) + lineBase * factor;
  });

  var vatTotal = 0;
  Object.keys(groups).forEach(function (rate) {
    vatTotal += round2(round2(groups[rate]) * Number(rate) / 100);
  });
  vatTotal = round2(vatTotal);

  var base = round2(gross * factor);
  var irpf = doc.irpfEnabled ? round2(base * (Number(doc.irpfRate) || 0) / 100) : 0;
  return {
    base: base,
    vatTotal: vatTotal,
    irpfAmount: irpf,
    total: round2(base + vatTotal - irpf)
  };
}
