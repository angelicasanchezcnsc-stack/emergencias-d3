// Configuración central del aplicativo.
// Es el único archivo que se ajusta al publicar o al migrar a otro servidor.
// No contiene datos personales ni claves secretas: este repositorio es público.

export const CONFIG = {
  APP_NOMBRE: 'EMERGENCIAS D3',
  VERSION: 'v0.7',
  SUBTITULO: 'Despacho 3 — Sede Calle 96',
  CREDITOS: 'Aplicativo de emergencias del Despacho 3 — Edwin Arturo Ruiz Moreno — 2026',

  // 'simulado': servidor de prueba dentro del navegador (datos solo en este equipo).
  // 'apps-script': servidor real en Google Apps Script.
  MODO_SERVIDOR: 'simulado',
  URL_SERVIDOR: '', // URL de la aplicación web de Apps Script (termina en /exec)

  // Sal pública para la huella (hash) del correo. Si se cambia, todas las cuentas
  // deben crearse de nuevo. No es secreta.
  SAL_PUBLICA: 'D3-CNSC-CALLE96-2026',
  ITERACIONES: 100000,

  PISOS: [2, 4, 6, 7],
  PREFIJO_CODIGO: 'D3-'
};
