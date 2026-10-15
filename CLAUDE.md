# CLAUDE.md — código de EMERGENCIAS D3

Instrucciones para Claude Code al trabajar en este repositorio. Este archivo es **público** (va en GitHub): no escribas aquí nombres, correos, celulares, contraseñas ni datos de los insumos. La bitácora con el historial y las decisiones del proyecto está en la carpeta del proyecto, un nivel arriba (`../CLAUDE.md`), y no se publica.

Antes de cambiar algo, lee `README.md` y `docs/ARQUITECTURA.md`.

## Equipo

Trabajan **dos personas** del mismo equipo sobre este código, cada una con su Claude Code. El responsable es el dueño de las cuentas personales de GitHub y de Google donde viven el repositorio y el servidor, y quien guarda la llave maestra. La otra persona es colaboradora en GitHub y editora de la hoja de Google.

## Reglas de trabajo

1. **Responde en español y en lenguaje sencillo.** Las personas del equipo no son desarrolladoras. Explica qué hiciste y cómo probarlo.
2. **GitHub es la copia oficial.** Al empezar: `git pull`. Al terminar: commit (mensaje en español, explicando el porqué) y `git push`. Si el `pull` trae cambios de la otra persona, revísalos antes de seguir. No reescribas el historial publicado (`rebase`, `push --force`).
3. **Pide aprobación antes de publicar.** `git push` publica la app para todo el Despacho en minutos. Confirma con quien te está pidiendo el cambio.
4. **Ningún dato personal en el código ni en el repositorio.** Los insumos no se suben nunca, ni siquiera a un repositorio privado. La llave maestra (`.d3llave`) nunca va dentro de `APP/`.
5. **Toda pantalla nueva escapa los textos variables con `esc()`.** Revisa los permisos en el servidor, no solo en la interfaz.
6. **Versión:** con cada publicación, sube `VERSION` en `web/sw.js` y `CONFIG.VERSION` en `web/config.js`.
7. **Servidor:** si cambias `servidor/`, el cambio debe funcionar también con la versión anterior de la app. Solo una persona a la vez actualiza el código en el editor de Apps Script y publica la versión nueva (**Deploy → Manage deployments → ✏️ → New version**), y avisa a la otra.
8. **Pruebas:** con el servidor real se tocan datos reales. En `localhost` la app usa sola el servidor simulado con datos ficticios (ver `docs/ARQUITECTURA.md`, sección 6): no hay que editar `config.js` ni la política de contenido. Antes de cada commit corre el banco de pruebas (`herramientas/pruebas-nucleo.html`) y confirma que está al 100 %.
9. **Diseño:** sistema EARM en `web/css/earm.css` (tokens en `:root`). Textos con tildes, títulos en capitalización de oración y botones en mayúsculas por CSS.
10. **Documenta:** si cambias una acción del servidor, actualiza la tabla de `docs/MIGRACION.md`. Lo técnico queda en los mensajes de commit, que comparten las dos personas. La bitácora del proyecto (`../CLAUDE.md`) la lleva el responsable: si trabajas con una copia de ella, no la uses como fuente de verdad del estado; al terminar, deja un resumen de la sesión para que el responsable lo agregue.

## Precauciones aprendidas (Windows)

- En PowerShell 5.1 no reescribas archivos con `Get-Content`/`Set-Content`: dañan las tildes. Usa las herramientas de edición.
- Para probar el servidor desde la terminal usa `curl.exe -s -L` (no `Invoke-WebRequest`, que sigue la redirección de Apps Script con POST y recibe 404).
- Google a veces responde 404 «No se pudo abrir el archivo» aunque el script corre bien. La app ya reintenta; si pasa con muchas peticiones seguidas, espera unos minutos y no insistas con pruebas en ráfaga.
