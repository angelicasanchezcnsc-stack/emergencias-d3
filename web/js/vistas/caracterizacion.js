// Mi caracterización para emergencias. Solo la propia persona puede diligenciarla,
// con su autorización informada. Nadie más (ni el administrador) la completa por ella.
import * as sesion from '../sesion.js';
import * as carac from '../caracterizacion.js';
import * as contacto from '../contacto-emergencia.js';
import { esc, icono, aviso, confirmar } from '../ui.js';
import { fechaLegible, fechaBogota } from '../tiempo.js';
import { formularioCaracterizacion } from './form-caracterizacion.js';
import { fichaContacto, ventanaContacto, textoOrigen } from './ventana-contacto.js';

// Mi contacto de emergencia (registro del área de personal, v0.12): aparte de la caracterización y sin
// depender de la autorización. La persona lo ve y lo puede corregir.
function seccionContacto(c, listo, hay) {
  return `<section class="tarjeta" id="mi-contacto">
    <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('telefono')}</div><div><h3>Mi contacto de emergencia</h3>
      <p class="sutil">${c && c.abierto ? esc(textoOrigen(c) || 'Registrado') : 'Lo carga la coordinación desde el registro del área de personal'}</p></div></div>
    ${c && c.abierto ? fichaContacto(c)
      : hay ? `<p class="sutil">Su contacto está cargado, pero aún no se puede abrir con su llave. Se habilita cuando alguien de la coordinación ingrese a la app.</p>`
      : '<p class="sutil">Aún no hay un contacto de emergencia cargado para usted.</p>'}
    <p class="ayuda">Lo ve la coordinación. Los brigadistas de su piso lo ven solo durante una emergencia o un simulacro, y solo si usted queda marcado como no ubicado, con necesidad de apoyo o de asistencia (los de otro piso, además, solo si lo piden, y queda registrado). Va cifrado.</p>
    ${listo && (!hay || (c && c.abierto)) ? `<button class="btn btn-secundario" type="button" id="corregir-contacto">${c ? 'Corregir mi contacto' : 'Registrar mi contacto'}</button>` : ''}
  </section>`;
}

const parrafos = texto => String(texto || '').split(/\n\n+/)
  .map(p => `<p>${esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</p>`).join('');

function seccionProtocolo(p) {
  if (!p) return '';
  return `<section class="tarjeta">
    <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-verde">${icono('libro')}</div><div><h3>${esc(p.titulo)}</h3><p class="sutil">Su protocolo de evacuación según lo que registró</p></div></div>
    ${p.secciones.map(s => `<h4>${esc(s.titulo)}</h4><ol>${s.items.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`).join('')}
  </section>`;
}

const rolDe = p => (p.roles.includes('admin') ? 'administrador' : p.roles.includes('coordinador') ? 'coordinador' : 'suplente');

export async function vistaCaracterizacion(vista) {
  const yo = sesion.perfil();
  vista.innerHTML = '<div class="titulo-vista"><h2>Mi caracterización para emergencias</h2></div><p class="sutil">Cargando…</p>';

  const listo = carac.listoParaUsar();
  const [consent, mio] = await Promise.all([
    carac.consentimientoActual(),
    listo ? carac.leerMio().catch(() => ({ ilegible: true, error: true })) : Promise.resolve(null),
    contacto.cargar({ forzar: true }).catch(() => {})
  ]);
  const miContacto = contacto.contactoDe(yo.codigo);
  const existe = !!mio;
  const ilegible = !!(mio && mio.ilegible);
  const d = (mio && mio.datos) || null;
  const a = (mio && mio.apoyo) || null;
  const aceptada = mio && mio.consentimiento && mio.consentimiento.v;
  const versionCambio = existe && aceptada !== consent.version;
  const colegas = (sesion.base().personas || []).filter(p => p.estado === 'activo' && p.codigo !== yo.codigo)
    .sort((x, y) => sesion.nombreDe(x.codigo).localeCompare(sesion.nombreDe(y.codigo), 'es'));
  const lectores = carac.lectores();
  const formu = formularioCaracterizacion({ datos: d, apoyo: a, colegas });
  const protocolo = existe && !ilegible ? await carac.protocoloIndividual(carac.idProtocoloIndividual(d, a)) : null;
  const fechaAut = mio && mio.consentimiento ? mio.consentimiento.f : (mio && mio.actualizado);

  vista.innerHTML = `
    <div class="titulo-vista"><h2>Mi caracterización para emergencias</h2>
      <p class="sutil">Piso ${yo.piso} · Puesto ${yo.puesto} · Es voluntaria y solo usted puede diligenciarla</p></div>

    ${!listo ? `<div class="nota nota-adv">${icono('candado')}<span>Para proteger sus datos con su llave personal, <strong>cierre la sesión y vuelva a ingresar</strong>. Después podrá diligenciar este formulario.</span></div>` : ''}
    ${ilegible ? `<div class="nota nota-adv">${icono('alerta')}<span>${mio.error ? 'No se pudo abrir su registro.' : 'Su registro guardado no se puede abrir con su llave actual (por ejemplo, si le restablecieron la contraseña).'} Se vuelve a habilitar cuando alguien de la coordinación ingrese, o puede diligenciarlo de nuevo y reemplazar el anterior.</span></div>` : ''}
    ${existe && !ilegible ? `<div class="nota nota-exito">${icono('ok')}<span>Su caracterización está guardada. Autorizó el ${esc(fechaLegible(fechaBogota(new Date(fechaAut))))} (texto ${esc(aceptada || '—')}). Puede cambiarla o borrarla cuando quiera.</span></div>` : ''}
    ${versionCambio ? `<div class="nota nota-info">${icono('info')}<span>El texto de la autorización cambió (${esc(aceptada)} → ${esc(consent.version)}). Léalo y acéptelo de nuevo al guardar.</span></div>` : ''}

    ${seccionContacto(miContacto, listo, contacto.hayContacto(yo.codigo))}

    <section class="tarjeta">
      <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-azul">${icono('escudo')}</div><div><h3>Para qué sirve</h3><p class="sutil">En una evacuación, saber qué apoyo necesita cada persona ahorra tiempo</p></div></div>
      <p>No tiene que llenarla. Si la diligencia, sus datos se <strong>cifran en su celular</strong>: Google y GitHub solo guardan texto ilegible.</p>
      <ul class="lista-simple">
        <li><strong>Ven el detalle completo:</strong> usted${lectores.length ? ' y ' + lectores.map(p => `${esc(sesion.nombreDe(p.codigo))} (${rolDe(p)})`).join(', ') : ' y la coordinación'}.</li>
        <li><strong>Los brigadistas de su piso ven solo</strong>, durante una emergencia o un simulacro, si necesita apoyo, de qué tipo y quién lo acompaña.</li>
        <li>Nadie más ve nada.</li>
      </ul>
    </section>

    <form id="f-carac" class="pila" ${!listo ? 'inert style="opacity:.6"' : ''}>
      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-ambar">${icono('libro')}</div><div><h3>Autorización de tratamiento de datos</h3><p class="sutil">Léala completa antes de continuar · versión ${esc(consent.version)}</p></div></div>
        <div class="texto-legal" tabindex="0">${parrafos(consent.texto)}</div>
        <label class="casilla"><input type="checkbox" id="acepto" ${existe && !versionCambio ? 'checked' : ''}><span><strong>He leído y autorizo</strong> el tratamiento de mis datos personales y sensibles para esta finalidad.</span></label>
        <label class="casilla"><input type="checkbox" id="tercero" ${existe ? 'checked' : ''}><span>Informé a mi contacto de emergencia que sus datos se usarán solo para avisarle en una emergencia.</span></label>
      </section>

${formu.html}

      <div id="error" class="nota nota-error oculto"></div>
      <div class="fila">
        <button class="btn btn-primario btn-grande" type="submit" id="guardar">${icono('guardar')}Guardar mi caracterización</button>
        ${existe ? '<button class="btn btn-peligro" type="button" id="revocar">Revocar mi autorización y borrar mis datos</button>' : ''}
      </div>
    </form>

    ${seccionProtocolo(protocolo)}`;

  vista.querySelector('#corregir-contacto')?.addEventListener('click', async () => {
    const r = await ventanaContacto({
      titulo: miContacto ? 'Corregir mi contacto de emergencia' : 'Registrar mi contacto de emergencia', contacto: miContacto,
      ayuda: 'Si la coordinación vuelve a cargar el archivo del área de personal, este contacto se reemplaza: avísele también a ella del cambio.'
    });
    if (!r) return;
    try {
      await contacto.guardar(yo.codigo, r.datos, r.salud, miContacto ? miContacto.version : 0);
      aviso('Su contacto de emergencia quedó guardado y cifrado.', 'exito');
      vistaCaracterizacion(vista);
    } catch (e) { aviso(e.codigo === 'RED' ? 'Sin conexión: el contacto solo se puede guardar con internet.' : e.message, 'error'); }
  });

  const f = vista.querySelector('#f-carac');
  formu.enlazar(f);

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const error = f.querySelector('#error');
    const falla = m => { error.innerHTML = `${icono('alerta')}<span>${esc(m)}</span>`; error.classList.remove('oculto'); error.scrollIntoView({ block: 'center' }); };
    error.classList.add('oculto');
    if (!f.acepto.checked) return falla('Para guardar debe leer y aceptar la autorización de tratamiento de datos.');
    if (!f.tercero.checked) return falla('Confirme que informó a su contacto de emergencia.');
    const lectura = formu.leer(f, { propia: true });
    if (lectura.error) return falla(lectura.error);
    const { datos, apoyo: apoyoDatos } = lectura;
    const boton = f.querySelector('#guardar');
    boton.disabled = true;
    try {
      const r = await carac.guardarMio(datos, apoyoDatos, consent.version, existe && !ilegible ? mio.version : undefined);
      aviso(r.sinAcceso && r.sinAcceso.length
        ? 'Guardada. La coordinación podrá abrirla cuando ingrese por primera vez a su cuenta.'
        : 'Caracterización guardada y cifrada.', 'exito');
      sesion.refrescar().catch(() => {});
      vistaCaracterizacion(vista);
    } catch (e) {
      falla(e.codigo === 'RED' ? 'Sin conexión: la caracterización solo se puede guardar con internet.' : e.message);
      boton.disabled = false;
    }
  });

  f.querySelector('#revocar')?.addEventListener('click', async () => {
    if (!await confirmar('Revocar autorización', 'Se borrarán todos sus datos de caracterización. Podrá volver a diligenciarla cuando quiera.', 'Borrar mis datos', true)) return;
    try { await carac.revocarMio(); aviso('Su autorización fue revocada y sus datos se borraron.', 'exito'); vistaCaracterizacion(vista); }
    catch (e) { aviso(e.codigo === 'RED' ? 'Sin conexión: intente de nuevo con internet.' : e.message, 'error'); }
  });
}
