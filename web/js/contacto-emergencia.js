// Contacto de emergencia de cada persona (v0.12), cifrado en el navegador en dos bloques, cada uno con
// su propia llave aleatoria:
//  - «datos»: teléfono de la persona y su familiar (nombre, parentesco, teléfono);
//  - «salud»: EPS y ARL (si las hay).
// Las dos llaves se envuelven para la coordinación (administrador, coordinador y suplente), los brigadistas
// de TODOS los pisos y la propia persona, si tiene llave pública. El servidor solo ve texto cifrado: entrega
// a cada brigadista su piso (otro piso, con bitácora) y la EPS y la ARL solo durante una emergencia o simulacro.
import * as cripto from './cripto.js';
import * as sesion from './sesion.js';
import { leerXlsx } from './xlsx.js';
import { llamar, ErrorApi } from './api.js';
import { decodificarTexto, leerCsv, interpretarContactos } from './archivo-contactos.js';

const ROLES_COORDINACION = ['admin', 'coordinador', 'suplente'];
// El contexto amarra cada envoltorio a su registro y a su bloque: no se puede cambiar de lugar.
export const ctxDatos = codigo => 'contacto|' + codigo;
export const ctxSalud = codigo => 'contacto-salud|' + codigo;
const POR_ENVIO = 50;   // contactos por petición al servidor (el servidor admite hasta 500)

export const esCoordinacion = () => ROLES_COORDINACION.some(r => sesion.tieneRol(r));
export const listoParaUsar = () => !!sesion.llavePriv() && !!sesion.miPublica();

const activos = () => ((sesion.base() && sesion.base().personas) || []).filter(p => p.estado === 'activo');

// Quienes reciben la llave del contacto de «codigo»: coordinación, brigadistas de todos los pisos y la persona.
export const destinatarios = codigo => activos()
  .filter(p => p.codigo === codigo || (p.roles || []).some(r => ROLES_COORDINACION.includes(r) || r === 'brigadista'));

// Quienes aún no tienen llave pública (no han ingresado desde la v0.9) quedan fuera: cuando ingresen, la
// coordinación les agrega su envoltorio (fase 3).
async function envolver(personas, raw, contexto) {
  const mapa = {};
  for (const p of personas) if (p.pub) mapa[p.codigo] = await cripto.envolverPara(p.pub, raw, contexto);
  return mapa;
}

// Prepara lo que se envía al servidor para una persona: { codigo, datos, claves, salud?, clavesSalud? }.
export async function cifrarContacto(codigo, datos, salud) {
  const para = destinatarios(codigo);
  const d = cripto.nuevaLlaveDatos();
  const op = { codigo, datos: await cripto.cifrarJSON(await cripto.importarLlaveDatos(d), datos), claves: await envolver(para, d, ctxDatos(codigo)) };
  if (salud) {
    const s = cripto.nuevaLlaveDatos();
    op.salud = await cripto.cifrarJSON(await cripto.importarLlaveDatos(s), salud);
    op.clavesSalud = await envolver(para, s, ctxSalud(codigo));
  }
  return op;
}

// Carga varios contactos: lista = [{ codigo, datos, salud }]. Cifra todo primero y después envía en tandas.
// Cada tanda es todo o nada en el servidor; si una falla, el error dice cuántos quedaron cargados.
export async function cargar(lista, alAvanzar = () => {}) {
  if (!esCoordinacion()) throw new ErrorApi('Solo la coordinación y la administración pueden cargar contactos.', 'PERMISO');
  if (!listoParaUsar()) throw new ErrorApi('Cierre sesión y vuelva a ingresar para activar la protección de los datos.', 'LLAVE');
  const ops = [];
  for (let i = 0; i < lista.length; i++) {
    ops.push(await cifrarContacto(lista[i].codigo, lista[i].datos, lista[i].salud));
    alAvanzar(0.8 * (i + 1) / lista.length);
  }
  let cargados = 0;
  for (let i = 0; i < ops.length; i += POR_ENVIO) {
    try {
      cargados += (await llamar('cargarContactos', { ops: ops.slice(i, i + POR_ENVIO) })).n;
    } catch (e) {
      throw new ErrorApi(`${cargados ? `Se cargaron ${cargados} de ${ops.length} contactos y se detuvo la carga` : 'No se cargó ningún contacto'}: ${e.message}`, e.codigo || 'ERROR');
    }
    alAvanzar(0.8 + 0.2 * Math.min(ops.length, i + POR_ENVIO) / ops.length);
  }
  return cargados;
}

// Estado de la carga, sin datos personales: { cargados: Set de códigos con contacto, faltan: [códigos] }.
export async function estado() {
  const r = await llamar('contactos');
  return { cargados: new Set((r.contactos || []).map(c => c.codigo)), faltan: r.faltan || [] };
}

// Lee el archivo del área de personal (.xlsx o .csv). Del Excel usa la primera hoja que tenga la columna «Correo».
export async function leerArchivo(archivo) {
  const bytes = await archivo.arrayBuffer();
  if (/\.csv$/i.test(archivo.name) || /csv|text/.test(archivo.type || '')) return interpretarContactos(leerCsv(decodificarTexto(new Uint8Array(bytes))));
  const hojas = await leerXlsx(bytes);
  const conCorreo = hojas.find(h => h.filas.some(f => (f || []).some(c => /^(correo|e-?mail)/i.test(String(c || '').trim()))));
  return interpretarContactos((conCorreo || hojas[0] || { filas: [] }).filas);
}
