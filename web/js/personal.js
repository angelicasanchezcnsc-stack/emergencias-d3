// Gestión del personal desde la app: mover, intercambiar, compartir puesto, agregar, corregir datos,
// retirar y reactivar. Es solo lógica, sin interfaz.
//
// Cada función:
//  1. exige la llave maestra abierta (sin ella no hay nombres ni correos con qué trabajar);
//  2. prepara los ítems para «guardarPadron» (la misma acción que usa el Excel) y la actualiza;
//  3. envía también el directorio cifrado al día (altas, retiros y nombres corregidos);
//  4. solo si el servidor acepta, anota el cambio en el historial de la llave (sin nombres ni correos) y lo
//     aplica en la copia de la base de este equipo;
//  5. NO guarda el archivo de la llave: eso lo hace la pantalla con guardarLlave().
// Si el servidor rechaza, la llave vuelve a como estaba (llave.restaurar).
import * as llave from './llave.js';
import * as sesion from './sesion.js';
import * as cripto from './cripto.js';
import { llamar } from './api.js';

const rotulo = (piso, puesto) => `P${piso}-${puesto}`;
const activas = () => (sesion.base().personas || []).filter(p => p.estado === 'activo');
const quien = () => (sesion.perfil() && sesion.perfil().codigo) || '';
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Consultas (las usa la pantalla) ----------

// Personas activas en un puesto (sin contar a «excepto»).
export const ocupantesDe = (piso, puesto, excepto = null) =>
  activas().filter(p => p.piso === piso && p.puesto === puesto && p.codigo !== excepto);

export const puestoDe = (piso, puesto) => (sesion.base().puestos || []).find(x => x.piso === piso && x.puesto === puesto) || null;

const NOMBRES_DIAS = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábados', 7: 'domingos' };

// Días presenciales de una agenda guardada: '' = lunes a viernes; 'ocasional' = ninguno; o días ISO.
export const diasDeAgenda = agenda => {
  const a = String(agenda == null ? '' : agenda).trim();
  return a === '' ? [1, 2, 3, 4, 5] : a === 'ocasional' ? [] : a.split(',').map(Number).filter(n => n >= 1 && n <= 7);
};

// Días de la semana en los que las dos agendas coinciden, en orden.
export const diasEnComun = (agendaA, agendaB) => {
  const b = new Set(diasDeAgenda(agendaB));
  return diasDeAgenda(agendaA).filter(d => b.has(d));
};

// «lunes y miércoles» / «lunes, martes y viernes»
export function textoDias(dias) {
  const nombres = dias.map(d => NOMBRES_DIAS[d]);
  return nombres.length <= 1 ? nombres.join('') : nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}

// Aviso al compartir un puesto: ¿coinciden los días presenciales de la persona con los de quienes ya lo ocupan?
// Devuelve el texto del aviso o '' si no hay cruce.
export function avisoCruce(codigo, piso, puesto) {
  const base = sesion.base();
  const yo = base.personas.find(p => p.codigo === codigo);
  const otras = ocupantesDe(piso, puesto, codigo);
  if (!yo || !otras.length) return '';
  const dias = new Set();
  otras.forEach(o => diasEnComun(yo.agenda, o.agenda).forEach(d => dias.add(d)));
  if (!dias.size) return '';
  const lista = textoDias([...dias].sort((a, b) => a - b));
  return otras.length === 1
    ? `Ambas personas figuran en la sede los ${lista}: el puesto quedaría con dos personas esos días.`
    : `Esta persona y quienes ya ocupan el puesto figuran en la sede los ${lista}: el puesto quedaría con más de una persona esos días.`;
}

// ---------- Utilidades internas ----------

function exigirLlave() {
  if (!llave.abierta()) throw new Error('Abra primero la llave maestra.');
}

function enLlave(codigo) {
  const p = llave.persona(codigo);
  if (!p) throw new Error('Esta persona no está en la llave abierta.');
  return p;
}

// El puesto debe existir en la planta y poder asignarse.
function exigirPuesto(piso, puesto) {
  const x = puestoDe(piso, puesto);
  if (!x) throw new Error(`El puesto ${rotulo(piso, puesto)} no existe en la planta.`);
  if (x.asignable === false) throw new Error(`El puesto ${rotulo(piso, puesto)} no se puede asignar.`);
  return x;
}

// Ejecuta un cambio y, si algo falla, deja la llave como estaba.
async function transaccion(fn) {
  exigirLlave();
  const copia = llave.instantanea();
  try { return await fn(); } catch (e) { llave.restaurar(copia); throw e; }
}

async function enviar(items) {
  await llamar('guardarPadron', { personas: items, sobreDirectorio: await llave.sobreDirectorio() });
}

// Regla del estado de un puesto (igual que en el servidor): 0 = vacante, 1 = ocupado, 2 o más = compartido.
function recalcularLocal() {
  const cuantas = {};
  activas().forEach(p => { const k = rotulo(p.piso, p.puesto); cuantas[k] = (cuantas[k] || 0) + 1; });
  const estadoDe = x => { const n = cuantas[rotulo(x.piso, x.puesto)] || 0; return n === 0 ? 'vacante' : n === 1 ? 'ocupado' : 'compartido'; };
  (sesion.base().puestos || []).forEach(x => { x.estado = estadoDe(x); });
  llave.puestos().forEach(x => { x.estado = estadoDe(x); });
}

function enBase(codigo, cambios) {
  const p = sesion.base().personas.find(x => x.codigo === codigo);
  if (p) Object.assign(p, cambios);
  const yo = sesion.perfil();
  if (yo && yo.codigo === codigo) {
    ['piso', 'puesto'].forEach(c => { if (cambios[c] !== undefined) yo[c] = cambios[c]; });
  }
}

// Cierra un cambio aceptado por el servidor: historial, copia local y, en segundo plano o esperando,
// la base nueva del servidor (cuando hay nombres nuevos hay que esperarla para que se vean).
async function cerrar(que, { esperar = false } = {}) {
  llave.registrarCambio(quien(), que);
  recalcularLocal();
  sesion.guardarBase();
  const refresco = sesion.refrescar().catch(() => {});
  if (esperar) await refresco;
}

// ---------- Cambios de puesto ----------

function exigirDistinto(codigo, piso, puesto) {
  const p = enLlave(codigo);
  if (p.piso === piso && p.puesto === puesto) throw new Error('La persona ya está en ese puesto.');
  return p;
}

// Pasa a una persona a un puesto libre.
export async function moverPersona(codigo, piso, puesto) {
  return transaccion(async () => {
    const p = exigirDistinto(codigo, piso, puesto);
    exigirPuesto(piso, puesto);
    const ocupa = ocupantesDe(piso, puesto, codigo);
    if (ocupa.length) throw new Error(`El puesto ${rotulo(piso, puesto)} ya está ocupado: intercambie los puestos o compártalo.`);
    const antes = rotulo(p.piso, p.puesto);
    Object.assign(p, { piso, puesto });
    await enviar([{ codigo, piso, puesto }]);
    enBase(codigo, { piso, puesto });
    await cerrar(`${codigo} de ${antes} a ${rotulo(piso, puesto)}`);
  });
}

// Cruza los puestos de dos personas.
export async function intercambiar(codigoA, codigoB) {
  return transaccion(async () => {
    if (codigoA === codigoB) throw new Error('Elija dos personas distintas.');
    const a = enLlave(codigoA), b = enLlave(codigoB);
    const pa = { piso: a.piso, puesto: a.puesto }, pb = { piso: b.piso, puesto: b.puesto };
    Object.assign(a, pb);
    Object.assign(b, pa);
    await enviar([{ codigo: codigoA, ...pb }, { codigo: codigoB, ...pa }]);
    enBase(codigoA, pb);
    enBase(codigoB, pa);
    await cerrar(`Intercambio de ${codigoA} (${rotulo(pa.piso, pa.puesto)}) y ${codigoB} (${rotulo(pb.piso, pb.puesto)})`);
  });
}

// Pasa a una persona a un puesto que ya tiene a alguien: queda compartido.
export async function compartir(codigo, piso, puesto) {
  return transaccion(async () => {
    const p = exigirDistinto(codigo, piso, puesto);
    exigirPuesto(piso, puesto);
    if (!ocupantesDe(piso, puesto, codigo).length) throw new Error(`El puesto ${rotulo(piso, puesto)} está libre: mueva a la persona.`);
    const antes = rotulo(p.piso, p.puesto);
    Object.assign(p, { piso, puesto });
    await enviar([{ codigo, piso, puesto }]);
    enBase(codigo, { piso, puesto });
    await cerrar(`${codigo} de ${antes} comparte ${rotulo(piso, puesto)}`);
  });
}

// ---------- Altas, correcciones, retiros y reactivaciones ----------

const correoUsado = (correo, excepto = null) => llave.personas().some(p => p.codigo !== excepto && cripto.normalizarCorreo(p.correo) === correo);

// Persona nueva: queda sin rol (sin acceso). Tiene una contraseña temporal en la llave por si después se le da un rol.
export async function agregarPersona({ nombre, correo, piso, puesto, compartirPuesto = false }) {
  return transaccion(async () => {
    const n = String(nombre || '').trim();
    const c = cripto.normalizarCorreo(correo);
    if (!n) throw new Error('Escriba el nombre completo.');
    if (!FORMATO_CORREO.test(c)) throw new Error('El correo no tiene un formato válido.');
    if (correoUsado(c)) throw new Error('Ese correo ya está en la llave (de una persona activa o retirada).');
    exigirPuesto(piso, puesto);
    if (ocupantesDe(piso, puesto).length && !compartirPuesto) throw new Error(`El puesto ${rotulo(piso, puesto)} ya está ocupado.`);
    const exigir = !!(sesion.base().config && sesion.base().config.exigirCambioInicial);
    const persona = { codigo: llave.nuevoCodigo(), nombre: n, correo: c, piso, puesto, estado: 'activo', celular: '', claveTemporal: '', entregada: false, hashCorreo: '' };
    llave.personas().push(persona);
    const credenciales = await llave.credencialesPara(persona, exigir);
    await enviar([{ codigo: persona.codigo, piso, puesto, estado: 'activo', ...credenciales }]);
    sesion.base().personas.push({ codigo: persona.codigo, piso, puesto, estado: 'activo', roles: [], pisoBrigada: null, pub: '', agenda: '' });
    await cerrar(`Alta de ${persona.codigo} en ${rotulo(piso, puesto)}`, { esperar: true });
    return persona.codigo;
  });
}

// Corrige el nombre o el correo. Con un correo nuevo se genera una contraseña temporal nueva, como al corregir el correo en el Excel.
export async function corregirDatos(codigo, { nombre, correo } = {}) {
  return transaccion(async () => {
    const p = enLlave(codigo);
    const item = { codigo };
    let cambioNombre = false, cambioCorreo = false;
    if (nombre !== undefined && String(nombre).trim() !== p.nombre) {
      const n = String(nombre).trim();
      if (!n) throw new Error('Escriba el nombre completo.');
      p.nombre = n; cambioNombre = true;
    }
    if (correo !== undefined && cripto.normalizarCorreo(correo) !== cripto.normalizarCorreo(p.correo)) {
      const c = cripto.normalizarCorreo(correo);
      if (!FORMATO_CORREO.test(c)) throw new Error('El correo no tiene un formato válido.');
      if (correoUsado(c, codigo)) throw new Error('Ese correo ya está en la llave (de otra persona).');
      p.correo = c; cambioCorreo = true;
      const exigir = !!(sesion.base().config && sesion.base().config.exigirCambioInicial);
      Object.assign(item, await llave.credencialesPara(p, exigir));
    }
    if (!cambioNombre && !cambioCorreo) throw new Error('No hay nada que corregir.');
    await enviar([item]);
    await cerrar(`Corrección de ${[cambioNombre ? 'nombre' : '', cambioCorreo ? 'correo' : ''].filter(Boolean).join(' y ')} de ${codigo}`, { esperar: cambioNombre });
    return { nombre: cambioNombre, correo: cambioCorreo };
  });
}

// Deja a la persona inactiva: sale de las listas y se borra su caracterización. Se puede reactivar.
export async function retirarPersona(codigo) {
  return transaccion(async () => {
    const p = enLlave(codigo);
    if (codigo === quien()) throw new Error('No puede retirarse a sí misma: pídale a otro administrador que lo haga.');
    if (p.estado !== 'activo') throw new Error('La persona ya está retirada.');
    p.estado = 'inactivo';
    await enviar([{ codigo, estado: 'inactivo' }]);
    enBase(codigo, { estado: 'inactivo' });
    await cerrar(`Retiro de ${codigo}`);
  });
}

// Vuelve a dejar activa a una persona retirada, en el puesto que se elija.
export async function reactivarPersona(codigo, piso, puesto) {
  return transaccion(async () => {
    const p = enLlave(codigo);
    if (p.estado === 'activo') throw new Error('La persona ya está activa.');
    exigirPuesto(piso, puesto);
    Object.assign(p, { estado: 'activo', piso, puesto });
    await enviar([{ codigo, estado: 'activo', piso, puesto }]);
    const publica = sesion.base().personas.find(x => x.codigo === codigo);
    if (publica) Object.assign(publica, { estado: 'activo', piso, puesto });
    await cerrar(`Reactivación de ${codigo} en ${rotulo(piso, puesto)}`, { esperar: true });
  });
}
