// Registro diario: quién está en la sede, en qué piso y puesto.
// Cada marca se aplica de inmediato en el celular, se guarda en una cola local y
// se envía al servidor en cuanto hay conexión (con reintentos automáticos).
import * as almacen from './almacen.js';
import * as sesion from './sesion.js';
import { llamar } from './api.js';
import { fechaBogota } from './tiempo.js';

let cola = [];
let enviando = false;

const avisar = () => dispatchEvent(new CustomEvent('registro-cambio'));
export const pendientes = () => cola.length;

export async function iniciar() {
  cola = (await almacen.leer('cola')) || [];
  sesion.alRefrescar(reaplicarCola);
  addEventListener('sesion-cerrada', () => { cola = []; });
  addEventListener('online', enviar);
  setInterval(enviar, 30000);
  reaplicarCola();
  enviar();
}

export function hoy() {
  const b = sesion.base();
  const fecha = fechaBogota();
  if (!b) return { fecha, registros: [] };
  if (!b.hoy || b.hoy.fecha !== fecha) b.hoy = { fecha, registros: [] };
  return b.hoy;
}

export const registroDe = codigo => hoy().registros.find(r => r.codigo === codigo) || null;

// Situación resumida de una persona hoy.
export function situacion(r) {
  if (!r || !r.estado) return 'sin-reporte';
  if (r.estado !== 'presencial') return r.estado;
  return r.salida ? 'salio' : 'en-sede';
}

// Piso y puesto donde está hoy (el habitual, salvo que haya reportado otro).
export function ubicacionHoy(persona) {
  const r = registroDe(persona.codigo);
  return r && r.excepcion ? { piso: r.piso, puesto: r.puesto, excepcion: true } : { piso: persona.piso, puesto: persona.puesto, excepcion: false };
}

function aplicarLocal(op) {
  const h = hoy();
  if (op.fecha !== h.fecha) return;
  let r = h.registros.find(x => x.codigo === op.codigo);
  if (!r) {
    const p = (sesion.base().personas || []).find(x => x.codigo === op.codigo) || {};
    r = { codigo: op.codigo, estado: '', piso: p.piso, puesto: p.puesto, excepcion: false, ingreso: '', salida: '', reportadoPor: '' };
    h.registros.push(r);
  }
  for (const [c, v] of Object.entries(op.campos)) {
    r[c] = c === 'piso' || c === 'puesto' ? Number(v) : c === 'excepcion' ? v === 'true' : v;
  }
  r.reportadoPor = sesion.perfil().codigo;
}

function reaplicarCola() { cola.forEach(aplicarLocal); avisar(); }

// Registra un cambio para una persona (uno mismo o un compañero).
export async function marcar(codigo, campos) {
  const texto = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, String(v)]));
  const op = { id: crypto.randomUUID(), fecha: fechaBogota(), codigo, momento: Date.now(), campos: texto };
  aplicarLocal(op);
  cola.push(op);
  await almacen.guardar('cola', cola);
  await sesion.guardarBase();
  avisar();
  enviar();
}

export async function enviar() {
  if (enviando || !cola.length || !sesion.activa()) return;
  enviando = true;
  const lote = cola.slice();
  try {
    const r = await llamar('registrar', { ops: lote });
    const enviados = new Set(lote.map(o => o.id));
    cola = cola.filter(o => !enviados.has(o.id));
    await almacen.guardar('cola', cola);
    sesion.base().hoy = r.hoy;
    cola.forEach(aplicarLocal);
    await sesion.guardarBase();
    const vencidas = r.resultados.filter(x => x.estado === 'fecha').length;
    if (vencidas) dispatchEvent(new CustomEvent('registro-vencido', { detail: vencidas }));
    avisar();
  } catch {
    // Sin conexión o error temporal: la cola se reintenta sola.
  } finally {
    enviando = false;
  }
}

// Trae del servidor el registro del día (otros pudieron reportar).
export async function actualizar() {
  try {
    const h = await llamar('hoy');
    sesion.base().hoy = h;
    cola.forEach(aplicarLocal);
    await sesion.guardarBase();
    avisar();
    return true;
  } catch {
    return false;
  }
}
