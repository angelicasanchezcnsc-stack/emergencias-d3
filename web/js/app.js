// Armazón de la aplicación: encabezado, navegación, pie y enrutador.
import { CONFIG, servidorElegido } from '../config.js';
import * as sesion from './sesion.js';
import { llamar, servidorDisponible } from './api.js';
import { esc, icono, aviso } from './ui.js';
import { vistaIngreso } from './vistas/ingreso.js';
import { vistaInicio } from './vistas/inicio.js';
import { vistaHoy } from './vistas/hoy.js';
import { vistaPlanta } from './vistas/planta.js';
import { vistaContactos } from './vistas/contactos.js';
import { vistaRutas } from './vistas/rutas.js';
import { vistaRecomendaciones } from './vistas/recomendaciones.js';
import { vistaEmergencia } from './vistas/emergencia.js';
import { vistaPunto } from './vistas/punto.js';
import { vistaHistorico } from './vistas/historico.js';
import { vistaCaracterizacion } from './vistas/caracterizacion.js';
import { vistaCaracterizaciones } from './vistas/caracterizaciones.js';
import * as carac from './caracterizacion.js';
import * as contactoEmergencia from './contacto-emergencia.js';
import * as contenido from './contenido.js';
import * as emergencia from './emergencia.js';
import { horaLegible, horaBogota } from './tiempo.js';
import { confirmar } from './ui.js';
import { vistaCuenta } from './vistas/cuenta.js';
import { vistaAdmin } from './vistas/admin.js';
import { vistaInstalacion } from './vistas/instalacion.js';

// Cinco pestañas como máximo. Cada ruta pertenece a un grupo; las rutas sin grupo (Mi cuenta y Mi
// caracterización) no tienen pestaña: se llega a ellas desde el encabezado o desde Inicio.
const GRUPOS = [
  { id: 'inicio', titulo: 'Inicio', icono: 'inicio' },
  { id: 'emergencia', titulo: 'Emergencia', icono: 'alerta' },
  { id: 'sede', titulo: 'Hoy en la sede', icono: 'personas' },
  { id: 'info', titulo: 'Información', icono: 'libro' },
  { id: 'gestion', titulo: 'Gestión', icono: 'ajustes' }
];

const RUTAS = {
  inicio: { titulo: 'Inicio', icono: 'inicio', vista: vistaInicio, grupo: 'inicio' },
  emergencia: { titulo: 'Emergencia', icono: 'alerta', vista: vistaEmergencia, grupo: 'emergencia' },
  punto: { titulo: 'Punto de encuentro', icono: 'ubicacion', vista: vistaPunto, roles: emergencia.ROLES_REPORTAR, grupo: 'emergencia' },
  historico: { titulo: 'Histórico', icono: 'reloj', vista: vistaHistorico, roles: emergencia.ROLES_REPORTAR, grupo: 'emergencia' },
  caracterizacion: { titulo: 'Mi caracterización', icono: 'candado', vista: vistaCaracterizacion, nav: false },
  hoy: { titulo: 'Hoy en la sede', icono: 'personas', vista: vistaHoy, grupo: 'sede' },
  planta: { titulo: 'Planta física', icono: 'edificio', vista: vistaPlanta, grupo: 'sede' },
  contactos: { titulo: 'Contactos', icono: 'telefono', vista: vistaContactos, grupo: 'info' },
  rutas: { titulo: 'Rutas', icono: 'ubicacion', vista: vistaRutas, grupo: 'info' },
  recomendaciones: { titulo: 'Recomendaciones', icono: 'libro', vista: vistaRecomendaciones, grupo: 'info' },
  cuenta: { titulo: 'Mi cuenta', icono: 'persona', vista: vistaCuenta, nav: false },
  // En «Gestión», Administración va primero: la pestaña abre ahí para el administrador. El coordinador
  // y el suplente, que no tienen Administración, entran directo a Caracterizaciones.
  admin: { titulo: 'Administración', icono: 'ajustes', vista: vistaAdmin, rol: 'admin', grupo: 'gestion' },
  caracterizaciones: { titulo: 'Caracterizaciones', icono: 'escudo', vista: vistaCaracterizaciones, roles: ['admin', 'coordinador', 'suplente'], grupo: 'gestion' }
};

const ctx = { navegar: ruta => { location.hash = '#/' + ruta; }, recargar: () => enrutar() };

function armazon() {
  document.body.insertAdjacentHTML('afterbegin', `
    <header class="cabecera">
      <div class="cabecera-interior">
        <div class="marca">
          <div class="marca-icono">${icono('escudo')}</div>
          <div>
            <h1>${esc(CONFIG.APP_NOMBRE)}<span class="version">${esc(CONFIG.VERSION)}</span></h1>
            <p>${esc(CONFIG.SUBTITULO)}</p>
          </div>
        </div>
        <div class="fila">
          ${CONFIG.MODO_SERVIDOR === 'simulado' ? '<span class="insignia insignia-prueba" title="Los datos quedan solo en este navegador">Modo prueba</span>' : ''}
          ${CONFIG.MODO_SERVIDOR !== 'simulado' && servidorElegido() === 'prueba' ? '<span class="insignia insignia-prueba insignia-servidor-prueba" title="Datos ficticios. Para volver al servidor real, abra la app con ?servidor=real"><span class="txt-largo">Servidor de </span>prueba</span>' : ''}
          <span id="actividad" class="actividad oculto" aria-hidden="true"><span class="girador-mini"></span><span>Actualizando…</span></span>
          <div id="estado-red" class="estado-red"></div>
          <a id="btn-cuenta" class="btn btn-fantasma btn-chico oculto" href="#/cuenta" title="Mi cuenta">${icono('persona', 'ic-s')}<span>Mi cuenta</span></a>
          <button id="btn-salir" class="btn btn-fantasma btn-chico oculto" title="Cerrar sesión">${icono('salir', 'ic-s')}<span>Salir</span></button>
        </div>
      </div>
      <nav id="nav" class="navegacion oculto" aria-label="Secciones"></nav>
      <a id="banner-emergencia" class="banner-emergencia oculto" href="#/emergencia"></a>
    </header>
    <nav id="subnav" class="navegacion subnav oculto" aria-label="Subsecciones"></nav>
    <main id="vista"></main>
    <footer class="pie">${esc(CONFIG.APP_NOMBRE)} ${esc(CONFIG.VERSION)} · ${esc(CONFIG.CREDITOS)}</footer>`);
  document.getElementById('btn-salir').addEventListener('click', async () => {
    const n = emergencia.pendientes();
    if (n && !await confirmar('Reportes sin enviar', `Hay ${n} reporte(s) guardado(s) en este celular que aún no llegan al servidor. Si cierra la sesión se perderán.`, 'Cerrar de todos modos', true)) return;
    await sesion.salir();
    aviso('Sesión cerrada. Se borraron los datos de este celular.', 'info');
    ctx.navegar('ingreso');
  });
  // Aviso discreto mientras el servidor responde (solo si tarda más de medio segundo). Es visual:
  // los lectores de pantalla no lo anuncian, para no interrumpir con cada consulta.
  let temporizadorActividad;
  addEventListener('actividad-servidor', e => {
    const el = document.getElementById('actividad');
    clearTimeout(temporizadorActividad);
    if (e.detail > 0) temporizadorActividad = setTimeout(() => el.classList.remove('oculto'), 500);
    else el.classList.add('oculto');
  });
  addEventListener('online', pintarRed);
  addEventListener('offline', pintarRed);
  addEventListener('estado-servidor', pintarRed);
  addEventListener('online', () => {
    if (!sesion.activa()) return;
    sesion.refrescar().then(() => { dispatchEvent(new CustomEvent('novedades-cambio')); contenido.precargar(); }).catch(() => {});
  });
  pintarRed();
}

function pintarRed() {
  const el = document.getElementById('estado-red');
  const enLinea = navigator.onLine;
  const servidor = servidorDisponible();
  el.className = 'estado-red ' + (enLinea && servidor ? 'en-linea' : 'sin-conexion');
  el.innerHTML = !enLinea ? `${icono('sinWifi', 'ic-s')}Sin conexión`
    : !servidor ? `${icono('sinWifi', 'ic-s')}Sin servidor` : '<span class="punto"></span>En línea';
}

const permitida = r => (!r.rol || sesion.tieneRol(r.rol)) && (!r.roles || r.roles.some(x => sesion.tieneRol(x)));

// Franja fija bajo el encabezado mientras haya una emergencia o simulacro en curso.
function pintarBanner() {
  const el = document.getElementById('banner-emergencia');
  const a = sesion.activa() && emergencia.actual();
  if (!a) { el.classList.add('oculto'); return; }
  const e = a.emergencia;
  el.classList.remove('oculto');
  el.classList.toggle('simulacro', e.simulacro);
  el.innerHTML = `${icono('alerta', 'ic-s')}<span><strong>${e.simulacro ? 'Simulacro' : 'Emergencia'} en curso</strong> · ${esc(emergencia.TIPOS[e.tipo])} · desde las ${esc(horaLegible(horaBogota(new Date(e.inicio))))}${e.local ? ' · <strong>sin conexión</strong>' : ''}</span><span class="banner-ir">Ver</span>`;
}

// Rutas de un grupo que la persona puede ver, en el orden de RUTAS.
const rutasDelGrupo = grupo => Object.entries(RUTAS).filter(([, r]) => r.grupo === grupo && r.nav !== false && permitida(r));

function pintarNav(actual) {
  const nav = document.getElementById('nav');
  const sub = document.getElementById('subnav');
  const salir = document.getElementById('btn-salir');
  const cuenta = document.getElementById('btn-cuenta');
  if (!sesion.activa()) {
    [nav, sub, salir, cuenta].forEach(el => el.classList.add('oculto'));
    return;
  }
  nav.classList.remove('oculto');
  salir.classList.remove('oculto');
  cuenta.classList.remove('oculto');
  const grupoActual = actual && RUTAS[actual] ? RUTAS[actual].grupo : null;
  // Una pestaña por grupo con al menos una ruta permitida; lleva a la primera ruta permitida del grupo.
  nav.innerHTML = GRUPOS.map(g => {
    const rutas = rutasDelGrupo(g.id);
    if (!rutas.length) return '';
    return `<a href="#/${rutas[0][0]}" class="pestana ${g.id === grupoActual ? 'activa' : ''}">${icono(g.icono, 'ic-s')}<span>${esc(g.titulo)}</span></a>`;
  }).join('');
  // Subnavegación: si el grupo actual tiene dos o más rutas permitidas, se muestran encima de la vista.
  const hermanas = grupoActual ? rutasDelGrupo(grupoActual) : [];
  sub.classList.toggle('oculto', hermanas.length < 2);
  sub.innerHTML = hermanas.length < 2 ? '' : hermanas.map(([id, r]) =>
    `<a href="#/${id}" class="pestana ${id === actual ? 'activa' : ''}">${icono(r.icono, 'ic-s')}${esc(r.titulo)}</a>`).join('');
  cuenta.classList.toggle('activo', actual === 'cuenta');
}

let servidorListo = null; // ¿el servidor ya fue inicializado?

// Pantallas que se vuelven a dibujar solas cuando llegan datos nuevos del servidor. Las demás los
// usan la próxima vez que se abren, para no interrumpir a quien está escribiendo o marcando.
const REPINTAR_AL_ACTUALIZAR = ['inicio', 'planta'];
const rutaActual = () => (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0];

// Trae los datos nuevos sin hacer esperar a la persona: la pantalla ya se dibujó con la copia del celular.
function actualizarEnSegundoPlano() {
  sesion.refrescar().then(ok => {
    if (!ok || !sesion.activa()) return;
    // La carga inicial (base) ya trae las novedades vigentes: solo se avisa a las pantallas.
    dispatchEvent(new CustomEvent('novedades-cambio'));
    const ruta = rutaActual();
    pintarNav(ruta);
    const activo = document.activeElement;
    const escribiendo = activo && activo.matches && activo.matches('input, textarea, select');
    if (REPINTAR_AL_ACTUALIZAR.includes(ruta) && !escribiendo && !document.querySelector('.modal-fondo')) enrutar();
  }).catch(() => { /* sesión vencida: refrescar ya la cerró */ });
}

// Cada pantalla se dibuja en su propio lienzo dentro de <main>. Si la persona cambia de pantalla
// mientras otra todavía carga (por ejemplo, Caracterizaciones espera la respuesta del servidor),
// lo que esa pantalla dibuje tarde cae en un lienzo que ya no está en la página y no tapa la nueva.
let lienzoActual = null;
function lienzoNuevo() {
  if (lienzoActual) lienzoActual.dispatchEvent(new Event('vista-salida'));
  lienzoActual = document.createElement('div');
  lienzoActual.className = 'lienzo';
  document.getElementById('vista').replaceChildren(lienzoActual);
  return lienzoActual;
}

async function enrutar() {
  let ruta = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0];

  if (!sesion.activa()) {
    pintarNav(null);
    if (servidorListo === null) {
      try {
        const r = await llamar('ping');
        if (!r || typeof r.inicializado !== 'boolean') throw new Error('El servidor dio una respuesta inesperada.');
        servidorListo = r.inicializado;
      } catch (e) {
        // Sin respuesta no se sabe si el servidor ya está configurado: se avisa y se ofrece
        // reintentar, en vez de suponer y mostrar una pantalla que no corresponde.
        const vista = lienzoNuevo();
        vista.innerHTML = `
          <div class="titulo-vista"><h2>Sin conexión con el servidor</h2>
            <p class="sutil">Para ingresar por primera vez en este dispositivo se necesita internet.</p></div>
          <div class="nota nota-error">${icono('alerta')}<span>${esc(e && e.message ? e.message : 'El servidor no respondió.')}</span></div>
          <p style="margin-top:1rem"><button class="btn btn-oscuro" id="reintentar" type="button">Reintentar</button></p>`;
        vista.querySelector('#reintentar').addEventListener('click', enrutar);
        return;
      }
    }
    if (!servidorListo) return vistaInstalacion(lienzoNuevo(), { ...ctx, alTerminar: () => { servidorListo = true; ctx.navegar('ingreso'); } });
    if (ruta !== 'ingreso') { ctx.navegar('ingreso'); return; }
    return vistaIngreso(lienzoNuevo(), ctx);
  }

  const p = sesion.perfil();
  const cfg = sesion.base() && sesion.base().config;
  if (p && p.debeCambiar && cfg && cfg.exigirCambioInicial && ruta !== 'cuenta') { ctx.navegar('cuenta'); return; }
  // «Mi día» ya no existe: los enlaces viejos guardados en los celulares llevan a «Hoy en la sede».
  if (ruta === 'dia') { ctx.navegar('hoy'); return; }
  if (ruta === 'ingreso' || !RUTAS[ruta] || !permitida(RUTAS[ruta])) { ctx.navegar('inicio'); return; }

  pintarNav(ruta);
  pintarBanner();
  const vista = lienzoNuevo();
  try {
    await RUTAS[ruta].vista(vista, ctx);
  } catch (e) {
    console.error(e);
    // Solo se muestra si la persona sigue en esta pantalla.
    if (vista === lienzoActual) vista.innerHTML = `<div class="nota nota-error">${icono('alerta')}<span>${esc(e.message || e)}</span></div>`;
  }
  if (vista === lienzoActual) scrollTo(0, 0);
  // Marca de rendimiento (solo local, para medir cuánto tarda en verse la primera pantalla).
  if (!performance.getEntriesByName('d3e-primera-vista').length) performance.mark('d3e-primera-vista');
}

// ?servidor=prueba o ?servidor=real elige el servidor de Google y este navegador lo recuerda. Si el
// servidor cambia, se cierra la sesión local (es de otro servidor) y se recarga.
// Devuelve 'recargar', 'sin-prueba' (se pidió el de prueba y no hay) o null.
async function elegirServidor() {
  const pedido = new URLSearchParams(location.search).get('servidor');
  if (pedido !== 'prueba' && pedido !== 'real') return null;
  const antes = servidorElegido();
  try { localStorage.setItem('d3e-servidor', pedido); } catch { /* sin almacenamiento: queda el real */ }
  const u = new URL(location.href);
  u.searchParams.delete('servidor');
  history.replaceState(null, '', u);
  if (servidorElegido() !== antes) {
    await sesion.salir(true);
    location.reload();
    return 'recargar';
  }
  return pedido === 'prueba' && !CONFIG.URL_SERVIDOR_PRUEBA ? 'sin-prueba' : null;
}

async function iniciar() {
  const eleccion = await elegirServidor();
  if (eleccion === 'recargar') return;
  armazon();
  if (eleccion === 'sin-prueba') aviso('No hay servidor de prueba configurado: se usa el servidor real.', 'advertencia');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Sin modo sin conexión:', e));
  }
  // Con una copia guardada en el celular, la primera pantalla se dibuja de inmediato con ella y los
  // datos nuevos llegan en segundo plano (más abajo). Sin copia, se espera al servidor.
  const conSesion = await sesion.restaurar();
  if (conSesion && !sesion.base()) {
    try { await sesion.refrescar(); } catch { /* sesión vencida: refrescar ya la cerró */ }
  }
  await emergencia.iniciar();
  await carac.iniciar();
  await contactoEmergencia.iniciar();
  addEventListener('emergencia-cambio', pintarBanner);
  addEventListener('emergencia-activada', () => {
    const a = emergencia.actual();
    if (!a) return;
    aviso(`${a.emergencia.simulacro ? 'SIMULACRO' : 'EMERGENCIA'}: ${emergencia.TIPOS[a.emergencia.tipo]}. Siga las instrucciones de los brigadistas.`, a.emergencia.simulacro ? 'advertencia' : 'error');
  });
  addEventListener('emergencia-sincronizada', () => aviso('Con conexión de nuevo: la emergencia de este celular se unió a la del servidor.', 'exito'));
  addEventListener('emergencia-marcas-tarde', e => aviso(`${e.detail} reporte(s) llegaron después del cierre y no se tuvieron en cuenta.`, 'advertencia'));
  // Descarga en segundo plano mapas y planos para que estén sin conexión.
  contenido.precargar();
  // Al ingresar, la sesión ya trajo la carga inicial con las novedades.
  addEventListener('sesion-iniciada', () => { contenido.precargar(); dispatchEvent(new CustomEvent('novedades-cambio')); });
  // Si el servidor cierra la sesión (por ejemplo, porque le quitaron todos los roles a la persona),
  // la pantalla vuelve sola al ingreso en vez de quedarse con datos que ya no le corresponden.
  addEventListener('sesion-cerrada', enrutar);
  addEventListener('hashchange', enrutar);
  if (conSesion && sesion.activa() && sesion.base()) actualizarEnSegundoPlano();
  enrutar();
}

iniciar();
