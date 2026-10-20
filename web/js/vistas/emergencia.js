// Emergencia: activar o simular, reporte propio, reporte de brigadistas (por
// persona o por conteo), tablero consolidado por piso y cierre.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as emergencia from '../emergencia.js';
import * as carac from '../caracterizacion.js';
import * as contacto from '../contacto-emergencia.js';
import { fichaContacto } from './ventana-contacto.js';
import { esc, icono, aviso, insignia, confirmar, modal } from '../ui.js';
import { horaLegible, horaBogota } from '../tiempo.js';
import { enSedeDe, ubicacionHoy } from '../presencia.js';
import { mapaPiso, iniciales, rotulo } from '../mapa-piso.js';

const { TIPOS, PROTOCOLO, ROLES_ACTIVAR, ROLES_SIMULACRO_INICIAR, ROLES_CERRAR, ROLES_REPORTAR, tiene } = emergencia;

const ESTADO = {
  evacuado: ['Evacuado', 'verde'],
  no_ubicado: ['No ubicado', 'rojo'],
  apoyo: ['Requiere apoyo', 'ambar'],
  no_estaba: ['No estaba hoy', 'gris']
};
const hora = ms => horaLegible(horaBogota(new Date(ms)));
const CLAVE_VISTA_EMERGENCIA = 'd3e-vista-emergencia';
const leerVistaReporte = () => { try { return localStorage.getItem(CLAVE_VISTA_EMERGENCIA) === 'mapa' ? 'mapa' : 'lista'; } catch (e) { return 'lista'; } };
const guardarVistaReporte = v => { try { localStorage.setItem(CLAVE_VISTA_EMERGENCIA, v); } catch (e) { /* no se recuerda */ } };
// Clase del mapa según la marca de la emergencia; si hay varias personas en el puesto manda la más urgente.
const CLASE_MARCA = { evacuado: 'evacuado', no_ubicado: 'no-ubicado', apoyo: 'apoyo', no_estaba: 'no-estaba', '': 'sin-marcar' };
const URGENCIA = ['no_ubicado', 'apoyo', '', 'evacuado', 'no_estaba'];
const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function insigniaMarca(m) {
  if (!m || !m.estado) return insignia('Sin marcar', 'gris');
  // Si llega un estado que esta versión no conoce (versiones mezcladas), se muestra tal cual.
  const [t, tono] = ESTADO[m.estado] || [m.estado, 'gris'];
  return insignia(t, tono) + (m.llegada ? ' ' + insignia('Llegó ' + horaLegible(m.llegada), 'verde') : '');
}

// Apoyo que la persona registró en su caracterización (solo lo ven brigadistas de su piso,
// la coordinación y su acompañante, y solo mientras hay una emergencia o simulacro).
function textoApoyo(codigo) {
  const ap = carac.apoyoDe(codigo);
  if (!ap || ap.apoyo === 'ninguno') return '';
  return `${carac.etiqueta(carac.APOYOS, ap.apoyo)}${ap.detalle ? ': ' + ap.detalle : ''}${ap.acompanante ? ' · lo acompaña ' + sesion.nombreDe(ap.acompanante) : ''}`;
}

function chipApoyo(codigo) {
  const t = textoApoyo(codigo);
  return t ? `<span class="chip-apoyo">${icono('alerta', 'ic-s')}<span>Necesita apoyo: ${esc(t)}</span></span>` : '';
}

// Contacto de emergencia de la persona, plegado (lo reciben la coordinación y los brigadistas de su piso; la
// EPS y la ARL, solo durante la emergencia). Se recuerda cuáles están abiertos para que no se cierren al repintar.
const contactosAbiertos = new Set();
function detalleContacto(codigo) {
  const c = contacto.contactoDe(codigo);
  if (!c || !c.abierto) return '';
  return `<details class="detalle-contacto" data-contacto-de="${esc(codigo)}" ${contactosAbiertos.has(codigo) ? 'open' : ''}>
    <summary>${icono('telefono', 'ic-s')}Contacto de emergencia</summary>${fichaContacto(c)}</details>`;
}

// Si la marca la puso alguien de la brigada de otro piso, se avisa para que la brigada de este piso lo sepa.
function textoOtraBrigada(m, pisoVista) {
  if (!m || !m.estado || !m.reportadoPor || !pisoVista) return '';
  const autor = ((sesion.base() && sesion.base().personas) || []).find(x => x.codigo === m.reportadoPor);
  return autor && autor.pisoBrigada && autor.pisoBrigada !== pisoVista ? ` · marcado por la brigada del piso ${autor.pisoBrigada}` : '';
}

function filaPersona(codigo, m, extra = '', pisoVista = null) {
  const activo = s => (m && m.estado === s ? 'activo' : '');
  return `<div class="fila-marca" data-codigo="${esc(codigo)}">
    <div class="fila-dia-txt"><strong>${esc(sesion.nombreDe(codigo))}</strong><span class="sutil">${extra}${insigniaMarca(m)}${esc(textoOtraBrigada(m, pisoVista))}</span>${chipApoyo(codigo)}${detalleContacto(codigo)}</div>
    <div class="marca-btns">
      <button class="btn-estado ${activo('evacuado')} e-evacuado" data-estado="evacuado" title="Evacuado">${icono('ok', 'ic-s')}<span>Evacuado</span></button>
      <button class="btn-estado ${activo('no_ubicado')} e-no" data-estado="no_ubicado" title="No ubicado">${icono('alerta', 'ic-s')}<span>No ubicado</span></button>
      <button class="btn-estado ${activo('apoyo')} e-apoyo" data-estado="apoyo" title="Requiere apoyo">${icono('persona', 'ic-s')}<span>Apoyo</span></button>
      <button class="btn-estado ${activo('no_estaba')} e-noestaba" data-estado="no_estaba" title="No estaba hoy en la sede">${icono('cerrar', 'ic-s')}<span>No estaba</span></button>
    </div>
    <label class="casilla casilla-chica"><input type="checkbox" data-asistencia ${m && m.asistencia ? 'checked' : ''}>Persona con discapacidad que necesita asistencia</label>
  </div>`;
}

export function vistaEmergencia(vista) {
  const yo = sesion.perfil();
  let pisoSel = yo.pisoBrigada || (CONFIG.PISOS.includes(yo.piso) ? yo.piso : CONFIG.PISOS[0]);
  let busqueda = '';
  let terminada = null;
  let pendientePintar = false;
  let vistaReporte = leerVistaReporte();

  // ---------- Sin emergencia ----------
  const pintarInactiva = () => {
    const puedeReal = tiene(ROLES_ACTIVAR), puedeSim = tiene(ROLES_SIMULACRO_INICIAR);
    vista.innerHTML = `
      <div class="titulo-vista"><h2>Emergencia</h2><p class="sutil">No hay ninguna emergencia ni simulacro en curso.</p></div>
      ${terminada ? `<div class="nota nota-exito">${icono('ok')}<span>${terminada.simulacro ? 'El simulacro' : 'La emergencia'} de tipo «${esc(TIPOS[terminada.tipo])}» terminó.</span></div>` : ''}
      <div class="nota nota-info">${icono('info')}<span>El aplicativo complementa la alarma del edificio y no la reemplaza. Si detecta una emergencia, dé la alarma, avise a su brigadista y, si es necesario, llame al 123.</span></div>
      <div class="rejilla">
        ${puedeReal ? `<section class="tarjeta">
          <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('alerta')}</div>
            <div><h3>Activar</h3><p class="sutil">Pone el aplicativo en modo emergencia para todo el Despacho</p></div></div>
          <form id="f-activar">
            <div class="campo"><label class="etiqueta" for="tipo">Tipo de evento</label>
              <select id="tipo">${Object.entries(TIPOS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
            <div class="campo"><label class="etiqueta" for="desc">Detalle (opcional)</label><input id="desc" type="text" maxlength="200" placeholder="Ej.: humo en el piso 6" autocomplete="off"></div>
            ${puedeSim ? '<label class="casilla"><input type="checkbox" id="simulacro">Es un simulacro (no es una emergencia real)</label>' : ''}
            <button class="btn btn-peligro btn-ancho btn-grande" type="submit" id="btn-activar">${icono('alerta')}<span>Activar emergencia</span></button>
          </form>
          <p class="ayuda">Los celulares con el aplicativo abierto lo verán en menos de un minuto.</p>
        </section>` : `<section class="tarjeta">
          <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('alerta')}</div><div><h3>¿Detectó una emergencia?</h3></div></div>
          <p>Las emergencias las activan los brigadistas, la coordinación o el administrador. Avíseles de inmediato.</p>
          <div class="fila"><a class="btn btn-peligro" href="tel:123">${icono('telefono', 'ic-s')}Llamar al 123</a><a class="btn btn-secundario" href="#/contactos">Ver contactos</a></div>
        </section>`}
        <section class="tarjeta">
          <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-verde">${icono('ubicacion')}</div><div><h3>Prepárese</h3><p class="sutil">Revise antes de que ocurra</p></div></div>
          <div class="fila"><a class="btn btn-secundario" href="#/rutas">Ruta y punto de encuentro</a><a class="btn btn-secundario" href="#/recomendaciones">Recomendaciones</a>
            ${tiene(ROLES_REPORTAR) ? '<a class="btn btn-secundario" href="#/historico">Histórico de simulacros</a>' : ''}</div>
        </section>
      </div>`;
    const f = vista.querySelector('#f-activar');
    if (!f) return;
    const sim = f.querySelector('#simulacro');
    sim?.addEventListener('change', () => {
      f.querySelector('#btn-activar').className = `btn ${sim.checked ? 'btn-primario' : 'btn-peligro'} btn-ancho btn-grande`;
      f.querySelector('#btn-activar span').textContent = sim.checked ? 'Iniciar simulacro' : 'Activar emergencia';
    });
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const esSim = !!(sim && sim.checked);
      const tipo = f.tipo.value;
      const ok = await confirmar(esSim ? 'Iniciar simulacro' : 'Activar emergencia',
        esSim ? `Se iniciará un <strong>simulacro</strong> de «${esc(TIPOS[tipo])}». No es una emergencia real.`
          : `Se activará una <strong>emergencia real</strong> de «${esc(TIPOS[tipo])}» para todo el Despacho.`,
        esSim ? 'Iniciar simulacro' : 'Activar emergencia', !esSim);
      if (!ok) return;
      try {
        await emergencia.activar(tipo, f.desc.value.trim(), esSim);
        aviso(esSim ? 'Simulacro iniciado.' : 'Emergencia activada.', 'exito');
      } catch (e) {
        if (e.codigo === 'YA_ACTIVA') { await emergencia.traer(); aviso(e.message, 'advertencia'); return; }
        if (e.codigo !== 'RED') { aviso(e.message, 'error'); return; }
        // Sin conexión: se ofrece activarla solo en este celular, con la lista del día guardada.
        const local = await confirmar('Sin conexión',
          'No hay conexión con el servidor. ¿Activar en <strong>este celular</strong> para registrar el piso y el punto de encuentro sin internet? ' +
          'Cuando vuelva la señal se unirá sola a la emergencia del servidor. Dé la alarma también por los medios del edificio.',
          'Activar sin conexión', !esSim);
        if (!local) return;
        await emergencia.activarLocal(tipo, f.desc.value.trim(), esSim);
        aviso('Activada en este celular, sin conexión.', 'advertencia');
      }
    });
  };

  // ---------- Reporte del piso: filas, mapa y hoja de acciones ----------

  // Botones de cada fila de persona (Evacuado, No ubicado, Apoyo, No estaba y la casilla de asistencia). Sirven igual
  // en la lista y en la hoja de acciones del mapa. «marcasDe» entrega las marcas más recientes.
  function enlazarFilas(raiz, marcasDe) {
    raiz.querySelectorAll('.fila-marca').forEach(filaEl => {
      const codigo = filaEl.dataset.codigo;
      filaEl.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', () => {
        const m = marcasDe().get(codigo);
        emergencia.marcarPersona(codigo, { estado: m && m.estado === b.dataset.estado ? '' : b.dataset.estado });
      }));
      filaEl.querySelector('[data-asistencia]').addEventListener('change', ev => emergencia.marcarPersona(codigo, { asistencia: ev.target.checked }));
    });
  }

  // Quién está previsto en cada puesto del piso hoy y cómo se pinta (según la marca de la emergencia).
  function datosDelMapa(fila, marcas) {
    const personas = (sesion.base().personas || []);
    const puestosDelPiso = new Set((sesion.base().puestos || []).filter(x => x.piso === fila.piso).map(x => x.puesto));
    const ocupantes = new Map();
    const sinPuesto = [];
    fila.miembros.forEach(x => {
      const persona = personas.find(p => p.codigo === x.codigo);
      let puesto = null;
      if (persona) {
        const u = ubicacionHoy(persona);
        if (u.presente && u.piso === fila.piso && u.puesto) puesto = u.puesto;
        else if (persona.piso === fila.piso && persona.puesto) puesto = persona.puesto;
      }
      const dato = { codigo: x.codigo, nombre: sesion.nombreDe(x.codigo) };
      if (puesto && puestosDelPiso.has(puesto)) {
        const k = `${fila.piso}-${puesto}`;
        if (!ocupantes.has(k)) ocupantes.set(k, []);
        ocupantes.get(k).push(dato);
      } else sinPuesto.push(dato);
    });
    const estadoDe = (p, gente) => {
      if (!gente.length) return {};
      const estados = gente.map(g => { const m = marcas.get(g.codigo); return m && m.estado ? m.estado : ''; });
      const mandan = URGENCIA.find(u => estados.includes(u));
      const necesitan = gente.filter(g => textoApoyo(g.codigo));
      const mas = gente.length > 1 ? ` +${gente.length - 1}` : '';
      const etiqueta = `${necesitan.length && mandan !== 'apoyo' ? '✚' : ''}${iniciales(gente[0])}${mas}`;
      const texto = gente.map((g, i) => `${g.nombre}: ${estados[i] ? ESTADO[estados[i]]?.[0] || estados[i] : 'sin marcar'}${textoApoyo(g.codigo) ? ', necesita apoyo (' + textoApoyo(g.codigo) + ')' : ''}`).join('; ');
      return { clase: CLASE_MARCA[mandan] || 'sin-marcar', etiqueta, texto };
    };
    return { ocupantes, estadoDe, sinPuesto };
  }

  // Hoja de acciones de un puesto: el nombre y los mismos botones de la fila. Se actualiza sola con cada cambio.
  async function abrirHoja(clavePuesto, titulo, codigos, pisoVista) {
    const marcasAhora = () => { const a = emergencia.actual(); return new Map(((a && a.marcas) || []).map(m => [m.codigo, m])); };
    const cuerpo = () => codigos.map(c => filaPersona(c, marcasAhora().get(c), '', pisoVista)).join('');
    const respuesta = modal({ titulo, cuerpo: `<div id="hoja-cuerpo">${cuerpo()}</div>`, ancho: 'ancho' });
    const fondo = Array.from(document.querySelectorAll('.modal-fondo')).pop();
    const caja = fondo.querySelector('#hoja-cuerpo');
    const pintarHoja = () => {
      const activo = document.activeElement;
      const marca = activo && caja.contains(activo) ? [activo.closest('.fila-marca')?.dataset.codigo, activo.dataset.estado || (activo.hasAttribute('data-asistencia') ? 'asistencia' : '')] : null;
      caja.innerHTML = cuerpo();
      enlazarFilas(caja, marcasAhora);
      if (marca && marca[0]) {
        const fila = Array.from(caja.querySelectorAll('.fila-marca')).find(f => f.dataset.codigo === marca[0]);
        (marca[1] === 'asistencia' ? fila?.querySelector('[data-asistencia]') : fila?.querySelector(`[data-estado="${marca[1]}"]`))?.focus();
      }
    };
    enlazarFilas(caja, marcasAhora);
    addEventListener('emergencia-cambio', pintarHoja);
    await respuesta;
    removeEventListener('emergencia-cambio', pintarHoja);
    // El mapa se repintó con cada cambio: el foco vuelve al puesto tocado.
    if (clavePuesto) vista.querySelector(`[data-mp-puesto="${clavePuesto}"]`)?.focus();
  }

  // ---------- Con emergencia ----------
  const pintarActiva = a => {
    const e = a.emergencia;
    const r = emergencia.resumen(a);
    const reporta = tiene(ROLES_REPORTAR);
    const cierra = tiene(ROLES_CERRAR);
    const marcas = new Map(a.marcas.map(m => [m.codigo, m]));
    const miMarca = marcas.get(yo.codigo);
    const fila = r.filas.find(f => f.piso === pisoSel) || r.filas[0];
    const pendientesEnvio = emergencia.pendientes();
    const apoyo = a.marcas.filter(m => m.estado === 'apoyo' || m.asistencia || m.estado === 'no_ubicado');
    // Quienes registraron antes que necesitan apoyo y aún no han salido, más los marcados en la emergencia.
    const aSalvo = c => { const m = marcas.get(c); return !!(m && (m.estado === 'evacuado' || m.llegada)); };
    const prioridad = [
      ...apoyo.map(m => ({ codigo: m.codigo, m })),
      ...carac.todosLosApoyos().filter(x => x.apoyo !== 'ninguno' && !aSalvo(x.codigo) && !apoyo.some(m => m.codigo === x.codigo))
        .map(x => ({ codigo: x.codigo, m: marcas.get(x.codigo) || null }))
    ];
    // Personas a las que este usuario debe acompañar.
    const aMiCargo = carac.todosLosApoyos().filter(x => x.acompanante === yo.codigo && x.apoyo !== 'ninguno');

    const tablero = `
      <div class="resumen-grande">
        <div><strong>${r.total.evacuados}</strong><span>evacuados de ${enSedeDe(r.total)} en la sede</span></div>
        <div class="${r.total.pendientes ? 't-ambar' : ''}"><strong>${r.total.pendientes}</strong><span>pendientes</span></div>
        <div class="${r.total.noUbicados ? 't-rojo' : ''}"><strong>${r.total.noUbicados}</strong><span>no ubicados</span></div>
        <div class="${r.total.apoyo ? 't-ambar' : ''}"><strong>${r.total.apoyo}</strong><span>requieren apoyo</span></div>
      </div>
      <div class="tabla-caja"><table class="tablero">
        <thead><tr><th>Piso</th><th>Previstas</th><th>Evacuados</th><th>En el punto</th><th>Pendientes</th><th>No ubicados</th><th>Apoyo</th><th>No estaban</th><th>Reporte</th></tr></thead>
        <tbody>${r.filas.map(f => `<tr>
          <td><strong>Piso ${f.piso}</strong></td><td>${f.esperados}${f.porVerificar ? ` <span class="sutil">+${f.porVerificar} por verificar</span>` : ''}</td>
          <td>${f.evacuados}</td><td>${f.llegaron}</td><td>${f.pendientes}</td><td>${f.noUbicados}</td><td>${f.apoyo}</td><td>${f.noEstaban}</td>
          <td>${f.conteo || f.porConteo ? insignia('Por conteo', 'azul') : r.sinReporte.includes(f.piso) ? insignia('Sin reporte', 'rojo') : f.esperados || f.porVerificar ? insignia('Con reporte', 'verde') : insignia('Vacío', 'gris')}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td>${r.total.esperados}</td><td>${r.total.evacuados}</td><td>${r.total.llegaron}</td><td>${r.total.pendientes}</td><td>${r.total.noUbicados}</td><td>${r.total.apoyo}</td><td>${r.total.noEstaban}</td><td></td></tr></tfoot>
      </table></div>
      ${r.sinReporte.length ? `<div class="nota nota-error" style="margin-top:.75rem">${icono('alerta')}<span>Pisos sin reporte de brigadista: ${r.sinReporte.join(', ')}.</span></div>` : ''}`;

    const q = normalizar(busqueda);
    const delPiso = fila.miembros.filter(x => !q || normalizar(sesion.nombreDe(x.codigo)).includes(q));
    const otros = q ? (sesion.base().personas || []).filter(p => p.estado === 'activo' && !fila.miembros.some(x => x.codigo === p.codigo) && normalizar(sesion.nombreDe(p.codigo)).includes(q)) : [];
    const grupo = (titulo, lista, extra) => lista.length ? `<h4>${titulo}</h4>${lista.map(x => filaPersona(x.codigo, x.marca, extra, fila.piso)).join('')}` : '';

    // Un brigadista tiene los contactos de su piso; los de otro piso los pide a propósito (queda en la bitácora).
    const pedirOtroPiso = reporta && yo.roles.includes('brigadista') && !contacto.esCoordinacion() &&
      fila.piso !== yo.pisoBrigada && !contacto.pisosConsultados.has(fila.piso);
    const hayMapa = vistaReporte === 'mapa';
    const cuerpoLista = `<input id="buscar" type="search" aria-label="Buscar por nombre en este piso o en todo el Despacho" placeholder="Buscar por nombre en este piso o en todo el Despacho…" value="${esc(busqueda)}" autocomplete="off" style="margin-bottom:.5rem">
        ${grupo('Previstas hoy en este piso', delPiso.filter(x => x.grupo === 'en'), '')}
        ${grupo('Sin reporte del día (verifique si están en la sede)', delPiso.filter(x => x.grupo === 'sin'), '')}
        ${grupo('Reportados aunque no estaban en la lista', delPiso.filter(x => x.grupo === 'extra'), '')}
        ${otros.length ? `<h4>En otros pisos</h4>${otros.map(p => filaPersona(p.codigo, marcas.get(p.codigo), `P${p.piso}-${p.puesto} · `, fila.piso)).join('')}` : ''}
        ${!fila.miembros.length && !otros.length ? '<p class="sutil">No había nadie previsto en este piso al activar.</p>' : ''}`;
    // Mapa: cada puesto muestra el estado de quien está previsto ahí hoy (el puesto de hoy, si está en otro lugar).
    const datosMapa = hayMapa ? datosDelMapa(fila, marcas) : null;
    const cuerpoMapa = hayMapa ? `<div id="mapa-emergencia"></div>
        ${datosMapa.sinPuesto.length ? `<div style="margin-top:.75rem"><h4>Sin puesto en el mapa</h4><div class="fila">${datosMapa.sinPuesto.map(g =>
          `<button class="btn btn-secundario btn-chico" data-sin-puesto="${esc(g.codigo)}" aria-label="${esc('Marcar a ' + g.nombre)}">${esc(g.nombre)}</button>`).join('')}</div></div>` : ''}` : '';
    const cuerpoReporte = `<div class="fila no-imprimir" style="margin-bottom:.75rem"><button class="btn btn-secundario btn-chico" id="vista-reporte">${hayMapa ? 'Ver como lista' : 'Ver como mapa'}</button></div>
        ${hayMapa ? cuerpoMapa : cuerpoLista}`;

    const reporte = reporta ? `
      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('escudo')}</div>
          <div><h3>Reporte del piso</h3><p class="sutil">Marque a cada persona o, si no hay tiempo, reporte por conteo</p></div></div>
        <div class="fila" id="pisos" style="margin-bottom:.75rem">${r.filas.map(f =>
          `<button class="pestana ${f.piso === fila.piso ? 'activa' : ''}" data-p="${f.piso}">Piso ${f.piso}${f.piso === yo.pisoBrigada ? ' · su brigada' : ''} (${f.esperados})</button>`).join('')}</div>
        ${pedirOtroPiso ? `<div class="nota nota-info" style="margin-bottom:.75rem">${icono('telefono')}<span>Los contactos de emergencia del piso ${fila.piso} no están en su celular. Si los necesita, pídalos: queda registrado que usted los consultó.
          <button class="btn btn-secundario btn-chico" id="ver-otro-piso" style="margin-top:.4rem">Ver contactos del piso ${fila.piso}</button></span></div>` : ''}
        ${cuerpoReporte}
        <details class="conteo" id="conteo" ${fila.conteo ? 'open' : ''}>
          <summary>Reportar el piso ${fila.piso} por conteo (sin nombres)</summary>
          <div class="fila" style="margin-top:.75rem">
            <div class="campo" style="flex:1;min-width:7rem"><label class="etiqueta" for="c-ev">Evacuados</label><input id="c-ev" type="number" min="0" inputmode="numeric" value="${fila.evacuados}"></div>
            <div class="campo" style="flex:1;min-width:7rem"><label class="etiqueta" for="c-nu">No ubicados</label><input id="c-nu" type="number" min="0" inputmode="numeric" value="${fila.noUbicados}"></div>
            <div class="campo" style="flex:1;min-width:7rem"><label class="etiqueta" for="c-ap">Requieren apoyo</label><input id="c-ap" type="number" min="0" inputmode="numeric" value="${fila.apoyo}"></div>
          </div>
          <p class="ayuda">El conteo reemplaza en el tablero las cifras del piso; sirve también para incluir visitantes.</p>
          <button class="btn btn-oscuro" id="guardar-conteo">Guardar conteo del piso ${fila.piso}</button>
        </details>
      </section>` : '';

    vista.innerHTML = `
      <section class="${e.simulacro ? 'alerta-simulacro' : 'alerta-emergencia'}">
        <div class="alerta-titulo">${icono('alerta')}<div>
          <strong>${e.simulacro ? 'Simulacro en curso' : 'Emergencia en curso'} · ${esc(TIPOS[e.tipo])}</strong>
          <span>Desde las ${hora(e.inicio)} · <span data-transcurrido class="mono">${emergencia.transcurrido(e.inicio)}</span> · activó ${esc(sesion.nombreDe(e.activadaPor))}</span>
          ${e.descripcion ? `<span>${esc(e.descripcion)}</span>` : ''}
        </div></div>
      </section>
      ${emergencia.esLocal() ? `<div class="nota nota-adv">${icono('sinWifi')}<span>Modo sin conexión: esta emergencia se activó en este celular y solo usted la ve. Todo queda guardado aquí y se unirá solo a la del servidor cuando vuelva la señal.</span></div>` : ''}
      ${pendientesEnvio ? `<div class="nota nota-adv">${icono('sinWifi')}<span>${pendientesEnvio} reporte(s) guardado(s) en este celular. Se enviarán solos cuando haya conexión.</span></div>` : ''}
      ${reporta ? `<a class="btn btn-oscuro btn-ancho btn-grande" href="#/punto" style="margin-bottom:1rem">${icono('ubicacion')}Registrar llegadas al punto de encuentro</a>` : ''}

      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-verde">${icono('persona')}</div>
          <div><h3>Mi estado</h3><p class="sutil">${miMarca && miMarca.estado ? 'Reportado: ' + insigniaMarca(miMarca) : 'Avise cuando esté a salvo'}</p></div></div>
        <div class="botonera">
          <button class="btn btn-primario btn-grande" data-yo="evacuado">${icono('ok')}Ya salí del edificio</button>
          <button class="btn btn-primario btn-grande" data-yo="llegada">${icono('ubicacion')}Llegué al punto de encuentro</button>
          <button class="btn btn-secundario btn-grande" data-yo="apoyo">${icono('alerta')}Necesito ayuda</button>
        </div>
        <div class="fila" style="margin-top:.75rem">
          <a class="btn btn-fantasma btn-chico" href="#/rutas">Ruta de evacuación</a>
          <a class="btn btn-fantasma btn-chico" href="#/recomendaciones" data-protocolo="${esc(PROTOCOLO[e.tipo])}">Qué hacer</a>
          <a class="btn btn-fantasma btn-chico" href="#/contactos">Contactos</a>
        </div>
      </section>

      ${aMiCargo.length ? `<section class="tarjeta tarjeta-alerta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-ambar">${icono('persona')}</div><div><h3>Usted acompaña a alguien</h3><p class="sutil">Esta persona designó que usted la ayude a evacuar</p></div></div>
        ${aMiCargo.map(x => `<div class="contacto"><div class="contacto-txt"><strong>${esc(sesion.nombreDe(x.codigo))}</strong>
          <span class="sutil">${esc(carac.etiqueta(carac.APOYOS, x.apoyo))}${x.detalle ? ': ' + esc(x.detalle) : ''}</span></div></div>`).join('')}
      </section>` : ''}

      ${reporta && prioridad.length ? `<section class="tarjeta tarjeta-alerta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-ambar">${icono('alerta')}</div><div><h3>Atención prioritaria</h3><p class="sutil">Personas no ubicadas, que piden apoyo, que necesitan asistencia o que registraron que requieren apoyo</p></div></div>
        ${prioridad.map(({ codigo, m }) => {
          const f = r.filas.find(x => x.miembros.some(y => y.codigo === codigo));
          const pre = textoApoyo(codigo);
          return `<div class="contacto"><div class="contacto-txt"><strong>${esc(sesion.nombreDe(codigo))}</strong>
            <span class="sutil">${f ? 'Piso ' + f.piso + ' · ' : ''}${insigniaMarca(m)}${m && m.asistencia ? ' ' + insignia('Asistencia por discapacidad', 'azul') : ''}</span>
            ${pre ? `<span class="chip-apoyo">${icono('alerta', 'ic-s')}<span>${esc(pre)}</span></span>` : ''}${detalleContacto(codigo)}</div></div>`;
        }).join('')}
      </section>` : ''}

      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-azul">${icono('edificio')}</div>
          <div><h3>Tablero por piso</h3><p class="sutil">Se actualiza solo cada 15 segundos</p></div>
          <button class="btn btn-fantasma btn-chico" id="actualizar" style="margin-left:auto">${icono('recargar', 'ic-s')}Actualizar</button></div>
        ${tablero}
      </section>

      ${reporte}

      ${cierra ? `<section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-morado">${icono('ok')}</div>
          <div><h3>${e.simulacro ? 'Terminar el simulacro' : 'Cerrar la emergencia'}</h3><p class="sutil">Cuando la brigada y las autoridades lo indiquen</p></div></div>
        <button class="btn btn-oscuro" id="cerrar">${e.simulacro ? 'Terminar simulacro' : 'Cerrar emergencia'}</button>
      </section>` : ''}`;

    // Mi estado
    vista.querySelectorAll('[data-yo]').forEach(b => b.addEventListener('click', async () => {
      const que = b.dataset.yo;
      if (que === 'llegada') {
        await emergencia.marcarLlegada(yo.codigo);
        aviso('Registrado: llegó al punto de encuentro. Repórtese también con su brigadista.', 'exito');
        return;
      }
      await emergencia.marcarPersona(yo.codigo, { estado: que });
      aviso(que === 'evacuado' ? 'Reportado: fuera del edificio.' : 'Su solicitud de ayuda quedó registrada. Si puede, avise también en voz alta o llame.', que === 'evacuado' ? 'exito' : 'advertencia');
    }));
    vista.querySelector('[data-protocolo]')?.addEventListener('click', ev => { sessionStorage.setItem('protocolo-abrir', ev.currentTarget.dataset.protocolo); });
    vista.querySelector('#actualizar')?.addEventListener('click', async () => {
      aviso(await emergencia.traer() ? 'Tablero actualizado.' : 'Sin conexión: se muestra lo último conocido.', 'info');
    });

    // Reporte del piso
    vista.querySelectorAll('#pisos button').forEach(b => b.addEventListener('click', () => { pisoSel = Number(b.dataset.p); busqueda = ''; pintar(); }));
    const buscar = vista.querySelector('#buscar');
    buscar?.addEventListener('input', () => {
      busqueda = buscar.value;
      clearTimeout(buscar._t);
      buscar._t = setTimeout(() => { pintar(); const nuevo = vista.querySelector('#buscar'); nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }, 250);
    });
    enlazarFilas(vista, () => marcas);
    vista.querySelector('#ver-otro-piso')?.addEventListener('click', async ev => {
      ev.currentTarget.disabled = true;
      try {
        const n = await contacto.verOtroPiso(fila.piso);
        aviso(n ? `Contactos del piso ${fila.piso} disponibles mientras dure la emergencia.` : `No hay contactos cargados del piso ${fila.piso}.`, n ? 'exito' : 'info');
      } catch (e) {
        aviso(e.codigo === 'RED' ? 'Sin conexión: los contactos de otro piso solo se pueden pedir con internet.' : e.message, 'error');
        pintar();
      }
    });
    vista.querySelector('#vista-reporte')?.addEventListener('click', () => {
      vistaReporte = vistaReporte === 'mapa' ? 'lista' : 'mapa';
      guardarVistaReporte(vistaReporte);
      pintar();
      vista.querySelector('#vista-reporte')?.focus();
    });
    if (datosMapa) {
      const mapa = mapaPiso({
        piso: fila.piso, puestos: sesion.base().puestos || [], referencias: sesion.base().referencias || [], ocupantes: datosMapa.ocupantes,
        modo: 'elegir', idBase: 'emergencia-' + fila.piso, estadoDe: datosMapa.estadoDe, sinSelector: true, vista: 'mapa'
      });
      const caja = vista.querySelector('#mapa-emergencia');
      caja.innerHTML = mapa.html;
      mapa.enlazar(caja, { alElegir: p => {
        const gente = datosMapa.ocupantes.get(`${p.piso}-${p.puesto}`) || [];
        if (!gente.length) return aviso(`El puesto ${rotulo(p.piso, p.puesto)} está libre: nadie previsto ahí hoy.`, 'info');
        abrirHoja(`${p.piso}-${p.puesto}`, `Puesto ${rotulo(p.piso, p.puesto)}`, gente.map(g => g.codigo), fila.piso);
      } });
      vista.querySelectorAll('[data-sin-puesto]').forEach(b => b.addEventListener('click', () =>
        abrirHoja(null, 'Persona sin puesto en el mapa', [b.dataset.sinPuesto], fila.piso)));
    }
    vista.querySelector('#guardar-conteo')?.addEventListener('click', async () => {
      await emergencia.marcarConteo(fila.piso, {
        evacuados: vista.querySelector('#c-ev').value, noUbicados: vista.querySelector('#c-nu').value, apoyo: vista.querySelector('#c-ap').value
      });
      aviso(`Conteo del piso ${fila.piso} guardado.`, 'exito');
    });

    // Cierre
    vista.querySelector('#cerrar')?.addEventListener('click', async () => {
      const hayPendientes = !!(r.total.pendientes || r.total.noUbicados || r.sinReporte.length);
      const extra = hayPendientes ? `<div class="nota nota-adv">${icono('alerta')}<span>Atención: hay ${r.total.pendientes} pendiente(s), ${r.total.noUbicados} no ubicado(s)${r.sinReporte.length ? ' y ' + (r.sinReporte.length === 1 ? 'un piso sin reporte' : r.sinReporte.length + ' pisos sin reporte') + ' (' + r.sinReporte.join(', ') + ')' : ''}.</span></div>
        <label class="casilla"><input type="checkbox" id="confirma-fin">La brigada del edificio o la autoridad indicó que terminó</label>` : '';
      const observaciones = await modal({
        titulo: e.simulacro ? 'Terminar simulacro' : 'Cerrar emergencia',
        cuerpo: `<p>¿Confirma que ${e.simulacro ? 'el simulacro terminó' : 'la emergencia terminó'}? Se genera el informe de totales y tiempos por piso.</p>${extra}
          <div class="campo"><label class="etiqueta" for="obs">Observaciones del cierre (opcional)</label>
            <textarea id="obs" rows="3" maxlength="600" placeholder="Ej.: la escalera del piso 4 estaba obstruida"></textarea>
            <p class="ayuda">No escriba nombres ni datos de salud: el informe solo lleva totales y tiempos.</p></div>
          <div class="nota nota-info">${icono('info')}<span>Al cerrar se borra el detalle por persona de esta emergencia: solo quedan los totales y los tiempos.</span></div>`,
        acciones: [
          { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
          {
            texto: e.simulacro ? 'Terminar' : 'Cerrar emergencia', clase: 'btn-peligro',
            antes: f => {
              const caja = f.querySelector('#confirma-fin');
              if (caja && !caja.checked) { aviso('Marque la casilla: confirme que la brigada o la autoridad indicó que terminó.', 'advertencia'); return false; }
            },
            valor: f => f.querySelector('#obs').value.trim()
          }
        ]
      });
      if (observaciones === null) return;
      try {
        const id = await emergencia.cerrar(observaciones);
        aviso(e.simulacro ? 'Simulacro terminado. Informe generado.' : 'Emergencia cerrada. Informe generado.', 'exito');
        if (id && tiene(ROLES_REPORTAR)) location.hash = '#/historico?id=' + encodeURIComponent(id);
      } catch (err) { aviso(err.codigo === 'RED' ? 'Sin conexión: no se pudo cerrar. Intente de nuevo con internet.' : err.message, 'error'); }
    });
  };

  const pintar = () => {
    // No repintar mientras alguien escribe un número o busca: se repinta al salir del campo.
    const enfocado = document.activeElement;
    if (enfocado && vista.contains(enfocado) && enfocado.matches('#c-ev, #c-nu, #c-ap')) { pendientePintar = true; return; }
    pendientePintar = false;
    const puestoEnfocado = enfocado && vista.contains(enfocado) && enfocado.closest ? (enfocado.closest('[data-mp-puesto]') || {}).dataset?.mpPuesto : null;
    const a = emergencia.actual();
    if (a) pintarActiva(a); else pintarInactiva();
    if (puestoEnfocado) vista.querySelector(`[data-mp-puesto="${puestoEnfocado}"]`)?.focus();
  };

  const alCambiar = () => { if (location.hash.startsWith('#/emergencia')) pintar(); };
  const alTerminar = ev => { terminada = ev.detail; };
  const alSalirCampo = () => { if (pendientePintar) setTimeout(pintar, 0); };
  // Los contactos abiertos siguen abiertos al repintar (el evento «toggle» no sube: se escucha en captura).
  const alPlegar = ev => {
    const d = ev.target;
    if (!d.matches || !d.matches('details[data-contacto-de]')) return;
    if (d.open) contactosAbiertos.add(d.dataset.contactoDe); else contactosAbiertos.delete(d.dataset.contactoDe);
  };
  addEventListener('emergencia-cambio', alCambiar);
  addEventListener('apoyos-cambio', alCambiar);
  addEventListener('contactos-cambio', alCambiar);
  addEventListener('emergencia-terminada', alTerminar);
  vista.addEventListener('focusout', alSalirCampo);
  vista.addEventListener('toggle', alPlegar, true);
  const reloj = setInterval(() => {
    const a = emergencia.actual();
    vista.querySelectorAll('[data-transcurrido]').forEach(el => { if (a) el.textContent = emergencia.transcurrido(a.emergencia.inicio); });
  }, 1000);
  vista.addEventListener('vista-salida', () => {
    removeEventListener('emergencia-cambio', alCambiar);
    removeEventListener('apoyos-cambio', alCambiar);
    removeEventListener('contactos-cambio', alCambiar);
    removeEventListener('emergencia-terminada', alTerminar);
    vista.removeEventListener('focusout', alSalirCampo);
    vista.removeEventListener('toggle', alPlegar, true);
    contactosAbiertos.clear();
    clearInterval(reloj);
  }, { once: true });
  pintar();
  emergencia.traer();
}
