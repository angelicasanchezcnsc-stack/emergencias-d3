import * as sesion from '../sesion.js';
import { esc, icono, aviso } from '../ui.js';
import * as llave from '../llave.js';
import * as cripto from '../cripto.js';
import { abrirLlave, mostrarCredencial } from './comun.js';

export function vistaIngreso(vista, ctx) {
  vista.innerHTML = `
    <div class="ingreso">
      <div class="marca-icono marca-grande">${icono('escudo')}</div>
      <div class="centrado titulo-vista">
        <h2>Ingreso</h2>
        <p class="sutil">Solo para personas autorizadas del Despacho 3</p>
      </div>
      <form id="f-ingreso" class="tarjeta" autocomplete="on">
        <div class="campo">
          <label class="etiqueta" for="correo">Correo institucional</label>
          <input id="correo" type="email" required autocomplete="username" placeholder="usuario@cnsc.gov.co" value="${esc(sesion.correoGuardado())}">
        </div>
        <div class="campo">
          <label class="etiqueta" for="clave">Contraseña</label>
          <input id="clave" type="password" required autocomplete="current-password">
        </div>
        <div id="error" class="nota nota-error oculto"></div>
        <button class="btn btn-primario btn-ancho" type="submit">${icono('candado', 'ic-s')}Ingresar</button>
        <p class="ayuda centrado" style="margin-top:.8rem">¿Olvidó la contraseña? Pídale al administrador una nueva contraseña temporal.</p>
      </form>
      <p class="ayuda centrado">Su correo se convierte en una huella antes de salir del celular; el servidor nunca lo recibe.</p>
      <p class="centrado"><button class="btn btn-fantasma btn-chico" id="desde-llave" type="button">${icono('llave', 'ic-s')}Administrador: ver una contraseña temporal en la llave</button></p>
    </div>`;

  // El administrador puede consultar, en su propio computador, una contraseña temporal
  // que aún no ha entregado: está guardada (cifrada) en la llave maestra.
  vista.querySelector('#desde-llave').addEventListener('click', async () => {
    const correo = cripto.normalizarCorreo(f.correo.value);
    if (!correo) { aviso('Escriba primero el correo en el campo de arriba.', 'advertencia'); f.correo.focus(); return; }
    try {
      if (!await abrirLlave()) return;
      const p = llave.personas().find(x => x.correo === correo && x.estado === 'activo');
      if (!p) aviso('Ese correo no está en la llave.', 'error');
      else if (!p.claveTemporal) aviso('La llave no tiene una contraseña temporal pendiente para ese correo (ya se marcó como entregada).', 'advertencia');
      else await mostrarCredencial(p);
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      llave.cerrar();
    }
  });

  const f = vista.querySelector('#f-ingreso');
  if (sesion.correoGuardado()) f.clave.focus(); else f.correo.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const boton = f.querySelector('button');
    const error = f.querySelector('#error');
    error.classList.add('oculto');
    boton.disabled = true;
    boton.lastChild.textContent = 'Verificando…';
    try {
      await sesion.ingresar(f.correo.value, f.clave.value);
      aviso('Bienvenido.', 'exito');
      ctx.navegar('inicio');
    } catch (err) {
      error.innerHTML = `${icono('alerta')}<span>${esc(err.message)}</span>`;
      error.classList.remove('oculto');
      boton.disabled = false;
      boton.lastChild.textContent = 'Ingresar';
    }
  });
}
