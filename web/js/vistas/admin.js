// Administración: llave maestra, planta física (Excel), personas y roles,
// credenciales iniciales y configuración. Reservada al rol administrador.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as llave from '../llave.js';
import { llamar } from '../api.js';
import { leerXlsx, interpretarPlanta } from '../xlsx.js';
import { esc, icono, aviso, espera, tarjeta, insignia, confirmar } from '../ui.js';
import { previaExcel, elegirArchivo, guardarLlave, abrirLlave, mostrarCredencial } from './comun.js';
import * as contenido from '../contenido.js';
import { ARCHIVOS } from '../contenido-inicial.js';

const PESTANAS = [
  ['llave', 'llave', 'Llave'],
  ['excel', 'hoja', 'Planta y Excel'],
  ['personas', 'personas', 'Personas y roles'],
  ['credenciales', 'imprimir', 'Credenciales'],
  ['contenido', 'subir', 'Contenido'],
  ['config', 'ajustes', 'Configuración']
];
let actual = 'llave';

export function vistaAdmin(vista) {
  vista.innerHTML = `
    <div class="titulo-vista"><h2>Administración</h2><p class="sutil">Solo el administrador ve esta sección</p></div>
    <div class="navegacion no-imprimir" style="padding:0 0 1rem" id="sub">${PESTANAS.map(([id, ic, t]) =>
      `<button class="pestana" data-id="${id}">${icono(ic, 'ic-s')}${t}</button>`).join('')}</div>
    <div id="panel"></div>`;
  const panel = vista.querySelector('#panel');
  const abrir = id => {
    actual = id;
    vista.querySelectorAll('#sub .pestana').forEach(b => b.classList.toggle('activa', b.dataset.id === id));
    panel.innerHTML = '';
    const necesitaLlave = ['excel', 'personas', 'credenciales'].includes(id);
    if (necesitaLlave && !llave.abierta()) {
      panel.innerHTML = `<div class="nota nota-adv">${icono('llave')}<span>Para esta sección abra primero la llave maestra.</span></div>
        <button class="btn btn-primario" id="ir-llave">Ir a la llave</button>`;
      panel.querySelector('#ir-llave').addEventListener('click', () => abrir('llave'));
      return;
    }
    ({ llave: panelLlave, excel: panelExcel, personas: panelPersonas, credenciales: panelCredenciales, contenido: panelContenido, config: panelConfig })[id](panel, abrir);
  };
  vista.querySelectorAll('#sub .pestana').forEach(b => b.addEventListener('click', () => abrir(b.dataset.id)));
  abrir(actual);
}

// ---------- Llave ----------
async function panelLlave(panel, abrir) {
  const dir = sesion.base() && sesion.base().directorio;
  const ok = llave.abierta() ? await llave.corresponde(dir) : true;
  const conRol = new Set(((sesion.base() && sesion.base().personas) || []).filter(p => p.roles.length).map(p => p.codigo));
  const pendientes = llave.personas().filter(p => conRol.has(p.codigo) && p.claveTemporal && !p.entregada).length;
  panel.innerHTML = tarjeta({
    icono: 'llave', tono: llave.abierta() ? 'verde' : 'ambar', titulo: 'Llave maestra',
    subtitulo: 'Relaciona cada código con nombre, correo y celular. Solo existe en su computador.',
    cuerpo: `
      ${llave.abierta() ? `
        <div class="nota ${ok ? 'nota-exito' : 'nota-error'}">${icono(ok ? 'ok' : 'alerta')}<span>${ok
          ? `Llave abierta: ${llave.personas().filter(p => p.estado === 'activo').length} personas activas.`
          : 'Esta llave NO corresponde al directorio publicado en el servidor. No haga cambios con ella.'}</span></div>
        ${pendientes ? `<p>${insignia(pendientes + ' contraseñas temporales sin entregar', 'ambar')}</p>` : ''}
        <div class="fila">
          <button class="btn btn-primario" id="guardar">${icono('guardar', 'ic-s')}Guardar copia</button>
          <button class="btn btn-fantasma" id="cerrar">Cerrar llave</button>
        </div>`
      : `<div class="fila"><button class="btn btn-primario" id="abrir">${icono('llave', 'ic-s')}Abrir llave</button></div>`}
      <ul class="ayuda" style="margin-top:1rem;padding-left:1.1rem">
        <li>Guárdela fuera de la carpeta APP y de cualquier carpeta sincronizada con servicios de terceros.</li>
        <li>Mantenga una copia en una memoria USB guardada bajo llave.</li>
        <li>Si entrega la administración, entregue también este archivo y su frase.</li>
      </ul>`
  });
  panel.querySelector('#abrir')?.addEventListener('click', async () => {
    try { if (await abrirLlave()) { aviso('Llave abierta.', 'exito'); abrir('llave'); } }
    catch (e) { aviso(e.message, 'error'); }
  });
  panel.querySelector('#guardar')?.addEventListener('click', () => guardarLlave());
  panel.querySelector('#cerrar')?.addEventListener('click', () => { llave.cerrar(); abrir('llave'); });
}

// ---------- Excel ----------
function panelExcel(panel, abrir) {
  let filas = null, cambios = null;
  panel.innerHTML = tarjeta({
    icono: 'hoja', tono: 'turquesa', titulo: 'Cargar o volver a cargar el Excel de puestos',
    subtitulo: 'El archivo se lee en este computador; no se sube. Antes de aplicar verá cada cambio.',
    cuerpo: `<div class="fila"><button class="btn btn-secundario" id="elegir">${icono('subir', 'ic-s')}Elegir Excel</button></div>
      <div id="previa" style="margin-top:1rem"></div>
      <div class="fila oculto" id="acciones" style="margin-top:1rem">
        <button class="btn btn-oscuro" id="aplicar">${icono('ok', 'ic-s')}Aplicar cambios</button>
      </div>`
  });
  const $ = s => panel.querySelector(s);
  $('#elegir').addEventListener('click', async () => {
    const archivo = await elegirArchivo('.xlsx');
    if (!archivo) return;
    try {
      const r = interpretarPlanta(await leerXlsx(await archivo.arrayBuffer()));
      filas = r.filas;
      cambios = llave.compararExcel(filas);
      $('#previa').innerHTML = previaExcel(cambios, r.avisos, filas);
      $('#acciones').classList.toggle('oculto', !cambios.some(c => c.tipo !== 'igual') && !puestosCambiaron(filas));
    } catch (e) { aviso('No se pudo leer el Excel: ' + e.message, 'error'); }
  });
  $('#aplicar').addEventListener('click', async () => {
    const retiros = cambios.filter(c => c.tipo === 'retiro');
    if (retiros.some(c => sesion.base().personas.find(p => p.codigo === c.codigo)?.roles.includes('admin'))) {
      return aviso('El Excel retira al administrador. Asigne primero otro administrador.', 'error');
    }
    if (retiros.length && !await confirmar('Retiros', `${retiros.length} persona(s) quedarán inactivas. ¿Continuar?`)) return;
    const copia = llave.instantanea();
    const capa = espera('Aplicando cambios…');
    try {
      const exigir = !!sesion.base().config.exigirCambioInicial;
      const { items, puestos } = await llave.aplicarExcel(filas, cambios, { exigirCambio: exigir, alAvanzar: capa.progreso });
      capa.texto('Enviando al servidor…');
      await llamar('guardarPadron', { personas: items, puestos, sobreDirectorio: await llave.sobreDirectorio() });
      capa.cerrar();
      // El servidor ya tiene las contraseñas nuevas: sin la llave guardada nadie podría
      // consultarlas, así que se insiste hasta que quede guardada.
      while (!await guardarLlave()) { /* se vuelve a pedir */ }
      await sesion.refrescar();
      const nuevas = cambios.filter(c => c.tipo === 'nueva' || c.tipo === 'correo').length;
      aviso(`Cambios aplicados.${nuevas ? ` Hay ${nuevas} contraseña(s) temporal(es) por entregar.` : ''}`, 'exito');
      abrir(nuevas ? 'credenciales' : 'excel');
    } catch (e) {
      llave.restaurar(copia);
      capa.cerrar();
      aviso(e.message, 'error');
    }
  });
}

function puestosCambiaron(filas) {
  const actuales = (sesion.base().puestos || []).map(p => `${p.piso}-${p.puesto}-${p.estado}`).sort().join('|');
  const nuevos = filas.map(f => `${f.piso}-${f.puesto}-${f.correo ? 'ocupado' : 'vacante'}`).sort().join('|');
  return actuales !== nuevos;
}

// ---------- Personas y roles ----------
const DIAS_PRESENCIALES = [['1', 'L'], ['2', 'M'], ['3', 'X'], ['4', 'J'], ['5', 'V']];
// '' y '1,2,3,4,5' significan lo mismo: lunes a viernes.
const agendaNorm = a => (a === '1,2,3,4,5' ? '' : a || '');

function panelPersonas(panel, abrir) {
  const servidor = sesion.base().personas.filter(p => p.estado === 'activo');
  const filas = servidor.map(s => ({ s, l: llave.persona(s.codigo) || { nombre: s.codigo, correo: '', celular: '' } }))
    .sort((a, b) => a.s.piso - b.s.piso || a.s.puesto - b.s.puesto);
  const marca = (r, s) => s.roles.includes(r) ? 'checked' : '';
  // Días de la agenda guardada: '' = lunes a viernes; 'ocasional'; o una lista de días ISO.
  const diasDe = a => (a === 'ocasional' ? [] : a ? a.split(',').map(Number) : [1, 2, 3, 4, 5]);

  panel.innerHTML = `
    <div class="nota nota-info">${icono('info')}<span>Solo ingresan al aplicativo las personas con un rol. Las demás siguen en las listas de emergencia y de Hoy en la sede.</span></div>
    <div class="nota nota-info" style="margin-top:.5rem">${icono('info')}<span>El coordinador y el suplente ven todos los pisos y las caracterizaciones; asigne uno de esos roles a quien supervise el aplicativo. Cada piso tiene uno o dos brigadistas, hay un coordinador y, si se quiere, un suplente. El asesor reporta en las emergencias. Siempre debe quedar al menos un administrador. El celular solo se pide a los brigadistas, al coordinador y al suplente, y viaja cifrado.</span></div>
    <div class="fila" id="filtro-acceso" style="margin:1rem 0">
      <button class="pestana activa" data-f="todas">Todas</button>
      <button class="pestana" data-f="con">Con acceso</button>
      <button class="pestana" data-f="sin">Sin acceso</button>
    </div>
    <div class="tabla-caja"><table>
      <thead><tr><th>Persona</th><th>Ubicación</th><th>Acceso</th><th>Roles</th><th>Días presenciales</th><th>Brigada y celular</th><th></th></tr></thead>
      <tbody>${filas.map(({ s, l }) => {
        const dias = diasDe(s.agenda);
        const ocasional = s.agenda === 'ocasional';
        return `
        <tr data-codigo="${esc(s.codigo)}" data-acceso="${s.roles.length ? 'con' : 'sin'}" data-finde="${esc(dias.filter(d => d > 5).join(','))}">
          <td><strong>${esc(l.nombre)}</strong><div class="sutil"><span class="mono">${esc(s.codigo)}</span> · ${esc(l.correo)}</div></td>
          <td class="mono">P${s.piso}-${s.puesto}</td>
          <td data-insignia-acceso></td>
          <td>
            <label class="casilla"><input type="checkbox" data-rol="admin" ${marca('admin', s)}>Administrador</label>
            <label class="casilla"><input type="checkbox" data-rol="coordinador" ${marca('coordinador', s)}>Coordinador</label>
            <label class="casilla"><input type="checkbox" data-rol="suplente" ${marca('suplente', s)}>Suplente</label>
            <label class="casilla"><input type="checkbox" data-rol="brigadista" ${marca('brigadista', s)}>Brigadista</label>
            <label class="casilla"><input type="checkbox" data-rol="asesor" ${marca('asesor', s)}>Asesor</label>
          </td>
          <td style="min-width:9rem">
            <div class="fila" style="gap:.5rem">${DIAS_PRESENCIALES.map(([v, t]) =>
              `<label class="casilla" title="Día ${v} de la semana"><input type="checkbox" data-dia="${v}" ${dias.includes(Number(v)) ? 'checked' : ''}>${t}</label>`).join('')}</div>
            <label class="casilla"><input type="checkbox" data-ocasional ${ocasional ? 'checked' : ''}>Ocasional</label>
          </td>
          <td style="min-width:11rem">
            <select data-campo="piso">${CONFIG.PISOS.map(n => `<option value="${n}" ${(s.pisoBrigada || s.piso) === n ? 'selected' : ''}>Piso ${n}</option>`).join('')}</select>
            <input data-campo="celular" type="tel" placeholder="Celular" value="${esc(l.celular || '')}" style="margin-top:.4rem">
          </td>
          <td><button class="btn btn-fantasma btn-chico" data-accion="clave" title="Generar contraseña temporal">${icono('recargar', 'ic-s')}Contraseña</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="fila" style="margin-top:1rem"><button class="btn btn-oscuro" id="guardar">${icono('guardar', 'ic-s')}Guardar roles, días y celulares</button></div>`;

  // El piso solo aplica a brigadistas; el celular también a coordinador y suplente; «Ocasional»
  // deshabilita los días; la insignia de acceso sigue a las casillas de roles.
  const sincronizar = tr => {
    const marcado = r => tr.querySelector(`[data-rol=${r}]`).checked;
    tr.querySelector('[data-campo=piso]').disabled = !marcado('brigadista');
    tr.querySelector('[data-campo=celular]').disabled = !(marcado('brigadista') || marcado('coordinador') || marcado('suplente'));
    const ocasional = tr.querySelector('[data-ocasional]').checked;
    tr.querySelectorAll('[data-dia]').forEach(c => { c.disabled = ocasional; });
    const conAcceso = [...tr.querySelectorAll('[data-rol]')].some(c => c.checked);
    tr.querySelector('[data-insignia-acceso]').innerHTML = conAcceso ? insignia('Con acceso', 'verde') : insignia('Sin acceso', 'gris');
  };
  panel.querySelectorAll('tbody tr').forEach(tr => {
    sincronizar(tr);
    tr.querySelectorAll('[data-rol], [data-ocasional]').forEach(c => c.addEventListener('change', () => sincronizar(tr)));
  });

  // Filtro por el acceso guardado (no cambia mientras se editan las casillas).
  panel.querySelectorAll('#filtro-acceso button').forEach(b => b.addEventListener('click', () => {
    panel.querySelectorAll('#filtro-acceso button').forEach(x => x.classList.toggle('activa', x === b));
    panel.querySelectorAll('tbody tr').forEach(tr => { tr.classList.toggle('oculto', b.dataset.f !== 'todas' && tr.dataset.acceso !== b.dataset.f); });
  }));

  panel.querySelectorAll('[data-accion=clave]').forEach(b => b.addEventListener('click', async () => {
    const codigo = b.closest('tr').dataset.codigo;
    const p = llave.persona(codigo);
    if (!p) return aviso('Esta persona no está en la llave abierta.', 'error');
    if (!await confirmar('Nueva contraseña temporal', `Se generará una contraseña nueva para ${esc(p.nombre)}. La actual dejará de funcionar y se cerrarán sus sesiones.`)) return;
    const copia = llave.instantanea();
    const capa = espera('Generando…');
    try {
      const datos = await llave.nuevaClave(codigo, !!sesion.base().config.exigirCambioInicial);
      await llamar('restablecerClave', datos);
      capa.cerrar();
      await guardarLlave();
      await mostrarCredencial(llave.persona(codigo));
    } catch (e) { llave.restaurar(copia); capa.cerrar(); aviso(e.message, 'error'); }
  }));

  // Agenda que se envía: 'ocasional', '' (lunes a viernes) o los días marcados (con los del fin de
  // semana que ya tuviera guardados, que esta pantalla no edita). Sin ningún día = ocasional.
  const agendaDe = tr => {
    if (tr.querySelector('[data-ocasional]').checked) return 'ocasional';
    const dias = [...tr.querySelectorAll('[data-dia]:checked')].map(c => Number(c.dataset.dia))
      .concat((tr.dataset.finde || '').split(',').filter(Boolean).map(Number)).sort((a, b) => a - b);
    if (!dias.length) return 'ocasional';
    return dias.join(',') === '1,2,3,4,5' ? '' : dias.join(',');
  };

  panel.querySelector('#guardar').addEventListener('click', async () => {
    const leidas = [...panel.querySelectorAll('tbody tr')].map(tr => {
      const roles = [...tr.querySelectorAll('[data-rol]:checked')].map(c => c.dataset.rol);
      const brig = roles.includes('brigadista');
      const conCelular = brig || roles.includes('coordinador') || roles.includes('suplente');
      return { codigo: tr.dataset.codigo, roles, pisoBrigada: brig ? Number(tr.querySelector('[data-campo=piso]').value) : null,
        celular: conCelular ? tr.querySelector('[data-campo=celular]').value.trim() : '', agenda: agendaDe(tr) };
    });
    const errores = [];
    if (!leidas.some(x => x.roles.includes('admin'))) errores.push('Debe quedar al menos un administrador.');
    if (leidas.filter(x => x.roles.includes('coordinador')).length > 1) errores.push('Solo puede haber un coordinador.');
    if (leidas.filter(x => x.roles.includes('suplente')).length > 1) errores.push('Solo puede haber un suplente.');
    for (const n of CONFIG.PISOS) {
      if (leidas.filter(x => x.pisoBrigada === n).length > 2) errores.push(`El piso ${n} tiene más de dos brigadistas.`);
    }
    if (leidas.some(x => x.roles.includes('coordinador') && x.roles.includes('suplente'))) errores.push('Una misma persona no puede ser coordinador y suplente.');
    if (errores.length) return aviso(errores.join(' '), 'error');

    // Cuenta como cambio: roles, piso de brigada, celular o agenda.
    const cambios = leidas.filter(x => {
      const s = servidor.find(y => y.codigo === x.codigo);
      const l = llave.persona(x.codigo) || {};
      return s.roles.slice().sort().join() !== x.roles.slice().sort().join() || (s.pisoBrigada || null) !== x.pisoBrigada
        || (l.celular || '') !== x.celular || agendaNorm(s.agenda) !== x.agenda;
    });
    if (!cambios.length) return aviso('No hay cambios por guardar.', 'info');
    // Quienes pasan de sin acceso a con acceso y no tienen una contraseña temporal pendiente en la llave.
    const nuevosConAcceso = cambios.filter(x => {
      const s = servidor.find(y => y.codigo === x.codigo);
      const l = llave.persona(x.codigo);
      return !s.roles.length && x.roles.length && !(l && l.claveTemporal);
    }).length;
    const copia = llave.instantanea();
    try {
      cambios.forEach(x => llave.fijarCelular(x.codigo, x.celular));
      await llamar('guardarRoles', {
        cambios: cambios.map(({ codigo, roles, pisoBrigada, agenda }) => ({ codigo, roles, pisoBrigada, agenda })),
        sobreDirectorio: await llave.sobreDirectorio()
      });
      await guardarLlave();
      await sesion.refrescar();
      aviso(`Se guardaron ${cambios.length} cambio(s).`, 'exito');
      if (nuevosConAcceso) aviso(`${nuevosConAcceso} persona(s) ahora tienen acceso. Genere y entregue su contraseña con el botón Contraseña.`, 'advertencia');
      if (!sesion.tieneRol('admin')) { location.hash = '#/inicio'; return; }
      abrir('personas');
    } catch (e) { llave.restaurar(copia); aviso(e.message, 'error'); }
  });
}

// ---------- Credenciales ----------
function panelCredenciales(panel, abrir) {
  // Solo se entregan credenciales a quienes tienen algún rol: sin rol no hay acceso.
  const conRol = new Set(sesion.base().personas.filter(p => p.roles.length).map(p => p.codigo));
  const pendientes = llave.personas().filter(p => p.estado === 'activo' && conRol.has(p.codigo) && p.claveTemporal && !p.entregada)
    .sort((a, b) => a.piso - b.piso || a.puesto - b.puesto);
  const direccion = location.href.split('#')[0];
  panel.innerHTML = `
    <div class="no-imprimir">
      <div class="nota nota-info">${icono('info')}<span>Contraseñas temporales que aún no se han entregado. Al marcarlas como entregadas se borran de la llave. Si alguien la pierde, genere otra en Personas y roles.</span></div>
      ${pendientes.length ? `<div class="fila" style="margin-bottom:1rem"><button class="btn btn-secundario" id="imprimir">${icono('imprimir', 'ic-s')}Imprimir credenciales</button></div>` : '<p class="sutil">No hay contraseñas pendientes por entregar.</p>'}
    </div>
    <div id="credenciales">${pendientes.map(p => `
      <div class="credencial" data-codigo="${esc(p.codigo)}">
        <div class="fila entre">
          <div><strong>${esc(CONFIG.APP_NOMBRE)}</strong> — acceso inicial<br>
            <span>${esc(p.nombre)}</span> · <span class="sutil">P${p.piso}-${p.puesto}</span></div>
          <label class="casilla no-imprimir"><input type="checkbox" data-entregada>Entregada</label>
        </div>
        <p style="margin:.4rem 0 0">Correo: <strong>${esc(p.correo)}</strong></p>
        <p>Contraseña temporal: <span class="clave-mono">${esc(p.claveTemporal)}</span></p>
        <p class="ayuda">Ingrese en ${esc(direccion)} y cambie la contraseña en «Mi cuenta».</p>
      </div>`).join('')}</div>`;
  panel.querySelector('#imprimir')?.addEventListener('click', () => print());
  panel.querySelectorAll('[data-entregada]').forEach(c => c.addEventListener('change', async () => {
    llave.marcarEntregada(c.closest('[data-codigo]').dataset.codigo);
    await guardarLlave();
    abrir('credenciales');
  }));
}

// ---------- Contenido ----------
function panelContenido(panel, abrir) {
  const meta = contenido.archivosMeta();
  const falta = ARCHIVOS.filter(a => !meta[a.id]).length;
  const sembrables = Object.keys(contenido.SEMILLAS).filter(n => !contenido.existeSobre(n));

  panel.innerHTML = `
    ${sembrables.length ? `<div class="nota nota-adv">${icono('info')}<span>Aún no están cargados los textos iniciales: ${sembrables.join(', ')}.</span>
      <button class="btn btn-primario btn-chico" id="sembrar">Cargar textos iniciales</button></div>` : ''}
    ${tarjeta({
      icono: 'subir', tono: 'turquesa', titulo: 'Mapas, rutas y planos',
      subtitulo: `Se guardan cifrados en Google y se descargan al celular. ${falta ? `Faltan ${falta} por cargar.` : 'Todos cargados.'}`,
      cuerpo: `<div class="tabla-caja"><table>
        <thead><tr><th>Archivo</th><th>Estado</th><th></th></tr></thead>
        <tbody>${ARCHIVOS.map(a => {
          const m = meta[a.id];
          return `<tr data-id="${a.id}">
            <td><strong>${esc(a.nombre)}</strong></td>
            <td>${m ? insignia('Cargado', 'verde') + ` <span class="sutil">v${m.version} · ${contenido.formatoTam(m.tam || 0)} · ${m.mime === 'application/pdf' ? 'PDF' : 'imagen'}</span>` : insignia('Falta', 'ambar')}</td>
            <td class="fila"><button class="btn btn-secundario btn-chico" data-cargar>${m ? 'Reemplazar' : 'Cargar'}</button>
              ${m ? '<button class="btn btn-fantasma btn-chico" data-quitar>Quitar</button>' : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="ayuda">Admite JPG, PNG o PDF. Las imágenes se reducen solas; los PDF pueden pesar hasta 800 KB. Los archivos originales están en Insumos → Modulo_5 (Rutas_Evacuacion y Planta_Fisica).</p>`
    })}
    ${tarjeta({
      icono: 'libro', tono: 'morado', titulo: 'Textos editables',
      subtitulo: 'Se editan desde cada pantalla',
      cuerpo: `<div class="fila"><a class="btn btn-secundario btn-chico" href="#/contactos">Contactos</a>
        <a class="btn btn-secundario btn-chico" href="#/rutas">Punto de encuentro y rutas</a>
        <a class="btn btn-secundario btn-chico" href="#/recomendaciones">Recomendaciones</a></div>`
    })}`;

  panel.querySelector('#sembrar')?.addEventListener('click', async () => {
    try { await contenido.sembrar(); aviso('Textos iniciales cargados.', 'exito'); abrir('contenido'); }
    catch (e) { aviso(e.message, 'error'); }
  });
  panel.querySelectorAll('[data-cargar]').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('[data-id]').dataset.id;
    const archivo = await elegirArchivo('image/jpeg,image/png,application/pdf');
    if (!archivo) return;
    const capa = espera('Preparando y cifrando el archivo…');
    try {
      const tam = await contenido.subirArchivo(id, archivo);
      capa.cerrar();
      aviso(`Archivo cargado (${contenido.formatoTam(tam)}).`, 'exito');
    } catch (e) {
      capa.cerrar();
      aviso(e.message, 'error');
    }
    abrir('contenido');
  }));
  panel.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('[data-id]').dataset.id;
    if (!await confirmar('Quitar archivo', 'El archivo dejará de verse en la aplicación.', 'Quitar', true)) return;
    try { await contenido.quitarArchivo(id); } catch (e) { aviso(e.message, 'error'); }
    abrir('contenido');
  }));
}

// ---------- Configuración ----------
function panelConfig(panel) {
  const cfg = sesion.base().config;
  const r = cfg.reglasClave || {};
  panel.innerHTML = tarjeta({
    icono: 'ajustes', tono: 'morado', titulo: 'Reglas de acceso', subtitulo: 'Se aplican al cambiar la contraseña',
    cuerpo: `<form id="f-config">
      <div class="campo"><label class="etiqueta" for="minimo">Largo mínimo de la contraseña (0 = sin mínimo)</label><input id="minimo" type="number" min="0" max="64" value="${Number(r.minimo) || 0}"></div>
      <label class="casilla"><input type="checkbox" id="mayuscula" ${r.mayuscula ? 'checked' : ''}>Exigir una mayúscula</label>
      <label class="casilla"><input type="checkbox" id="numero" ${r.numero ? 'checked' : ''}>Exigir un número</label>
      <label class="casilla"><input type="checkbox" id="simbolo" ${r.simbolo ? 'checked' : ''}>Exigir un símbolo</label>
      <hr style="border:none;border-top:1px solid var(--corp-light);margin:1rem 0">
      <label class="casilla"><input type="checkbox" id="exigir" ${cfg.exigirCambioInicial ? 'checked' : ''}>Obligar a cambiar la contraseña temporal en el primer ingreso</label>
      <div class="campo" style="margin-top:.8rem"><label class="etiqueta" for="dias">Días que dura una sesión en el celular (1 a 90)</label><input id="dias" type="number" min="1" max="90" value="${cfg.diasSesion || 30}"></div>
      <div class="campo"><label class="etiqueta" for="dbit">Días que se conserva la bitácora de accesos (30 a 1825)</label><input id="dbit" type="number" min="30" max="1825" value="${cfg.diasBitacora || 365}"></div>
      <div class="campo"><label class="etiqueta" for="festivos">Días sin actividad presencial (festivos)</label>
        <textarea id="festivos" rows="6" placeholder="2026-12-08&#10;2026-12-25" style="width:100%">${esc((cfg.festivos || []).join('\n'))}</textarea>
        <p class="ayuda">Una fecha por línea, con el formato AAAA-MM-DD (hasta 60). Esos días nadie figura previsto en la sede, salvo quien tenga una novedad «Asiste».</p></div>
      <p class="ayuda">Recomendación: al menos 10 caracteres y obligar el cambio de la contraseña temporal. Una contraseña débil también debilita la protección de los sobres cifrados. La bitácora más antigua que el plazo se borra sola, una vez al día.</p>
      <button class="btn btn-oscuro" type="submit">${icono('guardar', 'ic-s')}Guardar configuración</button>
    </form>`
  });
  panel.querySelector('#f-config').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await llamar('guardarConfig', {
        reglasClave: { minimo: Math.max(0, Number(f.minimo.value) || 0), mayuscula: f.mayuscula.checked, numero: f.numero.checked, simbolo: f.simbolo.checked },
        exigirCambioInicial: f.exigir.checked, diasSesion: Number(f.dias.value) || 30,
        diasBitacora: Number(f.dbit.value) || 365,
        festivos: f.festivos.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      });
      await sesion.refrescar();
      f.festivos.value = (sesion.base().config.festivos || []).join('\n');   // ordenados y sin repetir, como los guardó el servidor
      aviso('Configuración guardada.', 'exito');
    } catch (err) { aviso(err.message, 'error'); }
  });
}
