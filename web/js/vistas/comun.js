// Piezas compartidas por varias vistas.
import { CONFIG } from '../../config.js';
import { esc, insignia, modal, aviso } from '../ui.js';
import * as llave from '../llave.js';
import * as sesion from '../sesion.js';
import * as registro from '../registro.js';
import { horaBogota, horaLegible } from '../tiempo.js';

// ---------- Registro diario ----------

export const SITUACION = {
  'en-sede': ['En la sede', 'verde'],
  salio: ['Salió', 'gris'],
  remoto: ['Remoto', 'azul'],
  comision: ['Comisión', 'azul'],
  vacaciones: ['Vacaciones', 'gris'],
  incapacidad: ['Incapacidad', 'gris'],
  'sin-reporte': ['Sin reporte', 'ambar']
};

export const ESTADOS_AUSENCIA = [['remoto', 'Remoto'], ['comision', 'Comisión'], ['vacaciones', 'Vacaciones'], ['incapacidad', 'Incapacidad']];

export function insigniaSituacion(r) {
  const [t, tono] = SITUACION[registro.situacion(r)];
  return insignia(t, tono);
}

export const textoUbicacion = u => `Piso ${u.piso} · ${u.puesto ? 'Puesto ' + u.puesto : 'otro lugar del piso'}`;

export function horario(r) {
  if (!r || r.estado !== 'presencial') return '';
  return [r.ingreso && 'Ingreso ' + horaLegible(r.ingreso), r.salida && 'Salida ' + horaLegible(r.salida)].filter(Boolean).join(' · ');
}

// Formulario para cambiar el puesto de hoy. Devuelve {piso, puesto} o null.
export async function elegirPuestoHoy(persona) {
  const puestos = (sesion.base().puestos || []);
  const opciones = piso => ['<option value="0">Otro lugar del piso (sala, oficina…)</option>']
    .concat(puestos.filter(x => x.piso === piso).sort((a, b) => a.puesto - b.puesto)
      .map(x => `<option value="${x.puesto}">Puesto ${x.puesto}${x.estado === 'vacante' ? ' (vacante)' : ''}</option>`)).join('');
  const respuesta = modal({
    titulo: 'Ubicación de hoy',
    cuerpo: `<p class="sutil">Su puesto habitual es piso ${persona.piso}, puesto ${persona.puesto}.</p>
      <div class="campo"><label class="etiqueta" for="u-piso">Piso</label>
        <select id="u-piso">${CONFIG.PISOS.map(n => `<option value="${n}" ${n === persona.piso ? 'selected' : ''}>Piso ${n}</option>`).join('')}</select></div>
      <div class="campo"><label class="etiqueta" for="u-puesto">Puesto</label><select id="u-puesto">${opciones(persona.piso)}</select></div>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      { texto: 'Usar esta ubicación', clase: 'btn-oscuro', valor: f => ({ piso: Number(f.querySelector('#u-piso').value), puesto: Number(f.querySelector('#u-puesto').value) }) }
    ]
  });
  // El modal ya está en pantalla: al cambiar de piso se actualizan los puestos.
  const selPiso = document.querySelector('#u-piso');
  selPiso.addEventListener('change', () => { document.querySelector('#u-puesto').innerHTML = opciones(Number(selPiso.value)); });
  return respuesta;
}

// Pide una hora (HH:MM). Devuelve la hora o null.
export function pedirHora(titulo, actual) {
  return modal({
    titulo,
    cuerpo: `<label class="etiqueta" for="hora">Hora</label><input id="hora" type="time" value="${esc(actual || horaBogota())}">`,
    acciones: [{ texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      { texto: 'Guardar', clase: 'btn-oscuro', valor: f => f.querySelector('#hora').value || null }]
  });
}

// Reporte del estado de un compañero (o propio) en un solo formulario.
export async function reportarPersona(persona) {
  const r = registro.registroDe(persona.codigo) || {};
  const nombre = sesion.nombreDe(persona.codigo);
  const estadoActual = r.estado || '';
  const valores = await modal({
    titulo: 'Reportar a ' + nombre,
    cuerpo: `
      <p class="sutil">Puesto habitual: piso ${persona.piso}, puesto ${persona.puesto}. El reporte queda a su nombre como "reportado por".</p>
      <div class="campo"><label class="etiqueta" for="r-estado">Estado de hoy</label>
        <select id="r-estado">
          <option value="presencial" ${estadoActual === 'presencial' || !estadoActual ? 'selected' : ''}>Presencial (en la sede)</option>
          ${ESTADOS_AUSENCIA.map(([v, t]) => `<option value="${v}" ${estadoActual === v ? 'selected' : ''}>${t}</option>`).join('')}
          <option value="borrar">Quitar el reporte de hoy (sin reporte)</option>
        </select></div>
      <div class="fila">
        <div class="campo" style="flex:1"><label class="etiqueta" for="r-ingreso">Hora de ingreso</label><input id="r-ingreso" type="time" value="${esc(r.ingreso || horaBogota())}"></div>
        <div class="campo" style="flex:1"><label class="etiqueta" for="r-salida">Hora de salida</label><input id="r-salida" type="time" value="${esc(r.salida || '')}"></div>
      </div>
      <p class="ayuda">Deje la hora de salida vacía si la persona sigue en la sede.</p>`,
    acciones: [{ texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      { texto: 'Guardar reporte', clase: 'btn-oscuro', valor: f => ({
        estado: f.querySelector('#r-estado').value, ingreso: f.querySelector('#r-ingreso').value, salida: f.querySelector('#r-salida').value }) }]
  });
  if (!valores) return false;
  if (valores.estado === 'borrar') {
    await registro.marcar(persona.codigo, { estado: '', ingreso: '', salida: '', excepcion: 'false', piso: persona.piso, puesto: persona.puesto });
    aviso(`Se quitó el reporte de hoy de ${nombre}.`, 'info');
    return true;
  }
  const campos = { estado: valores.estado };
  if (valores.estado === 'presencial') { campos.ingreso = valores.ingreso || horaBogota(); campos.salida = valores.salida || ''; }
  else { campos.ingreso = ''; campos.salida = ''; }
  await registro.marcar(persona.codigo, campos);
  aviso(`Reporte de ${nombre} guardado.`, 'exito');
  return true;
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
