// Regla de presencia: ¿dónde se considera que está una persona en una fecha?
// Es la MISMA regla del servidor (presenciaDe en servidor/Nucleo.gs). Si cambia una, debe
// cambiar la otra igual: el banco de pruebas (herramientas/pruebas-nucleo.html) compara ambas.
import * as sesion from './sesion.js';
import { fechaBogota } from './tiempo.js';

// Día de la semana ISO de 'AAAA-MM-DD' (1 = lunes ... 7 = domingo), sin usar la zona del dispositivo.
export function diaISO(fecha) {
  const p = String(fecha).split('-');
  const d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
  return d === 0 ? 7 : d;
}

// persona: { codigo, piso, puesto, agenda } · novedades: todas (se filtran aquí) · festivos: ['AAAA-MM-DD']
// devuelve { presente, piso, puesto, otroLugar, motivo }
// motivo: agenda | novedad-asiste | novedad-otro-lugar | novedad-no-asiste | fuera-de-agenda | festivo
export function presenciaDe(persona, fecha, novedades, festivos) {
  const piso = Number(persona.piso) || 0;
  const puesto = Number(persona.puesto) || 0;
  let n = null;
  (novedades || []).forEach(x => {
    if (x.codigo !== persona.codigo || !(x.desde <= fecha && fecha <= x.hasta)) return;
    if (!n || String(x.actualizado) > String(n.actualizado)) n = x;
  });
  if (n && n.tipo === 'no_asiste') return { presente: false, piso, puesto, otroLugar: false, motivo: 'novedad-no-asiste' };
  if (n && n.tipo === 'otro_lugar') return { presente: true, piso: Number(n.piso) || 0, puesto: Number(n.puesto) || 0, otroLugar: true, motivo: 'novedad-otro-lugar' };
  if (n && n.tipo === 'asiste') return { presente: true, piso, puesto, otroLugar: false, motivo: 'novedad-asiste' };
  if ((festivos || []).indexOf(fecha) >= 0) return { presente: false, piso, puesto, otroLugar: false, motivo: 'festivo' };
  const agenda = String(persona.agenda === undefined || persona.agenda === null ? '' : persona.agenda).trim();
  const dias = agenda === '' ? [1, 2, 3, 4, 5] : agenda === 'ocasional' ? [] : agenda.split(',').map(Number);
  if (dias.indexOf(diaISO(fecha)) >= 0) return { presente: true, piso, puesto, otroLugar: false, motivo: 'agenda' };
  return { presente: false, piso, puesto, otroLugar: false, motivo: 'fuera-de-agenda' };
}

// Foto de quién se espera por piso en una fecha (misma regla que fotoEsperados del servidor):
// { [piso]: { en: [códigos], sin: [] } }. Solo cuenta a las personas activas.
export function fotoEsperadosDe(personas, fecha, novedades, festivos) {
  const foto = {};
  for (const p of (personas || []).filter(x => x.estado === 'activo')) {
    const r = presenciaDe(p, fecha, novedades, festivos);
    if (!r.presente) continue;
    (foto[r.piso] = foto[r.piso] || { en: [], sin: [] }).en.push(p.codigo);
  }
  return foto;
}

// Personas que sí estaban en la sede: las previstas menos las marcadas «No estaba hoy» en la emergencia.
// Es el total para los porcentajes y el «X de N» del tablero, el punto de encuentro y el informe.
// Sirve con cifras de un piso o con el total, y con informes anteriores que no traen noEstaban.
export const enSedeDe = cifras =>
  Math.max(0, (Number(cifras && cifras.esperados) || 0) - (Number(cifras && cifras.noEstaban) || 0));

// Presencia de una persona hoy, con la base de la sesión (novedades y festivos).
export function ubicacionHoy(persona) {
  const base = sesion.base() || {};
  return presenciaDe(persona, fechaBogota(), base.novedades || [], (base.config && base.config.festivos) || []);
}
