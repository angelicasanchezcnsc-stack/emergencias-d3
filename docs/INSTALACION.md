# Instalación de EMERGENCIAS D3

Hay tres momentos: **A** probar en su computador (modo prueba), **B** crear el servidor real en Google y **C** publicar la app en GitHub Pages.

---

## A. Probar en su computador (modo prueba)

En modo prueba, el "servidor" funciona dentro del propio navegador. Nada sale del computador. El modo prueba se activa solo cuando la dirección es `localhost`: no hay que cambiar ningún archivo. **Pruebe solo con datos ficticios** (un Excel inventado, no el real).

1. Abra una terminal de PowerShell en la carpeta `APP` y ejecute:
   ```
   powershell -ExecutionPolicy Bypass -File herramientas\servidor-local.ps1
   ```
   Deje esa ventana abierta.
2. En **Edge** o **Chrome**, abra `http://localhost:8080/web/`.
3. Aparece la **Configuración inicial**:
   1. **Llave maestra.** Escriba una frase de al menos 10 caracteres y oprima *Crear llave nueva*. Guarde el archivo **fuera de la carpeta APP**, por ejemplo en `Documentos\Llave_Emergencias_D3\`.
   2. **Planta física.** Elija el Excel `Numeracion_Escritorios_Por_Pisos.xlsx`. Revise el resumen: personas, vacantes y avisos.
   3. **Administrador.** Elíjase a usted.
   4. **Código de instalación.** En modo prueba aparece en pantalla.
   5. Oprima *Inicializar el aplicativo*. Se muestra su contraseña temporal.
4. Ingrese con su correo institucional y esa contraseña.
5. **Cargue los mapas y planos.** En *Administración → Contenido* hay ocho espacios (mapa del punto de encuentro, ruta de evacuación y plano de cada piso). Cargue cada archivo desde `Insumos\Modulo_5\Rutas_Evacuacion` y `Insumos\Modulo_5\Planta_Fisica`. Las imágenes se reducen solas; los PDF pueden pesar hasta 800 KB. Si el aplicativo se inicializó antes de la etapa 5, oprima allí *Cargar textos iniciales* para tener contactos, rutas y recomendaciones.
6. Pruebe lo siguiente:
   - **Planta física:** los cuatro pisos con sus puestos y vacantes.
   - **Mi cuenta:** cambiar la contraseña.
   - **Administración:**
     - *Personas y roles:* asignar brigadistas con celular y el coordinador.
     - *Credenciales:* imprimir las contraseñas temporales.
     - *Configuración:* reglas de la contraseña.
     - *Planta y Excel:* volver a cargar el Excel.
   - **Sin conexión:** cierre la ventana de PowerShell y recargue la página. La app sigue abriendo con los últimos datos.

**Para empezar de cero en modo prueba:** en Edge, abra Configuración → Cookies y permisos del sitio → Administrar y eliminar cookies → Ver todos los datos del sitio → busque `localhost` → Eliminar.

> **Desde la versión v0.7.2** las contraseñas se protegen con más repeticiones (600.000). Las cuentas de prueba creadas antes ya no abren: empiece de cero como se indica arriba. El archivo de llave anterior sí se sigue abriendo.

---

## B. Servidor real en Google (cuenta personal)

1. En su Google Drive personal, cree una **Hoja de cálculo de Google** llamada `EMERGENCIAS D3 — Datos`.
2. En la hoja, abra el menú **Extensiones → Apps Script**.
3. En el editor:
   - Cambie el nombre del proyecto a `EMERGENCIAS D3`.
   - Abra el archivo `Código.gs`, borre su contenido y pegue el de `servidor/Codigo.gs`.
   - Con el botón **+** → *Secuencia de comandos*, cree un archivo llamado `Nucleo` y pegue el contenido de `servidor/Nucleo.gs`.
   - Guarde (icono de disco).
4. En la barra superior, elija la función **`instalar`** y oprima **Ejecutar**.
   - Google pedirá permisos. Como es su propio script, aparecerá "Google no ha verificado esta aplicación": elija *Configuración avanzada* → *Ir a EMERGENCIAS D3* → *Permitir*.
   - En el **Registro de ejecución** aparece el **código de instalación**. Anótelo.
5. Oprima **Implementar → Nueva implementación**:
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona**. Esto es necesario para que los celulares lleguen al servidor. Cada acción exige una sesión válida, y la hoja solo tiene códigos y sobres cifrados.
   - Oprima *Implementar* y copie la **URL de la aplicación web**, que termina en `/exec`.
6. En `web/config.js`, cambie solo la dirección del servidor:
   ```js
   const URL_REAL = 'https://script.google.com/macros/s/…/exec';
   ```
   El modo se elige solo: simulado en `localhost` y servidor real en GitHub Pages.
7. La política de contenido de `web/index.html` ya no incluye `'unsafe-eval'`: solo el servidor local de pruebas lo agrega al entregar el archivo. No hay nada que quitar.

**Contraseñas (desde la v0.9):** en una instalación nueva, la configuración parte con contraseña de mínimo 10 caracteres y cambio obligatorio de la contraseña temporal. En una instalación que ya existe, la configuración guardada manda: el administrador debe activar ambas opciones en *Administración → Configuración* (largo mínimo 10 y «Obligar a cambiar la contraseña temporal en el primer ingreso»).

**Al actualizar el código del servidor más adelante:**
1. Pegue los archivos nuevos.
2. Ejecute otra vez la función **`instalar`**. Crea las hojas nuevas que traiga la versión y no borra datos.
3. Vaya a *Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar*. Así la URL no cambia.

> No borre las *Propiedades del script* (`PIMIENTA`, `CODIGO_INSTALACION`). Si se pierde la `PIMIENTA`, todas las contraseñas dejan de funcionar.

---

## B2. Servidor de prueba (desde la v0.13)

Es un segundo servidor, igual al real pero con **datos ficticios**, para probar cada cambio de `Nucleo.gs` antes de publicarlo en el real y para la prueba de carga. Vive en la misma cuenta de Google.

1. En Google Drive cree una **hoja de cálculo nueva y en blanco** llamada `EMERGENCIAS D3 (Pruebas)`. No use *Archivo → Hacer una copia* de la hoja real: copiaría los datos reales y además el servidor de prueba no se podría inicializar.
2. Siga los pasos B.2 a B.5 en esa hoja (proyecto `EMERGENCIAS D3 (Pruebas)`, mismos `Codigo.gs` y `Nucleo.gs`, `instalar`, *Implementar → Nueva implementación* como aplicación web, ejecutar como **Yo**, acceso **Cualquier persona**). Anote aparte el código de instalación de prueba.
3. Copie la URL `/exec` de prueba en `web/config.js`, en `URL_SERVIDOR_PRUEBA`, y publique la app.
4. Abra la app publicada con `?servidor=prueba` al final de la dirección (por ejemplo `https://…github.io/emergencias-d3/?servidor=prueba`). Aparece la insignia **Servidor de prueba** (en el celular, **Prueba**) y la Configuración inicial.
5. Haga la configuración inicial con:
   - una **llave de prueba nueva**, con otra frase, guardada aparte de la llave real (por ejemplo `Documentos\Llave_Emergencias_D3\pruebas\`), y
   - un **Excel ficticio** (nombres y correos inventados, mismo formato que el real). Nunca el Excel real.
6. Para volver al servidor real abra la app con `?servidor=real`. Al cambiar de servidor la app cierra la sesión de ese navegador, porque cada servidor tiene sus propias cuentas.

El navegador recuerda la elección. En `localhost` la app usa el servidor simulado, salvo que se abra con `?servidor=prueba` (`http://localhost:8090/web/?servidor=prueba`): así se puede preparar y probar el servidor de prueba sin publicar la web. En `localhost` nunca se usa el servidor real. Cada cambio de `Nucleo.gs` se pega y se publica primero en el servidor de prueba, se prueba con `?servidor=prueba` y solo después se publica en el real.

## B3. Respaldo semanal de la hoja (desde la v0.13)

`Codigo.gs` trae la función `respaldar()`: guarda una copia de la hoja en la carpeta **Respaldos EMERGENCIAS D3** de su Drive y conserva las 8 más recientes de cada hoja.

1. Después de pegar el `Codigo.gs` nuevo, elija la función **`respaldar`** y oprima **Ejecutar**. Google pedirá un permiso nuevo (acceso a Drive, para crear la carpeta y las copias): acéptelo. Hágalo **antes** de publicar la versión nueva del servidor: mientras ese permiso no esté aceptado, el servidor puede responder con error.
2. En el editor, menú lateral **Activadores** (ícono de reloj) → **Añadir activador**: función `respaldar`, implementación *Principal*, fuente *Según tiempo*, tipo *Temporizador semanal*, el día y la hora que prefiera (por ejemplo, domingo de 2 a 3 a. m.) → **Guardar**.
3. Revise de vez en cuando que la carpeta tenga copias recientes. Las copias tienen lo mismo que la hoja (códigos, huellas y sobres cifrados) y quedan en la misma cuenta.

Para restaurar: abra la copia, revise que tenga los datos esperados y, con la persona responsable, decida si se vuelve a vincular el servidor a ella (requiere pegar el código, copiar las *Propiedades del script* `PIMIENTA` y `CODIGO_INSTALACION` y publicar de nuevo).

## B4. Seguridad de las cuentas y acuerdo de publicación

Quien edita la hoja de Google puede abrir el código del servidor y su pimienta; quien publica en GitHub cambia la app de todos. Por eso:

- [ ] Verificación en dos pasos activa en la cuenta de Google donde vive el servidor y en las cuentas de GitHub de las dos personas del equipo.
- [ ] En GitHub, **Settings → Branches → Add branch protection rule** para `main`: exigir *pull request* para la colaboradora, con aprobación de la persona dueña.
- [ ] Acuerdo entre las dos personas: **una sola** publica versiones del servidor (real y de prueba) y avisa a la otra antes y después.
- [ ] En *Administración → Configuración*, bajar «Días que dura una sesión» a 14.

## B5. Prueba de carga (desde la v0.13)

Comprueba que el servidor aguanta muchos celulares a la vez. **Solo contra el servidor de prueba**, con cuentas ficticias: la herramienta se niega a correr contra el servidor real.

1. En el servidor de prueba, deje creadas varias cuentas ficticias con contraseña conocida (la primera, de un brigadista o de la coordinación) y la configuración «Obligar a cambiar la contraseña temporal» desactivada.
2. Encienda el servidor local (`powershell -ExecutionPolicy Bypass -File herramientas\servidor-local.ps1 -Puerto 8090`) y abra `http://localhost:8090/herramientas/carga.html`.
3. La dirección del servidor de prueba ya aparece escrita. Pegue las cuentas, una por línea (`correo;contraseña`), y elija 20 celulares lectores, 4 brigadistas y 5 minutos.
4. Oprima **Empezar la prueba**. Si no hay un simulacro activo, la herramienta inicia uno y lo termina al final; cierra también las sesiones que abrió.
5. Copie el resumen. Umbrales esperados: percentil 95 de `pulso` menor de 3 segundos, errores menores del 1 % y **ninguna marca perdida** (la última marca enviada a cada persona coincide con la del servidor).

Si no se cumplen, no haga el simulacro piloto con todo el Despacho: anótelo y revíselo con quien mantiene el código. No haga pruebas de carga seguidas: Google limita las ejecuciones y puede responder con errores durante unos minutos.

## B6. Simulacro piloto: lista de verificación

- [ ] Prueba de carga hecha la semana anterior, con resultados dentro de los umbrales (B5).
- [ ] Brigadistas con el aplicativo instalado, la sesión abierta y el celular cargado.
- [ ] El día del simulacro, cada brigadista abre el aplicativo con conexión: así descarga la lista del día, los apoyos y los contactos de su piso, que sirven sin señal.
- [ ] Censo del día impreso (*Hoy en la sede → Censo del día*) como respaldo en papel.
- [ ] La coordinación sabe imprimir el acta nominal desde la ventana de cierre y abrirla después en *Histórico*.
- [ ] Al cerrar, las lecciones aprendidas van en las observaciones del cierre (sin nombres ni datos de salud).
- [ ] La guía de una página por rol (`docs/GUIA-ROLES.md`) entregada a cada brigadista, a la coordinación y a los asesores.

---

## C. Publicar la app en GitHub Pages

1. En GitHub, cree un repositorio **público** llamado, por ejemplo, `emergencias-d3`, sin README.
2. Suba la carpeta `APP`. Solo esa carpeta es el repositorio, así que los insumos quedan fuera. Desde PowerShell, en `APP`:
   ```
   git add .
   git commit -m "Etapa 3: base del proyecto"
   git branch -M main
   git remote add origin https://github.com/<su-usuario-de-GitHub>/emergencias-d3.git
   git push -u origin main
   ```
3. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
4. En uno o dos minutos la app queda en `https://<su-usuario-de-GitHub>.github.io/emergencias-d3/`.
   La publicación vigente está en `https://angelicasanchezcnsc-stack.github.io/emergencias-d3/` (repositorio `angelicasanchezcnsc-stack/emergencias-d3`).
5. Desde su computador, abra esa dirección y haga la **Configuración inicial** (paso A.3) con el código de instalación real del paso B.4.
6. Entregue las contraseñas temporales (*Administración → Credenciales*).

**Si la app cambia de cuenta de GitHub o de servidor:** la dirección anterior sigue publicada con la versión vieja hasta que su dueño la retire. Pídale que publique ahí una página que redirija a la dirección nueva (o que desactive GitHub Pages) y que vacíe la hoja del servidor anterior. Quien instaló la app desde la dirección vieja debe borrarla e instalarla de nuevo desde la nueva.

**Instalar en el celular:** abra la dirección en Chrome (Android) o Safari (iPhone).
- En Android: menú ⋮ → *Agregar a la pantalla principal*.
- En iPhone: botón Compartir → *Agregar a inicio*.

---

## Antes de cada `git push`

Revise que no aparezcan archivos con datos personales:
```
git status
```
El `.gitignore` bloquea `.xlsx`, `.docx`, `.pdf`, `.rtf`, `.csv` y el archivo de llave (`.d3llave`). Aun así, revise siempre.
