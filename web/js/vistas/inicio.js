import * as sesion from '../sesion.js';
import * as registro from '../registro.js';
import { esc, tarjeta, insignia } from '../ui.js';
import { horaLegible } from '../tiempo.js';
import { insigniasRol, insigniaSituacion } from './comun.js';

export function vistaInicio(vista) {
  const p = sesion.perfil();
  const nombre = sesion.nombreDe(p.codigo);
  const primerNombre = nombre === p.codigo ? '' : nombre.split(' ')[0];
  const base = sesion.base();
  const sinDirectorio = !base || !base.directorio;

  const r = registro.registroDe(p.codigo);
  const sit = registro.situacion(r);
  const enSede = registro.hoy().registros.filter(x => registro.situacion(x) === 'en-sede').length;
  const textoDia = sit === 'sin-reporte' ? 'Aún no ha reportado su estado de hoy.'
    : sit === 'en-sede' ? `En la sede desde las ${horaLegible(r.ingreso)}.`
    : sit === 'salio' ? `Salió a las ${horaLegible(r.salida)}.` : 'Hoy no está en la sede.';

  const proximas = [
    ['telefono', 'azul', 'Contactos y rutas', 'Contactos de emergencia, rutas y punto de encuentro', 'Etapa 5'],
    ['alerta', 'rojo', 'Emergencia', 'Activación, reporte de brigadistas y tablero', 'Etapas 6 y 7'],
    ['libro', 'morado', 'Recomendaciones', 'Protocolos por tipo de emergencia', 'Etapa 5']
  ];

  vista.innerHTML = `
    <div class="titulo-vista">
      <h2>Hola${primerNombre ? ', ' + esc(primerNombre) : ''}</h2>
      <p class="sutil">Código <span class="mono">${esc(p.codigo)}</span> ${insigniasRol(p)}</p>
    </div>
    ${sinDirectorio ? '<div class="nota nota-adv">Todavía no hay directorio publicado: los nombres aparecerán cuando el administrador cargue la planta física.</div>' : ''}
    <div class="rejilla">
      ${tarjeta({
        icono: 'reloj', tono: 'verde', titulo: 'Mi día', subtitulo: 'Reporte su presencia, ingreso y salida',
        cuerpo: `<p>${insigniaSituacion(r)} ${esc(textoDia)}</p>
          <a class="btn ${sit === 'sin-reporte' ? 'btn-primario' : 'btn-secundario'}" href="#/dia">${sit === 'sin-reporte' ? 'Reportar mi día' : 'Ver o cambiar'}</a>`
      })}
      ${tarjeta({
        icono: 'personas', tono: 'azul', titulo: 'Hoy en la sede', subtitulo: 'Listado por piso y censo del día',
        cuerpo: `<p style="font-size:1.6rem;font-weight:800;color:var(--corp-dark);margin:0">${enSede} ${enSede === 1 ? 'persona' : 'personas'}</p>
          <p class="sutil">en la sede según los reportes</p><a class="btn btn-secundario" href="#/hoy">Ver listado</a>`
      })}
      ${tarjeta({
        icono: 'ubicacion', tono: 'ambar', titulo: 'Mi puesto habitual', subtitulo: 'Según la planta física del Despacho',
        cuerpo: `<p style="font-size:1.6rem;font-weight:800;color:var(--corp-dark);margin:0">Piso ${p.piso} · Puesto ${p.puesto}</p>
          <p class="sutil">Si cambió de puesto, avise al administrador.</p>`
      })}
      ${tarjeta({
        icono: 'edificio', tono: 'turquesa', titulo: 'Planta física', subtitulo: 'Pisos 2, 4, 6 y 7',
        cuerpo: `<a class="btn btn-secundario" href="#/planta">Ver pisos y puestos</a>`
      })}
      ${proximas.map(([ic, tono, t, s, etapa]) => tarjeta({
        icono: ic, tono, titulo: t, subtitulo: s, clase: 'proxima', cuerpo: insignia('Próximamente · ' + etapa, 'gris')
      })).join('')}
    </div>`;
}
