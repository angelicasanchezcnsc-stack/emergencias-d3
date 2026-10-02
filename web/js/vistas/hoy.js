// Hoy en la sede: listado por piso con ingresos y salidas, reporte de
// compañeros y censo del día para imprimir o guardar en PDF.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as registro from '../registro.js';
import { esc, icono, insignia, aviso } from '../ui.js';
import { fechaLegible, horaBogota, horaLegible } from '../tiempo.js';
import { SITUACION, insigniaSituacion, horario, reportarPersona } from './comun.js';

const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function personasDelDia() {
  return (sesion.base().personas || []).filter(p => p.estado === 'activo').map(p => {
    const r = registro.registroDe(p.codigo);
    const u = registro.ubicacionHoy(p);
    return { p, r, u, sit: registro.situacion(r), nombre: sesion.nombreDe(p.codigo) };
  });
}

export function resumen(lista) {
  const cuenta = s => lista.filter(x => x.sit === s).length;
  return {
    enSede: cuenta('en-sede'), salieron: cuenta('salio'), sinReporte: cuenta('sin-reporte'),
    fuera: lista.filter(x => !['en-sede', 'salio', 'sin-reporte'].includes(x.sit)).length
  };
}

export function vistaHoy(vista) {
  let filtroPiso = 'todos';
  let busqueda = '';
  let soloSede = false;

  const pintarLista = () => {
    const todas = personasDelDia();
    const t = resumen(todas);
    vista.querySelector('#resumen').innerHTML = [
      insignia(`En la sede: ${t.enSede}`, 'verde'), insignia(`Salieron: ${t.salieron}`, 'gris'),
      insignia(`Fuera de la sede: ${t.fuera}`, 'azul'), insignia(`Sin reporte: ${t.sinReporte}`, 'ambar')
    ].join(' ');
    const pendientes = registro.pendientes();
    vista.querySelector('#pendientes').innerHTML = pendientes
      ? `<div class="nota nota-adv">${icono('sinWifi')}<span>${pendientes} reporte(s) por enviar desde este celular.</span></div>` : '';

    const q = normalizar(busqueda);
    const visibles = todas.filter(x => (!q || normalizar(x.nombre).includes(q)) && (!soloSede || x.sit === 'en-sede'));
    const pisos = CONFIG.PISOS.filter(n => filtroPiso === 'todos' || n === filtroPiso);
    vista.querySelector('#pisos').innerHTML = pisos.map(n => {
      const delPiso = visibles.filter(x => x.u.piso === n).sort((a, b) => (a.u.puesto || 999) - (b.u.puesto || 999));
      const enSede = todas.filter(x => x.u.piso === n && x.sit === 'en-sede').length;
      return `<section class="tarjeta">
        <div class="piso-cab"><h3>Piso ${n}</h3>${insignia(`${enSede} en la sede`, enSede ? 'verde' : 'gris')}</div>
        ${delPiso.length ? `<div class="lista-dia">${delPiso.map(x => `
          <div class="fila-dia" data-codigo="${esc(x.p.codigo)}">
            <div class="puesto-num mono">${x.u.puesto ? 'P' + n + '-' + x.u.puesto : 'P' + n}</div>
            <div class="fila-dia-txt">
              <strong>${esc(x.nombre)}</strong>
              <span class="sutil">${esc([
                horario(x.r),
                x.u.excepcion && `hoy fuera de su puesto habitual (P${x.p.piso}-${x.p.puesto})`,
                x.r && x.r.reportadoPor && x.r.reportadoPor !== x.p.codigo && 'reportó ' + sesion.nombreDe(x.r.reportadoPor)
              ].filter(Boolean).join(' · '))}</span>
            </div>
            <div>${insigniaSituacion(x.r)}</div>
            <button class="btn btn-fantasma btn-chico" data-reportar title="Reportar estado">Reportar</button>
          </div>`).join('')}</div>` : `<p class="sutil">${q || soloSede ? 'Nadie con este filtro.' : 'Nadie ubicado hoy en este piso.'}</p>`}
      </section>`;
    }).join('');
    vista.querySelectorAll('[data-reportar]').forEach(b => b.addEventListener('click', async () => {
      const codigo = b.closest('[data-codigo]').dataset.codigo;
      const p = sesion.base().personas.find(x => x.codigo === codigo);
      if (await reportarPersona(p)) pintarLista();
    }));
  };

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Hoy en la sede</h2><p class="sutil">${esc(fechaLegible(registro.hoy().fecha))} · actualizado <span id="hora-act">${esc(horaLegible(horaBogota()))}</span></p></div>
      <div class="fila no-imprimir">
        <button class="btn btn-secundario btn-chico" id="actualizar">${icono('recargar', 'ic-s')}Actualizar</button>
        <button class="btn btn-primario btn-chico" id="censo">${icono('imprimir', 'ic-s')}Censo del día</button>
      </div>
    </div>
    <div id="pendientes"></div>
    <div class="fila" id="resumen" style="margin-bottom:1rem"></div>
    <div class="fila" style="margin-bottom:1rem">
      <input id="buscar" type="text" placeholder="Buscar por nombre…" style="flex:1;min-width:12rem" autocomplete="off">
      <label class="casilla"><input type="checkbox" id="solo-sede">Solo quienes están en la sede</label>
    </div>
    <div class="fila" id="filtro" style="margin-bottom:1rem">
      <button class="pestana activa" data-p="todos">Todos</button>
      ${CONFIG.PISOS.map(n => `<button class="pestana" data-p="${n}">Piso ${n}</button>`).join('')}
    </div>
    <div id="pisos" class="pila"></div>`;

  vista.querySelector('#buscar').addEventListener('input', e => { busqueda = e.target.value; pintarLista(); });
  vista.querySelector('#solo-sede').addEventListener('change', e => { soloSede = e.target.checked; pintarLista(); });
  vista.querySelectorAll('#filtro button').forEach(b => b.addEventListener('click', () => {
    vista.querySelectorAll('#filtro button').forEach(x => x.classList.toggle('activa', x === b));
    filtroPiso = b.dataset.p === 'todos' ? 'todos' : Number(b.dataset.p);
    pintarLista();
  }));
  const actualizar = async () => {
    const ok = await registro.actualizar();
    vista.querySelector('#hora-act').textContent = horaLegible(horaBogota());
    return ok;
  };
  vista.querySelector('#actualizar').addEventListener('click', async () => {
    aviso(await actualizar() ? 'Listado actualizado.' : 'Sin conexión: se muestra la última información guardada.', 'info');
  });
  vista.querySelector('#censo').addEventListener('click', () => imprimirCenso());

  const alCambiar = () => { if (location.hash.startsWith('#/hoy')) pintarLista(); };
  addEventListener('registro-cambio', alCambiar);
  const reloj = setInterval(() => { if (location.hash.startsWith('#/hoy')) actualizar(); }, 60000);
  vista.addEventListener('vista-salida', () => { removeEventListener('registro-cambio', alCambiar); clearInterval(reloj); }, { once: true });
  pintarLista();
  actualizar();
}

// Censo del día: lista de quienes están (o podrían estar) en la sede, por piso,
// con una casilla para pasar lista en el punto de encuentro.
export function imprimirCenso() {
  const todas = personasDelDia();
  const t = resumen(todas);
  const fecha = registro.hoy().fecha;
  const filas = lista => lista.sort((a, b) => (a.u.puesto || 999) - (b.u.puesto || 999)).map(x => `
    <tr><td class="mono">${x.u.puesto || '—'}</td><td>${esc(x.nombre)}</td><td>${esc(SITUACION[x.sit][0])}</td>
    <td>${esc(horaLegible(x.r && x.r.ingreso))}</td><td>${esc(horaLegible(x.r && x.r.salida))}</td><td class="casilla-papel">☐</td></tr>`).join('');
  const html = `
    <div id="censo-impreso">
      <h1>${esc(CONFIG.APP_NOMBRE)} — Censo del día</h1>
      <p>${esc(fechaLegible(fecha))} · generado a las ${esc(horaLegible(horaBogota()))} · Despacho 3, sede Calle 96</p>
      <p><strong>En la sede: ${t.enSede}</strong> · Salieron: ${t.salieron} · Fuera de la sede: ${t.fuera} · Sin reporte (verificar): ${t.sinReporte}</p>
      ${CONFIG.PISOS.map(n => {
        const enSede = todas.filter(x => x.u.piso === n && x.sit === 'en-sede');
        const sinRep = todas.filter(x => x.u.piso === n && x.sit === 'sin-reporte');
        return `<h2>Piso ${n} — ${enSede.length} en la sede</h2>
          <table><thead><tr><th>Puesto</th><th>Nombre</th><th>Estado</th><th>Ingreso</th><th>Salida</th><th>Llegó al punto</th></tr></thead>
          <tbody>${filas(enSede) || '<tr><td colspan="6">Nadie en la sede según los reportes.</td></tr>'}
          ${sinRep.length ? `<tr><td colspan="6"><em>Sin reporte (verificar si están en la sede):</em></td></tr>${filas(sinRep)}` : ''}</tbody></table>`;
      }).join('')}
      <p class="aviso-datos">Documento con datos personales, solo para la atención de emergencias (Ley 1581 de 2012). Destrúyalo o bórrelo al final del día.</p>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.body.classList.add('censo-activo');
  const limpiar = () => { document.getElementById('censo-impreso')?.remove(); document.body.classList.remove('censo-activo'); };
  addEventListener('afterprint', limpiar, { once: true });
  setTimeout(() => print(), 50);
}
