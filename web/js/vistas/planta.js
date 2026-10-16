import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import { esc, insignia, icono, barraBusqueda, enlazarBusqueda, coincide } from '../ui.js';

export function vistaPlanta(vista) {
  const base = sesion.base();
  const yo = sesion.perfil();
  if (!base) { vista.innerHTML = '<div class="nota nota-adv">Sin datos. Conéctese una vez para descargar la planta física.</div>'; return; }

  const activas = base.personas.filter(p => p.estado === 'activo');
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
    vista.querySelector('#pisos').innerHTML = pisos.map(n => {
      const puestos = base.puestos.filter(x => x.piso === n).sort((a, b) => a.puesto - b.puesto);
      const brigadistas = activas.filter(p => p.roles.includes('brigadista') && p.pisoBrigada === n);
      const personasDelPiso = activas.filter(p => p.piso === n).length;
      const vacantes = puestos.filter(x => x.estado === 'vacante').length;
      return `<section class="tarjeta">
        <div class="piso-cab">
          <h3>Piso ${n}</h3>
          <div class="fila">${insignia(`${personasDelPiso} personas`, 'gris')} ${insignia(`${vacantes} vacantes`, 'gris')}</div>
        </div>
        <p class="sutil" style="margin-bottom:.75rem">${icono('escudo', 'ic-s')} Brigadistas: ${brigadistas.length
          ? brigadistas.map(b => `${esc(sesion.nombreDe(b.codigo))}${sesion.celularDe(b.codigo) ? ` · <a href="tel:${esc(sesion.celularDe(b.codigo).replace(/\s/g, ''))}">${esc(sesion.celularDe(b.codigo))}</a>` : ''}`).join('; ')
          : 'sin asignar'}</p>
        <div class="puestos">${puestos.map(x => {
          // Un puesto compartido tiene dos o más personas: se muestran todas.
          const gente = activas.filter(a => a.piso === n && a.puesto === x.puesto);
          if (!gente.length) return `<div class="puesto vacante"><div class="num">P${n}-${x.puesto}</div>Vacante</div>`;
          const resaltado = texto && gente.some(p => encontradas.includes(p));
          return `<div class="puesto ${gente.some(p => p.codigo === yo.codigo) ? 'mio' : ''} ${resaltado ? 'resaltado' : ''}">
            <div class="num">P${n}-${x.puesto}${gente.length > 1 ? ' · compartido' : ''}</div>${gente.map(p => `<div>${esc(sesion.nombreDe(p.codigo))}</div>
            ${p.roles.includes('brigadista') ? '<div>' + insignia('Brigadista', 'rojo') + '</div>' : ''}`).join('')}</div>`;
        }).join('') || '<p class="sutil">Sin puestos cargados.</p>'}</div>
      </section>`;
    }).join('');
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
