// Rutas de evacuación, punto de encuentro y planos de planta.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as contenido from '../contenido.js';
import { esc, icono, aviso, insignia, modal } from '../ui.js';

const esAdmin = () => sesion.tieneRol('admin');

// Muestra un archivo guardado: imagen en pantalla o PDF con botón para abrirlo.
async function piezaArchivo(id, titulo, textoVacio) {
  const meta = contenido.archivosMeta()[id];
  if (!meta) {
    return `<div class="vacio">${icono('info')}<div><strong>${esc(textoVacio)}</strong>
      <span class="sutil">${esAdmin() ? 'Cárguelo en Administración → Contenido.' : 'El administrador aún no lo ha cargado.'}</span></div></div>`;
  }
  const blob = await contenido.obtenerArchivo(id);
  if (!blob) {
    return `<div class="vacio">${icono('sinWifi')}<div><strong>Aún no está guardado en este celular.</strong>
      <span class="sutil">Conéctese a internet una vez para descargarlo; después quedará disponible sin conexión.</span></div></div>`;
  }
  const url = URL.createObjectURL(blob);
  if (blob.type === 'application/pdf') {
    return `<div class="pdf-caja"><embed src="${url}" type="application/pdf" class="pdf-visor">
      <a class="btn btn-secundario btn-chico" href="${url}" target="_blank" rel="noopener" data-titulo="${esc(titulo)}">Abrir el PDF en pantalla completa</a></div>`;
  }
  return `<img class="imagen-ruta" src="${url}" alt="${esc(titulo)}" data-ampliar tabindex="0">
    <p class="ayuda">Toque la imagen para ampliarla.</p>`;
}

function editarTextos(r) {
  return modal({
    titulo: 'Editar punto de encuentro y ruta',
    ancho: 'ancho',
    cuerpo: `
      <div class="campo"><label class="etiqueta" for="e-dir">Dirección del punto de encuentro</label><input id="e-dir" type="text" value="${esc(r.punto.direccion)}"></div>
      <div class="campo"><label class="etiqueta" for="e-ind">Cómo llegar al punto de encuentro</label><textarea id="e-ind" rows="4">${esc(r.punto.indicaciones)}</textarea></div>
      <label class="casilla"><input type="checkbox" id="e-ver" ${r.punto.verificar ? 'checked' : ''}>Por verificar</label>
      <div class="campo"><label class="etiqueta" for="e-notaver">Qué hay que verificar</label><textarea id="e-notaver" rows="2">${esc(r.punto.notaVerificar || '')}</textarea></div>
      <div class="campo"><label class="etiqueta" for="e-gen">Indicaciones generales de evacuación</label><textarea id="e-gen" rows="4">${esc(r.general)}</textarea></div>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Guardar', clase: 'btn-oscuro',
        valor: f => ({
          ...r,
          punto: { ...r.punto, direccion: f.querySelector('#e-dir').value.trim(), indicaciones: f.querySelector('#e-ind').value.trim(),
            verificar: f.querySelector('#e-ver').checked, notaVerificar: f.querySelector('#e-notaver').value.trim() },
          general: f.querySelector('#e-gen').value.trim()
        })
      }
    ]
  });
}

export async function vistaRutas(vista) {
  const yo = sesion.perfil();
  let pisoActual = CONFIG.PISOS.includes(yo.piso) ? yo.piso : CONFIG.PISOS[0];
  const admin = esAdmin();
  let ultimo = null;   // textos que se pintaron, para el botón fijo del encabezado

  const pintar = async () => {
    let datos = null;
    try { datos = await contenido.leerSobre('rutas'); }
    catch (e) { vista.querySelector('#contenido').innerHTML = `<div class="nota nota-error">${icono('alerta')}<span>${esc(e.message)}</span></div>`; return; }

    const estado = await contenido.estadoDescarga();
    const r = datos || contenido.SEMILLAS.rutas();
    ultimo = r;
    const punto = r.punto;

    vista.querySelector('#contenido').innerHTML = `
      ${datos ? '' : `<div class="nota nota-adv">${icono('info')}<span>Se muestran textos de ejemplo del plan de emergencias; el administrador aún no los ha guardado en el aplicativo.</span></div>`}
      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-verde">${icono('ubicacion')}</div>
          <div><h3>${esc(punto.titulo)}</h3><p class="sutil">Dónde reunirse después de evacuar</p></div></div>
        <p style="font-size:1.25rem;font-weight:800;color:var(--corp-dark)">${esc(punto.direccion)} ${punto.verificar ? insignia('Por verificar', 'azul') : ''}</p>
        ${punto.verificar && punto.notaVerificar ? `<div class="nota nota-info">${icono('info')}<span>${esc(punto.notaVerificar)}</span></div>` : ''}
        <p>${esc(punto.indicaciones)}</p>
        ${await piezaArchivo('punto', 'Mapa del punto de encuentro', 'Falta el mapa del punto de encuentro.')}
      </section>

      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('escudo')}</div>
          <div><h3>Ruta de evacuación por piso</h3><p class="sutil">${esc(r.general)}</p></div></div>
        <div class="fila" id="pisos" style="margin-bottom:1rem">${CONFIG.PISOS.map(n =>
          `<button class="pestana ${n === pisoActual ? 'activa' : ''}" data-p="${n}">Piso ${n}${n === yo.piso ? ' · el suyo' : ''}</button>`).join('')}</div>
        ${await piezaArchivo('ruta-' + pisoActual, `Ruta de evacuación del piso ${pisoActual}`, `Falta la ruta de evacuación del piso ${pisoActual}.`)}
        <h4 style="margin-top:1.25rem">Plano del piso ${pisoActual} con puestos</h4>
        ${await piezaArchivo('plano-' + pisoActual, `Plano del piso ${pisoActual}`, `Falta el plano del piso ${pisoActual}.`)}
      </section>

      <p class="ayuda">${estado.total
        ? (estado.listos === estado.total ? `${icono('ok', 'ic-s')} Mapas y planos guardados en este celular: disponibles sin conexión.` : `Guardados en este celular: ${estado.listos} de ${estado.total}. Conéctese a internet para completar la descarga.`)
        : ''}</p>`;

    vista.querySelectorAll('#pisos button').forEach(b => b.addEventListener('click', () => { pisoActual = Number(b.dataset.p); pintar(); }));
    vista.querySelectorAll('[data-ampliar]').forEach(img => {
      const abrir = () => modal({
        titulo: img.alt, ancho: 'ancho',
        cuerpo: `<div class="zoom"><img src="${img.src}" alt="${esc(img.alt)}"></div><p class="ayuda">Use dos dedos para acercar la imagen o deslícela para moverla.</p>`
      });
      img.addEventListener('click', abrir);
      img.addEventListener('keydown', e => { if (e.key === 'Enter') abrir(); });
    });

  };

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Rutas y punto de encuentro</h2><p class="sutil">Disponibles sin conexión una vez descargados</p></div>
      ${admin ? `<button class="btn btn-secundario btn-chico no-imprimir" id="editar">${icono('guardar', 'ic-s')}Editar textos</button>` : ''}
    </div>
    <div id="contenido" class="pila"></div>`;
  vista.querySelector('#editar')?.addEventListener('click', async () => {
    const nuevo = await editarTextos(ultimo || contenido.SEMILLAS.rutas());
    if (!nuevo) return;
    try { await contenido.guardarSobre('rutas', nuevo); aviso('Guardado.', 'exito'); }
    catch (e) { aviso(e.codigo === 'RED' ? 'Sin conexión: los cambios solo se pueden guardar con internet.' : e.message, 'error'); }
    pintar();
  });
  const alListo = () => { if (location.hash.startsWith('#/rutas')) pintar(); };
  addEventListener('contenido-listo', alListo);
  vista.addEventListener('vista-salida', () => removeEventListener('contenido-listo', alListo), { once: true });
  await pintar();
  contenido.precargar();
}
