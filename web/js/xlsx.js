// Lector mínimo de archivos .xlsx, sin librerías externas. Se ejecuta solo en el
// navegador del administrador: el Excel nunca se sube a ningún servidor.
import { CONFIG } from '../config.js';
import { normalizarCorreo } from './cripto.js';

async function inflar(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function leerZip(buffer) {
  const v = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  let fin = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El archivo no parece un Excel (.xlsx) válido.');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const archivos = {};
  const nombre = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const largoNom = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoCom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const ruta = nombre.decode(u8.subarray(p + 46, p + 46 + largoNom));
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    archivos[ruta] = { metodo, datos: u8.subarray(inicio, inicio + tamComp) };
    p += 46 + largoNom + largoExtra + largoCom;
  }
  return async ruta => {
    const a = archivos[ruta];
    if (!a) return null;
    const bytes = a.metodo === 8 ? await inflar(a.datos) : a.datos;
    return new TextDecoder().decode(bytes);
  };
}

const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const textoDe = nodo => [...nodo.getElementsByTagName('t')].map(t => t.textContent).join('');

function columna(ref) {
  const letras = ref.replace(/\d+/g, '');
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

// Devuelve [{ nombre, filas: [[celda, celda…], …] }]
export async function leerXlsx(buffer) {
  const abrir = await leerZip(buffer);
  const compartidas = [];
  const ss = await abrir('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) compartidas.push(textoDe(si));

  const libro = xml(await abrir('xl/workbook.xml'));
  const rels = xml(await abrir('xl/_rels/workbook.xml.rels'));
  const destino = {};
  for (const r of rels.getElementsByTagName('Relationship')) destino[r.getAttribute('Id')] = r.getAttribute('Target');

  const hojas = [];
  for (const h of libro.getElementsByTagName('sheet')) {
    let ruta = destino[h.getAttribute('r:id')] || '';
    ruta = ruta.startsWith('/') ? ruta.slice(1) : 'xl/' + ruta.replace(/^\.\//, '');
    const contenido = await abrir(ruta);
    if (!contenido) continue;
    const filas = [];
    for (const fila of xml(contenido).getElementsByTagName('row')) {
      const i = Number(fila.getAttribute('r')) - 1;
      const celdas = [];
      for (const c of fila.getElementsByTagName('c')) {
        const tipo = c.getAttribute('t');
        const vNodo = c.getElementsByTagName('v')[0];
        let valor = vNodo ? vNodo.textContent : '';
        if (tipo === 's') valor = compartidas[Number(valor)] ?? '';
        else if (tipo === 'inlineStr') valor = textoDe(c);
        celdas[columna(c.getAttribute('r'))] = String(valor).trim();
      }
      filas[i] = celdas;
    }
    hojas.push({ nombre: h.getAttribute('name'), filas: Array.from(filas, f => f || []) });
  }
  return hojas;
}

// Interpreta el Excel de puestos: una hoja por piso (Piso2, Piso4…), con columnas
// de nombre, correo institucional y número de escritorio.
export function interpretarPlanta(hojas) {
  const filas = [];
  const avisos = [];
  for (const h of hojas) {
    const piso = Number((h.nombre.match(/\d+/) || [])[0]);
    if (!CONFIG.PISOS.includes(piso)) { avisos.push(`Se ignoró la hoja "${h.nombre}" (no es un piso del Despacho).`); continue; }
    const iCab = h.filas.findIndex(f => f.some(c => /correo|email/i.test(c || '')));
    if (iCab < 0) { avisos.push(`La hoja "${h.nombre}" no tiene una columna de correo.`); continue; }
    const cab = h.filas[iCab];
    const col = re => cab.findIndex(c => re.test(c || ''));
    const cNombre = col(/nombre/i), cCorreo = col(/correo|email/i), cPuesto = col(/escritorio|puesto/i);
    if (cNombre < 0 || cPuesto < 0) { avisos.push(`La hoja "${h.nombre}" no tiene columnas de nombre y escritorio.`); continue; }
    const vistos = new Set();
    for (const f of h.filas.slice(iCab + 1)) {
      const puesto = parseInt(f[cPuesto], 10);
      if (!Number.isInteger(puesto) || puesto <= 0) continue;
      if (vistos.has(puesto)) { avisos.push(`Piso ${piso}: el puesto ${puesto} aparece dos veces; se tomó el primero.`); continue; }
      vistos.add(puesto);
      const nombre = (f[cNombre] || '').replace(/\s+/g, ' ').trim();
      let correo = normalizarCorreo(f[cCorreo]);
      // Los correos de plantilla ("_____@cnsc.gov.co") cuentan como vacante.
      const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) && !correo.startsWith('_');
      if (!nombre || !valido) {
        if (nombre || (correo && !correo.startsWith('_'))) avisos.push(`Piso ${piso}, puesto ${puesto}: falta el nombre o el correo es inválido; queda como vacante.`);
        correo = '';
      }
      filas.push({ piso, puesto, nombre: correo ? nombre : '', correo });
    }
  }
  const correos = {};
  for (const f of filas.filter(x => x.correo)) {
    if (correos[f.correo]) avisos.push(`El correo ${f.correo} aparece en dos puestos (piso ${correos[f.correo]} y piso ${f.piso}).`);
    correos[f.correo] = f.piso;
  }
  filas.sort((a, b) => a.piso - b.piso || a.puesto - b.puesto);
  return { filas, avisos };
}
