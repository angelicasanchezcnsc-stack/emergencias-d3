// Formulario de caracterización compartido: lo usan «Mi caracterización» (la propia persona) y la
// caracterización asistida (la coordinación, para personas sin acceso). Solo contiene los datos y el
// apoyo para evacuar; la autorización cambia según quién diligencia y la pone cada pantalla.
import * as sesion from '../sesion.js';
import * as carac from '../caracterizacion.js';
import { esc, icono, barraBusqueda, enlazarBusqueda, coincide } from '../ui.js';

const { CATEGORIAS, APOYOS } = carac;
const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(t)}</option>`).join('');
const opcionColega = (p, elegido) => `<option value="${esc(p.codigo)}" ${p.codigo === elegido ? 'selected' : ''}>${esc(sesion.nombreDe(p.codigo))} (P${p.piso}-${p.puesto})</option>`;
const textoColega = p => [sesion.nombreDe(p.codigo), `P${p.piso}-${p.puesto}`, `piso ${p.piso} puesto ${p.puesto}`].join(' ');

const DATOS_VACIOS = { contacto: { nombre: '', parentesco: '', telefono: '' }, categoria: 'ninguna', nota: '', observaciones: '' };
const APOYO_VACIO = { apoyo: 'ninguno', detalle: '', acompanante: null };

// datos / apoyo: valores actuales (o nada). colegas: personas que pueden ser acompañantes.
// asistida: true cuando la diligencia la coordinación en nombre de otra persona.
// Devuelve { html, enlazar(f), leer(f) }: el HTML de las dos secciones, la conexión de sus eventos y
// la lectura validada de lo escrito ({ datos, apoyo } o { error }).
export function formularioCaracterizacion({ datos, apoyo, colegas = [], asistida = false }) {
  const d = datos || DATOS_VACIOS;
  const a = apoyo || APOYO_VACIO;
  const html = `
      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-verde">${icono('persona')}</div><div><h3>${asistida ? 'Datos de la persona' : 'Mis datos'}</h3><p class="sutil">Registre solo lo necesario para una evacuación segura</p></div></div>
        <h4>Contacto de emergencia</h4>
        <div class="campo"><label class="etiqueta" for="c-nombre">Nombre</label><input id="c-nombre" type="text" maxlength="80" value="${esc(d.contacto.nombre)}" autocomplete="off"></div>
        <div class="fila">
          <div class="campo" style="flex:1;min-width:10rem"><label class="etiqueta" for="c-parentesco">Parentesco</label><input id="c-parentesco" type="text" maxlength="40" value="${esc(d.contacto.parentesco)}" placeholder="Ej.: madre, esposo" autocomplete="off"></div>
          <div class="campo" style="flex:1;min-width:10rem"><label class="etiqueta" for="c-telefono">Teléfono</label><input id="c-telefono" type="tel" maxlength="20" value="${esc(d.contacto.telefono)}" autocomplete="off"></div>
        </div>
        <h4>Condición relevante para evacuar</h4>
        <div class="campo"><label class="etiqueta" for="categoria">Categoría</label><select id="categoria">${opciones(CATEGORIAS, d.categoria)}</select></div>
        <div class="campo"><label class="etiqueta" for="nota">Nota operativa (opcional)</label><textarea id="nota" rows="2" maxlength="200" placeholder="Qué hacer o a quién avisar si la emergencia se prolonga">${esc(d.nota)}</textarea>
          <p class="ayuda">No escriba diagnósticos ni nombres de enfermedades.</p></div>
        <div class="campo"><label class="etiqueta" for="observaciones">Observaciones (opcional)</label><textarea id="observaciones" rows="2" maxlength="300">${esc(d.observaciones)}</textarea></div>
      </section>

      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('alerta')}</div><div><h3>Apoyo para evacuar</h3><p class="sutil">Esto sí lo verán los brigadistas del piso durante una emergencia</p></div></div>
        <div class="campo"><label class="etiqueta" for="apoyo">Apoyo que ${asistida ? 'necesita' : 'necesito'}</label><select id="apoyo">${opciones(APOYOS, a.apoyo)}</select></div>
        <div id="bloque-apoyo" class="${a.apoyo === 'ninguno' ? 'oculto' : ''}">
          <div class="campo"><label class="etiqueta" for="detalle">¿Qué necesita exactamente? (breve)</label><input id="detalle" type="text" maxlength="120" value="${esc(a.detalle)}" placeholder="Ej.: ayuda para bajar por la escalera" autocomplete="off"></div>
          ${barraBusqueda({ id: 'acomp-buscar', etiqueta: 'Buscar acompañante', ejemplo: 'Nombre o puesto (P2-14)' })}
          <div class="campo"><label class="etiqueta" for="acompanante">Persona que ${asistida ? 'la acompaña' : 'me acompaña'} (opcional)</label>
            <select id="acompanante"><option value="">Ninguna</option>${colegas.map(p => opcionColega(p, a.acompanante)).join('')}</select>
            <p class="ayuda">Esa persona verá, en una emergencia, que ${asistida ? 'se necesita' : 'usted necesita'} su ayuda y de qué tipo. ${asistida ? 'La persona debe hablar con ella antes.' : 'Hable con ella antes.'}</p></div>
        </div>
      </section>`;

  return {
    html,
    // Muestra u oculta el detalle del apoyo según lo elegido.
    enlazar(f) {
      const sel = f.querySelector('#apoyo');
      sel.addEventListener('change', () => f.querySelector('#bloque-apoyo').classList.toggle('oculto', sel.value === 'ninguno'));
      // La búsqueda filtra la lista de acompañantes; la persona ya elegida nunca se quita de la lista.
      const selA = f.querySelector('#acompanante');
      const busqueda = enlazarBusqueda(f, 'acomp-buscar', v => {
        const elegido = selA.value;
        const lista = colegas.filter(p => p.codigo === elegido || coincide(textoColega(p), v));
        selA.innerHTML = '<option value="">Ninguna</option>' + lista.map(p => opcionColega(p, elegido)).join('');
        busqueda.conteo(v ? `${lista.length} coincidencia(s).` : '');
      });
    },
    // propia: el mensaje habla de «su» contacto; si no, del contacto de la persona.
    leer(f, { propia = true } = {}) {
      const contacto = { nombre: f.querySelector('#c-nombre').value.trim(), parentesco: f.querySelector('#c-parentesco').value.trim(), telefono: f.querySelector('#c-telefono').value.trim() };
      if (!contacto.nombre || !contacto.telefono) return { error: propia ? 'Escriba el nombre y el teléfono de su contacto de emergencia.' : 'Escriba el nombre y el teléfono del contacto de emergencia de la persona.' };
      const tipo = f.querySelector('#apoyo').value;
      const datos = {
        contacto, categoria: f.querySelector('#categoria').value,
        nota: f.querySelector('#nota').value.trim(), observaciones: f.querySelector('#observaciones').value.trim()
      };
      const apoyoDatos = {
        apoyo: tipo, detalle: tipo === 'ninguno' ? '' : f.querySelector('#detalle').value.trim(),
        acompanante: tipo === 'ninguno' ? null : (f.querySelector('#acompanante').value || null)
      };
      if (tipo !== 'ninguno' && !apoyoDatos.detalle) return { error: 'Describa brevemente qué apoyo necesita, para que puedan ayudarle.' };
      return { datos, apoyo: apoyoDatos };
    }
  };
}
