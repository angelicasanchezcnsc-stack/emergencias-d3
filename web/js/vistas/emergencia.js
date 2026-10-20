// Emergencia: activar o simular, reporte propio, reporte de brigadistas (por
// persona o por conteo), tablero consolidado por piso y cierre.
// Desde la v0.13 la pantalla se ordena según quién la mira (perfil de vista): el brigadista ve primero su piso,
// la coordinación el tablero, el asesor el reporte; cada sección es una función que devuelve su HTML.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as emergencia from '../emergencia.js';
import * as carac from '../caracterizacion.js';
import * as contacto from '../contacto-emergencia.js';
import * as contenido from '../contenido.js';
import { fichaContacto } from './ventana-contacto.js';
import { esc, icono, aviso, insignia, confirmar, modal } from '../ui.js';
import { horaLegible, horaBogota } from '../tiempo.js';
import { enSedeDe, ubicacionHoy } from '../presencia.js';
import { mapaPiso, nombreCorto, rotulo } from '../mapa-piso.js';
import { armarActa, imprimirActa } from './acta.js';
import { textoConservacion } from './historico.js';
import { seccionesHtml, enlazarRemisiones } from './recomendaciones.js';

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
const CLAVE_TABLERO = 'd3e-tablero-completo';
const leerTableroCompleto = () => { try { return localStorage.getItem(CLAVE_TABLERO) === '1'; } catch (e) { return false; } };
const guardarTableroCompleto = v => { try { localStorage.setItem(CLAVE_TABLERO, v ? '1' : '0'); } catch (e) { /* no se recuerda */ } };
// Clase del mapa según la marca de la emergencia; si hay varias personas en el puesto manda la más urgente.
const CLASE_MARCA = { evacuado: 'evacuado', no_ubicado: 'no-ubicado', apoyo: 'apoyo', no_estaba: 'no-estaba', '': 'sin-marcar' };
const URGENCIA = ['no_ubicado', 'apoyo', '', 'evacuado', 'no_estaba'];
const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Quién mira la pantalla: decide el orden de las secciones.
const perfilVista = () => contacto.esCoordinacion() ? 'coordinacion' : sesion.tieneRol('brigadista') ? 'brigadista'
  : sesion.tieneRol('asesor') ? 'asesor' : 'persona';

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
// La coordinación lo ve siempre. Un brigadista, solo si la persona está marcada «No ubicado», «Requiere apoyo» o
// con asistencia por discapacidad (decisión de la usuaria, 20/10/2026). Es una regla de la pantalla: el celular
// guarda la copia cifrada del piso para poder usarla sin internet.
const contactosAbiertos = new Set();
const MARCAS_CON_CONTACTO = ['no_ubicado', 'apoyo'];
const contactoVisible = m => contacto.esCoordinacion() || !!(m && (MARCAS_CON_CONTACTO.includes(m.estado) || m.asistencia));
function detalleContacto(codigo, m) {
  const c = contacto.contactoDe(codigo);
  if (!c || !c.abierto || !contactoVisible(m)) return '';
  return `<details class="detalle-contacto" data-contacto-de="${esc(codigo)}" ${contactosAbiertos.has(codigo) ? 'open' : ''}>
    <summary>${icono('telefono', 'ic-s')}Contacto de emergencia</summary>${fichaContacto(c)}</details>`;
}

// Si la marca la puso alguien de la brigada de otro piso, se avisa para que la brigada de este piso lo sepa.
function textoOtraBrigada(m, pisoVista) {
  if (!m || !m.estado || !m.reportadoPor || !pisoVista) return '';
  const autor = ((sesion.base() && sesion.base().personas) || []).find(x => x.codigo === m.reportadoPor);
  return autor && autor.pisoBrigada && autor.pisoBrigada !== pisoVista ? ` · marcado por la brigada del piso ${autor.pisoBrigada}` : '';
}

// Fila de una persona (v0.13): un botón principal «Evacuado» y «Más» para los demás estados. Tocar «Evacuado»
// cuando ya está evacuada no hace nada: quitar una marca es una acción explícita dentro de «Más».
function filaPersona(codigo, m, extra = '', pisoVista = null) {
  const nombre = sesion.nombreDe(codigo);
  const evacuado = !!(m && m.estado === 'evacuado');
  return `<div class="fila-marca" data-codigo="${esc(codigo)}">
    <div class="fila-dia-txt"><strong>${esc(nombre)}</strong><span class="sutil">${extra}${insigniaMarca(m)}${m && m.asistencia ? ' ' + insignia('Asistencia por discapacidad', 'azul') : ''}${esc(textoOtraBrigada(m, pisoVista))}</span>${chipApoyo(codigo)}${detalleContacto(codigo, m)}</div>
    <div class="marca-btns">
      <button class="btn-estado e-evacuado btn-principal ${evacuado ? 'activo' : ''}" data-estado="evacuado" aria-pressed="${evacuado}" aria-label="${esc('Marcar a ' + nombre + ' como persona evacuada')}">${icono('ok', 'ic-s')}<span>Evacuado</span></button>
      <button class="btn btn-fantasma btn-chico btn-mas" data-mas aria-label="${esc('Más opciones para ' + nombre)}">Más</button>
    </div>
  </div>`;
}

// Hoja de acciones «Más»: los demás estados, la asistencia por discapacidad y «Quitar marca».
async function hojaMas(codigo) {
  const marcaAhora = () => { const a = emergencia.actual(); return ((a && a.marcas) || []).find(m => m.codigo === codigo) || null; };
  const m = marcaAhora();
  const nombre = sesion.nombreDe(codigo);
  const boton = (estado, texto, clase, ic) => `<button class="btn ${clase} btn-grande btn-ancho" data-hoja="${estado}" ${m && m.estado === estado ? 'aria-pressed="true"' : ''}>${icono(ic)}${esc(texto)}${m && m.estado === estado ? ' (actual)' : ''}</button>`;
  const respuesta = modal({
    titulo: nombre,
    cuerpo: `<p>Estado actual: ${insigniaMarca(m)}</p>
      <div class="pila hoja-acciones">
        ${boton('no_ubicado', 'No ubicado', 'btn-peligro', 'alerta')}
        ${boton('apoyo', 'Requiere apoyo', 'btn-secundario', 'persona')}
        ${boton('no_estaba', 'No estaba hoy en la sede', 'btn-secundario', 'cerrar')}
        <label class="casilla"><input type="checkbox" data-hoja-asistencia ${m && m.asistencia ? 'checked' : ''}>Persona con discapacidad que necesita asistencia</label>
        ${m && m.estado ? `<button class="btn btn-fantasma btn-ancho" data-hoja="">Quitar marca</button>` : ''}
      </div>`,
    acciones: [{ texto: 'Cerrar', valor: null, clase: 'btn-fantasma' }]
  });
  const fondo = Array.from(document.querySelectorAll('.modal-fondo')).pop();
  const cerrar = () => fondo.querySelector('[data-i="0"]').click();
  fondo.querySelectorAll('[data-hoja]').forEach(b => b.addEventListener('click', async () => {
    const estado = b.dataset.hoja;
    const actual = marcaAhora();
    if (!(actual && actual.estado === estado) || estado === '') await emergencia.marcarPersona(codigo, { estado });
    cerrar();
  }));
  fondo.querySelector('[data-hoja-asistencia]').addEventListener('change', ev => emergencia.marcarPersona(codigo, { asistencia: ev.target.checked }));
  fondo.querySelector('[data-hoja]')?.focus();
  await respuesta;
}

export function vistaEmergencia(vista) {
  const yo = sesion.perfil();
  let pisoSel = yo.pisoBrigada || (CONFIG.PISOS.includes(yo.piso) ? yo.piso : CONFIG.PISOS[0]);
  let busqueda = '';
  let terminada = null;
  let pendientePintar = false;
  let vistaReporte = leerVistaReporte();
  let tableroCompleto = leerTableroCompleto();
  // Secciones plegables abiertas o cerradas por la persona: se respetan al repintar.
  const abiertas = new Map();
  // Protocolos (sobre cifrado guardado en el celular): se leen una vez para «Qué hacer ahora».
  let protocolos = null;
  contenido.leerSobre('recomendaciones').then(d => { protocolos = (d && d.protocolos) || []; pintar(); }).catch(() => { protocolos = []; });

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
            <div class="campo"><label class="etiqueta" for="desc">Detalle (opcional)</label><input id="desc" type="text" maxlength="200" placeholder="Ej.: humo en el piso 6" autocomplete="off" aria-describedby="desc-ayuda">
              <p class="ayuda" id="desc-ayuda">Sin nombres ni datos de salud: este texto queda en el histórico.</p></div>
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
        if (e.codigo !== 'RED' && e.codigo !== 'OCUPADO') { aviso(e.message, 'error'); return; }
        // Sin conexión (o el servidor no responde): se ofrece activarla solo en este celular, con la lista del día guardada.
        const local = await confirmar(e.codigo === 'OCUPADO' ? 'El servidor no responde' : 'Sin conexión',
          'No se pudo llegar al servidor. ¿Activar en <strong>este celular</strong> para registrar el piso y el punto de encuentro sin internet? ' +
          'Cuando el servidor responda se unirá sola a la emergencia del servidor. Dé la alarma también por los medios del edificio.',
          'Activar sin conexión', !esSim);
        if (!local) return;
        await emergencia.activarLocal(tipo, f.desc.value.trim(), esSim);
        aviso('Activada en este celular, sin conexión.', 'advertencia');
      }
    });
  };

  // ---------- Reporte del piso: filas, mapa y hoja de acciones ----------

  // Botones de cada fila de persona («Evacuado» y «Más»). Sirven igual en la lista y en la hoja del mapa.
  // «marcasDe» entrega las marcas más recientes.
  function enlazarFilas(raiz, marcasDe) {
    raiz.querySelectorAll('.fila-marca').forEach(filaEl => {
      const codigo = filaEl.dataset.codigo;
      filaEl.querySelector('[data-estado]').addEventListener('click', () => {
        const m = marcasDe().get(codigo);
        if (m && m.estado === 'evacuado') return;   // ya está evacuada: un segundo toque no borra la marca
        emergencia.marcarPersona(codigo, { estado: 'evacuado' });
      });
      filaEl.querySelector('[data-mas]').addEventListener('click', () => hojaMas(codigo));
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
      const etiqueta = `${necesitan.length && mandan !== 'apoyo' ? '✚' : ''}${nombreCorto(gente[0])}${mas}`;
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
      const marca = activo && caja.contains(activo) ? [activo.closest('.fila-marca')?.dataset.codigo, activo.hasAttribute('data-mas') ? 'mas' : 'estado'] : null;
      caja.innerHTML = cuerpo();
      enlazarFilas(caja, marcasAhora);
      if (marca && marca[0]) {
        const fila = Array.from(caja.querySelectorAll('.fila-marca')).find(f => f.dataset.codigo === marca[0]);
        fila?.querySelector(marca[1] === 'mas' ? '[data-mas]' : '[data-estado]')?.focus();
      }
    };
    enlazarFilas(caja, marcasAhora);
    addEventListener('emergencia-cambio', pintarHoja);
    await respuesta;
    removeEventListener('emergencia-cambio', pintarHoja);
    // El mapa se repintó con cada cambio: el foco vuelve al puesto tocado.
    if (clavePuesto) vista.querySelector(`[data-mp-puesto="${clavePuesto}"]`)?.focus();
  }

  // ---------- Con emergencia: secciones ----------

  // Sección plegable: abierta o cerrada según lo que la persona eligió, o según el perfil la primera vez.
  const plegable = (clave, abiertaPorDefecto, resumen, cuerpo, clase = 'tarjeta') => {
    const abierta = abiertas.has(clave) ? abiertas.get(clave) : abiertaPorDefecto;
    return `<details class="${clase}" data-seccion="${clave}" ${abierta ? 'open' : ''}><summary class="resumen-plegable">${resumen}</summary>${cuerpo}</details>`;
  };

  const secAlerta = ({ e }) => `
    <section class="${e.simulacro ? 'alerta-simulacro' : 'alerta-emergencia'}">
      <div class="alerta-titulo">${icono('alerta')}<div>
        <strong>${e.simulacro ? 'Simulacro en curso' : 'Emergencia en curso'} · ${esc(TIPOS[e.tipo])}</strong>
        <span>Desde las ${hora(e.inicio)} · <span data-transcurrido class="mono">${emergencia.transcurrido(e.inicio)}</span> · activó ${esc(sesion.nombreDe(e.activadaPor))}</span>
        ${e.descripcion ? `<span>${esc(e.descripcion)}</span>` : ''}
      </div></div>
    </section>`;

  const secAvisos = () => {
    const n = emergencia.pendientes();
    return `${emergencia.esLocal() ? `<div class="nota nota-adv">${icono('sinWifi')}<span>Modo sin conexión: esta emergencia se activó en este celular y solo usted la ve. Todo queda guardado aquí y se unirá solo a la del servidor cuando vuelva la señal.</span></div>` : ''}
      ${n ? `<div class="nota nota-adv">${icono('sinWifi')}<span>${n} reporte(s) guardado(s) en este celular. Se enviarán solos cuando haya conexión.</span></div>` : ''}`;
  };

  // «Qué hacer ahora»: «Durante» y «Después» del protocolo del tipo de evento (y, para brigadistas y
  // coordinación, el protocolo del brigadista), sin salir de la pantalla. Se lee del celular: sirve sin internet.
  const secQueHacer = ({ e, perfil }) => {
    const id = PROTOCOLO[e.tipo];
    const lista = protocolos || [];
    const delTipo = lista.find(p => p.id === id);
    const brig = (perfil === 'brigadista' || perfil === 'coordinacion') ? lista.find(p => p.id === 'brigadista') : null;
    const bloque = p => `<div class="que-hacer"><h4 class="que-hacer-titulo">${esc(p.titulo)}</h4>${seccionesHtml(p, { sinAntes: true })}</div>`;
    const cuerpo = `${brig ? bloque(brig) : ''}${delTipo ? bloque(delTipo) : `<p class="sutil">${protocolos === null ? 'Cargando el protocolo…' : 'Este celular aún no tiene el protocolo de este tipo de evento.'}</p>`}
      <a class="btn btn-fantasma btn-chico" href="#/recomendaciones" data-protocolo="${esc(id)}">Ver protocolo completo</a>`;
    return plegable('que-hacer', perfil === 'persona', `${icono('libro', 'ic-s')} Qué hacer ahora: ${esc(TIPOS[e.tipo])}`, cuerpo);
  };

  const secMiEstado = ({ perfil, miMarca, e }) => {
    const cuerpo = `
      <div class="botonera">
        <button class="btn btn-primario btn-grande" data-yo="evacuado">${icono('ok')}Ya salí del edificio</button>
        <button class="btn btn-primario btn-grande" data-yo="llegada">${icono('ubicacion')}Llegué al punto de encuentro</button>
        <button class="btn btn-secundario btn-grande" data-yo="apoyo">${icono('alerta')}Necesito ayuda</button>
      </div>
      <div class="fila" style="margin-top:.75rem">
        <a class="btn btn-fantasma btn-chico" href="#/rutas">Ruta de evacuación</a>
        <a class="btn btn-fantasma btn-chico" href="#/recomendaciones" data-protocolo="${esc(PROTOCOLO[e.tipo])}">Qué hacer</a>
        <a class="btn btn-fantasma btn-chico" href="#/contactos">Contactos</a>
      </div>`;
    const estadoTxt = miMarca && miMarca.estado ? 'Reportado: ' + insigniaMarca(miMarca) : 'Avise cuando esté a salvo';
    if (perfil === 'persona') {
      return `<section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-verde">${icono('persona')}</div>
          <div><h3>Mi estado</h3><p class="sutil">${estadoTxt}</p></div></div>${cuerpo}</section>`;
    }
    // Quien reporta se marca a sí mismo en su propia lista: «Mi estado» queda plegado.
    return plegable('mi-estado', false, `${icono('persona', 'ic-s')} Mi estado <span class="sutil">· ${estadoTxt}</span>`, cuerpo);
  };

  const secAcompana = ({ aMiCargo }) => aMiCargo.length ? `<section class="tarjeta tarjeta-alerta">
      <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-ambar">${icono('persona')}</div><div><h3>Usted acompaña a alguien</h3><p class="sutil">Esta persona designó que usted la ayude a evacuar</p></div></div>
      ${aMiCargo.map(x => `<div class="contacto"><div class="contacto-txt"><strong>${esc(sesion.nombreDe(x.codigo))}</strong>
        <span class="sutil">${esc(carac.etiqueta(carac.APOYOS, x.apoyo))}${x.detalle ? ': ' + esc(x.detalle) : ''}</span></div></div>`).join('')}
    </section>` : '';

  const secPrioridad = ({ reporta, prioridad, r }) => reporta && prioridad.length ? `<section class="tarjeta tarjeta-alerta">
      <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-ambar">${icono('alerta')}</div><div><h3>Atención prioritaria</h3><p class="sutil">Personas no ubicadas, que piden apoyo, que necesitan asistencia o que registraron que requieren apoyo</p></div></div>
      ${prioridad.map(({ codigo, m }) => {
        const f = r.filas.find(x => x.miembros.some(y => y.codigo === codigo));
        const pre = textoApoyo(codigo);
        return `<div class="contacto"><div class="contacto-txt"><strong>${esc(sesion.nombreDe(codigo))}</strong>
          <span class="sutil">${f ? 'Piso ' + f.piso + ' · ' : ''}${insigniaMarca(m)}${m && m.asistencia ? ' ' + insignia('Asistencia por discapacidad', 'azul') : ''}</span>
          ${pre ? `<span class="chip-apoyo">${icono('alerta', 'ic-s')}<span>${esc(pre)}</span></span>` : ''}${detalleContacto(codigo, m)}</div></div>`;
      }).join('')}
    </section>` : '';

  // Tablero por piso. En el celular muestra seis columnas; «Ver todas las columnas» agrega Apoyo, No estaban y Reporte.
  const secTablero = ({ r, perfil }) => {
    const resumenGrande = `
      <div class="resumen-grande">
        <div><strong>${r.total.evacuados}</strong><span>evacuados de ${enSedeDe(r.total)} en la sede</span></div>
        <div class="${r.total.pendientes ? 't-ambar' : ''}"><strong>${r.total.pendientes}</strong><span>pendientes</span></div>
        <div class="${r.total.noUbicados ? 't-rojo' : ''}"><strong>${r.total.noUbicados}</strong><span>no ubicados</span></div>
        <div class="${r.total.apoyo ? 't-ambar' : ''}"><strong>${r.total.apoyo}</strong><span>requieren apoyo</span></div>
      </div>`;
    const x = 'class="col-extra"';
    const tabla = `
      <div class="tabla-caja"><table class="tablero ${tableroCompleto ? 'completo' : ''}" id="tabla-tablero">
        <thead><tr><th>Piso</th><th>Previstas</th><th>Evacuados</th><th>En el punto</th><th>Pendientes</th><th>No ubicados</th><th ${x}>Apoyo</th><th ${x}>No estaban</th><th ${x}>Reporte</th></tr></thead>
        <tbody>${r.filas.map(f => `<tr>
          <td><strong>Piso ${f.piso}</strong></td><td>${f.esperados}${f.porVerificar ? ` <span class="sutil">+${f.porVerificar} por verificar</span>` : ''}</td>
          <td>${f.evacuados}</td><td>${f.llegaron}</td><td>${f.pendientes}</td><td>${f.noUbicados}</td><td ${x}>${f.apoyo}</td><td ${x}>${f.noEstaban}</td>
          <td ${x}>${f.conteo || f.porConteo ? insignia('Por conteo', 'azul') : r.sinReporte.includes(f.piso) ? insignia('Sin reporte', 'rojo') : f.esperados || f.porVerificar ? insignia('Con reporte', 'verde') : insignia('Vacío', 'gris')}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td>${r.total.esperados}</td><td>${r.total.evacuados}</td><td>${r.total.llegaron}</td><td>${r.total.pendientes}</td><td>${r.total.noUbicados}</td><td ${x}>${r.total.apoyo}</td><td ${x}>${r.total.noEstaban}</td><td ${x}></td></tr></tfoot>
      </table></div>
      <div class="fila entre" style="margin-top:.5rem">
        <button class="btn btn-fantasma btn-chico solo-celular" id="columnas" aria-pressed="${tableroCompleto}">${tableroCompleto ? 'Ver menos columnas' : 'Ver todas las columnas'}</button>
        <button class="btn btn-fantasma btn-chico" id="actualizar">${icono('recargar', 'ic-s')}Actualizar</button>
      </div>`;
    const sinReporte = r.sinReporte.length ? `<div class="nota nota-error" style="margin-top:.75rem">${icono('alerta')}<span>Pisos sin reporte de brigadista: ${r.sinReporte.join(', ')}.</span></div>` : '';
    if (perfil === 'brigadista' || perfil === 'asesor') {
      // Las cifras grandes y el aviso de pisos sin reporte quedan a la vista; la tabla por piso, plegada.
      return `<section class="tarjeta">
          ${resumenGrande}${sinReporte}
          ${plegable('tablero', false, `${icono('edificio', 'ic-s')} Tablero de todos los pisos`, tabla, 'tablero-plegado')}
        </section>`;
    }
    return `<section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-azul">${icono('edificio')}</div>
          <div><h3>Tablero por piso</h3><p class="sutil">Se actualiza solo cada 15 segundos</p></div></div>
        ${resumenGrande}${tabla}${sinReporte}
      </section>`;
  };

  const secReporte = ctx => {
    const { reporta, r, fila, marcas } = ctx;
    if (!reporta) return '';
    const q = normalizar(busqueda);
    const delPiso = fila.miembros.filter(x => !q || normalizar(sesion.nombreDe(x.codigo)).includes(q));
    const otros = q ? (sesion.base().personas || []).filter(p => p.estado === 'activo' && !fila.miembros.some(x => x.codigo === p.codigo) && normalizar(sesion.nombreDe(p.codigo)).includes(q)) : [];
    const grupo = (titulo, lista, extra) => lista.length ? `<h4>${titulo}</h4>${lista.map(x => filaPersona(x.codigo, x.marca, extra, fila.piso)).join('')}` : '';
    // Un brigadista tiene los contactos de su piso; los de otro piso los pide a propósito (queda en la bitácora).
    const pedirOtroPiso = yo.roles.includes('brigadista') && !contacto.esCoordinacion() &&
      fila.piso !== yo.pisoBrigada && !contacto.pisosConsultados.has(fila.piso);
    const hayMapa = vistaReporte === 'mapa';
    // «Todos los pendientes de este piso salieron»: solo a quienes estaban previstos y aún no tienen marca.
    const sinMarca = fila.miembros.filter(x => x.grupo === 'en' && !(x.marca && x.marca.estado));
    const lote = sinMarca.length && !q ? `<button class="btn btn-secundario btn-ancho" id="todos-salieron" style="margin-top:.75rem">${icono('ok', 'ic-s')}Todos los pendientes de este piso salieron (${sinMarca.length})</button>` : '';
    const cuerpoLista = `<input id="buscar" type="search" aria-label="Buscar por nombre en este piso o en todo el Despacho" placeholder="Buscar por nombre en este piso o en todo el Despacho…" value="${esc(busqueda)}" autocomplete="off" style="margin-bottom:.5rem">
        ${grupo('Previstas hoy en este piso', delPiso.filter(x => x.grupo === 'en'), '')}
        ${grupo('Sin reporte del día (verifique si están en la sede)', delPiso.filter(x => x.grupo === 'sin'), '')}
        ${grupo('Reportados aunque no estaban en la lista', delPiso.filter(x => x.grupo === 'extra'), '')}
        ${otros.length ? `<h4>En otros pisos</h4>${otros.map(p => filaPersona(p.codigo, marcas.get(p.codigo), `P${p.piso}-${p.puesto} · `, fila.piso)).join('')}` : ''}
        ${!fila.miembros.length && !otros.length ? '<p class="sutil">No había nadie previsto en este piso al activar.</p>' : ''}`;
    // Mapa: cada puesto muestra el estado de quien está previsto ahí hoy (el puesto de hoy, si está en otro lugar).
    ctx.datosMapa = hayMapa ? datosDelMapa(fila, marcas) : null;
    const cuerpoMapa = hayMapa ? `<div id="mapa-emergencia"></div>
        ${ctx.datosMapa.sinPuesto.length ? `<div style="margin-top:.75rem"><h4>Sin puesto en el mapa</h4><div class="fila">${ctx.datosMapa.sinPuesto.map(g =>
          `<button class="btn btn-secundario btn-chico" data-sin-puesto="${esc(g.codigo)}" aria-label="${esc('Marcar a ' + g.nombre)}">${esc(g.nombre)}</button>`).join('')}</div></div>` : ''}` : '';
    return `
      <section class="tarjeta" id="reporte-piso">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('escudo')}</div>
          <div><h3>Reporte del piso</h3><p class="sutil">Toque «Evacuado» por cada persona que sale; «Más» para los demás estados</p></div></div>
        <div class="fila" id="pisos" style="margin-bottom:.75rem">${r.filas.map(f =>
          `<button class="pestana ${f.piso === fila.piso ? 'activa' : ''}" data-p="${f.piso}">Piso ${f.piso}${f.piso === yo.pisoBrigada ? ' · su brigada' : ''} (${f.esperados})</button>`).join('')}</div>
        ${!contacto.esCoordinacion() && yo.roles.includes('brigadista') ? `<p class="ayuda" style="margin:0 0 .5rem">El contacto de emergencia de una persona aparece cuando la marca «No ubicado» o «Apoyo», o con asistencia por discapacidad.</p>` : ''}
        ${pedirOtroPiso ? `<div class="nota nota-info" style="margin-bottom:.75rem">${icono('telefono')}<span>Los contactos de emergencia del piso ${fila.piso} no están en su celular. Si los necesita, pídalos: queda registrado que usted los consultó.
          <button class="btn btn-secundario btn-chico" id="ver-otro-piso" style="margin-top:.4rem">Ver contactos del piso ${fila.piso}</button></span></div>` : ''}
        <div class="fila no-imprimir" style="margin-bottom:.75rem"><button class="btn btn-secundario btn-chico" id="vista-reporte">${hayMapa ? 'Ver como lista' : 'Ver como mapa'}</button></div>
        ${hayMapa ? cuerpoMapa : cuerpoLista}
        ${lote}
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
      </section>`;
  };

  const secPunto = ({ reporta }) => reporta ? `<a class="btn btn-oscuro btn-ancho btn-grande" href="#/punto" style="margin-bottom:1rem">${icono('ubicacion')}Registrar llegadas al punto de encuentro</a>` : '';

  const secCierre = ({ cierra, e }) => cierra ? `<section class="tarjeta">
      <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-morado">${icono('ok')}</div>
        <div><h3>${e.simulacro ? 'Terminar el simulacro' : 'Cerrar la emergencia'}</h3><p class="sutil">Cuando la brigada y las autoridades lo indiquen</p></div></div>
      <button class="btn btn-oscuro" id="cerrar">${e.simulacro ? 'Terminar simulacro' : 'Cerrar emergencia'}</button>
    </section>` : '';

  // Barra fija abajo (celular): punto de encuentro y conteo del piso, siempre a mano para quien reporta.
  const barraFija = ({ perfil, reporta }) => reporta && perfil !== 'persona' ? `<div class="barra-fija no-imprimir">
      <a class="btn btn-oscuro" href="#/punto">${icono('ubicacion', 'ic-s')}Punto de encuentro</a>
      <button class="btn btn-secundario" id="ir-conteo">Conteo del piso</button>
    </div>` : '';

  const ORDEN = {
    brigadista: [secAlerta, secAvisos, secReporte, secPunto, secPrioridad, secQueHacer, secTablero, secAcompana, secMiEstado, secCierre],
    coordinacion: [secAlerta, secAvisos, secTablero, secPrioridad, secReporte, secPunto, secQueHacer, secAcompana, secMiEstado, secCierre],
    asesor: [secAlerta, secAvisos, secReporte, secPunto, secTablero, secQueHacer, secAcompana, secMiEstado, secCierre],
    persona: [secAlerta, secAvisos, secMiEstado, secQueHacer, secAcompana, secTablero]
  };

  const pintarActiva = a => {
    const e = a.emergencia;
    const r = emergencia.resumen(a);
    const marcas = new Map(a.marcas.map(m => [m.codigo, m]));
    const apoyo = a.marcas.filter(m => m.estado === 'apoyo' || m.asistencia || m.estado === 'no_ubicado');
    // Quienes registraron antes que necesitan apoyo y aún no han salido, más los marcados en la emergencia.
    const aSalvo = c => { const m = marcas.get(c); return !!(m && (m.estado === 'evacuado' || m.llegada)); };
    const ctx = {
      a, e, r, marcas, perfil: perfilVista(),
      reporta: tiene(ROLES_REPORTAR), cierra: tiene(ROLES_CERRAR),
      miMarca: marcas.get(yo.codigo),
      fila: r.filas.find(f => f.piso === pisoSel) || r.filas[0],
      prioridad: [
        ...apoyo.map(m => ({ codigo: m.codigo, m })),
        ...carac.todosLosApoyos().filter(x => x.apoyo !== 'ninguno' && !aSalvo(x.codigo) && !apoyo.some(m => m.codigo === x.codigo))
          .map(x => ({ codigo: x.codigo, m: marcas.get(x.codigo) || null }))
      ],
      // Personas a las que este usuario debe acompañar.
      aMiCargo: carac.todosLosApoyos().filter(x => x.acompanante === yo.codigo && x.apoyo !== 'ninguno'),
      datosMapa: null
    };
    vista.innerHTML = ORDEN[ctx.perfil].map(sec => sec(ctx)).join('\n') + barraFija(ctx);
    enlazarActiva(ctx);
  };

  function enlazarActiva({ e, r, fila, marcas, datosMapa }) {
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
    vista.querySelectorAll('[data-protocolo]').forEach(a => a.addEventListener('click', ev => {
      try { sessionStorage.setItem('protocolo-abrir', ev.currentTarget.dataset.protocolo); } catch { /* sin almacenamiento */ }
    }));
    enlazarRemisiones(vista);
    vista.querySelector('#actualizar')?.addEventListener('click', async () => {
      aviso(await emergencia.traer() ? 'Tablero actualizado.' : 'Sin conexión: se muestra lo último conocido.', 'info');
    });
    vista.querySelector('#columnas')?.addEventListener('click', () => {
      tableroCompleto = !tableroCompleto;
      guardarTableroCompleto(tableroCompleto);
      pintar();
      vista.querySelector('#columnas')?.focus();
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
    vista.querySelector('#todos-salieron')?.addEventListener('click', async () => {
      const codigos = fila.miembros.filter(x => x.grupo === 'en' && !(x.marca && x.marca.estado)).map(x => x.codigo);
      if (!codigos.length) return;
      const nombres = codigos.map(c => esc(sesion.nombreDe(c))).join(', ');
      const n = codigos.length;
      if (!await confirmar(`Marcar ${n} ${n === 1 ? 'persona' : 'personas'} como evacuadas`,
        `Se marcarán como evacuadas: ${nombres}. Quienes ya tienen marca (no ubicado, apoyo, no estaba, evacuado) no cambian.`, `Marcar ${n}`)) return;
      const hechas = await emergencia.marcarVarios(codigos, { estado: 'evacuado' });
      aviso(`${hechas} ${hechas === 1 ? 'persona marcada' : 'personas marcadas'} como evacuadas.`, 'exito');
    });
    vista.querySelector('#ver-otro-piso')?.addEventListener('click', async ev => {
      ev.currentTarget.disabled = true;
      try {
        const n = await contacto.verOtroPiso(fila.piso);
        aviso(n ? `Contactos del piso ${fila.piso} disponibles mientras dure la emergencia.` : `No hay contactos cargados del piso ${fila.piso}.`, n ? 'exito' : 'info');
      } catch (err) {
        aviso(err.codigo === 'RED' ? 'Sin conexión: los contactos de otro piso solo se pueden pedir con internet.' : err.message, 'error');
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
    vista.querySelector('#ir-conteo')?.addEventListener('click', () => {
      const d = vista.querySelector('#conteo');
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ behavior: 'smooth', block: 'center' });
      d.querySelector('#c-ev')?.focus({ preventScroll: true });
    });

    // Cierre
    vista.querySelector('#cerrar')?.addEventListener('click', () => abrirCierre(e, r, ''));
  }

  // Ventana de cierre. «Imprimir acta nominal» no cierra la emergencia: imprime y vuelve a la ventana.
  async function abrirCierre(e, r, obsPrevias) {
    const hayPendientes = !!(r.total.pendientes || r.total.noUbicados || r.sinReporte.length);
    const extra = hayPendientes ? `<div class="nota nota-adv">${icono('alerta')}<span>Atención: hay ${r.total.pendientes} pendiente(s), ${r.total.noUbicados} no ubicado(s)${r.sinReporte.length ? ' y ' + (r.sinReporte.length === 1 ? 'un piso sin reporte' : r.sinReporte.length + ' pisos sin reporte') + ' (' + r.sinReporte.join(', ') + ')' : ''}.</span></div>
      <label class="casilla"><input type="checkbox" id="confirma-fin">La brigada del edificio o la autoridad indicó que terminó</label>` : '';
    const resultado = await modal({
      titulo: e.simulacro ? 'Terminar simulacro' : 'Cerrar emergencia',
      cuerpo: `<p>¿Confirma que ${e.simulacro ? 'el simulacro terminó' : 'la emergencia terminó'}? Se genera el informe de totales y tiempos por piso.</p>${extra}
        <div class="campo"><label class="etiqueta" for="obs">Observaciones del cierre (opcional)</label>
          <textarea id="obs" rows="3" maxlength="600" placeholder="Ej.: la escalera del piso 4 estaba obstruida">${esc(obsPrevias)}</textarea>
          <p class="ayuda">No escriba nombres ni datos de salud: el informe solo lleva totales y tiempos.</p></div>
        <div class="nota nota-info">${icono('info')}<span>El informe lleva solo totales y tiempos. ${esc(textoConservacion())}</span></div>`,
      acciones: [
        { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
        { texto: 'Imprimir acta nominal', clase: 'btn-secundario', valor: f => ({ acta: true, obs: f.querySelector('#obs').value }) },
        {
          texto: e.simulacro ? 'Terminar' : 'Cerrar emergencia', clase: 'btn-peligro',
          antes: f => {
            const caja = f.querySelector('#confirma-fin');
            if (caja && !caja.checked) { aviso('Marque la casilla: confirme que la brigada o la autoridad indicó que terminó.', 'advertencia'); return false; }
          },
          valor: f => ({ obs: f.querySelector('#obs').value.trim() })
        }
      ]
    });
    if (resultado === null) return;
    if (resultado.acta) {
      const a = emergencia.actual();
      if (a) imprimirActa(armarActa(a), a.emergencia);
      setTimeout(() => abrirCierre(e, r, resultado.obs), 300);
      return;
    }
    try {
      const id = await emergencia.cerrar(resultado.obs);
      aviso(e.simulacro ? 'Simulacro terminado. Informe generado.' : 'Emergencia cerrada. Informe generado.', 'exito');
      if (id && tiene(ROLES_REPORTAR)) location.hash = '#/historico?id=' + encodeURIComponent(id);
    } catch (err) { aviso(err.codigo === 'RED' ? 'Sin conexión: no se pudo cerrar. Intente de nuevo con internet.' : err.message, 'error'); }
  }

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
  // Los contactos y las secciones abiertas siguen así al repintar (el evento «toggle» no sube: se escucha en captura).
  const alPlegar = ev => {
    const d = ev.target;
    if (!d.matches) return;
    if (d.matches('details[data-contacto-de]')) {
      if (d.open) contactosAbiertos.add(d.dataset.contactoDe); else contactosAbiertos.delete(d.dataset.contactoDe);
    } else if (d.matches('details[data-seccion]')) abiertas.set(d.dataset.seccion, d.open);
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
