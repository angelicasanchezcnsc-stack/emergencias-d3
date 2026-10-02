import * as sesion from '../sesion.js';
import { esc, tarjeta, insignia } from '../ui.js';
import { insigniasRol } from './comun.js';

export function vistaInicio(vista) {
  const p = sesion.perfil();
  const nombre = sesion.nombreDe(p.codigo);
  const primerNombre = nombre === p.codigo ? '' : nombre.split(' ')[0];
  const base = sesion.base();
  const sinDirectorio = !base || !base.directorio;

  const proximas = [
    ['reloj', 'verde', 'Mi día', 'Confirmar presencia, ingreso y salida', 'Etapa 4'],
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
