import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import { esc, insignia, icono, barraBusqueda, enlazarBusqueda, coincide } from '../ui.js';
import { mapaPiso, nombreCorto } from '../mapa-piso.js';

export function vistaPlanta(vista) {
  const base = sesion.base();
  const yo = sesion.perfil();
  if (!base) { vista.innerHTML = '<div class="nota nota-adv">Sin datos. Conéctese una vez para descargar la planta física.</div>'; return; }

  const activas = base.personas.filter(p => p.estado === 'activo');
  // Quién ocupa cada puesto (puede haber más de una persona si el puesto se comparte).
  const ocupantes = new Map();
  activas.forEach(p => {
    const k = `${p.piso}-${p.puesto}`;
    if (!ocupantes.has(k)) ocupantes.set(k, []);
    ocupantes.get(k).push({ codigo: p.codigo, nombre: sesion.nombreDe(p.codigo), brigadista: p.roles.includes('brigadista') });
  });
  // El puesto propio se marca «Actual»; el de un brigadista lleva «Brig.» junto al nombre.
  const estadoDe = (p, gente) => {
    if (gente.some(g => g.codigo === yo.codigo)) return { clase: 'actual', texto: `su puesto, ${gente.map(g => g.nombre).join(' y ')}` };
    if (gente.some(g => g.brigadista)) {
      return {
        clase: gente.length > 1 ? 'compartido' : 'ocupado', etiqueta: `${nombreCorto(gente[0])}${gente.length > 1 ? ` +${gente.length - 1}` : ''} Brig.`,
        texto: `${gente.length > 1 ? 'compartido por' : 'ocupado por'} ${gente.map(g => g.nombre).join(' y ')}, brigadista`
      };
    }
    return {};
  };
  const textoPersona = p => [sesion.nombreDe(p.codigo), p.codigo, `P${p.piso}-${p.puesto}`, `piso ${p.piso} puesto ${p.puesto}`].join(' ');
  let filtroPiso = 'todos', texto = '', busqueda = null;
  // Con una búsqueda, los puestos de quienes coinciden se resaltan y solo se muestran los pisos donde hay alguno.
  const pintar = () => {
    const encontradas = texto ? activas.filter(p => coincide(textoPersona(p), texto)) : [];
    const pisos = CONFIG.PISOS.filter(n => (filtroPiso === 'todos' || n === filtroPiso) && (!texto || encontradas.some(p => p.piso === n)));
    if (busqueda) {
      busqueda.conteo(!texto ? '' : !encontradas.length ? 'Nadie coincide con la búsqueda.'
        : `${encontradas.length} coincidencia(s): ${encontradas.slice(0, 5).map(p => `${sesion.nombreDe(p.codigo)} (P${p.piso}-${p.puesto})`).join('; ')}${encontradas.length > 5 ? '…' : ''}`);
    }
    // Cada piso se dibuja con el mapa esquemático (o su lista equivalente). Con una búsqueda se resaltan los puestos.
    const secciones = pisos.map(n => {
      const puestos = base.puestos.filter(x => x.piso === n);
      const brigadistas = activas.filter(p => p.roles.includes('brigadista') && p.pisoBrigada === n);
      const personasDelPiso = activas.filter(p => p.piso === n).length;
      const vacantes = puestos.filter(x => x.estado === 'vacante').length;
      return { n, brigadistas, html: `<section class="tarjeta">
        <div class="piso-cab">
          <h3>Piso ${n}</h3>
          <div class="fila">${insignia(`${personasDelPiso} personas`, 'gris')} ${insignia(`${vacantes} vacantes`, 'gris')}</div>
        </div>
        <p class="sutil" style="margin-bottom:.75rem">${icono('escudo', 'ic-s')} Brigadistas: ${brigadistas.length
          ? brigadistas.map(b => `${esc(sesion.nombreDe(b.codigo))}${sesion.celularDe(b.codigo) ? ` · <a href="tel:${esc(sesion.celularDe(b.codigo).replace(/\s/g, ''))}">${esc(sesion.celularDe(b.codigo))}</a>` : ''}`).join('; ')
          : 'sin asignar'}</p>
        <div id="mapa-planta-${n}"></div>
      </section>` };
    });
    vista.querySelector('#pisos').innerHTML = secciones.map(x => x.html).join('');
    secciones.forEach(({ n }) => {
      const mapa = mapaPiso({
        piso: n, puestos: base.puestos, referencias: base.referencias || [], ocupantes, modo: 'ver', idBase: 'planta-' + n,
        resaltar: new Set(texto ? encontradas.map(p => `${p.piso}-${p.puesto}`) : []), estadoDe,
        leyendaExtra: [{ simbolo: '', nombre: 'Brigadista del piso', senal: '«Brig.» junto al nombre' }]
      });
      const caja = vista.querySelector('#mapa-planta-' + n);
      caja.innerHTML = mapa.html;
      mapa.enlazar(caja, {});
    });
  };

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Planta física</h2><p class="sutil">Puestos fijos del Despacho 3 por piso</p></div>
      <div class="fila" id="filtro">
        <button class="pestana activa" data-p="todos">Todos</button>
        ${CONFIG.PISOS.map(n => `<button class="pestana" data-p="${n}">Piso ${n}</button>`).join('')}
      </div>
    </div>
    ${barraBusqueda({ id: 'buscar-planta', ejemplo: 'Nombre, código o puesto (P2-14)' })}
    <div id="pisos" class="pila"></div>`;
  vista.querySelectorAll('#filtro button').forEach(b => b.addEventListener('click', () => {
    vista.querySelectorAll('#filtro button').forEach(x => x.classList.toggle('activa', x === b));
    filtroPiso = b.dataset.p === 'todos' ? 'todos' : Number(b.dataset.p);
    pintar();
  }));
  busqueda = enlazarBusqueda(vista, 'buscar-planta', v => { texto = v; pintar(); });
  pintar();
}
