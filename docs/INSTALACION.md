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
   URL_SERVIDOR: 'https://script.google.com/macros/s/…/exec',
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
