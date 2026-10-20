// Banco de pruebas del núcleo del servidor (servidor/Nucleo.gs).
// Corre solo en el computador local, con datos ficticios y un adaptador en memoria.
// Cada fase del plan agrega sus casos aquí; una fase solo se cierra con todo en OK.

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const salida = document.getElementById('salida');

// ---------- Utilidades de aserción ----------

const copia = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const fallar = m => { throw new Error(m); };
const afirmar = (c, m) => { if (!c) fallar(m || 'La condición no se cumple'); };
const igual = (obtenido, esperado, m) => {
  const a = JSON.stringify(obtenido), b = JSON.stringify(esperado);
  if (a !== b) fallar(`${m || 'No coincide'}: esperado ${b}, obtenido ${a}`);
};
const exito = (r, m) => { if (!r.ok) fallar(`${m || 'Debía aceptarse'}: ${r.codigo} · ${r.error}`); return r.datos; };
const rechazo = (r, codigo, m) => {
  if (r.ok) fallar(`${m || 'Debía rechazarse'}: se aceptó`);
  if (codigo && r.codigo !== codigo) fallar(`${m || 'Código de error'}: esperado ${codigo}, obtenido ${r.codigo} (${r.error})`);
};

const pruebas = [];
const prueba = (grupo, nombre, fn) => pruebas.push({ grupo, nombre, fn });

// ---------- Entorno de pruebas ----------

let N;   // { crearNucleo, presenciaDe, sha256, diaISO } evaluados desde Nucleo.gs
let nav; // módulo web/js/presencia.js
let arch; // módulo web/js/archivo-contactos.js

function crearEntorno({ conFiltrado = false } = {}) {
  const tablas = {};
  let escrituras = [];
  let lecturas = [];
  const reloj = { ahora: 0, hoy: '' };
  const props = { PIMIENTA: 'pimienta-de-prueba', CODIGO_INSTALACION: 'CODIGO01' };
  const memoria = new Map();
  const dep = {
    leer: t => { lecturas.push(t); return copia(tablas[t] || []); },
    escribir: (t, f) => { escrituras.push(t); tablas[t] = f.map(x => ({ ...x })); },
    agregar: (t, f) => { escrituras.push(t); (tablas[t] = tablas[t] || []).push({ ...f }); },
    agregarVarias: (t, f) => { escrituras.push(t); (tablas[t] = tablas[t] || []).push(...f.map(x => ({ ...x }))); },
    prop: n => props[n],
    uuid: () => crypto.randomUUID(),
    ahora: () => reloj.ahora,
    hoy: () => reloj.hoy,
    bloqueo: fn => fn(),
    cache: { get: k => (memoria.has(k) ? memoria.get(k) : null), put: (k, v) => { memoria.set(k, v); } }
  };
  if (conFiltrado) {
    dep.leerFiltrado = (t, c, v) => { lecturas.push(t + ' (filtrada)'); return copia((tablas[t] || []).filter(f => String(f[c]) === String(v))); };
  }
  const nucleo = N.crearNucleo(dep);
  const e = {
    // Hora de Bogotá (UTC-5, sin horario de verano).
    ahora: () => reloj.ahora,
    fijarFecha(fecha, hora = '09:00') { reloj.hoy = fecha; reloj.ahora = Date.parse(`${fecha}T${hora}:00-05:00`); },
    sembrar(tabla, filas) { tablas[tabla] = filas.map(f => ({ ...f })); },
    tabla: t => copia(tablas[t] || []),
    snapshot: () => JSON.stringify(tablas),
    escrituras: () => escrituras.slice(),
    reiniciarEscrituras() { escrituras = []; },
    lecturas: () => lecturas.slice(),
    reiniciarLecturas() { lecturas = []; },
    usaBloqueo: accion => nucleo.usaBloqueo(accion),
    llamar(accion, datos = {}, token) {
      return copia(nucleo.procesar(copia({ accion, ...(token ? { token } : {}), ...datos })));
    },
    entrar(codigo) {
      const r = e.llamar('ingresar', { hashCorreo: 'hc-' + codigo, verificador: 'v-' + codigo });
      return exito(r, 'No se pudo ingresar ' + codigo).token;
    }
  };
  return e;
}

const PUESTOS = [];
[[2, 10], [4, 8], [6, 8], [7, 12]].forEach(([piso, n]) => { for (let i = 1; i <= n; i++) PUESTOS.push({ piso, puesto: i, estado: 'ocupado' }); });

function persona(n, piso, puesto, extra = {}) {
  const codigo = 'D3-' + String(n).padStart(3, '0');
  return {
    codigo, piso, puesto, estado: 'activo', roles: '', pisoBrigada: '', hashCorreo: 'hc-' + codigo,
    verificador: N.sha256('pimienta-de-prueba|v-' + codigo), sobres: '{}', debeCambiar: 'false', intentos: 0,
    bloqueadoHasta: 0, actualizado: '', pub: '', agenda: '', ...extra
  };
}

// Ocho personas ficticias en los pisos 2, 4, 6 y 7. La 1 es administradora.
function escenario(fecha = '2026-10-19') {   // 19/10/2026 es lunes
  const e = crearEntorno();
  e.fijarFecha(fecha);
  e.sembrar('Puestos', PUESTOS);
  e.sembrar('Personas', [
    persona(1, 2, 1, { roles: 'admin' }),
    persona(2, 2, 2, { roles: 'coordinador' }),
    persona(3, 4, 1),
    persona(4, 4, 2, { roles: 'brigadista', pisoBrigada: 4 }),
    persona(5, 6, 1),
    persona(6, 6, 2, { agenda: 'ocasional' }),
    persona(7, 7, 1, { agenda: '1,3,5' }),
    persona(8, 7, 2, { estado: 'inactivo' })
  ]);
  e.token = e.entrar('D3-001');
  e.reiniciarEscrituras();
  return e;
}

const novedad = (extra = {}) => ({ codigo: 'D3-003', tipo: 'no_asiste', desde: '2026-10-19', hasta: '2026-10-19', ...extra });
const guardar = (e, extra) => e.llamar('guardarNovedad', novedad(extra), e.token);
const fotoDe = e => exito(e.llamar('activarEmergencia', { tipo: 'sismo', descripcion: '' }, e.token)).emergencia.esperados;

// ---------- Presencia: servidor y navegador ----------

const HAB = { codigo: 'P1', piso: 4, puesto: 7, agenda: '' };
const nv = (tipo, desde, hasta, actualizado, extra = {}) => ({ codigo: 'P1', tipo, desde, hasta, piso: 0, puesto: 0, actualizado, ...extra });
const hab = (presente, motivo) => ({ presente, piso: 4, puesto: 7, otroLugar: false, motivo });

const LUN = '2026-10-19', MAR = '2026-10-20', MIE = '2026-10-21', VIE = '2026-10-23', SAB = '2026-10-24', DOM = '2026-10-25';

const CASOS = [
  ['Sin novedad, lunes: presente por agenda', HAB, LUN, [], [], hab(true, 'agenda')],
  ['Sin novedad, viernes: presente por agenda', HAB, VIE, [], [], hab(true, 'agenda')],
  ['Sin novedad, sábado: fuera de agenda', HAB, SAB, [], [], hab(false, 'fuera-de-agenda')],
  ['Sin novedad, domingo: fuera de agenda', HAB, DOM, [], [], hab(false, 'fuera-de-agenda')],
  ['Agenda vacía (sin campo): lunes a viernes', { codigo: 'P1', piso: 4, puesto: 7 }, MIE, [], [], hab(true, 'agenda')],
  ['Agenda ocasional, lunes: fuera de agenda', { ...HAB, agenda: 'ocasional' }, LUN, [], [], hab(false, 'fuera-de-agenda')],
  ['Días sueltos 1,3,5: lunes presente', { ...HAB, agenda: '1,3,5' }, LUN, [], [], hab(true, 'agenda')],
  ['Días sueltos 1,3,5: martes fuera', { ...HAB, agenda: '1,3,5' }, MAR, [], [], hab(false, 'fuera-de-agenda')],
  ['Días sueltos 1,3,5: miércoles presente', { ...HAB, agenda: '1,3,5' }, MIE, [], [], hab(true, 'agenda')],
  ['Agenda 6,7: sábado presente', { ...HAB, agenda: '6,7' }, SAB, [], [], hab(true, 'agenda')],
  ['Agenda 7: domingo presente (domingo = 7)', { ...HAB, agenda: '7' }, DOM, [], [], hab(true, 'agenda')],
  ['Novedad no_asiste hoy', HAB, LUN, [nv('no_asiste', LUN, LUN, 'a')], [], hab(false, 'novedad-no-asiste')],
  ['Novedad no_asiste de varios días, día intermedio', HAB, MAR, [nv('no_asiste', LUN, MIE, 'a')], [], hab(false, 'novedad-no-asiste')],
  ['Novedad otro_lugar con piso y puesto', HAB, LUN, [nv('otro_lugar', LUN, LUN, 'a', { piso: 6, puesto: 3 })], [],
    { presente: true, piso: 6, puesto: 3, otroLugar: true, motivo: 'novedad-otro-lugar' }],
  ['Novedad otro_lugar en sala o área común (puesto 0)', HAB, LUN, [nv('otro_lugar', LUN, LUN, 'a', { piso: 2, puesto: 0 })], [],
    { presente: true, piso: 2, puesto: 0, otroLugar: true, motivo: 'novedad-otro-lugar' }],
  ['Novedad asiste en sábado', HAB, SAB, [nv('asiste', SAB, SAB, 'a')], [], hab(true, 'novedad-asiste')],
  ['Novedad asiste con agenda ocasional', { ...HAB, agenda: 'ocasional' }, MAR, [nv('asiste', MAR, MAR, 'a')], [], hab(true, 'novedad-asiste')],
  ['Festivo sin novedad: no hay actividad', HAB, LUN, [], [LUN], hab(false, 'festivo')],
  ['Festivo con novedad asiste: gana la novedad', HAB, LUN, [nv('asiste', LUN, LUN, 'a')], [LUN], hab(true, 'novedad-asiste')],
  ['Festivo con novedad no_asiste', HAB, LUN, [nv('no_asiste', LUN, LUN, 'a')], [LUN], hab(false, 'novedad-no-asiste')],
  ['Otro festivo no afecta el día', HAB, LUN, [], [MAR], hab(true, 'agenda')],
  ['Superpuestas: gana la más reciente (otro_lugar)', HAB, LUN,
    [nv('no_asiste', LUN, MIE, '2026-10-19T08:00:00.000Z'), nv('otro_lugar', LUN, LUN, '2026-10-19T09:00:00.000Z', { piso: 7, puesto: 1 })], [],
    { presente: true, piso: 7, puesto: 1, otroLugar: true, motivo: 'novedad-otro-lugar' }],
  ['Superpuestas: gana la más reciente (no_asiste)', HAB, LUN,
    [nv('otro_lugar', LUN, LUN, '2026-10-19T08:00:00.000Z', { piso: 7, puesto: 1 }), nv('no_asiste', LUN, MIE, '2026-10-19T09:00:00.000Z')], [],
    hab(false, 'novedad-no-asiste')],
  ['Novedad que venció ayer: no aplica', HAB, LUN, [nv('no_asiste', '2026-10-15', '2026-10-18', 'a')], [], hab(true, 'agenda')],
  ['Novedad que empieza mañana: no aplica hoy', HAB, LUN, [nv('no_asiste', MAR, MIE, 'a')], [], hab(true, 'agenda')],
  ['Novedad de otra persona: no aplica', HAB, LUN, [nv('no_asiste', LUN, LUN, 'a', { codigo: 'P2' })], [], hab(true, 'agenda')],
  ['Primer día del rango cuenta', HAB, LUN, [nv('no_asiste', LUN, VIE, 'a')], [], hab(false, 'novedad-no-asiste')],
  ['Último día del rango cuenta', HAB, VIE, [nv('no_asiste', LUN, VIE, 'a')], [], hab(false, 'novedad-no-asiste')],
  ['Piso y puesto como texto se leen como números', { codigo: 'P1', piso: '4', puesto: '7', agenda: '' }, LUN, [], [], hab(true, 'agenda')],
  ['Sin lista de novedades ni festivos (undefined)', HAB, LUN, undefined, undefined, hab(true, 'agenda')]
];

CASOS.forEach(([nombre, persona, fecha, novedades, festivos, esperado]) => {
  prueba('Presencia (servidor y navegador)', nombre, () => {
    igual(N.presenciaDe(copia(persona), fecha, copia(novedades), copia(festivos)), esperado, 'Servidor');
    igual(nav.presenciaDe(copia(persona), fecha, copia(novedades), copia(festivos)), esperado, 'Navegador');
  });
});

prueba('Presencia (servidor y navegador)', 'diaISO: lunes 1 … domingo 7, igual en ambos', () => {
  const casos = [['2026-10-19', 1], ['2026-10-20', 2], ['2026-10-23', 5], ['2026-10-24', 6], ['2026-10-25', 7], ['2026-01-01', 4], ['2024-02-29', 4]];
  casos.forEach(([f, d]) => { igual(N.diaISO(f), d, 'Servidor ' + f); igual(nav.diaISO(f), d, 'Navegador ' + f); });
});

prueba('Presencia (servidor y navegador)', 'Barrido: ambas copias coinciden en más de 1.500 combinaciones', () => {
  const agendas = ['', 'ocasional', '1,3,5', '2,4', '6,7', '7', '1,2,3,4,5,6,7'];
  const fechas = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10));
  const lotes = [
    [],
    [nv('no_asiste', '2026-10-20', '2026-10-22', 'a')],
    [nv('otro_lugar', '2026-10-19', '2026-10-25', 'b', { piso: 6, puesto: 2 })],
    [nv('asiste', '2026-10-24', '2026-10-25', 'c')],
    [nv('no_asiste', '2026-10-19', '2026-10-31', 'a'), nv('asiste', '2026-10-21', '2026-10-21', 'b')],
    [nv('asiste', '2026-10-19', '2026-10-31', 'a'), nv('no_asiste', '2026-10-21', '2026-10-22', 'b'), nv('otro_lugar', '2026-10-22', '2026-10-22', 'c', { piso: 2, puesto: 0 })]
  ];
  const festivosOpc = [[], ['2026-10-19', '2026-10-26'], ['2026-10-24']];
  let n = 0;
  for (const agenda of agendas) for (const fecha of fechas) for (const lote of lotes) for (const fest of festivosOpc) {
    const p = { ...HAB, agenda };
    const a = N.presenciaDe(copia(p), fecha, copia(lote), copia(fest));
    const b = nav.presenciaDe(copia(p), fecha, copia(lote), copia(fest));
    igual(b, a, `Difieren con agenda "${agenda}", fecha ${fecha}`);
    n++;
  }
  afirmar(n >= 1500, 'Se esperaban más combinaciones: ' + n);
});

// ---------- guardarNovedad, quitarNovedad, novedades ----------

const G = 'Novedades (servidor)';

prueba(G, 'Crea una novedad válida y la devuelve en la lista', () => {
  const e = escenario();
  const d = exito(guardar(e));
  afirmar(d.novedad.id, 'Debe traer id');
  igual(d.novedades.length, 1);
  igual([d.novedad.codigo, d.novedad.tipo, d.novedad.desde, d.novedad.hasta, d.novedad.registradoPor], ['D3-003', 'no_asiste', '2026-10-19', '2026-10-19', 'D3-001']);
  igual(e.tabla('Novedades').length, 1);
});
prueba(G, 'No guarda piso ni puesto si no es «otro lugar»', () => {
  const e = escenario();
  exito(guardar(e, { piso: 6, puesto: 3 }));
  const f = e.tabla('Novedades')[0];
  igual([f.piso, f.puesto], ['', '']);
});
prueba(G, 'Guarda piso y puesto de «otro lugar» (puesto válido y puesto 0)', () => {
  const e = escenario();
  const a = exito(guardar(e, { tipo: 'otro_lugar', piso: 6, puesto: 3 })).novedad;
  igual([a.piso, a.puesto], [6, 3]);
  const b = exito(guardar(e, { codigo: 'D3-005', tipo: 'otro_lugar', piso: 7, puesto: 0 })).novedad;
  igual([b.piso, b.puesto], [7, 0]);
});
prueba(G, 'Cada novedad nueva tiene un id distinto', () => {
  const e = escenario();
  const a = exito(guardar(e)).novedad.id, b = exito(guardar(e)).novedad.id;
  afirmar(a !== b, 'Los ids deben ser distintos');
});
prueba(G, 'Bitácora: registra el id, sin tipo ni fechas', () => {
  const e = escenario();
  const id = exito(guardar(e, { tipo: 'otro_lugar', piso: 6, puesto: 3 })).novedad.id;
  const b = e.tabla('Bitacora').filter(x => x.accion === 'novedad');
  igual(b.length, 1);
  igual([b[0].codigo, b[0].detalle], ['D3-001', id], 'El detalle debe ser solo el id (sin tipo ni fechas)');
});
['2026-02-30', '2026-13-01', 'mañana', '', '2026-1-5'].forEach(f => {
  prueba(G, `Rechaza fecha inválida «${f}»`, () => { const e = escenario(); rechazo(guardar(e, { desde: f }), 'DATOS'); rechazo(guardar(e, { hasta: f }), 'DATOS'); });
});
prueba(G, 'Rechaza hasta anterior a desde', () => { const e = escenario(); rechazo(guardar(e, { desde: '2026-10-22', hasta: '2026-10-20' }), 'DATOS'); });
prueba(G, 'Acepta un rango de 92 días (límite)', () => { const e = escenario(); exito(guardar(e, { desde: '2026-10-19', hasta: '2027-01-18' })); });
prueba(G, 'Rechaza un rango de 93 días', () => { const e = escenario(); rechazo(guardar(e, { desde: '2026-10-19', hasta: '2027-01-19' }), 'DATOS'); });
prueba(G, 'Rechaza hasta en el pasado', () => { const e = escenario(); rechazo(guardar(e, { desde: '2026-10-15', hasta: '2026-10-18' }), 'DATOS'); });
prueba(G, 'Rechaza una novedad nueva que empieza en el pasado', () => { const e = escenario(); rechazo(guardar(e, { desde: '2026-10-18', hasta: '2026-10-21' }), 'DATOS'); });
prueba(G, 'Rechaza piso inexistente', () => { const e = escenario(); rechazo(guardar(e, { tipo: 'otro_lugar', piso: 3, puesto: 0 }), 'DATOS'); });
prueba(G, 'Rechaza «otro lugar» sin piso', () => { const e = escenario(); rechazo(guardar(e, { tipo: 'otro_lugar' }), 'DATOS'); });
prueba(G, 'Rechaza un puesto que es de otro piso', () => { const e = escenario(); rechazo(guardar(e, { tipo: 'otro_lugar', piso: 6, puesto: 12 }), 'DATOS'); });
prueba(G, 'Rechaza una persona inactiva', () => { const e = escenario(); rechazo(guardar(e, { codigo: 'D3-008' }), 'DATOS'); });
prueba(G, 'Rechaza una persona que no existe', () => { const e = escenario(); rechazo(guardar(e, { codigo: 'D3-999' }), 'DATOS'); });
prueba(G, 'Rechaza un tipo desconocido', () => { const e = escenario(); rechazo(guardar(e, { tipo: 'vacaciones' }), 'DATOS'); });
prueba(G, 'Sin sesión no se puede guardar, quitar ni consultar', () => {
  const e = escenario();
  rechazo(e.llamar('guardarNovedad', novedad()), 'SESION');
  rechazo(e.llamar('quitarNovedad', { id: 'x' }), 'SESION');
  rechazo(e.llamar('novedades'), 'SESION');
  igual(e.tabla('Novedades').length, 0);
});
prueba(G, 'Edita por id (cambia el rango) sin crear otra fila', () => {
  const e = escenario();
  const id = exito(guardar(e)).novedad.id;
  const d = exito(guardar(e, { id, hasta: '2026-10-23' }));
  igual(d.novedades.length, 1);
  igual([d.novedad.id, d.novedad.hasta], [id, '2026-10-23']);
  igual(e.tabla('Novedades').length, 1);
});
prueba(G, 'Al editar se admite un «desde» que ya pasó', () => {
  const e = escenario();
  const id = exito(guardar(e, { desde: '2026-10-19', hasta: '2026-10-30' })).novedad.id;
  e.fijarFecha('2026-10-21');
  const d = exito(guardar(e, { id, desde: '2026-10-19', hasta: '2026-10-31' }), 'Editar con desde pasado');
  igual(d.novedad.hasta, '2026-10-31');
});
prueba(G, 'Al editar sigue exigiendo hasta vigente', () => {
  const e = escenario();
  const id = exito(guardar(e, { desde: '2026-10-19', hasta: '2026-10-30' })).novedad.id;
  e.fijarFecha('2026-10-21');
  rechazo(guardar(e, { id, desde: '2026-10-19', hasta: '2026-10-20' }), 'DATOS');
});
prueba(G, 'Editar un id que no existe devuelve NO_EXISTE', () => { const e = escenario(); rechazo(guardar(e, { id: 'no-existe' }), 'NO_EXISTE'); });
prueba(G, 'quitarNovedad la borra y deja bitácora', () => {
  const e = escenario();
  const id = exito(guardar(e)).novedad.id;
  guardar(e, { codigo: 'D3-005' });
  const d = exito(e.llamar('quitarNovedad', { id }, e.token));
  igual(d.novedades.length, 1);
  igual(e.tabla('Novedades').length, 1);
  igual(e.tabla('Bitacora').filter(x => x.accion === 'novedad-quitada').map(x => x.detalle), [id]);
});
prueba(G, 'quitarNovedad con un id desconocido no falla ni toca nada', () => {
  const e = escenario();
  guardar(e);
  const antes = e.snapshot();
  exito(e.llamar('quitarNovedad', { id: 'no-existe' }, e.token));
  igual(e.snapshot(), antes);
});
prueba(G, 'novedades devuelve la fecha de hoy y solo las vigentes', () => {
  const e = escenario();
  exito(guardar(e, { desde: '2026-10-19', hasta: '2026-10-20' }));
  exito(guardar(e, { codigo: 'D3-005', desde: '2026-10-22', hasta: '2026-10-23' }));
  let d = exito(e.llamar('novedades', {}, e.token));
  igual([d.fecha, d.novedades.length], ['2026-10-19', 2]);
  e.fijarFecha('2026-10-21');
  d = exito(e.llamar('novedades', {}, e.token));
  igual(d.novedades.map(n => n.codigo), ['D3-005'], 'La vencida no debe aparecer');
});
prueba(G, 'novedades solo lee (no escribe nada)', () => {
  const e = escenario();
  guardar(e);
  e.reiniciarEscrituras();
  const antes = e.snapshot();
  exito(e.llamar('novedades', {}, e.token));
  igual(e.escrituras(), []);
  igual(e.snapshot(), antes);
});
prueba(G, 'Al escribir se purgan las novedades vencidas de la tabla', () => {
  const e = escenario();
  exito(guardar(e, { desde: '2026-10-19', hasta: '2026-10-20' }));
  e.fijarFecha('2026-10-22');
  igual(e.tabla('Novedades').length, 1, 'Aún está en la tabla');
  exito(guardar(e, { codigo: 'D3-005', desde: '2026-10-22', hasta: '2026-10-22' }));
  igual(e.tabla('Novedades').map(n => n.codigo), ['D3-005']);
});
prueba(G, 'La purga de la bitácora ocurre como máximo una vez al día', () => {
  // El ingreso del escenario ya hizo la purga del 19/10: la prueba empieza el día siguiente.
  const e = escenario();
  const vieja = { fecha: '2020-01-01T00:00:00.000Z', codigo: 'D3-001', accion: 'ingreso', detalle: '' };
  e.fijarFecha('2026-10-20');
  e.sembrar('Bitacora', [vieja]);
  exito(guardar(e, { desde: '2026-10-20', hasta: '2026-10-20' }));
  igual(e.tabla('Bitacora').filter(b => b.fecha.startsWith('2020')).length, 0, 'Debía purgar la antigua');
  e.sembrar('Bitacora', [vieja]);
  exito(guardar(e, { codigo: 'D3-005', desde: '2026-10-20', hasta: '2026-10-20' }));
  igual(e.tabla('Bitacora').filter(b => b.fecha.startsWith('2020')).length, 1, 'No debía purgar de nuevo el mismo día');
  e.fijarFecha('2026-10-21');
  exito(guardar(e, { codigo: 'D3-005', desde: '2026-10-21', hasta: '2026-10-21' }));
  igual(e.tabla('Bitacora').filter(b => b.fecha.startsWith('2020')).length, 0, 'Al día siguiente sí purga');
});

// ---------- fotoEsperados (vía activarEmergencia) ----------

const F = 'Foto de esperados (activarEmergencia)';
const codigosEn = (foto, piso) => (foto[piso] ? foto[piso].en : []);

prueba(F, 'Lunes sin novedades: cada persona en el piso de su puesto', () => {
  const e = escenario();
  const f = fotoDe(e);
  igual(codigosEn(f, 2), ['D3-001', 'D3-002']);
  igual(codigosEn(f, 4), ['D3-003', 'D3-004']);
  igual(codigosEn(f, 6), ['D3-005'], 'La 6 es ocasional: no viene sola');
  igual(codigosEn(f, 7), ['D3-007'], 'La 7 tiene agenda 1,3,5 (hoy es lunes); la 8 está inactiva');
});
prueba(F, 'El grupo «sin» queda vacío en todos los pisos', () => {
  const f = fotoDe(escenario());
  Object.keys(f).forEach(p => igual(f[p].sin, [], 'Piso ' + p));
});
prueba(F, 'Con no_asiste, la persona queda fuera', () => {
  const e = escenario();
  exito(guardar(e, { codigo: 'D3-003' }));
  igual(codigosEn(fotoDe(e), 4), ['D3-004']);
});
prueba(F, 'Con otro_lugar en el piso 6, aparece en el piso 6 y no en el suyo', () => {
  const e = escenario();
  exito(guardar(e, { codigo: 'D3-003', tipo: 'otro_lugar', piso: 6, puesto: 0 }));
  const f = fotoDe(e);
  igual(codigosEn(f, 6), ['D3-003', 'D3-005']);
  igual(codigosEn(f, 4), ['D3-004']);
});
prueba(F, 'Agenda ocasional sin novedad: fuera', () => { igual(codigosEn(fotoDe(escenario()), 6).includes('D3-006'), false); });
prueba(F, 'Agenda ocasional con novedad «asiste»: dentro', () => {
  const e = escenario();
  exito(guardar(e, { codigo: 'D3-006', tipo: 'asiste' }));
  igual(codigosEn(fotoDe(e), 6), ['D3-005', 'D3-006']);
});
prueba(F, 'Sábado: nadie se espera', () => { igual(fotoDe(escenario('2026-10-24')), {}); });
prueba(F, 'Sábado con novedad «asiste»: solo esa persona', () => {
  const e = escenario('2026-10-24');
  exito(guardar(e, { codigo: 'D3-003', tipo: 'asiste', desde: '2026-10-24', hasta: '2026-10-24' }));
  igual(fotoDe(e), { 4: { en: ['D3-003'], sin: [] } });
});
prueba(F, 'Festivo (configurado por el administrador): nadie se espera', () => {
  const e = escenario();
  exito(e.llamar('guardarConfig', { festivos: ['2026-10-19'] }, e.token));
  igual(fotoDe(e), {});
});
prueba(F, 'Las personas sin rol (sin acceso) también cuentan', () => { igual(codigosEn(fotoDe(escenario()), 6).includes('D3-005'), true); });
prueba(F, 'Las personas inactivas no cuentan', () => {
  const f = fotoDe(escenario());
  igual(Object.values(f).some(g => g.en.includes('D3-008')), false);
});
prueba(F, 'Paridad: la foto del navegador es igual a la del servidor en 4 escenarios', () => {
  const armar = (fecha, hacer) => {
    const e = escenario(fecha);
    hacer(e);
    const base = exito(e.llamar('base', {}, e.token));
    const navegador = nav.fotoEsperadosDe(base.personas, fecha, base.novedades, base.config.festivos);
    const servidor = fotoDe(e);
    igual(navegador, servidor, 'Escenario ' + fecha);
  };
  armar('2026-10-19', () => {});
  armar('2026-10-19', e => {
    exito(guardar(e, { codigo: 'D3-003' }));
    exito(guardar(e, { codigo: 'D3-005', tipo: 'otro_lugar', piso: 2, puesto: 4 }));
    exito(guardar(e, { codigo: 'D3-006', tipo: 'asiste' }));
  });
  armar('2026-10-21', e => exito(e.llamar('guardarConfig', { festivos: ['2026-10-21'] }, e.token)));
  armar('2026-10-24', e => exito(guardar(e, { codigo: 'D3-004', tipo: 'asiste', desde: '2026-10-24', hasta: '2026-10-24' })));
});

// ---------- Acciones viejas (compatibilidad con la v0.8.4) y base ----------

const C = 'Compatibilidad con v0.8.4 y base';

prueba(C, '«registrar» viejo responde «obsoleta» por cada operación y no escribe', () => {
  const e = escenario();
  const antes = e.snapshot();
  const ops = [{ id: 'a', fecha: '2026-10-19', codigo: 'D3-001', momento: 1, campos: { estado: 'presencial' } }, { id: 'b' }, null];
  const d = exito(e.llamar('registrar', { ops }, e.token));
  igual(d.resultados.map(r => r.estado), ['obsoleta', 'obsoleta', 'obsoleta']);
  igual(d.resultados[0].id, 'a');
  igual(d.hoy, { fecha: '2026-10-19', registros: [] });
  igual(e.escrituras(), []);
  igual(e.snapshot(), antes);
});
prueba(C, '«registrar» sigue validando que ops sea un arreglo de máximo 500', () => {
  const e = escenario();
  rechazo(e.llamar('registrar', { ops: 'no' }, e.token), 'DATOS');
  rechazo(e.llamar('registrar', { ops: new Array(501).fill({ id: 'x' }) }, e.token), 'DATOS');
  exito(e.llamar('registrar', { ops: new Array(500).fill({ id: 'x' }) }, e.token));
});
prueba(C, '«hoy» viejo devuelve la fecha y una lista vacía', () => {
  const e = escenario();
  igual(exito(e.llamar('hoy', {}, e.token)), { fecha: '2026-10-19', registros: [] });
});
prueba(C, '«base» no escribe en ninguna tabla', () => {
  const e = escenario();
  exito(guardar(e));
  e.reiniciarEscrituras();
  const antes = e.snapshot();
  exito(e.llamar('base', {}, e.token));
  igual(e.escrituras(), [], 'Hubo escrituras');
  igual(e.snapshot(), antes, 'Cambió alguna tabla');
});
prueba(C, '«base» ya no archiva el registro horario viejo al cambiar el día', () => {
  const e = escenario();
  e.sembrar('RegistroHoy', [{ fecha: '2026-10-15', codigo: 'D3-001', estado: 'presencial', ingreso: '08:00', momentos: '{}' }]);
  const antes = e.snapshot();
  exito(e.llamar('base', {}, e.token));
  igual(e.snapshot(), antes);
  igual(e.tabla('RegistroHistorico').length, 0);
});
prueba(C, '«base» trae novedades vigentes, festivos, agenda y la lista «hoy» vacía (compatibilidad)', () => {
  const e = escenario();
  exito(e.llamar('guardarConfig', { festivos: ['2026-12-25'] }, e.token));
  exito(guardar(e));
  const b = exito(e.llamar('base', {}, e.token));
  igual(b.novedades.length, 1);
  igual(b.config.festivos, ['2026-12-25']);
  igual('diasHistorico' in b.config, false, 'No debe traer diasHistorico');
  igual(b.hoy, { fecha: '2026-10-19', registros: [] });
  igual(b.personas.find(p => p.codigo === 'D3-007').agenda, '1,3,5');
});
prueba(C, '«base» no incluye novedades vencidas', () => {
  const e = escenario();
  exito(guardar(e, { desde: '2026-10-19', hasta: '2026-10-20' }));
  e.fijarFecha('2026-10-21');
  igual(exito(e.llamar('base', {}, e.token)).novedades.length, 0);
});

// ---------- guardarConfig: festivos ----------

const K = 'Configuración (festivos)';

prueba(K, 'Guarda los festivos ordenados y sin repetir', () => {
  const e = escenario();
  exito(e.llamar('guardarConfig', { festivos: ['2026-12-25', '2026-11-02', '2026-12-25', '2026-11-16'] }, e.token));
  igual(exito(e.llamar('base', {}, e.token)).config.festivos, ['2026-11-02', '2026-11-16', '2026-12-25']);
});
prueba(K, 'Acepta una lista vacía para borrar todos', () => {
  const e = escenario();
  exito(e.llamar('guardarConfig', { festivos: ['2026-12-25'] }, e.token));
  exito(e.llamar('guardarConfig', { festivos: [] }, e.token));
  igual(exito(e.llamar('base', {}, e.token)).config.festivos, []);
});
prueba(K, 'Rechaza fechas inválidas y no cambia nada', () => {
  const e = escenario();
  exito(e.llamar('guardarConfig', { festivos: ['2026-12-25'] }, e.token));
  rechazo(e.llamar('guardarConfig', { festivos: ['2026-12-25', '2026-02-30'] }, e.token), 'DATOS');
  igual(exito(e.llamar('base', {}, e.token)).config.festivos, ['2026-12-25']);
});
prueba(K, 'Rechaza más de 60 festivos', () => {
  const e = escenario();
  const f = Array.from({ length: 61 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
  rechazo(e.llamar('guardarConfig', { festivos: f }, e.token), 'DATOS');
  exito(e.llamar('guardarConfig', { festivos: f.slice(0, 60) }, e.token));
});
prueba(K, 'Rechaza festivos que no son un arreglo', () => { const e = escenario(); rechazo(e.llamar('guardarConfig', { festivos: '2026-12-25' }, e.token), 'DATOS'); });
prueba(K, 'Solo el administrador cambia los festivos', () => {
  const e = escenario();
  const t = e.entrar('D3-004');   // brigadista
  rechazo(e.llamar('guardarConfig', { festivos: ['2026-12-25'] }, t), 'PERMISO');
});
prueba(K, 'diasHistorico se ignora y se descarta si existía', () => {
  const e = escenario();
  e.sembrar('Config', [{ clave: 'diasHistorico', valor: '90' }]);
  exito(e.llamar('guardarConfig', { diasHistorico: 365, diasSesion: 20 }, e.token));
  igual(e.tabla('Config').some(c => c.clave === 'diasHistorico'), false);
  igual(exito(e.llamar('base', {}, e.token)).config.diasSesion, 20);
});
prueba(K, 'Los festivos conservan lo demás de la configuración (por ejemplo, los archivos)', () => {
  const e = escenario();
  e.sembrar('Config', [{ clave: 'archivos', valor: JSON.stringify({ punto: { mime: 'image/png', version: 1, partes: 1, tam: 10 } }) }]);
  exito(e.llamar('guardarConfig', { festivos: ['2026-12-25'] }, e.token));
  afirmar(e.tabla('Config').some(c => c.clave === 'archivos'), 'Se perdió «archivos»');
});

// ---------- Fase 2: «No estaba hoy» y cierre por brigadistas ----------

// Siete personas: cuatro previstas en el piso 2 (admin, brigadista y dos sin rol), la brigadista del
// piso 6, una asesora y una persona sin rol en el piso 4.
function escenarioEmergencia() {
  const e = crearEntorno();
  e.fijarFecha('2026-10-19');
  e.sembrar('Puestos', PUESTOS);
  e.sembrar('Personas', [
    persona(1, 2, 1, { roles: 'admin' }),
    persona(2, 2, 2, { roles: 'brigadista', pisoBrigada: 2 }),
    persona(3, 2, 3),
    persona(4, 2, 4),
    persona(5, 6, 1, { roles: 'brigadista', pisoBrigada: 6 }),
    persona(6, 4, 1, { roles: 'asesor' }),
    persona(7, 4, 2),
    persona(8, 2, 5, { roles: 'coordinador' })
  ]);
  // La persona 8 queda inactiva para que el piso 2 tenga exactamente cuatro previstas.
  const ps = e.tabla('Personas'); ps[7].estado = 'inactivo'; e.sembrar('Personas', ps);
  // Solo ingresan quienes tienen rol (las personas 3, 4 y 7 no tienen: siguen en las listas pero no entran).
  ['D3-001', 'D3-002', 'D3-005', 'D3-006'].forEach(c => { e.t = e.t || {}; e.t[c] = e.entrar(c); });
  e.reiniciarEscrituras();
  return e;
}
const E = 'Fase 2: emergencia (servidor)';
const activar = (e, quien = 'D3-001', simulacro = false) =>
  exito(e.llamar('activarEmergencia', { tipo: 'sismo', descripcion: '', simulacro }, e.t[quien])).emergencia.id;
const marcar = (e, quien, id, codigo, estado, extra = {}) => e.llamar('marcarEmergencia', {
  ops: [{ id: 'op-' + Math.random(), emergencia: id, momento: e.ahora() + 1000, tipo: 'persona', codigo, campos: { estado, ...extra } }]
}, e.t[quien]);
const marcaDe = (e, id, codigo) => exito(e.llamar('emergencia', { id }, e.t['D3-001'])).marcas.find(m => m.codigo === codigo);
const cerrar = (e, quien, id) => e.llamar('cerrarEmergencia', { id, observaciones: '' }, e.t[quien]);
const informe = (e, id) => exito(e.llamar('historial', {}, e.t['D3-001'])).emergencias.find(x => x.id === id).resumen;
const piso2 = r => r.pisos.find(p => p.piso === 2);

prueba(E, 'Una brigadista puede marcar «no estaba»', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  igual(exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba')).resultados[0].estado, 'ok');
  igual(marcaDe(e, id, 'D3-004').estado, 'no_estaba');
});
prueba(E, 'Una asesora puede marcar «no estaba»', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  igual(exito(marcar(e, 'D3-006', id, 'D3-004', 'no_estaba')).resultados[0].estado, 'ok');
  igual(marcaDe(e, id, 'D3-004').estado, 'no_estaba');
});
prueba(E, 'La asesora ve el estado completo de la emergencia y el histórico', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  const d = exito(e.llamar('emergencia', { id }, e.t['D3-006']));
  afirmar(d.marcas.some(m => m.codigo === 'D3-004'), 'La asesora debía ver las marcas de otras personas');
  exito(e.llamar('historial', {}, e.t['D3-006']));
});
prueba(E, 'Resumen: 4 previstas (2 evacuadas, 1 «no estaba», 1 sin marca) → pendientes 1, completo no', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-002', id, 'D3-002', 'evacuado'));
  exito(marcar(e, 'D3-002', id, 'D3-003', 'evacuado'));
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  exito(cerrar(e, 'D3-001', id));
  const r = informe(e, id), p = piso2(r);
  igual([p.esperados, p.evacuados, p.noEstaban, p.pendientes, p.completo, p.tEvacuacionMs], [4, 2, 1, 1, false, null]);
  igual([r.version, r.total.noEstaban, r.total.evacuados], [2, 1, 2]);
});
prueba(E, 'Resumen: al marcar la cuarta como evacuada, el piso queda completo', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-002', id, 'D3-002', 'evacuado'));
  exito(marcar(e, 'D3-002', id, 'D3-003', 'evacuado'));
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  exito(marcar(e, 'D3-002', id, 'D3-001', 'evacuado'));
  exito(cerrar(e, 'D3-001', id));
  const p = piso2(informe(e, id));
  igual([p.evacuados, p.noEstaban, p.pendientes, p.completo], [3, 1, 0, true]);
  afirmar(typeof p.tEvacuacionMs === 'number', 'Debía traer el tiempo de evacuación');
});
prueba(E, 'Resumen: si todas las previstas son «no estaba», no se completa y no hay tiempo', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  ['D3-001', 'D3-002', 'D3-003', 'D3-004'].forEach(c => exito(marcar(e, 'D3-002', id, c, 'no_estaba')));
  exito(cerrar(e, 'D3-001', id));
  const p = piso2(informe(e, id));
  igual([p.evacuados, p.noEstaban, p.pendientes, p.completo, p.tEvacuacionMs], [0, 4, 0, false, null]);
});
prueba(E, 'Resumen: «no estaba» nunca cuenta como evacuada', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  exito(cerrar(e, 'D3-001', id));
  igual(informe(e, id).total.evacuados, 0);
});
prueba(E, 'Con conteo: pendientes = previstas − no estaban − evacuados − no ubicados − apoyo', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  exito(e.llamar('marcarEmergencia', { ops: [{ id: 'c1', emergencia: id, momento: e.ahora() + 1000, tipo: 'conteo', piso: 2, campos: { evacuados: 1, noUbicados: 1, apoyo: 0 } }] }, e.t['D3-002']));
  exito(cerrar(e, 'D3-001', id));
  const p = piso2(informe(e, id));
  igual([p.esperados, p.noEstaban, p.evacuados, p.noUbicados, p.pendientes], [4, 1, 1, 1, 1]);   // 4 − 1 − 1 − 1 − 0
});
prueba(E, 'Con conteo: los pendientes no bajan de cero', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(e.llamar('marcarEmergencia', { ops: [{ id: 'c1', emergencia: id, momento: e.ahora() + 1000, tipo: 'conteo', piso: 2, campos: { evacuados: 9, noUbicados: 0, apoyo: 0 } }] }, e.t['D3-002']));
  exito(cerrar(e, 'D3-001', id));
  igual(piso2(informe(e, id)).pendientes, 0);
});
prueba(E, 'Con conteo: el piso se completa si los evacuados cubren a quienes sí estaban', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  exito(e.llamar('marcarEmergencia', { ops: [{ id: 'c1', emergencia: id, momento: e.ahora() + 1000, tipo: 'conteo', piso: 2, campos: { evacuados: 3, noUbicados: 0, apoyo: 0 } }] }, e.t['D3-002']));
  exito(cerrar(e, 'D3-001', id));
  igual(piso2(informe(e, id)).completo, true);
});
prueba(E, 'Una brigadista cierra una emergencia real', () => {
  const e = escenarioEmergencia(); const id = activar(e, 'D3-001', false);
  exito(cerrar(e, 'D3-002', id), 'Una brigadista debía poder cerrar');
  igual(e.tabla('Emergencias')[0].estado, 'cerrada');
});
prueba(E, 'Una brigadista cierra un simulacro', () => {
  const e = escenarioEmergencia(); const id = activar(e, 'D3-001', true);
  exito(cerrar(e, 'D3-005', id), 'Una brigadista debía poder terminar el simulacro');
});
prueba(E, 'Una asesora no puede cerrar ni una emergencia real ni un simulacro', () => {
  const e = escenarioEmergencia();
  const real = activar(e, 'D3-001', false);
  rechazo(cerrar(e, 'D3-006', real), 'PERMISO');
  exito(cerrar(e, 'D3-001', real));
  const sim = activar(e, 'D3-001', true);
  rechazo(cerrar(e, 'D3-006', sim), 'PERMISO');
  igual(e.tabla('Emergencias').find(x => x.id === sim).estado, 'activa');
});
prueba(E, 'Una brigadista no puede iniciar un simulacro, pero sí una emergencia real', () => {
  const e = escenarioEmergencia();
  rechazo(e.llamar('activarEmergencia', { tipo: 'sismo', simulacro: true }, e.t['D3-002']), 'PERMISO');
  exito(e.llamar('activarEmergencia', { tipo: 'sismo', simulacro: false }, e.t['D3-002']));
});
prueba(E, 'El administrador inicia un simulacro; una asesora no activa nada', () => {
  const e = escenarioEmergencia();
  rechazo(e.llamar('activarEmergencia', { tipo: 'sismo', simulacro: false }, e.t['D3-006']), 'PERMISO');
  rechazo(e.llamar('activarEmergencia', { tipo: 'sismo', simulacro: true }, e.t['D3-006']), 'PERMISO');
  exito(e.llamar('activarEmergencia', { tipo: 'sismo', simulacro: true }, e.t['D3-001']));
});

// ---------- Fase 3: acceso por roles y rol de asesor ----------

const A = 'Fase 3: acceso por roles (servidor)';
const ingreso = (e, codigo, clave = 'v-' + codigo) => e.llamar('ingresar', { hashCorreo: 'hc-' + codigo, verificador: clave });
const roles = (e, cambios) => e.llamar('guardarRoles', { cambios }, e.token);
const rolesDe = (e, codigo) => e.tabla('Personas').find(p => p.codigo === codigo);

prueba(A, 'Sin roles y con la contraseña correcta: SIN_ACCESO y sin sesión', () => {
  const e = escenario();
  const antes = e.tabla('Sesiones').length;
  const r = ingreso(e, 'D3-003');
  rechazo(r, 'SIN_ACCESO');
  afirmar(/no tiene acceso/i.test(r.error), 'Mensaje claro: ' + r.error);
  igual(e.tabla('Sesiones').length, antes, 'No debía crear sesión');
  afirmar(!r.datos, 'No debe devolver token');
});
prueba(A, 'Sin roles y con contraseña incorrecta: CREDENCIALES (no revela si el correo existe)', () => {
  const e = escenario();
  const r = ingreso(e, 'D3-003', 'otra-clave');
  rechazo(r, 'CREDENCIALES');
  igual(r.error, ingreso(e, 'D3-999').error, 'Debe ser el mismo mensaje que con un correo que no existe');
});
prueba(A, 'Sin acceso reinicia los intentos y deja bitácora', () => {
  const e = escenario();
  ingreso(e, 'D3-003', 'mala'); ingreso(e, 'D3-003', 'mala');
  igual(Number(rolesDe(e, 'D3-003').intentos), 2);
  rechazo(ingreso(e, 'D3-003'), 'SIN_ACCESO');
  igual(Number(rolesDe(e, 'D3-003').intentos), 0);
  igual(e.tabla('Bitacora').filter(b => b.accion === 'ingreso-sin-acceso').map(b => b.codigo), ['D3-003']);
});
prueba(A, 'Cinco intentos fallidos bloquean aunque no tenga roles', () => {
  const e = escenario();
  for (let i = 0; i < 5; i++) ingreso(e, 'D3-003', 'mala');
  rechazo(ingreso(e, 'D3-003'), 'BLOQUEADO');
});
prueba(A, 'Cada rol válido da acceso (incluido asesor)', () => {
  const e = escenario();
  ['admin', 'coordinador', 'suplente', 'brigadista', 'asesor'].forEach(r => {
    const ps = e.tabla('Personas'); ps[2].roles = r; if (r === 'brigadista') ps[2].pisoBrigada = 4; e.sembrar('Personas', ps);
    exito(ingreso(e, 'D3-003'), 'Debía entrar con el rol ' + r);
  });
});
prueba(A, 'Persona inactiva con rol: no ingresa', () => {
  const e = escenario();
  const ps = e.tabla('Personas'); ps[7].roles = 'asesor'; e.sembrar('Personas', ps);
  rechazo(ingreso(e, 'D3-008'), 'CREDENCIALES');
});
prueba(A, 'Al quitarle todos los roles, la sesión abierta deja de servir (SESION)', () => {
  const e = escenario();
  const t4 = e.entrar('D3-004');
  exito(e.llamar('base', {}, t4));
  exito(roles(e, [{ codigo: 'D3-004', roles: [], pisoBrigada: null }]));
  rechazo(e.llamar('base', {}, t4), 'SESION');
  rechazo(e.llamar('marcarEmergencia', { ops: [] }, t4), 'SESION');
});
prueba(A, 'Al quitarle todos los roles se borran sus filas de Sesiones', () => {
  const e = escenario();
  e.entrar('D3-004'); e.entrar('D3-004');
  afirmar(e.tabla('Sesiones').filter(s => s.codigo === 'D3-004').length === 2, 'Debía haber dos sesiones');
  exito(roles(e, [{ codigo: 'D3-004', roles: [], pisoBrigada: null }]));
  igual(e.tabla('Sesiones').filter(s => s.codigo === 'D3-004').length, 0);
  afirmar(e.tabla('Sesiones').some(s => s.codigo === 'D3-001'), 'No debía tocar las sesiones de otras personas');
});
prueba(A, 'Si los roles se quitan directamente en la tabla, la siguiente petición también da SESION', () => {
  const e = escenario();
  const t4 = e.entrar('D3-004');
  const ps = e.tabla('Personas'); ps[3].roles = ''; e.sembrar('Personas', ps);
  rechazo(e.llamar('base', {}, t4), 'SESION');
});
prueba(A, 'Quien conserva algún rol conserva su sesión', () => {
  const e = escenario();
  const t4 = e.entrar('D3-004');
  exito(roles(e, [{ codigo: 'D3-004', roles: ['asesor'], pisoBrigada: null }]));
  exito(e.llamar('base', {}, t4));
});
prueba(A, 'La persona sin acceso sigue en la foto de esperados y en la lista de personas', () => {
  const e = escenario();
  igual(fotoDe(e)[4].en.includes('D3-003'), true);
  igual(exito(e.llamar('base', {}, e.token)).personas.some(p => p.codigo === 'D3-003'), true);
});

const G3 = 'Fase 3: guardarRoles (servidor)';
const rechazaSinEscribir = (e, cambios, texto) => {
  const antes = e.snapshot();
  const r = roles(e, cambios);
  rechazo(r, 'DATOS');
  if (texto) afirmar(r.error.includes(texto), 'Mensaje esperado «' + texto + '», obtenido «' + r.error + '»');
  igual(e.snapshot(), antes, 'No debía escribir nada');
};
prueba(G3, 'Rechaza dos coordinadores (cuenta también a quien no cambia)', () => {
  const e = escenario();   // la 2 ya es coordinadora
  rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['coordinador'], pisoBrigada: null }], 'un coordinador');
});
prueba(G3, 'Rechaza dos suplentes', () => {
  const e = escenario();
  rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['suplente'] }, { codigo: 'D3-005', roles: ['suplente'] }], 'un suplente');
});
prueba(G3, 'Rechaza que una persona sea coordinador y suplente', () => {
  const e = escenario();
  rechazaSinEscribir(e, [{ codigo: 'D3-002', roles: ['coordinador', 'suplente'] }], 'coordinador y suplente');
});
prueba(G3, 'Rechaza tres brigadistas en un piso', () => {
  const e = escenario();   // la 4 ya es brigadista del piso 4
  rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['brigadista'], pisoBrigada: 4 }, { codigo: 'D3-005', roles: ['brigadista'], pisoBrigada: 4 }], 'más de 2 brigadistas');
});
prueba(G3, 'Acepta dos brigadistas en un piso', () => {
  const e = escenario();
  exito(roles(e, [{ codigo: 'D3-003', roles: ['brigadista'], pisoBrigada: 4 }]));
  igual(String(rolesDe(e, 'D3-003').pisoBrigada), '4');   // en Sheets todo se guarda como texto
});
prueba(G3, 'Rechaza un piso de brigada que no existe en la planta', () => {
  const e = escenario();
  rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['brigadista'], pisoBrigada: 9 }], 'piso de la brigada');
  rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['brigadista'] }], 'piso de la brigada');
});
prueba(G3, 'Rechaza dejar al aplicativo sin administrador', () => {
  const e = escenario();
  rechazaSinEscribir(e, [{ codigo: 'D3-001', roles: ['coordinador'] }], 'administrador');
});
prueba(G3, 'Rechaza una persona que no existe y no escribe nada', () => {
  const e = escenario();
  rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['asesor'] }, { codigo: 'D3-999', roles: ['asesor'] }], 'No existe');
});
prueba(G3, 'Un cambio rechazado en una persona no deja escrito el de otra', () => {
  const e = escenario();
  rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['asesor'] }, { codigo: 'D3-005', roles: ['suplente', 'coordinador'] }]);
  igual(rolesDe(e, 'D3-003').roles, '');
});
prueba(G3, 'Acepta el rol asesor y lo deja guardado', () => {
  const e = escenario();
  exito(roles(e, [{ codigo: 'D3-003', roles: ['asesor'] }]));
  igual(rolesDe(e, 'D3-003').roles, 'asesor');
  igual(exito(e.llamar('base', {}, e.token)).personas.find(p => p.codigo === 'D3-003').roles, ['asesor']);
  exito(ingreso(e, 'D3-003'));
});
prueba(G3, 'Ignora roles desconocidos (no dan acceso)', () => {
  const e = escenario();
  exito(roles(e, [{ codigo: 'D3-003', roles: ['superadmin'] }]));
  igual(rolesDe(e, 'D3-003').roles, '');
  rechazo(ingreso(e, 'D3-003'), 'SIN_ACCESO');
});
prueba(G3, 'Solo el administrador cambia roles', () => {
  const e = escenario();
  const antes = e.snapshot();
  rechazo(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-003', roles: ['asesor'] }] }, e.entrar('D3-002')), 'PERMISO');
  igual(JSON.parse(e.snapshot()).Personas, JSON.parse(antes).Personas);
});
[['5,1,3', '1,3,5'], ['ocasional', 'ocasional'], ['', ''], ['7,6', '6,7'], ['1', '1'], [' 2 , 4 ', '2,4']].forEach(([entrada, esperado]) => {
  prueba(G3, 'Agenda «' + entrada + '» se guarda como «' + esperado + '»', () => {
    const e = escenario();
    exito(roles(e, [{ codigo: 'D3-003', roles: ['asesor'], agenda: entrada }]));
    igual(rolesDe(e, 'D3-003').agenda, esperado);
  });
});
['8', '0', '1,1', 'lunes', '1;2', ',', '1,,2', 'Ocasional'].forEach(mala => {
  prueba(G3, 'Rechaza la agenda inválida «' + mala + '»', () => {
    const e = escenario();
    rechazaSinEscribir(e, [{ codigo: 'D3-003', roles: ['asesor'], agenda: mala }], 'agenda');
  });
});
prueba(G3, 'Un cambio sin agenda (la v0.8.4) no toca la agenda guardada', () => {
  const e = escenario();
  exito(roles(e, [{ codigo: 'D3-007', roles: ['asesor'] }]));
  igual(rolesDe(e, 'D3-007').agenda, '1,3,5');
});
prueba(G3, 'La agenda guardada manda en la presencia (ocasional deja de esperarse)', () => {
  const e = escenario();
  igual(fotoDe(e)[4].en.includes('D3-003'), true);
  const e2 = escenario();
  exito(roles(e2, [{ codigo: 'D3-003', roles: [], agenda: 'ocasional' }]));
  igual((fotoDe(e2)[4] || { en: [] }).en.includes('D3-003'), false);
});
prueba(G3, 'La agenda llega a la app (base) y la regla de presencia del navegador la lee igual', () => {
  const e = escenario();
  exito(roles(e, [{ codigo: 'D3-003', roles: [], agenda: '2,4' }]));
  const base = exito(e.llamar('base', {}, e.token));
  const p = base.personas.find(x => x.codigo === 'D3-003');
  igual(p.agenda, '2,4');
  igual(nav.presenciaDe(p, '2026-10-20', [], []).presente, true);    // martes
  igual(nav.presenciaDe(p, '2026-10-19', [], []).presente, false);   // lunes
});

// ---------- Fase 5: caracterización asistida ----------

// Llaves públicas y envoltorios ficticios con la forma que valida el servidor (huella = SHA-256 de la pública).
const pubDe = c => JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x-' + c, y: 'y-' + c });
const envoltorio = c => ({ h: N.sha256(pubDe(c)).slice(0, 16), e: 'e-' + c, c: 'c-' + c });
const sobres = codigos => Object.fromEntries(codigos.map(c => [c, envoltorio(c)]));

// Personas: 1 admin, 2 coordinador, 3 brigadista del piso 2, 6 asesora (todas con llave y acceso);
// 4 (piso 2) y 5 (piso 6) sin rol y sin llave; 7 inactiva.
function escenarioAsistida() {
  const e = crearEntorno();
  e.fijarFecha('2026-10-19');
  e.sembrar('Puestos', PUESTOS);
  e.sembrar('Personas', [
    persona(1, 2, 1, { roles: 'admin', pub: pubDe('D3-001') }),
    persona(2, 2, 2, { roles: 'coordinador', pub: pubDe('D3-002') }),
    persona(3, 2, 3, { roles: 'brigadista', pisoBrigada: 2, pub: pubDe('D3-003') }),
    persona(4, 2, 4),
    persona(5, 6, 1),
    persona(6, 4, 1, { roles: 'asesor', pub: pubDe('D3-006') }),
    persona(7, 7, 1, { estado: 'inactivo' })
  ]);
  e.t = {};
  ['D3-001', 'D3-002', 'D3-003', 'D3-006'].forEach(c => { e.t[c] = e.entrar(c); });
  e.token = e.t['D3-001'];
  e.reiniciarEscrituras();
  return e;
}
const S = 'Fase 5: caracterización asistida (servidor)';
const carga = (owner, extra = {}) => ({
  codigo: owner, datos: 'cifrado-datos', apoyo: 'cifrado-apoyo',
  claves: sobres(['D3-001', 'D3-002']), clavesApoyo: sobres(['D3-001', 'D3-002', 'D3-003']),
  consentimiento: { v: 'v1', fisico: true, fechaFirma: '2026-10-15' }, ...extra
});
const asistida = (e, quien, owner, extra) => e.llamar('guardarCaracterizacionAsistida', carga(owner, extra), e.t[quien]);
const filaCarac = (e, codigo) => e.tabla('Caracterizaciones').find(c => c.codigo === codigo);
const listado = e => exito(e.llamar('caracterizaciones', {}, e.t['D3-002'])).caracterizaciones;

prueba(S, 'Un coordinador registra la caracterización asistida de una persona sin acceso', () => {
  const e = escenarioAsistida();
  const d = exito(asistida(e, 'D3-002', 'D3-004'));
  igual(d.version, 1);
  const f = filaCarac(e, 'D3-004');
  igual(JSON.parse(f.consentimiento), { v: 'v1', f: '2026-10-15T00:00:00.000Z', modo: 'fisico', por: 'D3-002' });
  igual(Object.keys(JSON.parse(f.claves)).sort(), ['D3-001', 'D3-002']);
});
prueba(S, 'El administrador también puede registrarla', () => { const e = escenarioAsistida(); exito(asistida(e, 'D3-001', 'D3-004', { claves: sobres(['D3-001']), clavesApoyo: sobres(['D3-001']) })); });
prueba(S, 'Deja bitácora con el código de la persona', () => {
  const e = escenarioAsistida(); exito(asistida(e, 'D3-002', 'D3-004'));
  igual(e.tabla('Bitacora').filter(b => b.accion === 'caracterizacion-asistida').map(b => [b.codigo, b.detalle]), [['D3-002', 'D3-004']]);
});
prueba(S, 'Rechazada para una persona que tiene acceso (con mensaje claro)', () => {
  const e = escenarioAsistida();
  const r = asistida(e, 'D3-002', 'D3-006');
  rechazo(r, 'PERMISO');
  afirmar(/diligenciar su caracterización ella misma/.test(r.error), r.error);
  igual(e.tabla('Caracterizaciones').length, 0);
});
prueba(S, 'Rechazada para un brigadista que intenta registrarla', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-003', 'D3-004', { claves: sobres(['D3-003']), clavesApoyo: sobres(['D3-003']) }), 'PERMISO');
  igual(e.tabla('Caracterizaciones').length, 0);
});
prueba(S, 'Rechazada para una asesora', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-006', 'D3-004', { claves: sobres(['D3-006']), clavesApoyo: sobres(['D3-006']) }), 'PERMISO');
});
prueba(S, 'Rechazada sin «fisico: true»', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-002', 'D3-004', { consentimiento: { v: 'v1', fechaFirma: '2026-10-15' } }), 'CONSENTIMIENTO');
  rechazo(asistida(e, 'D3-002', 'D3-004', { consentimiento: { v: 'v1', fisico: 'true', fechaFirma: '2026-10-15' } }), 'CONSENTIMIENTO');
  rechazo(asistida(e, 'D3-002', 'D3-004', { consentimiento: undefined }), 'CONSENTIMIENTO');
  igual(e.tabla('Caracterizaciones').length, 0);
});
prueba(S, 'Rechazada sin versión del texto firmado', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-002', 'D3-004', { consentimiento: { fisico: true, fechaFirma: '2026-10-15' } }), 'CONSENTIMIENTO');
});
prueba(S, 'Rechazada con fecha de firma futura o inválida', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-002', 'D3-004', { consentimiento: { v: 'v1', fisico: true, fechaFirma: '2026-10-20' } }), 'CONSENTIMIENTO');
  rechazo(asistida(e, 'D3-002', 'D3-004', { consentimiento: { v: 'v1', fisico: true, fechaFirma: '2026-02-30' } }), 'CONSENTIMIENTO');
  rechazo(asistida(e, 'D3-002', 'D3-004', { consentimiento: { v: 'v1', fisico: true, fechaFirma: '' } }), 'CONSENTIMIENTO');
});
prueba(S, 'Acepta la fecha de firma de hoy', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004', { consentimiento: { v: 'v1', fisico: true, fechaFirma: '2026-10-19' } }));
});
prueba(S, 'Rechazada sin el envoltorio de quien registra', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-002', 'D3-004', { claves: sobres(['D3-001']) }), 'DATOS');
  rechazo(asistida(e, 'D3-002', 'D3-004', { clavesApoyo: sobres(['D3-001', 'D3-003']) }), 'DATOS');
  igual(e.tabla('Caracterizaciones').length, 0);
});
prueba(S, 'Rechaza envoltorios de una llave desactualizada o de una persona sin llave', () => {
  const e = escenarioAsistida();
  const viejo = { ...envoltorio('D3-001'), h: '0000000000000000' };
  rechazo(asistida(e, 'D3-002', 'D3-004', { claves: { ...sobres(['D3-002']), 'D3-001': viejo } }), 'DATOS');
  rechazo(asistida(e, 'D3-002', 'D3-004', { claves: { ...sobres(['D3-002']), 'D3-004': envoltorio('D3-004') } }), 'DATOS');   // la persona no tiene llave pública
});
prueba(S, 'Rechazada para una persona inactiva o inexistente', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-002', 'D3-007'), 'DATOS');
  rechazo(asistida(e, 'D3-002', 'D3-999'), 'DATOS');
});
prueba(S, 'Rechaza un contenido demasiado largo', () => {
  const e = escenarioAsistida();
  rechazo(asistida(e, 'D3-002', 'D3-004', { datos: 'x'.repeat(45001) }), 'DATOS');
});
prueba(S, 'Control de versión: una edición con versión vieja da CONFLICTO', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));
  rechazo(asistida(e, 'D3-002', 'D3-004', { versionBase: 0 }), 'CONFLICTO');
  igual(exito(asistida(e, 'D3-002', 'D3-004', { versionBase: 1 })).version, 2);
  igual(e.tabla('Caracterizaciones').length, 1);
});
prueba(S, 'Al editar queda registrado quien la editó', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));
  exito(asistida(e, 'D3-001', 'D3-004', { claves: sobres(['D3-001']), clavesApoyo: sobres(['D3-001']) }));
  igual(JSON.parse(filaCarac(e, 'D3-004').consentimiento).por, 'D3-001');
});
prueba(S, 'La asistida sin acceso aparece en el listado con modo «fisico» y conAcceso falso', () => {
  const e = escenarioAsistida(); exito(asistida(e, 'D3-002', 'D3-004'));
  const r = listado(e).find(x => x.codigo === 'D3-004');
  igual([r.modo, r.conAcceso], ['fisico', false]);
  igual(r.consentimiento.por, 'D3-002');
});
prueba(S, 'La propia guarda modo «propio» y quién la registró', () => {
  const e = escenarioAsistida();
  exito(e.llamar('guardarCaracterizacion', { datos: 'd', apoyo: 'a', claves: sobres(['D3-006', 'D3-001']), clavesApoyo: sobres(['D3-006', 'D3-001']), consentimiento: { v: 'v1' } }, e.t['D3-006']));
  const c = JSON.parse(filaCarac(e, 'D3-006').consentimiento);
  igual([c.v, c.modo, c.por], ['v1', 'propio', 'D3-006']);
  const r = listado(e).find(x => x.codigo === 'D3-006');
  igual([r.modo, r.conAcceso], ['propio', true]);
});
prueba(S, 'Un registro viejo sin «modo» se lee como «propio»', () => {
  const e = escenarioAsistida();
  e.sembrar('Caracterizaciones', [{ codigo: 'D3-006', version: 1, datos: 'd', claves: JSON.stringify(sobres(['D3-006', 'D3-001'])), apoyo: 'a', clavesApoyo: JSON.stringify(sobres(['D3-006', 'D3-001'])), consentimiento: JSON.stringify({ v: 'v1', f: '2026-10-01T00:00:00.000Z' }), actualizado: '' }]);
  igual(listado(e).find(x => x.codigo === 'D3-006').modo, 'propio');
});
prueba(S, 'Revocación por un lector: borra el registro de una persona sin acceso', () => {
  const e = escenarioAsistida(); exito(asistida(e, 'D3-002', 'D3-004'));
  exito(e.llamar('revocarCaracterizacionDe', { codigo: 'D3-004' }, e.t['D3-002']));
  igual(e.tabla('Caracterizaciones').length, 0);
  igual(e.tabla('Bitacora').filter(b => b.accion === 'revocacion-asistida').map(b => [b.codigo, b.detalle]), [['D3-002', 'D3-004']]);
});
prueba(S, 'Revocación: rechazada para una persona con acceso, para quien no es lector y para quien no existe', () => {
  const e = escenarioAsistida(); exito(asistida(e, 'D3-002', 'D3-004'));
  exito(e.llamar('guardarCaracterizacion', { datos: 'd', apoyo: 'a', claves: sobres(['D3-006', 'D3-001']), clavesApoyo: sobres(['D3-006', 'D3-001']), consentimiento: { v: 'v1' } }, e.t['D3-006']));
  rechazo(e.llamar('revocarCaracterizacionDe', { codigo: 'D3-006' }, e.t['D3-002']), 'PERMISO');
  rechazo(e.llamar('revocarCaracterizacionDe', { codigo: 'D3-004' }, e.t['D3-003']), 'PERMISO');
  rechazo(e.llamar('revocarCaracterizacionDe', { codigo: 'D3-999' }, e.t['D3-002']), 'DATOS');
  igual(e.tabla('Caracterizaciones').length, 2);
});
prueba(S, 'Revocación: si no hay registro no falla ni escribe en la bitácora', () => {
  const e = escenarioAsistida();
  exito(e.llamar('revocarCaracterizacionDe', { codigo: 'D3-004' }, e.t['D3-002']));
  igual(e.tabla('Bitacora').filter(b => b.accion === 'revocacion-asistida').length, 0);
});
prueba(S, 'La brigadista del piso ve el apoyo de la asistida de su piso, no el de otro piso', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));                 // piso 2
  exito(asistida(e, 'D3-002', 'D3-005'));                 // piso 6
  const apoyos = exito(e.llamar('apoyos', {}, e.t['D3-003'])).apoyos;
  igual(apoyos.map(a => a.codigo), ['D3-004']);
  igual(apoyos[0].clave, envoltorio('D3-003'));
});
prueba(S, 'Si después se le da acceso, registra su llave y tras «reenvolver» puede abrir su registro', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));
  exito(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-004', roles: ['asesor'] }] }, e.token));
  const t4 = e.entrar('D3-004');
  igual(exito(e.llamar('miCaracterizacion', {}, t4)).registro.clave, null, 'Aún no puede abrirla');
  exito(e.llamar('registrarPar', { pub: pubDe('D3-004'), priv: 'privada-cifrada' }, t4));
  const r = exito(e.llamar('reenvolver', { cambios: [{ codigo: 'D3-004', agregar: { 'D3-004': envoltorio('D3-004') }, agregarApoyo: { 'D3-004': envoltorio('D3-004') } }] }, e.t['D3-002']));
  igual(r.n, 1);
  const mio = exito(e.llamar('miCaracterizacion', {}, t4)).registro;
  igual([mio.clave, mio.claveApoyo], [envoltorio('D3-004'), envoltorio('D3-004')]);
  igual(JSON.parse(mio.consentimiento ? JSON.stringify(mio.consentimiento) : 'null').modo, 'fisico');
});
prueba(S, 'Con acceso ya no se puede editar ni revocar de forma asistida', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));
  exito(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-004', roles: ['asesor'] }] }, e.token));
  rechazo(asistida(e, 'D3-002', 'D3-004'), 'PERMISO');
  rechazo(e.llamar('revocarCaracterizacionDe', { codigo: 'D3-004' }, e.t['D3-002']), 'PERMISO');
  igual(listado(e).find(x => x.codigo === 'D3-004').conAcceso, true);
});
prueba(S, 'La propia sobre una asistida usa fecha nueva y modo «propio» (no reutiliza la del papel)', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));
  exito(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-004', roles: ['asesor'] }] }, e.token));
  const t4 = e.entrar('D3-004');
  exito(e.llamar('registrarPar', { pub: pubDe('D3-004'), priv: 'privada-cifrada' }, t4));
  exito(e.llamar('guardarCaracterizacion', { datos: 'd2', apoyo: 'a2', claves: sobres(['D3-004', 'D3-002']), clavesApoyo: sobres(['D3-004', 'D3-002']), consentimiento: { v: 'v1' } }, t4));
  const c = JSON.parse(filaCarac(e, 'D3-004').consentimiento);
  igual([c.modo, c.por, c.f.startsWith('2026-10-15')], ['propio', 'D3-004', false]);
  igual(e.tabla('Bitacora').filter(b => b.accion === 'consentimiento' && b.codigo === 'D3-004').length, 1);
});
prueba(S, 'Si la persona se retira del Despacho, su registro asistido se borra', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));
  exito(e.llamar('guardarPadron', { personas: [{ codigo: 'D3-004', estado: 'inactivo' }] }, e.token));
  igual(e.tabla('Caracterizaciones').length, 0);
});

// ---------- Fase 6: errores, respuestas recordadas y contraseñas ----------

const M = 'Fase 6: errores y mensajes (servidor)';
const MENSAJE_GENERICO = 'Ocurrió un error en el servidor. Intente de nuevo en unos segundos.';
// Ejecuta fn con console.error capturado y lo restaura siempre.
const capturandoErrores = fn => {
  const original = console.error, vistos = [];
  console.error = (...a) => { vistos.push(a.join(' ')); };
  try { return { resultado: fn(), vistos }; } finally { console.error = original; }
};

prueba(M, 'Un error interno devuelve el mensaje genérico y deja el detalle en el registro del servidor', () => {
  const e = escenario();
  const { resultado: r, vistos } = capturandoErrores(() => e.llamar('guardarPadron', { personas: [null] }, e.token));
  rechazo(r, 'ERROR');
  igual(r.error, MENSAJE_GENERICO);
  afirmar(!/TypeError|null|undefined|codigo/i.test(r.error), 'El mensaje no debe revelar detalles internos');
  afirmar(vistos.length === 1 && vistos[0].includes('guardarPadron'), 'Debía registrar el detalle con console.error: ' + JSON.stringify(vistos));
});
prueba(M, 'Un error de usuario devuelve su propio texto y no se registra como error interno', () => {
  const e = escenario();
  const { resultado: r, vistos } = capturandoErrores(() => e.llamar('guardarPadron', { personas: [{ estado: 'activo' }] }, e.token));
  rechazo(r, 'ERROR');
  igual(r.error, 'Falta el código de una persona.');
  igual(vistos.length, 0);
});
prueba(M, 'Dejar al aplicativo sin administrador (padrón) devuelve el texto claro', () => {
  const e = escenario();
  const antes = e.snapshot();
  const r = e.llamar('guardarPadron', { personas: [{ codigo: 'D3-001', estado: 'inactivo' }] }, e.token);
  rechazo(r, 'ERROR');
  igual(r.error, 'Debe quedar al menos un administrador activo.');
  igual(e.snapshot(), antes, 'No debía escribir nada');
});
prueba(M, 'Una persona nueva sin credenciales y dos personas con el mismo correo devuelven su texto', () => {
  const e = escenario();
  const r1 = e.llamar('guardarPadron', { personas: [{ codigo: 'D3-050', piso: 2, puesto: 9 }] }, e.token);
  igual(r1.error, 'La persona D3-050 es nueva y le faltan credenciales.');
  const r2 = e.llamar('guardarPadron', { personas: [{ codigo: 'D3-003', hashCorreo: 'hc-D3-001' }] }, e.token);
  afirmar(/mismo correo/.test(r2.error), r2.error);
});
prueba(M, '«reenvolver» con envoltorios no válidos devuelve su texto', () => {
  const e = escenarioAsistida();
  exito(asistida(e, 'D3-002', 'D3-004'));
  const r = e.llamar('reenvolver', { cambios: [{ codigo: 'D3-004', agregar: { 'D3-004': envoltorio('D3-004') } }] }, e.t['D3-002']);   // D3-004 aún no tiene llave pública
  rechazo(r, 'ERROR');
  igual(r.error, 'Envoltorios no válidos.');
});
prueba(M, 'Una acción desconocida y una sesión vencida siguen con sus códigos', () => {
  const e = escenario();
  rechazo(e.llamar('noExiste', {}, e.token), 'ACCION');
  rechazo(e.llamar('base', {}), 'SESION');
});

const R = 'Fase 6: respuestas recordadas por sesión (servidor)';
const novedadConId = (e, id, token, extra) => e.llamar('guardarNovedad', { ...novedad(extra), idPeticion: id }, token);

prueba(R, 'Un reintento con el mismo idPeticion y el mismo token recibe la respuesta guardada sin repetir la acción', () => {
  const e = escenario();
  const a = exito(novedadConId(e, 'p-1', e.token));
  const b = exito(novedadConId(e, 'p-1', e.token));
  igual(b.novedad.id, a.novedad.id);
  igual(e.tabla('Novedades').length, 1);
});
prueba(R, 'La respuesta guardada NO se entrega a otra sesión que use el mismo idPeticion', () => {
  const e = escenario();
  const a = exito(novedadConId(e, 'p-2', e.token));
  const otro = exito(novedadConId(e, 'p-2', e.entrar('D3-002')));
  afirmar(otro.novedad.id !== a.novedad.id, 'Debía ejecutar la acción, no devolver la respuesta ajena');
  igual(otro.novedad.registradoPor, 'D3-002');
  igual(e.tabla('Novedades').length, 2);
});
prueba(R, 'Un reintento al ingresar con el mismo idPeticion devuelve la misma sesión', () => {
  const e = escenario();
  const a = exito(e.llamar('ingresar', { hashCorreo: 'hc-D3-001', verificador: 'v-D3-001', idPeticion: 'i-1' }));
  const b = exito(e.llamar('ingresar', { hashCorreo: 'hc-D3-001', verificador: 'v-D3-001', idPeticion: 'i-1' }));
  igual(b.token, a.token);
});
prueba(R, 'Al ingresar, otro correo con el mismo idPeticion no recibe la sesión de la primera persona', () => {
  const e = escenario();
  const a = exito(e.llamar('ingresar', { hashCorreo: 'hc-D3-001', verificador: 'v-D3-001', idPeticion: 'i-2' }));
  const b = exito(e.llamar('ingresar', { hashCorreo: 'hc-D3-002', verificador: 'v-D3-002', idPeticion: 'i-2' }));
  afirmar(b.token !== a.token, 'Debía crear su propia sesión');
  igual(b.perfil.codigo, 'D3-002');
});
prueba(R, 'Una contraseña equivocada con el idPeticion de otra persona tampoco recibe su respuesta', () => {
  const e = escenario();
  exito(e.llamar('ingresar', { hashCorreo: 'hc-D3-001', verificador: 'v-D3-001', idPeticion: 'i-3' }));
  rechazo(e.llamar('ingresar', { hashCorreo: 'hc-D3-002', verificador: 'mala', idPeticion: 'i-3' }), 'CREDENCIALES');
});
prueba(R, 'Las lecturas no se recuerdan (siempre traen lo último)', () => {
  const e = escenario();
  igual(exito(e.llamar('novedades', { idPeticion: 'l-1' }, e.token)).novedades.length, 0);
  exito(guardar(e));
  igual(exito(e.llamar('novedades', { idPeticion: 'l-1' }, e.token)).novedades.length, 1);
});

const C6 = 'Fase 6: contraseñas en instalaciones nuevas (servidor)';
prueba(C6, 'Una instalación nueva pide 10 caracteres y cambio de la contraseña temporal', () => {
  const e = escenario();
  const c = exito(e.llamar('base', {}, e.token)).config;
  igual(c.reglasClave.minimo, 10);
  igual(c.exigirCambioInicial, true);
});
prueba(C6, 'La configuración ya guardada manda sobre los valores nuevos', () => {
  const e = escenario();
  e.sembrar('Config', [
    { clave: 'reglasClave', valor: JSON.stringify({ minimo: 0, mayuscula: false, numero: false, simbolo: false }) },
    { clave: 'exigirCambioInicial', valor: 'false' }
  ]);
  const c = exito(e.llamar('base', {}, e.token)).config;
  igual(c.reglasClave.minimo, 0);
  igual(c.exigirCambioInicial, false);
});
prueba(C6, 'El administrador puede activar o desactivar ambas opciones', () => {
  const e = escenario();
  exito(e.llamar('guardarConfig', { reglasClave: { minimo: 0, mayuscula: false, numero: false, simbolo: false }, exigirCambioInicial: false }, e.token));
  const c = exito(e.llamar('base', {}, e.token)).config;
  igual([c.reglasClave.minimo, c.exigirCambioInicial], [0, false]);
});

// ---------- Ajustes de la auditoría del 15/10/2026 ----------

const AJ = 'Ajustes de auditoría: depuración al ingresar (servidor)';
const VIEJA = { fecha: '2020-01-01T00:00:00.000Z', codigo: 'D3-001', accion: 'ingreso', detalle: '' };
const RECIENTE = { fecha: '2026-10-19T14:00:00.000Z', codigo: 'D3-001', accion: 'ingreso', detalle: '' };
const antiguas = e => e.tabla('Bitacora').filter(b => b.fecha.startsWith('2020')).length;

prueba(AJ, 'Al ingresar se purga la bitácora vieja aunque nadie registre novedades', () => {
  const e = escenario();
  e.fijarFecha('2026-10-20');
  e.sembrar('Bitacora', [VIEJA, RECIENTE]);
  e.entrar('D3-002');
  igual(antiguas(e), 0, 'Debía borrar la entrada de 2020');
  afirmar(e.tabla('Bitacora').some(b => b.fecha === RECIENTE.fecha), 'Debía conservar la entrada reciente');
  igual(JSON.parse(e.tabla('Config').find(c => c.clave === 'ultimaPurga').valor), '2026-10-20');
});
prueba(AJ, 'Un segundo ingreso el mismo día no vuelve a purgar', () => {
  const e = escenario();
  e.fijarFecha('2026-10-20');
  e.entrar('D3-002');
  e.sembrar('Bitacora', [VIEJA]);
  e.entrar('D3-001');
  igual(antiguas(e), 1, 'La purga es una vez al día');
});
prueba(AJ, 'Un ingreso con contraseña equivocada no purga', () => {
  const e = escenario();
  e.fijarFecha('2026-10-20');
  e.sembrar('Bitacora', [VIEJA]);
  rechazo(e.llamar('ingresar', { hashCorreo: 'hc-D3-002', verificador: 'equivocada' }), 'CREDENCIALES');
  igual(antiguas(e), 1);
});
prueba(AJ, 'Al ingresar se borran las novedades vencidas', () => {
  const e = escenario();
  e.sembrar('Novedades', [
    { id: 'n-vieja', codigo: 'D3-003', tipo: 'no_asiste', desde: '2026-10-15', hasta: '2026-10-18', piso: '', puesto: '', registradoPor: 'D3-001', actualizado: '2026-10-15T10:00:00.000Z' },
    { id: 'n-vigente', codigo: 'D3-005', tipo: 'no_asiste', desde: '2026-10-19', hasta: '2026-10-25', piso: '', puesto: '', registradoPor: 'D3-001', actualizado: '2026-10-19T10:00:00.000Z' }
  ]);
  e.entrar('D3-002');
  igual(e.tabla('Novedades').map(n => n.id), ['n-vigente']);
});

const AN = 'Ajustes de auditoría: totales sin «No estaban» (navegador)';

prueba(AN, 'enSedeDe resta a quienes no estaban', () => {
  igual(nav.enSedeDe({ esperados: 10, noEstaban: 2 }), 8);
});
prueba(AN, 'enSedeDe sirve con informes anteriores que no traen noEstaban', () => {
  igual(nav.enSedeDe({ esperados: 5 }), 5);
});
prueba(AN, 'enSedeDe nunca da negativo y tolera datos vacíos', () => {
  igual(nav.enSedeDe({ esperados: 1, noEstaban: 3 }), 0);
  igual(nav.enSedeDe(null), 0);
  igual(nav.enSedeDe({}), 0);
});
prueba(AN, 'Informe real: 4 previstas, 3 evacuadas y 1 «no estaba» → 3 en la sede (100 %)', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  ['D3-001', 'D3-002', 'D3-003'].forEach(c => exito(marcar(e, 'D3-002', id, c, 'evacuado')));
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  exito(cerrar(e, 'D3-001', id));
  const r = informe(e, id);
  const p2 = piso2(r);
  igual([p2.esperados, p2.noEstaban, p2.evacuados], [4, 1, 3], 'Piso 2');
  igual(nav.enSedeDe(p2), 3);
  igual(Math.round(p2.evacuados / nav.enSedeDe(p2) * 100), 100, 'Porcentaje del piso 2');
  igual(nav.enSedeDe(r.total), r.total.esperados - 1, 'Total');
});

// ---------- Velocidad: lecturas en paralelo, una lectura por hoja y archivos filtrados ----------

const V = 'Velocidad del servidor (16/10/2026)';
const cuantas = lista => lista.reduce((o, t) => { o[t] = (o[t] || 0) + 1; return o; }, {});

prueba(V, 'Las acciones que solo leen no esperan el candado; las que escriben sí', () => {
  const e = escenario();
  ['ping', 'base', 'hoy', 'pulso', 'emergencia', 'bajarArchivo', 'historial', 'novedades', 'caracterizaciones', 'apoyos', 'miCaracterizacion', 'contactos']
    .forEach(a => igual(e.usaBloqueo(a), false, a));
  ['ingresar', 'guardarRoles', 'guardarNovedad', 'marcarEmergencia', 'activarEmergencia', 'cerrarEmergencia', 'reenvolver', 'subirArchivo', 'cambiarClave',
    'cargarContactos', 'guardarContactoDe', 'contactosOtroPiso']
    .forEach(a => igual(e.usaBloqueo(a), true, a));
});
prueba(V, 'Ninguna acción sin candado escribe en las hojas', () => {
  const e = escenario();
  ['ping', 'base', 'hoy', 'pulso', 'emergencia', 'historial', 'novedades', 'caracterizaciones', 'apoyos', 'miCaracterizacion', 'contactos'].forEach(a => {
    e.reiniciarEscrituras();
    e.llamar(a, {}, e.token);
    igual(e.escrituras(), [], a);
  });
});
prueba(V, 'La carga inicial (base) lee cada hoja una sola vez', () => {
  const e = escenario();
  e.reiniciarLecturas();
  exito(e.llamar('base', {}, e.token));
  const repetidas = Object.entries(cuantas(e.lecturas())).filter(([, n]) => n > 1);
  igual(repetidas, [], 'Hojas leídas más de una vez');
});
prueba(V, 'Guardar roles lee cada hoja una sola vez', () => {
  const e = escenario();
  e.reiniciarLecturas();
  exito(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-003', roles: ['asesor'], pisoBrigada: null }] }, e.token));
  const repetidas = Object.entries(cuantas(e.lecturas())).filter(([, n]) => n > 1);
  igual(repetidas, [], 'Hojas leídas más de una vez');
});
prueba(V, 'Lo escrito en una petición se ve en las lecturas siguientes de esa misma petición', () => {
  const e = escenario();
  // guardarNovedad escribe la novedad y después vuelve a leer la hoja para purgar las vencidas.
  const d = exito(guardar(e, { codigo: 'D3-005' }));
  afirmar(e.tabla('Novedades').some(n => n.id === d.novedad.id), 'La novedad nueva debía quedar guardada');
  afirmar(d.novedades.some(n => n.id === d.novedad.id), 'La respuesta debía incluirla');
});
prueba(V, 'Cada petición empieza sin memoria: ve los cambios hechos entre una y otra', () => {
  const e = escenario();
  exito(e.llamar('base', {}, e.token));
  const ps = e.tabla('Personas'); ps.push(persona(9, 6, 3)); e.sembrar('Personas', ps);
  const b = exito(e.llamar('base', {}, e.token));
  afirmar(b.personas.some(p => p.codigo === 'D3-009'), 'La segunda petición debía ver a la persona nueva');
});
prueba(V, 'Las acciones no dañan lo que la memoria guarda (cada lectura es una copia)', () => {
  const e = escenario();
  exito(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-003', roles: ['asesor'], pisoBrigada: null }] }, e.token));
  const p = e.tabla('Personas').find(x => x.codigo === 'D3-003');
  igual(p.roles, 'asesor');
  igual(e.tabla('Personas').length, 8, 'No debía duplicar ni perder personas');
});
prueba(V, 'Bajar un archivo con lectura filtrada da lo mismo y no lee la hoja completa', () => {
  const cargar = e => exito(e.llamar('subirArchivo', { id: 'punto', mime: 'image/png', partes: ['parte-a', 'parte-b', 'parte-c'], tam: 21 }, e.token));
  const normal = escenario(); cargar(normal);
  exito(normal.llamar('subirArchivo', { id: 'ruta-2', mime: 'image/png', partes: ['otra'], tam: 4 }, normal.token));
  const filtrado = crearEntorno({ conFiltrado: true });
  filtrado.fijarFecha('2026-10-19'); filtrado.sembrar('Puestos', PUESTOS);
  filtrado.sembrar('Personas', normal.tabla('Personas')); filtrado.sembrar('Config', normal.tabla('Config'));
  filtrado.sembrar('Archivos', normal.tabla('Archivos'));
  filtrado.token = filtrado.entrar('D3-001');
  filtrado.reiniciarLecturas();
  const a = exito(normal.llamar('bajarArchivo', { id: 'punto' }, normal.token));
  const b = exito(filtrado.llamar('bajarArchivo', { id: 'punto' }, filtrado.token));
  igual(b, a, 'Mismo resultado');
  igual(b.partes, ['parte-a', 'parte-b', 'parte-c']);
  afirmar(!filtrado.lecturas().includes('Archivos'), 'No debía leer la hoja Archivos completa');
  afirmar(filtrado.lecturas().includes('Archivos (filtrada)'), 'Debía usar la lectura filtrada');
});

// ---------- Puestos y distribución (v0.11, fase 1) ----------

const P = 'Puestos y distribución';

// Escenario: el piso 2 tiene posición en el esquema (puestos 1 a 10, en dos filas de cinco) y los demás no.
// D3-001 (admin) está en P2-1, D3-002 (coordinadora) en P2-2, D3-003 en P4-1, D3-004 (brigadista) en P4-2,
// D3-005 en P6-1, D3-006 en P6-2, D3-007 en P7-1 y D3-008 (inactiva) en P7-2. Los estados sembrados son los correctos,
// salvo P7-2, que se deja «ocupado» a propósito: es un dato viejo que el servidor debe corregir.
function escenarioPuestos() {
  const e = escenario();
  const ocupados = ['2-1', '2-2', '4-1', '4-2', '6-1', '6-2', '7-1', '7-2'];
  e.sembrar('Puestos', PUESTOS.map(x => ({
    piso: x.piso, puesto: x.puesto, estado: ocupados.includes(x.piso + '-' + x.puesto) ? 'ocupado' : 'vacante',
    ...(x.piso === 2
      ? { col: String(((x.puesto - 1) % 5) + 1), fila: String(Math.floor((x.puesto - 1) / 5) + 1), asignable: 'true' }
      : { col: '', fila: '', asignable: '' })
  })));
  e.reiniciarEscrituras();
  return e;
}
const estadosDe = (e, piso) => Object.fromEntries(e.tabla('Puestos').filter(x => Number(x.piso) === piso).map(x => [x.puesto, x.estado]));
const filaPuesto = (e, piso, puesto) => e.tabla('Puestos').find(x => Number(x.piso) === piso && Number(x.puesto) === puesto);
const mover = (e, codigo, piso, puesto) => exito(e.llamar('guardarPadron', { personas: [{ codigo, piso, puesto }] }, e.token));
// Entrada válida para guardarDistribucion: los puestos que ya tiene el piso, con su posición actual.
const puestosDelPiso = (e, piso) => e.tabla('Puestos').filter(x => Number(x.piso) === piso).map(x => ({
  puesto: Number(x.puesto), col: x.col === '' ? null : Number(x.col), fila: x.fila === '' ? null : Number(x.fila), asignable: x.asignable !== 'false'
}));
const distribuir = (e, piso, puestos, referencias, token) => e.llamar('guardarDistribucion', { piso, puestos, ...(referencias ? { referencias } : {}) }, token || e.token);
const ref = (extra = {}) => ({ tipo: 'escalera', etiqueta: 'Escalera norte', col: 8, fila: 1, ancho: 1, alto: 2, ...extra });
const fotoDistribucion = e => JSON.stringify([e.tabla('Puestos'), e.tabla('Referencias'), e.tabla('Bitacora').filter(x => x.accion === 'distribucion')]);

prueba(P, 'Con 0, 1 y 2 personas activas el puesto queda vacante, ocupado y compartido', () => {
  const e = escenarioPuestos();
  mover(e, 'D3-005', 4, 1);   // D3-003 ya está en P4-1: queda compartido; P6-1 queda sin nadie
  const piso4 = estadosDe(e, 4), piso6 = estadosDe(e, 6);
  igual(piso4[1], 'compartido');
  igual(piso4[2], 'ocupado');
  igual(piso4[3], 'vacante');
  igual(piso6[1], 'vacante');
});
prueba(P, 'Una persona inactiva no cuenta: su puesto queda vacante', () => {
  const e = escenarioPuestos();
  igual(estadosDe(e, 7)[2], 'ocupado', 'Dato viejo sembrado');
  mover(e, 'D3-003', 4, 1);   // cualquier guardado del padrón recalcula; D3-008 (inactiva) está en P7-2
  igual(estadosDe(e, 7)[2], 'vacante');
  igual(estadosDe(e, 7)[1], 'ocupado');
});
prueba(P, 'Cambiar de puesto deja libre el viejo y ocupado el nuevo', () => {
  const e = escenarioPuestos();
  mover(e, 'D3-003', 4, 5);
  igual(estadosDe(e, 4)[1], 'vacante');
  igual(estadosDe(e, 4)[5], 'ocupado');
});
prueba(P, 'Intercambiar dos personas (dos ítems) deja ambos puestos ocupados', () => {
  const e = escenarioPuestos();
  exito(e.llamar('guardarPadron', { personas: [{ codigo: 'D3-003', piso: 6, puesto: 1 }, { codigo: 'D3-005', piso: 4, puesto: 1 }] }, e.token));
  igual(estadosDe(e, 4)[1], 'ocupado');
  igual(estadosDe(e, 6)[1], 'ocupado');
  const a = e.tabla('Personas').find(x => x.codigo === 'D3-003');
  igual([a.piso, a.puesto], [6, 1]);
});
prueba(P, 'Retirar a una persona libera su puesto y reactivarla lo vuelve a ocupar', () => {
  const e = escenarioPuestos();
  exito(e.llamar('guardarPadron', { personas: [{ codigo: 'D3-003', estado: 'inactivo' }] }, e.token));
  igual(estadosDe(e, 4)[1], 'vacante');
  exito(e.llamar('guardarPadron', { personas: [{ codigo: 'D3-003', estado: 'activo' }] }, e.token));
  igual(estadosDe(e, 4)[1], 'ocupado');
});
prueba(P, 'Un guardado del padrón que no cambia estados no vuelve a escribir los puestos', () => {
  const e = escenarioPuestos();
  mover(e, 'D3-003', 4, 1);   // primera vez: corrige el dato viejo de P7-2
  e.reiniciarEscrituras();
  mover(e, 'D3-003', 4, 1);
  afirmar(!e.escrituras().includes('Puestos'), 'No debía escribir Puestos: ' + e.escrituras());
});
prueba(P, 'Cargar puestos del Excel conserva la posición y lo asignable de los que ya existían', () => {
  const e = escenarioPuestos();
  const antes = filaPuesto(e, 2, 3);
  exito(e.llamar('guardarPadron', {
    personas: [], puestos: [{ piso: 2, puesto: 3, estado: 'ocupado' }, { piso: 2, puesto: 1, estado: 'vacante' }, { piso: 2, puesto: 40, estado: 'vacante' }, { piso: 4, puesto: 1, estado: 'vacante' }]
  }, e.token));
  igual(e.tabla('Puestos').length, 4, 'Se reemplaza la lista por la del Excel');
  const p3 = filaPuesto(e, 2, 3);
  igual([p3.col, p3.fila, p3.asignable], [antes.col, antes.fila, antes.asignable]);
  igual([filaPuesto(e, 2, 40).col, filaPuesto(e, 2, 40).fila], ['', ''], 'El puesto nuevo queda sin posición');
  igual(filaPuesto(e, 2, 3).estado, 'vacante', 'El estado lo calcula el servidor, no el Excel');
  igual(filaPuesto(e, 2, 1).estado, 'ocupado');
  igual(filaPuesto(e, 4, 1).estado, 'ocupado');
});
prueba(P, 'Cargar un padrón sin puestos no toca la posición de ninguno', () => {
  const e = escenarioPuestos();
  const posiciones = () => e.tabla('Puestos').map(x => [x.piso, x.puesto, x.col, x.fila, x.asignable]);
  const antes = posiciones();
  mover(e, 'D3-003', 4, 5);
  igual(posiciones(), antes);
});

prueba(P, 'guardarDistribucion: solo el administrador (los demás roles reciben PERMISO)', () => {
  const e = escenarioPuestos();
  const coordinadora = e.entrar('D3-002'), brigadista = e.entrar('D3-004');
  const antes = fotoDistribucion(e);
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), null, coordinadora), 'PERMISO', 'coordinadora');
  rechazo(distribuir(e, 4, puestosDelPiso(e, 4), null, brigadista), 'PERMISO', 'brigadista');
  rechazo(e.llamar('guardarDistribucion', { piso: 2, puestos: puestosDelPiso(e, 2) }), 'SESION', 'sin sesión');
  igual(fotoDistribucion(e), antes, 'No debía escribir nada');
  exito(distribuir(e, 2, puestosDelPiso(e, 2)), 'La administradora sí puede');
});
prueba(P, 'guardarDistribucion rechaza un número de puesto repetido', () => {
  const e = escenarioPuestos();
  const antes = e.snapshot();
  const p = puestosDelPiso(e, 2); p[3].puesto = p[2].puesto;
  const r = distribuir(e, 2, p);
  rechazo(r, 'DATOS'); afirmar(/repetido/.test(r.error), r.error);
  igual(e.snapshot(), antes, 'No debía escribir nada');
});
prueba(P, 'guardarDistribucion rechaza un número de puesto fuera de 1 a 999 o que no es entero', () => {
  const e = escenarioPuestos();
  [0, 1000, -3, 2.5, 'x', null].forEach(n => {
    const p = puestosDelPiso(e, 2); p[9].puesto = n;
    rechazo(distribuir(e, 2, p), 'DATOS', 'número ' + n);
  });
});
prueba(P, 'guardarDistribucion rechaza dos puestos en la misma casilla', () => {
  const e = escenarioPuestos();
  const antes = e.snapshot();
  const p = puestosDelPiso(e, 2); p[4].col = p[0].col; p[4].fila = p[0].fila;
  const r = distribuir(e, 2, p);
  rechazo(r, 'DATOS'); afirmar(/ocupada dos veces/.test(r.error) && r.error.includes('P2-1') && r.error.includes('P2-5'), r.error);
  igual(e.snapshot(), antes);
});
prueba(P, 'guardarDistribucion rechaza una casilla fuera de rango y una posición a medias', () => {
  const e = escenarioPuestos();
  const antes = e.snapshot();
  [[25, 1], [0, 1], [1, 21], [1, 0], [1.5, 1], ['a', 1]].forEach(([col, fila]) => {
    const p = puestosDelPiso(e, 2); p[0].col = col; p[0].fila = fila;
    rechazo(distribuir(e, 2, p), 'DATOS', `casilla ${col},${fila}`);
  });
  const p = puestosDelPiso(e, 2); p[0].col = 3; p[0].fila = null;
  rechazo(distribuir(e, 2, p), 'DATOS', 'columna sin fila');
  igual(e.snapshot(), antes, 'No debía escribir nada');
  const q = puestosDelPiso(e, 2); q[0].col = 24; q[0].fila = 20;
  exito(distribuir(e, 2, q), 'La esquina (24, 20) es válida');
});
prueba(P, 'guardarDistribucion rechaza quitar un puesto con personas activas y dice quiénes', () => {
  const e = escenarioPuestos();
  const antes = e.snapshot();
  const r = distribuir(e, 2, puestosDelPiso(e, 2).filter(x => x.puesto !== 2));
  rechazo(r, 'DATOS');
  igual(r.error, 'El puesto P2-2 tiene asignada a D3-002: muévala antes de quitarlo.');
  igual(e.snapshot(), antes);
});
prueba(P, 'guardarDistribucion rechaza marcar como no asignable un puesto con personas activas', () => {
  const e = escenarioPuestos();
  const antes = e.snapshot();
  const p = puestosDelPiso(e, 2); p[0].asignable = false;
  const r = distribuir(e, 2, p);
  rechazo(r, 'DATOS');
  igual(r.error, 'El puesto P2-1 tiene asignada a D3-001: muévala antes de marcarlo como no asignable.');
  igual(e.snapshot(), antes);
});
prueba(P, 'En un puesto compartido el mensaje nombra a todas las personas activas', () => {
  const e = escenarioPuestos();
  mover(e, 'D3-005', 4, 1);   // P4-1: D3-003 y D3-005
  const r = distribuir(e, 4, puestosDelPiso(e, 4).filter(x => x.puesto !== 1));
  rechazo(r, 'DATOS');
  igual(r.error, 'El puesto P4-1 tiene asignadas a D3-003 y D3-005: muévalas antes de quitarlo.');
});
prueba(P, 'Una persona inactiva no impide quitar su puesto', () => {
  const e = escenarioPuestos();
  exito(distribuir(e, 7, puestosDelPiso(e, 7).filter(x => x.puesto !== 2)));   // P7-2 solo tiene a D3-008, inactiva
  afirmar(!filaPuesto(e, 7, 2), 'El puesto debía quitarse');
});
prueba(P, 'guardarDistribucion rechaza un piso sin puestos, una lista vacía o más de 200 puestos', () => {
  const e = escenarioPuestos();
  rechazo(distribuir(e, 5, [{ puesto: 1, col: 1, fila: 1 }]), 'DATOS', 'piso 5');
  rechazo(distribuir(e, 'x', [{ puesto: 1, col: 1, fila: 1 }]), 'DATOS', 'piso x');
  rechazo(distribuir(e, 7, []), 'DATOS', 'sin puestos');
  rechazo(e.llamar('guardarDistribucion', { piso: 7 }, e.token), 'DATOS', 'sin lista');
  rechazo(distribuir(e, 7, Array.from({ length: 201 }, (_, i) => ({ puesto: i + 1 }))), 'DATOS', '201 puestos');
});
prueba(P, 'guardarDistribucion acepta 200 puestos sin ubicar', () => {
  const e = escenarioPuestos();
  exito(distribuir(e, 7, Array.from({ length: 200 }, (_, i) => ({ puesto: i + 1 }))));
  igual(e.tabla('Puestos').filter(x => Number(x.piso) === 7).length, 200);
});
prueba(P, 'guardarDistribucion acepta mover, agregar y quitar puestos libres, y devuelve todos los pisos', () => {
  const e = escenarioPuestos();
  mover(e, 'D3-003', 4, 1);   // deja todos los estados al día
  const antesOtros = e.tabla('Puestos').filter(x => Number(x.piso) !== 2);
  const p = puestosDelPiso(e, 2)
    .filter(x => x.puesto !== 10)                                   // quita un puesto libre
    .map(x => (x.puesto === 5 ? { ...x, col: 9, fila: 3 } : x))      // mueve uno libre
    .concat([{ puesto: 11, col: 6, fila: 2, asignable: false }]);   // agrega uno, no asignable
  const d = exito(distribuir(e, 2, p));
  const t = e.tabla('Puestos');
  igual(t.filter(x => Number(x.piso) !== 2), antesOtros, 'Los demás pisos quedan intactos');
  igual(t.filter(x => Number(x.piso) === 2).map(x => Number(x.puesto)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
  igual([filaPuesto(e, 2, 5).col, filaPuesto(e, 2, 5).fila].map(String), ['9', '3']);
  igual([filaPuesto(e, 2, 11).col, filaPuesto(e, 2, 11).fila, filaPuesto(e, 2, 11).asignable, filaPuesto(e, 2, 11).estado].map(String), ['6', '2', 'false', 'vacante']);
  igual(d.puestos.length, t.length, 'Devuelve los puestos de todos los pisos');
  igual(d.puestos.filter(x => x.piso === 4).length, 8);
  igual(d.puestos.find(x => x.piso === 2 && x.puesto === 11), { piso: 2, puesto: 11, estado: 'vacante', col: 6, fila: 2, asignable: false });
  igual(d.puestos.find(x => x.piso === 2 && x.puesto === 1).estado, 'ocupado');
  igual(d.referencias, []);
});
prueba(P, 'guardarDistribucion reemplaza solo el piso editado y lo deja en su lugar de la hoja', () => {
  const e = escenarioPuestos();
  exito(distribuir(e, 4, puestosDelPiso(e, 4).slice(0, 5)));   // quita tres puestos libres del piso 4
  igual(e.tabla('Puestos').map(x => Number(x.piso)), [...Array(10).fill(2), ...Array(5).fill(4), ...Array(8).fill(6), ...Array(12).fill(7)]);
});
prueba(P, 'guardarDistribucion acepta puestos sin posición y los valores de texto de la hoja', () => {
  const e = escenarioPuestos();
  exito(distribuir(e, 6, [{ puesto: '1', col: '2', fila: '3', asignable: 'true' }, { puesto: 2, col: '', fila: '' }, { puesto: 3, asignable: 'false' }]));
  igual(String(filaPuesto(e, 6, 1).col), '2');
  igual(filaPuesto(e, 6, 2).col, '');
  igual(filaPuesto(e, 6, 3).asignable, 'false');
  igual(filaPuesto(e, 6, 1).estado, 'ocupado');
});
prueba(P, 'guardarDistribucion calcula el estado de los puestos que conserva', () => {
  const e = escenarioPuestos();
  mover(e, 'D3-005', 4, 1);
  const d = exito(distribuir(e, 4, puestosDelPiso(e, 4)));
  igual(d.puestos.find(x => x.piso === 4 && x.puesto === 1).estado, 'compartido');
  igual(filaPuesto(e, 4, 1).estado, 'compartido');
});

prueba(P, 'guardarDistribucion crea el id de las referencias nuevas y conserva el de las que ya lo traen', () => {
  const e = escenarioPuestos();
  const d = exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref(), ref({ id: 'esc-sur', etiqueta: 'Escalera sur', col: 12, fila: 1 })]));
  igual(d.referencias.length, 2);
  const nueva = d.referencias.find(r => r.etiqueta === 'Escalera norte');
  afirmar(/^[0-9a-f-]{36}$/.test(nueva.id), 'Debía crear un id: ' + nueva.id);
  igual(d.referencias.find(r => r.etiqueta === 'Escalera sur').id, 'esc-sur');
  igual(nueva, { piso: 2, id: nueva.id, tipo: 'escalera', etiqueta: 'Escalera norte', col: 8, fila: 1, ancho: 1, alto: 2 });
  igual(e.tabla('Referencias').length, 2);
  const d2 = exito(distribuir(e, 2, puestosDelPiso(e, 2), d.referencias.map(r => ({ ...r }))));
  igual(d2.referencias, d.referencias, 'Al guardar otra vez con el id no se duplica ni cambia');
});
prueba(P, 'guardarDistribucion reemplaza las referencias del piso y no toca las de los demás', () => {
  const e = escenarioPuestos();
  exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref()]));
  exito(distribuir(e, 4, puestosDelPiso(e, 4), [ref({ tipo: 'sala', etiqueta: 'Sala de juntas', col: 5, fila: 1, ancho: 3, alto: 2 })]));
  const piso4 = e.tabla('Referencias').find(r => Number(r.piso) === 4);
  const d = exito(distribuir(e, 2, puestosDelPiso(e, 2), []));   // quita las del piso 2
  igual(d.referencias.length, 1);
  igual(d.referencias[0].id, piso4.id);
  igual(e.tabla('Referencias').length, 1);
});
prueba(P, 'Una referencia ocupa ancho × alto casillas: choca con un puesto o con otra referencia', () => {
  const e = escenarioPuestos();
  const antes = e.snapshot();
  // P2-1 está en (1,1) y P2-6 en (1,2): una sala de 2 × 2 desde (1,1) los cubre.
  let r = distribuir(e, 2, puestosDelPiso(e, 2), [ref({ tipo: 'sala', etiqueta: 'Sala', col: 1, fila: 1, ancho: 2, alto: 2 })]);
  rechazo(r, 'DATOS'); afirmar(/ocupada dos veces/.test(r.error), r.error);
  r = distribuir(e, 2, puestosDelPiso(e, 2), [ref({ col: 10, fila: 5, ancho: 3, alto: 1 }), ref({ col: 12, fila: 4, ancho: 1, alto: 3 })]);
  rechazo(r, 'DATOS'); afirmar(/ocupada dos veces/.test(r.error), r.error);
  igual(e.snapshot(), antes);
  exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ col: 10, fila: 5, ancho: 3, alto: 1 }), ref({ col: 13, fila: 5, ancho: 1, alto: 3 })]), 'Dos referencias contiguas sí caben');
});
prueba(P, 'Una referencia no puede salirse del esquema ni tener medidas no válidas', () => {
  const e = escenarioPuestos();
  [
    ref({ col: 24, fila: 1, ancho: 2, alto: 1 }), ref({ col: 1, fila: 20, ancho: 1, alto: 2 }), ref({ ancho: 0 }), ref({ alto: 7 }), ref({ ancho: 1.5 }),
    ref({ col: 0 }), ref({ fila: 0 }), ref({ col: undefined }), ref({ fila: null })
  ].forEach((r, i) => rechazo(distribuir(e, 2, puestosDelPiso(e, 2), [r]), 'DATOS', 'referencia ' + i));
  exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ col: 19, fila: 15, ancho: 6, alto: 6 })]), 'Un bloque de 6 × 6 que termina en (24, 20) cabe');
});
prueba(P, 'Una referencia exige un tipo válido, una etiqueta de hasta 30 caracteres y un id sin repetir', () => {
  const e = escenarioPuestos();
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ tipo: 'bodega' })]), 'DATOS', 'tipo');
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ tipo: undefined })]), 'DATOS', 'sin tipo');
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ etiqueta: 'x'.repeat(31) })]), 'DATOS', 'etiqueta larga');
  exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ etiqueta: 'x'.repeat(30) })]), 'Treinta caracteres sí');
  ['escalera', 'sala', 'bano', 'ascensor', 'pasillo', 'otro'].forEach((tipo, i) =>
    exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ tipo, col: 10 + i })]), 'tipo ' + tipo));
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ id: 'igual' }), ref({ id: 'igual', col: 12 })]), 'DATOS', 'id repetido');
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ id: 'con espacios y <b>' })]), 'DATOS', 'id con caracteres raros');
  exito(distribuir(e, 4, puestosDelPiso(e, 4), [ref({ id: 'solo-piso-4' })]));
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ id: 'solo-piso-4' })]), 'DATOS', 'id de otro piso');
});
prueba(P, 'Máximo 40 referencias por piso', () => {
  const e = escenarioPuestos();
  const una = i => ref({ col: 10 + (i % 14), fila: 1 + Math.floor(i / 14), ancho: 1, alto: 1 });
  exito(distribuir(e, 2, puestosDelPiso(e, 2), Array.from({ length: 40 }, (_, i) => una(i))), '40 sí');
  rechazo(distribuir(e, 2, puestosDelPiso(e, 2), Array.from({ length: 41 }, (_, i) => una(i))), 'DATOS', '41 no');
});
prueba(P, 'La etiqueta se guarda sin espacios sobrantes ni caracteres de control, y una referencia puede no tenerla', () => {
  const e = escenarioPuestos();
  const d = exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref({ etiqueta: '  Sala\tde juntas \n' }), ref({ etiqueta: '', col: 12 })]));
  igual(d.referencias.map(r => r.etiqueta), ['Sala de juntas', '']);
});
prueba(P, 'guardarDistribucion deja constancia en la bitácora, sin datos personales', () => {
  const e = escenarioPuestos();
  exito(distribuir(e, 6, puestosDelPiso(e, 6)));
  const b = e.tabla('Bitacora').filter(x => x.accion === 'distribucion');
  igual(b.length, 1);
  igual([b[0].codigo, b[0].detalle], ['D3-001', 'piso 6']);
});
prueba(P, 'guardarDistribucion toma el candado y lee cada hoja una sola vez; base no toma el candado', () => {
  const e = escenarioPuestos();
  igual(e.usaBloqueo('guardarDistribucion'), true);
  igual(e.usaBloqueo('base'), false);
  e.reiniciarLecturas();
  exito(distribuir(e, 2, puestosDelPiso(e, 2), [ref()]));
  const repetidas = Object.entries(cuantas(e.lecturas())).filter(([, n]) => n > 1);
  igual(repetidas, [], 'Hojas leídas más de una vez');
});
prueba(P, 'Un reintento de guardarDistribucion con el mismo idPeticion no repite la acción', () => {
  const e = escenarioPuestos();
  const una = () => e.llamar('guardarDistribucion', { piso: 2, puestos: puestosDelPiso(e, 2), referencias: [ref()], idPeticion: 'reintento-1' }, e.token);
  const a = exito(una());
  const b = exito(una());
  igual(b, a, 'Misma respuesta recordada (mismo id de la referencia)');
  igual(e.tabla('Referencias').length, 1);
});

prueba(P, 'base trae col, fila, asignable y las referencias; los puestos sin posición vienen con null', () => {
  const e = escenarioPuestos();
  exito(distribuir(e, 4, [{ puesto: 1, col: 3, fila: 2 }, { puesto: 2 }, { puesto: 3, asignable: false }], [ref({ tipo: 'bano', etiqueta: 'Baños' })]));
  const b = exito(e.llamar('base', {}, e.token));
  igual(b.puestos.find(x => x.piso === 2 && x.puesto === 4), { piso: 2, puesto: 4, estado: 'vacante', col: 4, fila: 1, asignable: true });
  igual(b.puestos.find(x => x.piso === 4 && x.puesto === 1), { piso: 4, puesto: 1, estado: 'ocupado', col: 3, fila: 2, asignable: true });
  igual(b.puestos.find(x => x.piso === 4 && x.puesto === 3).asignable, false);
  igual(b.puestos.find(x => x.piso === 6 && x.puesto === 1), { piso: 6, puesto: 1, estado: 'ocupado', col: null, fila: null, asignable: true });
  igual(b.referencias.length, 1);
  igual(Object.keys(b.referencias[0]).sort(), ['alto', 'ancho', 'col', 'etiqueta', 'fila', 'id', 'piso', 'tipo']);
  igual(b.referencias[0].tipo, 'bano');
});
prueba(P, 'base sigue trayendo piso, puesto y estado para la v0.9.4, y no escribe nada', () => {
  const e = escenarioPuestos();
  e.reiniciarEscrituras();
  const b = exito(e.llamar('base', {}, e.token));
  b.puestos.forEach(x => afirmar('piso' in x && 'puesto' in x && 'estado' in x, 'Faltan campos en ' + JSON.stringify(x)));
  igual(b.referencias, []);
  igual(e.escrituras(), []);
});
prueba(P, 'base funciona aunque la hoja Referencias aún no exista (antes de ejecutar «instalar»)', () => {
  const e = escenarioPuestos();
  const guardado = {};
  // Un adaptador como el de Sheets falla al leer una hoja que no existe.
  const dep = {
    leer: t => { if (t === 'Referencias') throw new Error('Falta la hoja'); return copia(guardado[t] || e.tabla(t)); },
    escribir: (t, f) => { guardado[t] = copia(f); },
    agregar: (t, f) => { guardado[t] = (guardado[t] || e.tabla(t)).concat([copia(f)]); },
    agregarVarias: (t, f) => { guardado[t] = (guardado[t] || e.tabla(t)).concat(copia(f)); },
    prop: n => (n === 'PIMIENTA' ? 'pimienta-de-prueba' : ''), uuid: () => crypto.randomUUID(), ahora: () => e.ahora(), hoy: () => '2026-10-19', bloqueo: fn => fn()
  };
  const n = N.crearNucleo(dep);
  const ing = n.procesar({ accion: 'ingresar', hashCorreo: 'hc-D3-001', verificador: 'v-D3-001' });
  afirmar(ing.ok, 'No se pudo ingresar: ' + ing.error);
  const r = n.procesar({ accion: 'base', token: ing.datos.token });
  afirmar(r.ok, 'base debía responder: ' + r.error);
  igual(r.datos.referencias, []);
});
prueba(P, 'guardarRoles sigue validando los pisos de la brigada con los pisos únicos de la planta', () => {
  const e = escenarioPuestos();
  exito(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-005', roles: ['brigadista'], pisoBrigada: 6 }] }, e.token));
  rechazo(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-006', roles: ['brigadista'], pisoBrigada: 5 }] }, e.token), 'DATOS', 'piso 5 no existe');
  exito(e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-006', roles: ['brigadista'], pisoBrigada: 6 }] }, e.token), 'dos en el piso 6');
  const r = e.llamar('guardarRoles', { cambios: [{ codigo: 'D3-007', roles: ['brigadista'], pisoBrigada: 6 }] }, e.token);
  rechazo(r, 'DATOS'); afirmar(/piso 6 tiene más de 2/.test(r.error), r.error);
});
prueba(P, 'inicializar calcula el estado de los puestos y deja sin posición los que trae el Excel', () => {
  const e = crearEntorno();
  e.fijarFecha('2026-10-19');
  const items = [persona(1, 2, 1), persona(2, 2, 1)].map(p => ({
    codigo: p.codigo, piso: p.piso, puesto: p.puesto, hashCorreo: p.hashCorreo, verificador: 'v-' + p.codigo, roles: p.codigo === 'D3-001' ? ['admin'] : []
  }));
  exito(e.llamar('inicializar', { codigoInstalacion: 'CODIGO01', personas: items, puestos: [{ piso: 2, puesto: 1, estado: 'vacante' }, { piso: 2, puesto: 2, estado: 'ocupado' }] }));
  igual(e.tabla('Puestos').map(x => [x.puesto, x.estado, x.col, x.fila]), [[1, 'compartido', '', ''], [2, 'vacante', '', '']]);
});

// ---------- Contactos de emergencia (v0.12, fase 1: servidor) ----------

const CE = 'Contactos de emergencia';
// Pueden leer contactos: 1 admin, 2 coordinador, 3 suplente, 4 brigadista del piso 2 y 5 brigadista del piso 6.
const LECTORES_C = ['D3-001', 'D3-002', 'D3-003', 'D3-004', 'D3-005'];

// 6 asesora (piso 4); 7 y 10 sin acceso (pisos 2 y 7); 8 sin acceso (piso 6); 9 inactiva. Todo ficticio.
function escenarioContactos() {
  const e = crearEntorno();
  e.fijarFecha('2026-10-19');
  e.sembrar('Puestos', PUESTOS);
  const conLlave = (n, piso, puesto, extra) => persona(n, piso, puesto, { pub: pubDe('D3-' + String(n).padStart(3, '0')), ...extra });
  e.sembrar('Personas', [
    conLlave(1, 2, 1, { roles: 'admin' }),
    conLlave(2, 2, 2, { roles: 'coordinador' }),
    conLlave(3, 4, 1, { roles: 'suplente' }),
    conLlave(4, 2, 3, { roles: 'brigadista', pisoBrigada: 2 }),
    conLlave(5, 6, 1, { roles: 'brigadista', pisoBrigada: 6 }),
    conLlave(6, 4, 2, { roles: 'asesor' }),
    persona(7, 2, 4),
    persona(8, 6, 2),
    persona(9, 7, 1, { estado: 'inactivo' }),
    persona(10, 7, 2)
  ]);
  e.t = {};
  ['D3-001', 'D3-002', 'D3-003', 'D3-004', 'D3-005', 'D3-006'].forEach(c => { e.t[c] = e.entrar(c); });
  e.token = e.t['D3-001'];
  e.reiniciarEscrituras();
  return e;
}
const contacto = (codigo, extra = {}) => ({
  codigo, datos: 'cif-datos-' + codigo, claves: sobres(LECTORES_C), salud: 'cif-salud-' + codigo, clavesSalud: sobres(LECTORES_C), ...extra
});
const cargarC = (e, quien, ops) => e.llamar('cargarContactos', { ops }, e.t[quien]);
const corregirC = (e, quien, datos) => e.llamar('guardarContactoDe', datos, e.t[quien]);
const verC = (e, quien, datos = {}) => exito(e.llamar('contactos', datos, e.t[quien]));
const codigosC = lista => lista.map(x => x.codigo).sort();
const filaC = (e, codigo) => e.tabla('Contactos').find(x => x.codigo === codigo);
const bitacoraC = (e, accion) => e.tabla('Bitacora').filter(b => b.accion === accion).map(b => [b.codigo, b.detalle]);

prueba(CE, 'Administrador, coordinador y suplente cargan contactos por lote', () => {
  ['D3-001', 'D3-002', 'D3-003'].forEach(quien => {
    const e = escenarioContactos();
    const d = exito(cargarC(e, quien, ['D3-007', 'D3-008', 'D3-010'].map(c => contacto(c))), quien);
    igual(d.n, 3);
    igual(d.versiones, { 'D3-007': 1, 'D3-008': 1, 'D3-010': 1 });
    const f = filaC(e, 'D3-008');
    igual([f.datos, f.salud, f.fuente, f.por], ['cif-datos-D3-008', 'cif-salud-D3-008', 'carga', quien]);
    igual(f.cargado, f.actualizado);
    igual(Object.keys(JSON.parse(f.claves)).sort(), LECTORES_C);
    igual(bitacoraC(e, 'contactos-carga'), [[quien, '3 registro(s)']]);
  });
});
prueba(CE, 'La bitácora no guarda datos personales ni cifrados de los contactos', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-002', [contacto('D3-007')]));
  exito(corregirC(e, 'D3-002', contacto('D3-007', { datos: 'cif-otro' })));
  afirmar(!/cif-/.test(JSON.stringify(e.tabla('Bitacora'))), 'La bitácora tiene contenido de los contactos');
});
prueba(CE, 'Brigadistas y asesora no pueden cargar ni corregir el contacto de otra persona (PERMISO)', () => {
  const e = escenarioContactos();
  rechazo(cargarC(e, 'D3-004', [contacto('D3-007')]), 'PERMISO');
  rechazo(cargarC(e, 'D3-006', [contacto('D3-007', { claves: sobres([...LECTORES_C, 'D3-006']) })]), 'PERMISO');
  rechazo(corregirC(e, 'D3-004', contacto('D3-007')), 'PERMISO');
  rechazo(corregirC(e, 'D3-006', contacto('D3-007')), 'PERMISO');
  igual(e.tabla('Contactos'), []);
});
prueba(CE, 'Lote vacío, sin lista o de más de 500 contactos: se rechaza', () => {
  const e = escenarioContactos();
  rechazo(cargarC(e, 'D3-001', []), 'DATOS');
  rechazo(e.llamar('cargarContactos', {}, e.token), 'DATOS');
  rechazo(cargarC(e, 'D3-001', Array.from({ length: 501 }, () => contacto('D3-007'))), 'DATOS');
  igual(e.tabla('Contactos'), []);
});
prueba(CE, 'Lote todo o nada: un contacto inválido no deja escribir ninguno y el mensaje nombra el código', () => {
  const e = escenarioContactos();
  const r = cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-009')]);   // la 9 está inactiva
  rechazo(r, 'DATOS'); afirmar(/D3-009/.test(r.error), r.error);
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-999')]), 'DATOS', 'persona inexistente');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008', { datos: '' })]), 'DATOS', 'datos vacíos');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008', { datos: 'x'.repeat(45001) })]), 'DATOS', 'demasiado largo');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007'), null]), 'DATOS', 'operación vacía');
  igual(e.tabla('Contactos'), []);
  afirmar(!e.escrituras().includes('Contactos'), 'No debía escribir Contactos');
});
prueba(CE, 'Lote con una persona repetida: se rechaza', () => {
  const e = escenarioContactos();
  const r = cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-007')]);
  rechazo(r, 'DATOS'); afirmar(/dos veces/.test(r.error), r.error);
  igual(e.tabla('Contactos'), []);
});
prueba(CE, 'Volver a cargar reemplaza: sube la versión, deja un registro por persona y conserva a quien no vino', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008')]));
  e.fijarFecha('2026-10-20');
  const d = exito(cargarC(e, 'D3-002', [contacto('D3-007', { datos: 'cif-nuevo' })]));
  igual(d.versiones, { 'D3-007': 2 });
  igual(e.tabla('Contactos').length, 2);
  const f = filaC(e, 'D3-007');
  igual([f.datos, Number(f.version), f.por, f.cargado.slice(0, 10)], ['cif-nuevo', 2, 'D3-002', '2026-10-20']);
  igual(filaC(e, 'D3-008').datos, 'cif-datos-D3-008');
});
prueba(CE, 'Rechaza envoltorios de una llave desactualizada, para quien no puede leer contactos o sin el de quien carga', () => {
  const e = escenarioContactos();
  const viejo = { ...envoltorio('D3-002'), h: '0000000000000000' };
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007', { claves: { ...sobres(LECTORES_C), 'D3-002': viejo } })]), 'DATOS', 'llave vieja');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007', { claves: sobres([...LECTORES_C, 'D3-006']) })]), 'DATOS', 'asesora');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007', { clavesSalud: sobres([...LECTORES_C, 'D3-006']) })]), 'DATOS', 'asesora en EPS y ARL');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007', { claves: sobres(['D3-002', 'D3-003']) })]), 'DATOS', 'sin quien carga');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007', { clavesSalud: undefined })]), 'DATOS', 'EPS y ARL sin llaves');
  rechazo(cargarC(e, 'D3-001', [contacto('D3-007', { claves: { ...sobres(LECTORES_C), 'D3-007': envoltorio('D3-007') } })]), 'DATOS', 'persona sin llave pública');
  igual(e.tabla('Contactos'), []);
});
prueba(CE, 'Un contacto sin EPS ni ARL es válido y no guarda llaves de salud', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007', { salud: undefined, clavesSalud: undefined }), contacto('D3-008', { salud: '', clavesSalud: undefined })]));
  igual([filaC(e, 'D3-007').salud, filaC(e, 'D3-007').clavesSalud, filaC(e, 'D3-008').salud], ['', '', '']);
  const c = verC(e, 'D3-002').contactos.find(x => x.codigo === 'D3-007');
  igual([c.tieneSalud, 'salud' in c], [false, false]);
});
prueba(CE, 'Corregir (guardarContactoDe): conserva la fecha de carga, cambia la fuente y controla la versión', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007')]));
  const cargado = filaC(e, 'D3-007').cargado;
  e.fijarFecha('2026-10-21');
  const d = exito(corregirC(e, 'D3-003', contacto('D3-007', { datos: 'cif-corregido', versionBase: 1 })));
  igual([d.version, d.fuente, d.cargado], [2, 'coordinacion', cargado]);
  const f = filaC(e, 'D3-007');
  igual([f.datos, f.por, f.actualizado.slice(0, 10)], ['cif-corregido', 'D3-003', '2026-10-21']);
  rechazo(corregirC(e, 'D3-002', contacto('D3-007', { versionBase: 1 })), 'CONFLICTO');
  igual(bitacoraC(e, 'contacto'), [['D3-003', 'D3-007']]);
  // Sin carga previa: se crea con la fecha de carga vacía.
  igual(exito(corregirC(e, 'D3-002', contacto('D3-010', { versionBase: 0 }))).cargado, '');
});
prueba(CE, 'Cada persona con acceso corrige su propio contacto, pero no el de otra', () => {
  const e = escenarioContactos();
  const d = exito(corregirC(e, 'D3-006', contacto('D3-006', { claves: sobres([...LECTORES_C, 'D3-006']), clavesSalud: sobres(['D3-006', 'D3-001']) })));
  igual(d.fuente, 'propio');
  exito(corregirC(e, 'D3-004', contacto('D3-004')), 'el brigadista sobre sí mismo');
  rechazo(corregirC(e, 'D3-006', contacto('D3-007', { claves: sobres([...LECTORES_C, 'D3-006']) })), 'PERMISO');
  rechazo(corregirC(e, 'D3-006', contacto('D3-006')), 'DATOS', 'sin su propio envoltorio');
});
prueba(CE, 'Al retirar a una persona (guardarPadron) se borra su contacto', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008')]));
  exito(e.llamar('guardarPadron', { personas: [{ codigo: 'D3-007', estado: 'inactivo' }] }, e.token));
  igual(codigosC(e.tabla('Contactos')), ['D3-008']);
});
prueba(CE, 'Agregar o retirar personas sigue siendo solo del administrador', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007')]));
  rechazo(e.llamar('guardarPadron', { personas: [{ codigo: 'D3-007', estado: 'inactivo' }] }, e.t['D3-002']), 'PERMISO');
  rechazo(e.llamar('guardarPadron', { personas: [{ codigo: 'D3-007', estado: 'inactivo' }] }, e.t['D3-003']), 'PERMISO');
  igual(codigosC(e.tabla('Contactos')), ['D3-007']);
});
prueba(CE, 'El brigadista recibe solo los contactos de su piso (y el suyo), sin EPS ni ARL fuera de una emergencia', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', ['D3-002', 'D3-004', 'D3-007', 'D3-008', 'D3-010'].map(c => contacto(c))));
  const d = verC(e, 'D3-004');
  igual(codigosC(d.contactos), ['D3-002', 'D3-004', 'D3-007']);
  igual(d.contactos.filter(x => 'salud' in x).map(x => x.codigo), ['D3-004'], 'Solo su propia EPS y ARL');
  d.contactos.forEach(x => { igual(x.clave, envoltorio('D3-004')); afirmar(!('huellas' in x), 'No debe recibir huellas'); });
  afirmar(!('faltan' in d), 'El brigadista no recibe «faltan»');
  igual(codigosC(verC(e, 'D3-005').contactos), ['D3-008']);
  // Pedir otro piso en «contactos» no sirve: para eso está «Ver otro piso».
  igual(codigosC(verC(e, 'D3-004', { piso: 6 }).contactos), ['D3-002', 'D3-004', 'D3-007']);
});
prueba(CE, 'El brigadista no recibe un contacto que no trae su envoltorio', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007', { claves: sobres(['D3-001', 'D3-002']) })]));
  igual(verC(e, 'D3-004').contactos, []);
});
prueba(CE, 'Con una emergencia o un simulacro activo el brigadista recibe la EPS y la ARL de su piso; al cerrar, ya no', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007')]));
  const saludDe = () => verC(e, 'D3-004').contactos.find(x => x.codigo === 'D3-007');
  afirmar(!('salud' in saludDe()), 'Sin emergencia no debía recibirla');
  const id = exito(e.llamar('activarEmergencia', { tipo: 'sismo', descripcion: '' }, e.token)).emergencia.id;
  igual([saludDe().salud, saludDe().claveSalud], ['cif-salud-D3-007', envoltorio('D3-004')]);
  exito(e.llamar('cerrarEmergencia', { id, observaciones: '' }, e.token));
  afirmar(!('salud' in saludDe()), 'Después del cierre no debía recibirla');
  exito(e.llamar('activarEmergencia', { tipo: 'incendio', descripcion: '', simulacro: true }, e.token));
  igual(saludDe().salud, 'cif-salud-D3-007', 'En simulacro');
});
prueba(CE, 'La coordinación recibe todos los contactos, siempre con EPS y ARL, las huellas y «faltan»', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-002'), contacto('D3-007'), contacto('D3-008')]));
  ['D3-001', 'D3-002', 'D3-003'].forEach(quien => {
    const d = verC(e, quien);
    igual(codigosC(d.contactos), ['D3-002', 'D3-007', 'D3-008'], quien);
    d.contactos.forEach(x => {
      igual([x.salud, x.claveSalud, x.clave], ['cif-salud-' + x.codigo, envoltorio(quien), envoltorio(quien)], quien);
      igual(Object.keys(x.huellas).sort(), LECTORES_C);
      igual([x.fuente, x.por], ['carga', 'D3-001']);
    });
    igual(d.faltan, ['D3-001', 'D3-003', 'D3-004', 'D3-005', 'D3-006', 'D3-010'], quien);
  });
});
prueba(CE, 'La coordinación ve los contactos aunque aún no tenga su envoltorio (para actualizar llaves)', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007', { claves: sobres(['D3-001']), clavesSalud: sobres(['D3-001']) })]));
  const c = verC(e, 'D3-003').contactos[0];
  igual([c.codigo, c.clave, c.claveSalud, Object.keys(c.huellas)], ['D3-007', null, null, ['D3-001']]);
});
prueba(CE, 'Un contacto de una persona inactiva no se entrega a nadie ni cuenta en «faltan»', () => {
  const e = escenarioContactos();
  e.sembrar('Contactos', [{ codigo: 'D3-009', version: 1, datos: 'cif', claves: JSON.stringify(sobres(LECTORES_C)), salud: '', clavesSalud: '', fuente: 'carga', cargado: '', actualizado: '', por: 'D3-001' }]);
  const d = verC(e, 'D3-002');
  igual(d.contactos, []);
  afirmar(!d.faltan.includes('D3-009'), 'La persona inactiva no debía estar en «faltan»');
});
prueba(CE, 'La asesora solo recibe su propio contacto, con su EPS y ARL', () => {
  const e = escenarioContactos();
  const propio = sobres([...LECTORES_C, 'D3-006']);
  exito(cargarC(e, 'D3-001', [contacto('D3-006', { claves: propio, clavesSalud: propio }), contacto('D3-003'), contacto('D3-007')]));
  const d = verC(e, 'D3-006');
  igual(codigosC(d.contactos), ['D3-006']);
  igual(d.contactos[0].salud, 'cif-salud-D3-006');
  afirmar(!('faltan' in d), 'La asesora no recibe «faltan»');
});
prueba(CE, '«Ver otro piso»: el brigadista recibe ese piso y queda en la bitácora su código y el piso, sin datos', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008'), contacto('D3-010')]));
  const d = exito(e.llamar('contactosOtroPiso', { piso: 6 }, e.t['D3-004']));
  igual([d.piso, codigosC(d.contactos)], [6, ['D3-008']]);
  afirmar(!('salud' in d.contactos[0]), 'Sin emergencia no lleva EPS ni ARL');
  igual(bitacoraC(e, 'contactos-otro-piso'), [['D3-004', 'piso 6']]);
  exito(e.llamar('contactosOtroPiso', { piso: '7' }, e.t['D3-005']));
  igual(bitacoraC(e, 'contactos-otro-piso'), [['D3-004', 'piso 6'], ['D3-005', 'piso 7']]);
});
prueba(CE, '«Ver otro piso» durante una emergencia entrega la EPS y la ARL', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-008')]));
  exito(e.llamar('activarEmergencia', { tipo: 'sismo', descripcion: '' }, e.token));
  igual(exito(e.llamar('contactosOtroPiso', { piso: 6 }, e.t['D3-004'])).contactos[0].salud, 'cif-salud-D3-008');
});
prueba(CE, '«Ver otro piso»: su propio piso o la coordinación no dejan bitácora; piso inexistente y asesora se rechazan', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008')]));
  igual(codigosC(exito(e.llamar('contactosOtroPiso', { piso: 2 }, e.t['D3-004'])).contactos), ['D3-007']);
  igual(codigosC(exito(e.llamar('contactosOtroPiso', { piso: 6 }, e.t['D3-002'])).contactos), ['D3-008']);
  igual(bitacoraC(e, 'contactos-otro-piso'), []);
  rechazo(e.llamar('contactosOtroPiso', { piso: 5 }, e.t['D3-004']), 'DATOS');
  rechazo(e.llamar('contactosOtroPiso', { piso: 'x' }, e.t['D3-004']), 'DATOS');
  rechazo(e.llamar('contactosOtroPiso', { piso: 6 }, e.t['D3-006']), 'PERMISO');
  igual(bitacoraC(e, 'contactos-otro-piso'), []);
});
prueba(CE, '«contactos» no toma el candado y no escribe nada, con cualquier rol y con emergencia activa', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008')]));
  exito(e.llamar('activarEmergencia', { tipo: 'sismo', descripcion: '' }, e.token));
  igual(e.usaBloqueo('contactos'), false);
  ['D3-001', 'D3-002', 'D3-003', 'D3-004', 'D3-005', 'D3-006'].forEach(quien => {
    const antes = e.snapshot();
    e.reiniciarEscrituras();
    verC(e, quien, { piso: 6, idPeticion: 'repetida' });
    igual(e.escrituras(), [], quien);
    igual(e.snapshot(), antes, quien);
  });
});
prueba(CE, 'Sin sesión «contactos» responde SESION', () => {
  const e = escenarioContactos();
  rechazo(e.llamar('contactos', {}), 'SESION');
  rechazo(e.llamar('cargarContactos', { ops: [contacto('D3-007')] }), 'SESION');
});
prueba(CE, 'reenvolver con registro «contactos» agrega y quita envoltorios; la persona dueña nunca pierde el suyo', () => {
  const e = escenarioContactos();
  const propio = sobres(['D3-001', 'D3-006']);
  exito(cargarC(e, 'D3-001', [contacto('D3-007', { claves: sobres(['D3-001', 'D3-002']), clavesSalud: sobres(['D3-001']) }), contacto('D3-006', { claves: propio, clavesSalud: propio })]));
  igual(verC(e, 'D3-004').contactos, []);
  const d = exito(e.llamar('reenvolver', { registro: 'contactos', cambios: [
    { codigo: 'D3-007', agregar: sobres(['D3-004']), agregarSalud: sobres(['D3-004']), quitar: ['D3-002'] },
    { codigo: 'D3-006', quitar: ['D3-006'], quitarSalud: ['D3-006'] }
  ] }, e.t['D3-002']));
  igual(d.n, 2);
  igual(Object.keys(JSON.parse(filaC(e, 'D3-007').claves)).sort(), ['D3-001', 'D3-004']);
  igual(Object.keys(JSON.parse(filaC(e, 'D3-007').clavesSalud)).sort(), ['D3-001', 'D3-004']);
  igual(Object.keys(JSON.parse(filaC(e, 'D3-006').claves)).sort(), ['D3-001', 'D3-006'], 'La dueña conserva su acceso');
  igual(filaC(e, 'D3-007').datos, 'cif-datos-D3-007', 'Nunca toca los datos');
  igual(codigosC(verC(e, 'D3-004').contactos), ['D3-007']);
  igual(bitacoraC(e, 'accesos-contactos'), [['D3-002', '2 registro(s)']]);
});
prueba(CE, 'reenvolver de contactos rechaza destinatarios que no pueden leer contactos y no agrega llaves de salud si no hay EPS ni ARL', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007'), contacto('D3-008', { salud: undefined, clavesSalud: undefined })]));
  const antes = JSON.stringify(e.tabla('Contactos'));
  rechazo(e.llamar('reenvolver', { registro: 'contactos', cambios: [{ codigo: 'D3-007', agregar: sobres(['D3-006']) }] }, e.token), 'ERROR');
  igual(JSON.stringify(e.tabla('Contactos')), antes);
  exito(e.llamar('reenvolver', { registro: 'contactos', cambios: [{ codigo: 'D3-008', agregarSalud: sobres(['D3-004']) }] }, e.token));
  igual(filaC(e, 'D3-008').clavesSalud, '');
  rechazo(e.llamar('reenvolver', { registro: 'contactos', cambios: [] }, e.t['D3-004']), 'PERMISO');
});
prueba(CE, 'Compatibilidad v0.11.4: reenvolver sin «registro» sigue trabajando solo sobre las caracterizaciones', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007')]));
  e.sembrar('Caracterizaciones', [{ codigo: 'D3-007', version: 1, datos: 'c', claves: JSON.stringify(sobres(['D3-001'])), apoyo: 'a',
    clavesApoyo: JSON.stringify(sobres(['D3-001'])), consentimiento: '{}', actualizado: '' }]);
  const antes = JSON.stringify(e.tabla('Contactos'));
  exito(e.llamar('reenvolver', { cambios: [{ codigo: 'D3-007', agregar: sobres(['D3-002']), agregarApoyo: sobres(['D3-004']) }] }, e.token));
  igual(Object.keys(JSON.parse(e.tabla('Caracterizaciones')[0].claves)).sort(), ['D3-001', 'D3-002']);
  igual(Object.keys(JSON.parse(e.tabla('Caracterizaciones')[0].clavesApoyo)).sort(), ['D3-001', 'D3-004']);
  igual(JSON.stringify(e.tabla('Contactos')), antes);
  igual(bitacoraC(e, 'accesos'), [['D3-001', '1 registro(s)']]);
});
prueba(CE, 'Compatibilidad v0.11.4: base trae las mismas claves de siempre y no lee la hoja Contactos', () => {
  const e = escenarioContactos();
  exito(cargarC(e, 'D3-001', [contacto('D3-007')]));
  e.reiniciarLecturas();
  const b = exito(e.llamar('base', {}, e.t['D3-004']));
  igual(Object.keys(b).sort(), ['config', 'contenido', 'directorio', 'emergencia', 'hoy', 'novedades', 'perfil', 'personas', 'puestos', 'referencias']);
  afirmar(!e.lecturas().includes('Contactos'), 'base no debía leer Contactos');
  afirmar(!/cif-/.test(JSON.stringify(b)), 'base no debía traer contactos');
});
prueba(CE, 'Antes de ejecutar «instalar» (sin hoja Contactos): base, contactos, guardarPadron y reenvolver no fallan', () => {
  const e = escenarioContactos();
  const guardado = {};
  // Un adaptador como el de Sheets falla al leer o escribir una hoja que no existe.
  const falta = t => { if (t === 'Contactos') throw new Error('Falta la hoja "Contactos". Ejecute la función instalar().'); };
  const dep = {
    leer: t => { falta(t); return copia(guardado[t] || e.tabla(t)); },
    escribir: (t, f) => { falta(t); guardado[t] = copia(f); },
    agregar: (t, f) => { falta(t); guardado[t] = (guardado[t] || e.tabla(t)).concat([copia(f)]); },
    agregarVarias: (t, f) => { falta(t); guardado[t] = (guardado[t] || e.tabla(t)).concat(copia(f)); },
    prop: n => (n === 'PIMIENTA' ? 'pimienta-de-prueba' : ''), uuid: () => crypto.randomUUID(), ahora: () => e.ahora(), hoy: () => '2026-10-19', bloqueo: fn => fn()
  };
  const n = N.crearNucleo(dep);
  const ing = n.procesar({ accion: 'ingresar', hashCorreo: 'hc-D3-001', verificador: 'v-D3-001' });
  afirmar(ing.ok, 'No se pudo ingresar: ' + ing.error);
  const token = ing.datos.token;
  const b = n.procesar({ accion: 'base', token });
  afirmar(b.ok, 'base debía responder: ' + b.error);
  const c = n.procesar({ accion: 'contactos', token });
  afirmar(c.ok, 'contactos debía responder: ' + c.error);
  igual([c.datos.contactos, c.datos.faltan.length], [[], 9]);
  const r = n.procesar({ accion: 'reenvolver', token, cambios: [] });
  afirmar(r.ok, 'reenvolver debía responder: ' + r.error);
  const g = n.procesar({ accion: 'guardarPadron', token, personas: [{ codigo: 'D3-010', estado: 'inactivo' }] });
  afirmar(g.ok, 'guardarPadron debía responder: ' + g.error);
  igual(guardado.Personas.find(x => x.codigo === 'D3-010').estado, 'inactivo');
});

// ---------- Contactos: lectura del archivo y comparación con la llave (navegador, v0.12 fase 2) ----------

const CA = 'Contactos: lectura del archivo y comparación (navegador)';
// Archivo ficticio con las columnas del área de personal. «Teléfono» va dos veces: persona y familiar.
const CAB = ['Nombre', 'Teléfono', 'Correo', 'EPS', 'ARL', 'Nombre de un Familiar', 'Parentesco', 'Teléfono'];
const filaArchivo = (nombre, correo, extra = {}) => {
  const f = { tel: '300 000 0001', eps: 'EPS Ficticia', arl: 'ARL Ficticia', fam: 'Familiar Ficticio', par: 'Hermana', telFam: '3000000002', ...extra };
  return [nombre, f.tel, correo, f.eps, f.arl, f.fam, f.par, f.telFam];
};
const llavePrueba = () => [
  { codigo: 'D3-001', nombre: 'Persona Uno', correo: 'uno@ejemplo.test', estado: 'activo', piso: 2, puesto: 1 },
  { codigo: 'D3-002', nombre: 'Ángela Dos', correo: 'dos@ejemplo.test', estado: 'activo', piso: 4, puesto: 2 },
  { codigo: 'D3-003', nombre: 'Persona Tres', correo: 'tres@ejemplo.test', estado: 'inactivo', piso: 6, puesto: 1 },
  { codigo: 'D3-004', nombre: 'Persona Cuatro', correo: 'cuatro@ejemplo.test', estado: 'activo', piso: 7, puesto: 3 },
  { codigo: 'D3-005', nombre: 'Persona Cinco', correo: 'cinco@ejemplo.test', estado: 'activo', piso: 7, puesto: 4 }
];

prueba(CA, 'leerCsv: punto y coma, comillas, comillas dobles, BOM y saltos de línea de Windows', () => {
  const t = '﻿Nombre;Teléfono;Correo\r\n"Uno; con punto y coma";"300 ""1""";uno@ejemplo.test\r\nDos;;dos@ejemplo.test\r\n';
  igual(arch.leerCsv(t), [['Nombre', 'Teléfono', 'Correo'], ['Uno; con punto y coma', '300 "1"', 'uno@ejemplo.test'], ['Dos', '', 'dos@ejemplo.test']]);
});
prueba(CA, 'leerCsv: separador coma y un salto de línea dentro de un campo', () => {
  igual(arch.leerCsv('a,b\n"x\ny",z'), [['a', 'b'], ['x\ny', 'z']]);
});
prueba(CA, 'decodificarTexto: UTF-8 y Windows-1252 (CSV guardado por Excel) conservan las tildes', () => {
  igual(arch.decodificarTexto(new TextEncoder().encode('﻿Teléfono')), 'Teléfono');
  igual(arch.decodificarTexto(new Uint8Array([0x54, 0x65, 0x6c, 0xe9, 0x66, 0x6f, 0x6e, 0x6f])), 'Teléfono');
});
prueba(CA, 'interpretarContactos: separa el teléfono de la persona del teléfono del familiar', () => {
  const r = arch.interpretarContactos([CAB, filaArchivo('Persona Uno', 'uno@ejemplo.test', { tel: '3000000001', telFam: '6010000002' })]);
  igual(r.avisos, []);
  igual(r.registros[0], { fila: 2, nombre: 'Persona Uno', correo: 'uno@ejemplo.test', telefono: '3000000001', eps: 'EPS Ficticia', arl: 'ARL Ficticia',
    familiar: 'Familiar Ficticio', parentesco: 'Hermana', telefonoFamiliar: '6010000002', alertas: [] });
});
prueba(CA, 'interpretarContactos: títulos en mayúsculas, sin tildes y con filas de título arriba', () => {
  const cab = ['NOMBRE', 'TELEFONO', 'CORREO', 'EPS', 'ARL', 'NOMBRE DE UN FAMILIAR', 'PARENTESCO', 'TELEFONO'];
  const r = arch.interpretarContactos([['Contactos del Despacho'], [], cab, filaArchivo('Persona Uno', ' Uno@Ejemplo.TEST ')]);
  igual([r.registros.length, r.registros[0].fila, r.registros[0].correo, r.registros[0].telefonoFamiliar], [1, 4, 'uno@ejemplo.test', '3000000002']);
});
prueba(CA, 'interpretarContactos: sin columna «Correo» no se puede leer', () => {
  let error = '';
  try { arch.interpretarContactos([['Nombre', 'Teléfono'], ['Persona Uno', '3000000001']]); } catch (e) { error = e.message; }
  afirmar(/Correo/.test(error), 'Debía explicar que falta la columna Correo: ' + error);
});
prueba(CA, 'interpretarContactos: correo inválido o repetido queda en los avisos y no se toma', () => {
  const r = arch.interpretarContactos([CAB, filaArchivo('Persona Uno', 'uno@ejemplo.test'), filaArchivo('Sin Correo', 'no-es-correo'),
    filaArchivo('Persona Uno Bis', 'UNO@ejemplo.test'), ['', '', '', '', '', '', '', '']]);
  igual(r.registros.map(x => x.correo), ['uno@ejemplo.test']);
  igual(r.avisos.length, 2);
  afirmar(/Fila 3/.test(r.avisos[0]) && /Fila 4/.test(r.avisos[1]) && /fila 2/.test(r.avisos[1]), r.avisos.join(' | '));
});
prueba(CA, 'interpretarContactos: avisa las columnas que faltan', () => {
  const r = arch.interpretarContactos([['Nombre', 'Correo', 'Teléfono'], ['Persona Uno', 'uno@ejemplo.test', '3000000001']]);
  afirmar(/EPS/.test(r.avisos[0]) && /Parentesco/.test(r.avisos[0]), r.avisos[0]);
  igual([r.registros[0].telefono, r.registros[0].telefonoFamiliar], ['3000000001', '']);
});
prueba(CA, 'Teléfonos dudosos: celular, fijo e indicativo 57 valen; cortos, largos o dos en una celda se revisan', () => {
  ['3000000001', '300 000 0001', '+57 300 000 0001', '6010000001', '1234567'].forEach(t => igual(arch.telefonoDudoso(t), false, t));
  ['300000', '30000000011', '2000000001', '3000000001 / 3000000002'].forEach(t => igual(arch.telefonoDudoso(t), true, t));
  igual(arch.limpiarTelefono('Tel: (300) 000-0001'), '300 000-0001');
});
prueba(CA, 'Alertas: teléfonos faltantes o dudosos, familiar y EPS o ARL', () => {
  const r = arch.interpretarContactos([CAB, filaArchivo('Persona Uno', 'uno@ejemplo.test', { tel: '', fam: '', telFam: '12', eps: '' })]).registros[0];
  igual(r.alertas, ['Falta el teléfono de la persona', 'Falta el nombre del familiar', 'Revise el teléfono del familiar: 12', 'Falta la EPS o la ARL']);
});
prueba(CA, 'conciliar: empareja por correo, separa nuevas, retiradas, correo cambiado y ausentes', () => {
  const regs = arch.interpretarContactos([CAB,
    filaArchivo('Persona Uno', 'UNO@ejemplo.test'),          // emparejada (mayúsculas)
    filaArchivo('Persona Tres', 'tres@ejemplo.test'),        // retirada en la app
    filaArchivo('angela dos', 'angela.nueva@ejemplo.test'),  // mismo nombre, otro correo
    filaArchivo('Persona Seis', 'seis@ejemplo.test')         // nueva
  ]).registros;
  const c = arch.conciliar(regs, llavePrueba(), new Set(['D3-001']));
  igual(c.emparejadas.map(e => [e.codigo, e.reemplaza, e.piso, e.puesto]), [['D3-001', true, 2, 1]]);
  igual(c.retiradas.map(e => e.codigo), ['D3-003']);
  igual(c.correoCambiado.map(e => [e.codigo, e.correoApp, e.registro.correo]), [['D3-002', 'dos@ejemplo.test', 'angela.nueva@ejemplo.test']]);
  igual(c.nuevas.map(n => [n.registro.correo, n.agregar, n.piso]), [['seis@ejemplo.test', true, null]]);
  igual(c.ausentes.map(a => a.codigo), ['D3-004', 'D3-005']);
});
prueba(CA, 'conciliar: un nombre repetido en la app no se usa para adivinar un correo cambiado', () => {
  const llaveRep = llavePrueba().concat([{ codigo: 'D3-009', nombre: 'Persona Cuatro', correo: 'otro.cuatro@ejemplo.test', estado: 'activo', piso: 2, puesto: 9 }]);
  const regs = arch.interpretarContactos([CAB, filaArchivo('Persona Cuatro', 'cuatro.nuevo@ejemplo.test')]).registros;
  const c = arch.conciliar(regs, llaveRep);
  igual([c.correoCambiado.length, c.nuevas.length], [0, 1]);
});
prueba(CA, 'conciliar: si el correo de la app también está en el archivo, el nombre igual no es un correo cambiado', () => {
  const regs = arch.interpretarContactos([CAB, filaArchivo('Persona Uno', 'uno@ejemplo.test'), filaArchivo('Persona Uno', 'uno.homonima@ejemplo.test')]).registros;
  const c = arch.conciliar(regs, llavePrueba());
  igual([c.emparejadas.length, c.correoCambiado.length, c.nuevas.length], [1, 0, 1]);
});
prueba(CA, 'Lo que se cifra: contacto y, aparte, EPS y ARL; una fila sin datos no se carga', () => {
  const r = arch.interpretarContactos([CAB, filaArchivo('Persona Uno', 'uno@ejemplo.test'),
    filaArchivo('Persona Dos', 'dos@ejemplo.test', { tel: '', eps: '', arl: '', fam: '', par: '', telFam: '' })]).registros;
  igual(arch.datosDe(r[0]), { telefono: '300 000 0001', familiar: { nombre: 'Familiar Ficticio', parentesco: 'Hermana', telefono: '3000000002' } });
  igual(arch.saludDe(r[0]), { eps: 'EPS Ficticia', arl: 'ARL Ficticia' });
  igual([arch.tieneDatos(r[0]), arch.tieneDatos(r[1]), arch.saludDe(r[1])], [true, false, null]);
});

// ---------- Ejecución y resultado ----------

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function principal() {
  if (!LOCAL) { salida.textContent = 'Solo se ejecuta en el computador local'; return; }
  try {
    const codigo = await (await fetch('../servidor/Nucleo.gs', { cache: 'no-store' })).text();
    N = new Function(codigo + '\nreturn { crearNucleo: crearNucleo, presenciaDe: presenciaDe, diaISO: diaISO, sha256: sha256 };')();
    nav = await import('../web/js/presencia.js');
    arch = await import('../web/js/archivo-contactos.js');
  } catch (e) {
    salida.innerHTML = `<div id="resumen" class="mal">No se pudo cargar el núcleo: ${esc(e.message)}</div>`;
    return;
  }
  const filas = [];
  let ultimoGrupo = '';
  let ok = 0;
  for (const p of pruebas) {
    let resultado = 'OK', detalle = '';
    try { p.fn(); ok++; } catch (e) { resultado = 'FALLA'; detalle = e && e.message ? e.message : String(e); }
    if (p.grupo !== ultimoGrupo) { filas.push(`<tr class="grupo"><td colspan="3">${esc(p.grupo)}</td></tr>`); ultimoGrupo = p.grupo; }
    filas.push(`<tr><td>${esc(p.nombre)}</td><td class="${resultado}">${resultado}</td><td>${esc(detalle)}</td></tr>`);
  }
  const fallan = pruebas.length - ok;
  const texto = fallan === 0
    ? `TOTAL: ${pruebas.length} pruebas · ${ok} OK · 0 FALLAN · 100 % OK`
    : `TOTAL: ${pruebas.length} pruebas · ${ok} OK · ${fallan} FALLAN · ${Math.round(ok * 100 / pruebas.length)} % OK`;
  salida.innerHTML = `<div id="resumen" class="${fallan === 0 ? 'ok' : 'mal'}">${texto}</div>
    <table><thead><tr><th>Prueba</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>${filas.join('')}</tbody></table>
    <p id="resumen-final">${texto}</p>`;
}

principal();
