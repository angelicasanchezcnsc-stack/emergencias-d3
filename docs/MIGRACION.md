# Migración al entorno de la CNSC

El aplicativo se diseñó para cambiar de servidor sin rehacerlo. Tiene tres piezas independientes.

## 1. Interfaz (`web/`)

Son archivos estáticos. Pueden alojarse en cualquier servidor web con HTTPS de la CNSC: un servidor propio, SharePoint con alojamiento de sitios o Azure Static Web Apps.

Solo cambia `web/config.js`:
- `URL_SERVIDOR`: la nueva dirección del servidor.
- `MODO_SERVIDOR`: `'apps-script'` sirve para cualquier servidor que use el mismo contrato (ver abajo).

**No cambie `SAL_PUBLICA`.** Si cambia, las huellas de los correos ya registradas dejan de coincidir y habría que crear de nuevo todas las cuentas.

## 2. Servidor

Hay dos caminos.

**a) Apps Script en una cuenta institucional de Google Workspace, si la CNSC la habilita.**
1. Copie la hoja de cálculo completa a la cuenta institucional.
2. Cree el proyecto de Apps Script en la copia con los mismos archivos.
3. En *Configuración del proyecto → Propiedades del script*, copie **exactamente** las propiedades `PIMIENTA` y `CODIGO_INSTALACION` del proyecto original. Sin la misma `PIMIENTA`, ninguna contraseña funciona.
4. Implemente la aplicación web y actualice `URL_SERVIDOR`.

**b) Otro servidor (por ejemplo, .NET, Node o Python con una base de datos SQL).**
1. Escriba un adaptador equivalente a `Codigo.gs`, con estas funciones: `leer`, `escribir`, `agregar`, `prop`, `uuid`, `ahora` y `bloqueo`.
2. Reutilice la lógica de `Nucleo.gs` (JavaScript estándar) o tradúzcala respetando el contrato.
3. Exporte cada hoja (`Personas`, `Puestos`, `Sesiones`, `Sobres`, `Config`, `Bitacora`) a CSV y cárguelas como tablas.
4. Conserve el valor de `PIMIENTA`.

### Contrato de la API

Petición `POST` con cuerpo JSON: `{ "accion": "...", "token": "...", ...datos }`.
Respuesta: `{ "ok": true, "datos": {...} }` o `{ "ok": false, "codigo": "...", "error": "..." }`.

| Acción | Requiere | Uso |
|---|---|---|
| `ping` | — | Estado del servidor e indicador de si ya fue inicializado |
| `inicializar` | código de instalación | Primera carga del padrón |
| `ingresar` | — | Huella del correo y verificador; devuelve sesión y perfil |
| `salir` | sesión | Cierra la sesión |
| `base` | sesión | Perfil, personas (solo códigos), puestos, directorio cifrado y configuración |
| `cambiarClave` | sesión | Nuevo verificador y sobres envueltos de nuevo |
| `guardarPadron` | administrador | Altas, cambios y retiros desde el Excel |
| `guardarRoles` | administrador | Roles, piso de brigada y directorio cifrado |
| `guardarConfig` | administrador | Reglas de contraseña y duración de la sesión |
| `restablecerClave` | administrador | Contraseña temporal nueva para una persona |
| `hoy` / `registrar` | sesión | Registro diario de ubicación (marcas con momento; gana la más reciente) |
| `guardarContenido` | administrador (contactos: también coordinador y suplente) | Sobres de contactos, recomendaciones y rutas, con control de versión |
| `subirArchivo` / `quitarArchivo` | administrador | Mapas, rutas y planos cifrados, en trozos de hasta 45.000 caracteres |
| `bajarArchivo` | sesión | Trozos cifrados de un archivo |
| `pulso` | sesión | Consulta liviana (sin candado): emergencia activa y su versión |
| `emergencia` | sesión | Estado completo: emergencia, foto de esperados por piso, marcas y conteos |
| `activarEmergencia` | real: administrador, coordinador, suplente o brigadista; simulacro: administrador o coordinador | Abre la emergencia y toma la foto de quién está en la sede |
| `marcarEmergencia` | cada persona sobre sí misma; brigadistas, coordinación y administración sobre cualquiera | Marcas por persona o por conteo (gana la más reciente) |
| `cerrarEmergencia` | real: administrador, coordinador o suplente; simulacro: administrador o coordinador | Cierra la emergencia |

## 3. Llave maestra

El archivo `.d3llave` y su frase **no cambian** con la migración. Se entregan a la nueva persona que administre, en persona y por canales de la CNSC.

## Si la CNSC define un protocolo propio de seudonimización

Los puntos donde se ajusta:
- `web/js/cripto.js`: algoritmos de huella y cifrado.
- `web/js/llave.js`: dónde vive la llave maestra.
- `servidor/Nucleo.gs`: qué guarda el servidor.
