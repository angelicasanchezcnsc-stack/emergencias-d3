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
| Documentación | `docs/` | Arquitectura, instalación y migración. |

## Protección de datos (Ley 1581 de 2012)

- El servidor (Google) y el repositorio (GitHub) **solo tienen códigos** (D3-001…), huellas (hash) y sobres cifrados. Nunca guardan nombres, correos, celulares ni contraseñas.
- El correo se convierte en una huella en el celular (PBKDF2) antes de enviarse.
- Los nombres viajan en un **sobre cifrado** (AES-GCM) que solo se abre en el celular de quien inició sesión. La llave de cada sobre está protegida con la contraseña de cada persona.
- La **llave maestra** (código → nombre, correo, celular) es un archivo cifrado que vive solo en el computador del administrador. Nunca va en esta carpeta ni en el repositorio.
- Los insumos (Excel, planos con nombres, contactos) **no se suben** a ningún repositorio. Ver `.gitignore`.
- **Caracterización individual:** cada persona tiene un par de llaves (ECDH P-256); la privada vive cifrada con su contraseña y la pública está en el servidor. Los datos se cifran con una llave aleatoria que se entrega, envuelta con la llave pública de cada destinatario, solo a quien corresponde: la persona y la coordinación (detalle completo), y además brigadistas y acompañante (solo el apoyo para evacuar). El servidor y Google no pueden leer nada; el servidor además controla quién recibe qué.

## Estado

Etapa actual: **10, piloto**. La app está publicada en GitHub Pages y conectada al servidor real. Para trabajar en el código: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) y las reglas del equipo en [CLAUDE.md](CLAUDE.md).

- [x] Acceso con correo y contraseña, bloqueo tras 5 intentos fallidos
- [x] Llave maestra cifrada y carga seudonimizada del Excel de puestos (con recarga y comparación de cambios)
- [x] Roles: administrador, coordinador, suplente, brigadistas por piso (uno o dos) con celular y asesor; solo ingresan las personas con un rol; días presenciales de cada persona
- [x] Contraseñas temporales, credenciales imprimibles y reglas de contraseña configurables
- [x] Planta física por piso, funcionamiento sin conexión de la interfaz
- [x] Presencia por agenda: cada persona figura prevista en su puesto los días de su agenda; novedades por rango de fechas (no asiste, en otro lugar, asiste), sin horas ni motivo
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
- [x] Cierre con observaciones e informe de totales y tiempos por piso (línea de tiempo con la estructura del Anexo 7 del plan), imprimible o en PDF
- [x] Histórico de simulacros y emergencias, sin nombres; al cerrar se borra el detalle por persona
- [x] Caracterización individual voluntaria, con autorización informada (texto editable y versionado), cifrada de extremo a extremo: solo la persona, el administrador y la coordinación abren el detalle
- [x] Apoyo para evacuar visible, solo durante una emergencia, para los brigadistas de su piso, la coordinación y el acompañante que la persona designe
- [x] Revocación y borrado por la propia persona; el registro se borra si la persona se retira del Despacho
- [x] Protocolos individuales derivados de la caracterización (editables)
- [ ] Pruebas con el equipo, piloto en un piso y ajustes finales (etapas 10 y 11)

## Probar y publicar

Ver [docs/INSTALACION.md](docs/INSTALACION.md).
