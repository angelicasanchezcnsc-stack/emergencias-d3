// Prueba del componente de mapa de piso (web/js/mapa-piso.js).
// Corre solo en el computador local, con datos ficticios, y dibuja el mapa de verdad para medir tamaños y contraste.

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const salida = document.getElementById('salida');
const lienzo = document.getElementById('lienzo');
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fallar = m => { throw new Error(m); };
const afirmar = (c, m) => { if (!c) fallar(m || 'La condición no se cumple'); };
const igual = (obtenido, esperado, m) => {
  const a = JSON.stringify(obtenido), b = JSON.stringify(esperado);
  if (a !== b) fallar(`${m || 'No coincide'}: esperado ${b}, obtenido ${a}`);
};

const pruebas = [];
const prueba = (grupo, nombre, fn) => pruebas.push({ grupo, nombre, fn });

let M;   // módulo web/js/mapa-piso.js

// ---------- Datos ficticios ----------

const pad = (n, l) => String(n).padStart(l, '0');
const persona = n => ({ codigo: 'D3-' + pad(n, 3), nombre: 'Persona Demo ' + pad(n, 2) });
// Piso 2: puestos 1 a 6 ubicados, 7 a 12 sin ubicar (posición automática) y el 10 no asignable. Piso 4: un puesto.
const PUESTOS = [
  ...[[1, 1, 1], [2, 2, 1], [3, 3, 1], [4, 4, 1], [5, 1, 2], [6, 2, 2]].map(([puesto, col, fila]) => ({ piso: 2, puesto, estado: 'ocupado', col, fila, asignable: true })),
  ...[7, 8, 9, 10, 11, 12].map(puesto => ({ piso: 2, puesto, estado: 'vacante', col: null, fila: null, asignable: puesto !== 10 })),
  { piso: 4, puesto: 1, estado: 'ocupado', col: 1, fila: 1, asignable: true }
];
const REFERENCIAS = [
  { piso: 2, id: 'r1', tipo: 'escalera', etiqueta: 'Escalera', col: 8, fila: 1, ancho: 1, alto: 2 },
  { piso: 2, id: 'r2', tipo: 'sala', etiqueta: 'Sala de juntas', col: 6, fila: 3, ancho: 3, alto: 2 },
  { piso: 4, id: 'r3', tipo: 'bano', etiqueta: 'Baños', col: 3, fila: 1, ancho: 1, alto: 1 }
];
const ocupantes = () => new Map([
  ['2-1', [persona(1)]], ['2-2', [persona(2)]], ['2-3', [persona(3)]], ['2-4', [persona(4), persona(5)]],
  ['2-6', [persona(6)]], ['2-8', [persona(8)]], ['4-1', [persona(9)]]
]);

let contador = 0;
function dibujar(extra = {}, manejadores = {}) {
  const idBase = 'mp' + (++contador);
  const mapa = M.mapaPiso({ piso: 2, puestos: PUESTOS, referencias: REFERENCIAS, ocupantes: ocupantes(), modo: 'ver', idBase, plano: () => false, ...extra });
  lienzo.innerHTML = mapa.html;
  const control = mapa.enlazar(lienzo, manejadores);
  return { control, caja: lienzo.querySelector('.mapa-piso'), idBase };
}
const botones = caja => Array.from(caja.querySelectorAll('.mp-puesto'));
const porClave = (caja, k) => caja.querySelector(`[data-mp-puesto="${k}"]`);
const tecla = (el, key) => { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); };
const limpiarVista = () => { try { localStorage.removeItem('d3e-vista-mapa'); } catch (e) { /* sin almacenamiento */ } };
const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const luminancia = ([r, g, b]) => { const c = [r, g, b].map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---------- Funciones auxiliares ----------

const G0 = 'Utilidades del mapa';
prueba(G0, 'iniciales: dos primeras palabras con mayúscula, o el código si no hay nombre', () => {
  igual(M.iniciales({ nombre: 'Persona Demo 03' }), 'PD');
  igual(M.iniciales({ nombre: 'María de los Ángeles Pérez' }), 'MÁ');
  igual(M.iniciales({ nombre: 'juan perez' }), 'JP');
  igual(M.iniciales({ codigo: 'D3-001' }), 'D');
  igual(M.iniciales(null), '');
});
prueba(G0, 'ubicar respeta lo ubicado y pone el resto 6 por fila, por número, después de lo ya ubicado', () => {
  const sueltos = [14, 3, 1, 2, 5, 4, 6, 7, 8, 9, 10, 11, 12, 13].map(puesto => ({ piso: 2, puesto, col: null, fila: null }));
  const r = M.ubicar(sueltos, []);
  const de = n => r.puestos.find(x => x.puesto === n);
  igual([de(1).col, de(1).fila], [1, 1]);
  igual([de(6).col, de(6).fila], [6, 1]);
  igual([de(7).col, de(7).fila], [1, 2]);
  igual([de(13).col, de(13).fila], [1, 3]);
  igual([de(14).col, de(14).fila], [2, 3]);
  igual([r.filas, r.columnas], [3, 6]);
  const mezcla = M.ubicar([{ piso: 2, puesto: 1, col: 3, fila: 5 }, { piso: 2, puesto: 2, col: null, fila: null }], [{ col: 1, fila: 6, ancho: 2, alto: 2 }]);
  igual(mezcla.puestos.find(x => x.puesto === 2).fila, 8, 'Va después de la última fila ocupada, también por referencias');
  igual(mezcla.puestos.find(x => x.puesto === 1).automatica, false);
});

// ---------- Modo ver ----------

const G1 = 'Modo «ver»';
prueba(G1, 'Dibuja un botón por puesto del piso (no los de otros pisos) y la referencia de cada isla', () => {
  const { caja } = dibujar();
  igual(botones(caja).length, 12);
  afirmar(botones(caja).every(b => b.tagName === 'BUTTON' && b.type === 'button'), 'Cada puesto debe ser un <button type="button">');
  igual(caja.querySelectorAll('.mp-casilla').length, 0, 'En ver no hay casillas vacías');
});
prueba(G1, 'El aria-label dice el puesto y quién lo ocupa', () => {
  const { caja } = dibujar();
  const etiqueta = k => porClave(caja, k).getAttribute('aria-label');
  igual(etiqueta('2-3'), 'Puesto P2-3, ocupado por Persona Demo 03');
  igual(etiqueta('2-4'), 'Puesto P2-4, compartido por Persona Demo 04 y Persona Demo 05');
  igual(etiqueta('2-5'), 'Puesto P2-5, libre');
  igual(etiqueta('2-10'), 'Puesto P2-10, no asignable');
});
prueba(G1, 'Cada casilla muestra el número arriba y, debajo, las iniciales, «PD +1» o «Libre»', () => {
  const { caja } = dibujar();
  const texto = k => porClave(caja, k).querySelector('.mp-txt').textContent.trim();
  igual(texto('2-3'), 'PD');
  igual(texto('2-4'), 'PD +1');
  igual(texto('2-5'), 'Libre');
  igual(porClave(caja, '2-3').querySelector('.mp-num').textContent, 'P2-3');
});
prueba(G1, 'Los puestos no asignables quedan deshabilitados y con borde punteado', () => {
  const { caja } = dibujar();
  const b = porClave(caja, '2-10');
  afirmar(b.disabled, 'Debía estar deshabilitado');
  afirmar(b.classList.contains('mp-no-asignable'));
  igual(getComputedStyle(b).borderTopStyle, 'dotted');
  afirmar(!porClave(caja, '2-9').disabled);
});
prueba(G1, 'Los puestos sin posición se dibujan 6 por fila, ordenados por número, después de los ubicados', () => {
  const { caja } = dibujar();
  const pos = k => [Number(porClave(caja, k).dataset.col), Number(porClave(caja, k).dataset.fila)];
  igual(pos('2-1'), [1, 1]);
  igual(pos('2-6'), [2, 2]);
  // La sala de juntas llega hasta la fila 4: los automáticos empiezan en la 5.
  igual([7, 8, 9, 10, 11, 12].map(n => pos('2-' + n)), [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5]]);
  igual(porClave(caja, '2-8').style.gridColumn.replace(/\s/g, ''), '2');
});
prueba(G1, 'Cada referencia ocupa ancho × alto casillas, con su ícono y su nombre', () => {
  const { caja } = dibujar();
  const refs = Array.from(caja.querySelectorAll('.mp-ref'));
  igual(refs.length, 2, 'Solo las del piso 2');
  const escalera = refs.find(r => r.getAttribute('aria-label') === 'Escalera');
  afirmar(escalera, 'Falta la escalera');
  igual(escalera.getAttribute('role'), 'img');
  igual(escalera.style.gridColumn, '8 / span 1');
  igual(escalera.style.gridRow, '1 / span 2');
  afirmar(escalera.querySelector('svg'), 'Debía llevar un ícono');
  const sala = refs.find(r => r.getAttribute('aria-label') === 'Sala: Sala de juntas');
  afirmar(sala, 'Falta la sala: ' + refs.map(r => r.getAttribute('aria-label')));
  igual([sala.style.gridColumn, sala.style.gridRow], ['6 / span 3', '3 / span 2']);
  afirmar(sala.textContent.includes('Sala de juntas'), 'Debía mostrar la etiqueta');
});
prueba(G1, 'La leyenda trae solo las clases que aparecen, con su señal que no es el color', () => {
  const { caja } = dibujar();
  const leyenda = caja.querySelector('.mp-leyenda');
  afirmar(leyenda, 'Falta la leyenda');
  const t = leyenda.textContent;
  ['Libre', 'Ocupado', 'Compartido', 'No asignable'].forEach(x => afirmar(t.includes(x), 'Falta «' + x + '»: ' + t));
  ['Evacuado', 'Elegido', 'Coincide con la búsqueda'].forEach(x => afirmar(!t.includes(x), 'No debía traer «' + x + '»'));
  afirmar(t.includes('borde doble') && t.includes('borde punteado'), 'Cada clase explica su señal');
});
prueba(G1, 'Un piso sin puestos avisa y no dibuja botones', () => {
  const { caja } = dibujar({ piso: 6 });
  igual(botones(caja).length, 0);
  afirmar(caja.textContent.includes('no tiene puestos cargados'), caja.textContent);
});
prueba(G1, 'Con una búsqueda resalta los puestos con contorno y lo dice en el aria-label y la leyenda', () => {
  const { caja } = dibujar({ resaltar: new Set(['2-3']) });
  const b = porClave(caja, '2-3');
  afirmar(b.classList.contains('mp-resaltado'));
  afirmar(b.getAttribute('aria-label').endsWith('coincide con la búsqueda'), b.getAttribute('aria-label'));
  afirmar(caja.querySelector('.mp-leyenda').textContent.includes('Coincide con la búsqueda'));
  afirmar(!porClave(caja, '2-1').classList.contains('mp-resaltado'));
  afirmar(getComputedStyle(b).boxShadow !== 'none', 'El resaltado debe tener contorno');
});
prueba(G1, 'Las pestañas de piso marcan el actual con aria-pressed y avisan al cambiar', () => {
  let elegido = null;
  const { caja } = dibujar({ pisos: [2, 4, 6, 7] }, { alCambiarPiso: n => { elegido = n; } });
  const tabs = Array.from(caja.querySelectorAll('[data-mp-piso]'));
  igual(tabs.map(b => b.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false']);
  tabs[1].click();
  igual(elegido, 4);
});
prueba(G1, '«Ver plano del piso» solo aparece si hay plano y lo abre', () => {
  let abierto = null;
  const sin = dibujar({ plano: () => false }).caja;
  igual(sin.querySelectorAll('[data-mp-plano]').length, 0);
  const { caja } = dibujar({ plano: n => n === 2, abrirPlano: n => { abierto = n; } });
  const b = caja.querySelector('[data-mp-plano]');
  afirmar(b && b.textContent.includes('Ver plano del piso'), 'Falta el botón');
  b.click();
  igual(abierto, 2);
});
prueba(G1, 'El texto de personas y referencias se escapa', () => {
  window.__xss = undefined;
  const malo = new Map([['2-1', [{ codigo: 'D3-001', nombre: '<img src=x onerror="window.__xss=1"> Pérez' }]]]);
  const refs = [{ piso: 2, id: 'x', tipo: 'otro', etiqueta: '<b id="negrita">hola</b>', col: 10, fila: 1, ancho: 1, alto: 1 }];
  const { caja } = dibujar({ ocupantes: malo, referencias: refs });
  igual(caja.querySelectorAll('img').length, 0, 'No debía crear etiquetas img');
  igual(caja.querySelectorAll('#negrita, .mp-ref b').length, 0, 'No debía crear etiquetas b');
  igual(window.__xss, undefined);
  afirmar(caja.querySelector('.mp-ref').textContent.includes('<b id="negrita">hola</b>'), 'El texto debía verse tal cual');
});
prueba(G1, 'Todas las clases de estado llevan texto o símbolo, y dejan sus nombres en el aria-label', () => {
  const clases = Object.keys(M.CLASES);
  const estadoDe = p => ({ clase: clases[(p.puesto - 1) % clases.length] === 'no-asignable' ? 'libre' : clases[(p.puesto - 1) % clases.length] });
  const { caja } = dibujar({ estadoDe, puestos: PUESTOS.map(p => ({ ...p, asignable: true })) });
  botones(caja).forEach(b => {
    const clase = Array.from(b.classList).find(c => c.startsWith('mp-') && c !== 'mp-puesto' && c !== 'mp-resaltado').slice(3);
    afirmar(M.CLASES[clase], 'Clase desconocida ' + clase);
    afirmar(b.querySelector('.mp-txt').textContent.trim().length > 0, 'La clase ' + clase + ' no trae texto');
    afirmar(M.CLASES[clase].simbolo === '' || b.querySelector('.mp-sim'), 'La clase ' + clase + ' debía llevar su símbolo');
  });
  const evacuado = botones(caja).find(b => b.classList.contains('mp-evacuado'));
  afirmar(evacuado.querySelector('.mp-sim').textContent === '✓');
  afirmar(evacuado.getAttribute('aria-label').toLowerCase().includes('evacuado'), evacuado.getAttribute('aria-label'));
});
prueba(G1, 'La pantalla puede definir etiqueta y texto de cada puesto con estadoDe', () => {
  const estadoDe = (p, gente) => p.puesto === 1 ? { clase: 'no-ubicado', etiqueta: 'No ubicado', texto: 'Persona Demo 01, no ubicada' }
    : p.puesto === 2 ? { clase: 'apoyo', texto: 'Persona Demo 02 pide apoyo' } : {};
  const { caja } = dibujar({ estadoDe });
  const uno = porClave(caja, '2-1');
  afirmar(uno.classList.contains('mp-no-ubicado'));
  igual(uno.getAttribute('aria-label'), 'Puesto P2-1, Persona Demo 01, no ubicada');
  igual(uno.querySelector('.mp-sim').textContent, '!');
  igual(porClave(caja, '2-2').querySelector('.mp-txt').textContent.trim(), '✚PD');
});

// ---------- Lista equivalente ----------

const G2 = 'Vista de lista equivalente';
prueba(G2, 'Con «Ver como lista» la tabla tiene las mismas filas que botones tiene el mapa', () => {
  limpiarVista();
  const { caja } = dibujar();
  const delMapa = botones(caja).map(b => b.querySelector('.mp-num').textContent).sort();
  caja.querySelector('[data-mp-vista]').click();
  const filas = Array.from(caja.querySelectorAll('.mp-lista tbody tr'));
  igual(filas.length, delMapa.length);
  igual(filas.map(f => f.querySelector('td').textContent.trim()).sort(), delMapa);
  afirmar(filas.some(f => f.textContent.includes('Persona Demo 03') && f.textContent.includes('Ocupado')));
  afirmar(filas.some(f => f.textContent.includes('Persona Demo 04') && f.textContent.includes('Persona Demo 05') && f.textContent.includes('Compartido')));
  afirmar(filas.some(f => f.textContent.includes('Sin ocupante') && f.textContent.includes('Libre')));
  afirmar(caja.querySelector('[data-mp-vista]').textContent.includes('Ver como mapa'));
  igual(caja.querySelectorAll('.mp-puesto').length, 0, 'En lista no hay casillas del mapa');
  limpiarVista();
});
prueba(G2, 'La elección de mapa o lista se recuerda en localStorage y vuelve a «mapa»', () => {
  limpiarVista();
  const { caja } = dibujar();
  caja.querySelector('[data-mp-vista]').click();
  igual(localStorage.getItem('d3e-vista-mapa'), 'lista');
  igual(dibujar().caja.dataset.vista, 'lista', 'El mapa nuevo debía abrir en lista');
  lienzo.querySelector('[data-mp-vista]').click();
  igual(localStorage.getItem('d3e-vista-mapa'), 'mapa');
  igual(dibujar().caja.dataset.vista, 'mapa');
  limpiarVista();
  igual(dibujar({ vistaPorDefecto: 'lista' }).caja.dataset.vista, 'lista', 'Sin elección guardada manda la vista por defecto');
  limpiarVista();
});
prueba(G2, 'Al cambiar de vista el foco queda en el botón y se anuncia lo que se muestra', () => {
  limpiarVista();
  const { caja } = dibujar();
  caja.querySelector('[data-mp-vista]').focus();
  caja.querySelector('[data-mp-vista]').click();
  afirmar(document.activeElement.hasAttribute('data-mp-vista'), 'El foco debía quedar en el botón de vista');
  igual(caja.querySelector('[data-mp-aviso]').textContent, 'Mostrando la lista.');
  limpiarVista();
});
prueba(G2, 'En modo elegir cada fila de la lista trae su botón; en modo ver no hay acciones', () => {
  limpiarVista();
  const elegidos = [];
  const a = dibujar({ modo: 'elegir', vista: 'lista' }, { alElegir: p => elegidos.push(p.puesto) });
  const botonesFila = Array.from(a.caja.querySelectorAll('.mp-lista [data-mp-puesto]'));
  igual(botonesFila.length, 12);
  igual(botonesFila.filter(b => b.disabled).length, 1, 'El no asignable queda deshabilitado');
  botonesFila.find(b => b.dataset.mpPuesto === '2-3').click();
  botonesFila.find(b => b.dataset.mpPuesto === '2-10').click();
  igual(elegidos, [3]);
  igual(dibujar({ modo: 'ver', vista: 'lista' }).caja.querySelectorAll('.mp-lista [data-mp-puesto]').length, 0);
  limpiarVista();
});

// ---------- Modo elegir ----------

const G3 = 'Modo «elegir» y teclado';
prueba(G3, 'Tocar un puesto llama a alElegir con ese puesto y sus ocupantes; un puesto no asignable no responde', () => {
  const llamadas = [];
  const { caja } = dibujar({ modo: 'elegir' }, { alElegir: (p, info) => llamadas.push([p.piso, p.puesto, info.gente.length]) });
  porClave(caja, '2-4').click();
  porClave(caja, '2-5').click();
  porClave(caja, '2-10').click();
  igual(llamadas, [[2, 4, 2], [2, 5, 0]]);
});
prueba(G3, 'El orden del Tab (orden del documento) recorre los puestos por fila y por columna', () => {
  const { caja } = dibujar({ modo: 'elegir' });
  const orden = botones(caja).map(b => [Number(b.dataset.fila), Number(b.dataset.col)]);
  const ordenado = orden.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  igual(orden, ordenado);
  afirmar(botones(caja).every(b => b.getAttribute('tabindex') === null || b.getAttribute('tabindex') === '0'));
});
prueba(G3, 'Las flechas pasan al puesto vecino y se saltan los deshabilitados', () => {
  const { caja } = dibujar({ modo: 'elegir' });
  tecla(porClave(caja, '2-1'), 'ArrowRight');
  igual(document.activeElement.dataset.mpPuesto, '2-2');
  tecla(document.activeElement, 'ArrowDown');
  igual(document.activeElement.dataset.mpPuesto, '2-6');
  tecla(porClave(caja, '2-4'), 'ArrowDown');
  igual(document.activeElement.dataset.mpPuesto, '2-6', 'Baja a la fila siguiente, a la columna más cercana');
  tecla(porClave(caja, '2-1'), 'ArrowUp');
  igual(document.activeElement.dataset.mpPuesto, '2-1', 'Arriba de la primera fila no hay nada');
  tecla(porClave(caja, '2-1'), 'ArrowLeft');
  igual(document.activeElement.dataset.mpPuesto, '2-1', 'A la izquierda de la primera columna no hay nada');
  tecla(porClave(caja, '2-9'), 'ArrowRight');
  igual(document.activeElement.dataset.mpPuesto, '2-11', 'Se salta el puesto no asignable (2-10)');
  tecla(porClave(caja, '2-11'), 'ArrowLeft');
  igual(document.activeElement.dataset.mpPuesto, '2-9');
});
prueba(G3, 'Enter sobre el puesto enfocado lo elige', () => {
  const elegidos = [];
  const { caja } = dibujar({ modo: 'elegir' }, { alElegir: p => elegidos.push(p.puesto) });
  porClave(caja, '2-3').focus();
  // El navegador convierte Enter en un clic sobre un botón; aquí se comprueba que el elemento es un botón enfocable.
  afirmar(document.activeElement === porClave(caja, '2-3') && document.activeElement.tagName === 'BUTTON');
  document.activeElement.click();
  igual(elegidos, [3]);
});
prueba(G3, 'alTeclas recibe las teclas y puede impedir el movimiento por defecto', () => {
  const vistas = [];
  const { caja } = dibujar({ modo: 'elegir' }, { alTeclas: e => { vistas.push(e.key); if (e.key === 'ArrowRight') e.preventDefault(); } });
  tecla(porClave(caja, '2-1'), 'ArrowRight');
  igual(document.activeElement.dataset.mpPuesto, '2-1', 'El manejador canceló el movimiento');
  tecla(porClave(caja, '2-1'), 'ArrowDown');
  igual(document.activeElement.dataset.mpPuesto, '2-5');
  igual(vistas, ['ArrowRight', 'ArrowDown']);
});
prueba(G3, 'repintar cambia lo dibujado y conserva el foco en el mismo puesto', () => {
  const { caja, control } = dibujar({ modo: 'elegir' });
  porClave(caja, '2-3').focus();
  const nuevos = ocupantes(); nuevos.set('2-3', []);
  control.repintar({ ocupantes: nuevos });
  const b = porClave(caja, '2-3');
  igual(document.activeElement, b, 'El foco debía seguir en el puesto');
  igual(b.getAttribute('aria-label'), 'Puesto P2-3, libre');
  control.repintar({ estadoDe: p => (p.puesto === 3 ? { clase: 'elegido' } : {}) });
  afirmar(porClave(caja, '2-3').classList.contains('mp-elegido'));
  igual(document.activeElement, porClave(caja, '2-3'));
});

// ---------- Modo editar ----------

const G4 = 'Modo «editar»';
prueba(G4, 'Muestra toda la cuadrícula: las casillas vacías son botones con su fila y columna', () => {
  const { caja } = dibujar({ modo: 'editar' });
  // 24 columnas × 20 filas, menos 12 puestos, 2 + 6 casillas de referencias.
  igual(caja.querySelectorAll('.mp-casilla').length, 24 * 20 - 12 - 2 - 6);
  igual(caja.querySelector('[data-mp-casilla="5,3"]').getAttribute('aria-label'), 'Casilla vacía, fila 3, columna 5');
  afirmar(caja.querySelector('[data-mp-casilla="8,1"]') === null, 'La casilla bajo la escalera no es de nadie');
  igual(caja.querySelectorAll('button.mp-ref').length, 2, 'En editar las referencias son botones');
  afirmar(!porClave(caja, '2-10').disabled, 'En editar el puesto no asignable se puede tocar');
});
prueba(G4, 'Solo un elemento entra en el Tab y las flechas recorren la cuadrícula', () => {
  const { caja } = dibujar({ modo: 'editar' });
  igual(caja.querySelectorAll('.mp-rejilla [tabindex="0"]').length, 1);
  tecla(caja.querySelector('[data-mp-casilla="1,3"]'), 'ArrowRight');
  igual(document.activeElement.dataset.mpCasilla, '2,3');
  const con0 = caja.querySelectorAll('.mp-rejilla [tabindex="0"]');
  igual(con0.length, 1);
  igual(con0[0], document.activeElement, 'El Tab sigue desde donde quedó el foco');
  tecla(document.activeElement, 'ArrowDown');
  igual(document.activeElement.dataset.mpCasilla, '2,4');
});
prueba(G4, 'Tocar una casilla, un puesto o una referencia llama a su manejador', () => {
  const v = [];
  const { caja } = dibujar({ modo: 'editar' }, {
    alElegir: p => v.push('puesto ' + p.puesto), alElegirCasilla: c => v.push(`casilla ${c.col},${c.fila}`), alElegirReferencia: r => v.push('ref ' + r.id)
  });
  caja.querySelector('[data-mp-casilla="12,7"]').click();
  porClave(caja, '2-2').click();
  caja.querySelector('[data-mp-ref="r2"]').click();
  igual(v, ['casilla 12,7', 'puesto 2', 'ref r2']);
});

// ---------- Tamaño, contraste y desbordes ----------

const G5 = 'Objetivos de 44 px, contraste y desborde';
prueba(G5, 'Cada puesto, casilla y referencia mide al menos 44 × 44 px', () => {
  const { caja } = dibujar({ modo: 'editar' });
  const chicos = Array.from(caja.querySelectorAll('.mp-puesto, .mp-casilla, button.mp-ref'))
    .map(b => b.getBoundingClientRect()).filter(r => r.width < 43.5 || r.height < 43.5);
  igual(chicos.length, 0, 'Objetivos menores de 44 px');
});
prueba(G5, 'El texto de cada clase de estado tiene contraste de al menos 4,5:1', () => {
  const clases = Object.keys(M.CLASES);
  const todas = clases.map((c, i) => ({ piso: 2, puesto: i + 1, estado: 'ocupado', col: i + 1, fila: 1, asignable: true }));
  const { caja } = dibujar({ puestos: todas, referencias: REFERENCIAS, estadoDe: p => ({ clase: clases[p.puesto - 1] }) });
  const malos = [];
  [...botones(caja), ...caja.querySelectorAll('.mp-ref'), ...caja.querySelectorAll('.mp-muestra')].forEach(el => {
    const e = getComputedStyle(el);
    const fondo = rgb(e.backgroundColor), texto = rgb(e.color);
    const r = contraste(fondo, texto);
    if (r < 4.5) malos.push(`${el.className} ${r.toFixed(2)}`);
  });
  igual(malos, [], 'Contraste insuficiente');
});
prueba(G5, 'El mapa se desplaza dentro de su caja: la página no se desplaza de lado', () => {
  dibujar({ modo: 'editar' });
  const caja = lienzo.querySelector('.mapa-caja');
  afirmar(getComputedStyle(caja).overflowX === 'auto', 'La caja debe desplazarse por su cuenta');
  afirmar(document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    `La página se desplaza de lado: ${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth}`);
});

// ---------- Ejecución ----------

async function principal() {
  if (!LOCAL) { salida.textContent = 'Solo se ejecuta en el computador local'; return; }
  try {
    M = await import('../web/js/mapa-piso.js');
  } catch (e) {
    salida.innerHTML = `<div id="resumen" class="mal">No se pudo cargar el componente: ${esc(e.message)}</div>`;
    return;
  }
  const filas = [];
  let ultimoGrupo = '', ok = 0;
  for (const p of pruebas) {
    let resultado = 'OK', detalle = '';
    try { await p.fn(); ok++; } catch (e) { resultado = 'FALLA'; detalle = e && e.message ? e.message : String(e); }
    if (p.grupo !== ultimoGrupo) { filas.push(`<tr class="grupo"><td colspan="3">${esc(p.grupo)}</td></tr>`); ultimoGrupo = p.grupo; }
    filas.push(`<tr><td>${esc(p.nombre)}</td><td class="${resultado}">${resultado}</td><td>${esc(detalle)}</td></tr>`);
  }
  limpiarVista();
  lienzo.innerHTML = '';
  const fallan = pruebas.length - ok;
  const texto = fallan === 0
    ? `TOTAL: ${pruebas.length} pruebas · ${ok} OK · 0 FALLAN · 100 % OK`
    : `TOTAL: ${pruebas.length} pruebas · ${ok} OK · ${fallan} FALLAN · ${Math.round(ok * 100 / pruebas.length)} % OK`;
  salida.innerHTML = `<div id="resumen" class="${fallan === 0 ? 'ok' : 'mal'}">${texto}</div>
    <div class="tabla-caja"><table class="resultados"><thead><tr><th>Prueba</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>${filas.join('')}</tbody></table></div>
    <p id="resumen-final">${texto}</p>`;
}

principal();
