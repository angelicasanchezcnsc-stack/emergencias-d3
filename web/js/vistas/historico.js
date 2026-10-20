// Histórico de emergencias y simulacros: totales y tiempos por piso, sin nombres.
// El informe sigue la estructura del modelo de simulacro del plan del edificio (Anexo 7).
import { CONFIG } from '../../config.js';
import * as almacen from '../almacen.js';
import * as emergencia from '../emergencia.js';
import * as sesion from '../sesion.js';
import { llamar } from '../api.js';
import { esc, icono, insignia, aviso } from '../ui.js';
import { armarActa, htmlActa, imprimirActa } from './acta.js';
import { fechaLegible, horaLegible, horaBogota, fechaBogota } from '../tiempo.js';
import { enSedeDe } from '../presencia.js';

const { TIPOS } = emergencia;
const hora = ms => ms ? horaLegible(horaBogota(new Date(ms))) : '—';
const fecha = ms => fechaLegible(fechaBogota(new Date(ms)));
const dur = ms => (ms === null || ms === undefined) ? '—' : emergencia.transcurrido(0, ms);
const desde = (ms, inicio) => (ms ? '+' + dur(ms - inicio) : '—');
const nombreEvento = e => (e.simulacro ? 'Simulacro' : 'Emergencia real');

async function cargar() {
  try {
    const r = await llamar('historial');
    await almacen.guardar('historial', r.emergencias);
    return { lista: r.emergencias, copia: false };
  } catch {
    return { lista: (await almacen.leer('historial')) || [], copia: true };
  }
}

// Hitos del modelo de informe: activación, primera y última salida, llegadas al punto y cierre.
function hitos(e) {
  const r = e.resumen;
  const filas = [
    [e.inicio, e.simulacro ? 'Activación del simulacro' : 'Activación de la emergencia'],
    [r.hitos.primeraSalida, 'Sale la primera persona del edificio'],
    [r.hitos.primeraLlegada, 'Llega la primera persona al punto de encuentro'],
    [r.hitos.ultimaSalida, 'Sale la última persona registrada'],
    [r.hitos.ultimaLlegada, 'Última llegada registrada en el punto de encuentro (reunión general)'],
    [e.cierre, e.simulacro ? 'Fin del simulacro' : 'Cierre de la emergencia']
  ];
  for (const p of r.pisos) {
    if (p.completo && p.tEvacuacionMs !== null) filas.push([e.inicio + p.tEvacuacionMs, `Piso ${p.piso}: todas las personas evacuadas`]);
  }
  return filas.filter(f => f[0]).sort((a, b) => a[0] - b[0]);
}

function cuerpoInforme(e) {
  const r = e.resumen;
  const t = r.total;
  // El porcentaje se calcula sobre quienes sí estaban: las previstas menos las marcadas «No estaba hoy».
  const enSede = enSedeDe(t);
  const pct = enSede ? Math.round((t.evacuados / enSede) * 100) : 0;
  return `
    <table class="tabla-ficha"><tbody>
      <tr><th>Fecha</th><td>${esc(fecha(e.inicio))}</td><th>Hora de inicio</th><td>${esc(hora(e.inicio))}</td></tr>
      <tr><th>Evento</th><td>${esc(nombreEvento(e))}, ${esc(TIPOS[e.tipo] || e.tipo)}</td><th>Duración total</th><td>${esc(dur(r.duracionMs))}</td></tr>
      <tr><th>Personas previstas al activar</th><td>${t.esperados}${t.porVerificar ? ` (+${t.porVerificar} por verificar)` : ''}</td><th>Evacuadas</th><td>${t.evacuados} de ${enSede} en la sede (${pct} %)</td></tr>
      <tr><th>Llegaron al punto de encuentro</th><td>${t.llegaron}</td><th>No ubicadas</th><td>${t.noUbicados}</td></tr>
      <tr><th>Requirieron apoyo</th><td>${t.apoyo}</td><th>Con asistencia por discapacidad</th><td>${t.asistencia}</td></tr>
      <tr><th>No estaban</th><td colspan="3">${t.noEstaban || 0} <span class="sutil">(previstas que ese día no estaban en la sede)</span></td></tr>
      ${e.descripcion ? `<tr><th>Detalle</th><td colspan="3">${esc(e.descripcion)}</td></tr>` : ''}
    </tbody></table>

    <h2>Línea de tiempo</h2>
    <table><thead><tr><th>Actividad</th><th>Hora</th><th>Tiempo desde la activación</th></tr></thead>
      <tbody>${hitos(e).map(([ms, texto]) => `<tr><td>${esc(texto)}</td><td>${esc(hora(ms))}</td><td class="mono">${esc(desde(ms, e.inicio))}</td></tr>`).join('')}</tbody></table>

    <h2>Tiempos y resultados por piso</h2>
    <table class="tablero"><thead><tr><th>Piso</th><th>En la sede</th><th>Evacuados</th><th>Llegaron al punto</th><th>No ubicados</th><th>Apoyo</th><th>Tiempo hasta evacuar todo el piso</th><th>Última llegada al punto</th></tr></thead>
      <tbody>${r.pisos.map(p => `<tr><td><strong>Piso ${p.piso}</strong></td><td>${p.esperados}${p.porVerificar ? ` +${p.porVerificar}` : ''}</td>
        <td>${p.evacuados}${p.porConteo ? ' (conteo)' : ''}</td><td>${p.llegaron}</td><td>${p.noUbicados}</td><td>${p.apoyo}</td>
        <td class="mono">${p.completo ? esc(dur(p.tEvacuacionMs)) : p.esperados ? 'No se completó' : '—'}</td>
        <td class="mono">${esc(p.ultimaLlegada ? desde(p.ultimaLlegada, e.inicio) : '—')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td><strong>Total</strong></td><td>${t.esperados}</td><td>${t.evacuados}</td><td>${t.llegaron}</td><td>${t.noUbicados}</td><td>${t.apoyo}</td><td></td><td></td></tr></tfoot></table>

    <h2>Observaciones</h2>
    <p>${r.observaciones ? esc(r.observaciones) : '<span class="sutil">Sin observaciones.</span>'}</p>
    <p class="aviso-datos">Los tiempos salen de la hora de los celulares de quienes reportaron y pueden diferir unos segundos. «No ubicados» y «apoyo» son cifras: el informe no lleva nombres (Ley 1581 de 2012). El acta nominal, con nombres, la abre solo la coordinación.</p>`;
}

// Plazos de conservación del detalle por persona (Configuración), para los textos de la pantalla.
function plazos() {
  const c = (sesion.base() && sesion.base().config) || {};
  return { sim: c.diasDetalleSimulacro || 90, real: c.diasDetalleEmergencia || 365 };
}
export function textoConservacion() {
  const { sim, real } = plazos();
  return `El detalle por persona lo conserva el servidor durante ${sim} días (simulacros) o ${real} días (emergencias) y solo lo abre la coordinación; cada consulta queda registrada.`;
}

// Acta nominal bajo el informe (v0.13): se pide al servidor cada vez y no se guarda en el celular.
function enlazarActa(vista, e) {
  const boton = vista.querySelector('#ver-acta');
  if (!boton) return;
  const caja = vista.querySelector('#acta-nominal');
  let acta = null, ev = null;
  boton.addEventListener('click', async () => {
    if (!navigator.onLine) { aviso('El acta nominal solo se abre con internet.', 'advertencia'); return; }
    boton.disabled = true;
    try {
      const r = await emergencia.detalle(e.id);
      ev = r.emergencia;
      acta = armarActa({ emergencia: r.emergencia, marcas: r.marcas, conteos: r.conteos });
      caja.innerHTML = `${htmlActa(acta, ev)}
        <div class="fila no-imprimir"><button class="btn btn-oscuro btn-chico" id="imprimir-acta">${icono('imprimir', 'ic-s')}Imprimir acta</button></div>`;
      caja.classList.remove('oculto');
      caja.querySelector('#imprimir-acta').addEventListener('click', () => imprimirActa(acta, ev));
      boton.classList.add('oculto');
      caja.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      boton.disabled = false;
      if (err.codigo === 'VENCIDO') { boton.classList.add('oculto'); aviso(err.message, 'info'); }
      else aviso(err.codigo === 'RED' ? 'El acta nominal solo se abre con internet.' : err.message, 'error');
    }
  });
}

function imprimirInforme(e) {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="censo-impreso">
      <h1>${esc(CONFIG.APP_NOMBRE)}: informe de ${e.simulacro ? 'simulacro' : 'emergencia'}</h1>
      <p>Despacho 3, sede Calle 96 · generado el ${esc(fecha(Date.now()))} a las ${esc(hora(Date.now()))}</p>
      ${cuerpoInforme(e)}
    </div>`);
  document.body.classList.add('censo-activo');
  addEventListener('afterprint', () => { document.getElementById('censo-impreso')?.remove(); document.body.classList.remove('censo-activo'); }, { once: true });
  setTimeout(() => print(), 50);
}

function idSolicitado() {
  const q = location.hash.split('?')[1] || '';
  return new URLSearchParams(q).get('id');
}

export async function vistaHistorico(vista) {
  vista.innerHTML = '<div class="titulo-vista"><h2>Histórico</h2></div><p class="sutil">Cargando…</p>';
  const { lista, copia } = await cargar();
  const id = idSolicitado();
  const e = id && lista.find(x => x.id === id);

  if (e && e.resumen) {
    vista.innerHTML = `
      <div class="titulo-vista fila entre">
        <div><h2>Informe de ${e.simulacro ? 'simulacro' : 'emergencia'}</h2><p class="sutil">${esc(fecha(e.inicio))} · ${esc(TIPOS[e.tipo] || e.tipo)} ${insignia(nombreEvento(e), e.simulacro ? 'amarillo' : 'rojo')}</p></div>
        <div class="fila no-imprimir">
          <a class="btn btn-secundario btn-chico" href="#/historico">${icono('libro', 'ic-s')}Volver al histórico</a>
          <button class="btn btn-primario btn-chico" id="imprimir">${icono('imprimir', 'ic-s')}Imprimir o guardar PDF</button>
          ${e.detalleDisponible ? `<button class="btn btn-oscuro btn-chico" id="ver-acta">${icono('personas', 'ic-s')}Acta nominal</button>` : ''}
        </div>
      </div>
      ${copia ? `<div class="nota nota-adv">${icono('sinWifi')}<span>Sin conexión: se muestra la última copia guardada en este celular.</span></div>` : ''}
      <section class="tarjeta informe">${cuerpoInforme(e)}</section>
      <section class="tarjeta informe oculto" id="acta-nominal" aria-live="polite"></section>`;
    vista.querySelector('#imprimir').addEventListener('click', () => imprimirInforme(e));
    enlazarActa(vista, e);
    return;
  }

  vista.innerHTML = `
    <div class="titulo-vista"><h2>Histórico de simulacros y emergencias</h2>
      <p class="sutil">Totales y tiempos por piso, sin nombres.${lista.some(x => x.detalleDisponible) ? ' La coordinación puede abrir el acta nominal de cada informe.' : ''}</p></div>
    ${copia ? `<div class="nota nota-adv">${icono('sinWifi')}<span>Sin conexión: se muestra la última copia guardada en este celular.</span></div>` : ''}
    ${id && !e ? `<div class="nota nota-adv">${icono('info')}<span>No se encontró ese informe.</span></div>` : ''}
    ${lista.length ? `<div class="tabla-caja"><table>
      <thead><tr><th>Fecha</th><th>Evento</th><th>Tipo</th><th>Inicio</th><th>Duración</th><th>Evacuados</th><th>No ubicados</th><th></th></tr></thead>
      <tbody>${lista.map(x => {
        const t = x.resumen && x.resumen.total;
        return `<tr><td>${esc(fecha(x.inicio))}</td><td>${insignia(nombreEvento(x), x.simulacro ? 'amarillo' : 'rojo')}</td><td>${esc(TIPOS[x.tipo] || x.tipo)}</td>
          <td>${esc(hora(x.inicio))}</td><td class="mono">${esc(dur(x.resumen && x.resumen.duracionMs))}</td>
          <td>${t ? `${t.evacuados} de ${enSedeDe(t)}` : '—'}</td><td>${t ? t.noUbicados : '—'}</td>
          <td><a class="btn btn-secundario btn-chico" href="#/historico?id=${encodeURIComponent(x.id)}">Ver informe</a></td></tr>`;
      }).join('')}</tbody></table></div>`
      : `<div class="nota nota-info">${icono('info')}<span>Todavía no hay simulacros ni emergencias cerradas. Cuando cierre una, su informe aparecerá aquí.</span></div>`}
    <p class="ayuda" style="margin-top:1rem">Se guardan los últimos 100 eventos. ${esc(textoConservacion())}</p>`;
}
