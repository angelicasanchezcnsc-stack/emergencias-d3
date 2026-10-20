// Configuración central del aplicativo.
// Es el único archivo que se ajusta al publicar o al migrar a otro servidor.
// No contiene datos personales ni claves secretas: este repositorio es público.

// En el computador local (localhost) se usa el servidor simulado, con datos ficticios que quedan solo en
// ese navegador, salvo que se elija a propósito el servidor de prueba (?servidor=prueba). En local nunca
// se usa el servidor real. En GitHub Pages se usa el real, o el de prueba con ?servidor=prueba.
const ES_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

// Servidor de Google: el real y, aparte, uno de prueba con datos ficticios (vacío = no hay).
export const URL_REAL = 'https://script.google.com/macros/s/AKfycbwBfQegdLhwvuJ616854yJoBTjbLDIBpj1vUE13pUcTMOkt1j6pJoU9eyti0QiAyLob/exec';
const URL_SERVIDOR_PRUEBA = 'https://script.google.com/macros/s/AKfycbzJUyre_woShSgL47tGrj4SYJwH2U11idaYfPlfGgyonj6ruZznxD6_QK0feo95XrKjfg/exec';

// 'prueba' si este navegador se abrió con ?servidor=prueba (lo recuerda) y hay servidor de prueba;
// si no, 'real'. Para volver al real se abre la app con ?servidor=real.
export function servidorElegido() {
  let marca = null;
  try { marca = localStorage.getItem('d3e-servidor'); } catch { /* sin almacenamiento: servidor real */ }
  return marca === 'prueba' && URL_SERVIDOR_PRUEBA ? 'prueba' : 'real';
}

export const CONFIG = {
  APP_NOMBRE: 'EMERGENCIAS D3',
  VERSION: 'v0.13.0',
  SUBTITULO: 'Despacho 3, sede Calle 96',
  CREDITOS: 'Aplicativo de emergencias del Despacho 3 (Edwin Arturo Ruiz Moreno), 2026',

  // 'simulado': servidor de prueba dentro del navegador (datos solo en este equipo).
  // 'apps-script': servidor real en Google Apps Script.
  MODO_SERVIDOR: ES_LOCAL && servidorElegido() !== 'prueba' ? 'simulado' : 'apps-script',
  // URL de la aplicación web de Apps Script (termina en /exec). Se cambia arriba, en URL_REAL.
  URL_SERVIDOR: servidorElegido() === 'prueba' ? URL_SERVIDOR_PRUEBA : URL_REAL,
  URL_SERVIDOR_PRUEBA,

  // Sal pública para la huella (hash) del correo. Si se cambia, todas las cuentas
  // deben crearse de nuevo. No es secreta.
  SAL_PUBLICA: 'D3-CNSC-CALLE96-2026',
  ITERACIONES: 100000,
  // Repeticiones para lo que sale de la contraseña (verificador y llave de los sobres).
  // Más alto = más lento de adivinar por fuerza bruta. Si se cambia, todas las contraseñas
  // deben restablecerse.
  ITERACIONES_CLAVE: 600000,

  PISOS: [2, 4, 6, 7],
  PREFIJO_CODIGO: 'D3-'
};
