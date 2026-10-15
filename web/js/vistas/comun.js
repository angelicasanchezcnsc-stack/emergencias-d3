// Piezas compartidas por varias vistas.
import { CONFIG } from '../../config.js';
import { esc, insignia, modal, aviso } from '../ui.js';
import * as llave from '../llave.js';
import * as sesion from '../sesion.js';
import { fechaBogota } from '../tiempo.js';

// ---------- Presencia y novedades ----------

// Insignia de la presencia de hoy (resultado de presenciaDe).
export function insigniaPresencia(r) {
  switch (r.motivo) {
    case 'novedad-otro-lugar': return insignia('En otro lugar', 'azul');
    case 'novedad-no-asiste': return insignia('No asiste hoy', 'gris');
    case 'fuera-de-agenda':
    case 'festivo': return insignia('Sin agenda hoy', 'gris');
    default: return insignia('Prevista', 'verde');
  }
}

export const TIPOS_NOVEDAD = { no_asiste: 'No asiste', otro_lugar: 'En otro lugar', asiste: 'Asiste (fuera de su agenda)' };

// Texto corto de una novedad: «En otro lugar: piso 6, puesto 3».
export function textoNovedad(n) {
  if (n.tipo !== 'otro_lugar') return TIPOS_NOVEDAD[n.tipo] || n.tipo;
  return `En otro lugar: piso ${n.piso}, ${n.puesto ? 'puesto ' + n.puesto : 'sala o área común del piso'}`;
}

// Formulario para registrar o editar una novedad de presencia de una persona.
// Devuelve el objeto para novedades.guardar o null si se cancela. No pide el motivo.
export async function formularioNovedad(persona, existente = null) {
  const hoy = fechaBogota();
  const puestos = sesion.base().puestos || [];
  const opcionesPuesto = (piso, elegido) => ['<option value="0">Sala o área común del piso</option>']
    .concat(puestos.filter(x => x.piso === piso).sort((a, b) => a.puesto - b.puesto)
      .map(x => `<option value="${x.puesto}" ${x.puesto === elegido ? 'selected' : ''}>Puesto ${x.puesto}${x.estado === 'vacante' ? ' (vacante)' : ''}</option>`)).join('');
  const tipo0 = existente ? existente.tipo : 'no_asiste';
  const piso0 = existente && existente.tipo === 'otro_lugar' ? existente.piso : persona.piso;
  const puesto0 = existente && existente.tipo === 'otro_lugar' ? existente.puesto : 0;
  const respuesta = modal({
    titulo: (existente ? 'Editar novedad de ' : 'Novedad de ') + sesion.nombreDe(persona.codigo),
    cuerpo: `
      <p class="sutil">Puesto habitual: piso ${persona.piso}, puesto ${persona.puesto}.</p>
      <div class="campo"><label class="etiqueta" for="n-tipo">Situación</label>
        <select id="n-tipo">${Object.entries(TIPOS_NOVEDAD).map(([v, t]) => `<option value="${v}" ${v === tipo0 ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="fila">
        <div class="campo" style="flex:1"><label class="etiqueta" for="n-desde">Desde</label>
          <input id="n-desde" type="date" value="${esc(existente ? existente.desde : hoy)}" ${existente ? '' : `min="${hoy}"`}></div>
        <div class="campo" style="flex:1"><label class="etiqueta" for="n-hasta">Hasta</label>
          <input id="n-hasta" type="date" value="${esc(existente ? existente.hasta : hoy)}" min="${hoy}"></div>
      </div>
      <div id="n-lugar" class="${tipo0 === 'otro_lugar' ? '' : 'oculto'}">
        <div class="campo"><label class="etiqueta" for="n-piso">Piso</label>
          <select id="n-piso">${CONFIG.PISOS.map(n => `<option value="${n}" ${n === piso0 ? 'selected' : ''}>Piso ${n}</option>`).join('')}</select></div>
        <div class="campo"><label class="etiqueta" for="n-puesto">Puesto</label><select id="n-puesto">${opcionesPuesto(piso0, puesto0)}</select></div>
      </div>
      <p class="ayuda">No escriba el motivo. Solo se registra si la persona estará o no en la sede.</p>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: existente ? 'Guardar cambios' : 'Guardar novedad', clase: 'btn-oscuro',
        antes: f => {
          const desde = f.querySelector('#n-desde').value, hasta = f.querySelector('#n-hasta').value;
          const error = !desde || !hasta ? 'Indique las fechas desde y hasta.'
            : hasta < desde ? 'La fecha final no puede ser anterior a la inicial.'
            : hasta < hoy ? 'La fecha final debe ser hoy o posterior.'
            : !existente && desde < hoy ? 'La novedad debe empezar hoy o después.'
            : (Date.parse(hasta) - Date.parse(desde)) / 86400000 + 1 > 92 ? 'El rango no puede superar 92 días.' : '';
          if (error) { aviso(error, 'error'); return false; }
        },
        valor: f => {
          const t = f.querySelector('#n-tipo').value;
          const n = { codigo: persona.codigo, tipo: t, desde: f.querySelector('#n-desde').value, hasta: f.querySelector('#n-hasta').value };
          if (existente) n.id = existente.id;
          if (t === 'otro_lugar') { n.piso = Number(f.querySelector('#n-piso').value); n.puesto = Number(f.querySelector('#n-puesto').value); }
          return n;
        }
      }
    ]
  });
  // El modal ya está en pantalla: se muestran u ocultan el piso y el puesto según la situación.
  const selTipo = document.querySelector('#n-tipo');
  const selPiso = document.querySelector('#n-piso');
  selTipo.addEventListener('change', () => document.querySelector('#n-lugar').classList.toggle('oculto', selTipo.value !== 'otro_lugar'));
  selPiso.addEventListener('change', () => { document.querySelector('#n-puesto').innerHTML = opcionesPuesto(Number(selPiso.value), 0); });
  return respuesta;
}

// Guarda la llave. El navegador exige un clic para escribir archivos: si el
// intento directo no tiene permiso, se pide confirmación con un botón.
export async function guardarLlave() {
  try {
    const modo = await llave.guardar();
    aviso(modo === 'archivo' ? 'Llave guardada en su computador.' : 'Llave descargada. Muévala a una carpeta segura fuera de APP.', 'exito');
    return true;
  } catch (e) {
    if (e.name === 'AbortError') { aviso('No se guardó la llave. Guárdela antes de cerrar.', 'advertencia'); return false; }
    var motivo = e.name === 'NotAllowedError' || e.name === 'SecurityError' ? '' : (e.message || String(e));
  }
  const si = await modal({
    titulo: 'Guardar la llave',
    cuerpo: `<p>Hay cambios en la llave maestra. Guárdela ahora en su computador.</p>${motivo ? `<p class="ayuda">Detalle del intento anterior: ${esc(motivo)}</p>` : ''}`,
    acciones: [{ texto: 'Más tarde', valor: false, clase: 'btn-fantasma' }, { texto: 'Guardar llave', valor: true, clase: 'btn-primario' }]
  });
  if (si) return guardarLlave();
  aviso('Recuerde guardar la llave desde Administración → Llave.', 'advertencia');
  return false;
}

// Abre un archivo de llave (con acceso para volver a escribirlo si el navegador lo permite).
export async function abrirLlave() {
  let archivo, handle = null;
  if (window.showOpenFilePicker) {
    try {
      [handle] = await window.showOpenFilePicker({ types: [{ description: 'Llave EMERGENCIAS D3', accept: { 'application/octet-stream': ['.d3llave'] } }] });
      archivo = await handle.getFile();
    } catch (e) { if (e.name === 'AbortError') return false; throw e; }
  } else {
    archivo = await elegirArchivo('.d3llave');
    if (!archivo) return false;
  }
  const frase = await modal({
    titulo: 'Frase de la llave',
    cuerpo: '<label class="etiqueta" for="frase">Frase</label><input id="frase" type="password" autocomplete="off">',
    acciones: [{ texto: 'Cancelar', valor: null, clase: 'btn-fantasma' }, { texto: 'Abrir', valor: f => f.querySelector('#frase').value, clase: 'btn-oscuro' }]
  });
  if (!frase) return false;
  await llave.abrirArchivo(archivo, frase, handle);
  return true;
}

// Muestra la credencial inicial de una persona.
export function mostrarCredencial(p) {
  return modal({
    titulo: 'Contraseña temporal',
    cuerpo: `<p><strong>${esc(p.nombre)}</strong><br><span class="sutil">${esc(p.correo)} · <span class="mono">${esc(p.codigo)}</span></span></p>
      <p class="clave-mono">${esc(p.claveTemporal)}</p>
      <p class="ayuda">Entréguela en persona o desde su correo institucional. También queda en Administración → Credenciales hasta que la marque como entregada.</p>`
  });
}

export const ETIQUETA_ROL = {
  admin: ['Administrador', 'amarillo'],
  coordinador: ['Coordinador', 'azul'],
  suplente: ['Suplente', 'azul'],
  brigadista: ['Brigadista', 'rojo']
};

export function insigniasRol(p) {
  return (p.roles || []).map(r => {
    const [t, tono] = ETIQUETA_ROL[r] || [r, 'gris'];
    return insignia(r === 'brigadista' && p.pisoBrigada ? `${t} piso ${p.pisoBrigada}` : t, tono);
  }).join(' ');
}

const TIPOS = {
  nueva: ['Nueva', 'verde', 'Se crea su cuenta y una contraseña temporal.'],
  correo: ['Correo corregido', 'ambar', 'Conserva su código; se genera una nueva contraseña temporal.'],
  cambio: ['Cambio de datos', 'azul', 'Cambió de nombre, piso o puesto.'],
  reactivar: ['Reingresa', 'verde', 'Vuelve a quedar activa.'],
  retiro: ['Retiro', 'rojo', 'Queda inactiva; su historial se conserva.'],
  igual: ['Sin cambios', 'gris', '']
};

// Resumen previo a aplicar un Excel. Se muestra solo en el equipo del administrador.
export function previaExcel(cambios, avisos, puestos) {
  const cuenta = t => cambios.filter(c => c.tipo === t).length;
  const vacantes = puestos.filter(p => !p.correo).length;
  const relevantes = cambios.filter(c => c.tipo !== 'igual');
  return `
    <div class="fila" style="margin-bottom:.8rem">
      ${Object.keys(TIPOS).filter(t => cuenta(t)).map(t => insignia(`${TIPOS[t][0]}: ${cuenta(t)}`, TIPOS[t][1])).join(' ')}
      ${insignia(`Puestos: ${puestos.length}`, 'gris')} ${insignia(`Vacantes: ${vacantes}`, 'gris')}
    </div>
    ${avisos.length ? `<div class="nota nota-adv"><div>${avisos.map(a => `<div>• ${esc(a)}</div>`).join('')}</div></div>` : ''}
    ${relevantes.length ? `<div class="tabla-caja"><table>
      <thead><tr><th>Cambio</th><th>Persona</th><th>Ubicación</th><th>Detalle</th></tr></thead>
      <tbody>${relevantes.map(c => {
        const f = c.fila || c.antes;
        const detalle = c.tipo === 'correo' ? `${esc(c.antes.correo)} → ${esc(c.fila.correo)}`
          : c.tipo === 'cambio' ? `Antes: piso ${c.antes.piso}, puesto ${c.antes.puesto}` : esc(TIPOS[c.tipo][2]);
        return `<tr><td>${insignia(TIPOS[c.tipo][0], TIPOS[c.tipo][1])}</td><td>${esc(f.nombre)}<div class="sutil">${esc(f.correo)}</div></td>
          <td class="mono">P${f.piso}-${f.puesto}</td><td class="sutil">${detalle}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="sutil">No hay cambios frente a la llave actual.</p>'}`;
}

// Abre el selector de archivos y devuelve el File elegido (o null).
export function elegirArchivo(aceptar) {
  return new Promise(resolver => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = aceptar;
    entrada.addEventListener('change', () => resolver(entrada.files[0] || null));
    entrada.click();
  });
}
