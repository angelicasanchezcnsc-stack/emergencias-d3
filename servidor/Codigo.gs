/**
 * EMERGENCIAS D3 — Adaptador de Google Apps Script + Google Sheets.
 *
 * Este archivo solo conecta el núcleo (Nucleo.gs) con la hoja de cálculo.
 * Instalación: ver APP/docs/INSTALACION.md.
 */

function doPost(e) {
  var peticion;
  try {
    peticion = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, codigo: 'DATOS', error: 'Petición mal formada.' });
  }
  return responder(crearNucleo(adaptadorSheets()).procesar(peticion));
}

function doGet() {
  return responder({ ok: true, datos: { servicio: 'EMERGENCIAS D3' } });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function adaptadorSheets() {
  var libro = SpreadsheetApp.getActive();
  var props = PropertiesService.getScriptProperties();

  function hoja(nombre) {
    var h = libro.getSheetByName(nombre);
    if (!h) throw new Error('Falta la hoja "' + nombre + '". Ejecute la función instalar().');
    return h;
  }

  return {
    leer: function (nombre) {
      var valores = hoja(nombre).getDataRange().getValues();
      var cols = valores.shift() || [];
      return valores.filter(function (f) { return f.join('') !== ''; }).map(function (f) {
        var o = {};
        cols.forEach(function (c, i) { o[c] = f[i] === null || f[i] === undefined ? '' : String(f[i]); });
        return o;
      });
    },
    escribir: function (nombre, filas) {
      var h = hoja(nombre);
      var cols = ESQUEMA[nombre];
      var ultima = h.getLastRow();
      if (ultima > 1) h.getRange(2, 1, ultima - 1, cols.length).clearContent();
      if (!filas.length) return;
      var datos = filas.map(function (f) {
        return cols.map(function (c) { return f[c] === undefined || f[c] === null ? '' : String(f[c]); });
      });
      h.getRange(2, 1, datos.length, cols.length).setNumberFormat('@').setValues(datos);
    },
    agregar: function (nombre, fila) {
      var cols = ESQUEMA[nombre];
      var h = hoja(nombre);
      h.getRange(h.getLastRow() + 1, 1, 1, cols.length).setNumberFormat('@')
        .setValues([cols.map(function (c) { return fila[c] === undefined ? '' : String(fila[c]); })]);
    },
    prop: function (nombre) { return props.getProperty(nombre); },
    uuid: function () { return Utilities.getUuid(); },
    ahora: function () { return Date.now(); },
    bloqueo: function (fn) {
      var candado = LockService.getScriptLock();
      candado.waitLock(20000);
      try { return fn(); } finally { candado.releaseLock(); }
    }
  };
}

/**
 * Ejecutar UNA VEZ desde el editor de Apps Script (menú Ejecutar → instalar).
 * Crea las hojas y genera la "pimienta" secreta y el código de instalación.
 * El código aparece en el Registro de ejecución.
 */
function instalar() {
  var libro = SpreadsheetApp.getActive();
  Object.keys(ESQUEMA).forEach(function (nombre) {
    var h = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
    var cols = ESQUEMA[nombre];
    h.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#FFEE58');
    h.getRange(1, 1, h.getMaxRows(), cols.length).setNumberFormat('@');
    h.setFrozenRows(1);
  });
  var sobrante = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (sobrante && libro.getSheets().length > 1) libro.deleteSheet(sobrante);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PIMIENTA')) props.setProperty('PIMIENTA', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('CODIGO_INSTALACION')) {
    props.setProperty('CODIGO_INSTALACION', Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase());
  }
  Logger.log('Instalación lista. Código de instalación: ' + props.getProperty('CODIGO_INSTALACION'));
}

/** Muestra de nuevo el código de instalación, por si se perdió. */
function verCodigoInstalacion() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('CODIGO_INSTALACION'));
}
