import * as sesion from '../sesion.js';
import { llamar } from '../api.js';
import { validarClave } from '../cripto.js';
import { esc, icono, aviso, tarjeta, confirmar } from '../ui.js';
import { insigniasRol } from './comun.js';

function textoReglas(r = {}) {
  const partes = [];
  if (r.minimo > 0) partes.push(`mínimo ${r.minimo} caracteres`);
  if (r.mayuscula) partes.push('una mayúscula');
  if (r.numero) partes.push('un número');
  if (r.simbolo) partes.push('un símbolo');
  return partes.length ? 'Debe tener ' + partes.join(', ') + '.' : 'Por ahora no hay requisitos. Se recomienda usar al menos 10 caracteres.';
}

export function vistaCuenta(vista, ctx) {
  const p = sesion.perfil();
  const cfg = (sesion.base() && sesion.base().config) || {};
  const obligado = p.debeCambiar && cfg.exigirCambioInicial;

  vista.innerHTML = `
    <div class="titulo-vista"><h2>Mi cuenta</h2></div>
    ${obligado ? '<div class="nota nota-adv">Por seguridad, cambie la contraseña temporal antes de continuar.</div>' : ''}
    <div class="rejilla">
      ${tarjeta({
        icono: 'persona', tono: 'azul', titulo: sesion.nombreDe(p.codigo), subtitulo: sesion.correoGuardado(),
        cuerpo: `<p>Código <span class="mono">${esc(p.codigo)}</span></p>
          <p>Piso ${p.piso} · Puesto ${p.puesto}</p><div class="fila">${insigniasRol(p) || '<span class="sutil">Sin roles especiales</span>'}</div>`
      })}
      ${tarjeta({
        icono: 'escudo', tono: 'rojo', titulo: 'Caracterización para emergencias', subtitulo: 'Voluntaria · usted decide qué registrar',
        cuerpo: `<p>Cuénteles a los brigadistas, de forma privada y cifrada, si necesita algún apoyo para evacuar.</p>
          <a class="btn btn-secundario" href="#/caracterizacion">Abrir mi caracterización</a>`
      })}
      ${tarjeta({
        icono: 'candado', tono: 'ambar', titulo: 'Cambiar contraseña', subtitulo: textoReglas(cfg.reglasClave),
        cuerpo: `<form id="f-clave">
          <div class="campo"><label class="etiqueta" for="actual">Contraseña actual</label><input id="actual" type="password" required autocomplete="current-password"></div>
          <div class="campo"><label class="etiqueta" for="nueva">Contraseña nueva</label><input id="nueva" type="password" required autocomplete="new-password"></div>
          <div class="campo"><label class="etiqueta" for="repite">Repita la contraseña nueva</label><input id="repite" type="password" required autocomplete="new-password"></div>
          <div id="error" class="nota nota-error oculto"></div>
          <button class="btn btn-primario" type="submit">${icono('guardar', 'ic-s')}Cambiar contraseña</button>
        </form>`
      })}
      ${tarjeta({
        icono: 'salir', tono: 'turquesa', titulo: 'Sesiones', subtitulo: 'Si perdió un celular o ingresó en un equipo prestado',
        cuerpo: `<p>Cierra su sesión en todos los demás celulares y computadores. Esta sesión sigue abierta y su contraseña no cambia.</p>
          <button class="btn btn-secundario" id="cerrar-otras">Cerrar mis otras sesiones</button>`
      })}
    </div>`;

  vista.querySelector('#cerrar-otras').addEventListener('click', async ev => {
    if (!await confirmar('Cerrar mis otras sesiones', 'Se cerrará su sesión en todos los demás celulares y computadores. Esta sesión sigue abierta.', 'Cerrar las otras')) return;
    ev.target.disabled = true;
    try {
      const r = await llamar('cerrarOtrasSesiones');
      aviso(!r.cerradas ? 'No tenía otras sesiones abiertas.' : r.cerradas === 1 ? 'Se cerró 1 sesión en otro equipo.' : `Se cerraron ${r.cerradas} sesiones en otros equipos.`, 'exito');
    } catch (e) { aviso(e.codigo === 'RED' ? 'Sin conexión: solo se puede hacer con internet.' : e.message, 'error'); }
    finally { ev.target.disabled = false; }
  });

  const f = vista.querySelector('#f-clave');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const error = f.querySelector('#error');
    const mostrar = m => { error.innerHTML = `${icono('alerta')}<span>${esc(m)}</span>`; error.classList.remove('oculto'); };
    error.classList.add('oculto');
    if (f.nueva.value !== f.repite.value) return mostrar('Las contraseñas nuevas no coinciden.');
    const fallas = validarClave(f.nueva.value, cfg.reglasClave);
    if (fallas.length) return mostrar('La contraseña nueva necesita: ' + fallas.join(', ') + '.');
    if (f.nueva.value === f.actual.value) return mostrar('La contraseña nueva debe ser distinta de la actual.');
    const boton = f.querySelector('button');
    boton.disabled = true;
    try {
      await sesion.cambiarClave(f.actual.value, f.nueva.value);
      aviso('Contraseña cambiada.', 'exito');
      f.reset();
      if (obligado) ctx.navegar('inicio');
    } catch (err) {
      mostrar(err.message);
    } finally {
      boton.disabled = false;
    }
  });
}
