// Emergencia: activar o simular, reporte propio, reporte de brigadistas (por
// persona o por conteo), tablero consolidado por piso y cierre.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as emergencia from '../emergencia.js';
import { esc, icono, aviso, insignia, confirmar } from '../ui.js';
import { horaLegible, horaBogota } from '../tiempo.js';

const { TIPOS, PROTOCOLO, ROLES_ACTIVAR, ROLES_SIMULACRO, ROLES_CERRAR, ROLES_REPORTAR, tiene } = emergencia;

const ESTADO = {
  evacuado: ['Evacuado', 'verde'],
  no_ubicado: ['No ubicado', 'rojo'],
  apoyo: ['Requiere apoyo', 'ambar']
};
const hora = ms => horaLegible(horaBogota(new Date(ms)));
const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function insigniaMarca(m) {
  if (!m || !m.estado) return insignia('Sin marcar', 'gris');
  const [t, tono] = ESTADO[m.estado];
  return insignia(t, tono) + (m.llegada ? ' ' + insignia('Llegó ' + horaLegible(m.llegada), 'verde') : '');
}

function filaPersona(codigo, m, extra = '') {
  const activo = s => (m && m.estado === s ? 'activo' : '');
  return `<div class="fila-marca" data-codigo="${esc(codigo)}">
    <div class="fila-dia-txt"><strong>${esc(sesion.nombreDe(codigo))}</strong><span class="sutil">${extra}${insigniaMarca(m)}</span></div>
    <div class="marca-btns">
      <button class="btn-estado ${activo('evacuado')} e-evacuado" data-estado="evacuado" title="Evacuado">${icono('ok', 'ic-s')}<span>Evacuado</span></button>
      <button class="btn-estado ${activo('no_ubicado')} e-no" data-estado="no_ubicado" title="No ubicado">${icono('alerta', 'ic-s')}<span>No ubicado</span></button>
      <button class="btn-estado ${activo('apoyo')} e-apoyo" data-estado="apoyo" title="Requiere apoyo">${icono('persona', 'ic-s')}<span>Apoyo</span></button>
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

  // ---------- Sin emergencia ----------
  const pintarInactiva = () => {
    const puedeReal = tiene(ROLES_ACTIVAR), puedeSim = tiene(ROLES_SIMULACRO);
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
          <div class="fila"><a class="btn btn-secundario" href="#/rutas">Ruta y punto de encuentro</a><a class="btn btn-secundario" href="#/recomendaciones">Recomendaciones</a></div>
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

  // ---------- Con emergencia ----------
  const pintarActiva = a => {
    const e = a.emergencia;
    const r = emergencia.resumen(a);
    const reporta = tiene(ROLES_REPORTAR);
    const cierra = e.simulacro ? tiene(ROLES_SIMULACRO) : tiene(ROLES_CERRAR);
    const marcas = new Map(a.marcas.map(m => [m.codigo, m]));
    const miMarca = marcas.get(yo.codigo);
    const fila = r.filas.find(f => f.piso === pisoSel) || r.filas[0];
    const pendientesEnvio = emergencia.pendientes();
    const apoyo = a.marcas.filter(m => m.estado === 'apoyo' || m.asistencia || m.estado === 'no_ubicado');

    const tablero = `
      <div class="resumen-grande">
        <div><strong>${r.total.evacuados}</strong><span>de ${r.total.esperados} evacuados</span></div>
        <div class="${r.total.pendientes ? 't-ambar' : ''}"><strong>${r.total.pendientes}</strong><span>pendientes</span></div>
        <div class="${r.total.noUbicados ? 't-rojo' : ''}"><strong>${r.total.noUbicados}</strong><span>no ubicados</span></div>
        <div class="${r.total.apoyo ? 't-ambar' : ''}"><strong>${r.total.apoyo}</strong><span>requieren apoyo</span></div>
      </div>
      <div class="tabla-caja"><table class="tablero">
        <thead><tr><th>Piso</th><th>En la sede</th><th>Evacuados</th><th>En el punto</th><th>Pendientes</th><th>No ubicados</th><th>Apoyo</th><th>Reporte</th></tr></thead>
        <tbody>${r.filas.map(f => `<tr>
          <td><strong>Piso ${f.piso}</strong></td><td>${f.esperados}${f.porVerificar ? ` <span class="sutil">+${f.porVerificar} por verificar</span>` : ''}</td>
          <td>${f.evacuados}</td><td>${f.llegaron}</td><td>${f.pendientes}</td><td>${f.noUbicados}</td><td>${f.apoyo}</td>
          <td>${f.conteo ? insignia('Por conteo', 'azul') : r.sinReporte.includes(f.piso) ? insignia('Sin reporte', 'rojo') : f.esperados || f.porVerificar ? insignia('Con reporte', 'verde') : insignia('Vacío', 'gris')}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td>${r.total.esperados}</td><td>${r.total.evacuados}</td><td>${r.total.llegaron}</td><td>${r.total.pendientes}</td><td>${r.total.noUbicados}</td><td>${r.total.apoyo}</td><td></td></tr></tfoot>
      </table></div>
      ${r.sinReporte.length ? `<div class="nota nota-error" style="margin-top:.75rem">${icono('alerta')}<span>Pisos sin reporte de brigadista: ${r.sinReporte.join(', ')}.</span></div>` : ''}`;

    const q = normalizar(busqueda);
    const delPiso = fila.miembros.filter(x => !q || normalizar(sesion.nombreDe(x.codigo)).includes(q));
    const otros = q ? (sesion.base().personas || []).filter(p => p.estado === 'activo' && !fila.miembros.some(x => x.codigo === p.codigo) && normalizar(sesion.nombreDe(p.codigo)).includes(q)) : [];
    const grupo = (titulo, lista, extra) => lista.length ? `<h4>${titulo}</h4>${lista.map(x => filaPersona(x.codigo, x.marca, extra)).join('')}` : '';

    const reporte = reporta ? `
      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('escudo')}</div>
          <div><h3>Reporte del piso</h3><p class="sutil">Marque a cada persona o, si no hay tiempo, reporte por conteo</p></div></div>
        <div class="fila" id="pisos" style="margin-bottom:.75rem">${r.filas.map(f =>
          `<button class="pestana ${f.piso === fila.piso ? 'activa' : ''}" data-p="${f.piso}">Piso ${f.piso}${f.piso === yo.pisoBrigada ? ' · su brigada' : ''} (${f.esperados})</button>`).join('')}</div>
        <input id="buscar" type="text" placeholder="Buscar por nombre en este piso o en todo el Despacho…" value="${esc(busqueda)}" autocomplete="off" style="margin-bottom:.5rem">
        ${grupo('En la sede según el registro del día', delPiso.filter(x => x.grupo === 'en'), '')}
        ${grupo('Sin reporte del día — verifique si están en la sede', delPiso.filter(x => x.grupo === 'sin'), '')}
        ${grupo('Reportados aunque no estaban en la lista', delPiso.filter(x => x.grupo === 'extra'), '')}
        ${otros.length ? `<h4>En otros pisos</h4>${otros.map(p => filaPersona(p.codigo, marcas.get(p.codigo), `P${p.piso}-${p.puesto} · `)).join('')}` : ''}
        ${!fila.miembros.length && !otros.length ? '<p class="sutil">No había nadie registrado en este piso al activar.</p>' : ''}
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

      ${reporta && apoyo.length ? `<section class="tarjeta tarjeta-alerta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-ambar">${icono('alerta')}</div><div><h3>Atención prioritaria</h3><p class="sutil">Personas no ubicadas, que piden apoyo o que necesitan asistencia</p></div></div>
        ${apoyo.map(m => {
          const f = r.filas.find(x => x.miembros.some(y => y.codigo === m.codigo));
          return `<div class="contacto"><div class="contacto-txt"><strong>${esc(sesion.nombreDe(m.codigo))}</strong>
            <span class="sutil">${f ? 'Piso ' + f.piso + ' · ' : ''}${insigniaMarca(m)}${m.asistencia ? ' ' + insignia('Asistencia por discapacidad', 'azul') : ''}</span></div></div>`;
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
    vista.querySelectorAll('.fila-marca').forEach(filaEl => {
      const codigo = filaEl.dataset.codigo;
      filaEl.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', () => {
        const m = marcas.get(codigo);
        emergencia.marcarPersona(codigo, { estado: m && m.estado === b.dataset.estado ? '' : b.dataset.estado });
      }));
      filaEl.querySelector('[data-asistencia]').addEventListener('change', ev => emergencia.marcarPersona(codigo, { asistencia: ev.target.checked }));
    });
    vista.querySelector('#guardar-conteo')?.addEventListener('click', async () => {
      await emergencia.marcarConteo(fila.piso, {
        evacuados: vista.querySelector('#c-ev').value, noUbicados: vista.querySelector('#c-nu').value, apoyo: vista.querySelector('#c-ap').value
      });
      aviso(`Conteo del piso ${fila.piso} guardado.`, 'exito');
    });

    // Cierre
    vista.querySelector('#cerrar')?.addEventListener('click', async () => {
      const extra = r.total.pendientes || r.total.noUbicados ? `<br><br>Atención: hay ${r.total.pendientes} pendiente(s) y ${r.total.noUbicados} no ubicado(s).` : '';
      if (!await confirmar(e.simulacro ? 'Terminar simulacro' : 'Cerrar emergencia', `¿Confirma que ${e.simulacro ? 'el simulacro terminó' : 'la emergencia terminó'}?${extra}`, e.simulacro ? 'Terminar' : 'Cerrar', true)) return;
      try { await emergencia.cerrar(); aviso(e.simulacro ? 'Simulacro terminado.' : 'Emergencia cerrada.', 'exito'); }
      catch (err) { aviso(err.codigo === 'RED' ? 'Sin conexión: no se pudo cerrar. Intente de nuevo con internet.' : err.message, 'error'); }
    });
  };

  const pintar = () => {
    // No repintar mientras alguien escribe un número o busca: se repinta al salir del campo.
    const enfocado = document.activeElement;
    if (enfocado && vista.contains(enfocado) && enfocado.matches('#c-ev, #c-nu, #c-ap')) { pendientePintar = true; return; }
    pendientePintar = false;
    const a = emergencia.actual();
    if (a) pintarActiva(a); else pintarInactiva();
  };

  const alCambiar = () => { if (location.hash.startsWith('#/emergencia')) pintar(); };
  const alTerminar = ev => { terminada = ev.detail; };
  const alSalirCampo = () => { if (pendientePintar) setTimeout(pintar, 0); };
  addEventListener('emergencia-cambio', alCambiar);
  addEventListener('emergencia-terminada', alTerminar);
  vista.addEventListener('focusout', alSalirCampo);
  const reloj = setInterval(() => {
    const a = emergencia.actual();
    vista.querySelectorAll('[data-transcurrido]').forEach(el => { if (a) el.textContent = emergencia.transcurrido(a.emergencia.inicio); });
  }, 1000);
  vista.addEventListener('vista-salida', () => {
    removeEventListener('emergencia-cambio', alCambiar);
    removeEventListener('emergencia-terminada', alTerminar);
    vista.removeEventListener('focusout', alSalirCampo);
    clearInterval(reloj);
  }, { once: true });
  pintar();
  emergencia.traer();
}
