// Acta nominal de una emergencia o un simulacro (v0.13): por piso, quiénes llegaron al punto de encuentro,
// quiénes no llegaron y quiénes no estaban en la sede, con horas y quién registró. Sirve durante la
// emergencia (con el estado del celular) y después del cierre (con detalleEmergencia, solo la coordinación).
// El acta se arma en pantalla y se imprime: no se guarda en el celular.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as emergencia from '../emergencia.js';
import * as carac from '../caracterizacion.js';
import { esc } from '../ui.js';
import { fechaLegible, horaLegible, horaBogota, fechaBogota } from '../tiempo.js';

const ESTADO_PISO = { evacuado: 'Evacuado', no_ubicado: 'No ubicado', apoyo: 'Requiere apoyo', no_estaba: 'No estaba en la sede' };
const hora = ms => (ms ? horaLegible(horaBogota(new Date(ms))) : '');
const fecha = ms => fechaLegible(fechaBogota(new Date(ms)));
const LEYENDA = 'Documento con datos personales, solo para la atención y el seguimiento de la emergencia (Ley 1581 de 2012). Custodia: coordinación de emergencias del Despacho.';

// Puesto de la persona: durante la emergencia, donde se le esperaba hoy; después, su puesto habitual.
function puesto(codigo, activa) {
  if (activa) return emergencia.puestoDe(codigo).puesto;
  const p = ((sesion.base() && sesion.base().personas) || []).find(x => x.codigo === codigo);
  return p ? p.puesto : null;
}

function fila(x, activa) {
  const m = x.marca || {};
  const ap = activa ? carac.apoyoDe(x.codigo) : null;
  const horaEstado = m.momentoEstado ? hora(m.momentoEstado) : m.actualizado ? hora(Date.parse(m.actualizado)) : '';
  return {
    codigo: x.codigo,
    nombre: sesion.nombreDe(x.codigo),
    puesto: puesto(x.codigo, activa),
    estadoPiso: m.estado ? ESTADO_PISO[m.estado] || m.estado : x.grupo === 'sin' ? 'Por verificar' : 'Sin reporte',
    horaEstado: m.estado ? horaEstado : '',
    horaLlegada: m.llegada ? horaLegible(m.llegada) : '',
    registro: m.reportadoPor ? (m.reportadoPor === x.codigo ? 'La persona' : sesion.nombreDe(m.reportadoPor)) : '',
    asistencia: !!m.asistencia,
    apoyo: ap && ap.apoyo !== 'ninguno' ? carac.etiqueta(carac.APOYOS, ap.apoyo) + (ap.detalle ? ' (' + ap.detalle + ')' : '') : ''
  };
}

const porPuesto = (a, b) => (a.puesto || 999) - (b.puesto || 999) || a.nombre.localeCompare(b.nombre, 'es');

// est = { emergencia, marcas, conteos }, activa o cerrada. Devuelve { pisos: [{ piso, llegaron, noLlegaron,
// noEstaban, conteo }], total }.
export function armarActa(est) {
  const r = emergencia.resumen(est);
  if (!r) return { pisos: [], total: { llegaron: 0, noLlegaron: 0, noEstaban: 0 } };
  const activa = est.emergencia.estado === 'activa';
  const faltan = emergencia.ausentes(est);
  const pisos = r.filas.map(f => {
    const llegaron = f.miembros.filter(x => x.marca && x.marca.llegada).map(x => fila(x, activa)).sort(porPuesto);
    const noLlegaron = faltan.filter(x => x.piso === f.piso).map(x => fila(x, activa)).sort(porPuesto);
    const noEstaban = f.miembros.filter(x => x.marca && x.marca.estado === 'no_estaba' && !x.marca.llegada).map(x => fila(x, activa)).sort(porPuesto);
    return { piso: f.piso, llegaron, noLlegaron, noEstaban, conteo: f.conteo };
  }).filter(p => p.llegaron.length || p.noLlegaron.length || p.noEstaban.length || p.conteo);
  const suma = k => pisos.reduce((s, p) => s + p[k].length, 0);
  return { pisos, total: { llegaron: suma('llegaron'), noLlegaron: suma('noLlegaron'), noEstaban: suma('noEstaban') } };
}

function tabla(titulo, filas, conLlegada) {
  if (!filas.length) return `<h4>${esc(titulo)} (0)</h4><p class="sutil">Nadie.</p>`;
  return `<h4>${esc(titulo)} (${filas.length})</h4>
    <div class="tabla-caja"><table class="tabla-acta"><thead><tr><th>Nombre</th><th>Puesto</th><th>Estado en el piso</th><th>Hora</th>${conLlegada ? '<th>Llegó</th>' : ''}<th>Registró</th></tr></thead>
    <tbody>${filas.map(x => `<tr><td><strong>${esc(x.nombre)}</strong>${x.asistencia ? '<br><span class="sutil">Persona con discapacidad que necesita asistencia</span>' : ''}${x.apoyo ? `<br><span class="sutil">Necesita apoyo: ${esc(x.apoyo)}</span>` : ''}</td>
      <td>${x.puesto ? esc(x.puesto) : '—'}</td><td>${esc(x.estadoPiso)}</td><td>${esc(x.horaEstado || '—')}</td>${conLlegada ? `<td>${esc(x.horaLlegada || '—')}</td>` : ''}<td>${esc(x.registro || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

export function htmlActa(acta, e, { titulo = 'Acta nominal' } = {}) {
  const tipo = `${e.simulacro ? 'Simulacro' : 'Emergencia real'}: ${emergencia.TIPOS[e.tipo] || e.tipo}`;
  const cierre = e.cierre ? ` · cierre a las ${esc(hora(e.cierre))}` : ' · en curso';
  return `
    <div class="acta">
      <h3>${esc(titulo)}</h3>
      <p>${esc(tipo)} · ${esc(fecha(e.inicio))} · inicio a las ${esc(hora(e.inicio))}${cierre} · generada el ${esc(fecha(Date.now()))} a las ${esc(hora(Date.now()))}</p>
      <p><strong>Llegaron al punto:</strong> ${acta.total.llegaron} · <strong>No llegaron:</strong> ${acta.total.noLlegaron} · <strong>No estaban en la sede:</strong> ${acta.total.noEstaban}</p>
      ${acta.pisos.map(p => `
        <section class="acta-piso">
          <h3>Piso ${p.piso}</h3>
          ${p.conteo ? `<p class="sutil">Este piso se reportó también por conteo: ${p.conteo.evacuados} evacuados, ${p.conteo.noUbicados} no ubicados y ${p.conteo.apoyo} con apoyo (el conteo no trae nombres).</p>` : ''}
          ${tabla('No llegaron al punto de encuentro', p.noLlegaron, false)}
          ${tabla('Llegaron al punto de encuentro', p.llegaron, true)}
          ${tabla('No estaban en la sede', p.noEstaban, false)}
        </section>`).join('') || '<p class="sutil">No hay personas en esta emergencia.</p>'}
      <p class="aviso-datos">${esc(LEYENDA)}</p>
    </div>`;
}

export function imprimirActa(acta, e) {
  document.getElementById('censo-impreso')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="censo-impreso">
      <h1>${esc(CONFIG.APP_NOMBRE)}: acta nominal del ${e.simulacro ? 'simulacro' : 'evento'}</h1>
      <p>Despacho 3, sede Calle 96</p>
      ${htmlActa(acta, e, { titulo: 'Acta nominal' })}
    </div>`);
  document.body.classList.add('censo-activo');
  addEventListener('afterprint', () => { document.getElementById('censo-impreso')?.remove(); document.body.classList.remove('censo-activo'); }, { once: true });
  setTimeout(() => print(), 50);
}

// Texto plano para copiar en un mensaje o leer por teléfono.
export function textoActa(acta, e) {
  const linea = x => `${x.nombre}${x.puesto ? ', puesto ' + x.puesto : ''} · ${x.estadoPiso}${x.horaEstado ? ' ' + x.horaEstado : ''}` +
    `${x.horaLlegada ? ' · llegó ' + x.horaLlegada : ''}${x.registro ? ' · registró ' + x.registro : ''}${x.asistencia ? ' · ASISTENCIA POR DISCAPACIDAD' : ''}${x.apoyo ? ' · NECESITA APOYO: ' + x.apoyo : ''}`;
  const lista = (t, filas) => `${t} (${filas.length})${filas.length ? '\n' + filas.map((x, i) => `  ${i + 1}. ${linea(x)}`).join('\n') : ': nadie'}`;
  return `${CONFIG.APP_NOMBRE}: acta nominal (${hora(Date.now())})\n` +
    `${e.simulacro ? 'SIMULACRO' : 'EMERGENCIA'}: ${emergencia.TIPOS[e.tipo] || e.tipo}. Despacho 3, sede Calle 96. Inicio ${hora(e.inicio)}.\n` +
    `Llegaron: ${acta.total.llegaron} · No llegaron: ${acta.total.noLlegaron} · No estaban: ${acta.total.noEstaban}\n\n` +
    acta.pisos.map(p => `PISO ${p.piso}\n${lista('No llegaron', p.noLlegaron)}\n${lista('Llegaron', p.llegaron)}\n${lista('No estaban', p.noEstaban)}`).join('\n\n') +
    `\n\n${LEYENDA}`;
}
