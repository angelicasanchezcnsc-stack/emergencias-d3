import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import { esc, insignia, icono } from '../ui.js';

export function vistaPlanta(vista) {
  const base = sesion.base();
  const yo = sesion.perfil();
  if (!base) { vista.innerHTML = '<div class="nota nota-adv">Sin datos. Conéctese una vez para descargar la planta física.</div>'; return; }

  const activas = base.personas.filter(p => p.estado === 'activo');
  const pintar = filtro => {
    const pisos = CONFIG.PISOS.filter(n => filtro === 'todos' || n === filtro);
    vista.querySelector('#pisos').innerHTML = pisos.map(n => {
      const puestos = base.puestos.filter(x => x.piso === n).sort((a, b) => a.puesto - b.puesto);
      const brigadistas = activas.filter(p => p.roles.includes('brigadista') && p.pisoBrigada === n);
      const ocupados = puestos.filter(x => x.estado === 'ocupado').length;
      return `<section class="tarjeta">
        <div class="piso-cab">
          <h3>Piso ${n}</h3>
          <div class="fila">${insignia(`${ocupados} personas`, 'gris')} ${insignia(`${puestos.length - ocupados} vacantes`, 'gris')}</div>
        </div>
        <p class="sutil" style="margin-bottom:.75rem">${icono('escudo', 'ic-s')} Brigadistas: ${brigadistas.length
          ? brigadistas.map(b => `${esc(sesion.nombreDe(b.codigo))}${sesion.celularDe(b.codigo) ? ` · <a href="tel:${esc(sesion.celularDe(b.codigo).replace(/\s/g, ''))}">${esc(sesion.celularDe(b.codigo))}</a>` : ''}`).join(' — ')
          : 'sin asignar'}</p>
        <div class="puestos">${puestos.map(x => {
          const p = activas.find(a => a.piso === n && a.puesto === x.puesto);
          if (!p) return `<div class="puesto vacante"><div class="num">P${n}-${x.puesto}</div>Vacante</div>`;
          return `<div class="puesto ${p.codigo === yo.codigo ? 'mio' : ''}">
            <div class="num">P${n}-${x.puesto}</div>${esc(sesion.nombreDe(p.codigo))}
            ${p.roles.includes('brigadista') ? '<div>' + insignia('Brigadista', 'rojo') + '</div>' : ''}</div>`;
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
    <div id="pisos" class="pila"></div>`;
  vista.querySelectorAll('#filtro button').forEach(b => b.addEventListener('click', () => {
    vista.querySelectorAll('#filtro button').forEach(x => x.classList.toggle('activa', x === b));
    pintar(b.dataset.p === 'todos' ? 'todos' : Number(b.dataset.p));
  }));
  pintar('todos');
}
