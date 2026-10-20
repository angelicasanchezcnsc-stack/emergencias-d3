// Única puerta de comunicación con el servidor. Para migrar a otro servidor,
// se cambia CONFIG.URL_SERVIDOR o se agrega aquí un nuevo modo.
import { CONFIG } from '../config.js';

export class ErrorApi extends Error {
  constructor(mensaje, codigo) { super(mensaje); this.codigo = codigo; }
}

let token = null;
export const fijarToken = t => { token = t; };

const esperar = ms => new Promise(r => setTimeout(r, ms));

// Google a veces ejecuta la acción pero pierde la respuesta (error 404, una página en vez
// de datos o la respuesta de la consulta simple). En esos casos se reintenta con el mismo
// idPeticion: el servidor devuelve la respuesta que ya tenía, sin repetir la acción.
async function remoto(accion, datos) {
  if (!CONFIG.URL_SERVIDOR) throw new ErrorApi('Falta configurar la dirección del servidor (config.js).', 'CONFIG');
  const cuerpo = JSON.stringify({ accion, ...datos, idPeticion: crypto.randomUUID() });
  const pausas = [700, 1500, 3000];
  for (let intento = 0; ; intento++) {
    let r;
    try {
      // text/plain evita la verificación previa de CORS, que Apps Script no admite.
      r = await fetch(CONFIG.URL_SERVIDOR, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo });
    } catch {
      throw new ErrorApi('Sin conexión con el servidor.', 'RED');
    }
    let res = null;
    if (r.ok) { try { res = await r.json(); } catch { res = null; } }
    // La respuesta de la consulta simple (doGet) significa que Google perdió la de esta acción.
    const perdida = !res || (res.ok && res.datos && res.datos.servicio && !('inicializado' in res.datos));
    if (!perdida) return res;
    // 429 (demasiadas peticiones) o 5xx: Google está ocupado. Se reintenta con las mismas pausas y, si sigue
    // así, se avisa «ocupado» (hay conexión: no se marca el servidor como caído).
    const ocupado = r.status === 429 || r.status >= 500;
    if (intento >= pausas.length) {
      if (ocupado) throw new ErrorApi('El servidor está ocupado. Intente de nuevo en unos segundos.', 'OCUPADO');
      throw new ErrorApi(r.ok ? 'El servidor no respondió como se esperaba. Intente de nuevo en unos segundos.'
        : 'El servidor respondió con un error (' + r.status + '). Intente de nuevo en unos segundos.', 'RED');
    }
    await esperar(pausas[intento]);
  }
}

let simulado;
async function transporte() {
  if (CONFIG.MODO_SERVIDOR !== 'simulado') return remoto;
  if (!simulado) simulado = (await import('./servidor-simulado.js')).default;
  return simulado;
}

// Avisa a la interfaz si el servidor responde o no (el celular puede tener
// internet y aun así no alcanzar el servidor).
let servidorResponde = true;
function marcarServidor(responde) {
  if (responde === servidorResponde) return;
  servidorResponde = responde;
  dispatchEvent(new CustomEvent('estado-servidor', { detail: responde }));
}
export const servidorDisponible = () => servidorResponde;

// Consultas que la app hace sola en segundo plano: no muestran el aviso «Actualizando…».
const SILENCIOSAS = new Set(['pulso', 'apoyos', 'reenvolver', 'bajarArchivo', 'novedades']);
let enCurso = 0;
const avisarActividad = () => dispatchEvent(new CustomEvent('actividad-servidor', { detail: enCurso }));

export async function llamar(accion, datos = {}) {
  const enviar = await transporte();
  const visible = !SILENCIOSAS.has(accion);
  if (visible) { enCurso++; avisarActividad(); }
  let res;
  try {
    res = await enviar(accion, token ? { ...datos, token } : datos);
    marcarServidor(true);
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === 'RED') marcarServidor(false);
    throw e;
  } finally {
    if (visible) { enCurso--; avisarActividad(); }
  }
  if (!res.ok) throw new ErrorApi(res.error, res.codigo);
  return res.datos;
}
