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
  Personas: ['codigo', 'piso', 'puesto', 'estado', 'roles', 'pisoBrigada', 'hashCorreo', 'verificador',
    'sobres', 'debeCambiar', 'intentos', 'bloqueadoHasta', 'actualizado', 'pub'],
  Puestos: ['piso', 'puesto', 'estado'],
  Sesiones: ['tokenHash', 'codigo', 'creada', 'expira'],
  Sobres: ['nombre', 'version', 'datos', 'actualizado'],
  Config: ['clave', 'valor'],
  Bitacora: ['fecha', 'codigo', 'accion', 'detalle'],
  // Registro diario de ubicación: RegistroHoy tiene solo el día en curso; al
  // cambiar el día, sus filas pasan a RegistroHistorico (solo se agrega).
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
  Caracterizaciones: ['codigo', 'version', 'datos', 'claves', 'apoyo', 'clavesApoyo', 'consentimiento', 'actualizado']
};

var ROLES_VALIDOS = ['admin', 'coordinador', 'suplente', 'brigadista'];
var ESTADOS_DIA = ['presencial', 'remoto', 'comision', 'vacaciones', 'incapacidad'];
var CAMPOS_REGISTRO = ['estado', 'piso', 'puesto', 'excepcion', 'ingreso', 'salida'];

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
var ESTADOS_EN_EMERGENCIA = ['evacuado', 'no_ubicado', 'apoyo'];
var ROLES_ACTIVAR = ['admin', 'coordinador', 'suplente', 'brigadista'];
var ROLES_SIMULACRO = ['admin', 'coordinador'];
var ROLES_CERRAR = ['admin', 'coordinador', 'suplente'];
var ROLES_REPORTAR = ['admin', 'coordinador', 'suplente', 'brigadista'];
var MAX_INTENTOS = 5;
var MINUTOS_BLOQUEO = 15;

var CONFIG_INICIAL = {
  reglasClave: { minimo: 0, mayuscula: false, numero: false, simbolo: false },
  exigirCambioInicial: false,
  diasSesion: 30,
  // Días que se conservan el registro diario archivado y la bitácora (lo mínimo necesario).
  diasHistorico: 90,
  diasBitacora: 365
};

/**
 * dep = {
 *   leer(tabla) -> [objetos], escribir(tabla, filas), agregar(tabla, fila),
 *   agregarVarias(tabla, filas), prop(nombre), uuid(), ahora() -> ms,
 *   hoy() -> 'AAAA-MM-DD' en hora de Bogotá, bloqueo(fn)
 * }
 */
function crearNucleo(dep) {

  function ok(datos) { return { ok: true, datos: datos || {} }; }
  function falla(codigo, mensaje) { return { ok: false, codigo: codigo, error: mensaje }; }

  function texto(v) { return v === null || v === undefined ? '' : String(v); }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function json(v, defecto) { try { return v ? JSON.parse(v) : defecto; } catch (e) { return defecto; } }

  function roles(p) { return texto(p.roles).split(',').map(function (r) { return r.trim(); }).filter(Boolean); }
  function tieneRol(p, r) { return roles(p).indexOf(r) >= 0; }
  function activa(p) { return texto(p.estado) === 'activo'; }

  function hashVerificador(v) { return sha256(texto(dep.prop('PIMIENTA')) + '|' + texto(v)); }

  function bitacora(codigo, accion, detalle) {
    dep.agregar('Bitacora', { fecha: new Date(dep.ahora()).toISOString(), codigo: codigo || '', accion: accion, detalle: detalle || '' });
  }

  function leerConfig() {
    var cfg = JSON.parse(JSON.stringify(CONFIG_INICIAL));
    dep.leer('Config').forEach(function (f) { cfg[f.clave] = json(f.valor, f.valor); });
    return cfg;
  }

  function escribirConfig(cfg) {
    dep.escribir('Config', Object.keys(cfg).map(function (k) { return { clave: k, valor: JSON.stringify(cfg[k]) }; }));
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
      roles: roles(p), pisoBrigada: p.pisoBrigada ? num(p.pisoBrigada) : null, pub: texto(p.pub)
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
    dep.leer('Personas').filter(activa).forEach(function (x) { o[x.codigo] = texto(x.pub); });
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

  function borrarCaracterizacionesInactivas(personas) {
    var activos = personas.filter(activa).map(function (x) { return x.codigo; });
    var filas = dep.leer('Caracterizaciones');
    var quedan = filas.filter(function (f) { return activos.indexOf(f.codigo) >= 0; });
    if (quedan.length !== filas.length) dep.escribir('Caracterizaciones', quedan);
  }

  function sesionActual(token) {
    if (!token) return null;
    var th = sha256(texto(token));
    var ahora = dep.ahora();
    var s = dep.leer('Sesiones').filter(function (x) { return x.tokenHash === th && num(x.expira) > ahora; })[0];
    if (!s) return null;
    var p = dep.leer('Personas').filter(function (x) { return x.codigo === s.codigo && activa(x); })[0];
    return p || null;
  }

  function contarAdmins(personas) {
    return personas.filter(function (p) { return activa(p) && tieneRol(p, 'admin'); }).length;
  }

  function guardarSobre(nombre, datosCifrados) {
    var sobres = dep.leer('Sobres');
    var s = sobres.filter(function (x) { return x.nombre === nombre; })[0];
    if (!s) { s = { nombre: nombre, version: 0 }; sobres.push(s); }
    s.version = num(s.version) + 1;
    s.datos = datosCifrados;
    s.actualizado = new Date(dep.ahora()).toISOString();
    dep.escribir('Sobres', sobres);
    return s.version;
  }

  // Aplica altas y cambios del padrón. Cada item: {codigo, piso, puesto, estado,
  // hashCorreo?, verificador?, sobres?, debeCambiar?, roles?}
  function aplicarPadron(items, personas) {
    var ahora = new Date(dep.ahora()).toISOString();
    items.forEach(function (it) {
      if (!it.codigo) throw new Error('Falta el código de una persona.');
      var p = personas.filter(function (x) { return x.codigo === it.codigo; })[0];
      if (!p) {
        if (!it.hashCorreo || !it.verificador) throw new Error('La persona ' + it.codigo + ' es nueva y le faltan credenciales.');
        p = { codigo: it.codigo, roles: '', pisoBrigada: '', intentos: 0, bloqueadoHasta: 0, estado: 'activo' };
        personas.push(p);
      }
      if (it.piso !== undefined) p.piso = it.piso;
      if (it.puesto !== undefined) p.puesto = it.puesto;
      if (it.estado !== undefined) p.estado = it.estado;
      if (it.roles !== undefined) p.roles = [].concat(it.roles).filter(function (r) { return ROLES_VALIDOS.indexOf(r) >= 0; }).join(',');
      if (it.hashCorreo) p.hashCorreo = it.hashCorreo;
      if (it.verificador) { p.verificador = hashVerificador(it.verificador); p.intentos = 0; p.bloqueadoHasta = 0; }
      if (it.sobres) p.sobres = JSON.stringify(it.sobres);
      if (it.debeCambiar !== undefined) p.debeCambiar = it.debeCambiar ? 'true' : 'false';
      p.actualizado = ahora;
    });
    var vistos = {};
    personas.filter(activa).forEach(function (p) {
      if (vistos[p.hashCorreo]) throw new Error('Hay dos personas activas con el mismo correo (' + vistos[p.hashCorreo] + ' y ' + p.codigo + ').');
      vistos[p.hashCorreo] = p.codigo;
    });
    if (contarAdmins(personas) < 1) throw new Error('Debe quedar al menos un administrador activo.');
  }

  function soloAdmin(p) { return p && tieneRol(p, 'admin'); }

  // ---------- Registro diario ----------

  // Devuelve las filas del día y, si cambió la fecha, archiva las anteriores.
  function registrosDelDia() {
    var hoy = dep.hoy();
    var filas = dep.leer('RegistroHoy');
    var viejas = filas.filter(function (f) { return f.fecha !== hoy; });
    if (viejas.length) {
      dep.agregarVarias('RegistroHistorico', viejas);
      filas = filas.filter(function (f) { return f.fecha === hoy; });
      dep.escribir('RegistroHoy', filas);
      purgarAntiguos();
    }
    return filas;
  }

  // Una vez al día (al cambiar la fecha) se borra lo que superó el plazo de conservación.
  function purgarAntiguos() {
    var cfg = leerConfig();
    var limite = function (dias) { return new Date(dep.ahora() - Math.max(1, num(dias)) * 86400000).toISOString().slice(0, 10); };
    var lh = limite(cfg.diasHistorico || 90);
    var hist = dep.leer('RegistroHistorico');
    var hist2 = hist.filter(function (f) { return texto(f.fecha) >= lh; });
    if (hist2.length < hist.length) dep.escribir('RegistroHistorico', hist2);
    var lb = limite(cfg.diasBitacora || 365);
    var bit = dep.leer('Bitacora');
    var bit2 = bit.filter(function (f) { return texto(f.fecha).slice(0, 10) >= lb; });
    if (bit2.length < bit.length) dep.escribir('Bitacora', bit2);
  }

  function registroPublico(f) {
    return {
      codigo: f.codigo, estado: texto(f.estado), piso: num(f.piso), puesto: num(f.puesto),
      excepcion: texto(f.excepcion) === 'true', ingreso: texto(f.ingreso), salida: texto(f.salida),
      reportadoPor: texto(f.reportadoPor)
    };
  }

  function valorValido(campo, v) {
    v = texto(v);
    if (campo === 'estado') return v === '' || ESTADOS_DIA.indexOf(v) >= 0;
    if (campo === 'ingreso' || campo === 'salida') return v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (campo === 'piso') return /^\d{1,2}$/.test(v);
    if (campo === 'puesto') return /^\d{1,3}$/.test(v);
    if (campo === 'excepcion') return v === 'true' || v === 'false';
    return false;
  }

  function hoyPublico(filas) {
    return { fecha: dep.hoy(), registros: filas.map(registroPublico) };
  }

  // Sobres de contenido y lista de archivos disponibles (sin su contenido).
  function contenidoPublico(cfg) {
    var sobres = dep.leer('Sobres');
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
    return (lista || dep.leer('Emergencias')).filter(function (e) { return e.estado === 'activa'; })[0] || null;
  }

  function emergenciaPublica(e) {
    return {
      id: e.id, tipo: e.tipo, descripcion: texto(e.descripcion), simulacro: texto(e.simulacro) === 'true',
      estado: e.estado, inicio: num(e.inicio), activadaPor: e.activadaPor, cierre: e.cierre ? num(e.cierre) : null,
      cerradaPor: texto(e.cerradaPor), version: num(e.version), esperados: json(e.esperados, {})
    };
  }

  // Quien no reporta en emergencias (no es brigadista, coordinación ni administración) solo
  // recibe su propia marca y las cifras por piso: nunca el detalle de otras personas
  // (por ejemplo, quién necesita asistencia por discapacidad).
  function estadoEmergencia(id, p) {
    var lista = dep.leer('Emergencias');
    var e = id ? lista.filter(function (x) { return x.id === id; })[0] : emergenciaActiva(lista);
    if (!e) return { emergencia: null, marcas: [], conteos: [] };
    if (p && !puedeEditar(p, ROLES_REPORTAR)) {
      var pub = emergenciaPublica(e);
      pub.esperados = {};
      var r = e.estado === 'activa' ? resumenCierre(e, '') : null;
      var propia = dep.leer('MarcasEmergencia').filter(function (m) { return m.emergencia === e.id && m.codigo === p.codigo; })
        .map(function (m) { return { codigo: m.codigo, estado: texto(m.estado), asistencia: texto(m.asistencia) === 'true', llegada: texto(m.llegada), reportadoPor: '', actualizado: '' }; });
      return {
        emergencia: pub, marcas: propia, conteos: [],
        cifras: r ? {
          pisos: r.pisos.map(function (f) { return { piso: f.piso, esperados: f.esperados, porVerificar: f.porVerificar, evacuados: f.evacuados, noUbicados: f.noUbicados, apoyo: f.apoyo, pendientes: f.pendientes, llegaron: f.llegaron, porConteo: f.porConteo, reportado: f.reportado }; }),
          total: { esperados: r.total.esperados, evacuados: r.total.evacuados, llegaron: r.total.llegaron, noUbicados: r.total.noUbicados, apoyo: r.total.apoyo, pendientes: r.total.pendientes, porVerificar: r.total.porVerificar }
        } : null
      };
    }
    return {
      emergencia: emergenciaPublica(e),
      marcas: dep.leer('MarcasEmergencia').filter(function (m) { return m.emergencia === e.id; }).map(function (m) {
        return { codigo: m.codigo, estado: texto(m.estado), asistencia: texto(m.asistencia) === 'true', llegada: texto(m.llegada), reportadoPor: texto(m.reportadoPor), actualizado: texto(m.actualizado) };
      }),
      conteos: dep.leer('ConteosEmergencia').filter(function (c) { return c.emergencia === e.id; }).map(function (c) {
        return { piso: num(c.piso), evacuados: num(c.evacuados), noUbicados: num(c.noUbicados), apoyo: num(c.apoyo), reportadoPor: texto(c.reportadoPor) };
      })
    };
  }

  // Foto de quién está en la sede al activar: por piso, quienes reportaron estar
  // ("en") y quienes no han reportado su día ("sin", para verificar).
  function fotoEsperados() {
    var hoy = registrosDelDia();
    var foto = {};
    dep.leer('Personas').filter(activa).forEach(function (p) {
      var r = hoy.filter(function (x) { return x.codigo === p.codigo; })[0];
      var piso = r && texto(r.excepcion) === 'true' ? num(r.piso) : num(p.piso);
      var grupo = !r || !texto(r.estado) ? 'sin' : (r.estado === 'presencial' && !texto(r.salida) ? 'en' : null);
      if (!grupo) return;
      foto[piso] = foto[piso] || { en: [], sin: [] };
      foto[piso][grupo].push(p.codigo);
    });
    return foto;
  }

  // Informe de cierre: totales y tiempos por piso, sin nombres ni códigos.
  // Los tiempos salen del momento en que se hizo cada marca (reloj del celular).
  function resumenCierre(e, observaciones) {
    var foto = json(e.esperados, {});
    var marcas = dep.leer('MarcasEmergencia').filter(function (m) { return m.emergencia === e.id; });
    var conteos = dep.leer('ConteosEmergencia').filter(function (c) { return c.emergencia === e.id; });
    var personas = dep.leer('Personas');
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
      var pendientes = conteo
        ? Math.max(0, en.length - cifras.evacuados - cifras.noUbicados - cifras.apoyo)
        : en.filter(function (c) { return !(marca[c] && marca[c].estado); }).length;
      var completo = en.length > 0 && (conteo ? cifras.evacuados >= en.length
        : en.every(function (c) { return marca[c] && (marca[c].estado === 'evacuado' || texto(marca[c].llegada)); }));
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
        evacuados: cifras.evacuados, noUbicados: cifras.noUbicados, apoyo: cifras.apoyo, pendientes: pendientes,
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
      version: 1,
      duracionMs: Math.max(0, num(e.cierre) - inicio),
      hitos: {
        primeraSalida: vacioNulo(todasSalidas, Math.min), ultimaSalida: vacioNulo(todasSalidas, Math.max),
        primeraLlegada: vacioNulo(todasLlegadas, Math.min), ultimaLlegada: vacioNulo(todasLlegadas, Math.max)
      },
      total: {
        esperados: suma('esperados'), evacuados: suma('evacuados'), llegaron: suma('llegaron'), noUbicados: suma('noUbicados'),
        apoyo: suma('apoyo'), asistencia: suma('asistencia'), pendientes: suma('pendientes'), porVerificar: suma('porVerificar')
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

  // Aplica campos con "gana el más reciente" (igual que el registro diario).
  function aplicarCampos(fila, campos, momento, validos, validar) {
    momento = momentoCliente(momento);
    var momentos = json(fila.momentos, {});
    var cambio = false;
    validos.forEach(function (c) {
      if (!campos || campos[c] === undefined) return;
      if (!validar(c, texto(campos[c]))) return;
      if (num(momento) < num(momentos[c])) return;
      fila[c] = texto(campos[c]);
      momentos[c] = num(momento);
      cambio = true;
    });
    if (cambio) fila.momentos = JSON.stringify(momentos);
    return cambio;
  }

  var acciones = {

    ping: function () {
      return ok({ servicio: 'EMERGENCIAS D3', inicializado: dep.leer('Personas').length > 0 });
    },

    inicializar: function (d) {
      if (dep.leer('Personas').length > 0) return falla('YA_INICIALIZADO', 'El aplicativo ya fue inicializado.');
      if (!d.codigoInstalacion || texto(d.codigoInstalacion).trim() !== texto(dep.prop('CODIGO_INSTALACION')))
        return falla('CODIGO', 'El código de instalación no coincide.');
      var personas = [];
      aplicarPadron(d.personas || [], personas);
      dep.escribir('Personas', personas);
      dep.escribir('Puestos', d.puestos || []);
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
      var personas = dep.leer('Personas');
      var p = personas.filter(function (x) { return x.hashCorreo === d.hashCorreo && activa(x); })[0];
      if (!p) { bitacora('', 'ingreso-fallido', 'correo no registrado'); return falla('CREDENCIALES', 'Correo o contraseña incorrectos.'); }
      if (num(p.bloqueadoHasta) > ahora) {
        var min = Math.ceil((num(p.bloqueadoHasta) - ahora) / 60000);
        return falla('BLOQUEADO', 'Demasiados intentos fallidos. Intente de nuevo en ' + min + ' minuto(s).');
      }
      if (hashVerificador(d.verificador) !== p.verificador) {
        p.intentos = num(p.intentos) + 1;
        if (p.intentos >= MAX_INTENTOS) { p.bloqueadoHasta = ahora + MINUTOS_BLOQUEO * 60000; p.intentos = 0; }
        dep.escribir('Personas', personas);
        bitacora(p.codigo, 'ingreso-fallido', '');
        return falla('CREDENCIALES', 'Correo o contraseña incorrectos.');
      }
      p.intentos = 0; p.bloqueadoHasta = 0;
      dep.escribir('Personas', personas);
      var token = (dep.uuid() + dep.uuid()).replace(/-/g, '');
      var cfg = leerConfig();
      var sesiones = dep.leer('Sesiones').filter(function (s) { return num(s.expira) > ahora; });
      sesiones.push({ tokenHash: sha256(token), codigo: p.codigo, creada: ahora, expira: ahora + num(cfg.diasSesion) * 86400000 });
      dep.escribir('Sesiones', sesiones);
      bitacora(p.codigo, 'ingreso', '');
      return ok({ token: token, perfil: perfil(p) });
    },

    salir: function (d) {
      var th = sha256(texto(d.token));
      dep.escribir('Sesiones', dep.leer('Sesiones').filter(function (s) { return s.tokenHash !== th; }));
      return ok();
    },

    base: function (d, p) {
      var cfg = leerConfig();
      var dir = dep.leer('Sobres').filter(function (s) { return s.nombre === 'directorio'; })[0];
      return ok({
        perfil: perfil(p),
        personas: dep.leer('Personas').map(publica),
        puestos: dep.leer('Puestos').map(function (x) { return { piso: num(x.piso), puesto: num(x.puesto), estado: texto(x.estado) }; }),
        directorio: dir ? { version: num(dir.version), datos: dir.datos } : null,
        config: { reglasClave: cfg.reglasClave, exigirCambioInicial: !!cfg.exigirCambioInicial, diasSesion: num(cfg.diasSesion), diasHistorico: num(cfg.diasHistorico), diasBitacora: num(cfg.diasBitacora) },
        hoy: hoyPublico(registrosDelDia()),
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
      if (!puedeEditar(p, simulacro ? ROLES_SIMULACRO : ROLES_ACTIVAR)) {
        return falla('PERMISO', simulacro ? 'Solo el coordinador o el administrador pueden iniciar un simulacro.' : 'No tiene permiso para activar una emergencia.');
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
      dep.agregar('Emergencias', e);
      bitacora(p.codigo, simulacro ? 'simulacro-inicio' : 'emergencia-inicio', e.id + ' ' + e.tipo);
      return ok(estadoEmergencia(e.id, p));
    },

    // Marcas del piso y del punto de encuentro, persona por persona o por conteo.
    // Cada persona puede reportarse a sí misma; brigadistas, coordinación y
    // administración pueden reportar a cualquiera.
    // op = { id, emergencia, momento, tipo: 'persona', codigo, campos: { estado?, asistencia?, llegada? } }
    //    | { id, emergencia, momento, tipo: 'conteo', piso, campos: { evacuados?, noUbicados?, apoyo? } }
    marcarEmergencia: function (d, p) {
      var lista = dep.leer('Emergencias');
      var personas = dep.leer('Personas').filter(activa);
      var marcas = dep.leer('MarcasEmergencia');
      var conteos = dep.leer('ConteosEmergencia');
      var reporta = puedeEditar(p, ROLES_REPORTAR);
      var ahora = new Date(dep.ahora()).toISOString();
      var tocadas = {};
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
          if (cambio) { c.reportadoPor = p.codigo; c.actualizado = ahora; }
        } else {
          if (!personas.some(function (x) { return x.codigo === op.codigo; })) return { id: op.id, estado: 'persona' };
          var propio = op.codigo === p.codigo;
          if (!propio && !reporta) return { id: op.id, estado: 'permiso' };
          var m = marcas.filter(function (x) { return x.emergencia === e.id && x.codigo === op.codigo; })[0];
          if (!m) { m = { emergencia: e.id, codigo: op.codigo, estado: '', asistencia: 'false', llegada: '', momentos: '{}' }; marcas.push(m); }
          cambio = aplicarCampos(m, op.campos, op.momento, ['estado', 'asistencia', 'llegada'], function (k, v) {
            if (k === 'estado') return v === '' || (ESTADOS_EN_EMERGENCIA.indexOf(v) >= 0 && (reporta || v !== 'no_ubicado'));
            if (k === 'asistencia') return v === 'true' || v === 'false';
            return v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
          });
          if (cambio) { m.reportadoPor = p.codigo; m.actualizado = ahora; }
        }
        if (cambio) tocadas[e.id] = true;
        return { id: op.id, estado: 'ok' };
      });
      dep.escribir('MarcasEmergencia', marcas);
      dep.escribir('ConteosEmergencia', conteos);
      if (Object.keys(tocadas).length) {
        lista.forEach(function (e) { if (tocadas[e.id]) e.version = num(e.version) + 1; });
        dep.escribir('Emergencias', lista);
      }
      return ok({ resultados: resultados, estado: estadoEmergencia(null, p) });
    },

    cerrarEmergencia: function (d, p) {
      var lista = dep.leer('Emergencias');
      var e = lista.filter(function (x) { return x.id === d.id && x.estado === 'activa'; })[0];
      if (!e) return falla('NO_ACTIVA', 'Esa emergencia ya fue cerrada.');
      var simulacro = texto(e.simulacro) === 'true';
      if (!puedeEditar(p, simulacro ? ROLES_SIMULACRO : ROLES_CERRAR)) {
        return falla('PERMISO', simulacro ? 'Solo el coordinador o el administrador pueden terminar un simulacro.' : 'Solo la coordinación o el administrador pueden cerrar la emergencia.');
      }
      e.estado = 'cerrada';
      e.cierre = dep.ahora();
      e.cerradaPor = p.codigo;
      e.version = num(e.version) + 1;
      // El informe guarda solo totales y tiempos. Se borra el detalle por persona
      // (quién estaba, a quién se marcó, quién necesitó asistencia): lo mínimo necesario.
      e.resumen = JSON.stringify(resumenCierre(e, d.observaciones));
      e.esperados = '{}';
      dep.escribir('MarcasEmergencia', dep.leer('MarcasEmergencia').filter(function (m) { return m.emergencia !== e.id; }));
      dep.escribir('ConteosEmergencia', dep.leer('ConteosEmergencia').filter(function (c) { return c.emergencia !== e.id; }));
      dep.escribir('Emergencias', lista);
      bitacora(p.codigo, simulacro ? 'simulacro-cierre' : 'emergencia-cierre', e.id);
      return ok(estadoEmergencia(e.id, p));
    },

    // ---------- Caracterización individual (todo llega cifrado desde el navegador) ----------

    // Cada persona genera su par de llaves la primera vez que ingresa. La privada llega
    // ya cifrada con su contraseña: el servidor nunca puede abrirla.
    registrarPar: function (d, p) {
      var personas = dep.leer('Personas');
      var x = personas.filter(function (y) { return y.codigo === p.codigo; })[0];
      var sobres = json(x.sobres, {});
      if (sobres.priv) return falla('YA_EXISTE', 'Ya tiene un par de llaves.');
      if (!llavePublicaValida(d.pub) || typeof d.priv !== 'string' || !d.priv || d.priv.length > 2000) return falla('DATOS', 'Llaves no válidas.');
      x.pub = d.pub;
      sobres.priv = d.priv;
      x.sobres = JSON.stringify(sobres);
      x.actualizado = new Date(dep.ahora()).toISOString();
      dep.escribir('Personas', personas);
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
      if (typeof d.datos !== 'string' || typeof d.apoyo !== 'string' || !d.datos || !d.apoyo || d.datos.length > LIMITE_CELDA || d.apoyo.length > LIMITE_CELDA) {
        return falla('DATOS', 'El contenido es demasiado largo.');
      }
      var v = d.consentimiento ? texto(d.consentimiento.v).slice(0, 20) : '';
      if (!v) return falla('CONSENTIMIENTO', 'Falta la aceptación de la autorización de tratamiento de datos.');
      var filas = dep.leer('Caracterizaciones');
      var actual = filas.filter(function (c) { return c.codigo === p.codigo; })[0];
      var versionActual = actual ? num(actual.version) : 0;
      if (d.versionBase !== undefined && d.versionBase !== null && num(d.versionBase) !== versionActual) {
        return falla('CONFLICTO', 'Su caracterización cambió desde otro dispositivo. Recargue e intente de nuevo.');
      }
      var ahora = new Date(dep.ahora()).toISOString();
      var previo = actual ? json(actual.consentimiento, {}) : {};
      var fila = {
        codigo: p.codigo, version: versionActual + 1, datos: d.datos, claves: JSON.stringify(claves),
        apoyo: d.apoyo, clavesApoyo: JSON.stringify(clavesApoyo),
        consentimiento: JSON.stringify({ v: v, f: previo.v === v && previo.f ? previo.f : ahora }), actualizado: ahora
      };
      dep.escribir('Caracterizaciones', filas.filter(function (c) { return c.codigo !== p.codigo; }).concat([fila]));
      if (previo.v !== v) bitacora(p.codigo, 'consentimiento', v);
      bitacora(p.codigo, 'caracterizacion', 'v' + fila.version);
      return ok({ version: fila.version, consentimiento: JSON.parse(fila.consentimiento) });
    },

    miCaracterizacion: function (d, p) {
      var f = dep.leer('Caracterizaciones').filter(function (c) { return c.codigo === p.codigo; })[0];
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
      var filas = dep.leer('Caracterizaciones');
      var quedan = filas.filter(function (c) { return c.codigo !== p.codigo; });
      if (quedan.length !== filas.length) { dep.escribir('Caracterizaciones', quedan); bitacora(p.codigo, 'revocacion', ''); }
      return ok();
    },

    // Detalle completo: solo para administrador, coordinador y suplente. Cada uno recibe
    // únicamente su propio envoltorio de la llave (no puede abrir lo que no le corresponde).
    caracterizaciones: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden ver las caracterizaciones.');
      var activos = llavesPublicas();
      return ok({
        caracterizaciones: dep.leer('Caracterizaciones').filter(function (f) { return activos[f.codigo] !== undefined; }).map(function (f) {
          var c = json(f.claves, {}), a = json(f.clavesApoyo, {});
          return {
            codigo: f.codigo, version: num(f.version), datos: f.datos, apoyo: f.apoyo,
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
      var personas = dep.leer('Personas').filter(activa);
      var salida = [];
      dep.leer('Caracterizaciones').forEach(function (f) {
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
    reenvolver: function (d, p) {
      if (!puedeEditar(p, ROLES_LECTORES)) return falla('PERMISO', 'Solo la coordinación y la administración pueden hacer esto.');
      var pubs = llavesPublicas();
      var filas = dep.leer('Caracterizaciones');
      var n = 0;
      (d.cambios || []).forEach(function (c) {
        var f = filas.filter(function (x) { return x.codigo === c.codigo; })[0];
        if (!f) return;
        [['claves', 'agregar', 'quitar'], ['clavesApoyo', 'agregarApoyo', 'quitarApoyo']].forEach(function (par) {
          var mapa = json(f[par[0]], {});
          var nuevos = c[par[1]];
          if (nuevos && Object.keys(nuevos).length) {
            var validos = mapaEnvoltorios(nuevos, pubs);
            if (!validos) throw new Error('Envoltorios no válidos.');
            Object.keys(validos).forEach(function (k) { mapa[k] = validos[k]; });
          }
          (c[par[2]] || []).forEach(function (k) { if (k !== f.codigo) delete mapa[k]; });   // la persona nunca pierde su acceso
          f[par[0]] = JSON.stringify(mapa);
        });
        n++;
      });
      dep.escribir('Caracterizaciones', filas);
      if (n) bitacora(p.codigo, 'accesos', n + ' registro(s)');
      return ok({ n: n });
    },

    // Histórico de emergencias y simulacros cerrados: solo totales y tiempos.
    historial: function (d, p) {
      if (!puedeEditar(p, ROLES_REPORTAR)) return falla('PERMISO', 'No tiene permiso para ver el histórico.');
      var cerradas = dep.leer('Emergencias').filter(function (e) { return e.estado === 'cerrada'; })
        .sort(function (a, b) { return num(b.inicio) - num(a.inicio); }).slice(0, 100)
        .map(function (e) {
          var o = emergenciaPublica(e);
          delete o.esperados;
          delete o.activadaPor;
          delete o.cerradaPor;
          o.resumen = json(e.resumen, null);
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
      var actual = dep.leer('Sobres').filter(function (x) { return x.nombre === d.nombre; })[0];
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
      dep.escribir('Archivos', dep.leer('Archivos').filter(function (f) { return f.id !== d.id; }));
      dep.agregarVarias('Archivos', partes.map(function (x, k) { return { id: d.id, parte: k, datos: x }; }));
      archivos[d.id] = { mime: d.mime, version: version, partes: partes.length, tam: num(d.tam) };
      cfg.archivos = archivos;
      escribirConfig(cfg);
      bitacora(p.codigo, 'archivo', d.id);
      return ok({ version: version });
    },

    bajarArchivo: function (d) {
      var meta = (leerConfig().archivos || {})[d.id];
      if (!meta) return falla('NO_EXISTE', 'Ese archivo aún no está cargado.');
      var partes = dep.leer('Archivos').filter(function (f) { return f.id === d.id; })
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
      dep.escribir('Archivos', dep.leer('Archivos').filter(function (f) { return f.id !== d.id; }));
      delete archivos[d.id];
      cfg.archivos = archivos;
      escribirConfig(cfg);
      bitacora(p.codigo, 'archivo-quitado', d.id);
      return ok();
    },

    hoy: function () {
      return ok(hoyPublico(registrosDelDia()));
    },

    // Aplica marcas del registro diario. Cada marca trae su propio momento y,
    // campo por campo, gana la más reciente: así se pueden reenviar marcas
    // guardadas sin conexión sin duplicar ni pisar cambios posteriores.
    // op = { id, fecha, codigo, momento, campos: { estado?, piso?, puesto?, excepcion?, ingreso?, salida? } }
    registrar: function (d, p) {
      var hoy = dep.hoy();
      var filas = registrosDelDia();
      var personas = dep.leer('Personas').filter(activa);
      if (!Array.isArray(d.ops) || d.ops.length > MAX_OPS) return falla('DATOS', 'Demasiadas operaciones en un solo envío.');
      var resultados = d.ops.map(function (op) {
        if (!op || op.fecha !== hoy) return { id: op && op.id, estado: 'fecha' };
        var persona = personas.filter(function (x) { return x.codigo === op.codigo; })[0];
        if (!persona) return { id: op.id, estado: 'persona' };
        var f = filas.filter(function (x) { return x.codigo === op.codigo; })[0];
        if (!f) {
          f = { fecha: hoy, codigo: op.codigo, estado: '', piso: persona.piso, puesto: persona.puesto, excepcion: 'false',
            ingreso: '', salida: '', momentos: '{}' };
          filas.push(f);
        }
        var momentos = json(f.momentos, {});
        var momento = momentoCliente(op.momento);
        var cambio = false;
        CAMPOS_REGISTRO.forEach(function (c) {
          if (!op.campos || op.campos[c] === undefined) return;
          if (!valorValido(c, op.campos[c])) return;
          if (momento < num(momentos[c])) return;
          f[c] = texto(op.campos[c]);
          momentos[c] = momento;
          cambio = true;
        });
        if (cambio) {
          f.momentos = JSON.stringify(momentos);
          f.reportadoPor = p.codigo;
          f.actualizado = new Date(dep.ahora()).toISOString();
        }
        return { id: op.id, estado: 'ok' };
      });
      dep.escribir('RegistroHoy', filas);
      return ok({ resultados: resultados, hoy: hoyPublico(filas) });
    },

    cambiarClave: function (d, p) {
      var personas = dep.leer('Personas');
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
      dep.escribir('Personas', personas);
      // Se cierran las demás sesiones de la persona (otro celular, un equipo prestado): solo sigue esta.
      var actual = sha256(texto(d.token));
      dep.escribir('Sesiones', dep.leer('Sesiones').filter(function (s) { return s.codigo !== p.codigo || s.tokenHash === actual; }));
      bitacora(p.codigo, 'cambio-clave', '');
      return ok({ perfil: perfil(yo) });
    },

    guardarPadron: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var personas = dep.leer('Personas');
      aplicarPadron(d.personas || [], personas);
      dep.escribir('Personas', personas);
      // Quien se retira deja de estar en el Despacho: se borra su caracterización.
      borrarCaracterizacionesInactivas(personas);
      if (d.puestos) dep.escribir('Puestos', d.puestos);
      var version = d.sobreDirectorio ? guardarSobre('directorio', d.sobreDirectorio) : null;
      bitacora(p.codigo, 'padron', (d.personas || []).length + ' cambios');
      return ok({ versionDirectorio: version });
    },

    guardarRoles: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var personas = dep.leer('Personas');
      (d.cambios || []).forEach(function (c) {
        var x = personas.filter(function (y) { return y.codigo === c.codigo; })[0];
        if (!x) throw new Error('No existe la persona ' + c.codigo + '.');
        x.roles = [].concat(c.roles || []).filter(function (r) { return ROLES_VALIDOS.indexOf(r) >= 0; }).join(',');
        var pisoB = num(c.pisoBrigada);
        var pisosSede = dep.leer('Puestos').map(function (q) { return num(q.piso); });
        x.pisoBrigada = tieneRol(x, 'brigadista') && pisoB && pisosSede.indexOf(pisoB) >= 0 ? pisoB : '';
      });
      if (contarAdmins(personas) < 1) return falla('ADMIN', 'Debe quedar al menos un administrador activo.');
      dep.escribir('Personas', personas);
      var version = d.sobreDirectorio ? guardarSobre('directorio', d.sobreDirectorio) : null;
      bitacora(p.codigo, 'roles', (d.cambios || []).map(function (c) { return c.codigo; }).join(' '));
      return ok({ versionDirectorio: version });
    },

    guardarConfig: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var cfg = leerConfig();
      if (d.reglasClave) cfg.reglasClave = d.reglasClave;
      if (d.exigirCambioInicial !== undefined) cfg.exigirCambioInicial = !!d.exigirCambioInicial;
      if (d.diasSesion) cfg.diasSesion = Math.max(1, Math.min(90, num(d.diasSesion)));
      if (d.diasHistorico) cfg.diasHistorico = Math.max(7, Math.min(730, num(d.diasHistorico)));
      if (d.diasBitacora) cfg.diasBitacora = Math.max(30, Math.min(1825, num(d.diasBitacora)));
      escribirConfig(cfg);
      bitacora(p.codigo, 'config', '');
      return ok({ config: cfg });
    },

    restablecerClave: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var personas = dep.leer('Personas');
      var x = personas.filter(function (y) { return y.codigo === d.codigo; })[0];
      if (!x) return falla('DATOS', 'No existe la persona ' + d.codigo + '.');
      x.verificador = hashVerificador(d.verificador);
      x.sobres = JSON.stringify(d.sobres || {});
      // Al restablecer la contraseña se pierde la llave privada (estaba cifrada con la anterior):
      // se borra la pública y la persona genera un par nuevo en su próximo ingreso.
      x.pub = '';
      x.debeCambiar = d.debeCambiar ? 'true' : 'false';
      x.intentos = 0; x.bloqueadoHasta = 0;
      if (d.hashCorreo) x.hashCorreo = d.hashCorreo;
      dep.escribir('Personas', personas);
      dep.escribir('Sesiones', dep.leer('Sesiones').filter(function (s) { return s.codigo !== d.codigo; }));
      bitacora(p.codigo, 'restablecer-clave', d.codigo);
      return ok();
    }
  };

  var PUBLICAS = { ping: true, inicializar: true, ingresar: true };
  // Solo leen: no toman el candado, para que muchos celulares consulten a la vez.
  var SIN_BLOQUEO = { pulso: true, emergencia: true, bajarArchivo: true, historial: true };

  function procesar(peticion) {
    try {
      var accion = peticion && peticion.accion;
      if (!acciones[accion]) return falla('ACCION', 'Acción desconocida.');
      var ejecutar = function () {
        if (PUBLICAS[accion]) return acciones[accion](peticion);
        var p = sesionActual(peticion.token);
        if (!p) return falla('SESION', 'La sesión expiró. Ingrese de nuevo.');
        return acciones[accion](peticion, p);
      };
      return SIN_BLOQUEO[accion] ? ejecutar() : dep.bloqueo(ejecutar);
    } catch (e) {
      return falla('ERROR', String(e && e.message || e));
    }
  }

  return { procesar: procesar };
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
