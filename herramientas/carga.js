// Prueba de carga contra el servidor de PRUEBA (nunca contra el real), con cuentas ficticias.
// Simula celulares «lectores» (pulso cada 15 s con retardo aleatorio y el estado completo cuando cambia la
// versión) y «brigadistas» (una marca cada 5 s a una persona al azar). Mide por acción: cantidad, errores y
// tiempos (mediana y percentil 95). Al final compara la última marca enviada a cada persona con la que quedó
// en el servidor (marcas perdidas). No usa la cola ni IndexedDB de la app: peticiones directas, como api.js.
import { CONFIG, URL_REAL } from '../web/config.js';
import { credenciales } from '../web/js/cripto.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dormir = ms => new Promise(r => setTimeout(r, ms));
const alAzar = lista => lista[Math.floor(Math.random() * lista.length)];

$('url').value = CONFIG.URL_SERVIDOR_PRUEBA || '';

let url = '';
let corriendo = false;
let estadisticas = new Map();   // acción -> { n, errores: { codigo: n }, tiempos: [] }

function registrar(accion, ms, codigo) {
  if (!estadisticas.has(accion)) estadisticas.set(accion, { n: 0, errores: {}, tiempos: [] });
  const s = estadisticas.get(accion);
  s.n++;
  s.tiempos.push(ms);
  if (codigo !== 'OK') s.errores[codigo] = (s.errores[codigo] || 0) + 1;
}

// Misma forma de petición que web/js/api.js. Una respuesta de doGet significa que Google perdió la de la acción.
async function peticion(accion, datos) {
  const t0 = performance.now();
  let codigo = 'OK', res = null;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion, ...datos, idPeticion: crypto.randomUUID() }) });
    if (!r.ok) codigo = 'HTTP ' + r.status;
    else {
      try {
        res = await r.json();
        if (!res.ok) codigo = res.codigo || 'ERROR';
        else if (res.datos && res.datos.servicio && !('inicializado' in res.datos)) codigo = 'RESPUESTA PERDIDA';
      } catch { codigo = 'NO ES JSON'; }
    }
  } catch { codigo = 'RED'; }
  registrar(accion, performance.now() - t0, codigo);
  return codigo === 'OK' ? res.datos : null;
}

const percentil = (lista, p) => {
  if (!lista.length) return 0;
  const o = [...lista].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(p * o.length))];
};
const seg = ms => (ms / 1000).toFixed(2) + ' s';

function filas() {
  return [...estadisticas.entries()].map(([accion, s]) => {
    const err = Object.values(s.errores).reduce((a, b) => a + b, 0);
    return { accion, n: s.n, err, pct: s.n ? (err * 100 / s.n) : 0, p50: percentil(s.tiempos, 0.5), p95: percentil(s.tiempos, 0.95), detalle: Object.entries(s.errores).map(([c, n]) => `${c}: ${n}`).join(', ') };
  });
}

function pintarTabla() {
  $('tabla').innerHTML = `<table><thead><tr><th>Acción</th><th>Peticiones</th><th>Errores</th><th>Mediana</th><th>Percentil 95</th><th>Detalle de errores</th></tr></thead>
    <tbody>${filas().map(f => `<tr><td>${esc(f.accion)}</td><td>${f.n}</td><td>${f.err} (${f.pct.toFixed(1)} %)</td><td>${seg(f.p50)}</td><td>${seg(f.p95)}</td><td>${esc(f.detalle)}</td></tr>`).join('')}</tbody></table>`;
}

const estado = t => { $('estado').textContent = t; };

async function lector(token) {
  let version = null;
  await dormir(Math.random() * 15000);   // cada celular empieza en un momento distinto
  while (corriendo) {
    const p = await peticion('pulso', { token });
    if (p && p.activa && p.activa.version !== version) {
      version = p.activa.version;
      await peticion('emergencia', { token });
    }
    await dormir(15000 * (0.8 + Math.random() * 0.4));
  }
}

const ESTADOS = ['evacuado', 'evacuado', 'evacuado', 'apoyo', 'no_ubicado'];
async function brigadista(token, id, codigos, ultimo, contador) {
  await dormir(Math.random() * 5000);
  while (corriendo) {
    const codigo = alAzar(codigos);
    const op = { id: crypto.randomUUID(), emergencia: id, momento: Date.now(), tipo: 'persona', codigo, campos: { estado: alAzar(ESTADOS) } };
    const r = await peticion('marcarEmergencia', { token, ops: [op] });
    if (r && r.resultados && r.resultados[0] && r.resultados[0].estado === 'ok') {
      contador.ok++;
      const u = ultimo.get(codigo);
      if (!u || op.momento >= u.momento) ultimo.set(codigo, { estado: op.campos.estado, momento: op.momento });
    } else contador.mal++;
    await dormir(5000 * (0.8 + Math.random() * 0.4));
  }
}

async function empezar(ev) {
  ev.preventDefault();
  url = $('url').value.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) return estado('La dirección debe ser la de una aplicación web de Apps Script (termina en /exec).');
  if (url === URL_REAL) return estado('Esa es la dirección del servidor REAL. La prueba de carga solo se hace contra el servidor de prueba.');
  const cuentas = $('cuentas').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(';'); return { correo: l.slice(0, i).trim(), clave: l.slice(i + 1) }; })
    .filter(c => c.correo && c.clave);
  if (!cuentas.length) return estado('Escriba al menos una cuenta ficticia con el formato correo;contraseña.');
  const nLectores = Math.max(0, Number($('lectores').value) || 0), nBrig = Math.max(0, Number($('brigadistas').value) || 0);
  const minutos = Math.min(30, Math.max(1, Number($('minutos').value) || 5));
  estadisticas = new Map();
  $('final').innerHTML = '';
  $('empezar').disabled = true;
  const tokens = [];
  try {
    estado('Preparando las cuentas (las huellas se calculan en este computador)…');
    for (const c of cuentas) c.cred = await credenciales(c.correo, c.clave);
    const entrar = async c => {
      const r = await peticion('ingresar', { hashCorreo: c.cred.hashCorreo, verificador: c.cred.verificador });
      if (!r) throw new Error('No se pudo ingresar con ' + c.correo + '. Revise la cuenta y la contraseña.');
      tokens.push(r.token);
      return r.token;
    };
    const principal = await entrar(cuentas[0]);
    let p = await peticion('pulso', { token: principal });
    let creada = false;
    if (!p) throw new Error('El servidor no respondió a la consulta inicial.');
    if (!p.activa) {
      if (!$('iniciar').checked) throw new Error('No hay un simulacro activo en el servidor de prueba.');
      const r = await peticion('activarEmergencia', { token: principal, tipo: 'otro', descripcion: 'Prueba de carga', simulacro: true });
      if (!r) throw new Error('No se pudo iniciar el simulacro: la primera cuenta debe ser brigadista o de la coordinación.');
      creada = true;
      p = await peticion('pulso', { token: principal });
    }
    if (!p.activa.simulacro) throw new Error('Hay una EMERGENCIA REAL activa en el servidor: la prueba no se hace.');
    const id = p.activa.id;
    const est = await peticion('emergencia', { token: principal });
    const codigos = Object.values((est && est.emergencia && est.emergencia.esperados) || {}).flatMap(g => g.en || []);
    if (nBrig && !codigos.length) throw new Error('El simulacro no tiene personas previstas: no hay a quién marcar.');

    estado(`Abriendo ${nLectores + nBrig} sesiones…`);
    const tLect = [], tBrig = [];
    for (let i = 0; i < nBrig; i++) tBrig.push(await entrar(cuentas[i % cuentas.length]));
    for (let i = 0; i < nLectores; i++) tLect.push(await entrar(cuentas[i % cuentas.length]));

    corriendo = true;
    $('parar').disabled = false;
    const ultimo = new Map(), contador = { ok: 0, mal: 0 };
    const inicio = Date.now(), fin = inicio + minutos * 60000;
    const tareas = [...tLect.map(t => lector(t)), ...tBrig.map(t => brigadista(t, id, codigos, ultimo, contador))];
    const reloj = setInterval(() => {
      pintarTabla();
      const resta = Math.max(0, Math.round((fin - Date.now()) / 1000));
      estado(`En curso: ${tLect.length} lectores y ${tBrig.length} brigadistas · faltan ${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')} · marcas aceptadas ${contador.ok}`);
      if (Date.now() >= fin) corriendo = false;
    }, 1000);
    await Promise.all(tareas);
    clearInterval(reloj);

    // Marcas perdidas: la última marca enviada a cada persona debe ser la que quedó en el servidor.
    estado('Comprobando las marcas en el servidor…');
    const final = await peticion('emergencia', { token: principal });
    const enServidor = new Map(((final && final.marcas) || []).map(m => [m.codigo, m.estado]));
    const perdidas = [...ultimo.entries()].filter(([c, u]) => enServidor.get(c) !== u.estado).length;
    let cierre = 'El simulacro sigue activo.';
    if ($('terminar').checked) {
      const r = await peticion('cerrarEmergencia', { token: principal, id, observaciones: 'Prueba de carga con datos ficticios' });
      cierre = r ? 'Simulacro terminado.' : 'No se pudo terminar el simulacro: termínelo desde la app.';
    }
    pintarTabla();
    const pulso = filas().find(f => f.accion === 'pulso');
    const total = filas().reduce((a, f) => ({ n: a.n + f.n, err: a.err + f.err }), { n: 0, err: 0 });
    const pctErr = total.n ? total.err * 100 / total.n : 0;
    const texto = [
      `Prueba de carga · EMERGENCIAS D3 · ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
      `Servidor de prueba: …${url.slice(-18)} · ${tLect.length} lectores · ${tBrig.length} brigadistas · ${((Date.now() - inicio) / 60000).toFixed(1)} minutos${creada ? ' · simulacro creado por la prueba' : ''}`,
      ...filas().map(f => `${f.accion}: ${f.n} peticiones, ${f.err} errores (${f.pct.toFixed(1)} %), mediana ${seg(f.p50)}, percentil 95 ${seg(f.p95)}${f.detalle ? ' [' + f.detalle + ']' : ''}`),
      `Marcas aceptadas: ${contador.ok} · rechazadas o con error: ${contador.mal} · personas cuya última marca no coincide en el servidor (perdidas): ${perdidas}`,
      `Criterios: percentil 95 de pulso menor de 3 s → ${pulso && pulso.p95 < 3000 ? 'cumple' : 'NO cumple'}; errores menores del 1 % → ${pctErr < 1 ? 'cumple' : 'NO cumple'} (${pctErr.toFixed(2)} %); ninguna marca perdida → ${perdidas === 0 ? 'cumple' : 'NO cumple'}.`,
      cierre
    ].join('\n');
    $('final').innerHTML = `<h2>Resumen</h2><pre id="resumen-texto">${esc(texto)}</pre><button type="button" class="sec" id="copiar">Copiar resumen</button>`;
    $('copiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(texto); estado('Resumen copiado.'); } catch { estado('No se pudo copiar: selecciónelo a mano.'); } });
    estado('Prueba terminada.');
  } catch (e) {
    corriendo = false;
    estado(e.message || String(e));
  } finally {
    // Se cierran las sesiones que abrió la prueba, para no dejarlas en la hoja.
    await Promise.all(tokens.map(token => peticion('salir', { token })));
    pintarTabla();
    $('empezar').disabled = false;
    $('parar').disabled = true;
  }
}

$('f').addEventListener('submit', empezar);
$('parar').addEventListener('click', () => { corriendo = false; estado('Parando: se esperan las peticiones en curso…'); });
