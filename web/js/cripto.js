// Seudonimización y cifrado. Todo ocurre en el navegador con WebCrypto:
// el servidor nunca recibe correos, contraseñas ni nombres en claro.
import { CONFIG } from '../config.js';

const cod = new TextEncoder();
const decod = new TextDecoder();

export const aHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export function aB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pbkdf2(texto, sal, iteraciones = CONFIG.ITERACIONES) {
  const base = await crypto.subtle.importKey('raw', cod.encode(texto), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: cod.encode(sal), iterations: iteraciones }, base, 256);
}

export const normalizarCorreo = c => String(c || '').trim().toLowerCase();

// Huella del correo: es lo único que el servidor conoce de la persona para el ingreso.
export async function hashCorreo(correo) {
  return aHex(await pbkdf2(normalizarCorreo(correo), 'D3E|correo|' + CONFIG.SAL_PUBLICA));
}

// A partir de correo y contraseña salen dos valores independientes:
// - el verificador, que el servidor compara para permitir el ingreso;
// - la llave de envoltura, que abre los sobres y nunca sale del celular.
export async function credenciales(correo, clave) {
  const hc = await hashCorreo(correo);
  const [ver, bitsEnv] = await Promise.all([
    pbkdf2(clave, 'D3E|acceso|' + hc),
    pbkdf2(clave, 'D3E|sobre|' + hc)
  ]);
  const envoltura = await crypto.subtle.importKey('raw', bitsEnv, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { hashCorreo: hc, verificador: aHex(ver), envoltura };
}

export async function cifrar(llave, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, bytes));
  const salida = new Uint8Array(12 + ct.length);
  salida.set(iv);
  salida.set(ct, 12);
  return aB64(salida);
}

export async function descifrar(llave, b64) {
  const d = deB64(b64);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: d.slice(0, 12) }, llave, d.slice(12)));
}

export const cifrarJSON = async (llave, obj) => cifrar(llave, cod.encode(JSON.stringify(obj)));
export const descifrarJSON = async (llave, b64) => JSON.parse(decod.decode(await descifrar(llave, b64)));

// Llave de datos de un sobre (32 bytes aleatorios).
export const nuevaLlaveDatos = () => crypto.getRandomValues(new Uint8Array(32));

export const importarLlaveDatos = raw =>
  crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

// Contraseña temporal legible (sin 0/O, 1/l/I).
export function claveTemporal(largo = 10) {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint32Array(largo))].map(x => alfabeto[x % alfabeto.length]).join('');
}

// Archivo de la llave maestra: cifrado con una frase que solo conoce el administrador.
export async function cifrarConFrase(frase, obj) {
  const sal = aB64(crypto.getRandomValues(new Uint8Array(16)));
  const k = await crypto.subtle.importKey('raw', await pbkdf2(frase, 'D3E|llave|' + sal, 250000),
    'AES-GCM', false, ['encrypt']);
  return { formato: 'D3E-LLAVE', version: 1, sal, datos: await cifrarJSON(k, obj) };
}

export async function descifrarConFrase(frase, archivo) {
  if (!archivo || archivo.formato !== 'D3E-LLAVE') throw new Error('El archivo no es una llave de EMERGENCIAS D3.');
  const k = await crypto.subtle.importKey('raw', await pbkdf2(frase, 'D3E|llave|' + archivo.sal, 250000),
    'AES-GCM', false, ['decrypt']);
  try {
    return await descifrarJSON(k, archivo.datos);
  } catch {
    throw new Error('La frase de la llave no es correcta.');
  }
}

// Valida una contraseña nueva contra las reglas que define el administrador.
export function validarClave(clave, reglas = {}) {
  const fallas = [];
  if ((reglas.minimo || 0) > 0 && clave.length < reglas.minimo) fallas.push(`mínimo ${reglas.minimo} caracteres`);
  if (reglas.mayuscula && !/[A-ZÁÉÍÓÚÑ]/.test(clave)) fallas.push('una mayúscula');
  if (reglas.numero && !/\d/.test(clave)) fallas.push('un número');
  if (reglas.simbolo && !/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(clave)) fallas.push('un símbolo');
  if (!clave) fallas.push('no puede estar vacía');
  return fallas;
}
