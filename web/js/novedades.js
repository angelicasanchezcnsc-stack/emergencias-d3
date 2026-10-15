// Novedades de presencia: quién no asiste, está en otro lugar o asiste fuera de su agenda,
// por rango de fechas y sin motivo. Son planeación, no emergencia: requieren conexión y no se
// encolan. La lista vigente viaja dentro de la base de la sesión (sesion.base().novedades).
import * as sesion from './sesion.js';
import { llamar, ErrorApi } from './api.js';
import { fechaBogota } from './tiempo.js';

const avisar = () => dispatchEvent(new CustomEvent('novedades-cambio'));

// Novedades que aún no vencen. La copia guardada en el celular puede traer alguna ya vencida.
export const vigentes = () => {
  const b = sesion.base();
  const hoy = fechaBogota();
  return ((b && b.novedades) || []).filter(n => n.hasta >= hoy);
};

export const dePersona = codigo => vigentes().filter(n => n.codigo === codigo)
  .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));

async function adoptar(lista) {
  const b = sesion.base();
  if (!b) return;
  b.novedades = lista;
  await sesion.guardarBase();
  avisar();
}

// Trae del servidor las novedades vigentes. Devuelve false si no hay conexión.
export async function actualizar() {
  try {
    const r = await llamar('novedades');
    await adoptar(r.novedades);
    return true;
  } catch {
    return false;
  }
}

const sinInternet = e => (e instanceof ErrorApi && e.codigo === 'RED'
  ? new ErrorApi('Para registrar novedades se necesita internet.', 'RED') : e);

// Crea o edita (si trae id) una novedad. Devuelve la novedad guardada.
export async function guardar(novedad) {
  try {
    const r = await llamar('guardarNovedad', novedad);
    await adoptar(r.novedades);
    return r.novedad;
  } catch (e) {
    throw sinInternet(e);
  }
}

export async function quitar(id) {
  try {
    const r = await llamar('quitarNovedad', { id });
    await adoptar(r.novedades);
  } catch (e) {
    throw sinInternet(e);
  }
}
