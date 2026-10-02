// Armazón de la aplicación: encabezado, navegación, pie y enrutador.
import { CONFIG } from '../config.js';
import * as sesion from './sesion.js';
import { llamar, servidorDisponible } from './api.js';
import { esc, icono, aviso } from './ui.js';
import { vistaIngreso } from './vistas/ingreso.js';
import { vistaInicio } from './vistas/inicio.js';
import { vistaDia } from './vistas/dia.js';
import { vistaHoy } from './vistas/hoy.js';
import { vistaPlanta } from './vistas/planta.js';
import { vistaContactos } from './vistas/contactos.js';
import { vistaRutas } from './vistas/rutas.js';
import { vistaRecomendaciones } from './vistas/recomendaciones.js';
import { vistaEmergencia } from './vistas/emergencia.js';
import { vistaPunto } from './vistas/punto.js';
import * as contenido from './contenido.js';
import * as registro from './registro.js';
import * as emergencia from './emergencia.js';
import { horaLegible, horaBogota } from './tiempo.js';
import { confirmar } from './ui.js';
import { vistaCuenta } from './vistas/cuenta.js';
import { vistaAdmin } from './vistas/admin.js';
import { vistaInstalacion } from './vistas/instalacion.js';

const RUTAS = {
  inicio: { titulo: 'Inicio', icono: 'inicio', vista: vistaInicio },
  emergencia: { titulo: 'Emergencia', icono: 'alerta', vista: vistaEmergencia },
  punto: { titulo: 'Punto de encuentro', icono: 'ubicacion', vista: vistaPunto, roles: emergencia.ROLES_REPORTAR },
  dia: { titulo: 'Mi día', icono: 'reloj', vista: vistaDia },
  hoy: { titulo: 'Hoy en la sede', icono: 'personas', vista: vistaHoy },
  planta: { titulo: 'Planta física', icono: 'edificio', vista: vistaPlanta },
  contactos: { titulo: 'Contactos', icono: 'telefono', vista: vistaContactos },
  rutas: { titulo: 'Rutas', icono: 'ubicacion', vista: vistaRutas },
  recomendaciones: { titulo: 'Recomendaciones', icono: 'libro', vista: vistaRecomendaciones },
  cuenta: { titulo: 'Mi cuenta', icono: 'persona', vista: vistaCuenta },
  admin: { titulo: 'Administración', icono: 'ajustes', vista: vistaAdmin, rol: 'admin' }
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
          <div id="estado-red" class="estado-red"></div>
          <button id="btn-salir" class="btn btn-fantasma btn-chico oculto" title="Cerrar sesión">${icono('salir', 'ic-s')}<span>Salir</span></button>
        </div>
      </div>
      <nav id="nav" class="navegacion oculto" aria-label="Secciones"></nav>
      <a id="banner-emergencia" class="banner-emergencia oculto" href="#/emergencia"></a>
    </header>
    <main id="vista"></main>
    <footer class="pie">${esc(CONFIG.APP_NOMBRE)} ${esc(CONFIG.VERSION)} — ${esc(CONFIG.CREDITOS)}</footer>`);
  document.getElementById('btn-salir').addEventListener('click', async () => {
    const n = registro.pendientes() + emergencia.pendientes();
    if (n && !await confirmar('Reportes sin enviar', `Hay ${n} reporte(s) guardado(s) en este celular que aún no llegan al servidor. Si cierra la sesión se perderán.`, 'Cerrar de todos modos', true)) return;
    await sesion.salir();
    aviso('Sesión cerrada. Se borraron los datos de este celular.', 'info');
    ctx.navegar('ingreso');
  });
  addEventListener('online', pintarRed);
  addEventListener('offline', pintarRed);
  addEventListener('estado-servidor', pintarRed);
  addEventListener('online', () => sesion.activa() && sesion.refrescar().then(() => contenido.precargar()).catch(() => {}));
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

function pintarNav(actual) {
  const nav = document.getElementById('nav');
  const salir = document.getElementById('btn-salir');
  if (!sesion.activa()) { nav.classList.add('oculto'); salir.classList.add('oculto'); return; }
  nav.classList.remove('oculto');
  salir.classList.remove('oculto');
  nav.innerHTML = Object.entries(RUTAS)
    .filter(([, r]) => permitida(r))
    .map(([id, r]) => `<a href="#/${id}" class="pestana ${id === actual ? 'activa' : ''}">${icono(r.icono, 'ic-s')}${esc(r.titulo)}</a>`)
    .join('');
}

let servidorListo = null; // ¿el servidor ya fue inicializado?

async function enrutar() {
  const vista = document.getElementById('vista');
  let ruta = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0];

  if (!sesion.activa()) {
    pintarNav(null);
    if (servidorListo === null) {
      try { servidorListo = (await llamar('ping')).inicializado; } catch { servidorListo = true; }
    }
    if (!servidorListo) return vistaInstalacion(vista, { ...ctx, alTerminar: () => { servidorListo = true; ctx.navegar('ingreso'); } });
    if (ruta !== 'ingreso') { ctx.navegar('ingreso'); return; }
    return vistaIngreso(vista, ctx);
  }

  const p = sesion.perfil();
  const cfg = sesion.base() && sesion.base().config;
  if (p && p.debeCambiar && cfg && cfg.exigirCambioInicial && ruta !== 'cuenta') { ctx.navegar('cuenta'); return; }
  if (ruta === 'ingreso' || !RUTAS[ruta] || !permitida(RUTAS[ruta])) { ctx.navegar('inicio'); return; }

  pintarNav(ruta);
  pintarBanner();
  vista.dispatchEvent(new Event('vista-salida'));
  vista.innerHTML = '';
  try {
    await RUTAS[ruta].vista(vista, ctx);
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<div class="nota nota-error">${icono('alerta')}<span>${esc(e.message || e)}</span></div>`;
  }
  scrollTo(0, 0);
}

async function iniciar() {
  armazon();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Sin modo sin conexión:', e));
  }
  if (await sesion.restaurar()) {
    try { await sesion.refrescar(); } catch { /* sesión vencida: refrescar ya la cerró */ }
  }
  await registro.iniciar();
  await emergencia.iniciar();
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
  addEventListener('sesion-iniciada', () => contenido.precargar());
  addEventListener('registro-vencido', e => aviso(`${e.detail} reporte(s) de un día anterior no se enviaron porque ya cambió la fecha.`, 'advertencia'));
  addEventListener('hashchange', enrutar);
  enrutar();
}

iniciar();
