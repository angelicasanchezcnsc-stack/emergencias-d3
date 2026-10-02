// Llave maestra (código → nombre, correo, celular). Vive solo en el computador del
// administrador, en un archivo cifrado con su frase. Nunca se sube al servidor:
// de aquí salen únicamente códigos, huellas y sobres cifrados.
import * as cripto from './cripto.js';
import { CONFIG } from '../config.js';

const NOMBRE_ARCHIVO = 'llave-emergencias-d3.d3llave';
let llave = null;
let frase = null;
let manejador = null;

export const abierta = () => !!llave;
export const personas = () => (llave ? llave.personas : []);
export const persona = codigo => personas().find(p => p.codigo === codigo);
export const ahoraIso = () => new Date().toISOString();

export function crear(fraseNueva) {
  llave = {
    version: 1, creada: ahoraIso(), actualizada: ahoraIso(),
    claves: { dir: cripto.aB64(cripto.nuevaLlaveDatos()) },
    siguiente: 1, personas: [], puestos: []
  };
  frase = fraseNueva;
  manejador = null;
}

export async function abrirArchivo(archivo, fraseIngresada, handle = null) {
  let contenido;
  try { contenido = JSON.parse(await archivo.text()); }
  catch { throw new Error('El archivo no es una llave de EMERGENCIAS D3.'); }
  llave = await cripto.descifrarConFrase(fraseIngresada, contenido);
  frase = fraseIngresada;
  manejador = handle;
}

export function cerrar() { llave = null; frase = null; manejador = null; }

// Copia para deshacer si el servidor rechaza un cambio.
export const instantanea = () => JSON.stringify(llave);
export const restaurar = copia => { llave = JSON.parse(copia); };

async function escribirEn(handle, contenido) {
  const w = await handle.createWritable();
  await w.write(contenido);
  await w.close();
}

// Guarda la llave cifrada. En Edge o Chrome de escritorio escribe sobre el mismo
// archivo; en otros navegadores la descarga.
export async function guardar() {
  llave.actualizada = ahoraIso();
  const contenido = JSON.stringify(await cripto.cifrarConFrase(frase, llave));
  if (manejador) { await escribirEn(manejador, contenido); return 'archivo'; }
  if (window.showSaveFilePicker) {
    manejador = await window.showSaveFilePicker({
      suggestedName: NOMBRE_ARCHIVO,
      types: [{ description: 'Llave EMERGENCIAS D3', accept: { 'application/octet-stream': ['.d3llave'] } }]
    });
    await escribirEn(manejador, contenido);
    return 'archivo';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: 'application/octet-stream' }));
  a.download = NOMBRE_ARCHIVO;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'descarga';
}

const llaveDir = () => cripto.importarLlaveDatos(cripto.deB64(llave.claves.dir));

// Comprueba que la llave abierta corresponde al directorio publicado en el servidor.
export async function corresponde(directorioServidor) {
  if (!directorioServidor) return true;
  try { await cripto.descifrarJSON(await llaveDir(), directorioServidor.datos); return true; }
  catch { return false; }
}

// Sobre del directorio: nombres de las personas activas y celulares de quienes lo tienen registrado.
export async function sobreDirectorio() {
  const lista = {};
  for (const p of llave.personas.filter(x => x.estado === 'activo')) {
    lista[p.codigo] = p.celular ? { n: p.nombre, c: p.celular } : { n: p.nombre };
  }
  return cripto.cifrarJSON(await llaveDir(), { generado: ahoraIso(), personas: lista });
}

// Contenido inicial (contactos, recomendaciones y rutas) cifrado con la llave del directorio.
export async function sobresIniciales(semillas) {
  const llaveDatos = await llaveDir();
  const salida = {};
  for (const [nombre, crear] of Object.entries(semillas)) salida[nombre] = await cripto.cifrarJSON(llaveDatos, crear());
  return salida;
}

function nuevoCodigo() {
  const codigo = CONFIG.PREFIJO_CODIGO + String(llave.siguiente).padStart(3, '0');
  llave.siguiente += 1;
  return codigo;
}

// Genera una contraseña temporal y el material que el servidor necesita.
async function credencialesPara(p, exigirCambio) {
  const clave = cripto.claveTemporal();
  const cred = await cripto.credenciales(p.correo, clave);
  p.claveTemporal = clave;
  p.entregada = false;
  p.hashCorreo = cred.hashCorreo;
  return {
    hashCorreo: cred.hashCorreo,
    verificador: cred.verificador,
    sobres: { dir: await cripto.cifrar(cred.envoltura, cripto.deB64(llave.claves.dir)) },
    debeCambiar: !!exigirCambio
  };
}

// Compara el Excel con la llave y clasifica cada cambio antes de aplicarlo.
export function compararExcel(filas) {
  const cambios = [];
  const usadas = new Set();
  const correosNuevos = new Set(filas.filter(f => f.correo).map(f => f.correo));
  for (const f of filas.filter(x => x.correo)) {
    let p = llave.personas.find(x => x.correo === f.correo);
    if (p) {
      usadas.add(p.codigo);
      const movida = p.piso !== f.piso || p.puesto !== f.puesto || p.nombre !== f.nombre;
      const tipo = p.estado !== 'activo' ? 'reactivar' : movida ? 'cambio' : 'igual';
      cambios.push({ tipo, codigo: p.codigo, fila: f, antes: { ...p } });
      continue;
    }
    // Mismo puesto con un correo que ya no aparece: se interpreta como corrección del correo.
    p = llave.personas.find(x => x.estado === 'activo' && x.piso === f.piso && x.puesto === f.puesto &&
      !correosNuevos.has(x.correo) && !usadas.has(x.codigo));
    if (p) {
      usadas.add(p.codigo);
      cambios.push({ tipo: 'correo', codigo: p.codigo, fila: f, antes: { ...p } });
      continue;
    }
    cambios.push({ tipo: 'nueva', codigo: null, fila: f, antes: null });
  }
  for (const p of llave.personas.filter(x => x.estado === 'activo' && !usadas.has(x.codigo))) {
    cambios.push({ tipo: 'retiro', codigo: p.codigo, fila: null, antes: { ...p } });
  }
  return cambios;
}

// Aplica los cambios a la llave y devuelve lo que se envía al servidor (sin datos personales).
export async function aplicarExcel(filas, cambios, { exigirCambio = false, alAvanzar = () => {} } = {}) {
  const items = [];
  const conCredencial = cambios.filter(c => c.tipo === 'nueva' || c.tipo === 'correo').length || 1;
  let hechas = 0;
  for (const c of cambios) {
    const f = c.fila;
    if (c.tipo === 'nueva') {
      const p = { codigo: nuevoCodigo(), nombre: f.nombre, correo: f.correo, piso: f.piso, puesto: f.puesto,
        estado: 'activo', celular: '', claveTemporal: '', entregada: false, hashCorreo: '' };
      llave.personas.push(p);
      c.codigo = p.codigo;
      items.push({ codigo: p.codigo, piso: p.piso, puesto: p.puesto, estado: 'activo', ...(await credencialesPara(p, exigirCambio)) });
      alAvanzar(++hechas / conCredencial);
    } else if (c.tipo === 'correo') {
      const p = persona(c.codigo);
      Object.assign(p, { correo: f.correo, nombre: f.nombre, piso: f.piso, puesto: f.puesto });
      items.push({ codigo: p.codigo, piso: p.piso, puesto: p.puesto, estado: 'activo', ...(await credencialesPara(p, exigirCambio)) });
      alAvanzar(++hechas / conCredencial);
    } else if (c.tipo === 'cambio' || c.tipo === 'reactivar') {
      const p = persona(c.codigo);
      Object.assign(p, { nombre: f.nombre, piso: f.piso, puesto: f.puesto, estado: 'activo' });
      items.push({ codigo: p.codigo, piso: p.piso, puesto: p.puesto, estado: 'activo' });
    } else if (c.tipo === 'retiro') {
      persona(c.codigo).estado = 'inactivo';
      items.push({ codigo: c.codigo, estado: 'inactivo' });
    }
  }
  llave.puestos = filas.map(f => ({ piso: f.piso, puesto: f.puesto, estado: f.correo ? 'ocupado' : 'vacante' }));
  return { items, puestos: llave.puestos };
}

// Nueva contraseña temporal para una persona. Devuelve los datos para el servidor.
export async function nuevaClave(codigo, exigirCambio) {
  const p = persona(codigo);
  const cred = await credencialesPara(p, exigirCambio);
  return { codigo, ...cred };
}

export function marcarEntregada(codigo) {
  const p = persona(codigo);
  if (p) { p.entregada = true; p.claveTemporal = ''; }
}

export function fijarCelular(codigo, celular) {
  const p = persona(codigo);
  if (p) p.celular = String(celular || '').replace(/[^\d+ ]/g, '').trim();
}
