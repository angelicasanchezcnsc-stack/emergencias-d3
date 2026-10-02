// Utilidades de interfaz: íconos, avisos (toast), ventanas modales y progreso.

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Íconos de la familia Lucide, en línea para que funcionen sin conexión.
const ICONOS = {
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  sinWifi: '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  personas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  edificio: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  llave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  persona: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  inicio: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  candado: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  imprimir: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  recargar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  hoja: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2M14 13h2M8 17h2M14 17h2"/>',
  cerrar: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  guardar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  telefono: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  reloj: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  ubicacion: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  libro: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>'
};

export const icono = (nombre, clase = 'ic') =>
  `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre] || ''}</svg>`;

// Avisos emergentes
export function aviso(mensaje, tipo = 'info') {
  let caja = document.getElementById('avisos');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'avisos';
    caja.setAttribute('aria-live', 'polite');
    document.body.appendChild(caja);
  }
  const iconos = { exito: 'ok', error: 'alerta', advertencia: 'alerta', info: 'info' };
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.innerHTML = `${icono(iconos[tipo] || 'info')}<span>${esc(mensaje)}</span><i class="aviso-barra"></i>`;
  caja.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 4000);
}

// Ventana modal. Devuelve una promesa que se resuelve con el valor de cierre.
export function modal({ titulo, cuerpo, acciones = [{ texto: 'Cerrar', valor: null, clase: 'btn-fantasma' }], ancho = '' }) {
  return new Promise(resolver => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal ${ancho}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <div class="modal-cabeza"><h3>${esc(titulo)}</h3></div>
        <div class="modal-cuerpo">${cuerpo}</div>
        <div class="modal-pie">${acciones.map((a, i) =>
          `<button class="btn ${a.clase || 'btn-oscuro'}" data-i="${i}">${esc(a.texto)}</button>`).join('')}</div>
      </div>`;
    document.body.appendChild(fondo);
    const cerrar = v => { fondo.remove(); resolver(v); };
    fondo.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
      const a = acciones[Number(b.dataset.i)];
      if (a.antes && a.antes(fondo) === false) return;
      cerrar(typeof a.valor === 'function' ? a.valor(fondo) : a.valor);
    }));
    fondo.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(null); });
    const primero = fondo.querySelector('input, select, textarea, button');
    if (primero) primero.focus();
  });
}

export const confirmar = (titulo, texto, textoSi = 'Confirmar', peligro = false) =>
  modal({
    titulo, cuerpo: `<p>${texto}</p>`,
    acciones: [
      { texto: 'Cancelar', valor: false, clase: 'btn-fantasma' },
      { texto: textoSi, valor: true, clase: peligro ? 'btn-peligro' : 'btn-oscuro' }
    ]
  });

// Capa de espera con mensaje y progreso opcional.
export function espera(mensaje) {
  const capa = document.createElement('div');
  capa.className = 'modal-fondo espera';
  capa.innerHTML = `<div class="modal espera-caja"><div class="girador"></div><p class="espera-texto">${esc(mensaje)}</p><div class="progreso"><i></i></div></div>`;
  document.body.appendChild(capa);
  return {
    texto: t => { capa.querySelector('.espera-texto').textContent = t; },
    progreso: p => { capa.querySelector('.progreso i').style.width = Math.round(p * 100) + '%'; },
    cerrar: () => capa.remove()
  };
}

export const insignia = (texto, tono = 'gris') => `<span class="insignia insignia-${tono}">${esc(texto)}</span>`;

export function tarjeta({ icono: ic, tono = 'ambar', titulo, subtitulo = '', cuerpo = '', clase = '' }) {
  return `<section class="tarjeta ${clase}">
    <div class="tarjeta-cabeza">
      <div class="tarjeta-icono tono-${tono}">${icono(ic)}</div>
      <div><h3>${esc(titulo)}</h3>${subtitulo ? `<p class="sutil">${esc(subtitulo)}</p>` : ''}</div>
    </div>
    ${cuerpo}
  </section>`;
}
