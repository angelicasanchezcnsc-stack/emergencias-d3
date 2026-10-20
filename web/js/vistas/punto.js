// Punto de encuentro: registro de llegadas (funciona sin conexión), conciliación
// con el reporte de cada piso y lista de ausentes para la brigada o los bomberos.
import * as sesion from '../sesion.js';
import * as emergencia from '../emergencia.js';
import * as carac from '../caracterizacion.js';
import { esc, icono, aviso, insignia, modal, confirmar } from '../ui.js';
import { horaLegible, horaBogota } from '../tiempo.js';
import { enSedeDe } from '../presencia.js';
import { armarActa, imprimirActa, textoActa } from './acta.js';

const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ESTADO_PISO = { evacuado: 'Evacuado según su piso', no_ubicado: 'NO UBICADO en el piso', apoyo: 'REQUIERE APOYO', no_estaba: 'No estaba hoy en la sede' };

function leerSol() { try { return localStorage.getItem('d3e-modo-sol') === '1'; } catch { return false; } }
function guardarSol(v) { try { localStorage.setItem('d3e-modo-sol', v ? '1' : '0'); } catch { /* sin almacenamiento */ } }

const ubicacionTexto = x => `Piso ${x.piso}${x.puesto ? ', puesto ' + x.puesto : ''}`;
function estadoUltimo(x) {
  const m = x.marca;
  if (x.grupo === 'sin' && !(m && m.estado)) return 'Prevista hoy en la sede: verificar';
  if (!m || !m.estado) return 'Sin reporte del brigadista';
  const quien = m.reportadoPor && m.reportadoPor !== x.codigo ? ' (reportó ' + sesion.nombreDe(m.reportadoPor) + ')' : '';
  const cuando = m.actualizado ? ' a las ' + horaLegible(horaBogota(new Date(m.actualizado))) : '';
  return (ESTADO_PISO[m.estado] || m.estado) + cuando + quien;
}

// Última ubicación reportada y, si la persona registró que necesita apoyo, qué apoyo (para
// que los bomberos y la brigada sepan que puede seguir dentro del edificio).
function ultimaUbicacion(x) {
  const ap = carac.apoyoDe(x.codigo);
  const apoyo = ap && ap.apoyo !== 'ninguno'
    ? ` · NECESITA APOYO: ${carac.etiqueta(carac.APOYOS, ap.apoyo)}${ap.detalle ? ' (' + ap.detalle + ')' : ''}` : '';
  return estadoUltimo(x) + apoyo;
}

export function vistaPunto(vista) {
  let pisoSel = 'todos';
  let busqueda = '';
  let sol = leerSol();

  const pintar = () => {
    const a = emergencia.actual();
    vista.classList.toggle('modo-sol', sol);
    if (!a) {
      vista.innerHTML = `
        <div class="titulo-vista"><h2>Punto de encuentro</h2></div>
        <div class="nota nota-info">${icono('info')}<span>No hay ninguna emergencia ni simulacro en curso. Si el internet del edificio falla, puede activarla sin conexión desde la pestaña Emergencia.</span></div>
        <a class="btn btn-peligro" href="#/emergencia">${icono('alerta', 'ic-s')}Ir a Emergencia</a>`;
      return;
    }
    const e = a.emergencia;
    const r = emergencia.resumen(a);
    const faltan = emergencia.ausentes(a);
    // Quien fue marcado «No estaba hoy» no se espera en el punto de encuentro.
    const esperadosTotal = enSedeDe(r.total);
    const q = normalizar(busqueda);
    const filtro = x => (pisoSel === 'todos' || x.piso === pisoSel) && (!q || normalizar(sesion.nombreDe(x.codigo)).includes(q));
    const porLlegar = faltan.filter(filtro);
    const llegaron = r.filas.flatMap(f => f.miembros.filter(x => x.marca && x.marca.llegada).map(x => ({ ...x, piso: f.piso, puesto: emergencia.puestoDe(x.codigo).puesto })))
      .filter(filtro).sort((x, y) => (y.marca.llegada > x.marca.llegada ? 1 : -1));
    // Quien no está en la lista del día también puede registrarse (buscándolo por nombre).
    // Quien fue marcado «no estaba hoy» no figura en «Por llegar», pero se puede buscar por si sí llegó.
    const listados = new Set(r.filas.flatMap(f => f.miembros.filter(x => !(x.marca && x.marca.estado === 'no_estaba')).map(x => x.codigo)));
    const otros = q ? (sesion.base().personas || []).filter(p => p.estado === 'activo' && !listados.has(p.codigo) && normalizar(sesion.nombreDe(p.codigo)).includes(q)) : [];

    vista.innerHTML = `
      <div class="titulo-vista fila entre">
        <div><h2>Punto de encuentro</h2><p class="sutil">${e.simulacro ? 'Simulacro' : 'Emergencia'}: ${esc(emergencia.TIPOS[e.tipo])} · <span data-transcurrido class="mono">${emergencia.transcurrido(e.inicio)}</span></p></div>
        <label class="casilla no-imprimir"><input type="checkbox" id="sol" ${sol ? 'checked' : ''}>Pantalla para pleno sol</label>
      </div>
      ${emergencia.esLocal() ? `<div class="nota nota-adv">${icono('sinWifi')}<span>Modo sin conexión: esta emergencia se activó en este celular. Los registros quedan guardados aquí y se unirán solos a la del servidor cuando vuelva la señal.</span></div>` : ''}
      ${emergencia.pendientes() ? `<div class="nota nota-adv">${icono('sinWifi')}<span>${emergencia.pendientes()} registro(s) guardado(s) en este celular, por enviar.</span></div>` : ''}

      <div class="resumen-grande punto-resumen">
        <div class="t-verde"><strong>${r.total.llegaron}</strong><span>llegaron de ${esperadosTotal} en la sede</span></div>
        <div class="${faltan.length ? 't-rojo' : ''}"><strong>${faltan.length}</strong><span>faltan por llegar</span></div>
        <div class="${r.total.sinLlegar ? 't-ambar' : ''}"><strong>${r.total.sinLlegar}</strong><span>evacuados que no han llegado</span></div>
        <div class="${r.total.noUbicados ? 't-rojo' : ''}"><strong>${r.total.noUbicados}</strong><span>no ubicados</span></div>
      </div>

      <div class="fila no-imprimir" style="margin-bottom:1rem">
        <button class="btn btn-peligro" id="ver-ausentes">${icono('alerta', 'ic-s')}Acta del punto de encuentro (faltan ${faltan.length})</button>
      </div>

      <input id="buscar" class="buscar-grande" type="search" aria-label="Buscar por nombre" placeholder="Buscar por nombre…" value="${esc(busqueda)}" autocomplete="off">
      <div class="fila" id="filtro" style="margin:.75rem 0">
        <button class="pestana ${pisoSel === 'todos' ? 'activa' : ''}" data-p="todos">Todos</button>
        ${r.filas.map(f => `<button class="pestana ${pisoSel === f.piso ? 'activa' : ''}" data-p="${f.piso}">Piso ${f.piso} (${f.llegaron}/${enSedeDe(f)})</button>`).join('')}
      </div>

      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('personas')}</div><div><h3>Por llegar (${porLlegar.length})</h3><p class="sutil">Toque «Llegó» cuando vea a la persona</p></div></div>
        ${porLlegar.length ? porLlegar.map(x => `
          <div class="fila-llegada ${x.marca && x.marca.estado === 'no_ubicado' ? 'urgente' : ''}" data-codigo="${esc(x.codigo)}">
            <div class="fila-dia-txt"><strong>${esc(sesion.nombreDe(x.codigo))}</strong>
              <span class="sutil">${esc(ubicacionTexto(x))} · ${esc(ultimaUbicacion(x))}</span></div>
            <button class="btn btn-primario btn-llego" data-llego>${icono('ok')}Llegó</button>
          </div>`).join('') : `<p class="sutil">${q || pisoSel !== 'todos' ? 'Nadie pendiente con este filtro.' : 'Todas las personas de la lista ya llegaron.'}</p>`}
        ${otros.length ? `<h4>No estaban en la lista del día</h4>${otros.map(p => `
          <div class="fila-llegada" data-codigo="${esc(p.codigo)}">
            <div class="fila-dia-txt"><strong>${esc(sesion.nombreDe(p.codigo))}</strong><span class="sutil">Puesto habitual: piso ${p.piso}, puesto ${p.puesto}</span></div>
            <button class="btn btn-primario btn-llego" data-llego>${icono('ok')}Llegó</button>
          </div>`).join('')}` : ''}
      </section>

      <details class="tarjeta" ${llegaron.length && !porLlegar.length ? 'open' : ''}>
        <summary class="resumen-plegable">${icono('ok', 'ic-s')} Ya llegaron (${llegaron.length})</summary>
        ${llegaron.map(x => `
          <div class="fila-llegada" data-codigo="${esc(x.codigo)}">
            <div class="fila-dia-txt"><strong>${esc(sesion.nombreDe(x.codigo))}</strong>
              <span class="sutil">${esc(ubicacionTexto(x))} · llegó a las ${esc(horaLegible(x.marca.llegada))}${x.marca.reportadoPor && x.marca.reportadoPor !== x.codigo ? ' · registró ' + esc(sesion.nombreDe(x.marca.reportadoPor)) : ''}</span></div>
            <button class="btn btn-fantasma btn-chico" data-deshacer>Deshacer</button>
          </div>`).join('') || '<p class="sutil">Aún no llega nadie.</p>'}
      </details>

      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-azul">${icono('edificio')}</div>
          <div><h3>Conciliación por piso</h3><p class="sutil">Lo que reportó cada piso frente a lo que se ve en el punto de encuentro</p></div></div>
        <div class="tabla-caja"><table class="tablero">
          <thead><tr><th>Piso</th><th>En la sede</th><th>Evacuados (piso)</th><th>Llegaron (punto)</th><th>Evacuados sin llegar</th><th>No ubicados</th><th>Faltan</th></tr></thead>
          <tbody>${r.filas.map(f => {
            const falta = faltan.filter(x => x.piso === f.piso).length;
            return `<tr class="${f.sinLlegar || f.noUbicados ? 'fila-alerta' : ''}"><td><strong>Piso ${f.piso}</strong></td><td>${enSedeDe(f)}</td><td>${f.evacuados}${f.conteo ? ' <span class="sutil">(conteo)</span>' : ''}</td><td>${f.llegaron}</td><td>${f.sinLlegar}</td><td>${f.noUbicados}</td><td>${falta}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>`;

    vista.querySelector('#sol').addEventListener('change', ev => { sol = ev.target.checked; guardarSol(sol); pintar(); });
    vista.querySelectorAll('#filtro button').forEach(b => b.addEventListener('click', () => { pisoSel = b.dataset.p === 'todos' ? 'todos' : Number(b.dataset.p); pintar(); }));
    const buscar = vista.querySelector('#buscar');
    buscar.addEventListener('input', () => {
      busqueda = buscar.value;
      clearTimeout(buscar._t);
      buscar._t = setTimeout(() => { pintar(); const n = vista.querySelector('#buscar'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
    });
    vista.querySelectorAll('[data-llego]').forEach(b => b.addEventListener('click', async () => {
      const codigo = b.closest('[data-codigo]').dataset.codigo;
      b.disabled = true;
      await emergencia.marcarLlegada(codigo);
      aviso(`Llegó: ${sesion.nombreDe(codigo)}.`, 'exito');
      if (busqueda) { busqueda = ''; pintar(); }
    }));
    vista.querySelectorAll('[data-deshacer]').forEach(b => b.addEventListener('click', async () => {
      const codigo = b.closest('[data-codigo]').dataset.codigo;
      if (!await confirmar('Deshacer llegada', `¿Quitar la llegada de ${esc(sesion.nombreDe(codigo))}?`, 'Quitar')) return;
      await emergencia.marcarPersona(codigo, { llegada: '' });
    }));
    // Acta del punto de encuentro (v0.13): primero quienes no han llegado (en orden de prioridad) y, plegados,
    // quienes ya llegaron. Copiar e imprimir llevan el acta nominal completa, por piso.
    vista.querySelector('#ver-ausentes').addEventListener('click', async () => {
      const lista = emergencia.ausentes(a);
      const ya = r.filas.flatMap(f => f.miembros.filter(x => x.marca && x.marca.llegada).map(x => ({ ...x, piso: f.piso, puesto: emergencia.puestoDe(x.codigo).puesto })));
      const acta = armarActa(a);
      const accion = await modal({
        titulo: `Acta del punto de encuentro`, ancho: 'ancho',
        cuerpo: `<h4>No han llegado (${lista.length})</h4>
          ${lista.length ? `<ol class="lista-ausentes">${lista.map(x => `<li><strong>${esc(sesion.nombreDe(x.codigo))}</strong>, ${esc(ubicacionTexto(x))}<br><span class="sutil">${esc(ultimaUbicacion(x))}</span></li>`).join('')}</ol>` : '<p>Todas las personas de la lista ya llegaron.</p>'}
          <details><summary class="resumen-plegable">Ya llegaron (${ya.length})</summary>
            ${ya.length ? `<ol class="lista-ausentes">${ya.map(x => `<li><strong>${esc(sesion.nombreDe(x.codigo))}</strong>, ${esc(ubicacionTexto(x))} · llegó a las ${esc(horaLegible(x.marca.llegada))}</li>`).join('')}</ol>` : '<p class="sutil">Aún no llega nadie.</p>'}
          </details>
          <p class="ayuda">Entregue la lista de quienes no han llegado a la brigada del edificio o a los bomberos. «Copiar» e «Imprimir» llevan el acta completa por piso (llegaron, no llegaron y no estaban). Contiene datos personales: úsela solo para la emergencia.</p>`,
        acciones: [
          { texto: 'Cerrar', valor: null, clase: 'btn-fantasma' },
          { texto: 'Copiar texto', valor: 'copiar', clase: 'btn-secundario' },
          { texto: 'Imprimir o PDF', valor: 'imprimir', clase: 'btn-oscuro' }
        ]
      });
      if (accion === 'imprimir') imprimirActa(acta, e);
      if (accion === 'copiar') {
        try { await navigator.clipboard.writeText(textoActa(acta, e)); aviso('Acta copiada. Puede pegarla en un mensaje para la brigada.', 'exito'); }
        catch { aviso('No se pudo copiar en este celular.', 'error'); }
      }
    });
  };

  const alCambiar = () => {
    if (!location.hash.startsWith('#/punto')) return;
    if (document.activeElement && document.activeElement.id === 'buscar') return; // no interrumpir la búsqueda
    pintar();
  };
  addEventListener('emergencia-cambio', alCambiar);
  addEventListener('apoyos-cambio', alCambiar);
  const reloj = setInterval(() => {
    const a = emergencia.actual();
    vista.querySelectorAll('[data-transcurrido]').forEach(el => { if (a) el.textContent = emergencia.transcurrido(a.emergencia.inicio); });
  }, 1000);
  vista.addEventListener('vista-salida', () => { removeEventListener('emergencia-cambio', alCambiar); removeEventListener('apoyos-cambio', alCambiar); clearInterval(reloj); vista.classList.remove('modo-sol'); }, { once: true });
  pintar();
  emergencia.consultar();
}
