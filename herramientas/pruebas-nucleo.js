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
  const t = e.entrar('D3-003');
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
  ['D3-001', 'D3-002', 'D3-003', 'D3-004', 'D3-005', 'D3-006', 'D3-007'].forEach(c => { e.t = e.t || {}; e.t[c] = e.entrar(c); });
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

prueba(E, 'Una persona sin rol no puede marcar «no estaba» a otra', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  igual(exito(marcar(e, 'D3-003', id, 'D3-004', 'no_estaba')).resultados[0].estado, 'permiso');
  igual(!!marcaDe(e, id, 'D3-004'), false, 'No debía quedar ninguna marca');
});
prueba(E, 'Una persona sin rol no puede marcarse «no estaba» a sí misma', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-003', id, 'D3-003', 'no_estaba'));
  afirmar(!(marcaDe(e, id, 'D3-003') || {}).estado, 'No debía quedar el estado no_estaba');
});
prueba(E, 'Una persona sin rol sí puede marcarse «evacuado» (sin cambio)', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-003', id, 'D3-003', 'evacuado'));
  igual(marcaDe(e, id, 'D3-003').estado, 'evacuado');
});
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
prueba(E, 'Quien no reporta recibe cifras con «no estaban» y no ve marcas ajenas', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(marcar(e, 'D3-002', id, 'D3-004', 'no_estaba'));
  const d = exito(e.llamar('emergencia', { id }, e.t['D3-003']));
  igual(d.marcas.length, 0);
  igual(d.cifras.pisos.find(p => p.piso === 2).noEstaban, 1);
  igual(d.cifras.total.noEstaban, 1);
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
  const p = exito(e.llamar('emergencia', { id }, e.t['D3-003'])).cifras.pisos.find(x => x.piso === 2);
  igual([p.esperados, p.noEstaban, p.evacuados, p.noUbicados, p.pendientes], [4, 1, 1, 1, 1]);   // 4 − 1 − 1 − 1 − 0
});
prueba(E, 'Con conteo: los pendientes no bajan de cero', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  exito(e.llamar('marcarEmergencia', { ops: [{ id: 'c1', emergencia: id, momento: e.ahora() + 1000, tipo: 'conteo', piso: 2, campos: { evacuados: 9, noUbicados: 0, apoyo: 0 } }] }, e.t['D3-002']));
  igual(exito(e.llamar('emergencia', { id }, e.t['D3-003'])).cifras.pisos.find(x => x.piso === 2).pendientes, 0);
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
prueba(E, 'Una persona sin rol no puede cerrar', () => {
  const e = escenarioEmergencia(); const id = activar(e);
  rechazo(cerrar(e, 'D3-003', id), 'PERMISO');
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
