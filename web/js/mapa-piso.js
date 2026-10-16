// Mapa esquemático de un piso, tipo sala de cine: un botón por puesto sobre una cuadrícula.
// Es un componente de dibujo: no llama al servidor. Recibe los datos y devuelve HTML y eventos.
// Lo usan todas las pantallas (Administración, Planta física, Hoy en la sede, Emergencia y Ausencia o
// cambio de lugar). Siempre ofrece una vista de lista equivalente.
//
//   const mapa = mapaPiso({ piso, puestos, referencias, ocupantes, estadoDe, modo, resaltar, idBase, ... });
//   caja.innerHTML = mapa.html;
//   const control = mapa.enlazar(caja, { alElegir(puesto) {}, alElegirCasilla({ col, fila }) {}, ... });
//   control.repintar({ ocupantes })   // dibuja de nuevo con datos nuevos, sin perder el foco
import { esc } from './ui.js';
import * as contenido from './contenido.js';
import { abrirArchivoEnVentana } from './vistas/rutas.js';

export const MAX_COLUMNAS = 24;
export const MAX_FILAS = 20;
const POR_FILA_AUTOMATICA = 6;
const CLAVE_VISTA = 'd3e-vista-mapa';

// Clases de estado. Todas llevan texto o símbolo además del color. «texto» es lo que se ve bajo el número
// cuando la pantalla no entrega otra etiqueta (si es null, se ven las iniciales de quien ocupa el puesto).
export const CLASES = {
  libre:          { nombre: 'Libre', simbolo: '', texto: 'Libre', senal: 'texto «Libre»' },
  ocupado:        { nombre: 'Ocupado', simbolo: '', texto: null, senal: 'iniciales' },
  compartido:     { nombre: 'Compartido', simbolo: '', texto: null, senal: '«+1» y borde doble' },
  actual:         { nombre: 'Puesto actual', simbolo: '', texto: 'Actual', senal: 'borde grueso y «Actual»' },
  elegido:        { nombre: 'Elegido', simbolo: '✓', texto: null, senal: '✓ y contorno' },
  prevista:       { nombre: 'Prevista hoy', simbolo: '', texto: 'Prevista', senal: 'texto «Prevista»' },
  'no-asiste':    { nombre: 'No asiste', simbolo: '', texto: 'No asiste', senal: 'texto «No asiste»' },
  'otro-lugar':   { nombre: 'En otro lugar', simbolo: '', texto: 'Otro lugar', senal: 'texto «Otro lugar»' },
  evacuado:       { nombre: 'Evacuado', simbolo: '✓', texto: null, senal: '✓' },
  'no-ubicado':   { nombre: 'No ubicado', simbolo: '!', texto: null, senal: '!' },
  apoyo:          { nombre: 'Requiere apoyo', simbolo: '✚', texto: null, senal: '✚' },
  'no-estaba':    { nombre: 'No estaba', simbolo: '×', texto: null, senal: '×' },
  'sin-marcar':   { nombre: 'Sin marcar', simbolo: '?', texto: null, senal: '?' },
  'no-asignable': { nombre: 'No asignable', simbolo: '', texto: 'No asign.', senal: 'borde punteado' }
};
const CLASE_RESALTADO = { nombre: 'Coincide con la búsqueda', simbolo: '', senal: 'contorno amarillo grueso' };

const TIPOS_REFERENCIA = {
  escalera: { nombre: 'Escalera', icono: '<path d="M3 21h5v-5h5v-5h5V6h3"/>' },
  sala: { nombre: 'Sala', icono: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><path d="M14 12h.01"/>' },
  bano: { nombre: 'Baño', icono: '<circle cx="8" cy="5" r="2"/><path d="M8 8v7"/><path d="M5 22l3-7 3 7"/><circle cx="17" cy="5" r="2"/><path d="M17 8v5"/><path d="M14 22v-4h6v4z"/>' },
  ascensor: { nombre: 'Ascensor', icono: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m9 10 3-3 3 3"/><path d="m9 14 3 3 3-3"/>' },
  pasillo: { nombre: 'Pasillo', icono: '<path d="M3 12h18"/><path d="m7 8-4 4 4 4"/><path d="m17 8 4 4-4 4"/>' },
  otro: { nombre: 'Referencia', icono: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>' }
};
const ICONO_PLANO = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>';
const icono = (trazos, clase = 'ic-s') =>
  `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazos}</svg>`;

// ---------- Utilidades (también las usan las pruebas) ----------

export const clavePuesto = (piso, puesto) => `${piso}-${puesto}`;
export const rotulo = (piso, puesto) => `P${piso}-${puesto}`;

// Iniciales de un nombre: la primera letra de las dos primeras palabras que empiezan en mayúscula
// («María de los Ángeles Pérez» → «MÁ»). Sin nombre se usa el código.
export function iniciales(persona) {
  const nombre = String((persona && (persona.nombre || persona.codigo)) || '').trim();
  const palabras = nombre.split(/\s+/).filter(Boolean);
  const mayus = palabras.filter(w => w[0] !== w[0].toLowerCase());
  return (mayus.length ? mayus : palabras).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

const nombreDe = persona => String((persona && (persona.nombre || persona.codigo)) || 'persona sin nombre');
const unir = nombres => nombres.length <= 1 ? nombres.join('') : nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];

// Ubica cada puesto en la cuadrícula. Los que traen col y fila se respetan; los demás se colocan en
// posición automática: ordenados por número, 6 por fila, en las filas siguientes a todo lo ya ubicado.
// Devuelve { puestos: [{ ...puesto, col, fila, automatica }], filas, columnas }.
export function ubicar(puestos, referencias = []) {
  const ubicado = x => Number.isInteger(x.col) && Number.isInteger(x.fila) && x.col >= 1 && x.fila >= 1;
  const fijos = puestos.filter(ubicado);
  const sueltos = puestos.filter(x => !ubicado(x)).sort((a, b) => a.puesto - b.puesto);
  let ultimaFila = 0, ultimaCol = 0;
  fijos.forEach(x => { ultimaFila = Math.max(ultimaFila, x.fila); ultimaCol = Math.max(ultimaCol, x.col); });
  referencias.forEach(r => {
    ultimaFila = Math.max(ultimaFila, r.fila + r.alto - 1);
    ultimaCol = Math.max(ultimaCol, r.col + r.ancho - 1);
  });
  const resultado = fijos.map(x => ({ ...x, automatica: false }));
  sueltos.forEach((x, i) => {
    const col = (i % POR_FILA_AUTOMATICA) + 1, fila = ultimaFila + 1 + Math.floor(i / POR_FILA_AUTOMATICA);
    resultado.push({ ...x, col, fila, automatica: true });
    ultimaCol = Math.max(ultimaCol, col);
  });
  const filas = resultado.reduce((m, x) => Math.max(m, x.fila), ultimaFila);
  return { puestos: resultado, filas, columnas: ultimaCol };
}

function leerVista(clave = CLAVE_VISTA) {
  try { const v = localStorage.getItem(clave); return v === 'mapa' || v === 'lista' ? v : null; } catch (e) { return null; }
}
function guardarVista(v, clave = CLAVE_VISTA) { try { localStorage.setItem(clave, v); } catch (e) { /* sin almacenamiento: no se recuerda */ } }

function hayPlano(piso) {
  try { return !!contenido.archivosMeta()['plano-' + piso]; } catch (e) { return false; }
}

// ---------- Componente ----------

/**
 * Opciones:
 *   piso          número del piso
 *   puestos       [{ piso, puesto, estado, col, fila, asignable }] (puede traer otros pisos: se filtran)
 *   referencias   [{ piso, id, tipo, etiqueta, col, fila, ancho, alto }]
 *   ocupantes     Map "piso-puesto" → [{ codigo, nombre }] (lo arma quien llama)
 *   estadoDe      (puesto, ocupantes) → { clase, etiqueta?, texto? }. Sin ella se usa libre, ocupado, compartido o no-asignable.
 *                 etiqueta: lo que se ve bajo el número. texto: lo que lee el lector de pantalla tras «Puesto P2-14,».
 *   modo          'ver' | 'elegir' | 'editar' (editar muestra toda la cuadrícula, con las casillas vacías como botones)
 *   resaltar      Set de "piso-puesto" a resaltar (búsqueda, persona actual)
 *   idBase        prefijo de los ids (único en la página)
 *   pisos         pisos para las pestañas (si no viene, no hay pestañas)
 *   vistaPorDefecto 'mapa' | 'lista' mientras no haya una elección guardada
 *   claveVista    clave de localStorage donde se recuerda mapa o lista (por defecto la de todas las pantallas)
 *   sinSelector   true = sin el botón «Ver como lista / mapa» (la pantalla trae el suyo)
 *   leyendaExtra  [{ simbolo, nombre, senal }] filas extra para la leyenda
 *   refElegida    id de la referencia elegida (solo en modo editar)
 *   plano         (piso) → ¿hay plano? Por defecto mira los archivos guardados (plano-N)
 *   abrirPlano    (piso) → abre el plano. Por defecto lo abre en una ventana
 */
export function mapaPiso(opciones) {
  const estado = { ...opciones };
  let vista = estado.vista || leerVista(estado.claveVista) || estado.vistaPorDefecto || 'mapa';
  let foco = null;   // casilla con tabindex 0 en modo editar
  const id = () => estado.idBase || 'mapa';

  const modo = () => estado.modo || 'ver';
  const ocupantesDe = p => (estado.ocupantes && estado.ocupantes.get && estado.ocupantes.get(clavePuesto(p.piso, p.puesto))) || [];
  const cuantosPuestos = () => (estado.puestos || []).filter(x => x.piso === estado.piso);
  const referenciasDelPiso = () => (estado.referencias || []).filter(r => r.piso === undefined || r.piso === estado.piso);

  // Qué clase y qué texto lleva un puesto.
  function describir(p) {
    const gente = ocupantesDe(p);
    let dado = estado.estadoDe ? (estado.estadoDe(p, gente) || {}) : {};
    let clase = CLASES[dado.clase] ? dado.clase : (gente.length === 0 ? 'libre' : gente.length === 1 ? 'ocupado' : 'compartido');
    // Un puesto que no se puede asignar y está sin nadie siempre se dibuja como tal.
    if (p.asignable === false && !gente.length) clase = 'no-asignable';
    const c = CLASES[clase];
    const ini = gente.length ? iniciales(gente[0]) + (gente.length > 1 ? ` +${gente.length - 1}` : '') : '';
    const etiqueta = dado.etiqueta !== undefined && dado.etiqueta !== null ? String(dado.etiqueta) : (c.texto !== null ? c.texto : (ini || c.nombre));
    const nombres = gente.map(nombreDe);
    let texto = dado.texto;
    if (texto === undefined || texto === null) {
      if (clase === 'libre') texto = 'libre';
      else if (clase === 'no-asignable') texto = 'no asignable';
      else if (clase === 'ocupado') texto = `ocupado por ${unir(nombres)}`;
      else if (clase === 'compartido') texto = `compartido por ${unir(nombres)}`;
      else texto = (nombres.length ? `${unir(nombres)}, ` : '') + c.nombre.toLowerCase();
    }
    const resaltado = !!(estado.resaltar && estado.resaltar.has && estado.resaltar.has(clavePuesto(p.piso, p.puesto)));
    return { clase, etiqueta, texto, simbolo: c.simbolo, resaltado, nombres, gente };
  }

  // Cuadrícula completa: puestos ubicados, referencias y, al editar, casillas vacías.
  function armarRejilla() {
    const editar = modo() === 'editar';
    const refs = referenciasDelPiso();
    const { puestos: ubicados, filas, columnas } = ubicar(cuantosPuestos(), refs);
    const nFilas = Math.max(filas, editar ? MAX_FILAS : 1);
    const nCols = Math.max(columnas, editar ? MAX_COLUMNAS : 1);
    const usadas = new Set();
    ubicados.forEach(p => usadas.add(`${p.col},${p.fila}`));
    refs.forEach(r => { for (let a = 0; a < r.ancho; a++) for (let b = 0; b < r.alto; b++) usadas.add(`${r.col + a},${r.fila + b}`); });
    const elementos = [
      ...ubicados.map(p => ({ tipo: 'puesto', col: p.col, fila: p.fila, p })),
      ...refs.map(r => ({ tipo: 'ref', col: r.col, fila: r.fila, r }))
    ];
    if (editar) {
      for (let f = 1; f <= nFilas; f++) for (let c = 1; c <= nCols; c++) if (!usadas.has(`${c},${f}`)) elementos.push({ tipo: 'casilla', col: c, fila: f });
    }
    elementos.sort((a, b) => a.fila - b.fila || a.col - b.col);
    return { elementos, nFilas, nCols, ubicados };
  }

  function htmlPuesto(p, tab) {
    const d = describir(p);
    const k = clavePuesto(p.piso, p.puesto);
    const inhabilitado = p.asignable === false && modo() !== 'editar';
    const etiquetaAria = `Puesto ${rotulo(p.piso, p.puesto)}, ${d.texto}${d.resaltado ? ', coincide con la búsqueda' : ''}`;
    return `<button type="button" class="mp-puesto mp-${d.clase}${d.resaltado ? ' mp-resaltado' : ''}" id="${esc(id())}-p-${esc(k)}"
      style="grid-column:${p.col};grid-row:${p.fila}" data-mp-puesto="${esc(k)}" data-col="${p.col}" data-fila="${p.fila}"
      aria-label="${esc(etiquetaAria)}"${inhabilitado ? ' disabled' : ''}${tab}>
      <span class="mp-num">${esc(rotulo(p.piso, p.puesto))}</span>
      <span class="mp-txt">${d.simbolo ? `<span class="mp-sim" aria-hidden="true">${esc(d.simbolo)}</span>` : ''}${esc(d.etiqueta)}</span>
    </button>`;
  }

  function htmlReferencia(r, tab) {
    const t = TIPOS_REFERENCIA[r.tipo] || TIPOS_REFERENCIA.otro;
    const etiqueta = String(r.etiqueta || '').trim();
    const nombre = etiqueta && etiqueta.toLowerCase() !== t.nombre.toLowerCase() ? `${t.nombre}: ${etiqueta}` : (etiqueta || t.nombre);
    const estilo = `grid-column:${r.col} / span ${r.ancho};grid-row:${r.fila} / span ${r.alto}`;
    const contenidoRef = `${icono(t.icono)}<span class="mp-ref-txt">${esc(etiqueta || t.nombre)}</span>`;
    if (modo() === 'editar') {
      const elegida = estado.refElegida !== undefined && estado.refElegida !== null && String(estado.refElegida) === String(r.id);
      return `<button type="button" class="mp-ref${elegida ? ' mp-ref-elegida' : ''}" style="${estilo}" data-mp-ref="${esc(r.id)}" data-col="${r.col}" data-fila="${r.fila}"
        aria-pressed="${elegida}" aria-label="${esc('Referencia ' + nombre + ', ' + r.ancho + ' por ' + r.alto + ' casillas' + (elegida ? ', elegida' : ''))}"${tab}>${contenidoRef}</button>`;
    }
    return `<div class="mp-ref" style="${estilo}" role="img" aria-label="${esc(nombre)}">${contenidoRef}</div>`;
  }

  function htmlCasilla(e, tab) {
    return `<button type="button" class="mp-casilla" style="grid-column:${e.col};grid-row:${e.fila}" data-mp-casilla="${e.col},${e.fila}"
      data-col="${e.col}" data-fila="${e.fila}" aria-label="Casilla vacía, fila ${e.fila}, columna ${e.col}"${tab}><span aria-hidden="true">+</span></button>`;
  }

  function htmlMapa() {
    const { elementos, nFilas, nCols, ubicados } = armarRejilla();
    const editar = modo() === 'editar';
    // En editar hay cientos de casillas: solo una entra en el orden del Tab y las flechas recorren el resto.
    const primera = editar ? (foco || elementos.find(e => e.tipo !== 'ref') || elementos[0]) : null;
    const claveElemento = e => e.tipo === 'puesto' ? 'p:' + clavePuesto(e.p.piso, e.p.puesto) : e.tipo === 'ref' ? 'r:' + e.r.id : 'c:' + e.col + ',' + e.fila;
    const claveFoco = primera ? (typeof primera === 'string' ? primera : claveElemento(primera)) : null;
    const hayFoco = editar && elementos.some(e => claveElemento(e) === claveFoco);
    const filas = elementos.map((e, i) => {
      const tab = !editar ? '' : ` tabindex="${(hayFoco ? claveElemento(e) === claveFoco : i === 0) ? 0 : -1}"`;
      return e.tipo === 'puesto' ? htmlPuesto(e.p, tab) : e.tipo === 'ref' ? htmlReferencia(e.r, tab) : htmlCasilla(e, tab);
    }).join('');
    const vacio = !ubicados.length && !referenciasDelPiso().length
      ? `<p class="sutil mp-vacio">Este piso no tiene puestos cargados.</p>` : '';
    return `${vacio}<div class="mapa-caja"><div class="mp-rejilla" role="group" aria-label="Mapa del piso ${esc(estado.piso)}"
      style="--mp-cols:${nCols};--mp-filas:${nFilas}">${filas}</div></div>`;
  }

  function htmlLista() {
    const puestos = cuantosPuestos().slice().sort((a, b) => a.puesto - b.puesto);
    const conAccion = modo() !== 'ver';
    const filas = puestos.map(p => {
      const d = describir(p);
      const k = clavePuesto(p.piso, p.puesto);
      const inhabilitado = p.asignable === false && modo() !== 'editar';
      const clase = CLASES[d.clase];
      return `<tr class="mp-fila mp-fila-${d.clase}${d.resaltado ? ' mp-fila-resaltada' : ''}" data-mp-fila="${esc(k)}">
        <td><strong class="mono">${esc(rotulo(p.piso, p.puesto))}</strong></td>
        <td>${d.nombres.length ? d.nombres.map(esc).join('<br>') : '<span class="sutil">Sin ocupante</span>'}</td>
        <td>${clase.simbolo ? `<span aria-hidden="true">${esc(clase.simbolo)}</span> ` : ''}${esc(clase.nombre)}${d.resaltado ? ' · coincide con la búsqueda' : ''}</td>
        ${conAccion ? `<td><button type="button" class="btn btn-secundario btn-chico" data-mp-puesto="${esc(k)}"
          aria-label="${esc('Elegir el puesto ' + rotulo(p.piso, p.puesto) + ', ' + d.texto)}"${inhabilitado ? ' disabled' : ''}>Elegir</button></td>` : ''}
      </tr>`;
    }).join('');
    return `<div class="tabla-caja"><table class="mp-lista">
      <caption class="mp-solo-lector">Puestos del piso ${esc(estado.piso)}</caption>
      <thead><tr><th scope="col">Puesto</th><th scope="col">Ocupante(s)</th><th scope="col">Estado</th>${conAccion ? '<th scope="col"><span class="mp-solo-lector">Acción</span></th>' : ''}</tr></thead>
      <tbody>${filas || `<tr><td colspan="${conAccion ? 4 : 3}" class="sutil">Este piso no tiene puestos cargados.</td></tr>`}</tbody></table></div>`;
  }

  function htmlLeyenda() {
    const usadas = new Set();
    let hayResaltado = false;
    cuantosPuestos().forEach(p => { const d = describir(p); usadas.add(d.clase); if (d.resaltado) hayResaltado = true; });
    const items = Object.keys(CLASES).filter(c => usadas.has(c)).map(c => {
      const x = CLASES[c];
      return `<li><span class="mp-muestra mp-${c}" aria-hidden="true">${esc(x.simbolo || '')}</span><span><strong>${esc(x.nombre)}</strong> <span class="sutil">${esc(x.senal)}</span></span></li>`;
    });
    (estado.leyendaExtra || []).forEach(x => items.push(`<li><span class="mp-muestra mp-ocupado" aria-hidden="true">${esc(x.simbolo || '')}</span><span><strong>${esc(x.nombre)}</strong> <span class="sutil">${esc(x.senal || '')}</span></span></li>`));
    if (hayResaltado) items.push(`<li><span class="mp-muestra mp-resaltado" aria-hidden="true"></span><span><strong>${esc(CLASE_RESALTADO.nombre)}</strong> <span class="sutil">${esc(CLASE_RESALTADO.senal)}</span></span></li>`);
    return items.length ? `<ul class="mp-leyenda" aria-label="Leyenda del mapa">${items.join('')}</ul>` : '';
  }

  function htmlBarra() {
    const pisos = estado.pisos || [];
    const planoOk = (estado.plano || hayPlano)(estado.piso);
    return `<div class="mp-barra no-imprimir">
      ${pisos.length ? `<div class="fila" role="group" aria-label="Piso del mapa">${pisos.map(n =>
        `<button type="button" class="pestana ${n === estado.piso ? 'activa' : ''}" data-mp-piso="${n}" aria-pressed="${n === estado.piso}">Piso ${n}</button>`).join('')}</div>` : ''}
      <div class="fila mp-acciones">
        ${planoOk ? `<button type="button" class="btn btn-secundario btn-chico" data-mp-plano="${esc(estado.piso)}">${icono(ICONO_PLANO)}Ver plano del piso</button>` : ''}
        ${estado.sinSelector ? '' : `<button type="button" class="btn btn-secundario btn-chico" data-mp-vista>${vista === 'mapa' ? 'Ver como lista' : 'Ver como mapa'}</button>`}
      </div>
    </div>`;
  }

  function interior() {
    return `${htmlBarra()}
      <p class="mp-solo-lector" role="status" aria-live="polite" data-mp-aviso></p>
      <div class="mp-cuerpo">${vista === 'mapa' ? htmlMapa() : htmlLista()}</div>
      ${vista === 'mapa' ? htmlLeyenda() : ''}`;
  }

  const html = `<div class="mapa-piso" id="${esc(id())}" data-modo="${esc(modo())}" data-vista="${esc(vista)}">${interior()}</div>`;

  function enlazar(raiz, manejadores = {}) {
    const caja = raiz.matches && raiz.matches('.mapa-piso') ? raiz : raiz.querySelector('#' + CSS.escape(id()));
    if (!caja) throw new Error('No se encontró el mapa ' + id() + ' para enlazarlo.');
    const hab = manejadores;

    const buscar = (selector, valor) => Array.from(caja.querySelectorAll(selector)).find(b => b.getAttribute(selector.slice(1, -1)) === valor);
    const claveDelFoco = () => {
      const a = document.activeElement;
      if (!a || !caja.contains(a)) return null;
      for (const at of ['data-mp-puesto', 'data-mp-casilla', 'data-mp-ref', 'data-mp-vista', 'data-mp-plano', 'data-mp-piso']) {
        if (a.hasAttribute(at)) return [at, a.getAttribute(at)];
      }
      return null;
    };
    const devolverFoco = marca => {
      if (!marca) return;
      const b = buscar(`[${marca[0]}]`, marca[1]);
      if (b && !b.disabled) b.focus();
    };
    const pintar = (avisar = '') => {
      caja.dataset.vista = vista;
      caja.dataset.modo = modo();
      caja.innerHTML = interior();
      if (avisar) caja.querySelector('[data-mp-aviso]').textContent = avisar;
    };

    const puestoPorClave = k => cuantosPuestos().find(p => clavePuesto(p.piso, p.puesto) === k);

    caja.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !caja.contains(b) || b.disabled) return;
      if (b.hasAttribute('data-mp-vista')) {
        vista = vista === 'mapa' ? 'lista' : 'mapa';
        guardarVista(vista, estado.claveVista);
        pintar(vista === 'mapa' ? 'Mostrando el mapa.' : 'Mostrando la lista.');
        caja.querySelector('[data-mp-vista]').focus();
      } else if (b.hasAttribute('data-mp-plano')) {
        (estado.abrirPlano || (n => abrirArchivoEnVentana('plano-' + n, `Plano del piso ${n}`)))(estado.piso);
      } else if (b.hasAttribute('data-mp-piso')) {
        if (hab.alCambiarPiso) hab.alCambiarPiso(Number(b.dataset.mpPiso));
      } else if (b.hasAttribute('data-mp-puesto')) {
        const p = puestoPorClave(b.dataset.mpPuesto);
        if (p && hab.alElegir) hab.alElegir(p, { gente: ocupantesDe(p), clave: b.dataset.mpPuesto });
      } else if (b.hasAttribute('data-mp-casilla')) {
        const [col, fila] = b.dataset.mpCasilla.split(',').map(Number);
        if (hab.alElegirCasilla) hab.alElegirCasilla({ col, fila });
      } else if (b.hasAttribute('data-mp-ref')) {
        const r = referenciasDelPiso().find(x => String(x.id) === b.dataset.mpRef);
        if (r && hab.alElegirReferencia) hab.alElegirReferencia(r);
      }
    });

    // Flechas: pasan al elemento vecino de la cuadrícula. Tab recorre los puestos en orden de fila y columna.
    caja.addEventListener('keydown', e => {
      if (hab.alTeclas) hab.alTeclas(e);
      if (e.defaultPrevented) return;
      const direcciones = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
      const d = direcciones[e.key];
      const actual = e.target.closest && e.target.closest('[data-col]');
      if (!d || !actual || !caja.contains(actual)) return;
      const sig = vecino(caja, actual, d);
      if (sig) {
        e.preventDefault();
        if (modo() === 'editar') {
          caja.querySelectorAll('.mp-rejilla [tabindex="0"]').forEach(x => x.setAttribute('tabindex', '-1'));
          sig.setAttribute('tabindex', '0');
          foco = sig.dataset.mpPuesto ? 'p:' + sig.dataset.mpPuesto : sig.dataset.mpRef ? 'r:' + sig.dataset.mpRef : 'c:' + sig.dataset.mpCasilla;
        }
        sig.focus();
      }
    });
    if (modo() === 'editar') {
      caja.addEventListener('focusin', e => {
        const x = e.target.closest && e.target.closest('.mp-rejilla [data-col]');
        if (!x) return;
        caja.querySelectorAll('.mp-rejilla [tabindex="0"]').forEach(y => y.setAttribute('tabindex', '-1'));
        x.setAttribute('tabindex', '0');
        foco = x.dataset.mpPuesto ? 'p:' + x.dataset.mpPuesto : x.dataset.mpRef ? 'r:' + x.dataset.mpRef : 'c:' + x.dataset.mpCasilla;
      });
    }

    return {
      // Dibuja de nuevo con datos nuevos (por ejemplo una marca de emergencia) y devuelve el foco al mismo botón.
      repintar(nuevos = {}) {
        const marca = claveDelFoco();
        Object.assign(estado, nuevos);
        pintar();
        devolverFoco(marca);
      },
      enfocar(clave) { const b = buscar('[data-mp-puesto]', clave); if (b && !b.disabled) b.focus(); },
      vista: () => vista
    };
  }

  return { html, enlazar };
}

// Elemento más cercano en la dirección pedida entre los que se pueden enfocar.
// Izquierda y derecha se quedan en la misma fila; arriba y abajo pasan a la fila más próxima y, en ella,
// a la columna más cercana.
export function vecino(caja, actual, [dx, dy]) {
  const col = Number(actual.dataset.col), fila = Number(actual.dataset.fila);
  const candidatos = Array.from(caja.querySelectorAll('.mp-rejilla [data-col]'))
    .filter(b => b !== actual && !b.disabled)
    .map(b => ({ b, c: Number(b.dataset.col), f: Number(b.dataset.fila) }));
  let elegibles;
  if (dy === 0) {
    elegibles = candidatos.filter(x => x.f === fila && (dx > 0 ? x.c > col : x.c < col));
    elegibles.sort((a, b) => dx > 0 ? a.c - b.c : b.c - a.c);
  } else {
    elegibles = candidatos.filter(x => dy > 0 ? x.f > fila : x.f < fila);
    elegibles.sort((a, b) => Math.abs(a.f - fila) - Math.abs(b.f - fila) || Math.abs(a.c - col) - Math.abs(b.c - col));
    if (elegibles.length) { const f = elegibles[0].f; elegibles = elegibles.filter(x => x.f === f); }
  }
  return elegibles.length ? elegibles[0].b : null;
}
