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
  Personas: ['codigo', 'piso', 'puesto', 'estado', 'roles', 'pisoBrigada', 'hashCorreo', 'verificador',
    'sobres', 'debeCambiar', 'intentos', 'bloqueadoHasta', 'actualizado'],
  Puestos: ['piso', 'puesto', 'estado'],
  Sesiones: ['tokenHash', 'codigo', 'creada', 'expira'],
  Sobres: ['nombre', 'version', 'datos', 'actualizado'],
  Config: ['clave', 'valor'],
  Bitacora: ['fecha', 'codigo', 'accion', 'detalle'],
  // Registro diario de ubicación: RegistroHoy tiene solo el día en curso; al
  // cambiar el día, sus filas pasan a RegistroHistorico (solo se agrega).
  RegistroHoy: ['fecha', 'codigo', 'estado', 'piso', 'puesto', 'excepcion', 'ingreso', 'salida', 'reportadoPor', 'actualizado', 'momentos'],
  RegistroHistorico: ['fecha', 'codigo', 'estado', 'piso', 'puesto', 'excepcion', 'ingreso', 'salida', 'reportadoPor', 'actualizado', 'momentos']
};

var ROLES_VALIDOS = ['admin', 'coordinador', 'suplente', 'brigadista'];
var ESTADOS_DIA = ['presencial', 'remoto', 'comision', 'vacaciones', 'incapacidad'];
var CAMPOS_REGISTRO = ['estado', 'piso', 'puesto', 'excepcion', 'ingreso', 'salida'];
var MAX_INTENTOS = 5;
var MINUTOS_BLOQUEO = 15;

var CONFIG_INICIAL = {
  reglasClave: { minimo: 0, mayuscula: false, numero: false, simbolo: false },
  exigirCambioInicial: false,
  diasSesion: 30
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
      roles: roles(p), pisoBrigada: p.pisoBrigada ? num(p.pisoBrigada) : null
    };
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
    }
    return filas;
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
        config: { reglasClave: cfg.reglasClave, exigirCambioInicial: !!cfg.exigirCambioInicial, diasSesion: num(cfg.diasSesion) },
        hoy: hoyPublico(registrosDelDia())
      });
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
      var resultados = (d.ops || []).map(function (op) {
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
        var cambio = false;
        CAMPOS_REGISTRO.forEach(function (c) {
          if (!op.campos || op.campos[c] === undefined) return;
          if (!valorValido(c, op.campos[c])) return;
          if (num(op.momento) < num(momentos[c])) return;
          f[c] = texto(op.campos[c]);
          momentos[c] = num(op.momento);
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
      yo.sobres = JSON.stringify(d.sobresNuevos);
      yo.debeCambiar = 'false';
      yo.actualizado = new Date(dep.ahora()).toISOString();
      dep.escribir('Personas', personas);
      bitacora(p.codigo, 'cambio-clave', '');
      return ok({ perfil: perfil(yo) });
    },

    guardarPadron: function (d, p) {
      if (!soloAdmin(p)) return falla('PERMISO', 'Solo el administrador puede hacer esto.');
      var personas = dep.leer('Personas');
      aplicarPadron(d.personas || [], personas);
      dep.escribir('Personas', personas);
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
        x.pisoBrigada = tieneRol(x, 'brigadista') && c.pisoBrigada ? c.pisoBrigada : '';
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

  function procesar(peticion) {
    try {
      var accion = peticion && peticion.accion;
      if (!acciones[accion]) return falla('ACCION', 'Acción desconocida.');
      return dep.bloqueo(function () {
        if (PUBLICAS[accion]) return acciones[accion](peticion);
        var p = sesionActual(peticion.token);
        if (!p) return falla('SESION', 'La sesión expiró. Ingrese de nuevo.');
        return acciones[accion](peticion, p);
      });
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
