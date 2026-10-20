// Contacto de emergencia de cada persona (v0.12), cifrado en el navegador en dos bloques, cada uno con
// su propia llave aleatoria:
//  - «datos»: teléfono de la persona y su familiar (nombre, parentesco, teléfono);
//  - «salud»: EPS y ARL (si las hay).
// Las dos llaves se envuelven para la coordinación (administrador, coordinador y suplente), los brigadistas
// de TODOS los pisos y la propia persona, si tiene llave pública. El servidor solo ve texto cifrado: entrega
// a cada brigadista su piso (otro piso, con bitácora) y la EPS y la ARL solo durante una emergencia o simulacro.
import * as cripto from './cripto.js';
import * as sesion from './sesion.js';
import * as almacen from './almacen.js';
import { leerXlsx } from './xlsx.js';
import { llamar, ErrorApi } from './api.js';
import { decodificarTexto, leerCsv, interpretarContactos } from './archivo-contactos.js';

const ROLES_COORDINACION = ['admin', 'coordinador', 'suplente'];
// El contexto amarra cada envoltorio a su registro y a su bloque: no se puede cambiar de lugar.
export const ctxDatos = codigo => 'contacto|' + codigo;
export const ctxSalud = codigo => 'contacto-salud|' + codigo;
const POR_ENVIO = 50;   // contactos por petición al servidor (el servidor admite hasta 500)

export const esCoordinacion = () => ROLES_COORDINACION.some(r => sesion.tieneRol(r));
export const listoParaUsar = () => !!sesion.llavePriv() && !!sesion.miPublica();

const activos = () => ((sesion.base() && sesion.base().personas) || []).filter(p => p.estado === 'activo');

// Quienes reciben la llave del contacto de «codigo»: coordinación, brigadistas de todos los pisos y la persona.
export const destinatarios = codigo => activos()
  .filter(p => p.codigo === codigo || (p.roles || []).some(r => ROLES_COORDINACION.includes(r) || r === 'brigadista'));

// Quienes aún no tienen llave pública (no han ingresado desde la v0.9) quedan fuera: cuando ingresen, la
// coordinación les agrega su envoltorio (fase 3).
async function envolver(personas, raw, contexto) {
  const mapa = {};
  for (const p of personas) if (p.pub) mapa[p.codigo] = await cripto.envolverPara(p.pub, raw, contexto);
  return mapa;
}

// Prepara lo que se envía al servidor para una persona: { codigo, datos, claves, salud?, clavesSalud? }.
export async function cifrarContacto(codigo, datos, salud) {
  const para = destinatarios(codigo);
  const d = cripto.nuevaLlaveDatos();
  const op = { codigo, datos: await cripto.cifrarJSON(await cripto.importarLlaveDatos(d), datos), claves: await envolver(para, d, ctxDatos(codigo)) };
  if (salud) {
    const s = cripto.nuevaLlaveDatos();
    op.salud = await cripto.cifrarJSON(await cripto.importarLlaveDatos(s), salud);
    op.clavesSalud = await envolver(para, s, ctxSalud(codigo));
  }
  return op;
}

// Carga varios contactos: lista = [{ codigo, datos, salud }]. Cifra todo primero y después envía en tandas.
// Cada tanda es todo o nada en el servidor; si una falla, el error dice cuántos quedaron cargados.
export async function cargarLote(lista, alAvanzar = () => {}) {
  if (!esCoordinacion()) throw new ErrorApi('Solo la coordinación y la administración pueden cargar contactos.', 'PERMISO');
  if (!listoParaUsar()) throw new ErrorApi('Cierre sesión y vuelva a ingresar para activar la protección de los datos.', 'LLAVE');
  // Mientras dura la carga no se actualizan los accesos: lo harían con llaves que la carga está cambiando.
  cargandoLote = true;
  try {
    const ops = [];
    for (let i = 0; i < lista.length; i++) {
      ops.push(await cifrarContacto(lista[i].codigo, lista[i].datos, lista[i].salud));
      alAvanzar(0.8 * (i + 1) / lista.length);
    }
    let cargados = 0;
    for (let i = 0; i < ops.length; i += POR_ENVIO) {
      try {
        cargados += (await llamar('cargarContactos', { ops: ops.slice(i, i + POR_ENVIO) })).n;
      } catch (e) {
        throw new ErrorApi(`${cargados ? `Se cargaron ${cargados} de ${ops.length} contactos y se detuvo la carga` : 'No se cargó ningún contacto'}: ${e.message}`, e.codigo || 'ERROR');
      }
      alAvanzar(0.8 + 0.2 * Math.min(ops.length, i + POR_ENVIO) / ops.length);
    }
    return cargados;
  } finally { cargandoLote = false; }
}

// Estado de la carga, sin datos personales: { cargados: Set de códigos con contacto, corregidos: Set de los
// que se corrigieron en la app después de la última carga, faltan: [códigos] }.
export async function estado() {
  const r = await llamar('contactos');
  const lista = r.contactos || [];
  return { cargados: new Set(lista.map(c => c.codigo)), corregidos: new Set(lista.filter(c => c.fuente && c.fuente !== 'carga').map(c => c.codigo)), faltan: r.faltan || [] };
}

// ---------- Ver, corregir y tener sin conexión ----------
// Cada quien recibe lo que el servidor le permite: la coordinación, todos; un brigadista, su piso; cualquiera
// con acceso, el suyo. Se guarda una copia CIFRADA en el celular para usarla sin internet y se abre en memoria
// con la llave personal. La EPS y la ARL de un brigadista solo llegan durante una emergencia o simulacro y se
// quitan del celular al terminar; lo mismo los contactos de otro piso que haya pedido.

const CLAVE_COPIA = 'contactos';
const enMemoria = new Map();      // código → { codigo, abierto, datos?, salud?, tieneSalud, fuente, cargado, actualizado, version, otroPiso? }
let conContacto = new Set();      // códigos con contacto en el servidor (la coordinación los ve todos)
let faltan = [];                  // solo para la coordinación: personas activas sin contacto
let cargando = null;
let ultimaCarga = 0;
let cargandoLote = false;
// Sube cada vez que termina una emergencia: una respuesta pedida antes (con EPS y ARL) se descarta.
let generacion = 0;

export const contactoDe = codigo => enMemoria.get(codigo) || null;
export const hayContacto = codigo => conContacto.has(codigo);
export const faltantes = () => faltan.slice();
export const pisosConsultados = new Set();   // otros pisos que este brigadista pidió durante la emergencia

async function abrirRegistro(r, priv) {
  const base = { codigo: r.codigo, version: r.version, tieneSalud: !!r.tieneSalud, fuente: r.fuente || '', cargado: r.cargado || '', actualizado: r.actualizado || '', por: r.por || '', abierto: false };
  if (!priv || !r.clave) return base;
  try {
    const d = await cripto.desenvolver(priv, r.clave, ctxDatos(r.codigo));
    const salida = { ...base, abierto: true, datos: await cripto.descifrarJSON(await cripto.importarLlaveDatos(d), r.datos), salud: null };
    if (r.salud && r.claveSalud) {
      const s = await cripto.desenvolver(priv, r.claveSalud, ctxSalud(r.codigo));
      salida.salud = await cripto.descifrarJSON(await cripto.importarLlaveDatos(s), r.salud);
    }
    return salida;
  } catch { return base; }
}

async function llenar(respuesta) {
  const priv = sesion.llavePriv();
  const otros = [...enMemoria.values()].filter(c => c.otroPiso);
  enMemoria.clear();
  for (const r of respuesta.contactos || []) enMemoria.set(r.codigo, await abrirRegistro(r, priv));
  otros.forEach(c => { if (!enMemoria.has(c.codigo)) enMemoria.set(c.codigo, c); });
  conContacto = new Set((respuesta.contactos || []).map(c => c.codigo));
  faltan = respuesta.faltan || [];
  dispatchEvent(new CustomEvent('contactos-cambio'));
}

// Trae los contactos (o, sin conexión, usa la copia del celular). Sin «forzar», como mucho cada 5 minutos.
// Con «forzar» y una consulta en curso, se pide otra al terminar: la que va en camino puede ser de antes de
// un cambio (por ejemplo, del inicio o del fin de una emergencia).
export function cargar({ forzar = false } = {}) {
  if (!sesion.activa()) return Promise.resolve();
  if (cargando) return forzar ? cargando.then(() => cargar({ forzar: true })) : cargando;
  if (!forzar && ultimaCarga && Date.now() - ultimaCarga < 300000) return Promise.resolve();
  const gen = generacion;
  cargando = (async () => {
    let r = null;
    if (navigator.onLine) {
      try {
        r = await llamar('contactos');
        if (gen !== generacion) return;   // pedida antes de terminar la emergencia: no se guarda
        await almacen.guardar(CLAVE_COPIA, r);
        ultimaCarga = Date.now();
      } catch { r = null; /* sin servidor: se usa la copia */ }
    }
    if (!r) r = await almacen.leer(CLAVE_COPIA);
    if (r && gen === generacion) await llenar(r);
  })().finally(() => { cargando = null; });
  return cargando;
}

// «Ver otro piso» (brigadistas): queda en la bitácora del servidor. Solo con internet y solo en memoria.
export async function verOtroPiso(piso) {
  const r = await llamar('contactosOtroPiso', { piso });
  const priv = sesion.llavePriv();
  for (const x of r.contactos || []) if (!enMemoria.has(x.codigo) || !enMemoria.get(x.codigo).abierto) enMemoria.set(x.codigo, { ...(await abrirRegistro(x, priv)), otroPiso: true });
  pisosConsultados.add(Number(piso));
  dispatchEvent(new CustomEvent('contactos-cambio'));
  return (r.contactos || []).length;
}

// Al terminar la emergencia: fuera del celular la EPS y la ARL de quien no es de la coordinación y los
// contactos de otros pisos. Después se vuelve a pedir lo que corresponde.
async function olvidarEmergencia() {
  generacion++;
  pisosConsultados.clear();
  for (const [codigo, c] of enMemoria) if (c.otroPiso) enMemoria.delete(codigo);
  if (!esCoordinacion()) {
    const copia = await almacen.leer(CLAVE_COPIA);
    if (copia) {
      const yo = sesion.perfil() && sesion.perfil().codigo;
      copia.contactos = (copia.contactos || []).map(c => (c.codigo === yo ? c : { ...c, salud: undefined, claveSalud: undefined }));
      await almacen.guardar(CLAVE_COPIA, copia);
      await llenar(copia);
    } else { enMemoria.clear(); }
  }
  dispatchEvent(new CustomEvent('contactos-cambio'));
  cargar({ forzar: true });
}

// Corrige (o registra) el contacto de una persona. La coordinación, de cualquiera; los demás, el suyo.
export async function guardar(codigo, datos, salud, versionBase) {
  if (!listoParaUsar()) throw new ErrorApi('Cierre sesión y vuelva a ingresar para activar la protección de los datos.', 'LLAVE');
  const op = await cifrarContacto(codigo, datos, salud);
  const r = await llamar('guardarContactoDe', { ...op, versionBase });
  await cargar({ forzar: true });
  return r;
}

// ---------- Mantener los accesos al día ----------
// Cuando cambian los roles (nuevo coordinador o brigadista), el piso de un brigadista o alguien estrena su
// llave personal, alguien de la coordinación agrega o quita envoltorios. Nunca toca los datos.

let reconciliando = false;
let ultimaReconciliacion = 0;
const CLAVE_REVISION = 'accesosContactosRevisados';
const SEIS_HORAS = 6 * 3600000;
let revision = { firma: null, cuando: 0 };
const firmaAccesos = () => activos()
  .map(p => [p.codigo, (p.roles || []).slice().sort().join('+'), p.pisoBrigada || '', p.pub || ''].join(':'))
  .sort().join('|');

export async function reconciliar({ forzar = false } = {}) {
  const priv = sesion.llavePriv();
  if (!esCoordinacion() || !priv || reconciliando || cargandoLote || !navigator.onLine) return 0;
  if (!forzar && Date.now() - ultimaReconciliacion < 60000) return 0;
  const firma = firmaAccesos();
  if (!forzar && firma === revision.firma && Date.now() - revision.cuando < SEIS_HORAS) return 0;
  reconciliando = true;
  ultimaReconciliacion = Date.now();
  try {
    // Si el servidor aún no tiene contactos (versión anterior), esta llamada falla y no se envía nada.
    const r = await llamar('contactos');
    const porCodigo = new Map(activos().map(p => [p.codigo, p]));
    const diferencia = async (necesarios, huellas, llave, contexto) => {
      const agregar = {}, quitar = [];
      for (const c of necesarios) {
        const p = porCodigo.get(c);
        if (p && p.pub && huellas[c] !== await cripto.huella(p.pub)) agregar[c] = await cripto.envolverPara(p.pub, llave, contexto);
      }
      for (const c of Object.keys(huellas)) if (!necesarios.includes(c)) quitar.push(c);
      return { agregar, quitar };
    };
    const cambios = [];
    for (const reg of r.contactos || []) {
      if (!reg.clave) continue;   // esta sesión no puede abrirlo: otra persona de la coordinación lo hará
      let d, s = null;
      try {
        d = await cripto.desenvolver(priv, reg.clave, ctxDatos(reg.codigo));
        if (reg.tieneSalud && reg.claveSalud) s = await cripto.desenvolver(priv, reg.claveSalud, ctxSalud(reg.codigo));
      } catch { continue; }
      const necesarios = destinatarios(reg.codigo).map(p => p.codigo);
      const a = await diferencia(necesarios, reg.huellas || {}, d, ctxDatos(reg.codigo));
      const b = s ? await diferencia(necesarios, reg.huellasSalud || {}, s, ctxSalud(reg.codigo)) : { agregar: {}, quitar: [] };
      if (Object.keys(a.agregar).length || a.quitar.length || Object.keys(b.agregar).length || b.quitar.length) {
        // «version»: si el registro cambió mientras tanto (una carga o una corrección), el servidor lo omite.
        cambios.push({ codigo: reg.codigo, version: reg.version, agregar: a.agregar, quitar: a.quitar, agregarSalud: b.agregar, quitarSalud: b.quitar });
      }
    }
    const res = cambios.length ? await llamar('reenvolver', { registro: 'contactos', cambios }) : { omitidos: 0 };
    // Con registros omitidos no se da la revisión por hecha: se repite en la siguiente oportunidad.
    if (!res.omitidos) {
      revision = { firma, cuando: Date.now() };
      await almacen.guardar(CLAVE_REVISION, revision);
    } else ultimaReconciliacion = 0;
    return cambios.length - (res.omitidos || 0);
  } catch (e) {
    console.warn('No se pudieron actualizar los accesos a los contactos:', e && e.message);
    return 0;
  } finally {
    reconciliando = false;
  }
}

export async function iniciar() {
  revision = (await almacen.leer(CLAVE_REVISION)) || { firma: null, cuando: 0 };
  addEventListener('sesion-cerrada', () => {
    revision = { firma: null, cuando: 0 };
    enMemoria.clear(); conContacto = new Set(); faltan = []; ultimaCarga = 0; pisosConsultados.clear();
  });
  addEventListener('sesion-iniciada', () => { cargar({ forzar: true }); setTimeout(() => reconciliar(), 4000); });
  addEventListener('online', () => { cargar(); reconciliar(); });
  // Con una emergencia activa, el brigadista recibe la EPS y la ARL de su piso; al terminar se quitan.
  addEventListener('emergencia-activada', () => cargar({ forzar: true }));
  addEventListener('emergencia-terminada', () => olvidarEmergencia());
  sesion.alRefrescar(() => setTimeout(() => reconciliar(), 2500));
  if (sesion.activa()) cargar();
}

// Lee el archivo del área de personal (.xlsx o .csv). Del Excel usa la primera hoja que tenga la columna «Correo».
export async function leerArchivo(archivo) {
  const bytes = await archivo.arrayBuffer();
  if (/\.csv$/i.test(archivo.name) || /csv|text/.test(archivo.type || '')) return interpretarContactos(leerCsv(decodificarTexto(new Uint8Array(bytes))));
  const hojas = await leerXlsx(bytes);
  const conCorreo = hojas.find(h => h.filas.some(f => (f || []).some(c => /^(correo|e-?mail)/i.test(String(c || '').trim()))));
  return interpretarContactos((conCorreo || hojas[0] || { filas: [] }).filas);
}
