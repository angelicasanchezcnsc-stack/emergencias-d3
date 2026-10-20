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
3. Exporte cada hoja (`Personas`, `Puestos`, `Sesiones`, `Sobres`, `Config`, `Bitacora` y las demás de `ESQUEMA`, entre ellas `Caracterizaciones` y `Contactos`) a CSV y cárguelas como tablas.
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
| `base` | sesión | Perfil, personas (solo códigos y agenda), puestos, referencias, directorio cifrado, configuración (incluye `festivos`) y novedades vigentes. Cada puesto trae `piso`, `puesto`, `estado`, `col` (1 a 24 o `null`), `fila` (1 a 20 o `null`) y `asignable` (booleano); `referencias` trae las de todos los pisos (`piso`, `id`, `tipo`, `etiqueta`, `col`, `fila`, `ancho`, `alto`). `col`, `fila`, `asignable` y `referencias` son de la v0.11: la v0.9.4 los ignora. Si la hoja `Referencias` aún no existe, responde `referencias: []`. No escribe nada |
| `cambiarClave` | sesión | Nuevo verificador y sobres envueltos de nuevo. Cierra las demás sesiones de la persona |
| `guardarPadron` | administrador | Altas, cambios y retiros (desde el Excel o desde la app). Al retirar a una persona se borran su caracterización y su contacto de emergencia (si la hoja `Contactos` aún no existe, no falla). Si trae `puestos` (carga del Excel), reemplaza la lista pero **conserva `col`, `fila` y `asignable`** de los puestos que ya existían (se emparejan por piso y puesto); los nuevos quedan sin posición. Al final siempre recalcula `estado` de los puestos |
| `guardarDistribucion` | administrador | Diseño del esquema de un piso. Entrada: `{ piso, puestos: [{ puesto, col, fila, asignable }], referencias: [{ id?, tipo, etiqueta, col, fila, ancho, alto }] }`; reemplaza **todo** lo de ese piso y deja intactos los demás. Valida (si algo falla responde `DATOS` y no escribe nada): piso con puestos en la planta; puestos únicos de 1 a 999 (máximo 200 por piso, al menos uno); `col` 1 a 24 y `fila` 1 a 20, o ambos vacíos; ninguna casilla usada por dos elementos (una referencia ocupa `ancho × alto` casillas y debe caber en el esquema); no se quita ni se marca como no asignable un puesto con personas activas (el mensaje dice sus códigos); referencias con `tipo` válido (`escalera`, `sala`, `bano`, `ascensor`, `pasillo`, `otro`), `etiqueta` de hasta 30 caracteres, `ancho` y `alto` de 1 a 6 y máximo 40 por piso. Una referencia sin `id` recibe uno del servidor. Devuelve `{ puestos, referencias }` de **todos** los pisos. Deja `distribucion` (con el piso) en la bitácora. Toma el candado |
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
| `reenvolver` | administrador, coordinador o suplente | Agrega o quita destinatarios de un registro (nuevo coordinador o brigadista, llave renovada); nunca toca los datos. Sin `registro` trabaja sobre las caracterizaciones (como la v0.11.4). Con `registro: 'contactos'` trabaja sobre los contactos de emergencia: `agregar`/`quitar` para `claves` y `agregarSalud`/`quitarSalud` para `clavesSalud`; solo acepta destinatarios que pueden leer contactos (ver abajo) y la persona dueña nunca pierde su envoltorio. Si un cambio trae `version` y el registro ya va en otra (una carga o corrección lo cambió mientras tanto), ese registro se omite: la respuesta es `{ n, omitidos }` y la app lo vuelve a intentar |
| `cargarContactos` | administrador, coordinador o suplente | Carga por lote (1 a 500) de contactos de emergencia: `{ ops: [{ codigo, datos, claves, salud?, clavesSalud? }] }`. Todo o nada: si un contacto falla responde `DATOS` con el código y no escribe nada (también si un código viene dos veces). Cada contacto **reemplaza** el anterior de esa persona (sube `version`, `fuente: 'carga'`, `cargado` = ahora); quien no viene en el lote conserva el suyo. Exige persona activa y que cada envoltorio coincida con la llave pública vigente de un destinatario permitido, incluido quien carga. Bitácora: `contactos-carga` con el número de registros |
| `guardarContactoDe` | administrador, coordinador o suplente sobre cualquier persona activa; cualquier persona con acceso sobre **sí misma** | Corrige un contacto: `{ codigo, datos, claves, salud?, clavesSalud?, versionBase? }`. Reemplaza los dos bloques; conserva `cargado`; `fuente` queda `coordinacion` o `propio`. Con `versionBase` controla conflictos (`CONFLICTO`). Bitácora: `contacto` con el código |
| `contactos` | sesión | Solo lee, sin candado. La coordinación (administrador, coordinador, suplente) recibe todos los contactos de personas activas (aunque aún no tenga su envoltorio), con EPS y ARL, las huellas de quién tiene acceso (`huellas`, `huellasSalud`) y `faltan`: códigos de personas activas sin contacto (para el filtro «Contacto: cargado / falta»). Un brigadista recibe los de su piso de brigada (según el piso habitual de cada persona) que traigan su envoltorio; la EPS y la ARL (`salud`, `claveSalud`) solo mientras hay una emergencia o un simulacro activo. Cualquier persona con acceso recibe además su propio contacto, con su EPS y ARL. Cada registro trae solo el envoltorio de quien pide (`clave`, `claveSalud`), `tieneSalud`, `fuente`, `cargado` y `actualizado` |
| `contactosOtroPiso` | brigadista; también coordinación | «Ver otro piso»: `{ piso }` (debe existir en la planta) devuelve los contactos de ese piso con la misma regla de EPS y ARL. Si un brigadista consulta un piso distinto del suyo, deja en la bitácora `contactos-otro-piso` con su código y «piso N», sin datos personales. Es una acción aparte de `contactos` porque escribe la bitácora; toma el candado |

**Quién puede recibir la llave de un contacto:** las personas activas con rol `admin`, `coordinador`, `suplente` o `brigadista` (de cualquier piso: el servidor no puede abrir un registro para dárselo después a otro brigadista) y la persona dueña. El servidor rechaza envoltorios para cualquier otra persona (por ejemplo, un asesor). El navegador cifra dos bloques con llaves aleatorias distintas: `datos` (teléfono de la persona y familiar: nombre, parentesco y teléfono) y `salud` (EPS y ARL, opcional). La EPS y la ARL de los brigadistas dependen de que el servidor solo las entrega con una emergencia o simulacro activo; el celular no guarda una copia previa.

**Contactos de emergencia en el navegador (v0.12):** la app guarda en el celular una copia cifrada de los contactos que el servidor le entregó, para usarla sin internet. Al terminar una emergencia quita de esa copia la EPS y la ARL (salvo las propias) y olvida los contactos de otros pisos. En la pantalla de Emergencia, un brigadista solo ve el contacto de una persona marcada «No ubicado», «Apoyo» o con asistencia; es una regla de la app, no del servidor. La coordinación mantiene los envoltorios al día con `reenvolver` (`registro: 'contactos'`) y solo lo envía si el servidor ya respondió a `contactos`: un servidor anterior a la v0.12 aplicaría esos cambios a las caracterizaciones. El aviso de privacidad del contacto de emergencia está en `web/js/contenido-inicial.js` (`AVISO_CONTACTOS`).

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

- **El estado de un puesto lo calcula el servidor** (`recalcularPuestos` en `servidor/Nucleo.gs`): `vacante` (ninguna persona activa), `ocupado` (una) o `compartido` (dos o más). Se recalcula al final de `inicializar`, `guardarPadron` y `guardarDistribucion`; el cliente no lo envía ni lo decide. Un servidor nuevo debe reproducir la regla.
- Hoja nueva de la v0.12: `Contactos` (`codigo`, `version`, `datos`, `claves`, `salud`, `clavesSalud`, `fuente`, `cargado`, `actualizado`, `por`). `fuente` es `carga`, `coordinacion` o `propio`; `cargado` es la fecha de la última carga desde el archivo del área de personal. Mientras no exista, `base`, `contactos`, `guardarPadron` y `reenvolver` funcionan igual (la app v0.11.4 no la usa); cargar o corregir responde que hay que ejecutar `instalar`. Solo la falta de la hoja cuenta como «sin contactos»: cualquier otro error al leerla se devuelve como error y no se escribe nada (si se tratara como vacía, una carga borraría la hoja entera). Un servidor nuevo debe conservar esa diferencia.
- Hojas nuevas de la v0.11: `Referencias` (`piso`, `id`, `tipo`, `etiqueta`, `col`, `fila`, `ancho`, `alto`) y, al final de `Puestos`, las columnas `col`, `fila` y `asignable`. Después de pegar el código nuevo en Apps Script y antes de publicar la versión, ejecutar `instalar` una vez.
- La regla de presencia (`presenciaDe` en `servidor/Nucleo.gs`) tiene una copia idéntica en `web/js/presencia.js`. Un servidor nuevo debe reproducirla igual; `herramientas/pruebas-nucleo.html` compara ambas.
- Las marcas con `momento` (emergencia) se limitan a, como mucho, 5 minutos en el futuro, y cada envío acepta hasta 500 operaciones.
- `escribir` no debe dejar la tabla vacía a mitad de la escritura: hay lecturas sin candado (`pulso`, `emergencia`). En Sheets se escribe encima y se limpia solo lo que sobra.
- Repeticiones de PBKDF2 (en el navegador): huella del correo 100.000; verificador y llave de los sobres 600.000 (`ITERACIONES_CLAVE`); archivo de la llave 600.000 (versión 2; la versión 1, de 250.000, se sigue abriendo).
- Política de contenido (CSP) en `web/index.html`: solo código del propio sitio y conexión solo con el servidor de Google. Si cambia el servidor, se agrega su dirección en `connect-src`.
