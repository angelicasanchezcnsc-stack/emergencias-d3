// Contactos de emergencia: líneas institucionales (editables) y la brigada del Despacho.
import { CONFIG } from '../../config.js';
import * as sesion from '../sesion.js';
import * as contenido from '../contenido.js';
import { esc, icono, aviso, insignia, modal, confirmar } from '../ui.js';

const puedeEditar = () => ['admin', 'coordinador', 'suplente'].some(r => sesion.tieneRol(r));

const boton = (telefono, texto = 'Llamar') => {
  const t = contenido.telefonoLimpio(telefono);
  return t ? `<a class="btn btn-primario btn-chico btn-llamar" href="tel:${esc(t)}">${icono('telefono', 'ic-s')}${esc(texto)}</a>` : '';
};

function filaPersona(p, rol) {
  const cel = sesion.celularDe(p.codigo);
  return `<div class="contacto">
    <div class="contacto-txt"><strong>${esc(sesion.nombreDe(p.codigo))}</strong>
      <span class="sutil">${esc(rol)}${cel ? ' · ' + esc(cel) : ' · sin celular registrado'}</span></div>
    ${boton(cel)}
  </div>`;
}

function seccionBrigada() {
  const base = sesion.base();
  const yo = sesion.perfil();
  const activos = (base.personas || []).filter(p => p.estado === 'activo');
  const coord = activos.filter(p => p.roles.includes('coordinador') || p.roles.includes('suplente'));
  const pisos = [...CONFIG.PISOS].sort((a, b) => (a === yo.piso ? -1 : b === yo.piso ? 1 : a - b));
  const bloques = [];
  if (coord.length) {
    bloques.push(`<h4>Coordinación del Despacho</h4>` + coord.map(p =>
      filaPersona(p, p.roles.includes('coordinador') ? 'Coordinador de emergencias' : 'Suplente del coordinador')).join(''));
  }
  for (const n of pisos) {
    const b = activos.filter(p => p.roles.includes('brigadista') && p.pisoBrigada === n);
    bloques.push(`<h4>Piso ${n}${n === yo.piso ? ' · su piso' : ''}</h4>` + (b.length
      ? b.map(p => filaPersona(p, 'Brigadista')).join('')
      : '<p class="sutil">Sin brigadista asignado.</p>'));
  }
  return `<section class="tarjeta">
    <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-rojo">${icono('escudo')}</div>
      <div><h3>Brigada y coordinación del Despacho</h3><p class="sutil">Se administra en Administración → Personas y roles</p></div></div>
    ${bloques.join('')}
  </section>`;
}

function formulario(c, grupos) {
  const x = c || { grupo: '', nombre: '', telefono: '', nota: '', pendiente: false, verificar: false };
  return modal({
    titulo: c ? 'Editar contacto' : 'Agregar contacto',
    cuerpo: `
      <div class="campo"><label class="etiqueta" for="k-grupo">Grupo</label>
        <input id="k-grupo" type="text" list="k-grupos" value="${esc(x.grupo)}" placeholder="Ej.: Edificio" autocomplete="off">
        <datalist id="k-grupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
      <div class="campo"><label class="etiqueta" for="k-nombre">Nombre o dependencia</label><input id="k-nombre" type="text" value="${esc(x.nombre)}" autocomplete="off"></div>
      <div class="campo"><label class="etiqueta" for="k-tel">Teléfono</label><input id="k-tel" type="tel" value="${esc(x.telefono)}" placeholder="Ej.: 601 325 9700" autocomplete="off"></div>
      <div class="campo"><label class="etiqueta" for="k-nota">Nota</label><textarea id="k-nota" rows="3">${esc(x.nota)}</textarea></div>
      <label class="casilla"><input type="checkbox" id="k-pend" ${x.pendiente ? 'checked' : ''}>Pendiente: aún no se recibe este dato</label>
      <label class="casilla"><input type="checkbox" id="k-ver" ${x.verificar ? 'checked' : ''}>Por verificar: el dato puede estar desactualizado</label>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Guardar', clase: 'btn-oscuro',
        antes: f => {
          if (!f.querySelector('#k-nombre').value.trim()) { aviso('Escriba el nombre o la dependencia.', 'error'); return false; }
          if (!f.querySelector('#k-grupo').value.trim()) { aviso('Escriba el grupo del contacto.', 'error'); return false; }
        },
        valor: f => ({
          ...(c || { id: crypto.randomUUID() }),
          grupo: f.querySelector('#k-grupo').value.trim(), nombre: f.querySelector('#k-nombre').value.trim(),
          telefono: f.querySelector('#k-tel').value.trim(), nota: f.querySelector('#k-nota').value.trim(),
          pendiente: f.querySelector('#k-pend').checked, verificar: f.querySelector('#k-ver').checked
        })
      }
    ]
  });
}

export async function vistaContactos(vista) {
  const editor = puedeEditar();
  let ultimo = { lista: [], grupos: [] };   // lo último que se pintó, para los botones fijos del encabezado

  const guardar = async nueva => {
    try { await contenido.guardarSobre('contactos', { contactos: nueva }); aviso('Contactos guardados.', 'exito'); }
    catch (e) {
      aviso(e.codigo === 'RED' ? 'Sin conexión: los cambios solo se pueden guardar con internet.' : e.message, 'error');
    }
    pintar();
  };

  const pintar = async () => {
    let datos = null;
    try { datos = await contenido.leerSobre('contactos'); }
    catch (e) { vista.querySelector('#lista').innerHTML = `<div class="nota nota-error">${icono('alerta')}<span>${esc(e.message)}</span></div>`; return; }

    const lista = (datos && datos.contactos) || [];
    const grupos = [...new Set(lista.map(c => c.grupo))];
    ultimo = { lista, grupos };
    let html = '';

    if (!datos) {
      html += `<div class="nota nota-adv">${icono('info')}<span>Todavía no se han cargado los contactos institucionales.${editor ? '' : ' Pídale al administrador que los cargue.'}</span></div>
        ${editor ? `<button class="btn btn-primario" id="sembrar">${icono('subir', 'ic-s')}Cargar contactos iniciales</button>` : ''}`;
    }

    html += grupos.map(g => `
      <section class="tarjeta">
        <div class="tarjeta-cabeza"><div class="tarjeta-icono tono-azul">${icono('telefono')}</div><div><h3>${esc(g)}</h3></div></div>
        ${lista.filter(c => c.grupo === g).map(c => `
          <div class="contacto" data-id="${esc(c.id)}">
            <div class="contacto-txt">
              <strong>${esc(c.nombre)}</strong>
              <span class="mono telefono">${esc(c.telefono) || '<span class="sutil">Sin teléfono</span>'}</span>
              <span class="sutil">${c.pendiente ? insignia('Pendiente', 'ambar') + ' ' : ''}${c.verificar ? insignia('Por verificar', 'azul') + ' ' : ''}${esc(c.nota)}</span>
            </div>
            <div class="contacto-acc">
              ${boton(c.telefono)}
              ${editor ? `<button class="btn btn-fantasma btn-chico" data-editar>Editar</button><button class="btn btn-fantasma btn-chico" data-quitar>Quitar</button>` : ''}
            </div>
          </div>`).join('')}
      </section>`).join('');

    vista.querySelector('#lista').innerHTML = html;
    vista.querySelector('#brigada').innerHTML = seccionBrigada();

    vista.querySelector('#sembrar')?.addEventListener('click', async () => {
      try { await contenido.sembrar(['contactos']); aviso('Contactos iniciales cargados.', 'exito'); pintar(); }
      catch (e) { aviso(e.message, 'error'); }
    });

    vista.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', async () => {
      const c = lista.find(x => x.id === b.closest('[data-id]').dataset.id);
      const nuevo = await formulario(c, grupos);
      if (nuevo) guardar(lista.map(x => x.id === nuevo.id ? nuevo : x));
    }));
    vista.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', async () => {
      const c = lista.find(x => x.id === b.closest('[data-id]').dataset.id);
      if (await confirmar('Quitar contacto', `¿Quitar «${esc(c.nombre)}» de la lista?`, 'Quitar', true)) guardar(lista.filter(x => x.id !== c.id));
    }));
  };

  vista.innerHTML = `
    <div class="titulo-vista fila entre">
      <div><h2>Contactos de emergencia</h2><p class="sutil">Disponibles sin conexión. En una emergencia real, llame primero a la línea 123.</p></div>
      ${editor ? `<button class="btn btn-secundario btn-chico no-imprimir" id="agregar">${icono('guardar', 'ic-s')}Agregar contacto</button>` : ''}
    </div>
    <div class="fila" style="margin-bottom:1rem">${boton('123', 'Llamar al 123')}</div>
    <div class="pila"><div id="brigada"></div><div id="lista" class="pila"></div></div>`;
  vista.querySelector('#agregar')?.addEventListener('click', async () => {
    const nuevo = await formulario(null, ultimo.grupos);
    if (nuevo) guardar([...ultimo.lista, nuevo]);
  });
  await pintar();
}
