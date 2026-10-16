// Configuración central del aplicativo.
// Es el único archivo que se ajusta al publicar o al migrar a otro servidor.
// No contiene datos personales ni claves secretas: este repositorio es público.

// En el computador local (localhost) siempre se usa el servidor simulado, con datos
// ficticios que quedan solo en ese navegador. En GitHub Pages siempre se usa el real.
const ES_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const CONFIG = {
  APP_NOMBRE: 'EMERGENCIAS D3',
  VERSION: 'v0.11.0',
  SUBTITULO: 'Despacho 3, sede Calle 96',
  CREDITOS: 'Aplicativo de emergencias del Despacho 3 (Edwin Arturo Ruiz Moreno), 2026',

  // 'simulado': servidor de prueba dentro del navegador (datos solo en este equipo).
  // 'apps-script': servidor real en Google Apps Script.
  MODO_SERVIDOR: ES_LOCAL ? 'simulado' : 'apps-script',
  URL_SERVIDOR: 'https://script.google.com/macros/s/AKfycbwBfQegdLhwvuJ616854yJoBTjbLDIBpj1vUE13pUcTMOkt1j6pJoU9eyti0QiAyLob/exec', // URL de la aplicación web de Apps Script (termina en /exec)

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
