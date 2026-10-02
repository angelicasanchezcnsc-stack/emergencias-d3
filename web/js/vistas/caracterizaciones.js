// Caracterizaciones del Despacho: solo para administrador, coordinador y suplente.
import * as sesion from '../sesion.js';
import * as carac from '../caracterizacion.js';
import { esc, icono, aviso, insignia, modal } from '../ui.js';
import { fechaLegible, fechaBogota } from '../tiempo.js';

const { CATEGORIAS, APOYOS, etiqueta } = carac;
const tel = t => String(t || '').replace(/[^\d+]/g, '');

function detalle(p, r) {
  const d = r.datos, a = r.apoyo;
  const fila = (t, v) => `<tr><th>${t}</th><td>${v ? esc(v) : '<span class="sutil">—</span>'}</td></tr>`;
  const acomp = a.acompanante ? sesion.nombreDe(a.acompanante) : '';
  return modal({
    titulo: sesion.nombreDe(p.codigo), ancho: 'ancho',
    cuerpo: `
      <p class="sutil">Piso ${p.piso} · Puesto ${p.puesto} · Diligenciada el ${esc(fechaLegible(fechaBogota(new Date(r.actualizado))))} · autorización ${esc((r.consentimiento && r.consentimiento.v) || '—')}</p>
      <div class="nota nota-adv">${icono('candado')}<span>Datos sensibles. Úselos solo para la atención de emergencias; no los copie ni los comparta.</span></div>
      <table class="tabla-ficha"><tbody>
        ${fila('Cargo o vinculación', d.vinculacion)}
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

  const pintar = () => {
    const visibles = lista.filter(({ r }) => filtro === 'todas' ? true : filtro === 'apoyo' ? (r && r.estado === 'ok' && r.apoyo.apoyo !== 'ninguno') : !r);
    vista.querySelector('#tabla').innerHTML = visibles.length ? `<div class="tabla-caja"><table>
      <thead><tr><th>Persona</th><th>Ubicación</th><th>Estado</th><th>Condición</th><th>Apoyo</th><th>Contacto de emergencia</th><th></th></tr></thead>
      <tbody>${visibles.map(({ p, r }) => {
        const ok = r && r.estado === 'ok';
        return `<tr data-codigo="${esc(p.codigo)}">
          <td><strong>${esc(sesion.nombreDe(p.codigo))}</strong></td><td class="mono">P${p.piso}-${p.puesto}</td>
          <td>${!r ? insignia('Sin diligenciar', 'gris') : ok ? insignia('Diligenciada', 'verde') : insignia('Sin acceso aún', 'ambar')}</td>
          <td>${ok ? esc(etiqueta(CATEGORIAS, r.datos.categoria)) : '—'}</td>
          <td>${ok ? (r.apoyo.apoyo === 'ninguno' ? 'No necesita' : insignia(etiqueta(APOYOS, r.apoyo.apoyo), 'rojo')) : '—'}</td>
          <td>${ok && r.datos.contacto.telefono ? `${esc(r.datos.contacto.nombre)} · <a href="tel:${esc(tel(r.datos.contacto.telefono))}">${esc(r.datos.contacto.telefono)}</a>` : '—'}</td>
          <td>${ok ? '<button class="btn btn-secundario btn-chico" data-ver>Ver detalle</button>' : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="sutil">Nadie con este filtro.</p>';
    vista.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
      const codigo = b.closest('[data-codigo]').dataset.codigo;
      detalle(personas.find(p => p.codigo === codigo), porCodigo.get(codigo));
    }));
  };

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Caracterizaciones</h2><p class="sutil">Solo la coordinación y la administración ven esta información</p></div>
      ${sesion.tieneRol('admin') ? '<button class="btn btn-secundario btn-chico" id="editar-texto">Editar texto de la autorización</button>' : ''}
    </div>
    ${!listo ? `<div class="nota nota-adv">${icono('candado')}<span>Cierre la sesión y vuelva a ingresar para activar su llave personal; sin ella no puede abrir los registros.</span></div>` : ''}
    ${sinAcceso ? `<div class="nota nota-info">${icono('info')}<span>${sinAcceso} registro(s) aún no se pueden abrir con su llave. Se habilitan solos cuando alguien más de la coordinación ingresa; mientras tanto no cambie roles ni contraseñas.</span></div>` : ''}
    <div class="resumen-grande">
      <div><strong>${hechas}</strong><span>de ${personas.length} diligenciaron</span></div>
      <div class="${requieren ? 't-ambar' : ''}"><strong>${requieren}</strong><span>necesitan apoyo para evacuar</span></div>
      <div><strong>${personas.length - hechas}</strong><span>sin diligenciar</span></div>
      <div><strong>${lectoresTexto()}</strong><span>con acceso al detalle</span></div>
    </div>
    <div class="fila" id="filtro" style="margin-bottom:1rem">
      <button class="pestana activa" data-f="todas">Todas</button>
      <button class="pestana" data-f="apoyo">Necesitan apoyo</button>
      <button class="pestana" data-f="pendientes">Sin diligenciar</button>
    </div>
    <div id="tabla"></div>
    <p class="ayuda" style="margin-top:1rem">Cada persona diligencia la suya con su autorización; nadie puede completarla por otra. Si una persona se retira del Despacho, su registro se borra.</p>`;

  vista.querySelectorAll('#filtro button').forEach(b => b.addEventListener('click', () => {
    vista.querySelectorAll('#filtro button').forEach(x => x.classList.toggle('activa', x === b));
    filtro = b.dataset.f;
    pintar();
  }));

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
