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

function crearEntorno() {
  const tablas = {};
  let escrituras = [];
  const reloj = { ahora: 0, hoy: '' };
  const props = { PIMIENTA: 'pimienta-de-prueba', CODIGO_INSTALACION: 'CODIGO01' };
  const memoria = new Map();
  const dep = {
    leer: t => copia(tablas[t] || []),
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
  const e = escenario();
  const vieja = { fecha: '2020-01-01T00:00:00.000Z', codigo: 'D3-001', accion: 'ingreso', detalle: '' };
  e.sembrar('Bitacora', [vieja]);
  exito(guardar(e));
  igual(e.tabla('Bitacora').filter(b => b.fecha.startsWith('2020')).length, 0, 'Debía purgar la antigua');
  e.sembrar('Bitacora', [vieja]);
  exito(guardar(e, { codigo: 'D3-005' }));
  igual(e.tabla('Bitacora').filter(b => b.fecha.startsWith('2020')).length, 1, 'No debía purgar de nuevo el mismo día');
  e.fijarFecha('2026-10-20');
  exito(guardar(e, { codigo: 'D3-005', desde: '2026-10-20', hasta: '2026-10-20' }));
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

// ---------- Ejecución y resultado ----------

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function principal() {
  if (!LOCAL) { salida.textContent = 'Solo se ejecuta en el computador local'; return; }
  try {
    const codigo = await (await fetch('../servidor/Nucleo.gs', { cache: 'no-store' })).text();
    N = new Function(codigo + '\nreturn { crearNucleo: crearNucleo, presenciaDe: presenciaDe, diaISO: diaISO, sha256: sha256 };')();
    nav = await import('../web/js/presencia.js');
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
