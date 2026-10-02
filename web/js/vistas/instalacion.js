// Configuración inicial: se usa una sola vez, cuando el servidor está vacío.
import { CONFIG } from '../../config.js';
import * as llave from '../llave.js';
import { llamar } from '../api.js';
import { leerXlsx, interpretarPlanta } from '../xlsx.js';
import { esc, icono, aviso, espera, tarjeta } from '../ui.js';
import { previaExcel, elegirArchivo, guardarLlave, abrirLlave, mostrarCredencial } from './comun.js';
import { SEMILLAS } from '../contenido.js';

export async function vistaInstalacion(vista, ctx) {
  let filas = null;
  let codigoSimulado = '';
  if (CONFIG.MODO_SERVIDOR === 'simulado') {
    codigoSimulado = (await import('../servidor-simulado.js')).codigoInstalacionSimulado();
  }

  const paso = (n, ic, titulo, subtitulo, cuerpo) =>
    tarjeta({ icono: ic, tono: 'ambar', titulo: `${n}. ${titulo}`, subtitulo, cuerpo });

  vista.innerHTML = `
    <div class="titulo-vista">
      <h2>Configuración inicial</h2>
      <p class="sutil">El servidor está vacío. Este proceso se hace una sola vez, desde el computador del administrador (Edge o Chrome).</p>
    </div>
    <div class="nota nota-info">${icono('info')}<span>Los nombres y correos se procesan solo en este computador. Al servidor llegan códigos, huellas y sobres cifrados.</span></div>
    <div class="pila">
      ${paso(1, 'llave', 'Llave maestra', 'Archivo cifrado que relaciona cada código con la persona. Se guarda en su computador, fuera de la carpeta APP.', `
        <div id="llave-estado"></div>
        <div class="fila" id="llave-acciones">
          <div class="campo" style="flex:1;min-width:14rem"><label class="etiqueta" for="frase1">Frase de la llave (mínimo 10 caracteres)</label><input id="frase1" type="password" autocomplete="new-password"></div>
          <div class="campo" style="flex:1;min-width:14rem"><label class="etiqueta" for="frase2">Repita la frase</label><input id="frase2" type="password" autocomplete="new-password"></div>
        </div>
        <div class="fila">
          <button class="btn btn-primario" id="crear-llave">${icono('llave', 'ic-s')}Crear llave nueva</button>
          <button class="btn btn-secundario" id="abrir-llave">Abrir llave existente</button>
        </div>
        <p class="ayuda">Si pierde la frase o el archivo, habrá que crear de nuevo todas las cuentas. Guarde una copia en una memoria USB.</p>`)}
      ${paso(2, 'hoja', 'Planta física', 'Excel de numeración de escritorios por piso (una hoja por piso).', `
        <button class="btn btn-secundario" id="elegir-excel">${icono('subir', 'ic-s')}Elegir Excel</button>
        <div id="previa" style="margin-top:1rem"></div>`)}
      ${paso(3, 'persona', 'Administrador', 'La persona que administra el aplicativo. Podrá cambiarse después.', `
        <select id="admin" disabled><option>Primero cargue el Excel</option></select>`)}
      ${paso(4, 'candado', 'Código de instalación', 'Aparece en el registro de ejecución de Apps Script al correr la función instalar().', `
        ${codigoSimulado ? `<div class="nota nota-adv">Modo prueba: el código es <strong class="mono">${esc(codigoSimulado)}</strong></div>` : ''}
        <input id="codigo" type="text" autocomplete="off" class="mono" placeholder="Ej.: 4F7A9C21">`)}
      <button class="btn btn-oscuro" id="inicializar">${icono('ok', 'ic-s')}Inicializar el aplicativo</button>
    </div>`;

  const $ = s => vista.querySelector(s);
  const pintarLlave = () => {
    $('#llave-estado').innerHTML = llave.abierta()
      ? `<div class="nota nota-exito">${icono('ok')}<span>Llave abierta (${llave.personas().length} personas registradas).</span></div>` : '';
    $('#llave-acciones').classList.toggle('oculto', llave.abierta());
  };
  pintarLlave();

  $('#crear-llave').addEventListener('click', async () => {
    const f1 = $('#frase1').value, f2 = $('#frase2').value;
    if (f1.length < 10) return aviso('La frase debe tener al menos 10 caracteres.', 'error');
    if (f1 !== f2) return aviso('Las frases no coinciden.', 'error');
    llave.crear(f1);
    await guardarLlave();
    pintarLlave();
  });

  $('#abrir-llave').addEventListener('click', async () => {
    try { if (await abrirLlave()) { pintarLlave(); aviso('Llave abierta.', 'exito'); } }
    catch (e) { aviso(e.message, 'error'); }
  });

  $('#elegir-excel').addEventListener('click', async () => {
    if (!llave.abierta()) return aviso('Primero cree o abra la llave.', 'advertencia');
    const archivo = await elegirArchivo('.xlsx');
    if (!archivo) return;
    try {
      const r = interpretarPlanta(await leerXlsx(await archivo.arrayBuffer()));
      filas = r.filas;
      $('#previa').innerHTML = previaExcel(llave.compararExcel(filas), r.avisos, filas);
      const personas = filas.filter(x => x.correo);
      $('#admin').disabled = false;
      $('#admin').innerHTML = '<option value="">Elija al administrador…</option>' + personas.map(x =>
        `<option value="${esc(x.correo)}">${esc(x.nombre)} — ${esc(x.correo)} — P${x.piso}-${x.puesto}</option>`).join('');
    } catch (e) {
      aviso('No se pudo leer el Excel: ' + e.message, 'error');
    }
  });

  $('#inicializar').addEventListener('click', async () => {
    if (!llave.abierta()) return aviso('Falta la llave (paso 1).', 'error');
    if (!filas || !filas.some(x => x.correo)) return aviso('Falta cargar el Excel (paso 2).', 'error');
    const correoAdmin = $('#admin').value;
    if (!correoAdmin) return aviso('Elija al administrador (paso 3).', 'error');
    const codigo = $('#codigo').value.trim().toUpperCase();
    if (!codigo) return aviso('Escriba el código de instalación (paso 4).', 'error');

    const copia = llave.instantanea();
    const capa = espera('Creando cuentas y cifrando datos…');
    try {
      const cambios = llave.compararExcel(filas);
      const { items, puestos } = await llave.aplicarExcel(filas, cambios, { alAvanzar: capa.progreso });
      // Si la llave venía de un intento anterior, el servidor vacío aún no conoce a
      // esas personas: se les generan credenciales nuevas a todas.
      for (const p of llave.personas().filter(x => x.estado === 'activo')) {
        const it = items.find(i => i.codigo === p.codigo);
        if (it && it.verificador) continue;
        const cred = await llave.nuevaClave(p.codigo, false);
        const nuevo = { codigo: p.codigo, piso: p.piso, puesto: p.puesto, estado: 'activo', ...cred };
        if (it) Object.assign(it, nuevo); else items.push(nuevo);
      }
      const admin = llave.personas().find(p => p.correo === correoAdmin);
      items.find(i => i.codigo === admin.codigo).roles = ['admin'];
      capa.texto('Enviando al servidor…');
      await llamar('inicializar', {
        codigoInstalacion: codigo, personas: items, puestos,
        sobreDirectorio: await llave.sobreDirectorio(),
        sobresContenido: await llave.sobresIniciales(SEMILLAS)
      });
      capa.cerrar();
      await guardarLlave();
      await mostrarCredencial(admin);
      aviso('Aplicativo inicializado. Ingrese con su correo y la contraseña temporal.', 'exito');
      ctx.alTerminar();
    } catch (e) {
      llave.restaurar(copia);
      capa.cerrar();
      aviso(e.message, 'error');
    }
  });
}
