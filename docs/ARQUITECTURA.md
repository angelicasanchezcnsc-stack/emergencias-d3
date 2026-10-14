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
| `js/app.js` | Arranque, menú, rutas (`RUTAS` con roles), franja de emergencia, avisos globales. |
| `js/api.js` | Única puerta al servidor: `llamar(accion, datos)`. Agrega token e `idPeticion` y reintenta cuando Google pierde la respuesta. |
| `js/sesion.js` | Ingreso, sesión guardada, base del día (`base`), llave del directorio, par de llaves personal, cambio de contraseña. |
| `js/cripto.js` | WebCrypto: huella del correo, verificador, envolturas AES-GCM, ECDH P-256 + HKDF, archivo de llave. |
| `js/llave.js` | Llave maestra en memoria (código → nombre, correo, celular, contraseña temporal pendiente), lectura y escritura del archivo, comparación con el Excel. |
| `js/xlsx.js` | Lector mínimo de .xlsx (sin librerías) y lectura de la planta física. |
| `js/almacen.js` | IndexedDB clave-valor para la copia local. |
| `js/registro.js` | Registro diario (Mi día), cola sin conexión. |
| `js/emergencia.js` | Estado de la emergencia, consulta periódica (60 s; 15 s en emergencia), marcas con cola, modo sin conexión (`L-…`), tablero y ausentes. |
| `js/caracterizacion.js` | Caracterización cifrada por persona y apoyos para brigadistas. |
| `js/contenido.js`, `js/contenido-inicial.js` | Contactos, recomendaciones, rutas y consentimiento (semillas iniciales y lectura y escritura de sus sobres cifrados), archivos (planos y mapas). |
| `js/vistas/*.js` | Una pantalla por archivo. `comun.js` tiene piezas compartidas (llave, credenciales, Excel). |
| `js/ui.js` | `esc` (escape HTML), íconos, avisos, modales, confirmaciones, tarjetas. **Todo texto variable se pasa por `esc`.** `confirmar(titulo, texto)` inserta `texto` como HTML: quien llama debe escapar. |

## 3. Servidor (`servidor/`)

- **Tablas** (pestañas de la hoja, columnas en `ESQUEMA` de `Nucleo.gs`): Personas, Puestos, Sesiones, Sobres, Config, Bitacora, RegistroHoy, RegistroHistorico, Archivos, Emergencias, MarcasEmergencia, ConteosEmergencia, Caracterizaciones. Todos los valores se guardan como texto.
- **Acciones:** `acciones` en `Nucleo.gs`. La tabla completa, con quién puede usar cada una, está en `MIGRACION.md`.
- **Permisos:** cada acción recibe la persona de la sesión (`p`) y revisa sus roles (`ROLES_*`). Públicas: `ping`, `inicializar`, `ingresar`.
- **Concurrencia:** las escrituras toman `LockService` (`dep.bloqueo`); las lecturas de la lista `SIN_BLOQUEO` no lo toman, para que muchos celulares consulten a la vez. Por eso `escribir` nunca deja una tabla vacía a mitad de camino.
- **Reintentos seguros:** Google a veces ejecuta la acción y pierde la respuesta. El celular reintenta con el mismo `idPeticion` y el servidor devuelve la respuesta guardada 10 minutos en `CacheService`, sin repetir la acción.
- **Retención:** al cambiar el día, el registro pasa a RegistroHistorico; se borra lo que tenga más de `diasHistorico` (90) y la bitácora de más de `diasBitacora` (365). Al cerrar una emergencia queda solo el resumen y se borran las marcas por persona.

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
3. **Día** (`registro.js`): cada marca lleva su `momento`; por campo gana la más reciente (sirve para colas sin conexión). El servidor no acepta momentos más de 5 minutos en el futuro.
4. **Emergencia** (`emergencia.js`): `activarEmergencia` toma la foto de quién está en la sede; los celulares la detectan con `pulso`; las marcas van por cola a `marcarEmergencia`; `cerrarEmergencia` calcula el informe y borra el detalle.
5. **Sin conexión:** la interfaz abre desde el service worker; registro y marcas quedan en cola; un brigadista puede activar la emergencia localmente (`L-…`) y se une a la del servidor con `unirse` al volver la señal.

## 6. Cómo hacer un cambio

1. `git pull` antes de empezar (GitHub es la copia oficial).
2. Probar en local: `powershell -ExecutionPolicy Bypass -File herramientas\servidor-local.ps1 -Puerto 8090` y abrir `http://localhost:8090/web/`. **Con `config.js` apuntando al servidor real, lo que se haga ahí toca datos reales.** Para probar con datos ficticios: `MODO_SERVIDOR: 'simulado'` y agregar `'unsafe-eval'` al CSP de `web/index.html`, **sin hacer commit de esos dos cambios**.
3. Al terminar: subir `VERSION` en `web/sw.js` y `web/config.js`, commit en español y `git push`. GitHub Pages publica en uno o dos minutos.
4. Si cambió `servidor/`, el responsable de la cuenta de Google pega `Codigo.gs` y `Nucleo.gs` en el editor y publica **Deploy → Manage deployments → ✏️ → New version** (la URL no cambia). Si hay hojas o columnas nuevas, ejecutar antes `instalar`. Los cambios del servidor deben ser compatibles con la versión anterior de la app, porque los celulares se actualizan solos y no todos a la vez.
