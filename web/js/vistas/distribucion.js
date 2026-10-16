// Administración → Distribución de pisos: la administradora diseña el esquema de cada piso (puestos y
// referencias sobre una cuadrícula) y lo guarda con «guardarDistribucion». La distribución no tiene datos
// personales, así que no hace falta guardar la llave.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as llave from '../llave.js';
import { llamar } from '../api.js';
import { mapaPiso, ubicar, MAX_COLUMNAS, MAX_FILAS, rotulo } from '../mapa-piso.js';
import { esc, aviso, confirmar, espera, icono } from '../ui.js';

const MAX_PUESTOS = 200;
const MAX_REFERENCIAS = 40;
const MAX_ETIQUETA = 30;
const MAX_DESHACER = 20;
const TIPOS = [['escalera', 'Escalera'], ['sala', 'Sala'], ['bano', 'Baño'], ['ascensor', 'Ascensor'], ['pasillo', 'Pasillo'], ['otro', 'Otra referencia']];
const HERRAMIENTAS = [
  ['mover', 'Mover'], ['puesto', 'Agregar puesto'], ['referencia', 'Agregar referencia'], ['quitar', 'Quitar'], ['asignable', 'Asignable o no']
];
const AYUDA = {
  mover: 'Toque un puesto o una referencia y luego una casilla vacía.',
  puesto: 'Toque una casilla vacía para crear el puesto con el número indicado.',
  referencia: 'Elija el tipo, la etiqueta y el tamaño, y toque la casilla de la esquina superior izquierda.',
  quitar: 'Toque un puesto libre o una referencia para quitarlo. Un puesto ocupado no se quita.',
  asignable: 'Toque un puesto libre para alternarlo entre asignable y no asignable.'
};

// Estado compartido con Administración: ¿hay cambios sin guardar en la pantalla abierta?
let panelActivo = null;
let hayCambios = false;
export const distribucionSinGuardar = () => hayCambios && !!panelActivo && panelActivo.isConnected;

// Pregunta antes de abandonar la distribución con cambios sin guardar. Devuelve true si se puede seguir.
export async function confirmarSalidaDistribucion() {
  if (!distribucionSinGuardar()) return true;
  const si = await confirmar('Cambios sin guardar', 'Hay cambios sin guardar en la distribución del piso. Si sigue, se pierden.', 'Descartar los cambios', true);
  if (si) hayCambios = false;
  return si;
}

const copia = x => JSON.parse(JSON.stringify(x));
const entero = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) || !Number.isInteger(Number(v)) ? null : Number(v));
const unir = n => n.length <= 1 ? n.join('') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];

export function panelDistribucion(panel) {
  let piso = CONFIG.PISOS[0];
  let puestos = [], referencias = [];            // copia de trabajo del piso abierto
  let guardado = '';                              // firma de lo guardado, para saber si hay cambios
  let pila = [];                                  // pasos para deshacer (solo en pantalla)
  let herramienta = 'mover';
  let seleccion = null;                           // { tipo: 'puesto' | 'ref', id }
  let proximaRef = 1;
  const opciones = { numero: 1, tipo: 'escalera', etiqueta: '', ancho: 1, alto: 1 };

  // ---------- Datos ----------

  const nombreDe = codigo => (llave.persona(codigo) && llave.persona(codigo).nombre) || sesion.nombreDe(codigo);
  const gentePorPuesto = () => {
    const m = new Map();
    (sesion.base().personas || []).filter(p => p.estado === 'activo').forEach(p => {
      const k = `${p.piso}-${p.puesto}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ codigo: p.codigo, nombre: nombreDe(p.codigo) });
    });
    return m;
  };
  const ocupantesDe = n => gentePorPuesto().get(`${piso}-${n}`) || [];

  function cargarPiso(n) {
    const b = sesion.base();
    piso = n;
    puestos = (b.puestos || []).filter(x => x.piso === n).sort((a, c) => a.puesto - c.puesto)
      .map(x => ({ puesto: x.puesto, col: x.col, fila: x.fila, asignable: x.asignable !== false }));
    referencias = (b.referencias || []).filter(r => r.piso === n).map(r => ({ id: r.id, tipo: r.tipo, etiqueta: r.etiqueta, col: r.col, fila: r.fila, ancho: r.ancho, alto: r.alto }));
    guardado = firma();
    pila = [];
    seleccion = null;
    opciones.numero = siguienteNumero();
  }

  const firma = () => JSON.stringify({
    p: puestos.slice().sort((a, b) => a.puesto - b.puesto),
    r: referencias.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
  });
  const siguienteNumero = () => { const usados = new Set(puestos.map(p => p.puesto)); let n = 1; while (usados.has(n)) n++; return n; };

  // En el formato del mapa: cada puesto y referencia lleva su piso.
  const datosMapa = () => ({
    puestos: puestos.map(p => ({ piso, puesto: p.puesto, estado: 'vacante', col: p.col, fila: p.fila, asignable: p.asignable })),
    referencias: referencias.map(r => ({ ...r, piso }))
  });

  // Casillas que ya usa algo (los puestos sin posición se cuentan donde el mapa los dibuja).
  function casillasUsadas(excepto = null) {
    const d = datosMapa();
    const usadas = new Set();
    ubicar(d.puestos, d.referencias).puestos.forEach(p => {
      if (excepto && excepto.tipo === 'puesto' && p.puesto === excepto.id) return;
      usadas.add(`${p.col},${p.fila}`);
    });
    referencias.forEach(r => {
      if (excepto && excepto.tipo === 'ref' && r.id === excepto.id) return;
      for (let a = 0; a < r.ancho; a++) for (let b = 0; b < r.alto; b++) usadas.add(`${r.col + a},${r.fila + b}`);
    });
    return usadas;
  }

  // ¿Cabe un rectángulo de ancho × alto con su esquina en (col, fila)? Devuelve el motivo si no cabe.
  function motivoNoCabe(col, fila, ancho, alto, excepto = null) {
    if (col + ancho - 1 > MAX_COLUMNAS || fila + alto - 1 > MAX_FILAS) return 'No cabe ahí: se sale del esquema.';
    const usadas = casillasUsadas(excepto);
    for (let a = 0; a < ancho; a++) for (let b = 0; b < alto; b++) if (usadas.has(`${col + a},${fila + b}`)) return 'No cabe ahí: hay otro elemento en esas casillas.';
    return '';
  }

  // ---------- Cambios con deshacer ----------

  function cambiar(fn) {
    pila.push(copia({ puestos, referencias }));
    if (pila.length > MAX_DESHACER) pila.shift();
    fn();
    refrescar();
  }

  // ---------- Estructura de la pantalla ----------

  cargarPiso(piso);
  const estadoDe = p => (seleccion && seleccion.tipo === 'puesto' && seleccion.id === p.puesto ? { clase: 'elegido' } : {});
  const mapa = mapaPiso({
    piso, ...datosMapa(), ocupantes: gentePorPuesto(), modo: 'editar', idBase: 'mapa-dist', pisos: CONFIG.PISOS, vista: 'mapa',
    estadoDe, refElegida: null
  });

  panel.innerHTML = `
    <div class="nota nota-info">${icono('info')}<span>Diseñe el esquema de cada piso: ubique los puestos como están en el piso real y agregue puntos de referencia (escalera, salas, baños). Esto no lleva datos personales y se guarda por piso con el botón «Guardar distribución».</span></div>
    <div class="fila no-imprimir" role="group" aria-label="Herramientas del esquema" id="d-herramientas" style="margin:1rem 0 .5rem">
      ${HERRAMIENTAS.map(([id, t]) => `<button type="button" class="pestana" data-h="${id}" aria-pressed="false">${t}</button>`).join('')}
    </div>
    <p class="ayuda" id="d-ayuda" role="status" aria-live="polite" style="margin:0 0 .5rem"></p>
    <div class="fila no-imprimir" id="d-opciones" style="align-items:flex-end;margin-bottom:.5rem"></div>
    <div class="fila no-imprimir" style="margin-bottom:.75rem">
      <button type="button" class="btn btn-secundario btn-chico" id="d-orden">Ordenar automáticamente</button>
      <button type="button" class="btn btn-secundario btn-chico" id="d-deshacer">Deshacer</button>
      <button type="button" class="btn btn-oscuro" id="d-guardar">${icono('guardar', 'ic-s')}<span id="d-guardar-texto"></span></button>
      <span class="sutil" id="d-estado"></span>
    </div>
    <div class="nota nota-error oculto" id="d-error" role="alert"></div>
    <div id="caja-mapa">${mapa.html}</div>
    <p class="sutil" id="d-resumen" style="margin-top:.5rem"></p>`;
  const $ = s => panel.querySelector(s);

  function pintarOpciones() {
    const caja = $('#d-opciones');
    if (herramienta === 'puesto') {
      caja.innerHTML = `<div class="campo" style="margin:0"><label class="etiqueta" for="d-num">Número del puesto</label><input id="d-num" type="number" min="1" max="999" step="1" value="${opciones.numero}" style="width:7rem"></div>`;
    } else if (herramienta === 'referencia') {
      caja.innerHTML = `
        <div class="campo" style="margin:0"><label class="etiqueta" for="d-tipo">Tipo</label><select id="d-tipo">${TIPOS.map(([v, t]) => `<option value="${v}" ${v === opciones.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="campo" style="margin:0"><label class="etiqueta" for="d-etq">Etiqueta (máximo ${MAX_ETIQUETA} letras)</label><input id="d-etq" type="text" maxlength="${MAX_ETIQUETA}" value="${esc(opciones.etiqueta)}" placeholder="Sala de juntas" style="width:13rem"></div>
        <div class="campo" style="margin:0"><label class="etiqueta" for="d-ancho">Ancho</label><input id="d-ancho" type="number" min="1" max="6" step="1" value="${opciones.ancho}" style="width:5rem"></div>
        <div class="campo" style="margin:0"><label class="etiqueta" for="d-alto">Alto</label><input id="d-alto" type="number" min="1" max="6" step="1" value="${opciones.alto}" style="width:5rem"></div>`;
    } else caja.innerHTML = '';
    caja.querySelectorAll('input, select').forEach(el => el.addEventListener('input', leerOpciones));
  }
  function leerOpciones() {
    const v = id => { const el = panel.querySelector(id); return el ? el.value : null; };
    if (v('#d-num') !== null) opciones.numero = v('#d-num');
    if (v('#d-tipo') !== null) {
      opciones.tipo = v('#d-tipo'); opciones.etiqueta = v('#d-etq'); opciones.ancho = v('#d-ancho'); opciones.alto = v('#d-alto');
    }
  }

  function refrescar() {
    hayCambios = firma() !== guardado;
    panel.querySelectorAll('#d-herramientas button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.h === herramienta)));
    panel.querySelectorAll('#d-herramientas button').forEach(b => b.classList.toggle('activa', b.dataset.h === herramienta));
    const ayuda = AYUDA[herramienta] + (herramienta === 'mover' && seleccion
      ? ` Elegido: ${seleccion.tipo === 'puesto' ? rotulo(piso, seleccion.id) : 'la referencia'}. Ahora toque una casilla vacía.` : '');
    $('#d-ayuda').textContent = ayuda;
    $('#d-deshacer').disabled = !pila.length;
    $('#d-guardar-texto').textContent = `Guardar distribución del piso ${piso}`;
    $('#d-estado').textContent = hayCambios ? 'Hay cambios sin guardar.' : 'Todo guardado.';
    const sinUbicar = puestos.filter(p => p.col === null || p.fila === null).length;
    $('#d-resumen').textContent = `Piso ${piso}: ${puestos.length} puesto(s)${sinUbicar ? `, ${sinUbicar} sin ubicar (use «Ordenar automáticamente»)` : ''}${puestos.some(p => !p.asignable) ? `, ${puestos.filter(p => !p.asignable).length} no asignable(s)` : ''}; ${referencias.length} referencia(s).`;
    control.repintar({ piso, ...datosMapa(), ocupantes: gentePorPuesto(), refElegida: seleccion && seleccion.tipo === 'ref' ? seleccion.id : null });
  }

  // ---------- Toques en el mapa ----------

  const bloqueo = (n, que) => {
    const gente = ocupantesDe(n);
    return gente.length ? `El puesto ${rotulo(piso, n)} tiene ${gente.length === 1 ? 'asignada a' : 'asignadas a'} ${unir(gente.map(g => g.nombre))}: ${gente.length === 1 ? 'muévala' : 'muévalas'} antes de ${que}.` : '';
  };

  function alElegirPuesto(p) {
    const n = p.puesto;
    if (herramienta === 'mover') {
      seleccion = seleccion && seleccion.tipo === 'puesto' && seleccion.id === n ? null : { tipo: 'puesto', id: n };
      refrescar();
    } else if (herramienta === 'quitar') {
      const m = bloqueo(n, 'quitarlo');
      if (m) return aviso(m, 'error');
      cambiar(() => { puestos = puestos.filter(x => x.puesto !== n); seleccion = null; opciones.numero = siguienteNumero(); });
    } else if (herramienta === 'asignable') {
      const actual = puestos.find(x => x.puesto === n);
      if (actual.asignable) {
        const m = bloqueo(n, 'marcarlo como no asignable');
        if (m) return aviso(m, 'error');
      }
      cambiar(() => { actual.asignable = !actual.asignable; });
    } else {
      aviso('Esa casilla ya tiene un puesto. Toque una casilla vacía.', 'advertencia');
    }
  }

  function alElegirReferencia(r) {
    if (herramienta === 'mover') {
      seleccion = seleccion && seleccion.tipo === 'ref' && seleccion.id === r.id ? null : { tipo: 'ref', id: r.id };
      refrescar();
    } else if (herramienta === 'quitar') {
      cambiar(() => { referencias = referencias.filter(x => x.id !== r.id); seleccion = null; });
    } else if (herramienta === 'asignable') {
      aviso('Las referencias no tienen esa opción: toque un puesto.', 'advertencia');
    } else {
      aviso('Esa casilla ya tiene una referencia. Toque una casilla vacía.', 'advertencia');
    }
  }

  function alElegirCasilla({ col, fila }) {
    leerOpciones();
    if (herramienta === 'mover') {
      if (!seleccion) return aviso('Elija primero un puesto o una referencia y luego la casilla de destino.', 'advertencia');
      if (seleccion.tipo === 'puesto') {
        const motivo = motivoNoCabe(col, fila, 1, 1, seleccion);
        if (motivo) return aviso(motivo, 'error');
        cambiar(() => { const p = puestos.find(x => x.puesto === seleccion.id); p.col = col; p.fila = fila; seleccion = null; });
      } else {
        const r = referencias.find(x => x.id === seleccion.id);
        const motivo = motivoNoCabe(col, fila, r.ancho, r.alto, seleccion);
        if (motivo) return aviso(motivo, 'error');
        cambiar(() => { r.col = col; r.fila = fila; seleccion = null; });
      }
    } else if (herramienta === 'puesto') {
      const n = entero(opciones.numero);
      if (n === null || n < 1 || n > 999) return aviso('El número del puesto debe ser un entero de 1 a 999.', 'error');
      if (puestos.some(x => x.puesto === n)) return aviso(`El puesto ${rotulo(piso, n)} ya existe en este piso.`, 'error');
      if (puestos.length >= MAX_PUESTOS) return aviso(`Un piso admite como máximo ${MAX_PUESTOS} puestos.`, 'error');
      cambiar(() => { puestos.push({ puesto: n, col, fila, asignable: true }); puestos.sort((a, b) => a.puesto - b.puesto); opciones.numero = siguienteNumero(); });
      const campo = panel.querySelector('#d-num');
      if (campo) campo.value = opciones.numero;
    } else if (herramienta === 'referencia') {
      const ancho = entero(opciones.ancho), alto = entero(opciones.alto);
      const etiqueta = String(opciones.etiqueta || '').trim();
      if (ancho === null || alto === null || ancho < 1 || alto < 1 || ancho > 6 || alto > 6) return aviso('El ancho y el alto van de 1 a 6 casillas.', 'error');
      if (etiqueta.length > MAX_ETIQUETA) return aviso(`La etiqueta admite hasta ${MAX_ETIQUETA} caracteres.`, 'error');
      if (referencias.length >= MAX_REFERENCIAS) return aviso(`Un piso admite como máximo ${MAX_REFERENCIAS} referencias.`, 'error');
      const motivo = motivoNoCabe(col, fila, ancho, alto);
      if (motivo) return aviso(motivo, 'error');
      cambiar(() => { referencias.push({ id: 'nuevo-' + proximaRef++, nueva: true, tipo: opciones.tipo, etiqueta, col, fila, ancho, alto }); });
    } else {
      aviso('Con esta herramienta toque un puesto o una referencia, no una casilla vacía.', 'advertencia');
    }
  }

  const control = mapa.enlazar($('#caja-mapa'), {
    alElegir: alElegirPuesto, alElegirReferencia, alElegirCasilla,
    alCambiarPiso: async n => {
      if (n === piso) return;
      if (!await confirmarSalidaDistribucion()) return;
      cargarPiso(n);
      $('#d-error').classList.add('oculto');
      refrescar();
    }
  });

  // ---------- Botones ----------

  panel.querySelectorAll('#d-herramientas button').forEach(b => b.addEventListener('click', () => {
    leerOpciones();
    herramienta = b.dataset.h;
    if (herramienta !== 'mover') seleccion = null;
    pintarOpciones();
    refrescar();
  }));

  $('#d-orden').addEventListener('click', () => {
    const d = datosMapa();
    const u = ubicar(d.puestos, d.referencias);
    const sueltos = u.puestos.filter(p => p.automatica);
    if (!sueltos.length) return aviso('Todos los puestos ya tienen posición.', 'info');
    if (sueltos.some(p => p.fila > MAX_FILAS)) return aviso(`No caben todos los puestos sin ubicar: el esquema tiene ${MAX_FILAS} filas. Quite o reubique elementos primero.`, 'error');
    cambiar(() => sueltos.forEach(s => { const p = puestos.find(x => x.puesto === s.puesto); p.col = s.col; p.fila = s.fila; }));
    aviso(`Se ubicaron ${sueltos.length} puesto(s) automáticamente.`, 'exito');
  });

  $('#d-deshacer').addEventListener('click', () => {
    const anterior = pila.pop();
    if (!anterior) return;
    puestos = anterior.puestos; referencias = anterior.referencias; seleccion = null;
    opciones.numero = siguienteNumero();
    pintarOpciones();
    refrescar();
  });

  $('#d-guardar').addEventListener('click', async () => {
    if (!hayCambios) return aviso('No hay cambios por guardar en este piso.', 'info');
    const error = $('#d-error');
    error.classList.add('oculto');
    const capa = espera('Guardando la distribución…');
    try {
      const d = await llamar('guardarDistribucion', {
        piso,
        puestos: puestos.map(p => ({ puesto: p.puesto, col: p.col === undefined ? null : p.col, fila: p.fila === undefined ? null : p.fila, asignable: p.asignable })),
        referencias: referencias.map(r => ({ ...(r.nueva ? {} : { id: r.id }), tipo: r.tipo, etiqueta: r.etiqueta, col: r.col, fila: r.fila, ancho: r.ancho, alto: r.alto }))
      });
      capa.cerrar();
      const b = sesion.base();
      b.puestos = d.puestos;
      b.referencias = d.referencias;
      sesion.guardarBase();
      cargarPiso(piso);
      refrescar();
      aviso(`Distribución del piso ${piso} guardada.`, 'exito');
    } catch (e) {
      // Se muestra el motivo y se conserva lo editado.
      capa.cerrar();
      error.innerHTML = `${icono('alerta')}<span>${esc(e.message)}</span>`;
      error.classList.remove('oculto');
      aviso(e.message, 'error');
    }
  });

  // ---------- Cambios sin guardar: avisar antes de salir ----------

  panelActivo = panel;
  const navegacion = '#nav a, #subnav a, #btn-cuenta, #btn-salir';
  const alClic = async ev => {
    if (!panel.isConnected) { document.removeEventListener('click', alClic, true); return; }
    if (!hayCambios) return;
    const destino = ev.target.closest && ev.target.closest(navegacion);
    if (!destino) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (await confirmarSalidaDistribucion()) destino.click();
  };
  const alCerrarPagina = ev => {
    if (!panel.isConnected) { removeEventListener('beforeunload', alCerrarPagina); return; }
    if (hayCambios) { ev.preventDefault(); ev.returnValue = ''; }
  };
  document.addEventListener('click', alClic, true);
  addEventListener('beforeunload', alCerrarPagina);

  pintarOpciones();
  refrescar();
  hayCambios = false;
}
