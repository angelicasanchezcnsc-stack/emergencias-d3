// Caracterizaciones del Despacho: solo para administrador, coordinador y suplente.
// Incluye la caracterización asistida: la coordinación registra a las personas sin acceso al
// aplicativo a partir de un formato de autorización impreso y firmado por ellas.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as carac from '../caracterizacion.js';
import { esc, icono, aviso, insignia, modal, confirmar, barraBusqueda, enlazarBusqueda, coincide } from '../ui.js';
import { fechaLegible, fechaBogota } from '../tiempo.js';
import { formularioCaracterizacion } from './form-caracterizacion.js';

const { CATEGORIAS, APOYOS, VINCULACIONES, etiqueta } = carac;
const tel = t => String(t || '').replace(/[^\d+]/g, '');
const parrafos = texto => String(texto || '').split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join('');
const porNombre = (x, y) => sesion.nombreDe(x.codigo).localeCompare(sesion.nombreDe(y.codigo), 'es');
// Texto en el que se busca a una persona: nombre, código y puesto.
const textoPersona = p => [sesion.nombreDe(p.codigo), p.codigo, `P${p.piso}-${p.puesto}`, `piso ${p.piso} puesto ${p.puesto}`].join(' ');
const opcionPersona = (p, elegida) => `<option value="${esc(p.codigo)}" ${p.codigo === elegida ? 'selected' : ''}>${esc(sesion.nombreDe(p.codigo))} (P${p.piso}-${p.puesto})</option>`;

function detalle(p, r) {
  const d = r.datos, a = r.apoyo;
  const fila = (t, v) => `<tr><th>${t}</th><td>${v ? esc(v) : '<span class="sutil">—</span>'}</td></tr>`;
  const acomp = a.acompanante ? sesion.nombreDe(a.acompanante) : '';
  const fisico = r.modo === 'fisico';
  return modal({
    titulo: sesion.nombreDe(p.codigo), ancho: 'ancho',
    cuerpo: `
      <p class="sutil">Piso ${p.piso} · Puesto ${p.puesto} · Diligenciada el ${esc(fechaLegible(fechaBogota(new Date(r.actualizado))))} · autorización ${esc((r.consentimiento && r.consentimiento.v) || '—')}${fisico ? ` · formato firmado el ${esc(fechaLegible(String(r.consentimiento.f).slice(0, 10)))}, registrada por ${esc(sesion.nombreDe(r.consentimiento.por))}` : ''}</p>
      <div class="nota nota-adv">${icono('candado')}<span>Datos sensibles. Úselos solo para la atención de emergencias; no los copie ni los comparta.</span></div>
      <table class="tabla-ficha"><tbody>
        ${fila('Empleo o vinculación', d.vinculacion)}
        ${fila('Contacto de emergencia', [d.contacto.nombre, d.contacto.parentesco && '(' + d.contacto.parentesco + ')'].filter(Boolean).join(' '))}
        <tr><th>Teléfono del contacto</th><td>${d.contacto.telefono ? `<a href="tel:${esc(tel(d.contacto.telefono))}">${esc(d.contacto.telefono)}</a>` : '—'}</td></tr>
        ${fila('Condición relevante', etiqueta(CATEGORIAS, d.categoria))}
        ${fila('Nota operativa', d.nota)}
        ${fila('Apoyo requerido', etiqueta(APOYOS, a.apoyo))}
        ${fila('Detalle del apoyo', a.detalle)}
        ${fila('Acompañante', acomp)}
        ${fila('Observaciones', d.observaciones)}
      </tbody></table>`
  });
}

// Formato en blanco para que la persona lo diligencie y firme a mano. No pide número de documento.
function imprimirFormato(consent) {
  const casillas = lista => lista.map(([, t]) => `☐ ${esc(t)}`).join('&nbsp;&nbsp;&nbsp; ');
  const campo = (t, alto = '1.1cm') => `<tr><th>${t}</th><td style="height:${alto}"></td></tr>`;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="censo-impreso">
      <h1>${esc(CONFIG.APP_NOMBRE)}: formato de autorización de tratamiento de datos</h1>
      <p>Despacho 3, sede Calle 96 · Caracterización para emergencias · texto de la autorización, versión ${esc(consent.version)}</p>
      <h2>Autorización</h2>
      ${parrafos(consent.texto)}
      <h2>Datos de la persona</h2>
      <table class="tabla-ficha"><tbody>
        ${campo('Nombre completo')}
        <tr><th>Empleo o vinculación</th><td style="height:1.1cm">${VINCULACIONES.map(v => '☐ ' + esc(v)).join('&nbsp;&nbsp;&nbsp; ')}</td></tr>
        ${campo('Contacto de emergencia: nombre')}
        ${campo('Contacto de emergencia: parentesco')}
        ${campo('Contacto de emergencia: teléfono')}
        <tr><th>Condición relevante para evacuar</th><td style="height:1.6cm">${casillas(CATEGORIAS)}</td></tr>
        ${campo('Nota operativa (sin diagnósticos ni nombres de enfermedades)', '1.6cm')}
        <tr><th>Apoyo que necesita para evacuar</th><td style="height:1.1cm">${casillas(APOYOS)}</td></tr>
        ${campo('¿Qué necesita exactamente? (breve)')}
        ${campo('Persona que la acompaña (opcional)')}
        ${campo('Observaciones (opcional)', '1.6cm')}
      </tbody></table>
      <h2>Firma</h2>
      <p>Con mi firma declaro que leí la autorización anterior y autorizo el tratamiento de mis datos personales y sensibles para esta finalidad. Informé a mi contacto de emergencia que sus datos se usarán solo para avisarle en una emergencia.</p>
      <table class="tabla-ficha"><tbody>
        ${campo('Nombre', '1.4cm')}
        ${campo('Firma', '2cm')}
        ${campo('Fecha de la firma (día, mes y año)', '1.4cm')}
      </tbody></table>
      <p class="aviso-datos">Documento con datos personales y sensibles, solo para la atención de emergencias (Ley 1581 de 2012). Una vez firmado, lo custodia la coordinación; la caracterización se registra en el aplicativo desde Gestión, Caracterizaciones.</p>
    </div>`);
  document.body.classList.add('censo-activo');
  addEventListener('afterprint', () => { document.getElementById('censo-impreso')?.remove(); document.body.classList.remove('censo-activo'); }, { once: true });
  setTimeout(() => print(), 50);
}

// Ventana para registrar (o corregir) la caracterización de una persona sin acceso.
// pre: { codigo?, datos?, apoyo?, fecha?, version? }. Si falla el guardado, se vuelve a abrir con lo escrito.
async function abrirAsistida(vista, pre = {}) {
  const edicion = !!pre.codigo && pre.version !== undefined;
  const consent = await carac.consentimientoActual();
  const hoy = fechaBogota();
  const candidatas = (sesion.base().personas || []).filter(p => p.estado === 'activo' && !p.roles.length).sort(porNombre);
  if (!edicion && !candidatas.length) { aviso('Todas las personas activas tienen acceso: cada una diligencia la suya desde «Mi caracterización».', 'info'); return; }
  const colegas = (sesion.base().personas || []).filter(p => p.estado === 'activo' && p.codigo !== pre.codigo).sort(porNombre);
  const formu = formularioCaracterizacion({ datos: pre.datos, apoyo: pre.apoyo, colegas, asistida: true });
  let lectura = null;
  const respuesta = modal({
    titulo: edicion ? 'Editar caracterización asistida' : 'Registrar caracterización asistida', ancho: 'ancho',
    cuerpo: `
      <p class="sutil">Solo para personas sin acceso al aplicativo que ya firmaron el formato de autorización impreso. Guarde el formato firmado con la custodia de la coordinación.</p>
      ${edicion ? '' : barraBusqueda({ id: 'as-buscar', etiqueta: 'Buscar a la persona', ejemplo: 'Nombre o puesto (P2-14)' })}
      <div class="campo"><label class="etiqueta" for="as-persona">Persona</label>
        <select id="as-persona" ${edicion ? 'disabled' : ''}>${edicion ? '' : '<option value="">Elija a la persona…</option>'}${(edicion ? candidatasEdicion(pre.codigo) : candidatas).map(p =>
          opcionPersona(p, pre.codigo)).join('')}</select></div>
      <div class="pila">${formu.html}</div>
      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-ambar">${icono('libro')}</div><div><h3>Formato firmado</h3><p class="sutil">Autorización, texto versión ${esc(consent.version)}</p></div></div>
        <label class="casilla"><input type="checkbox" id="as-firmo"><span>La persona firmó el formato de autorización versión ${esc(consent.version)}.</span></label>
        <div class="campo"><label class="etiqueta" for="as-fecha">Fecha de la firma</label><input id="as-fecha" type="date" max="${hoy}" value="${esc(pre.fecha || '')}"></div>
      </section>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Guardar', clase: 'btn-oscuro',
        antes: f => {
          const codigo = f.querySelector('#as-persona').value;
          const l = formu.leer(f, { propia: false });
          const fecha = f.querySelector('#as-fecha').value;
          const error = !codigo ? 'Elija a la persona.'
            : l.error ? l.error
            : !f.querySelector('#as-firmo').checked ? 'Marque la casilla: confirme que la persona firmó el formato de autorización.'
            : !fecha ? 'Indique la fecha de la firma.'
            : fecha > hoy ? 'La fecha de la firma no puede ser futura.' : '';
          if (error) { aviso(error, 'error'); return false; }
          lectura = { codigo, datos: l.datos, apoyo: l.apoyo, fecha };
        },
        valor: () => lectura
      }
    ]
  });
  // El modal ya está en pantalla: se conectan los eventos del formulario compartido y la búsqueda.
  const fondo = [...document.querySelectorAll('.modal-fondo')].pop();
  formu.enlazar(fondo);
  if (!edicion) {
    const sel = fondo.querySelector('#as-persona');
    const busqueda = enlazarBusqueda(fondo, 'as-buscar', v => {
      const elegida = sel.value;
      const lista = candidatas.filter(p => p.codigo === elegida || coincide(textoPersona(p), v));
      sel.innerHTML = '<option value="">Elija a la persona…</option>' + lista.map(p => opcionPersona(p, elegida)).join('');
      // Si queda una sola persona, se elige sola.
      if (v && lista.length === 1) sel.value = lista[0].codigo;
      busqueda.conteo(!v ? '' : lista.length === 1 ? `Una coincidencia: ${sesion.nombreDe(lista[0].codigo)}, elegida.` : `${lista.length} coincidencias.`);
    });
  }
  const r = await respuesta;
  if (!r) return;
  try {
    await carac.guardarAsistida(r.codigo, r.datos, r.apoyo, consent.version, r.fecha, edicion ? pre.version : undefined);
    aviso('Caracterización asistida guardada. Guarde el formato firmado con la custodia de la coordinación.', 'exito');
    vistaCaracterizaciones(vista);
  } catch (e) {
    aviso(e.codigo === 'RED' ? 'Sin conexión: la caracterización solo se puede guardar con internet.' : e.message, 'error');
    abrirAsistida(vista, { ...pre, codigo: r.codigo, datos: r.datos, apoyo: r.apoyo, fecha: r.fecha });
  }
}
const candidatasEdicion = codigo => (sesion.base().personas || []).filter(p => p.codigo === codigo);

export async function vistaCaracterizaciones(vista) {
  vista.innerHTML = '<div class="titulo-vista"><h2>Caracterizaciones</h2></div><p class="sutil">Abriendo registros…</p>';
  let registros;
  try { registros = await carac.leerTodas(); }
  catch (e) {
    vista.innerHTML = `<div class="titulo-vista"><h2>Caracterizaciones</h2></div><div class="nota nota-error">${icono('alerta')}<span>${esc(e.codigo === 'RED' ? 'Sin conexión: esta información solo se abre con internet.' : e.message)}</span></div>`;
    return;
  }
  const listo = carac.listoParaUsar();
  const porCodigo = new Map(registros.map(r => [r.codigo, r]));
  const personas = (sesion.base().personas || []).filter(p => p.estado === 'activo')
    .sort((x, y) => x.piso - y.piso || x.puesto - y.puesto);
  const lista = personas.map(p => ({ p, r: porCodigo.get(p.codigo) || null }));
  const hechas = lista.filter(x => x.r).length;
  const sinAcceso = lista.filter(x => x.r && x.r.estado !== 'ok').length;
  const requieren = lista.filter(x => x.r && x.r.estado === 'ok' && x.r.apoyo.apoyo !== 'ninguno').length;
  let filtro = 'todas';
  let texto = '';
  let busqueda = null;

  const pintar = () => {
    const visibles = lista.filter(({ p, r }) => (filtro === 'todas' ? true : filtro === 'apoyo' ? (r && r.estado === 'ok' && r.apoyo.apoyo !== 'ninguno') : !r)
      && coincide(textoPersona(p), texto));
    if (busqueda) busqueda.conteo(texto ? `Se muestran ${visibles.length} de ${lista.length} personas.` : '');
    vista.querySelector('#tabla').innerHTML = visibles.length ? `<div class="tabla-caja"><table>
      <thead><tr><th>Persona</th><th>Ubicación</th><th>Estado</th><th>Condición</th><th>Apoyo</th><th>Contacto de emergencia</th><th></th></tr></thead>
      <tbody>${visibles.map(({ p, r }) => {
        const ok = r && r.estado === 'ok';
        // Las registradas con formato firmado se pueden corregir o revocar mientras la persona siga sin acceso.
        const asistida = !!r && r.modo === 'fisico' && !r.conAcceso && listo;
        return `<tr data-codigo="${esc(p.codigo)}">
          <td><strong>${esc(sesion.nombreDe(p.codigo))}</strong></td><td class="mono">P${p.piso}-${p.puesto}</td>
          <td>${!r ? insignia('Sin diligenciar', 'gris') : (ok ? insignia('Diligenciada', 'verde') : insignia('Sin acceso aún', 'ambar')) + ' ' + (r.modo === 'fisico' ? insignia('Asistida', 'azul') : insignia('Propia', 'gris'))}</td>
          <td>${ok ? esc(etiqueta(CATEGORIAS, r.datos.categoria)) : '—'}</td>
          <td>${ok ? (r.apoyo.apoyo === 'ninguno' ? 'No necesita' : insignia(etiqueta(APOYOS, r.apoyo.apoyo), 'rojo')) : '—'}</td>
          <td>${ok && r.datos.contacto.telefono ? `${esc(r.datos.contacto.nombre)} · <a href="tel:${esc(tel(r.datos.contacto.telefono))}">${esc(r.datos.contacto.telefono)}</a>` : '—'}</td>
          <td>${ok ? '<button class="btn btn-secundario btn-chico" data-ver>Ver detalle</button>' : ''}
            ${asistida && ok ? '<button class="btn btn-fantasma btn-chico" data-editar>Editar</button>' : ''}
            ${asistida ? '<button class="btn btn-fantasma btn-chico" data-revocar>Revocar (a solicitud de la persona)</button>' : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="sutil">Nadie con este filtro.</p>';
    vista.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
      const codigo = b.closest('[data-codigo]').dataset.codigo;
      detalle(personas.find(p => p.codigo === codigo), porCodigo.get(codigo));
    }));
    vista.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
      const codigo = b.closest('[data-codigo]').dataset.codigo;
      const r = porCodigo.get(codigo);
      abrirAsistida(vista, { codigo, datos: r.datos, apoyo: r.apoyo, version: r.version, fecha: String(r.consentimiento && r.consentimiento.f || '').slice(0, 10) });
    }));
    vista.querySelectorAll('[data-revocar]').forEach(b => b.addEventListener('click', async () => {
      const codigo = b.closest('[data-codigo]').dataset.codigo;
      if (!await confirmar('Revocar autorización', `Se borrarán todos los datos de caracterización de ${esc(sesion.nombreDe(codigo))}, a solicitud de la persona. El formato firmado lo custodia la coordinación: destrúyalo si ella lo pide.`, 'Borrar sus datos', true)) return;
      try { await carac.revocarDe(codigo); aviso('Autorización revocada y datos borrados.', 'exito'); vistaCaracterizaciones(vista); }
      catch (e) { aviso(e.codigo === 'RED' ? 'Sin conexión: intente de nuevo con internet.' : e.message, 'error'); }
    }));
  };

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Caracterizaciones</h2><p class="sutil">Solo la coordinación y la administración ven esta información</p></div>
      <div class="fila no-imprimir">
        <button class="btn btn-secundario btn-chico" id="imprimir-formato">${icono('imprimir', 'ic-s')}Imprimir formato de autorización</button>
        <button class="btn btn-primario btn-chico" id="registrar-asistida" ${listo ? '' : 'disabled'}>${icono('persona', 'ic-s')}Registrar caracterización asistida</button>
        ${sesion.tieneRol('admin') ? '<button class="btn btn-secundario btn-chico" id="editar-texto">Editar texto de la autorización</button>' : ''}
      </div>
    </div>
    ${!listo ? `<div class="nota nota-adv">${icono('candado')}<span>Cierre la sesión y vuelva a ingresar para activar su llave personal; sin ella no puede abrir los registros.</span></div>` : ''}
    ${sinAcceso ? `<div class="nota nota-info">${icono('info')}<span>${sinAcceso} registro(s) aún no se pueden abrir con su llave. Se habilitan solos cuando alguien más de la coordinación ingresa; mientras tanto no cambie roles ni contraseñas.</span></div>` : ''}
    <div class="resumen-grande">
      <div><strong>${hechas}</strong><span>de ${personas.length} diligenciaron</span></div>
      <div class="${requieren ? 't-ambar' : ''}"><strong>${requieren}</strong><span>necesitan apoyo para evacuar</span></div>
      <div><strong>${personas.length - hechas}</strong><span>sin diligenciar</span></div>
      <div><strong>${lectoresTexto()}</strong><span>con acceso al detalle</span></div>
    </div>
    ${barraBusqueda({ id: 'buscar-carac', ejemplo: 'Nombre, código o puesto (P2-14)' })}
    <div class="fila" id="filtro" style="margin-bottom:1rem">
      <button class="pestana activa" data-f="todas">Todas</button>
      <button class="pestana" data-f="apoyo">Necesitan apoyo</button>
      <button class="pestana" data-f="pendientes">Sin diligenciar</button>
    </div>
    <div id="tabla"></div>
    <p class="ayuda" style="margin-top:1rem">Quien tiene acceso al aplicativo diligencia la suya, con su propia autorización. A quien no tiene acceso se le registra con el formato impreso y firmado, que custodia la coordinación (caracterización asistida). Si una persona se retira del Despacho, su registro se borra.</p>`;

  vista.querySelectorAll('#filtro button').forEach(b => b.addEventListener('click', () => {
    vista.querySelectorAll('#filtro button').forEach(x => x.classList.toggle('activa', x === b));
    filtro = b.dataset.f;
    pintar();
  }));

  busqueda = enlazarBusqueda(vista, 'buscar-carac', v => { texto = v; pintar(); });
  vista.querySelector('#imprimir-formato').addEventListener('click', async () => imprimirFormato(await carac.consentimientoActual()));
  vista.querySelector('#registrar-asistida').addEventListener('click', () => abrirAsistida(vista));

  vista.querySelector('#editar-texto')?.addEventListener('click', async () => {
    const actual = await carac.consentimientoActual();
    const texto = await modal({
      titulo: 'Texto de la autorización', ancho: 'ancho',
      cuerpo: `<p class="sutil">Versión actual: ${esc(actual.version)}. Al guardar, la versión sube y cada persona deberá aceptar de nuevo al actualizar su caracterización. Separe los párrafos con una línea en blanco.</p>
        <div class="nota nota-adv">${icono('info')}<span>Este texto es un borrador estándar basado en la Ley 1581 de 2012 y el Decreto 1377 de 2013. Debe revisarlo el área jurídica o el oficial de protección de datos de la CNSC.</span></div>
        <textarea id="texto-aut" rows="16">${esc(actual.texto)}</textarea>`,
      acciones: [{ texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
        { texto: 'Guardar nueva versión', clase: 'btn-oscuro', valor: f => f.querySelector('#texto-aut').value.trim() }]
    });
    if (!texto) return;
    try { await carac.guardarConsentimiento(texto); aviso('Texto guardado como nueva versión.', 'exito'); }
    catch (e) { aviso(e.codigo === 'RED' ? 'Sin conexión: solo se puede guardar con internet.' : e.message, 'error'); }
  });

  pintar();
}

function lectoresTexto() { return carac.lectores().length; }
