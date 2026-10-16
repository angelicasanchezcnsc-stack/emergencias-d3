// Ventanas de la gestión del personal (Administración → Personas y roles): elegir puesto en el mapa,
// agregar una persona, corregir datos, menú «Más» e historial de cambios. Solo interfaz: la lógica está en js/personal.js.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as llave from '../llave.js';
import * as cripto from '../cripto.js';
import * as personal from '../personal.js';
import { mapaPiso } from '../mapa-piso.js';
import { esc, modal, aviso, barraBusqueda, enlazarBusqueda, coincide } from '../ui.js';

const rotulo = (piso, puesto) => `P${piso}-${puesto}`;
const nombreVisible = codigo => (llave.persona(codigo) && llave.persona(codigo).nombre) || sesion.nombreDe(codigo);
const unir = nombres => nombres.length <= 1 ? nombres.join('') : nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// El fondo de la ventana que acaba de abrir ui.modal (se crea de forma síncrona).
const ultimoFondo = () => Array.from(document.querySelectorAll('.modal-fondo')).pop();

// Ocupantes por puesto, en el formato del mapa: Map "piso-puesto" → [{ codigo, nombre }].
function mapaDeOcupantes() {
  const m = new Map();
  (sesion.base().personas || []).filter(p => p.estado === 'activo').forEach(p => {
    const k = `${p.piso}-${p.puesto}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push({ codigo: p.codigo, nombre: nombreVisible(p.codigo) });
  });
  return m;
}

// Conecta la búsqueda de personas con el mapa: resalta sus puestos y pasa al piso de la primera coincidencia.
function buscadorDePuestos(fondo, { control, estado }) {
  const personas = (sesion.base().personas || []).filter(p => p.estado === 'activo');
  const texto = p => [nombreVisible(p.codigo), p.codigo, rotulo(p.piso, p.puesto), `piso ${p.piso} puesto ${p.puesto}`].join(' ');
  const busqueda = enlazarBusqueda(fondo, 'buscar-puesto', v => {
    const encontradas = v ? personas.filter(p => coincide(texto(p), v)) : [];
    estado.resaltar = new Set(encontradas.map(p => `${p.piso}-${p.puesto}`));
    if (encontradas.length && !encontradas.some(p => p.piso === estado.piso)) estado.piso = encontradas[0].piso;
    busqueda.conteo(!v ? '' : !encontradas.length ? 'Nadie coincide con la búsqueda.'
      : `${encontradas.length} coincidencia(s): ${encontradas.slice(0, 5).map(p => `${nombreVisible(p.codigo)} (${rotulo(p.piso, p.puesto)})`).join('; ')}${encontradas.length > 5 ? '…' : ''}`);
    control.repintar({ piso: estado.piso, resaltar: estado.resaltar });
  });
}

// ---------- Elegir un puesto para una persona (cambiar de puesto o reactivarla) ----------

// Devuelve null (se cancela) o { tipo: 'mover' | 'intercambiar' | 'compartir' | 'reactivar', piso, puesto, con? }.
export function ventanaPuesto({ codigo, reactivar = false }) {
  const base = sesion.base();
  const yo = (base.personas || []).find(p => p.codigo === codigo) || {};
  const lp = llave.persona(codigo) || {};
  const nombre = nombreVisible(codigo);
  const origen = reactivar ? (lp.piso ? { piso: lp.piso, puesto: lp.puesto } : null) : { piso: yo.piso, puesto: yo.puesto };
  const estado = { piso: CONFIG.PISOS.includes(origen && origen.piso) ? origen.piso : CONFIG.PISOS[0], resaltar: new Set(), elegido: null };
  const claveActual = reactivar ? null : `${yo.piso}-${yo.puesto}`;

  const estadoDe = p => {
    const k = `${p.piso}-${p.puesto}`;
    if (k === claveActual) return { clase: 'actual', texto: `puesto actual de ${nombre}` };
    if (estado.elegido && estado.elegido.piso === p.piso && estado.elegido.puesto === p.puesto) return { clase: 'elegido' };
    return {};
  };
  const mapa = mapaPiso({
    piso: estado.piso, puestos: base.puestos || [], referencias: base.referencias || [], ocupantes: mapaDeOcupantes(),
    modo: 'elegir', idBase: 'mapa-puesto', pisos: CONFIG.PISOS, estadoDe, resaltar: estado.resaltar
  });

  const respuesta = modal({
    titulo: reactivar ? `Reactivar a ${nombre}: elija su puesto` : `Cambiar el puesto de ${nombre}`,
    ancho: 'ancho',
    cuerpo: `
      <p class="sutil" style="margin-bottom:.75rem">${reactivar
        ? `Último puesto: ${origen ? rotulo(origen.piso, origen.puesto) : 'sin dato'}.`
        : `Hoy está en el piso ${yo.piso}, puesto ${yo.puesto}.`} Toque un puesto en el mapa.</p>
      ${barraBusqueda({ id: 'buscar-puesto', etiqueta: 'Buscar a otra persona para ver su puesto' })}
      <div id="caja-mapa">${mapa.html}</div>
      <div id="resumen-puesto" class="nota nota-info" style="margin-top:.75rem" role="status" aria-live="polite"></div>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      { texto: reactivar ? 'Reactivar aquí' : 'Mover aquí', clase: 'btn-oscuro', valor: () => ({ tipo: reactivar ? 'reactivar' : 'mover', ...estado.elegido }) },
      { texto: 'Intercambiar puestos', clase: 'btn-oscuro', valor: () => ({ tipo: 'intercambiar', ...estado.elegido, con: estado.otros[0].codigo }) },
      { texto: reactivar ? 'Reactivar y compartir' : 'Compartir el puesto', clase: 'btn-secundario', valor: () => ({ tipo: 'compartir', ...estado.elegido }) }
    ]
  });

  const fondo = ultimoFondo();
  const resumen = fondo.querySelector('#resumen-puesto');
  const botones = [1, 2, 3].map(i => fondo.querySelector(`.modal-pie [data-i="${i}"]`));
  const [btnMover, btnIntercambiar, btnCompartir] = botones;

  function actualizar() {
    botones.forEach(b => b.classList.add('oculto'));
    resumen.className = 'nota nota-info';
    const e = estado.elegido;
    estado.otros = [];
    if (!e) { resumen.textContent = 'Elija un puesto en el mapa o busque a una persona para ver dónde está.'; return; }
    const k = rotulo(e.piso, e.puesto);
    if (`${e.piso}-${e.puesto}` === claveActual) { resumen.textContent = `${nombre} ya está en ${k}.`; return; }
    estado.otros = (base.personas || []).filter(p => p.estado === 'activo' && p.piso === e.piso && p.puesto === e.puesto && p.codigo !== codigo)
      .map(p => ({ codigo: p.codigo, nombre: nombreVisible(p.codigo) }));
    if (!estado.otros.length) {
      resumen.innerHTML = reactivar ? `<span>Se reactiva a <strong>${esc(nombre)}</strong> en ${esc(k)}.</span>`
        : `<span><strong>${esc(nombre)}</strong>: ${esc(origen ? rotulo(origen.piso, origen.puesto) : 'sin puesto')} → ${esc(k)}</span>`;
      btnMover.classList.remove('oculto');
      return;
    }
    const nombres = estado.otros.map(o => esc(o.nombre));
    const cruce = personal.avisoCruce(codigo, e.piso, e.puesto);
    const puedeIntercambiar = !reactivar && estado.otros.length === 1 && origen;
    resumen.className = 'nota nota-adv';
    resumen.innerHTML = `<div><p style="margin:0 0 .4rem"><strong>${esc(k)}</strong> lo ocupa ${unir(nombres)}.</p>
      ${puedeIntercambiar ? `<p class="sutil" style="margin:0 0 .3rem"><strong>Intercambiar:</strong> ${esc(nombre)} pasa a ${esc(k)} y ${nombres[0]} pasa a ${esc(rotulo(origen.piso, origen.puesto))}.</p>` : ''}
      <p class="sutil" style="margin:0 0 .3rem"><strong>Compartir:</strong> ${esc(nombre)} y ${unir(nombres)} quedan en ${esc(k)}.</p>
      ${cruce ? `<p style="margin:.4rem 0 0"><strong>Atención:</strong> ${esc(cruce)}</p>` : ''}</div>`;
    if (puedeIntercambiar) btnIntercambiar.classList.remove('oculto');
    btnCompartir.classList.remove('oculto');
  }

  const caja = fondo.querySelector('#caja-mapa');
  const control = mapa.enlazar(caja, {
    alElegir: p => { estado.elegido = { piso: p.piso, puesto: p.puesto }; control.repintar({}); actualizar(); },
    alCambiarPiso: n => { estado.piso = n; control.repintar({ piso: n }); }
  });
  buscadorDePuestos(fondo, { control, estado });
  actualizar();
  return respuesta;
}

// ---------- Agregar una persona ----------

// Devuelve null o { nombre, correo, piso, puesto, compartirPuesto }.
export function ventanaAgregar() {
  const base = sesion.base();
  const estado = { piso: CONFIG.PISOS[0], elegido: null, resaltar: new Set(), compartir: false };
  const ocupantes = mapaDeOcupantes();
  // Los puestos ocupados no se pueden elegir salvo que se marque «Compartir un puesto ocupado».
  const elegibles = () => (base.puestos || []).map(x => ({ ...x, asignable: x.asignable !== false && (estado.compartir || !(ocupantes.get(`${x.piso}-${x.puesto}`) || []).length) }));
  const estadoDe = p => (estado.elegido && estado.elegido.piso === p.piso && estado.elegido.puesto === p.puesto ? { clase: 'elegido' } : {});
  const mapa = mapaPiso({
    piso: estado.piso, puestos: elegibles(), referencias: base.referencias || [], ocupantes, modo: 'elegir', idBase: 'mapa-alta',
    pisos: CONFIG.PISOS, estadoDe, resaltar: estado.resaltar
  });

  const respuesta = modal({
    titulo: 'Agregar persona', ancho: 'ancho',
    cuerpo: `
      <div class="fila">
        <div class="campo" style="flex:1;min-width:14rem"><label class="etiqueta" for="a-nombre">Nombre completo</label><input id="a-nombre" type="text" autocomplete="off"></div>
        <div class="campo" style="flex:1;min-width:14rem"><label class="etiqueta" for="a-correo">Correo institucional</label><input id="a-correo" type="email" autocomplete="off"></div>
      </div>
      <label class="casilla"><input type="checkbox" id="a-compartir">Compartir un puesto ocupado</label>
      <p class="ayuda">Elija el puesto en el mapa. Solo se pueden elegir los puestos libres; para uno ocupado marque «Compartir un puesto ocupado».</p>
      ${barraBusqueda({ id: 'buscar-puesto', etiqueta: 'Buscar a una persona para ver su puesto' })}
      <div id="caja-mapa">${mapa.html}</div>
      <div id="resumen-puesto" class="nota nota-info" style="margin-top:.75rem" role="status" aria-live="polite">Elija un puesto en el mapa.</div>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Agregar', clase: 'btn-oscuro',
        antes: f => {
          const nombre = f.querySelector('#a-nombre').value.trim(), correo = cripto.normalizarCorreo(f.querySelector('#a-correo').value);
          const error = !nombre ? 'Escriba el nombre completo.'
            : !FORMATO_CORREO.test(correo) ? 'El correo no tiene un formato válido.'
            : llave.personas().some(p => cripto.normalizarCorreo(p.correo) === correo) ? 'Ese correo ya está en la llave (de una persona activa o retirada).'
            : !estado.elegido ? 'Elija un puesto en el mapa.' : '';
          if (error) { aviso(error, 'error'); return false; }
        },
        valor: f => ({
          nombre: f.querySelector('#a-nombre').value.trim(), correo: cripto.normalizarCorreo(f.querySelector('#a-correo').value),
          piso: estado.elegido.piso, puesto: estado.elegido.puesto, compartirPuesto: estado.compartir
        })
      }
    ]
  });

  const fondo = ultimoFondo();
  const resumen = fondo.querySelector('#resumen-puesto');
  const actualizar = () => {
    const e = estado.elegido;
    if (!e) { resumen.textContent = 'Elija un puesto en el mapa.'; return; }
    const quienes = ocupantes.get(`${e.piso}-${e.puesto}`) || [];
    resumen.textContent = quienes.length
      ? `${rotulo(e.piso, e.puesto)} lo ocupa ${unir(quienes.map(q => q.nombre))}: quedará compartido.`
      : `Puesto elegido: ${rotulo(e.piso, e.puesto)} (libre).`;
  };
  const control = mapa.enlazar(fondo.querySelector('#caja-mapa'), {
    alElegir: p => { estado.elegido = { piso: p.piso, puesto: p.puesto }; control.repintar({}); actualizar(); },
    alCambiarPiso: n => { estado.piso = n; control.repintar({ piso: n }); }
  });
  fondo.querySelector('#a-compartir').addEventListener('change', e => {
    estado.compartir = e.target.checked;
    const eleg = estado.elegido;
    if (eleg && !estado.compartir && (ocupantes.get(`${eleg.piso}-${eleg.puesto}`) || []).length) estado.elegido = null;
    control.repintar({ puestos: elegibles() });
    actualizar();
  });
  buscadorDePuestos(fondo, { control, estado });
  return respuesta;
}

// ---------- Corregir nombre o correo ----------

// Devuelve null o { nombre, correo } con lo que se escribió.
export function ventanaCorregir(codigo) {
  const p = llave.persona(codigo);
  return modal({
    titulo: `Corregir datos de ${p.nombre}`,
    cuerpo: `
      <div class="campo"><label class="etiqueta" for="c-nombre">Nombre completo</label><input id="c-nombre" type="text" value="${esc(p.nombre)}" autocomplete="off"></div>
      <div class="campo"><label class="etiqueta" for="c-correo">Correo institucional</label><input id="c-correo" type="email" value="${esc(p.correo)}" autocomplete="off"></div>
      <p class="ayuda">Si cambia el correo, se genera una contraseña temporal nueva y la actual deja de servir.</p>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Guardar', clase: 'btn-oscuro',
        antes: f => {
          const nombre = f.querySelector('#c-nombre').value.trim(), correo = cripto.normalizarCorreo(f.querySelector('#c-correo').value);
          const error = !nombre ? 'Escriba el nombre completo.' : !FORMATO_CORREO.test(correo) ? 'El correo no tiene un formato válido.'
            : llave.personas().some(x => x.codigo !== codigo && cripto.normalizarCorreo(x.correo) === correo) ? 'Ese correo ya está en la llave (de otra persona).'
            : nombre === p.nombre && correo === cripto.normalizarCorreo(p.correo) ? 'No hay nada que corregir.' : '';
          if (error) { aviso(error, 'error'); return false; }
        },
        valor: f => ({ nombre: f.querySelector('#c-nombre').value.trim(), correo: f.querySelector('#c-correo').value })
      }
    ]
  });
}

// ---------- Menú «Más» ----------

// Devuelve 'corregir', 'retirar' o null.
export function ventanaMas(codigo) {
  return modal({
    titulo: `Más acciones: ${nombreVisible(codigo)}`,
    cuerpo: '<p class="sutil">Elija qué quiere hacer con esta persona.</p>',
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      { texto: 'Corregir nombre o correo', valor: 'corregir', clase: 'btn-secundario' },
      { texto: 'Retirar', valor: 'retirar', clase: 'btn-peligro' }
    ]
  });
}

// ---------- Cambios recientes ----------

export function ventanaHistorial() {
  const lista = llave.historial();
  const cuando = f => { try { return new Date(f).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }); } catch { return String(f); } };
  return modal({
    titulo: 'Cambios recientes del personal', ancho: 'ancho',
    cuerpo: lista.length
      ? `<p class="sutil">Los últimos ${llave.MAX_HISTORIAL} cambios, del más reciente al más antiguo. Se guardan en la llave maestra, no en Google.</p>
        <div class="tabla-caja"><table><thead><tr><th>Fecha</th><th>Cambio</th><th>Quién</th></tr></thead>
        <tbody>${lista.map(h => `<tr><td class="mono" style="white-space:nowrap">${esc(cuando(h.fecha))}</td><td>${esc(h.que)}</td>
          <td>${esc(nombreVisible(h.quien))} <span class="sutil mono">${esc(h.quien)}</span></td></tr>`).join('')}</tbody></table></div>`
      : '<p>Todavía no hay cambios del personal anotados en esta llave.</p>'
  });
}
