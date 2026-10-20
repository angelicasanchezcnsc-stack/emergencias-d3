// Recomendaciones: protocolos de autoprotección por tipo de emergencia.
import * as sesion from '../sesion.js';
import * as contenido from '../contenido.js';
import * as emergencia from '../emergencia.js';
import { PROTOCOLOS_INDIVIDUALES, PROTOCOLO_BRIGADISTA } from '../contenido-inicial.js';
import { esc, icono, aviso, modal, confirmar, normalizar } from '../ui.js';

const esAdmin = () => sesion.tieneRol('admin');

// ---------- Piezas compartidas con la pantalla de Emergencia («Qué hacer ahora») ----------

// Origen de cada protocolo (v0.13). Los guardados antes no lo traen: se deduce del identificador.
const IDS_DEL_PLAN = ['evacuacion', 'sismo', 'incendio', 'estructural', 'riesgo-publico', 'atentado', 'asalto', 'brigadista'];
export function origenDe(p) {
  if (p.origen !== undefined) return p.origen === 'plan' || p.origen === 'despacho' ? p.origen : '';
  if (IDS_DEL_PLAN.includes(p.id)) return 'plan';
  return String(p.id).startsWith('ind-') ? 'despacho' : '';
}
const TEXTO_ORIGEN = {
  plan: 'Fuente: plan de emergencias de la sede Calle 96 (CNSC, junio de 2024)',
  despacho: 'Redactado por el Despacho 3; pendiente de revisión del Área de Seguridad y Salud en el Trabajo'
};
export const textoOrigen = p => TEXTO_ORIGEN[origenDe(p)] || '';

// Secciones de preparación («Antes...»): no aplican durante una emergencia.
export const esAntes = titulo => normalizar(titulo).trim().startsWith('antes');

// Las frases que remiten al protocolo de evacuación se vuelven un enlace a ese protocolo.
const REMISIONES = ['Siga el protocolo de evacuación dado al inicio de este plan.', 'Siga el protocolo de evacuación.'];
const ENLACE_EVACUACION = 'Siga el <a href="#/recomendaciones" data-abrir="evacuacion">protocolo general de evacuación</a>.';
export function itemHtml(t) {
  let h = esc(t);
  for (const f of REMISIONES) if (h.includes(esc(f))) { h = h.replace(esc(f), ENLACE_EVACUACION); break; }
  return h;
}

// Cuerpo de un protocolo. «sinAntes»: omite la preparación; «plegarAntes»: la deja plegada.
export function seccionesHtml(p, { sinAntes = false, plegarAntes = false } = {}) {
  return p.secciones.map(s => {
    const antes = esAntes(s.titulo);
    if (antes && sinAntes) return '';
    const cuerpo = `<h4>${esc(s.titulo)}</h4><ol>${s.items.map(t => `<li>${itemHtml(t)}</li>`).join('')}</ol>`;
    return antes && plegarAntes ? `<details class="antes-plegado"><summary>Antes: preparación, no aplica ahora</summary>${cuerpo}</details>` : cuerpo;
  }).join('');
}

// Enlaces a otro protocolo: guardan cuál abrir. Si ya se está en Recomendaciones, lo abren sin recargar.
export function enlazarRemisiones(raiz) {
  raiz.querySelectorAll('[data-abrir]').forEach(a => a.addEventListener('click', ev => {
    const id = a.dataset.abrir;
    const destino = location.hash.startsWith('#/recomendaciones') && document.querySelector(`details.recom[data-id="${CSS.escape(id)}"]`);
    if (destino) {
      ev.preventDefault();
      destino.open = true;
      destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      destino.querySelector('summary')?.focus();
      return;
    }
    try { sessionStorage.setItem('protocolo-abrir', id); } catch { /* sin almacenamiento */ }
  }));
}

// ---------- Pantalla ----------

function formulario(p) {
  const x = p || { id: crypto.randomUUID(), titulo: '', secciones: [{ titulo: 'Antes', items: [] }, { titulo: 'Durante', items: [] }, { titulo: 'Después', items: [] }] };
  const origen = p ? origenDe(p) : 'despacho';
  const bloque = s => `
    <div class="seccion-edit">
      <div class="fila"><input class="s-titulo" type="text" placeholder="Título de la sección (Ej.: Antes)" value="${esc(s.titulo)}" style="flex:1">
        <button type="button" class="btn btn-fantasma btn-chico s-quitar">Quitar sección</button></div>
      <textarea class="s-items" rows="5" placeholder="Una indicación por línea">${esc(s.items.join('\n'))}</textarea>
    </div>`;
  const respuesta = modal({
    titulo: p ? 'Editar protocolo' : 'Agregar protocolo',
    ancho: 'ancho',
    cuerpo: `
      <div class="campo"><label class="etiqueta" for="p-titulo">Nombre del protocolo</label><input id="p-titulo" type="text" value="${esc(x.titulo)}"></div>
      <div class="campo"><label class="etiqueta" for="p-origen">Origen</label>
        <select id="p-origen">
          <option value="plan" ${origen === 'plan' ? 'selected' : ''}>Plan de emergencias de la sede</option>
          <option value="despacho" ${origen === 'despacho' ? 'selected' : ''}>Redactado por el Despacho 3</option>
          <option value="" ${origen === '' ? 'selected' : ''}>Sin indicar</option>
        </select></div>
      <p class="ayuda">Escriba una indicación por línea dentro de cada sección.</p>
      <div id="p-secciones">${x.secciones.map(bloque).join('')}</div>
      <button type="button" class="btn btn-secundario btn-chico" id="p-agregar">Agregar sección</button>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Guardar', clase: 'btn-oscuro',
        antes: f => { if (!f.querySelector('#p-titulo').value.trim()) { aviso('Escriba el nombre del protocolo.', 'error'); return false; } },
        valor: f => ({
          id: x.id, titulo: f.querySelector('#p-titulo').value.trim(), origen: f.querySelector('#p-origen').value,
          secciones: [...f.querySelectorAll('.seccion-edit')].map(s => ({
            titulo: s.querySelector('.s-titulo').value.trim() || 'Indicaciones',
            items: s.querySelector('.s-items').value.split('\n').map(t => t.trim()).filter(Boolean)
          })).filter(s => s.items.length)
        })
      }
    ]
  });
  const cuerpo = document.querySelector('#p-secciones');
  document.querySelector('#p-agregar').addEventListener('click', () => cuerpo.insertAdjacentHTML('beforeend', bloque({ titulo: '', items: [] })));
  cuerpo.addEventListener('click', e => { if (e.target.closest('.s-quitar')) e.target.closest('.seccion-edit').remove(); });
  return respuesta;
}

export async function vistaRecomendaciones(vista) {
  const admin = esAdmin();
  let ultimos = [];   // lo último que se pintó, para el botón fijo del encabezado

  const guardar = async nuevos => {
    try { await contenido.guardarSobre('recomendaciones', { protocolos: nuevos }); aviso('Recomendaciones guardadas.', 'exito'); }
    catch (e) { aviso(e.codigo === 'RED' ? 'Sin conexión: los cambios solo se pueden guardar con internet.' : e.message, 'error'); }
    pintar();
  };

  const pintar = async () => {
    let datos = null;
    try { datos = await contenido.leerSobre('recomendaciones'); }
    catch (e) { vista.querySelector('#lista').innerHTML = `<div class="nota nota-error">${icono('alerta')}<span>${esc(e.message)}</span></div>`; return; }
    const protocolos = (datos && datos.protocolos) || [];
    ultimos = protocolos;

    if (!datos) {
      vista.querySelector('#lista').innerHTML = `<div class="nota nota-adv">${icono('info')}<span>Todavía no se han cargado las recomendaciones.${admin ? '' : ' Pídale al administrador que las cargue.'}</span></div>
        ${admin ? `<button class="btn btn-primario" id="sembrar">${icono('subir', 'ic-s')}Cargar recomendaciones iniciales</button>` : ''}`;
      vista.querySelector('#sembrar')?.addEventListener('click', async () => {
        try { await contenido.sembrar(['recomendaciones']); aviso('Recomendaciones cargadas.', 'exito'); pintar(); } catch (e) { aviso(e.message, 'error'); }
      });
      return;
    }

    // Instalaciones anteriores no tienen los protocolos individuales (etapa 9) ni el del brigadista (v0.13).
    const faltanIndividuales = admin && !protocolos.some(p => p.id.startsWith('ind-'));
    const faltaBrigadista = admin && !protocolos.some(p => p.id === 'brigadista');
    vista.querySelector('#aviso-individuales').innerHTML = (faltanIndividuales
      ? `<div class="nota nota-info">${icono('info')}<span>Faltan los protocolos individuales (movilidad reducida, salud con manejo por horario, embarazo y alergia grave) que se muestran a quien diligencia su caracterización.</span>
         <button class="btn btn-primario btn-chico" id="agregar-individuales">Agregar protocolos individuales</button></div>` : '') +
      (faltaBrigadista
      ? `<div class="nota nota-info">${icono('info')}<span>Falta el protocolo del brigadista (paso a paso en una evacuación, tomado del plan de la sede). Los brigadistas y la coordinación lo ven en la pantalla de Emergencia.</span>
         <button class="btn btn-primario btn-chico" id="agregar-brigadista">Agregar protocolo del brigadista</button></div>` : '');
    vista.querySelector('#agregar-individuales')?.addEventListener('click', () => guardar([...protocolos, ...PROTOCOLOS_INDIVIDUALES()]));
    vista.querySelector('#agregar-brigadista')?.addEventListener('click', () => {
      // Va después de los protocolos del plan y antes de los individuales.
      const i = protocolos.findIndex(p => p.id.startsWith('ind-'));
      const copia = [...protocolos];
      copia.splice(i < 0 ? copia.length : i, 0, PROTOCOLO_BRIGADISTA());
      guardar(copia);
    });

    // Si se llegó desde la emergencia, se abre el protocolo de ese tipo de evento.
    let abrir = null;
    try { abrir = sessionStorage.getItem('protocolo-abrir'); sessionStorage.removeItem('protocolo-abrir'); } catch { /* sin almacenamiento */ }
    if (!protocolos.some(p => p.id === abrir)) abrir = protocolos[0] && protocolos[0].id;
    // Durante una emergencia, la preparación («Antes») queda plegada: lo que sirve es «Durante» y «Después».
    const enEmergencia = !!emergencia.actual();
    vista.querySelector('#lista').innerHTML = protocolos.map(p => `
      <details class="recom" data-id="${esc(p.id)}" ${p.id === abrir ? 'open' : ''}>
        <summary>${icono('libro', 'ic-s')}<span>${esc(p.titulo)}</span></summary>
        <div class="recom-cuerpo">
          ${textoOrigen(p) ? `<p class="recom-origen">${esc(textoOrigen(p))}</p>` : ''}
          ${seccionesHtml(p, { plegarAntes: enEmergencia })}
          ${admin ? `<div class="fila no-imprimir"><button class="btn btn-fantasma btn-chico" data-editar>Editar</button>
            <button class="btn btn-fantasma btn-chico" data-subir>Subir</button><button class="btn btn-fantasma btn-chico" data-bajar>Bajar</button>
            <button class="btn btn-fantasma btn-chico" data-quitar>Quitar</button></div>` : ''}
        </div>
      </details>`).join('');
    enlazarRemisiones(vista.querySelector('#lista'));

    if (abrir && abrir !== (protocolos[0] && protocolos[0].id)) vista.querySelector(`[data-id="${CSS.escape(abrir)}"]`)?.scrollIntoView({ block: 'start' });
    const buscar = el => protocolos.findIndex(x => x.id === el.closest('[data-id]').dataset.id);
    vista.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', async () => {
      const i = buscar(b);
      const nuevo = await formulario(protocolos[i]);
      if (nuevo) guardar(protocolos.map((x, k) => k === i ? nuevo : x));
    }));
    vista.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', async () => {
      const i = buscar(b);
      if (await confirmar('Quitar protocolo', `¿Quitar «${esc(protocolos[i].titulo)}»?`, 'Quitar', true)) guardar(protocolos.filter((_, k) => k !== i));
    }));
    const mover = (b, d) => {
      const i = buscar(b), j = i + d;
      if (j < 0 || j >= protocolos.length) return;
      const copia = [...protocolos];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      guardar(copia);
    };
    vista.querySelectorAll('[data-subir]').forEach(b => b.addEventListener('click', () => mover(b, -1)));
    vista.querySelectorAll('[data-bajar]').forEach(b => b.addEventListener('click', () => mover(b, 1)));
  };

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Recomendaciones</h2><p class="sutil">Qué hacer antes, durante y después de cada tipo de emergencia. Disponibles sin conexión.</p></div>
      ${admin ? `<button class="btn btn-secundario btn-chico no-imprimir" id="agregar">${icono('guardar', 'ic-s')}Agregar protocolo</button>` : ''}
    </div>
    <div id="aviso-individuales"></div>
    <div id="lista" class="pila"></div>
    <p class="ayuda" style="margin-top:1rem">Los protocolos indican su fuente. El plan de la sede es la fuente de los protocolos por tipo de evento.</p>`;
  vista.querySelector('#agregar')?.addEventListener('click', async () => {
    const nuevo = await formulario(null);
    if (nuevo) guardar([...ultimos, nuevo]);
  });
  await pintar();
}
