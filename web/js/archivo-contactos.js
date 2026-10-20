// Lectura del archivo del área de personal con los contactos de emergencia (Excel o CSV) y comparación con
// las personas de la llave maestra. Solo lógica y sin dependencias: se prueba en herramientas/pruebas-nucleo.html.
// El archivo se lee en el computador del administrador y nunca se sube a ningún servidor.
//
// Columnas, en este orden: Nombre, Teléfono, Correo, EPS, ARL, Nombre de un Familiar, Parentesco, Teléfono.
// «Teléfono» aparece dos veces: el primero es el de la persona y el que sigue al familiar es el del familiar.

export const COLUMNAS = ['Nombre', 'Teléfono', 'Correo', 'EPS', 'ARL', 'Nombre de un Familiar', 'Parentesco', 'Teléfono'];

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const sinTildes = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
// Se empareja por correo sin tildes, sin mayúsculas y sin espacios.
export const normalizarCorreo = c => sinTildes(c).replace(/\s+/g, '').toLowerCase();
const normalizarNombre = n => sinTildes(n).toLowerCase().replace(/\s+/g, ' ').trim();
const limpio = v => String(v ?? '').replace(/\s+/g, ' ').trim();

// Texto de un CSV: UTF-8 (con o sin BOM) o, si no lo es, Windows-1252 (el que usa Excel en Windows al
// guardar «CSV (delimitado por comas)»). Así no se dañan las tildes.
export function decodificarTexto(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

// Filas de un CSV. El separador (punto y coma, coma o tabulador) se deduce de la primera línea.
// Respeta las comillas: un campo entre comillas puede llevar el separador, saltos de línea y "" (comilla).
export function leerCsv(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '');
  const primera = t.split(/\r?\n/, 1)[0];
  const sep = [';', ',', '\t'].reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a));
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c !== '"') campo += c;
      else if (t[i + 1] === '"') { campo += '"'; i++; }
      else comillas = false;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.map(f => f.map(x => x.trim()));
}

// Teléfono tal como se escribió, sin letras ni signos raros (se conservan +, espacios, guiones y /).
export const limpiarTelefono = t => String(t ?? '').replace(/[^\d+\-\s/]/g, '').replace(/\s+/g, ' ').trim();

// Un teléfono es dudoso si no tiene 7 dígitos (fijo), o 10 que empiecen por 3 (celular) o 60 (fijo con
// indicativo), con o sin el 57 de Colombia. Dos teléfonos en la misma celda también quedan para revisar.
export function telefonoDudoso(t) {
  let d = String(t ?? '').replace(/\D/g, '');
  if (!d) return false;
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return !(d.length === 7 || (d.length === 10 && /^(3|60)/.test(d)));
}

// Qué revisar de un contacto antes de cargarlo (no impide cargarlo).
export function alertasDe(r) {
  const a = [];
  if (!r.telefono) a.push('Falta el teléfono de la persona');
  else if (telefonoDudoso(r.telefono)) a.push('Revise el teléfono de la persona: ' + r.telefono);
  if (!r.familiar) a.push('Falta el nombre del familiar');
  if (!r.telefonoFamiliar) a.push('Falta el teléfono del familiar');
  else if (telefonoDudoso(r.telefonoFamiliar)) a.push('Revise el teléfono del familiar: ' + r.telefonoFamiliar);
  if (!r.eps || !r.arl) a.push('Falta la EPS o la ARL');
  return a;
}

// ¿Trae algo que cargar? Una fila con solo nombre y correo no tiene contacto.
export const tieneDatos = r => !!(r.telefono || r.familiar || r.parentesco || r.telefonoFamiliar || r.eps || r.arl);

// Interpreta las filas leídas (de un Excel o de un CSV). Busca la fila de títulos (la que tiene «Correo») y
// ubica cada columna por su nombre, sin importar tildes ni mayúsculas.
// Devuelve { registros: [{ fila, nombre, correo, telefono, eps, arl, familiar, parentesco, telefonoFamiliar, alertas }], avisos }.
export function interpretarContactos(filas) {
  const clave = c => sinTildes(c).toLowerCase().trim();
  const iCab = (filas || []).findIndex(f => (f || []).some(c => /^(correo|e-?mail)/.test(clave(c))));
  if (iCab < 0) throw new Error('El archivo no tiene una fila de títulos con la columna «Correo». Columnas esperadas: ' + COLUMNAS.join(', ') + '.');
  const cab = Array.from(filas[iCab], c => clave(c));
  const buscar = (re, excluir) => cab.findIndex(c => re.test(c) && !(excluir && excluir.test(c)));
  const cCorreo = buscar(/^(correo|e-?mail)/);
  const cNombre = buscar(/nombre/, /famil/);
  const cFamiliar = buscar(/famil/, /parentesco|telefono|celular/);
  const cParentesco = buscar(/parentesco/);
  const cEps = buscar(/\beps\b/);
  const cArl = buscar(/\barl\b/);
  const telefonos = cab.map((c, i) => (/telefono|celular/.test(c) ? i : -1)).filter(i => i >= 0);
  // El teléfono del familiar es el primero después de su nombre; el de la persona, el otro.
  const cTelFamiliar = cFamiliar >= 0 ? (telefonos.find(i => i > cFamiliar) ?? -1) : (telefonos[1] ?? -1);
  const cTelefono = telefonos.find(i => i !== cTelFamiliar) ?? -1;

  const avisos = [];
  const faltan = [[cNombre, 'Nombre'], [cTelefono, 'Teléfono (de la persona)'], [cEps, 'EPS'], [cArl, 'ARL'],
    [cFamiliar, 'Nombre de un Familiar'], [cParentesco, 'Parentesco'], [cTelFamiliar, 'Teléfono (del familiar)']]
    .filter(([i]) => i < 0).map(([, n]) => n);
  if (faltan.length) avisos.push('No se encontraron estas columnas: ' + faltan.join(', ') + '. Esos datos quedan vacíos.');

  const registros = [];
  const vistos = new Map();
  filas.slice(iCab + 1).forEach((f, k) => {
    f = f || [];
    if (!f.some(x => limpio(x))) return;
    const n = iCab + 2 + k;   // número de la fila en el archivo, como lo muestra Excel
    const v = i => (i >= 0 ? limpio(f[i]) : '');
    const r = {
      fila: n, nombre: v(cNombre), correo: normalizarCorreo(v(cCorreo)),
      telefono: limpiarTelefono(v(cTelefono)), eps: v(cEps), arl: v(cArl),
      familiar: v(cFamiliar), parentesco: v(cParentesco), telefonoFamiliar: limpiarTelefono(v(cTelFamiliar))
    };
    if (!FORMATO_CORREO.test(r.correo)) { avisos.push(`Fila ${n}: ${r.nombre || 'sin nombre'} no tiene un correo válido; no se tiene en cuenta.`); return; }
    if (vistos.has(r.correo)) { avisos.push(`Fila ${n}: el correo ${r.correo} ya apareció en la fila ${vistos.get(r.correo)}; se toma la primera.`); return; }
    vistos.set(r.correo, n);
    r.alertas = alertasDe(r);
    registros.push(r);
  });
  if (!registros.length) avisos.push('El archivo no trae ninguna persona con un correo válido.');
  return { registros, avisos };
}

// Compara los registros del archivo con las personas de la llave ({ codigo, nombre, correo, estado, piso, puesto }).
// «conContacto»: códigos que ya tienen un contacto cargado (la carga lo reemplaza). «corregidos»: los que se
// corrigieron en la app después de la última carga (la carga deshace esa corrección: se avisa en la previa).
// Devuelve:
//   emparejadas:    el correo coincide con una persona activa: se le asigna el contacto.
//   nuevas:         no están en la app: se pueden agregar (sin rol) eligiendo su puesto.
//   retiradas:      el correo es de una persona retirada en la app: se reactiva a mano, si volvió.
//   correoCambiado: el nombre coincide con una persona activa cuyo correo no está en el archivo: se resuelve a mano.
//   ausentes:       personas activas de la app que no están en el archivo: solo se avisa, no se retira a nadie.
export function conciliar(registros, personas, conContacto = new Set(), corregidos = new Set()) {
  const porCorreo = new Map((personas || []).map(p => [normalizarCorreo(p.correo), p]));
  const activas = (personas || []).filter(p => p.estado === 'activo');
  const correosArchivo = new Set(registros.map(r => r.correo));
  // Nombre → persona activa (null si dos personas activas se llaman igual: no sirve para emparejar).
  const porNombre = new Map();
  activas.forEach(p => { const k = normalizarNombre(p.nombre); porNombre.set(k, porNombre.has(k) ? null : p); });
  const usadas = new Set();
  const r = { emparejadas: [], nuevas: [], retiradas: [], correoCambiado: [], ausentes: [] };
  for (const reg of registros) {
    const p = porCorreo.get(reg.correo);
    if (p && p.estado === 'activo') {
      usadas.add(p.codigo);
      r.emparejadas.push({ registro: reg, codigo: p.codigo, nombre: p.nombre, piso: p.piso, puesto: p.puesto, reemplaza: conContacto.has(p.codigo), corregido: corregidos.has(p.codigo) });
    } else if (p) {
      r.retiradas.push({ registro: reg, codigo: p.codigo, nombre: p.nombre });
    } else {
      const q = reg.nombre ? porNombre.get(normalizarNombre(reg.nombre)) : null;
      if (q && !correosArchivo.has(normalizarCorreo(q.correo)) && !usadas.has(q.codigo)) {
        usadas.add(q.codigo);
        r.correoCambiado.push({ registro: reg, codigo: q.codigo, nombre: q.nombre, correoApp: q.correo, piso: q.piso, puesto: q.puesto });
      } else {
        r.nuevas.push({ registro: reg, agregar: true, piso: null, puesto: null, compartirPuesto: false });
      }
    }
  }
  r.ausentes = activas.filter(p => !usadas.has(p.codigo))
    .map(p => ({ codigo: p.codigo, nombre: p.nombre, piso: p.piso, puesto: p.puesto }));
  return r;
}

// Lo que se cifra de cada registro: el contacto (teléfono propio y familiar) y, aparte, la EPS y la ARL.
export const datosDe = r => ({ telefono: r.telefono, familiar: { nombre: r.familiar, parentesco: r.parentesco, telefono: r.telefonoFamiliar } });
export const saludDe = r => (r.eps || r.arl ? { eps: r.eps, arl: r.arl } : null);
