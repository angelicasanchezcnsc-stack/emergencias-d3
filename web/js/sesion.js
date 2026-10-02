// Sesión de la persona: ingreso, copia local de la base y apertura del sobre
// del directorio (nombres). Los nombres solo existen descifrados en memoria.
import * as cripto from './cripto.js';
import * as almacen from './almacen.js';
import { llamar, fijarToken, ErrorApi } from './api.js';

const estado = { token: null, perfil: null, base: null, llaveDir: null, llavePriv: null, directorio: null, correo: '' };

export const perfil = () => estado.perfil;
export const base = () => estado.base;
export const activa = () => !!estado.token;
export const correoGuardado = () => estado.correo;
export const tieneRol = r => !!estado.perfil && estado.perfil.roles.includes(r);
export const llaveDir = () => estado.llaveDir;
export const llavePriv = () => estado.llavePriv;

// Mi llave pública tal como la guarda el servidor (la que usan los demás para enviarme datos).
export const miPublica = () => {
  const yo = estado.base && (estado.base.personas || []).find(p => p.codigo === (estado.perfil && estado.perfil.codigo));
  return (yo && yo.pub) || '';
};

export function nombreDe(codigo) {
  const d = estado.directorio && estado.directorio.personas[codigo];
  return d ? d.n : codigo;
}
export const celularDe = codigo => (estado.directorio && estado.directorio.personas[codigo] || {}).c || '';

async function abrirDirectorio() {
  estado.directorio = null;
  const dir = estado.base && estado.base.directorio;
  if (!dir || !estado.llaveDir) return;
  try {
    estado.directorio = await cripto.descifrarJSON(estado.llaveDir, dir.datos);
  } catch {
    console.warn('No se pudo abrir el sobre del directorio con la llave de esta sesión.');
  }
}

export async function restaurar() {
  estado.correo = (await almacen.leer('correo')) || '';
  const token = await almacen.leer('token');
  if (!token) return false;
  estado.token = token;
  fijarToken(token);
  estado.perfil = await almacen.leer('perfil');
  estado.base = await almacen.leer('base');
  estado.llaveDir = await almacen.leer('llaveDir');
  estado.llavePriv = (await almacen.leer('llavePriv')) || null;
  await abrirDirectorio();
  return true;
}

// Prepara la llave privada de la persona: la abre si ya existe o crea el par la primera vez.
// Si algo falla (por ejemplo, un servidor más antiguo), la sesión sigue sin caracterización.
async function prepararPar(cred, perfil) {
  estado.llavePriv = null;
  try {
    let bytes;
    if (perfil.sobres && perfil.sobres.priv) {
      bytes = await cripto.descifrar(cred.envoltura, perfil.sobres.priv);
    } else {
      const par = await cripto.generarPar();
      bytes = await cripto.exportarPrivada(par.privateKey);
      await llamar('registrarPar', { pub: await cripto.exportarPublica(par.publicKey), priv: await cripto.cifrar(cred.envoltura, bytes) });
    }
    estado.llavePriv = await cripto.importarPrivada(bytes, false);   // no exportable
    await almacen.guardar('llavePriv', estado.llavePriv);
  } catch (e) {
    console.warn('No se pudo preparar la llave personal:', e && e.message);
  }
}

const oyentesRefresco = [];
export const alRefrescar = fn => oyentesRefresco.push(fn);
export const guardarBase = () => estado.base && almacen.guardar('base', estado.base);

// Trae la base del servidor. Sin conexión, se queda con la copia local.
export async function refrescar() {
  try {
    const b = await llamar('base');
    estado.base = b;
    estado.perfil = b.perfil;
    await abrirDirectorio();
    oyentesRefresco.forEach(fn => fn());
    await almacen.guardar('base', b);
    await almacen.guardar('perfil', b.perfil);
    return true;
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === 'SESION') { await salir(true); throw e; }
    return false;
  }
}

export async function ingresar(correo, clave) {
  const cred = await cripto.credenciales(correo, clave);
  const r = await llamar('ingresar', { hashCorreo: cred.hashCorreo, verificador: cred.verificador });
  if (!r || !r.token || !r.perfil) throw new ErrorApi('El servidor dio una respuesta inesperada. Intente de nuevo en unos segundos.', 'DATOS');
  estado.token = r.token;
  estado.perfil = r.perfil;
  fijarToken(r.token);
  estado.llaveDir = null;
  if (r.perfil.sobres && r.perfil.sobres.dir) {
    const raw = await cripto.descifrar(cred.envoltura, r.perfil.sobres.dir);
    estado.llaveDir = await cripto.importarLlaveDatos(raw);
  }
  estado.correo = cripto.normalizarCorreo(correo);
  await almacen.guardar('token', r.token);
  await almacen.guardar('perfil', r.perfil);
  await almacen.guardar('correo', estado.correo);
  if (estado.llaveDir) await almacen.guardar('llaveDir', estado.llaveDir);
  await prepararPar(cred, r.perfil);
  await refrescar();
  dispatchEvent(new CustomEvent('sesion-iniciada'));
  return estado.perfil;
}

export async function cambiarClave(actual, nueva) {
  const credA = await cripto.credenciales(estado.correo, actual);
  const credN = await cripto.credenciales(estado.correo, nueva);
  const sobresNuevos = {};
  if (estado.perfil.sobres && estado.perfil.sobres.dir) {
    let raw;
    try { raw = await cripto.descifrar(credA.envoltura, estado.perfil.sobres.dir); }
    catch { throw new ErrorApi('La contraseña actual no es correcta.', 'CREDENCIALES'); }
    sobresNuevos.dir = await cripto.cifrar(credN.envoltura, raw);
  }
  // La llave privada también se vuelve a cifrar con la contraseña nueva.
  if (estado.perfil.sobres && estado.perfil.sobres.priv) {
    let priv;
    try { priv = await cripto.descifrar(credA.envoltura, estado.perfil.sobres.priv); }
    catch { throw new ErrorApi('La contraseña actual no es correcta.', 'CREDENCIALES'); }
    sobresNuevos.priv = await cripto.cifrar(credN.envoltura, priv);
  }
  const r = await llamar('cambiarClave', {
    verificadorActual: credA.verificador, verificadorNuevo: credN.verificador, sobresNuevos
  });
  estado.perfil = r.perfil;
  await almacen.guardar('perfil', r.perfil);
}

export async function salir(sinServidor = false) {
  if (!sinServidor) { try { await llamar('salir'); } catch { /* sin conexión: se borra igual */ } }
  const correo = estado.correo;
  await almacen.limpiar();
  if (correo) await almacen.guardar('correo', correo);
  Object.assign(estado, { token: null, perfil: null, base: null, llaveDir: null, llavePriv: null, directorio: null });
  fijarToken(null);
  dispatchEvent(new CustomEvent('sesion-cerrada'));
}
