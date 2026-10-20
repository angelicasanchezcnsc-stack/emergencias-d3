/**
 * EMERGENCIAS D3 — Núcleo del servidor.
 *
 * Contiene toda la lógica y no depende de Google: recibe un "adaptador" que sabe
 * leer y escribir tablas. Codigo.gs le entrega uno para Google Sheets; el modo
 * simulado del navegador le entrega otro sobre localStorage. Para migrar a otro
 * servidor basta con escribir un adaptador nuevo.
 *
 * El servidor solo conoce códigos (D3-001…), huellas (hash) y sobres cifrados.
 * Nunca recibe nombres, correos, celulares ni contraseñas en claro.
 */

var ESQUEMA = {
  // "pub": llave pública de la persona (para que otros le envuelvan datos sensibles).
  // "agenda": días presenciales. '' = lunes a viernes; 'ocasional' = sin días fijos;
  // '1,3,5' = días ISO (1 = lunes ... 7 = domingo), separados por coma y ordenados.
  Personas: ['codigo', 'piso', 'puesto', 'estado', 'roles', 'pisoBrigada', 'hashCorreo', 'verificador',
    'sobres', 'debeCambiar', 'intentos', 'bloqueadoHasta', 'actualizado', 'pub', 'agenda'],
  // "estado" lo calcula el servidor según las personas activas del puesto: vacante, ocupado o compartido.
  // "col" (1 a 24) y "fila" (1 a 20) ubican el puesto en el esquema del piso; vacíos = sin ubicar.
  // "asignable": 'true' o 'false' (vacío = 'true'). Las columnas nuevas van al final por compatibilidad.
  Puestos: ['piso', 'puesto', 'estado', 'col', 'fila', 'asignable'],
  // Puntos de referencia del esquema de cada piso (escalera, sala...). "ancho" y "alto" en casillas (1 a 6).
  Referencias: ['piso', 'id', 'tipo', 'etiqueta', 'col', 'fila', 'ancho', 'alto'],
  Sesiones: ['tokenHash', 'codigo', 'creada', 'expira'],
  Sobres: ['nombre', 'version', 'datos', 'actualizado'],
  Config: ['clave', 'valor'],
  Bitacora: ['fecha', 'codigo', 'accion', 'detalle'],
  // Novedades de presencia (planeación, sin motivo): quién no asiste, está en otro lugar o
  // asiste fuera de su agenda, por rango de fechas. Se borran solas al vencer.
  // "tipo": no_asiste | otro_lugar | asiste. "desde" y "hasta": AAAA-MM-DD (hora de Bogotá).
  // "piso" y "puesto" solo para otro_lugar (puesto 0 = sala o área común del piso).
  Novedades: ['id', 'codigo', 'tipo', 'desde', 'hasta', 'piso', 'puesto', 'registradoPor', 'actualizado'],
  // Obsoletas desde la v0.9: el registro horario ya no se usa. Siguen en el esquema para no
  // romper instalar(); ningún código las lee ni las escribe.
  RegistroHoy: ['fecha', 'codigo', 'estado', 'piso', 'puesto', 'excepcion', 'ingreso', 'salida', 'reportadoPor', 'actualizado', 'momentos'],
  RegistroHistorico: ['fecha', 'codigo', 'estado', 'piso', 'puesto', 'excepcion', 'ingreso', 'salida', 'reportadoPor', 'actualizado', 'momentos'],
  // Archivos cifrados (mapas, rutas, planos) partidos en trozos que caben en una celda.
  Archivos: ['id', 'parte', 'datos'],
  // Emergencias y simulacros. "esperados" es la foto de quién estaba en la sede, por piso,
  // al momento de activar (solo códigos).
  // Al cerrar, "resumen" guarda solo totales y tiempos; se borra el detalle por persona.
  Emergencias: ['id', 'tipo', 'descripcion', 'simulacro', 'estado', 'inicio', 'activadaPor', 'cierre', 'cerradaPor', 'version', 'esperados', 'resumen'],
  MarcasEmergencia: ['emergencia', 'codigo', 'estado', 'asistencia', 'llegada', 'reportadoPor', 'actualizado', 'momentos'],
  ConteosEmergencia: ['emergencia', 'piso', 'evacuados', 'noUbicados', 'apoyo', 'reportadoPor', 'actualizado', 'momentos'],
  // Caracterización individual para emergencias. Todo viene cifrado desde el navegador:
  // "datos" es el detalle completo (lo leen la persona y la coordinación) y "apoyo" es
  // solo lo que necesitan brigadistas y acompañante. "claves" y "clavesApoyo" guardan, por
  // destinatario, la llave de los datos envuelta con su llave pública. El servidor no puede leer nada.
  // "consentimiento" es un JSON { v, f, modo, por }: versión del texto aceptado, fecha, "propio" (la persona
  // lo aceptó en la app) o "fisico" (formato impreso y firmado, registrado por "por", de la coordinación).
  Caracterizaciones: ['codigo', 'version', 'datos', 'claves', 'apoyo', 'clavesApoyo', 'consentimiento', 'actualizado'],
  // Contacto de emergencia de cada persona (v0.12), cargado por la coordinación desde el archivo del área
  // de personal. Separado de la caracterización: no lleva datos de salud ni depende del consentimiento.
  // Dos bloques cifrados en el navegador, cada uno con su propia llave aleatoria:
  //   "datos": teléfono de la persona y su familiar (nombre, parentesco, teléfono). Lo leen la coordinación,
  //            los brigadistas de su piso (y de otro piso si lo piden, con bitácora) y la persona.
  //   "salud": EPS y ARL. La coordinación y la persona siempre; los brigadistas, solo con una emergencia
  //            o simulacro activo (el servidor no lo entrega fuera de una emergencia).
  // "fuente": carga | coordinacion | propio. "cargado": fecha de la última carga desde el archivo.
  // "por": código de quien escribió por última vez.
  Contactos: ['codigo', 'version', 'datos', 'claves', 'salud', 'clavesSalud', 'fuente', 'cargado', 'actualizado', 'por']
};

// Acceso = tener al menos un rol. Quien no tiene rol sigue en el padrón (cuenta en las listas de la
// emergencia y su nombre está en el directorio) pero no puede ingresar.
var ROLES_VALIDOS = ['admin', 'coordinador', 'suplente', 'brigadista', 'asesor'];
var MAX_BRIGADISTAS_POR_PISO = 2;

// Distribución de pisos (esquema tipo sala de cine)
var TIPOS_REFERENCIA = ['escalera', 'sala', 'bano', 'ascensor', 'pasillo', 'otro'];
var MAX_COLUMNAS = 24;
var MAX_FILAS = 20;
var MAX_PUESTOS_PISO = 200;
var MAX_REFERENCIAS_PISO = 40;
var MAX_LADO_REFERENCIA = 6;   // ancho y alto máximos, en casillas
var MAX_ETIQUETA = 30;

// Novedades de presencia
var TIPOS_NOVEDAD = ['no_asiste', 'otro_lugar', 'asiste'];
var MAX_DIAS_NOVEDAD = 92;   // días del rango, contando el primero y el último
var MAX_FESTIVOS = 60;

// Contenido institucional (siempre cifrado en el navegador). Cada sobre indica
// quién puede modificarlo.
var SOBRES_CONTENIDO = {
  contactos: ['admin', 'coordinador', 'suplente'],
  recomendaciones: ['admin'],
  rutas: ['admin'],
  consentimiento: ['admin']   // texto de la autorización de tratamiento de datos
};

// Quién puede leer el detalle completo de la caracterización de cualquier persona.
var ROLES_LECTORES = ['admin', 'coordinador', 'suplente'];
var MAX_DESTINATARIOS = 80;
var LIMITE_CELDA = 45000;   // Google Sheets admite 50.000 caracteres por celda
var MAX_PARTES = 60;
var ARCHIVO_VALIDO = /^(punto|ruta-\d{1,2}|plano-\d{1,2})$/;
var MIMES_VALIDOS = ['image/jpeg', 'image/png', 'application/pdf'];

// Emergencias
var TIPOS_EMERGENCIA = ['sismo', 'incendio', 'estructural', 'riesgo-publico', 'atentado', 'otro'];
// "no_estaba": la persona figuraba prevista pero ese día no estaba en la sede. No cuenta como
// pendiente ni como evacuada. Como "no_ubicado", solo la ponen quienes reportan.
var ESTADOS_EN_EMERGENCIA = ['evacuado', 'no_ubicado', 'apoyo', 'no_estaba'];
var ROLES_ACTIVAR = ['admin', 'coordinador', 'suplente', 'brigadista'];
var ROLES_SIMULACRO_INICIAR = ['admin', 'coordinador', 'suplente', 'brigadista'];   // igual que ROLES_ACTIVAR (v0.13)
var ROLES_CERRAR = ['admin', 'coordinador', 'suplente', 'brigadista'];   // emergencias reales y simulacros
var ROLES_REPORTAR = ['admin', 'coordinador', 'suplente', 'brigadista', 'asesor'];
var MAX_INTENTOS = 5;
var MINUTOS_BLOQUEO = 15;

var CONFIG_INICIAL = {
  // Para instalaciones nuevas. La configuración que ya está guardada manda: en una instalación existente
  // el administrador activa estas opciones en Administración, Configuración.
  reglasClave: { minimo: 10, mayuscula: false, numero: false, simbolo: false },
  exigirCambioInicial: true,
  diasSesion: 30,
  // Días que se conserva la bitácora (lo mínimo necesario).
  diasBitacora: 365,
  // Días que se conserva el detalle por persona (solo códigos) de una emergencia cerrada (v0.13).
  diasDetalleSimulacro: 90,
  diasDetalleEmergencia: 365,
  // Fechas AAAA-MM-DD sin actividad presencial (festivos).
  festivos: []
};

// Error que le habla al usuario: su mensaje sí se devuelve tal cual. Cualquier otro error es interno y la
// respuesta lleva un mensaje genérico (el detalle queda en el registro de ejecuciones del servidor).
function ErrorUsuario(mensaje) { var e = new Error(mensaje); e.usuario = true; return e; }

// Día de la semana ISO de una fecha 'AAAA-MM-DD' (1 = lunes ... 7 = domingo). Usa UTC para no
// depender de la zona del servidor ni del dispositivo.
function diaISO(fecha) {
  var p = String(fecha).split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
  return d === 0 ? 7 : d;
}

// Regla de presencia: ¿dónde se considera que está una persona en una fecha?
// Es la MISMA regla en el servidor y en el navegador (web/js/presencia.js). Si cambia aquí,
// debe cambiar allá igual; el banco de pruebas compara ambas copias caso por caso.
//   persona:    { codigo, piso, puesto, agenda }
//   fecha:      'AAAA-MM-DD'
//   novedades:  todas las novedades (se filtran aquí por código y fecha)
//   festivos:   arreglo de 'AAAA-MM-DD' sin actividad presencial
//   devuelve:   { presente, piso, puesto, otroLugar, motivo }
//   motivo:     agenda | novedad-asiste | novedad-otro-lugar | novedad-no-asiste | fuera-de-agenda | festivo
function presenciaDe(persona, fecha, novedades, festivos) {
  var piso = Number(persona.piso) || 0;
  var puesto = Number(persona.puesto) || 0;
  var n = null;
  (novedades || []).forEach(function (x) {
    if (x.codigo !== persona.codigo || !(x.desde <= fecha && fecha <= x.hasta)) return;
    if (!n || String(x.actualizado) > String(n.actualizado)) n = x;
  });
  if (n && n.tipo === 'no_asiste') return { presente: false, piso: piso, puesto: puesto, otroLugar: false, motivo: 'novedad-no-asiste' };
  if (n && n.tipo === 'otro_lugar') return { presente: true, piso: Number(n.piso) || 0, puesto: Number(n.puesto) || 0, otroLugar: true, motivo: 'novedad-otro-lugar' };
  if (n && n.tipo === 'asiste') return { presente: true, piso: piso, puesto: puesto, otroLugar: false, motivo: 'novedad-asiste' };
  if ((festivos || []).indexOf(fecha) >= 0) return { presente: false, piso: piso, puesto: puesto, otroLugar: false, motivo: 'festivo' };
  var agenda = String(persona.agenda === undefined || persona.agenda === null ? '' : persona.agenda).trim();
  var dias = agenda === '' ? [1, 2, 3, 4, 5] : agenda === 'ocasional' ? [] : agenda.split(',').map(Number);
  if (dias.indexOf(diaISO(fecha)) >= 0) return { presente: true, piso: piso, puesto: puesto, otroLugar: false, motivo: 'agenda' };
  return { presente: false, piso: piso, puesto: puesto, otroLugar: false, motivo: 'fuera-de-agenda' };
}

/**
 * dep = {
 *   leer(tabla) -> [objetos], escribir(tabla, filas), agregar(tabla, fila),
 *   agregarVarias(tabla, filas), prop(nombre), uuid(), ahora() -> ms,
 *   hoy() -> 'AAAA-MM-DD' en hora de Bogotá, bloqueo(fn),
 *   cache (opcional) = { get(clave) -> texto|null, put(clave, texto, segundos) }
 * }
 */
function crearNucleo(dep) {

  // Memoria de lecturas de la petición en curso: cada hoja se lee una sola vez por petición (leer en
  // Google Sheets cuesta de 0,1 a 0,2 s por hoja). Se vacía al empezar cada petición (procesar) y se
  // olvida la hoja que se escribe. Devuelve copias, porque las acciones modifican lo que leen.
  var memoria = {};
  function copiar(v) { return JSON.parse(JSON.stringify(v)); }
  function leer(tabla) {
    if (!Object.prototype.hasOwnProperty.call(memoria, tabla)) memoria[tabla] = dep.leer(tabla);
    return copiar(memoria[tabla]);
  }
  function escribir(tabla, filas) { delete memoria[tabla]; dep.escribir(tabla, filas); }
  function agregar(tabla, fila) { delete memoria[tabla]; dep.agregar(tabla, fila); }
  function agregarVarias(tabla, filas) { delete memoria[tabla]; dep.agregarVarias(tabla, filas); }

  function ok(datos) { return { ok: true, datos: datos || {} }; }
  function falla(codigo, mensaje) { return { ok: false, codigo: codigo, error: mensaje }; }

  function texto(v) { return v === null || v === undefined ? '' : String(v); }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function json(v, defecto) { try { return v ? JSON.parse(v) : defecto; } catch (e) { return defecto; } }

  function roles(p) { return texto(p.roles).split(',').map(function (r) { return r.trim(); }).filter(Boolean); }
  function tieneRol(p, r) { return roles(p).indexOf(r) >= 0; }
  function activa(p) { return texto(p.estado) === 'activo'; }
  function tieneAcceso(p) { return activa(p) && roles(p).length > 0; }

  function hashVerificador(v) { return sha256(texto(dep.prop('PIMIENTA')) + '|' + texto(v)); }

  // Huella del correo como se guarda en la hoja (v0.13): la que manda el celular (PBKDF2 con sal pública)
  // pasa además por SHA-256 con la pimienta del servidor. Una copia filtrada de la hoja ya no permite
  // relacionar códigos con correos probando correos conocidos. Las cuentas con la huella anterior (sin
  // «p1:») pasan al formato nuevo en su siguiente ingreso correcto.
  function huellaGuardada(hc) { return 'p1:' + sha256(texto(dep.prop('PIMIENTA')) + '|correo|' + texto(hc)); }
  function esHuellaNueva(v) { return texto(v).indexOf('p1:') === 0; }

  function bitacora(codigo, accion, detalle) {
    agregar('Bitacora', { fecha: new Date(dep.ahora()).toISOString(), codigo: codigo || '', accion: accion, detalle: detalle || '' });
  }

  function leerConfig() {
    var cfg = JSON.parse(JSON.stringify(CONFIG_INICIAL));
    leer('Config').forEach(function (f) { cfg[f.clave] = json(f.valor, f.valor); });
    return cfg;
  }

  function escribirConfig(cfg) {
    escribir('Config', Object.keys(cfg).map(function (k) { return { clave: k, valor: JSON.stringify(cfg[k]) }; }));
  }

  function perfil(p) {
    return {
      codigo: p.codigo, piso: num(p.piso), puesto: num(p.puesto), roles: roles(p),
      pisoBrigada: p.pisoBrigada ? num(p.pisoBrigada) : null,
      sobres: json(p.sobres, {}), debeCambiar: texto(p.debeCambiar) === 'true'
    };
  }

  function publica(p) {
    return {
      codigo: p.codigo, piso: num(p.piso), puesto: num(p.puesto), estado: texto(p.estado),
      roles: roles(p), pisoBrigada: p.pisoBrigada ? num(p.pisoBrigada) : null, pub: texto(p.pub),
      agenda: texto(p.agenda)
    };
  }

  // ---------- Caracterización: validaciones ----------

  function llavePublicaValida(s) {
    if (typeof s !== 'string' || s.length > 400) return false;
    var j = json(s, null);
    return !!j && j.kty === 'EC' && j.crv === 'P-256' && typeof j.x === 'string' && typeof j.y === 'string';
  }

  function huellaDe(pub) { return sha256(pub).slice(0, 16); }

  // Llaves públicas vigentes de las personas activas: { codigo: pub }.
  function llavesPublicas() {
    var o = {};
    leer('Personas').filter(activa).forEach(function (x) { o[x.codigo] = texto(x.pub); });
    return o;
  }

  // Mapa codigo -> envoltorio {h, e, c}. Cada envoltorio debe ser para una persona activa y
  // estar hecho con su llave pública vigente (la huella tiene que coincidir).
  function mapaEnvoltorios(m, pubs) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    var codigos = Object.keys(m);
    if (!codigos.length || codigos.length > MAX_DESTINATARIOS) return null;
    for (var i = 0; i < codigos.length; i++) {
      var w = m[codigos[i]];
      var pub = pubs[codigos[i]];
      if (!pub || !w || typeof w.h !== 'string' || typeof w.e !== 'string' || typeof w.c !== 'string') return null;
      if (w.h !== huellaDe(pub) || w.e.length > 400 || w.c.length > 600) return null;
    }
    return m;
  }

  // Solo las huellas de un mapa de envoltorios (para que la coordinación sepa quién tiene acceso).
  function soloHuellas(m) {
    var o = {};
    Object.keys(m).forEach(function (c) { o[c] = m[c].h; });
    return o;
  }

  // Quiénes pueden recibir el detalle completo de una caracterización: la coordinación y la administración
  // activas, y la persona dueña. El apoyo para evacuar (clavesApoyo) además puede ir a brigadistas y al
  // acompañante, que va cifrado: por eso allí el servidor solo exige personas activas con llave.
  function lectoresDetalle(personas, dueno) {
    var o = {};
    personas.forEach(function (x) { if (activa(x) && puedeEditar(x, ROLES_LECTORES)) o[x.codigo] = true; });
    o[dueno] = true;
    return o;
  }
  function soloLectores(m, permitidos) { return Object.keys(m).every(function (c) { return permitidos[c]; }); }

  function borrarCaracterizacionesInactivas(personas) {
    var activos = personas.filter(activa).map(function (x) { return x.codigo; });
    var filas = leer('Caracterizaciones');
    var quedan = filas.filter(function (f) { return activos.indexOf(f.codigo) >= 0; });
    if (quedan.length !== filas.length) escribir('Caracterizaciones', quedan);
  }

  // ---------- Contactos de emergencia ----------

  // Antes de ejecutar "instalar" la hoja Contactos no existe: la app v0.11.4 no la usa y nada debe romperse.
  // Solo ese caso cuenta como «sin contactos». Cualquier otro error al leer (Google falla un momento) se
  // relanza: tratarlo como vacío haría que una escritura borrara la hoja entera.
  var FALTA_HOJA = /Falta la hoja/;
  function leerContactos() {
    try { return leer('Contactos'); } catch (e) { if (FALTA_HOJA.test(String(e && e.message))) return []; throw e; }
  }

  // Para las acciones que escriben: sin la hoja se explica qué hacer en vez de un error genérico.
  function leerContactosParaEscribir() {
    try { return leer('Contactos'); } catch (e) {
      if (FALTA_HOJA.test(String(e && e.message))) throw ErrorUsuario('El servidor aún no tiene la hoja Contactos. Quien administra el servidor debe ejecutar «instalar» en Apps Script.');
      throw e;
    }
  }

  // Si la lectura falla, no se borra nada ahora: el contacto de quien se retiró ya no se entrega a nadie
  // (solo se entregan los de personas activas) y se borra en el siguiente cambio del padrón.
  function borrarContactosInactivos(personas) {
    var activos = personas.filter(activa).map(function (x) { return x.codigo; });
    var filas;
    try { filas = leer('Contactos'); } catch (e) { return; }
    var quedan = filas.filter(function (f) { return activos.indexOf(f.codigo) >= 0; });
    if (quedan.length !== filas.length) escribir('Contactos', quedan);
  }

  // Quiénes pueden recibir la llave del contacto de una persona: la coordinación, los brigadistas de
  // TODOS los pisos (el servidor no puede abrir el registro para dárselo después a otro brigadista) y la
  // propia persona. Nadie más (por ejemplo, un asesor).
  function puedeLeerContacto(x) { return tieneAcceso(x) && (puedeEditar(x, ROLES_LECTORES) || tieneRol(x, 'brigadista')); }
  function lectoresContacto(personas, dueno) {
    var o = {};
    personas.forEach(function (x) { if (puedeLeerContacto(x)) o[x.codigo] = true; });
    o[dueno] = true;
    return o;
  }

  // Envoltorios válidos (llave vigente) solo para lectores permitidos, y siempre con el de quien escribe.
  function envoltoriosContacto(m, pubs, permitidos, quien) {
    var v = mapaEnvoltorios(m, pubs);
    if (!v || !v[quien]) return null;
    return Object.keys(v).every(function (c) { return permitidos[c]; }) ? v : null;
  }

  // Valida un contacto que llega del navegador. Devuelve { claves, clavesSalud } o un mensaje de error.
  function validarContacto(op, personas, pubs, quien) {
    if (!op || typeof op !== 'object') return 'Hay un contacto con un formato no válido.';
    var dueno = personas.filter(function (x) { return x.codigo === op.codigo && activa(x); })[0];
    if (!dueno) return 'La persona ' + corto(op.codigo) + ' no existe o ya no está activa.';
    var permitidos = lectoresContacto(personas, dueno.codigo);
    if (typeof op.datos !== 'string' || !op.datos || op.datos.length > LIMITE_CELDA) return 'El contacto de ' + dueno.codigo + ' está vacío o es demasiado largo.';
    var claves = envoltoriosContacto(op.claves, pubs, permitidos, quien);
    if (!claves) return 'Las llaves del contacto de ' + dueno.codigo + ' no son válidas o están desactualizadas. Recargue e intente de nuevo.';
    var clavesSalud = null;
    if (!vacio(op.salud)) {
      if (typeof op.salud !== 'string' || op.salud.length > LIMITE_CELDA) return 'La EPS y la ARL de ' + dueno.codigo + ' son demasiado largas.';
      clavesSalud = envoltoriosContacto(op.clavesSalud, pubs, permitidos, quien);
      if (!clavesSalud) return 'Las llaves de la EPS y la ARL de ' + dueno.codigo + ' no son válidas o están desactualizadas. Recargue e intente de nuevo.';
    }
    return { claves: claves, clavesSalud: clavesSalud };
  }

  // Fila nueva de un contacto (reemplaza la anterior de la persona, si existía).
  function filaContacto(op, v, actual, fuente, quien, ahora) {
    return {
      codigo: op.codigo, version: (actual ? num(actual.version) : 0) + 1,
      datos: op.datos, claves: JSON.stringify(v.claves),
      salud: v.clavesSalud ? op.salud : '', clavesSalud: v.clavesSalud ? JSON.stringify(v.clavesSalud) : '',
      fuente: fuente, cargado: fuente === 'carga' ? ahora : (actual ? texto(actual.cargado) : ''),
      actualizado: ahora, por: quien
    };
  }

  // Lo que recibe "p" de un contacto: solo su propio envoltorio. "conSalud": si se le entrega la EPS y la ARL.
  function contactoPublico(f, p, conSalud, coordinacion) {
    var c = json(f.claves, {}), s = json(f.clavesSalud, {});
    var o = {
      codigo: f.codigo, version: num(f.version), datos: f.datos, clave: c[p.codigo] || null,
      tieneSalud: !!texto(f.salud), fuente: texto(f.fuente), cargado: texto(f.cargado), actualizado: texto(f.actualizado)
    };
    if (conSalud && texto(f.salud)) { o.salud = f.salud; o.claveSalud = s[p.codigo] || null; }
    if (coordinacion) { o.huellas = soloHuellas(c); o.huellasSalud = soloHuellas(s); o.por = texto(f.por); }
    return o;
  }

  // Contactos que puede recibir "p". Sin "piso": la coordinación, todos; un brigadista, los de su piso de
  // brigada (piso habitual de cada persona); cualquiera con acceso, además el suyo. Con "piso": solo los de
  // ese piso (lo usa «Ver otro piso»). Quien no es de la coordinación solo recibe los que traen su envoltorio.
  // La EPS y la ARL van a la coordinación y a la persona dueña; a los brigadistas, solo con una emergencia
  // o un simulacro activo. Devuelve también los contactos de las personas activas (para saber a quién le falta).
  function listarContactos(p, piso) {
    var coordinacion = puedeEditar(p, ROLES_LECTORES);
    var pisoBrigada = tieneRol(p, 'brigadista') ? num(p.pisoBrigada) : 0;
    var emergencia = !coordinacion && !!emergenciaActiva();
    var pisoDe = {};
    leer('Personas').filter(activa).forEach(function (x) { pisoDe[x.codigo] = num(x.piso); });
    var filas = leerContactos().filter(function (f) { return pisoDe[f.codigo] !== undefined; });
    var salida = [];
    filas.forEach(function (f) {
      var propio = f.codigo === p.codigo;
      var ve = piso ? pisoDe[f.codigo] === piso : coordinacion || propio || (pisoBrigada && pisoDe[f.codigo] === pisoBrigada);
      if (!ve || (!coordinacion && !json(f.claves, {})[p.codigo])) return;
      salida.push(contactoPublico(f, p, coordinacion || propio || emergencia, coordinacion));
    });
    return { contactos: salida, filas: filas, pisoDe: pisoDe };
  }

  function sesionActual(token) {
    if (!token) return null;
    var th = sha256(texto(token));
    var ahora = dep.ahora();
    var s = leer('Sesiones').filter(function (x) { return x.tokenHash === th && num(x.expira) > ahora; })[0];
    if (!s) return null;
    // Quitarle todos los roles a alguien invalida sus sesiones en la siguiente petición.
    var p = leer('Personas').filter(function (x) { return x.codigo === s.codigo && tieneAcceso(x); })[0];
    return p || null;
  }

  function contarAdmins(personas) {
    return personas.filter(function (p) { return activa(p) && tieneRol(p, 'admin'); }).length;
  }

  function guardarSobre(nombre, datosCifrados) {
    var sobres = leer('Sobres');
    var s = sobres.filter(function (x) { return x.nombre === nombre; })[0];
    if (!s) { s = { nombre: nombre, version: 0 }; sobres.push(s); }
    s.version = num(s.version) + 1;
    s.datos = datosCifrados;
    s.actualizado = new Date(dep.ahora()).toISOString();
    escribir('Sobres', sobres);
    return s.version;
  }

  // Aplica altas y cambios del padrón. Cada item: {codigo, piso, puesto, estado,
  // hashCorreo?, verificador?, sobres?, debeCambiar?, roles?}
  function aplicarPadron(items, personas) {
    var ahora = new Date(dep.ahora()).toISOString();
    items.forEach(function (it) {
      if (!it.codigo) throw ErrorUsuario('Falta el código de una persona.');
      var p = personas.filter(function (x) { return x.codigo === it.codigo; })[0];
      if (!p) {
        if (!it.hashCorreo || !it.verificador) throw ErrorUsuario('La persona ' + it.codigo + ' es nueva y le faltan credenciales.');
        p = { codigo: it.codigo, roles: '', pisoBrigada: '', intentos: 0, bloqueadoHasta: 0, estado: 'activo' };
        personas.push(p);
      }
      if (it.piso !== undefined) p.piso = it.piso;
      if (it.puesto !== undefined) p.puesto = it.puesto;
      if (it.estado !== undefined) p.estado = it.estado;
      if (it.roles !== undefined) p.roles = [].concat(it.roles).filter(function (r) { return ROLES_VALIDOS.indexOf(r) >= 0; }).join(',');
      if (it.hashCorreo) p.hashCorreo = huellaGuardada(it.hashCorreo);
      if (it.verificador) { p.verificador = hashVerificador(it.verificador); p.intentos = 0; p.bloqueadoHasta = 0; }
      if (it.sobres) p.sobres = JSON.stringify(it.sobres);
      if (it.debeCambiar !== undefined) p.debeCambiar = it.debeCambiar ? 'true' : 'false';
      p.actualizado = ahora;
    });
    var vistos = {};
    personas.filter(activa).forEach(function (p) {
      // Mientras haya cuentas con la huella anterior, se comparan las dos en el formato nuevo.
      var h = esHuellaNueva(p.hashCorreo) ? p.hashCorreo : huellaGuardada(p.hashCorreo);
      if (vistos[h]) throw ErrorUsuario('Hay dos personas activas con el mismo correo (' + vistos[h] + ' y ' + p.codigo + ').');
      vistos[h] = p.codigo;
    });
    if (contarAdmins(personas) < 1) throw ErrorUsuario('Debe quedar al menos un administrador activo.');
  }

  function soloAdmin(p) { return p && tieneRol(p, 'admin'); }

  // ---------- Puestos y distribución de pisos ----------

  function clavePuesto(piso, puesto) { return num(piso) + '-' + num(puesto); }

  // Regla del estado de un puesto: 0 personas activas = vacante, 1 = ocupado, 2 o más = compartido.
  function estadoPuesto(cuantas) { return cuantas === 0 ? 'vacante' : cuantas === 1 ? 'ocupado' : 'compartido'; }

  // { 'piso-puesto': [códigos de las personas activas] }
  function ocupantesPorPuesto(personas) {
    var o = {};
    personas.filter(activa).forEach(function (x) {
      var k = clavePuesto(x.piso, x.puesto);
      (o[k] = o[k] || []).push(x.codigo);
    });
    return o;
  }

  // Pone el estado calculado en cada puesto. Escribe la hoja solo si algo cambió (o si "forzar").
  // "puestos" permite entregar las filas ya leídas o preparadas por quien llama.
  function recalcularPuestos(personas, puestos, forzar) {
    var ocupantes = ocupantesPorPuesto(personas || leer('Personas'));
    var filas = puestos || leer('Puestos');
    var cambio = false;
    filas.forEach(function (f) {
      var e = estadoPuesto((ocupantes[clavePuesto(f.piso, f.puesto)] || []).length);
      if (texto(f.estado) !== e) { f.estado = e; cambio = true; }
    });
    if (cambio || forzar) escribir('Puestos', filas);
    return filas;
  }

  // La carga del Excel trae solo piso, puesto y estado: los puestos que ya existían conservan su
  // posición en el esquema (col, fila) y su condición de asignable. Los nuevos quedan sin ubicar.
  function conservarDistribucion(nuevos) {
    var previos = {};
    leer('Puestos').forEach(function (f) { previos[clavePuesto(f.piso, f.puesto)] = f; });
    return nuevos.map(function (n) {
      var v = previos[clavePuesto(n.piso, n.puesto)];
      return {
        piso: n.piso, puesto: n.puesto, estado: texto(n.estado),
        col: v ? texto(v.col) : '', fila: v ? texto(v.fila) : '', asignable: v ? texto(v.asignable) : ''
      };
    });
  }

  function puestoPublico(x) {
    var ubicado = texto(x.col) !== '' && texto(x.fila) !== '';
    return {
      piso: num(x.piso), puesto: num(x.puesto), estado: texto(x.estado),
      col: ubicado ? num(x.col) : null, fila: ubicado ? num(x.fila) : null, asignable: texto(x.asignable) !== 'false'
    };
  }

  function referenciaPublica(x) {
    return {
      piso: num(x.piso), id: texto(x.id), tipo: texto(x.tipo), etiqueta: texto(x.etiqueta),
      col: num(x.col), fila: num(x.fila), ancho: num(x.ancho), alto: num(x.alto)
    };
  }

  // Antes de ejecutar "instalar" en una instalación vieja la hoja Referencias no existe: la v0.9.4 de la
  // app no la necesita y no debe romperse por eso.
  function leerReferencias() {
    try { return leer('Referencias'); } catch (e) { return []; }
  }

  // Entero escrito como número o como texto de dígitos (null si no lo es).
  function entero(v) {
    if (typeof v === 'number') return isFinite(v) && Math.floor(v) === v ? v : null;
    if (typeof v === 'string' && /^\s*\d{1,9}\s*$/.test(v)) return Number(v);
    return null;
  }

  function vacio(v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === ''); }

  function corto(v) { return texto(v).slice(0, 20); }

  function listaDeCodigos(codigos) {
    return codigos.length === 1 ? codigos[0] : codigos.slice(0, -1).join(', ') + ' y ' + codigos[codigos.length - 1];
  }

  // Agenda de días presenciales: '' (lunes a viernes), 'ocasional' o días ISO 1 a 7 sin repetir.
  // Devuelve el texto normalizado (días en orden ascendente) o null si no es válida.
  function normalizarAgenda(a) {
    var s = texto(a).trim();
    if (s === '' || s === 'ocasional') return s;
    var dias = s.split(',').map(function (x) { return x.trim(); });
    var vistos = {};
    for (var i = 0; i < dias.length; i++) {
      if (!/^[1-7]$/.test(dias[i]) || vistos[dias[i]]) return null;
      vistos[dias[i]] = true;
    }
    return dias.map(Number).sort(function (x, y) { return x - y; }).join(',');
  }

  // ---------- Presencia y novedades ----------

  // Una vez al día se borra la bitácora que superó el plazo de conservación.
  // Se llama solo desde acciones que escriben (ingresar y guardarNovedad), nunca desde una lectura.
  function purgarAntiguos() {
    var cfg = leerConfig();
    var hoy = dep.hoy();
    if (cfg.ultimaPurga === hoy) return;
    var lb = new Date(dep.ahora() - Math.max(1, num(cfg.diasBitacora || 365)) * 86400000).toISOString().slice(0, 10);
    var bit = leer('Bitacora');
    var bit2 = bit.filter(function (f) { return texto(f.fecha).slice(0, 10) >= lb; });
    if (bit2.length < bit.length) escribir('Bitacora', bit2);
    purgarDetalleVencido(cfg);
    cfg.ultimaPurga = hoy;
    escribirConfig(cfg);
  }

  function fechaValida(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var f = new Date(s + 'T00:00:00Z');
    return !isNaN(f.getTime()) && f.toISOString().slice(0, 10) === s;
  }

  function diasEntre(desde, hasta) {
    return Math.round((new Date(hasta + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()) / 86400000) + 1;
  }

  function novedadPublica(n) {
    return {
      id: texto(n.id), codigo: texto(n.codigo), tipo: texto(n.tipo), desde: texto(n.desde), hasta: texto(n.hasta),
      piso: num(n.piso), puesto: num(n.puesto), registradoPor: texto(n.registradoPor), actualizado: texto(n.actualizado)
    };
  }

  // Novedades que aún no vencen (hasta >= hoy): las de hoy y las futuras.
  function novedadesVigentes() {
    var hoy = dep.hoy();
    return leer('Novedades').filter(function (n) { return texto(n.hasta) >= hoy; }).map(novedadPublica);
  }

  // Las novedades vencidas no sirven para nada: se borran al escribir.
  function purgarNovedades() {
    var hoy = dep.hoy();
    var filas = leer('Novedades');
    var quedan = filas.filter(function (n) { return texto(n.hasta) >= hoy; });
    if (quedan.length < filas.length) escribir('Novedades', quedan);
  }

  // Sobres de contenido y lista de archivos disponibles (sin su contenido).
  function contenidoPublico(cfg) {
    var sobres = leer('Sobres');
    var salida = {};
    Object.keys(SOBRES_CONTENIDO).forEach(function (n) {
      var s = sobres.filter(function (x) { return x.nombre === n; })[0];
      salida[n] = s ? { version: num(s.version), datos: s.datos } : null;
    });
    return { sobres: salida, archivos: cfg.archivos || {} };
  }

  function puedeEditar(p, rolesPermitidos) {
    return rolesPermitidos.some(function (r) { return tieneRol(p, r); });
  }

  // ---------- Emergencias ----------

  function emergenciaActiva(lista) {
    return (lista || leer('Emergencias')).filter(function (e) { return e.estado === 'activa'; })[0] || null;
  }

  function emergenciaPublica(e) {
    return {
      id: e.id, tipo: e.tipo, descripcion: texto(e.descripcion), simulacro: texto(e.simulacro) === 'true',
      estado: e.estado, inicio: num(e.inicio), activadaPor: e.activadaPor, cierre: e.cierre ? num(e.cierre) : null,
      cerradaPor: texto(e.cerradaPor), version: num(e.version), esperados: json(e.esperados, {})
    };
  }

  // Detalle por persona de una emergencia cerrada (v0.13): la foto de esperados, las marcas y los conteos
  // (solo códigos) se conservan después del cierre durante un plazo y luego se borran. Lo abre la coordinación.
  function detalleVence(e, cfg) {
    return num(e.cierre) + (texto(e.simulacro) === 'true' ? num(cfg.diasDetalleSimulacro) : num(cfg.diasDetalleEmergencia)) * 86400000;
  }
  function detalleVigente(e, cfg) {
    return e.estado === 'cerrada' && !!num(e.cierre) && dep.ahora() < detalleVence(e, cfg) &&
      texto(e.esperados) !== '' && texto(e.esperados) !== '{}';
  }
  // Borra el detalle de las emergencias cerradas cuyo plazo venció: vacía la foto de esperados y quita sus
  // marcas y conteos. Solo escribe las hojas en las que hay algo que borrar.
  function purgarDetalleVencido(cfg) {
    var lista = leer('Emergencias');
    var vencidas = {}, n = 0;
    lista.forEach(function (e) {
      if (e.estado !== 'cerrada' || !num(e.cierre) || dep.ahora() < detalleVence(e, cfg)) return;
      vencidas[e.id] = true;
      if (texto(e.esperados) !== '' && texto(e.esperados) !== '{}') { e.esperados = '{}'; n++; }
    });
    if (n) escribir('Emergencias', lista);
    ['MarcasEmergencia', 'ConteosEmergencia'].forEach(function (t) {
      var filas = leer(t);
      var quedan = filas.filter(function (f) { return !vencidas[f.emergencia]; });
      if (quedan.length < filas.length) escribir(t, quedan);
    });
    if (n) bitacora('', 'detalle-purgado', n + ' emergencia(s)');
  }
  function marcaPublica(m) {
    return { codigo: m.codigo, estado: texto(m.estado), asistencia: texto(m.asistencia) === 'true', llegada: texto(m.llegada), reportadoPor: texto(m.reportadoPor), actualizado: texto(m.actualizado) };
  }
  function conteoPublico(c) {
    return { piso: num(c.piso), evacuados: num(c.evacuados), noUbicados: num(c.noUbicados), apoyo: num(c.apoyo), reportadoPor: texto(c.reportadoPor) };
  }

  // Quien no reporta en emergencias (no es brigadista, coordinación ni administración) solo
  // recibe su propia marca y las cifras por piso: nunca el detalle de otras personas
  // (por ejemplo, quién necesita asistencia por discapacidad).
  function estadoEmergencia(id, p) {
    var lista = leer('Emergencias');
    var e = id ? lista.filter(function (x) { return x.id === id; })[0] : emergenciaActiva(lista);
    if (!e) return { emergencia: null, marcas: [], conteos: [] };
    // Una emergencia cerrada conserva su detalle un tiempo, pero solo la coordinación lo recibe. Los demás
    // (por ejemplo, un celular con la v0.12 que confirma por id el cierre) reciben solo que está cerrada.
    if (e.estado !== 'activa' && !(p && puedeEditar(p, ROLES_LECTORES))) {
      var cerrada = emergenciaPublica(e);
      cerrada.esperados = {};
      return { emergencia: cerrada, marcas: [], conteos: [] };
    }
    if (p && !puedeEditar(p, ROLES_REPORTAR)) {
      var pub = emergenciaPublica(e);
      pub.esperados = {};
      var r = e.estado === 'activa' ? resumenCierre(e, '') : null;
      var propia = leer('MarcasEmergencia').filter(function (m) { return m.emergencia === e.id && m.codigo === p.codigo; })
        .map(function (m) { return { codigo: m.codigo, estado: texto(m.estado), asistencia: texto(m.asistencia) === 'true', llegada: texto(m.llegada), reportadoPor: '', actualizado: '' }; });
      return {
        emergencia: pub, marcas: propia, conteos: [],
        cifras: r ? {
          pisos: r.pisos.map(function (f) { return { piso: f.piso, esperados: f.esperados, porVerificar: f.porVerificar, evacuados: f.evacuados, noUbicados: f.noUbicados, apoyo: f.apoyo, noEstaban: f.noEstaban, pendientes: f.pendientes, llegaron: f.llegaron, porConteo: f.porConteo, reportado: f.reportado }; }),
          total: { esperados: r.total.esperados, evacuados: r.total.evacuados, llegaron: r.total.llegaron, noUbicados: r.total.noUbicados, apoyo: r.total.apoyo, noEstaban: r.total.noEstaban, pendientes: r.total.pendientes, porVerificar: r.total.porVerificar }
        } : null
      };
    }
    return {
      emergencia: emergenciaPublica(e),
      marcas: leer('MarcasEmergencia').filter(function (m) { return m.emergencia === e.id; }).map(marcaPublica),
      conteos: leer('ConteosEmergencia').filter(function (c) { return c.emergencia === e.id; }).map(conteoPublico)
    };
  }

  // Foto de quién se espera en la sede al activar: por piso, las personas activas que según la
  // regla de presencia (agenda, novedades y festivos) están presentes hoy ("en"). Incluye a
  // todas las personas activas, con o sin acceso. "sin" queda vacío por compatibilidad.
  function fotoEsperados() {
    var hoy = dep.hoy(), nov = novedadesVigentes(), fest = leerConfig().festivos || [];
    var foto = {};
    leer('Personas').filter(activa).forEach(function (p) {
      var r = presenciaDe(p, hoy, nov, fest);
      if (!r.presente) return;
      foto[r.piso] = foto[r.piso] || { en: [], sin: [] };
      foto[r.piso].en.push(p.codigo);
    });
    return foto;
  }

  // Informe de cierre: totales y tiempos por piso, sin nombres ni códigos.
  // Los tiempos salen del momento en que se hizo cada marca (reloj del celular).
  function resumenCierre(e, observaciones) {
    var foto = json(e.esperados, {});
    var marcas = leer('MarcasEmergencia').filter(function (m) { return m.emergencia === e.id; });
    var conteos = leer('ConteosEmergencia').filter(function (c) { return c.emergencia === e.id; });
    var personas = leer('Personas');
    var pisoDe = {}, grupoDe = {}, marca = {};
    Object.keys(foto).forEach(function (piso) {
      (foto[piso].en || []).forEach(function (c) { pisoDe[c] = num(piso); grupoDe[c] = 'en'; });
      (foto[piso].sin || []).forEach(function (c) { pisoDe[c] = num(piso); grupoDe[c] = 'sin'; });
    });
    marcas.forEach(function (m) {
      marca[m.codigo] = m;
      if (pisoDe[m.codigo] === undefined) {
        var p = personas.filter(function (x) { return x.codigo === m.codigo; })[0];
        if (p) { pisoDe[m.codigo] = num(p.piso); grupoDe[m.codigo] = 'extra'; }
      }
    });
    var inicio = num(e.inicio);
    function momentoSalida(m) {
      var mo = json(m.momentos, {});
      var t = [];
      if (m.estado === 'evacuado' && num(mo.estado)) t.push(num(mo.estado));
      if (texto(m.llegada) && num(mo.llegada)) t.push(num(mo.llegada));
      return t.length ? Math.min.apply(null, t) : null;
    }
    function momentoLlegada(m) {
      var mo = json(m.momentos, {});
      return texto(m.llegada) && num(mo.llegada) ? num(mo.llegada) : null;
    }
    function vacioNulo(lista, f) { var v = lista.filter(function (t) { return t !== null; }); return v.length ? f.apply(null, v) : null; }

    var todos = {};
    Object.keys(pisoDe).forEach(function (c) { todos[pisoDe[c]] = true; });
    conteos.forEach(function (c) { todos[num(c.piso)] = true; });
    var todasSalidas = [], todasLlegadas = [];

    var pisos = Object.keys(todos).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
      var codigos = Object.keys(pisoDe).filter(function (c) { return pisoDe[c] === n; });
      var en = codigos.filter(function (c) { return grupoDe[c] === 'en'; });
      var conMarca = codigos.filter(function (c) { return marca[c]; });
      var evacuados = conMarca.filter(function (c) { return marca[c].estado === 'evacuado' || texto(marca[c].llegada); });
      var cuenta = function (s) { return conMarca.filter(function (c) { return marca[c].estado === s; }).length; };
      var salidas = evacuados.map(function (c) { return momentoSalida(marca[c]); });
      var llegadas = conMarca.map(function (c) { return momentoLlegada(marca[c]); });
      var conteo = conteos.filter(function (c) { return num(c.piso) === n; })[0] || null;
      var cifras = conteo
        ? { evacuados: num(conteo.evacuados), noUbicados: num(conteo.noUbicados), apoyo: num(conteo.apoyo) }
        : { evacuados: evacuados.length, noUbicados: cuenta('no_ubicado'), apoyo: cuenta('apoyo') };
      // "No estaba hoy": previstas que ese día no estaban en la sede. No son pendientes ni evacuadas.
      var noEstaban = en.filter(function (c) { return marca[c] && marca[c].estado === 'no_estaba'; }).length;
      var pendientes = conteo
        ? Math.max(0, en.length - noEstaban - cifras.evacuados - cifras.noUbicados - cifras.apoyo)
        : en.filter(function (c) { return !(marca[c] && marca[c].estado); }).length;
      // Si todas las previstas resultaron "no estaba", no hay nadie que evacuar: no se completa.
      var completo = en.length - noEstaban > 0 && (conteo ? cifras.evacuados >= en.length - noEstaban
        : en.every(function (c) { return marca[c] && (marca[c].estado === 'evacuado' || texto(marca[c].llegada) || marca[c].estado === 'no_estaba'); }));
      // El piso tiene reporte si hay conteo, si nadie quedó pendiente o si alguien reportó a otra persona.
      var reportado = !!conteo || (en.length > 0 && pendientes === 0) ||
        conMarca.some(function (c) { return texto(marca[c].estado) && texto(marca[c].reportadoPor) && marca[c].reportadoPor !== c; });
      var ultimaSalida = vacioNulo(salidas, Math.max);
      var tConteo = conteo ? num(json(conteo.momentos, {}).evacuados) : 0;
      Array.prototype.push.apply(todasSalidas, salidas);
      Array.prototype.push.apply(todasLlegadas, llegadas);
      return {
        piso: n, esperados: en.length,
        porVerificar: codigos.filter(function (c) { return grupoDe[c] === 'sin' && !(marca[c] && marca[c].estado); }).length,
        evacuados: cifras.evacuados, noUbicados: cifras.noUbicados, apoyo: cifras.apoyo, noEstaban: noEstaban, pendientes: pendientes,
        asistencia: conMarca.filter(function (c) { return texto(marca[c].asistencia) === 'true'; }).length,
        llegaron: conMarca.filter(function (c) { return texto(marca[c].llegada); }).length,
        porConteo: !!conteo, completo: completo, reportado: reportado,
        primeraSalida: vacioNulo(salidas, Math.min), ultimaSalida: ultimaSalida,
        ultimaLlegada: vacioNulo(llegadas, Math.max),
        tEvacuacionMs: completo ? (ultimaSalida !== null ? ultimaSalida - inicio : (tConteo ? tConteo - inicio : null)) : null
      };
    });

    var suma = function (k) { return pisos.reduce(function (s, f) { return s + f[k]; }, 0); };
    return {
      version: 2,
      duracionMs: Math.max(0, num(e.cierre) - inicio),
      hitos: {
        primeraSalida: vacioNulo(todasSalidas, Math.min), ultimaSalida: vacioNulo(todasSalidas, Math.max),
        primeraLlegada: vacioNulo(todasLlegadas, Math.min), ultimaLlegada: vacioNulo(todasLlegadas, Math.max)
      },
      total: {
        esperados: suma('esperados'), evacuados: suma('evacuados'), llegaron: suma('llegaron'), noUbicados: suma('noUbicados'),
        apoyo: suma('apoyo'), noEstaban: suma('noEstaban'), asistencia: suma('asistencia'), pendientes: suma('pendientes'), porVerificar: suma('porVerificar')
      },
      pisos: pisos,
      observaciones: texto(observaciones).slice(0, 600)
    };
  }

  // El momento lo pone el celular (sirve sin conexión). Se limita para que un reloj
  // adelantado, o alguien malintencionado, no "congele" un dato con una fecha futura.
  var MAX_OPS = 500;
  function momentoCliente(m) {
    return Math.min(num(m), dep.ahora() + 5 * 60000);
  }

  // Aplica campos con "gana el más reciente": sirve para reenviar marcas guardadas sin conexión.
  function aplicarCampos(fila, campos, momento, validos, validar) {
    momento = momentoCliente(momento);
    var momentos = json(fila.momentos, {});
    var cambio = false;
    validos.forEach(function (c) {
      if (!campos || campos[c] === undefined) return;
      if (!validar(c, texto(campos[c]))) return;
      if (num(momento) < num(momentos[c])) return;
      if (texto(fila[c]) === texto(campos[c]) && num(momento) === num(momentos[c])) return;   // reenvío idéntico: nada cambia
      fila[c] = texto(campos[c]);
      momentos[c] = num(momento);
      cambio = true;
    });
    if (cambio) fila.momentos = JSON.stringify(momentos);
    return cambio;
  }

  var acciones = {

    ping: function () {
      return ok({ servicio: 'EMERGENCIAS D3', inicializado: leer('Personas').length > 0 });
    },

    inicializar: function (d) {
      if (leer('Personas').length > 0) return falla('YA_INICIALIZADO', 'El aplicativo ya fue inicializado.');
      if (!d.codigoInstalacion || texto(d.codigoInstalacion).trim() !== texto(dep.prop('CODIGO_INSTALACION')))
        return falla('CODIGO', 'El código de instalación no coincide.');
      var personas = [];
      aplicarPadron(d.personas || [], personas);
      escribir('Personas', personas);
      recalcularPuestos(personas, conservarDistribucion(d.puestos || []), true);
      if (d.sobreDirectorio) guardarSobre('directorio', d.sobreDirectorio);
      Object.keys(SOBRES_CONTENIDO).forEach(function (n) {
        var datos = d.sobresContenido && d.sobresContenido[n];
        if (datos && texto(datos).length <= LIMITE_CELDA) guardarSobre(n, datos);
      });
      escribirConfig(leerConfig());
      bitacora('', 'inicializar', personas.length + ' personas');
      return ok({ personas: personas.length });
    },

    ingresar: function (d) {
      var ahora = dep.ahora();
      var personas = leer('Personas');
      var hc = texto(d.hashCorreo), guardada = huellaGuardada(hc);
      var p = hc && (personas.filter(function (x) { return x.hashCorreo === guardada && activa(x); })[0] ||
        personas.filter(function (x) { return x.hashCorreo === hc && activa(x); })[0]);
      if (!p) { bitacora('', 'ingreso-fallido', 'correo no registrado'); return falla('CREDENCIALES', 'Correo o contraseña incorrectos.'); }
      if (num(p.bloqueadoHasta) > ahora) {
        var min = Math.ceil((num(p.bloqueadoHasta) - ahora) / 60000);
        return falla('BLOQUEADO', 'Demasiados intentos fallidos. Intente de nuevo en ' + min + ' minuto(s).');
      }
      if (hashVerificador(d.verificador) !== p.verificador) {
        p.intentos = num(p.intentos) + 1;
        if (p.intentos >= MAX_INTENTOS) { p.bloqueadoHasta = ahora + MINUTOS_BLOQUEO * 60000; p.intentos = 0; }
        escribir('Personas', personas);
        bitacora(p.codigo, 'ingreso-fallido', '');
        return falla('CREDENCIALES', 'Correo o contraseña incorrectos.');
      }
      p.intentos = 0; p.bloqueadoHasta = 0;
      if (!esHuellaNueva(p.hashCorreo)) p.hashCorreo = guardada;   // migra la huella anterior (v0.13)
      escribir('Personas', personas);
      // La contraseña es correcta, pero sin ningún rol no hay acceso. Se verifica primero la
      // contraseña para no revelar a quien no la conoce si un correo existe.
      if (!tieneAcceso(p)) {
        bitacora(p.codigo, 'ingreso-sin-acceso', '');
        return falla('SIN_ACCESO', 'Su usuario no tiene acceso al aplicativo. Si lo necesita, hable con la administración del aplicativo.');
      }
      var token = (dep.uuid() + dep.uuid()).replace(/-/g, '');
      var cfg = leerConfig();
      var sesiones = leer('Sesiones').filter(function (s) { return num(s.expira) > ahora; });
      sesiones.push({ tokenHash: sha256(token), codigo: p.codigo, creada: ahora, expira: ahora + num(cfg.diasSesion) * 86400000 });
      escribir('Sesiones', sesiones);
      // Mantenimiento: aunque nadie registre novedades, la bitácora vieja (una vez al día) y las
      // novedades vencidas se borran al primer ingreso que ocurra.
      purgarNovedades();
      purgarAntiguos();
      bitacora(p.codigo, 'ingreso', '');
      return ok({ token: token, perfil: perfil(p) });
    },

    salir: function (d) {
      var th = sha256(texto(d.token));
      escribir('Sesiones', leer('Sesiones').filter(function (s) { return s.tokenHash !== th; }));
      return ok();
    },

    base: function (d, p) {
      var cfg = leerConfig();
      var dir = leer('Sobres').filter(function (s) { return s.nombre === 'directorio'; })[0];
      return ok({
        perfil: perfil(p),
        personas: leer('Personas').map(publica),
        // col, fila, asignable y referencias son de la v0.11; la v0.9.4 los ignora.
        puestos: leer('Puestos').map(puestoPublico),
        referencias: leerReferencias().map(referenciaPublica),
        directorio: dir ? { version: num(dir.version), datos: dir.datos } : null,
        config: { reglasClave: cfg.reglasClave, exigirCambioInicial: !!cfg.exigirCambioInicial, diasSesion: num(cfg.diasSesion), diasBitacora: num(cfg.diasBitacora), diasDetalleSimulacro: num(cfg.diasDetalleSimulacro), diasDetalleEmergencia: num(cfg.diasDetalleEmergencia), festivos: cfg.festivos || [] },
        novedades: novedadesVigentes(),
        // Compatibilidad con la v0.8.4: sin registros, para que esa versión no se rompa.
        hoy: { fecha: dep.hoy(), registros: [] },
        contenido: contenidoPublico(cfg),
        emergencia: estadoEmergencia(null, p)
      });
    },

    // Consulta liviana y sin bloqueo: ¿hay una emergencia activa y en qué versión va?
    pulso: function () {
      var e = emergenciaActiva();
      return ok({ activa: e ? { id: e.id, tipo: e.tipo, simulacro: texto(e.simulacro) === 'true', inicio: num(e.inicio), version: num(e.version) } : null });
    },

    emergencia: function (d, p) {
      return ok(estadoEmergencia(d.id, p));
    },

    activarEmergencia: function (d, p) {
      var simulacro = !!d.simulacro;
      if (!puedeEditar(p, simulacro ? ROLES_SIMULACRO_INICIAR : ROLES_ACTIVAR)) {
        return falla('PERMISO', simulacro ? 'Solo los brigadistas, la coordinación o el administrador pueden iniciar un simulacro.' : 'No tiene permiso para activar una emergencia.');
      }
      if (TIPOS_EMERGENCIA.indexOf(d.tipo) < 0) return falla('DATOS', 'Tipo de emergencia no válido.');
      var actual = emergenciaActiva();
      // "unirse": un celular que activó la emergencia sin conexión la sincroniza.
      // Si ya hay una en curso, se une a ella; si no, se crea con la hora de inicio real.
      if (actual && d.unirse) return ok(estadoEmergencia(actual.id, p));
      if (actual) return falla('YA_ACTIVA', 'Ya hay ' + (texto(actual.simulacro) === 'true' ? 'un simulacro' : 'una emergencia') + ' en curso.');
      var ahora = dep.ahora();
      var inicio = d.unirse && num(d.inicio) ? Math.min(ahora, Math.max(ahora - 12 * 3600000, num(d.inicio))) : ahora;
      var e = {
        id: 'E-' + dep.hoy() + '-' + dep.uuid().slice(0, 6), tipo: d.tipo, descripcion: texto(d.descripcion).slice(0, 200),
        simulacro: simulacro ? 'true' : 'false', estado: 'activa', inicio: inicio, activadaPor: p.codigo,
        cierre: '', cerradaPor: '', version: 1, esperados: JSON.stringify(fotoEsperados())
      };
      agregar('Emergencias', e);
      bitacora(p.codigo, simulacro ? 'simulacro-inicio' : 'emergencia-inicio', e.id + ' ' + e.tipo);
      return ok(estadoEmergencia(e.id, p));
    },

    // Marcas del piso y del punto de encuentro, persona por persona o por conteo.
    // Cada persona puede reportarse a sí misma; brigadistas, coordinación y
    // administración pueden reportar a cualquiera.
    // op = { id, emergencia, momento, tipo: 'persona', codigo, campos: { estado?, asistencia?, llegada? } }
    //    | { id, emergencia, momento, tipo: 'conteo', piso, campos: { evacuados?, noUbicados?, apoyo? } }
    marcarEmergencia: function (d, p) {
      var lista = leer('Emergencias');
      var personas = leer('Personas').filter(activa);
      var marcas = leer('MarcasEmergencia');
      var conteos = leer('ConteosEmergencia');
      var reporta = puedeEditar(p, ROLES_REPORTAR);
      var ahora = new Date(dep.ahora()).toISOString();
      var tocadas = {}, cambioMarcas = false, cambioConteos = false;
      if (!Array.isArray(d.ops) || d.ops.length > MAX_OPS) return falla('DATOS', 'Demasiadas operaciones en un solo envío.');
      var resultados = d.ops.map(function (op) {
        var e = op && lista.filter(function (x) { return x.id === op.emergencia; })[0];
        if (!e) return { id: op && op.id, estado: 'emergencia' };
        if (e.estado !== 'activa') return { id: op.id, estado: 'cerrada' };
        var cambio;
        if (op.tipo === 'conteo') {
          if (!reporta) return { id: op.id, estado: 'permiso' };
          var piso = num(op.piso);
          if (!piso) return { id: op.id, estado: 'datos' };
          var c = conteos.filter(function (x) { return x.emergencia === e.id && num(x.piso) === piso; })[0];
          if (!c) { c = { emergencia: e.id, piso: piso, evacuados: 0, noUbicados: 0, apoyo: 0, momentos: '{}' }; conteos.push(c); }
          cambio = aplicarCampos(c, op.campos, op.momento, ['evacuados', 'noUbicados', 'apoyo'],
            function (k, v) { return /^\d{1,3}$/.test(v); });
          if (cambio) { c.reportadoPor = p.codigo; c.actualizado = ahora; cambioConteos = true; }
        } else {
          if (!personas.some(function (x) { return x.codigo === op.codigo; })) return { id: op.id, estado: 'persona' };
          var propio = op.codigo === p.codigo;
          if (!propio && !reporta) return { id: op.id, estado: 'permiso' };
          var m = marcas.filter(function (x) { return x.emergencia === e.id && x.codigo === op.codigo; })[0];
          if (!m) { m = { emergencia: e.id, codigo: op.codigo, estado: '', asistencia: 'false', llegada: '', momentos: '{}' }; marcas.push(m); }
          cambio = aplicarCampos(m, op.campos, op.momento, ['estado', 'asistencia', 'llegada'], function (k, v) {
            if (k === 'estado') return v === '' || (ESTADOS_EN_EMERGENCIA.indexOf(v) >= 0 && (reporta || (v !== 'no_ubicado' && v !== 'no_estaba')));
            if (k === 'asistencia') return v === 'true' || v === 'false';
            return v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
          });
          if (cambio) { m.reportadoPor = p.codigo; m.actualizado = ahora; cambioMarcas = true; }
        }
        if (cambio) tocadas[e.id] = true;
        return { id: op.id, estado: 'ok' };
      });
      // Solo se escribe lo que cambió: un reenvío idéntico (cola sin conexión) no toca ninguna hoja.
      if (cambioMarcas) escribir('MarcasEmergencia', marcas);
      if (cambioConteos) escribir('ConteosEmergencia', conteos);
      if (Object.keys(tocadas).length) {
        lista.forEach(function (e) { if (tocadas[e.id]) e.version = num(e.version) + 1; });
        escribir('Emergencias', lista);
      }
      return ok({ resultados: resultados, estado: estadoEmergencia(null, p) });
    },

    cerrarEmergencia: function (d, p) {
      var lista = leer('Emergencias');
      var e = lista.filter(function (x) { return x.id === d.id && x.estado === 'activa'; })[0];
      if (!e) return falla('NO_ACTIVA', 'Esa emergencia ya fue cerrada.');
      var simulacro = texto(e.simulacro) === 'true';
      if (!puedeEditar(p, ROLES_CERRAR)) {
        return falla('PERMISO', 'Solo los brigadistas, la coordinación o el administrador pueden ' + (simulacro ? 'terminar un simulacro.' : 'cerrar la emergencia.'));
      }
      e.estado = 'cerrada';
      e.cierre = dep.ahora();
      e.cerradaPor = p.codigo;
      e.version = num(e.version) + 1;
      // El informe guarda totales y tiempos, sin nombres ni códigos. Desde la v0.13 el detalle por persona
      // (solo códigos) se conserva para el acta nominal y se borra al vencer el plazo (purgarDetalleVencido).
      e.resumen = JSON.stringify(resumenCierre(e, d.observaciones));
      escribir('Emergencias', lista);
      bitacora(p.codigo, simulacro ? 'simulacro-cierre' : 'emergencia-cierre', e.id);
      return ok(estadoEmergencia(e.id, p));
    },

    // ---------- Caracterización individual (todo llega cifrado desde el navegador) ----------

    // Cada persona genera su par de llaves la primera vez que ingresa. La privada llega
    // ya cifrada con su contraseña: el servidor nunca puede abrirla.
    registrarPar: function (d, p) {
      var personas = leer('Personas');
      var x = personas.filter(function (y) { return y.codigo === p.codigo; })[0];
      var sobres = json(x.sobres, {});
      if (sobres.priv) return falla('YA_EXISTE', 'Ya tiene un par de llaves.');
      if (!llavePublicaValida(d.pub) || typeof d.priv !== 'string' || !d.priv || d.priv.length > 2000) return falla('DATOS', 'Llaves no válidas.');
      x.pub = d.pub;
      sobres.priv = d.priv;
      x.sobres = JSON.stringify(sobres);
      x.actualizado = new Date(dep.ahora()).toISOString();
      escribir('Personas', personas);
      bitacora(p.codigo, 'par-llaves', '');
      return ok({ perfil: perfil(x) });
    },

    // Solo la persona misma puede crear o cambiar su caracterización: el servidor no recibe
    // el código de otra persona.
    guardarCaracterizacion: function (d, p) {
      var pubs = llavesPublicas();
      var claves = mapaEnvoltorios(d.claves, pubs);
      var clavesApoyo = mapaEnvoltorios(d.clavesApoyo, pubs);
      if (!claves || !clavesApoyo || !claves[p.codigo] || !clavesApoyo[p.codigo]) return falla('DATOS', 'Datos incompletos o llaves desactualizadas. Cierre sesión y vuelva a ingresar.');
      if (!soloLectores(claves, lectoresDetalle(leer('Personas'), p.codigo))) return falla('DATOS', 'El detalle de la caracterización solo puede compartirse con la coordinación.');
      if (typeof d.datos !== 'string' || typeof d.apoyo !== 'string' || !d.datos || !d.apoyo || d.datos.length > LIMITE_CELDA || d.apoyo.length > LIMITE_CELDA) {
        return falla('DATOS', 'El contenido es demasiado largo.');
      }
      var v = d.consentimiento ? texto(d.consentimiento.v).slice(0, 20) : '';
      if (!v) return falla('CONSENTIMIENTO', 'Falta la aceptación de la autorización de tratamiento de datos.');
      var filas = leer('Caracterizaciones');
      var actual = filas.filter(function (c) { return c.codigo === p.codigo; })[0];
      var versionActual = actual ? num(actual.version) : 0;
      if (d.versionBase !== undefined && d.versionBase !== null && num(d.versionBase) !== versionActual) {
        return falla('CONFLICTO', 'Su caracterización cambió desde otro dispositivo. Recargue e intente de nuevo.');
      }
      var ahora = new Date(dep.ahora()).toISOString();
      var previo = actual ? json(actual.consentimiento, {}) : {};
      // La fecha anterior solo se conserva si la autorización anterior también fue propia: la de un formato
      // físico lleva la fecha de la firma en papel y no vale como aceptación en la app.
      var conservaFecha = previo.v === v && previo.f && previo.modo !== 'fisico';
      var fila = {
        codigo: p.codigo, version: versionActual + 1, datos: d.datos, claves: JSON.stringify(claves),
        apoyo: d.apoyo, clavesApoyo: JSON.stringify(clavesApoyo),
        consentimiento: JSON.stringify({ v: v, f: conservaFecha ? previo.f : ahora, modo: 'propio', por: p.codigo }), actualizado: ahora
      };
      escribir('Caracterizaciones', filas.filter(function (c) { return c.codigo !== p.codigo; }).concat([fila]));
      if (previo.v !== v || previo.modo === 'fisico') bitacora(p.codigo, 'consentimiento', v);
      bitacora(p.codigo, 'caracterizacion', 'v' + fila.version);
      return ok({ version: fila.version, consentimiento: JSON.parse(fila.consentimiento) });
    },

    // La coordinación registra la caracterización de una persona SIN acceso al aplicativo, a partir de un
    // formato de autorización impreso y firmado que custodia la coordinación. La persona no tiene llave:
    // solo reciben el registro quien lo registra y los demás destinatarios. Si después se le da acceso y
    // ella registra su llave pública, la coordinación (reenvolver) le agrega su envoltorio.
    guardarCaracterizacionAsistida: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden registrar una caracterización asistida.');
      var personasAsistida = leer('Personas');
      var dueno = personasAsistida.filter(function (x) { return x.codigo === d.codigo && activa(x); })[0];
      if (!dueno) return falla('DATOS', 'La persona no existe o ya no está activa.');
      if (tieneAcceso(dueno)) return falla('PERMISO', 'Esta persona tiene acceso al aplicativo: debe diligenciar su caracterización ella misma.');
      var pubs = llavesPublicas();
      var claves = mapaEnvoltorios(d.claves, pubs);
      var clavesApoyo = mapaEnvoltorios(d.clavesApoyo, pubs);
      // Quien registra conserva el acceso; la persona dueña puede no estar (no tiene llave).
      if (!claves || !clavesApoyo || !claves[p.codigo] || !clavesApoyo[p.codigo]) return falla('DATOS', 'Datos incompletos o llaves desactualizadas. Cierre sesión y vuelva a ingresar.');
      if (!soloLectores(claves, lectoresDetalle(personasAsistida, d.codigo))) return falla('DATOS', 'El detalle de la caracterización solo puede compartirse con la coordinación.');
      if (typeof d.datos !== 'string' || typeof d.apoyo !== 'string' || !d.datos || !d.apoyo || d.datos.length > LIMITE_CELDA || d.apoyo.length > LIMITE_CELDA) {
        return falla('DATOS', 'El contenido es demasiado largo.');
      }
      var c = d.consentimiento || {};
      var v = texto(c.v).slice(0, 20);
      if (!v || c.fisico !== true) return falla('CONSENTIMIENTO', 'Falta confirmar que la persona firmó el formato de autorización de tratamiento de datos.');
      if (!fechaValida(c.fechaFirma)) return falla('CONSENTIMIENTO', 'La fecha de la firma no es válida.');
      if (c.fechaFirma > dep.hoy()) return falla('CONSENTIMIENTO', 'La fecha de la firma no puede ser futura.');
      var filas = leer('Caracterizaciones');
      var actual = filas.filter(function (x) { return x.codigo === d.codigo; })[0];
      var versionActual = actual ? num(actual.version) : 0;
      if (d.versionBase !== undefined && d.versionBase !== null && num(d.versionBase) !== versionActual) {
        return falla('CONFLICTO', 'Esta caracterización cambió mientras la editaba. Recargue e intente de nuevo.');
      }
      var ahora = new Date(dep.ahora()).toISOString();
      var fila = {
        codigo: d.codigo, version: versionActual + 1, datos: d.datos, claves: JSON.stringify(claves),
        apoyo: d.apoyo, clavesApoyo: JSON.stringify(clavesApoyo),
        consentimiento: JSON.stringify({ v: v, f: c.fechaFirma + 'T00:00:00.000Z', modo: 'fisico', por: p.codigo }), actualizado: ahora
      };
      escribir('Caracterizaciones', filas.filter(function (x) { return x.codigo !== d.codigo; }).concat([fila]));
      bitacora(p.codigo, 'caracterizacion-asistida', d.codigo);
      return ok({ version: fila.version, consentimiento: JSON.parse(fila.consentimiento) });
    },

    // La coordinación borra el registro de una persona sin acceso, a solicitud de ella.
    revocarCaracterizacionDe: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden hacer esto.');
      var dueno = leer('Personas').filter(function (x) { return x.codigo === d.codigo; })[0];
      if (!dueno) return falla('DATOS', 'La persona no existe.');
      if (tieneAcceso(dueno)) return falla('PERMISO', 'Esta persona tiene acceso al aplicativo: ella misma puede revocar su autorización.');
      var filas = leer('Caracterizaciones');
      var quedan = filas.filter(function (x) { return x.codigo !== d.codigo; });
      if (quedan.length !== filas.length) { escribir('Caracterizaciones', quedan); bitacora(p.codigo, 'revocacion-asistida', d.codigo); }
      return ok();
    },

    miCaracterizacion: function (d, p) {
      var f = leer('Caracterizaciones').filter(function (c) { return c.codigo === p.codigo; })[0];
      if (!f) return ok({ registro: null });
      return ok({
        registro: {
          version: num(f.version), datos: f.datos, apoyo: f.apoyo,
          clave: json(f.claves, {})[p.codigo] || null, claveApoyo: json(f.clavesApoyo, {})[p.codigo] || null,
          consentimiento: json(f.consentimiento, null), actualizado: f.actualizado
        }
      });
    },

    // La persona revoca su autorización: se borra todo su registro.
    revocarCaracterizacion: function (d, p) {
      var filas = leer('Caracterizaciones');
      var quedan = filas.filter(function (c) { return c.codigo !== p.codigo; });
      if (quedan.length !== filas.length) { escribir('Caracterizaciones', quedan); bitacora(p.codigo, 'revocacion', ''); }
      return ok();
    },

    // Detalle completo: solo para administrador, coordinador y suplente. Cada uno recibe
    // únicamente su propio envoltorio de la llave (no puede abrir lo que no le corresponde).
    caracterizaciones: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden ver las caracterizaciones.');
      var activos = llavesPublicas();
      var personas = leer('Personas');
      return ok({
        caracterizaciones: leer('Caracterizaciones').filter(function (f) { return activos[f.codigo] !== undefined; }).map(function (f) {
          var c = json(f.claves, {}), a = json(f.clavesApoyo, {});
          var cons = json(f.consentimiento, null);
          var dueno = personas.filter(function (x) { return x.codigo === f.codigo; })[0];
          return {
            codigo: f.codigo, version: num(f.version), datos: f.datos, apoyo: f.apoyo,
            modo: cons && cons.modo === 'fisico' ? 'fisico' : 'propio', conAcceso: !!dueno && tieneAcceso(dueno),
            clave: c[p.codigo] || null, claveApoyo: a[p.codigo] || null,
            huellas: soloHuellas(c), huellasApoyo: soloHuellas(a),
            consentimiento: json(f.consentimiento, null), actualizado: f.actualizado
          };
        })
      });
    },

    // Lo mínimo para atender una evacuación: quién necesita apoyo y de qué tipo.
    // Brigadistas: solo personas de su piso. Coordinación: todas. Acompañantes: las suyas.
    apoyos: function (d, p) {
      var lector = puedeEditar(p, ROLES_LECTORES);
      var pisoBrigada = tieneRol(p, 'brigadista') ? num(p.pisoBrigada) : 0;
      var personas = leer('Personas').filter(activa);
      var salida = [];
      leer('Caracterizaciones').forEach(function (f) {
        if (f.codigo === p.codigo) return;
        var dueno = personas.filter(function (x) { return x.codigo === f.codigo; })[0];
        var w = json(f.clavesApoyo, {})[p.codigo];
        if (!dueno || !w) return;
        if (!lector && pisoBrigada && num(dueno.piso) !== pisoBrigada) return;
        salida.push({ codigo: f.codigo, version: num(f.version), apoyo: f.apoyo, clave: w });
      });
      return ok({ apoyos: salida });
    },

    // La coordinación actualiza quién puede abrir cada registro (nuevo coordinador, nuevo
    // brigadista, persona que renovó su llave). Solo toca los envoltorios, nunca los datos.
    // Sin "registro" trabaja sobre las caracterizaciones (como en la v0.11.4); con registro: 'contactos',
    // sobre los contactos de emergencia, y solo acepta destinatarios que pueden leer contactos.
    reenvolver: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden hacer esto.');
      var contactos = d.registro === 'contactos';
      var pares = contactos ? [['claves', 'agregar', 'quitar'], ['clavesSalud', 'agregarSalud', 'quitarSalud']]
        : [['claves', 'agregar', 'quitar'], ['clavesApoyo', 'agregarApoyo', 'quitarApoyo']];
      var pubs = llavesPublicas();
      var personas = leer('Personas');
      var filas = contactos ? leerContactos() : leer('Caracterizaciones');
      var n = 0, omitidos = 0;
      (d.cambios || []).forEach(function (c) {
        var f = filas.filter(function (x) { return x.codigo === c.codigo; })[0];
        if (!f) return;
        // Con «version» (la envía la app v0.12): si el registro cambió después de que se calcularon los
        // envoltorios, traen la llave anterior y no sirven. Se omite y la app lo vuelve a intentar.
        if (c.version !== undefined && c.version !== null && num(c.version) !== num(f.version)) { omitidos++; return; }
        // Contactos: solo quienes pueden leer contactos. Caracterizaciones: el detalle (claves) solo para la
        // coordinación y la persona dueña; el apoyo (clavesApoyo), cualquier persona activa con llave.
        var permitidos = contactos ? lectoresContacto(personas, f.codigo) : lectoresDetalle(personas, f.codigo);
        pares.forEach(function (par) {
          var limitar = contactos || par[0] === 'claves';
          if (contactos && par[0] === 'clavesSalud' && !texto(f.salud)) return;   // sin EPS ni ARL no hay llave que envolver
          var mapa = json(f[par[0]], {});
          var nuevos = c[par[1]];
          if (nuevos && Object.keys(nuevos).length) {
            var validos = mapaEnvoltorios(nuevos, pubs);
            if (!validos || (limitar && !soloLectores(validos, permitidos))) throw ErrorUsuario('Envoltorios no válidos.');
            Object.keys(validos).forEach(function (k) { mapa[k] = validos[k]; });
          }
          (c[par[2]] || []).forEach(function (k) { if (k !== f.codigo) delete mapa[k]; });   // la persona nunca pierde su acceso
          f[par[0]] = JSON.stringify(mapa);
        });
        n++;
      });
      if (n) {
        escribir(contactos ? 'Contactos' : 'Caracterizaciones', filas);
        bitacora(p.codigo, contactos ? 'accesos-contactos' : 'accesos', n + ' registro(s)');
      }
      return ok({ n: n, omitidos: omitidos });
    },

    // ---------- Contactos de emergencia ----------

    // Carga por lote desde el archivo del área de personal (la coordinación). Cada contacto reemplaza el
    // anterior de esa persona; las que no vienen conservan el suyo. Todo o nada: si uno falla no se escribe.
    cargarContactos: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden cargar contactos.');
      if (!Array.isArray(d.ops) || !d.ops.length || d.ops.length > MAX_OPS) return falla('DATOS', 'Cada envío debe traer de 1 a ' + MAX_OPS + ' contactos.');
      var personas = leer('Personas');
      var pubs = llavesPublicas();
      var filas = leerContactosParaEscribir();
      var ahora = new Date(dep.ahora()).toISOString();
      var nuevas = {}, orden = [];
      for (var i = 0; i < d.ops.length; i++) {
        var op = d.ops[i];
        var v = validarContacto(op, personas, pubs, p.codigo);
        if (typeof v === 'string') return falla('DATOS', v);
        if (nuevas[op.codigo]) return falla('DATOS', 'La persona ' + op.codigo + ' viene dos veces en la carga.');
        var actual = filas.filter(function (x) { return x.codigo === op.codigo; })[0];
        nuevas[op.codigo] = filaContacto(op, v, actual, 'carga', p.codigo, ahora);
        orden.push(op.codigo);
      }
      escribir('Contactos', filas.filter(function (x) { return !nuevas[x.codigo]; }).concat(orden.map(function (c) { return nuevas[c]; })));
      bitacora(p.codigo, 'contactos-carga', orden.length + ' registro(s)');
      var versiones = {};
      orden.forEach(function (c) { versiones[c] = nuevas[c].version; });
      return ok({ n: orden.length, versiones: versiones });
    },

    // Corrección de un contacto: la coordinación sobre cualquier persona activa; cualquiera con acceso, solo
    // el suyo. Reemplaza el registro completo (los dos bloques), con control de versión.
    guardarContactoDe: function (d, p) {
      var propio = d.codigo === p.codigo;
      if (!propio && !puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden corregir el contacto de otra persona.');
      var v = validarContacto(d, leer('Personas'), llavesPublicas(), p.codigo);
      if (typeof v === 'string') return falla('DATOS', v);
      var filas = leerContactosParaEscribir();
      var actual = filas.filter(function (x) { return x.codigo === d.codigo; })[0];
      if (d.versionBase !== undefined && d.versionBase !== null && num(d.versionBase) !== (actual ? num(actual.version) : 0)) {
        return falla('CONFLICTO', 'Este contacto cambió mientras lo editaba. Recargue e intente de nuevo.');
      }
      var fila = filaContacto(d, v, actual, propio ? 'propio' : 'coordinacion', p.codigo, new Date(dep.ahora()).toISOString());
      escribir('Contactos', filas.filter(function (x) { return x.codigo !== d.codigo; }).concat([fila]));
      bitacora(p.codigo, 'contacto', d.codigo);
      return ok({ version: fila.version, fuente: fila.fuente, cargado: fila.cargado });
    },

    // Solo lee (sin candado). La coordinación recibe además "faltan": códigos de personas activas sin
    // contacto cargado (para el filtro «Contacto: cargado / falta»), sin ningún dato personal.
    contactos: function (d, p) {
      var r = listarContactos(p, 0);
      var salida = { contactos: r.contactos };
      if (puedeEditar(p, ROLES_LECTORES)) {
        var con = {};
        r.filas.forEach(function (f) { con[f.codigo] = true; });
        salida.faltan = Object.keys(r.pisoDe).filter(function (c) { return !con[c]; }).sort();
      }
      return ok(salida);
    },

    // «Ver otro piso»: acción explícita, separada de "contactos" porque deja en la bitácora el código del
    // brigadista y el piso consultado (sin datos personales). Por eso toma el candado.
    contactosOtroPiso: function (d, p) {
      var coordinacion = puedeEditar(p, ROLES_LECTORES);
      if (!coordinacion && !tieneRol(p, 'brigadista')) return falla('PERMISO', 'Solo los brigadistas y la coordinación pueden ver los contactos de otro piso.');
      var piso = entero(d.piso);
      if (!piso || !leer('Puestos').some(function (q) { return num(q.piso) === piso; })) return falla('DATOS', 'El piso ' + corto(d.piso) + ' no existe en la planta.');
      var lista = listarContactos(p, piso).contactos;
      if (!coordinacion && piso !== num(p.pisoBrigada)) bitacora(p.codigo, 'contactos-otro-piso', 'piso ' + piso);
      return ok({ piso: piso, contactos: lista });
    },

    // Acta nominal de una emergencia cerrada (v0.13): foto de esperados, marcas con sus horas y conteos.
    // Solo la coordinación y la administración; cada consulta queda en la bitácora (sin códigos de personas).
    // Escribe la bitácora: por eso toma el candado.
    detalleEmergencia: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden ver el detalle por persona de una emergencia cerrada.');
      var e = leer('Emergencias').filter(function (x) { return x.id === d.id; })[0];
      if (!e || e.estado !== 'cerrada') return falla('NO_EXISTE', 'Esa emergencia no existe o aún no está cerrada.');
      if (!detalleVigente(e, leerConfig())) return falla('VENCIDO', 'El detalle por persona de esta emergencia ya se borró por el plazo de conservación.');
      bitacora(p.codigo, 'detalle-emergencia', e.id);
      return ok({
        emergencia: emergenciaPublica(e),
        marcas: leer('MarcasEmergencia').filter(function (m) { return m.emergencia === e.id; }).map(function (m) {
          var o = marcaPublica(m), mo = json(m.momentos, {});
          o.momentoEstado = num(mo.estado) || null;
          o.momentoLlegada = num(mo.llegada) || null;
          return o;
        }),
        conteos: leer('ConteosEmergencia').filter(function (c) { return c.emergencia === e.id; }).map(conteoPublico)
      });
    },

    // Histórico de emergencias y simulacros cerrados: solo totales y tiempos. «detalleDisponible» (v0.13)
    // le dice a la coordinación si aún puede abrir el acta nominal.
    historial: function (d, p) {
      if (!puedeEditar(p, ROLES_REPORTAR)) return falla('PERMISO', 'No tiene permiso para ver el histórico.');
      var cfg = leerConfig();
      var lector = puedeEditar(p, ROLES_LECTORES);
      var cerradas = leer('Emergencias').filter(function (e) { return e.estado === 'cerrada'; })
        .sort(function (a, b) { return num(b.inicio) - num(a.inicio); }).slice(0, 100)
        .map(function (e) {
          var o = emergenciaPublica(e);
          delete o.esperados;
          delete o.activadaPor;
          delete o.cerradaPor;
          o.resumen = json(e.resumen, null);
          o.detalleDisponible = lector && detalleVigente(e, cfg);
          return o;
        });
      return ok({ emergencias: cerradas });
    },

    // Guarda un sobre de contenido (contactos, recomendaciones o rutas).
    // versionBase evita pisar un cambio que otra persona hizo mientras tanto.
    guardarContenido: function (d, p) {
      var permitidos = SOBRES_CONTENIDO[d.nombre];
      if (!permitidos) return falla('DATOS', 'Contenido desconocido.');
      if (!puedeEditar(p, permitidos)) return falla('PERMISO', 'No tiene permiso para modificar este contenido.');
      if (!d.datos || texto(d.datos).length > LIMITE_CELDA) return falla('DATOS', 'El contenido es demasiado largo. Acórtelo e intente de nuevo.');
      var actual = leer('Sobres').filter(function (x) { return x.nombre === d.nombre; })[0];
      var versionActual = actual ? num(actual.version) : 0;
      if (d.versionBase !== undefined && d.versionBase !== null && num(d.versionBase) !== versionActual) {
        return falla('CONFLICTO', 'Otra persona modificó esto mientras usted lo editaba. Se recargó la versión nueva: revise e intente de nuevo.');
      }
      var version = guardarSobre(d.nombre, d.datos);
      bitacora(p.codigo, 'contenido', d.nombre);
      return ok({ version: version });
    },

    // Archivo cifrado (mapa, ruta o plano), enviado en trozos. Solo el administrador.
    subirArchivo: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      if (!ARCHIVO_VALIDO.test(texto(d.id))) return falla('DATOS', 'Identificador de archivo no válido.');
      if (MIMES_VALIDOS.indexOf(d.mime) < 0) return falla('DATOS', 'Formato no admitido. Use JPG, PNG o PDF.');
      var partes = d.partes;
      if (!Array.isArray(partes) || !partes.length || partes.length > MAX_PARTES) return falla('DATOS', 'El archivo es demasiado grande.');
      for (var i = 0; i < partes.length; i++) {
        if (texto(partes[i]).length > LIMITE_CELDA) return falla('DATOS', 'Parte del archivo demasiado grande.');
      }
      var cfg = leerConfig();
      var archivos = cfg.archivos || {};
      var version = (archivos[d.id] ? num(archivos[d.id].version) : 0) + 1;
      escribir('Archivos', leer('Archivos').filter(function (f) { return f.id !== d.id; }));
      agregarVarias('Archivos', partes.map(function (x, k) { return { id: d.id, parte: k, datos: x }; }));
      archivos[d.id] = { mime: d.mime, version: version, partes: partes.length, tam: num(d.tam) };
      cfg.archivos = archivos;
      escribirConfig(cfg);
      bitacora(p.codigo, 'archivo', d.id);
      return ok({ version: version });
    },

    bajarArchivo: function (d) {
      var meta = (leerConfig().archivos || {})[d.id];
      if (!meta) return falla('NO_EXISTE', 'Ese archivo aún no está cargado.');
      // Si el adaptador sabe leer solo las filas de un archivo, no se lee la hoja completa (guarda todos los mapas y planos).
      var filasArchivo = dep.leerFiltrado ? dep.leerFiltrado('Archivos', 'id', texto(d.id)) : leer('Archivos').filter(function (f) { return f.id === d.id; });
      var partes = filasArchivo
        .sort(function (a, b) { return num(a.parte) - num(b.parte); })
        .map(function (f) { return f.datos; });
      if (partes.length !== num(meta.partes)) return falla('ERROR', 'El archivo está incompleto. Pida al administrador que lo cargue de nuevo.');
      return ok({ mime: meta.mime, version: num(meta.version), partes: partes });
    },

    quitarArchivo: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var cfg = leerConfig();
      var archivos = cfg.archivos || {};
      if (!archivos[d.id]) return ok();
      escribir('Archivos', leer('Archivos').filter(function (f) { return f.id !== d.id; }));
      delete archivos[d.id];
      cfg.archivos = archivos;
      escribirConfig(cfg);
      bitacora(p.codigo, 'archivo-quitado', d.id);
      return ok();
    },

    // ---------- Presencia y novedades ----------

    // Novedades vigentes (de hoy en adelante). Solo lee.
    novedades: function () {
      return ok({ fecha: dep.hoy(), novedades: novedadesVigentes() });
    },

    // Crea una novedad o, si trae "id", la edita. Cualquier persona con acceso puede registrarla
    // para cualquier persona activa. No guarda el motivo: solo si estará o no en la sede.
    guardarNovedad: function (d, p) {
      var hoy = dep.hoy();
      var persona = leer('Personas').filter(function (x) { return x.codigo === d.codigo && activa(x); })[0];
      if (!persona) return falla('DATOS', 'La persona no existe o ya no está activa.');
      if (TIPOS_NOVEDAD.indexOf(d.tipo) < 0) return falla('DATOS', 'Tipo de novedad no válido.');
      if (!fechaValida(d.desde) || !fechaValida(d.hasta)) return falla('DATOS', 'Las fechas no son válidas.');
      if (d.desde > d.hasta) return falla('DATOS', 'La fecha final no puede ser anterior a la inicial.');
      if (d.hasta < hoy) return falla('DATOS', 'La novedad ya venció: la fecha final debe ser hoy o posterior.');
      if (!d.id && d.desde < hoy) return falla('DATOS', 'Una novedad nueva debe empezar hoy o después.');
      if (diasEntre(d.desde, d.hasta) > MAX_DIAS_NOVEDAD) return falla('DATOS', 'El rango no puede superar ' + MAX_DIAS_NOVEDAD + ' días.');
      var piso = '', puesto = '';
      if (d.tipo === 'otro_lugar') {
        var puestos = leer('Puestos');
        piso = num(d.piso);
        puesto = num(d.puesto);
        if (!piso || !puestos.some(function (x) { return num(x.piso) === piso; })) return falla('DATOS', 'El piso no existe.');
        if (puesto !== 0 && !puestos.some(function (x) { return num(x.piso) === piso && num(x.puesto) === puesto; })) {
          return falla('DATOS', 'Ese puesto no es de ese piso.');
        }
      }
      var filas = leer('Novedades');
      var fila;
      if (d.id) {
        fila = filas.filter(function (x) { return x.id === d.id; })[0];
        if (!fila) return falla('NO_EXISTE', 'Esa novedad ya no existe.');
      } else {
        fila = { id: dep.uuid() };
        filas.push(fila);
      }
      fila.codigo = d.codigo; fila.tipo = d.tipo; fila.desde = d.desde; fila.hasta = d.hasta;
      fila.piso = piso; fila.puesto = puesto;
      fila.registradoPor = p.codigo;
      fila.actualizado = new Date(dep.ahora()).toISOString();
      escribir('Novedades', filas);
      purgarNovedades();
      purgarAntiguos();
      bitacora(p.codigo, 'novedad', fila.id);
      return ok({ novedad: novedadPublica(fila), novedades: novedadesVigentes() });
    },

    quitarNovedad: function (d, p) {
      var filas = leer('Novedades');
      var quedan = filas.filter(function (x) { return x.id !== d.id; });
      if (quedan.length !== filas.length) {
        escribir('Novedades', quedan);
        bitacora(p.codigo, 'novedad-quitada', texto(d.id));
      }
      return ok({ novedades: novedadesVigentes() });
    },

    // Obsoletas desde la v0.9 (ya no hay registro de llegada y salida). Se conservan para que
    // la v0.8.4 de la app no se rompa mientras cada celular se actualiza.
    hoy: function () {
      return ok({ fecha: dep.hoy(), registros: [] });
    },

    // No escribe nada. Responde "obsoleta" a cada operación para que la cola de los celulares
    // con la v0.8.4 se vacíe sola.
    registrar: function (d) {
      if (!Array.isArray(d.ops) || d.ops.length > MAX_OPS) return falla('DATOS', 'Demasiadas operaciones en un solo envío.');
      return ok({
        resultados: d.ops.map(function (op) { return { id: op && op.id, estado: 'obsoleta' }; }),
        hoy: { fecha: dep.hoy(), registros: [] }
      });
    },

    cambiarClave: function (d, p) {
      var personas = leer('Personas');
      var yo = personas.filter(function (x) { return x.codigo === p.codigo; })[0];
      if (hashVerificador(d.verificadorActual) !== yo.verificador) return falla('CREDENCIALES', 'La contraseña actual no es correcta.');
      if (!d.verificadorNuevo || !d.sobresNuevos) return falla('DATOS', 'Faltan datos para cambiar la contraseña.');
      yo.verificador = hashVerificador(d.verificadorNuevo);
      // Si tenía llave privada y el cambio no la trae re-cifrada con la contraseña nueva,
      // quedaría inservible: se descarta la pública para generar un par nuevo al ingresar.
      if (json(yo.sobres, {}).priv && !d.sobresNuevos.priv) yo.pub = '';
      yo.sobres = JSON.stringify(d.sobresNuevos);
      yo.debeCambiar = 'false';
      yo.actualizado = new Date(dep.ahora()).toISOString();
      escribir('Personas', personas);
      // Se cierran las demás sesiones de la persona (otro celular, un equipo prestado): solo sigue esta.
      var actual = sha256(texto(d.token));
      escribir('Sesiones', leer('Sesiones').filter(function (s) { return s.codigo !== p.codigo || s.tokenHash === actual; }));
      bitacora(p.codigo, 'cambio-clave', '');
      return ok({ perfil: perfil(yo) });
    },

    // Mi cuenta → «Cerrar mis otras sesiones» (v0.13): solo sigue la sesión de esta petición.
    cerrarOtrasSesiones: function (d, p) {
      var actual = sha256(texto(d.token));
      var sesiones = leer('Sesiones');
      var quedan = sesiones.filter(function (s) { return s.codigo !== p.codigo || s.tokenHash === actual; });
      if (quedan.length !== sesiones.length) escribir('Sesiones', quedan);
      bitacora(p.codigo, 'cierre-otras-sesiones', String(sesiones.length - quedan.length));
      return ok({ cerradas: sesiones.length - quedan.length });
    },

    // Personas y roles → «Cerrar sus sesiones» (v0.13): un celular perdido deja de tener acceso sin tocar la
    // contraseña ni la llave de la persona.
    cerrarSesionesDe: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var x = leer('Personas').filter(function (y) { return y.codigo === d.codigo; })[0];
      if (!x) return falla('DATOS', 'No existe la persona ' + corto(d.codigo) + '.');
      var sesiones = leer('Sesiones');
      var quedan = sesiones.filter(function (s) { return s.codigo !== x.codigo; });
      if (quedan.length !== sesiones.length) escribir('Sesiones', quedan);
      bitacora(p.codigo, 'cierre-sesiones', x.codigo);
      return ok({ cerradas: sesiones.length - quedan.length });
    },

    guardarPadron: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var personas = leer('Personas');
      aplicarPadron(d.personas || [], personas);
      escribir('Personas', personas);
      // Quien se retira deja de estar en el Despacho: se borran su caracterización y su contacto de emergencia.
      borrarCaracterizacionesInactivas(personas);
      borrarContactosInactivos(personas);
      // Con puestos del Excel se conserva la posición de los que ya existían. Siempre se recalcula el estado.
      recalcularPuestos(personas, d.puestos ? conservarDistribucion(d.puestos) : null, !!d.puestos);
      var version = d.sobreDirectorio ? guardarSobre('directorio', d.sobreDirectorio) : null;
      bitacora(p.codigo, 'padron', (d.personas || []).length + ' cambios');
      return ok({ versionDirectorio: version });
    },

    // Diseño del esquema de un piso: reemplaza TODOS sus puestos (posición y asignable) y sus referencias.
    // Si algo no es válido no se escribe nada. Los demás pisos no se tocan.
    guardarDistribucion: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      d = d || {};
      var actuales = leer('Puestos');
      var piso = entero(d.piso);
      if (!piso || !actuales.some(function (x) { return num(x.piso) === piso; })) {
        return falla('DATOS', 'El piso ' + corto(d.piso) + ' no tiene puestos en la planta.');
      }
      if (!Array.isArray(d.puestos) || !d.puestos.length) return falla('DATOS', 'El piso debe conservar al menos un puesto.');
      if (d.puestos.length > MAX_PUESTOS_PISO) return falla('DATOS', 'Un piso admite como máximo ' + MAX_PUESTOS_PISO + ' puestos.');
      var entradaRefs = vacio(d.referencias) ? [] : d.referencias;
      if (!Array.isArray(entradaRefs)) return falla('DATOS', 'Las referencias no tienen un formato válido.');
      if (entradaRefs.length > MAX_REFERENCIAS_PISO) return falla('DATOS', 'Un piso admite como máximo ' + MAX_REFERENCIAS_PISO + ' referencias.');

      // Casillas ocupadas: 'col,fila' -> nombre del elemento que la usa.
      var casillas = {};
      function ocupar(col, fila, nombre) {
        var k = col + ',' + fila;
        if (casillas[k]) return 'La casilla de la fila ' + fila + ', columna ' + col + ' está ocupada dos veces (' + casillas[k] + ' y ' + nombre + ').';
        casillas[k] = nombre;
        return null;
      }

      var puestos = [], porNumero = {};
      for (var i = 0; i < d.puestos.length; i++) {
        var x = d.puestos[i];
        if (!x || typeof x !== 'object') return falla('DATOS', 'Hay un puesto con un formato no válido.');
        var n = entero(x.puesto);
        if (n === null || n < 1 || n > 999) return falla('DATOS', 'El número de puesto debe ser un entero de 1 a 999 (recibido: ' + corto(x.puesto) + ').');
        if (porNumero[n]) return falla('DATOS', 'El puesto P' + piso + '-' + n + ' está repetido.');
        var col = '', fila = '';
        if (vacio(x.col) !== vacio(x.fila)) return falla('DATOS', 'El puesto P' + piso + '-' + n + ' necesita columna y fila, o ninguna de las dos.');
        if (!vacio(x.col)) {
          col = entero(x.col); fila = entero(x.fila);
          if (col === null || col < 1 || col > MAX_COLUMNAS || fila === null || fila < 1 || fila > MAX_FILAS) {
            return falla('DATOS', 'El puesto P' + piso + '-' + n + ' está fuera del esquema: la columna va de 1 a ' + MAX_COLUMNAS + ' y la fila de 1 a ' + MAX_FILAS + '.');
          }
        }
        var asignable = true;
        if (!vacio(x.asignable)) {
          if (x.asignable === true || x.asignable === 'true') asignable = true;
          else if (x.asignable === false || x.asignable === 'false') asignable = false;
          else return falla('DATOS', 'El valor «asignable» del puesto P' + piso + '-' + n + ' no es válido.');
        }
        if (col !== '') {
          var choque = ocupar(col, fila, 'P' + piso + '-' + n);
          if (choque) return falla('DATOS', choque);
        }
        porNumero[n] = { puesto: n, col: col, fila: fila, asignable: asignable };
        puestos.push(porNumero[n]);
      }

      var idsOtros = {};
      leerReferencias().forEach(function (r) { if (num(r.piso) !== piso) idsOtros[texto(r.id)] = true; });
      var idsNuevos = {};
      var referencias = [];
      for (var j = 0; j < entradaRefs.length; j++) {
        var r = entradaRefs[j];
        if (!r || typeof r !== 'object') return falla('DATOS', 'Hay una referencia con un formato no válido.');
        if (TIPOS_REFERENCIA.indexOf(r.tipo) < 0) return falla('DATOS', 'El tipo de referencia «' + corto(r.tipo) + '» no es válido.');
        if (typeof r.etiqueta === 'object' && r.etiqueta !== null) return falla('DATOS', 'La etiqueta de una referencia no es válida.');
        var etiqueta = vacio(r.etiqueta) ? '' : texto(r.etiqueta).replace(/[\u0000-\u001f]/g, ' ').trim();
        if (etiqueta.length > MAX_ETIQUETA) return falla('DATOS', 'La etiqueta de una referencia admite hasta ' + MAX_ETIQUETA + ' caracteres.');
        var nombreRef = '«' + (etiqueta || r.tipo) + '»';
        var rc = entero(r.col), rf = entero(r.fila), ra = entero(r.ancho), rl = entero(r.alto);
        if (rc === null || rc < 1 || rf === null || rf < 1) return falla('DATOS', 'La referencia ' + nombreRef + ' necesita una columna y una fila.');
        if (ra === null || ra < 1 || ra > MAX_LADO_REFERENCIA || rl === null || rl < 1 || rl > MAX_LADO_REFERENCIA) {
          return falla('DATOS', 'El ancho y el alto de la referencia ' + nombreRef + ' van de 1 a ' + MAX_LADO_REFERENCIA + ' casillas.');
        }
        if (rc + ra - 1 > MAX_COLUMNAS || rf + rl - 1 > MAX_FILAS) {
          return falla('DATOS', 'La referencia ' + nombreRef + ' se sale del esquema (' + MAX_COLUMNAS + ' columnas por ' + MAX_FILAS + ' filas).');
        }
        var id = vacio(r.id) ? '' : texto(r.id);
        if (id !== '' && !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return falla('DATOS', 'El identificador de la referencia ' + nombreRef + ' no es válido.');
        if (id !== '' && (idsOtros[id] || idsNuevos[id])) return falla('DATOS', 'El identificador de la referencia ' + nombreRef + ' ya está en uso.');
        for (var a = 0; a < ra; a++) {
          for (var b = 0; b < rl; b++) {
            var choqueRef = ocupar(rc + a, rf + b, nombreRef);
            if (choqueRef) return falla('DATOS', choqueRef);
          }
        }
        if (id === '') { do { id = dep.uuid(); } while (idsOtros[id] || idsNuevos[id]); }
        idsNuevos[id] = true;
        referencias.push({ piso: piso, id: id, tipo: r.tipo, etiqueta: etiqueta, col: rc, fila: rf, ancho: ra, alto: rl });
      }

      // No se quita ni se deshabilita un puesto que tiene personas activas.
      var personas = leer('Personas');
      var ocupantes = ocupantesPorPuesto(personas);
      var bloqueos = [];
      actuales.filter(function (f) { return num(f.piso) === piso; }).forEach(function (f) {
        var gente = ocupantes[clavePuesto(piso, f.puesto)] || [];
        if (!gente.length) return;
        var nuevo = porNumero[num(f.puesto)];
        if (nuevo && nuevo.asignable) return;
        bloqueos.push('El puesto P' + piso + '-' + num(f.puesto) + ' tiene ' + (gente.length === 1 ? 'asignada a ' : 'asignadas a ') + listaDeCodigos(gente) + ': ' +
          (gente.length === 1 ? 'muévala' : 'muévalas') + (nuevo ? ' antes de marcarlo como no asignable.' : ' antes de quitarlo.'));
      });
      if (bloqueos.length) return falla('DATOS', bloqueos.join(' '));

      // Los demás pisos quedan intactos y en su lugar; el piso editado conserva su sitio en la hoja.
      puestos.sort(function (u, v) { return u.puesto - v.puesto; });
      var filasPiso = puestos.map(function (u) {
        return { piso: piso, puesto: u.puesto, estado: estadoPuesto((ocupantes[clavePuesto(piso, u.puesto)] || []).length),
          col: u.col, fila: u.fila, asignable: u.asignable ? 'true' : 'false' };
      });
      var todos = [], colocado = false;
      actuales.forEach(function (f) {
        if (num(f.piso) !== piso) { todos.push(f); return; }
        if (!colocado) { todos = todos.concat(filasPiso); colocado = true; }
      });
      var otrasReferencias = leerReferencias().filter(function (q) { return num(q.piso) !== piso; });
      escribir('Puestos', todos);
      escribir('Referencias', otrasReferencias.concat(referencias));
      recalcularPuestos(personas, todos);
      bitacora(p.codigo, 'distribucion', 'piso ' + piso);
      return ok({ puestos: todos.map(puestoPublico), referencias: otrasReferencias.concat(referencias).map(referenciaPublica) });
    },

    // Roles, piso de brigada y agenda. Las reglas se validan aquí sobre el resultado final de TODAS
    // las personas activas (no solo las que cambian); si algo falla no se escribe nada.
    guardarRoles: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var personas = leer('Personas');
      var pisosSede = leer('Puestos').map(function (q) { return num(q.piso); })
        .filter(function (n, i, todos) { return todos.indexOf(n) === i; });
      var cambios = Array.isArray(d.cambios) ? d.cambios : [];
      var ahora = new Date(dep.ahora()).toISOString();
      var tocadas = {};
      for (var i = 0; i < cambios.length; i++) {
        var c = cambios[i] || {};
        var x = personas.filter(function (y) { return y.codigo === c.codigo; })[0];
        if (!x) return falla('DATOS', 'No existe la persona ' + texto(c.codigo) + '.');
        x.roles = [].concat(c.roles || []).filter(function (r) { return ROLES_VALIDOS.indexOf(r) >= 0; }).join(',');
        if (tieneRol(x, 'brigadista')) {
          var pisoB = num(c.pisoBrigada);
          if (!pisoB || pisosSede.indexOf(pisoB) < 0) return falla('DATOS', 'El piso de la brigada no existe en la planta (' + x.codigo + ').');
          x.pisoBrigada = pisoB;
        } else {
          x.pisoBrigada = '';
        }
        if (c.agenda !== undefined) {   // la v0.8.4 de la app no la envía: en ese caso no se toca
          var ag = normalizarAgenda(c.agenda);
          if (ag === null) return falla('DATOS', 'La agenda de ' + x.codigo + ' no es válida. Use «ocasional» o los días 1 a 7 separados por coma.');
          x.agenda = ag;
        }
        x.actualizado = ahora;
        tocadas[x.codigo] = true;
      }
      var activas = personas.filter(activa);
      var con = function (rol) { return activas.filter(function (y) { return tieneRol(y, rol); }); };
      if (con('admin').length < 1) return falla('DATOS', 'Debe quedar al menos un administrador activo.');
      if (con('coordinador').length > 1) return falla('DATOS', 'Solo puede haber un coordinador activo.');
      if (con('suplente').length > 1) return falla('DATOS', 'Solo puede haber un suplente activo.');
      if (activas.some(function (y) { return tieneRol(y, 'coordinador') && tieneRol(y, 'suplente'); })) {
        return falla('DATOS', 'Una misma persona no puede ser coordinador y suplente.');
      }
      for (var k = 0; k < pisosSede.length; k++) {
        var n = pisosSede[k];
        if (con('brigadista').filter(function (y) { return num(y.pisoBrigada) === n; }).length > MAX_BRIGADISTAS_POR_PISO) {
          return falla('DATOS', 'El piso ' + n + ' tiene más de ' + MAX_BRIGADISTAS_POR_PISO + ' brigadistas.');
        }
      }
      escribir('Personas', personas);
      // Quien queda sin roles pierde el acceso: se cierran sus sesiones.
      var sinRol = {};
      personas.forEach(function (y) { if (tocadas[y.codigo] && roles(y).length === 0) sinRol[y.codigo] = true; });
      var sesiones = leer('Sesiones');
      var vigentes = sesiones.filter(function (s) { return !sinRol[s.codigo]; });
      if (vigentes.length !== sesiones.length) escribir('Sesiones', vigentes);
      var version = d.sobreDirectorio ? guardarSobre('directorio', d.sobreDirectorio) : null;
      bitacora(p.codigo, 'roles', cambios.map(function (c) { return c && c.codigo; }).join(' '));
      return ok({ versionDirectorio: version });
    },

    guardarConfig: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var cfg = leerConfig();
      if (d.reglasClave) cfg.reglasClave = d.reglasClave;
      if (d.exigirCambioInicial !== undefined) cfg.exigirCambioInicial = !!d.exigirCambioInicial;
      if (d.diasSesion) cfg.diasSesion = Math.max(1, Math.min(90, num(d.diasSesion)));
      if (d.diasBitacora) cfg.diasBitacora = Math.max(30, Math.min(1825, num(d.diasBitacora)));
      if (d.diasDetalleSimulacro) cfg.diasDetalleSimulacro = Math.max(7, Math.min(730, Math.round(num(d.diasDetalleSimulacro))));
      if (d.diasDetalleEmergencia) cfg.diasDetalleEmergencia = Math.max(30, Math.min(1825, Math.round(num(d.diasDetalleEmergencia))));
      if (d.festivos !== undefined) {
        if (!Array.isArray(d.festivos) || d.festivos.length > MAX_FESTIVOS || !d.festivos.every(fechaValida)) {
          return falla('DATOS', 'Los festivos deben ser hasta ' + MAX_FESTIVOS + ' fechas válidas con el formato AAAA-MM-DD.');
        }
        cfg.festivos = d.festivos.filter(function (f, i) { return d.festivos.indexOf(f) === i; }).sort();
      }
      delete cfg.diasHistorico;   // ya no se usa (no hay registro archivado)
      escribirConfig(cfg);
      bitacora(p.codigo, 'config', '');
      return ok({ config: cfg });
    },

    restablecerClave: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var personas = leer('Personas');
      var x = personas.filter(function (y) { return y.codigo === d.codigo; })[0];
      if (!x) return falla('DATOS', 'No existe la persona ' + d.codigo + '.');
      x.verificador = hashVerificador(d.verificador);
      x.sobres = JSON.stringify(d.sobres || {});
      // Al restablecer la contraseña se pierde la llave privada (estaba cifrada con la anterior):
      // se borra la pública y la persona genera un par nuevo en su próximo ingreso.
      x.pub = '';
      x.debeCambiar = d.debeCambiar ? 'true' : 'false';
      x.intentos = 0; x.bloqueadoHasta = 0;
      if (d.hashCorreo) x.hashCorreo = huellaGuardada(d.hashCorreo);
      escribir('Personas', personas);
      escribir('Sesiones', leer('Sesiones').filter(function (s) { return s.codigo !== d.codigo; }));
      bitacora(p.codigo, 'restablecer-clave', d.codigo);
      return ok();
    }
  };

  var PUBLICAS = { ping: true, inicializar: true, ingresar: true };
  // Solo leen: no toman el candado, para que muchos celulares consulten a la vez y no hagan fila
  // detrás de quien está guardando. Ninguna de estas acciones escribe en las hojas.
  var SIN_BLOQUEO = { ping: true, base: true, hoy: true, pulso: true, emergencia: true, bajarArchivo: true, historial: true,
    novedades: true, caracterizaciones: true, apoyos: true, miCaracterizacion: true, contactos: true };
  // Lecturas: repetirlas no cambia nada, no hace falta recordar su respuesta.
  var LECTURAS = { ping: true, base: true, pulso: true, emergencia: true, hoy: true, bajarArchivo: true, historial: true,
    caracterizaciones: true, apoyos: true, miCaracterizacion: true, novedades: true, contactos: true };

  // Google a veces pierde la respuesta después de ejecutar la acción. El celular reintenta
  // con el mismo idPeticion y el servidor devuelve la respuesta guardada en vez de repetirla
  // (cambiar dos veces una contraseña, cerrar dos veces una emergencia...).
  // La clave lleva un sello de quien hizo la petición (su token, o la huella del correo al ingresar): una
  // respuesta guardada solo se entrega a esa misma persona, aunque otra conozca el idPeticion.
  function claveRecordada(peticion) {
    var sello = sha256(texto(peticion.token) || texto(peticion.hashCorreo)).slice(0, 16);
    return 'r:' + texto(peticion.idPeticion).slice(0, 64) + '|' + sello;
  }
  function recordada(peticion) {
    if (!dep.cache || !peticion.idPeticion || LECTURAS[peticion.accion]) return null;
    try { var v = dep.cache.get(claveRecordada(peticion)); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function recordar(peticion, respuesta) {
    if (!dep.cache || !peticion.idPeticion || LECTURAS[peticion.accion]) return;
    try { dep.cache.put(claveRecordada(peticion), JSON.stringify(respuesta), 600); } catch (e) { /* respuesta muy grande: no se recuerda */ }
  }

  function procesar(peticion) {
    try {
      var accion = peticion && peticion.accion;
      if (!acciones[accion]) return falla('ACCION', 'Acción desconocida.');
      var ejecutar = function () {
        memoria = {};
        var previa = recordada(peticion);
        if (previa) return previa;
        var r;
        if (PUBLICAS[accion]) r = acciones[accion](peticion);
        else {
          var p = sesionActual(peticion.token);
          if (!p) return falla('SESION', 'La sesión expiró. Ingrese de nuevo.');
          r = acciones[accion](peticion, p);
        }
        recordar(peticion, r);
        return r;
      };
      return SIN_BLOQUEO[accion] ? ejecutar() : dep.bloqueo(ejecutar);
    } catch (e) {
      if (e && e.usuario) return falla('ERROR', String(e.message));
      // Error interno: no se le cuenta el detalle al usuario (podría revelar cómo está armado el servidor).
      // En Apps Script, console.error queda en el registro de ejecuciones.
      console.error('Error interno en la acción ' + (peticion && peticion.accion) + ': ' + (e && e.stack || e));
      return falla('ERROR', 'Ocurrió un error en el servidor. Intente de nuevo en unos segundos.');
    }
  }

  // usaBloqueo: si la acción espera el candado (lo usa el servidor simulado para imitar la fila de Google).
  return { procesar: procesar, usaBloqueo: function (accion) { return !!acciones[accion] && !SIN_BLOQUEO[accion]; } };
}

// SHA-256 síncrono en JavaScript puro (igual en Apps Script y en el navegador).
function sha256(cadena) {
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  function ror(x, n) { return (x >>> n) | (x << (32 - n)); }

  var b = [];
  var s = unescape(encodeURIComponent(String(cadena)));
  for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i));
  var largoBits = b.length * 8;
  b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  b.push(0, 0, 0, 0, (largoBits >>> 24) & 255, (largoBits >>> 16) & 255, (largoBits >>> 8) & 255, largoBits & 255);

  var w = new Array(64);
  for (var off = 0; off < b.length; off += 64) {
    var t;
    for (t = 0; t < 16; t++) w[t] = (b[off + 4 * t] << 24) | (b[off + 4 * t + 1] << 16) | (b[off + 4 * t + 2] << 8) | b[off + 4 * t + 3];
    for (t = 16; t < 64; t++) {
      var s0 = ror(w[t - 15], 7) ^ ror(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = ror(w[t - 2], 17) ^ ror(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    var a = H[0], c1 = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (t = 0; t < 64; t++) {
      var S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      var S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      var maj = (a & c1) ^ (a & c) ^ (c1 & c);
      var t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = c1; c1 = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + c1) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
}
