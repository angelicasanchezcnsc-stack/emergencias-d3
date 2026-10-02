// Servidor simulado para pruebas: ejecuta el mismo núcleo del servidor real
// (servidor/Nucleo.gs) dentro del navegador y guarda las tablas en localStorage.
// Los datos quedan solo en este equipo y navegador.

const CLAVE = 'd3e-simulado';

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

function guardar(e) { localStorage.setItem(CLAVE, JSON.stringify(e)); }

const adaptador = {
  leer: t => JSON.parse(JSON.stringify(estado().tablas[t] || [])),
  escribir: (t, filas) => { const e = estado(); e.tablas[t] = filas.map(f => ({ ...f })); guardar(e); },
  agregar: (t, fila) => { const e = estado(); (e.tablas[t] = e.tablas[t] || []).push({ ...fila }); guardar(e); },
  prop: n => estado().props[n],
  uuid: () => crypto.randomUUID(),
  ahora: () => Date.now(),
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

export default async function llamarSimulado(accion, datos) {
  const n = await cargarNucleo();
  // Copia profunda: simula el viaje por la red.
  return JSON.parse(JSON.stringify(n.procesar(JSON.parse(JSON.stringify({ accion, ...datos })))));
}

// Solo para el modo simulado: el código que en el servidor real aparece en el
// registro de ejecución de Apps Script.
export const codigoInstalacionSimulado = () => estado().props.CODIGO_INSTALACION;

export function borrarSimulado() { localStorage.removeItem(CLAVE); }
