// Emergencia en curso: estado, consulta periódica al servidor, marcas de los
// brigadistas (con cola local si no hay conexión) y cálculo del tablero.
import { CONFIG } from '../config.js';
import * as almacen from './almacen.js';
import * as sesion from './sesion.js';
import { llamar } from './api.js';
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

// Adopta el estado que llega del servidor y avisa si una emergencia empezó o terminó.
function adoptar(nuevo) {
  const antes = actual();
  estado = nuevo && nuevo.emergencia ? nuevo : null;
  cola.forEach(aplicarLocal);
  almacen.guardar('emergencia', estado);
  const ahora = actual();
  if (ahora && (!antes || antes.emergencia.id !== ahora.emergencia.id)) alertar();
  if (antes && !ahora) dispatchEvent(new CustomEvent('emergencia-terminada', { detail: antes.emergencia }));
  avisar();
}

export async function iniciar() {
  cola = (await almacen.leer('colaEmergencia')) || [];
  const guardada = (sesion.base() && sesion.base().emergencia) || (await almacen.leer('emergencia')) || null;
  estado = guardada && guardada.emergencia ? guardada : null;
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

export async function cerrar() {
  const a = actual();
  if (!a) return;
  await llamar('cerrarEmergencia', { id: a.emergencia.id });
  adoptar(null);
  programar();
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
  if (enviando || !cola.length || !sesion.activa()) return;
  enviando = true;
  const lote = cola.slice();
  try {
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
      pendientes: suma('pendientes'), porVerificar: suma('porVerificar'), llegaron: suma('llegaron')
    },
    sinReporte: filas.filter(f => (f.esperados || f.porVerificar) && !f.reportado).map(f => f.piso)
  };
}

export function transcurrido(inicio, fin = Date.now()) {
  const s = Math.max(0, Math.floor((fin - inicio) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(seg).padStart(2, '0');
}
