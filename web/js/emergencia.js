// Emergencia en curso: estado, consulta periódica al servidor, marcas de los
// brigadistas (con cola local si no hay conexión) y cálculo del tablero.
import { CONFIG } from '../config.js';
import * as almacen from './almacen.js';
import * as sesion from './sesion.js';
import { llamar, ErrorApi } from './api.js';
import * as registro from './registro.js';
import { horaBogota } from './tiempo.js';

export const TIPOS = {
  sismo: 'Sismo',
  incendio: 'Incendio o explosión',
  estructural: 'Falla estructural',
  'riesgo-publico': 'Riesgo público',
  atentado: 'Atentado o amenaza',
  otro: 'Otro evento'
};
// Protocolo de recomendaciones que se sugiere abrir según el tipo.
export const PROTOCOLO = { sismo: 'sismo', incendio: 'incendio', estructural: 'estructural', 'riesgo-publico': 'riesgo-publico', atentado: 'atentado', otro: 'evacuacion' };

export const ROLES_ACTIVAR = ['admin', 'coordinador', 'suplente', 'brigadista'];
export const ROLES_SIMULACRO = ['admin', 'coordinador'];
export const ROLES_CERRAR = ['admin', 'coordinador', 'suplente'];
export const ROLES_REPORTAR = ['admin', 'coordinador', 'suplente', 'brigadista'];
export const tiene = roles => roles.some(r => sesion.tieneRol(r));

const INTERVALO_NORMAL = 60000;
const INTERVALO_EMERGENCIA = 15000;

let estado = null;   // { emergencia, marcas, conteos }
let cola = [];
let enviando = false;
let temporizador = null;

const avisar = () => dispatchEvent(new CustomEvent('emergencia-cambio'));
export const pendientes = () => cola.length;
export const actual = () => (estado && estado.emergencia && estado.emergencia.estado === 'activa' ? estado : null);
export const ultimo = () => estado;

function alertar() {
  try { navigator.vibrate && navigator.vibrate([400, 150, 400, 150, 400]); } catch { /* sin vibración */ }
  dispatchEvent(new CustomEvent('emergencia-activada'));
}

// Emergencia activada en este celular sin conexión y aún no enviada al servidor.
export const esLocal = () => !!(estado && estado.emergencia && estado.emergencia.local);

// Adopta el estado que llega del servidor y avisa si una emergencia empezó o terminó.
// Mientras haya una emergencia local sin sincronizar, manda la local.
function adoptar(nuevo, { sincronizacion = false } = {}) {
  if (esLocal() && !sincronizacion) { avisar(); return; }
  const antes = actual();
  estado = nuevo && nuevo.emergencia ? nuevo : null;
  cola.forEach(aplicarLocal);
  almacen.guardar('emergencia', estado);
  const ahora = actual();
  if (!sincronizacion && ahora && (!antes || antes.emergencia.id !== ahora.emergencia.id)) alertar();
  if (!ahora) limpiarCopiaBase();
  if (antes && !ahora) dispatchEvent(new CustomEvent('emergencia-terminada', { detail: antes.emergencia }));
  avisar();
}

// Al terminar la emergencia no debe quedar en el celular el detalle por persona:
// tampoco en la copia de la información del día que se guarda para uso sin conexión.
function limpiarCopiaBase() {
  const b = sesion.base();
  if (b && b.emergencia && b.emergencia.emergencia) {
    b.emergencia = { emergencia: null, marcas: [], conteos: [] };
    sesion.guardarBase();
  }
}

export async function iniciar() {
  cola = (await almacen.leer('colaEmergencia')) || [];
  const local = await almacen.leer('emergencia');
  const guardada = local && local.emergencia && local.emergencia.local ? local
    : (sesion.base() && sesion.base().emergencia) || local || null;
  estado = guardada && guardada.emergencia ? guardada : null;
  // Una emergencia local de hace más de un día ya no sirve: se descarta (Ley 1581, minimización).
  if (esLocal() && Date.now() - estado.emergencia.inicio > 86400000) {
    const id = estado.emergencia.id;
    estado = null;
    cola = cola.filter(o => o.emergencia !== id);
    await almacen.guardar('emergencia', null);
    await almacen.guardar('colaEmergencia', cola);
  }
  sesion.alRefrescar(() => { const b = sesion.base(); if (b && 'emergencia' in b) adoptar(b.emergencia); });
  addEventListener('sesion-cerrada', () => { cola = []; estado = null; });
  addEventListener('online', () => { enviar(); consultar(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') consultar(); });
  cola.forEach(aplicarLocal);
  programar();
}

function programar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => { await consultar(); programar(); }, actual() ? INTERVALO_EMERGENCIA : INTERVALO_NORMAL);
}

// Pregunta al servidor si hay cambios (consulta liviana) y, si los hay, trae el estado completo.
export async function consultar() {
  if (!sesion.activa() || document.visibilityState === 'hidden') return;
  if (esLocal()) { await enviar(); if (esLocal()) return; }
  enviar();
  try {
    const r = await llamar('pulso');
    const a = actual();
    const cambio = (r.activa ? r.activa.id : null) !== (a ? a.emergencia.id : null) || (r.activa && a && r.activa.version !== a.emergencia.version);
    if (cambio) await traer();
  } catch { /* sin conexión: se usa lo último conocido */ }
}

export async function traer() {
  try { adoptar(await llamar('emergencia')); programar(); return true; } catch { return false; }
}

export async function activar(tipo, descripcion, simulacro) {
  const r = await llamar('activarEmergencia', { tipo, descripcion, simulacro });
  adoptar(r);
  programar();
}

// Sin conexión: la emergencia arranca en este celular con la lista del día que
// ya está guardada en él. Al volver la señal se une a la del servidor.
export async function activarLocal(tipo, descripcion, simulacro) {
  estado = {
    emergencia: {
      id: 'L-' + crypto.randomUUID().slice(0, 8), local: true, tipo, descripcion, simulacro: !!simulacro, estado: 'activa',
      inicio: Date.now(), activadaPor: sesion.perfil().codigo, cierre: null, cerradaPor: '', version: 0, esperados: fotoLocal()
    },
    marcas: [], conteos: []
  };
  await almacen.guardar('emergencia', estado);
  alertar();
  avisar();
  programar();
}

// Misma regla que el servidor: por piso, quienes están en la sede y quienes no reportaron su día.
function fotoLocal() {
  const foto = {};
  const registros = registro.hoy().registros;
  for (const p of ((sesion.base() && sesion.base().personas) || []).filter(x => x.estado === 'activo')) {
    const r = registros.find(x => x.codigo === p.codigo);
    const piso = r && r.excepcion ? r.piso : p.piso;
    const grupo = !r || !r.estado ? 'sin' : r.estado === 'presencial' && !r.salida ? 'en' : null;
    if (!grupo) continue;
    (foto[piso] = foto[piso] || { en: [], sin: [] })[grupo].push(p.codigo);
  }
  return foto;
}

async function sincronizarLocal() {
  const e = estado.emergencia;
  const r = await llamar('activarEmergencia', { tipo: e.tipo, descripcion: e.descripcion, simulacro: e.simulacro, inicio: e.inicio, unirse: true });
  const id = r.emergencia.id;
  cola.forEach(op => { if (op.emergencia === e.id) op.emergencia = id; });
  await almacen.guardar('colaEmergencia', cola);
  adoptar(r, { sincronizacion: true });
  dispatchEvent(new CustomEvent('emergencia-sincronizada'));
}

// Cierra la emergencia y devuelve el id del informe generado.
export async function cerrar(observaciones = '') {
  if (esLocal()) await enviar();
  if (esLocal()) throw new ErrorApi('Sin conexión: esta emergencia se activó sin internet y aún no llega al servidor. Podrá cerrarse cuando haya conexión.', 'RED');
  const a = actual();
  if (!a) return null;
  const id = a.emergencia.id;
  // Antes de cerrar se envía lo pendiente para que cuente en el informe.
  await enviar();
  await llamar('cerrarEmergencia', { id, observaciones });
  cola = cola.filter(o => o.emergencia !== id);
  await almacen.guardar('colaEmergencia', cola);
  adoptar(null);
  programar();
  return id;
}

// ---------- Marcas ----------

function aplicarLocal(op) {
  if (!estado || !estado.emergencia || estado.emergencia.id !== op.emergencia) return;
  if (op.tipo === 'conteo') {
    let c = estado.conteos.find(x => x.piso === op.piso);
    if (!c) { c = { piso: op.piso, evacuados: 0, noUbicados: 0, apoyo: 0 }; estado.conteos.push(c); }
    for (const [k, v] of Object.entries(op.campos)) c[k] = Number(v);
    c.reportadoPor = sesion.perfil().codigo;
  } else {
    let m = estado.marcas.find(x => x.codigo === op.codigo);
    if (!m) { m = { codigo: op.codigo, estado: '', asistencia: false, llegada: '' }; estado.marcas.push(m); }
    for (const [k, v] of Object.entries(op.campos)) m[k] = k === 'asistencia' ? v === 'true' : v;
    m.reportadoPor = sesion.perfil().codigo;
  }
}

async function encolar(op) {
  aplicarLocal(op);
  cola.push(op);
  await almacen.guardar('colaEmergencia', cola);
  await almacen.guardar('emergencia', estado);
  avisar();
  enviar();
}

export function marcarPersona(codigo, campos) {
  const a = actual();
  if (!a) return;
  const texto = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, String(v)]));
  return encolar({ id: crypto.randomUUID(), emergencia: a.emergencia.id, tipo: 'persona', codigo, momento: Date.now(), campos: texto });
}

export function marcarConteo(piso, campos) {
  const a = actual();
  if (!a) return;
  const texto = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, String(Math.max(0, Math.round(Number(v) || 0)))]));
  return encolar({ id: crypto.randomUUID(), emergencia: a.emergencia.id, tipo: 'conteo', piso, momento: Date.now(), campos: texto });
}

export const marcarLlegada = codigo => marcarPersona(codigo, { llegada: horaBogota(), estado: 'evacuado' });

export async function enviar() {
  if (enviando || !sesion.activa() || (!cola.length && !esLocal())) return;
  enviando = true;
  try {
    if (esLocal()) await sincronizarLocal();
    if (!cola.length) return;
    const lote = cola.slice();
    const r = await llamar('marcarEmergencia', { ops: lote });
    const ids = new Set(lote.map(o => o.id));
    cola = cola.filter(o => !ids.has(o.id));
    await almacen.guardar('colaEmergencia', cola);
    adoptar(r.estado);
    const cerradas = r.resultados.filter(x => x.estado === 'cerrada').length;
    if (cerradas) dispatchEvent(new CustomEvent('emergencia-marcas-tarde', { detail: cerradas }));
  } catch {
    // Sin conexión: la cola se reintenta sola.
  } finally {
    enviando = false;
  }
}

// ---------- Tablero ----------

// Resumen por piso a partir de la foto de esperados, las marcas y los conteos.
export function resumen(est = actual()) {
  if (!est || !est.emergencia) return null;
  const esperados = est.emergencia.esperados || {};
  const personas = (sesion.base() && sesion.base().personas) || [];
  const marcas = new Map(est.marcas.map(m => [m.codigo, m]));
  const pisoDe = new Map();
  for (const [piso, g] of Object.entries(esperados)) {
    for (const c of g.en || []) pisoDe.set(c, { piso: Number(piso), grupo: 'en' });
    for (const c of g.sin || []) pisoDe.set(c, { piso: Number(piso), grupo: 'sin' });
  }
  // Personas reportadas que no estaban en la foto: se ubican en su piso habitual.
  for (const m of est.marcas) {
    if (!pisoDe.has(m.codigo)) {
      const p = personas.find(x => x.codigo === m.codigo);
      if (p) pisoDe.set(m.codigo, { piso: p.piso, grupo: 'extra' });
    }
  }
  const pisos = [...new Set([...CONFIG.PISOS, ...[...pisoDe.values()].map(v => v.piso)])].sort((a, b) => a - b);
  const filas = pisos.map(n => {
    const miembros = [...pisoDe.entries()].filter(([, v]) => v.piso === n).map(([codigo, v]) => ({ codigo, grupo: v.grupo, marca: marcas.get(codigo) || null }));
    const en = miembros.filter(x => x.grupo === 'en');
    const conEstado = s => miembros.filter(x => x.marca && x.marca.estado === s);
    const evacuados = miembros.filter(x => x.marca && (x.marca.estado === 'evacuado' || x.marca.llegada));
    const conteo = est.conteos.find(c => c.piso === n) || null;
    const porPersona = {
      evacuados: evacuados.length, noUbicados: conEstado('no_ubicado').length, apoyo: conEstado('apoyo').length,
      pendientes: en.filter(x => !(x.marca && x.marca.estado)).length
    };
    // Si el brigadista reportó el piso por conteo, sus cifras mandan en el tablero.
    const cifras = conteo ? {
      evacuados: conteo.evacuados, noUbicados: conteo.noUbicados, apoyo: conteo.apoyo,
      pendientes: Math.max(0, en.length - conteo.evacuados - conteo.noUbicados - conteo.apoyo)
    } : porPersona;
    const pendientes = cifras.pendientes;
    // Un piso tiene reporte si hay conteo, si alguien reportó a otra persona o si
    // todos los esperados ya tienen estado (aunque se hayan reportado ellos mismos).
    const reportado = !!conteo || (en.length > 0 && pendientes === 0) ||
      miembros.some(x => x.marca && x.marca.estado && x.marca.reportadoPor && x.marca.reportadoPor !== x.codigo);
    return {
      piso: n, miembros,
      esperados: en.length,
      porVerificar: miembros.filter(x => x.grupo === 'sin' && !(x.marca && x.marca.estado)).length,
      evacuados: cifras.evacuados,
      noUbicados: cifras.noUbicados,
      apoyo: cifras.apoyo,
      porPersona,
      asistencia: miembros.filter(x => x.marca && x.marca.asistencia).length,
      llegaron: miembros.filter(x => x.marca && x.marca.llegada).length,
      // Conciliación: evacuados según el piso que aún no se registran en el punto de encuentro.
      sinLlegar: miembros.filter(x => x.marca && x.marca.estado === 'evacuado' && !x.marca.llegada).length,
      pendientes,
      conteo,
      reportado
    };
  });
  const suma = k => filas.reduce((s, f) => s + f[k], 0);
  return {
    filas,
    total: {
      esperados: suma('esperados'), evacuados: suma('evacuados'), noUbicados: suma('noUbicados'), apoyo: suma('apoyo'),
      pendientes: suma('pendientes'), porVerificar: suma('porVerificar'), llegaron: suma('llegaron'), sinLlegar: suma('sinLlegar')
    },
    sinReporte: filas.filter(f => (f.esperados || f.porVerificar) && !f.reportado).map(f => f.piso)
  };
}

// Puesto donde estaba la persona hoy (habitual u otro reportado).
export function puestoDe(codigo) {
  const p = ((sesion.base() && sesion.base().personas) || []).find(x => x.codigo === codigo);
  return p ? registro.ubicacionHoy(p) : { piso: null, puesto: null, excepcion: false };
}

// Quienes aún no llegan al punto de encuentro, con su última ubicación reportada.
// Primero los no ubicados y quienes piden apoyo; al final, los que no reportaron su día.
export function ausentes(est = actual()) {
  const r = resumen(est);
  if (!r) return [];
  const lista = [];
  for (const f of r.filas) {
    for (const x of f.miembros) {
      if (x.marca && x.marca.llegada) continue;
      if (x.grupo === 'extra' && !(x.marca && x.marca.estado)) continue;
      lista.push({ codigo: x.codigo, piso: f.piso, puesto: puestoDe(x.codigo).puesto, grupo: x.grupo, marca: x.marca });
    }
  }
  const prioridad = m => !m || !m.estado ? 2 : m.estado === 'no_ubicado' ? 0 : m.estado === 'apoyo' ? 1 : 3;
  return lista.sort((a, b) => (a.grupo === 'sin') - (b.grupo === 'sin') || prioridad(a.marca) - prioridad(b.marca) || a.piso - b.piso);
}

export function transcurrido(inicio, fin = Date.now()) {
  const s = Math.max(0, Math.floor((fin - inicio) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(seg).padStart(2, '0');
}
