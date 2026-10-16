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
1. Escriba un adaptador equivalente a `Codigo.gs`, con estas funciones: `leer`, `escribir`, `agregar`, `agregarVarias`, `prop`, `uuid`, `ahora`, `hoy` y `bloqueo` (y, opcionales, `cache` y `leerFiltrado`).
2. Reutilice la lógica de `Nucleo.gs` (JavaScript estándar) o tradúzcala respetando el contrato.
3. Exporte cada hoja (`Personas`, `Puestos`, `Sesiones`, `Sobres`, `Config`, `Bitacora`) a CSV y cárguelas como tablas.
4. Conserve el valor de `PIMIENTA`.

### Contrato de la API

Petición `POST` con cuerpo JSON: `{ "accion": "...", "token": "...", ...datos }`.
Respuesta: `{ "ok": true, "datos": {...} }` o `{ "ok": false, "codigo": "...", "error": "..." }`.

Errores: los que le hablan al usuario (por ejemplo, «Debe quedar al menos un administrador activo.») se devuelven con su propio texto, en la función `ErrorUsuario` de `Nucleo.gs`. Cualquier otro error es interno: la respuesta es `{ codigo: "ERROR", error: "Ocurrió un error en el servidor. Intente de nuevo en unos segundos." }` y el detalle queda en el registro de ejecuciones del servidor (`console.error`). Un servidor nuevo debe conservar esta separación: nunca devolver trazas ni mensajes técnicos.

| Acción | Requiere | Uso |
|---|---|---|
| `ping` | — | Estado del servidor e indicador de si ya fue inicializado |
| `inicializar` | código de instalación | Primera carga del padrón |
| `ingresar` | — | Huella del correo y verificador; devuelve sesión y perfil. **El acceso exige al menos un rol** (`admin`, `coordinador`, `suplente`, `brigadista` o `asesor`): si la contraseña es correcta pero la persona no tiene rol, responde `SIN_ACCESO` y no crea sesión. Quitarle todos los roles a alguien invalida sus sesiones en la siguiente petición. Al ingresar borra las novedades vencidas y, una vez al día, la bitácora vieja |
| `salir` | sesión | Cierra la sesión |
| `base` | sesión | Perfil, personas (solo códigos y agenda), puestos, directorio cifrado, configuración (incluye `festivos`) y novedades vigentes. No escribe nada |
| `cambiarClave` | sesión | Nuevo verificador y sobres envueltos de nuevo. Cierra las demás sesiones de la persona |
| `guardarPadron` | administrador | Altas, cambios y retiros desde el Excel |
| `guardarRoles` | administrador | Roles, piso de brigada, `agenda` (`''` = lunes a viernes, `'ocasional'` o días ISO `1` a `7` sin repetir; se guardan ordenados) y directorio cifrado. El servidor valida sobre el resultado final de todas las personas activas: un solo coordinador, un solo suplente, coordinador distinto de suplente, máximo 2 brigadistas por piso (con piso existente en la planta) y al menos un administrador. Si algo falla responde `DATOS` y no escribe nada. A quien queda sin roles se le borran las sesiones. Sin `agenda` en el cambio (app v0.8.4), la agenda no se toca |
| `guardarConfig` | administrador | Reglas de contraseña, duración de la sesión, días de conservación de la bitácora (`diasBitacora`, 365) y `festivos` (hasta 60 fechas `AAAA-MM-DD` sin actividad presencial; se guardan ordenadas y sin repetir). `diasHistorico` ya no se usa y se descarta |
| `restablecerClave` | administrador | Contraseña temporal nueva para una persona |
| `novedades` | sesión | Solo lee: novedades vigentes (de hoy en adelante) y la fecha de hoy |
| `guardarNovedad` | sesión | Crea una novedad de presencia (`no_asiste`, `otro_lugar` o `asiste`) por rango de fechas (máximo 92 días, sin motivo) o, con `id`, la edita. `otro_lugar` lleva piso y puesto (0 = sala o área común). Borra las novedades vencidas. Una vez al día purga la bitácora vieja (también lo hace `ingresar`) |
| `quitarNovedad` | sesión | Borra una novedad por `id` |
| `hoy` / `registrar` | sesión | **Obsoletas desde la v0.9** (ya no hay registro de llegada y salida). `hoy` devuelve una lista vacía; `registrar` no escribe nada y responde `obsoleta` por cada operación, para que la cola de los celulares con la v0.8.4 se vacíe sola |
| `guardarContenido` | administrador (contactos: también coordinador y suplente) | Sobres de contactos, recomendaciones y rutas, con control de versión |
| `subirArchivo` / `quitarArchivo` | administrador | Mapas, rutas y planos cifrados, en trozos de hasta 45.000 caracteres |
| `bajarArchivo` | sesión | Trozos cifrados de un archivo |
| `pulso` | sesión | Consulta liviana (sin candado): emergencia activa y su versión |
| `emergencia` | sesión | Brigadistas, asesores, coordinación y administración: estado completo (foto de esperados por piso, marcas y conteos). Las demás personas: solo su propia marca y `cifras` por piso, sin el detalle de nadie más |
| `activarEmergencia` | real: administrador, coordinador, suplente o brigadista; simulacro: administrador o coordinador | Abre la emergencia y toma la foto de quién se espera en la sede hoy (regla de presencia: agenda, novedades y festivos). Con `unirse: true` (emergencia activada sin conexión), se une a la que esté en curso o la crea con su hora de inicio real |
| `marcarEmergencia` | cada persona sobre sí misma; brigadistas, asesores, coordinación y administración sobre cualquiera | Marcas por persona o por conteo (gana la más reciente). Estados: `evacuado`, `no_ubicado`, `apoyo` y `no_estaba` («No estaba hoy»: la persona figuraba prevista pero no estaba en la sede; no cuenta como pendiente ni como evacuada). `no_ubicado` y `no_estaba` solo los ponen quienes reportan (no la propia persona sobre sí misma) |
| `cerrarEmergencia` | administrador, coordinador, suplente o brigadista (emergencia real y simulacro) | Cierra la emergencia, calcula el informe (versión 2: totales, `noEstaban` y tiempos por piso, con observaciones) y **borra el detalle por persona** de esa emergencia |
| `historial` | administrador, coordinador, suplente, brigadista o asesor | Últimos 100 eventos cerrados con su informe; sin nombres, códigos ni quién activó o cerró |
| `registrarPar` | sesión | La persona registra su llave pública y su llave privada ya cifrada con su contraseña (solo si aún no tiene) |
| `guardarCaracterizacion` / `miCaracterizacion` / `revocarCaracterizacion` | la propia persona | Crea, lee o borra solo su registro cifrado. Exige la aceptación de la autorización y que cada envoltorio coincida con la llave pública vigente del destinatario  El consentimiento se guarda como `{ v, f, modo, por }`: `modo` es `'propio'` y `por` es la propia persona (los registros viejos sin `modo` se leen como `'propio'`) |
| `guardarCaracterizacionAsistida` | administrador, coordinador o suplente | Registra la caracterización de una persona activa **sin acceso** (sin roles) a partir de un formato de autorización impreso y firmado, que custodia la coordinación. Exige `consentimiento: { v, fisico: true, fechaFirma }` (fecha válida y no futura) y que `claves` y `clavesApoyo` incluyan a quien registra; la persona dueña puede no estar (no tiene llave). Guarda `{ v, f: fechaFirma, modo: 'fisico', por: quien registra }`. Con `versionBase` controla conflictos. Si la persona tiene acceso responde `PERMISO` |
| `revocarCaracterizacionDe` | administrador, coordinador o suplente | Borra el registro de una persona sin acceso, a solicitud de ella. Si tiene acceso responde `PERMISO`: ella misma puede revocar |
| `caracterizaciones` | administrador, coordinador o suplente | Registros cifrados y el envoltorio propio de cada uno  Cada registro trae además `modo` (`propio` o `fisico`) y `conAcceso` (si la persona tiene algún rol) |
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

- **Acceso solo con rol:** una persona sin ningún rol no abre sesión (`SIN_ACCESO`) y sus sesiones dejan de valer en la siguiente petición.
- **Respuestas recordadas por sesión:** para que un reintento no repita una acción, el servidor guarda 10 minutos la respuesta de cada acción que escribe. La clave incluye un sello de quien hizo la petición (`sha256(token o hashCorreo)`, 16 caracteres): una respuesta guardada solo se entrega a quien la originó, aunque otra persona conozca el `idPeticion`. Las lecturas no se recuerdan.
- **Contraseñas:** el servidor nunca las recibe y no puede validar su largo. Las reglas (`reglasClave`, `exigirCambioInicial`) las aplica el navegador. Los valores por defecto para instalaciones nuevas son mínimo 10 caracteres y cambio obligatorio de la temporal; una instalación existente conserva lo que tenga guardado.

- La regla de presencia (`presenciaDe` en `servidor/Nucleo.gs`) tiene una copia idéntica en `web/js/presencia.js`. Un servidor nuevo debe reproducirla igual; `herramientas/pruebas-nucleo.html` compara ambas.
- Las marcas con `momento` (emergencia) se limitan a, como mucho, 5 minutos en el futuro, y cada envío acepta hasta 500 operaciones.
- `escribir` no debe dejar la tabla vacía a mitad de la escritura: hay lecturas sin candado (`pulso`, `emergencia`). En Sheets se escribe encima y se limpia solo lo que sobra.
- Repeticiones de PBKDF2 (en el navegador): huella del correo 100.000; verificador y llave de los sobres 600.000 (`ITERACIONES_CLAVE`); archivo de la llave 600.000 (versión 2; la versión 1, de 250.000, se sigue abriendo).
- Política de contenido (CSP) en `web/index.html`: solo código del propio sitio y conexión solo con el servidor de Google. Si cambia el servidor, se agrega su dirección en `connect-src`.
