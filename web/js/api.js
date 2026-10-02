// Única puerta de comunicación con el servidor. Para migrar a otro servidor,
// se cambia CONFIG.URL_SERVIDOR o se agrega aquí un nuevo modo.
import { CONFIG } from '../config.js';

export class ErrorApi extends Error {
  constructor(mensaje, codigo) { super(mensaje); this.codigo = codigo; }
}

let token = null;
export const fijarToken = t => { token = t; };

async function remoto(accion, datos) {
  if (!CONFIG.URL_SERVIDOR) throw new ErrorApi('Falta configurar la dirección del servidor (config.js).', 'CONFIG');
  let r;
  try {
    // text/plain evita la verificación previa de CORS, que Apps Script no admite.
    r = await fetch(CONFIG.URL_SERVIDOR, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, ...datos })
    });
  } catch {
    throw new ErrorApi('Sin conexión con el servidor.', 'RED');
  }
  if (!r.ok) throw new ErrorApi('El servidor respondió con un error (' + r.status + ').', 'RED');
  return r.json();
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

export async function llamar(accion, datos = {}) {
  const enviar = await transporte();
  let res;
  try {
    res = await enviar(accion, token ? { ...datos, token } : datos);
    marcarServidor(true);
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === 'RED') marcarServidor(false);
    throw e;
  }
  if (!res.ok) throw new ErrorApi(res.error, res.codigo);
  return res.datos;
}
