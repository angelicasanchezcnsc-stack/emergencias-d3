// Mi día: autorreporte rápido (pensado para una mano y pocos toques).
import * as sesion from '../sesion.js';
import * as registro from '../registro.js';
import { esc, icono, aviso, tarjeta, insignia, confirmar } from '../ui.js';
import { horaBogota, horaLegible, fechaLegible, diaSemana } from '../tiempo.js';
import { SITUACION, ESTADOS_AUSENCIA, insigniaSituacion, textoUbicacion, elegirPuestoHoy, pedirHora } from './comun.js';

export function vistaDia(vista) {
  const yo = sesion.perfil();
  const persona = (sesion.base().personas || []).find(p => p.codigo === yo.codigo) || yo;

  const pintar = () => {
    const h = registro.hoy();
    const r = registro.registroDe(yo.codigo);
    const sit = registro.situacion(r);
    const u = registro.ubicacionHoy(persona);
    const porOtro = r && r.reportadoPor && r.reportadoPor !== yo.codigo;
    const pendientes = registro.pendientes();

    let cuerpo;
    if (sit === 'sin-reporte') {
      cuerpo = `
        <button class="btn btn-primario btn-ancho btn-grande" data-a="llegue">${icono('ubicacion')}Llegué a la sede</button>
        <p class="sutil centrado" style="margin:.4rem 0 1rem">${esc(textoUbicacion(u))}</p>
        <button class="btn btn-secundario btn-ancho" data-a="otro-puesto">Llegué, pero hoy estoy en otro puesto</button>
        <p class="etiqueta" style="margin-top:1.25rem">Hoy no estaré en la sede</p>
        <div class="botonera">${ESTADOS_AUSENCIA.map(([v, t]) => `<button class="btn btn-secundario" data-a="estado" data-v="${v}">${t}</button>`).join('')}</div>`;
    } else if (sit === 'en-sede') {
      cuerpo = `
        <div class="estado-grande tono-verde">${icono('ok')}<div><strong>En la sede</strong><span>desde las ${esc(horaLegible(r.ingreso) || '—')}</span></div></div>
        <p>${esc(textoUbicacion(u))} ${u.excepcion ? insignia('Hoy en otro puesto', 'ambar') : ''}</p>
        <button class="btn btn-oscuro btn-ancho btn-grande" data-a="sali">${icono('salir')}Salí de la sede</button>
        <div class="botonera" style="margin-top:.75rem">
          <button class="btn btn-fantasma" data-a="otro-puesto">Cambiar ubicación de hoy</button>
          <button class="btn btn-fantasma" data-a="hora-ingreso">Corregir hora de ingreso</button>
          <button class="btn btn-fantasma" data-a="borrar">Borrar mi reporte de hoy</button>
        </div>`;
    } else if (sit === 'salio') {
      cuerpo = `
        <div class="estado-grande tono-gris">${icono('salir')}<div><strong>Salió de la sede</strong><span>a las ${esc(horaLegible(r.salida))} · ingresó a las ${esc(horaLegible(r.ingreso) || '—')}</span></div></div>
        <button class="btn btn-primario btn-ancho btn-grande" data-a="volvi">${icono('ubicacion')}Volví a la sede</button>
        <div class="botonera" style="margin-top:.75rem">
          <button class="btn btn-fantasma" data-a="hora-salida">Corregir hora de salida</button>
          <button class="btn btn-fantasma" data-a="borrar">Borrar mi reporte de hoy</button>
        </div>`;
    } else {
      cuerpo = `
        <div class="estado-grande tono-azul">${icono('inicio')}<div><strong>${esc(SITUACION[sit][0])}</strong><span>Hoy no está en la sede</span></div></div>
        <button class="btn btn-primario btn-ancho btn-grande" data-a="llegue">${icono('ubicacion')}Llegué a la sede</button>
        <p class="etiqueta" style="margin-top:1.25rem">Cambiar estado</p>
        <div class="botonera">${ESTADOS_AUSENCIA.filter(([v]) => v !== sit).map(([v, t]) => `<button class="btn btn-secundario" data-a="estado" data-v="${v}">${t}</button>`).join('')}</div>
        <div class="botonera" style="margin-top:.75rem"><button class="btn btn-fantasma" data-a="borrar">Borrar mi reporte de hoy</button></div>`;
    }

    vista.innerHTML = `
      <div class="titulo-vista">
        <h2>Mi día</h2>
        <p class="sutil">${esc(diaSemana(h.fecha))}, ${esc(fechaLegible(h.fecha))}</p>
      </div>
      ${pendientes ? `<div class="nota nota-adv">${icono('sinWifi')}<span>${pendientes} reporte(s) guardado(s) en este celular. Se enviarán solos cuando haya conexión.</span></div>` : ''}
      ${porOtro ? `<div class="nota nota-info">${icono('info')}<span>Su estado de hoy lo reportó ${esc(sesion.nombreDe(r.reportadoPor))}. Corríjalo si no es exacto.</span></div>` : ''}
      <div class="dia">
        ${tarjeta({ icono: 'reloj', tono: 'verde', titulo: sit === 'sin-reporte' ? '¿Cómo está hoy?' : 'Mi estado de hoy', subtitulo: 'Su reporte ayuda a saber quién está en la sede durante una emergencia', cuerpo })}
      </div>
      <p class="sutil centrado" style="margin-top:1rem"><a href="#/hoy">Ver quién está hoy en la sede y reportar a un compañero</a></p>`;

    vista.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => accion(b.dataset.a, b.dataset.v)));
  };

  const accion = async (a, v) => {
    const r = registro.registroDe(yo.codigo) || {};
    if (a === 'llegue') {
      await registro.marcar(yo.codigo, { estado: 'presencial', ingreso: horaBogota(), salida: '', excepcion: 'false', piso: persona.piso, puesto: persona.puesto });
      aviso('Registrado: en la sede.', 'exito');
    } else if (a === 'otro-puesto') {
      const u = await elegirPuestoHoy(persona);
      if (!u) return;
      const campos = { piso: u.piso, puesto: u.puesto, excepcion: String(!(u.piso === persona.piso && u.puesto === persona.puesto)) };
      if (registro.situacion(registro.registroDe(yo.codigo)) !== 'en-sede') Object.assign(campos, { estado: 'presencial', ingreso: horaBogota(), salida: '' });
      await registro.marcar(yo.codigo, campos);
      aviso('Ubicación de hoy registrada.', 'exito');
    } else if (a === 'estado') {
      await registro.marcar(yo.codigo, { estado: v, ingreso: '', salida: '', excepcion: 'false', piso: persona.piso, puesto: persona.puesto });
      aviso('Estado registrado.', 'exito');
    } else if (a === 'borrar') {
      if (!await confirmar('Borrar mi reporte de hoy', 'Quedará como «Sin reporte» hasta que vuelva a reportar su día.', 'Borrar reporte')) return;
      await registro.marcar(yo.codigo, { estado: '', ingreso: '', salida: '', excepcion: 'false', piso: persona.piso, puesto: persona.puesto });
      aviso('Reporte borrado. Puede reportar de nuevo.', 'info');
    } else if (a === 'sali') {
      await registro.marcar(yo.codigo, { salida: horaBogota() });
      aviso('Registrado: salió de la sede.', 'exito');
    } else if (a === 'volvi') {
      await registro.marcar(yo.codigo, { salida: '' });
      aviso('Registrado: de nuevo en la sede.', 'exito');
    } else if (a === 'hora-ingreso' || a === 'hora-salida') {
      const campo = a === 'hora-ingreso' ? 'ingreso' : 'salida';
      const hora = await pedirHora(campo === 'ingreso' ? 'Hora de ingreso' : 'Hora de salida', r[campo]);
      if (!hora) return;
      if (campo === 'salida' && r.ingreso && hora < r.ingreso) return aviso('La salida no puede ser antes del ingreso.', 'error');
      if (campo === 'ingreso' && r.salida && hora > r.salida) return aviso('El ingreso no puede ser después de la salida.', 'error');
      await registro.marcar(yo.codigo, { [campo]: hora });
      aviso('Hora corregida.', 'exito');
    }
  };

  const alCambiar = () => { if (document.body.contains(vista) && location.hash.startsWith('#/dia')) pintar(); };
  addEventListener('registro-cambio', alCambiar);
  vista.addEventListener('vista-salida', () => removeEventListener('registro-cambio', alCambiar), { once: true });
  pintar();
  registro.actualizar();
}
