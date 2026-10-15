# Arquitectura de EMERGENCIAS D3

Guía técnica para quien llega a mantener o cambiar el aplicativo. Complementa `README.md` (qué es), `INSTALACION.md` (cómo se monta) y `MIGRACION.md` (contrato del servidor y migración).

## 1. Piezas

```
Celular / computador (navegador)                     Google (cuenta personal del responsable)
┌──────────────────────────────────────┐   HTTPS    ┌────────────────────────────────────────┐
│ web/  PWA sin dependencias           │  POST JSON │ Apps Script (aplicación web /exec)      │
│  · interfaz y rutas (#/…)            │ ─────────▶ │  servidor/Codigo.gs  adaptador Sheets   │
│  · cifrado y seudonimización         │ ◀───────── │  servidor/Nucleo.gs  reglas y permisos  │
│  · copia local (IndexedDB) y colas   │            │ Hoja de cálculo: una pestaña por tabla  │
│  · service worker (sin conexión)     │            │  (solo códigos, huellas y cifrados)     │
└──────────────────────────────────────┘            └────────────────────────────────────────┘
        ▲ publicada en GitHub Pages                  Llave maestra (.d3llave): solo en el PC
                                                     del administrador, nunca en Google ni GitHub
```

- **Sin build, sin npm.** Todo es JavaScript en módulos ES que el navegador carga tal cual. Se edita y se publica.
- **El núcleo del servidor no depende de Google.** `Nucleo.gs` recibe un adaptador (`dep`) con `leer`, `escribir`, `agregar`, `agregarVarias`, `prop`, `uuid`, `ahora`, `hoy`, `bloqueo` y `cache`. `Codigo.gs` lo implementa sobre Sheets; `web/js/servidor-simulado.js` lo implementa sobre `localStorage` para el **modo prueba**. Migrar a otro servidor es escribir otro adaptador.

## 2. Interfaz (`web/`)

| Archivo | Función |
|---|---|
| `config.js` | Nombre, versión, modo del servidor (`apps-script` o `simulado`), URL `/exec`, sal pública, repeticiones de PBKDF2 y pisos. Único archivo que cambia al migrar. |
| `index.html` | Carga `js/app.js`. Tiene la política de contenido (CSP). |
| `sw.js` | Service worker: primero la red y, sin conexión, la copia guardada. **Al publicar, subir `VERSION`** (y `CONFIG.VERSION`). |
| `css/earm.css` | Sistema de diseño EARM en CSS plano (tokens, tarjetas, botones, tablas, modales). |
| `js/app.js` | Arranque, menú, rutas (`RUTAS` con roles y `grupo`), franja de emergencia, avisos globales. El menú tiene como máximo cinco pestañas (`GRUPOS`: Inicio, Emergencia, Hoy en la sede, Información y Gestión); cada pestaña lleva a la primera ruta permitida de su grupo y, si el grupo tiene dos o más rutas permitidas, se pintan encima de la vista como subnavegación. Mi cuenta (botón del encabezado) y Mi caracterización no tienen pestaña. |
| `js/api.js` | Única puerta al servidor: `llamar(accion, datos)`. Agrega token e `idPeticion` y reintenta cuando Google pierde la respuesta. |
| `js/sesion.js` | Ingreso, sesión guardada, base del día (`base`), llave del directorio, par de llaves personal, cambio de contraseña. |
| `js/cripto.js` | WebCrypto: huella del correo, verificador, envolturas AES-GCM, ECDH P-256 + HKDF, archivo de llave. |
| `js/llave.js` | Llave maestra en memoria (código → nombre, correo, celular, contraseña temporal pendiente), lectura y escritura del archivo, comparación con el Excel. |
| `js/xlsx.js` | Lector mínimo de .xlsx (sin librerías) y lectura de la planta física. |
| `js/almacen.js` | IndexedDB clave-valor para la copia local. |
| `js/presencia.js` | Regla de presencia (`presenciaDe`, idéntica a la del servidor), foto de esperados y `ubicacionHoy`. |
| `js/novedades.js` | Novedades de presencia (no asiste, otro lugar, asiste) por rango de fechas y sin motivo. Requieren conexión. |
| `js/emergencia.js` | Estado de la emergencia, consulta periódica (60 s; 15 s en emergencia), marcas con cola, modo sin conexión (`L-…`), tablero y ausentes. |
| `js/caracterizacion.js` | Caracterización cifrada por persona y apoyos para brigadistas. |
| `js/contenido.js`, `js/contenido-inicial.js` | Contactos, recomendaciones, rutas y consentimiento (semillas iniciales y lectura y escritura de sus sobres cifrados), archivos (planos y mapas). |
| `js/vistas/*.js` | Una pantalla por archivo. `comun.js` tiene piezas compartidas (llave, credenciales, Excel). |
| `js/ui.js` | `esc` (escape HTML), íconos, avisos, modales, confirmaciones, tarjetas. **Todo texto variable se pasa por `esc`.** `confirmar(titulo, texto)` inserta `texto` como HTML: quien llama debe escapar. |

## 3. Servidor (`servidor/`)

- **Tablas** (pestañas de la hoja, columnas en `ESQUEMA` de `Nucleo.gs`): Personas (con la `agenda` de días presenciales), Puestos, Sesiones, Sobres, Config, Bitacora, Novedades, Archivos, Emergencias, MarcasEmergencia, ConteosEmergencia, Caracterizaciones. Todos los valores se guardan como texto.
- **Acciones:** `acciones` en `Nucleo.gs`. La tabla completa, con quién puede usar cada una, está en `MIGRACION.md`.
- **Permisos:** cada acción recibe la persona de la sesión (`p`) y revisa sus roles (`ROLES_*`). Públicas: `ping`, `inicializar`, `ingresar`. **Acceso = tener al menos un rol** (`admin`, `coordinador`, `suplente`, `brigadista`, `asesor`): `sesionActual` solo devuelve a quien tiene algún rol, y `ingresar` responde `SIN_ACCESO` a quien no lo tiene. Quien no tiene rol sigue en el padrón (cuenta en las listas de la emergencia y su nombre está en el directorio).
- **Concurrencia:** las escrituras toman `LockService` (`dep.bloqueo`); las lecturas de la lista `SIN_BLOQUEO` no lo toman, para que muchos celulares consulten a la vez. Por eso `escribir` nunca deja una tabla vacía a mitad de camino.
- **Reintentos seguros:** Google a veces ejecuta la acción y pierde la respuesta. El celular reintenta con el mismo `idPeticion` y el servidor devuelve la respuesta guardada 10 minutos en `CacheService`, sin repetir la acción.
- **Retención:** las novedades vencidas se borran al escribir; la bitácora de más de `diasBitacora` (365) se purga como máximo una vez al día, desde `guardarNovedad`. Las tablas `RegistroHoy` y `RegistroHistorico` quedaron obsoletas (nadie las lee ni las escribe). Al cerrar una emergencia queda solo el resumen y se borran las marcas por persona.

## 4. Protección de datos

| Dato | Dónde vive | Cómo |
|---|---|---|
| Nombre, correo, celular | Llave maestra (PC del administrador) y **sobre del directorio** en Google | El sobre está cifrado con una llave que cada persona recibe envuelta con su contraseña. |
| Correo para ingresar | Google | Solo la **huella** PBKDF2 (100.000 repeticiones, sal pública). |
| Contraseña | En ninguna parte | De ella salen, por PBKDF2 (600.000), el **verificador** (Google guarda su SHA-256 con una pimienta secreta) y la **llave de envoltura**, que nunca sale del celular. |
| Contactos, rutas, recomendaciones, consentimiento | Google | Sobres AES-GCM con la llave del directorio. |
| Planos y mapas | Google (pestaña Archivos) | Cifrados y partidos en trozos de hasta 40.000 caracteres. |
| Caracterización | Google | Cifrada con una llave aleatoria, envuelta por ECDH para cada destinatario (persona, coordinación; el apoyo además para los brigadistas de su piso y el acompañante). |
| Emergencia en curso | Google y celulares | Quien no reporta solo recibe su marca y cifras por piso. Al cerrar se borra el detalle. |

Reglas que no se rompen: ningún dato personal en el código ni en el repositorio; los insumos (Excel, PDF, RTF, DOCX) están bloqueados por `.gitignore`; la llave maestra nunca va dentro de `APP/`.

## 5. Flujos principales

1. **Configuración inicial** (`vistas/instalacion.js`): se crea o abre la llave, se lee el Excel, se generan códigos y contraseñas temporales, **se guarda la llave** y solo entonces se llama `inicializar` con el código de instalación.
2. **Ingreso** (`sesion.ingresar`): huella del correo + verificador → token; se abre la llave del directorio y se prepara el par ECDH personal (si no existe, `registrarPar`).
3. **Presencia** (`presencia.js`, `novedades.js`): no hay registro de llegada ni salida. Cada persona activa se considera presente en su puesto los días de su agenda (lunes a viernes si no se configura nada), salvo una novedad vigente (no asiste, otro lugar, asiste) o un festivo. La misma regla (`presenciaDe`) vive en el servidor y en el navegador. Las novedades requieren conexión y se borran solas al vencer. Las marcas de emergencia siguen llevando su `momento` (gana la más reciente) y el servidor no acepta momentos más de 5 minutos en el futuro.
4. **Emergencia** (`emergencia.js`): `activarEmergencia` toma la foto de quién se espera en la sede (regla de presencia); los celulares la detectan con `pulso`; las marcas van por cola a `marcarEmergencia`; `cerrarEmergencia` calcula el informe y borra el detalle.
5. **Sin conexión:** la interfaz abre desde el service worker; las marcas de emergencia quedan en cola (las novedades no: requieren internet); un brigadista puede activar la emergencia localmente (`L-…`) y se une a la del servidor con `unirse` al volver la señal.

## 6. Cómo hacer un cambio

1. `git pull` antes de empezar (GitHub es la copia oficial).
2. Probar en local: `powershell -ExecutionPolicy Bypass -File herramientas\servidor-local.ps1 -Puerto 8090` y abrir `http://localhost:8090/web/`. **En `localhost` la app usa siempre el servidor simulado** (datos ficticios, solo en ese navegador): `config.js` elige el modo según la dirección y el servidor local agrega `'unsafe-eval'` a la política de contenido solo al entregar `web/index.html`. Ya no hay que editar `config.js` ni `index.html` para probar. En GitHub Pages se usa siempre el servidor real. Nunca se prueba contra el servidor real.
   - **Banco de pruebas del núcleo:** con el servidor local encendido, abrir `http://localhost:8090/herramientas/pruebas-nucleo.html`. Ejecuta `servidor/Nucleo.gs` contra un adaptador en memoria y muestra cada prueba en OK o FALLA. Debe estar al 100 % antes de cada commit.
3. Al terminar: subir `VERSION` en `web/sw.js` y `web/config.js`, commit en español y `git push`. GitHub Pages publica en uno o dos minutos.
4. Si cambió `servidor/`, el responsable de la cuenta de Google pega `Codigo.gs` y `Nucleo.gs` en el editor y publica **Deploy → Manage deployments → ✏️ → New version** (la URL no cambia). Si hay hojas o columnas nuevas, ejecutar antes `instalar`. Los cambios del servidor deben ser compatibles con la versión anterior de la app, porque los celulares se actualizan solos y no todos a la vez.
