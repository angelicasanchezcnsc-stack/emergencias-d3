# EMERGENCIAS D3

Aplicativo de emergencias del Despacho 3 (Comisionado Edwin Arturo Ruiz Moreno) de la Comisión Nacional del Servicio Civil, sede Calle 96. Es una iniciativa propia del Despacho 3.

Sirve para saber quién está en la sede, en qué piso y en qué puesto; para que los brigadistas reporten su piso durante una emergencia; y para registrar la llegada al punto de encuentro, incluso sin internet.

## Cómo está armado

| Capa | Dónde | Qué hace |
|---|---|---|
| Interfaz | `web/` | Aplicación web instalable (PWA): HTML, CSS y JavaScript sin dependencias. Funciona sin conexión. Se publica en GitHub Pages. |
| Lógica | `servidor/Nucleo.gs` | Todas las reglas del servidor. No depende de Google. |
| Adaptador | `servidor/Codigo.gs` | Conecta el núcleo con Google Sheets mediante Apps Script. |
| Configuración | `web/config.js` | Único archivo que cambia al publicar o migrar. |
| Herramientas | `herramientas/` | Servidor local para probar en el computador. |
| Documentación | `docs/` | Instalación y migración. |

## Protección de datos (Ley 1581 de 2012)

- El servidor (Google) y el repositorio (GitHub) **solo tienen códigos** (D3-001…), huellas (hash) y sobres cifrados. Nunca guardan nombres, correos, celulares ni contraseñas.
- El correo se convierte en una huella en el celular (PBKDF2) antes de enviarse.
- Los nombres viajan en un **sobre cifrado** (AES-GCM) que solo se abre en el celular de quien inició sesión. La llave de cada sobre está protegida con la contraseña de cada persona.
- La **llave maestra** (código → nombre, correo, celular) es un archivo cifrado que vive solo en el computador del administrador. Nunca va en esta carpeta ni en el repositorio.
- Los insumos (Excel, planos con nombres, contactos) **no se suben** a ningún repositorio. Ver `.gitignore`.

## Estado

Ver la bitácora `CLAUDE.md` en la carpeta del proyecto. Etapa actual: **7, punto de encuentro sin conexión**.

- [x] Acceso con correo y contraseña, bloqueo tras 5 intentos fallidos
- [x] Llave maestra cifrada y carga seudonimizada del Excel de puestos (con recarga y comparación de cambios)
- [x] Roles: administrador, coordinador, suplente, brigadistas por piso (uno o dos) con celular
- [x] Contraseñas temporales, credenciales imprimibles y reglas de contraseña configurables
- [x] Planta física por piso, funcionamiento sin conexión de la interfaz
- [x] Mi día: llegada, salida, regreso, otro puesto, ausencias y corrección de horas
- [x] Reporte de compañeros, listado por piso "Hoy en la sede" y censo del día imprimible en PDF
- [x] Cola de reportes sin conexión, que se envían solos al volver la señal
- [x] Contactos de emergencia editables (con «Pendiente» y «Por verificar»), brigada y coordinación del Despacho
- [x] Rutas de evacuación, punto de encuentro y planos por piso, guardados cifrados y descargados al celular
- [x] Recomendaciones por tipo de emergencia, editables por el administrador
- [x] Activar emergencia o simulacro (según rol), franja de aviso en todas las pantallas y tablero por piso
- [x] Reporte propio («Ya salí», «Necesito ayuda») y reporte del brigadista por persona o por conteo, con cola sin conexión
- [x] Atención prioritaria: no ubicados, quienes piden apoyo y personas con discapacidad que necesitan asistencia
- [x] Punto de encuentro: registro de llegadas (también «Llegué» desde el celular propio), búsqueda, filtro por piso y pantalla para pleno sol
- [x] Conciliación piso–punto de encuentro y lista de ausentes con piso, puesto y última ubicación (imprimible y copiable)
- [x] Emergencia activada sin conexión en el celular, con unión automática a la del servidor al volver la señal
- [ ] Reporte PDF e histórico, caracterización (etapas 8 y 9)

## Probar y publicar

Ver [docs/INSTALACION.md](docs/INSTALACION.md).
