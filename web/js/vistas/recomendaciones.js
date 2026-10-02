// Recomendaciones: protocolos de autoprotección por tipo de emergencia.
import * as sesion from '../sesion.js';
import * as contenido from '../contenido.js';
import { esc, icono, aviso, modal, confirmar } from '../ui.js';

const esAdmin = () => sesion.tieneRol('admin');

function formulario(p) {
  const x = p || { id: crypto.randomUUID(), titulo: '', secciones: [{ titulo: 'Antes', items: [] }, { titulo: 'Durante', items: [] }, { titulo: 'Después', items: [] }] };
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
      <p class="ayuda">Escriba una indicación por línea dentro de cada sección.</p>
      <div id="p-secciones">${x.secciones.map(bloque).join('')}</div>
      <button type="button" class="btn btn-secundario btn-chico" id="p-agregar">Agregar sección</button>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Guardar', clase: 'btn-oscuro',
        antes: f => { if (!f.querySelector('#p-titulo').value.trim()) { aviso('Escriba el nombre del protocolo.', 'error'); return false; } },
        valor: f => ({
          id: x.id, titulo: f.querySelector('#p-titulo').value.trim(),
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

    vista.querySelector('#lista').innerHTML = protocolos.map((p, i) => `
      <details class="recom" data-id="${esc(p.id)}" ${i === 0 ? 'open' : ''}>
        <summary>${icono('libro', 'ic-s')}<span>${esc(p.titulo)}</span></summary>
        <div class="recom-cuerpo">
          ${p.secciones.map(s => `<h4>${esc(s.titulo)}</h4><ol>${s.items.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`).join('')}
          ${admin ? `<div class="fila no-imprimir"><button class="btn btn-fantasma btn-chico" data-editar>Editar</button>
            <button class="btn btn-fantasma btn-chico" data-subir>Subir</button><button class="btn btn-fantasma btn-chico" data-bajar>Bajar</button>
            <button class="btn btn-fantasma btn-chico" data-quitar>Quitar</button></div>` : ''}
        </div>
      </details>`).join('');

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
    <div id="lista" class="pila"></div>
    <p class="ayuda" style="margin-top:1rem">Fuente: plan de preparación y respuesta ante emergencias de la sede Calle 96 (CNSC, junio de 2024).</p>`;
  vista.querySelector('#agregar')?.addEventListener('click', async () => {
    const nuevo = await formulario(null);
    if (nuevo) guardar([...ultimos, nuevo]);
  });
  await pintar();
}
