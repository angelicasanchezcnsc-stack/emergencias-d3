// Caracterización individual para emergencias.
//
// Qué se protege y cómo:
//  - El detalle completo («datos») lo cifra la propia persona con una llave aleatoria que
//    solo se entrega, envuelta con sus llaves públicas, a ella y a la coordinación
//    (administrador, coordinador y suplente).
//  - Lo mínimo para evacuar («apoyo»: qué apoyo, detalle breve y acompañante) usa otra llave,
//    que además se entrega a los brigadistas (solo si hay apoyo) y al acompañante.
//  - El servidor y Google solo ven texto cifrado. El servidor además limita quién recibe qué.
import * as cripto from './cripto.js';
import * as almacen from './almacen.js';
import * as sesion from './sesion.js';
import * as contenido from './contenido.js';
import { llamar, ErrorApi } from './api.js';
import { consentimientoInicial, PROTOCOLOS_INDIVIDUALES } from './contenido-inicial.js';

export const CATEGORIAS = [
  ['ninguna', 'Ninguna'], ['movilidad', 'Movilidad reducida'], ['salud_horario', 'Salud con manejo por horario'],
  ['embarazo', 'Embarazo'], ['alergia', 'Alergia grave'], ['otra', 'Otra']
];
export const APOYOS = [
  ['ninguno', 'No necesito apoyo'], ['acompanamiento', 'Acompañamiento'], ['ruta_alternativa', 'Ruta alternativa']
];
export const VINCULACIONES = ['Funcionario(a) de planta', 'Contratista', 'Asesor(a)', 'Profesional', 'Otro'];   // «Empleo o vinculación»
export const etiqueta = (lista, valor) => (lista.find(x => x[0] === valor) || [, valor || '—'])[1];

const ROLES_LECTORES = ['admin', 'coordinador', 'suplente'];
export const esLector = () => ROLES_LECTORES.some(r => sesion.tieneRol(r));

const ctxDatos = c => 'carac|' + c;
const ctxApoyo = c => 'apoyo|' + c;
const unicos = lista => [...new Set(lista)];

const activos = () => ((sesion.base() && sesion.base().personas) || []).filter(p => p.estado === 'activo');
export const lectores = () => activos().filter(p => ROLES_LECTORES.some(r => p.roles.includes(r)));
const brigadistas = () => activos().filter(p => p.roles.includes('brigadista'));

// ¿Tiene esta sesión su llave personal lista? Si no, debe cerrar sesión e ingresar de nuevo.
export const listoParaUsar = () => !!sesion.llavePriv() && !!sesion.miPublica();

// ---------- Autorización de tratamiento de datos ----------

// Texto vigente: el que guardó el administrador o, si no hay, el texto estándar.
export async function consentimientoActual() {
  let c = null;
  try { c = await contenido.leerSobre('consentimiento'); } catch { /* se usa el estándar */ }
  return c || consentimientoInicial();
}

export async function guardarConsentimiento(texto) {
  const actual = await consentimientoActual();
  const n = parseInt(String(actual.version).replace(/\D/g, ''), 10) || 1;
  await contenido.guardarSobre('consentimiento', { version: 'v' + (n + 1), texto });
}

// ---------- Destinatarios ----------

function destinatariosDatos(codigo) {
  return unicos([codigo, ...lectores().map(p => p.codigo)]);
}

function destinatariosApoyo(codigo, apoyo) {
  const lista = [codigo, ...lectores().map(p => p.codigo)];
  if (apoyo && apoyo.apoyo !== 'ninguno') {
    lista.push(...brigadistas().map(p => p.codigo));
    if (apoyo.acompanante) lista.push(apoyo.acompanante);
  }
  return unicos(lista);
}

async function envolverA(llaveDatos, codigos, contexto) {
  const porCodigo = new Map(activos().map(p => [p.codigo, p]));
  const mapa = {}, sinLlave = [];
  for (const c of codigos) {
    const p = porCodigo.get(c);
    if (!p) continue;
    if (!p.pub) { sinLlave.push(c); continue; }
    mapa[c] = await cripto.envolverPara(p.pub, llaveDatos, contexto);
  }
  return { mapa, sinLlave };
}

const nuevaLlave = async () => { const raw = cripto.nuevaLlaveDatos(); return { raw, llave: await cripto.importarLlaveDatos(raw) }; };

// ---------- Mi caracterización ----------

// Devuelve null si aún no hay registro; { ilegible: true } si no se pudo abrir con esta llave.
export async function leerMio() {
  const yo = sesion.perfil().codigo;
  const r = (await llamar('miCaracterizacion')).registro;
  if (!r) return null;
  const meta = { version: r.version, consentimiento: r.consentimiento, actualizado: r.actualizado };
  const priv = sesion.llavePriv();
  if (!priv || !r.clave || !r.claveApoyo) return { ...meta, ilegible: true };
  try {
    const dc = await cripto.desenvolver(priv, r.clave, ctxDatos(yo));
    const da = await cripto.desenvolver(priv, r.claveApoyo, ctxApoyo(yo));
    return {
      ...meta, ilegible: false,
      datos: await cripto.descifrarJSON(await cripto.importarLlaveDatos(dc), r.datos),
      apoyo: await cripto.descifrarJSON(await cripto.importarLlaveDatos(da), r.apoyo)
    };
  } catch {
    return { ...meta, ilegible: true };
  }
}

// Guarda la caracterización de la persona que tiene la sesión abierta (nadie más puede hacerlo).
export async function guardarMio(datos, apoyo, versionConsentimiento, versionBase) {
  const yo = sesion.perfil().codigo;
  if (!listoParaUsar()) throw new ErrorApi('Cierre sesión y vuelva a ingresar para activar la protección de sus datos.', 'LLAVE');
  const c = await nuevaLlave(), a = await nuevaLlave();
  const datosCif = await cripto.cifrarJSON(c.llave, datos);
  const apoyoCif = await cripto.cifrarJSON(a.llave, apoyo);
  const claves = await envolverA(c.raw, destinatariosDatos(yo), ctxDatos(yo));
  const clavesApoyo = await envolverA(a.raw, destinatariosApoyo(yo, apoyo), ctxApoyo(yo));
  const r = await llamar('guardarCaracterizacion', {
    datos: datosCif, claves: claves.mapa, apoyo: apoyoCif, clavesApoyo: clavesApoyo.mapa,
    consentimiento: { v: versionConsentimiento }, versionBase
  });
  return { ...r, sinAcceso: claves.sinLlave };
}

export async function revocarMio() { await llamar('revocarCaracterizacion'); }

// ---------- Caracterización asistida (personas sin acceso) ----------

// La coordinación registra la caracterización de una persona sin acceso al aplicativo, a partir del
// formato de autorización impreso y firmado por ella (que custodia la coordinación). Los destinatarios
// son los mismos de siempre; la persona sin llave pública queda fuera sola (envolverA la omite) y, si
// después se le da acceso, reconciliar() le agrega su envoltorio. El contexto de cifrado usa el código
// de la persona dueña, para que ella pueda abrirlo luego.
export async function guardarAsistida(codigo, datos, apoyo, versionConsentimiento, fechaFirma, versionBase) {
  if (!esLector()) throw new ErrorApi('No tiene permiso para registrar caracterizaciones.', 'PERMISO');
  if (!listoParaUsar()) throw new ErrorApi('Cierre sesión y vuelva a ingresar para activar la protección de los datos.', 'LLAVE');
  const c = await nuevaLlave(), a = await nuevaLlave();
  const datosCif = await cripto.cifrarJSON(c.llave, datos);
  const apoyoCif = await cripto.cifrarJSON(a.llave, apoyo);
  const claves = await envolverA(c.raw, destinatariosDatos(codigo), ctxDatos(codigo));
  const clavesApoyo = await envolverA(a.raw, destinatariosApoyo(codigo, apoyo), ctxApoyo(codigo));
  return llamar('guardarCaracterizacionAsistida', {
    codigo, datos: datosCif, claves: claves.mapa, apoyo: apoyoCif, clavesApoyo: clavesApoyo.mapa,
    consentimiento: { v: versionConsentimiento, fisico: true, fechaFirma }, versionBase
  });
}

// Borra el registro de una persona sin acceso, a solicitud de ella.
export async function revocarDe(codigo) { await llamar('revocarCaracterizacionDe', { codigo }); }

// ---------- Coordinación: ver todas ----------

// Abre todos los registros a los que esta sesión tiene acceso.
export async function leerTodas() {
  if (!esLector()) throw new ErrorApi('No tiene permiso para ver las caracterizaciones.', 'PERMISO');
  const priv = sesion.llavePriv();
  const r = await llamar('caracterizaciones');
  const salida = [];
  for (const reg of r.caracterizaciones) {
    const base = { codigo: reg.codigo, version: reg.version, consentimiento: reg.consentimiento, actualizado: reg.actualizado, modo: reg.modo || 'propio', conAcceso: !!reg.conAcceso };
    if (!priv || !reg.clave || !reg.claveApoyo) { salida.push({ ...base, estado: 'sin-acceso' }); continue; }
    try {
      const dc = await cripto.desenvolver(priv, reg.clave, ctxDatos(reg.codigo));
      const da = await cripto.desenvolver(priv, reg.claveApoyo, ctxApoyo(reg.codigo));
      salida.push({
        ...base, estado: 'ok',
        datos: await cripto.descifrarJSON(await cripto.importarLlaveDatos(dc), reg.datos),
        apoyo: await cripto.descifrarJSON(await cripto.importarLlaveDatos(da), reg.apoyo)
      });
    } catch {
      salida.push({ ...base, estado: 'sin-acceso' });
    }
  }
  return salida;
}

// ---------- Mantener los accesos al día ----------
// Cuando cambian los roles (nuevo coordinador, nuevo brigadista) o alguien renueva su llave,
// cualquier miembro de la coordinación con acceso actualiza los envoltorios de cada registro.
// Nunca toca los datos: solo agrega o quita quién puede abrirlos.

let reconciliando = false;
let ultimaReconciliacion = 0;

export async function reconciliar({ forzar = false } = {}) {
  const priv = sesion.llavePriv();
  if (!esLector() || !priv || reconciliando || !navigator.onLine) return 0;
  if (!forzar && Date.now() - ultimaReconciliacion < 60000) return 0;
  reconciliando = true;
  ultimaReconciliacion = Date.now();
  try {
    const r = await llamar('caracterizaciones');
    const porCodigo = new Map(activos().map(p => [p.codigo, p]));
    const codigosLectores = lectores().map(p => p.codigo);
    const cambios = [];

    // Qué envoltorios faltan, están desactualizados o sobran para un conjunto de destinatarios.
    const diferencia = async (necesarios, huellas, llave, contexto) => {
      const agregar = {}, quitar = [];
      for (const c of necesarios) {
        const p = porCodigo.get(c);
        if (p && p.pub && huellas[c] !== await cripto.huella(p.pub)) agregar[c] = await cripto.envolverPara(p.pub, llave, contexto);
      }
      for (const c of Object.keys(huellas)) if (!necesarios.includes(c)) quitar.push(c);
      return { agregar, quitar };
    };

    for (const reg of r.caracterizaciones) {
      if (!reg.clave || !reg.claveApoyo) continue;   // esta sesión no puede abrirlo: otra persona de la coordinación lo hará
      let dc, da, apoyo;
      try {
        dc = await cripto.desenvolver(priv, reg.clave, ctxDatos(reg.codigo));
        da = await cripto.desenvolver(priv, reg.claveApoyo, ctxApoyo(reg.codigo));
        apoyo = await cripto.descifrarJSON(await cripto.importarLlaveDatos(da), reg.apoyo);
      } catch { continue; }
      const d = await diferencia(unicos([reg.codigo, ...codigosLectores]), reg.huellas, dc, ctxDatos(reg.codigo));
      const a = await diferencia(destinatariosApoyo(reg.codigo, apoyo), reg.huellasApoyo, da, ctxApoyo(reg.codigo));
      if (Object.keys(d.agregar).length || d.quitar.length || Object.keys(a.agregar).length || a.quitar.length) {
        cambios.push({ codigo: reg.codigo, agregar: d.agregar, quitar: d.quitar, agregarApoyo: a.agregar, quitarApoyo: a.quitar });
      }
    }
    if (cambios.length) await llamar('reenvolver', { cambios });
    return cambios.length;
  } catch (e) {
    console.warn('No se pudieron actualizar los accesos:', e && e.message);
    return 0;
  } finally {
    reconciliando = false;
  }
}

// ---------- Apoyo para evacuar (brigadistas, coordinación y acompañantes) ----------
// Lo mínimo: quién necesita apoyo, de qué tipo y quién lo acompaña. Se guarda cifrado en el
// celular para usarse sin conexión y se borra cuando termina la emergencia.

const apoyosEnMemoria = new Map();
let ultimoOlvido = 0;

export const apoyoDe = codigo => apoyosEnMemoria.get(codigo) || null;
export const todosLosApoyos = () => [...apoyosEnMemoria.entries()].map(([codigo, a]) => ({ codigo, ...a }));

export async function cargarApoyos() {
  const priv = sesion.llavePriv();
  if (!priv || !sesion.activa()) return;
  let lista = null;
  if (navigator.onLine) {
    try { lista = (await llamar('apoyos')).apoyos; await almacen.guardar('apoyos', lista); } catch { /* se usa la copia */ }
  }
  if (!lista) lista = (await almacen.leer('apoyos')) || [];
  apoyosEnMemoria.clear();
  for (const x of lista) {
    try {
      const dek = await cripto.desenvolver(priv, x.clave, ctxApoyo(x.codigo));
      apoyosEnMemoria.set(x.codigo, await cripto.descifrarJSON(await cripto.importarLlaveDatos(dek), x.apoyo));
    } catch { /* ese registro no se pudo abrir con esta llave */ }
  }
  dispatchEvent(new CustomEvent('apoyos-cambio'));
}

export async function olvidarApoyos() {
  ultimoOlvido = Date.now();
  apoyosEnMemoria.clear();
  await almacen.borrar('apoyos');
  dispatchEvent(new CustomEvent('apoyos-cambio'));
}

export async function iniciar() {
  addEventListener('sesion-cerrada', () => { apoyosEnMemoria.clear(); });
  addEventListener('sesion-iniciada', () => { cargarApoyos(); setTimeout(() => reconciliar(), 3000); });
  addEventListener('online', () => { cargarApoyos(); reconciliar(); });
  // Al terminar una emergencia se borra del celular lo que se había guardado para atenderla.
  addEventListener('emergencia-terminada', () => olvidarApoyos());
  sesion.alRefrescar(() => setTimeout(() => reconciliar(), 2000));
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !sesion.activa() || Date.now() - ultimoOlvido < 600000) return;
    if (!apoyosEnMemoria.size && !(await almacen.leer('apoyos'))) cargarApoyos();
  });
  if (sesion.activa()) cargarApoyos();
}

// ---------- Protocolo individual ----------

export function idProtocoloIndividual(datos, apoyo) {
  const porCategoria = { movilidad: 'ind-movilidad', salud_horario: 'ind-salud', embarazo: 'ind-embarazo', alergia: 'ind-alergia', otra: 'ind-otra' };
  if (datos && porCategoria[datos.categoria]) return porCategoria[datos.categoria];
  return apoyo && apoyo.apoyo !== 'ninguno' ? 'ind-otra' : null;
}

// Protocolo guardado por el administrador o, si no existe, el estándar.
export async function protocoloIndividual(id) {
  if (!id) return null;
  try {
    const r = await contenido.leerSobre('recomendaciones');
    const p = r && r.protocolos.find(x => x.id === id);
    if (p) return p;
  } catch { /* se usa el estándar */ }
  return PROTOCOLOS_INDIVIDUALES().find(x => x.id === id) || null;
}
