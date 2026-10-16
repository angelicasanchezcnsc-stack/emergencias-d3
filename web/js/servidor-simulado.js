// Servidor simulado para pruebas: ejecuta el mismo núcleo del servidor real
// (servidor/Nucleo.gs) dentro del navegador y guarda las tablas en localStorage.
// Los datos quedan solo en este equipo y navegador.

import { ErrorApi } from './api.js';

const CLAVE = 'd3e-simulado';

// Solo para pruebas: permite simular que pasó el tiempo (en milisegundos).
let desfase = 0;
export const simularDesfase = ms => { desfase = ms; };

function estado() {
  let e;
  try { e = JSON.parse(localStorage.getItem(CLAVE)); } catch { e = null; }
  if (!e) {
    const aleatorio = () => crypto.randomUUID().replace(/-/g, '');
    e = { tablas: {}, props: { PIMIENTA: aleatorio() + aleatorio(), CODIGO_INSTALACION: aleatorio().slice(0, 8).toUpperCase() } };
    guardar(e);
  }
  return e;
}

function guardar(e) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    throw new Error('El almacenamiento de prueba del navegador está lleno. Quite archivos pesados o reinicie el modo prueba.');
  }
}

const adaptador = {
  leer: t => JSON.parse(JSON.stringify(estado().tablas[t] || [])),
  escribir: (t, filas) => { const e = estado(); e.tablas[t] = filas.map(f => ({ ...f })); guardar(e); },
  agregar: (t, fila) => { const e = estado(); (e.tablas[t] = e.tablas[t] || []).push({ ...fila }); guardar(e); },
  agregarVarias: (t, filas) => { const e = estado(); (e.tablas[t] = e.tablas[t] || []).push(...filas.map(f => ({ ...f }))); guardar(e); },
  prop: n => estado().props[n],
  uuid: () => crypto.randomUUID(),
  ahora: () => Date.now() + desfase,
  hoy: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() + desfase)),
  bloqueo: fn => fn(),
  cache: (() => {
    const m = new Map();
    return {
      get: k => { const v = m.get(k); return v && v.hasta > Date.now() ? v.valor : null; },
      put: (k, valor, s) => { m.set(k, { valor, hasta: Date.now() + s * 1000 }); }
    };
  })()
};

let nucleo;

async function cargarNucleo() {
  if (!nucleo) {
    const url = new URL('../../servidor/Nucleo.gs', import.meta.url);
    const codigo = await (await fetch(url)).text();
    const crearNucleo = new Function(codigo + '\nreturn crearNucleo;')();
    nucleo = crearNucleo(adaptador);
  }
  return nucleo;
}

// Solo para pruebas: simula que el servidor no responde (como un corte de internet).
let caido = false;
export const simularCaida = valor => { caido = !!valor; };

// Solo para pruebas: imita a Google. Cada petición tarda «demora» milisegundos (el servidor real
// tarda de 1 a 4 segundos) y, como en Apps Script, las acciones que usan el candado del servidor
// esperan su turno en fila; las demás van en paralelo. Con 0 el simulado responde al instante.
// La demora se recuerda en la pestaña (sessionStorage) para poder medir también la carga inicial.
const CLAVE_DEMORA = 'd3e-demora-simulada';
let demora = (() => { try { return Number(sessionStorage.getItem(CLAVE_DEMORA)) || 0; } catch { return 0; } })();
export function simularDemora(ms) {
  demora = Math.max(0, Number(ms) || 0);
  try { if (demora) sessionStorage.setItem(CLAVE_DEMORA, String(demora)); else sessionStorage.removeItem(CLAVE_DEMORA); } catch { /* sin almacenamiento */ }
}
let fila = Promise.resolve();
const enFila = tarea => { const turno = fila.then(tarea, tarea); fila = turno.catch(() => {}); return turno; };

// Solo para pruebas: registro de las últimas peticiones (acción, milisegundos y si esperó en fila)
// y cuántas siguen en curso.
const registro = [];
let enCurso = 0;
export const registroSimulado = () => ({ peticiones: registro.slice(), enCurso });
export const limpiarRegistroSimulado = () => { registro.length = 0; };

export default async function llamarSimulado(accion, datos) {
  const n = await cargarNucleo();
  const inicio = performance.now();
  const conFila = !!(demora && n.usaBloqueo && n.usaBloqueo(accion));
  const tarea = async () => {
    if (demora) await new Promise(r => setTimeout(r, demora));
    // El servidor real no responde sin internet; el simulado debe hacer lo mismo.
    if (caido || !navigator.onLine) throw new ErrorApi('Sin conexión con el servidor.', 'RED');
    // Copia profunda: simula el viaje por la red.
    return JSON.parse(JSON.stringify(n.procesar(JSON.parse(JSON.stringify({ accion, ...datos })))));
  };
  enCurso++;
  try {
    return await (conFila ? enFila(tarea) : tarea());
  } finally {
    enCurso--;
    registro.push({ accion, ms: Math.round(performance.now() - inicio), fila: conFila, inicio: Math.round(inicio), fin: Math.round(performance.now()) });
    if (registro.length > 200) registro.shift();
  }
}

// Solo para el modo simulado: el código que en el servidor real aparece en el
// registro de ejecución de Apps Script.
export const codigoInstalacionSimulado = () => estado().props.CODIGO_INSTALACION;

export function borrarSimulado() { localStorage.removeItem(CLAVE); }
