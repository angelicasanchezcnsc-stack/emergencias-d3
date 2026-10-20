// Administración → Contactos de emergencia: carga del archivo del área de personal (Excel o CSV), comparación
// con las personas de la llave y envío cifrado. Solo interfaz: la lectura y la comparación están en
// js/archivo-contactos.js y el cifrado en js/contacto-emergencia.js. El archivo se lee en este computador y
// no se sube; al servidor solo llegan códigos y contactos cifrados.
import * as sesion from '../sesion.js';
import * as llave from '../llave.js';
import * as personal from '../personal.js';
import * as contacto from '../contacto-emergencia.js';
import { conciliar, datosDe, saludDe, tieneDatos, COLUMNAS } from '../archivo-contactos.js';
import { esc, icono, aviso, espera, tarjeta, insignia, confirmar } from '../ui.js';
import { elegirArchivo, guardarLlave } from './comun.js';
import { ventanaAgregar } from './ventanas-personal.js';

const rotulo = (piso, puesto) => `P${piso}-${puesto}`;
const persona = (nombre, correo) => `<strong>${esc(nombre || 'Sin nombre')}</strong><div class="sutil">${esc(correo)}</div>`;
const revisar = r => (r.alertas.length ? r.alertas.map(a => `<div>${esc(a)}</div>`).join('') : '<span class="sutil">—</span>');
const seccion = (titulo, ayuda, cabeza, filas) => `
  <h4 style="margin:1.25rem 0 .25rem">${esc(titulo)}</h4>
  <p class="ayuda" style="margin:0 0 .5rem">${esc(ayuda)}</p>
  <div class="tabla-caja"><table><thead><tr>${cabeza.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div>`;

export function panelContactos(panel, abrir) {
  if (!contacto.listoParaUsar()) {
    panel.innerHTML = `<div class="nota nota-adv">${icono('candado')}<span>Para cifrar los contactos hace falta su llave personal. Cierre sesión e ingrese de nuevo.</span></div>`;
    return;
  }
  let previa = null, avisos = [];
  panel.innerHTML = tarjeta({
    icono: 'telefono', tono: 'rojo', titulo: 'Contactos de emergencia',
    subtitulo: 'Carga desde el archivo del área de personal. El archivo se lee en este computador; no se sube.',
    cuerpo: `<div class="nota nota-info">${icono('info')}<span>Quién los ve: la coordinación (administrador, coordinador y suplente) siempre; cada brigadista, durante una emergencia o un simulacro, el de las personas de su piso marcadas como no ubicadas, con necesidad de apoyo o de asistencia (los de otro piso solo si los pide, y queda registrado). La EPS y la ARL, los brigadistas solo durante la emergencia. Todo viaja cifrado: Google no puede leerlo.</span></div>
      <p id="estado-carga" style="margin:.75rem 0">Consultando cuántos contactos hay cargados…</p>
      <p class="ayuda">Columnas, en este orden: ${esc(COLUMNAS.join(', '))}. Se empareja por correo con las personas de la app. Cargar reemplaza el contacto que ya tuviera cada persona.</p>
      <div class="fila"><button class="btn btn-secundario" id="elegir">${icono('subir', 'ic-s')}Elegir archivo (Excel o CSV)</button></div>
      <p class="ayuda" style="margin-top:.5rem">El archivo tiene datos personales: guárdelo fuera de la carpeta APP y no lo comparta.</p>
      <div id="previa" style="margin-top:1rem"></div>
      <div class="oculto" id="acciones" style="margin-top:1rem">
        <label class="casilla"><input type="checkbox" id="reviso">Revisé la comparación</label>
        <div class="fila" style="margin-top:.5rem"><button class="btn btn-oscuro" id="cargar" disabled>${icono('ok', 'ic-s')}Cargar contactos</button></div>
      </div>`
  });
  const $ = s => panel.querySelector(s);

  // Cuántas personas activas tienen ya un contacto (solo códigos: no trae ningún dato).
  const consulta = contacto.estado().catch(() => null);
  consulta.then(e => {
    $('#estado-carga').innerHTML = e
      ? `Contactos cargados: <strong>${e.cargados.size}</strong> de ${e.cargados.size + e.faltan.length} personas activas.`
      : 'No se pudo consultar cuántos contactos hay cargados.';
  });

  // Cualquier cambio en la comparación obliga a revisarla otra vez.
  const pintar = () => {
    const p = previa;
    const cargables = p.emparejadas.filter(e => tieneDatos(e.registro));
    const conAlertas = p.emparejadas.concat(p.nuevas).filter(x => x.registro.alertas.length).length;
    const altas = p.nuevas.filter(n => n.agregar);
    $('#previa').innerHTML = `
      <div class="fila" style="margin-bottom:.8rem">
        ${insignia(`Se cargan: ${cargables.length}`, 'verde')}
        ${p.nuevas.length ? insignia(`Nuevas: ${p.nuevas.length} (se agregan ${altas.length})`, 'azul') : ''}
        ${p.correoCambiado.length ? insignia(`Correo cambiado: ${p.correoCambiado.length}`, 'ambar') : ''}
        ${p.retiradas.length ? insignia(`Retiradas en la app: ${p.retiradas.length}`, 'gris') : ''}
        ${p.ausentes.length ? insignia(`En la app y no en el archivo: ${p.ausentes.length}`, 'gris') : ''}
        ${conAlertas ? insignia(`Para revisar: ${conAlertas}`, 'ambar') : ''}
      </div>
      ${avisos.length ? `<div class="nota nota-adv"><div>${avisos.map(a => `<div>• ${esc(a)}</div>`).join('')}</div></div>` : ''}
      ${p.emparejadas.length ? seccion('Se cargará su contacto', 'El correo del archivo coincide con una persona de la app.',
        ['Persona', 'Ubicación', 'Contacto', 'Revisar'], p.emparejadas.map(e => `<tr>
          <td>${persona(e.nombre, e.registro.correo)}</td><td class="mono">${rotulo(e.piso, e.puesto)}</td>
          <td>${!tieneDatos(e.registro) ? insignia('Sin datos: no se carga', 'gris') : e.reemplaza ? insignia('Reemplaza el cargado', 'azul') : insignia('Nuevo', 'verde')}</td>
          <td>${revisar(e.registro)}</td></tr>`).join('')) : ''}
      ${p.nuevas.length ? seccion('Personas nuevas', 'Están en el archivo y no en la app. Las marcadas se agregan sin rol (sin acceso), como en «Agregar persona», y se carga su contacto. Elija el puesto de cada una; desmarque a quien ya no esté en el Despacho.',
        ['Agregar', 'Persona', 'Puesto', 'Revisar'], p.nuevas.map((n, i) => `<tr${n.agregar ? '' : ' class="sutil"'}>
          <td><label class="casilla"><input type="checkbox" data-agregar="${i}" ${n.agregar ? 'checked' : ''} aria-label="${esc('Agregar a ' + (n.nombre || n.registro.nombre))}">Agregar</label></td>
          <td>${persona(n.nombre || n.registro.nombre, n.correo || n.registro.correo)}</td>
          <td><button class="btn btn-${n.piso ? 'fantasma' : 'secundario'} btn-chico ${n.piso ? 'mono' : ''}" data-puesto="${i}" ${n.agregar ? '' : 'disabled'}>${n.piso ? `${rotulo(n.piso, n.puesto)}${n.compartirPuesto ? ' (compartido)' : ''} ✎` : 'Elegir puesto'}</button></td>
          <td>${revisar(n.registro)}</td></tr>`).join('')) : ''}
      ${p.correoCambiado.length ? seccion('Posible correo cambiado', 'El nombre coincide con una persona de la app, pero el correo es otro. No se carga: si es la misma persona, corrija su correo en Personas y roles (Más → Corregir nombre o correo) y vuelva a cargar el archivo.',
        ['Persona', 'Correo en el archivo', 'Correo en la app'], p.correoCambiado.map(c => `<tr>
          <td><strong>${esc(c.nombre)}</strong><div class="sutil mono">${rotulo(c.piso, c.puesto)}</div></td><td>${esc(c.registro.correo)}</td><td>${esc(c.correoApp)}</td></tr>`).join('')) : ''}
      ${p.retiradas.length ? seccion('Retiradas en la app', 'Su correo es de una persona retirada. No se carga: si volvió al Despacho, reactívela en Personas y roles y vuelva a cargar el archivo.',
        ['Persona'], p.retiradas.map(r => `<tr><td>${persona(r.nombre, r.registro.correo)}</td></tr>`).join('')) : ''}
      ${p.ausentes.length ? seccion('En la app pero no en el archivo', 'No se retira a nadie. Si alguien ya no está en el Despacho, retírelo a mano en Personas y roles. Su contacto actual, si lo tiene, se conserva.',
        ['Persona', 'Ubicación'], p.ausentes.map(a => `<tr><td><strong>${esc(a.nombre)}</strong></td><td class="mono">${rotulo(a.piso, a.puesto)}</td></tr>`).join('')) : ''}`;
    const hayQueHacer = cargables.length > 0 || altas.length > 0;
    $('#acciones').classList.toggle('oculto', !hayQueHacer);
    $('#reviso').checked = false;
    $('#cargar').disabled = true;
  };

  $('#reviso').addEventListener('change', () => { $('#cargar').disabled = !$('#reviso').checked; });

  $('#elegir').addEventListener('click', async () => {
    const archivo = await elegirArchivo('.xlsx,.csv');
    if (!archivo) return;
    try {
      const r = await contacto.leerArchivo(archivo);
      const e = await consulta;
      avisos = r.avisos.concat(e ? [] : ['No se pudo saber quién tiene ya un contacto cargado: todos figuran como «Nuevo».']);
      previa = conciliar(r.registros, llave.personas(), e ? e.cargados : new Set());
      pintar();
    } catch (err) { aviso('No se pudo leer el archivo: ' + err.message, 'error'); }
  });

  // Personas nuevas: marcar o desmarcar «Agregar» y elegir el puesto en el mapa.
  $('#previa').addEventListener('change', ev => {
    const c = ev.target.closest('[data-agregar]');
    if (!c) return;
    previa.nuevas[Number(c.dataset.agregar)].agregar = c.checked;
    pintar();
  });
  $('#previa').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-puesto]');
    if (!b) return;
    const n = previa.nuevas[Number(b.dataset.puesto)];
    const r = await ventanaAgregar({ nombre: n.nombre || n.registro.nombre, correo: n.correo || n.registro.correo, titulo: 'Elegir el puesto de una persona nueva', textoBoton: 'Elegir este puesto' });
    if (!r) return;
    Object.assign(n, { nombre: r.nombre, correo: r.correo, piso: r.piso, puesto: r.puesto, compartirPuesto: r.compartirPuesto });
    pintar();
  });

  $('#cargar').addEventListener('click', async () => {
    if (!$('#reviso').checked) return aviso('Marque la casilla: confirme que revisó la comparación.', 'advertencia');
    const altas = previa.nuevas.filter(n => n.agregar);
    const sinPuesto = altas.filter(n => !n.piso);
    if (sinPuesto.length) return aviso('Elija el puesto de: ' + sinPuesto.map(n => n.nombre || n.registro.nombre).join(', ') + '.', 'error');
    // Dos personas nuevas en el mismo puesto: la segunda debe marcar «Compartir un puesto ocupado».
    const elegidos = new Map();
    for (const n of altas) {
      const k = rotulo(n.piso, n.puesto);
      if (elegidos.has(k) && !n.compartirPuesto) return aviso(`${n.nombre} y ${elegidos.get(k)} quedaron en el mismo puesto ${k}: elija otro o marque «Compartir un puesto ocupado».`, 'error');
      elegidos.set(k, n.nombre);
    }
    const emparejadas = previa.emparejadas.filter(e => tieneDatos(e.registro));
    const nuevasConDatos = altas.filter(n => tieneDatos(n.registro)).length;
    const reemplazan = emparejadas.filter(e => e.reemplaza).length;
    if (!await confirmar('Cargar contactos', esc(`${altas.length ? `Se agregarán ${altas.length} persona(s) nuevas, sin rol. ` : ''}Se cargará el contacto de ${emparejadas.length + nuevasConDatos} persona(s)${reemplazan ? `; ${reemplazan} ya tenían uno y se reemplaza` : ''}.`))) return;

    // 1. Altas. Cada una se guarda en el servidor al momento; si una falla, se detiene y se guarda la llave.
    let agregadas = 0;
    if (altas.length) {
      const capa = espera('Agregando personas nuevas…');
      try {
        for (const n of altas) {
          capa.texto(`Agregando personas nuevas (${agregadas + 1} de ${altas.length})…`);
          n.codigo = await personal.agregarPersona({ nombre: n.nombre, correo: n.correo, piso: n.piso, puesto: n.puesto, compartirPuesto: n.compartirPuesto });
          agregadas++;
          capa.progreso(agregadas / altas.length);
        }
      } catch (e) {
        capa.cerrar();
        aviso(`Se agregaron ${agregadas} de ${altas.length} personas y se detuvo: ${e.message}. No se cargó ningún contacto.`, 'error');
        if (agregadas) while (!await guardarLlave()) { /* se vuelve a pedir */ }
        return abrir('contactos');
      }
      capa.cerrar();
      // Los códigos nuevos solo quedan en la llave: se insiste hasta que quede guardada.
      while (!await guardarLlave()) { /* se vuelve a pedir */ }
    }

    // 2. Contactos, cifrados en este computador.
    const lista = emparejadas.map(e => ({ codigo: e.codigo, registro: e.registro }))
      .concat(altas.filter(n => n.codigo && tieneDatos(n.registro)).map(n => ({ codigo: n.codigo, registro: n.registro })))
      .map(x => ({ codigo: x.codigo, datos: datosDe(x.registro), salud: saludDe(x.registro) }));
    if (!lista.length) { aviso(`Se agregaron ${agregadas} persona(s). No había contactos para cargar.`, 'exito'); return abrir('contactos'); }
    const capa = espera('Cifrando y enviando los contactos…');
    try {
      const n = await contacto.cargarLote(lista, capa.progreso);
      capa.cerrar();
      aviso(`Se cargaron ${n} contacto(s)${agregadas ? ` y se agregaron ${agregadas} persona(s)` : ''}.`, 'exito');
      const sinLlave = contacto.destinatarios('').filter(p => !p.pub).length;
      if (sinLlave) aviso(`${sinLlave} persona(s) de la coordinación o de la brigada aún no tienen llave personal (no han ingresado): verán los contactos cuando ingresen y se actualicen los accesos.`, 'advertencia');
    } catch (e) {
      capa.cerrar();
      aviso(e.message, 'error');
    }
    sesion.refrescar().catch(() => {});
    abrir('contactos');
  });
}
