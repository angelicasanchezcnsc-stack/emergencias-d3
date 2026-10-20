// Contenido institucional: contactos, recomendaciones, rutas y archivos.
// Todo viaja y se guarda cifrado con la llave del directorio; se descifra en el
// celular y queda guardado allí para usarse sin conexión.
import * as cripto from './cripto.js';
import * as almacen from './almacen.js';
import * as sesion from './sesion.js';
import { llamar, ErrorApi } from './api.js';
import { contactosIniciales, rutasIniciales, recomendacionesIniciales, consentimientoInicial, PROTOCOLOS_INDIVIDUALES, PROTOCOLO_BRIGADISTA } from './contenido-inicial.js';

const TAM_PARTE = 40000;          // caracteres por celda de Google Sheets (límite: 50.000)
const MAX_PDF = 800 * 1024;
const MAX_IMAGEN = 600 * 1024;

const memoria = new Map();
const cont = () => (sesion.base() && sesion.base().contenido) || { sobres: {}, archivos: {} };

export const archivosMeta = () => cont().archivos || {};
export const versionSobre = n => (cont().sobres[n] && cont().sobres[n].version) || 0;
export const existeSobre = n => !!cont().sobres[n];

export const SEMILLAS = {
  contactos: contactosIniciales,
  // Los protocolos generales del plan, el del brigadista y los protocolos individuales de la caracterización.
  recomendaciones: () => {
    const r = recomendacionesIniciales();
    r.protocolos.push(PROTOCOLO_BRIGADISTA(), ...PROTOCOLOS_INDIVIDUALES());
    return r;
  },
  rutas: rutasIniciales,
  consentimiento: consentimientoInicial
};

function llaveOError() {
  const llave = sesion.llaveDir();
  if (!llave) throw new ErrorApi('No se pudo abrir el contenido protegido. Cierre la sesión y vuelva a ingresar.', 'LLAVE');
  return llave;
}

export async function leerSobre(nombre) {
  const s = cont().sobres[nombre];
  if (!s) return null;
  const hit = memoria.get(nombre);
  if (hit && hit.version === s.version) return structuredClone(hit.obj);
  const obj = await cripto.descifrarJSON(llaveOError(), s.datos);
  memoria.set(nombre, { version: s.version, obj });
  return structuredClone(obj);
}

export async function guardarSobre(nombre, obj) {
  const datos = await cripto.cifrarJSON(llaveOError(), obj);
  if (datos.length > 45000) throw new ErrorApi('El contenido es demasiado largo; acórtelo.', 'DATOS');
  let r;
  try {
    r = await llamar('guardarContenido', { nombre, datos, versionBase: versionSobre(nombre) });
  } catch (e) {
    if (e.codigo === 'CONFLICTO') await sesion.refrescar();
    throw e;
  }
  const base = sesion.base();
  base.contenido = base.contenido || { sobres: {}, archivos: {} };
  base.contenido.sobres[nombre] = { version: r.version, datos };
  memoria.set(nombre, { version: r.version, obj: structuredClone(obj) });
  await sesion.guardarBase();
}

// Carga el contenido inicial de los sobres que aún no existen.
export async function sembrar(nombres = Object.keys(SEMILLAS)) {
  const hechos = [];
  for (const n of nombres) {
    if (existeSobre(n)) continue;
    await guardarSobre(n, SEMILLAS[n]());
    hechos.push(n);
  }
  return hechos;
}

// ---------- Archivos ----------

const clave = id => 'archivo:' + id;
const comoBlob = g => new Blob([g.bytes], { type: g.mime });

export async function obtenerArchivo(id) {
  const meta = archivosMeta()[id];
  if (!meta) return null;
  const guardado = await almacen.leer(clave(id));
  if (guardado && guardado.version === meta.version) return comoBlob(guardado);
  if (!navigator.onLine) return guardado ? comoBlob(guardado) : null;
  try {
    const r = await llamar('bajarArchivo', { id });
    const bytes = await cripto.descifrar(llaveOError(), r.partes.join(''));
    const nuevo = { version: r.version, mime: r.mime, bytes: bytes.buffer };
    await almacen.guardar(clave(id), nuevo);
    return comoBlob(nuevo);
  } catch {
    return guardado ? comoBlob(guardado) : null;
  }
}

export async function estadoDescarga() {
  const ids = Object.keys(archivosMeta());
  let listos = 0;
  for (const id of ids) {
    const g = await almacen.leer(clave(id));
    if (g && g.version === archivosMeta()[id].version) listos++;
  }
  return { total: ids.length, listos };
}

let precargando = false;
// Descarga en segundo plano todos los archivos para que estén sin conexión.
export async function precargar() {
  if (precargando || !navigator.onLine || !sesion.activa() || !sesion.llaveDir()) return;
  precargando = true;
  try {
    for (const id of Object.keys(archivosMeta())) await obtenerArchivo(id);
  } finally {
    precargando = false;
    dispatchEvent(new CustomEvent('contenido-listo'));
  }
}

async function prepararArchivo(file) {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF) throw new ErrorApi(`El PDF pesa ${Math.round(file.size / 1024)} KB y el máximo es ${MAX_PDF / 1024} KB. Expórtelo como imagen o redúzcalo.`, 'DATOS');
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: 'application/pdf' };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new ErrorApi('Formato no admitido. Use JPG, PNG o PDF.', 'DATOS');
  const bmp = await createImageBitmap(file);
  let lado = 1600, calidad = 0.82, blob;
  for (let intento = 0; intento < 4; intento++) {
    const esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bmp.width * esc);
    lienzo.height = Math.round(bmp.height * esc);
    const c = lienzo.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    blob = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', calidad));
    if (blob.size <= MAX_IMAGEN) break;
    lado = Math.round(lado * 0.8);
    calidad = Math.max(0.6, calidad - 0.08);
  }
  bmp.close?.();
  if (blob.size > MAX_IMAGEN * 1.5) throw new ErrorApi('La imagen es demasiado pesada incluso comprimida.', 'DATOS');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
}

export async function subirArchivo(id, file) {
  const { bytes, mime } = await prepararArchivo(file);
  const cifrado = await cripto.cifrar(llaveOError(), bytes);
  const partes = [];
  for (let i = 0; i < cifrado.length; i += TAM_PARTE) partes.push(cifrado.slice(i, i + TAM_PARTE));
  await llamar('subirArchivo', { id, mime, partes, tam: bytes.length });
  await almacen.borrar(clave(id));
  await sesion.refrescar();
  await obtenerArchivo(id);
  return bytes.length;
}

export async function quitarArchivo(id) {
  await llamar('quitarArchivo', { id });
  await almacen.borrar(clave(id));
  await sesion.refrescar();
}

export const formatoTam = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

export const telefonoLimpio = t => String(t || '').replace(/[^\d+]/g, '');
