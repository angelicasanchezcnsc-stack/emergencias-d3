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
  bloqueo: fn => fn()
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

export default async function llamarSimulado(accion, datos) {
  // El servidor real no responde sin internet; el simulado debe hacer lo mismo.
  if (caido || !navigator.onLine) throw new ErrorApi('Sin conexión con el servidor.', 'RED');
  const n = await cargarNucleo();
  // Copia profunda: simula el viaje por la red.
  return JSON.parse(JSON.stringify(n.procesar(JSON.parse(JSON.stringify({ accion, ...datos })))));
}

// Solo para el modo simulado: el código que en el servidor real aparece en el
// registro de ejecución de Apps Script.
export const codigoInstalacionSimulado = () => estado().props.CODIGO_INSTALACION;

export function borrarSimulado() { localStorage.removeItem(CLAVE); }
