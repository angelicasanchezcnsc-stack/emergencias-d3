// Verificación anual de los contactos de emergencia (v0.12, fase 4): fichas recortables para imprimir o guardar
// como PDF, agrupadas por piso. Cada persona recibe SOLO su ficha, marca si cada dato está bien, corrige y firma;
// así nadie ve los datos de sus compañeros. Cada piso empieza con una hoja de control con solo nombres y puestos
// (entregada y devuelta). Las correcciones se pasan a la app en Caracterizaciones → Contacto.
// Solo para la coordinación: usa los contactos abiertos con su llave personal. Se genera en este equipo con el
// diálogo de impresión del navegador; no se envía a ningún servidor.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as contacto from '../contacto-emergencia.js';
import { esc, aviso, modal } from '../ui.js';
import { fechaLegible, fechaBogota } from '../tiempo.js';
import { AVISO_CONTACTOS_CORTO } from '../contenido-inicial.js';

const casillas = '☐ Sí &nbsp; ☐ No';

function ficha(p, c, hoy) {
  const d = c && c.abierto ? c.datos : null;
  const f = (d && d.familiar) || {};
  const s = (c && c.abierto && c.salud) || {};
  const fila = (t, v) => `<tr><th>${t}</th><td>${v ? esc(v) : '<span class="vacio-papel">(sin dato)</span>'}</td><td class="casilla-papel">${casillas}</td><td></td></tr>`;
  return `<section class="ficha-contacto">
    <p class="ficha-cabeza"><strong>${esc(sesion.nombreDe(p.codigo))}</strong> · Piso ${p.piso}, puesto ${p.puesto}
      <span class="ficha-fecha">Impresa el ${esc(fechaLegible(hoy))}</span></p>
    <p class="ficha-ayuda">${d ? 'Revise su contacto de emergencia. Marque si cada dato está bien; si no, escriba el correcto.'
      : 'No tenemos su contacto de emergencia. Escríbalo en la columna «Correcto».'}</p>
    <table><thead><tr><th>Dato</th><th>Registrado</th><th>¿Está bien?</th><th>Correcto</th></tr></thead><tbody>
      ${fila('Nombre del familiar', f.nombre)}
      ${fila('Parentesco', f.parentesco)}
      ${fila('Teléfono del familiar', f.telefono)}
      ${fila('Su teléfono', d && d.telefono)}
      ${fila('EPS', s.eps)}
      ${fila('ARL', s.arl)}
    </tbody></table>
    <p class="ficha-firma">Firma: ______________________________ &nbsp; Fecha: ____________</p>
    <p class="aviso-datos">${esc(AVISO_CONTACTOS_CORTO)} Devuelva esta ficha a la coordinación; no la deje a la vista.</p>
  </section>`;
}

function hojaControl(piso, personas) {
  return `<h2>Piso ${piso}: control de entrega (${personas.length} ficha${personas.length === 1 ? '' : 's'})</h2>
    <table><thead><tr><th>Persona</th><th>Puesto</th><th>Entregada</th><th>Devuelta</th><th>¿Con correcciones?</th></tr></thead><tbody>
    ${personas.map(p => `<tr><td>${esc(sesion.nombreDe(p.codigo))}</td><td>${p.puesto}</td><td class="casilla-papel">☐</td><td class="casilla-papel">☐</td><td class="casilla-papel">${casillas}</td></tr>`).join('')}
    </tbody></table>
    <p class="ayuda-papel">Esta hoja no lleva datos de contacto. Pase las correcciones a la app (Caracterizaciones → Contacto) y destruya las fichas cuando termine.</p>`;
}

// Pregunta qué pisos imprimir y abre el diálogo de impresión.
export async function imprimirVerificacion() {
  try { await contacto.cargar({ forzar: true }); } catch { /* se usa la copia del celular */ }
  const activas = (sesion.base().personas || []).filter(p => p.estado === 'activo');
  const pisos = CONFIG.PISOS.filter(n => activas.some(p => p.piso === n));
  const sinAbrir = activas.filter(p => contacto.hayContacto(p.codigo) && !(contacto.contactoDe(p.codigo) || {}).abierto).length;
  const eleccion = await modal({
    titulo: 'Imprimir la verificación de contactos',
    cuerpo: `<p class="sutil">Una ficha recortable por persona, agrupada por piso. Cada persona recibe solo la suya. Cada piso empieza con una hoja de control con solo nombres y puestos.</p>
      <div class="campo"><label class="etiqueta" for="vc-piso">Pisos</label>
        <select id="vc-piso"><option value="0">Todos los pisos</option>${pisos.map(n => `<option value="${n}">Piso ${n}</option>`).join('')}</select></div>
      ${sinAbrir ? `<div class="nota nota-adv"><span>${sinAbrir} contacto(s) aún no se pueden abrir con su llave: su ficha saldrá en blanco. Se habilitan cuando alguien de la coordinación que ya los tenga abra la app.</span></div>` : ''}
      <p class="ayuda">Las fichas tienen datos personales: imprímalas en un lugar reservado y destrúyalas cuando pase las correcciones a la app.</p>`,
    acciones: [{ texto: 'Cancelar', valor: null, clase: 'btn-fantasma' }, { texto: 'Imprimir o guardar PDF', clase: 'btn-oscuro', valor: m => Number(m.querySelector('#vc-piso').value) }]
  });
  if (eleccion === null) return;
  const elegidos = eleccion ? [eleccion] : pisos;
  if (!elegidos.length) return aviso('No hay personas activas para imprimir.', 'info');
  const hoy = fechaBogota();
  const paginas = elegidos.map((n, i) => {
    const personas = activas.filter(p => p.piso === n).sort((a, b) => a.puesto - b.puesto);
    return `<div class="${i ? 'salto-pagina' : ''}">${hojaControl(n, personas)}</div>
      <div class="salto-pagina">${personas.map(p => ficha(p, contacto.contactoDe(p.codigo), hoy)).join('')}</div>`;
  }).join('');
  document.getElementById('censo-impreso')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="censo-impreso" class="verificacion-contactos">
    <h1>${esc(CONFIG.APP_NOMBRE)}: verificación de contactos de emergencia</h1>
    <p>${esc(CONFIG.SUBTITULO)} · ${elegidos.length === 1 ? 'Piso ' + elegidos[0] : 'Todos los pisos'} · ${esc(fechaLegible(hoy))}</p>
    ${paginas}</div>`);
  document.body.classList.add('censo-activo');
  addEventListener('afterprint', () => { document.getElementById('censo-impreso')?.remove(); document.body.classList.remove('censo-activo'); }, { once: true });
  setTimeout(() => print(), 50);
}
