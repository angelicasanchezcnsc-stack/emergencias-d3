// Trabajador de servicio: guarda la aplicación en el celular para que abra sin internet.
// Al publicar una versión nueva, cambie VERSION para renovar la copia guardada.
const VERSION = 'd3e-v0.11.4';

const ARCHIVOS = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/earm.css',
  'img/icono.svg', 'img/icono-192.png', 'img/icono-512.png',
  'js/app.js', 'js/api.js', 'js/almacen.js', 'js/cripto.js', 'js/sesion.js', 'js/ui.js', 'js/llave.js', 'js/xlsx.js',
  'js/mapa-piso.js', 'js/personal.js', 'js/vistas/ventanas-personal.js', 'js/vistas/distribucion.js', 'js/presencia.js', 'js/novedades.js', 'js/tiempo.js', 'js/contenido.js', 'js/contenido-inicial.js',
  'js/vistas/admin.js', 'js/vistas/comun.js', 'js/vistas/cuenta.js', 'js/vistas/ingreso.js',
  'js/vistas/inicio.js', 'js/vistas/instalacion.js', 'js/vistas/planta.js', 'js/vistas/hoy.js',
  'js/vistas/contactos.js', 'js/vistas/rutas.js', 'js/vistas/recomendaciones.js',
  'js/emergencia.js', 'js/vistas/emergencia.js', 'js/vistas/punto.js', 'js/vistas/historico.js',
  'js/caracterizacion.js', 'js/vistas/caracterizacion.js', 'js/vistas/caracterizaciones.js', 'js/vistas/form-caracterizacion.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // las llamadas al servidor (POST) no se guardan
  const url = new URL(req.url);
  const propia = url.origin === location.origin;
  const fuentes = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!propia && !fuentes) return;

  // Primero la red (siempre lo más reciente); sin conexión, la copia guardada.
  e.respondWith(
    fetch(req).then(resp => {
      if (resp.ok || resp.type === 'opaque') {
        const copia = resp.clone();
        caches.open(VERSION).then(c => c.put(req, copia));
      }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
