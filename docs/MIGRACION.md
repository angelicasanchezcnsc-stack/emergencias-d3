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
| `cambiarClave` | sesión | Nuevo verificador y sobres envueltos de nuevo. Cierra las demás sesiones de la persona |
| `guardarPadron` | administrador | Altas, cambios y retiros desde el Excel |
| `guardarRoles` | administrador | Roles, piso de brigada y directorio cifrado |
| `guardarConfig` | administrador | Reglas de contraseña, duración de la sesión y días de conservación del registro archivado (`diasHistorico`, 90 por defecto) y de la bitácora (`diasBitacora`, 365) |
| `restablecerClave` | administrador | Contraseña temporal nueva para una persona |
| `hoy` / `registrar` | sesión | Registro diario de ubicación (marcas con momento; gana la más reciente) |
| `guardarContenido` | administrador (contactos: también coordinador y suplente) | Sobres de contactos, recomendaciones y rutas, con control de versión |
| `subirArchivo` / `quitarArchivo` | administrador | Mapas, rutas y planos cifrados, en trozos de hasta 45.000 caracteres |
| `bajarArchivo` | sesión | Trozos cifrados de un archivo |
| `pulso` | sesión | Consulta liviana (sin candado): emergencia activa y su versión |
| `emergencia` | sesión | Brigadistas, coordinación y administración: estado completo (foto de esperados por piso, marcas y conteos). Las demás personas: solo su propia marca y `cifras` por piso, sin el detalle de nadie más |
| `activarEmergencia` | real: administrador, coordinador, suplente o brigadista; simulacro: administrador o coordinador | Abre la emergencia y toma la foto de quién está en la sede. Con `unirse: true` (emergencia activada sin conexión), se une a la que esté en curso o la crea con su hora de inicio real |
| `marcarEmergencia` | cada persona sobre sí misma; brigadistas, coordinación y administración sobre cualquiera | Marcas por persona o por conteo (gana la más reciente) |
| `cerrarEmergencia` | real: administrador, coordinador o suplente; simulacro: administrador o coordinador | Cierra la emergencia, calcula el informe (totales y tiempos por piso, con observaciones) y **borra el detalle por persona** de esa emergencia |
| `historial` | administrador, coordinador, suplente o brigadista | Últimos 100 eventos cerrados con su informe; sin nombres, códigos ni quién activó o cerró |
| `registrarPar` | sesión | La persona registra su llave pública y su llave privada ya cifrada con su contraseña (solo si aún no tiene) |
| `guardarCaracterizacion` / `miCaracterizacion` / `revocarCaracterizacion` | la propia persona | Crea, lee o borra solo su registro cifrado. Exige la aceptación de la autorización y que cada envoltorio coincida con la llave pública vigente del destinatario |
| `caracterizaciones` | administrador, coordinador o suplente | Registros cifrados y el envoltorio propio de cada uno |
| `apoyos` | cualquiera con envoltorio (brigadistas: solo su piso) | Solo el apoyo cifrado para evacuar |
| `reenvolver` | administrador, coordinador o suplente | Agrega o quita destinatarios de un registro (nuevo coordinador o brigadista, llave renovada); nunca toca los datos |

**Si la CNSC exige otro esquema de cifrado:** los puntos de ajuste de la caracterización están en `web/js/cripto.js` (envolturas ECDH) y `web/js/caracterizacion.js` (quién recibe qué).

## 3. Llave maestra

El archivo `.d3llave` y su frase **no cambian** con la migración. Se entregan a la nueva persona que administre, en persona y por canales de la CNSC.

## Si la CNSC define un protocolo propio de seudonimización

Los puntos donde se ajusta:
- `web/js/cripto.js`: algoritmos de huella y cifrado.
- `web/js/llave.js`: dónde vive la llave maestra.
- `servidor/Nucleo.gs`: qué guarda el servidor.

## Reglas de seguridad que cualquier servidor nuevo debe conservar

- Las marcas con `momento` (registro diario y emergencia) se limitan a, como mucho, 5 minutos en el futuro, y cada envío acepta hasta 500 operaciones.
- `escribir` no debe dejar la tabla vacía a mitad de la escritura: hay lecturas sin candado (`pulso`, `emergencia`). En Sheets se escribe encima y se limpia solo lo que sobra.
- Repeticiones de PBKDF2 (en el navegador): huella del correo 100.000; verificador y llave de los sobres 600.000 (`ITERACIONES_CLAVE`); archivo de la llave 600.000 (versión 2; la versión 1, de 250.000, se sigue abriendo).
- Política de contenido (CSP) en `web/index.html`: solo código del propio sitio y conexión solo con el servidor de Google. Si cambia el servidor, se agrega su dirección en `connect-src`.
