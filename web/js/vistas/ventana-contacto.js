// Piezas de interfaz del contacto de emergencia (v0.12): cómo se muestra y la ventana para corregirlo.
// Se usan en Caracterizaciones, Mi caracterización y Emergencia. Solo interfaz: el cifrado y el envío están
// en js/contacto-emergencia.js.
import { esc, aviso, modal } from '../ui.js';
import { fechaLegible, fechaBogota } from '../tiempo.js';
import { limpiarTelefono, telefonoDudoso } from '../archivo-contactos.js';

const soloMarcable = t => String(t || '').replace(/[^\d+]/g, '');
// Un enlace para llamar por cada teléfono de la celda (puede haber dos separados por «/» o «-» con espacios).
export const enlaceTel = t => (t ? String(t).split(/\s[/-]\s|\s*\/\s*/).filter(Boolean)
  .map(x => `<a href="tel:${esc(soloMarcable(x))}">${esc(x.trim())}</a>`).join(' · ') : '<span class="sutil">—</span>');

const FUENTE = { carga: 'archivo del área de personal', coordinacion: 'corregido por la coordinación', propio: 'corregido por la persona' };

// Fecha de carga y origen: «Cargado el 20 de octubre de 2026 · corregido por la coordinación».
export function textoOrigen(c) {
  const partes = [];
  if (c.cargado) partes.push('Cargado el ' + fechaLegible(fechaBogota(new Date(c.cargado))));
  if (c.fuente && c.fuente !== 'carga') partes.push(FUENTE[c.fuente] + (c.actualizado ? ' el ' + fechaLegible(fechaBogota(new Date(c.actualizado))) : ''));
  else if (!c.cargado && c.actualizado) partes.push('Registrado el ' + fechaLegible(fechaBogota(new Date(c.actualizado))));
  const t = partes.join(' · ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Ficha del contacto abierto. «c» = { datos: { telefono, familiar: { nombre, parentesco, telefono } }, salud }.
export function fichaContacto(c, { conSalud = true } = {}) {
  const f = (c.datos && c.datos.familiar) || {};
  const fila = (t, v) => `<tr><th>${t}</th><td>${v}</td></tr>`;
  const txt = v => (v ? esc(v) : '<span class="sutil">—</span>');
  return `<table class="tabla-ficha"><tbody>
    ${fila('Familiar', txt([f.nombre, f.parentesco && '(' + f.parentesco + ')'].filter(Boolean).join(' ')))}
    ${fila('Teléfono del familiar', enlaceTel(f.telefono))}
    ${fila('Teléfono de la persona', enlaceTel(c.datos && c.datos.telefono))}
    ${conSalud && c.salud ? fila('EPS', txt(c.salud.eps)) + fila('ARL', txt(c.salud.arl)) : ''}
  </tbody></table>`;
}

// Ventana para registrar o corregir un contacto. Devuelve null o { datos, salud }.
export function ventanaContacto({ titulo, contacto = null, ayuda = '' }) {
  const d = (contacto && contacto.datos) || {};
  const f = d.familiar || {};
  const s = (contacto && contacto.salud) || {};
  const campo = (id, etiqueta, valor, tipo = 'text') =>
    `<div class="campo" style="flex:1;min-width:12rem"><label class="etiqueta" for="${id}">${etiqueta}</label><input id="${id}" type="${tipo}" value="${esc(valor || '')}" autocomplete="off" maxlength="120"></div>`;
  return modal({
    titulo, ancho: 'ancho',
    cuerpo: `${ayuda ? `<p class="sutil">${esc(ayuda)}</p>` : ''}
      <div class="fila">${campo('ct-fam', 'Nombre del familiar', f.nombre)}${campo('ct-par', 'Parentesco', f.parentesco)}</div>
      <div class="fila">${campo('ct-telfam', 'Teléfono del familiar', f.telefono, 'tel')}${campo('ct-tel', 'Teléfono de la persona', d.telefono, 'tel')}</div>
      <div class="fila">${campo('ct-eps', 'EPS', s.eps)}${campo('ct-arl', 'ARL', s.arl)}</div>
      <p class="ayuda">La EPS y la ARL se guardan aparte: los brigadistas solo las reciben durante una emergencia o un simulacro.</p>`,
    acciones: [
      { texto: 'Cancelar', valor: null, clase: 'btn-fantasma' },
      {
        texto: 'Guardar', clase: 'btn-oscuro',
        antes: m => {
          const v = id => m.querySelector('#' + id).value.trim();
          if (!['ct-fam', 'ct-par', 'ct-telfam', 'ct-tel', 'ct-eps', 'ct-arl'].some(id => v(id))) { aviso('Escriba al menos un dato del contacto.', 'error'); return false; }
          const dudosos = [['ct-telfam', 'del familiar'], ['ct-tel', 'de la persona']].filter(([id]) => telefonoDudoso(v(id)));
          if (dudosos.length) aviso(`Revise el teléfono ${dudosos.map(x => x[1]).join(' y el ')}: no parece un celular ni un fijo de Colombia. Se guarda igual.`, 'advertencia');
        },
        valor: m => {
          const v = id => m.querySelector('#' + id).value.replace(/\s+/g, ' ').trim();
          const eps = v('ct-eps'), arl = v('ct-arl');
          return {
            datos: { telefono: limpiarTelefono(v('ct-tel')), familiar: { nombre: v('ct-fam'), parentesco: v('ct-par'), telefono: limpiarTelefono(v('ct-telfam')) } },
            salud: eps || arl ? { eps, arl } : null
          };
        }
      }
    ]
  });
}
