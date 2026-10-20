// Hoy en la sede: quién está previsto por piso según la agenda y las novedades, registro de
// novedades (sin motivo) y censo del día para imprimir. No registra horas de llegada ni salida.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as novedades from '../novedades.js';
import { ubicacionHoy } from '../presencia.js';
import { esc, icono, insignia, aviso, confirmar, modal } from '../ui.js';
import { mapaPiso, rotulo, nombreCorto } from '../mapa-piso.js';
import { fechaLegible, fechaBogota } from '../tiempo.js';
import { insigniaPresencia, formularioNovedad, textoNovedad } from './comun.js';

const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Personas activas con su presencia de hoy.
function personasDelDia() {
  return (sesion.base().personas || []).filter(p => p.estado === 'activo').map(p => ({
    p, r: ubicacionHoy(p), nombre: sesion.nombreDe(p.codigo)
  }));
}

export function resumen(lista) {
  return {
    previstas: lista.filter(x => x.r.presente).length,
    noAsisten: lista.filter(x => !x.r.presente).length,
    otroLugar: lista.filter(x => x.r.otroLugar).length
  };
}

const rangoLegible = n => n.desde === n.hasta ? fechaLegible(n.desde) : `${fechaLegible(n.desde)} a ${fechaLegible(n.hasta)}`;
const textoPrevistas = n => n === 1 ? '1 prevista' : n + ' previstas';
const porPuesto = (a, b) => (a.r.puesto || 999) - (b.r.puesto || 999);

export function vistaHoy(vista) {
  let filtroPiso = 'todos';
  let busqueda = '';

  const personaDe = codigo => sesion.base().personas.find(x => x.codigo === codigo);

  // Quién está o estará hoy en cada puesto del piso: las personas previstas ahí (también las que vienen de otro
  // piso), las que no asisten y las que hoy están en otro lugar (su puesto habitual se marca «Hoy en P6-3»).
  function datosDelPiso(n, todas) {
    const puestos = (sesion.base().puestos || []).filter(x => x.piso === n);
    const existe = new Set(puestos.map(x => x.puesto));
    const porPuesto = new Map();   // puesto -> [{ x, tipo, info }]
    const poner = (puesto, x, tipo, info = '') => { if (!porPuesto.has(puesto)) porPuesto.set(puesto, []); porPuesto.get(puesto).push({ x, tipo, info }); };
    const colocadas = new Set();
    // Quienes hoy están en un puesto de este piso (en el suyo o venidos de otro lugar).
    todas.filter(x => x.r.presente && x.r.piso === n && existe.has(x.r.puesto)).forEach(x => {
      poner(x.r.puesto, x, 'prevista', x.r.otroLugar ? `viene de ${rotulo(x.p.piso, x.p.puesto)}` : '');
      colocadas.add(x.p.codigo);
    });
    // Quienes tienen aquí su puesto habitual pero hoy no están en él.
    todas.filter(x => x.p.piso === n && existe.has(x.p.puesto) && !(x.r.presente && x.r.piso === n && x.r.puesto === x.p.puesto)).forEach(x => {
      if (x.r.presente) poner(x.p.puesto, x, 'otro-lugar', x.r.puesto ? `hoy en ${rotulo(x.r.piso, x.r.puesto)}` : `hoy en una sala o área común del piso ${x.r.piso}`);
      else poner(x.p.puesto, x, 'no-asiste', '');
    });
    const ocupantes = new Map();
    porPuesto.forEach((lista, puesto) => ocupantes.set(`${n}-${puesto}`, lista.map(({ x }) => ({ codigo: x.p.codigo, nombre: x.nombre }))));
    const estadoDe = p => {
      const lista = porPuesto.get(p.puesto) || [];
      if (!lista.length) return {};
      const texto = lista.map(({ x, tipo, info }) => `${x.nombre}, ${tipo === 'prevista' ? 'prevista hoy' : tipo === 'no-asiste' ? 'no asiste hoy' : 'hoy en otro lugar'}${info ? ' (' + info + ')' : ''}`).join('; ');
      const mas = lista.length > 1 ? ` +${lista.length - 1}` : '';
      const ini = nombreCorto({ nombre: lista[0].x.nombre });
      if (lista.some(e => e.tipo === 'prevista')) return { clase: 'prevista', etiqueta: `${ini}${mas} Prevista`, texto };
      const otro = lista.find(e => e.tipo === 'otro-lugar');
      if (otro) return { clase: 'otro-lugar', etiqueta: 'Hoy en ' + (otro.x.r.puesto ? rotulo(otro.x.r.piso, otro.x.r.puesto) : 'sala'), texto };
      return { clase: 'no-asiste', etiqueta: `${ini}${mas} No asiste`, texto };
    };
    // Presentes en este piso que no caen en ningún puesto del mapa (sala o área común, o un puesto que ya no existe).
    const sinPuesto = todas.filter(x => x.r.presente && x.r.piso === n && !colocadas.has(x.p.codigo)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const clavesDe = codigo => [...porPuesto.entries()].filter(([, l]) => l.some(e => e.x.p.codigo === codigo)).map(([puesto]) => `${n}-${puesto}`);
    return { ocupantes, estadoDe, sinPuesto, clavesDe };
  }

  const elegirPersona = (p, gente) => modal({
    titulo: `Puesto ${rotulo(p.piso, p.puesto)}: ¿de quién es la novedad?`,
    cuerpo: '<p class="sutil">Hay más de una persona en este puesto hoy.</p>',
    acciones: [{ texto: 'Cancelar', valor: null, clase: 'btn-fantasma' }, ...gente.map(g => ({ texto: g.nombre, valor: g.codigo, clase: 'btn-secundario' }))]
  });

  const pintarLista = () => {
    const todas = personasDelDia();
    const t = resumen(todas);
    vista.querySelector('#resumen').innerHTML = [
      insignia(`Previstas en la sede: ${t.previstas}`, 'verde'),
      insignia(`No asisten hoy: ${t.noAsisten}`, 'gris'),
      insignia(`En otro lugar: ${t.otroLugar}`, 'azul')
    ].join(' ');

    const q = normalizar(busqueda);
    const coincide = x => !q || normalizar(x.nombre).includes(q);
    const pisos = CONFIG.PISOS.filter(n => filtroPiso === 'todos' || n === filtroPiso);
    const encontrados = q ? todas.filter(coincide) : [];
    vista.querySelector('#buscar-conteo').textContent = !q ? '' : !encontrados.length ? 'Nadie coincide con la búsqueda.'
      : `${encontrados.length} coincidencia(s) resaltada(s) en el mapa: ${encontrados.slice(0, 5).map(x => x.nombre).join('; ')}${encontrados.length > 5 ? '…' : ''}`;
    const datosPisos = pisos.map(n => ({ n, ...datosDelPiso(n, todas) }));
    vista.querySelector('#pisos').innerHTML = datosPisos.map(d => {
      const delPiso = todas.filter(x => x.r.presente && x.r.piso === d.n);
      return `<section class="tarjeta">
        <div class="piso-cab"><h3>Piso ${d.n}</h3>${insignia(textoPrevistas(delPiso.length), delPiso.length ? 'verde' : 'gris')}</div>
        <div id="mapa-hoy-${d.n}"></div>
        ${d.sinPuesto.length ? `<div style="margin-top:.75rem"><h4>En sala, área común o sin puesto en el mapa</h4><div class="fila">${d.sinPuesto.map(x =>
          `<button class="btn btn-secundario btn-chico" data-sin-puesto="${esc(x.p.codigo)}" aria-label="${esc('Registrar una novedad de ' + x.nombre)}">${esc(x.nombre)}</button>`).join('')}</div></div>` : ''}
      </section>`;
    }).join('');
    datosPisos.forEach(d => {
      const mapa = mapaPiso({
        piso: d.n, puestos: sesion.base().puestos || [], referencias: sesion.base().referencias || [], ocupantes: d.ocupantes, modo: 'elegir',
        idBase: 'hoy-' + d.n, estadoDe: d.estadoDe, resaltar: new Set(encontrados.flatMap(x => d.clavesDe(x.p.codigo)))
      });
      const caja = vista.querySelector('#mapa-hoy-' + d.n);
      caja.innerHTML = mapa.html;
      // Tocar un puesto abre la ventana «Ausencia o cambio de lugar» de esa persona (si hay varias, primero se elige).
      mapa.enlazar(caja, { alElegir: async p => {
        const gente = d.ocupantes.get(`${p.piso}-${p.puesto}`) || [];
        if (!gente.length) return aviso(`El puesto ${rotulo(p.piso, p.puesto)} está libre: no hay a quién registrarle una novedad.`, 'info');
        const codigo = gente.length === 1 ? gente[0].codigo : await elegirPersona(p, gente);
        if (codigo) await guardarDesdeFormulario(personaDe(codigo), null);
      } });
    });
    vista.querySelectorAll('[data-sin-puesto]').forEach(b => b.addEventListener('click', () => guardarDesdeFormulario(personaDe(b.dataset.sinPuesto), null)));

    const ausentes = todas.filter(x => !x.r.presente && coincide(x)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    vista.querySelector('#ausentes').innerHTML = `
      <summary class="resumen-plegable">${icono('personas', 'ic-s')} No asisten hoy o fuera de agenda (${ausentes.length})</summary>
      ${ausentes.length ? `<div class="lista-dia">${ausentes.map(x => `
        <div class="fila-dia" data-codigo="${esc(x.p.codigo)}">
          <div class="puesto-num mono">P${x.p.piso}-${x.p.puesto}</div>
          <div class="fila-dia-txt"><strong>${esc(x.nombre)}</strong><span class="sutil">${esc(`puesto habitual P${x.p.piso}-${x.p.puesto}`)}</span></div>
          <div>${insigniaPresencia(x.r)}</div>
          <button class="btn btn-fantasma btn-chico" data-novedad title="Registrar una novedad">Novedad</button>
        </div>`).join('')}</div>` : '<p class="sutil">Nadie con este filtro.</p>'}`;

    const reg = novedades.vigentes().slice().sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
    vista.querySelector('#registradas').innerHTML = `
      <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-azul">${icono('reloj')}</div>
        <div><h3>Novedades registradas</h3><p class="sutil">Vigentes y futuras. Se borran solas cuando vencen.</p></div></div>
      ${reg.length ? `<div class="lista-dia">${reg.map(n => `
        <div class="fila-dia fila-novedad" data-id="${esc(n.id)}" data-codigo="${esc(n.codigo)}">
          <div class="fila-dia-txt" style="grid-column:1 / 3">
            <strong>${esc(sesion.nombreDe(n.codigo))}</strong>
            <span class="sutil">${esc(textoNovedad(n))} · ${esc(rangoLegible(n))}${n.registradoPor ? ' · registró ' + esc(sesion.nombreDe(n.registradoPor)) : ''}</span>
          </div>
          <button class="btn btn-fantasma btn-chico" data-editar>Editar</button>
          <button class="btn btn-fantasma btn-chico" data-quitar>Quitar</button>
        </div>`).join('')}</div>` : '<p class="sutil">No hay novedades registradas.</p>'}`;

    vista.querySelectorAll('[data-novedad]').forEach(b => b.addEventListener('click', async () => {
      const p = personaDe(b.closest('[data-codigo]').dataset.codigo);
      await guardarDesdeFormulario(p, null);
    }));
    vista.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', async () => {
      const fila = b.closest('[data-id]');
      const n = novedades.vigentes().find(x => x.id === fila.dataset.id);
      if (n) await guardarDesdeFormulario(personaDe(n.codigo), n);
    }));
    vista.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', async () => {
      const fila = b.closest('[data-id]');
      const nombre = sesion.nombreDe(fila.dataset.codigo);
      if (!await confirmar('Quitar novedad', `¿Quitar la novedad de ${esc(nombre)}?`, 'Quitar', true)) return;
      try { await novedades.quitar(fila.dataset.id); aviso('Novedad quitada.', 'info'); } catch (e) { aviso(e.message, 'error'); }
    }));
  };

  async function guardarDesdeFormulario(persona, existente) {
    const n = await formularioNovedad(persona, existente);
    if (!n) return;
    try {
      await novedades.guardar(n);
      aviso(`Novedad de ${sesion.nombreDe(persona.codigo)} guardada.`, 'exito');
    } catch (e) { aviso(e.message, 'error'); }
  }

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Hoy en la sede</h2><p class="sutil">${esc(fechaLegible(fechaBogota()))}</p></div>
      <div class="fila no-imprimir">
        <button class="btn btn-secundario btn-chico" id="actualizar">${icono('recargar', 'ic-s')}Actualizar</button>
        <button class="btn btn-primario btn-chico" id="censo">${icono('imprimir', 'ic-s')}Censo del día</button>
      </div>
    </div>
    <div class="fila" id="resumen" style="margin-bottom:1rem"></div>
    <div class="fila" style="margin-bottom:1rem">
      <input id="buscar" type="search" aria-label="Buscar por nombre" placeholder="Buscar por nombre…" style="flex:1;min-width:12rem" autocomplete="off" aria-describedby="buscar-conteo">
    </div>
    <p class="ayuda" id="buscar-conteo" role="status" aria-live="polite" style="margin:-.5rem 0 1rem"></p>
    <p class="ayuda no-imprimir">Toque un puesto del mapa para registrar la ausencia o el cambio de lugar de esa persona.</p>
    <div class="fila" id="filtro" style="margin-bottom:1rem">
      <button class="pestana activa" data-p="todos">Todos</button>
      ${CONFIG.PISOS.map(n => `<button class="pestana" data-p="${n}">Piso ${n}</button>`).join('')}
    </div>
    <div id="pisos" class="pila"></div>
    <details id="ausentes" class="tarjeta" style="margin-top:1rem"></details>
    <section id="registradas" class="tarjeta" style="margin-top:1rem"></section>`;

  vista.querySelector('#buscar').addEventListener('input', e => { busqueda = e.target.value; pintarLista(); });
  vista.querySelectorAll('#filtro button').forEach(b => b.addEventListener('click', () => {
    vista.querySelectorAll('#filtro button').forEach(x => x.classList.toggle('activa', x === b));
    filtroPiso = b.dataset.p === 'todos' ? 'todos' : Number(b.dataset.p);
    pintarLista();
  }));
  vista.querySelector('#actualizar').addEventListener('click', async () => {
    aviso(await novedades.actualizar() ? 'Listado actualizado.' : 'Sin conexión: se muestra la última información guardada.', 'info');
  });
  vista.querySelector('#censo').addEventListener('click', () => imprimirCenso());

  // Se vuelve a pintar al cambiar las novedades, salvo que alguien esté escribiendo en la búsqueda.
  const alCambiar = () => {
    if (!location.hash.startsWith('#/hoy')) return;
    if (document.activeElement && document.activeElement.id === 'buscar') return;
    pintarLista();
  };
  addEventListener('novedades-cambio', alCambiar);
  // Refresco automático cada 60 s, solo mientras esta vista está abierta.
  const reloj = setInterval(() => { if (location.hash.startsWith('#/hoy')) novedades.actualizar(); }, 60000);
  vista.addEventListener('vista-salida', () => { removeEventListener('novedades-cambio', alCambiar); clearInterval(reloj); }, { once: true });
  pintarLista();
  novedades.actualizar();
}

// Censo del día: lista de quienes están previstos en la sede, por piso, con una casilla para
// pasar lista en el punto de encuentro. No lleva horas de llegada ni de salida.
export function imprimirCenso() {
  const todas = personasDelDia();
  const t = resumen(todas);
  const filas = lista => lista.sort(porPuesto).map(x => `
    <tr><td class="mono">${x.r.puesto || '—'}</td><td>${esc(x.nombre)}</td>
    <td>${x.r.otroLugar ? 'En otro lugar' : 'Prevista'}</td><td class="casilla-papel">☐</td></tr>`).join('');
  const html = `
    <div id="censo-impreso">
      <h1>${esc(CONFIG.APP_NOMBRE)}: censo del día</h1>
      <p>${esc(fechaLegible(fechaBogota()))} · Despacho 3, sede Calle 96</p>
      <p><strong>Previstas en la sede: ${t.previstas}</strong> · En otro lugar: ${t.otroLugar} · No asisten hoy: ${t.noAsisten}</p>
      ${CONFIG.PISOS.map(n => {
        const delPiso = todas.filter(x => x.r.presente && x.r.piso === n);
        return `<h2>Piso ${n}: ${textoPrevistas(delPiso.length)}</h2>
          <table><thead><tr><th>Puesto</th><th>Nombre</th><th>Situación</th><th>Llegó al punto</th></tr></thead>
          <tbody>${filas(delPiso) || '<tr><td colspan="4">Nadie previsto en este piso.</td></tr>'}</tbody></table>`;
      }).join('')}
      <p class="aviso-datos">Documento con datos personales, solo para la atención de emergencias (Ley 1581 de 2012). Destrúyalo o bórrelo al final del día.</p>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.body.classList.add('censo-activo');
  const limpiar = () => { document.getElementById('censo-impreso')?.remove(); document.body.classList.remove('censo-activo'); };
  addEventListener('afterprint', limpiar, { once: true });
  setTimeout(() => print(), 50);
}
